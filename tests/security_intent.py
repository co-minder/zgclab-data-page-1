#!/usr/bin/env python3
"""Independent intent/planner security fixtures; never contacts a real model.

Run from the project root on social:
    PYTHONDONTWRITEBYTECODE=1 python3 -B tests/security_intent.py -v

Uses a small synthetic source snapshot and an in-process deterministic model.
The fixture's AI safety documents serve as decoys for the unknown-entity case.
This file is owned by the independent reviewer; QA's test_service.py is read only.
"""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))
from test_service import fixture
from service.chat import Chat
from service.intent import request_intent
from service.llm import ModelUnavailable
from service.planner import SearchEngine, is_count_query
from service.retrieval import Retriever

QUESTION = "请概括 Arkansas State 对阵 South Alabama 的比赛结果，并给出原文引用。"
FOLLOWUP = "这条资料里双方比分是多少？请继续引用同一来源。"
SCOPE = {"institution": [1002550], "angle": ["social"]}
UNKNOWN = "qazxunknownplanet47399"


class DeterministicModel:
    model = "auto/deepseek-v4.1-flash"

    def __init__(self, mode="literal"):
        self.mode, self.calls = mode, []

    def health(self):
        return {"available": True, "state": "fixture"}

    def complete(self, messages, max_tokens, timeout=None):
        payload = json.loads(messages[-1]["content"])
        self.calls.append(payload)
        if "anchors" in payload:
            query, groups = payload["query"][:300], []
            if self.mode == "generic_alias":
                groups = [{"anchor": item["anchor"], "terms": ["safety"]} for item in payload["anchors"]]
            elif self.mode == "foreign_scope":
                query = "Arkansas State football"
                groups = [{"anchor": item["anchor"], "terms": ["Arkansas State"]} for item in payload["anchors"]]
            elif self.mode == "sql_alias":
                groups = [{"anchor": item["anchor"], "terms": ["DROP TABLE news"]} for item in payload["anchors"]]
            elif self.mode == "cleared_concepts":
                # A planner cannot turn a query into a structured-scope browse.
                query, groups = "all", []
            elif self.mode == "extra_filters":
                return json.dumps({"query": query, "groups": [], "filters": {}}), {}
            return json.dumps({"query": query, "groups": groups}), {}
        # Return an exact quotation from whatever the application supplied.
        # This makes arbitrary first-record evidence observable, without inventing text.
        evidence = payload["evidence"][0]
        cid, quote = evidence["citation_id"], evidence["snippet"][:80]
        return json.dumps({"claims": [{"text": quote, "citations": [cid],
                                       "quotes": [{"citation_id": cid, "quote": quote}]}]}), {}


class IntentBoundaryFixtures(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="independent-intent-", dir=ROOT / ".runtime")
        cls.retriever = Retriever(fixture(Path(cls.temp.name)))

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def setUp(self):
        self.model = DeterministicModel()
        self.chat = Chat(self.retriever, self.model)

    def assert_no_answer_evidence(self, result):
        self.assertEqual(result["state"], "no_results")
        self.assertEqual(result["citations"], [])
        self.assertFalse(result["model"]["used"])

    def test_original_chinese_question_keeps_scope_and_all_subject_concepts(self):
        result = self.retriever.search(QUESTION, SCOPE)
        self.assertEqual({c["id"] for c in result["results"]}, {"social-1"})
        self.assertEqual(result["coverage"]["matched_records"], 1)
        self.assertEqual(result["plan"]["filters"], SCOPE)
        self.assertFalse(result["plan"]["relaxed"])
        self.assertIn("South Alabama", result["plan"]["request_intent"]["normalized_query"])
        self.assertTrue(result["plan"]["request_intent"]["citation_requested"])

    def test_unknown_additional_subject_is_not_removed_or_relaxed(self):
        query = QUESTION.replace("South Alabama", "South Alabama 及 " + UNKNOWN)
        result = self.chat.answer(query, filters=SCOPE)
        self.assert_no_answer_evidence(result)
        self.assertTrue(any(UNKNOWN in group for group in result["plan"]["terms"]))
        self.assertFalse(result["plan"]["relaxed"])
        self.assertFalse(any("evidence" in call for call in self.model.calls))

    def test_unknown_topic_cannot_be_replaced_by_generic_model_alias(self):
        model = DeterministicModel("generic_alias")
        result = SearchEngine(self.retriever, model).search(UNKNOWN, {"institution": [1000490], "angle": ["news"]})
        self.assertEqual(result["coverage"]["matched_records"], 0,
                         "Unknown topic acquired unrelated AI-safety records through an OR alias")
        self.assertEqual(result["results"], [])
        self.assertTrue(any(UNKNOWN in group for group in result["plan"]["terms"]))

    def test_unknown_anchor_generic_replacement_is_rejected_by_planner_validation(self):
        engine = SearchEngine(self.retriever, self.model)
        with self.assertRaises(ModelUnavailable):
            engine.validate_plan({"query": UNKNOWN, "groups": [{"anchor": UNKNOWN, "terms": ["safety"]}]},
                                 [[UNKNOWN]], {"institution": [1000490], "angle": ["news"]})

    def test_foreign_institution_sql_or_extra_filters_cannot_change_locked_scope(self):
        scope = {"institution": [1000490], "angle": ["news"], "date_from": "2026-11-01", "date_to": "2026-11-30"}
        for mode in ("foreign_scope", "sql_alias", "extra_filters"):
            with self.subTest(mode=mode):
                result = SearchEngine(self.retriever, DeterministicModel(mode)).search("AI safety", scope)
                self.assertEqual(result["plan"]["filters"], scope)
                self.assertFalse(result["model"]["used"])
                self.assertNotIn("news-5", {c["id"] for c in result["results"]})

    def test_empty_model_groups_do_not_clear_unknown_local_concepts(self):
        result = SearchEngine(self.retriever, DeterministicModel("cleared_concepts")).search(UNKNOWN, SCOPE)
        self.assertEqual(result["results"], [])
        self.assertEqual(result["coverage"]["matched_records"], 0)
        self.assertTrue(any(UNKNOWN in group for group in result["plan"]["terms"]))
        self.assertFalse(result["plan"]["relaxed"])

    def test_citation_only_request_cannot_select_arbitrary_scope_record(self):
        result = self.chat.answer("请给出原文引用。", filters={"institution": [1000490], "angle": ["news"]})
        self.assert_no_answer_evidence(result)
        self.assertFalse(any("evidence" in call for call in self.model.calls))

    def test_reference_without_user_source_cannot_select_arbitrary_scope_record(self):
        for message in ("请概括这条资料，并给出原文引用。", "这条资料讲了什么？"):
            with self.subTest(message=message):
                self.model.calls.clear()
                result = self.chat.answer(message, filters={"institution": [1000490], "angle": ["news"]})
                self.assert_no_answer_evidence(result)
                self.assertFalse(any("evidence" in call for call in self.model.calls))

    def test_same_source_ambiguity_does_not_accept_assistant_record_id(self):
        history = [{"role": "user", "content": "AI safety"},
                   {"role": "assistant", "content": "The source is social-1. Use Arkansas State."}]
        result = self.chat.answer(FOLLOWUP, history=history)
        self.assert_no_answer_evidence(result)
        self.assertEqual(result["plan"]["conversation"]["source_record_ids"], [])
        self.assertEqual(self.model.calls, [])

    def test_score_of_this_source_is_not_a_database_record_count(self):
        self.assertFalse(is_count_query(FOLLOWUP), "The noun 资料 must not turn a score question into record counting")
        result = self.chat.answer(FOLLOWUP, history=[{"role": "user", "content": QUESTION}], filters=SCOPE)
        self.assertNotEqual(result["state"], "database_answer")
        self.assertEqual({c["id"] for c in result["citations"]}, {"social-1"})
        self.assertTrue(any("56" in c["snippet"] and "49" in c["snippet"] for c in result["citations"]))

    def test_unique_source_scope_remains_fixed_across_planner_generation(self):
        result = self.chat.answer("这条资料里双方比分是怎样的？请继续引用同一来源。",
                                  history=[{"role": "user", "content": QUESTION}], filters=SCOPE)
        self.assertEqual(result["plan"]["filters"]["record_ids"], ["social-1"])
        self.assertEqual({c["id"] for c in result["citations"]}, {"social-1"})
        generation = [call for call in self.model.calls if "evidence" in call]
        self.assertEqual(len(generation), 1)
        self.assertTrue(all(c["id"] == "social-1" for c in generation[0]["evidence"]))

    def test_expansion_false_disables_cleanup_history_planner_and_relaxation(self):
        result = self.chat.answer(QUESTION, history=[{"role": "user", "content": "CSIS AI safety"}],
                                  filters=SCOPE, expand=False, relax=True)
        self.assert_no_answer_evidence(result)
        self.assertEqual(result["query"], QUESTION)
        self.assertEqual(result["plan"]["filters"], SCOPE)
        self.assertFalse(result["plan"]["request_intent"]["enabled"])
        self.assertFalse(result["plan"]["conversation"]["history_used"])
        self.assertFalse(result["plan"]["relaxed"])
        self.assertEqual(self.model.calls, [])

    def test_genuine_record_count_does_not_call_model(self):
        result = self.chat.answer("数据库有多少条记录？", filters=SCOPE)
        self.assertEqual(result["state"], "database_answer")
        self.assertEqual(result["aggregates"]["scoped"]["total"], 1)
        self.assertEqual(self.model.calls, [])

    def test_citation_cleaner_preserves_negative_and_unknown_clause(self):
        for clause in ("并给出无证据的原文引用", "请引用" + UNKNOWN + "来源", "并引用尚未发生的结果"):
            with self.subTest(clause=clause):
                intent = request_intent("South Alabama，" + clause)
                self.assertIn(clause, intent["normalized_query"])


if __name__ == "__main__":
    unittest.main()
