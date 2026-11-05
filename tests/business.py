#!/usr/bin/env python3
"""Compare real UI results with an independent Python reference over delivery data."""
from __future__ import annotations

import csv
import io
import json
import os
import shutil
from functools import cmp_to_key
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlencode, urlsplit, parse_qs
from zoneinfo import ZoneInfo

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE = os.environ.get("ZGCLAB_TEST_URL", "http://127.0.0.1:8789/")
OUT = Path(os.environ.get("ZGCLAB_TEST_ARTIFACTS", "/home/ubuntu/log/zgclab-business-audit"))
OUT.mkdir(parents=True, exist_ok=True)
PASSWORD = (ROOT / ".runtime/pages-password").read_text().strip()


def load_js(path):
    return json.loads(path.read_text().split("=", 1)[1].strip().removesuffix(";"))


META = load_js(ROOT / "data/meta.js")
INSTITUTIONS = {str(i["ktid"]): i for i in META["institutions"]}
ROWS = [(angle, row) for angle in ("news", "clue", "social") for row in load_js(ROOT / f"data/{angle}.js")]


def number(value):
    if value is None or str(value).strip() == "":
        return None
    try:
        return float(value)
    except ValueError:
        return None


def day(value):
    if not value:
        return ""
    raw = str(value)
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return dt.astimezone(ZoneInfo("Asia/Shanghai")).date().isoformat() if dt.tzinfo else raw[:10]
    except ValueError:
        return ""


def reference(params):
    found = []
    today = datetime.now(ZoneInfo("Asia/Shanghai")).date()
    lower, upper = params.get("from", ""), params.get("to", "")
    if params.get("period") in ("today", "7", "30"):
        lower = (today - timedelta(days=int(params["period"]) - 1 if params["period"] != "today" else 0)).isoformat()
        upper = today.isoformat()
    for angle, row in ROWS:
        inst = INSTITUTIONS[str(row["ktid"])]
        if params.get("angle", "all") not in ("all", angle): continue
        if params.get("type") and inst["type"] != params["type"]: continue
        if params.get("country") and inst["country"] != params["country"]: continue
        if params.get("ids") and str(row["ktid"]) not in params["ids"].split(","): continue
        if params.get("platforms") and (angle != "social" or row.get("platform") not in params["platforms"].split(",")): continue
        if params.get("risks") and (angle != "clue" or row.get("risk_level", "未判定") not in params["risks"].split(",")): continue
        if params.get("tags") and (angle != "news" or row.get("tag", "未分类") not in params["tags"].split(",")): continue
        if params.get("language") and row.get("language") != params["language"]: continue
        if params.get("account") and (angle != "social" or f'{row.get("platform")}:{row.get("account_handle") or row.get("account_name") or ""}' != params["account"]): continue
        if params.get("translation") == "yes" and not row.get("_has_translation"): continue
        if params.get("translation") == "missing" and not (row.get("_has_original") and not row.get("_has_translation")): continue
        if params.get("media") and params["media"] not in row.get("_media_types", []): continue
        if params.get("missing") == "publish_time" and row.get("publish_time"): continue
        field = {"collected": "collected_time", "discovered": "discovery_time", "found": "founddate"}.get(params.get("dateField"), "publish_time")
        d = day(row.get(field))
        if (lower or upper) and (not d or lower and d < lower or upper and d > upper): continue
        values = {key: number(row.get(key)) for key in ("like_count", "comment_count", "repost_count", "view_count")}
        values["engagement"] = sum(values[key] for key in ("like_count", "comment_count", "repost_count")) if all(values[key] is not None for key in ("like_count", "comment_count", "repost_count")) else None
        valid = True
        for name, value in values.items():
            if name + "Min" in params and (angle != "social" or value is None or value < float(params[name+"Min"])): valid = False
            if name + "Max" in params and (angle != "social" or value is None or value > float(params[name+"Max"])): valid = False
        if params.get("sort") in values and (angle != "social" or values[params["sort"]] is None): valid = False
        if valid: found.append((angle, row, values))
    if params.get("sort") in ("like_count", "comment_count", "repost_count", "view_count", "engagement"):
        def compare(a, b):
            difference = b[2][params["sort"]] - a[2][params["sort"]]
            if difference: return difference
            def timestamp(row):
                if not row.get("publish_time"): return float("-inf")
                dt = datetime.fromisoformat(row["publish_time"].replace("Z", "+00:00"))
                return dt.replace(tzinfo=dt.tzinfo or ZoneInfo("Asia/Shanghai")).timestamp()
            left, right = timestamp(a[1]), timestamp(b[1])
            if left != right: return -1 if left > right else 1
            return (a[1]["id"] > b[1]["id"]) - (a[1]["id"] < b[1]["id"])
        found.sort(key=cmp_to_key(compare))
    if params.get("limit"): found = found[:int(params["limit"])]
    return [row["id"] for _, row, _ in found]


CASES = [
    ("Q02", "按企业类型", {"type": "企业"}),
    ("Q03", "按 NGO 类型", {"type": "NGO"}),
    ("Q04", "多选 FBI 与国土安全部", {"ids": "1000110,1001140"}),
    ("Q05", "国家和机构类型组合", {"country": "美国", "type": "政府部门"}),
    ("Q09", "机构与 X 平台", {"angle": "social", "ids": "1001140", "platforms": "X"}),
    ("Q10", "企业与多平台", {"angle": "social", "type": "企业", "platforms": "Facebook,LinkedIn"}),
    ("Q11", "真实近 7 天零结果", {"ids": "5775050", "period": "7"}),
    ("Q13", "政府近 30 天新闻", {"angle": "news", "type": "政府部门", "period": "30"}),
    ("Q15", "机构与含边界日期", {"angle": "clue", "ids": "1000490", "from": "2026-09-01", "to": "2026-09-30"}),
    ("Q17", "风险高或中", {"angle": "clue", "risks": "高,中"}),
    ("Q18", "NGO 与高风险与日期", {"angle": "clue", "type": "NGO", "risks": "高", "from": "2026-09-01", "to": "2026-09-30"}),
    ("Q19", "排除未判断风险", {"angle": "clue", "risks": "高,中,低"}),
    ("Q22", "新闻标签多选", {"angle": "news", "ids": "1000110", "tags": "security,policy"}),
    ("Q26", "平台与精确账号", {"angle": "social", "ids": "1001140", "platforms": "X", "account": "X:dhsgov"}),
    ("Q28", "NGO 英语内容", {"type": "NGO", "language": "en"}),
    ("Q29", "存在中文正文翻译", {"ids": "1000490", "translation": "yes"}),
    ("Q30", "机构图片内容", {"angle": "social", "ids": "1001140", "media": "image"}),
    ("Q31", "国土安全部 X 点赞至少 100", {"angle": "social", "ids": "1001140", "platforms": "X", "like_countMin": "100"}),
    ("Q32", "兰德转发门槛", {"angle": "social", "ids": "1000480", "repost_countMin": "50"}),
    ("Q33", "企业 Facebook 评论门槛", {"angle": "social", "type": "企业", "platforms": "Facebook", "comment_countMin": "20"}),
    ("Q34", "浏览量至少 10000", {"angle": "social", "platforms": "X", "view_countMin": "10000"}),
    ("Q35", "点赞上下限包含边界", {"angle": "social", "like_countMin": "100", "like_countMax": "1000"}),
    ("Q36", "点赞且转发门槛", {"angle": "social", "like_countMin": "100", "repost_countMin": "20"}),
    ("Q37", "点赞排行前 20", {"angle": "social", "ids": "1000480", "sort": "like_count", "limit": "20"}),
    ("Q40", "完整互动合计", {"angle": "social", "engagementMin": "500"}),
    ("Q46", "有原文缺翻译", {"translation": "missing"}),
    ("Q47", "缺少发布时间", {"missing": "publish_time"}),
]


def run():
    results, errors = [], []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path=shutil.which("google-chrome"), args=["--no-sandbox"])
        context = browser.new_context(viewport={"width": 1440, "height": 1000}, accept_downloads=True)
        page = context.new_page()
        page.set_default_timeout(30000)
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(BASE + "#/explore?angle=all")
        page.locator("#accessPassword").fill(PASSWORD)
        page.locator("#accessSubmit").click()
        page.wait_for_function("document.querySelector('#exCount')?.dataset.query")

        def query(params):
            page.evaluate("hash=>{location.hash=hash}", "#/explore?" + urlencode({"angle": "all", **params}))
            page.wait_for_function("document.querySelector('#exCount')?.dataset.query === location.hash.split('?')[1]")

        def export_ids():
            if page.locator("#exportResults").is_disabled(): return [], []
            with page.expect_download() as download:
                page.locator("#exportResults").click()
            rows = list(csv.DictReader(io.StringIO(Path(download.value.path()).read_text(encoding="utf-8-sig"))))
            return [row["记录ID"] for row in rows], rows

        for code, label, params in CASES:
            query(params)
            actual, exported = export_ids()
            expected = reference(params)
            assert set(actual) == set(expected), (code, label, len(actual), len(expected), set(actual)^set(expected))
            if params.get("sort") in ("like_count",):
                values=[number(row.get("点赞数 (like_count)")) for row in exported]
                assert values == sorted(values, reverse=True)
            if exported:
                assert all(row["数据版本"] == META["version"] and int(row["结果总数"]) == len(expected) for row in exported)
            result={"id":code,"task":label,"expected":len(expected),"actual":len(actual),"status":"PASS"}
            results.append(result)
            print(json.dumps(result,ensure_ascii=False),flush=True)

        # Exercise real controls, not just URL entry.
        query({"angle":"social"})
        page.locator("#openFilters").click()
        page.locator("[data-filter-tab='type']").click()
        page.locator("[data-facet-choice='type'][value='企业']").check()
        page.wait_for_function("location.hash.includes('type=') && document.querySelector('#exCount').dataset.query===location.hash.split('?')[1]")
        page.locator("[data-filter-tab='platforms']").click()
        page.locator("[data-facet-choice='platforms'][value='Facebook']").check()
        page.wait_for_function("location.hash.includes('platforms=Facebook') && document.querySelector('#exCount').dataset.query===location.hash.split('?')[1]")
        page.locator("#showFilterResults").click()
        assert set(export_ids()[0]) == set(reference({"angle":"social","type":"企业","platforms":"Facebook"}))
        results.append({"id":"UI","task":"实际下拉和勾选条件与导出一致","status":"PASS"})

        query({"angle":"social","ids":"1001140","platforms":"X","like_countMin":"100","sort":"like_count"})
        page.locator("#openFilters").click()
        page.locator("[data-filter-tab='metrics']").click()
        page.locator("input[data-bound='repost_countMin']").fill("20")
        page.wait_for_function("location.hash.includes('repost_countMin=20') && document.querySelector('#exCount').dataset.query===location.hash.split('?')[1]")
        page.locator("#showFilterResults").click()
        assert set(export_ids()[0])==set(reference({"angle":"social","ids":"1001140","platforms":"X","like_countMin":"100","repost_countMin":"20"}))

        # Analytical counts must reconcile to full filtered results.
        query({"angle":"social","ids":"1001140","platforms":"X"})
        page.locator(".query-analysis > summary").click()
        n=len(reference({"angle":"social","ids":"1001140","platforms":"X"}))
        platform=page.locator("[data-group='platform'][data-value='X']")
        assert int(platform.locator("b").inner_text().replace(",",""))==n
        platform.click()
        page.wait_for_function("document.querySelector('#exCount').dataset.query===location.hash.split('?')[1]")
        assert len(export_ids()[0])==n
        results.append({"id":"Q41/Q45","task":"分布计数与下钻结果一致","status":"PASS","actual":n})

        query({"angle":"clue","risks":"高"})
        page.locator(".query-analysis > summary").click()
        rank_counts=[int(text.replace(",","")) for text in page.locator("[data-group='institution'] b").all_inner_texts()]
        assert rank_counts==sorted(rank_counts,reverse=True)
        results.append({"id":"Q42","task":"高风险机构排行按真实计数排序","status":"PASS"})

        query({"angle":"social","ids":"1000110,1001140","platforms":"X"})
        page.locator(".query-analysis > summary").click()
        assert page.locator(".metric-comparison tbody tr").count()==2
        results.append({"id":"Q43","task":"多机构互动合计含有效样本数","status":"PASS"})
        assert "前期为 0" in page.locator(".period-comparison").inner_text()
        results.append({"id":"Q44","task":"近期对比零基数明确说明","status":"PASS"})

        query({"angle":"social","platforms":"X","like_countMin":"100","period":"7"})
        page.locator("#saveQuery").click()
        saved=page.evaluate("JSON.parse(localStorage.getItem('zgclab.workspace.v1')).queries[0]")
        assert "period=7" in saved["hash"] and "like_countMin=100" in saved["hash"] and "from=" not in saved["hash"]
        results.append({"id":"Q50","task":"滚动日期和数值条件完整保存","status":"PASS"})

        query({"angle":"clue","ids":"1000490","risks":"高"})
        page.locator("#createBrief").click()
        assert "原文：" in page.locator("#briefText").input_value()
        page.locator("#briefText").fill(page.locator("#briefText").input_value()+"\n人工补充：已审阅")
        with page.expect_download() as download: page.locator("#downloadBrief").click()
        assert "人工补充：已审阅" in Path(download.value.path()).read_text()
        results.append({"id":"A49","task":"筛选结果简报含证据链接且可编辑导出","status":"PASS"})

        # Neither normal reload nor an old stored key may unlock the next page.
        page.evaluate("sessionStorage.setItem('zgclab.access.key.v1','old-key'); localStorage.setItem('access-test','value')")
        for attempt in range(2):
            page.reload()
            page.locator("#accessForm").wait_for()
            assert page.evaluate("!window.ZGCLAB_META && !sessionStorage.getItem('zgclab.access.key.v1')")
            page.locator("#accessPassword").fill(PASSWORD)
            page.locator("#accessSubmit").click()
            page.wait_for_function("document.querySelector('#exCount')?.dataset.query")
        results.append({"id":"AUTH","task":"连续两次刷新都要求重新输入密码，旧密钥失效","status":"PASS"})
        page.screenshot(path=str(OUT/"query-desktop.png"),full_page=True)
        page.set_viewport_size({"width":390,"height":844})
        query({"angle":"social","platforms":"X","like_countMin":"100"})
        assert page.evaluate("document.documentElement.scrollWidth<=innerWidth+1")
        page.screenshot(path=str(OUT/"query-mobile.png"),full_page=True)
        assert not errors, errors
        context.close();browser.close()
    report={"passed":len(results),"errors":errors,"data_version":META["version"],"checks":results}
    (OUT/"results.json").write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)


if __name__=="__main__": run()
