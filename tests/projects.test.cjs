const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const projects = require("../projects.js");
const core = require("../core.js");
const Q = require("../query.js");
const API = {
  META: { version: "data-version-1", angles: { news: { name: "新闻" }, clue: { name: "线索" }, social: { name: "社媒" } } },
  Q, CORE: core,
  titleOf: (angle, r) => r.title_cn ?? r.title ?? r.id,
  snippetOf: (angle, r) => r.summary_cn ?? r.summary ?? "",
  instName: (id) => "机构 " + String(id),
};
const entry = (id, more = {}, angle = "news") => ({ angle, r: { id, ktid: 0, title_cn: "标题 " + id, summary_cn: "摘要", url: "https://example.com/" + id, ...more } });
const workspace = () => ({ favorites: [{ angle: "news", id: "0", ktid: 0 }], queries: [{ hash: "/explore?q=test", name: "查询" }], read: { "key": "date" }, watchlist: [0], other: { keep: true } });

test("create, add, reload, and cross-project duplicate rules preserve all other workspace data", () => {
  const ws = workspace(), other = JSON.stringify(ws);
  const a = projects.createProject(ws, "研究 A", "说明"), b = projects.createProject(ws, "研究 B", "");
  assert.equal(a.items.length, 0);
  const added = projects.addToProject(ws, a.id, [entry(0), entry(0), entry("news-2")], API);
  assert.equal(added.added, 2); assert.equal(added.skipped, 1);
  assert.equal(a.items[0].id, "0"); assert.equal(a.items[0].ktid, "0");
  assert.equal(projects.addToProject(ws, a.id, [entry(0)], API).added, 0);
  assert.equal(projects.addToProject(ws, b.id, [entry(0)], API).added, 1);
  a.items[0].note = "批注"; a.items[0].excerpt = "重点摘录"; a.items[0].status = "adopted";
  const loaded = JSON.parse(JSON.stringify(ws));
  loaded.projects = projects.normalizeProjects(loaded.projects);
  assert.equal(loaded.projects[0].items[0].note, "批注");
  assert.equal(loaded.projects[0].items[0].status, "adopted");
  const { projects: ignored, ...rest } = ws; assert.equal(JSON.stringify(rest), other);
});

test("archive blocks additions, empty folders and all three angles round-trip", () => {
  const ws = workspace(), empty = projects.createProject(ws, "空专题", "空内容"), p = projects.createProject(ws, "综合", "");
  projects.addToProject(ws, p.id, [entry("news-1"), entry("clue-1", {}, "clue"), entry("social-1", {}, "social")], API);
  p.archived = true;
  assert.throws(() => projects.addToProject(ws, p.id, [entry("news-2")], API), /归档/);
  assert.equal(p.items.length, 3);
  const backup = projects.exportData(ws), dest = workspace();
  const result = projects.mergeBackup(backup.projects, dest);
  assert.equal(result.addedProjects, 2); assert.equal(result.addedItems, 3);
  assert.equal(dest.projects.find((p) => p.id === empty.id).items.length, 0);
  assert.equal(dest.projects[1].archived, true);
  assert.equal(projects.csvRows([empty])[0].length, projects.CSV_HEADERS.length);
  assert.match(projects.csvText([empty]), /空专题/);
});

test("selected report materials span all pages, respect ordering and include source/version references", () => {
  const ws = workspace(), p = projects.createProject(ws, "报告 # 研究", "范围 <script>");
  projects.addToProject(ws, p.id, Array.from({ length: 47 }, (_, n) => entry("news-" + n)), API);
  p.items[1].selected = false;
  p.items[46].note = "最后一条的批注";
  p.items[46].excerpt = "最后一条的摘录\n第二行";
  p.items[46].status = "verified";
  [p.items[0], p.items[46]] = [p.items[46], p.items[0]];
  const md = projects.reportText(p, { generatedAt: "2026-11-08T00:00:00Z", baseUrl: "https://example.org/research/#/projects" });
  assert.match(md, /46 条材料/); assert.match(md, /最后一条的批注/); assert.match(md, /> 最后一条的摘录\n> 第二行/);
  assert.match(md, /### 1\. 标题 news\\-46/); assert.match(md, /核查状态：已核对/);
  assert.match(md, /https:\/\/example.org\/research\/#\/record\/news\/news-46/);
  assert.match(md, /https:\/\/example.com\/news-46/); assert.match(md, /数据版本：data\\-version\\-1/);
  assert.equal((md.match(/^### /gm) || []).length, 46);
  assert.equal((md.match(/^\d+\. \[/gm) || []).length, 46);
  assert.doesNotMatch(md, /### \d+\. 标题 news\\-1\n/);
});

test("malicious text stays literal, unsafe links are stripped, CSV formulas are neutralized, zero is retained", () => {
  const ws = workspace(), p = projects.createProject(ws, '=HYPERLINK("https://bad")', '</textarea><img src=x onerror=alert(1)>');
  const title = '<img src=x onerror=alert(1)> [x](javascript:alert(1))';
  projects.addToProject(ws, p.id, [entry(0, { title_cn: title, summary_cn: 0, url: "javascript:alert(1)" })], API);
  const item = p.items[0]; item.note = "+SUM(1,2)"; item.excerpt = "</textarea><script>globalThis.pwned=1</script>";
  assert.equal(item.snippet, "0"); assert.equal(item.url, "");
  assert.equal(projects.safeUrl("data:text/html,hi"), ""); assert.equal(projects.safeUrl("file:///tmp/x"), "");
  assert.equal(projects.safeUrl("https://example.org/a"), "https://example.org/a");
  assert.doesNotMatch(projects.esc(title), /<img/);
  const md = projects.reportText(p); assert.doesNotMatch(md, /<script>|<img/); assert.match(md, /&lt;script&gt;/);
  assert.doesNotMatch(md, /\]\(javascript:/); assert.match(md, /原文：未提供/);
  const csv = projects.csvText([p]); assert.match(csv, /"'=HYPERLINK/); assert.match(csv, /"'\+SUM/);
  assert.equal(projects.csvRows([p])[0][6], "0"); assert.equal(projects.csvRows([p])[0][8], "0");
  const backup = JSON.parse(JSON.stringify(projects.exportData(ws)));
  assert.equal(projects.validateImport(backup)[0].items[0].title, title);
});

test("JSON merge skips identical imports, merges new materials, and preserves conflicting edits in a copy", () => {
  const source = workspace(), p = projects.createProject(source, "专题", "说明");
  projects.addToProject(source, p.id, [entry("news-1")], API); p.items[0].note = "原批注";
  const imported = projects.exportData(source), target = workspace();
  assert.equal(projects.mergeProjects(target, imported).addedProjects, 1);
  assert.equal(projects.mergeProjects(target, imported).addedProjects, 0);
  assert.equal(target.projects.length, 1);
  projects.addToProject(source, p.id, [entry("news-2")], API);
  assert.equal(projects.mergeProjects(target, projects.exportData(source)).addedItems, 1);
  assert.equal(target.projects[0].items.length, 2);
  target.projects[0].items[0].note = "本地不同批注";
  target.projects[0].report.markdown = "本地报告";
  const result = projects.mergeProjects(target, projects.exportData(source));
  assert.equal(result.conflictCopies, 1); assert.equal(target.projects.length, 2);
  assert.equal(target.projects[0].items[0].note, "本地不同批注"); assert.equal(target.projects[0].report.markdown, "本地报告");
  assert.equal(target.projects[1].items[0].note, "原批注"); assert.match(target.projects[1].name, /导入副本/);
  assert.equal(projects.mergeProjects(target, projects.exportData(source)).addedProjects, 0);
});

test("invalid or oversized imports fail atomically; unknown fields never pollute objects", () => {
  const source = workspace(), p = projects.createProject(source, "安全", "");
  projects.addToProject(source, p.id, [entry("news-1")], API);
  const good = projects.exportData(source), target = workspace();
  projects.mergeProjects(target, good);
  const before = JSON.stringify(target);
  for (const mutate of [
    (data) => data.projects[0].items.push({ angle: "invalid", id: "x" }),
    (data) => data.projects[0].items[0].status = "__proto__",
    (data) => data.projects[0].items[0].selected = "yes",
    (data) => data.projects[0].items[0].id = 'bad\"><img>',
    (data) => data.projects[0].name = "",
    (data) => data.projects[0].report.markdown = "x".repeat(projects.LIMITS.report + 1),
    (data) => data.schemaVersion = 999,
    (data) => data.projects.push(JSON.parse(JSON.stringify(data.projects[0]))),
  ]) {
    const data = structuredClone(good); mutate(data);
    assert.throws(() => projects.mergeProjects(target, data)); assert.equal(JSON.stringify(target), before);
  }
  const hostile = JSON.parse(JSON.stringify(good).replace('"name":"安全"', '"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"name":"安全"'));
  assert.equal(projects.validateImport(hostile)[0].polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(JSON.stringify(projects.validateImport(hostile)).includes('"__proto__"'), false);
});

test("actual delivered records from every angle add and survive a storage-shaped round trip", () => {
  const ws = workspace(), p = projects.createProject(ws, "真实快照", "");
  const context = { window: {} };
  for (const angle of ["news", "clue", "social"]) vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../data/" + angle + ".js"), "utf8"), context);
  const entries = ["news", "clue", "social"].flatMap((angle) => context.window["ZGCLAB_" + angle.toUpperCase()].slice(0, 30).map((r) => ({ angle, r })));
  assert.equal(projects.addToProject(ws, p.id, entries, API).added, 90);
  assert.equal(projects.addToProject(ws, p.id, entries, API).added, 0);
  const reload = JSON.parse(JSON.stringify(ws));
  assert.equal(projects.normalizeProjects(reload.projects)[0].items.length, 90);
  assert.equal((projects.reportText(reload.projects[0]).match(/^### /gm) || []).length, 90);
});


test("old workspace backups without projects are a no-op and invalid imports never initialize workspace", () => {
  const ws = workspace(), before = JSON.stringify(ws);
  assert.deepEqual(projects.mergeBackup(undefined, ws), { addedProjects: 0, addedItems: 0, conflictCopies: 0, skippedProjects: 0 });
  assert.deepEqual(projects.mergeBackup(null, ws), { addedProjects: 0, addedItems: 0, conflictCopies: 0, skippedProjects: 0 });
  assert.equal(JSON.stringify(ws), before);
  assert.throws(() => projects.mergeBackup("invalid", ws));
  assert.equal(JSON.stringify(ws), before);
});
