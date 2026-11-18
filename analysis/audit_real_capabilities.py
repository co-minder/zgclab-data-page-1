#!/usr/bin/env python3
"""Profile only the real delivery; independently verify supported query examples."""
from __future__ import annotations
import argparse
from collections import Counter
from datetime import date, datetime, timedelta
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

parser = argparse.ArgumentParser()
parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
parser.add_argument("--as-of", type=date.fromisoformat, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
root, as_of = args.root, args.as_of


def load(path):
    return json.loads(path.read_text().split("=", 1)[1].strip().removesuffix(";"))


def day(value):
    if not value:
        return ""
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return dt.astimezone(ZoneInfo("Asia/Shanghai")).date().isoformat() if dt.tzinfo else value[:10]


def number(value):
    raw = str(value if value is not None else "").strip()
    return float(raw) if re.fullmatch(r"\d+(?:\.\d+)?", raw) else None


meta = load(root / "data/meta.js")
institutions = {str(i["ktid"]): i for i in meta["institutions"]}
rows = {a: load(root / f"data/{a}.js") for a in ("news", "clue", "social")}
entries = [(a, r) for a, group in rows.items() for r in group]
assert all(not r.get("_simulation") and not r["id"].startswith("sim-") for _, r in entries)
details = {a: [d["fields"] for p in (root / "data/details" / meta["version"]).glob(a + "-*.js") for d in load(p)] for a in rows}
evidence = {"as_of_beijing": str(as_of), "real_version": meta["version"], "source_package": meta["source_package"], "generated_at": meta["generated_at"], "simulation_included": False, "total": len(entries), "institution_types": dict(Counter(i["type"] for i in meta["institutions"])), "countries": dict(Counter(i["country"] for i in meta["institutions"])), "angles": {}}
for angle, group in rows.items():
    full = details[angle]
    assert len(group) == len(full) == len({r["id"] for r in group})
    dates = [day(r.get("publish_time")) for r in group if r.get("publish_time")]
    translation = {"news": "content_cn", "clue": "chinese_trans", "social": "chinese_translation"}[angle]
    field = {"count": len(group), "publication_provided": len(dates), "publication_missing": len(group) - len(dates), "publication_min_beijing": min(dates), "publication_max_beijing": max(dates), "publication_last7": sum(str(as_of - timedelta(days=6)) <= d <= str(as_of) for d in dates), "publication_last30": sum(str(as_of - timedelta(days=29)) <= d <= str(as_of) for d in dates), "translation_field_nonempty": sum(bool(r.get(translation)) for r in full), "translation_placeholder": sum(str(r.get(translation) or "").strip() == "无法翻译" for r in full), "field_nonempty": {k: sum(bool(str(r.get(k) or "").strip()) for r in full) for k in meta["schemas"][angle]}, "raw_dates": {k: {"provided": len(v), "min_beijing": min(v), "max_beijing": max(v)} for k in ["founddate", "discovery_time", "collected_time"] if (v := [day(r[k]) for r in group if r.get(k)])}}
    if angle == "news": field["tags"] = dict(Counter(r["tag"] for r in group))
    if angle == "clue":
        field["risks"] = dict(Counter(r["risk_level"] for r in group))
        field["stance"] = dict(Counter(r.get("publisher_cn_attitude") for r in full))
    if angle == "social":
        field["platforms"] = {}
        for platform in ("X", "Facebook", "LinkedIn"):
            subset = [r for r in group if r["platform"] == platform]
            field["platforms"][platform] = {"count": len(subset), "publication_provided": sum(bool(r.get("publish_time")) for r in subset), **{key: sum(number(r.get(key)) is not None for r in subset) for key in ["like_count", "comment_count", "repost_count", "view_count"]}}
        field["accounts"] = len({(r["platform"], r["account_handle"]) for r in group})
        field["complete_engagement"] = sum(all(number(r.get(key)) is not None for key in ["like_count", "comment_count", "repost_count"]) for r in group)
        field["post_types"] = dict(Counter(r["content_type"] for r in group))
        field["hashtags_provided"] = sum(bool(r.get("hashtags")) for r in group)
        field["direct_attachments_provided"] = sum(bool(r.get("attachment_urls")) for r in full)
    evidence["angles"][angle] = field

cases = [
    ("C01", "全量记录", {}),
    ("C02", "CSIS 全部记录", {"ids": "1000490"}),
    ("C03", "企业类记录", {"type": "企业"}),
    ("C04", "NGO 类记录", {"type": "NGO"}),
    ("C05", "FBI 与国土安全部", {"ids": "1000110,1001140"}),
    ("C06", "政府部门类记录", {"type": "政府部门"}),
    ("C07", "CSIS 官网线索", {"angle": "clue", "ids": "1000490"}),
    ("C08", "OpenAI 相关新闻", {"angle": "news", "ids": "5775050"}),
    ("C09", "国土安全部 X", {"angle": "social", "ids": "1001140", "platforms": "X"}),
    ("C10", "企业 Facebook 或 LinkedIn", {"angle": "social", "type": "企业", "platforms": "Facebook,LinkedIn"}),
    ("C11", "2026年9月社媒发布", {"angle": "social", "from": "2026-09-01", "to": "2026-09-30"}),
    ("C12", "全部近7天", {"period": "7"}),
    ("C13", "全部近30天", {"period": "30"}),
    ("C14", "全部高风险线索", {"angle": "clue", "risks": "高"}),
    ("C15", "CSIS 高风险", {"angle": "clue", "ids": "1000490", "risks": "高"}),
    ("C16", "高或中风险", {"angle": "clue", "risks": "高,中"}),
    ("C17", "OpenAI technology 新闻", {"angle": "news", "ids": "5775050", "tags": "technology"}),
    ("C18", "FBI security 或 policy 新闻", {"angle": "news", "ids": "1000110", "tags": "security,policy"}),
    ("C19", "国土安全部 X 精确账号 dhsgov", {"angle": "social", "ids": "1001140", "platforms": "X", "account": "X:dhsgov"}),
    ("C20", "国土安全部 X 点赞至少100", {"angle": "social", "ids": "1001140", "platforms": "X", "like_countMin": "100"}),
    ("C21", "X 浏览至少10000", {"angle": "social", "platforms": "X", "view_countMin": "10000"}),
    ("C22", "点赞100至1000", {"angle": "social", "like_countMin": "100", "like_countMax": "1000"}),
    ("C23", "点赞至少100且转发至少20", {"angle": "social", "like_countMin": "100", "repost_countMin": "20"}),
    ("C24", "完整互动合计至少500", {"angle": "social", "engagementMin": "500"}),
    ("C25", "缺少发布时间", {"missing": "publish_time"}),
    ("C26", "翻译字段为空", {"translation": "missing"}),
    ("C27", "Facebook 全部记录", {"angle": "social", "platforms": "Facebook"}),
    ("C28", "LinkedIn 全部记录", {"angle": "social", "platforms": "LinkedIn"}),
]


def reference(p):
    result = []
    lower, upper = p.get("from", ""), p.get("to", "")
    if p.get("period"):
        lower, upper = str(as_of - timedelta(days=int(p["period"]) - 1)), str(as_of)
    for angle, r in entries:
        inst = institutions[str(r["ktid"])]
        if p.get("angle") and p["angle"] != angle: continue
        if p.get("ids") and str(r["ktid"]) not in p["ids"].split(","): continue
        if p.get("type") and inst["type"] != p["type"]: continue
        if p.get("platforms") and (angle != "social" or r.get("platform") not in p["platforms"].split(",")): continue
        if p.get("risks") and (angle != "clue" or r.get("risk_level") not in p["risks"].split(",")): continue
        if p.get("tags") and (angle != "news" or r.get("tag") not in p["tags"].split(",")): continue
        if p.get("account") and (angle != "social" or f'{r.get("platform")}:{r.get("account_handle") or r.get("account_name") or ""}' != p["account"]): continue
        if lower or upper:
            d = day(r.get("publish_time"))
            if not d or lower and d < lower or upper and d > upper: continue
        if p.get("missing") and r.get("publish_time"): continue
        if p.get("translation") == "missing" and not (r.get("_has_original") and not r.get("_has_translation")): continue
        values = {k: number(r.get(k)) for k in ["like_count", "comment_count", "repost_count", "view_count"]}
        v = [values[k] for k in ["like_count", "comment_count", "repost_count"]]
        values["engagement"] = sum(v) if all(n is not None for n in v) else None
        if any(k + s in p and (angle != "social" or value is None or (value < float(p[k+s]) if s == "Min" else value > float(p[k+s]))) for k, value in values.items() for s in ["Min", "Max"]): continue
        result.append(r["id"])
    return sorted(result)


node_source = r"""const fs=require('fs'),path=require('path');const input=JSON.parse(fs.readFileSync(0,'utf8'));const Q=require(path.join(input.root,'query.js'));const load=p=>JSON.parse(fs.readFileSync(p,'utf8').split('=').slice(1).join('=').trim().replace(/;$/,''));const meta=load(path.join(input.root,'data/meta.js'));const entries=['news','clue','social'].flatMap(angle=>load(path.join(input.root,'data/'+angle+'.js')).map(r=>({angle,r})));console.log(JSON.stringify(input.cases.map(([id,label,p])=>({id,ids:Q.filter(entries,Q.parse(new URLSearchParams(p)),meta.institutions,new Date(input.as_of+'T12:00:00+08:00')).entries.map(e=>e.r.id).sort()}))));"""
result = subprocess.run(["node", "-e", node_source], input=json.dumps({"root": str(root.resolve()), "as_of": str(as_of), "cases": cases}), capture_output=True, text=True, check=True)
actual = {item["id"]: item["ids"] for item in json.loads(result.stdout)}
evidence["query_examples"] = []
for id, label, params in cases:
    expected = reference(params)
    assert expected == actual[id], (id, label)
    evidence["query_examples"].append({"id": id, "task": label, "conditions": params, "count": len(expected), "independent_match": True})
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(evidence, ensure_ascii=False, indent=2))
print(json.dumps({"as_of": str(as_of), "real_version": meta["version"], "total": len(entries), "examples_verified": len(cases), "simulation_included": False, "output": str(args.output)}, ensure_ascii=False))
for example in evidence["query_examples"]:
    print(example["id"], example["task"], example["count"], "MATCH")
