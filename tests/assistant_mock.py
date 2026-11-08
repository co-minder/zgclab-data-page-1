#!/usr/bin/env python3
"""Independent assistant interactions with deterministic API mocks; existing Chrome only."""
from pathlib import Path
import json
import os
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(os.environ.get("ZGCLAB_ASSISTANT_ARTIFACTS", "/home/ubuntu/log/zgclab-assistant"))
HTML = r'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/assistant.css"><title>资料助手交互测试</title></head><body style="padding:16px"><main id="view"></main><p id="notice"></p><script src="/core.js"></script><script src="/query.js"></script><script src="/assistant.js"></script><script>
const MODEL='auto/deepseek-v4.1-flash';
window.META={version:'real-v1',generated_at:'2026-11-05T12:00:00Z',angles:{news:{name:'新闻舆情'},clue:{name:'官网线索'},social:{name:'社交媒体'}},institutions:[{ktid:1000110,cn:'美国联邦调查局',en:'Federal Bureau of Investigation'},{ktid:1001140,cn:'美国国土安全部',en:'Department of Homeland Security'}],stats:{news:{date_min:'2026-01-01',date_max:'2026-10-01'},clue:{},social:{platforms:{X:3}}}};
window.entries=[{angle:'news',r:{id:'news-1',ktid:1000110,title_cn:'人工智能安全研究',summary_cn:'人工智能安全研究摘要 cybersecurity',url:'https://example.org/evidence',publish_time:'2026-09-01T08:00:00Z'}},{angle:'news',r:{id:'news-2',ktid:1000110,title_cn:'网络安全资料',summary_cn:'网络安全的真实资料',url:'https://example.org/evidence2',publish_time:'2026-09-02T08:00:00Z'}},{angle:'social',r:{id:'social-1',ktid:1001140,title:'DHS cybersecurity',chinese_translation:'国土安全部网络安全资料',platform:'X',source_url:'https://example.org/social',publish_time:'2026-09-03T08:00:00Z'}},{angle:'news',r:{id:'sim-news-1',ktid:1000110,title_cn:'人工智能模拟',_simulation:true}}];
window.workspace={favorites:[{id:'keep'}],queries:[{name:'keep'}],read:{keep:'yes'},watchlist:[1000110],other:{keep:true}};
window.calls={search:[],chat:[],auth:[],project:[]};window.mockMode='normal';window.chatMode='answered';window.latency=0;window.statusDelay=0;window.statusCalls=0;
window.aggregate=()=>({scope:{dataset:'real',filters:{institution:[1000110],angle:['news'],date_from:'2026-01-01',date_field:'published_at'},source_version:'real-v1',date_field:'published_at',term_match:[['人工智能','AI']],strategy:'fts5_and'},scoped:{total:73,by_angle:{news:73,clue:0,social:0},by_institution:[{ktid:1000110,cn:'美国联邦调查局',count:73}],by_platform:[]},matched:{total:42,by_angle:{news:42,clue:0,social:0},by_institution:[{ktid:1000110,cn:'美国联邦调查局',count:42}],by_platform:[]}});
window.citation=()=>({citation_id:'C3',id:'news-1',angle:'news',ktid:1000110,title:'服务端标题',snippet:'证据原文 <img src=x onerror="window.pwned=1">',paragraph:7,paragraph_scheme:'service_field_chunks_v1',field:'translation',source_field:'content_cn',source_url:'javascript:alert(1)',source_version:'real-v1',date_origin:'provided'});
window.payload=()=>({query:'人工智能',state:'retrieval',results:mockMode==='empty'?[]:[citation()],plan:{terms:[['人工智能','AI']],fuzzy_terms:[{input:'cybersecurty',term:'cybersecurity'}],strategy:'fts5_and',model:{rewritten_query:'artificial intelligence',applied_groups:[{anchor:'人工智能',terms:['artificial intelligence']}]} },model:{id:MODEL,used:true,attempted:true,reason:null},aggregates:aggregate(),coverage:{source_version:'real-v1',database_total:6989,scoped_records:73,matched_records:mockMode==='empty'?0:42,returned_paragraphs:1,exhaustive:false}});
window.checkFilters=f=>{for(const key of Object.keys(f))if(!['institution','angle','platform','date_from','date_to','date_field'].includes(key))throw new Error('bad filter '+key);};
window.pause=signal=>new Promise((resolve,reject)=>{const timer=setTimeout(resolve,latency);signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('aborted','AbortError'));},{once:true});});
window.client={
 async status(){window.statusCalls++;if(window.statusDelay)await new Promise(resolve=>setTimeout(resolve,window.statusDelay));if(mockMode==='auth')throw Object.assign(new Error('need password'),{status:401,code:'authentication_required'});return {database:'ready',llm:{available:true,state:'ready',model:MODEL},snapshot:{source_version:'real-v1',total:6989,ingested_at:'2026-11-08'},aggregates:{total:6989}};},
 async search(p,{signal}){calls.search.push(p);checkFilters(p.filters);if(p.limit>30||p.query.length>1200)throw new Error('limits');if(mockMode==='auth')throw Object.assign(new Error('need password'),{status:401,code:'authentication_required'});if(mockMode==='offline')throw new TypeError('network');await pause(signal);const result=payload();result.model={id:MODEL,used:p.semantic&&p.expand,attempted:p.semantic&&p.expand,reason:p.expand?'semantic_disabled':'expansion_disabled'};if(!p.expand){result.plan={terms:[['人工智能']],fuzzy_terms:[],strategy:'fts5_and'};}if(mockMode==='empty')result.aggregates.matched.total=0;return result;},
 async chat(p,{signal}){calls.chat.push(p);checkFilters(p.filters);if(Object.keys(p).some(k=>!['message','history','filters','expand'].includes(k)))throw new Error('unknown chat field');if(p.message.length>1200||p.history.length>8||p.history.some(m=>m.content.length>4000)||p.history.reduce((n,m)=>n+m.content.length,0)>12000)throw new Error('history limit');if(mockMode==='offline')throw new TypeError('network');await pause(signal);const result=payload();result.citations=chatMode==='database'?[]:[citation()];result.aggregate_citations=[{citation_id:'A1',kind:'database_aggregate',...aggregate()}];result.answer=chatMode==='database'?'数据库精确统计共 42 条。[A1]':chatMode==='retrieval'?'当前返回数据库摘录。[C3][A1]':'**资料结论** [C3] <img src=x onerror="window.pwned=1">\n统计口径见 [A1]';result.answer_format=chatMode==='answered'?'verbatim_extracts':chatMode==='database'?'database_aggregate':'retrieval_extracts';result.state=chatMode==='database'?'database_answer':chatMode==='retrieval'?'retrieval_only':'answered';result.model={id:MODEL,used:chatMode==='answered',attempted:chatMode==='answered'||chatMode==='retrieval',reason:chatMode==='database'?'exact_database_aggregate':chatMode==='retrieval'?'model_unreachable':null};return result;},
 async authenticate(password){calls.auth.push(password.length);if(password!=='test-site-password')throw Object.assign(new Error('invalid'),{status:401});mockMode='normal';return {token:'ephemeral-token'};}
};
window.ZGCLAB_PROJECTS={addEntries:async(rows,givenApi)=>{if(givenApi!==api||!givenApi.workspace||!givenApi.saveWorkspace)throw new Error('wrong projects API');calls.project.push(rows.map(e=>e.r.id));return {added:rows.length};}};
window.api={META,Q:ZGCLAB_QUERY,view:document.querySelector('#view'),workspace,serviceClient:client,entriesFor:async()=>entries,ensureDetail:async()=>({fields:{content_cn:'人工智能安全研究的完整正文第一段。\n\n第二段保持真实。'}}),titleOf:(a,r)=>r.title_cn||r.title,instName:id=>META.institutions.find(i=>i.ktid===Number(id))?.cn||String(id),showToast:m=>document.querySelector('#notice').textContent=m,saveWorkspace:()=>{if(window.storageBlocked)return false;localStorage.setItem('assistant-test',JSON.stringify(workspace));return true;}};
window.controller=new AbortController();window.mount=p=>{controller.abort();controller=new AbortController();api.signal=controller.signal;return ZGCLAB_ASSISTANT(new URLSearchParams(p||''),api);};
mount('mode=search&q=人工智能');
</script></body></html>'''


def run():
    OUT.mkdir(parents=True, exist_ok=True)
    checks, errors = [], []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path=shutil.which("google-chrome"), args=["--no-sandbox"])
        context = browser.new_context(viewport={"width": 1440, "height": 1000}, accept_downloads=True)
        def route(request):
            path = request.request.url.split("assistant.test/", 1)[1].split("?", 1)[0]
            if not path:
                request.fulfill(status=200, content_type="text/html", body=HTML)
            elif path in {"styles.css", "assistant.css", "assistant.js", "core.js", "query.js"}:
                request.fulfill(status=200, content_type="text/css" if path.endswith("css") else "application/javascript", body=(ROOT / path).read_text())
            else:
                request.fulfill(status=404, body="missing")
        context.route("http://assistant.test/**", route)
        page = context.new_page()
        page.set_default_timeout(10000)
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto("http://assistant.test/#/assistant")
        page.locator(".as-connection.is-connected").wait_for()
        def check(label):
            checks.append(label)
            print("PASS", label, flush=True)
        def submit(question):
            page.locator("#asQuestion").fill(question)
            page.locator("#asSubmit").click()
            page.wait_for_function("document.querySelector('#asForm').getAttribute('aria-busy')==='false'")
        assert page.locator("#asSemantic").is_checked()
        assert page.locator("#asQuestion").get_attribute("maxlength") == "1200"
        assert "6,989" in page.locator("#asServiceStatus").inner_text()
        assert "模型可用" in page.locator("#asServiceStatus").inner_text()
        page.locator(".as-filter-disclosure").first.locator("summary").click()
        page.locator("[data-as-inst='1000110']").check()
        page.locator("#asAngle").select_option("news")
        page.locator("#asFrom").fill("2026-01-01")
        page.locator("#asTo").fill("2026-10-01")
        page.locator("#asLimit").select_option("30")
        submit("人工智能安全")
        request = page.evaluate("calls.search.at(-1)")
        assert request["filters"] == {"institution": [1000110], "angle": ["news"], "date_from": "2026-01-01", "date_to": "2026-10-01", "date_field": "published_at"}
        assert request["limit"] == 30 and request["semantic"] and request["expand"]
        assert "42 条记录命中" in page.locator(".as-result-head").inner_text()
        assert "1 段证据 / 1 条记录" in page.locator(".as-result-head").inner_text()
        assert "实际模型" in page.locator(".as-result-head").inner_text()
        assert page.locator("#asSearchResults .as-evidence-label").all_text_contents() == ["[A1]", "[C3]"]
        assert page.locator(".as-evidence h3 a").get_attribute("href") == "#/record/news/news-1"
        assert page.locator("a", has_text="打开原文").get_attribute("href") == "https://example.org/evidence"
        assert page.locator(".as-root img,.as-root script").count() == 0
        assert page.evaluate("window.pwned") is None
        page.get_by_role("button", name="载入正文段落").click()
        page.get_by_role("button", name="已载入正文段落").wait_for()
        assert "第 1 段" in page.locator(".as-body-preview").inner_text()
        assert "服务分段 7" in page.locator(".as-paragraph").inner_text()
        assert "证据原文" in page.locator(".as-evidence>.as-excerpt").inner_text()
        page.get_by_role("button", name="加入专题（1 条）").click()
        assert page.evaluate("calls.project[0]") == ["news-1"]
        check("semantic search/filter schema, real counts, stable C3, evidence safety/detail, complete projects API")
        page.locator("#asSearchResults .as-process > summary").click()
        page.get_by_role("button", name="撤回扩展并重查").click()
        page.wait_for_function("calls.search.length===2 && document.querySelector('#asForm').getAttribute('aria-busy')==='false'")
        assert page.evaluate("calls.search.at(-1).semantic===false && calls.search.at(-1).expand===false")
        assert page.locator("#asSemantic").is_disabled()
        assert "未调用大模型" in page.locator(".as-result-head").inner_text()
        check("withdraw sends semantic=false and expand=false; unused model is clearly labelled")
        page.locator("#asChatTab").click()
        page.locator("#asExpand").check()
        page.locator("#asSessionArea > summary").click()
        page.locator("#asKeep").check()
        submit("人工智能研究有什么结论？")
        assert page.locator(".as-turn").count() == 1
        assert "模型选取的原文摘录" in page.locator(".as-turn").inner_text()
        page.locator(".as-citation-ref", has_text="[C3]").click()
        assert page.evaluate("document.activeElement.dataset.asCitation") == "C3"
        page.locator(".as-citation-ref", has_text="[A1]").click()
        assert page.evaluate("document.activeElement.dataset.asCitation") == "A1"
        assert page.locator(".as-markdown img,.as-markdown a").count() == 0
        assert page.evaluate("workspace.chatSessions[0].turns[0].items[0].label") == "C3"
        assert page.evaluate("workspace.other.keep && workspace.favorites[0].id==='keep'")
        page.evaluate("window.chatMode='database'")
        submit("一共有多少条？")
        assert "数据库精确统计 · 未调用大模型" in page.locator(".as-turn").last.inner_text()
        assert page.locator(".as-turn").last.locator(".as-citation-missing").count() == 0
        assert len(page.evaluate("calls.chat.at(-1).history")) == 2
        page.evaluate("window.chatMode='retrieval'")
        submit("继续提供资料")
        assert "无模型答案" in page.locator(".as-turn").last.inner_text()
        assert "已尝试模型" in page.locator(".as-turn").last.inner_text()
        for i in range(5):
            submit(f"继续查阅第{i}轮资料")
        # Exercise all history bounds with long prior answers, not only short fixtures.
        page.evaluate("workspace.chatSessions.at(-1).turns.forEach(t=>{if(t.kind==='answer'||t.kind==='database')t.answer='证'.repeat(12000);});mount('mode=chat')")
        page.wait_for_function("document.querySelectorAll('.as-turn').length===8")
        submit("历史上限验证")
        history = page.evaluate("calls.chat.at(-1).history")
        assert len(history) <= 8 and all(len(m["content"]) <= 4000 for m in history)
        assert sum(len(m["content"]) for m in history) <= 12000
        check("multi-turn citations C3/A1 keyboard focus, database answers, attempted fallback, bounded history and optional persistence")
        with page.expect_download() as download_info:
            page.locator("#asExport").click()
        markdown = Path(download_info.value.path()).read_text()
        assert "[C3]" in markdown and "[A1]" in markdown and "https://example.org/evidence" in markdown
        assert "数据库精确统计" in markdown and "javascript:" not in markdown
        assert "test-site-password" not in markdown and "ephemeral-token" not in markdown
        page.evaluate("window.copied='';document.execCommand=()=>{window.copied=document.activeElement.value;return true;}")
        page.locator("#asCopy").click()
        assert "[A1]" in page.evaluate("window.copied")
        check("copy/export Markdown carries record/source/statistical citations without credentials")
        page.evaluate("window.storageBlocked=true")
        submit("保存失败仍可使用")
        assert "仅保留" in page.locator("#asStorageStatus").inner_text()
        assert not page.locator("#asExport").is_disabled()
        page.evaluate("window.storageBlocked=false")
        check("private-mode storage failure stays usable, warns memory-only and allows export")
        page.once("dialog", lambda dialog: dialog.dismiss())
        page.locator("#asClear").click()
        assert page.locator(".as-turn").count() == 10
        page.once("dialog", lambda dialog: dialog.accept())
        page.locator("#asClear").click()
        assert page.locator(".as-turn").count() == 0
        assert page.evaluate("workspace.chatSessions.length") == 0
        page.evaluate("window.mockMode='offline'")
        submit("人工智能")
        assert "本地索引" in page.locator(".as-turn").last.inner_text()
        assert "未调用大模型" in page.locator(".as-turn").last.inner_text()
        assert "模拟" not in page.locator(".as-transcript").inner_text()
        assert page.locator("#asError").is_visible()
        page.evaluate("window.mockMode='normal';window.chatMode='answered'")
        page.locator("#asRetry").click()
        page.wait_for_function("document.querySelector('#asForm').getAttribute('aria-busy')==='false'")
        assert page.locator(".as-turn").count() == 1
        check("clear requires confirmation; gateway outage uses real local index; retry replaces fallback turn")
        page.locator("#asSearchTab").click()
        page.evaluate("window.mockMode='empty'")
        submit("没有该主题")
        assert "没有匹配资料" in page.locator("#asSearchResults").inner_text()
        page.evaluate("window.mockMode='normal';window.latency=1000")
        page.locator("#asQuestion").fill("取消测试")
        page.locator("#asSubmit").click()
        page.locator("#asCancel").click()
        page.wait_for_function("document.querySelector('#asProgress').textContent.includes('已取消')")
        assert not page.locator("#asSubmit").is_disabled()
        before = page.evaluate("calls.search.length")
        page.evaluate("document.querySelector('#asQuestion').value='x'.repeat(1201)")
        page.locator("#asSubmit").click()
        assert page.evaluate("calls.search.length") == before
        assert "1200" in page.locator("#asError").inner_text()
        check("empty results, cancellation, and 1200-character input validation")
        page.evaluate("window.mockMode='auth';window.latency=0")
        submit("人工智能")
        page.locator("#asPasswordDialog[open]").wait_for()
        page.locator("#asServicePassword").fill("wrong")
        page.locator("#asPasswordSubmit").click()
        page.locator("#asPasswordError").wait_for(state="visible")
        page.locator("#asServicePassword").fill("test-site-password")
        page.locator("#asPasswordSubmit").click()
        page.wait_for_function("!document.querySelector('#asPasswordDialog').open && document.querySelector('#asForm').getAttribute('aria-busy')==='false'")
        assert page.locator("#asServicePassword").input_value() == ""
        assert page.evaluate("!JSON.stringify(workspace).includes('test-site-password') && !JSON.stringify(workspace).includes('ephemeral-token')")
        check("authentication-required dialog, rejected password, successful retry, no credential persistence")
        for width in (360, 390, 768, 1440):
            page.set_viewport_size({"width": width, "height": 950})
            assert page.evaluate("document.documentElement.scrollWidth<=innerWidth+1"), width
        page.set_viewport_size({"width": 390, "height": 844})
        page.screenshot(path=str(OUT / "assistant-mobile.png"), full_page=True)
        page.set_viewport_size({"width": 1440, "height": 1000})
        page.screenshot(path=str(OUT / "assistant-desktop.png"), full_page=True)
        # Restored sessions preserve both exact statistical context and original C3 IDs.
        page.locator("#asChatTab").click()
        page.evaluate("window.mockMode='normal';window.chatMode='database';window.latency=0")
        submit("统计有多少条")
        page.evaluate("mount('mode=chat')")
        page.wait_for_function("document.querySelectorAll('.as-turn').length===2")
        assert page.locator(".as-turn").last.locator(".as-citation-ref", has_text="[A1]").count() == 1
        assert "数据库精确统计" in page.locator(".as-turn").last.inner_text()
        page.locator("#asSearchTab").click()
        page.locator("#asSearchTab").focus()
        page.keyboard.press("ArrowRight")
        assert page.locator("#asChatTab").get_attribute("aria-selected") == "true"
        page.evaluate("window.latency=1000;window.chatMode='answered'")
        page.locator("#asQuestion").fill("路由取消")
        page.locator("#asSubmit").click()
        page.evaluate("controller.abort();document.querySelector('#view').innerHTML='<p id=sentinel>新的路由</p>'")
        assert page.locator("#sentinel").inner_text() == "新的路由"
        page.evaluate("window.latency=0;mount('mode=search')")
        page.locator("#asSearchTab").wait_for()
        submit("人工智能")
        assert "模型理解后的资料检索结果" in page.locator("#asSearchResults").inner_text()
        check("360/390/768/1440 widths fit, keyboard tabs, restored A1 context, route abort preserves next view")
        # A query can complete while the first status request is still pending.
        page.evaluate("window.statusDelay=1500;window.chatMode='database';mount('mode=chat')")
        submit("全库多少条")
        pending_status=page.locator("#asServiceStatus").inner_text()
        assert "模型暂不可用" not in pending_status
        assert "未报告数量" not in pending_status
        page.wait_for_function("document.querySelector('#asServiceStatus').textContent.includes('DeepSeek V4.1 Flash')")
        assert "6,989" in page.locator("#asServiceStatus").inner_text()
        check("actual API status structure and slow-status/query race keep health unknown until ready")
        assert not errors, errors
        browser.close()
    (OUT / "results.json").write_text(json.dumps({"passed": len(checks), "checks": checks, "page_errors": errors}, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    run()
