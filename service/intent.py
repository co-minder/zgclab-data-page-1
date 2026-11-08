"""Conservative query grammar: answer instructions are separate from search concepts."""
from __future__ import annotations

import re

FOLLOWUP = re.compile(
    r"^(?:那|它|他们|它们|这些|其中|还有|另外|再|继续|这(?:条|份|篇|个|些)|该(?:条|份|篇)?(?:资料|记录|材料|文章|帖子|报告)|双方)"
    r"|\b(?:they|them|their|those|these|it|its|what about|and what|this (?:record|source|article|post)|same source)\b",
    re.I,
)
SAME_SOURCE = re.compile(r"同一(?:条|份|篇)?(?:来源|资料|记录|材料)|相同(?:来源|资料)|\bsame\s+(?:source|record|article|post)\b", re.I)
# These phrases have no arbitrary subject slot: unknown entities and negatives
# cannot be swallowed by the citation-command rule.
CITATION_START = re.compile(r"^(?:please\s+)?(?:并|且|同时|也请|请|继续|给出|提供|附上|标注|注明|引用|cite\b|quote\b|include\b|provide\b|and\b)", re.I)
CITATION_WORDS = re.compile(
    r"可核验|可验证|参考资料|参考文献|同一来源|相同来源|同一|相同|并且|并请|同时|继续|给出|提供|附上|列出|保留|标注|注明|展示|说明|引用|原文|来源|出处|参考|证据|链接|资料|真实|准确|相关|并|且|请|也|的|和|与|及"
    r"|\b(?:and|please|continue|to|cite|quote|include|provide|give|the|a|an|same|original|source|sources|citation|citations|reference|references|evidence|link|links|text)\b|\s+",
    re.I,
)
CHINESE_PREFIX = re.compile(r"^(?:(?:请(?:你)?(?:帮我)?|帮我|麻烦(?:你)?|能否|可否|可以)(?:简要|简单|详细)?\s*)?(?:概括|总结|介绍|说明|检索|查找|搜索|查询|梳理|列出|回答|解释)(?:一下)?\s*", re.I)
ENGLISH_PREFIX = re.compile(r"^(?:please\s+)?(?:summari[sz]e|describe|explain|find|search(?:\s+for)?|tell\s+me\s+about|give\s+me\s+(?:a\s+)?summary\s+of)\s+", re.I)
REFERENCE = re.compile(r"(?:这|那|该)(?:条|份|篇|个)?(?:资料|记录|材料|文章|帖子|来源|报告)(?:里面|之中|里|中|内)?")
QUESTION_TAIL = re.compile(r"(?:是|为)?(?:怎么样|怎样|如何|什么|多少)(?:的|呢|吗)?\s*$")
RELATION = re.compile(r"对阵|迎战|对战|\b(?:versus|vs\.?|against)\b", re.I)


def request_intent(query: str, enabled: bool = True) -> dict:
    result = {"enabled": enabled, "normalized_query": query, "removed_request_phrases": [],
              "citation_requested": False, "same_source_requested": bool(SAME_SOURCE.search(query)),
              "referential": bool(FOLLOWUP.search(query) or REFERENCE.search(query)),
              "source_reference": bool(REFERENCE.search(query) or SAME_SOURCE.search(query)
                                       or re.search(r"\b(?:this|that)\s+(?:record|source|article|post|document)\b", query, re.I)),
              "requested_attributes": []}
    if not enabled:
        return result
    if re.search(r"比分|得分|\bscore\b", query, re.I):
        result["requested_attributes"].append("score")
    if re.search(r"结果|胜负|输赢|\b(?:result|outcome)\b", query, re.I):
        result["requested_attributes"].append("outcome")
    clauses = re.split(r"[，,；;。.!！？?]+|(?=\band\s+(?:please\s+)?(?:cite|quote|include|provide)\b)", query)
    kept = []
    for clause in clauses:
        clause = clause.strip()
        if not clause:
            continue
        if (CITATION_START.search(clause) and re.search(r"引用|出处|来源|证据|\b(?:cite|quote|source|citation|reference|evidence)\w*\b", clause, re.I)
                and not CITATION_WORDS.sub("", clause).strip()):
            result["removed_request_phrases"].append({"text": clause, "reason": "citation_instruction"})
            result["citation_requested"] = True
            continue
        for pattern, reason in [(CHINESE_PREFIX, "answer_directive"), (ENGLISH_PREFIX, "answer_directive"),
                                (REFERENCE, "conversation_reference"), (QUESTION_TAIL, "question_grammar"),
                                (RELATION, "entity_relation")]:
            def remove(match):
                result["removed_request_phrases"].append({"text": match.group(), "reason": reason})
                return " "
            clause = pattern.sub(remove, clause).strip()
        if result["referential"]:
            clause = re.sub(r"^\s*(?:里|中|内)?\s*双方", " ", clause).strip()
        if clause:
            kept.append(clause)
    result["normalized_query"] = " ".join(kept)
    return result
