#!/usr/bin/env python3
"""Targeted dialog keyboard regression against current real projects.js source.

This serves the unchanged source module and palette in an isolated browser fixture;
it does not claim the encrypted deployment has been rebuilt. The first focus case
retains the independent acceptance QA's visible/inside assertion verbatim.
"""
from __future__ import annotations

import json
import os
import shutil
import traceback
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(os.environ.get("ZGCLAB_PROJECTS_FOCUS_ARTIFACTS", "/home/ubuntu/log/zgclab-projects-focus"))
HTML = """<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>专题弹窗键盘回归</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/projects.css"></head><body style="padding:20px"><button id="externalTrigger">外部添加入口</button><main id="view"></main><p id="notice"></p><script src="/projects.js"></script><script>
+window.workspace={favorites:[],queries:[],read:{},watchlist:[]};window.controller=new AbortController();window.version=0;
+window.api={view:document.querySelector('#view'),workspace,META:{version:'focus-test-v1',angles:{news:{name:'新闻舆情'},clue:{name:'官网线索'},social:{name:'社交媒体'}}},saveWorkspace:()=>true,showToast:m=>{document.querySelector('#notice').textContent=m},titleOf:(a,r)=>r.title??r.id,snippetOf:(a,r)=>r.summary??'',instName:id=>String(id),currentVersion:()=>version};
+window.entry={angle:'news',r:{id:'news-focus',ktid:0,title:'焦点回归材料',summary:'摘要',url:'https://example.org/source'}};
+window.mount=()=>{controller.abort();controller=new AbortController();version++;api.signal=controller.signal;api.version=version;return ZGCLAB_PROJECTS(new URLSearchParams(),api)};
+document.querySelector('#externalTrigger').onclick=()=>{window.adding=ZGCLAB_PROJECTS.addEntries([entry],api)};mount();
+</script></body></html>""".replace("\n+", "\n")


def run():
    OUT.mkdir(parents=True, exist_ok=True)
    passed, failed, page_errors = [], [], []
    browser = None
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path=shutil.which("google-chrome"), args=["--no-sandbox"])
        context = browser.new_context(viewport={"width": 1440, "height": 1000}, accept_downloads=True)

        def route(request):
            name = request.request.url.split("projects-focus.test/", 1)[1].split("?", 1)[0]
            if not name:
                request.fulfill(content_type="text/html", body=HTML)
            elif name in {"projects.js", "projects.css", "styles.css"}:
                request.fulfill(content_type="text/css" if name.endswith(".css") else "application/javascript", body=(ROOT / name).read_text())
            else:
                request.fulfill(status=404, body="missing")

        context.route("http://projects-focus.test/**", route)
        page = context.new_page()
        page.set_default_timeout(10000)
        page.on("pageerror", lambda error: page_errors.append(str(error)))

        def record(label, evidence=None):
            passed.append({"check": label, "evidence": evidence})
            print("PASS", label, flush=True)

        def focus_info():
            return page.evaluate("({tag:document.activeElement.tagName,id:document.activeElement.id,inside:!!document.activeElement.closest('dialog.projects-dialog'),visible:document.activeElement.getBoundingClientRect().height>0})")

        def assert_inside():
            focus = focus_info()
            assert focus["inside"] and focus["visible"], focus
            return focus

        def open_new():
            trigger = page.locator("#projectsNew")
            trigger.focus()
            page.keyboard.press("Enter")
            dialog = page.locator("dialog.projects-dialog[open]")
            dialog.wait_for()
            return trigger, dialog

        def assert_boundaries(dialog):
            dialog.locator('button[type="submit"]').focus()
            page.keyboard.press("Tab")
            assert_inside()
            assert dialog.locator('[data-dialog-close]').first.evaluate("el=>el===document.activeElement")
            page.keyboard.press("Shift+Tab")
            assert dialog.locator('button[type="submit"]').evaluate("el=>el===document.activeElement")

        try:
            page.goto("http://projects-focus.test/#/projects")
            page.locator("#projectsNew").wait_for()
            trigger, dialog = open_new()
            assert dialog.evaluate("el=>el.matches(':modal') && el.contains(document.activeElement)"), "Opening modal must move focus inside"
            dialog.locator("button[type=submit]").focus()
            page.keyboard.press("Tab")
            focus = page.evaluate("({tag:document.activeElement.tagName,id:document.activeElement.id,inside:!!document.activeElement.closest('dialog.projects-dialog'),visible:document.activeElement.getBoundingClientRect().height>0})")
            assert focus["inside"] and focus["visible"], {"action": "Tab from last submit button", "focus": focus}
            page.keyboard.press("Escape")
            assert trigger.evaluate("el=>el===document.activeElement"), "Escape must restore trigger focus"
            record("original acceptance focus assertion: Tab from last submit stays visible inside and Escape restores trigger", focus)

            trigger, dialog = open_new()
            assert_boundaries(dialog)
            dialog.locator('[name="name"]').focus()
            page.keyboard.press("Tab")
            assert dialog.locator('[name="description"]').evaluate("el=>el===document.activeElement")
            page.keyboard.press("Shift+Tab")
            assert dialog.locator('[name="name"]').evaluate("el=>el===document.activeElement")
            record("forward/reverse boundary wrapping and ordinary field order")
            page.screenshot(path=str(OUT / "projects-focus-desktop.png"))
            page.keyboard.press("Escape")

            trigger, dialog = open_new()
            dialog.evaluate("el=>{el.querySelector('[name=name]').hidden=true;el.querySelector('[name=description]').disabled=true;el.querySelector('button[type=submit]').disabled=true;el.querySelectorAll('[data-dialog-close]').forEach(b=>b.hidden=true);let wrap=document.createElement('div');wrap.innerHTML='<fieldset disabled><button>disabled descendant</button></fieldset><div hidden><button>hidden descendant</button></div><details><summary hidden>hidden summary</summary><button>closed details descendant</button></details><button tabindex=\"-1\">negative tabindex</button><div inert><button>inert descendant</button></div><button style=\"visibility:hidden\">css hidden</button><button id=onlyFocus>only enabled control</button>';el.querySelector('.projects-dialog-content').append(wrap)}")
            dialog.locator("#onlyFocus").focus()
            for key in ["Tab", "Shift+Tab", "Tab", "Shift+Tab"]:
                page.keyboard.press(key)
                assert dialog.locator("#onlyFocus").evaluate("el=>el===document.activeElement"), {"key": key, "focus": focus_info()}
            record("single eligible control loops and hidden/disabled/inert/closed details/negative tabindex are skipped")
            page.keyboard.press("Escape")
            assert trigger.evaluate("el=>el===document.activeElement")

            trigger, dialog = open_new()
            dialog.evaluate("el=>el.querySelectorAll('button,input,textarea,select').forEach(node=>node.disabled=true)")
            for key in ["Tab", "Shift+Tab", "Tab"]:
                page.keyboard.press(key)
                assert dialog.evaluate("el=>el===document.activeElement"), focus_info()
                assert_inside()
            record("no enabled focusable controls keeps visible focus on dialog in either direction")
            page.keyboard.press("Escape")
            assert page.locator("dialog.projects-dialog").count() == 0
            assert trigger.evaluate("el=>el===document.activeElement")
            record("Escape closes all-disabled dialog and restores trigger")

            trigger, dialog = open_new()
            dialog.evaluate("el=>el.replaceChildren()")
            for key in ["Shift+Tab", "Tab"]:
                page.keyboard.press(key)
                assert dialog.evaluate("el=>el===document.activeElement"), focus_info()
            record("empty dialog recovers focus after every child including the active field is removed")
            page.keyboard.press("Escape")
            assert trigger.evaluate("el=>el===document.activeElement")

            trigger, dialog = open_new()
            page.evaluate("document.activeElement.blur()")
            page.keyboard.press("Tab")
            assert_inside()
            page.evaluate("document.activeElement.blur()")
            page.keyboard.press("Shift+Tab")
            assert_inside()
            record("document-level Tab recovers focus if current control blurs to body")
            page.keyboard.press("Escape")

            trigger, dialog = open_new()
            page.evaluate("controller.abort()")
            assert page.locator("dialog.projects-dialog").count() == 0
            page.locator("#externalTrigger").focus()
            page.keyboard.press("Tab")
            assert page.locator("#projectsNew").evaluate("el=>el===document.activeElement")
            record("AbortSignal closes dialog and removes focus trap so normal page Tab resumes")
            page.evaluate("mount()")

            page.locator("#externalTrigger").focus()
            page.keyboard.press("Enter")
            dialog = page.locator("dialog.projects-dialog[open]")
            assert_boundaries(dialog)
            page.evaluate("location.hash='#/overview'")
            dialog.wait_for(state="detached")
            assert page.evaluate("adding") is None
            record("actual addEntries native dialog traps both directions and hash route cancellation returns null")
            page.evaluate("location.hash='#/projects';mount()")

            page.locator("#externalTrigger").click()
            dialog = page.locator("dialog.projects-dialog[open]")
            dialog.evaluate("el=>el.close()")
            dialog.wait_for(state="detached")
            assert page.evaluate("adding") is None
            assert page.locator("#externalTrigger").evaluate("el=>el===document.activeElement")
            record("programmatic native close settles promise and restores trigger without stale document listeners")

            # Create a real project through the actual submit handler, then exercise
            # the same shared dialog lifecycle for editing and safe import.
            trigger, dialog = open_new()
            dialog.locator('[name="name"]').fill("键盘专题")
            dialog.locator('[type="submit"]').click()
            dialog.wait_for(state="detached")
            page.locator("#projectEdit").click()
            dialog = page.locator("dialog.projects-dialog[open]")
            assert_boundaries(dialog)
            page.keyboard.press("Escape")
            assert page.locator("#projectEdit").evaluate("el=>el===document.activeElement")
            record("real new-project submission works and edit dialog shares bidirectional focus trap")

            backup = page.evaluate("ZGCLAB_PROJECTS.exportData(workspace)")
            page.locator("#projectsImport").set_input_files({"name": "keyboard-project.json", "mimeType": "application/json", "buffer": json.dumps(backup).encode()})
            dialog = page.locator("dialog.projects-dialog[open]")
            dialog.wait_for()
            assert_boundaries(dialog)
            page.keyboard.press("Escape")
            record("import confirmation with only action buttons traps focus in both directions")

            # A second top-layer native dialog must retain its own keyboard behavior.
            trigger, dialog = open_new()
            page.evaluate("window.other=document.createElement('dialog');other.id='otherDialog';other.innerHTML='<button id=otherButton>另一个顶层弹窗</button>';document.body.append(other);other.showModal();document.querySelector('#otherButton').focus()")
            assert page.locator("#otherButton").evaluate("el=>el===document.activeElement")
            page.keyboard.press("Escape")
            assert not page.locator("#otherDialog").evaluate("el=>el.open")
            assert dialog.evaluate("el=>el.open")
            assert_inside()
            page.evaluate("other.remove()")
            assert_boundaries(dialog)
            page.keyboard.press("Escape")
            record("a different top-layer modal receives Escape before the underlying project dialog")

            # Removing the trigger on a route transition cannot focus stale DOM.
            page.locator("#externalTrigger").click()
            dialog = page.locator("dialog.projects-dialog[open]")
            page.evaluate("document.querySelector('#externalTrigger').remove();controller.abort()")
            dialog.wait_for(state="detached")
            assert page.evaluate("adding") is None
            page.evaluate("mount()")
            trigger, dialog = open_new()
            assert_boundaries(dialog)
            page.keyboard.press("Escape")
            record("route abort tolerates removed trigger and a later dialog opens without stale traps")

            page.set_viewport_size({"width": 390, "height": 844})
            trigger, dialog = open_new()
            assert_boundaries(dialog)
            assert page.evaluate("document.documentElement.scrollWidth<=innerWidth+1")
            page.screenshot(path=str(OUT / "projects-focus-mobile.png"))
            page.keyboard.press("Escape")
            assert trigger.evaluate("el=>el===document.activeElement")
            record("390px native dark dialog retains keyboard focus and trigger restoration")
            assert not page_errors, page_errors
            record("all focus lifecycles produce zero uncaught browser errors")
        except Exception as error:
            failed.append({"error": str(error), "traceback": traceback.format_exc()})
            print("FAIL", type(error).__name__, str(error), flush=True)
            page.screenshot(path=str(OUT / "failure.png"))
        finally:
            result = {"scope": "targeted keyboard tests of actual unbuilt projects.js source, isolated fixture; encrypted-site rebuild still required", "executedAt": datetime.now(timezone.utc).isoformat(), "sourceSha256": sha256((ROOT / "projects.js").read_bytes()).hexdigest(), "passed": passed, "failed": failed, "pageErrors": page_errors}
            (OUT / "results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
            context.close()
            browser.close()
    print(f"{len(passed)} focus checks passed; {len(failed)} failed; artifacts: {OUT}", flush=True)
    return 1 if failed or page_errors else 0


if __name__ == "__main__":
    raise SystemExit(run())
