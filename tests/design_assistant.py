#!/usr/bin/env python3
"""Assistant visual contracts with existing Chrome, mocks and protected source injection.

No build or model call. The source preview removes the old assistant CSS from the
unlocked package before loading current shared styles and the owned module CSS.
"""
from pathlib import Path
import importlib.util
import json
import os
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(os.environ.get("ZGCLAB_ASSISTANT_ARTIFACTS", "/home/ubuntu/log/zgclab-ui-design-20261109/assistant"))
BASE = os.environ.get("ZGCLAB_TEST_URL", "http://127.0.0.1:8788/")
WIDTHS = (360, 390, 739, 768, 1024, 1440)


def open_details(page, selector):
    if not page.locator(selector).evaluate("element=>element.open"):
        page.locator(selector + " > summary").click()


def geometry(page):
    return page.evaluate("""()=>({
      viewport:innerWidth, documentWidth:document.documentElement.scrollWidth,
      formTop:document.querySelector('#asForm').getBoundingClientRect().top+scrollY,
      formHeight:document.querySelector('#asForm').getBoundingClientRect().height,
      transcriptTop:document.querySelector('#asTranscript').getBoundingClientRect().top+scrollY,
      submitHeight:document.querySelector('#asSubmit').getBoundingClientRect().height,
      submitBottom:document.querySelector('#asSubmit').getBoundingClientRect().bottom+scrollY,
      titleSize:parseFloat(getComputedStyle(document.querySelector('#asHeading')).fontSize)
    })""")


def fit(page, label, measurements):
    values = geometry(page)
    assert values["documentWidth"] <= values["viewport"] + 1, (label, values)
    assert values["submitHeight"] >= (44 if values["viewport"] <= 560 else 40), (label, values)
    assert values["titleSize"] == (24 if values["viewport"] <= 560 else 28), (label, values)
    measurements[label] = values


def submit(page, question):
    page.locator("#asQuestion").fill(question)
    page.locator("#asSubmit").click()
    page.wait_for_function("document.querySelector('#asForm').getAttribute('aria-busy')==='false'")


def run():
    OUT.mkdir(parents=True, exist_ok=True)
    # Repeat the established interaction suite unchanged. Its own disclosure
    # clicks now open the source/process dialogs; actions stay inside them.
    os.environ["ZGCLAB_ASSISTANT_ARTIFACTS"] = str(OUT / "mock")
    suite = (ROOT / "tests/assistant_mock.py").read_text()
    exec(compile(suite, str(ROOT / "tests/assistant_mock.py"), "exec"), {"__name__": "__main__", "__file__": str(ROOT / "tests/assistant_mock.py")})
    spec = importlib.util.spec_from_file_location("assistant_mock", ROOT / "tests/assistant_mock.py")
    fixture = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fixture)
    html = fixture.HTML.replace("mount('q=人工智能');", "mount('mode=search');")
    errors, checks, measurements = [], [], {}
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path=shutil.which("google-chrome"), args=["--no-sandbox"])
        context = browser.new_context(viewport={"width": 1440, "height": 1000}, accept_downloads=True)
        def route(request):
            path = request.request.url.split("assistant.test/", 1)[1].split("?", 1)[0]
            if not path:
                request.fulfill(status=200, content_type="text/html", body=html)
            elif path in {"styles.css", "assistant.css", "assistant.js", "core.js", "query.js"}:
                request.fulfill(status=200, content_type="text/css" if path.endswith("css") else "application/javascript", body=(ROOT / path).read_text())
            else:
                request.fulfill(status=404, body="missing")
        context.route("http://assistant.test/**", route)
        page = context.new_page()
        page.set_default_timeout(15000)
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto("http://assistant.test/#/assistant")
        page.locator(".as-connection.is-connected").wait_for()
        for width in WIDTHS:
            page.set_viewport_size({"width": width, "height": 950})
            page.evaluate("mount('mode=search')")
            page.locator("#asHeading").wait_for()
            assert page.locator("#asWelcome").is_visible()
            assert not page.locator("#asOutputTools").is_visible()
            assert not page.locator("#asScope").evaluate("e=>e.open") if width <= 1279 else page.locator("#asScope").evaluate("e=>e.open")
            fit(page, f"mock-empty-{width}", measurements)
            first_example = page.locator("[data-as-example]").first
            expected_example = first_example.get_attribute("data-as-example")
            first_example.click()
            assert expected_example and page.locator("#asQuestion").input_value() == expected_example
            assert page.evaluate("document.activeElement.id") == "asQuestion"
            page.locator("#asChatTab").focus()
            page.keyboard.press("ArrowLeft")
            assert page.locator("#asSearchTab").get_attribute("aria-selected") == "true"
            assert page.evaluate("document.activeElement.id") == "asSearchTab"
            page.keyboard.press("ArrowRight")
            assert page.locator("#asChatTab").get_attribute("aria-selected") == "true"
            assert page.evaluate("document.activeElement.id") == "asChatTab"
            assert page.locator("#asSessionArea").is_visible()
            page.locator("#asSessionArea > summary").focus()
            page.keyboard.press("Enter")
            assert page.locator("#asKeep").is_visible()
            page.locator("#asKeep").check()
            page.locator("#asSessionArea > summary").click()
            page.evaluate("chatMode='answered'")
            submit(page, "人工智能安全研究的主要资料是什么？")
            fit(page, f"mock-answer-{width}", measurements)
            assert page.locator("#asWelcome").is_hidden()
            assert page.evaluate("document.querySelector('#asReading').lastElementChild.id") == "asComposeDock"
            assert page.evaluate("document.querySelector('#asForm').getBoundingClientRect().top>document.querySelector('#asTranscript').getBoundingClientRect().bottom")
            page.wait_for_function("document.querySelector('[data-as-citation=C3] a[data-as-local-record]')")
            c3_chip = page.locator(".as-citation-ref", has_text="[C3]").first
            c3_chip.click()
            c3_dialog = page.locator("dialog.as-citation-dialog-c[open]")
            c3_dialog.wait_for()
            c3_text = c3_dialog.inner_text()
            assert "证据原文" in c3_text and "回答使用的来源摘录" in c3_text
            assert c3_dialog.locator(".as-citation-clone h3").inner_text().strip()
            assert c3_dialog.locator("a[data-as-local-record]").get_attribute("href") == "#/record/news/news-1"
            assert page.locator("#asTranscript .as-evidence:not(.as-citation-clone)>.as-excerpt").inner_text().startswith("证据原文 <img")
            assert page.locator(".as-root img,.as-markdown script").count() == 0
            c3_dialog.locator("[data-as-dialog-close]").click()
            page.wait_for_function("!document.querySelector('.as-citation-dialog')")
            assert c3_chip.evaluate("el=>el===document.activeElement")
            a1_chip = page.locator(".as-citation-ref", has_text="[A1]").first
            a1_chip.click()
            a1_dialog = page.locator("dialog.as-citation-dialog-a[open]")
            a1_dialog.wait_for()
            a1_text = a1_dialog.inner_text()
            assert "结构化范围" in a1_text and "检索规则命中" in a1_text and "分母 73 条" in a1_text
            assert a1_dialog.locator(".as-aggregate-table table tbody tr").count() == 2
            page.keyboard.press("Escape")
            page.wait_for_function("!document.querySelector('.as-citation-dialog')")
            assert a1_chip.evaluate("el=>el===document.activeElement")
            open_details(page, ".as-aggregate-details")
            fit(page, f"mock-answer-expanded-statistics-{width}", measurements)
            page.locator(".as-aggregate-details > summary").click()
            page.screenshot(path=str(OUT / f"after-mock-answer-{width}.png"), full_page=True)
            page.evaluate("chatMode='database'")
            submit(page, "数据库一共有多少条？")
            assert "数据库精确统计 · 未调用大模型" in page.locator(".as-turn").last.inner_text()
            fit(page, f"mock-database-{width}", measurements)
            page.screenshot(path=str(OUT / f"after-mock-statistics-{width}.png"), full_page=True)
            page.evaluate("mount('mode=search')")
            page.locator("#asHeading").wait_for()
            submit(page, "人工智能安全")
            fit(page, f"mock-search-{width}", measurements)
            page.screenshot(path=str(OUT / f"after-mock-search-{width}.png"), full_page=True)
            assert "42 条记录命中" in page.locator(".as-result-head").inner_text()
            assert not page.locator("#asSearchResults .as-retrieval-process").evaluate("el=>el.open")
            page.locator("#asSearchResults .as-retrieval-process > summary").click()
            search_process = page.locator("dialog.as-process-dialog[open]")
            search_process.wait_for()
            assert "artificial intelligence" in search_process.inner_text()
            search_process.get_by_role("button", name="撤回扩展并重查").click()
            page.wait_for_function("document.querySelector('#asForm').getAttribute('aria-busy')==='false'")
            assert page.locator("dialog.as-process-dialog[open]").count() == 0
            assert not page.evaluate("calls.search.at(-1).expand || calls.search.at(-1).semantic")
            with page.expect_download() as download:
                page.locator("#asExport").click()
            markdown = Path(download.value.path()).read_text()
            assert "[A1]" in markdown and "[C3]" in markdown
            assert "https://example.org/evidence" in markdown
            page.evaluate("mockMode='empty'")
            submit(page, "未收录主题")
            assert "没有匹配资料" in page.locator("#asSearchResults").inner_text()
            fit(page, f"mock-no-results-{width}", measurements)
            page.evaluate("mockMode='normal';workspace.chatSessions=[];workspace.assistantPreferences={};")
        checks.append("360/390/739/768/1024/1440: empty, answer, database, search, expanded statistics and zero-results fit; 40/44px actions; 28/24px titles")
        checks.append("keyboard tab switching, keyboard disclosure, example focus, C3 evidence/A1 statistics dialogs, follow-up composer after transcript")
        checks.append("search process dialog, withdraw extension, Markdown download, evidence HTML safety and visible actual state")
        # A fourth source is initially folded; its inline citation must still reveal and focus it.
        page.evaluate("""()=>{
          const originalChat=client.chat.bind(client);
          client.chat=async(...args)=>{const response=await originalChat(...args);response.citations=Array.from({length:5},(_,i)=>({...citation(),citation_id:'C'+(i+1),id:'news-'+(i+1)}));response.answer='继续核对第五段引用。[C5]';return response;};
          workspace.chatSessions=[];workspace.assistantPreferences={};mount('mode=chat');
        }""")
        submit(page, "多来源引用检查")
        assert not page.locator(".as-more-sources").evaluate("e=>e.open")
        c5_chip = page.locator(".as-citation-ref", has_text="[C5]").first
        c5_chip.click()
        c5_dialog = page.locator("dialog.as-citation-dialog-c[open]")
        c5_dialog.wait_for()
        assert "证据原文" in c5_dialog.inner_text()
        assert c5_dialog.locator(".as-citation-clone h3").count() == 1
        c5_dialog.locator("[data-as-dialog-close]").click()
        page.wait_for_function("!document.querySelector('.as-citation-dialog')")
        assert c5_chip.evaluate("el=>el===document.activeElement")
        page.get_by_role("button", name="继续追问 ↓").click()
        assert page.evaluate("document.activeElement.id") == "asQuestion"
        checks.append("C5 chip opens its citation dialog; continue-question shortcut focuses the composer")
        context.close()

        # Actual protected app, only this module and the latest shared CSS injected.
        actual = browser.new_context(viewport={"width": 1440, "height": 1000}, accept_downloads=True)
        real = actual.new_page()
        real.set_default_timeout(20000)
        real.on("pageerror", lambda error: errors.append(str(error)))
        real.goto(BASE + "#/overview")
        if real.locator("#accessForm").count():
            real.locator("#accessPassword").fill((ROOT / ".runtime/pages-password").read_text().strip())
            real.locator("#accessSubmit").click()
        real.locator(".kpis").wait_for()
        real.evaluate("""()=>{
          for(const style of document.querySelectorAll('style')) {
            const start=style.textContent.indexOf('/* Scoped styles for the standalone research assistant route. */');
            if(start>=0) style.textContent=style.textContent.slice(0,start);
          }
          window.__designModelCalls=0;
          for(const name of ['search','chat']) ZGCLAB_SERVICE_CLIENT[name]=async()=>{window.__designModelCalls++;throw new TypeError('visual test: local index only');};
        }""")
        real.add_script_tag(path=str(ROOT / "assistant.js"))
        real.add_style_tag(path=str(ROOT / "styles.css"))
        real.add_style_tag(path=str(ROOT / "assistant.css"))
        for width in WIDTHS:
            real.set_viewport_size({"width": width, "height": 844 if width <= 900 else 1000})
            real.evaluate("location.hash='#/overview'")
            real.locator(".kpis").wait_for()
            real.evaluate("location.hash='#/assistant?mode=chat'")
            real.locator("#asHeading").wait_for()
            real.evaluate("scrollTo(0,0)")
            fit(real, f"protected-empty-chat-{width}", measurements)
            assert geometry(real)["formTop"] < 555, geometry(real)
            assert geometry(real)["submitBottom"] < (804 if width <= 1279 else 1000), geometry(real)
            real.screenshot(path=str(OUT / f"after-protected-empty-chat-{width}.png"), full_page=True)
            if width == 390:
                real.locator(".mobile-more > summary").click()
                assert real.locator(".mobile-more nav").is_visible()
                assert real.locator(".mobile-more nav a[href='#/assistant']").count() > 0
                fit(real, "protected-mobile-menu", measurements)
                real.screenshot(path=str(OUT / "after-protected-menu-390.png"), full_page=True)
                real.locator(".mobile-more > summary").click()
            submit(real, "人工智能")
            assert "本地索引" in real.locator(".as-turn").inner_text()
            assert "未调用大模型" in real.locator(".as-turn").inner_text()
            assert real.locator(".as-turn a[href^='#/record/']").count() > 0
            assert not real.locator(".as-turn a[href*='sim-']").count()
            fit(real, f"protected-local-chat-{width}", measurements)
            real.screenshot(path=str(OUT / f"after-protected-local-chat-{width}.png"), full_page=True)
        assert real.evaluate("__designModelCalls") == len(WIDTHS)
        checks.append("actual protected app: current shared/module CSS, empty compose top <555px across widths, real index citations and local fallback; model methods stubbed")
        checks.append("actual mobile navigation menu remains discoverable and fits")
        assert not errors, errors
        browser.close()
    report = {"mode": "source preview, not built/published; deterministic mocks + real local-index fallback; no paid model request", "checks": checks, "measurements": measurements, "page_errors": errors}
    (OUT / "design-results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    for check in checks:
        print("PASS", check, flush=True)


if __name__ == "__main__":
    run()
