#!/usr/bin/env python3
"""Check useful viewport space and unified filter interactions in the browser."""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
from datetime import datetime, timezone

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE = os.environ.get("ZGCLAB_TEST_URL", "http://127.0.0.1:8789/")
OUT = Path(os.environ.get("ZGCLAB_TEST_ARTIFACTS", "/home/ubuntu/log/zgclab-compact-layout"))
OUT.mkdir(parents=True, exist_ok=True)
PASSWORD = (ROOT / ".runtime/pages-password").read_text().strip()


def run():
    checks, errors, measurements = [], [], []

    def passed(label, **evidence):
        item = {"check": label, "status": "PASS", **evidence}
        checks.append(item)
        print(json.dumps(item, ensure_ascii=False), flush=True)

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path=shutil.which("google-chrome"), args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.set_default_timeout(int(os.environ.get("ZGCLAB_TEST_TIMEOUT_MS", "30000")))
        page.on("pageerror", lambda error: errors.append(str(error)))

        def ready():
            page.wait_for_function("document.querySelector('#exCount')?.dataset.query===location.hash.split('?')[1]")

        def go(angle="clue", params=""):
            page.evaluate("hash=>{location.hash=hash}", f"#/explore?angle={angle}" + params)
            ready()

        def first_y():
            selector = "#exCards .rec" if page.viewport_size["width"] <= 640 else "#exBody tr[data-id]"
            return round(page.locator(selector).first.bounding_box()["y"], 2)

        def open_filter(key):
            panel = page.locator(f"[data-facet-panel='{key}']")
            if key != "ids":
                page.locator("#exMoreFilters").evaluate("el=>{el.open=true}")
            if not panel.evaluate("el=>el.open"):
                panel.locator(":scope > summary").click()
            panel.locator(".field-facet-body").wait_for(state="visible")
            return panel

        page.goto(BASE + "#/explore?angle=clue")
        page.locator("#accessPassword").fill(PASSWORD)
        page.locator("#accessSubmit").click()
        ready()

        closed_y = first_y()
        assert closed_y < 380, closed_y
        assert page.locator(".explore-head").bounding_box()["height"] < 42
        assert page.locator("#exCondition").is_hidden()
        page.locator("#exMoreFilters > summary").click()
        open_y = first_y()
        assert open_y < 540, open_y
        assert not page.locator("#exFieldFilters fieldset").count()
        summaries = page.locator("#exFieldFilters > [data-facet-panel]:visible > summary")
        heights = [box["height"] for box in summaries.evaluate_all("els=>els.map(el=>el.getBoundingClientRect().toJSON())")]
        assert max(heights) - min(heights) < 1, heights
        measurements.append({"width": 1440, "angle": "clue", "closed_first_record_y": closed_y, "open_first_record_y": open_y, "filter_height": heights[0]})
        page.screenshot(path=str(OUT / "desktop-clue-expanded.png"))
        passed("默认和展开分类时结果均在首屏，分类控件等高", closed_first_y=closed_y, expanded_first_y=open_y, control_height=heights[0])

        risk = open_filter("risks")
        assert abs(first_y() - open_y) < 1
        assert page.locator("[data-facet-panel][open]").count() == 1
        body = risk.locator(".field-facet-body").bounding_box()
        assert 0 <= body["x"] and body["x"] + body["width"] <= 1440
        risk.locator("input[value='高']").check()
        page.wait_for_function("new URLSearchParams(location.hash.split('?')[1]).get('risks')==='高' && document.querySelector('#exCount').dataset.query===location.hash.split('?')[1]")
        assert "200" in page.locator("#exCount").inner_text()
        assert "高" in risk.locator("[data-facet-preview]").inner_text()
        page.keyboard.press("Escape")
        assert not risk.evaluate("el=>el.open")
        assert risk.locator(":scope > summary").evaluate("el=>el===document.activeElement")
        passed("风险使用相同多选弹层，打开不推移记录，Escape 关闭并返回焦点", results=200)

        attitude = open_filter("attitudes")
        domain = open_filter("publisherDomains")
        assert not attitude.evaluate("el=>el.open")
        assert page.locator("[data-facet-panel][open]").count() == 1
        page.locator(".explore-head h1").click()
        assert not domain.evaluate("el=>el.open")
        page.locator("[data-remove-filter='risks']").click()
        ready()
        assert "risks=" not in page.url
        assert "1,468" in page.locator("#exCount").inner_text()
        assert page.locator("#exCondition").is_hidden()
        passed("仅一个分类弹层打开，点击外部关闭，可单独移除已选条件")

        institutions = open_filter("ids")
        institutions.locator("[data-facet-search]").fill("调查局")
        institutions.locator("input[value='1000110']").check()
        ready()
        institutions.locator("[data-facet-search]").fill("国土安全")
        institutions.locator("input[value='1001140']").check()
        ready()
        assert "+1" in institutions.locator("[data-facet-selected]").inner_text()
        institutions.locator("[data-facet-close]").last.click()
        assert "9 条" in page.locator("#exCount").inner_text()
        page.locator("[data-remove-filter='ids'][data-remove-value='1000110']").click()
        ready()
        assert "3 条" in page.locator("#exCount").inner_text()
        assert "美国国土安全部" in page.locator("#exInst [data-facet-preview]").inner_text()
        page.locator("#clearExplore").click()
        ready()
        assert "1,468" in page.locator("#exCount").inner_text()
        passed("机构采用统一搜索多选，可逐项移除并清除全部", two_institutions=9, remaining_institution=3)

        page.locator("#exMoreFilters").evaluate("el=>{el.open=true}")
        panel = open_filter("publisherDomains")
        panel.locator("input[value='dhs.gov']").check()
        ready()
        page.locator("#toggleFilters").click()
        assert page.locator("#exFilterControls").is_hidden()
        assert not page.locator("[data-facet-panel][open]").count()
        assert "dhs.gov" in page.locator("#exCondition").inner_text()
        assert "3 条" in page.locator("#exCount").inner_text()
        page.locator("[data-remove-filter='publisherDomains']").click()
        ready()
        assert "1,468" in page.locator("#exCount").inner_text()
        page.locator("#toggleFilters").click()
        passed("收起筛选会关闭弹层，已选条件仍可见并可移除")

        for width in (360, 390, 768, 1024, 1440, 1920):
            page.set_viewport_size({"width": width, "height": 844 if width < 1024 else 1000})
            for angle, key in (("news", "tags"), ("clue", "publisherDomains"), ("social", "hashtags")):
                go(angle)
                closed = first_y()
                page.locator("#exMoreFilters > summary").click()
                expanded = first_y()
                assert page.evaluate("document.documentElement.scrollWidth<=innerWidth+1"), (width, angle)
                panel = open_filter(key)
                assert abs(first_y() - expanded) < 1, (width, angle)
                popover = panel.locator(".field-facet-body").bounding_box()
                assert popover["x"] >= 0 and popover["x"] + popover["width"] <= width + 1, (width, angle, popover)
                assert popover["y"] >= 0 and popover["y"] + popover["height"] <= page.viewport_size["height"] + 1, (width, angle, popover)
                if width in (390, 1440) and angle == "social":
                    page.screenshot(path=str(OUT / f"social-popover-{width}.png"))
                page.keyboard.press("Escape")
                measurement = {"width": width, "angle": angle, "closed_first_record_y": closed, "expanded_first_record_y": expanded}
                measurements.append(measurement)
                if width >= 1024: assert expanded < 600, measurement
                if width == 390 and angle == "clue":
                    page.screenshot(path=str(OUT / "mobile-clue-expanded.png"))
                passed("不同宽度分类一致，弹层不撑高结果且位于窗口内", **measurement)
        assert not errors, errors
        passed("无页面脚本异常", errors=errors)
        browser.close()
    report = {"target": BASE, "tested_at": datetime.now(timezone.utc).isoformat(), "passed": len(checks), "errors": errors, "measurements": measurements, "checks": checks}
    (OUT / "results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({"passed": len(checks), "errors": errors}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    run()
