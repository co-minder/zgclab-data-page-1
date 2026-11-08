#!/usr/bin/env python3
"""Actual encrypted-site project integration, without a fixture or injected app code.

Run only after the protected build is ready:
    ZGCLAB_TEST_URL=http://127.0.0.1:8788/ python3 tests/projects.integration.py

Uses a fresh browser profile. Unlocks the real gate using the existing password file
or ZGCLAB_TEST_PASSWORD; never prints credentials. Every source and data asset comes
from the target site. Network holds delay real encrypted requests without replacing
responses, so loading guards can be checked. Does not call model/API chat endpoints.
"""
from __future__ import annotations

import asyncio
import csv
import io
import json
import os
import re
import shutil
import traceback
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE = os.environ.get("ZGCLAB_TEST_URL", "http://127.0.0.1:8788/")
if not BASE.endswith("/"):
    BASE += "/"
OUT = Path(os.environ.get("ZGCLAB_PROJECTS_INTEGRATION_ARTIFACTS", "/home/ubuntu/log/zgclab-projects-integration"))
KEY = "zgclab.workspace.v1"


async def run():
    OUT.mkdir(parents=True, exist_ok=True)
    passed, failures, page_errors = [], [], []
    password_file = ROOT / ".runtime/pages-password"
    password = os.environ.get("ZGCLAB_TEST_PASSWORD") or (password_file.read_text().rstrip("\r\n") if password_file.is_file() else "")
    if not password:
        raise SystemExit("Existing website password is required")

    def check(label, condition, evidence=None):
        row = {"check": label, "evidence": evidence}
        if condition:
            passed.append(row)
            print("PASS", label, flush=True)
        else:
            failures.append(row)
            print("FAIL", label, flush=True)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True, executable_path=os.environ.get("ZGCLAB_CHROME") or shutil.which("google-chrome"), args=["--no-sandbox"])
        context = await browser.new_context(viewport={"width": 1440, "height": 1100}, accept_downloads=True)
        page = await context.new_page()
        page.set_default_timeout(30000)
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        manifest = {}

        async def unlock(target):
            gate = target.locator("#accessForm")
            await gate.wait_for()
            await target.locator("#accessPassword").fill(password)
            await target.locator("#accessSubmit").click()
            await target.locator("#lockSession").wait_for()
            await target.wait_for_function("!!window.ZGCLAB_PROJECTS && !!document.querySelector('#view')")

        async def go(hash_route, ready):
            await page.evaluate("hash => { location.hash = hash; }", hash_route)
            await page.locator(ready).first.wait_for()

        async def workspace(target=page):
            return await target.evaluate("key => JSON.parse(localStorage.getItem(key) || 'null')", KEY)

        async def finish_add(project_id=None, name=None):
            dialog = page.locator("dialog.projects-dialog")
            await dialog.wait_for()
            if name:
                await dialog.locator('[name="project"]').select_option("")
                await dialog.locator('[name="name"]').fill(name)
                await dialog.locator('[name="description"]').fill("真实站集成验证：详情、批量筛选与工作台备份。")
            else:
                await dialog.locator('[name="project"]').select_option(project_id)
            await dialog.locator('[type="submit"]').click()
            await dialog.wait_for(state="detached")

        async def download(button):
            async with page.expect_download() as event:
                await page.locator(button).click()
            item = await event.value
            return Path(await item.path()).read_bytes()

        async def import_workspace(payload):
            await go("#/workspace", "#backupWorkspace")
            await page.locator("#importWorkspace").set_input_files({"name": "project-integration-workspace.json", "mimeType": "application/json", "buffer": json.dumps(payload, ensure_ascii=False).encode()})

        async def hold_asset(name):
            seen, release = asyncio.Event(), asyncio.Event()
            asset_url = urljoin(BASE, manifest["assets"][name])

            async def handle(route):
                seen.set()
                await asyncio.wait_for(release.wait(), timeout=45)
                await route.continue_()

            await context.route(asset_url, handle)
            return seen, release, asset_url, handle

        try:
            await page.goto(BASE + "#/overview")
            await page.locator("#accessForm").wait_for()
            manifest_path = await page.locator("script[data-manifest]").get_attribute("data-manifest")
            response = await context.request.get(urljoin(BASE, manifest_path))
            manifest = await response.json()
            required = {"app.js", "explorer.js", "projects.js", "projects.css", "data/news.js", "data/clue.js"}
            assert required.issubset(manifest["assets"]), "Protected build is missing integration assets"
            await unlock(page)
            await page.locator(".kpis").first.wait_for()
            check("actual encrypted site unlocks and loads projects module", True, {"manifestVersion": manifest["version"], "target": BASE})

            seen, release, asset_url, handler = await hold_asset("data/news.js")
            try:
                await go("#/explore?angle=news&limit=50&size=14", "#addResultsProject")
                await asyncio.wait_for(seen.wait(), timeout=20)
                check("bulk add is disabled while initial real data request is pending", await page.locator("#addResultsProject").is_disabled())
            finally:
                release.set()
            await page.wait_for_function("document.querySelector('#exBody tr[data-id]') && !document.querySelector('#exportResults').disabled")
            await context.unroute(asset_url, handler)
            await page.locator("#saveQuery").click()
            first = page.locator("#exBody tr[data-id]").first
            first_id = await first.get_attribute("data-id")
            first_title = await first.locator(".cell-title").inner_text()
            await first.click()
            await page.wait_for_function("document.querySelector('#detailStatus')?.textContent.includes('已载入完整交付记录')")
            await page.locator("#favoriteRecord").click()
            source_hash = await page.evaluate("location.hash")
            await page.locator("#addRecordProject").click()
            await page.locator("dialog.projects-dialog").wait_for()
            check("detail close(false) opens add dialog with live route signal", await page.locator("#modalRoot .modal").count() == 0 and await page.evaluate("location.hash") == source_hash)
            check("detail scroll lock and key handler are removed before project dialog", not await page.locator("body").evaluate("el => el.classList.contains('modal-open')"))
            await finish_add(name="真实站专题集成")
            saved = await workspace()
            project_id = saved["projects"][0]["id"]
            check("detail joins actual selected record and preserves favorite/query/read state", saved["projects"][0]["items"][0]["id"] == first_id and bool(saved["favorites"]) and bool(saved["queries"]) and bool(saved["read"]))

            # A tab change retains the same explorer instance; hold the real clue asset
            # to expose accidental use of the previous news result array.
            seen, release, asset_url, handler = await hold_asset("data/clue.js")
            try:
                await page.locator('#exTabs [data-angle="clue"]').click()
                await asyncio.wait_for(seen.wait(), timeout=20)
                disabled = await page.locator("#addResultsProject").is_disabled()
                stale_preview = None
                if not disabled:
                    await page.locator("#addResultsProject").click()
                    if await page.locator("dialog.projects-dialog").count():
                        stale_preview = await page.locator("dialog .projects-add-preview li").first.inner_text()
                        await page.locator("dialog").get_by_role("button", name="取消", exact=True).click()
                check("bulk add cannot reuse old news results while clue data is pending", disabled, {"stalePreview": stale_preview, "previousFirstTitle": first_title})
            finally:
                release.set()
            await page.wait_for_function("document.querySelector('#exBody tr[data-angle=clue]') && !document.querySelector('#exportResults').disabled")
            await context.unroute(asset_url, handler)
            await page.locator("#addResultsProject").click()
            check("batch dialog receives all 50 filtered matches across pagination", await page.locator("dialog.projects-dialog strong").inner_text() == "50" and await page.locator("#exBody tr[data-id]").count() == 14)
            await finish_add(project_id=project_id)
            saved = await workspace()
            materials = next(p for p in saved["projects"] if p["id"] == project_id)["items"]
            check("batch commits 50 clue materials plus the detail news material", len(materials) == 51 and sum(i["angle"] == "clue" for i in materials) == 50 and any(i["id"] == first_id for i in materials))
            await page.locator("#addResultsProject").click()
            await finish_add(project_id=project_id)
            check("repeated real-site batch does not duplicate project materials", len((await workspace())["projects"][0]["items"]) == 51)

            await page.locator("#openFilters").click()
            await page.locator('[data-filter-tab="time"]').click()
            await page.locator("#exPeriod").select_option("custom")
            await page.locator("#exFrom").fill("2026-09-30")
            await page.locator("#exFrom").dispatch_event("change")
            await page.locator("#exTo").fill("2026-09-01")
            await page.locator("#exTo").dispatch_event("change")
            await page.wait_for_function("document.querySelector('#exCount').textContent.includes('筛选条件无效')")
            check("bulk add is disabled for invalid date bounds", await page.locator("#addResultsProject").is_disabled())
            await page.locator("#resetDialogFilters").click()
            await page.locator("#showFilterResults").click()
            await page.wait_for_function("!document.querySelector('#exportResults').disabled")
            await page.locator("#exQ").fill("projects-integration-zero-result-780405be")
            await page.wait_for_function("document.querySelector('#exCount').dataset.query?.includes('780405be')")
            check("bulk add is disabled for completed empty results", await page.locator("#addResultsProject").is_disabled())

            await go("#/projects?id=" + project_id, "#projectMarkdown")
            first_card = page.locator(".project-material").first
            if not await first_card.locator(".project-annotations").evaluate("el => el.open"):
                await first_card.locator("summary").click()
            note = '集成批注 </textarea><img src=x onerror="window.projectsPwned=1">'
            await first_card.locator('[data-item-field="note"]').fill(note)
            await first_card.locator('[data-item-field="excerpt"]').fill("跨页面引用摘录")
            await first_card.locator('[data-item-field="status"]').select_option("verified")
            await page.locator("#projectGenerateReport").click()
            await page.wait_for_function("document.querySelector('#projectMarkdown').value.includes('用户选定的 51 条材料')")
            md = await page.locator("#projectMarkdown").input_value()
            check("integrated report contains all 51 selected records with source/version references", len(re.findall(r"^### ", md, re.M)) == 51 and "数据版本" in md and "原文" in md and "#/record/" in md)
            await page.locator("#projectMarkdown").fill(md + "\n集成测试手写结论\n")
            markdown_bytes = await download("#projectExportMarkdown")
            csv_bytes = await download("#projectExportCsv")
            csv_rows = list(csv.reader(io.StringIO(csv_bytes.decode("utf-8-sig"))))
            check("real integrated Markdown/CSV downloads include report and all materials", "集成测试手写结论" in markdown_bytes.decode() and len(csv_rows) == 52 and all(len(r) == len(csv_rows[0]) for r in csv_rows))
            check("stored project note renders literally in integrated DOM", await page.evaluate("window.projectsPwned || null") is None and await page.locator(".project-material img").count() == 0)
            await page.screenshot(path=str(OUT / "projects-integrated-desktop.png"), full_page=True)
            await page.set_viewport_size({"width": 390, "height": 844})
            check("integrated project page fits 390px viewport", await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
            await page.screenshot(path=str(OUT / "projects-integrated-mobile.png"), full_page=True)
            await page.set_viewport_size({"width": 1440, "height": 1100})

            await go("#/workspace", "#backupWorkspace")
            backup = json.loads(await download("#backupWorkspace"))
            check("total workspace backup includes projects, annotations, report and pre-existing fields", len(backup["projects"][0]["items"]) == 51 and backup["projects"][0]["items"][0]["note"] == note and "集成测试手写结论" in backup["projects"][0]["report"]["markdown"] and bool(backup["favorites"]) and bool(backup["queries"]) and bool(backup["read"]))
            before = await workspace()
            await import_workspace(backup)
            await page.get_by_text("备份已合并导入并保存", exact=True).wait_for()
            check("total backup re-import merges without duplicating project or materials", len((await workspace())["projects"]) == len(before["projects"]) and len((await workspace())["projects"][0]["items"]) == 51)
            old = {"version": 2, "favorites": [], "queries": [{"name": "旧版查询", "hash": "/explore?angle=news&q=legacy-projects"}]}
            before = await workspace()
            await import_workspace(old)
            await page.wait_for_function("key => JSON.parse(localStorage.getItem(key)).queries.some(q=>q.name==='旧版查询')", arg=KEY)
            after = await workspace()
            check("legacy total backup without projects imports and retains existing projects/favorites/read", after["projects"] == before["projects"] and after["favorites"] == before["favorites"] and after["read"] == before["read"])
            invalid = json.loads(json.dumps(backup))
            invalid["queries"].append({"name": "不可部分导入", "hash": "/explore?q=projects-atomic-must-not-import"})
            invalid["projects"][0]["items"][0]["status"] = "invalid_status"
            before = await workspace()
            await import_workspace(invalid)
            await page.get_by_text("材料核查状态无效", exact=True).wait_for()
            check("invalid projects reject whole total backup atomically", await workspace() == before)
            export_after_invalid = json.loads(await download("#backupWorkspace"))
            check("atomic rejection preserves in-memory workspace as well as localStorage", not any(q["name"] == "不可部分导入" for q in export_after_invalid["queries"]) and export_after_invalid["projects"] == before["projects"])

            await go("#/explore?angle=news&limit=10", "#exBody tr[data-id]")
            await page.locator("#exBody tr[data-id]").first.click()
            await page.locator("#addRecordProject").click()
            await page.locator("dialog.projects-dialog").wait_for()
            before = await workspace()
            await page.evaluate("location.hash='#/overview'")
            await page.locator("dialog.projects-dialog").wait_for(state="detached")
            await page.locator(".kpis").first.wait_for()
            check("real route change cancels detail-origin add without persistence", (await workspace())["projects"] == before["projects"])

            # A second real unlocked profile proves recovery solely through a total
            # backup; no localStorage seeding or module API injection is involved.
            restore_context = await browser.new_context(viewport={"width": 1440, "height": 1100}, accept_downloads=True)
            restore = await restore_context.new_page()
            restore.on("pageerror", lambda error: page_errors.append(str(error)))
            await restore.goto(BASE + "#/workspace")
            await unlock(restore)
            await restore.locator("#backupWorkspace").wait_for()
            await restore.locator("#importWorkspace").set_input_files({"name": "restore-workspace.json", "mimeType": "application/json", "buffer": json.dumps(backup, ensure_ascii=False).encode()})
            await restore.get_by_text("备份已合并导入并保存", exact=True).wait_for()
            restored = await workspace(restore)
            restored_equal = {key: restored.get(key) == backup.get(key) for key in ["projects", "favorites", "queries", "read", "watchlist"]}
            differing = {}
            for key in ["projects", "favorites", "queries"]:
                if not restored_equal[key]:
                    before_list, after_list = backup.get(key, []), restored.get(key, [])
                    differing[key] = {"beforeCount": len(before_list), "afterCount": len(after_list), "rows": [{"index": index, "before": a, "after": b} for index, (a, b) in enumerate(zip(before_list, after_list)) if a != b][:3]}
            check("fresh real-site profile restores project report, notes and favorites from total backup", restored_equal["projects"] and restored_equal["favorites"] and restored_equal["queries"], {"equalFields": restored_equal, "differences": differing})
            await restore.reload()
            await unlock(restore)
            await restore.evaluate("hash => { location.hash = hash; }", "#/projects?id=" + project_id)
            await restore.locator("#projectMarkdown").wait_for()
            check("restored workspace survives full refresh and password unlock", "集成测试手写结论" in await restore.locator("#projectMarkdown").input_value() and await restore.locator(".project-material").first.locator('[data-item-field="note"]').input_value() == note)
            await restore_context.close()
            check("actual app integration reports no uncaught page errors", not page_errors, page_errors)
        except Exception as error:
            failures.append({"check": "integration execution", "error": str(error), "traceback": traceback.format_exc()})
            print("FAIL integration execution:", type(error).__name__, str(error), flush=True)
            try:
                await page.screenshot(path=str(OUT / "failure.png"), full_page=True)
            except Exception:
                pass
        finally:
            result = {"scope": "actual encrypted website; real app/explorer/projects and total workspace backup", "executedAt": datetime.now(timezone.utc).isoformat(), "target": BASE, "manifestVersion": manifest.get("version"), "passed": passed, "failures": failures, "pageErrors": page_errors}
            (OUT / "results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2))
            await context.close()
            await browser.close()
    print(f"{len(passed)} integrated checks passed; {len(failures)} failed; artifacts: {OUT}", flush=True)
    return 1 if failures or page_errors else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run()))
