#!/usr/bin/env python3
"""Source-only research design review; no build, network service, or model requests."""
from __future__ import annotations
import argparse
import hashlib
import json
import shutil
from pathlib import Path
from urllib.parse import unquote, urlsplit
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = Path("/home/ubuntu/log/zgclab-ui-design-20261109/research")

def run():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", choices=("before", "after"), default="after")
    parser.add_argument("--contract-suite", choices=("browser", "preview"))
    args = parser.parse_args()
    if args.contract_suite:
        run_contract_suite(args.contract_suite)
        return
    out = OUT / args.phase
    out.mkdir(parents=True, exist_ok=True)
    checks, errors, forbidden = [], [], []
    widths = (1440, 390) if args.phase == "before" else (1440, 768, 739, 390, 360)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path=shutil.which("google-chrome"), args=["--no-sandbox"])
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        def route(request):
            url = urlsplit(request.request.url)
            if url.path.split("?")[0].endswith(("/api/chat", "/api/search")):
                forbidden.append(request.request.url)
            if url.netloc != "research-design.test":
                request.abort()
                return
            name = unquote(url.path).lstrip("/") or "index.html"
            candidate = (ROOT / name).resolve()
            if candidate.is_relative_to(ROOT) and candidate.is_file():
                content_type = "text/css" if name.endswith(".css") else "application/javascript" if name.endswith(".js") else "text/html"
                request.fulfill(status=200, content_type=content_type, body=candidate.read_bytes())
            else:
                request.fulfill(status=404, body="not available in source review")
        context.route("**/*", route)
        page = context.new_page()
        page.set_default_timeout(20000)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto("http://research-design.test/#/evidence?angle=social&id=social-1")
        page.locator("#researchReadingMode").wait_for()
        original = page.locator("[data-reading=original] .research-paragraph p").inner_text()
        assert original == "A-State Faces Setback in High-Scoring Matchup Versus South Alabama, 56-49 https://t.co/4uChDuOQVI"
        def go(hash_value, selector):
            page.evaluate("hash => {location.hash=hash; scrollTo(0,0)}", hash_value)
            page.locator(selector).wait_for()
            page.evaluate("scrollTo(0,0)")
        # Create an actual local group and task through their UI, without writing source data.
        go("#/related?angle=clue&id=clue-289", "#relationGroup")
        if page.locator("#manageRelationGroup").count(): page.locator("#manageRelationGroup").click()
        page.locator("#relationGroupName").fill("朝鲜政策研究 · 资料核验")
        page.locator("#createRelationGroup").click()
        page.locator("#manualRelationAngle").select_option("social")
        page.locator("#manualRelationId").fill("social-1")
        page.locator("#addManualRelation").click()
        assert page.locator("#relationSaved [data-remove-relation]").count() == 1
        go("#/collection-plan", "#collectionPlanCount")
        page.locator("[data-create-plan=publication-basis]").click()
        page.locator("[data-plan-status=publication-basis]").select_option("doing")
        page.locator("[data-plan-note=publication-basis]").fill("核对来源页的发布时间与身份依据，再记录验收结果。")
        page.locator("[data-plan-note=publication-basis]").blur()
        scenes = [("evidence-social", "#/evidence?angle=social&id=social-1", "#researchReadingMode"), ("evidence-clue", "#/evidence?angle=clue&id=clue-1", "#researchReadingMode"), ("related-group", "#/related?angle=clue&id=clue-289", "#relationGroup"), ("changes-fresh", "#/changes", "#researchChangesCount"), ("coverage-records", "#/coverage?issue=translation", "#coverageSummary"), ("coverage-sources", "#/coverage?issue=sources", "#coverageSummary"), ("plan-task", "#/collection-plan", "#collectionPlanCount")]
        for width in widths:
            page.set_viewport_size({"width": width, "height": 1000 if width > 800 else 900})
            for label, hash_value, selector in scenes:
                go(hash_value, selector)
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth+1"), (width, label)
                if label == "coverage-records":
                    summary = page.locator("#coverageSummary").inner_text()
                    for value in ["120 / 120", "1,018", "626", "392", "325"]:
                        assert value in summary, (value, summary)
                if label == "coverage-sources":
                    assert page.locator(".research-coverage-table tbody tr").count() == 12
                if args.phase == "after" and label.startswith("evidence"):
                    disclosure = page.locator("details.research-provenance").last
                    assert not disclosure.evaluate("e => e.open")
                    disclosure.locator("summary").focus()
                    page.keyboard.press("Enter")
                    assert disclosure.evaluate("e => e.open")
                    assert "原文对象哈希" in disclosure.inner_text()
                    page.keyboard.press("Enter")
                    assert not disclosure.evaluate("e => e.open")
                page.evaluate("document.activeElement?.blur(); scrollTo(0,0)")
                page.screenshot(path=str(out / f"{label}-{width}.png"), full_page=True)
                page.screenshot(path=str(out / f"{label}-{width}-viewport.png"))
                position_selector = "[data-reading=original] .research-paragraph p" if label.startswith("evidence") else "#relatedCandidates .research-related-card" if label == "related-group" else "#researchChangesList" if label.startswith("changes") else "#coverageSources .research-coverage-table" if label == "coverage-sources" else "#collectionPlanList .research-plan-card" if label == "plan-task" else "#coverageRecords .research-record"
                primary_top = page.locator(position_selector).first.bounding_box()["y"]
                if args.phase == "after" and label == "changes-fresh":
                    assert primary_top < (720 if width <= 560 else 650), (label, width, primary_top)
                if args.phase == "after" and width <= 560 and label in ("evidence-social", "evidence-clue", "related-group"):
                    assert primary_top < 790, (label, width, primary_top)
                if args.phase == "after" and label == "coverage-sources" and width in (1440, 390):
                    matrix = page.locator(".research-matrix-disclosure")
                    matrix.locator("summary").focus()
                    page.keyboard.press("Enter")
                    assert matrix.evaluate("e => e.open")
                    assert matrix.locator("tbody td").count() == 120
                    assert matrix.locator("tbody tr").count() == 20
                    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth+1")
                    page.screenshot(path=str(out / f"coverage-matrix-{width}.png"), full_page=True)
                    matrix.locator("summary").click()
                    page.evaluate("scrollTo(0,0)")
                checks.append({"scene": label, "width": width, "overflow": False, "primary_top": primary_top})
                print(json.dumps(checks[-1], ensure_ascii=False), flush=True)
        # Existing changed baseline is separate from fresh/unchanged scenes.
        page.set_viewport_size({"width": 1440, "height": 1000})
        page.evaluate("""() => {const w=JSON.parse(localStorage.getItem("zgclab.workspace.v1"));w.researchChanges.real.baseline.records["social:social-1"][0]="review-previous-content";localStorage.setItem("zgclab.workspace.v1", JSON.stringify(w));}""")
        page.reload()
        go("#/changes", "#researchChangesCount")
        assert "匹配 1 条变化" in page.locator("#researchChangesCount").inner_text()
        page.screenshot(path=str(out / "changes-existing-1440.png"), full_page=True)
        if args.phase == "after":
            # Long group names and task notes remain literal text, native forms stay keyboard reachable.
            go("#/related?angle=clue&id=clue-289", "#relationGroup")
            hostile = "研究資料" * 23 + "<img src=x onerror=window.pwned=1>"
            page.locator("#manageRelationGroup").click()
            page.locator("#relationGroupName").fill(hostile[:120])
            page.locator("#createRelationGroup").click()
            assert not page.locator("#researchBody img, #researchBody script").count()
            assert page.evaluate("window.pwned") is None
            page.set_viewport_size({"width": 360, "height": 900})
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth+1")
            page.locator("#relationGroupName").focus()
            page.keyboard.press("Tab")
            assert page.evaluate("document.activeElement.id") == "createRelationGroup"
            page.screenshot(path=str(out / "related-long-text-360.png"), full_page=True)
        assert not errors, errors
        assert not forbidden, forbidden
        browser.close()
    result = {"phase": args.phase, "checks": checks, "passed": len(checks), "errors": errors, "model_requests": forbidden, "source_hashes": {name: hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in ("research.js", "research.css")}}
    (out / "results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2))


def run_contract_suite(suite):
    """Retain existing assertions; read provenance via its visible disclosure control."""
    path = ROOT / "tests" / f"research.{suite}.py"
    source = path.read_text()
    old = "page.locator('.research-provenance').inner_text()"
    assert source.count(old) >= 3
    source = source.replace(old, "disclosure_text(page)")
    for control in ("page.locator('#relationGroupName').fill(", "page.locator('#manualRelationAngle').select_option("):
        source = source.replace(control, "open_group(page); " + control)
    def open_group(page):
        if not page.locator(".research-group-details").evaluate("e => e.open"):
            page.locator("#manageRelationGroup").click()
    def disclosure_text(page):
        block = page.locator(".research-provenance")
        if block.evaluate("e => e.open"):
            return block.inner_text()
        block.locator("summary").click()
        value = block.inner_text()
        block.locator("summary").click()
        return value
    namespace = {"__file__": str(path), "__name__": "research_design_contract", "disclosure_text": disclosure_text, "open_group": open_group}
    if suite == "preview":
        source = source.replace("        page.locator('#researchReadingMode').wait_for()", "        inject_sources(page)" + chr(10) + "        page.locator('#researchReadingMode').wait_for()", 1)
        source = source.replace("        page.locator('#researchChangesCount').wait_for()", "        inject_sources(page)" + chr(10) + "        page.locator('#researchChangesCount').wait_for()", 1)
        def inject_sources(page):
            page.locator("[data-research-root]").wait_for()
            page.add_style_tag(content=(ROOT/"styles.css").read_text())
            page.add_style_tag(content=(ROOT/"research.css").read_text())
            page.add_script_tag(content=(ROOT/"research.js").read_text())
            page.evaluate("() => dispatchEvent(new HashChangeEvent('hashchange'))")
        namespace["inject_sources"] = inject_sources
    exec(compile(source, str(path), "exec"), namespace)
    namespace["run"]()

if __name__ == "__main__":
    run()
