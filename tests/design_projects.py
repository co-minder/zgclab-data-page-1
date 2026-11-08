#!/usr/bin/env python3
"""Source-only project design checks inside the actual protected preview.

No build/publish or model calls. Baseline comes from the task's preserved source;
latest shared CSS is always injected before the owned project CSS.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
from hashlib import sha256
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE = os.environ.get("ZGCLAB_TEST_URL", "http://127.0.0.1:8789/")
OUT = Path(os.environ.get("ZGCLAB_PROJECTS_DESIGN_ARTIFACTS", "/home/ubuntu/log/zgclab-ui-design-20261109/projects"))
KEY = "zgclab.workspace.v1"


def run(phase):
    OUT.mkdir(parents=True, exist_ok=True)
    source = {name: (OUT / ("before-" + name) if phase == "before" else ROOT / name) for name in ["projects.js", "projects.css"]}
    errors, checks, model_requests, measurements = [], [], [], []
    password = (ROOT / ".runtime/pages-password").read_text().strip()
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path=shutil.which("google-chrome"), args=["--no-sandbox"])
        context = browser.new_context(viewport={"width": 1440, "height": 1050}, accept_downloads=True)
        page = context.new_page()
        page.set_default_timeout(30000)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("request", lambda r: model_requests.append(r.url) if r.url.split("?")[0].endswith(("/api/chat", "/api/search")) else None)

        def check(label):
            checks.append(label)
            print("PASS", label, flush=True)

        def unlock():
            if page.locator("#accessForm").count():
                page.locator("#accessPassword").fill(password)
                page.locator("#accessSubmit").click()
            page.locator("#lockSession").wait_for()
            page.wait_for_function("!!window.ZGCLAB_PROJECTS")
            page.evaluate("css => document.querySelectorAll('head style').forEach(s => { if(s.textContent.includes(css)) s.textContent=s.textContent.replace(css, ''); })", (OUT / "before-projects.css").read_text())
            page.add_style_tag(path=str(ROOT / "styles.css"))
            page.add_style_tag(path=str(source["projects.css"]))
            page.add_script_tag(path=str(source["projects.js"]))

        def go(route="#/projects"):
            page.evaluate("route=>location.hash=route", route)
            page.locator(".projects-page").wait_for()

        def snap(name, width=1440, height=1050):
            page.set_viewport_size({"width": width, "height": height})
            if not page.locator("dialog[open]").count():
                page.evaluate("() => { document.activeElement?.blur(); window.scrollTo({top:0,left:0,behavior:'instant'}); }")
            page.screenshot(path=str(OUT / f"{phase}-{name}-{width}.png"))
            if name == "report":
                page.locator("#projectReportPanel" if phase == "after" else ".project-report").scroll_into_view_if_needed()
                page.screenshot(path=str(OUT / f"{phase}-{name}-editor-{width}.png"))
                page.evaluate("window.scrollTo({top:0,left:0,behavior:'instant'})")

        def bounds(label, width):
            row = page.evaluate("""() => ({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
              controls:[...document.querySelectorAll('.projects-page button,.projects-page .btn,.projects-page select,.projects-page input:not([type=checkbox]),.projects-page summary,.projects-dialog button,.projects-dialog select,.projects-dialog input')].filter(e=>e.getClientRects().length&&!e.closest('[hidden]')).map(e=>({label:(e.textContent||e.getAttribute('aria-label')||e.id).trim().slice(0,70),height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width}))})""")
            assert row["scrollWidth"] <= width + 1, (label, row)
            if phase == "after":
                undersized = [c for c in row["controls"] if c["height"] < 39.5]
                assert not undersized, (label, undersized)
            measurements.append({"state":label, **row})

        page.goto(BASE + "#/overview")
        unlock()
        go()
        page.locator("#projectWelcomeNew").wait_for()
        snap("empty")
        snap("empty", 390, 844)
        check("actual preview empty workspace and explicit create action")
        page.set_viewport_size({"width":1440,"height":1050})
        page.locator("#projectsNew").click()
        page.locator('dialog [name=name]').fill("人工智能治理与政策跟踪")
        page.locator('dialog [name=description]').fill("跟踪主要机构的政策发布与研究观点，整理可核对的来源和引用，形成阶段性观察。")
        snap("dialog")
        snap("dialog",390,844)
        bounds("new dialog",390)
        page.keyboard.press("Escape")
        assert page.locator("dialog").count() == 0
        assert page.locator("#projectsNew").evaluate("e=>e===document.activeElement")
        check("new dialog Escape restores original trigger focus")
        for name in ["data/news.js","data/clue.js","data/social.js"]:
            page.add_script_tag(path=str(ROOT / name))
        seed = page.evaluate("""key=>{
          const ws=JSON.parse(localStorage.getItem(key)||'null')||{favorites:[],queries:[],read:{},watchlist:[]};
          const entries=['news','clue','social'].flatMap(angle=>window['ZGCLAB_'+angle.toUpperCase()].slice(0,angle==='news'?6:3).map(r=>({angle,r})));
          const api={META:ZGCLAB_META,Q:ZGCLAB_QUERY,titleOf:(a,r)=>r.title_cn??r.title??r.original_content??r.id,snippetOf:(a,r)=>r.summary_cn??r.summary??r.chinese_translation??r.original_content??'',instName:id=>ZGCLAB_META.institutions.find(i=>String(i.ktid)===String(id))?.cn??String(id)};
          const p=ZGCLAB_PROJECTS.createProject(ws,'人工智能治理与政策跟踪','跟踪主要机构的政策发布与研究观点，整理可核对的来源和引用，形成阶段性观察。');
          ZGCLAB_PROJECTS.addToProject(ws,p.id,entries,api);
          p.items.forEach((item,i)=>{item.status=i<3?'verified':i===3?'adopted':'pending';item.selected=i!==8;});
          p.items[1].note='核对发布日期与机构名称；后续与同主题材料交叉阅读。';p.items[1].excerpt='';
          p.report.markdown=ZGCLAB_PROJECTS.reportText(p,{generatedAt:new Date().toISOString(),baseUrl:location.href});
          p.report.updatedAt=new Date().toISOString();p.report.generatedAt=p.report.updatedAt;p.report.materialKeys=p.items.filter(i=>i.selected).map(i=>i.angle+':'+i.id);
          const second=ZGCLAB_PROJECTS.createProject(ws,'地区安全动态','梳理政策文件与公开发布，保留有出处的阶段性观察。');ZGCLAB_PROJECTS.addToProject(ws,second.id,entries.slice(0,3),api);
          const long=ZGCLAB_PROJECTS.createProject(ws,'跨区域政策研究与机构合作议题长期专题资料整理以及中文长标题换行验证','这是用于检查中文长段落和连续英文标识换行的专题说明。'.repeat(8)+'LongResearchReferenceWithoutSpaces'.repeat(8));
          const archived=ZGCLAB_PROJECTS.createProject(ws,'2026 年度资料归档','已完成阶段性整理。');archived.archived=true;
          ws.favorites=entries.slice(0,3).map(({angle,r})=>({angle,id:r.id,ktid:r.ktid}));
          localStorage.setItem(key,JSON.stringify(ws));return {id:p.id,emptyId:long.id};
        }""", KEY)
        page.goto(BASE + "#/overview")
        page.reload()
        unlock()
        go("#/projects?id=" + seed["id"])
        page.locator(".project-material").first.wait_for()
        for width in [1440,768,390,360]:
            page.set_viewport_size({"width":width,"height":1050 if width>=768 else 844})
            if phase == "after" and page.locator('[data-project-panel=materials]').count():
                page.locator('[data-project-panel=materials]').click()
                page.evaluate("window.scrollTo({top:0,left:0,behavior:'instant'})")
                if width <= 820:
                    control = page.locator(".project-workspace-switch").bounding_box()
                    assert control["y"] + control["height"] <= (1050 if width >= 768 else 844) + 2, control
                    page.locator(".project-management > summary").click()
                    assert page.locator("#projectEdit").is_visible() and page.locator("#projectArchive").is_visible()
                    page.locator(".project-management > summary").click()
            bounds("filled materials",width)
            snap("filled",width,1050 if width>=768 else 844)
            if phase == "after":
                page.locator('[data-project-panel=report]').click()
                assert page.locator("#projectMarkdown").is_visible()
                bounds("report editor",width)
                snap("report",width,1050 if width>=768 else 844)
        check("real snapshot materials, saved report, 360/390/768/1440 viewport bounds and control targets")
        if phase == "before":
            page.set_viewport_size({"width":1440,"height":1050})
            page.locator("#projectMarkdown").scroll_into_view_if_needed()
            snap("report")
        if phase == "after":
            page.set_viewport_size({"width":390,"height":844})
            assert not page.locator("#projectsNavigation").evaluate("e=>e.open")
            page.locator("#projectsNavigation>summary").click()
            page.locator('[data-project-id="'+seed["emptyId"]+'"]').click()
            assert not page.locator("#projectsNavigation").evaluate("e=>e.open")
            assert page.locator("#projectMaterials").is_visible()
            page.locator(".project-description-disclosure > summary").click()
            assert "LongResearchReferenceWithoutSpaces" in page.locator(".project-description").inner_text()
            bounds("long Chinese empty project",390)
            page.locator(".project-description-disclosure > summary").click()
            snap("long-empty",390,844)
            page.set_viewport_size({"width":1440,"height":1050})
            bounds("long Chinese empty project",1440)
            snap("long-empty")
            check("compact native project navigation auto-closes after choosing; long Chinese and unbroken text wrap")
            page.locator('[data-project-id="'+seed["id"]+'"]').click()
            page.locator("#projectMaterialSearch").fill("no-project-material-match-20261109")
            assert page.locator(".project-material").count() == 0
            page.locator('[data-project-clear-filters]').click()
            assert page.locator(".project-material").count() == 12
            page.locator('[data-project-panel=materials]').focus()
            page.keyboard.press("Tab")
            assert page.locator('[data-project-panel=report]').evaluate("e=>e===document.activeElement && getComputedStyle(e).outlineStyle!=='none'")
            page.keyboard.press("Enter")
            assert page.locator('[data-project-panel=report]').get_attribute("aria-pressed") == "true"
            check("designed no-results reset and keyboard-visible section controls")
        assert not errors, errors
        assert not model_requests, model_requests
        check("zero uncaught errors and no chat/search/model requests")
        browser.close()
    result={"phase":phase,"target":BASE,"scope":"actual protected preview with current shared CSS then owned project source injected; no build","sourceSha256":{name:sha256(p.read_bytes()).hexdigest() for name,p in source.items()},"sharedStylesSha256":sha256((ROOT/'styles.css').read_bytes()).hexdigest(),"checks":checks,"errors":errors,"modelRequests":model_requests,"measurements":measurements}
    (OUT/f"{phase}-design-results.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n")
    print(f"{len(checks)} design checks passed; artifacts: {OUT}",flush=True)


if __name__ == "__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--phase",choices=["before","after"],default="after")
    run(parser.parse_args().phase)
