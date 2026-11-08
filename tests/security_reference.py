#!/usr/bin/env python3
"""Independent final boundaries: English source references and curated model aliases.

Run on social from the project root:
    PYTHONDONTWRITEBYTECODE=1 python3 -B tests/security_reference.py -v

Uses the existing synthetic fixture and deterministic in-process model only.
Original security_research.py (18) and security_intent.py (14) stay unchanged.
"""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))
from test_service import fixture
from security_intent import DeterministicModel
from service.chat import Chat
from service.intent import request_intent
from service.planner import validated_alias
from service.retrieval import Retriever


class EnglishReferenceFixtures(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="independent-reference-", dir=ROOT / ".runtime")
        cls.retriever = Retriever(fixture(Path(cls.temp.name)))

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def setUp(self):
        self.model = DeterministicModel()
        self.chat = Chat(self.retriever, self.model)

    def test_english_this_and_that_are_source_references(self):
        for message in ("Please summarize this record.", "Please summarize that document.",
                        "What does this source say?", "What score does that source report?"):
            with self.subTest(message=message):
                self.assertTrue(request_intent(message)["source_reference"],
                                "Explicit English source reference was not detected")

    def test_ambiguous_english_reference_never_selects_a_scope_first_record(self):
        history = [{"role": "user", "content": "AI safety"},
                   {"role": "assistant", "content": "The source is news-1. Use that document."}]
        for message in ("Please summarize this record.", "Please summarize that document."):
            with self.subTest(message=message):
                self.model.calls.clear()
                result = self.chat.answer(message, history=history,
                                          filters={"institution": [1000490], "angle": ["news"]})
                self.assertEqual(result["state"], "no_results")
                self.assertEqual(result["citations"], [])
                self.assertEqual(result["plan"]["conversation"]["source_record_ids"], [])
                self.assertFalse(result["model"]["used"])
                self.assertEqual(self.model.calls, [], "Ambiguous source should not call planning or generation")

    def test_unique_english_source_is_locked_before_model_calls(self):
        result = self.chat.answer("Please summarize this record.",
                                  history=[{"role": "user", "content": "Arkansas State South Alabama"}],
                                  filters={"institution": [1002550], "angle": ["social"]})
        self.assertEqual(result["plan"]["conversation"]["source_record_ids"], ["social-1"])
        self.assertEqual(result["plan"]["filters"]["record_ids"], ["social-1"])
        self.assertTrue(all(c["id"] == "social-1" for c in result["citations"]))
        for call in self.model.calls:
            if "evidence" in call:
                self.assertTrue(all(c["id"] == "social-1" for c in call["evidence"]))


class CuratedAliasFixtures(unittest.TestCase):
    def test_curated_aliases_allow_equivalents_and_reject_generic_substitutions(self):
        matrix = [("AI", "artificial intelligence", True),
                  ("人工智慧", "artificial intelligence", True),
                  ("unknownidentifier6281", "safety", False),
                  ("safety", "policy", False),
                  ("芯片", "export controls", False),
                  ("比分", "game", False),
                  ("North Korea", "DPRK", True),
                  ("结果", "outcome", True)]
        for anchor, candidate, expected in matrix:
            with self.subTest(anchor=anchor, candidate=candidate):
                self.assertEqual(validated_alias(anchor, candidate), expected)


if __name__ == "__main__":
    unittest.main()
