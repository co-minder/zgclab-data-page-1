#!/usr/bin/env python3
"""Independent project-module browser regression; uses existing Playwright/Chrome only."""
from __future__ import annotations

import csv
import io
import json
import os
import re
import shutil
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(os.environ.get("ZGCLAB_PROJECTS_ARTIFACTS", "/home/ubuntu/log/zgclab-projects"))
OUT.mkdir(parents=True, exist_ok=True)
HTML = """<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/projects.css"><title>专题资料夹模块测试</title></head><body style="margin:0;padding:20px"><main id="view"></main><p id="notice" role="status"></p><script src="/core.js"></script><script src="/query.js"></script><script src="/data/meta.js"></script><script src="/data/news.js"></script><script src="/data/clue.js"></script><script src="/data/social.js"></script><script src="/projects.js"></script><script>
window.version=0;window.controller=new AbortController();
window.workspace=JSON.parse(localStorage.getItem('zgclab.projects.test')||'null')||{favorites:[],queries:[{name:'保留查询',hash:'/explore?q=keep'}],read:{keep:'yes'},watchlist:[1001190],other:{keep:true}};
window.entries=['news','clue','social'].flatMap(angle=>window['ZGCLAB_'+angle.toUpperCase()].map(r=>({angle,r})));
window.workspace.favorites=window.workspace.favorites.length?window.workspace.favorites:entries.slice(0,3).map(({angle,r})=>({angle,id:r.id,ktid:r.ktid}));
window.api={META:ZGCLAB_META,CORE:ZGCLAB_CORE,Q:ZGCLAB_QUERY,view:document.querySelector('#view'),workspace,
  titleOf:(angle,r)=>r.title_cn??r.title??r.original_content??r.id,
  snippetOf:(angle,r)=>r.summary_cn??r.summary??r.chinese_translation??r.original_content??'',
  instName:id=>ZGCLAB_META.institutions.find(i=>String(i.ktid)===String(id))?.cn??String(id),
  entriesFor:async angle=>entries.filter(e=>angle==='all'||e.angle===angle),
  ensureDetail:async(angle,r)=>({fields:r}),
  showToast:message=>{document.querySelector('#notice').textContent=message;},
  saveWorkspace:()=>localStorage.setItem('zgclab.projects.test',JSON.stringify(workspace)),
  currentVersion:()=>window.version};
window.mount=()=>{controller.abort();controller=new AbortController();version++;api.signal=controller.signal;api.version=version;return ZGCLAB_PROJECTS(new URLSearchParams(location.hash.split('?')[1]||''),api);};
mount();
</script></body></html>"""


def run():
    passed, errors = [], []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path=shutil.which("google-chrome"), args=["--no-sandbox"])
        context = browser.new_context(viewport={"width": 1440, "height": 1100}, accept_downloads=True)

        def route(request):
            name = request.request.url.split("projects.test/", 1)[1].split("?", 1)[0]
            if not name:
                request.fulfill(status=200, content_type="text/html", body=HTML)
            elif name in {"core.js", "query.js", "projects.js", "projects.css", "styles.css", "data/meta.js", "data/news.js", "data/clue.js", "data/social.js"}:
                request.fulfill(status=200, content_type="text/css" if name.endswith(".css") else "application/javascript", body=(ROOT / name).read_text())
            else:
                request.fulfill(status=404, body="missing")

        context.route("http://projects.test/**", route)
        page = context.new_page()
        page.set_default_timeout(15000)
        page.on("pageerror", lambda error: errors.append(str(error)))

        def record(label):
            passed.append(label)
            print("PASS", label, flush=True)

        def data():
            return page.evaluate("JSON.parse(localStorage.getItem('zgclab.projects.test'))")

        def add(entries_js, project_index=0, name=None):
            page.evaluate(f"void(window.adding=ZGCLAB_PROJECTS.addEntries({entries_js},api))")
            dialog = page.locator("dialog.projects-dialog")
            dialog.wait_for()
            if name:
                dialog.locator('[name="project"]').select_option("")
                dialog.locator('[name="name"]').fill(name)
            else:
                dialog.locator('[name="project"]').select_option(page.evaluate(f"workspace.projects[{project_index}].id"))
            dialog.locator('[type="submit"]').click()
            dialog.wait_for(state="detached")
            return page.evaluate("adding")

        page.goto("http://projects.test/#/projects")
        page.locator("#projectWelcomeNew").wait_for()
        assert data() is None
        page.locator("#projectsNew").click()
        page.locator('dialog [name="name"]').fill('研究 <img src=x onerror="window.pwned=1">')
        page.locator('dialog [name="description"]').fill('</textarea><script>window.pwned=1</script>')
        page.locator('dialog [type="submit"]').click()
        page.locator("#projectMaterialCount").wait_for()
        assert "共 0 条" in page.locator("#projectMaterialCount").inner_text()
        assert page.locator(".project-material").count() == 0
        assert page.evaluate("window.pwned") is None
        assert page.locator(".projects-main img,.projects-main script").count() == 0
        record("new empty project, literal malicious name/description, no script execution")

        result = add("entries.slice(0,27)")
        assert result["added"] == 27
        assert add("entries.slice(0,27)")["added"] == 0
        page.evaluate("mount()")
        assert "共 27 条" in page.locator("#projectMaterialCount").inner_text()
        assert page.locator(".project-material").count() == 20
        assert data()["queries"][0]["name"] == "保留查询"
        assert data()["other"] == {"keep": True}
        page.locator("#projectMaterialPager").get_by_role("button", name="下一页").click()
        assert page.locator(".project-material").count() == 7
        page.locator("#projectMaterialPager").get_by_role("button", name="上一页").click()
        record("standard addEntries API adds actual 27 records, skips duplicates, paginates, preserves workspace")

        first = page.locator(".project-material").first
        first.locator(".project-annotations summary").click()
        malicious = '</textarea><img src=x onerror="window.pwned=1"> =formula'
        first.locator('[data-item-field="note"]').fill(malicious)
        first.locator('[data-item-field="excerpt"]').fill("重点引用\n第二行")
        first.locator('[data-item-field="status"]').select_option("verified")
        first.locator('[data-item-field="selected"]').uncheck()
        page.reload()
        assert page.locator(".project-material").first.locator('[data-item-field="note"]').input_value() == malicious
        assert page.locator(".project-material").first.locator('[data-item-field="status"]').input_value() == "verified"
        assert not page.locator(".project-material").first.locator('[data-item-field="selected"]').is_checked()
        assert page.evaluate("window.pwned") is None
        page.locator("#projectStatus").select_option("verified")
        assert page.locator(".project-material").count() == 1
        page.locator(".project-material").first.locator('[data-item-field="status"]').select_option("adopted")
        assert page.locator(".project-material").count() == 0
        page.locator("#projectStatus").select_option("")
        page.locator("#projectMaterialSearch").fill("重点引用")
        assert page.locator(".project-material").count() == 1
        page.locator("#projectMaterialSearch").fill("")
        record("annotation, excerpt, selected state persist after reload; status and annotation search match")

        first_id = page.locator(".project-material").first.get_attribute("data-material")
        second_id = page.locator(".project-material").nth(1).get_attribute("data-material")
        page.locator(".project-material").nth(1).locator('[data-item-action="up"]').click()
        assert page.locator(".project-material").first.get_attribute("data-material") == second_id
        page.locator(".project-material").first.locator('[data-item-action="remove"]').click()
        assert "共 26 条" in page.locator("#projectMaterialCount").inner_text()
        page.locator("#projectUndoRemove").click()
        assert page.locator(".project-material").first.get_attribute("data-material") == second_id
        assert "共 27 条" in page.locator("#projectMaterialCount").inner_text()
        assert page.locator(".project-material").nth(1).get_attribute("data-material") == first_id
        record("move changes actual order, remove is reversible with original position")

        page.locator("#projectSelectFiltered").click()
        page.locator("#projectGenerateReport").click()
        page.wait_for_function("workspace.projects[0].report.markdown.includes('用户选定的 27 条材料')")
        md = page.locator("#projectMarkdown").input_value()
        assert len(re.findall(r"^### ", md, re.M)) == 27
        assert "#/record/news/" in md and "数据版本" in md and "原文" in md
        assert "&lt;img" in md and "<img" not in md
        with page.expect_download() as event:
            page.locator("#projectExportMarkdown").click()
        assert Path(event.value.path()).read_text() == md
        page.locator("#projectMarkdown").fill(md + "\n用户手写结论\n")
        page.reload()
        assert "用户手写结论" in page.locator("#projectMarkdown").input_value()
        page.locator("#projectGenerateReport").click()
        page.locator("dialog").get_by_role("button", name="取消", exact=True).click()
        assert "用户手写结论" in page.locator("#projectMarkdown").input_value()
        record("report includes all 27 selected materials, editable text reloads, Markdown download matches")

        with page.expect_download() as event:
            page.locator("#projectExportJson").click()
        backup_bytes = Path(event.value.path()).read_bytes()
        backup = json.loads(backup_bytes)
        assert len(backup["projects"][0]["items"]) == 27
        with page.expect_download() as event:
            page.locator("#projectExportCsv").click()
        rows = list(csv.reader(io.StringIO(Path(event.value.path()).read_text(encoding="utf-8-sig"))))
        assert len(rows) == 28
        assert all(len(row) == len(rows[0]) for row in rows)
        assert "用户手写结论" in backup["projects"][0]["report"]["markdown"]
        page.locator("#projectsImport").set_input_files({"name": "projects.json", "mimeType": "application/json", "buffer": backup_bytes})
        page.locator("dialog").get_by_role("button", name="合并导入", exact=True).click()
        assert len(data()["projects"]) == 1
        page.locator("#projectMarkdown").fill("本地改动的报告")
        page.locator("#projectMarkdown").blur()
        page.locator("#projectsImport").set_input_files({"name": "projects.json", "mimeType": "application/json", "buffer": backup_bytes})
        assert "导入副本" in page.locator("dialog").inner_text()
        page.locator("dialog").get_by_role("button", name="合并导入", exact=True).click()
        assert len(data()["projects"]) == 2
        assert data()["projects"][0]["report"]["markdown"] == "本地改动的报告"
        assert "用户手写结论" in data()["projects"][1]["report"]["markdown"]
        record("real JSON/CSV downloads, idempotent import, conflicting report safely retained in import copy")

        before = data()
        bad = dict(backup)
        bad["schemaVersion"] = 99
        page.locator("#projectsImport").set_input_files({"name": "bad.json", "mimeType": "application/json", "buffer": json.dumps(bad).encode()})
        page.wait_for_function("document.querySelector('#notice').textContent.includes('版本不受支持')")
        assert data() == before
        assert page.locator("dialog").count() == 0
        record("invalid import leaves existing project/workspace state unchanged")

        page.locator("#projectEdit").click()
        page.locator('dialog [name="name"]').fill("重命名研究")
        page.locator('dialog [name="description"]').fill("新的专题说明")
        page.locator('dialog [type="submit"]').click()
        assert page.locator(".project-summary h2").inner_text() == "重命名研究"
        page.locator("#projectArchive").click()
        assert page.locator("#projectAddFavorites").is_disabled()
        assert page.locator("#projectMarkdown").is_disabled()
        page.locator("#projectArchive").click()
        assert not page.locator("#projectAddFavorites").is_disabled()
        record("rename, description edit, archive and restore update real stored project")

        result = add("entries.slice(0,1)", name="跨专题")
        assert result["added"] == 1
        assert len(data()["projects"]) == 3
        page.evaluate("mount()")
        page.locator('[data-project-id="' + result["project"]["id"] + '"]').click()
        assert "共 1 条" in page.locator("#projectMaterialCount").inner_text()
        page.locator("#projectAddFavorites").click()
        page.locator('dialog [type="submit"]').click()
        assert "共 3 条" in page.locator("#projectMaterialCount").inner_text()
        record("new project from add dialog, same record across folders, favorites resolved and deduplicated")

        page.set_viewport_size({"width": 390, "height": 844})
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        page.screenshot(path=str(OUT / "projects-mobile.png"), full_page=True)
        page.locator("#projectsNew").click()
        assert page.evaluate("document.querySelector('dialog').getBoundingClientRect().width <= innerWidth")
        page.keyboard.press("Escape")
        assert page.locator("dialog").count() == 0
        page.set_viewport_size({"width": 1440, "height": 1100})
        page.screenshot(path=str(OUT / "projects-desktop.png"), full_page=True)
        record("390px mobile and desktop dark layout, native dialog Escape and bounds")

        page.evaluate("void(window.adding=ZGCLAB_PROJECTS.addRecord('news',entries[0].r,api))")
        page.locator("dialog").wait_for()
        page.evaluate("controller.abort()")
        page.locator("dialog").wait_for(state="detached")
        assert page.evaluate("adding") is None
        page.evaluate("mount()")
        page.evaluate("void(window.adding=ZGCLAB_PROJECTS.addEntries(entries.slice(0,1),api))")
        page.locator("dialog").wait_for()
        page.evaluate("location.hash='#/overview'")
        page.locator("dialog").wait_for(state="detached")
        assert page.evaluate("adding") is None
        record("addRecord and addEntries dialogs cancel on AbortSignal and hash route change")

        page.evaluate("location.hash='#/projects';mount()")
        page.evaluate("""(() => { const p=workspace.projects[0]; p.report.markdown=''; p.items.forEach(i=>i.url=''); api.ensureDetail=()=>new Promise(resolve=>{window.finishDetail=resolve}); })()""")
        page.evaluate("mount()")
        page.locator("#projectGenerateReport").click()
        page.wait_for_function("typeof finishDetail==='function'")
        assert page.locator("#projectCancelReport").is_visible()
        assert page.locator("#projectMarkdown").evaluate("el=>el.readOnly")
        page.locator("#projectCancelReport").click()
        page.evaluate("finishDetail({fields:{url:'https://example.com/detail'}})")
        assert not page.locator("#projectMarkdown").evaluate("el=>el.readOnly")
        assert page.locator("#projectMarkdown").input_value() == ""
        assert not page.locator("#projectGenerateReport").is_disabled()
        record("cancelled asynchronous source lookup cannot overwrite report; editor and button recover")

        page.evaluate("api.ensureDetail=async(angle,r)=>({fields:r});api.saveWorkspace=()=>false;mount()")
        page.locator("#projectMarkdown").fill("保存失败仍需保留并导出的报告")
        page.locator("#projectMarkdown").blur()
        assert "仅在本次访问" in page.locator("#projectReportSaved").inner_text()
        assert "已保存于" not in page.locator("#projectReportSaved").inner_text()
        assert page.locator("#projectsStorageStatus").is_visible()
        assert "保存失败仍需保留" in page.evaluate("workspace.projects[0].report.markdown")
        assert "保存失败仍需保留" not in (data()["projects"][0]["report"]["markdown"] or "")
        with page.expect_download() as download_event:
            page.locator("#projectExportMarkdown").click()
        assert Path(download_event.value.path()).read_text() == "保存失败仍需保留并导出的报告"
        with page.expect_download() as download_event:
            page.locator("#projectExportJson").click()
        failed_backup = json.loads(Path(download_event.value.path()).read_text())
        assert failed_backup["projects"][0]["report"]["markdown"] == "保存失败仍需保留并导出的报告"
        added_after_failure = add("entries.slice(50,51)")
        assert added_after_failure["added"] == 1
        assert "仅在本次访问" in page.locator("#notice").inner_text()
        page.evaluate("mount()")
        assert "仅在本次访问" in page.locator("#projectReportSaved").inner_text()
        assert page.locator("#projectsStorageStatus").is_visible()
        record("saveWorkspace false retains edits and additions in memory, warns without claiming saved, and exports full content")

        page.evaluate("api.saveWorkspace=()=>{localStorage.setItem('zgclab.projects.test',JSON.stringify(workspace));return true;}")
        page.locator("#projectMarkdown").fill("恢复保存后的报告")
        page.locator("#projectMarkdown").blur()
        assert "已保存于" in page.locator("#projectReportSaved").inner_text()
        assert page.locator("#projectsStorageStatus").is_hidden()
        assert data()["projects"][0]["report"]["markdown"] == "恢复保存后的报告"
        record("successful retry clears storage failure notice and persists retained report")

        assert not errors, errors
        (OUT / "results.json").write_text(json.dumps({"passed": passed, "pageErrors": errors}, ensure_ascii=False, indent=2))
        print(f"{len(passed)} browser checks passed; artifacts: {OUT}", flush=True)
        context.close()
        browser.close()


if __name__ == "__main__":
    run()
