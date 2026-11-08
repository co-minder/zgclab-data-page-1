from __future__ import annotations

import datetime as dt
import difflib
import json
import re
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from zoneinfo import ZoneInfo

from .text import CHINESE, WORD, normalize, phrase, snippet, tokens
from .intent import request_intent


class InputError(ValueError):
    pass


class QueryTimeout(RuntimeError):
    pass


class SnapshotChanged(RuntimeError):
    pass


BEIJING = ZoneInfo("Asia/Shanghai")


ALIASES = {
    1000110: ["FBI", "联邦调查局", "美国联调局"],
    1001140: ["DHS", "国土安全部", "美国国土安全局"],
    1000490: ["CSIS", "战略与国际研究中心", "战略国际研究中心"],
    1000580: ["CrowdStrike", "克劳德斯特赖克", "众击", "众击公司"],
    1001190: ["大西洋理事会", "Atlantic Council"],
    1000480: ["RAND", "兰德", "兰德智库"],
    1001210: ["Brookings", "布鲁金斯", "布鲁金斯学会"],
    1002550: ["Arkansas State", "Arkansas State University", "ArkansasState", "A-State", "阿肯色", "阿肯色州立", "阿肯色州立大学", "阿肯萨斯州立大学", "阿肯萨斯州立"],
    1001270: ["CNAS", "新美国安全中心"],
    1001290: ["CFR", "外交关系协会", "对外关系委员会", "美国外交关系委员会"],
    1000760: ["Lockheed Martin", "洛克希德马丁", "洛马", "洛克希德·马丁"],
    1055920: ["Kharon", "卡隆"],
    1056587: ["Intel", "英特尔"],
    1056514: ["JPMorgan", "JP Morgan", "摩根大通"],
    1001350: ["FDD", "保卫民主基金会"],
    5775050: ["OpenAI", "开放人工智能"],
    2575920: ["Honeywell", "霍尼韦尔"],
    1056630: ["IBM", "国际商业机器"],
    2572960: ["Cisco", "思科"],
    1001150: ["DOS", "美国国务院", "State Department"],
}
SYNONYMS = [
    ["网络安全", "网安", "cybersecurity", "cyber security", "cyber attack", "网络攻击"],
    ["人工智能", "AI", "artificial intelligence", "机器学习", "machine learning"],
    ["芯片", "半导体", "semiconductor", "semiconductors", "chip", "chips"],
    ["供应链", "supply chain", "供应链安全"],
    ["制裁", "sanctions", "sanction", "出口管制", "export controls"],
    ["移民", "immigration", "immigrants", "border patrol", "ICE"],
    ["朝鲜", "North Korea", "DPRK"],
    ["中国", "China", "Chinese", "PRC"],
    ["无人机", "drone", "drones", "UAV"],
    ["足球", "football", "soccer"],
    ["安全", "safety", "security", "safe"],
    ["比赛", "game", "match", "matchup", "football", "soccer"],
    ["结果", "比分", "outcome", "result", "score", "setback", "win", "loss"],
    ["量子", "quantum"],
    ["国防", "防务", "defense", "defence"],
]
ANGLE_ALIASES = {"新闻": "news", "新闻舆情": "news", "舆情": "news", "官网": "clue", "官网线索": "clue", "线索": "clue", "社媒": "social", "社交媒体": "social", "社交": "social"}
STOP_EN = set("a an the is are was were has have had do does did what which how many much about of in on at for and or to from with there this that these those it its they their show find search please tell me you can could would latest recent more count counts number records record entries entry database total information news social media official website posts post published source sources university institution all breakdown by per".split())
STOP_ZH = ["有什么", "有哪些", "讲了", "讲述", "谈了", "提到", "涉及", "主题", "有关", "做了", "各机构", "每个机构", "各平台", "每个平台", "请问", "请帮我", "帮我", "告诉我", "资料库", "数据库", "总共有", "一共有", "共有", "数量", "多少", "几条", "记录", "资料", "信息", "内容", "哪些", "什么", "相关", "关于", "最近", "最新", "查询", "检索", "搜索", "介绍", "总结", "概括", "分析", "给我", "一下", "以及", "还有", "并且", "情况", "这些", "那些", "它们", "这个", "那个", "其中", "机构", "大学", "学校", "学院", "新闻舆情", "官网线索", "社交媒体", "新闻", "官网", "线索", "社媒", "全库", "各角度", "各类", "分别", "条目", "分别有", "统计", "总数", "总计", "合计", "全部", "所有", "按角度", "按机构", "按平台", "的", "有", "是", "了", "吗", "呢", "与", "和", "在", "中", "条"]


def bounded_text(value, name: str, limit: int, allow_empty: bool = False) -> str:
    if not isinstance(value, str) or len(value) > limit or (not allow_empty and not value.strip()):
        raise InputError(f"{name} must be {'an optional' if allow_empty else 'a nonempty'} string of at most {limit} characters")
    if any((ord(ch) < 32 and ch not in "\n\r\t") or 0xD800 <= ord(ch) <= 0xDFFF for ch in value):
        raise InputError(f"{name} contains invalid control characters")
    return value.strip()


def _contains(text: str, term: str) -> bool:
    value, needle = normalize(text), normalize(term)
    if needle.isascii() and any(c.isalpha() for c in needle):
        return re.search(r"(?<![a-z0-9])" + re.escape(needle) + r"(?![a-z0-9])", value) is not None
    return needle in value


class Retriever:
    def __init__(self, database: Path, timeout: float = 4.0):
        self.database = Path(database)
        self.timeout = timeout
        self.signature = self.file_signature()
        with self.connect() as con:
            self.institutions = [dict(row) for row in con.execute("SELECT * FROM institutions ORDER BY ktid")]
            self.snapshot = json.loads(con.execute("SELECT value FROM metadata WHERE key='snapshot'").fetchone()[0])
            self.vocabulary = {row[0]: row[1] for row in con.execute("SELECT word,frequency FROM vocabulary")}
        self.aliases = {i["ktid"]: list(dict.fromkeys([i["cn"], i["en"], *ALIASES.get(i["ktid"], [])])) for i in self.institutions}

    def file_signature(self):
        stat = self.database.stat()
        return (stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns)

    def check_snapshot(self):
        if self.file_signature() != self.signature:
            raise SnapshotChanged("Database snapshot changed; restart the API to load the new snapshot")

    @contextmanager
    def connect(self):
        self.check_snapshot()
        con = sqlite3.connect(self.database.resolve().as_uri() + "?mode=ro", uri=True, timeout=1)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA query_only=ON")
        deadline = time.monotonic() + self.timeout
        con.set_progress_handler(lambda: int(time.monotonic() > deadline), 10000)
        try:
            self.check_snapshot()
            yield con
            self.check_snapshot()
        except sqlite3.OperationalError as error:
            if "interrupted" in str(error).lower():
                raise QueryTimeout("Database query exceeded its time limit") from None
            raise
        finally:
            con.close()

    def institution_ids(self, value) -> list[int]:
        values = value if isinstance(value, list) else [value]
        if not values or len(values) > 20:
            raise InputError("Select between 1 and 20 institutions")
        found = []
        for item in values:
            if isinstance(item, bool) or not isinstance(item, (str, int)):
                raise InputError("institution must contain IDs or exact institution aliases")
            name = str(item).strip()
            matched = [ktid for ktid, aliases in self.aliases.items() if name == str(ktid) or any(normalize(name) == normalize(a) for a in aliases)]
            if not matched:
                raise InputError("Unknown institution filter")
            found.extend(matched)
        return list(dict.fromkeys(found))

    def validate_filters(self, value) -> dict:
        if value is None:
            return {}
        if not isinstance(value, dict):
            raise InputError("filters must be an object")
        supported = {"institution", "institution_id", "ktid", "angle", "platform", "date_from", "date_to", "date_field", "dataset"}
        if set(value) - supported:
            raise InputError("Unknown filter field")
        if value.get("dataset", "real") != "real":
            raise InputError("This API contains only real records; simulation is not supported")
        result = {}
        institution_keys = [key for key in ("institution", "institution_id", "ktid") if key in value and value[key] is not None]
        if len(institution_keys) > 1:
            raise InputError("Use only one institution filter field")
        if institution_keys:
            result["institution"] = self.institution_ids(value[institution_keys[0]])
        for key in ("angle", "platform"):
            if key not in value or value[key] is None:
                continue
            values = value[key] if isinstance(value[key], list) else [value[key]]
            if not values or len(values) > 20:
                raise InputError(f"{key} must contain 1 to 20 values")
            values = [bounded_text(v, key, 100) for v in values]
            if key == "angle":
                values = [ANGLE_ALIASES.get(v, v) for v in values]
                if any(v not in {"news", "clue", "social"} for v in values):
                    raise InputError("angle must be news, clue, or social")
            result[key] = list(dict.fromkeys(values))
        for key in ("date_from", "date_to"):
            if value.get(key) is not None:
                date = bounded_text(value[key], key, 10)
                try:
                    dt.date.fromisoformat(date)
                except ValueError:
                    raise InputError(f"{key} must be YYYY-MM-DD") from None
                if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
                    raise InputError(f"{key} must be YYYY-MM-DD")
                result[key] = date
        if result.get("date_from", "") > result.get("date_to", "9999-12-31"):
            raise InputError("date_from must not be later than date_to")
        if "date_field" in value:
            if value["date_field"] not in {"published_at", "collected_at", "published_effective_at"}:
                raise InputError("date_field must be published_at, published_effective_at, or collected_at")
            result["date_field"] = value["date_field"]
        return result

    def detect_institutions(self, query: str) -> list[int]:
        matches = []
        for ktid, aliases in self.aliases.items():
            if any(_contains(query, alias) for alias in aliases) or _contains(query, str(ktid)):
                matches.append(ktid)
        return matches

    def _filter_sql(self, filters: dict, alias: str = "r") -> tuple[str, list]:
        clauses, params = [], []
        # Only static, validated column identifiers ever enter generated SQL.
        for key, column in [("institution", "ktid"), ("angle", "angle"), ("platform", "platform"), ("record_ids", "id")]:
            if key in filters:
                values = filters[key]
                clauses.append(f"{alias}.{column} IN ({','.join('?' for _ in values)})" if values else "0=1")
                params.extend(values)
        column = filters.get("date_field", "published_at")
        if "date_from" in filters:
            clauses.append(f"{alias}.{column} >= ?")
            start = dt.datetime.combine(dt.date.fromisoformat(filters["date_from"]), dt.time.min, BEIJING)
            params.append(start.astimezone(dt.timezone.utc).isoformat(timespec="seconds"))
        if "date_to" in filters:
            clauses.append(f"{alias}.{column} < ?")
            last = dt.date.fromisoformat(filters["date_to"])
            if last == dt.date.max:
                params.append("9999-12-31T23:59:59.999999Z")
            else:
                end = dt.datetime.combine(last + dt.timedelta(days=1), dt.time.min, BEIJING)
                params.append(end.astimezone(dt.timezone.utc).isoformat(timespec="seconds"))
        return " AND ".join(clauses) or "1=1", params

    def make_plan(self, query: str, filters: dict, expand: bool = True, extra_terms: list[str] | None = None) -> dict:
        effective = dict(filters)
        inferred = {}
        detected = self.detect_institutions(query)
        if detected and "institution" not in effective:
            effective["institution"] = detected
            inferred["institution"] = detected
        detected_angles = [a for alias, a in ANGLE_ALIASES.items() if alias in query]
        for name in ("news", "clue", "social"):
            if _contains(query, name):
                detected_angles.append(name)
        if detected_angles and "angle" not in effective:
            effective["angle"] = list(dict.fromkeys(detected_angles))
            inferred["angle"] = effective["angle"]
        intent = request_intent(query, enabled=expand)
        cleaned = normalize(intent["normalized_query"])
        for aliases in self.aliases.values():
            for alias in sorted(aliases, key=len, reverse=True):
                if _contains(cleaned, alias):
                    cleaned = re.sub(re.escape(normalize(alias)), " ", cleaned)
        for ktid in detected:
            cleaned = cleaned.replace(str(ktid), " ")
        for item in sorted(STOP_ZH, key=len, reverse=True):
            if len(item) > 1:
                cleaned = cleaned.replace(normalize(item), " ")
        groups = []
        used = []
        if expand:
            for synonyms in SYNONYMS:
                if any(_contains(cleaned, t) for t in synonyms):
                    groups.append(list(synonyms))
                    used.extend(synonyms)
                    for term in sorted(synonyms, key=len, reverse=True):
                        cleaned = re.sub(re.escape(normalize(term)), " ", cleaned)
        for word in WORD.findall(cleaned):
            if CHINESE.fullmatch(word):
                word = word.strip("的了吗呢有是与和在条那这请")
            if word in STOP_EN or len(word) < 2 or (CHINESE.fullmatch(word) and len(word) == 1):
                continue
            if word not in used:
                groups.append([word])
                used.append(word)
        if expand and extra_terms:
            # The model can add bounded literal search terms; it never supplies SQL or filters.
            for term in extra_terms[:6]:
                if isinstance(term, str) and 2 <= len(term.strip()) <= 60 and tokens(term) and not any(normalize(term) == normalize(t) for t in used):
                    if len(groups) < 12:
                        groups.append([term.strip()])
                        used.append(term.strip())
        groups = groups[:12]
        fuzzy = []
        if expand:
            for group in groups:
                if len(group) != 1 or not group[0].isascii() or not group[0].isalpha() or len(group[0]) < 4:
                    continue
                word = group[0]
                if word not in self.vocabulary:
                    candidates = difflib.get_close_matches(word, self.vocabulary, n=2, cutoff=0.83)
                    group.extend(candidates)
                    fuzzy.extend({"input": word, "term": candidate} for candidate in candidates)
        match_groups = ["(" + " OR ".join(phrase(t) for t in g if tokens(t)) + ")" for g in groups]
        match_groups = [g for g in match_groups if g != "()"]
        return {
            "query": query,
            "filters": effective,
            "inferred_filters": inferred,
            "locked_scope": effective,
            "terms": groups,
            "request_intent": intent,
            "expansion_enabled": expand,
            "fuzzy_terms": fuzzy,
            "match": " AND ".join(match_groups),
            "strategy": "fts5_and" if match_groups else "structured_filters",
        }

    def _aggregates(self, con, filters: dict, match: str = "") -> dict:
        where, params = self._filter_sql(filters)
        if match:
            where += " AND r.id IN (SELECT DISTINCT p.record_id FROM paragraph_fts JOIN paragraphs p ON p.pid=paragraph_fts.rowid WHERE paragraph_fts MATCH ?)"
            params.append(match)
        grouped = list(con.execute("SELECT r.angle,r.ktid,r.institution_cn,r.institution_en,r.platform,COUNT(*) AS n FROM records r WHERE " + where + " GROUP BY r.angle,r.ktid,r.platform ORDER BY n DESC", params))
        by_angle = {a: 0 for a in ("news", "clue", "social")}
        by_inst, by_platform = {}, {}
        for row in grouped:
            by_angle[row["angle"]] += row["n"]
            inst = by_inst.setdefault(row["ktid"], {"ktid": row["ktid"], "cn": row["institution_cn"], "en": row["institution_en"], "count": 0, "by_angle": {a: 0 for a in by_angle}})
            inst["count"] += row["n"]
            inst["by_angle"][row["angle"]] += row["n"]
            by_platform[row["platform"]] = by_platform.get(row["platform"], 0) + row["n"]
        return {"total": sum(by_angle.values()), "by_angle": by_angle,
                "by_institution": sorted(by_inst.values(), key=lambda i: (-i["count"], i["ktid"])),
                "by_platform": [{"platform": p, "count": n} for p, n in sorted(by_platform.items(), key=lambda i: (-i[1], i[0]))]}

    def status(self) -> dict:
        # A process serves one fixed snapshot; atomic replacement requires restart.
        with self.connect() as con:
            snapshot = json.loads(con.execute("SELECT value FROM metadata WHERE key='snapshot'").fetchone()[0])
            totals = self._aggregates(con, {})
        return {"database": "ready", "dataset": "real", "snapshot": snapshot, "aggregates": totals,
                "institutions": self.institutions, "capabilities": ["fts5", "bilingual_expansion", "literal_fuzzy", "paragraph_citations", "exact_counts", "readonly"]}

    def search(self, query: str, filters=None, expand: bool = True, limit: int = 12, extra_terms: list[str] | None = None, relax: bool = False, term_groups: list[list[str]] | None = None, record_ids: list[str] | None = None) -> dict:
        query = bounded_text(query, "query", 1200, allow_empty=True)
        filters = self.validate_filters(filters)
        if not isinstance(expand, bool):
            raise InputError("expand must be boolean")
        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 30:
            raise InputError("limit must be an integer between 1 and 30")
        if not isinstance(relax, bool):
            raise InputError("relax must be boolean")
        plan = self.make_plan(query, filters, expand, extra_terms)
        plan["relaxed"] = False
        plan["relax_allowed"] = relax and expand
        if term_groups is not None:
            # Internal planner output has already passed anchor and literal-term validation.
            plan["terms"] = term_groups
            plan["match"] = " AND ".join("(" + " OR ".join(phrase(t) for t in group) + ")" for group in term_groups)
            plan["strategy"] = "fts5_and" if term_groups else "structured_filters"
        effective = plan["filters"]
        if record_ids is not None:
            if not isinstance(record_ids, list) or len(record_ids) > 30 or any(not isinstance(rid, str) or not re.fullmatch(r"(?:news|clue|social)-[A-Za-z0-9_-]{1,100}", rid) for rid in record_ids):
                raise InputError("Invalid internal record scope")
            effective["record_ids"] = list(dict.fromkeys(record_ids))
        where, params = self._filter_sql(effective)
        match = plan.pop("match")
        terms = [t for group in plan["terms"] for t in group]
        with self.connect() as con:
            scoped = self._aggregates(con, effective)
            matched = self._aggregates(con, effective, match) if match else scoped
            # Relaxation is explicit in plan/scope, so a count never silently means a stricter query.
            if relax and expand and match and not matched["total"] and len(plan["terms"]) > 1:
                match = " OR ".join("(" + " OR ".join(phrase(t) for t in group) + ")" for group in plan["terms"])
                matched = self._aggregates(con, effective, match)
                plan["strategy"] = "fts5_or_relaxed"
                plan["relaxed"] = True
            if match:
                select = """SELECT p.*,r.ktid,r.institution_cn,r.institution_en,r.title,r.title_en,
                       r.platform,r.source_url,r.collected_at,r.published_at,r.source_version,
                       r.published_original,r.published_effective_at,r.date_origin,r.date_verified,r.date_basis_json,r.translation_status,
                       bm25(paragraph_fts, 1.0, 0.25) AS rank
                       FROM paragraph_fts JOIN paragraphs p ON p.pid=paragraph_fts.rowid
                       JOIN records r ON r.id=p.record_id
                       WHERE paragraph_fts MATCH ? AND """ + where
                rows = con.execute(select + " ORDER BY rank,p.pid LIMIT ?", [match, *params, max(120, limit * 10)]).fetchall()
                # BM25 language token lengths can bury available Chinese translations
                # under original-language chunks. Reserve matching translation candidates
                # without fabricating or translating any evidence.
                translated = con.execute(select + " AND p.field='translation' AND r.translation_status='available' ORDER BY rank,p.pid LIMIT ?",
                                         [match, *params, max(60, limit * 5)]).fetchall()
                rows = list({row["pid"]: row for row in [*rows, *translated]}.values())
            else:
                rows = con.execute("""SELECT p.*,r.ktid,r.institution_cn,r.institution_en,r.title,r.title_en,
                       r.platform,r.source_url,r.collected_at,r.published_at,r.source_version,0 AS rank
                       ,r.published_original,r.published_effective_at,r.date_origin,r.date_verified,r.date_basis_json,r.translation_status
                       FROM (SELECT * FROM records r WHERE """ + where + """ ORDER BY r.published_at DESC,r.collected_at DESC,r.id LIMIT ?) r
                       JOIN paragraphs p ON p.pid=(SELECT p2.pid FROM paragraphs p2 WHERE p2.record_id=r.id
                       ORDER BY CASE p2.field WHEN 'original_text' THEN 0 WHEN 'translation' THEN 1 WHEN 'summary' THEN 2 ELSE 3 END,p2.paragraph LIMIT 1)
                       ORDER BY r.published_at DESC,r.collected_at DESC,r.id""", [*params, limit]).fetchall()
            chosen, per_record = [], {}
            # Prefer complete body/translation evidence; then preserve relevance and diversity.
            def evidence_rank(row):
                body = row["field"] in {"original_text", "translation"}
                concepts = sum(any(_contains(row["text"], term) for term in group) for group in plan["terms"])
                return (not body, -concepts, row["field"] != "translation" or row["translation_status"] != "available", row["rank"])
            rows = sorted(rows, key=evidence_rank)
            for row in rows:
                if per_record.get(row["record_id"], 0) >= 2:
                    continue
                per_record[row["record_id"]] = per_record.get(row["record_id"], 0) + 1
                chosen.append(row)
                if len(chosen) >= limit:
                    break
        results = []
        for index, row in enumerate(chosen, 1):
            results.append({"citation_id": f"C{index}", "id": row["record_id"], "angle": row["angle"],
                            "paragraph": row["paragraph"], "field": row["field"], "paragraph_scheme": "service_field_chunks_v1", "paragraph_note": "1-based chunks across title, summary, original and translation fields; not evidence-page paragraph numbers", "snippet": snippet(row["text"], terms),
                            "source_url": row["source_url"], "title": row["title"], "title_en": row["title_en"],
                            "ktid": row["ktid"], "institution": row["institution_cn"], "institution_en": row["institution_en"],
                            "platform": row["platform"], "published_at": row["published_at"], "collected_at": row["collected_at"],
                            "source_version": row["source_version"],
                            "source_field": self.snapshot.get("field_map", {}).get(row["angle"], {}).get(
                                {"original_text": "original_body", "translation": "translated_body", "title_en": "original_title", "title": "translated_title" if row["angle"] == "news" else "original_title"}.get(row["field"], ""), row["field"]),
                            "published_original": row["published_original"], "published_effective_at": row["published_effective_at"],
                            "date_origin": row["date_origin"], "evidence_eligible": row["field"] != "translation" or row["translation_status"] == "available", "date_verified": bool(row["date_verified"]),
                            "date_basis": json.loads(row["date_basis_json"]), "translation_status": row["translation_status"]})
        return {"query": query, "plan": plan, "results": results, "state": "retrieval",
                "aggregates": {"scope": {"dataset": "real", "filters": effective, "source_version": self.snapshot["source_version"],
                                          "date_field": effective.get("date_field", "published_at"), "timezone": "Asia/Shanghai", "relaxed": plan["relaxed"], "term_match": plan["terms"], "strategy": plan["strategy"],
                                          "date_semantics": "Includes verified recovered dates; original values and recovery basis remain in citations" if effective.get("date_field") == "published_effective_at" else "Original source publication dates only; recovered dates do not change this scope" if effective.get("date_field", "published_at") == "published_at" else "Source collection/discovery timestamps; not publication dates"},
                               "scoped": scoped, "matched": matched},
                "coverage": {"dataset": "real", "source_version": self.snapshot["source_version"], "database_total": self.snapshot["total"],
                             "scoped_records": scoped["total"], "matched_records": matched["total"],
                             "returned_records": len({r["id"] for r in results}), "returned_paragraphs": len(results),
                             "exhaustive": len({r["id"] for r in results}) == matched["total"],
                             "warning": "Counts describe the stored real snapshot, not the entire web; retrieved paragraphs are a bounded sample."}}
