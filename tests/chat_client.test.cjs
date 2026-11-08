"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../service-client.js"), "utf8");
const reply = (status, data) => ({status, ok: status >= 200 && status < 300, json: async () => data});
function client(fetch, timer) {
  const window = {ZGCLAB_SERVICE_CONFIG: {baseUrl: "https://research.example"}};
  vm.runInNewContext(source, {window, fetch, URL, AbortController, DOMException, TypeError, setTimeout: timer || setTimeout, clearTimeout, Date, location: {origin: "https://site.example", href: "https://site.example/"}});
  return window.ZGCLAB_SERVICE_CLIENT;
}
function assistant() {
  const context = vm.createContext({window: {}, URL, URLSearchParams, DOMException, console});
  vm.runInContext(fs.readFileSync(require.resolve("../assistant.js"), "utf8"), context);
  return context.window.ZGCLAB_ASSISTANT;
}
const plain = value => JSON.parse(JSON.stringify(value));

test("pre-cancelled search/chat/session requests never authenticate or reach fetch", async () => {
  let requests = 0;
  const api = client(async () => {requests++; return reply(200, {token: "memory-token"});});
  api.setPassword("test-only-password");
  const controller = new AbortController(); controller.abort();
  for (const call of [() => api.chat({message: "资料"}, {signal: controller.signal}), () => api.search({query: "资料"}, {signal: controller.signal}), () => api.session({signal: controller.signal}), () => api.authenticate("test-only-password", {signal: controller.signal})]) {
    await assert.rejects(call, e => e.name === "AbortError");
  }
  assert.equal(requests, 0);
});

test("cancelled chat propagates AbortError while structured request fields pass through intact", async () => {
  let complete, transmitted, requestSignal;
  const pending = new Promise(resolve => {complete = resolve;});
  const api = client(async (url, options) => {
    if (url.endsWith("/session")) return reply(200, {token: "memory-token", expires_in: 1800});
    transmitted = JSON.parse(options.body); requestSignal = options.signal; complete();
    return new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")), {once: true}));
  });
  api.setPassword("test-only-password");
  const payload = {message: "比较CSIS与兰德", history: [{role: "user", content: "只看涉华资料"}], filters: {institution: [1001101], date_from: "2026-10-01", date_field: "published_at"}, expand: true};
  const controller = new AbortController();
  const request = api.chat(payload, {signal: controller.signal});
  await pending; controller.abort();
  await assert.rejects(request, e => e.name === "AbortError");
  assert.equal(requestSignal.aborted, true);
  assert.deepEqual(transmitted, payload);
});

test("chat timeout has TIMEOUT code and retains the established 125 second budget", async () => {
  const delays = [];
  const timer = (fn, ms) => {delays.push(ms); if (ms === 125000) {queueMicrotask(fn); return null;} return setTimeout(fn, ms);};
  const api = client(async (url, options) => {
    if (url.endsWith("/session")) return reply(200, {token: "memory-token", expires_in: 1800});
    return new Promise((resolve, reject) => { const abort = () => reject(new DOMException("timeout", "AbortError")); if (options.signal.aborted) abort(); else options.signal.addEventListener("abort", abort, {once: true}); });
  }, timer);
  api.setPassword("test-only-password");
  await assert.rejects(api.chat({message: "问题"}), e => e.code === "TIMEOUT" && e.name !== "AbortError");
  assert.ok(delays.includes(125000));
});

test("lock discards a late response and an in-flight 401 cannot reauthenticate after lock", async () => {
  let respond, started, logins = 0;
  const pending = new Promise(resolve => {started = resolve;});
  const api = client(async url => {
    if (url.endsWith("/session")) {logins++; return reply(200, {token: "memory-token", expires_in: 1800});}
    started(); return new Promise(resolve => {respond = resolve;});
  });
  api.setPassword("test-only-password");
  const request = api.chat({message: "问题"});
  await pending; api.clear(); respond(reply(401, {error: "expired"}));
  await assert.rejects(request, e => e.name === "AbortError");
  assert.equal(logins, 1);
  await assert.rejects(api.session(), e => e.status === 401);
});

test("invalid JSON has BAD_RESPONSE code; cancellation during login cannot store its response", async () => {
  const api = client(async url => url.endsWith("/session") ? reply(200, {token: "memory-token", expires_in: 1800}) : ({ok: true, status: 200, json: async () => {throw new SyntaxError("json");}}));
  api.setPassword("test-only-password");
  await assert.rejects(api.chat({message: "问题"}), e => e.code === "BAD_RESPONSE");
  let resolveLogin;
  const deferred = new Promise(resolve => {resolveLogin = resolve;});
  const another = client(async () => deferred), controller = new AbortController();
  const login = another.authenticate("test-only-password", {signal: controller.signal});
  controller.abort(); resolveLogin(reply(200, {token: "late-token", expires_in: 1800}));
  await assert.rejects(login, e => e.name === "AbortError");
  await assert.rejects(another.session(), e => e.status === 401);
});

function savedSession() {
  const items = Array.from({length: 40}, (_, i) => ({label: "C" + (i + 1), id: "news-" + (i + 1), angle: "news", ktid: "1000110", title: "标题 " + i, excerpt: "原始片段 <script>literal</script>", source_url: "https://example.org/" + i, paragraph: "7", paragraphScheme: "service_field_chunks_v1", field: "content_cn", version: "v1", score: i}));
  return {kind: "assistant", schema: 1, id: "as-analysis-session", title: "分析会话", created_at: "2026-11-09", updated_at: "2026-11-09", filters: {ids: ["1000110"], angle: "news", platforms: [], from: "2026-10-01", to: "2026-10-31"}, turns: [{id: "as-analysis-turn", question: "比较CSIS与兰德的涉华议题", answer: "依据来源的分析。[C40][A1]\n" + "答".repeat(14000), kind: "answer", model: "auto/deepseek-v4.1-flash", modelInfo: {id: "auto/deepseek-v4.1-flash", used: true, attempted: true}, answerFormat: "grounded_analysis", mode: "answered", source: "service", filters: {ids: ["1000110"], angle: "news", from: "2026-10-01", to: "2026-10-31"}, items, aggregates: [{label: "A1", scope: {source_version: "v1", date_field: "published_at", timezone: "Asia/Shanghai", filters: {institution: [1000110], angle: ["news"]}}, scoped: {total: 73, by_angle: {news: 73, clue: 0, social: 0}}, matched: {total: 42, by_angle: {news: 42, clue: 0, social: 0}}}], answerKind: "comparison", intent: {task: "comparison", topic: "中国", exact: [], excluded: ["军事"]}, timeScope: {mode: "snapshot_recent", asOf: "2026-11-09T09:00:00+08:00", from: "", to: "", timezone: "Asia/Shanghai", expressions: ["近期"]}, suggestions: [{kind: "question", label: "继续核对来源", question: "继续核对来源"}], suggestedQuestions: ["共同议题有哪些？"], sections: [{kind: "analysis", text: "两家机构关注点不同。", citations: ["C40"], quotes: [{citation_id: "C40", quote: "原始引文"}]}], analysisScope: {boundedSample: true, exhaustive: false, realtime: false, comparisonComplete: false, limitation: "只覆盖当前资料样本", scope: {source_version: "v1", date_field: "published_at", timezone: "Asia/Shanghai", filters: {ids: ["1000110"], angle: "news"}}}, token: "never-save-secret"}], password: "never-save-secret"};
}

test("analysis backup retains long answers, 40 citations, sections, filters and labels through exact export/import", () => {
  const ui = assistant(), incoming = savedSession();
  const validated = plain(ui.validateSessions([incoming]));
  const workspace = {favorites: [{id: "preserve"}], queries: [], other: {preserve: true}};
  assert.equal(ui.mergeBackup({chatSessions: validated}, workspace).added, 1);
  assert.deepEqual(plain(workspace.chatSessions), validated);
  const safe = workspace.chatSessions[0].turns[0];
  assert.equal(safe.answer, incoming.turns[0].answer);
  assert.equal(safe.items.length, 40);
  assert.equal(safe.items.at(-1).label, "C40");
  assert.equal(safe.sections[0].quotes[0].quote, "原始引文");
  assert.equal(safe.answerFormat, "grounded_analysis");
  assert.equal(safe.timeScope.asOf, "2026-11-09T09:00:00+08:00");
  assert.equal(safe.analysisScope.comparisonComplete, false);
  assert.equal(JSON.stringify(workspace).includes("never-save-secret"), false);
  assert.equal(workspace.other.preserve, true);
  assert.equal(ui.mergeBackup({chatSessions: validated}, workspace).skipped, 1);
});

test("unknown answer format and unused model remain distinct; oversized imports reject atomically", () => {
  const ui = assistant(), raw = savedSession(); raw.turns[0].answerFormat = "future_safe_format"; raw.turns[0].modelInfo.used = false;
  const result = ui.validateSessions([raw])[0].turns[0];
  assert.equal(result.answerFormat, "future_safe_format"); assert.equal(result.kind, "retrieval");
  const workspace = {favorites: [{id: "keep"}]}, before = JSON.stringify(workspace);
  for (const mutate of [s => {s.turns[0].answer = "x".repeat(30001);}, s => {s.turns[0].items = Array.from({length: 101}, () => s.turns[0].items[0]);}, s => {s.turns[0].question = "x".repeat(1201);}]) {
    const bad = savedSession(); mutate(bad);
    assert.throws(() => ui.mergeBackup({chatSessions: [bad]}, workspace));
    assert.equal(JSON.stringify(workspace), before);
  }
});


test("A2 analytics citations retain date/month scope without manufacturing A1 scoped totals", () => {
  const ui = assistant(), raw = savedSession();
  raw.turns[0].items[0].quotes = ["第一条原样来源摘录"];
  raw.turns[0].answer += "\n月度范围见[A2]";
  raw.turns[0].aggregates.push({citation_id:"A2",scope:{source_version:"v1",date_field:"published_at",timezone:"Asia/Shanghai",as_of:"2026-11-09T12:00:00+08:00",excluded_terms:["军事"],filters:{institution:[1000110],angle:["news"]}},matched:{total:42,by_angle:{news:42,clue:0,social:0}},date_range:{min:"2026-01-01",max:"2026-11-12",dated_records:40,undated_records:2,future_dated_records:1},by_month:[{month:"2026-09",count:20},{month:"2026-10",count:22}],latest_returned_date:"2026-09-25",method:"parameterized_readonly_sql_distinct_records"});
  const validated = plain(ui.validateSessions([raw]));
  const workspace = {favorites:[],queries:[]};
  ui.mergeBackup({chatSessions:validated},workspace);
  assert.deepEqual(plain(workspace.chatSessions),validated);
  const turn = workspace.chatSessions[0].turns[0], analytics = turn.aggregates[1];
  assert.equal(analytics.label,"A2");assert.equal(analytics.scoped.total,null);
  assert.equal(analytics.matched.total,42);assert.equal(analytics.dateRange.future,1);
  assert.deepEqual(plain(analytics.byMonth),[{month:"2026-09",count:20},{month:"2026-10",count:22}]);
  assert.equal(analytics.latestReturnedDate,"2026-09-25");assert.equal(analytics.scope.excluded[0],"军事");
  assert.equal(turn.items[0].quotes[0],"第一条原样来源摘录");
});


test("A2 shares/ranking/max_nonfuture survive exact backup roundtrip and discard unknown secrets", () => {
  const ui = assistant(), raw = savedSession();
  const shares = {denominator:42,basis:"matched_records_within_current_filters_and_terms",unit:"percent",by_institution:[{ktid:1000110,count:21,percent:50,token:"drop-secret-entry"}],by_platform:[{platform:"X",count:42,percent:100,password:"drop-secret-entry"}],by_angle:[{angle:"news",count:42,percent:100}],token:"drop-secret-shares"};
  const ranking = {dimension:"institution",order:"descending",metric:"matched_record_count",denominator:42,ties_included:true,entries:[{ktid:1000110,cn:"机构名称",count:21,percent:50,password:"drop-secret-entry"}],api_key:"drop-secret-ranking"};
  raw.turns[0].aggregates.push({citation_id:"A2",scope:{source_version:"v1",date_field:"published_at",filters:{}},matched:{total:42},date_range:{min:"2026-01-01",max:"2026-11-12",max_nonfuture:"2026-09-25",future_dated_records:1},method:"parameterized_readonly_sql_distinct_records",shares,ranking,authorization:"drop-secret-aggregate"});
  const normalized=plain(ui.validateSessions([raw]));
  const exported=JSON.parse(JSON.stringify({chatSessions:normalized})), workspace={favorites:[],queries:[]};
  ui.mergeBackup(exported,workspace);
  assert.deepEqual(plain(workspace.chatSessions),normalized);
  const a2=workspace.chatSessions[0].turns[0].aggregates[1];
  assert.equal(a2.dateRange.max,"2026-11-12");assert.equal(a2.dateRange.max_nonfuture,"2026-09-25");
  assert.equal(a2.ranking.dimension,"institution");assert.equal(a2.ranking.order,"descending");assert.equal(a2.ranking.denominator,42);assert.equal(a2.ranking.entries[0].ktid,"1000110");assert.equal(a2.ranking.entries[0].count,21);assert.equal(a2.ranking.entries[0].percent,50);
  assert.equal(a2.shares.denominator,42);assert.equal(a2.shares.by_platform[0].platform,"X");assert.equal(a2.shares.by_angle[0].angle,"news");
  assert.equal(JSON.stringify(workspace).includes("drop-secret"),false);
  assert.equal(a2.scoped.total,null);
  const invalid=savedSession(); invalid.turns[0].aggregates[0].ranking={dimension:"sql",order:"unsafe",denominator:-1,entries:[{count:-2,percent:120,token:"drop-secret"}]};
  const safe=ui.validateSessions([invalid])[0].turns[0].aggregates[0].ranking;
  assert.equal(safe.dimension,"");assert.equal(safe.order,"");assert.equal(safe.denominator,null);assert.equal(safe.entries[0].count,null);assert.equal(safe.entries[0].percent,null);
});
