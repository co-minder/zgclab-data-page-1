#!/usr/bin/env python3
"""Compare categorical UI exports with independently parsed full delivery fields."""
from __future__ import annotations

import ast
import csv
import io
import json
import os
import re
import shutil
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit
from zoneinfo import ZoneInfo

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE = os.environ.get("ZGCLAB_TEST_URL", "http://127.0.0.1:8789/")
OUT = Path(os.environ.get("ZGCLAB_TEST_ARTIFACTS", "/home/ubuntu/log/zgclab-categorical-audit"))
OUT.mkdir(parents=True, exist_ok=True)
PASSWORD = (ROOT / ".runtime/pages-password").read_text().strip()
MISSING = "__field_missing__"
# This mapping and parser are independent of query.js and the generated UI.
FIELDS = {
    "sources": ("source", ("news", "clue")),
    "publishSources": ("publish_source", ("news",)),
    "channels": ("publish_channel", ("clue",)),
    "languages": ("language", ("clue", "social")),
    "publisherTypes": ("publisher_type", ("clue",)),
    "publisherDomains": ("publisher_domain", ("clue",)),
    "attitudes": ("publisher_cn_attitude", ("clue",)),
    "publishSubjects": ("publish_subject", ("clue",)),
    "relatedSubjects": ("related_subject", ("clue",)),
    "industries": ("industry", ("clue",)),
    "accountHandles": ("account_handle", ("social",)),
    "accountNames": ("account_name", ("social",)),
    "contentTypes": ("content_type", ("social",)),
    "hashtags": ("hashtags", ("social",)),
    "mentions": ("mentions", ("social",)),
    "keywords": ("keywords", ("social",)),
    "dataStates": ("data_status", ("social",)),
    "batches": ("batch_no", ("social",)),
}
TOKENS = {"hashtags", "mentions", "keywords"}


def load(path):
    return json.loads(path.read_text().split("=", 1)[1].strip().removesuffix(";"))


META = load(ROOT / "data/meta.js")
SIM = load(ROOT / "data/simulation/meta.js")
INST = {str(i["ktid"]): i for i in META["institutions"]}
REAL = [(a, r) for a in ("news", "clue", "social") for r in load(ROOT / f"data/{a}.js")]
SIMULATED = [(a, r) for a in ("news", "clue", "social") for r in load(ROOT / f"data/simulation/{a}.js")]
FULL = {}
for folder, version in ((ROOT / "data/details", META["version"]), (ROOT / "data/simulation/details", SIM["version"])):
    for path in (folder / version).glob("*.js"):
        for record in load(path):
            FULL[record["id"]] = record["fields"]


def norm(value, key=""):
    raw = unicodedata.normalize("NFKC", str(value)).lower().strip()
    return raw.lstrip("#" if key == "hashtags" else "@") if key in ("hashtags", "mentions", "accountHandles") else raw


def values(fields, key):
    raw = fields.get(FIELDS[key][0])
    if key not in TOKENS:
        return [str(raw).strip()] if raw is not None and str(raw).strip() else []
    if isinstance(raw, list):
        return [str(v).strip() for v in raw if isinstance(v, (str, int, float)) and str(v).strip()]
    text = str(raw or "").strip()
    if text.lower() in ("", "[]", "{}", "null", "none"):
        return []
    if text.startswith("["):
        try:
            parsed = json.loads(text)
        except ValueError:
            parsed = ast.literal_eval(text)
        assert isinstance(parsed, list), text
        return [str(v).strip() for v in parsed if str(v).strip()]
    return [v for v in re.split(r"[\s,，;；|]+", text) if v]


def selected(params, key):
    value = params.get(key, [])
    return value if isinstance(value, list) else [value]


def day(raw):
    if not raw:
        return ""
    dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    return dt.astimezone(ZoneInfo("Asia/Shanghai")).date().isoformat() if dt.tzinfo else raw[:10]


def reference(params):
    ids = set()
    for angle, row in REAL + (SIMULATED if params.get("sim") == "1" else []):
        institution = INST[str(row["ktid"])]
        if params.get("angle", "all") not in ("all", angle): continue
        if params.get("ids") and str(row["ktid"]) not in params["ids"].split(","): continue
        if params.get("type") and institution["type"] != params["type"]: continue
        if params.get("country") and institution["country"] != params["country"]: continue
        if params.get("platforms") and (angle != "social" or row.get("platform") not in params["platforms"].split(",")): continue
        if params.get("tags") and (angle != "news" or row.get("tag") not in params["tags"].split(",")): continue
        if params.get("risks") and (angle != "clue" or row.get("risk_level") not in params["risks"].split(",")): continue
        valid = True
        for key, (_, angles) in FIELDS.items():
            choices = selected(params, key)
            if key == "languages" and not choices and params.get("language"):
                choices = [params["language"]]
            if not choices: continue
            actual = {norm(value, key) for value in values(FULL[row["id"]], key)}
            if angle not in angles or not any((not actual) if value == MISSING else norm(value, key) in actual for value in choices):
                valid = False
                break
        if not valid: continue
        if params.get("from") or params.get("to"):
            field = {"collected": "collected_time", "discovered": "discovery_time", "found": "founddate"}.get(params.get("dateField"), "publish_time")
            date = day(row.get(field))
            if not date or params.get("from") and date < params["from"] or params.get("to") and date > params["to"]: continue
        for key in ("like_count", "comment_count", "repost_count", "view_count"):
            for suffix in ("Min", "Max"):
                if key + suffix in params:
                    raw = row.get(key)
                    if angle != "social" or raw in (None, "") or (float(raw) < float(params[key + suffix]) if suffix == "Min" else float(raw) > float(params[key + suffix])):
                        valid = False
        if valid: ids.add(row["id"])
    return ids


CASES = [
    ("采集来源 discovery", {"angle": "news", "sources": "Google News RSS discovery"}),
    ("采集来源 RSS 精确区分前缀", {"angle": "news", "sources": "Google News RSS"}),
    ("采集来源多选 OR", {"angle": "news", "sources": ["Google News RSS", "Google News RSS discovery"]}),
    ("新闻发布媒体", {"angle": "news", "publishSources": "csis.org"}),
    ("采集来源和发布媒体 AND", {"angle": "news", "sources": "Google News RSS discovery", "publishSources": "csis.org"}),
    ("机构 policy 标签和采集来源", {"angle": "news", "ids": "1000110", "tags": "policy", "sources": "Google News RSS discovery"}),
    ("官网渠道", {"angle": "clue", "channels": "official_web"}),
    ("官网语言地区代码", {"angle": "clue", "languages": "en-US"}),
    ("官网语言多选", {"angle": "clue", "languages": ["en", "en-US"]}),
    ("旧语言链接兼容", {"angle": "clue", "language": "en"}),
    ("发布者类型", {"angle": "clue", "publisherTypes": "government"}),
    ("发布者域名 dhs.gov", {"angle": "clue", "publisherDomains": "dhs.gov"}),
    ("对华态度无法判断", {"angle": "clue", "attitudes": "无法判断"}),
    ("对华态度消极", {"angle": "clue", "attitudes": "消极"}),
    ("域名语言态度渠道组合", {"angle": "clue", "publisherDomains": "dhs.gov", "languages": "en", "attitudes": "无法判断", "channels": "official_web"}),
    ("发布主体", {"angle": "clue", "publishSubjects": "战略与国际研究中心"}),
    ("关联主体", {"angle": "clue", "relatedSubjects": "兰德公司"}),
    ("所属行业", {"angle": "clue", "industries": "公共政策研究"}),
    ("官网采集来源", {"angle": "clue", "sources": "clue"}),
    ("原创帖子类型", {"angle": "social", "contentTypes": "post"}),
    ("转发帖子类型", {"angle": "social", "contentTypes": "repost"}),
    ("社媒语言", {"angle": "social", "languages": "en"}),
    ("Python 话题标签", {"angle": "social", "hashtags": "FBI"}),
    ("标签前缀和大小写", {"angle": "social", "hashtags": "#fbi"}),
    ("标签多选 OR", {"angle": "social", "hashtags": ["FBI", "ICYMI"]}),
    ("提及账号", {"angle": "social", "mentions": "@SecMullinDHS"}),
    ("JSON 关键词短语", {"angle": "social", "keywords": "deportation flights"}),
    ("空标签", {"angle": "social", "hashtags": MISSING}),
    ("空关键词数组", {"angle": "social", "keywords": MISSING}),
    ("社媒状态", {"angle": "social", "dataStates": "new"}),
    ("采集批次", {"angle": "social", "batches": "social-volume-20260918"}),
    ("标签机构平台类型日期 AND", {"angle": "social", "ids": "1000110", "platforms": "X", "contentTypes": "post", "hashtags": "FBI", "from": "2026-09-01", "to": "2026-09-30"}),
    ("模拟话题标签", {"angle": "social", "platforms": "test", "hashtags": "#test", "sim": "1"}),
    ("模拟提及与关键词组合", {"angle": "social", "platforms": "test", "mentions": "@test_account", "keywords": "芯片出口", "dataStates": "模拟新增", "sim": "1"}),
    ("模拟官网分类组合", {"angle": "clue", "channels": "test_web", "publisherDomains": "test.example.invalid", "publisherTypes": "test_publisher", "attitudes": "中性", "sim": "1"}),
    ("模拟新闻来源", {"angle": "news", "sources": "test_feed", "sim": "1"}),
]
# Use an actual status and a raw industry value containing punctuation when available.
CASES[29] = ("社媒状态", {"angle": "social", "dataStates": next(FULL[r["id"]]["data_status"] for a, r in REAL if a == "social" and FULL[r["id"]].get("data_status"))})
industry = next((FULL[r["id"]]["industry"] for a, r in REAL if a == "clue" and "," in FULL[r["id"]].get("industry", "")), None)
if industry:
    CASES.append(("行业原值含逗号", {"angle": "clue", "industries": industry}))
CASES.extend([
    ("账号 handle ArkansasState", {"angle": "social", "accountHandles": "ArkansasState"}),
    ("账号 handle 前缀与大小写", {"angle": "social", "accountHandles": "@arkansasstate"}),
    ("完整账号名称包含空格", {"angle": "social", "accountNames": "Arkansas State"}),
    ("handle 名称与平台组合", {"angle": "social", "accountHandles": "ArkansasState", "accountNames": "Arkansas State", "platforms": "X"}),
    ("账号 handle 多选", {"angle": "social", "accountHandles": ["ArkansasState", "FBI"]}),
    ("账号名称多选", {"angle": "social", "accountNames": ["Arkansas State", "FBI"]}),
    ("账号名称完整匹配不取部分词", {"angle": "social", "accountNames": "Arkansas"}),
    ("不相符的 handle 与名称零结果", {"angle": "social", "accountHandles": "ArkansasState", "accountNames": "FBI"}),
    ("账号与日期机构组合", {"angle": "social", "accountHandles": "ArkansasState", "ids": "1002550", "from": "2026-10-01", "to": "2026-10-31"}),
])
sim_account = next(r for a, r in SIMULATED if a == "social")
CASES.append(("模拟账号 handle 和名称", {"angle": "social", "platforms": "test", "accountHandles": sim_account["account_handle"], "accountNames": sim_account["account_name"], "sim": "1"}))


def run():
    checks, errors = [], []

    def passed(label, **evidence):
        entry = {"check": label, "status": "PASS", **evidence}
        checks.append(entry)
        print(json.dumps(entry, ensure_ascii=False), flush=True)

    for key, (_, angles) in FIELDS.items():
        relevant = [(a, r) for a, r in REAL + SIMULATED if a in angles]
        mismatches = [r["id"] for _, r in relevant if {norm(v, key) for v in values(r, key)} != {norm(v, key) for v in values(FULL[r["id"]], key)}]
        assert not mismatches, (key, mismatches[:10])
        passed("列表分类字段与完整交付字段一致", facet=key, records=len(relevant))

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path=shutil.which("google-chrome"), args=["--no-sandbox"])
        context = browser.new_context(viewport={"width": 1440, "height": 1000}, accept_downloads=True)
        page = context.new_page()
        page.set_default_timeout(int(os.environ.get("ZGCLAB_TEST_TIMEOUT_MS", "30000")))
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(BASE + "#/explore?angle=all")

        def unlock():
            page.locator("#accessPassword").fill(PASSWORD)
            page.locator("#accessSubmit").click()
            ready()

        def ready():
            try:
                page.wait_for_function("document.querySelector('#exCount')?.dataset.query===location.hash.split('?')[1] && !document.querySelector('#exError')?.textContent")
            except Exception:
                page.screenshot(path=str(OUT / "query-failure.png"), full_page=True)
                state = page.evaluate("({url:location.href,title:document.title,version:window.ZGCLAB_META?.version,count:document.querySelector('#exCount')?.textContent,error:document.querySelector('#exError')?.textContent,accessError:document.querySelector('#accessError')?.textContent})")
                (OUT / "failure.json").write_text(json.dumps({"state": state, "errors": errors}, ensure_ascii=False, indent=2))
                raise

        def query(params):
            if params.get("sim") != "1" and page.locator("#includeSimulation").is_checked():
                page.locator("#includeSimulation").uncheck()
                ready()
            page.evaluate("hash=>{location.hash=hash}", "#/explore?" + urlencode({"angle": "all", **params}, doseq=True))
            ready()

        def exported():
            if page.locator("#exFilterDialog").evaluate("el=>el.open"):
                page.locator("#showFilterResults").click()
            if page.locator("#exportResults").is_disabled(): return []
            with page.expect_download() as download:
                page.locator("#exportResults").click()
            return list(csv.DictReader(io.StringIO(Path(download.value.path()).read_text(encoding="utf-8-sig"))))

        def assert_ids(params):
            rows = exported()
            actual = {r["记录ID"] for r in rows}
            expected = reference(params)
            assert actual == expected, (params, len(actual), len(expected), list(actual ^ expected)[:10])
            assert len(rows) == len(actual)
            return len(actual)

        def panel(key):
            if not page.locator("#exFilterDialog").evaluate("el=>el.open"):
                page.locator("#openFilters").click()
            page.locator(f"[data-filter-tab='{key}']").click()
            locator = page.locator(f"[data-facet-panel='{key}']")
            locator.wait_for(state="visible")
            return locator

        unlock()
        assert not page.locator("#includeSimulation").is_checked()
        assert not page.locator("#exFilterDialog").evaluate("el=>el.open")
        passed("默认高级筛选收起，模拟数据关闭")

        timings = []
        for label, params in CASES:
            start = time.monotonic()
            query(params)
            count = assert_ids(params)
            elapsed = round(time.monotonic() - start, 3)
            timings.append(elapsed)
            passed(label, conditions=params, expected=count, actual=count, elapsed_seconds=elapsed)

        query({"angle": "news"})
        media = panel("publishSources")
        assert media.locator("[data-facet-choice]").count() == 30
        media.locator("[data-facet-more]").click()
        assert media.locator("[data-facet-choice]").count() == 90
        media.locator("[data-facet-search]").fill("csis.org")
        media.locator("input[value='csis.org']").check()
        ready()
        assert assert_ids({"angle": "news", "publishSources": "csis.org"}) == 167
        media = panel("publishSources")
        media.locator("[data-facet-search]").fill("no-such-publisher")
        assert media.locator("input[value='csis.org']").is_checked()
        passed("长选项列表渐进展开、搜索、选中项始终可见", initially=30, expanded=90)

        query({"angle": "news"})
        source = panel("sources")
        source.locator("input[value='Google News RSS']").check()
        ready()
        source.locator("input[value='Google News RSS discovery']").check()
        ready()
        n = assert_ids({"angle": "news", "sources": ["Google News RSS", "Google News RSS discovery"]})
        source = panel("sources")
        source.locator("input[value='Google News RSS']").uncheck()
        ready()
        assert assert_ids({"angle": "news", "sources": "Google News RSS discovery"}) == 1664
        passed("实际勾选来源多选 OR 与取消选择", union=n)

        query({"angle": "clue", "ids": "1001140"})
        domains = panel("publisherDomains")
        assert domains.locator("input[value='dhs.gov']").locator("..").locator("small").inner_text() == "3"
        domains.locator("input[value='dhs.gov']").check()
        ready()
        panel("attitudes").locator("input[value='无法判断']").check()
        ready()
        n = assert_ids({"angle": "clue", "ids": "1001140", "publisherDomains": "dhs.gov", "attitudes": "无法判断"})
        assert not page.locator("#exFilterDialog").evaluate("el=>el.open")
        assert "dhs.gov" in page.locator("#exCondition").inner_text()
        assert len(exported()) == n
        passed("域名态度联合筛选及折叠后条件、结果导出一致", actual=n)

        query({"angle": "social", "hashtags": "#fbi"})
        topics = panel("hashtags")
        topics.locator("[data-facet-search]").fill("no-such-hashtag")
        assert topics.locator("input[type='checkbox']:checked").count() == 1
        chosen = topics.locator("input[value='FBI']")
        # Clearing the last selection also removes it from this unmatched search.
        chosen.click()
        ready()
        assert "hashtags=" not in page.url
        assert assert_ids({"angle": "social"}) == 1846
        passed("归一化标签分享链接可见并可取消，恢复完整社媒结果")

        query({"angle": "social", "ids": "1000110"})
        topics = panel("hashtags")
        topics.locator("[data-facet-search]").fill("FBI")
        fbi = topics.locator("input[value='FBI']")
        expected_scope = len(reference({"angle": "social", "ids": "1000110", "hashtags": "FBI"}))
        assert int(fbi.locator("..").locator("small").inner_text().replace(",", "")) == expected_scope
        fbi.check()
        ready()
        panel("contentTypes").locator("input[value='post']").check()
        ready()
        n = assert_ids({"angle": "social", "ids": "1000110", "hashtags": "FBI", "contentTypes": "post"})
        passed("社媒标签搜索、机构范围计数与跨字段 AND", scope_count=expected_scope, actual=n)

        query({"angle": "social"})
        handles = panel("accountHandles")
        handles.locator("[data-facet-search]").fill("Arkansas")
        handle = handles.locator("input[value='ArkansasState']")
        assert handle.locator("..").locator("small").inner_text() == "1"
        handle.check()
        ready()
        names = panel("accountNames")
        names.locator("[data-facet-search]").fill("Arkansas State")
        names.locator("input[value='Arkansas State']").check()
        ready()
        account_params = {"angle": "social", "accountHandles": "ArkansasState", "accountNames": "Arkansas State"}
        assert assert_ids(account_params) == 1
        page.locator("#saveQuery").click()
        account_saved = page.evaluate("JSON.parse(localStorage.getItem('zgclab.workspace.v1')).queries[0]")
        account_qs = parse_qs(account_saved["hash"].split("?", 1)[1])
        assert account_qs["accountNames"] == ["Arkansas State"] and account_qs["accountHandles"] == ["ArkansasState"]
        page.reload()
        page.locator("#accessForm").wait_for()
        unlock()
        assert assert_ids(account_params) == 1
        page.locator("[data-remove-filter='accountHandles']").click()
        ready()
        assert "accountHandles=" not in page.url
        assert assert_ids({"angle": "social", "accountNames": "Arkansas State"}) == 1
        passed("账号 handle 名称可搜索多选组合、保存并单独移除", actual=1)

        account_context = {"angle": "social", "ids": "1002550", "platforms": "X", "from": "2026-10-01", "to": "2026-10-31"}
        for field, key, value in (("account_handle", "accountHandles", "ArkansasState"), ("account_name", "accountNames", "Arkansas State")):
            query(account_context)
            page.locator("#exBody tr[data-id]").first.click()
            page.wait_for_function("document.querySelector('#detailStatus')?.textContent.includes('已载入完整交付记录')")
            link = page.locator(f".field-filter-link[data-filter-field='{field}']")
            assert link.count() == 1
            target = parse_qs(link.get_attribute("href").split("?", 1)[1])
            for preserved in ("ids", "platforms", "from", "to"):
                assert target[preserved] == [account_context[preserved]], target
            assert target[key] == [value]
            link.click()
            page.locator(".modal").wait_for(state="detached")
            ready()
            assert assert_ids({**account_context, key: value}) == 1
            passed("详情账号字段筛选保留机构平台与日期", field=field, actual=1)

        # Detail links must preserve applicable context and also close on an identical hash.
        detail_params = {"angle": "social", "ids": "1000110", "hashtags": "FBI", "from": "2026-01-01", "to": "2026-09-30"}
        query(detail_params)
        page.locator("#exBody tr[data-id]").first.click()
        page.wait_for_function("document.querySelector('#detailStatus')?.textContent.includes('已载入完整交付记录')")
        link = page.locator(".field-filter-link[data-filter-field='hashtags'][data-filter-value='FBI']")
        assert link.count() == 1
        target = parse_qs(urlsplit(link.get_attribute("href")).fragment.split("?", 1)[1])
        assert target["ids"] == ["1000110"] and target["from"] == ["2026-01-01"] and target["to"] == ["2026-09-30"]
        link.click()
        page.locator(".modal").wait_for(state="detached")
        ready()
        assert_ids(detail_params)
        passed("详情标签筛选保留机构日期，相同链接也能关闭详情并返回结果")

        query({"angle": "clue", "ids": "1001140"})
        page.locator("#exBody tr[data-id]").first.click()
        page.wait_for_function("document.querySelector('#detailStatus')?.textContent.includes('已载入完整交付记录')")
        for field in ("publish_channel", "language", "publisher_domain", "publisher_cn_attitude", "publisher_type"):
            assert page.locator(f".field-filter-link[data-filter-field='{field}']").count() >= 1, field
        page.locator(".field-filter-link[data-filter-field='publisher_domain']").first.click()
        ready()
        assert_ids({"angle": "clue", "ids": "1001140", "publisherDomains": "dhs.gov"})
        passed("官网详情渠道、语言、域名、态度、类型均有筛选入口")

        page.evaluate("location.hash='#/institution/1001140?angle=clue'")
        page.locator(".rec[data-angle='clue']").first.wait_for()
        page.locator(".rec[data-angle='clue']").first.click()
        page.wait_for_function("document.querySelector('#detailStatus')?.textContent.includes('已载入完整交付记录')")
        href = page.locator(".field-filter-link[data-filter-field='publisher_domain']").first.get_attribute("href")
        assert parse_qs(href.split("?", 1)[1])["ids"] == ["1001140"]
        page.keyboard.press("Escape")
        passed("从机构详情按字段筛选会保留路径中的机构范围")

        saved_params = {"angle": "social", "hashtags": ["FBI", "ICYMI"], "mentions": "@SecMullinDHS"}
        query(saved_params)
        page.locator("#saveQuery").click()
        saved = page.evaluate("JSON.parse(localStorage.getItem('zgclab.workspace.v1')).queries[0]")
        assert parse_qs(saved["hash"].split("?", 1)[1])["hashtags"] == ["FBI", "ICYMI"]
        page.evaluate("location.hash='#'+JSON.parse(localStorage.getItem('zgclab.workspace.v1')).queries[0].hash")
        ready()
        assert_ids(saved_params)
        page.reload()
        page.locator("#accessForm").wait_for()
        assert page.evaluate("!window.ZGCLAB_META && !sessionStorage.getItem('zgclab.access.key.v1')")
        unlock()
        assert_ids(saved_params)
        passed("多值标签保存分享和刷新恢复，刷新仍要求密码")

        query({"angle": "social", "hashtags": "FBI", "like_countMin": "100", "sort": "like_count"})
        page.locator("#exTabs [data-angle='clue']").click()
        page.wait_for_function("new URLSearchParams(location.hash.split('?')[1]).get('angle')==='clue' && document.querySelector('#exCount')?.dataset.query===location.hash.split('?')[1]")
        ready()
        params = parse_qs(urlsplit(page.url).fragment.split("?", 1)[1])
        assert "hashtags" not in params and "like_countMin" not in params and "sort" not in params
        assert assert_ids({"angle": "clue"}) == 1468
        panel("publisherDomains")
        assert page.locator("[data-filter-tab='hashtags']").is_hidden()
        assert page.locator("[data-filter-tab='publisherDomains']").is_visible()
        page.locator("#showFilterResults").click()
        passed("切换角度清除不适用标签和互动门槛，显示对应分类")

        query({"angle": "social", "hashtags": "test", "sim": "1"})
        page.locator("#exBody tr[data-id]").first.click()
        page.wait_for_function("document.querySelector('#detailStatus')?.textContent.includes('已载入完整交付记录')")
        href = page.locator(".field-filter-link[data-filter-field='mentions']").first.get_attribute("href")
        assert parse_qs(href.split("?", 1)[1])["sim"] == ["1"]
        page.keyboard.press("Escape")
        page.locator("#includeSimulation").uncheck()
        ready()
        assert page.locator("#exportResults").is_disabled()
        assert not page.locator("#includeSimulation").is_checked()
        passed("模拟详情筛选链接保留开关，关闭后测试标签无真实命中")

        for width in (390, 768, 1440):
            page.set_viewport_size({"width": width, "height": 1000 if width == 1440 else 844})
            for angle, keys in (("news", ("sources", "publishSources")), ("clue", ("publisherDomains", "attitudes", "industries")), ("social", ("hashtags", "mentions", "keywords"))):
                query({"angle": angle})
                for key in keys: panel(key)
                assert page.evaluate("document.documentElement.scrollWidth<=innerWidth+1"), (angle, width)
                if width in (390, 1440):
                    page.screenshot(path=str(OUT / f"categorical-{angle}-{width}.png"), full_page=True)
                passed("展开分类筛选无横向溢出", angle=angle, width=width)
        assert not errors, errors
        passed("无页面脚本异常", errors=errors)
        context.close()
        browser.close()
    report = {"target": BASE, "tested_at": datetime.now(timezone.utc).isoformat(), "data_version": META["version"], "simulation_version": SIM["version"], "real_records": len(REAL), "simulation_records": len(SIMULATED), "passed": len(checks), "errors": errors, "maximum_query_and_export_seconds": max(timings), "checks": checks}
    (OUT / "results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({k: v for k, v in report.items() if k != "checks"}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    run()
