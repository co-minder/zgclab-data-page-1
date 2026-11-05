#!/usr/bin/env python3
"""Verify the independent filter dialog, row alignment, focus and result space."""
from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE = os.environ.get("ZGCLAB_TEST_URL", "http://127.0.0.1:8789/")
OUT = Path(os.environ.get("ZGCLAB_TEST_ARTIFACTS", "/home/ubuntu/log/zgclab-filter-dialog"))
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

        def go(angle="news", params=""):
            page.evaluate("hash=>{location.hash=hash}", f"#/explore?angle={angle}" + params)
            ready()

        def first_y():
            return page.evaluate("(()=>{const nodes=[...document.querySelectorAll('#exBody tr[data-id],#exCards .rec')];const first=nodes.find(el=>el.getBoundingClientRect().height>0);return Math.round(first.getBoundingClientRect().y*100)/100})()")

        def open_filter(key="ids"):
            if not page.locator("#exFilterDialog").evaluate("el=>el.open"):
                page.locator("#openFilters").click()
            page.locator(f"[data-filter-tab='{key}']").click()
            panel = page.locator(f"[data-facet-panel='{key}']" if key in ("ids", "tags", "risks", "hashtags", "publisherDomains", "type", "country") else f"[data-input-panel='{key}']")
            panel.wait_for(state="visible")
            return panel

        def row_alignment():
            result = page.locator(".filter-field-panel:not([hidden]) .facet-option").first.evaluate("el=>{const b=el.getBoundingClientRect(),parts=[...el.children].map(n=>n.getBoundingClientRect());return {height:b.height,centers:parts.map(r=>r.y+r.height/2),x:parts.map(r=>r.x),right:parts.at(-1).right,rowRight:b.right,display:getComputedStyle(el).display}}")
            assert result["display"] == "grid", result
            assert max(result["centers"]) - min(result["centers"]) < 2, result
            assert result["x"][0] < result["x"][1] < result["x"][2], result
            assert result["right"] <= result["rowRight"] + 1, result
            zoom = page.evaluate("Number(document.documentElement.style.zoom)||1")
            assert result["height"] <= 45 * zoom, result
            return result

        page.goto(BASE + "#/explore?angle=news")
        page.locator("#accessPassword").fill(PASSWORD)
        page.locator("#accessSubmit").click()
        ready()
        baseline_y = first_y()
        assert baseline_y < 320, baseline_y
        assert not page.locator("#exFilterDialog").evaluate("el=>el.open")
        assert not page.locator("#exMoreFilters,#exFilterControls,.basic-query").count()
        page.screenshot(path=str(OUT / "desktop-results.png"))
        passed("主页面仅搜索和筛选入口，筛选区不占表头前的空间", first_record_y=baseline_y)

        panel = open_filter()
        assert abs(first_y() - baseline_y) < 1
        alignment = row_alignment()
        page.locator("#exFilterDialog").evaluate("el=>el.scrollTop=0")
        assert page.locator("#exFilterDialog").evaluate("el=>el.matches(':modal')")
        passed("整个筛选为独立模态窗口，机构选项横向对齐", row_height=alignment["height"])

        # The actual report scenario: institution followed by a category.
        panel.locator("[data-facet-search]").fill("调查局")
        panel.locator("input[value='1000110']").check()
        ready()
        assert "1,446" in page.locator("#filterDialogStatus").inner_text()
        tags = open_filter("tags")
        tags.locator("input[value='policy']").check()
        ready()
        assert "431" in page.locator("#filterDialogStatus").inner_text()
        page.locator("#showFilterResults").click()
        assert "431" in page.locator("#exCount").inner_text()
        assert "policy" in page.locator("#exCondition").inner_text()
        assert not page.locator("#exFilterDialog").evaluate("el=>el.open")
        passed("FBI 与 policy 在同一窗口组合，关闭后结果和条件保留", actual=431)

        open_filter("ids")
        page.keyboard.press("Escape")
        assert page.locator("#openFilters").evaluate("el=>el===document.activeElement")
        assert page.evaluate("!document.body.classList.contains('filter-window-open')")
        assert "431" in page.locator("#exCount").inner_text()
        open_filter("ids")
        page.locator("#exFilterDialog").evaluate("el=>el.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:0,clientY:0}))")
        assert not page.locator("#exFilterDialog").evaluate("el=>el.open")
        passed("Escape 和遮罩关闭不丢条件，恢复焦点和页面滚动")

        panel = open_filter("ids")
        page.keyboard.press("Tab")
        assert page.evaluate("document.activeElement.closest('#exFilterDialog')!==null")
        page.locator("#showFilterResults").focus()
        page.keyboard.press("Tab")
        assert page.evaluate("document.activeElement.closest('#exFilterDialog')!==null")
        panel.locator("[data-facet-search]").fill("国土安全")
        panel.locator("input[value='1001140']").check()
        ready()
        assert page.locator("[data-filter-tab='ids'] [data-facet-selected]").inner_text() == "2"
        page.locator("#showFilterResults").click()
        page.locator("[data-remove-filter='ids'][data-remove-value='1000110']").click()
        ready()
        assert "1000110" not in page.url and "ids=1001140" in page.url
        passed("弹窗焦点限制、机构搜索多选与页面条件单项移除")

        open_filter("time")
        page.locator("#exPeriod").select_option("custom")
        page.locator("#exFrom").fill("2026-10-01")
        page.locator("#exTo").fill("2026-09-01")
        assert page.locator("#showFilterResults").is_disabled()
        assert "开始日期" in page.locator("#filterDialogStatus").inner_text()
        page.locator("[data-clear-inputs='time']").click()
        ready()
        assert page.locator("#showFilterResults").is_enabled()
        page.locator("#resetDialogFilters").click()
        ready()
        assert "3,675" in page.locator("#filterDialogStatus").inner_text()
        page.locator("#showFilterResults").click()
        assert page.locator("#exCondition").is_hidden()
        passed("弹窗内日期错误清晰提示，清空当前项和重置全部可恢复")

        open_filter("ids")
        go("social")
        assert not page.locator("#exFilterDialog").evaluate("el=>el.open")
        assert page.evaluate("!document.body.classList.contains('filter-window-open')")
        open_filter("hashtags")
        assert page.locator("[data-filter-tab='risks']").is_hidden()
        assert page.locator("[data-filter-tab='metrics']").is_visible()
        page.keyboard.press("Escape")
        passed("离开查询会清理弹窗和滚动状态，各角度显示适用字段")

        for width in (360, 390, 609, 768, 1024, 1440, 1920):
            page.set_viewport_size({"width": width, "height": 844 if width < 1024 else 1000})
            for angle, field in (("news", "tags"), ("clue", "publisherDomains"), ("social", "hashtags")):
                go(angle)
                y_before = first_y()
                panel = open_filter("ids")
                assert abs(first_y() - y_before) < 1
                geometry = page.locator("#exFilterDialog").bounding_box()
                assert geometry["x"] >= 0 and geometry["x"] + geometry["width"] <= width + 1, geometry
                assert geometry["y"] >= 0 and geometry["y"] + geometry["height"] <= page.viewport_size["height"] + 1, geometry
                row_alignment()
                assert page.locator("#exFilterDialog").evaluate("el=>el.scrollWidth<=el.clientWidth+1")
                if width in (390, 1440) and angle == "news":
                    page.screenshot(path=str(OUT / f"institution-dialog-{width}.png"))
                open_filter(field)
                assert page.locator(".filter-field-panel:not([hidden])").count() == 1
                page.keyboard.press("Escape")
                measurement = {"width": width, "angle": angle, "first_record_y": y_before}
                measurements.append(measurement)
                if width >= 1024: assert y_before < 340, measurement
                if width == 390: assert y_before < 340, measurement
                passed("不同宽度弹窗位于屏幕内，选项横向对齐，表格不位移", **measurement)

        page.set_viewport_size({"width": 1440, "height": 1000})
        go("news")
        open_filter("ids")
        for zoom in (1.25, 1.5):
            page.evaluate("value=>document.documentElement.style.zoom=value", zoom)
            row_alignment()
            assert page.locator("#exFilterDialog").evaluate("el=>el.scrollWidth<=el.clientWidth+1")
            passed("放大显示时机构勾选、名称、计数仍在同一行", zoom=zoom)
        page.evaluate("document.documentElement.style.zoom=''")
        assert not errors, errors
        passed("无页面脚本异常", errors=errors)
        browser.close()
    report = {"target": BASE, "tested_at": datetime.now(timezone.utc).isoformat(), "passed": len(checks), "errors": errors, "measurements": measurements, "checks": checks}
    (OUT / "results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({"passed": len(checks), "errors": errors}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    run()
