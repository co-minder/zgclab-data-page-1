#!/usr/bin/env python3
"""Build auditable research metadata from the existing, complete static snapshot.

Only data/research.js is written. No source records, list snapshots, detail chunks,
source data versions, mounted storage, network sources or simulation data change.

UI contract (window.ZGCLAB_RESEARCH):
  source.version/package/generated_at refer to the original ZGCLAB_META values.
  records[id] contains angle, ktid, publication, translation, evidence, doc_type,
  fingerprints, source_key and optional version_group. publication.effective is usable only
  when status is provided or recovered. publication.original is never changed.
  publication.candidates retain raw top-level values and source field names.
  field_map[angle] names the full title/body fields inside ensureDetail(...).
  evidence.chunk references data/details/<source.version>/<angle>-<chunk>.js.
  coverage.cells are institution x angle (platform=null) plus social platforms,
  including zero-count cells. They describe observed snapshots, not monitoring.
  versions.groups and related.groups are reviewable candidates, never events or
  a confirmed chronological edit history. Hashes computed here explicitly say
  snapshot_original_sha256; source-supplied content_hash values stay distinct.

Usage: python3 build_research_data.py [--data-dir data] [--output data/research.js]
       python3 build_research_data.py --check
The --check mode rebuilds in memory and compares without writing any file.
"""
from __future__ import annotations

import argparse
import ast
import hashlib
import html
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

HERE = Path(__file__).resolve().parent
ANGLES = ("news", "clue", "social")
PLATFORMS = ("X", "Facebook", "LinkedIn")
SCHEMA_VERSION = 1
BUILDER_VERSION = "research-metadata-3"
FIELD_MAP = {
    "news": {
        "original_title": "title_en", "translated_title": "title_cn",
        "original_body": "content", "translated_body": "content_cn",
        "source_url": "url", "discovered_at": "founddate",
        "collected_at": None, "original_path": None, "source_hash": None,
    },
    "clue": {
        "original_title": "clue_title", "translated_title": None,
        "original_body": "original_content", "translated_body": "chinese_trans",
        "source_url": "original_url", "discovered_at": "discovery_time",
        "collected_at": None, "original_path": "report_path", "source_hash": None,
    },
    "social": {
        "original_title": "title", "translated_title": None,
        "original_body": "original_content", "translated_body": "chinese_translation",
        "source_url": "content_url", "discovered_at": None,
        "collected_at": "collected_time", "original_path": None,
        "source_hash": "content_hash",
    },
}
DOC_RULES = {
    "social_content_type": {"candidate": "social_post", "label": "社交帖子", "basis": "社媒表及 content_type 字段"},
    "url_pdf": {"candidate": "report_pdf", "label": "PDF 文档", "basis": "来源 URL 路径以 .pdf 结尾"},
    "url_home": {"candidate": "homepage", "label": "站点首页", "basis": "来源 URL 为空路径或根路径"},
    "url_profile": {"candidate": "profile", "label": "人物/机构介绍页", "basis": "URL 含明确人物、专家、员工、履历或高管团队路径段；不凭 about 字样判断"},
    "url_listing": {"candidate": "listing", "label": "栏目/聚合页", "basis": "URL 为栏目根路径或分类归档"},
    "url_press": {"candidate": "press_release", "label": "新闻稿", "basis": "URL 含 press-release/news-release 路径"},
    "url_event": {"candidate": "event", "label": "活动页", "basis": "URL 含 event/conference/webinar 路径"},
    "url_report": {"candidate": "report", "label": "报告/研究页", "basis": "URL 含 publication/report/research 路径"},
    "url_news": {"candidate": "news_article", "label": "新闻文章", "basis": "URL 含 news/article/blog 路径"},
    "title_profile": {"candidate": "profile", "label": "人物介绍页", "basis": "原始标题含明确 Profile/Biography 标识"},
    "fallback_web": {"candidate": "web_document", "label": "网页文档（待判定）", "basis": "仅已知记录属于网页来源，待进一步提取"},
}


def text(value: object) -> str:
    return "" if value is None else str(value).strip()


def load_assignment(path: Path, assignment: str) -> tuple[object, bytes]:
    """Read JSON assignments as data; never execute JavaScript or Python."""
    raw = path.read_bytes()
    source = raw.decode("utf-8").strip()
    prefix = assignment + "="
    if not source.startswith(prefix) or not source.endswith(";"):
        raise ValueError(f"Unexpected snapshot assignment: {path}")
    return json.loads(source[len(prefix):-1]), raw


def parse_datetime(value: object, *, epoch: bool = False) -> datetime | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        if epoch:
            number = float(value)
            # Explicitly support epoch seconds/milliseconds, not arbitrary dates.
            if abs(number) >= 100_000_000_000:
                number /= 1000
            result = datetime.fromtimestamp(number, timezone.utc)
        else:
            result = datetime.fromisoformat(text(value).replace("Z", "+00:00"))
        return result if 1900 <= result.year <= 2100 else None
    except (ValueError, TypeError, OverflowError, OSError):
        return None


def date_number(value: object) -> float:
    dt = parse_datetime(value)
    return dt.replace(tzinfo=dt.tzinfo or timezone.utc).timestamp() if dt else float("-inf")


def normalized_datetime(dt: datetime, raw: object) -> str:
    if isinstance(raw, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw.strip()):
        return dt.date().isoformat()
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc)
    precision = "microseconds" if dt.microsecond % 1000 else "milliseconds" if dt.microsecond else "seconds"
    return dt.isoformat(timespec=precision).replace("+00:00", "Z")


def parse_raw_json(value: object) -> tuple[dict | None, str, str]:
    """Prefer JSON, then safe literal parsing, including one string wrapper."""
    if isinstance(value, dict):
        return value, "object", "parsed"
    raw = text(value)
    if not raw:
        return None, "none", "raw_json_missing"
    if len(raw) > 4_000_000:
        return None, "none", "raw_json_too_large"
    methods = []
    for _ in range(2):
        parsed = None
        for name, parser in (("json.loads", json.loads), ("ast.literal_eval", ast.literal_eval)):
            try:
                parsed = parser(raw)
                methods.append(name)
                break
            except (ValueError, SyntaxError, TypeError, MemoryError, RecursionError):
                continue
        if isinstance(parsed, dict):
            return parsed, "+".join(methods), "parsed"
        if isinstance(parsed, str) and parsed != raw:
            raw = parsed
            continue
        break
    return None, "+".join(methods) or "none", "raw_json_unparseable"


def canonical_url(value: object) -> str:
    """Conservative resource key: keep identity queries, drop known tracking."""
    try:
        parsed = urlsplit(text(value))
        if parsed.scheme.lower() not in ("http", "https") or not parsed.hostname:
            return ""
        if parsed.username or parsed.password:
            return ""
        host = parsed.hostname.lower().removeprefix("www.")
        if host in ("twitter.com", "mobile.twitter.com"):
            host = "x.com"
        elif host in ("m.facebook.com", "mbasic.facebook.com"):
            host = "facebook.com"
        if parsed.port and parsed.port not in (80, 443):
            host += ":" + str(parsed.port)
        path = parsed.path.rstrip("/") or "/"
        tracking = {"fbclid", "gclid", "msclkid", "mc_cid", "mc_eid"}
        query = [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True)
                 if not k.lower().startswith("utm_") and k.lower() not in tracking]
        return urlunsplit(("https", host, path, urlencode(sorted(query)), ""))
    except (ValueError, TypeError):
        return ""


def platform_name(value: object) -> str:
    raw = text(value).lower()
    if raw in ("twitter", "x"):
        return "X"
    if "facebook" in raw:
        return "Facebook"
    if "linkedin" in raw:
        return "LinkedIn"
    return text(value) or "其他"


def publication_metadata(angle: str, fields: dict) -> dict:
    original = fields.get("publish_time") or ""
    result = {"original": original, "effective": original if parse_datetime(original) else "", "verified": False, "basis": [],
              "status": "provided" if parse_datetime(original) else ("unverified" if original else "missing")}
    if original:
        result["basis"] = ["publish_time"]
        if result["status"] == "unverified":
            result["reason"] = "invalid_original_publication_date"
        return result
    result["reason"] = "not_in_snapshot_pending_extraction"
    if angle != "social":
        return result
    platform = platform_name(fields.get("platform"))
    if platform not in ("Facebook", "LinkedIn"):
        return result
    raw, parser, reason = parse_raw_json(fields.get("raw_json"))
    result["parser"] = parser
    if raw is None:
        result["reason"] = reason
        return result
    date_fields = ("time", "timestamp") if platform == "Facebook" else ("datePublished",)
    candidates = []
    parsed_dates = []
    # Deliberately inspect only the matched post object. Never recurse into
    # comments, topComments, media, video.publish_time or linked articles.
    for key in date_fields:
        if key not in raw or raw[key] in (None, ""):
            continue
        value = raw[key]
        dt = parse_datetime(value, epoch=key == "timestamp")
        # Avoid copying a malformed nested object into the compact metadata.
        candidate_raw = value if isinstance(value, (str, int, float, bool)) else None
        candidates.append({"field": "raw_json." + key, "raw": candidate_raw,
                           "value": normalized_datetime(dt, value) if dt else "",
                           "status": "parsed" if dt else "invalid"})
        if dt:
            parsed_dates.append(dt)
    if not candidates:
        result["reason"] = "no_top_level_post_date"
        return result
    result["candidates"] = candidates
    result["candidate"] = next((c["value"] for c in candidates if c["value"]), "")
    identity_key, url_key = ("postId", "url") if platform == "Facebook" else ("activityId", "postUrl")
    raw_id = text(raw.get(identity_key))
    content_id = text(fields.get("content_id"))
    row_url = canonical_url(fields.get("content_url"))
    raw_url = canonical_url(raw.get(url_key))
    expected_host = "facebook.com" if platform == "Facebook" else "linkedin.com"
    basis = ["top_level_post_date"]
    failures = []
    if not raw_id or not content_id or raw_id != content_id:
        failures.append("post_identity_mismatch")
    else:
        basis.append(identity_key + "=content_id")
    if not row_url or raw_url != row_url or urlsplit(row_url).hostname != expected_host:
        failures.append("post_url_mismatch")
    else:
        basis.append(url_key + "=content_url")
    if platform == "LinkedIn":
        activity = re.search(r"activity[-:](\d+)", row_url)
        if not activity or activity.group(1) != content_id:
            failures.append("activity_id_not_in_post_url")
        else:
            basis.append("activityId=URL_activity_id")
    if len(parsed_dates) != len(candidates):
        failures.append("invalid_top_level_date")
    if len(parsed_dates) > 1:
        timestamps = [dt.replace(tzinfo=dt.tzinfo or timezone.utc).timestamp() for dt in parsed_dates]
        if max(timestamps) - min(timestamps) > 1:
            failures.append("top_level_dates_conflict")
        else:
            basis.append("time=timestamp_within_1s")
    collected = parse_datetime(fields.get("collected_time"))
    if parsed_dates and collected:
        observed = collected.replace(tzinfo=collected.tzinfo or timezone.utc).timestamp()
        if any(dt.replace(tzinfo=dt.tzinfo or timezone.utc).timestamp() > observed + 86400 for dt in parsed_dates):
            failures.append("candidate_after_collection")
    result["basis"] = basis
    result["identity"] = {"field": "raw_json." + identity_key, "raw": raw_id}
    if failures:
        result["status"] = "unverified"
        result["reason"] = ",".join(failures)
        return result
    result.update(status="recovered", effective=result["candidate"], verified=True, reason="validated_top_level_post_date")
    return result


def translation_metadata(value: object) -> dict:
    raw = text(value)
    if not raw:
        return {"status": "missing", "reason": "not_in_snapshot_pending_extraction"}
    normalized = unicodedata.normalize("NFKC", raw).strip(" \t\r\n。.!！:：[]【】()（）")
    placeholders = {"无法翻译", "待翻译", "翻译失败", "暂无翻译", "未翻译", "translation unavailable", "translation failed"}
    if normalized.casefold() in placeholders:
        return {"status": "placeholder", "reason": "explicit_placeholder"}
    return {"status": "available"}


def document_type(angle: str, fields: dict) -> dict:
    if angle == "social":
        rule = "social_content_type"
    else:
        url = canonical_url(fields.get(FIELD_MAP[angle]["source_url"]))
        path = urlsplit(url).path.casefold() if url else ""
        title = text(fields.get(FIELD_MAP[angle]["original_title"])).casefold()
        if path.endswith(".pdf"):
            rule = "url_pdf"
        elif path == "/":
            rule = "url_home"
        elif re.search(r"/(?:news|research|publications?|reports?|events?|blog|press-releases?)/?$", path) or re.search(r"/(?:category|tag|topics?)/", path):
            rule = "url_listing"
        elif re.search(r"/(?:press[-_]releases?|news[-_]releases?)(?:/|[._-]|$)", path):
            rule = "url_press"
        elif re.search(r"/(?:events?|conferences?|webinars?)(?:/|[-_])", path):
            rule = "url_event"
        elif re.search(r"/(?:publications?|reports?|research)(?:/|[-_])", path):
            rule = "url_report"
        elif re.search(r"/(?:news|articles?|blog|newsroom|press-room)(?:/|[-_])", path):
            rule = "url_news"
        elif re.search(r"/(?:people|persons?|experts?|staff|profiles?|biograph(?:y|ies)|executive-team|leadership)(?:/|$)", path):
            rule = "url_profile"
        elif re.search(r"\b(?:profile|biography)\b", title):
            rule = "title_profile"
        else:
            rule = "fallback_web"
    return {"candidate": DOC_RULES[rule]["candidate"], "rule": rule}


def body_hash(angle: str, fields: dict) -> str:
    body = fields.get(FIELD_MAP[angle]["original_body"])
    return hashlib.sha256(str(body).encode("utf-8")).hexdigest() if body else ""


def fulltext_fingerprints(angle: str, fields: dict) -> dict:
    """Hash the exact complete snapshot body strings, never a remote object.

    No whitespace trimming, newline conversion, placeholder removal, titles or
    list truncation. SHA-256 of the empty string represents a missing body;
    availability and translation quality remain separate evidence/status fields.
    """
    mapping = FIELD_MAP[angle]
    result = {}
    for key, field in (("original", mapping["original_body"]), ("translation", mapping["translated_body"])):
        value = fields.get(field)
        body = "" if value is None else str(value)
        result[key] = hashlib.sha256(body.encode("utf-8")).hexdigest()
    return result


def read_snapshot(data_dir: Path) -> tuple[dict, list[tuple[str, dict, dict]], str]:
    meta, raw = load_assignment(data_dir / "meta.js", "window.ZGCLAB_META")
    version = meta.get("version", "")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", version):
        raise ValueError("Invalid source detail version")
    digest = hashlib.sha256()
    digest.update(b"meta.js\0" + raw)
    rows = []
    all_ids = set()
    for angle in ANGLES:
        listed, raw = load_assignment(data_dir / f"{angle}.js", "window.ZGCLAB_" + angle.upper())
        digest.update(f"{angle}.js\0".encode() + raw)
        if len(listed) != meta["totals"][angle]:
            raise ValueError(f"List count differs from source metadata: {angle}")
        chunks = sorted({r["_detail"] for r in listed})
        details = {}
        detail_chunks = {}
        for chunk in chunks:
            if not isinstance(chunk, int) or isinstance(chunk, bool) or chunk < 0:
                raise ValueError(f"Invalid detail chunk: {angle}/{chunk}")
            name = f"{angle}-{chunk}"
            path = data_dir / "details" / version / (name + ".js")
            full, raw = load_assignment(path, f'window.ZGCLAB_DETAILS["{name}"]')
            digest.update(f"details/{version}/{name}.js\0".encode() + raw)
            for detail in full:
                if detail["id"] in details:
                    raise ValueError("Duplicate detail ID: " + detail["id"])
                details[detail["id"]] = detail
                detail_chunks[detail["id"]] = chunk
        if set(details) != {r["id"] for r in listed}:
            raise ValueError(f"List/detail IDs differ: {angle}")
        for record in listed:
            identifier = record["id"]
            if identifier in all_ids:
                raise ValueError("Duplicate public ID: " + identifier)
            all_ids.add(identifier)
            detail = details[identifier]
            if detail["ktid"] != record["ktid"] or int(detail["fields"]["kt_id"]) != record["ktid"]:
                raise ValueError("Institution mismatch: " + identifier)
            if detail_chunks[identifier] != record["_detail"]:
                raise ValueError("Detail reference mismatch: " + identifier)
            rows.append((angle, record, detail["fields"]))
    return meta, rows, digest.hexdigest()


def evidence_metadata(angle: str, record: dict, fields: dict) -> dict:
    mapping = FIELD_MAP[angle]
    original = str(fields.get(mapping["original_body"]) or "")
    translated = str(fields.get(mapping["translated_body"]) or "")
    result = {"chunk": record["_detail"], "original_chars": len(original), "translation_chars": len(translated)}
    missing = []
    for key in ("original_title", "translated_title", "collected_at", "discovered_at", "original_path", "source_hash"):
        field = mapping[key]
        value = fields.get(field) if field else None
        if not text(value):
            missing.append(key)
        elif key in ("collected_at", "discovered_at", "original_path"):
            result[key] = value
        elif key == "source_hash":
            result[key] = {"field": field, "value": value, "algorithm": "unspecified"}
    if not original:
        missing.append("original_body")
    if not translated:
        missing.append("translated_body")
    if missing:
        result["missing"] = missing
    return result


def latest(values: list[str]) -> str | None:
    dated = [v for v in values if parse_datetime(v)]
    return max(dated, key=date_number) if dated else None


def source_entry(angle: str, fields: dict) -> tuple[str, str]:
    field = "account_url" if angle == "social" else "publisher_website" if angle == "clue" else "url"
    value = text(fields.get(field))
    if not canonical_url(value):
        return "", ""
    if angle == "news":
        parsed = urlsplit(value)
        return urlunsplit((parsed.scheme, parsed.netloc, "/", "", "")), "source_url_domain"
    return value, field


def coverage_cell(ktid: int, angle: str, platform: str | None, members: list, records: dict) -> dict:
    dates = [records[r["id"]]["publication"] for _, r, _ in members]
    usable = [d["effective"] for d in dates if d["status"] in ("provided", "recovered")]
    statuses = Counter(d["status"] for d in dates)
    translations = Counter(records[r["id"]]["translation"]["status"] for _, r, _ in members)
    entries = Counter(source_entry(a, f) for a, _, f in members)
    entries.pop(("", ""), None)
    count = len(members)
    collected = [records[r["id"]]["evidence"].get("collected_at", "") for _, r, _ in members]
    discovered = [records[r["id"]]["evidence"].get("discovered_at", "") for _, r, _ in members]
    return {
        "ktid": ktid, "angle": angle, "platform": platform, "count": count,
        "status": "observed_in_snapshot" if count else "not_observed_in_snapshot",
        "publication": {
            "original_missing": sum(not d["original"] for d in dates),
            "provided": statuses["provided"], "recovered": statuses["recovered"],
            "unresolved": statuses["missing"] + statuses["unverified"],
            "min": min(usable, key=date_number) if usable else None,
            "max": max(usable, key=date_number) if usable else None,
        },
        "translation": {key: translations[key] for key in ("available", "missing", "placeholder")},
        "latest_collected_at": latest(collected), "latest_discovered_at": latest(discovered),
        "source_entry_count": len(entries),
        "source_entries": [{"url": url, "basis": basis, "count": n} for (url, basis), n in entries.most_common(12)],
        "omitted_source_entries": max(0, len(entries) - 12),
        "monitoring_status": "not_connected",
    }


def build_coverage(meta: dict, rows: list, records: dict) -> dict:
    grouped = defaultdict(list)
    for angle, record, fields in rows:
        grouped[(record["ktid"], angle, None)].append((angle, record, fields))
        if angle == "social":
            grouped[(record["ktid"], angle, platform_name(fields.get("platform")))].append((angle, record, fields))
    cells = []
    platforms = sorted(set(PLATFORMS) | {key[2] for key in grouped if key[2] is not None})
    for institution in meta["institutions"]:
        ktid = institution["ktid"]
        for angle in ANGLES:
            cells.append(coverage_cell(ktid, angle, None, grouped[(ktid, angle, None)], records))
            if angle == "social":
                for platform in platforms:
                    cells.append(coverage_cell(ktid, angle, platform, grouped[(ktid, angle, platform)], records))
    return {
        "scope": "observed_snapshot_only", "cells": cells, "platforms": platforms,
        "collection_window": None,
        "collection_window_reason": "发布时间范围不能证明采集窗口；仅保留逐条采集/发现时间。",
        "monitoring_status": "not_connected",
        "monitoring_basis": "静态快照未提供持续采集器、调度、运行日志或最近成功采集的在线证明。",
        "zero_count_meaning": "仅表示本快照未观测到，不代表机构或平台没有内容。",
    }


def build_versions(rows: list, records: dict) -> dict:
    grouped = defaultdict(list)
    raw_clue_urls = Counter()
    for angle, record, fields in rows:
        original_url = text(fields.get(FIELD_MAP[angle]["source_url"]))
        url = canonical_url(original_url)
        if url:
            grouped[url].append((angle, record, fields))
        if angle == "clue" and original_url:
            raw_clue_urls[original_url] += 1
    groups = []
    for url, members in sorted(grouped.items()):
        if len(members) < 2:
            continue
        hashes = {body_hash(a, f) for a, _, f in members if body_hash(a, f)}
        identifier = "url-" + hashlib.sha256(url.encode()).hexdigest()[:20]
        group = {"id": identifier, "canonical_url": url,
                 "status": "candidate_different_versions" if len(hashes) > 1 else "same_body_duplicate",
                 "distinct_bodies": len(hashes), "members": []}
        for angle, record, fields in sorted(members, key=lambda item: item[1]["id"]):
            derived = records[record["id"]]
            member = {"id": record["id"], "angle": angle, "ktid": record["ktid"],
                      "publish_original": derived["publication"]["original"],
                      "publish_value": derived["publication"]["effective"], "date_status": derived["publication"]["status"],
                      "snapshot_original_sha256": body_hash(angle, fields)}
            for key in ("collected_at", "discovered_at", "source_hash"):
                if key in derived["evidence"]:
                    member[key] = derived["evidence"][key]
            group["members"].append(member)
            derived["version_group"] = identifier
        groups.append(group)
    return {
        "basis": "stable_normalized_source_url", "groups": groups,
        "exact_clue_duplicate_url_groups": sum(count > 1 for count in raw_clue_urls.values()),
        "different_body_groups": sum(g["status"] == "candidate_different_versions" for g in groups),
        "normalization": "Lowercase host; normalize www, Twitter/X and HTTP/HTTPS; remove fragment, trailing slash and named tracking parameters; preserve identity queries.",
        "hash_scope": "snapshot_original_sha256 = SHA-256 of the exact UTF-8 original body string in the detail snapshot, not the remote resource or file.",
        "limitation": "同一链接下不同正文仅是版本候选，也可能是抓取或抽取差异；逐条采集/发现时间不能证明页面修订顺序。",
        "baseline_status": "single_snapshot_no_previous_delivery_comparison",
    }


def normalized_title(value: object) -> str:
    normalized = unicodedata.normalize("NFKC", html.unescape(text(value))).casefold()
    return " ".join(re.findall(r"[^\W_]+", normalized, flags=re.UNICODE))


def build_related(rows: list, records: dict, versions: dict) -> dict:
    groups = []
    seen_members = set()
    for source in versions["groups"]:
        ids = sorted(member["id"] for member in source["members"])
        if len(ids) > 20:
            continue
        groups.append({"id": "related-" + source["id"], "basis": "same_normalized_source_url", "members": ids})
        seen_members.add(tuple(ids))
    by_title = defaultdict(list)
    labels = {}
    for angle, record, fields in rows:
        if records[record["id"]]["doc_type"]["candidate"] in ("homepage", "listing", "profile"):
            continue
        title = text(fields.get(FIELD_MAP[angle]["original_title"]))
        if angle == "social" and not title:
            title = next((line.strip() for line in text(fields.get("original_content")).splitlines() if line.strip()), "")
        key = normalized_title(title)
        # Short/generic labels and institution identity alone cannot make a group.
        if len(key) < 35 or (len(key.split()) < 6 and not re.search(r"[\u3400-\u9fff]", key)):
            continue
        by_title[key].append(record["id"])
        labels[key] = title[:180]
    for key, members in sorted(by_title.items()):
        ids = sorted(set(members))
        if not 2 <= len(ids) <= 20 or tuple(ids) in seen_members:
            continue
        groups.append({"id": "title-" + hashlib.sha256(key.encode()).hexdigest()[:20],
                       "basis": "same_normalized_substantive_title", "label": labels[key], "members": ids})
        seen_members.add(tuple(ids))
    return {"groups": groups, "status": "candidates_require_human_review", "automatic_event_merge": False,
            "adjustable": True, "maximum_group_size": 20,
            "basis": "离线规范来源链接或足够长的规范标题完全相同；不按机构相同分组，不推断同一事件。",
            "limitation": "未提取短链接跳转、语义事件或跨语言相似性；候选可由用户确认、拆分或排除。"}


def quality_counts(entries: list[dict]) -> dict:
    return {
        "total": len(entries),
        "publish_time_original_missing": sum(not r["publication"]["original"] for r in entries),
        "publish_time_recovered": sum(r["publication"]["status"] == "recovered" for r in entries),
        "publish_time_unresolved": sum(r["publication"]["status"] in ("missing", "unverified") for r in entries),
        "publish_time_unverified": sum(r["publication"]["status"] == "unverified" for r in entries),
        "translation_available": sum(r["translation"]["status"] == "available" for r in entries),
        "translation_missing": sum(r["translation"]["status"] == "missing" for r in entries),
        "translation_placeholder": sum(r["translation"]["status"] == "placeholder" for r in entries),
        "source_url_missing": sum(not r["source_key"] for r in entries),
        "source_hash_missing": sum("source_hash" in r["evidence"]["missing"] for r in entries),
        "original_path_missing": sum("original_path" in r["evidence"]["missing"] for r in entries),
    }


def build(data_dir: Path) -> dict:
    meta, rows, digest = read_snapshot(data_dir)
    records = {}
    for angle, record, fields in rows:
        url = canonical_url(fields.get(FIELD_MAP[angle]["source_url"]))
        entry = {
            "angle": angle, "ktid": record["ktid"],
            "publication": publication_metadata(angle, fields),
            "translation": translation_metadata(fields.get(FIELD_MAP[angle]["translated_body"])),
            "evidence": evidence_metadata(angle, record, fields),
            "fingerprints": fulltext_fingerprints(angle, fields),
            "doc_type": document_type(angle, fields),
            "source_key": hashlib.sha256(url.encode()).hexdigest()[:20] if url else "",
        }
        if angle == "social":
            entry["platform"] = platform_name(fields.get("platform"))
        records[record["id"]] = entry
    versions = build_versions(rows, records)
    return {
        "schema_version": SCHEMA_VERSION, "builder_version": BUILDER_VERSION,
        "version": hashlib.sha256((BUILDER_VERSION + "\0" + digest).encode()).hexdigest()[:20],
        "source": {"version": meta["version"], "package": meta.get("source_package"),
                   "generated_at": meta.get("generated_at"), "snapshot_sha256": digest,
                   "totals": meta["totals"], "total": len(records), "simulation_included": False},
        "field_map": FIELD_MAP, "doc_type_rules": DOC_RULES,
        "semantics": {
            "date_status": {"provided": "原始 publish_time 可解析，未改写来源字段", "recovered": "帖子顶层候选通过日期及身份校验", "missing": "快照未提供可验证的帖子发布时间", "unverified": "日期无效或候选未通过验证，不能作发布时间使用"},
            "translation_status": {"available": "快照含非占位译文，未人工验证翻译正确性", "missing": "快照译文为空，待提取", "placeholder": "明确的无法翻译等占位，不是实际译文"},
            "evidence_missing": "field_map 未定义或原始字段为空的字段未在快照提供；原因无法判定时待提取。没有单独译文标题字段不表示正文译文缺失。",
            "doc_type": "全部为基于字段/URL/标题规则的候选；查看 doc_type_rules[rule].basis，需人工确认。",
            "source_hash": "原样保留来源 content_hash；原始字段没有声明算法，故不据长度臆定为 SHA-256。",
            "fingerprints": "fingerprints.original/translation 是 field_map 所指完整详情原文/译文字段原值的 UTF-8 SHA-256；不裁剪、不去空白、不合并标题，不代表远端文件或原始对象哈希。空字段对应空字符串哈希，占位文本也按原值计算；可检测正文尾部变更。",
            "paragraphs": "按 field_map 从完整 details.fields 读取原文/译文标题和正文，用换行分段；不使用列表截断节选替代全文。",
        },
        "records": records, "coverage": build_coverage(meta, rows, records),
        "versions": versions, "related": build_related(rows, records, versions),
        "quality": {"counts": quality_counts(list(records.values())),
                    "by_angle": {angle: quality_counts([r for r in records.values() if r["angle"] == angle]) for angle in ANGLES}},
        "recommendations": [
            {"key": "translation", "label": "优先补齐占位与缺失译文", "basis": "translation.status=placeholder/missing", "status": "proposed"},
            {"key": "dates", "label": "核验剩余发布时间，保留顶层证据与原字段", "basis": "publication.status=missing/unverified", "status": "proposed"},
            {"key": "monitoring", "label": "接入采集器运行证据、成功时间和明确采集窗口", "basis": "coverage.monitoring_status=not_connected", "status": "not_connected"},
            {"key": "versions", "label": "逐组复核相同链接的不同正文", "basis": "versions.groups.status=candidate_different_versions", "status": "proposed"},
            {"key": "relations", "label": "人工确认关联候选并支持拆分与排除", "basis": "related.status=candidates_require_human_review", "status": "proposed"},
        ],
    }


def encode(payload: dict) -> str:
    # Preserve decoded source strings while preventing HTML/script termination
    # if an external-data assignment is ever embedded in an inline script.
    serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    for character, escaped in (("<", "\\u003c"), (">", "\\u003e"), ("&", "\\u0026"),
                               ("\u2028", "\\u2028"), ("\u2029", "\\u2029")):
        serialized = serialized.replace(character, escaped)
    return "window.ZGCLAB_RESEARCH=" + serialized + ";\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=HERE / "data")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--check", action="store_true", help="Verify the generated artifact without writing")
    args = parser.parse_args()
    output = args.output or args.data_dir / "research.js"
    payload = build(args.data_dir)
    content = encode(payload)
    if args.check:
        if not output.is_file() or output.read_text(encoding="utf-8") != content:
            raise SystemExit(f"Research metadata is absent or stale: {output}")
    else:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(content, encoding="utf-8")
    print(json.dumps({"status": "verified" if args.check else "built", "output": str(output),
                      "source_version": payload["source"]["version"], "research_version": payload["version"],
                      "bytes": len(content.encode("utf-8")), **payload["quality"]["counts"],
                      "coverage_cells": len(payload["coverage"]["cells"]),
                      "version_groups": len(payload["versions"]["groups"]),
                      "exact_clue_duplicate_url_groups": payload["versions"]["exact_clue_duplicate_url_groups"],
                      "related_candidate_groups": len(payload["related"]["groups"])}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
