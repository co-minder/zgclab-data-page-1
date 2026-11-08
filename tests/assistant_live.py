#!/usr/bin/env python3
"""One real UI request per invocation against the existing protected preview.

--db uses only exact database aggregation. --semantic makes one real semantic
search, with no retries; run explicitly when its model request is authorized.
No build, service restart, mock API or provider credential is used.
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


def run(kind):
    OUT.mkdir(parents=True, exist_ok=True)
    password = (ROOT / ".runtime/pages-password").read_text().strip()
    errors = []
    result = {"kind": kind, "target": BASE, "tested_at": datetime.now(timezone.utc).isoformat(), "source": "latest assistant.js injected into protected preview; actual service client/API"}
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path=shutil.which("google-chrome"), args=["--no-sandbox"])
        context = browser.new_context(viewport={"width": 1440, "height": 1100})
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
          window.__assistantLive={calls:[],responses:{}};
          const client=window.ZGCLAB_SERVICE_CLIENT;
          for(const name of ['status','search','chat']) {
            const original=client[name].bind(client);
            client[name]=async(...args)=>{
              const entry={method:name};
              if(name!=='status')entry.payload=args[0];
              window.__assistantLive.calls.push(entry);
              try{const response=await original(...args);window.__assistantLive.responses[name]=response;return response;}
              catch(error){entry.error={name:error.name,code:error.code,status:error.status,message:error.message};throw error;}
            };
          }
        }""")
        if kind == "db":
            page.evaluate("location.hash='#/assistant?mode=chat'")
        else:
            page.evaluate("location.hash='#/assistant?mode=search'")
        page.locator("#asHeading").wait_for()
        page.locator(".as-connection.is-connected").wait_for()
        result["service_status"] = page.evaluate("__assistantLive.responses.status")
        if kind == "db":
            page.locator("#asQuestion").fill("FBI 一共有多少条记录？")
        else:
            page.locator("#asSemantic").check()
            page.locator("#asExpand").check()
            page.locator("#asLimit").select_option("10")
            page.locator("#asQuestion").fill("人工智能安全")
        page.locator("#asSubmit").click()
        page.wait_for_function("document.querySelector('#asForm').getAttribute('aria-busy')==='false'", timeout=140000)
        result["request_calls"] = page.evaluate("__assistantLive.calls.filter(call=>call.method!=='status')")
        response = page.evaluate("__assistantLive.responses.chat" if kind == "db" else "__assistantLive.responses.search")
        result["response"] = response
        result["visible_error"] = page.locator("#asErrorText").inner_text() if page.locator("#asError").is_visible() else ""
        result["ui_text"] = page.locator("#asTranscript" if kind == "db" else "#asSearchResults").inner_text()
        if kind == "db":
            citation = page.locator(".as-citation-ref", has_text="[A1]")
            result["aggregate_reference_count"] = citation.count()
            if citation.count():
                citation.first.click()
                result["focused_citation"] = page.evaluate("document.activeElement.dataset.asCitation")
                result["focused_text"] = page.evaluate("document.activeElement.innerText")
            result["ui_heading"] = page.locator(".as-answer>h2").all_text_contents()
        else:
            result["ui_heading"] = page.locator(".as-result-head>h2").all_text_contents()
            result["evidence_count"] = page.locator("#asSearchResults .as-evidence-list .as-evidence").count()
        result["page_errors"] = errors
        stem = "assistant-live-" + kind
        screenshot = OUT / (stem + ".png")
        page.screenshot(path=str(screenshot), full_page=True)
        html = page.locator(".as-root").evaluate("element=>element.outerHTML")
        assert password not in html and password not in json.dumps(result, ensure_ascii=False)
        (OUT / (stem + ".html")).write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>实际研究服务 UI 证据</title><body>' + html + '</body></html>')
        result["screenshot"] = str(screenshot)
        (OUT / (stem + ".json")).write_text(json.dumps(result, ensure_ascii=False, indent=2))
        browser.close()
    assert len(result["request_calls"]) == 1, result["request_calls"]
    assert response is not None, "Actual service response missing; inspect saved evidence"
    if kind == "db":
        assert response["state"] == "database_answer", response.get("state")
        assert response["model"]["used"] is False and response["model"]["attempted"] is False
        assert response.get("usage", {}) == {}
        assert result["focused_citation"] == "A1"
        assert "数据库精确统计 · 未调用大模型" in result["ui_heading"]
        assert "生成资料回答" not in result["ui_text"]
        print(json.dumps({"PASS": "real UI database answer, no model usage, clickable A1", "state": response["state"], "model": response["model"], "total": response["aggregates"]["matched"]["total"], "citation_focus": result["focused_citation"], "screenshot": result["screenshot"]}, ensure_ascii=False), flush=True)
    else:
        assert result["request_calls"][0]["payload"]["semantic"] is True
        assert result["request_calls"][0]["payload"]["expand"] is True
        assert errors == [], errors
        print(json.dumps({"CHECK": "one real semantic search; no retry", "state": response.get("state"), "model": response.get("model"), "model_plan": response.get("plan", {}).get("model"), "usage": response.get("usage"), "matched": response.get("coverage", {}).get("matched_records"), "evidence_count": result["evidence_count"], "ui_heading": result["ui_heading"], "screenshot": result["screenshot"]}, ensure_ascii=False), flush=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--db", action="store_true")
    modes.add_argument("--semantic", action="store_true")
    args = parser.parse_args()
    run("db" if args.db else "semantic")
