"""Verify the authorized GitHub Pages release; execute on social after push.

Uses the existing site password in memory to unlock the published encrypted page.
Records version, status, authentication, count, filters, and layout evidence only.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path("/home/ubuntu/zgclab-1-web")
BASE = os.environ.get("ZGCLAB_PUBLIC_VERIFY_URL", "https://co-minder.github.io/zgclab-data-page-1/")
OUT = Path(os.environ["ZGCLAB_PUBLIC_ARTIFACTS"])
OUT.mkdir(parents=True, exist_ok=False)
password = (ROOT / ".runtime/pages-password").read_text().rstrip("\r\n")
build = json.loads((ROOT / "reports/research-build-inputs.json").read_text())
expected = build["manifest"]
report = {
    "tested_at": datetime.now(timezone.utc).isoformat(),
    "target": BASE,
    "expected_manifest": expected,
    "release_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
    "checks": [],
    "page_errors": [],
    "model_business_requests": 0,
}


def check(label, condition, evidence=None):
    report["checks"].append({"check": label, "status": "PASS" if condition else "FAIL", "evidence": evidence})
    assert condition, (label, evidence)


def unlock(page):
    page.locator("#accessForm").wait_for()
    page.locator("#accessPassword").fill(password)
    page.locator("#accessForm").evaluate("el=>el.requestSubmit()")
    page.wait_for_function("document.querySelector('#lockSession') && document.querySelector('#view')")


try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path=shutil.which("google-chrome"), args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 1440, "height": 1100}, accept_downloads=True)
        page.set_default_timeout(30000)
        page.on("pageerror", lambda error: report["page_errors"].append(str(error)))
        page.goto(BASE + "#/overview", wait_until="domcontentloaded")
        actual = page.locator("script[data-manifest]").get_attribute("data-manifest")
        check("Pages serves the final manifest", actual == expected, actual)
        check("A fresh document requires the password", page.locator("#accessForm").is_visible())
        unlock(page)
        check("Simulation remains off", not page.locator("#includeSimulation").is_checked())
        page.evaluate("location.hash='#/assistant?mode=chat'")
        page.locator("#asQuestion").wait_for()
        page.wait_for_function("document.querySelector('#asServiceStatus')?.innerText.includes('6,989')")
        status = page.evaluate("ZGCLAB_SERVICE_CLIENT.status()")
        check("Published page connects to the same database snapshot", status["snapshot"]["source_version"] == "f064c896c123cbf4" and status["snapshot"]["research_version"] == "a8acd9d0b712fbe06a65" and status["snapshot"]["total"] == 6989,
              {key: status["snapshot"][key] for key in ("schema_version", "source_version", "research_version", "total")})
        check("Published model status is rendered", "模型可用：DeepSeek V4.1 Flash" in page.locator("#asServiceStatus").inner_text(), page.locator("#asServiceStatus").inner_text())
        page.locator("#asQuestion").fill("阿肯色州立大学有多少条资料？")
        with page.expect_response(lambda response: response.request.method == "POST" and response.url.endswith("/api/chat"), timeout=35000) as event:
            page.locator("#asForm").evaluate("el=>el.requestSubmit()")
        response = event.value
        payload = response.json()
        check("Published exact count is 221 without model usage", response.status == 200 and payload["state"] == "database_answer" and payload["model"]["used"] is False and payload["aggregates"]["matched"]["total"] == 221,
              {"state": payload["state"], "model": payload["model"], "aggregates": payload["aggregates"]})
        page.locator("#asTranscript .as-citation-ref").first.click()
        check("Published statistical citation receives focus", page.evaluate("document.activeElement.dataset.asCitation") == "A1")
        page.screenshot(path=str(OUT / "assistant-desktop.png"), full_page=True)
        page.evaluate("location.hash='#/explore?angle=social&accountHandles=ArkansasState&platforms=X'")
        page.wait_for_function("document.querySelector('#exCount')?.dataset.query")
        check("Published handle and platform filters find the real record", page.locator("#exBody tr[data-id]").count() == 1,
              page.locator("#exCount").inner_text())
        page.locator("#openFilters").click()
        check("Filters still use an independent modal", page.locator("#exFilterDialog").evaluate("el=>el.open&&el.matches(':modal')"))
        page.evaluate("location.hash='#/projects'")
        page.locator("#projectsNew").wait_for()
        page.locator("#projectsNew").focus()
        page.keyboard.press("Enter")
        page.locator("dialog.projects-dialog[open] button[type=submit]").focus()
        page.keyboard.press("Tab")
        check("Published topic dialog contains keyboard focus", page.evaluate("!!document.activeElement.closest('dialog.projects-dialog[open]')"))
        page.keyboard.press("Escape")
        check("Published topic dialog restores trigger focus", page.locator("#projectsNew").evaluate("el=>el===document.activeElement"))
        page.evaluate("location.hash='#/changes'")
        page.locator("#researchChangesCount").wait_for()
        check("Published changes page uses all full text fingerprints and a zero baseline", page.locator("#researchFingerprintCoverage").get_attribute("data-full-fingerprint-count") == "6989" and "完整快照共 0 条变化" in page.locator("#researchChangesCount").inner_text())
        page.evaluate("location.hash='#/collection-plan'")
        page.locator("#collectionPlanList").wait_for()
        check("Published collection plan contains the four categories and ten suggestions", "显示 10/10 项建议" in page.locator("#view").inner_text())
        for width in (390, 768, 1440):
            page.set_viewport_size({"width": width, "height": 1000})
            overflow = page.evaluate("({page:document.documentElement.scrollWidth,viewport:innerWidth})")
            check(str(width) + "px published plan has no page overflow", overflow["page"] <= overflow["viewport"], overflow)
            page.screenshot(path=str(OUT / ("plan-" + str(width) + ".png")), full_page=True)
        for turn in range(2):
            page.reload(wait_until="domcontentloaded")
            check("Refresh " + str(turn + 1) + " requires the password again", page.locator("#accessForm").is_visible())
            unlock(page)
            page.locator("#collectionPlanList").wait_for()
        check("Published navigation has no page script errors", not report["page_errors"], report["page_errors"])
        browser.close()
except Exception as error:
    report["error"] = str(error)
finally:
    report["passed"] = sum(item["status"] == "PASS" for item in report["checks"])
    report["failed"] = sum(item["status"] == "FAIL" for item in report["checks"]) + int("error" in report and not any(item["status"] == "FAIL" for item in report["checks"]))
    report["finished_at"] = datetime.now(timezone.utc).isoformat()
    text = json.dumps(report, ensure_ascii=False, indent=2)
    assert password not in text
    (OUT / "results.json").write_text(text)
    print(json.dumps({key: report[key] for key in ("passed", "failed", "expected_manifest", "release_commit")}, ensure_ascii=False), flush=True)
    if "error" in report:
        print(json.dumps({"error": report["error"]}, ensure_ascii=False), flush=True)

raise SystemExit(int(report["failed"] > 0))
