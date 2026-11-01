#!/usr/bin/env python3
"""Browser regression against a running static server; no installation required."""
from __future__ import annotations

import csv
import io
import json
import os
import shutil
from pathlib import Path
from urllib.parse import quote

from playwright.sync_api import sync_playwright

BASE = os.environ.get("ZGCLAB_TEST_URL", "http://127.0.0.1:8787/")
ARTIFACTS = Path(os.environ.get("ZGCLAB_TEST_ARTIFACTS", "/home/ubuntu/log/zgclab-web-check"))
ARTIFACTS.mkdir(parents=True, exist_ok=True)
password_path = Path(__file__).resolve().parent.parent / ".runtime" / "pages-password"
PASSWORD = os.environ.get("ZGCLAB_TEST_PASSWORD") or (password_path.read_text().rstrip("\r\n") if password_path.is_file() else None)


def run() -> None:
    results = []
    errors = []
    with sync_playwright() as pw:
        executable = os.environ.get("ZGCLAB_CHROME") or shutil.which("google-chrome")
        browser = pw.chromium.launch(headless=True, executable_path=executable, args=["--no-sandbox"])
        context = browser.new_context(viewport={"width": 1440, "height": 1000}, accept_downloads=True)
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.set_default_timeout(30000)

        def unlock(target) -> None:
            if not target.locator("#accessForm").count():
                return
            assert PASSWORD, "Set ZGCLAB_TEST_PASSWORD to test the password-protected deployment"
            target.locator("#accessPassword").fill(PASSWORD)
            target.locator("#accessSubmit").click()
            target.locator("#lockSession").wait_for()

        def go(route: str, ready: str) -> None:
            page.goto(BASE + route)
            unlock(page)
            page.locator(ready).first.wait_for()

        def record(label: str) -> None:
            results.append(label)
            print("PASS", label, flush=True)

        page.goto(BASE + "#/overview")
        protected = page.locator("#accessForm").count() > 0
        if protected:
            assert page.locator(".kpis").count() == 0
            assert context.request.get(BASE + "data/meta.js").status == 404
            assert page.evaluate("!window.ZGCLAB_META")
            page.locator("#accessPassword").fill("incorrect-password-for-test")
            page.locator("#accessSubmit").click()
            page.locator("#accessError", has_text="密码不正确").wait_for()
            assert page.locator(".kpis").count() == 0
            page.screenshot(path=str(ARTIFACTS / "password.png"))
            record("locked screen, wrong password rejection, and no raw data endpoint")
        unlock(page)
        page.locator(".kpis").wait_for()
        assert "6,989" in page.locator(".kpis").inner_text()
        assert context.request.get(BASE + "favicon.svg").status == 200
        page.screenshot(path=str(ARTIFACTS / "overview.png"), full_page=True)
        record("overview counts and favicon")

        go("#/explore?angle=all", "#exBody tr[data-id]")
        assert "6,989" in page.locator("#exCount").inner_text()
        assert page.locator("#exBody tr[data-id]").count() == 14
        record("all angles, total count, and lazy loading")

        page.locator("#exInst").select_option("5775050")
        page.locator("#exQ").fill('"OpenAI" -military')
        page.wait_for_function("location.hash.includes('q=') && document.querySelector('#exCount').textContent.includes('筛选结果')")
        assert "ids=5775050" in page.url
        assert all("OpenAI" in text for text in page.locator("#exBody tr[data-id]").all_inner_texts())
        record("institution plus phrase/exclusion query")

        page.locator("#saveQuery").click()
        page.wait_for_function("JSON.parse(localStorage.getItem('zgclab.workspace.v1')).queries.length===1")
        page.locator("#exBody tr[data-id]").first.click()
        page.wait_for_function("document.querySelector('#detailStatus').textContent.includes('已载入完整交付记录')")
        field_count = page.locator(".schema-field").count()
        page.locator("#showEmptyFields").check()
        assert page.locator(".schema-field").count() >= field_count
        page.locator("#favoriteRecord").click()
        assert "已收藏" in page.locator("#favoriteRecord").inner_text()
        with page.expect_download() as download_info:
            page.locator("#downloadRecord").click()
        downloaded = download_info.value
        csv_rows = list(csv.reader(io.StringIO(Path(downloaded.path()).read_text(encoding="utf-8-sig"))))
        assert len(csv_rows) == 2 and "snapshot_id" in csv_rows[0]
        assert len(csv_rows[0]) == len(csv_rows[1])
        page.keyboard.press("Escape")
        assert page.locator(".modal").count() == 0
        record("complete fields, favorite, CSV, and Escape")

        page.locator("#clearExplore").click()
        page.wait_for_function("document.querySelector('#exCount').textContent.includes('6,989')")
        page.locator("#exSize").select_option("25")
        page.wait_for_function("document.querySelectorAll('#exBody tr[data-id]').length===25")
        page.locator(".pager button[data-p='2']").first.click()
        page.wait_for_function("location.hash.includes('page=2')")
        first_id = page.locator("#exBody tr[data-id]").first.get_attribute("data-id")
        page.reload()
        if protected:
            page.locator("#accessForm").wait_for()
            assert page.locator("#exBody").count() == 0
            assert page.evaluate("!sessionStorage.getItem('zgclab.access.key.v1') && !window.ZGCLAB_META")
            record("every reload requires the password and exposes no decrypted data")
            unlock(page)
        page.locator("#exBody tr[data-id]").first.wait_for()
        assert page.locator("#exBody tr[data-id]").first.get_attribute("data-id") == first_id
        record("page size and page survive reload")

        page.locator("#exFrom").fill("2026-10-01")
        page.locator("#exTo").fill("2026-09-01")
        assert page.locator("#exError").is_visible()
        assert page.locator("#exportResults").is_disabled()
        page.locator("#exFrom").fill("2026-09-01")
        page.locator("#exTo").fill("2026-09-30")
        page.locator("#exBody tr[data-id]").first.wait_for()
        page.wait_for_function("!document.querySelector('#exportResults').disabled")
        dates = page.locator("#exBody tr[data-id] td:last-child").all_inner_texts()
        assert all("2026-09-01" <= date <= "2026-09-30" for date in dates)
        record("date validation and inclusive date filters")

        go("#/explore?angle=clue&sub=" + quote("risk_level:高"), "#exBody tr[data-id]")
        assert "200" in page.locator("#exCount").inner_text()
        assert all("高" in text for text in page.locator("#exBody tr[data-id] td:nth-child(4)").all_inner_texts())
        page.locator("#exBody tr[data-id]").first.focus()
        page.keyboard.press("Enter")
        page.wait_for_function("document.querySelector('#detailStatus').textContent.includes('已载入完整交付记录')")
        page.locator("#showEmptyFields").check()
        assert page.locator(".schema-field").count() == 35
        assert "original_content" in page.locator("#recordDetails").inner_text()
        page.locator(".modal-body").evaluate("el=>{el.scrollTop=el.scrollHeight/2}")
        assert page.locator("#modalClose").is_visible()
        assert page.locator("#nextRecord").is_visible()
        assert page.locator(".modal-head").bounding_box()["y"] >= 0
        footer_box = page.locator(".modal-footer").bounding_box()
        assert footer_box["y"] + footer_box["height"] <= 1000
        page.screenshot(path=str(ARTIFACTS / "record-detail.png"))
        page.locator("#nextRecord").click()
        assert "2/200" in page.locator(".modal-actions").inner_text()
        page.keyboard.press("Escape")
        record("risk counts, keyboard, all 35 fields, next record")

        go("#/record/news/news-1", ".modal")
        page.wait_for_function("document.querySelector('#detailStatus').textContent.includes('已载入完整交付记录')")
        assert page.locator(".schema-field").filter(has=page.locator("code", has_text="content")).count() > 0
        page.keyboard.press("Escape")
        record("existing record deep links and full news text")

        go("#/workspace", "#backupWorkspace")
        assert page.locator("[data-remove-query]").count() == 1
        assert page.locator("[data-remove-favorite]").count() == 1
        page.screenshot(path=str(ARTIFACTS / "workspace.png"), full_page=True)
        record("saved query and favorites persist across routes")

        go("#/compare?ids=5775050,1000490", ".compare-table")
        assert page.locator(".compare-table thead th").count() == 3
        with page.expect_download() as download_info:
            page.locator("#exportCompare").click()
        assert download_info.value.suggested_filename.endswith(".csv")
        record("institution comparison and export")

        go("#/institution/1000490?angle=clue", "#instRecs .rec")
        assert page.locator("#instTabs .active").get_attribute("data-angle") == "clue"
        assert "727" in page.locator("#instRecSummary").inner_text()
        record("institution route restores chosen angle")

        # Navigate away while three data scripts are still downloading.
        race_context = browser.new_context()
        race_page = race_context.new_page()
        race_page.on("pageerror", lambda error: errors.append(str(error)))
        race_page.goto(BASE + "#/explore?angle=all", wait_until="domcontentloaded")
        unlock(race_page)
        race_page.evaluate("location.hash='#/about'")
        race_page.locator("h1", has_text="任务与交付").wait_for()
        race_page.wait_for_function("Array.isArray(window.ZGCLAB_NEWS) && Array.isArray(window.ZGCLAB_CLUE) && Array.isArray(window.ZGCLAB_SOCIAL)")
        assert race_page.locator("h1").inner_text() == "任务与交付"
        assert "/about" in race_page.url
        race_context.close()
        record("slow loading cannot overwrite a new route")

        page.set_viewport_size({"width": 390, "height": 844})
        go("#/explore?angle=social", "#exCards .rec")
        assert page.locator(".mobile-nav").is_visible()
        assert not page.locator(".explorer-table").is_visible()
        assert page.locator("#exCards .rec").count() == 14
        for tab in page.locator("#exTabs .tab").all():
            box = tab.bounding_box()
            assert 0 <= box["x"] and box["x"] + box["width"] <= 390
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth+1")
        page.screenshot(path=str(ARTIFACTS / "mobile-query.png"), full_page=True)
        page.locator("#exCards .rec").first.click()
        page.wait_for_function("document.querySelector('#detailStatus').textContent.includes('已载入完整交付记录')")
        page.locator(".modal-body").evaluate("el=>{el.scrollTop=el.scrollHeight}")
        assert page.locator("#modalClose").bounding_box()["y"] >= 0
        box = page.locator(".modal-footer").bounding_box()
        assert box["y"] + box["height"] <= 844
        page.keyboard.press("Escape")
        record("mobile cards, all angle tabs, fixed detail controls, and no overflow")

        if protected:
            page.locator("#lockSession").click()
            page.locator("#accessForm").wait_for()
            assert page.evaluate("!sessionStorage.getItem('zgclab.access.key.v1')")
            assert page.locator("#exCards").count() == 0
            unlock(page)
            page.locator("#exCards .rec").first.wait_for()
            record("lock clears the session and re-unlock restores the requested route")

        assert not errors, errors
        context.close()
        browser.close()
    report = {"passed": len(results), "checks": results, "errors": errors}
    (ARTIFACTS / "results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    run()
