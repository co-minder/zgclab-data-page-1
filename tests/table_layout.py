#!/usr/bin/env python3
"""Check angle badges and dates stay on one line at constrained table widths."""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE = os.environ.get("ZGCLAB_TEST_URL", "http://127.0.0.1:8789/")
OUT = Path(os.environ.get("ZGCLAB_TEST_ARTIFACTS", "/home/ubuntu/log/zgclab-account-table-layout"))
OUT.mkdir(parents=True, exist_ok=True)
PASSWORD = (ROOT / ".runtime/pages-password").read_text().strip()


def run():
    checks, errors = [], []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path=shutil.which("google-chrome"), args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.set_default_timeout(int(os.environ.get("ZGCLAB_TEST_TIMEOUT_MS", "30000")))
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(BASE + "#/explore?angle=clue")
        page.locator("#accessPassword").fill(PASSWORD)
        page.locator("#accessSubmit").click()
        page.wait_for_function("document.querySelector('#exCount')?.dataset.query")

        def check(label, **details):
            entry = {"check": label, "status": "PASS", **details}
            checks.append(entry)
            print(json.dumps(entry, ensure_ascii=False), flush=True)

        for width in (900, 1024, 1180, 1280, 1440):
            page.set_viewport_size({"width": width, "height": 1000})
            for zoom in (1, 1.25, 1.5):
                page.evaluate("zoom=>document.documentElement.style.zoom=zoom", zoom)
                for angle in ("news", "clue", "social"):
                    page.evaluate("a=>{location.hash='#/explore?angle='+a}", angle)
                    page.wait_for_function("document.querySelector('#exCount')?.dataset.query===location.hash.split('?')[1]")
                    layout = page.evaluate("""(()=>{
                      const lines=el=>{const range=document.createRange();range.selectNodeContents(el);return [...new Set([...range.getClientRects()].filter(r=>r.height>0&&r.width>0).map(r=>Math.round(r.y)))].length};
                      const rows=[...document.querySelectorAll('#exBody tr[data-id]')];
                      return {rows:rows.length,angleLines:rows.map(el=>lines(el.querySelector('.row-angle>.tag'))),dateLines:rows.map(el=>lines(el.querySelector('.row-date'))),angleWidths:rows.map(el=>el.cells[0].getBoundingClientRect().width),datesFit:rows.every(el=>el.querySelector('.row-date').scrollWidth<=el.querySelector('.row-date').clientWidth+1),pageFits:document.documentElement.scrollWidth<=innerWidth+1,visible:document.querySelector('.explorer-table').getBoundingClientRect().height>0};
                    })()""")
                    assert layout["visible"] and layout["rows"] == 14, layout
                    assert all(n == 1 for n in layout["angleLines"]), (width, zoom, angle, layout)
                    assert all(n == 1 for n in layout["dateLines"]), (width, zoom, angle, layout)
                    assert layout["datesFit"] and layout["pageFits"], (width, zoom, angle, layout)
                    if width == 1180 and zoom == 1.25 and angle in ("clue", "social"):
                        page.screenshot(path=str(OUT / f"{angle}-1180-125.png"))
                    check("角度标签与日期保持完整一行", width=width, zoom=zoom, angle=angle, checked_rows=layout["rows"])

        page.evaluate("document.documentElement.style.zoom=''")
        for width in (360, 390):
            page.set_viewport_size({"width": width, "height": 844})
            for angle in ("clue", "social"):
                page.evaluate("a=>{location.hash='#/explore?angle='+a}", angle)
                page.wait_for_function("document.querySelector('#exCount')?.dataset.query===location.hash.split('?')[1]")
                assert page.locator("#exCards").is_visible()
                assert page.evaluate("document.documentElement.scrollWidth<=innerWidth+1")
                check("手机使用卡片且无横向溢出", width=width, angle=angle)
        assert not errors, errors
        check("无页面脚本异常", errors=errors)
        browser.close()
    (OUT / "results.json").write_text(json.dumps({"target": BASE, "tested_at": datetime.now(timezone.utc).isoformat(), "passed": len(checks), "errors": errors, "checks": checks}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    run()
