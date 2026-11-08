#!/usr/bin/env python3
"""Read actual API health in the assistant UI; no chat/search/model request.

Default mode checks the currently built preview without injecting source.
--inject-source checks the owned latest status fix before the central build.
"""
from datetime import datetime, timezone
from pathlib import Path
import argparse
import json
import os
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE = os.environ.get("ZGCLAB_TEST_URL", "http://127.0.0.1:8789/")
OUT = Path(os.environ.get("ZGCLAB_ASSISTANT_ARTIFACTS", "/home/ubuntu/log/zgclab-assistant"))


def run(inject):
    OUT.mkdir(parents=True, exist_ok=True)
    password = (ROOT / ".runtime/pages-password").read_text().strip()
    errors = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path=shutil.which("google-chrome"), args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.set_default_timeout(20000)
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(BASE + "#/overview")
        manifest = page.locator("script[data-manifest]").get_attribute("data-manifest")
        if page.locator("#accessForm").count():
            page.locator("#accessPassword").fill(password)
            page.locator("#accessSubmit").click()
        page.locator(".kpis").wait_for()
        if inject:
            page.add_script_tag(path=str(ROOT / "assistant.js"))
        page.evaluate("""()=>{
          window.__actualStatus=null;window.__unexpectedModelRequests=0;
          const client=ZGCLAB_SERVICE_CLIENT,original=client.status.bind(client);
          client.status=async(...args)=>{const data=await original(...args);window.__actualStatus=data;return data;};
          for(const name of ['chat','search']){const fn=client[name].bind(client);client[name]=(...args)=>{window.__unexpectedModelRequests++;return fn(...args);};}
          location.hash='#/assistant?mode=chat';
        }""")
        page.locator("#asHeading").wait_for()
        page.wait_for_function("window.__actualStatus!==null && document.querySelector('#asServiceStatus').textContent.includes('6,989')")
        status = page.evaluate("__actualStatus")
        ui = page.locator("#asServiceStatus").inner_text()
        stem = "assistant-status-source" if inject else "assistant-status-built"
        page.locator(".as-service").screenshot(path=str(OUT / (stem + ".png")))
        html = page.locator(".as-service").evaluate("element=>element.outerHTML")
        result = {"tested_at": datetime.now(timezone.utc).isoformat(), "manifest": manifest, "source_injected": inject, "ui_text": ui, "actual_response": status, "model_requests": page.evaluate("__unexpectedModelRequests"), "page_errors": errors}
        assert password not in json.dumps(result, ensure_ascii=False) and password not in html
        (OUT / (stem + ".json")).write_text(json.dumps(result, ensure_ascii=False, indent=2))
        (OUT / (stem + ".html")).write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>真实API状态</title><body>' + html + '</body></html>')
        assert status["database"] == "ready" and status["snapshot"]["total"] == 6989
        assert status["llm"]["available"] is True and status["llm"]["state"] == "ready"
        assert "模型可用" in ui and "模型暂不可用" not in ui
        if inject:
            assert "DeepSeek V4.1 Flash · ready" in ui
        assert result["model_requests"] == 0 and errors == []
        print(json.dumps({"PASS": "actual status API rendered with 6989 indexed records and ready model", "manifest": manifest, "source_injected": inject, "ui_text": ui, "model_requests": result["model_requests"], "evidence": str(OUT / (stem + ".json"))}, ensure_ascii=False), flush=True)
        browser.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--inject-source", action="store_true")
    run(parser.parse_args().inject_source)
