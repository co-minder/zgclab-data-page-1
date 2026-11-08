"""Retrieval upgrade acceptance: real snapshot, deterministic grammar and bounded model."""
from __future__ import annotations

import datetime as dt
import json
import re
import sys
import time
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from service.analytics import build_analytics
from service.intent import BEIJING, request_intent
from service.llm import ModelUnavailable
from service.planner import SearchEngine
from service.retrieval import InputError, Retriever
from service.text import phrase

EXACT_USER = "你好，给我看看 近期的就是 对中国最相关的 报道我看看"
FIXED_NOW = dt.datetime(2026, 11, 9, 12, 0, tzinfo=BEIJING)


class LocalPlanner:
    """No real calls; expose exactly what the planner may ask a model to do."""
    model = "auto/deepseek-v4.1-flash"

    def __init__(self, mode="literal"):
        self.mode, self.calls = mode, []

    def health(self):
        return {"available": True}

    def complete(self, messages, max_tokens, timeout=None):
        payload = json.loads(messages[-1]["content"])
        self.calls.append(payload)
        groups = [{"anchor": item["anchor"], "terms": []} for item in payload["anchors"]]
        if self.mode == "unverified":
            groups = [{"anchor": item["anchor"], "terms": ["safety"]} for item in payload["anchors"]]
        if self.mode == "clear":
            groups = []
        if self.mode == "alias":
            for group in groups:
                if group["anchor"] == "人工智能":
                    group["terms"] = ["人工智慧"]
        return json.dumps({"query": payload["normalized_query"][:300] or "资料", "groups": groups}, ensure_ascii=False), {"total_tokens": 11}


class IntentGrammar(unittest.TestCase):
    def test_exact_request_is_structured_lookup_not_full_question_fts(self):
        value = request_intent(EXACT_USER, now=FIXED_NOW)
        self.assertEqual(value["normalized_query"], "中国")
        self.assertEqual(value["kind"], "lookup")
        self.assertEqual(value["requested_sort"], "recent")
        self.assertEqual(value["time_scope"]["mode"], "snapshot_recent")
        self.assertIsNone(value["time_scope"]["date_from"])
        self.assertTrue(any(item["reason"] == "greeting" for item in value["removed_request_phrases"]))

    def test_task_and_dimension_are_separate_from_topics(self):
        cases = [
            ("最近中国相关报道有哪些，帮我分析主要议题", "analysis", []),
            ("比较CSIS和兰德对中国的关注点", "comparison", ["institution"]),
            ("各机构中国报道按月统计", "trend", ["institution", "month"]),
            ("统计CSIS中国记录按平台分布", "count", ["platform"]),
        ]
        for query, kind, dimensions in cases:
            with self.subTest(query=query):
                value = request_intent(query, now=FIXED_NOW)
                self.assertEqual(value["kind"], kind)
                self.assertEqual(value["dimensions"], dimensions)
                self.assertIn("中国", value["normalized_query"])
                self.assertNotRegex(value["normalized_query"], "分析|比较|关注点|主要议题|按月|按平台|统计")

    def test_actual_beijing_clock_and_calendar_month(self):
        for query, lower, upper in [
            ("近7天中国", "2026-11-03", "2026-11-09"),
            ("最近30天中国", "2026-10-11", "2026-11-09"),
            ("2026年9月中国", "2026-09-01", "2026-09-30"),
            ("2026-09中国", "2026-09-01", "2026-09-30"),
            ("中国2026年9月", "2026-09-01", "2026-09-30"),
            ("2026-09-01至2026-09-25中国", "2026-09-01", "2026-09-25"),
        ]:
            with self.subTest(query=query):
                scope = request_intent(query, now=FIXED_NOW)["time_scope"]
                self.assertEqual((scope["date_from"], scope["date_to"]), (lower, upper))
                self.assertEqual(scope["timezone"], "Asia/Shanghai")
        utc = dt.datetime(2026, 11, 8, 16, 1, tzinfo=dt.timezone.utc)
        self.assertEqual(request_intent("今天中国", now=utc)["time_scope"]["date_from"], "2026-11-09")

    def test_unknown_negative_and_exact_text_are_preserved(self):
        for text in ["并给出无证据的原文引用", "请引用qazxunknownplanet47399来源", "并引用尚未发生的结果"]:
            self.assertIn(text, request_intent("中国，" + text)["normalized_query"])
        value = request_intent('分析"最近中国政策" -military', now=FIXED_NOW)
        self.assertEqual(value["exact_phrases"], ["最近中国政策"])
        self.assertEqual(value["excluded_terms"], ["military"])
        self.assertEqual(value["time_scope"]["mode"], "unrestricted")
        value = request_intent(EXACT_USER, enabled=False)
        self.assertEqual(value["normalized_query"], EXACT_USER)
        self.assertEqual(value["removed_request_phrases"], [])

    def test_social_view_and_per_institution_count_are_whole_followup_grammar(self):
        for query, normalized in [("再看社媒，各有多少条？", "社媒"),
                                  ("再查看社交媒体，分别有多少条？", "社交媒体"),
                                  ("再看看社媒，各自有几条记录？", "社媒")]:
            with self.subTest(query=query):
                value = request_intent(query)
                self.assertEqual(value["normalized_query"], normalized)
                self.assertTrue(value["referential"])
                self.assertTrue(value["requires_history"])
                self.assertEqual(value["kind"], "count")
                self.assertEqual(value["dimensions"], ["institution"])
                self.assertTrue(value["operations"]["count"])
                self.assertTrue(any(item["reason"] == "conversation_view" for item in value["removed_request_phrases"]))
        self.assertEqual(request_intent("各有多少条？")["normalized_query"], "")
        self.assertTrue(request_intent("各有多少条？")["requires_history"])

    def test_social_followup_grammar_preserves_unknown_negative_and_quotes(self):
        for query in ["再看Zyx量子foo社媒，各有多少条？", "再看社媒，各有多少条非Zyx量子foo？", "再查看非Zyx量子foo社媒，各有多少条？"]:
            with self.subTest(query=query):
                value = request_intent(query)
                self.assertIn("Zyx量子foo", value["normalized_query"])
                if "非" in query:
                    self.assertIn("非", value["normalized_query"])
        value = request_intent('再看社媒，"各有多少条"')
        self.assertEqual(value["exact_phrases"], ["各有多少条"])
        self.assertIn('"各有多少条"', value["normalized_query"])
        literal = '"再看社媒，各有多少条"'
        self.assertEqual(request_intent(literal)["normalized_query"], literal)
        strict = request_intent("再看社媒，各有多少条？", enabled=False)
        self.assertEqual(strict["normalized_query"], "再看社媒，各有多少条？")
        self.assertEqual(strict["removed_request_phrases"], [])

    def test_full_summary_output_directives_are_not_topics(self):
        query = "归纳这些涉华资料的主要议题，各给出来源，并说明只是样本分析。"
        value = request_intent(query)
        self.assertEqual(value["normalized_query"], "涉华")
        self.assertEqual(value["kind"], "analysis")
        self.assertTrue(value["referential"])
        self.assertFalse(value["source_reference"])
        self.assertTrue(value["citation_requested"])
        self.assertTrue(value["sample_only_requested"])
        self.assertTrue(any(item["text"] == "各给出来源" and item["reason"] == "citation_instruction" for item in value["removed_request_phrases"]))
        for directive in ["只基于样本分析", "仅根据这些资料的样本分析", "不要外推", "不要外推到全网", "各自来源"]:
            with self.subTest(directive=directive):
                self.assertEqual(request_intent("归纳这些涉华资料的主要议题，" + directive)["normalized_query"], "涉华")

    def test_output_cleanup_preserves_unknown_negative_quoted_and_disabled(self):
        query = "归纳Zyx量子foo的观点，各给出来源，只基于样本分析，不要外推。"
        self.assertIn("Zyx量子foo", request_intent(query)["normalized_query"])
        for clause in ["各给出非Zyx量子foo来源", "说明Zyx量子foo证据", "不要外推到Zyx量子foo", "并说明只是样本分析但不涉及Zyx量子foo", "列出异同和非Zyx量子foo的证据"]:
            with self.subTest(clause=clause):
                normalized = request_intent("归纳这些涉华资料的主要议题，" + clause)["normalized_query"]
                self.assertIn("Zyx量子foo", normalized)
                self.assertNotEqual(normalized, "涉华")
        quoted = request_intent('归纳"只基于样本分析"，各给出来源，不要外推。')
        self.assertEqual(quoted["exact_phrases"], ["只基于样本分析"])
        self.assertIn('"只基于样本分析"', quoted["normalized_query"])
        disabled = request_intent(query, enabled=False)
        self.assertEqual(disabled["normalized_query"], query)
        self.assertEqual(disabled["removed_request_phrases"], [])

    def test_bounded_batch_and_comparison_followups(self):
        batch = request_intent("这批涉华资料有哪些主要议题")
        self.assertEqual(batch["normalized_query"], "涉华")
        self.assertTrue(batch["referential"])
        comparison = request_intent("CSIS与RAND各关注什么、有何异同")
        self.assertEqual(comparison["normalized_query"], "CSIS与RAND")
        self.assertEqual(comparison["kind"], "comparison")
        self.assertEqual(request_intent("它们主题有什么区别？")["normalized_query"], "它们")
        followup = request_intent("哪家多、各多少")
        self.assertEqual(followup["kind"], "count")
        self.assertEqual(followup["normalized_query"], "")
        self.assertTrue(followup["referential"])
        ranked = request_intent("哪个机构涉华报道最多")
        self.assertEqual(ranked["kind"], "count")
        self.assertEqual(ranked["dimensions"], ["institution"])
        self.assertEqual(ranked["normalized_query"], "涉华")
        self.assertEqual(request_intent("中国，按机构和月份统计")["dimensions"], ["institution", "month"])
        for text in ["这两家各有多少条", "哪家多一些"]:
            value = request_intent(text)
            self.assertEqual(value["kind"], "count")
            self.assertEqual(value["normalized_query"], "")
            self.assertTrue(value["requires_history"])
        self.assertEqual(request_intent("按月看变化")["normalized_query"], "")
        self.assertTrue(request_intent("按月看变化")["operations"]["trend"])
        self.assertTrue(request_intent("占比多少")["operations"]["share"])
        self.assertEqual(request_intent("占比多少")["share_denominator"], "matched_records_within_current_filters_and_terms")
        for text, dimension in [("最多的机构", "institution"), ("中国最多的平台", "platform")]:
            value = request_intent(text)
            self.assertTrue(value["operations"]["ranking"])
            self.assertEqual(value["ranking_dimension"], dimension)


class RealRetrievalAcceptance(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path = ROOT / ".runtime/retrieval.sqlite3"
        if not path.exists():
            raise unittest.SkipTest("Real snapshot not installed")
        cls.retriever = Retriever(path)
        if cls.retriever.snapshot["source_version"] != "f064c896c123cbf4":
            raise unittest.SkipTest("Acceptance counts belong to the reviewed source version")

    def setUp(self):
        self.clock = patch("service.intent.clock_now", return_value=FIXED_NOW)
        self.clock.start()
        self.addCleanup(self.clock.stop)

    def test_exact_user_real_results_recent_date_and_body_evidence(self):
        result = self.retriever.search(EXACT_USER, limit=8)
        self.assertEqual(result["coverage"]["matched_records"], 987)
        self.assertEqual(len(result["plan"]["terms"]), 1)
        self.assertEqual(result["plan"]["intent"]["topic"], "中国")
        self.assertEqual(result["plan"]["sort"], "recent")
        self.assertFalse(result["plan"]["relaxed"])
        self.assertNotIn("date_from", result["plan"]["filters"])
        self.assertEqual(result["results"][0]["id"], "social-7")
        self.assertTrue(result["coverage"]["latest_returned_date"].startswith("2026-09-25"))
        self.assertNotIn("clue-1", {item["id"] for item in result["results"]})
        self.assertTrue(all(item["field"] in {"original_text", "translation"} for item in result["results"]))
        self.assertTrue(all(not item["future_dated"] for item in result["results"]))
        with self.retriever.connect() as con:
            for item in result["results"]:
                text = con.execute("SELECT text FROM paragraphs WHERE record_id=? AND paragraph=?", (item["id"], item["paragraph"])).fetchone()[0]
                self.assertIn(item["snippet"], text)

    def test_colloquial_variants_and_topic_conjunction(self):
        for query in ["最近中国相关报道有哪些，帮我分析主要议题", "你好给我看看最近的对华报道", "嗨，想看看近期涉华报道", "China recent reports", "Give me recent China reports"]:
            with self.subTest(query=query):
                result = self.retriever.search(query)
                self.assertEqual(result["coverage"]["matched_records"], 987)
                self.assertEqual(len(result["plan"]["terms"]), 1)
        screenshot_variant = self.retriever.search("你好，看看近期的就中国的新闻报道我看看")
        self.assertEqual(screenshot_variant["coverage"]["matched_records"], 529)
        self.assertEqual(len(screenshot_variant["plan"]["terms"]), 1)
        self.assertEqual(self.retriever.search("按相关度查找中国报道")["plan"]["sort"], "relevance")
        bilateral = self.retriever.search("中美政策")
        self.assertEqual(bilateral["coverage"]["matched_records"], 59)
        self.assertEqual(len(bilateral["plan"]["terms"]), 2)
        self.assertEqual(self.retriever.search("U.S.-China policy")["coverage"]["matched_records"], 59)
        self.assertLess(bilateral["coverage"]["matched_records"], self.retriever.search("对华政策")["coverage"]["matched_records"])

    def test_institution_analysis_and_comparison_each_side(self):
        result = self.retriever.search("看看最近CSIS对中国的报道并分析", limit=8)
        self.assertEqual(result["plan"]["intent"]["kind"], "analysis")
        self.assertEqual(result["plan"]["filters"]["institution"], [1000490])
        self.assertEqual(result["coverage"]["matched_records"], 321)
        result = self.retriever.search("比较CSIS和兰德对中国的关注点", limit=8)
        self.assertEqual(result["plan"]["intent"]["kind"], "comparison")
        self.assertEqual(set(result["plan"]["filters"]["institution"]), {1000490, 1000480})
        self.assertEqual(result["coverage"]["matched_records"], 377)
        self.assertEqual({item["ktid"] for item in result["results"]}, {1000490, 1000480})
        self.assertEqual({item["ktid"]: item["count"] for item in result["aggregates"]["scoped"]["by_institution"]}, {1000490: 1317, 1000480: 290})
        analytics = build_analytics(self.retriever, result)
        self.assertEqual(sum(item["count"] for item in analytics["by_institution"]), 377)
        self.assertEqual(analytics["total"], 377)

    def test_preflight_summary_sentence_retrieves_subject_only(self):
        query = "归纳这些涉华资料的主要议题，各给出来源，并说明只是样本分析。"
        result = self.retriever.search(query)
        self.assertEqual(result["plan"]["terms"], self.retriever.make_plan("涉华", {})["terms"])
        self.assertEqual(result["coverage"]["matched_records"], 987)
        self.assertTrue(result["plan"]["intent"]["referential"])
        self.assertTrue(result["plan"]["intent"]["citation_requested"])
        self.assertTrue(result["plan"]["intent"]["sample_only_requested"])
        self.assertFalse(result["plan"]["relaxed"])
        strict = self.retriever.search(query, expand=False)
        self.assertEqual(strict["coverage"]["matched_records"], 0)
        self.assertEqual(strict["plan"]["request_intent"]["normalized_query"], query)
        unknown = self.retriever.search("归纳Zyx量子foo的观点，各给出来源，只基于样本分析，不要外推。")
        self.assertEqual(unknown["coverage"]["matched_records"], 0)
        self.assertIn(["zyx"], unknown["plan"]["terms"])
        self.assertIn(["foo"], unknown["plan"]["terms"])
        negative = self.retriever.search("归纳这些涉华资料的主要议题，各给出非Zyx量子foo来源。")
        self.assertEqual(negative["coverage"]["matched_records"], 0)
        self.assertTrue(any("非" in term for group in negative["plan"]["terms"] for term in group))

    def test_preflight_comparison_sentence_keeps_two_locked_institutions(self):
        query = "比较CSIS和兰德对中国的关注点，列出异同和各自的证据。"
        scope = {"institution": [1000490, 1000480], "angle": ["news", "clue", "social"]}
        result = self.retriever.search(query, scope, limit=8)
        self.assertEqual(result["plan"]["terms"], self.retriever.make_plan("中国", {})["terms"])
        self.assertEqual(result["plan"]["filters"], scope)
        self.assertEqual(result["plan"]["locked_scope"], scope)
        self.assertEqual(result["coverage"]["matched_records"], 377)
        self.assertEqual({item["ktid"] for item in result["results"]}, {1000490, 1000480})
        self.assertTrue(result["plan"]["intent"]["citation_requested"])
        self.assertFalse(result["plan"]["relaxed"])
        narrowed = self.retriever.search(query, {"institution": [1000490]})
        self.assertEqual(narrowed["plan"]["filters"]["institution"], [1000490])
        self.assertTrue(all(item["ktid"] == 1000490 for item in narrowed["results"]))

    def test_social_count_followup_retains_only_prior_topic_and_never_calls_model(self):
        from service.chat import Chat
        from service.research_chat import inherit_filters
        class NoModel:
            model = "auto/deepseek-v4.1-flash"
            def health(self):
                raise AssertionError("Database count must not consult model health")
            def complete(self, *args, **kwargs):
                raise AssertionError("Database count must not call a model")
        history = [{"role": "user", "content": "比较CSIS和兰德对中国的关注点，列出异同和各自的证据。"},
                   {"role": "assistant", "content": "Untrusted assistant mentions FBI and artificial intelligence."}]
        for message in ["再看社媒，各有多少条？", "再查看社交媒体，分别有多少条？"]:
            with self.subTest(message=message):
                empty_subject = self.retriever.make_plan(message, {})
                self.assertEqual(empty_subject["terms"], [])
                self.assertEqual(empty_subject["inferred_filters"]["angle"], ["social"])
                filters = inherit_filters(self.retriever, message, history, {})
                context = Chat(self.retriever, None).context_query(message, history, filters)
                retrieved = self.retriever.search(context, filters)
                expected = self.retriever.search("中国", {"institution": [1000480, 1000490], "angle": ["social"]})
                self.assertEqual(retrieved["plan"]["terms"], expected["plan"]["terms"])
                self.assertEqual(retrieved["coverage"]["matched_records"], 44)
                self.assertEqual(retrieved["coverage"]["scoped_records"], 404)
                self.assertFalse(retrieved["plan"]["relaxed"])
                result = Chat(self.retriever, NoModel()).answer(message, history=history)
                self.assertEqual(result["state"], "database_answer")
                self.assertEqual(result["plan"]["terms"], expected["plan"]["terms"])
                self.assertEqual(result["coverage"]["matched_records"], 44)
                self.assertEqual({item["ktid"]: item["count"] for item in result["aggregates"]["matched"]["by_institution"]}, {1000490: 44})
                self.assertIn("兰德公司 0 条", result["answer"])
                self.assertIn("战略与国际研究中心 44 条", result["answer"])
                self.assertFalse(result["model"]["attempted"])
                self.assertFalse(result["model"]["used"])
                self.assertEqual(result["usage"], {})

    def test_social_followup_preserves_recent_date_and_explicit_scope(self):
        from service.chat import Chat
        from service.research_chat import inherit_filters
        message = "再看社媒，各有多少条？"
        for prior, date_from in [("比较CSIS和兰德最近对中国的关注点", None),
                                 ("比较CSIS和兰德2026年9月对中国的关注点", "2026-09-01")]:
            with self.subTest(prior=prior):
                history = [{"role": "user", "content": prior}]
                filters = inherit_filters(self.retriever, message, history, {})
                context = Chat(self.retriever, None).context_query(message, history, filters)
                plan = self.retriever.make_plan(context, filters)
                self.assertEqual(set(plan["filters"]["institution"]), {1000480, 1000490})
                self.assertEqual(plan["filters"]["angle"], ["social"])
                self.assertEqual(plan["filters"].get("date_from"), date_from)
                if date_from:
                    self.assertEqual(plan["filters"]["date_to"], "2026-09-30")
                self.assertEqual(plan["sort"], "recent")
                self.assertEqual(plan["terms"], self.retriever.make_plan("中国", {})["terms"])
        explicit = {"institution": [1000490], "angle": ["news"], "date_from": "2026-09-01", "date_to": "2026-09-25"}
        history = [{"role": "user", "content": "比较CSIS和兰德最近对中国的关注点"}]
        inherited = inherit_filters(self.retriever, message, history, explicit)
        context = Chat(self.retriever, None).context_query(message, history, inherited)
        self.assertEqual(self.retriever.make_plan(context, inherited)["filters"], explicit)

    def test_social_followup_unknown_negative_quotes_and_strict_mode_stay_literal(self):
        from service.chat import Chat
        from service.research_chat import inherit_filters
        history = [{"role": "user", "content": "比较CSIS和兰德对中国的关注点"}]
        for message in ["再看Zyx量子foo社媒，各有多少条？", "再查看非Zyx量子foo社媒，各有多少条？", "再看社媒，各有多少条非Zyx量子foo？"]:
            with self.subTest(message=message):
                filters = inherit_filters(self.retriever, message, history, {})
                context = Chat(self.retriever, None).context_query(message, history, filters)
                result = self.retriever.search(context, filters)
                self.assertEqual(result["coverage"]["matched_records"], 0)
                self.assertIn(["zyx"], result["plan"]["terms"])
                self.assertIn(["foo"], result["plan"]["terms"])
                self.assertFalse(result["plan"]["relaxed"])
                if "非" in message:
                    self.assertTrue(any("非" in term for group in result["plan"]["terms"] for term in group))
        quoted = self.retriever.make_plan('再看社媒，"各有多少条"', {})
        self.assertIn(["各有多少条"], quoted["terms"])
        self.assertEqual(quoted["exact_phrases"], ["各有多少条"])
        message = "再看社媒，各有多少条？"
        strict = self.retriever.search(message, expand=False)
        self.assertEqual(strict["coverage"]["matched_records"], 0)
        self.assertEqual(strict["plan"]["request_intent"]["normalized_query"], message)
        self.assertTrue(any("再看" in term for group in strict["plan"]["terms"] for term in group))
        self.assertTrue(any("各有多少条" in term for group in strict["plan"]["terms"] for term in group))

    def test_summary_followup_resolves_prior_subject_without_new_fts_noise(self):
        from service.chat import Chat
        message = "归纳这些资料的主要议题，各给出来源，并说明只是样本分析。"
        followup = self.retriever.make_plan(message, {})
        self.assertEqual(followup["terms"], [])
        self.assertTrue(followup["intent"]["referential"])
        self.assertFalse(followup["intent"]["source_reference"])
        context = Chat(self.retriever, None).context_query(message, [{"role": "user", "content": "比较CSIS和兰德对中国的关注点"}], {})
        result = self.retriever.search(context)
        self.assertEqual(result["coverage"]["matched_records"], 377)
        self.assertEqual(set(result["plan"]["filters"]["institution"]), {1000490, 1000480})
        self.assertEqual(len(result["plan"]["terms"]), 1)

    def test_explicit_zero_date_scope_and_action_keep_topic_and_institution(self):
        query = "最近30天CSIS对中国的报道"
        result = self.retriever.search(query, {"angle": ["news", "social"]})
        self.assertEqual(result["coverage"]["matched_records"], 0)
        self.assertEqual(result["results"], [])
        self.assertEqual(result["plan"]["filters"]["date_from"], "2026-10-11")
        self.assertEqual(result["plan"]["filters"]["date_to"], "2026-11-09")
        action = result["suggestions"][0]
        self.assertTrue(action["requires_confirmation"])
        self.assertEqual(action["filters"], {"institution": [1000490], "angle": ["news", "social"]})
        self.assertEqual(action["sort"], "recent")
        self.assertNotIn("30", action["query"])
        clicked = self.retriever.search(action["query"], action["filters"], sort=action["sort"])
        self.assertGreater(clicked["coverage"]["matched_records"], 0)
        self.assertNotIn("date_from", clicked["plan"]["filters"])
        self.assertTrue(all(item["ktid"] == 1000490 for item in clicked["results"]))
        self.assertEqual(len(result["search_attempts"]), 1)
        news = self.retriever.search("近30天中国新闻")
        self.assertEqual(news["plan"]["filters"], {"angle": ["news"], "date_from": "2026-10-11", "date_to": "2026-11-09"})
        self.assertEqual(news["coverage"]["matched_records"], 0)
        self.assertFalse(any("30" in group for group in news["plan"]["terms"]))

    def test_explicit_filter_precedes_calendar_query_and_future_date_is_labelled(self):
        result = self.retriever.search("最近30天中国", {"date_from": "2026-09-01", "date_to": "2026-09-25"})
        self.assertEqual(result["plan"]["filters"], {"date_from": "2026-09-01", "date_to": "2026-09-25"})
        self.assertEqual(result["plan"]["time_scope"]["mode"], "explicit_filters")
        future = self.retriever.search("2026年11月中国报道")
        self.assertEqual(future["coverage"]["matched_records"], 1)
        self.assertEqual({item["id"] for item in future["results"]}, {"clue-1"})
        self.assertTrue(all(item["future_dated"] for item in future["results"]))
        self.assertEqual(build_analytics(self.retriever, future)["date_range"]["future_dated_records"], 1)

    def test_unknowns_negation_quotes_and_no_topic_pollution(self):
        for query in ["qazxunknownplanet47399", "中国 qazxunknownplanet47399", "中国尚未存在的专有标识符", "中国 不涉及台湾不存在的极小行星名"]:
            with self.subTest(query=query):
                result = self.retriever.search(query)
                self.assertEqual(result["coverage"]["matched_records"], 0)
                self.assertFalse(result["plan"]["relaxed"])
        unrelated = self.retriever.search("看看最近CSIS的量子报道并分析")
        self.assertTrue(any(group[0] == "量子" for group in unrelated["plan"]["terms"]))
        self.assertFalse(any("中国" in group for group in unrelated["plan"]["terms"]))
        exact = self.retriever.search('"近期中国的报道我看看"')
        self.assertEqual(exact["plan"]["terms"], [["近期中国的报道我看看"]])
        self.assertEqual(exact["coverage"]["matched_records"], 0)
        strict = self.retriever.search(EXACT_USER, expand=False, relax=True)
        self.assertEqual(strict["coverage"]["matched_records"], 0)
        self.assertEqual(strict["plan"]["request_intent"]["normalized_query"], EXACT_USER)
        self.assertTrue(all(len(group) == 1 for group in strict["plan"]["terms"]))
        self.assertFalse(strict["plan"]["relaxed"])
        numeric = self.retriever.make_plan("中国 9", {})
        self.assertIn(["9"], numeric["terms"])
        unknown_category = self.retriever.make_plan("不存在的大学中国", {})
        self.assertTrue(any("大学" in group[0] for group in unknown_category["terms"]))

    def test_record_exclusions_are_whole_scope_constraints(self):
        all_china = self.retriever.search("中国")
        excluded = self.retriever.search("中国 -military")
        self.assertEqual(excluded["plan"]["excluded_terms"], ["military"])
        self.assertLess(excluded["coverage"]["matched_records"], all_china["coverage"]["matched_records"])
        with self.retriever.connect() as con:
            excluded_ids = {row[0] for row in con.execute("SELECT DISTINCT p.record_id FROM paragraph_fts JOIN paragraphs p ON p.pid=paragraph_fts.rowid WHERE paragraph_fts MATCH ?", (phrase("military"),))}
        self.assertFalse({item["id"] for item in excluded["results"]} & excluded_ids)
        self.assertEqual(build_analytics(self.retriever, excluded)["total"], excluded["coverage"]["matched_records"])

    def test_analytics_month_sum_original_recovered_scope_and_counts(self):
        result = self.retriever.search("各机构中国报道按月统计")
        analytics = build_analytics(self.retriever, result)
        self.assertEqual(analytics["total"], result["coverage"]["matched_records"])
        self.assertEqual(sum(item["count"] for item in analytics["by_month"]) + analytics["date_range"]["undated_records"], analytics["total"])
        self.assertEqual(analytics["scope"]["date_field"], "published_at")
        recovered = self.retriever.search("中国", {"date_field": "published_effective_at"})
        self.assertEqual(build_analytics(self.retriever, recovered)["scope"]["date_field"], "published_effective_at")
        counts = self.retriever.search("")
        self.assertEqual(counts["coverage"]["matched_records"], 6989)
        self.assertEqual(counts["aggregates"]["scoped"]["by_angle"], {"news": 3675, "clue": 1468, "social": 1846})
        self.assertEqual(self.retriever.search("阿肯萨斯州立大学")["coverage"]["matched_records"], 221)
        self.assertEqual(build_analytics(self.retriever, counts)["total"], 6989)
        self.assertEqual(analytics["shares"]["denominator"], analytics["total"])
        self.assertAlmostEqual(sum(item["percent"] for item in analytics["shares"]["by_angle"]), 100, places=3)
        ranked = build_analytics(self.retriever, self.retriever.search("中国最多的机构"))
        self.assertEqual(ranked["ranking"]["metric"], "matched_record_count")
        self.assertEqual(ranked["ranking"]["entries"][0]["count"], max(item["count"] for item in ranked["by_institution"]))

    def test_injection_invalid_dates_and_dimension_allowlist(self):
        result = self.retriever.search('" OR 1=1; DROP TABLE news; --')
        self.assertEqual(result["coverage"]["matched_records"], 0)
        for filters in [{"dataset": "simulation"}, {"date_from": "2026-02-30"}, {"date_field": "id) OR 1=1 --"}]:
            with self.assertRaises(InputError):
                self.retriever.search("中国", filters)
        for query in ["2026-02-30中国", "2026年13月中国", "近0天中国", "2026-09-25到2026-09-01中国"]:
            with self.assertRaises(InputError):
                self.retriever.search(query)
        for sort in ["date;DROP TABLE news", [], {}, True]:
            with self.assertRaises(InputError):
                self.retriever.search("中国", sort=sort)
        with self.assertRaises(InputError):
            build_analytics(self.retriever, result, ["month;DROP TABLE news"])

    def test_model_keeps_grammar_topic_and_locked_date_scope(self):
        model = LocalPlanner()
        result = SearchEngine(self.retriever, model).search(EXACT_USER)
        self.assertFalse(result["model"]["attempted"])
        self.assertFalse(result["model"]["used"])
        self.assertEqual(result["model"]["reason"], "deterministic_query_plan")
        self.assertEqual(result["usage"], {})
        self.assertEqual(model.calls, [])
        self.assertEqual(result["plan"]["intent"]["normalized_query"], "中国")
        used = SearchEngine(self.retriever, LocalPlanner("alias")).search("人工智能安全")
        self.assertTrue(used["model"]["attempted"])
        self.assertTrue(used["model"]["used"])
        self.assertEqual(used["usage"], {"total_tokens": 11})
        self.assertIn("人工智慧", used["plan"]["terms"][0])
        self.assertEqual(result["plan"]["intent"]["time_scope"]["mode"], "snapshot_recent")
        self.assertEqual(result["plan"]["sort"], "recent")
        unknown_model = LocalPlanner("unverified")
        unknown = SearchEngine(self.retriever, unknown_model).search("qazxunknownplanet47399")
        self.assertFalse(unknown["model"]["used"])
        self.assertFalse(unknown["model"]["attempted"])
        self.assertEqual(unknown_model.calls, [])
        self.assertEqual(unknown["usage"], {})
        self.assertEqual(unknown["plan"]["terms"], [["qazxunknownplanet47399"]])
        self.assertEqual(unknown["coverage"]["matched_records"], 0)
        self.assertEqual(unknown["model"]["reason"], "deterministic_query_plan")
        clear = SearchEngine(self.retriever, LocalPlanner("clear")).search("中国 qazxunknownplanet47399")
        self.assertEqual(clear["coverage"]["matched_records"], 0)
        self.assertEqual(len(clear["plan"]["terms"]), 2)
        engine = SearchEngine(self.retriever, LocalPlanner())
        with self.assertRaises(ModelUnavailable):
            engine.validate_plan({"query": "qazxunknownplanet47399", "groups": [{"anchor": "qazxunknownplanet47399", "terms": ["safety"]}]}, [["qazxunknownplanet47399"]], {})
        with self.assertRaises(ModelUnavailable):
            engine.validate_plan({"query": "China", "groups": [{"anchor": "中国", "terms": ["China"]}]}, [["中国"]], {}, ["中国"])


if __name__ == "__main__":
    unittest.main()
