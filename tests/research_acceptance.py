#!/usr/bin/env python3
"""Independent research acceptance. Run on social after integration build is ready.

Preparation (does not launch a browser or write reports):
  python3 tests/research_acceptance.py --selectors
  python3 tests/research_acceptance.py --list

Full acceptance: launch in a new tmux session, logging to /home/ubuntu/log:
  ZGCLAB_TEST_URL=http://127.0.0.1:8789/ python3 tests/research_acceptance.py
--mode data|ui|mock isolates checks. Omitted checks are SKIP, never PASS.
Artifacts default to /home/ubuntu/log/zgclab-research-acceptance/<unique-run>.
A later backup-only fix can be independently verified without new model calls:
  --mode backup-restore --restore-backup <prior-real-backup.json>
  --prior-report <prior-full-results.json> --expect-manifest <new-manifest-id>
  --report reports/research-acceptance-backup-supplement.json
This supplement preserves the earlier report and does not claim a new full suite.
Only a fresh browser context's own workspace is edited. Raw data is read only.
Original/translation line segmentation is not semantic paragraph alignment.
"""
from __future__ import annotations
import argparse
import ast
import csv
import hashlib
import io
import json
import os
import re
import shutil
import sys
import subprocess
import time
import traceback
from collections import Counter
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
ANGLES = ("news", "clue", "social")
TOTALS = {"news": 3675, "clue": 1468, "social": 1846}
RAW_BASELINE = "e67148800703e0b755fd2d569ab1fe9c96dbcfacff6009472a58d1e0bbca98dc"
BODY = {"news": "content", "clue": "original_content", "social": "original_content"}
TRANS = {"news": "content_cn", "clue": "chinese_trans", "social": "chinese_translation"}
SOURCE = {"news": "url", "clue": "original_url", "social": "content_url"}
NINETY = {"angle": "news", "ids": "1000580", "from": "2024-01-31", "to": "2024-10-27"}
XSS = '<img id="qa-research-xss" src="x" onerror="window.__researchQAXSS=1">'
ROUTES = {
 "projects": ("/projects", "#projectsNew"),
 "assistant": ("/assistant", "#asQuestion"),
 "evidence": ("/evidence?angle=social&id=social-1", "#researchReadingMode"),
 "related": ("/related?angle=clue&id=clue-1", "#relatedCount"),
 "changes": ("/changes", "#researchChangesCount"),
 "coverage": ("/coverage", "#researchCoverageCount"),
 "collection-plan": ("/collection-plan", "#collectionPlanCount"),
 "quality": ("/quality", "[data-quality='translation_placeholder']"),
}
SELECTORS = {
 "projects.js": "projectsNew projectsImport projectMarkdown projectGenerateReport projectExportJson projectExportCsv projectExportMarkdown",
 "research.js": "researchReadingMode copyResearchCitation relatedCount relationGroupName createRelationGroup researchChangesCount changesScope saveChangeSubscription coverageInstitution coverageAngle coverageIssue exportCoverage planCategory exportCollectionPlan",
 "assistant.js": "asQuestion asSubmit asSearchTab asChatTab asTranscript asServiceStatus asKeep asExport asCancel",
 "explorer.js": "addResultsProject askResults exCount exportResults saveQuery",
 "app.js": "addRecordProject backupWorkspace importWorkspace",
 "access.js": "accessPassword accessSubmit lockSession",
}


def load(path):
    prefix, sep, payload = path.read_text(encoding="utf-8").partition("=")
    assert sep and prefix.strip().startswith("window.ZGCLAB_"), path.name
    return json.loads(payload.strip().removesuffix(";"))


def digest_raw():
    meta = load(ROOT / "data/meta.js")
    files = [ROOT / "data/meta.js", *[ROOT / f"data/{a}.js" for a in ANGLES], *sorted((ROOT / "data/details" / meta["version"]).glob("*.js"))]
    digest = hashlib.sha256()
    for path in files:
        digest.update(str(path.relative_to(ROOT)).encode() + b"\0" + path.read_bytes() + b"\0")
    return digest.hexdigest(), len(files)


def stamp(value):
    if isinstance(value, (int, float)):
        return value / (1000 if abs(value) > 1e11 else 1)
    dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return dt.replace(tzinfo=dt.tzinfo or timezone.utc).timestamp()


def day(value):
    if not value: return ""
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return dt.astimezone(ZoneInfo("Asia/Shanghai")).date().isoformat() if dt.tzinfo else value[:10]


def canonical(value):
    p = urlsplit(str(value or ""))
    return urlunsplit(("https", (p.hostname or "").lower().removeprefix("www."), p.path.rstrip("/"), p.query, ""))


def parts(value):
    return [p.strip() for p in re.split(r"\n\s*\n|\n", str(value or "").replace("\r\n", "\n").replace("\r", "\n")) if p.strip()]


def number(value):
    return int(str(value).replace(",", "").strip())


class Reference:
    """Read full delivery fields independently, without application module imports."""
    def __init__(self):
        self.meta = load(ROOT / "data/meta.js")
        self.research = load(ROOT / "data/research.js")
        self.rows = {a: load(ROOT / f"data/{a}.js") for a in ANGLES}
        self.ids = {r["id"]: (a, r) for a in ANGLES for r in self.rows[a]}
        self.fields = {d["id"]: d["fields"] for p in sorted((ROOT / "data/details" / self.meta["version"]).glob("*.js")) for d in load(p)}
        self.institutions = {str(i["ktid"]): i for i in self.meta["institutions"]}
        self.placeholders = {i for i, (a, _) in self.ids.items() if str(self.fields[i].get(TRANS[a], "")).strip() == "无法翻译"}
        self.recovered = {i for i, r in self.research["records"].items() if r["publication"]["status"] == "recovered"}

    def expected(self, params):
        result = set()
        for identifier, (a, r) in self.ids.items():
            if params.get("angle", "all") not in ("all", a): continue
            if params.get("ids") and str(r["ktid"]) not in params["ids"].split(","): continue
            if params.get("platforms") and (a != "social" or r.get("platform") not in params["platforms"].split(",")): continue
            if params.get("accountHandles") and r.get("account_handle", "").lower().lstrip("@") != params["accountHandles"].lower().lstrip("@"): continue
            d = day(r.get("publish_time"))
            if params.get("from") or params.get("to"):
                if not d or params.get("from") and d < params["from"] or params.get("to") and d > params["to"]: continue
            result.add(identifier)
        return result

    def citation(self, item):
        identifier = item.get("id") or item.get("record_id")
        assert identifier in self.ids and not identifier.startswith("sim-"), ("not real", identifier)
        a, row = self.ids[identifier]; f = self.fields[identifier]
        assert item.get("angle") == a and str(item.get("ktid")) == str(row["ktid"]), identifier
        sources = {"original_text": f.get(BODY[a]), "translation": f.get(TRANS[a]), "title": f.get("title_cn") or f.get("clue_title") or f.get("title"), "title_en": f.get("title_en"), "summary": f.get("summary_cn") or f.get("clue_summary"), "summary_en": f.get("summary_en")}
        excerpt = item.get("snippet") or item.get("excerpt") or ""
        assert excerpt and excerpt in str(sources.get(item.get("field")) or ""), (identifier, item.get("field"), "not a source substring")
        assert isinstance(item.get("paragraph"), int) and item["paragraph"] > 0, identifier
        assert item.get("source_url") and canonical(item["source_url"]) in {canonical(f[k]) for k in ("url", "original_url", "source_url", "content_url") if f.get(k)}, identifier
        assert item.get("source_version") == self.meta["version"], identifier
        for quote in item.get("quotes", []): assert quote and quote in excerpt, identifier
        return {k: item.get(k) for k in ("citation_id", "id", "angle", "field", "paragraph", "snippet", "source_url", "source_version", "quotes")}


class QA:
    def __init__(self, args):
        self.args = args
        self.base = os.environ.get("ZGCLAB_TEST_URL", "http://127.0.0.1:8789/").split("#")[0].rstrip("/") + "/"
        self.run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + str(os.getpid())
        self.out = Path(os.environ.get("ZGCLAB_TEST_ARTIFACTS", "/home/ubuntu/log/zgclab-research-acceptance")) / self.run_id
        self.out.mkdir(parents=True, exist_ok=False)
        self.password = ""; self.page = self.browser = self.ref = None
        self.active_check = None
        self.checks = []; self.errors = []; self.js_errors = []; self.network = []
        self.status = {}; self.chat_count = 0; self.sequence = 0
        self.project_id = ""; self.backup = None; self.selected = []; self.answers = []

    def safe(self, value):
        if isinstance(value, dict): return {k: "[REDACTED]" if re.fullmatch(r"password|authorization|(?:access_)?token|api[_-]?key|cookie", str(k), re.I) else self.safe(v) for k, v in value.items()}
        if isinstance(value, (list, tuple)): return [self.safe(v) for v in value]
        return value.replace(self.password, "[REDACTED]") if isinstance(value, str) and self.password else value

    def json(self, name, value):
        path = self.out / name
        path.write_text(json.dumps(self.safe(value), ensure_ascii=False, indent=2), encoding="utf-8")
        return str(path)

    def shot(self, name):
        self.sequence += 1
        path = self.out / f"{self.sequence:03d}-{name}.png"
        self.page.screenshot(path=str(path), mask=[self.page.locator("#accessPassword,#asServicePassword")])
        assert path.stat().st_size > 1000
        return str(path)

    def case(self, key, label, action=None, needs=(), section="ui"):
        self.active_check = key
        item = {"id": key, "check": label, "section": section}; start = time.monotonic()
        missing = [k for k in needs if self.status.get(k) != "PASS"]
        if action is None: item.update(status="SKIP", reason="Section omitted by --mode")
        elif missing: item.update(status="BLOCKED", prerequisites=missing)
        else:
            try:
                evidence = action()
                assert isinstance(evidence, dict) and evidence, "PASS requires nonempty evidence"
                item.update(status="PASS", evidence=evidence)
            except Exception as error:
                item.update(status="FAIL", error=self.safe(str(error) or type(error).__name__), traceback=self.safe("".join(traceback.format_exception(type(error), error, error.__traceback__))))
                if self.page:
                    try:
                        item["screenshot"] = self.shot(key + "-failure")
                        item["page"] = self.safe(self.page.evaluate("({url:location.href,text:document.body.innerText.slice(0,6000)})"))
                    except Exception: pass
                self.errors.append({"id": key, "error": item["error"]})
        item["elapsed_seconds"] = round(time.monotonic() - start, 3)
        self.status[key] = item["status"]; self.checks.append(item)
        print(json.dumps(self.safe(item), ensure_ascii=False), flush=True); self.report()

    def report(self):
        c = Counter(i["status"] for i in self.checks)
        return self.json("results.json", {"target": self.base, "run_id": self.run_id, "tested_at": datetime.now(timezone.utc).isoformat(), "mode": self.args.mode, "passed": c["PASS"], "failed": c["FAIL"], "blocked": c["BLOCKED"], "skipped": c["SKIP"], "errors": self.errors, "page_errors": self.js_errors, "real_chat_requests": self.chat_count, "real_chat_budget": 3, "build": getattr(self, "build", {}), "protected_manifest": getattr(self, "protected_manifest", None), "supplement": getattr(self, "supplement", None), "acceptance_complete": self.args.mode == "all" and bool(self.checks) and not any(c[k] for k in ("FAIL", "BLOCKED", "SKIP")), "checks": self.checks, "network": self.network, "artifacts": str(self.out)})

    def raw(self):
        digest, count = digest_raw()
        assert digest == RAW_BASELINE, {"expected": RAW_BASELINE, "actual": digest}
        assert self.ref.meta["totals"] == TOTALS and {a: len(r) for a, r in self.ref.rows.items()} == TOTALS
        assert len(self.ref.ids) == 6989 and set(self.ref.ids) == set(self.ref.fields)
        return {"sha256": digest, "files": count, "counts": TOTALS, "version": self.ref.meta["version"]}

    def metadata(self):
        source = self.ref.research["source"]; records = self.ref.research["records"]
        assert source["total"] == 6989 and source["version"] == self.ref.meta["version"] and source["simulation_included"] is False
        assert set(records) == set(self.ref.ids)
        for identifier, (a, row) in self.ref.ids.items():
            item = records[identifier]
            assert item["angle"] == a and str(item["ktid"]) == str(row["ktid"]), identifier
            assert item["publication"]["original"] == self.ref.fields[identifier].get("publish_time", ""), identifier
        return {"records": len(records), "key_format": "records[id]", "source_version": source["version"]}

    def fingerprints(self):
        count = 0
        for identifier, (a, row) in self.ref.ids.items():
            f = self.ref.fields[identifier]
            hashes = self.ref.research["records"][identifier].get("fingerprints", {})
            for key, field in (("original", BODY[a]), ("translation", TRANS[a])):
                expected = hashlib.sha256(str(f.get(field) or "").encode("utf-8")).hexdigest()
                assert hashes.get(key) == expected, (identifier, key, "missing or incorrect full text SHA-256")
            count += 1
        assert count == 6989
        return {"full_original_and_translation_sha256": count, "algorithm": "SHA-256 of exact UTF-8 complete delivery field strings", "source_version": self.ref.meta["version"]}

    def change_fixture(self):
        # Execute the real comparison module against a standalone in-memory fixture.
        # It never edits the actual snapshot, sidecar, or browser workspace.
        script = r"""
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const R = require('./research.js');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const original = 'full body '.repeat(500) + 'TAIL_A';
const entries = [{angle:'clue',r:{id:'qa-fixture-1',ktid:1001290,title:'Fixture',original_content:original.slice(0,180),chinese_trans:'无法翻译',_has_translation:true,original_url:'https://example.invalid/qa',publish_time:''}}];
const sidecar = {records:{'qa-fixture-1':{angle:'clue',translation:{status:'placeholder'},publication:{original:'',effective:'',status:'missing'},fingerprints:{original:hash(original),translation:hash('无法翻译')},evidence:{original_chars:original.length,translation_chars:4,missing:['publish_time']}}}};
const meta = {version:'qa-fixture-version'};
const baseline = R.snapshotFor(entries,meta,sidecar,'2026-11-08T00:00:00Z');
assert.equal(baseline.fullFingerprintCount,1);
assert.equal(baseline.records['clue:qa-fixture-1'].translated,false);
const compact = R.compactSnapshot(baseline);
assert.deepEqual(R.compareSnapshots(compact,R.snapshotFor(entries,meta,sidecar)),[]);
const tail = JSON.parse(JSON.stringify(sidecar));
tail.records['qa-fixture-1'].fingerprints.original = hash(original.slice(0,-1)+'B');
const tailChanges = R.compareSnapshots(compact,R.snapshotFor(entries,meta,tail));
assert.equal(tailChanges.length,1); assert.ok(tailChanges[0].kinds.includes('content'));
const translated = JSON.parse(JSON.stringify(sidecar));
translated.records['qa-fixture-1'].translation.status = 'available';
translated.records['qa-fixture-1'].fingerprints.translation = hash('QA fixture new complete translation');
const translationChanges = R.compareSnapshots(compact,R.snapshotFor(entries,meta,translated));
assert.equal(translationChanges.length,1); assert.ok(translationChanges[0].kinds.includes('translated'));
console.log(JSON.stringify({fixture_only:true,fullFingerprintCount:baseline.fullFingerprintCount,unchanged:0,tail_change:tailChanges[0].kinds,placeholder_to_translation:translationChanges[0].kinds,compact_utf16_bytes:R.storageBytes(compact)}));
"""
        result = subprocess.run(["node", "-e", script], cwd=ROOT, text=True, capture_output=True, timeout=20)
        assert result.returncode == 0, result.stderr[-3000:]
        return json.loads(result.stdout)

    def translations(self):
        actual = {i for i, r in self.ref.research["records"].items() if r["translation"]["status"] == "placeholder"}
        assert actual == self.ref.placeholders and len(actual) == 325
        assert self.ref.research["quality"]["counts"]["translation_available"] == 6664
        return {"placeholders": 325, "available": 6664, "by_angle": dict(Counter(self.ref.ids[i][0] for i in actual)), "examples": sorted(actual)[:6]}

    def dates(self):
        assert len(self.ref.recovered) == 626
        for identifier in sorted(self.ref.recovered):
            a, row = self.ref.ids[identifier]; f = self.ref.fields[identifier]
            p = self.ref.research["records"][identifier]["publication"]
            assert a == "social" and not f.get("publish_time") and p["verified"] is True, identifier
            raw = f["raw_json"]
            for _ in range(4):
                if isinstance(raw, dict): break
                try: raw = json.loads(raw)
                except (ValueError, TypeError): raw = ast.literal_eval(raw)
            assert isinstance(raw, dict), identifier
            platform = str(f["platform"]).lower()
            identity, url_key, keys = ("postId", "url", ("time", "timestamp")) if platform == "facebook" else ("activityId", "postUrl", ("datePublished",))
            assert platform in ("facebook", "linkedin") and str(raw.get(identity)) == str(f["content_id"]), identifier
            assert canonical(raw.get(url_key)) == canonical(f["content_url"]), identifier
            dates = [stamp(raw[k]) for k in keys if raw.get(k) not in (None, "")]
            assert dates and all(abs(stamp(p["effective"]) - d) <= 1 for d in dates), identifier
            assert p["basis"] and p["candidates"], identifier
        missing = sum(not f.get("publish_time") for f in self.ref.fields.values())
        assert missing == 1018 and missing - len(self.ref.recovered) == 392
        return {"original_missing": 1018, "recovered": 626, "unresolved": 392, "basis": "matched original top-level post ID, URL and response date; raw publish_time unchanged"}

    def coverage_data(self):
        cov = self.ref.research["coverage"]; cells = cov["cells"]
        expected = {(i, a, None) for i in self.ref.institutions for a in ANGLES} | {(i, "social", p) for i in self.ref.institutions for p in cov["platforms"]}
        assert {(str(c["ktid"]), c["angle"], c.get("platform")) for c in cells} == expected
        for c in cells:
            rows = [r for r in self.ref.rows[c["angle"]] if str(r["ktid"]) == str(c["ktid"]) and (c.get("platform") is None or r.get("platform") == c["platform"])]
            assert c["count"] == len(rows), c
            for key, field in (("latest_collected_at", "collected_time"), ("latest_discovered_at", "discovery_time" if c["angle"] == "clue" else "founddate")):
                values = [self.ref.fields[r["id"]].get(field) for r in rows if self.ref.fields[r["id"]].get(field)]
                assert c.get(key) == (max(values, key=stamp) if values else None), (c["ktid"], c["angle"], key)
        assert cov["monitoring_status"] == "not_connected" and cov["collection_window"] is None
        return {"institutions": 20, "cells": len(cells), "zero_cells": sum(c["count"] == 0 for c in cells), "platforms": cov["platforms"], "monitoring": "not_connected"}

    def simulation_data(self):
        rows = {a: load(ROOT / f"data/simulation/{a}.js") for a in ANGLES}
        ids = {r["id"] for rs in rows.values() for r in rs}
        assert sum(map(len, rows.values())) == len(ids) == 30000 and not ids.intersection(self.ref.ids)
        assert all(r["id"].startswith("sim-") and r.get("platform") == "test" for r in rows["social"])
        return {"total": 30000, "counts": {a: len(rs) for a, rs in rows.items()}, "social_platforms": ["test"]}

    @contextmanager
    def context(self, real=True):
        context = self.browser.new_context(viewport={"width": 1440, "height": 1000}, accept_downloads=True)
        page = context.new_page(); previous = self.page; self.page = page
        page.set_default_timeout(int(os.environ.get("ZGCLAB_TEST_TIMEOUT_MS", "30000")))
        page.on("pageerror", lambda error: self.js_errors.append({"message": self.safe(str(error)), "stack": self.safe(error.stack), "url": self.safe(page.url)}))
        page.on("response", lambda response: setattr(self, "protected_manifest", response.url.rsplit("/",1)[-1]) if re.search(r"manifest-[a-f0-9]+\.json$",response.url) else None)
        page.on("response", lambda response: self.network.append({"path": urlsplit(response.url).path, "status": response.status}) if "/api/" in urlsplit(response.url).path else None)
        if not real:
            def mock_service(route):
                endpoint = urlsplit(route.request.url).path
                if endpoint.endswith("/api/session"):
                    payload = {"token": "qa-controlled-render-only", "expires_in": 1800}
                elif endpoint.endswith("/api/status"):
                    payload = {"database": "ready", "dataset": "real", "aggregates": {"total": 6989}, "llm": {"available": False, "model": "QA mock status"}}
                else:
                    route.abort("blockedbyclient"); return
                route.fulfill(status=200, content_type="application/json", body=json.dumps(payload))
            context.route(re.compile(r".*/api/(?:session|status|search|chat)(?:\?.*)?$"), mock_service)
        if real:
            def budget(route):
                if self.chat_count >= 3:
                    self.js_errors.append("QA blocked fourth real chat request"); route.abort("blockedbyclient")
                elif self.active_check == "assistant_no_evidence" and route.request.post_data_json.get("expand") is not False:
                    self.js_errors.append("QA blocked no-evidence chat with model expansion enabled"); route.abort("blockedbyclient")
                else:
                    self.chat_count += 1; route.continue_()
            context.route(re.compile(r".*/api/chat(?:\?.*)?$"), budget)
        try: yield page
        finally: self.page = previous; context.close()

    def unlock_page(self, route="/overview", initial=True):
        if initial: self.page.goto(self.base + "#" + route, wait_until="domcontentloaded")
        self.page.locator("#accessForm").wait_for(state="visible")
        assert self.page.evaluate("!window.ZGCLAB_META && !sessionStorage.getItem('zgclab.access.key.v1')")
        self.page.locator("#accessPassword").fill(self.password); self.page.locator("#accessSubmit").click()
        self.page.wait_for_function("!!window.ZGCLAB_META && !!document.querySelector('#lockSession')")
        self.page.locator("#view h1").wait_for()
        self.build = self.page.evaluate("({manifest:window.ZGCLAB_META?.version,research:window.ZGCLAB_RESEARCH?.version,assets:[...document.querySelectorAll('script[src]')].map(s=>s.src)})")

    def go(self, route, selector=None):
        self.page.evaluate("hash=>{location.hash=hash}", "#" + route)
        self.page.locator(selector or "#view h1").wait_for(state="visible")
        assert not self.page.locator("#view .inline-error:visible").count(), self.page.locator("#view").inner_text()[:1000]

    def query(self, params):
        if self.page.locator("#includeSimulation").is_checked(): self.page.locator("#includeSimulation").uncheck()
        self.go("/explore?" + urlencode({"angle": "all", **params}))
        self.page.wait_for_function("document.querySelector('#exCount')?.dataset.query===location.hash.split('?')[1] && !document.querySelector('#exError')?.textContent")

    def workspace(self): return self.page.evaluate("JSON.parse(localStorage.getItem('zgclab.workspace.v1') || '{}')")
    def project(self): return next(p for p in self.workspace().get("projects", []) if p["id"] == self.project_id)
    def project_page(self): self.go("/projects?id=" + self.project_id, "#projectMarkdown")

    def wait_store(self, expression, arg=None):
        self.page.wait_for_function("arg=>{const ws=JSON.parse(localStorage.getItem('zgclab.workspace.v1')||'{}');return (" + expression + ")}", arg=arg)

    def download(self, locator, extension):
        with self.page.expect_download() as event: locator.click()
        self.sequence += 1; target = self.out / f"{self.sequence:03d}-download.{extension}"
        event.value.save_as(str(target)); assert target.stat().st_size > 0
        return target, target.read_text(encoding="utf-8-sig")

    def export_ids(self, expected):
        path, text = self.download(self.page.locator("#exportResults"), "csv")
        rows = list(csv.DictReader(io.StringIO(text))); ids = [r["记录ID"] for r in rows]
        assert len(ids) == len(set(ids)) and set(ids) == expected, {"actual": len(ids), "expected": len(expected), "difference": sorted(set(ids) ^ expected)[:10]}
        return {"records": len(ids), "csv": str(path)}

    def upload(self, selector, payload):
        self.page.locator(selector).set_input_files({"name": "qa-import.json", "mimeType": "application/json", "buffer": json.dumps(payload, ensure_ascii=False).encode()})

    def modal_submit(self):
        dialog = self.page.locator("dialog.projects-dialog[open]"); dialog.wait_for()
        dialog.locator("button[type=submit]").click(); dialog.wait_for(state="detached")

    def clipboard(self):
        self.page.evaluate("""()=>{window.__researchQAClipboard='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__researchQAClipboard=String(value)}}})}""")

    def copied(self):
        self.page.wait_for_function("!!window.__researchQAClipboard")
        return self.page.evaluate("window.__researchQAClipboard")

    def unlock(self):
        self.unlock_page()
        assert not self.page.locator("#includeSimulation").is_checked()
        assert self.page.evaluate("window.ZGCLAB_META.version") == self.ref.meta["version"]
        return {"version": self.ref.meta["version"], "simulation_default": False, "screenshot": self.shot("unlocked")}

    def query_regression(self):
        evidence = []
        for params in [{"angle": "all"}, *[{"angle": a} for a in ANGLES], {"angle": "social", "accountHandles": "ArkansasState", "platforms": "X"}, NINETY]:
            self.query(params); evidence.append({"conditions": params, **self.export_ids(self.ref.expected(params))})
        assert len(self.ref.expected(NINETY)) == 90
        self.page.locator("#saveQuery").click()
        self.wait_store("ws.queries?.some(q=>q.hash.includes('ids=1000580') && q.hash.includes('2024-01-31'))")
        self.page.locator("#openFilters").focus(); self.page.keyboard.press("Enter")
        assert self.page.locator("#exFilterDialog").evaluate("el=>el.open && el.matches(':modal')")
        self.page.keyboard.press("Escape")
        assert self.page.locator("#openFilters").evaluate("el=>el===document.activeElement")
        return {"queries": evidence, "saved_query": True, "filter_focus_restored": True}

    def project_focus(self):
        self.go("/projects", "#projectsNew"); button = self.page.locator("#projectsNew")
        button.focus(); self.page.keyboard.press("Enter"); dialog = self.page.locator("dialog.projects-dialog[open]")
        try:
            assert dialog.evaluate("el=>el.matches(':modal') && el.contains(document.activeElement)"), "Opening modal must move focus inside"
            dialog.locator("button[type=submit]").focus(); self.page.keyboard.press("Tab")
            focus = self.page.evaluate("({tag:document.activeElement.tagName,id:document.activeElement.id,inside:!!document.activeElement.closest('dialog.projects-dialog'),visible:document.activeElement.getBoundingClientRect().height>0})")
            assert focus["inside"] and focus["visible"], {"action": "Tab from last submit button", "focus": focus}
            self.page.keyboard.press("Escape")
            assert button.evaluate("el=>el===document.activeElement"), "Escape must restore trigger focus"
            return {"modal_focus_trap": True, "escape_restores_trigger": True}
        finally:
            if dialog.count(): self.page.keyboard.press("Escape")

    def project_create(self):
        self.go("/projects", "#projectsNew"); self.page.locator("#projectsNew").click()
        dialog = self.page.locator("dialog.projects-dialog[open]"); name = "QA 专题 " + XSS
        dialog.locator("[name=name]").fill(name); dialog.locator("[name=description]").fill("独立验收自有专题 " + XSS)
        self.modal_submit(); self.page.locator("#projectMarkdown").wait_for()
        self.wait_store("ws.projects?.some(p=>p.name===arg)", name)
        self.project_id = next(p["id"] for p in self.workspace()["projects"] if p["name"] == name)
        assert self.project()["name"] == name and not self.page.locator("#qa-research-xss").count()
        assert not self.page.evaluate("window.__researchQAXSS||0")
        return {"project_id": self.project_id, "literal_user_text": True, "screenshot": self.shot("project-created")}

    def project_add(self):
        self.query(NINETY); self.page.locator("#addResultsProject").click()
        self.page.locator("dialog.projects-dialog[open] [name=project]").select_option(self.project_id); self.modal_submit()
        expected = self.ref.expected(NINETY); assert {i["id"] for i in self.project()["items"]} == expected
        self.query({"angle": "social", "accountHandles": "ArkansasState"})
        self.page.locator("#exBody tr[data-id='social-1']").click()
        self.page.wait_for_function("document.querySelector('#detailStatus')?.textContent.includes('已载入完整交付记录')")
        for route in ("evidence", "related", "assistant"): assert self.page.locator(f".modal a[href^='#/{route}?']").count() == 1
        self.page.locator("#addRecordProject").click()
        self.page.locator("dialog.projects-dialog[open] [name=project]").select_option(self.project_id); self.modal_submit()
        assert len(self.project()["items"]) == 91 and {i["id"] for i in self.project()["items"]} == expected | {"social-1"}
        self.page.locator("#addResultsProject").click(); self.modal_submit(); assert len(self.project()["items"]) == 91
        self.project_page()
        return {"filter_records_added": 90, "detail_record": "social-1", "total": 91, "duplicate_skipped": True, "screenshot": self.shot("project-materials")}

    def project_edit(self):
        self.project_page(); first = self.page.locator("#projectMaterials [data-material]").first
        key = first.get_attribute("data-material"); identifier = key.split(":", 1)[1]
        first.locator("summary").click(); note = "QA 核查批注 " + XSS
        first.locator("[data-item-field=note]").fill(note)
        first.locator("[data-item-field=excerpt]").fill("QA 重点摘录\n" + self.ref.fields[identifier]["content"][:100])
        first.locator("[data-item-field=status]").select_option("verified"); first.locator("[data-item-action=down]").click()
        self.wait_store("ws.projects.find(p=>p.id===arg.project).items[1].note===arg.note", {"project": self.project_id, "note": note})
        assert self.project()["items"][1]["id"] == identifier
        self.page.locator(f"[data-material='{key}'] [data-item-field=selected]").uncheck()
        self.wait_store("ws.projects.find(p=>p.id===arg).items.filter(i=>i.selected).length===90", self.project_id)
        self.selected = [i["id"] for i in self.project()["items"] if i["selected"]]
        for _ in range(4): self.page.locator("#projectMaterialPager button").last.click()
        assert self.page.locator("[data-material='social:social-1']").count() == 1
        self.page.locator("#projectMaterialSearch").fill("social-1")
        assert self.page.locator("#projectMaterials [data-material]").count() == 1
        return {"total": 91, "selected": 90, "edited_record": key, "last_page_record": "social-1", "note_status_order_persisted": True}

    def project_report(self):
        self.page.locator("#projectGenerateReport").click()
        self.page.wait_for_function("document.querySelector('#projectMarkdown')?.value.includes('## 引用清单')")
        text = self.page.locator("#projectMarkdown").input_value()
        assert len(re.findall(r"^### \d+\.", text, re.M)) == 90
        assert len(re.findall(r"^\d+\. \[", text.split("## 引用清单", 1)[1], re.M)) == 90
        actual = re.findall(r"#/record/(?:news|clue|social)/([a-z0-9._:-]+)", text.split("## 引用清单", 1)[0])
        assert actual == self.selected, {"actual_count": len(actual), "expected_count": len(self.selected)}
        for item in self.project()["items"]:
            if item["selected"]: assert item["dataVersion"] == self.ref.meta["version"] and item["url"] in text, item["id"]
        assert "&lt;img" in text and "<img" not in text
        assert len(self.project()["report"]["materialKeys"]) == 90
        return {"visible_filtered_materials": 1, "draft_materials": 90, "reference_list": 90, "ordered_ids": actual, "markdown_sha256": hashlib.sha256(text.encode()).hexdigest(), "screenshot": self.shot("project-report-90")}

    def project_backup(self):
        self.project_page(); edited = self.page.locator("#projectMarkdown").input_value() + "\nQA 人工编辑 " + XSS
        self.page.locator("#projectMarkdown").fill(edited); self.go("/overview", "#view h1")
        self.page.reload(wait_until="domcontentloaded"); self.unlock_page(initial=False); self.project_page()
        assert self.page.locator("#projectMarkdown").input_value() == edited
        files = {}
        for selector, ext in (("#projectExportJson", "json"), ("#projectExportCsv", "csv"), ("#projectExportMarkdown", "md")):
            path, text = self.download(self.page.locator(selector), ext); files[ext] = str(path)
            if ext == "json": self.backup = json.loads(text); assert self.backup["projects"][0] == self.project()
            elif ext == "csv":
                rows = list(csv.DictReader(io.StringIO(text)))
                assert len(rows) == 91 and {r["记录ID"] for r in rows} == {i["id"] for i in self.project()["items"]}
            else: assert text == edited
        before = self.workspace()["projects"]; self.upload("#projectsImport", self.backup); self.modal_submit()
        assert self.workspace()["projects"] == before
        bad = json.loads(json.dumps(self.backup)); bad["projects"][0]["items"][0]["angle"] = "invalid"
        self.upload("#projectsImport", bad); self.page.wait_for_function("document.body.innerText.includes('材料角度无效')")
        assert self.workspace()["projects"] == before and not self.page.locator("#qa-research-xss").count()
        return {"downloads": files, "edited_markdown_persisted": True, "idempotent_import": True, "invalid_import_atomic": True}

    def old_backup(self):
        before = self.workspace()["projects"]
        old = {"version": 1, "favorites": [{"angle": "social", "id": "social-1", "ktid": 1002550, "title": "QA legacy favorite", "date": "2026-10-09"}], "queries": [{"name": "QA legacy query", "hash": "/explore?angle=social&accountHandles=ArkansasState"}]}
        self.go("/workspace", "#backupWorkspace"); self.upload("#importWorkspace", old)
        self.wait_store("ws.favorites?.some(i=>i.id==='social-1') && ws.queries?.some(i=>i.name==='QA legacy query')")
        assert self.workspace()["projects"] == before
        return {"version": 1, "missing_optional_projects_accepted": True, "preserved_projects": len(before), "favorites": len(self.workspace()["favorites"])}

    def evidence(self):
        evidence = []
        for a, identifier in (("social", "social-1"), ("clue", "clue-1")):
            self.go(f"/evidence?angle={a}&id={identifier}", "#researchReadingMode"); fields = self.ref.fields[identifier]
            for side, field in (("original", BODY[a]), ("translation", TRANS[a])):
                actual = self.page.locator(f"[data-reading='{side}'] .research-paragraph > p").all_text_contents()
                assert actual == parts(fields[field]), (identifier, field, len(actual), len(parts(fields[field])))
            assert "不代表 PDF 页码" in self.page.locator("#researchBody").inner_text()
            assert not self.page.get_by_text(re.compile(r"解析第 \d+ 页")).count()
            self.clipboard(); self.page.locator("[data-copy-paragraph='original-1']").click(); copied = self.copied()
            for value in (identifier, self.ref.meta["version"], fields[SOURCE[a]], parts(fields[BODY[a]])[0]): assert value in copied
            assert "p=original-1" in copied and not re.search(r"(?:第\s*\d+\s*页|p\.\s*\d+)", copied)
            self.page.locator("[data-paragraph-anchor='original-1']").focus(); self.page.keyboard.press("Enter")
            assert self.page.locator("#research-original-1").evaluate("el=>el===document.activeElement")
            self.page.locator("#researchReadingMode").select_option("translation")
            assert self.page.locator("[data-reading=original]").is_hidden()
            self.page.locator("#researchReadingMode").select_option("parallel")
            evidence.append({"id": identifier, "original_paragraphs": len(parts(fields[BODY[a]])), "translation_paragraphs": len(parts(fields[TRANS[a]])), "copied_reference": copied, "screenshot": self.shot("evidence-" + identifier)})
        return {"records": evidence, "alignment": "independent source line segmentation; semantic alignment is not claimed"}

    def evidence_quality(self):
        placeholder = next(i for i in sorted(self.ref.placeholders) if i.startswith("clue-"))
        self.go(f"/evidence?angle=clue&id={placeholder}", "#researchReadingMode")
        assert "占位" in self.page.locator("[data-reading=translation]").inner_text()
        assert self.page.locator(".research-warning[role=status]").is_visible()
        self.clipboard(); self.page.locator("[data-copy-paragraph='translation-1']").click()
        assert "不可作译文引用" in self.copied()
        recovered = sorted(self.ref.recovered)[0]
        self.go(f"/evidence?angle=social&id={recovered}", "#researchReadingMode")
        text = self.page.locator(".research-provenance").last.inner_text()
        publication = self.ref.research["records"][recovered]["publication"]
        assert publication["effective"] in text and "raw_json." in text and "校验" in text
        assert "交付未声明算法" in text
        return {"placeholder_record": placeholder, "recovered_record": recovered, "effective_date": publication["effective"], "recovery_basis": publication["basis"], "screenshot": self.shot("evidence-recovery")}

    def related(self):
        self.go("/related?angle=clue&id=clue-1", "#relatedCount")
        assert "候选" in self.page.locator("#researchBody").inner_text()
        self.page.locator("#relationGroupName").fill("QA 人工分组 " + XSS)
        self.page.locator("#createRelationGroup").click(); self.wait_store("ws.relations?.length>0")
        group_id = self.page.locator("#relationGroup").input_value()
        if not self.page.locator("[data-save-relation]").count():
            group = next(g for g in self.ref.research["related"]["groups"] if any(i.startswith("clue-") for i in g["members"]))
            seed = next(i for i in group["members"] if i.startswith("clue-"))
            self.go(f"/related?angle=clue&id={seed}", "#relatedCount"); self.page.locator("#relationGroup").select_option(group_id)
        card = self.page.locator(".research-related-card").first; card.wait_for()
        assert card.locator(".research-reasons li").count() > 0
        target = parse_qs(card.locator("h3 a").get_attribute("href").split("?", 1)[1]); identifier = target["id"][0]
        assert identifier in self.ref.ids
        card.locator("[data-save-relation]").click()
        self.wait_store("ws.relations.find(g=>g.id===arg.group).records.some(i=>i.id===arg.id)", {"group": group_id, "id": identifier})
        self.page.locator(".research-saved-relation").filter(has=self.page.locator(f"a[href*='id={identifier}']")).locator("[data-remove-relation]").click()
        assert all(i["id"] != identifier for i in next(g for g in self.workspace()["relations"] if g["id"] == group_id)["records"])
        self.page.locator("#manualRelationAngle").select_option("social"); self.page.locator("#manualRelationId").fill("social-1")
        self.page.locator("#addManualRelation").click(); self.page.locator("#addManualRelation").click()
        records = next(g for g in self.workspace()["relations"] if g["id"] == group_id)["records"]
        assert sum(i["id"] == "social-1" for i in records) == 1
        self.page.reload(wait_until="domcontentloaded"); self.unlock_page(initial=False); self.page.locator("#relatedCount").wait_for()
        assert any(i["id"] == "social-1" for i in next(g for g in self.workspace()["relations"] if g["id"] == group_id)["records"])
        assert not self.page.locator("#qa-research-xss").count()
        return {"group_id": group_id, "candidate_confirmed_then_removed": identifier, "manual_real_record": "social-1", "persisted_members": records, "screenshot": self.shot("related-reviewed")}

    def changes(self):
        assert not self.workspace().get("researchChanges", {}).get("real", {}).get("baseline"), "First-visit check requires fresh browser baseline"
        self.go("/changes", "#researchChangesCount"); text = self.page.locator("#researchChangesCount").inner_text()
        assert re.search(r"匹配\s*0\s*条", text) and re.search(r"共\s*0\s*条", text), text
        assert "首次" in self.page.locator("#researchBaselineNotice").inner_text()
        state = self.workspace()["researchChanges"]["real"]; assert state["baseline"]["total"] == 6989
        self.go("/overview", "#view h1"); self.go("/changes", "#researchChangesCount")
        assert "完整快照共 0 条变化" in self.page.locator("#researchChangesCount").inner_text()
        query_options = self.page.locator("#changesScope option").evaluate_all("els=>els.filter(el=>el.value.startsWith('q:')).map(el=>({value:el.value,text:el.textContent}))")
        assert query_options, "Saved query must be available as a change subscription"
        self.page.locator("#changesScope").select_option(query_options[0]["value"])
        self.page.locator("#changesKind").select_option("added"); self.page.locator("#changesNotify").check()
        self.page.locator("#saveChangeSubscription").click()
        saved = self.workspace()["researchChanges"]["real"]["subscription"]
        assert saved["scope"] == "query" and saved["kind"] == "added" and saved["notify"] is True and saved["queryHash"]
        self.go("/watchlist", "[data-watch='1000110']"); self.page.locator("[data-watch='1000110']").check()
        self.go("/changes", "#researchChangesCount"); assert self.page.locator("#changesKind").input_value() == "added"
        self.page.locator("#changesScope").select_option("watchlist"); self.page.locator("#saveChangeSubscription").click()
        self.go("/overview", "#view h1"); self.go("/changes", "#researchChangesCount")
        assert self.page.locator("#changesScope").input_value() == "watchlist"
        assert "匹配 0 条变化" in self.page.locator("#researchChangesCount").inner_text()
        return {"baseline_records": 6989, "first_changes": 0, "same_snapshot_changes": 0, "saved_query_subscription": saved, "watchlist_subscription": self.workspace()["researchChanges"]["real"]["subscription"], "screenshot": self.shot("changes-zero")}

    def changes_hashes(self):
        self.go("/changes", "#researchChangesCount")
        state = self.workspace()["researchChanges"]["real"]
        baseline = state["baseline"]
        assert baseline["total"] == baseline.get("fullFingerprintCount") == 6989, {"total": baseline.get("total"), "fullFingerprintCount": baseline.get("fullFingerprintCount"), "visible": self.page.locator("#researchBody").inner_text()[:1200]}
        assert baseline.get("compact") is True and len(baseline["records"]) == 6989
        encoded = json.dumps(baseline, ensure_ascii=False, separators=(",", ":"))
        utf8_bytes = len(encoded.encode("utf-8")); utf16_bytes = len(encoded.encode("utf-16-le"))
        assert utf16_bytes < 2 * 1024 * 1024, utf16_bytes
        visible = self.page.locator("#researchBody").inner_text()
        assert "全文指纹" in visible and "比较完整原文与译文" in visible and "6,989/6,989" in visible, visible[:1200]
        self.page.reload(wait_until="domcontentloaded"); self.unlock_page(initial=False)
        self.page.locator("#researchChangesCount").wait_for()
        assert "完整快照共 0 条变化" in self.page.locator("#researchChangesCount").inner_text()
        assert self.workspace()["researchChanges"]["real"]["baseline"]["fullFingerprintCount"] == 6989
        return {"baseline_records": 6989, "full_fingerprints": 6989, "compact": True, "utf8_bytes": utf8_bytes, "utf16_bytes": utf16_bytes, "refresh_changes": 0, "screenshot": self.shot("changes-full-hashes")}

    def coverage(self):
        self.go("/coverage", "#researchCoverageCount"); gaps = {}
        for key, count in (("publish_time", 1018), ("effective_date", 392), ("translation", 325)):
            self.page.locator("#coverageIssue").select_option(key); text = self.page.locator("#researchCoverageCount").inner_text()
            assert re.search(r"缺失\s*" + f"{count:,}" + r"\s*条", text), (key, text)
            gaps[key] = count
        self.page.locator("#coverageIssue").select_option("sources"); measurements = []
        for ktid in self.ref.institutions:
            self.page.locator("#coverageInstitution").select_option(ktid)
            for a in ANGLES:
                self.page.locator("#coverageAngle").select_option(a)
                rows = [r for r in self.ref.rows[a] if str(r["ktid"]) == ktid]
                text = self.page.locator("#researchCoverageCount").inner_text()
                assert re.search(r"当前范围\s*" + f"{len(rows):,}" + r"\s*条", text), (ktid, a, text)
                actual = self.page.locator("#coverageSources tbody tr").evaluate_all("els=>els.map(el=>[...el.querySelectorAll('td')].map(td=>td.innerText))")
                expected = [c for c in self.ref.research["coverage"]["cells"] if str(c["ktid"]) == ktid and c["angle"] == a]
                assert len(actual) == len(expected), (ktid, a, "missing aggregate or zero-platform cells")
                for rendered, cell in zip(actual, expected):
                    assert len(rendered) == 6 and number(rendered[2]) == cell["count"], (ktid, a, rendered)
                    assert (cell.get("platform") or "角度汇总") in rendered[0]
                    assert rendered[4] == (cell.get("latest_collected_at") or cell.get("latest_discovered_at") or "未提供")
                    assert self.ref.meta["generated_at"] not in rendered[4]
                    assert "未接入" in rendered[5] and "未配置" in rendered[5]
                    assert f"恢复 {cell['publication']['recovered']:,}" in rendered[3]
                measurements.append({"ktid": ktid, "angle": a, "records": len(rows), "observed_cells": len(actual), "zero_cells": sum(c["count"] == 0 for c in expected)})
        self.page.locator("#coverageInstitution").select_option(""); self.page.locator("#coverageAngle").select_option("all")
        path, text = self.download(self.page.locator("#exportCoverage"), "csv"); exported = list(csv.DictReader(io.StringIO(text)))
        assert len(exported) == 6989 and {r["记录ID"] for r in exported} == set(self.ref.ids)
        for r in exported:
            p = self.ref.research["records"][r["记录ID"]]["publication"]
            assert r["发布时间原值"] == p["original"] and r["恢复日期"] == (p["effective"] if p["status"] == "recovered" else "")
        return {"known_gaps": gaps, "measurements": measurements, "institution_angle_platform_counts": True, "csv": str(path), "screenshot": self.shot("coverage")}

    def plan(self):
        self.go("/collection-plan", "#collectionPlanCount"); categories = self.page.locator("#planCategory option").all_text_contents()
        assert len(categories) == 5
        text = self.page.locator("#collectionPlanList").inner_text(); assert all(t in text for t in ("报告", "活动", "人员", "关系", "多时点"))
        for category in ("integrity", "coverage", "documents", "relations"):
            self.page.locator("#planCategory").select_option(category); assert self.page.locator(".research-plan-card").count() > 0
        self.page.locator("#planCategory").select_option("all")
        for identifier in ("report-parsing", "interaction-history"): self.page.locator(f"[data-create-plan='{identifier}']").click()
        self.page.locator("[data-plan-status='report-parsing']").select_option("doing")
        self.page.locator("[data-plan-note='report-parsing']").fill("QA 真实报告页码 " + XSS); self.page.locator("[data-plan-note='report-parsing']").blur()
        self.go("/overview", "#view h1"); self.go("/collection-plan", "#collectionPlanCount")
        tasks = self.workspace()["collectionPlan"]["tasks"]
        assert tasks["report-parsing"]["status"] == "doing" and XSS in tasks["report-parsing"]["note"]
        assert tasks["interaction-history"]["status"] == "todo" and not self.page.locator("#qa-research-xss").count()
        path, text = self.download(self.page.locator("#exportCollectionPlan"), "csv"); rows = list(csv.DictReader(io.StringIO(text)))
        report = next(r for r in rows if r["建议ID"] == "report-parsing")
        assert report["本地待办状态"] == "进行中" and XSS in report["备注"]
        assert "不会启动采集" in self.page.locator("#researchBody").inner_text()
        return {"categories": categories[1:], "tasks": tasks, "export_rows": len(rows), "csv": str(path), "screenshot": self.shot("plan")}

    def quality(self):
        self.go("/quality", "[data-quality='translation_placeholder']")
        expected = {"publish_time": 1018, "recovered_time": 626, "unresolved_time": 392, "translation": 325, "translation_placeholder": 325}; evidence = {}
        for key, count in expected.items():
            card = self.page.locator(f"[data-quality='{key}']"); assert number(card.locator("b").inner_text()) == count
            card.click(); assert f"{count:,} 条" in self.page.locator("#qualityRecords h2").inner_text()
            ids = self.page.locator("#qualityRecords [data-id]").evaluate_all("els=>els.map(el=>el.dataset.id)")
            assert ids and set(ids).issubset(self.ref.ids)
            if key == "recovered_time": assert set(ids).issubset(self.ref.recovered)
            if key in ("translation", "translation_placeholder"): assert set(ids).issubset(self.ref.placeholders)
            evidence[key] = {"count": count, "applicable": card.locator("small").inner_text(), "visible_ids": ids}
        assert "缺可用中文正文" in self.page.locator("[data-quality=translation]").inner_text()
        self.page.locator("#includeSimulation").check()
        self.page.wait_for_function("window.ZGCLAB_SIM_META && document.querySelector('#simulationStatus')?.hidden===false && document.querySelector('[data-quality=recovered_time]')")
        for key in ("recovered_time", "unresolved_time"):
            card = self.page.locator(f"[data-quality='{key}']")
            assert number(card.locator("b").inner_text()) == expected[key] and "6,989" in card.locator("small").inner_text()
        self.page.locator("#includeSimulation").uncheck(); self.query({"angle": "social", "platforms": "test"})
        assert self.page.locator("#exportResults").is_disabled()
        return {"cards": evidence, "simulation_excluded_from_recovery_denominator": True, "test_platform_real_hits": 0}

    def submit_api(self, question, kind="chat"):
        path = "/api/" + kind
        self.page.locator("#asQuestion").fill(question)
        with self.page.expect_response(lambda r: urlsplit(r.url).path.endswith(path) and r.request.method == "POST", timeout=125000) as event:
            self.page.locator("#asSubmit").click()
        response = event.value; payload = response.json(); request = response.request.post_data_json
        self.page.wait_for_function("!document.querySelector('#asSubmit')?.disabled", timeout=125000)
        self.sequence += 1
        artifact = self.json(f"{self.sequence:03d}-api-{kind}.json", {"status": response.status, "request": request, "response": payload})
        assert response.status == 200, {"status": response.status, "response": payload, "artifact": artifact}
        assert not self.page.locator("#asPasswordDialog").evaluate("el=>el.open"), "Site unlock must be reused by service"
        return payload, request, artifact

    def visible_citations(self, payload, container):
        raw = payload.get("citations", payload.get("results", [])); assert raw, "No real citations returned"
        evidence = [self.ref.citation(i) for i in raw]
        cards = container.locator(".as-evidence:not(.as-aggregate)")
        assert cards.count() == len(raw), (cards.count(), len(raw))
        for index, item in enumerate(raw):
            card = cards.nth(index)
            assert card.locator(".as-excerpt").inner_text() == (item.get("snippet") or item.get("excerpt"))
            assert card.locator(f"a[href='#/record/{item['angle']}/{item['id']}']").count() >= 1
            assert canonical(card.locator("a[target=_blank]").get_attribute("href")) == canonical(item["source_url"])
            assert card.get_attribute("data-as-citation") == item["citation_id"], "UI citation relabeled"
        return evidence

    def assistant_aggregate(self):
        self.go("/assistant?mode=chat&ids=1002550&expand=0", "#asQuestion")
        self.page.locator("#asExpand").uncheck()
        payload, request, artifact = self.submit_api("阿肯色州立大学共有多少条记录？")
        assert payload.get("state") == "database_answer" and payload["model"].get("used") is False, payload
        aggregates = payload["aggregates"]
        assert aggregates["scoped"]["total"] == 221 and aggregates["scoped"]["by_angle"] == {"news":100,"clue":120,"social":1}
        assert "[A1]" in payload["answer"]
        turn = self.page.locator("#asTranscript .as-turn").last
        assert "221" in turn.inner_text() and turn.locator("[data-as-citation=A1]").count() == 1
        turn.locator(".as-citation-ref").filter(has_text="[A1]").focus(); self.page.keyboard.press("Enter")
        assert turn.locator("[data-as-citation=A1]").evaluate("el=>el===document.activeElement")
        return {"model_used":False,"database_total":221,"by_angle":aggregates["scoped"]["by_angle"],"visible_answer":turn.inner_text(),"response_artifact":artifact,"screenshot":self.shot("assistant-count-221")}

    def assistant_search_empty(self):
        self.go("/assistant?mode=search&expand=0&semantic=0", "#asQuestion")
        self.page.locator("#asExpand").uncheck()
        if self.page.locator("#asSemantic").count(): self.page.locator("#asSemantic").uncheck()
        payload, request, artifact = self.submit_api("qazxresearchabsent9d87ac632b45e701", "search")
        assert not payload.get("results") and payload["coverage"]["matched_records"] == 0
        assert self.page.locator("#asSearchResults .as-evidence:not(.as-aggregate)").count() == 0
        assert re.search("没有匹配|没有找到|未找到",self.page.locator("#asSearchResults").inner_text())
        return {"model_used":payload.get("model",{}),"matched_records":0,"visible_state":self.page.locator("#asSearchResults").inner_text(),"response_artifact":artifact,"screenshot":self.shot("assistant-empty-search")}

    def assistant_search(self):
        self.go("/assistant?mode=search&angle=social&ids=1002550&semantic=0", "#asQuestion")
        if self.page.locator("#asSemantic").count(): self.page.locator("#asSemantic").uncheck()
        payload, request, artifact = self.submit_api("Arkansas State South Alabama", "search")
        assert payload["coverage"]["dataset"] == "real" and payload["coverage"]["database_total"] == 6989
        assert payload["aggregates"]["scope"]["source_version"] == self.ref.meta["version"]
        evidence = self.visible_citations(payload, self.page.locator("#asSearchResults"))
        assert all(i["id"] == "social-1" for i in evidence)
        assert not self.page.locator("#asError").is_visible(), self.page.locator("#asErrorText").inner_text()
        if self.project_id:
            before = len(self.project()["items"])
            self.page.locator("#asSearchResults").get_by_role("button", name=re.compile("加入专题")).click()
            self.page.locator("dialog.projects-dialog[open] [name=project]").select_option(self.project_id); self.modal_submit()
            assert len(self.project()["items"]) == before
        return {"source": "real service response observed in browser", "request": request, "coverage": payload["coverage"], "citations": evidence, "response_artifact": artifact, "screenshot": self.shot("assistant-search")}

    def answer(self, question, followup=False):
        if not followup:
            self.go("/assistant?mode=chat&angle=social&ids=1002550", "#asQuestion"); self.page.locator("#asKeep").check()
        payload, request, artifact = self.submit_api(question); self.answers.append(payload)
        assert payload.get("state") == "answered", {"state": payload.get("state"), "model": payload.get("model"), "answer": payload.get("answer")}
        model = payload.get("model", {})
        assert model.get("used") is True and re.search(r"deepseek.*flash", str(model.get("id", "")), re.I), model
        turn = self.page.locator("#asTranscript .as-turn").last
        text = turn.locator(".as-markdown").inner_text()
        assert re.sub(r"\s+", " ", payload["answer"].strip()) == re.sub(r"\s+", " ", text.strip()), "Visible answer differs from service answer"
        evidence = self.visible_citations(payload, turn)
        assert turn.locator(".as-citation-ref").count() > 0
        for item in payload["citations"]: assert item.get("quotes"), "Claims require verifiable source quotes"
        button = turn.locator(".as-citation-ref").first; label = button.inner_text().strip("[]")
        button.focus(); self.page.keyboard.press("Enter")
        assert turn.locator(f"[data-as-citation='{label}']").evaluate("el=>el===document.activeElement")
        if followup:
            assert len(request.get("history", [])) >= 2 and any(h.get("role") == "user" and "South Alabama" in h.get("content", "") for h in request["history"])
            assert self.page.locator("#asTranscript .as-turn").count() == 2
        return {"model": model, "question": question, "visible_answer": text, "verified_citations": evidence, "history_messages": len(request.get("history", [])), "response_artifact": artifact, "screenshot": self.shot("assistant-followup" if followup else "assistant-real-answer")}

    def assistant_answer(self):
        return self.answer("请概括 Arkansas State 对阵 South Alabama 的比赛结果，并给出原文引用。")

    def assistant_followup(self):
        return self.answer("这条资料里双方比分是怎样的？请继续引用同一来源。", followup=True)

    def assistant_no_evidence(self):
        self.go("/assistant?mode=chat&expand=0&semantic=0", "#asQuestion")
        self.page.locator("#asExpand").uncheck()
        payload, request, artifact = self.submit_api("qazxresearchabsent9d87ac632b45e701"); self.answers.append(payload)
        assert payload.get("state") == "no_results" and not payload.get("citations"), payload
        assert re.search(r"证据不足|未检索到|不能回答|无法回答", payload.get("answer", ""))
        turn = self.page.locator("#asTranscript .as-turn").last; text = turn.inner_text()
        assert payload["answer"] in text and not turn.locator(".as-evidence:not(.as-aggregate)").count()
        assert payload["model"].get("used") is False
        return {"state": payload["state"], "visible_answer": text, "record_citations": 0, "chat_requests": self.chat_count, "response_artifact": artifact, "screenshot": self.shot("assistant-no-evidence")}

    def workspace_backup(self):
        self.go("/workspace", "#backupWorkspace")
        path, text = self.download(self.page.locator("#backupWorkspace"), "json"); payload = json.loads(text)
        keys = ["projects", "relations", "researchChanges", "collectionPlan"]
        if not self.args.no_live: keys.append("chatSessions")
        for key in keys: assert payload.get(key), (key, "missing from backup")
        expected = {k: payload[k] for k in keys}
        with self.context():
            self.unlock_page("/workspace"); self.upload("#importWorkspace", payload)
            self.wait_store("ws.projects?.some(p=>p.id===arg)", self.project_id)
            for key, value in expected.items(): assert self.workspace().get(key) == value, (key, "backup failed round trip")
            self.project_page(); assert len(self.project()["items"]) == 91
        return {"json": str(path), "restored_fields": keys, "project_materials": 91, "fresh_context_restore": True}

    def quickswitch(self):
        routes = ["/assistant", "/evidence?angle=clue&id=clue-1", "/coverage", "/related?angle=clue&id=clue-1", "/changes", "/collection-plan", "/projects"] * 3
        self.page.evaluate("""async routes=>{for(const route of routes){location.hash='#'+route;await new Promise(resolve=>requestAnimationFrame(resolve));}await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}""", routes)
        self.page.locator("#projectsNew").wait_for()
        assert self.page.locator("#view h1").inner_text() == "专题资料夹"
        assert not self.page.locator("dialog[open],.modal,.as-root,[data-research-root]").count()
        assert self.page.evaluate("!document.body.classList.contains('filter-window-open')")
        return {"transitions": len(routes), "final_route": self.page.evaluate("location.hash"), "screenshot": self.shot("quickswitch")}

    def layout(self, width, name):
        route, ready = ROUTES[name]
        self.page.set_viewport_size({"width": width, "height": 1000 if width == 1440 else 844})
        # Use a different route first so actual navigation dispatches hashchange.
        self.go("/overview", "#view h1")
        if name not in ("evidence", "related"):
            menu = self.page.locator(".mobile-more")
            if menu.is_visible():
                if not menu.evaluate("el=>el.open"):
                    menu.locator("summary").focus(); self.page.keyboard.press("Enter")
                link = menu.locator(f"a[data-route='{name}']"); assert link.is_visible()
                link.focus(); self.page.keyboard.press("Enter"); self.page.locator(ready).wait_for()
                assert not menu.evaluate("el=>el.open")
                assert not self.page.evaluate("!!document.activeElement?.closest('.mobile-more')"), "Keyboard focus remains inside closed mobile menu"
            else:
                self.page.locator(f"#nav a[data-route='{name}']").focus(); self.page.keyboard.press("Enter")
                self.page.locator(ready).wait_for()
        else:
            # Evidence/related are entered from a record, not global menu items.
            self.query({"angle": "social" if name == "evidence" else "clue", **({"accountHandles": "ArkansasState"} if name == "evidence" else {})})
            record_id = "social-1" if name == "evidence" else "clue-1"
            record = self.page.locator(f"#exCards [data-id='{record_id}']:visible, #exBody [data-id='{record_id}']:visible").first
            record.focus(); self.page.keyboard.press("Enter"); self.page.locator(".modal").wait_for()
            link = self.page.locator(f".modal a[href^='#/{name}?']"); link.focus(); self.page.keyboard.press("Enter")
            self.page.locator(ready).wait_for()
        geometry = self.page.evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth})")
        assert geometry["scroll"] <= width + 1, geometry
        focusable = self.page.locator("#view button:visible:enabled,#view a:visible,#view input:visible:enabled,#view select:visible:enabled,#view textarea:visible:enabled").first
        focusable.focus(); self.page.keyboard.press("Tab")
        focus = self.page.evaluate("""()=>{const el=document.activeElement,r=el.getBoundingClientRect();return {tag:el.tagName,visible:r.width>0&&r.height>0,focusVisible:el.matches(':focus-visible'),name:(el.getAttribute('aria-label')||el.innerText||el.labels?.[0]?.innerText||el.getAttribute('title')||'').slice(0,180),inView:r.bottom>0&&r.top<innerHeight}}""")
        assert focus["visible"] and focus["focusVisible"] and focus["inView"] and focus["name"], focus
        return {"width": width, "route": name, "geometry": geometry, "keyboard_focus": focus, "screenshot": self.shot(f"{name}-{width}")}

    def lock(self):
        self.page.set_viewport_size({"width": 1440, "height": 1000}); self.page.locator("#lockSession").click()
        self.page.locator("#accessForm").wait_for()
        assert self.page.evaluate("!window.ZGCLAB_META && !window.ZGCLAB_SERVICE_CLIENT && !sessionStorage.getItem('zgclab.access.key.v1')")
        assert not self.page.locator("#accessPassword").input_value()
        self.unlock_page(initial=False); self.go("/assistant", "#asQuestion"); self.page.reload(wait_until="domcontentloaded")
        self.page.locator("#accessForm").wait_for(); assert self.page.evaluate("!window.ZGCLAB_META && !window.ZGCLAB_SERVICE_CLIENT")
        safe = self.page.evaluate("""password=>[localStorage,sessionStorage].every(storage=>Object.keys(storage).every(key=>{const value=storage.getItem(key)||'';return !/access[._-]?(key|token)|bearer|service[._-]?token/i.test(key)&&!value.includes(password)&&!/^Bearer /i.test(value)}))""", self.password)
        assert safe
        screenshot = self.shot("locked"); self.unlock_page(initial=False)
        return {"lock_requires_password": True, "refresh_requires_password": True, "credentials_in_storage": False, "screenshot": screenshot}

    def mock_html(self):
        self.unlock_page("/assistant?mode=chat&angle=social&ids=1002550"); self.page.evaluate("window.__researchQAXSS=0")
        payload = {"state": "answered", "answer": "QA 受控模型文本 " + XSS + '\n<script>window.__researchQAXSS=2</script>\n[点击](javascript:window.__researchQAXSS=3) [C7]', "model": {"id": "QA mock, not real model", "used": True}, "citations": [{"citation_id": "C7", "id": "social-1", "angle": "social", "ktid": 1002550, "field": "original_text", "paragraph": 1, "snippet": self.ref.fields["social-1"]["original_content"], "source_url": self.ref.fields["social-1"]["content_url"], "source_version": self.ref.meta["version"]}], "coverage": {"dataset": "real", "database_total": 6989}}
        self.page.route(re.compile(r".*/api/chat(?:\?.*)?$"), lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps(payload)))
        self.page.locator("#asQuestion").fill("QA 自有测试问题 " + XSS); self.page.locator("#asSubmit").click(); self.page.locator(".as-markdown").wait_for()
        assert XSS in self.page.locator(".as-markdown").inner_text()
        assert not self.page.locator("#qa-research-xss,.as-markdown script,.as-markdown [onerror],.as-markdown a[href^='javascript:']").count()
        assert self.page.evaluate("window.__researchQAXSS") == 0
        self.page.locator(".as-citation-ref").focus(); self.page.keyboard.press("Enter")
        assert self.page.locator("[data-as-citation=C7]").evaluate("el=>el===document.activeElement")
        return {"kind": "controlled rendering only, not real model verification", "html_executed": False, "citation": "C7", "screenshot": self.shot("mock-html")}

    def mock_late(self):
        self.unlock_page("/assistant?mode=chat"); pending = []
        self.page.route(re.compile(r".*/api/chat(?:\?.*)?$"), lambda route: pending.append(route))
        self.page.locator("#asQuestion").fill("QA controlled delayed answer")
        with self.page.expect_request(lambda r: urlsplit(r.url).path.endswith("/api/chat")):
            self.page.locator("#asSubmit").click()
        self.page.wait_for_function("document.querySelector('#asCancel')?.hidden===false")
        assert pending; self.go("/projects", "#projectsNew"); result = "fulfilled"
        try:
            pending[0].fulfill(status=200, content_type="application/json", body=json.dumps({"state": "answered", "answer": "QA LATE ANSWER " + XSS, "citations": [], "model": {"id": "QA mock"}}))
        except Exception as error:
            assert re.search(r"abort|closed|invalid|handled|canceled|cancelled", str(error), re.I), str(error)
            result = "request aborted on route departure"
        self.page.evaluate("async()=>await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))")
        assert self.page.locator("#projectsNew").is_visible() and not self.page.locator(".as-root,#qa-research-xss").count()
        return {"kind": "controlled late response only", "request_outcome": result, "final_route": self.page.evaluate("location.hash"), "screenshot": self.shot("mock-late")}

    def no_page_errors(self):
        assert not self.js_errors, self.js_errors
        assert self.chat_count <= 3
        return {"uncaught_page_errors": self.js_errors, "real_chat_requests": self.chat_count, "budget": 3}

    def run_backup_supplement(self):
        """Retest the exact failed backup contract using an earlier real conversation.

        All five original nested fields are compared without normalizing expected
        values. Opening a saved session may update its timestamp, so round-trip
        equality is checked and exported before that separate interaction.
        """
        source = Path(self.args.restore_backup).resolve()
        prior_path = Path(self.args.prior_report).resolve()
        prior_hash = hashlib.sha256(prior_path.read_bytes()).hexdigest()
        prior = json.loads(prior_path.read_text())
        payload = json.loads(source.read_text(encoding="utf-8-sig"))
        original_keys = ("projects", "relations", "researchChanges", "collectionPlan", "chatSessions")
        expected_manifest = self.args.expect_manifest
        if re.fullmatch(r"[a-f0-9]+", expected_manifest):
            expected_manifest = "manifest-" + expected_manifest + ".json"
        self.supplement = {
            "kind": "strict_backup_restore_retest", "resolves_check": "workspace_backup",
            "prior_report": str(prior_path), "prior_report_sha256": prior_hash,
            "prior_counts": {k: prior[k] for k in ("passed", "failed", "blocked", "skipped")},
            "prior_manifest": prior.get("protected_manifest"), "prior_artifacts": prior["artifacts"],
            "source_backup": str(source), "source_backup_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "expected_manifest": expected_manifest, "strict_fields": list(original_keys),
            "prior_failure_cleared": False, "historical_report_preserved": True,
            "scope": "backup restoration and readable saved real conversations; prior full-suite evidence remains separate",
        }
        self.ref = Reference()
        self.password = (ROOT / ".runtime/pages-password").read_text().strip()
        restored_source = None

        def source_contract():
            assert {c["id"] for c in prior["checks"] if c["status"] == "FAIL"} == {"workspace_backup"}
            assert prior["blocked"] == prior["skipped"] == 0
            assert source.parent == Path(prior["artifacts"]).resolve()
            assert all(payload.get(key) for key in original_keys)
            assert payload["version"] == 3
            assert len(payload["projects"]) == 1 and len(payload["projects"][0]["items"]) == 91
            baseline = payload["researchChanges"]["real"]["baseline"]
            assert baseline["compact"] is True and baseline["total"] == baseline["fullFingerprintCount"] == 6989
            sessions = payload["chatSessions"]
            answered = [t for session in sessions for t in session["turns"] if t.get("mode") == "answered" and t.get("modelInfo", {}).get("used") is True]
            assert len(answered) >= 2 and all(t["items"] for t in answered)
            assert answered[0]["question"] == "请概括 Arkansas State 对阵 South Alabama 的比赛结果，并给出原文引用。"
            assert answered[1]["question"] == "这条资料里双方比分是怎样的？请继续引用同一来源。"
            self.project_id = payload["projects"][0]["id"]
            return {"backup_sha256": self.supplement["source_backup_sha256"], "strict_fields": list(original_keys), "project_materials": 91, "saved_real_answer_turns": len(answered), "prior_counts": self.supplement["prior_counts"]}

        def manifest_contract():
            actual = getattr(self, "protected_manifest", None)
            assert actual == expected_manifest, {"expected": expected_manifest, "actual": actual}
            assert actual != prior.get("protected_manifest"), "Backup fix must be verified on the new protected build"
            return {"actual_manifest": actual, "previous_manifest": prior.get("protected_manifest")}

        def compare_fields(actual, stage):
            mismatch = [key for key in original_keys if actual.get(key) != payload[key]]
            if mismatch:
                path = self.json("backup-restore-actual-" + stage + ".json", actual)
                raise AssertionError({"stage": stage, "different_fields": mismatch, "actual_artifact": path, "expected_backup": str(source)})

        def restore_exact():
            self.upload("#importWorkspace", payload)
            self.wait_store("ws.projects?.some(p=>p.id===arg)", self.project_id)
            compare_fields(self.workspace(), "import")
            assert len(self.project()["items"]) == 91
            path, text = self.download(self.page.locator("#backupWorkspace"), "json")
            compare_fields(json.loads(text), "reexport")
            self.page.reload(wait_until="domcontentloaded"); self.unlock_page(initial=False)
            self.page.locator("#backupWorkspace").wait_for()
            compare_fields(self.workspace(), "refresh")
            self.project_page()
            assert self.page.locator("#projectMarkdown").input_value() == payload["projects"][0]["report"]["markdown"]
            assert "共 91 条材料" in self.page.locator("#projectMaterialCount").inner_text()
            assert not self.page.locator("#qa-research-xss").count()
            return {"fields_strictly_equal": list(original_keys), "project_materials": 91, "refresh_preserves_exact_fields": True, "reexport": str(path), "screenshot": self.shot("supplement-project-91")}

        def readable_chat():
            session = next(session for session in payload["chatSessions"] if sum(t.get("mode") == "answered" for t in session["turns"]) >= 2)
            self.go("/assistant?mode=chat&session=" + session["id"], "#asQuestion")
            self.page.wait_for_function("count=>document.querySelectorAll('#asTranscript .as-turn').length===count", arg=len(session["turns"]))
            turns = self.page.locator("#asTranscript .as-turn")
            checked = []
            for index, saved in enumerate(session["turns"]):
                turn = turns.nth(index)
                assert turn.locator(".as-user-question p").inner_text() == saved["question"]
                visible = turn.locator(".as-markdown").inner_text()
                assert re.sub(r"\s+", " ", visible.strip()) == re.sub(r"\s+", " ", saved["answer"].strip())
                cards = turn.locator(".as-evidence:not(.as-aggregate)")
                assert cards.count() == len(saved["items"])
                citations = []
                for number, item in enumerate(saved["items"]):
                    identifier = item["id"]
                    assert identifier in self.ref.ids
                    a, row = self.ref.ids[identifier]
                    assert a == item["angle"] and str(row["ktid"]) == str(item["ktid"])
                    assert item["excerpt"] in self.ref.fields[identifier][BODY[a]]
                    assert item["version"] == self.ref.meta["version"]
                    card = cards.nth(number)
                    assert card.get_attribute("data-as-citation") == item["label"]
                    assert card.locator(".as-excerpt").inner_text() == item["excerpt"]
                    assert card.locator(f"a[href='#/record/{a}/{identifier}']").count() >= 1
                    assert canonical(card.locator("a[target=_blank]").get_attribute("href")) == canonical(item["source_url"])
                    button = turn.locator(".as-citation-ref").filter(has_text="[" + item["label"] + "]")
                    button.focus(); self.page.keyboard.press("Enter")
                    assert card.evaluate("el=>el===document.activeElement")
                    citations.append({"label": item["label"], "id": identifier, "source_url": item["source_url"], "excerpt": item["excerpt"]})
                checked.append({"question": saved["question"], "visible_answer": visible, "restored_model": saved["modelInfo"], "verified_citations": citations})
            assert not self.page.locator(".as-citation-missing").count()
            screenshot = self.shot("supplement-restored-real-chat")
            first = turns.first.locator(".as-evidence:not(.as-aggregate)").first
            first.locator("a[href^='#/record/']").first.click()
            self.page.wait_for_function("document.querySelector('#detailStatus')?.textContent.includes('已载入完整交付记录')")
            self.page.locator(".modal a[href^='#/evidence?']").click()
            self.page.locator("#researchReadingMode").wait_for()
            first_item = session["turns"][0]["items"][0]
            original = self.page.locator("[data-reading=original] .research-paragraph > p").all_text_contents()
            assert original == parts(self.ref.fields[first_item["id"]][BODY[first_item["angle"]]])
            return {"restored_turns": checked, "saved_session_id": session["id"], "real_source_record_opened": first_item["id"], "chat_screenshot": screenshot, "source_screenshot": self.shot("supplement-restored-citation-source"), "new_model_requests": 0}

        def prior_preserved():
            current = hashlib.sha256(prior_path.read_bytes()).hexdigest()
            assert current == prior_hash
            return {"prior_report": str(prior_path), "sha256": current, "prior_counts": self.supplement["prior_counts"], "unchanged": True}

        try:
            self.case("backup_source_contract", "复用含两轮真实答案的原始总备份", source_contract, section="supplement")
            from playwright.sync_api import sync_playwright
            with sync_playwright() as pw:
                self.browser = pw.chromium.launch(headless=True, executable_path=shutil.which("google-chrome"), args=["--no-sandbox"])
                with self.context():
                    def forbid_model_request(route):
                        self.js_errors.append({"message": "Supplement forbids new search/chat requests", "path": urlsplit(route.request.url).path})
                        route.abort("blockedbyclient")
                    self.page.context.route(re.compile(r".*/api/(?:chat|search)(?:\?.*)?$"), forbid_model_request)
                    self.case("unlock", "新上下文解锁到工作台", lambda: (self.unlock_page("/workspace") or {"new_context": True}), needs=("backup_source_contract",), section="supplement")
                    self.case("supplement_manifest", "实际加载新的 schema 修复发布包", manifest_contract, needs=("unlock",), section="supplement")
                    self.case("workspace_backup", "原五字段严格等值导入再次导出刷新且保留91条材料", restore_exact, needs=("supplement_manifest",), section="supplement")
                    self.case("restored_saved_chat", "恢复的真实两轮答案引用可读并能打开原文", readable_chat, needs=("workspace_backup",), section="supplement")
                self.browser.close(); self.browser = None
            self.case("page_errors", "补充验收无页面异常且零新增模型请求", self.no_page_errors, section="supplement")
            self.case("prior_report_preserved", "保留历史59PASS1FAIL报告原字节", prior_preserved, section="supplement")
            self.supplement["prior_failure_cleared"] = all(self.status.get(key) == "PASS" for key in ("backup_source_contract", "unlock", "supplement_manifest", "workspace_backup", "restored_saved_chat", "page_errors", "prior_report_preserved"))
        except Exception as error:
            self.errors.append({"id": "supplement_harness", "error": self.safe(str(error))})
            self.checks.append({"id": "supplement_harness", "status": "FAIL", "error": self.safe(str(error))})
        finally:
            result = self.report()
            if self.args.report:
                target = Path(self.args.report).resolve()
                if target.parent != ROOT / "reports" or not re.fullmatch(r"research-acceptance[^/]*\.json", target.name):
                    raise ValueError("Supplement report must be reports/research-acceptance*.json")
                with target.open("x", encoding="utf-8") as stream: stream.write(Path(result).read_text())
            counts = Counter(c["status"] for c in self.checks)
            print(json.dumps({"report": result, "passed": counts["PASS"], "failed": counts["FAIL"], "blocked": counts["BLOCKED"], "skipped": counts["SKIP"], "real_chat_requests": self.chat_count, "prior_failure_cleared": self.supplement["prior_failure_cleared"]}, ensure_ascii=False), flush=True)
        return int(not self.supplement["prior_failure_cleared"])

    def run(self):
        try:
            self.ref = Reference()
            for key, label in DATA_CASES:
                self.case(key, label, getattr(self, key) if self.args.mode in ("all", "data") else None, section="data")
            use_ui = self.args.mode in ("all", "ui")
            use_live = self.args.mode in ("all", "ui", "live") and not self.args.no_live
            use_mock = self.args.mode in ("all", "mock")
            if use_ui or use_live or use_mock:
                self.password = (ROOT / ".runtime/pages-password").read_text().strip()
                assert self.password, "Empty site password file"
                from playwright.sync_api import sync_playwright
                with sync_playwright() as pw:
                    self.browser = pw.chromium.launch(headless=True, executable_path=shutil.which("google-chrome"), args=["--no-sandbox"])
                    with self.context():
                        if use_ui or use_live:
                            self.case("unlock", "加密入口解锁且模拟数据默认关闭", self.unlock)
                        else:
                            self.case("unlock", "加密入口解锁且模拟数据默认关闭")
                        for key, label, prerequisites in UI_CASES:
                            self.case(key, label, getattr(self, key) if use_ui else None, needs=("unlock",) + prerequisites)
                        if use_live and self.args.live_smoke:
                            self.case("assistant_aggregate", "真实 UI 精确统计阿肯色 221 与数据库引用 A1", self.assistant_aggregate, needs=("unlock",), section="live")
                            self.case("assistant_search_empty", "真实 UI 零结果检索且无编造引用", self.assistant_search_empty, needs=("unlock",), section="live")
                        for key, label, prerequisites in LIVE_CASES:
                            enabled = use_live and (not self.args.live_smoke or key in ("assistant_search", "assistant_answer"))
                            self.case(key, label, getattr(self, key) if enabled else None, needs=("unlock",) + prerequisites, section="live")
                            if key == "assistant_answer" and enabled and self.status.get(key) == "FAIL" and not self.args.live_smoke:
                                self.case("assistant_literal_answer", "独立关键词问题验证真实模型答案（不代替中文问题验收）", lambda: self.answer("Arkansas State South Alabama"), needs=("unlock",), section="live")
                        backup_needs = ("unlock", "project_backup", "related", "changes", "plan")
                        self.case("workspace_backup", "完整工作台备份恢复专题、分组、基线、待办及可用对话", self.workspace_backup if use_ui else None, needs=backup_needs)
                        self.case("quickswitch", "新增路由快速切换无迟到渲染或残留弹窗", self.quickswitch if use_ui else None, needs=("unlock",))
                        for width in (390, 768, 1440):
                            for name in ROUTES:
                                action = (lambda width=width, name=name: self.layout(width, name)) if use_ui else None
                                self.case(f"layout_{name}_{width}", f"{width}px {name} 导航、无页面溢出与键盘焦点", action, needs=("unlock",), section="layout")
                        self.case("lock", "锁定和刷新均清除解锁及服务凭据并重新要求密码", self.lock if use_ui else None, needs=("unlock",))
                    for key, label in MOCK_CASES:
                        if use_mock:
                            with self.context(real=False): self.case(key, label, getattr(self, key), section="mock")
                        else: self.case(key, label, section="mock")
                    self.browser.close(); self.browser = None
            else:
                self.case("unlock", "加密入口解锁且模拟数据默认关闭")
                for key, label, _ in UI_CASES + LIVE_CASES: self.case(key, label, section="live" if key.startswith("assistant_") else "ui")
                for key, label in [("workspace_backup", "完整工作台备份恢复"), ("quickswitch", "快速路由切换"), ("lock", "锁定刷新回归"), *MOCK_CASES]: self.case(key, label)
                for width in (390, 768, 1440):
                    for name in ROUTES: self.case(f"layout_{name}_{width}", f"{width}px {name} 导航布局", section="layout")
            self.case("raw_after", "验收全过程未改写原始交付数据", self.raw, section="integrity")
            self.case("page_errors", "无页面脚本异常且真实问答不超过三次", self.no_page_errors if use_ui or use_live or use_mock else None, section="integrity")
        except Exception as error:
            self.errors.append({"id": "harness", "error": self.safe(str(error))})
            self.checks.append({"id": "harness", "check": "Acceptance harness setup", "status": "FAIL", "error": self.safe(str(error))})
        finally:
            report = self.report()
            if self.args.report:
                destination = Path(self.args.report).resolve()
                if destination.parent != ROOT / "reports" or not re.fullmatch(r"research-acceptance[^/]*\.json", destination.name):
                    raise ValueError("Project report must be reports/research-acceptance*.json")
                with destination.open("x", encoding="utf-8") as stream: stream.write(Path(report).read_text())
            counts = Counter(item["status"] for item in self.checks)
            print(json.dumps({"report": report, "passed": counts["PASS"], "failed": counts["FAIL"], "blocked": counts["BLOCKED"], "skipped": counts["SKIP"], "real_chat_requests": self.chat_count, "errors": self.safe(self.errors)}, ensure_ascii=False), flush=True)
        return int(bool(self.errors) or any(i["status"] == "BLOCKED" for i in self.checks))


DATA_CASES = [
 ("raw", "原始交付快照、稳定 ID 与 6989 总量不变"),
 ("metadata", "研究 records[id] 与完整原始记录一一对应"),
 ("fingerprints", "6989 条完整原文译文 SHA-256 均与原字段一致"),
 ("change_fixture", "独立 fixture 检测正文尾部变化与占位补译"),
 ("translations", "独立识别 325 条无法翻译占位"),
 ("dates", "626 条恢复日期有原始帖子日期与身份依据"),
 ("coverage_data", "机构角度平台覆盖与最新采集字段可独立复算"),
 ("simulation_data", "30000 模拟记录独立且社媒平台为 test"),
]
UI_CASES = [
 ("query_regression", "原有跨角度、账号、日期查询及完整 CSV 回归", ()),
 ("project_focus", "键盘专题弹窗焦点限制与 Escape 恢复", ()),
 ("project_create", "新建专题及自有文本安全", ()),
 ("project_add", "当前筛选完整 90 条及详情真实记录加入专题", ("project_create", "query_regression")),
 ("project_edit", "批注摘录状态顺序及跨页材料选择", ("project_add",)),
 ("project_report", "草稿引用全部 90 条已选材料并保留顺序版本", ("project_edit",)),
 ("project_backup", "编辑 Markdown、JSON/CSV 导出与幂等导入", ("project_report",)),
 ("old_backup", "旧工作台备份兼容且保留既有专题", ("project_backup",)),
 ("evidence", "social-1/clue-1 完整文本分段对照定位复制引用", ()),
 ("evidence_quality", "证据页说明占位译文、恢复日期和来源依据", ()),
 ("related", "真实可解释候选可人工确认移除并持久恢复", ()),
 ("changes", "首次基线与同快照零变化及保存查询关注订阅", ("query_regression",)),
 ("changes_hashes", "6989 全文指纹 compact 基线真实持久化且刷新零变化", ("changes",)),
 ("coverage", "网页机构角度平台计数及最近采集字段符合真实记录", ()),
 ("plan", "四类未来建议、本地待办与状态备注导出", ()),
 ("quality", "五项质量卡片下钻及模拟数据分母口径", ()),
]
LIVE_CASES = [
 ("assistant_search", "网页真实数据库检索复用解锁认证并呈现原文引用", ()),
 ("assistant_answer", "网页实际看到 DeepSeek Flash 答案及可点击真实引用", ("assistant_search",)),
 ("assistant_followup", "第二轮真实对话携带历史并继续引用真实材料", ("assistant_answer",)),
 ("assistant_no_evidence", "无证据明确不能回答且不编造记录引用", ()),
]
MOCK_CASES = [
 ("mock_html", "受控问题与生成答案 HTML 不执行且引用键盘可定位"),
 ("mock_late", "受控迟到问答不覆盖已切换专题页面"),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--mode", choices=("all", "data", "ui", "mock", "live", "backup-restore"), default="all")
    parser.add_argument("--no-live", action="store_true", help="Explicitly defer real API/model checks; they remain SKIP")
    parser.add_argument("--live-smoke", action="store_true", help="With --mode live, one exact count plus one model answer, real search and empty search; multiround deferred")
    parser.add_argument("--report", help="Optional new reports/research-acceptance*.json; refuses overwrite")
    parser.add_argument("--restore-backup", help="Prior real full workspace JSON for --mode backup-restore")
    parser.add_argument("--prior-report", help="Preserved full-suite report whose workspace_backup failure is retested")
    parser.add_argument("--expect-manifest", help="Expected new protected manifest ID or filename for backup supplement")
    parser.add_argument("--selectors", action="store_true", help="Read source selector contracts only; no tests or artifacts")
    parser.add_argument("--list", action="store_true", help="List checks only; no tests or artifacts")
    args = parser.parse_args()
    if args.no_live and args.mode == "live": parser.error("--mode live cannot use --no-live")
    if args.live_smoke and args.mode != "live": parser.error("--live-smoke requires --mode live")
    if args.selectors:
        missing = []
        for filename, values in SELECTORS.items():
            content = (ROOT / filename).read_text() if (ROOT / filename).exists() else ""
            absent = [s for s in values.split() if s not in content]; missing.extend(filename + ":" + s for s in absent)
            print(json.dumps({"source": filename, "selectors": values.split(), "absent": absent}, ensure_ascii=False))
        print(json.dumps({"preparation_only": True, "browser_started": False, "missing": missing}, ensure_ascii=False))
        return int(bool(missing))
    if args.list:
        for key, label in DATA_CASES + [(k, label) for k, label, _ in UI_CASES + LIVE_CASES] + MOCK_CASES:
            print(key + "\t" + label)
        for width in (390, 768, 1440):
            for name in ROUTES: print(f"layout_{name}_{width}\t{width}px {name} 导航布局键盘焦点")
        return 0
    if args.mode == "backup-restore":
        if not all((args.restore_backup, args.prior_report, args.expect_manifest)):
            parser.error("backup-restore requires --restore-backup, --prior-report and --expect-manifest")
        return QA(args).run_backup_supplement()
    return QA(args).run()


if __name__ == "__main__": sys.exit(main())
