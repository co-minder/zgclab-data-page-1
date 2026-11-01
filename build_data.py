#!/usr/bin/env python3
"""从需求1交付包生成数据展示快照（data/*.js）。

数据来源：work-disk-1/zgclab-1/outputs/delivery-package/20261011-current-reviewed
（20 单位 × 3 角度的已审核入表数据）

用法：
    python3 build_data.py [交付包目录]
默认输出到本脚本所在目录的 data/ 子目录。
"""
from __future__ import annotations

import csv
import json
import sys
import hashlib
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "data"

DEFAULT_PKG = Path(
    "/home/ubuntu/work-disk-1/zgclab-1/outputs/delivery-package/20261011-current-reviewed"
)
INSTITUTIONS_CSV = Path("/home/ubuntu/zgclab-1/database/generated/institutions.csv")

TABLES = {
    "news": "任务1_t_kt_public_sentiment.csv",
    "clue": "任务1_t_kt_risk_clue_detect.csv",
    "social": "任务1_t_kt_social_media_content.csv",
}

ANGLE_META = {
    "news": {"key": "news", "name": "新闻舆情", "short": "舆情", "table": "t_kt_public_sentiment", "fields": 16},
    "clue": {"key": "clue", "name": "官网线索", "short": "线索", "table": "t_kt_risk_clue_detect", "fields": 35},
    "social": {"key": "social", "name": "社交媒体", "short": "社媒", "table": "t_kt_social_media_content", "fields": 34},
}

CONTENT_CAP = 1500
DETAIL_CHUNK_SIZE = 75


def cut(value: str | None, limit: int = CONTENT_CAP) -> str:
    v = (value or "").strip()
    return v if len(v) <= limit else v[:limit].rstrip() + "…"


def parse_dt(value: str | None) -> datetime | None:
    v = (value or "").strip()
    if not v:
        return None
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        pass
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%Y/%m/%d", "%Y-%m"):
        try:
            return datetime.strptime(v[:19], fmt)
        except ValueError:
            continue
    return None


def month_key(value: str | None) -> str:
    dt = parse_dt(value)
    return dt.strftime("%Y-%m") if dt else ""


def write_js(path: Path, assignment: str, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(assignment + "=" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")


def row_identity(angle: str, row: dict) -> str:
    """Identity is independent of ordering, so new deliveries keep existing links valid."""
    link = row.get("url") or row.get("original_url") or row.get("content_url") or ""
    key = "\0".join([angle, row.get("kt_id") or "", link, row.get("record_id") or row.get("clue_id") or row.get("id") or ""])
    if not link:
        key += "\0" + (row.get("title_cn") or row.get("clue_title") or row.get("original_content") or "")
    return angle + "-" + hashlib.sha256(key.encode()).hexdigest()[:20]


def sort_time(row: dict) -> float:
    dt = parse_dt(row.get("publish_time") or row.get("founddate") or row.get("discovery_time") or row.get("collected_time"))
    return dt.replace(tzinfo=dt.tzinfo or timezone.utc).timestamp() if dt else float("-inf")


def norm_platform(p: str) -> str:
    p = (p or "").strip().lower()
    if p.startswith("x") or p == "twitter":
        return "X"
    if "facebook" in p:
        return "Facebook"
    if "linkedin" in p:
        return "LinkedIn"
    return p.title() or "其他"


def load_csv(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def build_institutions(rows: list[dict], counts: dict, counts_by_angle: dict) -> list[dict]:
    out = []
    for r in rows:
        ktid = int(r["ktid"])
        out.append(
            {
                "ktid": ktid,
                "cn": (r.get("org_name") or "").strip(),
                "en": (r.get("org_name_en") or "").strip(),
                "type": (r.get("org_type") or "").strip(),
                "country": (r.get("country") or "").strip(),
                "legacy": int(r.get("legacy_report_count") or 0),
                "counts": counts.get(ktid, {"news": 0, "clue": 0, "social": 0}),
                "by_angle": counts_by_angle.get(ktid, {}),
            }
        )
    out.sort(key=lambda x: (-sum(x["counts"].values()), x["ktid"]))
    return out


def main() -> None:
    pkg = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_PKG
    for filename in TABLES.values():
        if not (pkg / filename).is_file():
            raise SystemExit(f"交付包不存在或缺少文件：{pkg / filename}")

    institution_file = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else INSTITUTIONS_CSV
    inst_rows = load_csv(institution_file)
    known = {int(r["ktid"]) for r in inst_rows}
    # Preserve existing public IDs where possible, including links from the first release.
    previous_ids = defaultdict(list)
    for angle in TABLES:
        old_path = OUT / f"{angle}.js"
        if old_path.is_file():
            old_rows = json.loads(old_path.read_text().split("=", 1)[1].strip().removesuffix(";"))
            for row in old_rows:
                link = row.get("url") or row.get("original_url") or row.get("content_url") or ""
                previous = previous_ids[(angle, row.get("ktid"), link)]
                if row.get("id") not in previous:
                    previous.append(row.get("id"))

    records = {}
    stats = {}
    all_months = set()
    details = {}
    schemas = {}
    build_hash = hashlib.sha256()
    build_hash.update(b"zgclab-data-v4-unique-record-ids")

    for angle, filename in TABLES.items():
        rows = load_csv(pkg / filename)
        build_hash.update((pkg / filename).read_bytes())
        schemas[angle] = list(rows[0]) if rows else []
        recs = []
        detail_rows = []
        used_ids = set()
        for r in rows:
            ktid = int(r["kt_id"]) if (r.get("kt_id") or "").strip() else None
            if ktid not in known:
                continue
            if angle == "news":
                rec = {
                    "id": r.get("id", ""),
                    "ktid": ktid,
                    "title_cn": cut(r.get("title_cn"), 300),
                    "title_en": cut(r.get("title_en"), 300),
                    "summary_cn": cut(r.get("summary_cn"), 500),
                    "summary_en": cut(r.get("summary_en"), 240),
                    "tag": (r.get("tag") or "").strip(),
                    "founddate": (r.get("founddate") or "").strip(),
                    "url": (r.get("url") or "").strip(),
                    "publish_source": (r.get("publish_source") or "").strip(),
                    "publish_time": (r.get("publish_time") or "").strip(),
                    "content_cn": cut(r.get("content_cn"), 220),
                }
                when = rec["publish_time"] or rec["founddate"]
            elif angle == "clue":
                rec = {
                    "id": r.get("clue_id", ""),
                    "ktid": ktid,
                    "title": cut(r.get("clue_title"), 300),
                    "summary": cut(r.get("clue_summary"), 500),
                    "risk_level": (r.get("risk_level") or "").strip(),
                    "risk_desc": cut(r.get("risk_desc"), 600),
                    "publish_channel": (r.get("publish_channel") or "").strip(),
                    "publish_subject": (r.get("publish_subject") or "").strip(),
                    "industry": (r.get("industry") or "").strip(),
                    "discovery_time": (r.get("discovery_time") or "").strip(),
                    "publish_time": (r.get("publish_time") or "").strip(),
                    "language": (r.get("language") or "").strip(),
                    "key_words": (r.get("key_words") or "").strip(),
                    "original_url": (r.get("original_url") or "").strip(),
                    "publisher_website": (r.get("publisher_website") or "").strip(),
                    "publisher_type": (r.get("publisher_type") or "").strip(),
                    "publisher_business": (r.get("publisher_business") or "").strip(),
                    "publisher_cn_attitude": (r.get("publisher_cn_attitude") or "").strip(),
                    "chinese_trans": cut(r.get("chinese_trans"), 220),
                    "source": (r.get("source") or "").strip(),
                }
                when = rec["publish_time"] or rec["discovery_time"]
            else:
                rec = {
                    "id": r.get("record_id", ""),
                    "ktid": ktid,
                    "platform": norm_platform(r.get("platform")),
                    "account_name": (r.get("account_name") or "").strip(),
                    "account_handle": (r.get("account_handle") or "").strip(),
                    "account_url": (r.get("account_url") or "").strip(),
                    "content_type": (r.get("content_type") or "").strip(),
                    "content_url": (r.get("content_url") or "").strip(),
                    "title": cut(r.get("title"), 300),
                    "original_content": cut(r.get("original_content"), 300),
                    "chinese_translation": cut(r.get("chinese_translation"), 240),
                    "language": (r.get("language") or "").strip(),
                    "publish_time": (r.get("publish_time") or "").strip(),
                    "collected_time": (r.get("collected_time") or "").strip(),
                    "keywords": (r.get("keywords") or "").strip(),
                    "mentions": (r.get("mentions") or "").strip(),
                    "hashtags": (r.get("hashtags") or "").strip(),
                    "like_count": r.get("like_count") or "",
                    "comment_count": r.get("comment_count") or "",
                    "repost_count": r.get("repost_count") or "",
                    "view_count": r.get("view_count") or "",
                    "source_url": (r.get("source_url") or "").strip(),
                }
                when = rec["publish_time"] or rec["collected_time"]
            rec["_has_original"] = bool(r.get("content") or r.get("original_content"))
            rec["_has_translation"] = bool(r.get("content_cn") or r.get("chinese_trans") or r.get("chinese_translation"))
            media = " ".join(str(r.get(key) or "") for key in ["media_urls", "attachment_urls", "report_path"])
            media_types = []
            if media and media.strip() not in ("[]", "{}", "null"):
                media_types.append("attachment")
                if re.search(r"\.(?:jpe?g|png|gif|webp|svg)|image|pbs\.twimg\.com|scontent", media, re.I):
                    media_types.append("image")
                if re.search(r"\.(?:mp4|webm|mov|m3u8)|video|youtube|youtu\.be", media, re.I):
                    media_types.append("video")
                if re.search(r"\.pdf(?:\b|\?)", media, re.I):
                    media_types.append("pdf")
            rec["_media_types"] = media_types
            rec["_month"] = month_key(when)
            link = rec.get("url") or rec.get("original_url") or rec.get("content_url") or ""
            candidates = previous_ids.get((angle, ktid, link)) or []
            record_id = next((value for value in candidates if value not in used_ids), None) or row_identity(angle, r)
            suffix = 0
            while record_id in used_ids:
                suffix += 1
                record_id = row_identity(angle, r) + "-" + str(len(recs)) + ("-" + str(suffix) if suffix > 1 else "")
            used_ids.add(record_id)
            rec["id"] = record_id
            rec["_detail"] = len(detail_rows) // DETAIL_CHUNK_SIZE
            detail_rows.append({"id": record_id, "ktid": ktid, "fields": r})
            if rec["_month"]:
                all_months.add(rec["_month"])
            recs.append(rec)

        # 按时间倒序（无时间的排后面）
        recs.sort(key=sort_time, reverse=True)
        records[angle] = recs
        details[angle] = detail_rows

        # 统计
        per_inst = Counter(r["ktid"] for r in recs if r["ktid"])
        months = Counter(r["_month"] for r in recs if r["_month"])
        st = {
            "total": len(recs),
            "institutions": len(per_inst),
            "per_institution": dict(per_inst),
            "months": dict(sorted(months.items())),
            "dated": sum(bool(parse_dt(r.get("publish_time") or r.get("founddate") or r.get("discovery_time") or r.get("collected_time"))) for r in recs),
            "linked": sum(bool(re.match(r"^https?://", r.get("url") or r.get("original_url") or r.get("content_url") or "", re.I)) for r in recs),
            "summarized": sum(bool(r.get("summary_cn") or r.get("summary") or r.get("chinese_translation")) for r in recs),
            "date_min": min((r.get("publish_time") or r.get("founddate") or r.get("discovery_time") or r.get("collected_time") or "")[:10] for r in recs),
            "date_max": max((r.get("publish_time") or r.get("founddate") or r.get("discovery_time") or r.get("collected_time") or "")[:10] for r in recs),
        }
        if angle == "news":
            st["tags"] = dict(Counter(r["tag"] or "未分类" for r in recs).most_common())
            st["sources"] = dict(Counter(r["publish_source"] for r in recs if r["publish_source"]).most_common(12))
        elif angle == "clue":
            st["risk_levels"] = dict(Counter(r["risk_level"] or "未判定" for r in recs).most_common())
            st["publisher_types"] = dict(Counter(r["publisher_type"] or "未知" for r in recs).most_common())
        else:
            st["platforms"] = dict(Counter(r["platform"] for r in recs).most_common())
        stats[angle] = st

    # 机构 × 角度计数
    counts = defaultdict(lambda: {"news": 0, "clue": 0, "social": 0})
    for angle, recs in records.items():
        for r in recs:
            if r["ktid"]:
                counts[r["ktid"]][angle] += 1

    institutions = build_institutions(inst_rows, counts, counts)
    # 只保留 20 单位内的记录（交付包本来就是20单位，这里做保护）
    known = {i["ktid"] for i in institutions}

    months_sorted = [m for m in sorted(all_months) if m >= "2024-01"]
    if not months_sorted:
        months_sorted = sorted(all_months)
    if months_sorted:
        start = datetime.strptime(months_sorted[0], "%Y-%m").replace(tzinfo=timezone.utc)
        end = datetime.strptime(months_sorted[-1], "%Y-%m").replace(tzinfo=timezone.utc)
        span = []
        cur = start
        while cur <= end:
            span.append(cur.strftime("%Y-%m"))
            cur = (cur.replace(year=cur.year + 1, month=1) if cur.month == 12
                   else cur.replace(month=cur.month + 1))
    else:
        span = []

    meta = {
        "version": build_hash.hexdigest()[:16],
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        # 发布到静态站点时只保留交付包名称，避免把服务器绝对路径写入公开快照。
        "source_package": pkg.name,
        "scope": {"units": len(institutions), "angles": len(TABLES)},
        "angles": ANGLE_META,
        "totals": {a: stats[a]["total"] for a in stats},
        "institutions": institutions,
        "stats": stats,
        "months": span,
        "schemas": schemas,
        "detail_chunk_size": DETAIL_CHUNK_SIZE,
    }
    # 最新入库（供总览页直接使用，避免首屏加载大文件）
    recent = []
    for angle, recs in records.items():
        for r in recs[:5]:
            title = r.get("title_cn") or r.get("title") or r.get("account_name") or ""
            snippet = r.get("summary_cn") or r.get("summary") or r.get("chinese_translation") or r.get("original_content") or ""
            recent.append({
                "angle": angle,
                "id": r["id"],
                "ktid": r["ktid"],
                "title": title[:120],
                "snippet": snippet[:160],
                "date": r.get("publish_time") or r.get("founddate") or r.get("discovery_time") or r.get("collected_time") or "",
            })
    recent.sort(key=lambda x: sort_time({"publish_time": x["date"]}), reverse=True)
    meta["recent"] = recent[:9]
    for angle in records:
        records[angle] = [
            {k: v for k, v in r.items() if v not in ("", None)}
            for r in records[angle] if r["ktid"] and r["ktid"] in known
        ]
        meta["totals"][angle] = len(records[angle])

    OUT.mkdir(parents=True, exist_ok=True)
    write_js(OUT / "meta.js", "window.ZGCLAB_META", meta)
    for angle, recs in records.items():
        write_js(OUT / f"{angle}.js", f"window.ZGCLAB_{angle.upper()}", recs)
        for start in range(0, len(details[angle]), DETAIL_CHUNK_SIZE):
            chunk = start // DETAIL_CHUNK_SIZE
            path = OUT / "details" / meta["version"] / f"{angle}-{chunk}.js"
            write_js(path, f'window.ZGCLAB_DETAILS["{angle}-{chunk}"]', details[angle][start:start + DETAIL_CHUNK_SIZE])
    print(json.dumps({
        "out": str(OUT),
        "generated_at": meta["generated_at"],
        "units": len(institutions),
        "totals": meta["totals"],
        "months": [span[0], span[-1]] if span else [],
        "size_mb": round(sum((OUT / f"{a}.js").stat().st_size for a in records) / 1024 / 1024, 2),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
