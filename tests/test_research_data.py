#!/usr/bin/env python3
"""Truthfulness checks for research metadata; stdlib only, run on social.

python3 -m unittest discover -s tests -p test_research_data.py -v
"""
from __future__ import annotations

import ast
import copy
import hashlib
import json
import subprocess
import sys
import unittest
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import build_research_data as research


class PublicationTruthTests(unittest.TestCase):
    def facebook(self, **raw_changes):
        raw = {"time": "2026-09-10T12:00:00Z", "timestamp": 1789041600,
               "postId": "123456789", "url": "https://www.facebook.com/example/posts/123456789"}
        raw.update(raw_changes)
        return {"platform": "Facebook", "publish_time": "", "content_id": "123456789",
                "content_url": "https://www.facebook.com/example/posts/123456789",
                "collected_time": "2026-09-24T12:00:00Z", "raw_json": repr(raw)}

    def test_verified_post_retains_raw_candidates_without_mutating_fields(self):
        fields = self.facebook()
        before = copy.deepcopy(fields)
        result = research.publication_metadata("social", fields)
        self.assertEqual(fields, before)
        self.assertEqual(result["original"], "")
        self.assertEqual(result["status"], "recovered")
        self.assertEqual(result["effective"], "2026-09-10T12:00:00Z")
        self.assertTrue(result["verified"])
        self.assertEqual([item["raw"] for item in result["candidates"]], ["2026-09-10T12:00:00Z", 1789041600])
        self.assertEqual(result["parser"], "ast.literal_eval")

    def test_nested_comment_and_media_dates_never_fill_publication(self):
        fields = self.facebook(time=None, timestamp=None,
                               topComments=[{"datePublished": "2026-09-10T12:00:00Z"}],
                               media=[{"publish_time": 1789041600}])
        result = research.publication_metadata("social", fields)
        self.assertEqual(result["status"], "missing")
        self.assertEqual(result["effective"], "")
        self.assertEqual(result["reason"], "no_top_level_post_date")

    def test_post_id_and_url_must_both_match(self):
        for changes, reason in (({"postId": "other"}, "post_identity_mismatch"),
                                ({"url": "https://www.facebook.com/other/posts/123456789"}, "post_url_mismatch")):
            with self.subTest(reason=reason):
                result = research.publication_metadata("social", self.facebook(**changes))
                self.assertEqual(result["status"], "unverified")
                self.assertEqual(result["effective"], "")
                self.assertTrue(result["candidate"])
                self.assertIn(reason, result["reason"])

    def test_conflicting_dates_and_postdating_collection_are_not_recovered(self):
        bad = [self.facebook(timestamp=1789041800), self.facebook(time="2030-01-01T00:00:00Z", timestamp=None)]
        for fields in bad:
            result = research.publication_metadata("social", fields)
            self.assertEqual(result["status"], "unverified")
            self.assertEqual(result["effective"], "")

    def test_linkedin_post_identity_in_url_is_required_and_comments_are_ignored(self):
        url = "https://www.linkedin.com/posts/example-topic-activity-123456789-abcd"
        raw = {"activityId": "123456789", "postUrl": url, "datePublished": "2026-09-10T12:00:00Z",
               "topComments": [{"datePublished": "2025-01-01T00:00:00Z"}]}
        fields = {"platform": "LinkedIn", "content_id": "123456789", "content_url": url,
                  "collected_time": "2026-09-24T12:00:00Z", "raw_json": json.dumps(raw)}
        result = research.publication_metadata("social", fields)
        self.assertEqual(result["status"], "recovered")
        self.assertEqual(result["effective"], raw["datePublished"])
        self.assertEqual(len(result["candidates"]), 1)
        raw["postUrl"] = fields["content_url"] = "https://www.linkedin.com/company/example"
        fields["raw_json"] = repr(raw)
        result = research.publication_metadata("social", fields)
        self.assertEqual(result["status"], "unverified")
        self.assertIn("activity_id_not_in_post_url", result["reason"])

    def test_provided_date_is_preserved_and_bad_provided_date_is_not_silently_replaced(self):
        fields = self.facebook()
        fields["publish_time"] = " 2025-02-03T10:12:00+01:00 "
        result = research.publication_metadata("social", fields)
        self.assertEqual(result["original"], fields["publish_time"])
        self.assertEqual(result["effective"], fields["publish_time"])
        self.assertFalse(result["verified"])
        self.assertEqual(result["status"], "provided")
        fields["publish_time"] = "unknown"
        result = research.publication_metadata("social", fields)
        self.assertEqual(result["status"], "unverified")
        self.assertEqual(result["original"], "unknown")
        self.assertEqual(result["effective"], "")

    def test_parser_handles_wrapped_literals_and_rejects_executable_code(self):
        for value in ("{'time': '2026-09-10', 'missing': None}", json.dumps("{'time': '2026-09-10', 'missing': None}")):
            parsed, _, status = research.parse_raw_json(value)
            self.assertEqual(status, "parsed")
            self.assertEqual(parsed["time"], "2026-09-10")
        parsed, _, status = research.parse_raw_json("__import__('os').system('exit 0')")
        self.assertIsNone(parsed)
        self.assertEqual(status, "raw_json_unparseable")


class MetadataAuditRegressionTests(unittest.TestCase):
    def test_about_news_and_events_are_not_person_profiles(self):
        cases = [
            ("https://example.org/about/news/new-scholarship.html", "news_article"),
            ("https://example.org/news/about-a-dozen-employees", "news_article"),
            ("https://example.org/randeurope/about/events/impact-forum.html", "event"),
            ("https://example.org/about-visa/newsroom/press-releases.releaseid.22496.html", "press_release"),
            ("https://example.org/about", "web_document"),
            ("https://example.org/about/history.html", "web_document"),
        ]
        for url, expected in cases:
            with self.subTest(url=url):
                self.assertEqual(research.document_type("clue", {"original_url": url})["candidate"], expected)

    def test_profiles_require_a_structural_path_segment(self):
        cases = [
            ("https://example.org/about/people/r/javier.html", "profile"),
            ("https://example.org/about-us/executive-team/shawn-henry", "profile"),
            ("https://example.org/person-in-custody-after-fire", "web_document"),
            ("https://example.org/staff-reductions-in-europe", "web_document"),
            ("https://example.org/about/people/research/example-report", "report"),
        ]
        for url, expected in cases:
            with self.subTest(url=url):
                self.assertEqual(research.document_type("clue", {"original_url": url})["candidate"], expected)

    def test_date_precision_and_timezone_are_preserved_without_inventing_time(self):
        for raw, expected in [
            ("2026-09-10", "2026-09-10"),
            ("2026-09-10T14:00:00.123456+02:00", "2026-09-10T12:00:00.123456Z"),
            ("2026-09-10T12:00:00.252Z", "2026-09-10T12:00:00.252Z"),
            ("2026-09-10T12:00:00", "2026-09-10T12:00:00"),
        ]:
            with self.subTest(raw=raw):
                self.assertEqual(research.normalized_datetime(research.parse_datetime(raw), raw), expected)

    def test_untrusted_strings_roundtrip_without_breaking_script_context(self):
        hostile = '</script><script>globalThis.__audit_xss=1</script><img src=x onerror="globalThis.__audit_xss=2">' + "\u2028\u2029"
        payload = {"records": {"fixture": {"publication": {"original": hostile}}}, "label": '\";globalThis.__audit_xss=3;//'}
        encoded = research.encode(payload)
        decoded = json.loads(encoded.split("=", 1)[1].strip().removesuffix(";"))
        self.assertEqual(decoded, payload)
        for character in ("<", ">", "&", "\u2028", "\u2029"):
            self.assertNotIn(character, encoded)


class SnapshotTruthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.meta, cls.rows, _ = research.read_snapshot(ROOT / "data")
        cls.payload, _ = research.load_assignment(ROOT / "data/research.js", "window.ZGCLAB_RESEARCH")
        cls.records = cls.payload["records"]
        cls.raw_by_id = {record["id"]: (angle, record, fields) for angle, record, fields in cls.rows}

    def test_snapshot_scope_ids_detail_references_and_source_version(self):
        self.assertEqual(self.payload["source"]["version"], self.meta["version"])
        self.assertEqual(self.payload["source"]["package"], self.meta["source_package"])
        self.assertEqual(self.payload["source"]["generated_at"], self.meta["generated_at"])
        self.assertEqual(self.payload["source"]["totals"], self.meta["totals"])
        self.assertFalse(self.payload["source"]["simulation_included"])
        self.assertEqual(len(self.records), 6989)
        self.assertEqual(set(self.records), set(self.raw_by_id))
        for identifier, (angle, record, fields) in self.raw_by_id.items():
            derived = self.records[identifier]
            self.assertEqual(derived["evidence"]["chunk"], record["_detail"])
            self.assertEqual(derived["publication"]["original"], fields.get("publish_time") or "")
            self.assertEqual(derived["evidence"]["original_chars"], len(fields[research.FIELD_MAP[angle]["original_body"]]))

    def test_exact_placeholder_counts_come_from_full_translations(self):
        counts = Counter()
        for identifier, (angle, _, fields) in self.raw_by_id.items():
            raw = fields[research.FIELD_MAP[angle]["translated_body"]].strip()
            expected = "placeholder" if raw == "无法翻译" else "available" if raw else "missing"
            self.assertEqual(self.records[identifier]["translation"]["status"], expected)
            if expected == "placeholder":
                counts[angle] += 1
        self.assertEqual(dict(counts), {"news": 29, "clue": 288, "social": 8})
        self.assertEqual(self.payload["quality"]["counts"]["translation_placeholder"], 325)
        self.assertEqual(self.payload["quality"]["counts"]["translation_missing"], 0)

    def test_all_626_recoveries_have_matching_top_level_post_evidence(self):
        counts = Counter()
        original_missing = unresolved = 0
        for identifier, (_, _, fields) in self.raw_by_id.items():
            derived = self.records[identifier]
            original_missing += not derived["publication"]["original"]
            unresolved += derived["publication"]["status"] in ("missing", "unverified")
            if derived["publication"]["status"] != "recovered":
                continue
            platform = fields["platform"]
            raw = ast.literal_eval(fields["raw_json"])
            counts[platform] += 1
            identity_key, url_key, time_key = ("postId", "url", "time") if platform == "Facebook" else ("activityId", "postUrl", "datePublished")
            self.assertEqual(str(raw[identity_key]), fields["content_id"])
            self.assertEqual(raw[url_key], fields["content_url"])
            expected = research.parse_datetime(raw[time_key])
            actual = research.parse_datetime(derived["publication"]["effective"])
            self.assertEqual(expected, actual)
            self.assertEqual(derived["publication"]["candidates"][0]["raw"], raw[time_key])
        self.assertEqual(dict(counts), {"Facebook": 607, "LinkedIn": 19})
        self.assertEqual(original_missing, 1018)
        self.assertEqual(unresolved, 392)

    def test_coverage_counts_and_recent_observation_use_collection_not_publication(self):
        cells = self.payload["coverage"]["cells"]
        self.assertEqual(len(cells), len(self.meta["institutions"]) * 6)
        for cell in cells:
            members = [(angle, record, fields) for angle, record, fields in self.rows
                       if record["ktid"] == cell["ktid"] and angle == cell["angle"]
                       and (cell["platform"] is None or fields["platform"] == cell["platform"])]
            self.assertEqual(cell["count"], len(members))
            latest_field = "collected_time" if cell["angle"] == "social" else "discovery_time" if cell["angle"] == "clue" else "founddate"
            values = [f[latest_field] for _, _, f in members if f.get(latest_field)]
            expected = max(values, key=research.date_number) if values else None
            target = "latest_collected_at" if cell["angle"] == "social" else "latest_discovered_at"
            self.assertEqual(cell[target], expected)
            self.assertEqual(cell["monitoring_status"], "not_connected")
        self.assertEqual(sum(c["count"] for c in cells if c["platform"] is None), 6989)
        self.assertEqual(sum(c["count"] for c in cells if c["platform"] is not None), 1846)
        self.assertIsNone(self.payload["coverage"]["collection_window"])

    def test_source_paths_hashes_and_field_missingness_are_not_fabricated(self):
        for identifier, (angle, _, fields) in self.raw_by_id.items():
            evidence = self.records[identifier]["evidence"]
            if angle == "clue":
                self.assertEqual(evidence["original_path"], fields["report_path"])
                self.assertNotIn("source_hash", evidence)
            elif angle == "social":
                self.assertEqual(evidence["source_hash"]["value"], fields["content_hash"])
                self.assertEqual(evidence["source_hash"]["algorithm"], "unspecified")
                self.assertNotIn("original_path", evidence)
            else:
                self.assertNotIn("original_path", evidence)
                self.assertNotIn("source_hash", evidence)

    def test_clue_same_url_groups_retain_all_bodies_as_candidate_versions(self):
        exact = defaultdict(list)
        for angle, record, fields in self.rows:
            if angle == "clue":
                exact[fields["original_url"]].append(record["id"])
        duplicates = {url: ids for url, ids in exact.items() if len(ids) > 1}
        self.assertEqual(len(duplicates), 12)
        self.assertEqual(self.payload["versions"]["exact_clue_duplicate_url_groups"], 12)
        for url, ids in duplicates.items():
            group = next(g for g in self.payload["versions"]["groups"] if g["canonical_url"] == research.canonical_url(url))
            self.assertEqual(group["status"], "candidate_different_versions")
            members = {m["id"]: m for m in group["members"]}
            self.assertTrue(set(ids) <= set(members))
            for identifier in ids:
                raw = self.raw_by_id[identifier][2]["original_content"]
                self.assertEqual(members[identifier]["snapshot_original_sha256"], hashlib.sha256(raw.encode()).hexdigest())

    def test_related_groups_require_link_or_substantive_title_evidence(self):
        self.assertFalse(self.payload["related"]["automatic_event_merge"])
        for group in self.payload["related"]["groups"]:
            self.assertTrue(2 <= len(group["members"]) <= 20)
            self.assertTrue(set(group["members"]) <= set(self.records))
            self.assertIn(group["basis"], {"same_normalized_source_url", "same_normalized_substantive_title"})
            if group["basis"] == "same_normalized_source_url":
                keys = {self.records[identifier]["source_key"] for identifier in group["members"]}
                self.assertEqual(len(keys), 1)
                self.assertNotIn("", keys)
            else:
                titles = []
                for identifier in group["members"]:
                    angle, _, fields = self.raw_by_id[identifier]
                    title = fields.get(research.FIELD_MAP[angle]["original_title"]) or ""
                    if not title and angle == "social":
                        title = next(line.strip() for line in fields["original_content"].splitlines() if line.strip())
                    titles.append(research.normalized_title(title))
                self.assertEqual(len(set(titles)), 1)
                self.assertGreaterEqual(len(titles[0]), 35)


    def test_all_fulltext_fingerprints_match_exact_complete_detail_fields(self):
        checked = Counter()
        for identifier, (angle, _, fields) in self.raw_by_id.items():
            hashes = self.records[identifier]["fingerprints"]
            self.assertEqual(set(hashes), {"original", "translation"})
            for key, field in (("original", research.FIELD_MAP[angle]["original_body"]),
                               ("translation", research.FIELD_MAP[angle]["translated_body"])):
                value = fields.get(field)
                body = "" if value is None else str(value)
                self.assertEqual(hashes[key], hashlib.sha256(body.encode("utf-8")).hexdigest(), (identifier, key))
                self.assertRegex(hashes[key], r"^[a-f0-9]{64}$")
            checked[angle] += 1
        self.assertEqual(dict(checked), {"news": 3675, "clue": 1468, "social": 1846})

    def test_fulltext_hashes_preserve_whitespace_empty_and_placeholder_values(self):
        fields = {"content": "  full body\r\nwith whitespace ", "content_cn": "无法翻译"}
        actual = research.fulltext_fingerprints("news", fields)
        self.assertEqual(actual["original"], hashlib.sha256(fields["content"].encode()).hexdigest())
        self.assertEqual(actual["translation"], hashlib.sha256("无法翻译".encode()).hexdigest())
        trimmed = research.fulltext_fingerprints("news", {**fields, "content": fields["content"].strip()})
        self.assertNotEqual(actual["original"], trimmed["original"])
        self.assertEqual(research.fulltext_fingerprints("news", {})["original"], hashlib.sha256(b"").hexdigest())

    def test_same_length_tail_only_body_and_translation_changes_reach_changes_view(self):
        angle, row, fields = next((angle, row, fields) for angle, row, fields in self.rows
                                 if angle == "news" and len(fields["content"]) > 3000 and len(fields["content_cn"]) > 3000)
        original_changed = {**fields, "content": fields["content"][:-1] + ("Y" if fields["content"][-1] == "X" else "X")}
        translation_changed = {**fields, "content_cn": fields["content_cn"][:-1] + ("Y" if fields["content_cn"][-1] == "X" else "X")}
        self.assertEqual(len(original_changed["content"]), len(fields["content"]))
        self.assertEqual(len(translation_changed["content_cn"]), len(fields["content_cn"]))
        self.assertEqual(original_changed["content"][:3000], fields["content"][:3000])
        self.assertEqual(translation_changed["content_cn"][:3000], fields["content_cn"][:3000])
        baseline = self.records[row["id"]]
        body_revision = {**baseline, "fingerprints": research.fulltext_fingerprints(angle, original_changed)}
        translation_revision = {**baseline, "fingerprints": research.fulltext_fingerprints(angle, translation_changed)}
        self.assertNotEqual(baseline["fingerprints"]["original"], body_revision["fingerprints"]["original"])
        self.assertNotEqual(baseline["fingerprints"]["translation"], translation_revision["fingerprints"]["translation"])
        payload = {"angle": angle, "row": row, "meta": self.meta, "baseline": baseline,
                   "bodyRevision": body_revision, "translationRevision": translation_revision}
        script = r"""
const assert = require('node:assert/strict');
const ui = require('./research.js');
let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  const p = JSON.parse(input), entries = [{angle:p.angle,r:p.row}];
  const snapshot = extra => ui.snapshotFor(entries,p.meta,{records:{[p.row.id]:extra}},'2026-11-08T00:00:00Z');
  const baseline = snapshot(p.baseline), body = snapshot(p.bodyRevision), translation = snapshot(p.translationRevision);
  assert.equal(baseline.fullFingerprintCount,1);
  assert.deepEqual(ui.compareSnapshots(baseline,body).map(c=>c.kinds),[['content']]);
  assert.deepEqual(ui.compareSnapshots(baseline,translation).map(c=>c.kinds),[['translation']]);
  console.log(JSON.stringify({id:p.row.id,fullFingerprintCount:1,bodyTailChange:'content',translationTailChange:'translation'}));
});
"""
        result = subprocess.run(["node", "-e", script], input=json.dumps(payload, ensure_ascii=False),
                                cwd=ROOT, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["id"], row["id"])

    def test_artifact_is_deterministic_and_does_not_embed_full_bodies(self):
        rebuilt = research.build(ROOT / "data")
        self.assertEqual(rebuilt, self.payload)
        content = (ROOT / "data/research.js").read_text()
        self.assertEqual(content, research.encode(rebuilt))
        self.assertLess(len(content.encode()), 7 * 1024 * 1024)
        # A full original body must stay in its existing lazy-loaded detail.
        long_body = next(fields[research.FIELD_MAP[angle]["original_body"]] for angle, _, fields in self.rows
                         if len(fields[research.FIELD_MAP[angle]["original_body"]]) > 10000)
        self.assertNotIn(long_body, content)


if __name__ == "__main__":
    unittest.main()
