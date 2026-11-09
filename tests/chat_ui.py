#!/usr/bin/env python3
"""Chat UX contract on mocked APIs plus current-source protected app injection.

Uses only installed Python Playwright/Chrome. No build, restart or model call.
"""
from pathlib import Path
import importlib.util
import json
import os
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(os.environ.get("ZGCLAB_CHAT_UI_ARTIFACTS", "/home/ubuntu/log/zgclab-chat-upgrade-20261109/ui"))
BASE = os.environ.get("ZGCLAB_TEST_URL", "http://127.0.0.1:8788/")
WIDTHS = (360, 390, 768, 1024, 1440)
NATURAL = "你好，给我看看 近期的就是 对中国最相关的 报道我看看"

EXTRAS = r"""
window.fixtureChat = client.chat.bind(client);
window.fixtureSearch = client.search.bind(client);
window.uiKind = 'analysis';
window.uiFormat = 'grounded_analysis';
window.uiQuery = '';
window.uiLong = false;
client.chat = async (payload, options) => {
  if (window.uiFail) { calls.chat.push(payload); throw Object.assign(new Error('timeout test'), {code:'TIMEOUT'}); }
  const response = await fixtureChat(payload, options);
  response.answer_format = uiFormat;
  response.state = uiKind === 'unused' ? 'retrieval_only' : uiKind === 'empty' ? 'no_results' : uiKind === 'database' ? 'database_answer' : 'answered';
  response.model = {id:MODEL,used:!['unused','empty','database'].includes(uiKind),attempted:uiKind!=='database',reason:uiKind==='database'?'exact_database_aggregate':uiKind==='unused'?'model_unreachable':uiKind==='empty'?'no_results':null};
  response.citations = ['empty','database'].includes(uiKind)?[]:Array.from({length:5},(_,i)=>({...citation(),citation_id:'C'+(i+1),id:'news-'+(i+1)}));
  response.answer = uiKind==='empty'?'当前真实数据库及筛选范围内没有匹配资料。':uiKind==='database'?'阿肯色州立大学共 42 条资料。[A1]':'来源陈述：当前样本讨论了中国相关政策。[C1]\n\n分析：机构关注点可继续比较。[C5]\n\n数量请核对数据库统计。[A1]';
  if(uiLong) response.answer+='\n\n'+Array.from({length:38},(_,i)=>'第'+i+'段：这是用于检验新回答定位的资料说明。').join('\n\n');
  response.answer_kind=uiKind==='guidance'?'guidance':uiKind==='database'?'count':'analysis';
  if(uiKind==='guidance') {response.answer='你好，可以直接问我资料查询、统计或分析问题。';response.state='no_results';response.answer_format='guidance';response.citations=[];response.model={id:MODEL,used:false,attempted:false,reason:'greeting'};}
  response.aggregate_citations.push({citation_id:'A2',scope:aggregate().scope,matched:aggregate().matched,date_range:{min:'2026-01-01T00:00:00+00:00',max:'2026-11-12T00:00:00+00:00',dated_records:40,undated_records:2,future_dated_records:1},by_month:[{month:'2026-09',count:20},{month:'2026-10',count:22}],method:'parameterized_readonly_sql_distinct_records',latest_returned_date:'2026-09-25T10:35:01+00:00'});
  response.answer+='\n\n日期与月度依据见 [A2]';
  response.sections=uiKind==='analysis'?[{kind:'fact',text:'来源文本中的陈述。',citations:['C1'],quotes:[{citation_id:'C1',quote:'证据原文 <img src=x onerror="window.pwned=1">'}]},{kind:'analysis',text:'基于样本进行比较。',citations:['C5'],quotes:[{citation_id:'C5',quote:'原始引用'}]}]:[];
  if(uiLong) response.sections.push({kind:'analysis',text:'弹窗滚动验证：'+Array.from({length:80},(_,i)=>'第'+(i+1)+'段滚动核对内容。').join('\n\n'),citations:['C5'],quotes:[{citation_id:'C5',quote:'长摘录：'+'滚动核对来源摘录。'.repeat(120)}]});
  response.suggestions=['比较两家机构共同关注的议题'];response.suggested_questions=['当前材料有哪些局限？'];
  response.analysis_scope={bounded_sample:true,exhaustive:false,realtime:false,limitation:'只覆盖本次引用样本；数量以数据库统计为准。',comparison_complete:false,scope:aggregate().scope};
  response.plan.intent={task:'analysis',topics_query:'中国',exact_phrases:[],excluded_terms:[]};response.plan.time_scope={mode:'snapshot_recent',timezone:'Asia/Shanghai',as_of:'2026-11-09T12:00:00+08:00'};
  return response;
};
client.search = async (payload, options) => {
  const response = await fixtureSearch(payload, options);
  response.plan.intent={task:'lookup',topics_query:'中国',exact_phrases:[],excluded_terms:[]};response.plan.time_scope={mode:'explicit',date_from:payload.filters.date_from,date_to:payload.filters.date_to,timezone:'Asia/Shanghai'};
  if(mockMode==='empty') response.suggestions=[{kind:'remove_date_bounds',label:'查看快照最近匹配资料',query:'中国',filters:{angle:['news']},sort:'recent',requires_confirmation:true}];
  return response;
};
"""


def submit(page, question):
    page.locator("#asQuestion").fill(question)
    page.locator("#asSubmit").click()
    page.wait_for_function("document.querySelector('#asForm').getAttribute('aria-busy')==='false'")


def open_details(page, selector):
    if not page.locator(selector).evaluate("el=>el.open"):
        page.locator(selector + " > summary").click()


def geometry(page):
    return page.evaluate("""()=>({width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,submitBottom:document.querySelector('#asSubmit').getBoundingClientRect().bottom,submitHeight:document.querySelector('#asSubmit').getBoundingClientRect().height,answerTop:document.querySelector('.as-turn:last-child .as-answer')?.getBoundingClientRect().top,focused:document.activeElement.id||document.activeElement.tagName})""")


def run():
    OUT.mkdir(parents=True, exist_ok=True)
    checks, errors, measurements = [], [], {}
    def check(label):
        checks.append(label)
        print("PASS", label, flush=True)
    spec = importlib.util.spec_from_file_location("assistant_fixture", ROOT / "tests/assistant_mock.py")
    fixture = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fixture)
    html = fixture.HTML.replace("mount('mode=search&q=人工智能');", EXTRAS + "\nmount('');").replace("mount('q=人工智能');", EXTRAS + "\nmount('');")
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
        assert page.locator("#asChatTab").get_attribute("aria-selected") == "true"
        page.locator("[data-as-example]").first.click()
        assert page.locator("#asQuestion").input_value() == "看看近期与中国相关的报道，归纳主要议题"
        assert page.evaluate("calls.chat.length") == 0
        assert page.evaluate("document.activeElement.id") == "asQuestion"
        check("default enters chat; supported examples fill without model/API calls")
        open_details(page, "#asSessionArea")
        page.locator("#asKeep").check()
        page.locator("#asSessionArea > summary").click()
        page.evaluate("latency=1600")
        page.locator("#asQuestion").fill(NATURAL)
        page.locator("#asSubmit").click()
        assert page.locator("#asSubmit").is_disabled()
        assert page.locator("#asCancel").is_visible()
        assert page.locator("#asPending").is_visible()
        assert "正在检索并整理" in page.locator("#asProgress").inner_text()
        page.wait_for_function("document.querySelector('#asElapsed').textContent.includes('1 秒')")
        assert page.locator("#asElapsed").get_attribute("aria-live") == "off"
        page.locator("#asCancel").click()
        page.wait_for_function("document.querySelector('#asForm').getAttribute('aria-busy')==='false'")
        assert page.locator("#asQuestion").input_value() == NATURAL
        assert "已取消" in page.locator("#asError").inner_text()
        assert page.locator(".as-turn").count() == 0
        page.evaluate("latency=0")
        page.locator("#asRetry").click()
        page.wait_for_function("document.querySelectorAll('.as-turn').length===1 && document.querySelector('#asForm').getAttribute('aria-busy')==='false'")
        assert page.evaluate("calls.chat.at(-1).message") == NATURAL
        assert "基于数据库资料的分析" in page.locator(".as-answer>h2").inner_text()
        assert "逐字摘录" not in page.locator(".as-answer>.as-note").first.inner_text()
        assert 70 <= geometry(page)["answerTop"] < 200
        assert not page.evaluate("document.activeElement.closest('.as-answer')!==null")
        page.locator(".as-citation-ref", has_text="[C5]").first.click()
        assert page.locator(".as-more-sources").evaluate("el=>el.open")
        assert page.evaluate("document.activeElement.dataset.asCitation") == "C5"
        page.locator(".as-citation-ref", has_text="[A1]").first.click()
        assert page.evaluate("document.activeElement.dataset.asCitation") == "A1"
        page.locator(".as-citation-ref", has_text="[A2]").first.click()
        assert page.evaluate("document.activeElement.dataset.asCitation") == "A2"
        analytics = page.locator("[data-as-citation='A2']")
        assert analytics.locator(".as-aggregate-overview").count() == 0
        assert "未来事件已经发生" in analytics.inner_text()
        open_details(page, "[data-as-citation='A2'] .as-aggregate-details:not([hidden])")
        assert "2026-10" in analytics.inner_text() and "22" in analytics.inner_text()
        claim_row = page.locator(".as-turn").first.locator(".as-claim-details")
        claim_trigger = claim_row.locator(":scope > summary")
        assert claim_trigger.get_attribute("aria-haspopup") == "dialog"
        assert claim_trigger.get_attribute("aria-controls") == page.locator(".as-source-dialog").get_attribute("id")
        assert not claim_row.evaluate("el=>el.open")
        assert claim_row.locator(".as-claim").count() == 0
        assert not page.locator(".as-source-dialog").evaluate("el=>el.open")
        claim_trigger.click()
        source_dialog = page.locator(".as-source-dialog[open]")
        source_dialog.wait_for()
        assert source_dialog.evaluate("el=>el.tagName") == "DIALOG"
        source_text = source_dialog.inner_text()
        assert "来源陈述" in source_text and "分析" in source_text
        assert "来源文本中的陈述" in source_text and "证据原文" in source_text
        assert "原始引用" in source_text
        assert source_dialog.locator(".as-claim-label.is-source").count() == 1
        assert source_dialog.locator(".as-claim-label.is-analysis").count() == 1
        assert source_dialog.locator(".as-quote-c").count() == 1
        assert source_dialog.locator(".as-quote-a").count() == 1
        assert page.evaluate("getComputedStyle(document.querySelector('.as-source-dialog[open] .as-dialog-body')).overflowY") in {"auto", "scroll"}
        source_dialog.locator("[aria-label='查看引用 C1']").click()
        page.wait_for_function("!document.querySelector('.as-source-dialog').open")
        assert page.evaluate("document.activeElement.dataset.asCitation") == "C1"
        claim_trigger.click(); source_dialog.wait_for()
        source_dialog.locator("[data-as-dialog-close]").click()
        page.wait_for_function("!document.querySelector('.as-source-dialog').open")
        page.wait_for_function("document.activeElement === document.querySelector('.as-claim-details > summary')")
        claim_trigger.click(); source_dialog.wait_for()
        page.keyboard.press("Escape")
        page.wait_for_function("!document.querySelector('.as-source-dialog').open")
        page.wait_for_function("document.activeElement === document.querySelector('.as-claim-details > summary')")
        claim_trigger.click(); source_dialog.wait_for()
        page.mouse.click(4, 4)
        page.wait_for_function("!document.querySelector('.as-source-dialog').open")
        page.wait_for_function("document.activeElement === document.querySelector('.as-claim-details > summary')")
        claim_trigger.focus()
        page.keyboard.press("Enter")
        source_dialog.wait_for()
        assert source_dialog.evaluate("el=>el.open")
        page.keyboard.press("Escape")
        page.wait_for_function("!document.querySelector('.as-source-dialog').open")
        page.wait_for_function("document.activeElement === document.querySelector('.as-claim-details > summary')")
        claim_row.scroll_into_view_if_needed()
        page.screenshot(path=str(OUT / "chat-detail-triggers-1440.png"), full_page=False)
        assert page.locator(".as-root img,.as-root script").count() == 0
        assert page.evaluate("window.pwned") is None
        check("source claims/analysis/quotes stay collapsed inline; native dialog opens with content, closes by button/Escape/backdrop and restores trigger focus")
        process_row = page.locator(".as-turn").first.locator(".as-retrieval-process")
        process_trigger = process_row.locator(":scope > summary")
        assert process_trigger.get_attribute("aria-haspopup") == "dialog"
        assert not process_row.evaluate("el=>el.open")
        process_trigger.click()
        process_dialog = page.locator(".as-process-dialog[open]")
        process_dialog.wait_for()
        process_text = process_dialog.inner_text()
        assert "检索过程与资料范围" in process_text
        assert "本次检索词 / 扩展与近似词" in process_text
        assert "artificial intelligence" in process_text
        assert "索引 6,989" in process_text
        process_dialog.locator("[data-as-dialog-close]").click()
        page.wait_for_function("!document.querySelector('.as-process-dialog').open")
        page.wait_for_function("document.activeElement === document.querySelector('.as-retrieval-process > summary')")
        check("retrieval process/expansions/coverage open in their own dialog and return focus to the process trigger")
        check("immediate honest loading with elapsed time; cancel/retry; answer visible without focus theft; C5/A1 focus and safe source/analysis dialog")
        before = page.evaluate("calls.chat.length")
        page.get_by_role("button", name="填入追问：当前材料有哪些局限？", exact=True).click()
        assert page.locator("#asQuestion").input_value() == "当前材料有哪些局限？"
        assert page.evaluate("calls.chat.length") == before
        page.locator("#asSubmit").click()
        page.wait_for_function("document.querySelectorAll('.as-turn').length===2 && document.querySelector('#asForm').getAttribute('aria-busy')==='false'")
        assert len(page.evaluate("calls.chat.at(-1).history")) == 2
        assert page.evaluate("calls.chat.at(-1).history[0].content") == NATURAL
        assert geometry(page)["answerTop"] < 200
        with page.expect_download() as download:
            page.locator("#asExport").click()
        exported = Path(download.value.path()).read_text()
        assert NATURAL in exported and "C5" in exported and "A1" in exported
        saved = page.evaluate("workspace.chatSessions[0]")
        assert saved["turns"][0]["answerFormat"] == "grounded_analysis"
        assert saved["turns"][0]["sections"][0]["quotes"][0]["quote"].startswith("证据原文")
        check("discoverable follow-up only fills; explicit send keeps multi-turn history; Markdown and saved analysis preserve citations")
        page.evaluate("uiKind='unused';uiFormat='grounded_analysis'")
        submit(page, "模型不可用时看看资料")
        assert "无模型答案" in page.locator(".as-answer>h2").last.inner_text()
        assert "已尝试模型" in page.locator(".as-answer>.as-note").last.inner_text()
        page.evaluate("uiKind='analysis';uiFormat='future_safe_format'")
        submit(page, "未知格式安全显示")
        assert page.locator(".as-answer>h2").last.inner_text() == "基于数据库资料的回答"
        page.evaluate("uiFormat='grounded_summary'")
        submit(page, "概括主要议题")
        assert "基于数据库资料的归纳" in page.locator(".as-answer>h2").last.inner_text()
        page.evaluate("uiFormat='verbatim_extracts'")
        submit(page, "逐字摘录兼容")
        assert "模型选取的原文摘录" in page.locator(".as-answer>h2").last.inner_text()
        page.evaluate("uiKind='database';uiFormat='database_aggregate'")
        submit(page, "阿肯色州立大学有多少条资料？")
        assert "数据库精确统计 · 未调用大模型" in page.locator(".as-answer>h2").last.inner_text()
        check("grounded analysis/summary, unknown format, legacy verbatim, exact database and unused-model labels stay truthful")
        page.evaluate("uiKind='guidance'")
        submit(page, "你好")
        guide = page.locator(".as-turn").last
        assert guide.locator(".as-answer>h2").inner_text() == "可以这样使用资料对话"
        assert guide.locator(".as-empty,.as-aggregate").count() == 0
        assert "你好，可以直接问我" in guide.inner_text()
        check("guidance/no_results preserves welcoming response without a no-match headline or false research warning")
        page.evaluate("workspace.assistantPreferences={};workspace.chatSessions=[];mockMode='empty';mount('mode=search&ids=1000110&angle=news&from=2026-01-01&to=2026-10-01')")
        submit(page, NATURAL)
        assert page.locator("[data-as-analyze]").is_visible()
        empty = page.locator("#asSearchResults .as-empty")
        assert "识别主题：中国" in empty.inner_text()
        assert "2026-01-01 至 2026-10-01" in empty.inner_text()
        assert "不" in empty.inner_text() and "全网" in empty.inner_text()
        assert page.locator("[data-as-suggestion='date']").is_visible()
        searches = page.evaluate("calls.search.length")
        chats = page.evaluate("calls.chat.length")
        original = page.evaluate("calls.search.at(-1)")
        page.evaluate("mockMode='normal';uiKind='analysis';uiFormat='grounded_analysis'")
        page.locator("[data-as-analyze]").click()
        page.wait_for_function("document.querySelectorAll('.as-turn').length===1 && document.querySelector('#asForm').getAttribute('aria-busy')==='false'")
        assert page.evaluate("calls.chat.length") == chats + 1
        assert page.evaluate("calls.search.length") == searches
        assert page.evaluate("calls.chat.at(-1).message") == NATURAL
        assert page.evaluate("calls.chat.at(-1).filters") == original["filters"]
        assert page.locator("#asChatTab").get_attribute("aria-selected") == "true"
        check("zero strict search exposes intent/date/coverage; one click actually calls chat once with unchanged original query and filters")
        page.evaluate("workspace.assistantPreferences={};workspace.chatSessions=[];mockMode='empty';mount('mode=search&ids=1000110&angle=news&from=2026-01-01&to=2026-10-01')")
        submit(page, NATURAL)
        original = page.evaluate("calls.search.at(-1)")
        page.evaluate("mockMode='normal'")
        page.locator("[data-as-suggestion='date']").click()
        page.wait_for_function("document.querySelector('#asForm').getAttribute('aria-busy')==='false'")
        rerun = page.evaluate("calls.search.at(-1)")
        assert rerun["query"] == "中国"
        assert rerun["filters"] == {k: v for k, v in original["filters"].items() if k not in {"date_from", "date_to"}}
        assert page.locator("#asFrom").input_value() == "" and page.locator("#asTo").input_value() == ""
        check("date removal only happens on explicit labelled action and preserves institution/angle/platform scope")
        page.evaluate("workspace.assistantPreferences={};workspace.chatSessions=[];mockMode='normal';uiFail=true;window.localFailure=true;const load=api.entriesFor;api.entriesFor=async()=>{if(localFailure)throw new Error('index test');return load();};mount('mode=chat')")
        submit(page, NATURAL)
        assert page.locator("#asError").is_visible()
        assert "重试" in page.locator("#asError").inner_text()
        assert page.locator("#asRetry").is_visible()
        page.evaluate("uiFail=false;localFailure=false")
        page.locator("#asRetry").click()
        page.wait_for_function("document.querySelectorAll('.as-turn').length===1 && document.querySelector('#asForm').getAttribute('aria-busy')==='false'")
        assert page.locator("#asError").is_hidden()
        check("service error and failed fallback leave original retry usable; successful retry clears failure")
        page.evaluate("workspace.assistantPreferences={};workspace.chatSessions=[];latency=2500;mount('mode=chat')")
        page.locator("#asQuestion").fill("离开页面取消")
        page.locator("#asSubmit").click()
        page.wait_for_function("document.querySelector('#asForm').getAttribute('aria-busy')==='true'")
        page.evaluate("controller.abort()")
        page.wait_for_timeout(100)
        assert page.locator(".as-turn").count() == 0
        check("route disposal cancels in-flight result and prevents late transcript writes")
        # Regression: remote answers must never await local data asset/index completion.
        page.evaluate("""()=>{
          window.beforeIndexChat=client.chat.bind(client);
          client.chat=async(...args)=>{const value=await beforeIndexChat(...args);value.citations=value.citations.map(c=>({...c,source_url:'https://api.example.org/'+c.id,quotes:['保留原样摘录']}));window.apiResponseAt=performance.now();return value;};
          window.indexCalls=0;window.indexResolve=null;api.entriesFor=()=>{indexCalls++;return new Promise(resolve=>{indexResolve=resolve;});};
          latency=0;uiFail=false;uiKind='analysis';uiFormat='grounded_analysis';uiLong=false;mockMode='normal';workspace.assistantPreferences={};workspace.chatSessions=[];mount('mode=chat');
        }""")
        open_details(page, "#asSessionArea");page.locator("#asKeep").check();page.locator("#asSessionArea > summary").click()
        page.locator("#asQuestion").fill(NATURAL);page.locator("#asSubmit").click()
        page.wait_for_function("document.querySelector('.as-turn .as-markdown') && document.querySelector('#asForm').getAttribute('aria-busy')==='false'", timeout=2000)
        elapsed = page.evaluate("performance.now()-apiResponseAt")
        assert elapsed < 2000, elapsed
        assert page.locator("#asPending").is_hidden() and not page.locator("#asSubmit").is_disabled()
        assert page.evaluate("indexCalls") == 1
        assert page.locator(".as-evidence a[data-as-local-record]").count() == 0
        assert page.locator("[data-as-citation='C1'] [data-as-original-source]").get_attribute("href") == "https://api.example.org/news-1"
        assert "尚未核对" in page.locator("[data-as-citation='C1'] [data-as-local-record]").inner_text()
        open_details(page, "[data-as-citation='C1'] .as-body-preview")
        assert "保留原样摘录" in page.locator("[data-as-citation='C1'] .as-body-preview").inner_text()
        early_saved = page.evaluate("workspace.chatSessions[0].turns[0]")
        assert early_saved["answer"] and early_saved["items"][0]["source_url"] == "https://api.example.org/news-1"
        with page.expect_download() as download:
            page.locator("#asExport").click()
        assert "https://api.example.org/news-1" in Path(download.value.path()).read_text()
        measurements["stalled-index-answer-ms"] = elapsed
        page.screenshot(path=str(OUT / "index-stall-answer-visible.png"), full_page=False)
        page.locator(".as-citation-ref", has_text="[C1]").first.click()
        page.evaluate("window.focusBeforeIndex=document.activeElement;window.scrollBeforeIndex=scrollY;indexResolve(entries)")
        page.wait_for_function("document.querySelector('[data-as-citation=C1] a[data-as-local-record]')")
        assert page.evaluate("document.activeElement===focusBeforeIndex")
        assert abs(page.evaluate("scrollY-scrollBeforeIndex")) < 3
        assert page.locator("[data-as-citation='C1'] h3 a").inner_text() == "人工智能安全研究"
        assert page.locator("[data-as-citation='C1'] [data-as-local-record]").get_attribute("href") == "#/record/news/news-1"
        assert page.locator("[data-as-citation='C1'] [data-as-original-source]").get_attribute("href") == "https://example.org/evidence"
        assert page.locator(".as-turn").count() == 1
        page.locator("[data-as-citation='C1'] [data-as-local-record]").click()
        assert page.evaluate("location.hash") == "#/record/news/news-1"
        assert page.evaluate("workspace.chatSessions[0].turns[0].answer") == early_saved["answer"]
        assert page.evaluate("workspace.chatSessions[0].turns[0].items[0].title") == "人工智能安全研究"
        with page.expect_download() as download:
            page.locator("#asExport").click()
        enriched_markdown = Path(download.value.path()).read_text()
        assert "#/record/news/news-1" in enriched_markdown and "https://example.org/evidence" in enriched_markdown
        check("stalled index: API answer/submit ready in <2s with original sources/quotes/save/export; later enrichment patches record links without focus/scroll loss")

        # A failed optional index cannot turn a successful remote answer into an error.
        page.evaluate("""()=>{window.indexCalls=0;api.entriesFor=()=>{indexCalls++;return Promise.reject(new Error('asset unavailable'));};workspace.assistantPreferences={};workspace.chatSessions=[];mount('mode=chat');}""")
        submit(page, "索引加载失败仍然展示服务回答")
        assert page.locator(".as-turn .as-answer>.as-markdown").count() == 1
        assert page.locator("#asError").is_hidden()
        assert "索引暂不可用" in page.locator("[data-as-citation='C1'] [data-as-local-record]").inner_text()
        assert page.locator("[data-as-citation='C1'] [data-as-original-source]").get_attribute("href") == "https://api.example.org/news-1"
        check("failed asset index leaves the API answer/citations usable without fallback or false record links")

        # Search results use the same nonblocking enrichment; its one deadline is cleaned up.
        page.evaluate("""()=>{
          window.nativeIndexSetTimeout=window.setTimeout;window.nativeIndexClearTimeout=window.clearTimeout;window.indexDeadline=null;window.indexDeadlineCleared=false;
          window.setTimeout=(fn,ms,...args)=>{const timer=nativeIndexSetTimeout(fn,ms,...args);if(ms===8000){indexDeadline=timer;window.fireIndexDeadline=fn;}return timer;};
          window.clearTimeout=timer=>{if(timer===indexDeadline)indexDeadlineCleared=true;return nativeIndexClearTimeout(timer);};
          api.entriesFor=()=>new Promise(resolve=>window.searchIndexResolve=resolve);workspace.assistantPreferences={};workspace.chatSessions=[];mockMode='normal';mount('mode=search');
        }""")
        page.locator("#asQuestion").fill("中国");page.locator("#asSubmit").click()
        page.wait_for_function("document.querySelector('#asSearchResults .as-evidence[data-as-citation=C3]') && document.querySelector('#asForm').getAttribute('aria-busy')==='false'", timeout=2000)
        assert not page.locator("#asSearchResults .as-retrieval-process").evaluate("el=>el.open")
        page.locator("#asSearchResults .as-retrieval-process > summary").click()
        search_process = page.locator(".as-process-dialog[open]")
        search_process.wait_for()
        assert "检索过程、扩展词与覆盖范围" in search_process.inner_text()
        assert "本次检索词 / 扩展与近似词" in search_process.inner_text()
        assert "artificial intelligence" in search_process.inner_text()
        search_process.locator("[data-as-dialog-close]").click()
        page.wait_for_function("!document.querySelector('.as-process-dialog[open]')")
        assert page.locator("#asSearchResults [data-as-local-record]").get_attribute("href") is None
        page.evaluate("fireIndexDeadline()")
        page.wait_for_function("document.querySelector('#asSearchResults [data-as-local-record]').textContent.includes('索引暂不可用')")
        assert page.evaluate("indexDeadlineCleared")
        assert page.locator("#asError").is_hidden() and not page.locator("#asSubmit").is_disabled()
        page.evaluate("searchIndexResolve(entries)")
        page.wait_for_function("document.querySelector('#asSearchResults a[data-as-local-record]')")
        assert page.locator("#asSearchResults [data-as-local-record]").get_attribute("href") == "#/record/news/news-1"
        page.evaluate("window.setTimeout=nativeIndexSetTimeout;window.clearTimeout=nativeIndexClearTimeout")
        check("search API results render without local index; optional background deadline clears and later index resolution safely enriches links")

        # Do not touch the local index for statistics, zero evidence, or explicit version mismatch.
        page.evaluate("""()=>{window.indexCalls=0;api.entriesFor=()=>{indexCalls++;return new Promise(()=>{});};workspace.assistantPreferences={};workspace.chatSessions=[];uiKind='database';mount('mode=chat');}""")
        submit(page, "纯数据库统计")
        assert page.evaluate("indexCalls") == 0
        page.evaluate("uiKind='empty';mount('mode=chat')")
        submit(page, "零结果不要加载全库")
        assert page.evaluate("indexCalls") == 0
        page.evaluate("""()=>{uiKind='analysis';window.sameVersionCitation=citation;window.citation=()=>({...sameVersionCitation(),source_version:'other-version'});mount('mode=chat');}""")
        submit(page, "不同版本不要混用本站记录")
        assert page.evaluate("indexCalls") == 0
        assert "快照版本不同" in page.locator("[data-as-citation='C1'] [data-as-local-record]").inner_text()
        assert page.locator(".as-evidence a[data-as-local-record]").count() == 0
        page.evaluate("window.citation=sameVersionCitation")
        check("count/zero/version-mismatch responses skip full-index load; mismatched citations retain their original service sources")

        # Optional late enrichment cannot overwrite a new session or a disposed route.
        page.evaluate("""()=>{api.entriesFor=()=>new Promise(resolve=>window.staleIndexResolve=resolve);workspace.assistantPreferences={};workspace.chatSessions=[];mount('mode=chat');}""")
        submit(page, "后台索引旧会话")
        open_details(page, "#asSessionArea");page.locator("#asKeep").check();page.locator("#asNew").click()
        page.evaluate("staleIndexResolve(entries)")
        page.wait_for_timeout(60)
        assert page.locator(".as-turn").count() == 0
        assert page.locator("#asWelcome").is_visible()
        page.evaluate("""()=>{api.entriesFor=()=>new Promise(resolve=>window.abortIndexResolve=resolve);workspace.assistantPreferences={};workspace.chatSessions=[];mount('mode=chat');}""")
        submit(page, "离开路由前已有回答")
        page.evaluate("controller.abort();document.querySelector('#view').innerHTML='<p id=indexSentinel>新的页面</p>';abortIndexResolve(entries)")
        page.wait_for_timeout(60)
        assert page.locator("#indexSentinel").inner_text() == "新的页面"
        page.evaluate("""()=>{api.entriesFor=()=>new Promise(resolve=>window.cancelIndexResolve=resolve);workspace.assistantPreferences={};workspace.chatSessions=[];mount('mode=chat');}""")
        submit(page, "先完成的一轮")
        page.evaluate("latency=3000")
        page.locator("#asQuestion").fill("这轮需要取消");page.locator("#asSubmit").click();page.locator("#asCancel").click()
        page.wait_for_function("document.querySelector('#asForm').getAttribute('aria-busy')==='false'")
        page.evaluate("cancelIndexResolve(entries)")
        page.wait_for_function("document.querySelector('[data-as-citation=C1] a[data-as-local-record]')")
        assert page.locator(".as-turn").count() == 1
        assert "这轮需要取消" not in page.locator("#asTranscript").inner_text()
        assert "已取消" in page.locator("#asError").inner_text()
        check("new-session/route guards prevent stale writes; cancelling a follow-up keeps earlier answer and safe background link enrichment")

        # Saved content opens immediately even when its optional index is still pending.
        page.evaluate("""()=>{latency=0;api.entriesFor=async()=>entries;workspace.assistantPreferences={};workspace.chatSessions=[];mount('mode=chat');}""")
        submit(page, "保存待重开的服务回答")
        open_details(page, "#asSessionArea");page.locator("#asKeep").check()
        page.evaluate("""()=>{window.reopenId=workspace.chatSessions[0].id;window.reopenAnswer=workspace.chatSessions[0].turns[0].answer;api.entriesFor=()=>new Promise(resolve=>window.reopenIndexResolve=resolve);mount('mode=chat&session='+reopenId);}""")
        page.wait_for_function("document.querySelector('.as-turn .as-markdown') && document.querySelector('#asForm').getAttribute('aria-busy')!=='true'", timeout=2000)
        assert page.locator(".as-turn").count() == 1
        assert page.evaluate("workspace.chatSessions[0].turns[0].answer===reopenAnswer")
        page.evaluate("reopenIndexResolve(entries)")
        page.wait_for_function("document.querySelector('[data-as-citation=C1] a[data-as-local-record]')")
        check("opening a saved session renders its original answer immediately before optional local-index resolution")
        page.evaluate("client.chat=beforeIndexChat;api.entriesFor=async()=>entries;latency=0;workspace.assistantPreferences={};workspace.chatSessions=[]")
        for width in WIDTHS:
            page.set_viewport_size({"width": width, "height": 844 if width <= 768 else 1000})
            page.evaluate("uiKind='analysis';uiFormat='grounded_analysis';uiLong=false;mount('')")
            page.evaluate("scrollTo(0,0)")
            g = geometry(page)
            assert g["documentWidth"] <= width + 1, g
            assert g["submitBottom"] < g["height"] - 10, g
            assert g["submitHeight"] >= (44 if width <= 560 else 40), g
            measurements[f"mock-empty-{width}"] = g
            page.locator("#asChatTab").focus(); page.keyboard.press("ArrowLeft")
            assert page.locator("#asSearchTab").get_attribute("aria-selected") == "true"
            page.keyboard.press("ArrowRight")
            assert page.locator("#asChatTab").get_attribute("aria-selected") == "true"
            page.locator("#asQuestion").fill("第一行");page.locator("#asQuestion").press("Shift+Enter");page.keyboard.type("第二行")
            assert "\n" in page.locator("#asQuestion").input_value()
            page.locator("#asQuestion").fill(NATURAL);page.locator("#asQuestion").press("Enter")
            page.wait_for_function("document.querySelectorAll('.as-turn').length===1 && document.querySelector('#asForm').getAttribute('aria-busy')==='false'")
            page.evaluate("uiLong=true")
            submit(page, "请继续分析并保留来源")
            g = geometry(page)
            assert g["documentWidth"] <= width + 1 and 60 <= g["answerTop"] < 190, g
            measurements[f"mock-long-followup-{width}"] = g
            page.screenshot(path=str(OUT / f"chat-answer-{width}.png"), full_page=False)
            viewport_height = 844 if width <= 768 else 1000
            turn = page.locator(".as-turn").last
            turn.locator(".as-claim-details > summary").click()
            source = page.locator(".as-source-dialog[open]")
            source.wait_for()
            box = source.bounding_box()
            assert box and box["x"] >= 0 and box["y"] >= 0, (width, box)
            assert box["x"] + box["width"] <= width + 1 and box["y"] + box["height"] <= viewport_height + 1, (width, box)
            assert page.evaluate("getComputedStyle(document.querySelector('.as-source-dialog[open] .as-dialog-body')).overflowY") in {"auto", "scroll"}
            assert page.evaluate("document.documentElement.scrollWidth") <= width + 1
            measurements[f"dialog-source-{width}"] = box
            if width in (390, 1440): page.screenshot(path=str(OUT / f"chat-dialog-source-{width}.png"), full_page=False)
            scroll = page.evaluate("""()=>{const el=document.querySelector('.as-source-dialog[open] .as-dialog-body');return {scrollable:el.scrollHeight>el.clientHeight,top:el.scrollTop};}""")
            assert scroll["scrollable"], (width, scroll)
            page.evaluate("document.querySelector('.as-source-dialog[open] .as-dialog-body').scrollTop=99999")
            assert page.evaluate("document.querySelector('.as-source-dialog[open] .as-dialog-body').scrollTop") > 0
            measurements[f"dialog-scroll-{width}"] = scroll
            page.keyboard.press("Escape")
            page.wait_for_function("!document.querySelector('.as-source-dialog[open]')")
            turn.locator(".as-retrieval-process > summary").click()
            process = page.locator(".as-process-dialog[open]")
            process.wait_for()
            box = process.bounding_box()
            assert box and box["x"] >= 0 and box["y"] >= 0, (width, box)
            assert box["x"] + box["width"] <= width + 1 and box["y"] + box["height"] <= viewport_height + 1, (width, box)
            assert page.evaluate("getComputedStyle(document.querySelector('.as-process-dialog[open] .as-dialog-body')).overflowY") in {"auto", "scroll"}
            assert page.evaluate("document.documentElement.scrollWidth") <= width + 1
            measurements[f"dialog-process-{width}"] = box
            if width in (390, 1440): page.screenshot(path=str(OUT / f"chat-dialog-process-{width}.png"), full_page=False)
            page.keyboard.press("Escape")
            page.wait_for_function("!document.querySelector('.as-process-dialog[open]')")
        check("360/390/768/1024/1440: no overflow, first-screen send controls, keyboard mode/send/newline and visible long follow-up answer")
        check("390/768/1024/1440: source and retrieval dialogs stay inside viewport, scroll internally and close with Escape")
        context.close()

        # Current owned sources inside the actual protected application; no API model call.
        actual = browser.new_context(viewport={"width": 1440, "height": 1000}, accept_downloads=True)
        real = actual.new_page(); real.set_default_timeout(25000)
        real.on("pageerror", lambda error: errors.append(str(error)))
        # Return a deterministic synthesis through the existing client; status also mocked.
        real.goto(BASE + "#/overview")
        if real.locator("#accessForm").count():
            real.locator("#accessPassword").fill((ROOT / ".runtime/pages-password").read_text().strip())
            real.locator("#accessSubmit").click()
        real.locator(".kpis").wait_for()
        real.add_script_tag(path=str(ROOT / "assistant.js"))
        real.add_style_tag(path=str(ROOT / "styles.css"))
        real.add_style_tag(path=str(ROOT / "assistant.css"))
        real.evaluate("""()=>{
          window.actualPayloads=[]; window.actualFollowup=false;
          ZGCLAB_SERVICE_CLIENT.status=async()=>({database:'ready',snapshot:{source_version:'mock-real-snapshot',total:6989},llm:{available:true,state:'ready',model:'auto/deepseek-v4.1-flash'}});
          ZGCLAB_SERVICE_CLIENT.chat=async(payload)=>{actualPayloads.push(payload);return {answer:'来源陈述：本次引用样本包含涉华报道。[C1]\\n\\n分析：可继续核对议题差异。[C5]\\n\\n精确数量见[A1]'+(actualFollowup?'\\n\\n'+Array.from({length:30},(_,i)=>'资料说明第'+i+'段。').join('\\n\\n'):''),state:'answered',answer_format:'grounded_analysis',model:{id:'auto/deepseek-v4.1-flash',used:true,attempted:true},citations:Array.from({length:5},(_,i)=>({citation_id:'C'+(i+1),id:'news-'+(i+1),angle:'news',title:'受控来源 '+(i+1),snippet:'受控原文片段',source_url:'https://example.org/evidence/'+i})),aggregate_citations:[{citation_id:'A1',scope:{source_version:'mock-real-snapshot',date_field:'published_at',timezone:'Asia/Shanghai',filters:payload.filters},scoped:{total:6989,by_angle:{news:3675,clue:1468,social:1846}},matched:{total:42,by_angle:{news:42,clue:0,social:0}}}],sections:[{kind:'analysis',text:'样本分析',citations:['C1'],quotes:[{citation_id:'C1',quote:'受控原文片段'}]}],suggested_questions:['共同议题有哪些？'],analysis_scope:{bounded_sample:true,limitation:'受控测试样本'},plan:{intent:{task:'analysis',topics_query:'中国'},time_scope:{mode:'snapshot_recent'}}};};
        }""")
        for width in WIDTHS:
            real.set_viewport_size({"width": width, "height": 844 if width <= 768 else 1000})
            real.evaluate("location.hash='#/overview'"); real.locator(".kpis").wait_for()
            real.evaluate("location.hash='#/assistant'"); real.locator("#asHeading").wait_for()
            real.evaluate("scrollTo(0,0)")
            g = geometry(real); measurements[f"protected-empty-{width}"] = g
            assert g["documentWidth"] <= width + 1, g
            assert g["submitBottom"] < g["height"] - 10, g
            real.screenshot(path=str(OUT / f"chat-protected-empty-{width}.png"), full_page=False)
        real.set_viewport_size({"width": 390, "height": 844})
        open_details(real, "#asScope")
        real.locator("#asAngle").select_option("news")
        real.locator("#asFrom").fill("2026-01-01");real.locator("#asTo").fill("2026-10-01")
        real.locator("#asScope > summary").click()
        open_details(real, "#asSessionArea");real.locator("#asKeep").check();real.locator("#asSessionArea > summary").click()
        submit(real, NATURAL)
        real.evaluate("actualFollowup=true")
        submit(real, "继续归纳")
        assert geometry(real)["answerTop"] < 180
        real.screenshot(path=str(OUT / "chat-protected-followup-390.png"), full_page=False)
        stored = real.evaluate("JSON.parse(localStorage.getItem('zgclab.workspace.v1'))")
        expected = stored["chatSessions"][0]
        assert expected["turns"][0]["answerFormat"] == "grounded_analysis"
        assert expected["turns"][0]["sections"][0]["quotes"][0]["quote"] == "受控原文片段"
        assert expected["turns"][0]["items"][-1]["label"] == "C5"
        assert len(real.evaluate("actualPayloads.at(-1).history")) == 2
        real.evaluate("location.hash='#/workspace'");real.locator("#backupWorkspace").wait_for()
        with real.expect_download() as download:
            real.locator("#backupWorkspace").click()
        backup = json.loads(Path(download.value.path()).read_text())
        assert backup["chatSessions"][0] == expected
        # A separate blank browser workspace imports the actual exported file.
        real.evaluate("localStorage.removeItem('zgclab.workspace.v1')")
        real.reload()
        if real.locator("#accessForm").count():
            real.locator("#accessPassword").fill((ROOT / ".runtime/pages-password").read_text().strip());real.locator("#accessSubmit").click()
        real.locator("#backupWorkspace").wait_for()
        real.add_script_tag(path=str(ROOT / "assistant.js"));real.add_style_tag(path=str(ROOT / "assistant.css"))
        real.locator("#importWorkspace").set_input_files({"name":"chat-backup.json","mimeType":"application/json","buffer":json.dumps(backup,ensure_ascii=False).encode()})
        real.wait_for_function("JSON.parse(localStorage.getItem('zgclab.workspace.v1')).chatSessions?.length===1")
        imported = real.evaluate("JSON.parse(localStorage.getItem('zgclab.workspace.v1')).chatSessions[0]")
        assert imported == expected
        # Block all model operations after reload and open the actual imported session.
        real.evaluate("""()=>{ZGCLAB_SERVICE_CLIENT.status=async()=>({database:'ready',snapshot:{total:6989},llm:{available:true,model:'auto/deepseek-v4.1-flash'}});ZGCLAB_SERVICE_CLIENT.chat=async()=>{throw new Error('no calls during reopen');};location.hash='#/assistant?session=' + encodeURIComponent(JSON.parse(localStorage.getItem('zgclab.workspace.v1')).chatSessions[0].id);}""")
        real.locator(".as-turn").first.wait_for()
        assert real.locator(".as-turn").count() == 2
        assert real.locator("#asFrom").input_value() == "2026-01-01"
        assert real.locator("#asTo").input_value() == "2026-10-01"
        assert real.locator("#asAngle").input_value() == "news"
        assert real.locator(".as-answer>h2").first.inner_text() == "基于数据库资料的分析"
        assert real.locator(".as-turn").first.locator("[data-as-citation='C5']").count() == 1
        check("actual protected app source injection: full width matrix, visible new answer, saved session and exact workspace export/import restore complete analysis/citations/filters")
        assert not errors, errors
        browser.close()
    report = {"mode":"deterministic mocks + current owned sources in protected app; no paid model/API call", "checks":checks, "measurements":measurements, "errors":errors}
    (OUT / "chat-ui-results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print("PASS", len(checks), "chat UI contracts", flush=True)


if __name__ == "__main__":
    run()
