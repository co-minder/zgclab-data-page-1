#!/usr/bin/env python3
"""Check latest assistant source inside the protected preview, with API failure forced.

This injects the owned source module after unlock. It does not build/publish and
makes no model calls. The rest of the site uses the current preview bundle.
"""
from pathlib import Path
import json
import os
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE = os.environ.get("ZGCLAB_TEST_URL", "http://127.0.0.1:8789/")
OUT = Path(os.environ.get("ZGCLAB_ASSISTANT_ARTIFACTS", "/home/ubuntu/log/zgclab-assistant"))


def run():
    errors, checks = [], []
    password = (ROOT / ".runtime/pages-password").read_text().strip()
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path=shutil.which("google-chrome"), args=["--no-sandbox"])
        context = browser.new_context(viewport={"width": 1440, "height": 1000}, accept_downloads=True)
        page = context.new_page()
        page.set_default_timeout(20000)
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(BASE + "#/overview")
        if page.locator("#accessForm").count():
            page.locator("#accessPassword").fill(password)
            page.locator("#accessSubmit").click()
        page.locator(".kpis").wait_for()
        page.add_script_tag(path=str(ROOT / "assistant.js"))
        page.add_style_tag(path=str(ROOT / "assistant.css"))
        page.evaluate("""()=>{
          window.__assistantNetworkCalls=0;
          for(const name of ['status','search','chat']) ZGCLAB_SERVICE_CLIENT[name]=async()=>{window.__assistantNetworkCalls++;throw new TypeError('forced test outage');};
          location.hash='#/assistant?mode=search&q=人工智能';
        }""")
        page.locator("#asHeading").wait_for()
        page.locator("#asSubmit").click()
        page.wait_for_function("document.querySelector('#asForm').getAttribute('aria-busy')==='false'")
        assert "本地索引检索结果 · 未调用大模型" in page.locator("#asSearchResults").inner_text()
        assert page.locator("#asSearchResults .as-evidence").count() > 0
        assert "7,003" not in page.locator("#asSearchResults").inner_text()
        assert not page.locator("#asSearchResults a[href*='sim-']").count()
        first_record = page.locator("#asSearchResults h3 a").first.get_attribute("href")
        assert first_record.startswith("#/record/")
        checks.append("protected preview unlock, actual real-index fallback and record links")
        page.locator("#asChatTab").click()
        page.locator("#asKeep").check()
        page.locator("#asQuestion").fill("人工智能")
        page.locator("#asSubmit").click()
        page.wait_for_function("document.querySelector('#asForm').getAttribute('aria-busy')==='false'")
        stored = page.evaluate("JSON.parse(localStorage.getItem('zgclab.workspace.v1'))")
        assert stored["chatSessions"][0]["turns"][0]["source"] == "local"
        assert stored["chatSessions"][0]["turns"][0]["kind"] == "retrieval"
        assert "本站记录" in page.locator(".as-turn").inner_text()
        assert password not in json.dumps(stored, ensure_ascii=False)
        checks.append("real app saveWorkspace persists only bounded conversation/evidence")
        page.evaluate("location.hash='#/workspace'")
        page.locator("#backupWorkspace").wait_for()
        with page.expect_download() as download:
            page.locator("#backupWorkspace").click()
        backup = json.loads(Path(download.value.path()).read_text())
        assert backup["chatSessions"][0]["turns"][0]["items"]
        assert password not in json.dumps(backup, ensure_ascii=False)
        incoming = json.loads(json.dumps(backup))
        incoming["chatSessions"][0]["turns"][0]["question"] = "备份导入冲突副本"
        page.locator("#importWorkspace").set_input_files({"name": "assistant-workspace.json", "mimeType": "application/json", "buffer": json.dumps(incoming, ensure_ascii=False).encode()})
        page.wait_for_function("JSON.parse(localStorage.getItem('zgclab.workspace.v1')).chatSessions.length===2")
        merged = page.evaluate("JSON.parse(localStorage.getItem('zgclab.workspace.v1'))")
        assert merged["chatSessions"][0]["turns"][0]["question"] == "人工智能"
        assert merged["chatSessions"][1]["turns"][0]["question"] == "备份导入冲突副本"
        assert merged["favorites"] == stored["favorites"] and merged["queries"] == stored["queries"]
        checks.append("actual workspace export/import hook keeps originals and merges conflict as a new session")
        page.evaluate("location.hash='#/assistant?mode=chat'")
        page.locator(".as-turn").wait_for()
        assert "人工智能" in page.locator(".as-turn").inner_text()
        page.locator("#asSessions").select_option(merged["chatSessions"][1]["id"])
        page.wait_for_function("document.querySelector('.as-user-question p').textContent==='备份导入冲突副本'")
        assert page.locator(".as-turn a[href^='#/record/']").count() > 0
        page.set_viewport_size({"width": 390, "height": 844})
        assert page.evaluate("document.documentElement.scrollWidth<=innerWidth+1")
        page.screenshot(path=str(OUT / "assistant-real-preview-mobile.png"), full_page=True)
        checks.append("real app reopens both saved sessions with active record links and mobile layout")
        assert not errors, errors
        browser.close()
    for check in checks:
        print("PASS", check, flush=True)
    (OUT / "preview-results.json").write_text(json.dumps({"mode": "latest assistant source injected into protected preview; service mocked offline", "passed": len(checks), "checks": checks, "errors": errors}, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    run()
