"""Bounded request grammar; substantive concepts, quotes and negatives stay visible."""
from __future__ import annotations

import calendar
import datetime as dt
import re
from zoneinfo import ZoneInfo

BEIJING = ZoneInfo("Asia/Shanghai")
FOLLOWUP = re.compile(
    r"^(?:那|它|他们|它们|这些|其中|还有|另外|再|继续|这批|这一批|这两家|这两所|这(?:条|份|篇|个|些)|该(?:条|份|篇)?(?:资料|记录|材料|文章|帖子|报告)|双方)"
    r"|\b(?:they|them|their|those|these|it|its|what about|and what|this (?:record|source|article|post)|same source)\b", re.I)
SAME_SOURCE = re.compile(r"同一(?:条|份|篇)?(?:来源|资料|记录|材料)|相同(?:来源|资料)|\bsame\s+(?:source|record|article|post)\b", re.I)
CITATION_START = re.compile(r"^(?:please\s+)?(?:并|且|同时|也请|请|继续|给出|提供|附上|标注|注明|引用|cite\b|quote\b|include\b|provide\b|and\b)", re.I)
CITATION_WORDS = re.compile(
    r"可核验|可验证|参考资料|参考文献|同一来源|相同来源|同一|相同|并且|并请|同时|继续|给出|提供|附上|列出|保留|标注|注明|展示|说明|引用|原文|来源|出处|参考|证据|链接|资料|真实|准确|相关|并|且|请|也|的|和|与|及"
    r"|\b(?:and|please|continue|to|cite|quote|include|provide|give|the|a|an|same|original|source|sources|citation|citations|reference|references|evidence|link|links|text)\b|\s+", re.I)
REFERENCE = re.compile(r"(?:这|那|该)(?:条|份|篇|个)?(?:资料|记录|材料|文章|帖子|来源|报告)(?:里面|之中|里|中|内)?")
RELATION = re.compile(r"对阵|迎战|对战|\b(?:versus|vs\.?|against)\b", re.I)
# Quotes and explicit exclusion operands are isolated before any request cleanup.
LITERALS = re.compile(r'(?<![\w.])-(?:"([^"\n]+)"|“([^”\n]+)”|([a-zA-Z0-9\u3400-\u9fff][^\s,，;；。！？?]*))|"([^"\n]+)"|“([^”\n]+)”|「([^」\n]+)」|"([^"\n]+)$')
ACTIONS = r"概括|总结|归纳|介绍|说明|检索|查找|搜索|查询|梳理|列出|回答|解释|看看|看一看|看下|看一下|找找|找一下|展示|查看|了解|分析|比较|对比|统计"
CHINESE_PREFIX = re.compile(
    r"^\s*(?:(?:并且|然后|同时|并|也)\s*)?(?:(?:请问|请你|请|帮我|给我|麻烦你|麻烦|能否|可否|可以|我想要|我想|我要|想要|想)\s*)*"
    r"(?:(?:简要|简单|详细|综合|全面|重点)\s*)?(?:" + ACTIONS + r")(?:一下|一下子)?\s*", re.I)
ENGLISH_PREFIX = re.compile(r"^(?:and\s+)?(?:please\s+)?(?:summari[sz]e|describe|explain|analy[sz]e|compare|find|show(?:\s+me)?|search(?:\s+for)?|tell\s+me\s+about|give\s+me(?:\s+(?:a\s+)?summary\s+of)?)\s+", re.I)
QUESTION_TAIL = re.compile(r"(?:是|为)?(?:怎么样|怎样|如何|什么|多少|有哪些|有什么)(?:的|呢|吗)?\s*$")
OUTPUT_FACET = re.compile(r"(?:的)?(?:有哪些|有什么|有何)?(?:各自|各|共同|不同|主要|核心|重点)?(?:主题有什么区别|主题有何异同|关注什么|关注哪些|关注|关注点|关注重点|议题分布|主要议题|议题|观点|主题|重点|异同|区别|差异|趋势|变化趋势|数量变化|分布)(?:有何|有哪些|是什么|如何|怎样|怎么样|情况)?(?:呢|吗)?\s*$")
OBJECT_TAIL = re.compile(r"(?:的)?(?:相关)?(?:报道|报告|文章|帖子|材料|资料|记录|信息|内容)(?:给我|我)?(?:看看|看下|看一下)?(?:有哪些|有什么|有吗|呢|吗)?\s*$")
REQUEST_MODIFIER = re.compile(r"(?:最相关|相关)(?:的)?|(?:^|\s)(?:的就是|就是|的)(?=\s|$)|(?:用中文|用英文|用表格|分点列出|列成表格|分点回答|简要回答|详细回答)")
# Whole output clauses only: there is no arbitrary entity/subject slot here.
# An extra unknown name, negative source qualifier or protected quote prevents
# a match, keeping that entire substantive clause in the query.
OUTPUT_LEAD = r"(?:(?:并且|并|且|同时|也请|请|继续)\s*)?"
# Follow-up browsing is a prefix operation; the remaining subject is retained.
CONVERSATION_VIEW = re.compile(r"^(?:(?:那|那么|然后|接着)\s*)?再(?:查看|看看|看一下|看)(?:一下)?\s*(?=\S)")
# Per-institution counts are removable only as complete finite clauses, so an
# unknown subject, negative qualifier or protected quote cannot disappear.
BOUNDED_COUNT_CLAUSE = re.compile(r"(?:各自|各|分别)(?:有)?(?:多少(?:条|篇|份)?|几(?:条|篇|份))(?:记录|资料|报道|帖子|文章)?")
BOUNDED_CITATION = re.compile(OUTPUT_LEAD + r"(?:(?:(?:分别|逐项|各|各自|每项)\s*)?(?:给出|提供|列出|附上|标注|注明|引用|展示)(?:各自|双方)?(?:的)?|(?:分别|逐项|各自|每项)(?:的)?)(?:来源|证据|出处|原文引用|原文出处|参考来源)(?:和(?:原文引用|证据|出处))?")
BOUNDED_COMPARISON = re.compile(OUTPUT_LEAD + r"(?:列出|说明|总结|归纳|展示|比较|对比)?(?:各自(?:的)?)?(?:异同|共同点和差异|相同点和不同点)(?:(?:和|与|及)(?:各自|双方)?(?:的)?(?:证据|来源|原文引用))?")
BOUNDED_SAMPLE = re.compile(OUTPUT_LEAD + r"(?:说明|注明|标明|提醒)?(?:(?:这|以上|以下|上述)(?:只是|仅是)|只是|仅是|仅为|只为|只基于|仅基于|只根据|仅根据)?(?:这些|这批|上述)?(?:资料|记录|证据)?(?:的)?样本(?:进行)?(?:分析|归纳|总结)|" + OUTPUT_LEAD + r"(?:请勿|不要|不应|不得|不能|不可)(?:将(?:样本|样本分析)(?:结果)?)?外推(?:到(?:总体|全库|全网)|至(?:总体|全库|全网)|为(?:总体结论|全库结论|全网结论))?")
# Numbered output requests such as 请用三点概括 are instructions, not topics.
# Removal is limited to unambiguous whole directives or an unambiguous adverbial
# prefix; a following noun (for example 列出三点说明) stays as search content.
NUMBERED_QUANTITY = r"(?:\d{1,2}|[一二两三四五六七八九十]{1,3})\s*(?:点|个要点|条要点|点内容|点结论)"
BOUNDED_NUMBERED_OUTPUT = re.compile(
    OUTPUT_LEAD
    + r"(?:(?:请|请你|帮我|麻烦|给我)\s*)?(?:用|分|按)\s*"
    + NUMBERED_QUANTITY
    + r"\s*(?:概括|总结|归纳|说明|列出|回答|呈现|写出)?\s*(?:一下|一下子)?"
    + r"|"
    + OUTPUT_LEAD
    + r"(?:(?:请|请你|帮我|麻烦|给我)\s*)?(?:给出|列出)\s*"
    + NUMBERED_QUANTITY
    + r"(?:\s*(?:结论|要点))?"
    + r"|"
    + OUTPUT_LEAD
    + r"(?:(?:请|请你|帮我|麻烦|给我)\s*)?(?:写成|写出|概括为|总结为)\s*"
    + NUMBERED_QUANTITY
)
# When a substantive subject follows, remove only the adverbial prefix.
BOUNDED_NUMBERED_PREFIX = re.compile(
    r"^(?:(?:请|请你|帮我|麻烦|给我)\s*)?(?:用|分|按)\s*"
    + NUMBERED_QUANTITY
    + r"\s*(?:概括|总结|归纳|说明|列出|回答|呈现|写出)\s*(?:一下|一下子)?\s*(?=\S)"
)
NUMBERED_QUANTITY_RE = re.compile(
    r"(\d{1,2}|[一二两三四五六七八九十]{1,3})\s*(?:点|个要点|条要点|点内容|点结论)"
)
CHINESE_POINT_VALUES = {"一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5}


def requested_point_count(text: str) -> int | None:
    """Return an explicit 1-5 point count; out-of-range or absent means unconstrained."""
    match = NUMBERED_QUANTITY_RE.search(text)
    if not match:
        return None
    raw = match.group(1)
    value = int(raw) if raw.isdigit() else CHINESE_POINT_VALUES.get(raw)
    return value if value is not None and 1 <= value <= 5 else None


def clock_now() -> dt.datetime:
    return dt.datetime.now(BEIJING)


def temporal_intent(text: str, now: dt.datetime | None = None):
    """Return a bounded calendar scope and text with only recognized dates removed."""
    now = now or clock_now()
    if now.tzinfo is None:
        now = now.replace(tzinfo=BEIJING)
    now = now.astimezone(BEIJING)
    today = now.date()
    scope = {"mode": "unrestricted", "timezone": "Asia/Shanghai", "as_of": now.isoformat(timespec="seconds"),
             "date_from": None, "date_to": None, "expressions": [], "basis": "actual_clock"}
    removed, spans = [], []

    def add(match, start, end, mode="explicit"):
        if any(match.start() < b and match.end() > a for a, b in spans):
            return
        if scope["expressions"] and (scope["date_from"], scope["date_to"]) != (start.isoformat(), end.isoformat()):
            scope["ambiguous"] = True
            return
        scope.update(mode=mode, date_from=start.isoformat(), date_to=end.isoformat())
        scope["expressions"].append(match.group())
        removed.append({"text": match.group(), "reason": "date_scope"})
        spans.append(match.span())

    day = r"(?<![a-zA-Z0-9])(?:\d{4}-\d{2}-\d{2}|\d{4}年\d{1,2}月\d{1,2}日?)"
    def parse_day(value):
        if "年" in value:
            parts = re.findall(r"\d+", value)
            return dt.date(*map(int, parts))
        return dt.date.fromisoformat(value)
    for match in re.finditer("(" + day + r")\s*(?:至|到|~|～|—|\bto\b)\s*(" + day + ")", text, re.I):
        start, end = map(parse_day, match.groups())
        if start > end:
            raise ValueError("date_from must not be later than date_to")
        add(match, start, end)
    for match in re.finditer(day, text):
        if not any(match.start() < b and match.end() > a for a, b in spans):
            date = parse_day(match.group())
            add(match, date, date)
    for match in re.finditer(r"(?<![a-zA-Z0-9])(?:(\d{4})年(\d{1,2})月(?:份)?|(\d{4})-(\d{2}))(?![-\d])", text):
        if any(match.start() < b and match.end() > a for a, b in spans):
            continue
        year, month = (int(match[1]), int(match[2])) if match[1] else (int(match[3]), int(match[4]))
        add(match, dt.date(year, month, 1), dt.date(year, month, calendar.monthrange(year, month)[1]))
    for match in re.finditer(r"(?:最近|过去|近)\s*(\d{1,5})\s*天|\b(?:last|past)\s+(\d{1,5})\s+days?\b", text, re.I):
        days = int(match[1] or match[2])
        if not 1 <= days <= 36600:
            raise ValueError("Relative date window must contain 1 to 36600 days")
        add(match, today - dt.timedelta(days=days - 1), today, "relative_window")
    relatives = {
        "今天": (today, today), "昨天": (today-dt.timedelta(days=1), today-dt.timedelta(days=1)),
        "近一周": (today-dt.timedelta(days=6), today), "最近一周": (today-dt.timedelta(days=6), today),
        "近一个月": (today-dt.timedelta(days=29), today), "最近一个月": (today-dt.timedelta(days=29), today),
        "本月": (today.replace(day=1), today), "这个月": (today.replace(day=1), today),
        "今年": (today.replace(month=1, day=1), today),
    }
    for match in re.finditer("|".join(sorted(relatives, key=len, reverse=True)), text):
        add(match, *relatives[match.group()], mode="relative_window")
    for match in re.finditer(r"近期|近日|最近|最新|近来|\b(?:recent|latest|recently)\b", text, re.I):
        if not any(match.start() < b and match.end() > a for a, b in spans):
            if scope["mode"] == "unrestricted":
                scope.update(mode="snapshot_recent", basis="snapshot_order")
            scope["expressions"].append(match.group())
            removed.append({"text": match.group(), "reason": "recent_order"})
            spans.append(match.span())
    for start, end in sorted(spans, reverse=True):
        text = text[:start] + " " + text[end:]
    if scope.get("ambiguous"):
        raise ValueError("Multiple different date scopes require explicit date_from/date_to filters")
    return text, scope, removed


def request_intent(query: str, enabled: bool = True, now: dt.datetime | None = None) -> dict:
    result = {"enabled": enabled, "normalized_query": query, "topics_query": query,
              "removed_request_phrases": [], "citation_requested": False, "requested_points": None,
              "same_source_requested": bool(SAME_SOURCE.search(query)),
              "referential": bool(FOLLOWUP.search(query) or REFERENCE.search(query)),
              "source_reference": bool(REFERENCE.search(query) or SAME_SOURCE.search(query)
                                       or re.search(r"\b(?:this|that)\s+(?:record|source|article|post|document)\b", query, re.I)),
              "requested_attributes": [], "task": "lookup", "kind": "lookup", "query_kind": "lookup", "topic": query, "dimensions": [],
              "requested_sort": None, "exact_phrases": [], "excluded_terms": [],
              "operations": {"count": False, "compare": False, "trend": False, "ranking": False, "share": False},
              "requires_history": False,
              "time_scope": {"mode": "unrestricted", "timezone": "Asia/Shanghai"}}
    if not enabled:
        return result
    protected = {}
    def protect(match):
        key = f"QQLITERAL{len(protected)}QQ"
        while key in query:
            key += "Q"
        excluded = next((v for v in match.groups()[:3] if v is not None), None)
        value = excluded if excluded is not None else next(v for v in match.groups()[3:] if v is not None)
        result["excluded_terms" if excluded is not None else "exact_phrases"].append(value)
        protected[key] = match.group()
        return " " + key + " "
    text = LITERALS.sub(protect, query)
    sort_request = re.search(r"按(?:相关度|相关性)|\b(?:sort|order)\s+by\s+relevance\b", text, re.I)
    if sort_request:
        result["requested_sort"] = "relevance"
        result["removed_request_phrases"].append({"text": sort_request.group(), "reason": "sort_order"})
        text = text[:sort_request.start()] + " " + text[sort_request.end():]
    # Abbreviation punctuation is part of the substantive bilateral relation.
    text = re.sub(r"\bU\.S\.[ -]*China\b", "US China", text, flags=re.I)
    greeting = re.match(r"^(?:你好|您好|嗨|哈喽|hello\b|hi\b|hey\b)(?=[，,\s]|(?:请|给我|帮我|我想|想|看看))", text, re.I)
    if greeting:
        result["removed_request_phrases"].append({"text": greeting.group(), "reason": "greeting"})
        text = text[greeting.end():]
    if re.search(r"比分|得分|\bscore\b", text, re.I):
        result["requested_attributes"].append("score")
    if re.search(r"结果|胜负|输赢|\b(?:result|outcome)\b", text, re.I):
        result["requested_attributes"].append("outcome")
    source_attribute = bool(result["requested_attributes"])
    share = re.search(r"(?:的)?占比(?:有|是)?(?:多少|几成|百分之几)?|(?:的)?比例(?:有|是)?(?:多少|几成|百分之几)|\b(?:percentage|proportion|share)\b", text, re.I)
    if share and not source_attribute:
        result["operations"]["share"] = True
        result["share_denominator"] = "matched_records_within_current_filters_and_terms"
        result["removed_request_phrases"].append({"text": share.group(), "reason": "aggregate_share"})
        text = text[:share.start()] + " " + text[share.end():]
    if re.search(r"比较|对比|异同|区别|差异|\bcompar(?:e|ison|ing)\b", text, re.I):
        result["task"] = "comparison"
    elif re.search(r"趋势|变化趋势|按月|每月|逐月|\b(?:trend|monthly)\b", text, re.I):
        result["task"] = "trend"
    elif re.search(r"分析|归纳|主要议题|关注点|\banaly[sz](?:e|is)\b", text, re.I):
        result["task"] = "analysis"
    elif re.search(r"几条|多少|数量|总数|总计|统计|\b(?:count|how many|number of)\b", text, re.I) and not result["requested_attributes"]:
        result["task"] = "count"
    for pattern, dimension in [(r"按机构|各机构|每个机构|各家机构|各家|\b(?:by|per) institution\b", "institution"),
                               (r"按角度|各角度|各类|\bby angle\b", "angle"),
                               (r"按平台|各平台|每个平台|\b(?:by|per) platform\b", "platform"),
                               (r"(?:按|和|与)?月份|按月|逐月|每月|月度|\b(?:monthly|by month)\b", "month")]:
        if re.search(pattern, text, re.I):
            result["dimensions"].append(dimension)
            def remove_dimension(match):
                result["removed_request_phrases"].append({"text": match.group(), "reason": "aggregate_dimension"})
                return " "
            text = re.sub(pattern, remove_dimension, text, flags=re.I)
    if result["operations"]["share"] and not source_attribute:
        result["task"] = "count"
    ranking_phrase = re.search(r"(?:记录|报道|资料|文章|帖子)?(?:数量)?(?:最多|最少)(?:的)?(?:机构|平台)", text)
    if ranking_phrase:
        dimension = "platform" if "平台" in ranking_phrase.group() else "institution"
        result["task"] = "count"
        result["operations"]["ranking"] = True
        result["ranking"] = "ascending" if "最少" in ranking_phrase.group() else "descending"
        result["ranking_dimension"] = dimension
        result["ranking_limit"] = 1
        if dimension not in result["dimensions"]:
            result["dimensions"].append(dimension)
        result["removed_request_phrases"].append({"text": ranking_phrase.group(), "reason": "aggregate_ranking"})
        text = text[:ranking_phrase.start()] + " " + text[ranking_phrase.end():]
    ranking = re.search(r"^(?:哪家|哪个机构|哪所机构|哪一个机构|哪个平台)(?=\S)", text)
    if ranking and re.search(r"(?:最多|最少|更多|更少)\s*$", text):
        result["task"] = "count"
        ranking_dimension = "platform" if "平台" in ranking.group() else "institution"
        if ranking_dimension not in result["dimensions"]:
            result["dimensions"].append(ranking_dimension)
        result["operations"]["ranking"] = True
        result["ranking_dimension"] = ranking_dimension
        result["ranking_limit"] = 1
        result["ranking"] = "ascending" if re.search(r"(?:最少|更少)\s*$", text) else "descending"
        result["removed_request_phrases"].append({"text": ranking.group(), "reason": "aggregate_dimension"})
        text = text[ranking.end():]
        text = re.sub(r"(?:最多|最少|更多|更少)\s*$", " ", text)
    count_followup = re.fullmatch(r"\s*(?:(?:这两家|这两所|这几家|这几个机构|它们|他们|两家)(?:各|分别)?(?:有|的)?(?:多少|几)(?:条|篇|份)?(?:记录|资料|报道)?|(?:各有多少条|各多少|各几条)|哪家(?:多|更多|少|更少)(?:一些|一点)?(?:[、,， ]+(?:各多少|各有多少|各几条))?)[？?]?\s*", text)
    if count_followup:
        result["task"] = "count"
        result["dimensions"] = ["institution"]
        result["referential"] = result["requires_history"] = True
        if re.search(r"哪家(?:多|更多|少|更少)", text):
            result["operations"]["ranking"] = True
            result["ranking_dimension"] = "institution"
            result["ranking_limit"] = 1
            result["ranking"] = "ascending" if "少" in text else "descending"
        result["removed_request_phrases"].append({"text": text, "reason": "aggregate_followup"})
        text = ""
    if result["task"] == "trend":
        text = re.sub(r"(?:看|查看|分析|观察)?(?:变化|趋势)(?:情况)?", " ", text)
    if result["task"] == "comparison" and not result["dimensions"]:
        result["dimensions"] = ["institution"]
    if result["task"] == "trend" and "month" not in result["dimensions"]:
        result["dimensions"].append("month")
    text, result["time_scope"], removed = temporal_intent(text, now)
    result["removed_request_phrases"].extend(removed)
    if result["time_scope"]["mode"] != "unrestricted" and result["requested_sort"] is None:
        result["requested_sort"] = "recent"
    if re.search(r"按(?:相关度|相关性)|\b(?:sort|order)\s+by\s+relevance\b", text, re.I):
        result["requested_sort"] = "relevance"
    # A terminal aggregate/analysis command is an operation, not a topic.
    terminal_clause = re.split(r"[，,；;、。.!！？?]+", text)[-1].strip()
    if not BOUNDED_SAMPLE.fullmatch(terminal_clause):
        text = re.sub(r"(?<![不未非无])(?:并且|并|然后|同时)?(?:统计|分析|比较|对比|总结|概括)\s*$", " ", text)
    # Split only at known request conjunctions, never across arbitrary subject slots.
    text = re.sub(r"(?<=\S)(?=(?:并且|然后|同时|并|帮我)(?:简要|详细)?(?:分析|比较|对比|总结|概括|梳理))", "，", text)
    clauses = re.split(r"[，,；;、。.!！？?]+|(?=\band\s+(?:please\s+)?(?:cite|quote|include|provide)\b)", text)
    kept = []
    for clause in clauses:
        clause = clause.strip()
        if not clause:
            continue
        if re.fullmatch(r"你好|您好|嗨|哈喽|hello|hi|hey", clause, re.I):
            result["removed_request_phrases"].append({"text": clause, "reason": "greeting"})
            continue
        if BOUNDED_COUNT_CLAUSE.fullmatch(clause):
            result["removed_request_phrases"].append({"text": clause, "reason": "aggregate_followup"})
            result["task"] = "count"
            result["referential"] = result["requires_history"] = True
            if "institution" not in result["dimensions"]:
                result["dimensions"].append("institution")
            continue
        view = CONVERSATION_VIEW.match(clause)
        if view:
            result["removed_request_phrases"].append({"text": view.group(), "reason": "conversation_view"})
            result["referential"] = result["requires_history"] = True
            clause = clause[view.end():]
        if BOUNDED_SAMPLE.fullmatch(clause):
            result["removed_request_phrases"].append({"text": clause, "reason": "sample_analysis_instruction"})
            result["sample_only_requested"] = True
            continue
        numbered = BOUNDED_NUMBERED_OUTPUT.fullmatch(clause)
        if numbered:
            result["removed_request_phrases"].append({"text": clause, "reason": "numbered_output_instruction"})
            points = requested_point_count(clause)
            if points is not None and result["requested_points"] is None:
                result["requested_points"] = points
            continue
        numbered_prefix = BOUNDED_NUMBERED_PREFIX.match(clause)
        if numbered_prefix:
            result["removed_request_phrases"].append({"text": numbered_prefix.group(), "reason": "numbered_output_instruction"})
            points = requested_point_count(numbered_prefix.group())
            if points is not None and result["requested_points"] is None:
                result["requested_points"] = points
            clause = clause[numbered_prefix.end():]
        if BOUNDED_COMPARISON.fullmatch(clause):
            result["removed_request_phrases"].append({"text": clause, "reason": "comparison_output_instruction"})
            if re.search(r"证据|来源|引用", clause):
                result["citation_requested"] = True
            continue
        if BOUNDED_CITATION.fullmatch(clause):
            result["removed_request_phrases"].append({"text": clause, "reason": "citation_instruction"})
            result["citation_requested"] = True
            continue
        if (CITATION_START.search(clause) and re.search(r"引用|出处|来源|证据|\b(?:cite|quote|source|citation|reference|evidence)\w*\b", clause, re.I)
                and not CITATION_WORDS.sub("", clause).strip()):
            result["removed_request_phrases"].append({"text": clause, "reason": "citation_instruction"})
            result["citation_requested"] = True
            continue
        hesitation = re.match(r"^(?:的就是|的就)(?=\S)", clause)
        if hesitation and result["time_scope"]["expressions"]:
            result["removed_request_phrases"].append({"text": hesitation.group(), "reason": "request_modifier"})
            clause = clause[hesitation.end():]
        batch = re.match(r"^(?:这批|这一批)(?:的)?(?=\S)", clause)
        if batch:
            result["removed_request_phrases"].append({"text": batch.group(), "reason": "conversation_reference"})
            clause = clause[batch.end():]
        patterns = [(CHINESE_PREFIX, "answer_directive"), (ENGLISH_PREFIX, "answer_directive"),
                    (REFERENCE, "conversation_reference"), (QUESTION_TAIL, "question_grammar"),
                    (RELATION, "entity_relation"), (REQUEST_MODIFIER, "request_modifier")]
        for pattern, reason in patterns:
            def remove(match):
                result["removed_request_phrases"].append({"text": match.group(), "reason": reason})
                return " "
            clause = pattern.sub(remove, clause).strip()
        hesitation = re.match(r"^(?:的就是|的就)(?=\S)", clause)
        if hesitation and result["time_scope"]["expressions"]:
            result["removed_request_phrases"].append({"text": hesitation.group(), "reason": "request_modifier"})
            clause = clause[hesitation.end():]
        plural_reference = re.match(r"^(?:这些|这批|这一批)(?:的)?(?=\S)", clause)
        if plural_reference:
            result["removed_request_phrases"].append({"text": plural_reference.group(), "reason": "conversation_reference"})
            result["referential"] = True
            clause = clause[plural_reference.end():]
        if result["task"] in {"analysis", "comparison", "trend", "count"}:
            match = OUTPUT_FACET.search(clause)
            if match:
                result["removed_request_phrases"].append({"text": match.group(), "reason": "analysis_output"})
                clause = clause[:match.start()].strip()
        english_object = re.search(r"\b(?:reports?|articles?|documents?|records?|posts?)(?:\s+(?:please|for me))?\s*$", clause, re.I)
        if english_object:
            result["removed_request_phrases"].append({"text": english_object.group(), "reason": "document_request"})
            clause = clause[:english_object.start()].strip()
        match = OBJECT_TAIL.search(clause)
        if match:
            result["removed_request_phrases"].append({"text": match.group(), "reason": "document_request"})
            clause = clause[:match.start()].strip()
        if result["referential"]:
            clause = re.sub(r"^\s*(?:里|中|内)?\s*双方", " ", clause).strip()
        if clause:
            kept.append(clause)
    normalized = " ".join(kept)
    # Topic-introduction prepositions have bounded grammatical positions.
    normalized = re.sub(r"^(?:对(?=中国)|(?:关于|有关)\s+)(?=\S)", "", normalized)
    for key, value in protected.items():
        normalized = normalized.replace(key, value)
    result["normalized_query"] = result["topics_query"] = result["topic"] = " ".join(normalized.split())
    result["kind"] = result["query_kind"] = result["task"]
    result["operations"]["count"] = result["task"] == "count"
    result["operations"]["compare"] = result["task"] == "comparison"
    result["operations"]["trend"] = result["task"] == "trend"
    return result
