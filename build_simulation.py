#!/usr/bin/env python3
"""Deterministic, labelled test fixtures beside the real snapshot, never in it."""
from __future__ import annotations
import csv
import hashlib
import json
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

HERE = Path(__file__).resolve().parent
OUT = HERE / "data/simulation"


def write_js(path, variable, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("window." + variable + "=" + json.dumps(value, ensure_ascii=False, separators=(",", ":")) + ";\n")


def main():
    meta = json.loads((HERE / "data/meta.js").read_text().split("=", 1)[1].strip().removesuffix(";"))
    today = datetime.now(ZoneInfo("Asia/Shanghai")).date()
    version = hashlib.sha256(("simulation-v1:" + str(today) + meta["version"]).encode()).hexdigest()[:16]
    summary = {"version": version, "generated_for": str(today), "real_version": meta["version"], "label": "模拟数据 · 仅供功能测试", "platform": "test", "totals": {}, "scenarios": ["近期7/30天", "多机构与类型", "高/中/低/无法判断", "标签", "数值边界与缺失", "译文与附件", "完整正文搜索"]}
    boundary = [0, 1, 20, 50, 99, 100, 101, 500, 999, 1000, 1001, 10000, 25000]
    for angle in ["news", "clue", "social"]:
        rows, details = [], []
        for index in range(10000):
            inst = meta["institutions"][index % len(meta["institutions"])]; scenario = index // len(meta["institutions"])
            when = datetime.combine(today - timedelta(days=scenario % 60), datetime.min.time(), tzinfo=ZoneInfo("Asia/Shanghai")) + timedelta(hours=8 + scenario % 12, minutes=index % 60)
            timestamp = when.isoformat(); missing = scenario % 23 == 22
            title = f"【模拟数据】{inst['cn']} 测试场景 {scenario+1:03d} · {angle}"
            body = f"【模拟数据，仅用于功能测试，不代表机构实际行为】{title}。主题：人工智能 AI 芯片 出口 policy security technology。测试编号 SIM-{angle}-{index+1:05d}。" * 8 + "完整正文末尾检索锚点 simulation_deep_evidence 测试证据。"
            translated = "【模拟译文】用于验证中文正文与翻译筛选；非真实机构声明。" + body if scenario % 5 else ""
            url = f"https://example.invalid/simulation/{angle}/{index+1}" if scenario % 19 else ""
            rec = {"id": f"sim-{angle}-{index+1:05d}", "ktid": inst["ktid"], "publish_time": None if missing else timestamp, "_simulation": True, "_simulation_version": version, "data_origin": "模拟数据", "_detail": index // 100, "_has_original": True, "_has_translation": bool(translated), "_media_types": ["attachment", ["image", "video", "pdf"][scenario % 3]] if scenario % 4 else [], "_month": timestamp[:7]}
            fields = {key: "" for key in meta["schemas"][angle]}
            fields.update({"id": rec["id"], "kt_id": str(inst["ktid"]), "publish_time": rec["publish_time"] or ""})
            if angle == "news":
                rec.update(title_cn=title, title_en=title, summary_cn="【模拟摘要】人工智能、芯片出口政策测试。", content_cn=translated[:1500], url=url, tag=["policy", "security", "technology", "other", "risk", "geopolitics"][scenario % 6], publish_source="test.example.invalid", founddate=timestamp, source="test_feed")
                fields.update(title_cn=title, title_en=title, summary_cn=rec["summary_cn"], content=body, content_cn=translated, url=url, tag=rec["tag"], publish_source=rec["publish_source"], founddate=timestamp, source=rec["source"])
            elif angle == "clue":
                rec.update(title=title, summary="【模拟线索】用于风险、时间与缺失值筛选。", original_url=url, risk_level=["高", "中", "低", "无法判断", ""][scenario % 5], risk_desc="【模拟风险描述】仅验证显示，不构成风险判断。", language=["en", "zh-Hans", "es"][scenario % 3], chinese_trans=translated[:1500], discovery_time=timestamp, publisher_website="https://example.invalid", key_words="AI 芯片 出口")
                rec.update(publish_channel="test_web", publisher_domain="test.example.invalid", publisher_type="test_publisher", publisher_cn_attitude=["无法判断", "中性", "复杂", "积极", "消极"][scenario % 5], publish_subject="【模拟主体】"+inst["cn"], related_subject="【模拟主体】"+inst["cn"], industry="模拟测试行业", source="test_clue")
                fields.update(clue_title=title, clue_summary=rec["summary"], original_content=body, chinese_trans=translated, original_url=url, risk_level=rec["risk_level"], risk_desc=rec["risk_desc"], language=rec["language"], discovery_time=timestamp, key_words=rec["key_words"])
                for key in ["publish_channel", "publisher_domain", "publisher_type", "publisher_cn_attitude", "publish_subject", "related_subject", "industry", "source"]:
                    fields[key] = rec[key]
            else:
                rec.update(title=title, platform="test", account_handle=f"test_{inst['ktid']}_{scenario % 3}", account_name="【模拟账号】"+inst["cn"], account_url="https://example.invalid/test", original_content=body[:1500], chinese_translation=translated[:1500], content_url=url, source_url=url, collected_time=timestamp, language=["en", "zh-Hans", "es"][scenario % 3], hashtags="#test #AI #simulation", content_type=["text", "image", "video"][scenario % 3])
                rec.update(keywords=json.dumps(["模拟测试", "AI", "芯片出口"], ensure_ascii=False), mentions="['test_account']", data_status="模拟新增", batch_no="test-batch-"+str(scenario % 3 + 1))
                for offset, key in enumerate(["like_count", "comment_count", "repost_count", "view_count"]):
                    rec[key] = None if (scenario + offset) % 17 == 16 else str(boundary[(scenario + offset * 3) % len(boundary)] * (10 if key == "view_count" else 1))
                fields.update({key: rec.get(key) or "" for key in meta["schemas"][angle] if key in rec})
                fields.update(original_content=body, chinese_translation=translated)
            if rec["_media_types"]:
                ext = {"image": "png", "video": "mp4", "pdf": "pdf"}[rec["_media_types"][1]]
                fields["report_path" if angle == "clue" else "media_urls"] = f"https://example.invalid/simulation/sample.{ext}"
            details.append({"id": rec["id"], "fields": fields, "data_origin": "模拟数据", "simulation_version": version})
            rows.append(rec)
        write_js(OUT / (angle+".js"), "ZGCLAB_SIM_"+angle.upper(), rows)
        for start in range(0, len(details), 100):
            write_js(OUT / "details" / version / f"{angle}-{start//100}.js", f"ZGCLAB_DETAILS['sim-{angle}-{start//100}']", details[start:start+100])
        source = OUT / "source" / (angle+".csv"); source.parent.mkdir(parents=True, exist_ok=True)
        with source.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=["snapshot_id", "data_origin", *meta["schemas"][angle]], extrasaction="ignore", lineterminator="\n")
            writer.writeheader()
            for detail in details: writer.writerow({**detail["fields"], "snapshot_id": detail["id"], "data_origin": "模拟数据"})
        summary["totals"][angle] = len(rows)
    write_js(OUT / "meta.js", "ZGCLAB_SIM_META", summary)
    (OUT / "README.md").write_text("# 模拟测试数据\n\n仅供功能验收，不代表真实机构行为。平台统一 test；记录 ID 以 sim- 开头。\n\nsource/ 保存源 CSV；news.js、clue.js、social.js 保存列表；details/ 保存完整字段。真实快照仍在上一级 data/ 与 data/details/，从不覆盖。\n\n使用 build_simulation.py 可按当天重新生成 30,000 条；打开网页“带模拟数据”开关后加载。日期基准见 meta.js，不自动伪装为实时数据。附件使用 example.invalid 测试地址，不能作为可访问证据。\n")
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__": main()
