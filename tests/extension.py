#!/usr/bin/env python3
"""Independent data, workflow and responsive checks for the second release."""
from __future__ import annotations

import csv
import io
import json
import os
import re
import shutil
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE = os.environ.get("ZGCLAB_TEST_URL", "http://127.0.0.1:8789/")
MODE = sys.argv[1] if len(sys.argv) > 1 else "data"
OUT = Path(os.environ.get("ZGCLAB_TEST_ARTIFACTS", f"/home/ubuntu/log/zgclab-extension-{MODE}"))
OUT.mkdir(parents=True, exist_ok=True)
PASSWORD = (ROOT / ".runtime/pages-password").read_text().strip()


def load(path):
    return json.loads(path.read_text().split("=", 1)[1].strip().removesuffix(";"))


META = load(ROOT / "data/meta.js")
ROWS = [(a, r) for a in ("news", "clue", "social") for r in load(ROOT / f"data/{a}.js")]
INST = {str(i["ktid"]): i for i in META["institutions"]}


def beijing_day(raw):
    if not raw:
        return ""
    dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    return dt.astimezone(ZoneInfo("Asia/Shanghai")).date().isoformat() if dt.tzinfo else raw[:10]


def norm(text):
    return unicodedata.normalize("NFKC", str(text or "")).lower()


def run():
    checks, errors = [], []

    def passed(label, **evidence):
        entry = {"check": label, "status": "PASS", **evidence}
        checks.append(entry)
        print(json.dumps(entry, ensure_ascii=False), flush=True)

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path=shutil.which("google-chrome"), args=["--no-sandbox"])
        context = browser.new_context(viewport={"width": 1440, "height": 1000}, accept_downloads=True)
        page = context.new_page()
        page.set_default_timeout(30000)
        page.on("pageerror", lambda error: errors.append(str(error)))

        def unlock():
            if page.locator("#accessForm").count():
                page.locator("#accessPassword").fill(PASSWORD)
                page.locator("#accessSubmit").click()
                page.locator("#lockSession").wait_for()

        page.goto(BASE)
        unlock()
        page.locator("#overviewInstitutions").wait_for()

        def go(route, selector):
            page.evaluate("route=>{location.hash=route}", route)
            page.locator(selector).first.wait_for(state="attached")

        def ready_query():
            page.wait_for_function("document.querySelector('#exCount')?.dataset.query===location.hash.split('?')[1]")

        def download_rows(selector):
            with page.expect_download() as download:
                page.locator(selector).click()
            return list(csv.DictReader(io.StringIO(Path(download.value.path()).read_text(encoding="utf-8-sig"))))

        if MODE in ("data", "live"):
            assert page.locator("h1").inner_text() == "全部数据总览"
            assert int(page.locator("[data-overview-total]").get_attribute("data-overview-total")) == len(ROWS)
            assert page.locator("[data-overview-institution]").count() == len(INST)
            for angle in ("news", "clue", "social"):
                n = sum(a == angle for a, _ in ROWS)
                assert int(page.locator(f"[data-overview-angle='{angle}'] .k-value").inner_text().replace(",", "")) == n
            exported = download_rows("#exportOverview")
            assert sum(int(r["合计"]) for r in exported) == len(ROWS)
            assert len(exported) == len(INST)
            passed("全量总览、三角度、全部机构和汇总导出一致", total=len(ROWS), institutions=len(INST))

            page.locator("#browseAllData").click()
            ready_query()
            assert "6,989" in page.locator("#exCount").inner_text()
            passed("总览可进入全部明细且没有遗留筛选")

            go("#/timeline?angle=all&ids=1001140", "#timelineRecords .rec")
            expected = [r for _, r in ROWS if r["ktid"] == 1001140]
            actual = download_rows("#exportTimeline")
            assert {r["记录ID"] for r in actual} == {r["id"] for r in expected}
            assert len(actual) == len(expected)
            for group in page.locator(".timeline-date").all_inner_texts():
                assert group == "发布时间未提供" or re.match(r"\d{4}-\d{2}-\d{2}", group)
            passed("机构时间线和完整导出集合一致", expected=len(expected), actual=len(actual))
            page.locator("#timelinePeriod").select_option("7")
            assert page.locator("#exportTimeline").is_disabled()
            passed("时间线滚动近七天不回退到历史快照")

            go("#/quality", "[data-quality]")
            tests = {
                "publish_time": lambda a, r: not r.get("publish_time"),
                "url": lambda a, r: not re.match(r"^https?://[^/\s]+", r.get("url") or r.get("original_url") or r.get("content_url") or r.get("source_url") or ""),
                "translation": lambda a, r: bool(r.get("_has_original")) and not r.get("_has_translation"),
                "risk": lambda a, r: a == "clue" and not r.get("risk_level"),
                "unknown_risk": lambda a, r: a == "clue" and r.get("risk_level") == "无法判断",
            }
            for field in ("like_count", "comment_count", "repost_count", "view_count"):
                tests[field] = lambda a, r, f=field: a == "social" and (r.get(f) is None or str(r.get(f)).strip() == "")
            for key, test in tests.items():
                expected = sum(test(a, r) for a, r in ROWS)
                actual = int(page.locator(f"[data-quality='{key}'] b").inner_text().replace(",", ""))
                assert actual == expected, (key, actual, expected)
                passed("质量检查计数 " + key, expected=expected, actual=actual)
            page.locator("[data-quality='publish_time']").click()
            assert page.locator("#qualityRecords .rec").count() == 14
            shown = page.locator("#qualityRecords .rec").evaluate_all("els=>els.map(e=>e.dataset.id)")
            expected_ids = {r["id"] for _, r in ROWS if not r.get("publish_time")}
            assert set(shown) <= expected_ids
            quality_export = download_rows("#exportQuality")
            assert len(quality_export) == len(tests)
            passed("质量问题明细下钻和导出可用", missing_publication=len(expected_ids))

            # A literal phrase from the full body beyond the list's content cap.
            fixture = next(r for a, r in ROWS if a == "news" and r["id"] == "news-1")
            detail_rows = load(ROOT / f"data/details/{META['version']}/news-{fixture['_detail']}.js")
            full = next(d for d in detail_rows if d["id"] == fixture["id"])["fields"]["content"]
            phrase = "Vishnu Tiwari"
            assert norm(phrase) in norm(full) and norm(full).index(norm(phrase)) > 1500
            assert norm(phrase) not in norm(" ".join(str(v) for k, v in fixture.items() if not k.startswith("_")))
            candidates = [(a, r) for a, r in ROWS if a == "news" and r["ktid"] == 5775050]
            expected_hits = set()
            for angle, r in candidates:
                chunk = load(ROOT / f"data/details/{META['version']}/{angle}-{r['_detail']}.js")
                fields = next(d for d in chunk if d["id"] == r["id"])["fields"]
                text = norm("\n".join(str(fields.get(f) or "") for f in ("content", "content_cn", "original_content", "chinese_trans", "chinese_translation")))
                if norm(phrase) in text:
                    expected_hits.add(r["id"])
            go("#/fulltext", "#fulltextQ")
            page.locator("#fulltextQ").fill('"' + phrase + '"')
            page.locator("#fulltextInst").select_option("5775050")
            page.locator("#fulltextAngle").select_option("news")
            page.locator("#startFulltext").click()
            page.wait_for_function("document.querySelector('#fulltextStatus').textContent.startsWith('检索完成')", timeout=90000)
            exported = download_rows("#exportFulltext")
            assert {r["记录ID"] for r in exported} == expected_hits
            assert all(norm(phrase) in norm(r["命中上下文"]) for r in exported)
            assert all(r["检索完成"] == "是" and r["数据版本"] == META["version"] for r in exported)
            passed("完整正文搜索命中列表节选之外的原文并独立核对记录集合", phrase=phrase, expected=len(expected_hits), actual=len(exported))

        if MODE in ("workflow", "live"):
            go("#/explore?angle=all", "#exCount")
            ready_query()
            assert not page.locator("#exFilterDialog").evaluate("el=>el.open")
            assert page.locator("#exQ").is_visible() and page.locator("#openFilters").is_visible()
            assert not page.locator("[data-facet-panel='type']").is_visible()
            assert not page.locator("#globalSearch").is_visible()
            passed("默认仅显示搜索与独立筛选窗口入口，无重复搜索框")
            y = page.locator("#exBody tr[data-id]").first.bounding_box()["y"]
            assert y < 780, y
            page.locator("#openFilters").click()
            assert page.locator("#exFilterDialog").evaluate("el=>el.open")
            assert page.locator("#exFilterDialog").evaluate("el=>el.matches(':modal')")
            page.keyboard.press("Escape")
            assert not page.locator("#exFilterDialog").evaluate("el=>el.open")
            assert page.locator("#openFilters").evaluate("el=>el===document.activeElement")
            passed("独立筛选窗口可打开关闭，结果位置与焦点保留", first_row_y=round(y))

            page.locator("#openFilters").click()
            page.locator("[data-filter-tab='type']").click()
            page.locator("[data-facet-choice='type'][value='企业']").check()
            ready_query()
            assert "826" in page.locator("#exCount").inner_text()
            page.locator("#showFilterResults").click()
            assert "企业" in page.locator("#exCondition").inner_text()
            assert "1" in page.locator("#moreFilterCount").inner_text()
            assert "企业" in page.locator("#exCondition").inner_text()
            assert len(download_rows("#exportResults")) == 826
            passed("独立筛选窗口关闭后条件与导出保持生效", actual=826)

            go("#/explore?angle=all&ids=5775050", "#exCount")
            ready_query()
            first_id = page.locator("#exBody tr[data-id]").first.get_attribute("data-id")
            page.locator("#exBody tr[data-id]").first.click()
            page.wait_for_function("document.querySelector('#detailStatus').textContent.includes('已载入完整交付记录')")
            assert page.locator("#toggleReadRecord").inner_text() == "标为未读"
            page.keyboard.press("Escape")
            page.locator("#exRead").select_option("read")
            ready_query()
            assert {r["记录ID"] for r in download_rows("#exportResults")} == {first_id}
            page.locator("#exBody tr[data-id]").first.click()
            page.wait_for_function("document.querySelector('#detailStatus').textContent.includes('已载入完整交付记录')")
            page.locator("#toggleReadRecord").click()
            page.keyboard.press("Escape")
            ready_query()
            assert page.locator("#exportResults").is_disabled()
            passed("打开完整详情自动已读，支持改回未读与阅读状态筛选")

            page.locator("#exRead").select_option("unread")
            ready_query()
            unread_before = len(download_rows("#exportResults"))
            page.locator("#markResultsRead").click()
            page.wait_for_function("document.querySelector('#exCount').textContent.includes('筛选结果 0 条')")
            assert page.locator("#exportResults").is_disabled()
            page.locator("#exRead").select_option("read")
            ready_query()
            assert len(download_rows("#exportResults")) == unread_before
            passed("批量标记操作覆盖全部匹配记录并更新未读结果", marked=unread_before)

            go("#/watchlist", "#watchlistPicker")
            page.locator("[data-watch='5775050']").check()
            page.locator("[data-watch='1001140']").check()
            expected_total = sum(r["ktid"] in (5775050, 1001140) for _, r in ROWS)
            page.locator("#watchlistRead").select_option("all")
            exported = download_rows("#exportWatchlist")
            assert len(exported) == expected_total
            assert page.evaluate("JSON.parse(localStorage.getItem('zgclab.workspace.v1')).watchlist.length") == 2
            passed("关注机构可多选、保留记录与导出", actual=expected_total)

            go("#/workspace", "#backupWorkspace")
            with page.expect_download() as download:
                page.locator("#backupWorkspace").click()
            backup_path = Path(download.value.path())
            backup = json.loads(backup_path.read_text())
            assert len(backup["watchlist"]) == 2 and len(backup["read"]) == unread_before
            page.locator("#importWorkspace").set_input_files(backup_path)
            page.get_by_text("备份已合并导入", exact=True).wait_for()
            assert page.evaluate("JSON.parse(localStorage.getItem('zgclab.workspace.v1')).watchlist.length") == 2
            passed("工作台备份包含关注与已读状态，重复导入不重复")

            page.reload()
            page.locator("#accessForm").wait_for()
            assert page.evaluate("!window.ZGCLAB_META&&!sessionStorage.getItem('zgclab.access.key.v1')")
            unlock()
            go("#/watchlist", "#watchlistStats")
            assert "已关注 2 家" in page.locator("#watchlistSelected").inner_text()
            passed("刷新仍强制密码，解锁后关注和已读状态保留")

        if MODE in ("simulation", "live"):
            sim_meta = load(ROOT / "data/simulation/meta.js")
            simulated = [(a, r) for a in ("news", "clue", "social") for r in load(ROOT / f"data/simulation/{a}.js")]
            assert len(simulated) == 30000 and all(r.get("_simulation") and r["id"].startswith("sim-") for _, r in simulated)
            assert all(r["platform"] == "test" for a, r in simulated if a == "social")
            assert not ({r["id"] for _, r in simulated} & {r["id"] for _, r in ROWS})
            passed("三万条模拟数据与真实记录 ID 和存储分离", simulated=len(simulated), platform="test", version=sim_meta["version"])
            go("#/explore?angle=all", "#exCount")
            ready_query()
            assert not page.locator("#includeSimulation").is_checked()
            assert "6,989" in page.locator("#exCount").inner_text()
            page.locator("#includeSimulation").check()
            page.wait_for_function("document.querySelector('#exCount')?.textContent.includes('36,989')")
            assert "30,000" in page.locator("#simulationStatus").inner_text()
            passed("模拟开关默认关闭，开启后记录总量精确相加", real=6989, simulated=30000, combined=36989)

            cases = [
                {"angle":"social","platforms":"test","period":"7"},
                {"angle":"social","platforms":"test","ids":"1001140","like_countMin":"100","repost_countMin":"20"},
                {"angle":"clue","risks":"高","period":"7"},
                {"angle":"news","tags":"technology","period":"30"},
                {"angle":"social","platforms":"test","like_countMin":"100","like_countMax":"1000"},
                {"angle":"social","platforms":"test","like_countMin":"0","like_countMax":"0"},
                {"angle":"social","platforms":"test","engagementMin":"500"},
            ]
            for values in cases:
                from urllib.parse import urlencode
                go("#/explore?" + urlencode({**values,"sim":"1"}), "#exCount")
                ready_query()
                candidates = ROWS + simulated
                expected = []
                today = datetime.now(ZoneInfo("Asia/Shanghai")).date()
                for a, r in candidates:
                    if a != values["angle"]:continue
                    if values.get("platforms") and r.get("platform") != values["platforms"]:continue
                    if values.get("ids") and str(r["ktid"]) != values["ids"]:continue
                    if values.get("risks") and r.get("risk_level") != values["risks"]:continue
                    if values.get("tags") and r.get("tag") != values["tags"]:continue
                    if values.get("period"):
                        from datetime import timedelta
                        day=beijing_day(r.get("publish_time"))
                        if not day or not (today-timedelta(days=int(values["period"])-1)).isoformat() <= day <= today.isoformat():continue
                    nums={key:(float(r[key]) if r.get(key) not in (None,"") else None) for key in ("like_count","comment_count","repost_count")}
                    nums["engagement"]=sum(nums.values()) if all(v is not None for v in nums.values()) else None
                    match=True
                    for key, value in nums.items():
                        if key+"Min" in values and (value is None or value<float(values[key+"Min"])):match=False
                        if key+"Max" in values and (value is None or value>float(values[key+"Max"])):match=False
                    if match:expected.append(r["id"])
                assert expected, values
                exported=download_rows("#exportResults")
                assert {r["记录ID"] for r in exported} == set(expected), values
                assert all(r["数据性质"] == ("模拟数据" if r["记录ID"].startswith("sim-") else "真实交付数据") for r in exported)
                passed("模拟查询集合与独立计算一致", conditions=values, expected=len(expected), actual=len(exported))

            go("#/explore?angle=social&platforms=test&sim=1", "#exCount")
            ready_query()
            page.locator("#exBody tr[data-id]").first.click()
            page.wait_for_function("document.querySelector('#detailStatus').textContent.includes('已载入完整交付记录')")
            assert "模拟" in page.locator("#recordTitle").inner_text()
            detail_csv=download_rows("#downloadRecord")
            assert detail_csv[0]["数据性质"]=="模拟数据"
            page.keyboard.press("Escape")
            passed("模拟记录完整详情和单条导出明确标注")

            go("#/overview", "#overviewInstitutions")
            assert page.locator("[data-overview-total]").get_attribute("data-overview-total")=="36989"
            assert int(page.locator("[data-overview-angle='social'] .k-value").inner_text().replace(",",""))==11846
            passed("模拟开关贯穿全量总览与机构统计")
            page.reload()
            page.locator("#accessForm").wait_for()
            assert page.evaluate("!window.ZGCLAB_SIM_META && !window.ZGCLAB_META")
            unlock()
            page.wait_for_function("document.querySelector('[data-overview-total]')?.dataset.overviewTotal==='36989'")
            assert page.locator("#includeSimulation").is_checked()
            passed("带模拟参数的链接刷新仍要求密码，解锁后恢复测试模式")
            page.locator("#includeSimulation").uncheck()
            page.wait_for_function("document.querySelector('[data-overview-total]')?.dataset.overviewTotal==='6989'")
            go("#/explore?angle=social&platforms=test", "#exCount")
            ready_query()
            assert page.locator("#exportResults").is_disabled()
            assert "6,989" not in page.locator("#exCount").inner_text()
            passed("关闭模拟开关立即恢复真实数据，test 平台不再匹配")

        if MODE == "layout":
            for width in (360, 390, 768, 1024, 1440):
                page.set_viewport_size({"width": width, "height": 1000 if width >= 1024 else 844})
                for route, ready in [("overview", "#overviewInstitutions"), ("explore", "#exCount"), ("timeline", "#timelineRecords"), ("quality", "[data-quality]"), ("fulltext", "#fulltextQ"), ("watchlist", "#watchlistStats")]:
                    go("#/" + route, ready)
                    if route == "explore":
                        ready_query()
                    overflow = page.evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth})")
                    assert overflow["scroll"] <= width + 1, (width, route, overflow)
                    if width < 820:
                        assert page.locator(".mobile-nav").is_visible()
                        if route in ("timeline", "quality", "fulltext", "watchlist"):
                            page.locator(".mobile-more").evaluate("el=>{el.open=true}")
                            assert page.locator(f".mobile-more a[data-route='{route}']").is_visible()
                    else:
                        assert page.locator(f"#nav a[data-route='{route}']").is_visible()
                    if width in (390, 1440):
                        page.screenshot(path=str(OUT / f"{route}-{width}.png"), full_page=True)
                    passed("响应式布局与导航", width=width, route=route, document_width=overflow["scroll"])
                go("#/explore?angle=all", "#exCount")
                ready_query()
                page.locator("#openFilters").click()
                page.locator("[data-filter-tab='text']").click()
                assert page.evaluate("document.documentElement.scrollWidth<=innerWidth+1")
                page.keyboard.press("Escape")
                passed("独立筛选窗口不横向溢出", width=width)
            page.set_viewport_size({"width": 1440, "height": 1000})
            go("#/explore?angle=all", "#exCount")
            ready_query()
            page.locator("#openFilters").focus()
            page.keyboard.press("Enter")
            assert page.locator("#exFilterDialog").evaluate("el=>el.open")
            page.keyboard.press("Escape")
            assert not page.locator("#exFilterDialog").evaluate("el=>el.open")
            page.locator("#exQ").evaluate("el=>el.blur()")
            page.keyboard.press("/")
            assert page.locator("#exQ").evaluate("el=>el===document.activeElement")
            passed("筛选窗口键盘操作和斜杠聚焦搜索框")
            page.emulate_media(reduced_motion="reduce")
            assert page.evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches")
            passed("尊重系统减少动态效果设置")

        assert not errors, errors
        passed("未捕获到页面脚本异常", errors=errors)
        context.close()
        browser.close()
    report = {"round": MODE, "target": BASE, "tested_at": datetime.now(timezone.utc).isoformat(), "data_version": META["version"], "passed": len(checks), "checks": checks, "errors": errors}
    (OUT / "results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({"round": MODE, "passed": len(checks), "errors": errors}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    run()
