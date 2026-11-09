from __future__ import annotations

import re
import time

from .llm import LLMClient, ModelUnavailable
from .analytics import build_analytics
from .retrieval import InputError, Retriever, SYNONYMS, bounded_text
from .planner import SearchEngine, is_count_query
from .intent import request_intent
from .research_chat import COMPARISON_COUNT, GREETING, INJECTION, balance_result, eligible, general_chat, generate, inherit_filters, kind_for, metadata, scope_text
from .text import normalize

UNSAFE_OUTPUT = re.compile(r"<\s*/?\s*[a-z!]|javascript\s*:|data\s*:\s*text/html|!\[|\]\s*\(|https?://|\b(?:curl|wget|bash|powershell|sudo)\s|忽略(?:此前|之前|上面|所有).*指令|ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions", re.I)
CITATION = re.compile(r"\[C(\d+)\]")
# A broad/opinion request is the only kind allowed to use a bounded sample
# when the literal database query has zero matches. Specific topics, dates,
# counts, comparisons, exclusions and unknown entities stay literal.
BROAD_SAMPLE = re.compile(
    r"你好|您好|嗨|哈喽|hello|hi|hey|心情|聊天|聊聊|随便|说说|讲讲|谈谈|看看|看下|看一下|"
    r"推荐|值得|概括|总结|介绍|概述|概览|喜欢|离谱|奇怪|有趣|有意思|印象|动态|热点|新鲜事|瓜|"
    r"什么|哪些|哪个|哪篇|哪几篇|谁|怎么|怎样|如何|为什么|为何|"
    r"最厉害|厉害|更强|谁更强|最好|最佳|最值得|最反华|反华|"
    r"干什么|做什么|发生什么|发生了什么|怎么样|"
    r"overview|highlights?|recommend|tell\s+me|what(?:'s| is)?|why|how",
    re.I,
)
BROAD_TERM = re.compile(
    r"你认为|你觉得|你看来|您认为|特点|值得|推荐|说说|讲讲|聊聊|谈谈|给我说|汇报|"
    r"印象|动态|看点|亮点|主要|近期|最近|最新|当前|现在|资料|报道|信息|内容|"
    r"关注|什么|哪些|哪个|哪篇|哪几篇|最好|最佳|最值得|有意思|有趣|精彩|突出|亮眼|好看|"
    r"一下|看看|告诉|介绍|概述|概览|overview|highlight|recommend|"
    r"tell\s+me|what(?:'s| is)\s+worth",
    re.I,
)
BROAD_TOPIC = re.compile(
    r"中国|China|Chinese|PRC|对华|涉华|中美|美中|美国|U\.S\.|United\s+States|America",
    re.I,
)
CHAT_FILLER = re.compile(
    r"数据库|资料库|资料|记录|报道|信息|内容|东西|文章|报告|汇报|新闻|机构|单位|组织|整个|全部|所有|"
    r"这些|那些|这个|那个|一句话|三篇|几篇|一条|一篇|一个|如果|让|选|哪|谁|什么|怎么|怎样|如何|为什么|为何|"
    r"干|做|发生|看到过|看到|看过|随便|跟|和|与|在|最近|当前|现在|今天|心情|聊天|聊聊|说说|讲讲|谈谈|看看|看下|看一下|"
    r"喜欢|最|厉害|强|更|离谱|奇怪|有趣|有意思|印象|动态|热点|新鲜事|瓜|概括|总结|介绍|概述|概览|推荐|值得|"
    r"(?:资料|记录|数据库|内容|信息|东西|文章|报告|机构|单位|组织)(?:里|中)|"
    r"活动|项目|研究|工作|情况|方面|相关|有关|一下|我|你|您|的|了|过|吗|呢|啊|吧|呀|哦|嘛|呗|啦|请|帮|给我|"
    r"看|会|说|认为|觉得|家|编",
    re.I,
)
SAMPLE_FILLER = re.compile(
    r"给我|说说|讲讲|聊聊|谈谈|看看|我看(?:一下|下)?|我看看|看下|看一下|我想看|给我看|让我看|告诉|你|您|我|的|吧|呢|吗|啊|一下|一点|一些|几篇|几|篇|关于|"
    r"什么|哪些|哪个|哪篇|哪几篇|请|帮|想要|可以|能否|主要|近期|最近|最新|当前|现在|资料|报道|信息|内容|"
    r"关注|特点|值得|推荐|汇报|印象|动态|看点|亮点|最好|最佳|最值得|有意思|有趣|精彩|突出|亮眼|好看|"
    r"概述|概览|about|me|tell|"
    r"overview|highlight|recommend|worth|what|is|most|notable|interesting|memorable|"
    r"reports?|articles?|posts?|records?|documents?|items?|stories?|coverage|news|data|database|"
    r"few|some|any|reading|read|please|thanks|thank|"
    r"谢谢|多谢|感谢|非常|特别|比较|最|很|较|更",
    re.I,
)
SAMPLE_NEGATION = re.compile(
    r"(?:不|未|非|无)(?:是|要|含|包括|包含|涉及|关于|支持|赞成|关心|提到|找到|存在)|"
    r"排除|不含|不包括|没有(?:找到|提到|涉及|包含)|不要|"
    r"(?<![A-Za-z])(?:not|without|exclude|except|no)\s",
    re.I,
)
SAMPLE_UNSAFE = re.compile(
    r"\b(?:select|insert|update|delete|drop|alter|create|truncate|union|exec|execute)\b|"
    r"--|/\*|\*/|(?:'|\")\s*(?:or|and)\s+\d+\s*=\s*\d+",
    re.I,
)
# Strict excerpt fallback is only for broad chat/opinion/report requests.
# It must never turn creative, predictive, sensitive, comparative, counting
# or policy-advocacy requests into a patchwork of unrelated source lines.
STRICT_EXCERPT_EXCLUDE = re.compile(
    r"编(?:一个|个|写|造)|笑话|写一?首|诗|故事|小说|段子|"
    r"预测|预言|明天|下周|未来|会涨|会跌|涨停|跌停|股市|股价|上证|指数|汇率|"
    r"反华|台湾问题|香港问题|新疆问题|西藏问题|天安门|六四|"
    r"比较|对比|异同|更强|谁更强|区别|"
    r"外星人|ufo",
    re.I,
)
RELAX_FILLER = re.compile(
    r"你好|您好|嗨|哈喽|hello|hi|hey|请|麻烦|帮我|给我|让我|我想|我要|"
    r"看看|看一下|看下|瞧瞧|说说|讲讲|聊聊|谈谈|告诉|你们|我们|你|您|我|的|了|"
    r"吗|呢|啊|吧|呀|哦|嘛|呗|啦|一下|一点|一些|最近|最新|近期|现在|今天|当前|目前|"
    r"有什么|哪些|什么|怎么|怎样|如何|为什么|为何|这些|那些|这个|那个|"
    r"能|可以|能否|是否|谢谢|多谢|感谢|如果|让|选|会|敢|想|要|看到过|看到|看过|见过|找过|关于|对于|针对|哪|"
    r"资料|数据库|记录|信息|内容|东西|文章|报告|认为|觉得|看法|感觉|看起来|"
    r"最好|最值得|值得|离谱|奇怪|有趣|有意思|喜欢|热点|动态|新鲜事|瓜|心情|感受|特点|"
    r"随便|跟|里|最|一条|一篇|一份|几篇|几|篇|整个|一句|句话|概括|总结|介绍|概述|推荐",
    re.I,
)
GENERAL_CHAT_UNSAFE = re.compile(
    r"密码|password|passwd|凭据|credential|api.?key|密钥|secret|token",
    re.I,
)
SUBJECTIVE_RANK = re.compile(
    r"谁更强|谁更厉害|哪家更强|哪家更厉害|谁最厉害|哪家最厉害|哪个更强|哪个更好|谁更好|哪家好|谁厉害",
    re.I,
)
RELAX_MAX_CANDIDATES = 36
CHAT_GREETING = re.compile(
    r"^(?:你好|您好|嗨|哈[啰喽]|hello|hi|hey|早上好|下午好|晚上好)[呀啊哦嘛]?[！!。.,，\s]*"
    r"(?:(?:今天|最近|现在)\s*)?(?:心情|感觉|怎么样|好吗|在吗|忙吗|聊聊天|随便聊聊|聊聊|说说)"
    r"[^。！？!?]*[。！？!?]?$",
    re.I,
)
SAMPLE_LIMIT = 12
SAMPLE_MIN_RECORDS = 8
SAMPLE_PER_ANGLE = 4
SAMPLE_SCOPE_KEYS = ("institution", "angle", "platform", "date_field")


def validate_history(history) -> list[dict]:
    if history is None:
        return []
    if not isinstance(history, list) or len(history) > 8:
        raise InputError("history must contain at most 8 messages")
    result = []
    length = 0
    for entry in history:
        if not isinstance(entry, dict) or set(entry) - {"role", "content"} or entry.get("role") not in {"user", "assistant"}:
            raise InputError("history permits only role/content user and assistant messages")
        content = bounded_text(entry.get("content"), "history content", 4000)
        length += len(content)
        if length > 12000:
            raise InputError("Combined history must not exceed 12000 characters")
        result.append({"role": entry["role"], "content": content})
    return result


class Chat:
    def __init__(self, retriever: Retriever, llm: LLMClient, timeout: float = 95):
        self.retriever, self.llm = retriever, llm
        self.timeout = min(float(timeout), 95.0)
        self.search_engine = SearchEngine(retriever, llm)

    def context_query(self, message: str, history: list[dict], filters: dict) -> str:
        if not history:
            return message
        # Rebuild structured context from every bounded USER turn. Last explicit
        # mention wins per axis; assistant text never establishes facts or scope.
        users = [entry["content"] for entry in history if entry["role"] == "user"]
        inherited, topic, temporal = {}, "", []
        comparison_count = bool(COMPARISON_COUNT.fullmatch(message))
        for index, text in enumerate([*users, message]):
            if index == len(users) and comparison_count:
                continue
            if INJECTION.search(text):
                continue
            plan = self.retriever.make_plan(text, {})
            if plan.get("time_scope", {}).get("expressions"):
                temporal = plan["time_scope"]["expressions"]
            for key, value in plan["inferred_filters"].items():
                inherited[key] = value
            groups = [group for group in plan["terms"] if group[0] not in {"那", "这", "它", "他们", "它们", "这些", "那些", "还有", "另外", "继续"}]
            concepts = [('"' + group[0] + '"') if group[0] in plan.get("exact_phrases", []) else group[0] for group in groups]
            concepts.extend('-"' + term + '"' for term in plan.get("excluded_terms", []))
            if concepts:
                if not topic or not plan["request_intent"]["referential"]:
                    topic = " ".join(concepts)
                else:
                    topic = " ".join(dict.fromkeys([topic, *concepts]))
        current = self.retriever.make_plan(message, filters)
        pieces = []
        for ktid in inherited.get("institution", []):
            if "institution" not in filters and "institution" not in current["inferred_filters"]:
                pieces.append(self.retriever.aliases[ktid][0])
        if "angle" not in filters and "angle" not in current["inferred_filters"]:
            pieces.extend(inherited.get("angle", []))
        if topic and (comparison_count or current["request_intent"]["referential"] or not current["terms"]):
            pieces.append(topic[:500])
        if not comparison_count:
            pieces.append(current["request_intent"]["normalized_query"])
        current_temporal = current.get("time_scope", {}).get("expressions", [])
        if current_temporal:
            pieces.extend(current_temporal)
        elif temporal and current["request_intent"].get("requested_sort") != "relevance" and (comparison_count or current["request_intent"]["referential"] or not current["terms"]):
            pieces.extend(temporal)
        return " ".join(pieces)[:1200] or message

    def _has_unknown_entity(self, plan: dict) -> bool:
        known = {normalize(alias) for aliases in self.retriever.aliases.values() for alias in aliases}
        known.update(normalize(word) for word in self.retriever.vocabulary)
        known.update(normalize(term) for synonyms in SYNONYMS for term in synonyms)
        for group in plan.get("terms", []):
            for term in group:
                value = normalize(term)
                if (re.fullmatch(r"[a-z][a-z0-9_-]{3,}", value) and value not in known
                        and (any(ch.isdigit() for ch in value) or len(value) >= 12)):
                    return True
        return False

    def _has_specific_topic(self, plan: dict) -> bool:
        # Broad/opinion words do not become a license to sample around a
        # concrete topic. Strip request grammar, then require no substantive
        # residual Chinese or Latin term in any actual concept group.
        for group in plan.get("terms", []):
            if not group or not isinstance(group[0], str):
                return True
            residue = SAMPLE_FILLER.sub(" ", BROAD_TERM.sub(" ", group[0]))
            residue = CHAT_FILLER.sub(" ", residue)
            residue = BROAD_TOPIC.sub(" ", residue)
            if re.search(r"[\u3400-\u9fff]{2,}|[A-Za-z]{3,}|[A-Za-z]*\d[A-Za-z0-9]*", residue):
                return True
        return False

    def sampling_allowed(self, message: str, result: dict, expand: bool, count_requested: bool,
                         source_attribute: bool, source_ids) -> bool:
        if not expand or source_ids is not None or count_requested or source_attribute:
            return False
        if result["results"] or result["aggregates"]["matched"]["total"]:
            return False
        if not BROAD_SAMPLE.search(message):
            return False
        if INJECTION.search(message) or SAMPLE_UNSAFE.search(message):
            return False
        plan = result["plan"]
        if plan.get("exact_phrases") or plan.get("excluded_terms"):
            return False
        if any(plan.get("filters", {}).get(key) for key in ("date_from", "date_to")):
            return False
        if re.search(r"[\"“”「」『』]", message) or re.search(r"[;\t\n\r]", message):
            return False
        if re.search(r"(?:^|\s)[A-Za-z0-9_-]+(?:\s*,\s*[A-Za-z0-9_-]+)+", message):
            return False
        intent = plan.get("intent", plan.get("request_intent", {}))
        operations = intent.get("operations", {}) if isinstance(intent, dict) else {}
        if any(operations.get(key) for key in ("count", "compare", "ranking", "share")):
            return False
        if kind_for(message, result) in {"comparison", "count"}:
            return False
        if re.search(r"比较|对比|异同|排名|排行|占比|多少|几条|统计|趋势|按月|每月|哪家|谁(?:更|最)?多|最多|最少|比分|得分|胜负", message):
            return False
        if SAMPLE_NEGATION.search(message):
            return False
        if self._has_unknown_entity(plan) or self._has_specific_topic(plan):
            return False
        return True

    def strict_excerpt_allowed(self, message: str, result: dict, expand: bool) -> bool:
        # A broad chat/report turn may quote exact source excerpts even when the
        # first model pass could not produce a reviewed paraphrase. This is not
        # a license to answer creative, predictive, sensitive or comparative
        # questions, nor to bypass dates, counts or exclusions.
        if not expand or not result.get("results"):
            return False
        if not (BROAD_SAMPLE.search(message) or result.get("relaxed_topic_match")):
            return False
        if INJECTION.search(message) or SAMPLE_UNSAFE.search(message) or STRICT_EXCERPT_EXCLUDE.search(message):
            return False
        plan = result["plan"]
        if plan.get("exact_phrases") or plan.get("excluded_terms"):
            return False
        if any(plan.get("filters", {}).get(key) for key in ("date_from", "date_to")):
            return False
        if re.search(r"[\"“”「」『』]", message) or re.search(r"[;\t\n\r]", message):
            return False
        if re.search(r"(?:^|\s)[A-Za-z0-9_-]+(?:\s*,\s*[A-Za-z0-9_-]+)+", message):
            return False
        if re.search(r"多少|几条|几个|几篇|统计|数量|总数|占比|趋势|按月|每月|谁(?:更|最)?多|最多|最少|比分|得分|胜负", message):
            return False
        intent = plan.get("intent", plan.get("request_intent", {}))
        operations = intent.get("operations", {}) if isinstance(intent, dict) else {}
        if any(operations.get(key) for key in ("count", "compare", "ranking", "share")):
            return False
        if kind_for(message, result) in {"comparison", "count"}:
            return False
        if SAMPLE_NEGATION.search(message):
            return False
        if self._has_unknown_entity(plan):
            return False
        return True

    def relaxed_topic_candidates(self, message: str) -> list[str]:
        cleaned = RELAX_FILLER.sub(" ", message)
        cleaned = re.sub(r"[^\u3400-\u9fffA-Za-z0-9_-]+", " ", cleaned)
        candidates, order = [], {}
        def add(value: str) -> None:
            value = value.strip()
            if len(value) < 2 or value.isdigit() or value in order:
                return
            order[value] = len(order)
            candidates.append(value)
        for run in re.findall(r"[\u3400-\u9fff]+", cleaned):
            for size in range(min(6, len(run)), 1, -1):
                add(run[:size])
                if size < len(run):
                    add(run[-size:])
        for token in re.findall(r"[A-Za-z][A-Za-z0-9_-]{1,11}", cleaned):
            add(token)
        candidates = [value for value in candidates if not RELAX_FILLER.fullmatch(value)]
        candidates.sort(key=lambda value: (-len(value),
                                           self.retriever.vocabulary.get(normalize(value), 10 ** 9),
                                           order[value]))
        return candidates[:RELAX_MAX_CANDIDATES]

    def relaxed_topic_search(self, message: str, filters: dict, expand: bool):
        candidates = self.relaxed_topic_candidates(message)
        for size in sorted({len(value) for value in candidates}, reverse=True):
            best = None
            for candidate in (value for value in candidates if len(value) == size):
                try:
                    result = self.retriever.search(candidate, filters, expand=expand, limit=12)
                except InputError:
                    continue
                if not result["results"]:
                    continue
                matched = result["aggregates"]["matched"]["total"]
                if best is None or matched < best[2]:
                    best = (candidate, result, matched)
            if best is not None:
                return best[0], best[1]
        return None, None

    def relaxed_topic_allowed(self, message: str, result: dict, expand: bool,
                              count_requested: bool, source_ids) -> bool:
        if not expand or result["results"] or count_requested or source_ids is not None:
            return False
        if INJECTION.search(message) or SAMPLE_UNSAFE.search(message) or GENERAL_CHAT_UNSAFE.search(message):
            return False
        plan = result["plan"]
        if plan.get("exact_phrases") or plan.get("excluded_terms"):
            return False
        if any(plan.get("filters", {}).get(key) for key in ("date_from", "date_to")):
            return False
        if re.search(r"[\"“”「」『』]", message) or re.search(r"[;\t\n\r]", message):
            return False
        if re.search(r"(?:^|\s)[A-Za-z0-9_-]+(?:\s*,\s*[A-Za-z0-9_-]+)+", message):
            return False
        if STRICT_EXCERPT_EXCLUDE.search(message) or re.search(r"排名|排行|榜单|最厉害|最强|谁更|哪家最", message):
            return False
        intent = plan.get("intent", plan.get("request_intent", {}))
        operations = intent.get("operations", {}) if isinstance(intent, dict) else {}
        if any(operations.get(key) for key in ("count", "compare", "ranking", "share")):
            return False
        if kind_for(message, result) in {"comparison", "count"}:
            return False
        if SAMPLE_NEGATION.search(message):
            return False
        if self._has_unknown_entity(plan):
            return False
        return bool(self.relaxed_topic_candidates(message))

    def general_chat_allowed(self, message: str, result: dict, expand: bool,
                             count_requested: bool, source_ids, source_basis=None) -> bool:
        if not expand or result["results"] or count_requested:
            return False
        if INJECTION.search(message) or SAMPLE_UNSAFE.search(message) or GENERAL_CHAT_UNSAFE.search(message):
            return False
        if source_basis in {"missing_topic", "previous_source_missing", "previous_source_ambiguous"}:
            return False
        if source_ids not in (None, []):
            return False
        plan = result["plan"]
        if plan.get("exact_phrases") or plan.get("excluded_terms"):
            return False
        if re.search(r"(?:^|\s)[A-Za-z0-9_-]+(?:\s*,\s*[A-Za-z0-9_-]+)+", message):
            return False
        message_intent = request_intent(message, enabled=expand)
        if message_intent.get("citation_requested") or message_intent.get("source_reference"):
            return False
        intent = plan.get("intent", plan.get("request_intent", {}))
        operations = intent.get("operations", {}) if isinstance(intent, dict) else {}
        if operations.get("count"):
            return False
        # A subjective "who is stronger" opinion is ordinary conversation when
        # no evidence matched. Evidence comparisons and exact counts still use
        # the deterministic database path.
        subjective_rank = bool(SUBJECTIVE_RANK.search(message))
        if (operations.get("compare") or operations.get("ranking") or operations.get("share")) and not subjective_rank:
            return False
        kind = kind_for(message, result)
        if kind == "count" or (kind == "comparison" and not subjective_rank):
            return False
        return True

    def adopt_relaxed_result(self, original: dict, relaxed: dict, query: str, candidate: str) -> dict:
        conversation = original["plan"].get("conversation")
        steps = list(original["plan"].get("tool_steps", []))
        relaxed["query"] = query
        relaxed["plan"]["conversation"] = conversation
        relaxed["plan"]["relaxed_query"] = candidate
        relaxed["plan"]["relaxed_topic_match"] = True
        relaxed["plan"]["tool_steps"] = steps + [{
            "tool": "database_relaxed_topic_search", "term": candidate,
            "matched_records": relaxed["aggregates"]["matched"]["total"],
            "returned_paragraphs": len(relaxed["results"]),
        }]
        relaxed["plan"]["model"] = original["plan"].get("model", {})
        relaxed["model"] = original.get("model", {"id": self.llm.model, "used": False,
                                                  "attempted": False, "reason": "relaxed_topic_lookup"})
        relaxed["usage"] = dict(original.get("usage", {}))
        relaxed["relaxed_topic_match"] = True
        relaxed["relaxed_topic_term"] = candidate
        relaxed["coverage"].update(original_matched_records=0, relaxed_topic_match=True,
                                   relaxed_topic_term=candidate)
        relaxed["aggregates"]["scope"].update(relaxed_topic_match=True, relaxed_topic_term=candidate,
                                              original_matched_records=0)
        if conversation:
            conversation = dict(conversation)
            conversation["relaxed_topic"] = {"term": candidate, "original_matched_records": 0}
            relaxed["plan"]["conversation"] = conversation
        return relaxed

    @staticmethod
    def diverse_sample(citations: list[dict], limit: int) -> list[dict]:
        groups, seen = {}, set()
        for citation in citations:
            if citation["id"] in seen:
                continue
            seen.add(citation["id"])
            groups.setdefault((citation.get("angle"), citation.get("ktid")), []).append(citation)
        chosen = []
        while groups and len(chosen) < limit:
            for key in list(groups):
                chosen.append(groups[key].pop(0))
                if not groups[key]:
                    del groups[key]
                if len(chosen) >= limit:
                    break
        return chosen

    def sample_scope(self, result: dict, expand: bool) -> dict | None:
        filters = {key: value for key, value in result["plan"]["filters"].items() if key in SAMPLE_SCOPE_KEYS}
        # A broad country/topic qualifier (for example 中国) is part of the
        # current scope; sample within that topic instead of across the whole DB.
        topic_query = ""
        for group in result["plan"].get("terms", []):
            term = group[0].strip() if group and isinstance(group[0], str) else ""
            if term and BROAD_TOPIC.fullmatch(term):
                topic_query = term
                break
        batches = []
        if filters.get("angle"):
            batches.append(self.retriever.search(topic_query, filters, expand=expand, limit=SAMPLE_LIMIT))
        else:
            for angle in ("news", "clue", "social"):
                batches.append(self.retriever.search(topic_query, {**filters, "angle": [angle]},
                                                     expand=expand, limit=SAMPLE_PER_ANGLE))
        selected, seen = [], set()
        for batch in batches:
            for citation in batch["results"]:
                if citation["id"] in seen or not eligible(citation):
                    continue
                seen.add(citation["id"])
                selected.append(citation)
        if len(selected) < SAMPLE_LIMIT:
            fill = self.retriever.search(topic_query, filters, expand=expand, limit=SAMPLE_LIMIT)
            for citation in fill["results"]:
                if len(selected) >= SAMPLE_LIMIT:
                    break
                if citation["id"] in seen or not eligible(citation):
                    continue
                seen.add(citation["id"])
                selected.append(citation)
        selected = self.diverse_sample(selected, SAMPLE_LIMIT)
        if len(selected) < SAMPLE_MIN_RECORDS:
            return None
        for index, citation in enumerate(selected, 1):
            citation["citation_id"] = f"C{index}"
        result["results"] = selected
        date_field = result["plan"]["filters"].get("date_field", "published_at")
        sample_dates = [citation.get(date_field) for citation in selected if citation.get(date_field)]
        result["coverage"].update(
            returned_records=len(selected), returned_paragraphs=len(selected),
            sample_fallback=True, sample_records=len(selected), literal_matched_records=0,
            exhaustive=False, sample_basis="representative_records_within_current_filters",
            latest_returned_date=max(sample_dates) if sample_dates else None,
            earliest_returned_date=min(sample_dates) if sample_dates else None,
        )
        by_angle = {angle: sum(1 for citation in selected if citation.get("angle") == angle)
                    for angle in ("news", "clue", "social")}
        result["plan"].setdefault("tool_steps", []).append(
            {"tool": "database_sample", "purpose": "bounded_representative_sample_within_current_scope",
             "filters": filters, "topic_query": topic_query, "records": len(selected), "paragraphs": len(selected),
             "by_angle": by_angle, "literal_matched_records": 0, "exhaustive": False})
        return {"sample_fallback": True, "sample_records": len(selected), "literal_matched_records": 0,
                "exhaustive": False, "basis": "representative_records_within_current_filters", "by_angle": by_angle}

    def conversation_source(self, message: str, history: list[dict], query: str, filters: dict):
        if not request_intent(message)["source_reference"]:
            return None, None
        locked = self.retriever.make_plan(query, filters)["filters"]
        users = [entry["content"] for entry in history if entry["role"] == "user"]
        for earlier in reversed(users):
            plan = self.retriever.make_plan(earlier, locked)
            if INJECTION.search(earlier):
                continue
            if plan["terms"] and not plan["request_intent"]["referential"]:
                previous = self.retriever.search(earlier, locked)
                ids = list(dict.fromkeys(c["id"] for c in previous["results"]))
                if previous["coverage"]["matched_records"] == 1 and len(ids) == 1:
                    return ids, "unique_previous_user_query_match"
                return [], "previous_source_ambiguous" if ids else "previous_source_missing"
        return [], "previous_source_missing"

    def database_answer(self, message: str, result: dict) -> str:
        scoped, matched = result["aggregates"]["scoped"], result["aggregates"]["matched"]
        is_terms = bool(result["plan"]["terms"])
        value = matched if is_terms else scoped
        scope = result["aggregates"]["scope"]
        filters = scope["filters"]
        names = [item["cn"] for item in self.retriever.institutions if item["ktid"] in filters.get("institution", [])]
        label = "、".join(names) if names else "真实数据库"
        if filters.get("angle"):
            label += "；角度=" + ", ".join(filters["angle"])
        if filters.get("platform"):
            label += "；平台=" + ", ".join(filters["platform"])
        if filters.get("date_from") or filters.get("date_to"):
            label += f"；{scope['date_field']}={filters.get('date_from', '不限')} 至 {filters.get('date_to', '不限')}"
        if is_terms:
            label += "；按返回 plan 的关键词规则命中"
        counts = value["by_angle"]
        answer = f"数据库精确统计：{label}共 {value['total']:,} 条，其中新闻舆情 {counts['news']:,} 条、官网线索 {counts['clue']:,} 条、社交媒体 {counts['social']:,} 条。[A1]"
        if is_terms:
            answer += f"\n相同结构化筛选范围共有 {scoped['total']:,} 条；关键词命中数按记录去重，未以展示段落数量估算。[A1]"
        if len(filters.get("institution", [])) > 1 or re.search(r"各机构|每个机构|按机构|哪家|各多少|分别多少|by institution|per institution", message, re.I):
            counts_by_id = {item["ktid"]: item for item in value["by_institution"]}
            institutions = [item for item in self.retriever.institutions if item["ktid"] in filters.get("institution", [])] or value["by_institution"]
            if institutions:
                answer += "\n" + "；".join(f"{item['cn']} {counts_by_id.get(item['ktid'], {}).get('count', 0):,} 条" for item in institutions) + "。[A1]"
        if not result.get("analytics", {}).get("ranking") and re.search(r"哪家|谁(?:更|最)?多|最多|which.*(?:more|most)", message, re.I) and value["by_institution"]:
            maximum = max(item["count"] for item in value["by_institution"])
            leaders = "、".join(item["cn"] for item in value["by_institution"] if item["count"] == maximum)
            answer += f"\n在上述相同筛选与关键词口径下，{leaders}的记录数最多，为 {maximum:,} 条；这只是入库资料数量比较。[A1]"
        if re.search(r"各平台|每个平台|按平台|by platform|per platform", message, re.I):
            answer += "\n" + "；".join(f"{i['platform'] or '未标注'} {i['count']:,} 条" for i in value["by_platform"]) + "。[A1]"
        analytics = result.get("analytics", {})
        intent = result["plan"].get("intent", result["plan"].get("request_intent", {}))
        ranking = analytics.get("ranking")
        if ranking:
            dimension = ranking["dimension"]
            label = "平台" if dimension == "platform" else "机构"
            entries = ranking["entries"]
            if entries:
                names = "、".join((entry.get("platform") or "未标注") if dimension == "platform" else entry["cn"] for entry in entries)
                direction = "最少" if ranking["order"] == "ascending" else "最多"
                tied = "（并列）" if len(entries) > 1 else ""
                answer += f"\n同一筛选与关键词口径下，记录数{direction}的{label}是{names}{tied}，各 {entries[0]['count']:,} 条；仅比较入库资料数量。[A2]"
            else:
                answer += f"\n当前命中范围没有可供{label}排名的记录。[A2]"
        if intent.get("operations", {}).get("share"):
            shares = analytics.get("shares", {})
            denominator = shares.get("denominator", value["total"])
            answer += f"\n占比分母：相同机构、角度、平台、日期及关键词规则命中的全部 {denominator:,} 条去重记录。[A2]"
            dimensions = intent.get("dimensions") or ["angle"]
            institution_names = {entry["ktid"]: entry["cn"] for entry in value["by_institution"]}
            for dimension in dimensions:
                if dimension not in {"institution", "angle", "platform"}:
                    continue
                parts = []
                for entry in shares.get("by_" + dimension, []):
                    if dimension == "institution":
                        name = institution_names.get(entry["ktid"], str(entry["ktid"]))
                    elif dimension == "angle":
                        name = {"news": "新闻舆情", "clue": "官网线索", "social": "社交媒体"}.get(entry["angle"], entry["angle"])
                    else:
                        name = entry["platform"] or "未标注"
                    percent = f"{entry['percent']:.4f}%" if entry["percent"] is not None else "分母为0，不计算占比"
                    parts.append(f"{name} {entry['count']:,}/{denominator:,} 条，占 {percent}")
                if parts:
                    answer += "\n" + "；".join(parts) + "。[A2]"
        if analytics.get("by_month") and (intent.get("operations", {}).get("trend") or re.search(r"按月|每月|逐月|月度|趋势|monthly|trend", message, re.I)):
            answer += "\n按相同筛选和关键词口径的记录日期逐月计数（最近至多12个有记录的月份）：" + "；".join(f"{row['month']}：{row['count']:,} 条" for row in analytics["by_month"][-12:]) + "。[A2]"
            dates = analytics["date_range"]
            answer += f"\n有日期 {dates['dated_records']:,} 条，无可用日期 {dates['undated_records']:,} 条；这表示资料记录数量变化，不能等同于机构立场或关注程度变化。[A2]"
        return answer + f"\n日期口径：{scope['date_field']}，Asia/Shanghai；{scope['date_semantics']}。\n统计范围：已入库真实快照 {scope['source_version']}；模拟数据未计入，不能据此推断全网总量。"

    def fallback(self, result: dict, reason: str, usage: dict, model_called: bool = False) -> dict:
        citations = [c for c in result["results"] if eligible(c)][:5]
        greeting = reason == "greeting"
        if not result["results"]:
            answer = "当前真实数据库及筛选范围内未检索到可引用的资料。可以调整关键词、机构、角度或日期；现有证据不足以回答该问题。"
            if reason == "previous_source_ambiguous":
                answer = "此前用户问题命中多条资料，无法唯一确定同一来源。请明确记录或补充关键词；现有证据不足以继续引用指定来源。"
            elif greeting:
                answer = "你好，我可以帮你查询资料、按机构或平台做精确统计、梳理议题、比较机构，并结合上下文继续追问。可直接试试：最近 CSIS 对中国关注什么？或：比较 CSIS 与 RAND 涉华报道的异同。"
            elif reason == "missing_topic":
                answer = "可以帮你查询、概括和分析。请补充主题、机构或具体资料，例如：最近 CSIS 对中国关注什么？仅有引用或概括要求无法确定证据。"
            elif reason == "previous_source_missing":
                answer = "未能从此前用户问题及当前筛选范围确定同一来源；请明确记录或补充关键词。现有证据不足以回答该问题。"
            if not greeting:
                answer += "\n\n" + scope_text(result)
            state = "no_results"
        else:
            answer = "当前返回数据库检索摘录，未生成模型答案。"
            if reason in {"model_unreachable", "configuration_unavailable", "model_busy", "model_timeout"}:
                answer += "指定的 DeepSeek V4.1 Flash 暂不可用；可以重试，或继续查看以下真实资料及精确统计。"
            elif reason.startswith("invalid_") or reason in {"ungrounded_model_answer", "unsafe_model_answer", "model_mismatch"}:
                answer += "候选分析未通过引用与内容校验，仍可查看以下真实资料并重试。"
            if result.get("coverage", {}).get("sample_fallback"):
                sample_records = result["coverage"].get("sample_records")
                answer += (f"\n\n当前筛选范围内没有与问题字面匹配的记录；以下是按当前范围抽样的 "
                           f"{sample_records} 条资料中的部分记录，不是字面命中，也不代表全库占比、实时覆盖或客观排名。")
            answer += "\n" + scope_text(result, citations)
            if not citations:
                answer += "\n命中记录中的当前段落不适合作为模型证据，请调整问题或查看完整原文。"
            for citation in citations:
                answer += f"\n[{citation['citation_id']}] {citation['institution']} · {citation['angle']} · {citation['field']}：{citation['snippet'][:300]}"
            state = "retrieval_only"
        response = self.response(result, answer, citations, usage, state,
                                 {"id": self.llm.model, "used": False, "attempted": model_called, "reason": reason})
        if greeting or reason == "missing_topic":
            response.update(answer_kind="guidance", answer_format="guidance")
        return response

    def response(self, result: dict, answer: str, citations: list[dict], usage: dict, state: str, model: dict) -> dict:
        aggregate_citations = [{"citation_id": "A1", "kind": "database_aggregate", "scope": result["aggregates"]["scope"],
                                "scoped": result["aggregates"]["scoped"], "matched": result["aggregates"]["matched"]}]
        if result.get("analytics"):
            analytics = result["analytics"]
            aggregate_citations.append({"citation_id": "A2", "kind": "database_aggregate", "scope": analytics["scope"],
                                        "matched": analytics["matched"], "date_range": analytics["date_range"],
                                        "by_month": analytics["by_month"], "method": analytics["method"],
                                        "shares": analytics.get("shares", {}), "ranking": analytics.get("ranking"),
                                        "latest_returned_date": max((c.get(analytics["scope"]["date_field"]) for c in result.get("results", [])
                                                                     if not c.get("future_dated") and c.get(analytics["scope"]["date_field"])), default=None)})
        response = {"answer": answer, "citations": citations, "aggregate_citations": aggregate_citations,
                    "analytics": result.get("analytics", {}),
                    "query": result["query"], "plan": result["plan"], "aggregates": result["aggregates"],
                    "coverage": result["coverage"], "model": model, "usage": usage, "state": state,
                    "answer_format": "verbatim_extracts" if state == "answered" else "database_aggregate" if state == "database_answer" else "retrieval_extracts",
                    **metadata(result, state)}
        if result.get("relaxed_topic_match"):
            response.update(relaxed_topic_match=True, relaxed_topic_term=result.get("relaxed_topic_term"))
        return response

    def answer(self, message, history=None, filters=None, expand=True, relax=False, model_guard=None) -> dict:
        deadline = time.monotonic() + self.timeout
        message = bounded_text(message, "message", 1200)
        history = validate_history(history)
        filters = self.retriever.validate_filters(filters)
        if not isinstance(expand, bool) or not isinstance(relax, bool):
            raise InputError("expand and relax must be boolean")
        if expand:
            filters = inherit_filters(self.retriever, message, history, filters)
        query = self.context_query(message, history, filters) if expand else message
        greeting_message = bool(GREETING.fullmatch(message) or CHAT_GREETING.fullmatch(message))
        if greeting_message:
            query = message
        source_ids, source_basis = self.conversation_source(message, history, query, filters) if expand else (None, None)
        initial_plan = self.retriever.make_plan(query, filters, expand=expand)
        message_intent = request_intent(message, enabled=expand)
        if message_intent.get("requires_history") and message_intent.get("operations", {}).get("ranking"):
            rank_phrase = re.search(r"哪家(更多|更少|多|少)", message)
            if rank_phrase:
                # The amount suffix 多少 must not reverse 哪家多 into ascending.
                message_intent["ranking"] = "ascending" if "少" in rank_phrase[1] else "descending"
        plan_intent = initial_plan.get("intent", initial_plan["request_intent"])
        operations = {key: bool(plan_intent.get("operations", {}).get(key) or message_intent.get("operations", {}).get(key))
                      for key in ("count", "compare", "trend", "ranking", "share")}
        legacy_count = is_count_query(message) or bool(expand and COMPARISON_COUNT.fullmatch(message) and history)
        source_attribute = bool(message_intent.get("requested_attributes")) or bool(re.search(r"比分|得分|分数|胜负|输赢|结果|\b(?:score|scores|outcome|result)\b", message, re.I))
        analysis_requested = bool(re.search(r"分析|研判|解释|原因|为什么|为何|意味着|\banaly[sz]|\bwhy\b|\bexplain\b", message, re.I))
        count_requested = legacy_count or bool(expand and not source_attribute and
                                              (operations["count"] or operations["ranking"] or operations["share"] or operations["trend"] and not analysis_requested))
        if expand and operations["trend"] and analysis_requested and not source_attribute:
            count_requested = False
        if not count_requested and source_ids is None and not initial_plan["terms"]:
            explicit_subject = bool(self.retriever.detect_institutions(query))
            if expand and request_intent(message)["referential"] and not request_intent(message)["source_reference"]:
                explicit_subject = explicit_subject or any(entry["role"] == "user" and not INJECTION.search(entry["content"])
                                                           and self.retriever.detect_institutions(entry["content"]) for entry in history)
            if not explicit_subject:
                source_ids, source_basis = [], "missing_topic"
        if greeting_message:
            source_ids, source_basis = [], "greeting"
        # Local intent planning is sufficient for synthesis turns. Reserve their
        # model budget for generation and one independent batch evidence review.
        semantic = (expand and not count_requested and source_ids is None and kind_for(message) == "lookup"
                    and not initial_plan.get("request_intent", {}).get("removed_request_phrases"))
        result = self.search_engine.search(query, filters, expand=expand, semantic=semantic,
                                           relax=relax, history=history, deadline=deadline, model_guard=model_guard, record_ids=source_ids)
        # Topic rewriting removes task grammar. Restore only allowlisted display
        # operations from the current request, never source terms or locked scope.
        if expand:
            actual_intent = result["plan"].get("intent", result["plan"]["request_intent"])
            actual_intent["operations"] = operations
            for key in ("dimensions", "ranking", "ranking_dimension", "ranking_limit", "share_denominator"):
                if message_intent.get(key):
                    actual_intent[key] = message_intent[key]
            result["plan"]["intent"] = actual_intent
            result["plan"]["request_intent"] = actual_intent
        usage = dict(result["usage"])
        result["plan"]["conversation"] = {"history_used": bool(expand and history), "original_message": message,
                                           "same_source_requested": bool(expand and request_intent(message)["same_source_requested"]),
                                           "scope_basis": "bounded_user_history_and_current_filters",
                                           "source_record_ids": source_ids, "source_basis": source_basis,
                                           "request_intent": request_intent(message, enabled=expand)}
        result["plan"]["tool_steps"] = [{"tool": "database_evidence", "purpose": "question_scope",
                                         "filters": result["plan"]["filters"], "returned_paragraphs": len(result["results"])},
                                        {"tool": "database_aggregate", "purpose": "exact_scoped_and_matched_counts"}]
        if result["model"]["attempted"]:
            result["plan"]["tool_steps"].append({"tool": "model_alias_planning", "used": result["model"]["used"],
                                                 "reason": result["model"].get("reason")})
        if source_basis:
            result["plan"]["tool_steps"].insert(0, {"tool": "database_source_resolution", "purpose": "unique_previous_user_source",
                                                     "basis": source_basis, "record_ids": source_ids})
        attempted = result["model"]["attempted"]
        if source_ids == []:
            if (source_basis == "greeting"
                    and self.general_chat_allowed(message, result, expand, count_requested, source_ids, source_basis)):
                return general_chat(self, result, message, history, usage, deadline, model_guard, attempted)
            return self.fallback(result, source_basis, usage, attempted)
        if not result["results"] and self.relaxed_topic_allowed(message, result, expand, count_requested, source_ids):
            candidate, relaxed = self.relaxed_topic_search(message, result["plan"]["filters"], expand)
            if relaxed is not None:
                result = self.adopt_relaxed_result(result, relaxed, query, candidate)
        result["analytics"] = build_analytics(self.retriever, result)
        result["plan"]["tool_steps"].append({"tool": "database_analytics", "purpose": "exact_dates_and_dimensions"})
        if count_requested:
            result["plan"]["model"]["reason"] = "exact_database_aggregate"
            return self.response(result, self.database_answer(message, result), [], {}, "database_answer",
                                 {"id": self.llm.model, "used": False, "attempted": False, "reason": "exact_database_aggregate"})
        result = balance_result(self.retriever, result, message, expand, source_ids)
        sampling = None
        if not result["results"] and self.sampling_allowed(message, result, expand, count_requested,
                                                           source_attribute, source_ids):
            sampling = self.sample_scope(result, expand)
        if not result["results"] and self.general_chat_allowed(
                message, result, expand, count_requested, source_ids, source_basis):
            return general_chat(self, result, message, history, usage, deadline, model_guard, attempted)
        if not result["results"]:
            return self.fallback(result, "no_results", usage, attempted)
        return generate(self, result, message, history, expand, usage, deadline, model_guard, attempted,
                        requested_points=message_intent.get("requested_points"), sampling=sampling)

    @staticmethod
    def validate_claims(payload: dict, evidence: list[dict]) -> tuple[list[dict], set[str]]:
        if set(payload) != {"claims"} or not isinstance(payload["claims"], list) or len(payload["claims"]) > 8:
            raise ModelUnavailable("invalid_model_answer")
        known = {c["citation_id"]: c for c in evidence if c.get("evidence_eligible", True)}
        all_cited, claims = set(), []
        for claim in payload["claims"]:
            if not isinstance(claim, dict) or set(claim) != {"text", "citations", "quotes"}:
                raise ModelUnavailable("invalid_model_answer")
            text, cited, quotes = claim["text"], claim["citations"], claim["quotes"]
            if not isinstance(text, str) or not 8 <= len(text) <= 600 or any(ord(ch) < 32 and ch not in "\n\t" for ch in text) or UNSAFE_OUTPUT.search(text):
                raise ModelUnavailable("unsafe_model_answer")
            if CITATION.search(text) or re.search(r"\b(?:C\d+|A\d+)\b", text):
                raise ModelUnavailable("invalid_model_answer")
            if not isinstance(cited, list) or not 1 <= len(cited) <= 5 or any(not isinstance(c, str) or c not in known for c in cited):
                raise ModelUnavailable("ungrounded_model_answer")
            if any(text not in known[c]["snippet"] for c in cited):
                raise ModelUnavailable("ungrounded_model_answer")
            if not isinstance(quotes, list) or not 1 <= len(quotes) <= 5:
                raise ModelUnavailable("ungrounded_model_answer")
            quoted = set()
            for quote in quotes:
                if not isinstance(quote, dict) or set(quote) != {"citation_id", "quote"}:
                    raise ModelUnavailable("ungrounded_model_answer")
                cid, content = quote["citation_id"], quote["quote"]
                if not isinstance(cid, str) or cid not in cited or not isinstance(content, str) or content != text or content not in known[cid]["snippet"]:
                    raise ModelUnavailable("ungrounded_model_answer")
                quoted.add(cid)
            if quoted != set(cited):
                raise ModelUnavailable("ungrounded_model_answer")
            # New numerical claims must occur in the cited evidence, never be invented.
            source = " ".join(known[c]["snippet"] for c in cited)
            if any(number not in source for number in re.findall(r"\d+(?:[.,]\d+)*%?", text)):
                raise ModelUnavailable("ungrounded_model_answer")
            all_cited.update(cited)
            claims.append(claim)
        return claims, all_cited
