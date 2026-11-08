/* Research assistant UI. Evidence is displayed as data, never as instructions or HTML. */
(function () {
  "use strict";

  const ANGLES = ["news", "clue", "social"];
  const REQUESTED_MODEL = "DeepSeek V4.1 Flash";
  const MAX_TURNS = 12;
  const MAX_HISTORY_MESSAGES = 8;
  const MAX_QUERY = 1200;
  const MAX_SAVED_SESSIONS = 32;
  const MAX_EVIDENCE = 100;
  const LOCAL_LIMIT = 20;
  const ALIASES = [
    ["人工智能", "artificial intelligence", "AI"],
    ["网络安全", "cybersecurity", "cyber security"],
    ["国土安全", "homeland security", "DHS"],
    ["联邦调查局", "Federal Bureau of Investigation", "FBI"],
    ["战略与国际研究中心", "CSIS"],
    ["大西洋理事会", "Atlantic Council"],
    ["兰德", "RAND"],
    ["布鲁金斯", "Brookings"],
    ["中国", "China", "PRC"],
    ["对华", "China"],
    ["制裁", "sanctions"],
    ["台湾", "Taiwan"],
    ["军事", "military", "defense"],
    ["半导体", "semiconductor", "chips"],
  ];
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const text = (value, max = 30000) => typeof value === "string" || typeof value === "number" ? String(value).slice(0, max) : "";
  const norm = (value) => String(value || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  const list = (value) => [...new Set((Array.isArray(value) ? value : String(value || "").split(",")).map((v) => text(v, 150).trim()).filter(Boolean))];
  const validDay = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "") && !Number.isNaN(Date.parse(value + "T00:00:00Z")) && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
  const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const finite = (value) => value !== null && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
  const markdownText = (value) => text(value).replace(/[\\`*_{}\[\]<>()#!|]/g, "\\$&");
  const makeID = () => "as-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
  let disposeCurrent = null;

  function safeUrl(value) {
    try {
      const url = new URL(text(value, 3000));
      return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
    } catch (_) { return ""; }
  }

  function errorWith(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function abortError() { return new DOMException("请求已取消", "AbortError"); }

  function abortable(task, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(abortError()); return; }
      const aborted = () => reject(abortError());
      signal.addEventListener("abort", aborted, { once: true });
      Promise.resolve(task).then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
    });
  }

  function authenticationError(error) {
    return !!error && error.code !== "origin_forbidden" && ([401, 403].includes(Number(error.status)) || /AUTH|PASSWORD|UNAUTHORIZED|SESSION_EXPIRED/i.test(String(error.code || "")));
  }

  function passwordRequired(error) {
    return !!error && /PASSWORD_REQUIRED|MISSING_PASSWORD|PASSWORD_NEEDED|NO_PASSWORD|AUTHENTICATION_REQUIRED/i.test(String(error.code || ""));
  }

  function failureMessage(error) {
    if (error && error.code === "origin_forbidden") return "研究服务暂未允许当前网站来源，请联系管理员检查连接配置；本地索引仍可使用。";
    if (passwordRequired(error)) return "研究服务需要站点登录密码。可在本页登录后重试，密码仅用于当前浏览器会话。";
    if (authenticationError(error)) return "研究服务登录已失效。请重新连接，或输入站点密码后重试。";
    if (error && error.code === "HTTPS") return "研究服务地址需要使用 HTTPS。请由管理员检查服务配置后重新连接。";
    if (error && error.code === "TIMEOUT") return "研究服务响应超时，可重试或先查阅本地索引。";
    if (error && error.code === "UNCONFIGURED") return "尚未配置研究服务。当前可使用本地索引检索，资料对话需要连接研究服务。";
    if (error && (error.status === 429 || /RATE_LIMIT|RATE_LIMITED|BUSY|QUOTA/i.test(String(error.code || "")))) return "研究服务请求较多，请稍后重试。";
    if (error && error.code === "invalid_input") return "研究服务拒绝了当前查询参数，请调整问题或筛选后重试。";
    if (error && error.code === "snapshot_changed") return "研究服务资料版本刚更新，正在等待服务重新载入，可稍后重新连接。";
    if (error && error.code === "BAD_RESPONSE") return "研究服务返回了无法识别的数据，可重新连接后重试。";
    return "研究服务暂时无法连接，请检查网络或重新连接。当前可继续使用本地索引检索。";
  }

  function normalizeEvidence(raw, index) {
    raw = object(raw);
    const record = object(raw.r || raw.record);
    const id = text(raw.id || raw.record_id || raw.snapshot_id || record.id, 200);
    const inferred = id.match(/^(news|clue|social)-/);
    const angle = ANGLES.includes(raw.angle) ? raw.angle : ANGLES.includes(record.angle) ? record.angle : inferred ? inferred[1] : "";
    if (!id || /^sim-/i.test(id) || raw._simulation || record._simulation) return null;
    if ((raw.citation_id || raw.label) && !/^C\d{1,3}$/.test(raw.citation_id || raw.label)) return null;
    const paragraph = object(raw.paragraph);
    const paragraphValue = typeof raw.paragraph === "object" ? paragraph.label || paragraph.number || paragraph.index || paragraph.id : raw.paragraph;
    return {
      label: /^C\d{1,3}$/.test(raw.citation_id || raw.label || "") ? raw.citation_id || raw.label : "C" + (index + 1),
      id, angle,
      ktid: text(raw.ktid || record.ktid, 30),
      title: text(raw.title || raw.record_title || record.title_cn || record.title || id, 500),
      source_url: safeUrl(raw.source_url || raw.url || raw.original_url || record.source_url || record.url || record.original_url || record.content_url),
      excerpt: text(raw.excerpt || raw.snippet || paragraph.text || raw.text || raw.content, 5000),
      paragraph: text(paragraphValue, 200),
      paragraphScheme: text(raw.paragraph_scheme || raw.paragraphScheme, 100),
      field: text(raw.source_field || raw.field || paragraph.field, 100),
      version: text(raw.source_version || raw.version, 100),
      published: text(raw.published_original || raw.published_at || raw.published, 100),
      dateOrigin: text(raw.date_origin || raw.dateOrigin, 60),
      translation: text(raw.translation_status || raw.translation, 100),
      score: finite(raw.score),
      entry: null,
    };
  }

  function unwrap(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw errorWith("BAD_RESPONSE");
    if (value.data && typeof value.data === "object" && !value.answer && !value.results && !value.citations && !value.database && !value.model) return value.data;
    return value;
  }

  function expansionTerms(value) {
    const terms = Array.isArray(value) ? value : object(value).terms || object(value).added || [];
    return [...new Set((Array.isArray(terms) ? terms : []).map((term) => text(typeof term === "object" && term ? term.term || term.query || term.text : term, 120)).filter(Boolean))].slice(0, 30);
  }

  function coverageText(value) {
    if (typeof value === "string") return text(value, 900);
    const coverage = object(value);
    const parts = [];
    const count = finite(coverage.database_total ?? coverage.records ?? coverage.indexed_records ?? coverage.total_records ?? coverage.total);
    const version = text(coverage.source_version || coverage.version || coverage.data_version || coverage.snapshot_version, 100);
    const cutoff = text(coverage.cutoff || coverage.data_cutoff || coverage.date_max || coverage.to, 120);
    if (count !== null) parts.push("索引 " + count.toLocaleString("zh-CN") + " 条");
    if (version) parts.push("资料版本 " + version);
    if (finite(coverage.scoped_records) !== null) parts.push("结构化范围 " + Number(coverage.scoped_records).toLocaleString("zh-CN") + " 条");
    if (finite(coverage.matched_records) !== null) parts.push("规则命中 " + Number(coverage.matched_records).toLocaleString("zh-CN") + " 条");
    if (cutoff) parts.push("资料日期上限 " + cutoff);
    if (coverage.full_text === false || coverage.fulltext === false) parts.push("仅索引摘要与已载入字段，未覆盖全部正文");
    if (coverage.exhaustive === false || coverage.truncated || coverage.partial) parts.push("本次证据仅为部分样本");
    if (typeof coverage.note === "string") parts.push(text(coverage.note, 500));
    return parts.join(" · ");
  }

  function modelName(value) {
    return typeof value === "string" ? text(value, 140) : text(object(value).name || object(value).id || object(value).model || object(value).model_id, 140);
  }

  function serviceStatusModel(value) {
    const payload = unwrap(object(value));
    const database = object(payload.database || payload.db || payload.index);
    const llm = object(payload.llm || payload.model), snapshot = object(payload.snapshot);
    const databaseState = text(typeof payload.database === "string" ? payload.database : database.status || payload.database_status, 60);
    const state = text(llm.state || llm.status, 100);
    const unavailable = database.available === false || /^(error|unavailable|offline|missing)$/i.test(databaseState);
    const count = finite(object(payload.aggregates).total ?? snapshot.total ?? database.records);
    const actual = modelName(llm.model || llm.id || payload.model);
    const display = /(?:^|\/)deepseek-v4\.1-flash$/i.test(actual) ? REQUESTED_MODEL : actual;
    const modelAvailable = typeof llm.available === "boolean" ? llm.available : null;
    return { snapshot, count, databaseState, databaseUnavailable: unavailable, modelAvailable, modelState: state, model: actual, modelLabel: modelAvailable === true ? "模型可用：" + (display || "服务未报告名称") + (state ? " · " + state : "") : modelAvailable === false ? "模型暂不可用：" + (state || "服务未说明原因") : "模型状态尚未报告" + (display ? "（配置模型：" + display + "）" : ""), healthScope: text(llm.health_scope, 100) };
  }

  function normalizedModel(value) {
    const model = object(value);
    return { id: modelName(value), used: model.used === true, attempted: model.attempted === true, reason: text(model.reason, 100) };
  }

  function modelExplanation(value, purpose) {
    const model = normalizedModel(value);
    const name = model.id || "服务未报告模型";
    const reasons = { exact_database_aggregate: "使用数据库精确统计", expansion_disabled: "已关闭扩展", semantic_disabled: "已关闭模型理解", disabled: "已关闭模型理解", model_unreachable: "模型连接不可用", configuration_unavailable: "模型配置不可用", model_busy: "模型繁忙", model_timeout: "模型响应超时", no_results: "没有匹配资料", ungrounded_model_answer: "模型回答未通过证据校验", unsafe_model_answer: "模型回答未通过内容校验" };
    if (model.used) return "实际模型：" + name + (purpose === "search" ? " · 已用于理解检索问题；结果为数据库资料摘录。" : " · 已生成资料回答，请核对引用。");
    return (model.attempted ? "已尝试模型；当前展示" : "未调用大模型；当前展示") + (purpose === "database" ? "数据库精确统计。" : "数据库检索资料。") + (model.reason ? " 原因：" + (reasons[model.reason] || model.reason) : "");
  }

  function normalizeFilters(value) {
    const f = object(value);
    return { ids: list(f.ids || f.institution || f.institution_id || f.ktid).filter((id) => /^\d{1,15}$/.test(id)).slice(0, 20), angle: ANGLES.includes(f.angle) ? f.angle : Array.isArray(f.angle) && f.angle.length === 1 && ANGLES.includes(f.angle[0]) ? f.angle[0] : "all", platforms: list(f.platforms || f.platform).slice(0, 20), from: validDay(f.from || f.date_from) ? f.from || f.date_from : "", to: validDay(f.to || f.date_to) ? f.to || f.date_to : "" };
  }

  function countData(value) {
    const data = object(value);
    const count = (v) => Number.isSafeInteger(v) && v >= 0 ? v : null;
    return { total: count(data.total), by_angle: Object.fromEntries(ANGLES.map((angle) => [angle, count(object(data.by_angle)[angle])])), by_institution: (Array.isArray(data.by_institution) ? data.by_institution : []).slice(0, 20).map(object).map((item) => ({ ktid: text(item.ktid, 20), cn: text(item.cn, 200), count: count(item.count) })), by_platform: (Array.isArray(data.by_platform) ? data.by_platform : []).slice(0, 20).map(object).map((item) => ({ platform: text(item.platform, 100), count: count(item.count) })) };
  }

  function normalizeAggregate(raw, index) {
    raw = object(raw);
    const scope = object(raw.scope), sourceFilters = object(scope.filters);
    const label = raw.citation_id || raw.label || "A" + (index + 1);
    if (!/^A\d{1,3}$/.test(label)) return null;
    return { label, kind: "database_aggregate", scoped: countData(raw.scoped), matched: countData(raw.matched), scope: { source_version: text(scope.source_version, 100), date_field: ["published_at", "published_effective_at", "collected_at"].includes(scope.date_field) ? scope.date_field : "published_at", strategy: text(scope.strategy, 100), terms: expansionTerms(Array.isArray(scope.term_match) ? scope.term_match.flat() : scope.terms), filters: { ...normalizeFilters(sourceFilters), angles: list(sourceFilters.angles || sourceFilters.angle).filter((a) => ANGLES.includes(a)) }, timezone: text(scope.timezone || "Asia/Shanghai", 60), date_semantics: text(scope.date_semantics, 500) } };
  }

  function planTerms(value) {
    const plan = object(value);
    return expansionTerms([...(Array.isArray(plan.terms) ? plan.terms.flat() : []), ...(Array.isArray(plan.model_terms) ? plan.model_terms : []), ...(Array.isArray(object(plan.model).applied_groups) ? plan.model.applied_groups.flatMap((group) => Array.isArray(object(group).terms) ? group.terms : []) : []), ...(Array.isArray(plan.fuzzy_terms) ? plan.fuzzy_terms.map((item) => item && item.term) : [])]);
  }

  function sanitizedTurn(raw) {
    raw = object(raw);
    const model = normalizedModel(raw.modelInfo || raw.model);
    const kind = raw.kind === "database" || raw.mode === "database_answer" ? "database" : raw.kind === "answer" && model.used ? "answer" : "retrieval";
    return { id: /^as-[\w-]{1,100}$/.test(raw.id || "") ? raw.id : makeID(), question: text(raw.question, MAX_QUERY), answer: text(raw.answer, 12000), created_at: text(raw.created_at, 50), kind, model: model.id || text(raw.model, 140), modelInfo: model, mode: text(raw.mode, 100), answerFormat: ["verbatim_extracts", "database_aggregate", "retrieval_extracts"].includes(raw.answerFormat || raw.answer_format) ? raw.answerFormat || raw.answer_format : "", source: raw.source === "local" ? "local" : "service", coverage: text(raw.coverage, 900), query: text(raw.query, MAX_QUERY), expansions: expansionTerms(raw.expansions), requestedExpand: raw.requestedExpand !== false, requestedSemantic: raw.requestedSemantic !== false, filters: normalizeFilters(raw.filters), items: (Array.isArray(raw.items) ? raw.items : []).slice(0, 30).map(normalizeEvidence).filter(Boolean).map((item) => { const { entry, ...safe } = item; return safe; }), aggregates: (Array.isArray(raw.aggregates) ? raw.aggregates : []).slice(0, 5).map(normalizeAggregate).filter(Boolean) };
  }

  function validatedSessions(value) {
    if (!Array.isArray(value) || value.length > MAX_SAVED_SESSIONS) throw new Error("资料对话备份最多包含 32 个会话。");
    const ids = new Set();
    return value.map((raw) => {
      if (!raw || typeof raw !== "object" || raw.kind !== "assistant" || !/^as-[\w-]{1,130}$/.test(raw.id || "") || ids.has(raw.id) || !Array.isArray(raw.turns) || raw.turns.length > MAX_TURNS) throw new Error("资料对话备份格式不正确。");
      ids.add(raw.id);
      for (const turn of raw.turns) {
        if (!turn || !/^as-[\w-]{1,100}$/.test(turn.id || "") || typeof turn.question !== "string" || !turn.question.trim() || turn.question.length > MAX_QUERY || typeof turn.answer !== "string" || turn.answer.length > 12000 || !Array.isArray(turn.items) || turn.items.length > 30 || turn.aggregates && (!Array.isArray(turn.aggregates) || turn.aggregates.length > 5)) throw new Error("资料对话备份超出内容或引用限制。");
      }
      return { kind: "assistant", schema: 1, id: raw.id, title: text(raw.title, 70), created_at: text(raw.created_at, 50), updated_at: text(raw.updated_at, 50), filters: normalizeFilters(raw.filters), turns: raw.turns.map(sanitizedTurn) };
    });
  }

  function mergeBackup(parsed, workspace) {
    if (!parsed || parsed.chatSessions === undefined) return { added: 0, conflicts: 0, skipped: 0 };
    if (!workspace || typeof workspace !== "object" || Array.isArray(workspace)) throw new Error("工作台格式不正确。");
    const incoming = validatedSessions(parsed.chatSessions);
    if (workspace.chatSessions !== undefined && !Array.isArray(workspace.chatSessions)) throw new Error("当前工作台对话格式不正确，未覆盖。");
    const result = (workspace.chatSessions || []).slice(), byID = new Map(result.filter(Boolean).map((item) => [item.id, item]));
    const summary = { added: 0, conflicts: 0, skipped: 0 };
    const fingerprint = (item) => { const safe = { ...item, id: "" }; return JSON.stringify(safe); };
    for (const item of incoming) {
      let id = item.id;
      if (byID.has(id)) {
        let old;
        try { old = validatedSessions([byID.get(id)])[0]; } catch (_) { old = null; }
        if (old && fingerprint(old) === fingerprint(item)) { summary.skipped++; continue; }
        let hash = 2166136261;
        for (const char of fingerprint(item)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
        id = id.slice(0, 100) + "-import-" + hash.toString(16);
        if (byID.has(id)) { summary.skipped++; continue; }
        summary.conflicts++;
      }
      const copy = { ...item, id };
      result.push(copy); byID.set(id, copy); summary.added++;
    }
    // Never replace existing sessions or any unrelated workspace fields.
    if (result.filter((item) => item && item.kind === "assistant").length > MAX_SAVED_SESSIONS) throw new Error("合并后超过 32 个资料会话；请先导出并清理旧会话。");
    if (summary.added) workspace.chatSessions = result;
    return summary;
  }

  function inlineText(root, content, citations, activate) {
    const token = /(\[[CA]\d{1,3}\]|\*\*[^*\n]{1,400}\*\*|`[^`\n]{1,400}`)/g;
    let cursor = 0;
    for (const match of content.matchAll(token)) {
      root.appendChild(document.createTextNode(content.slice(cursor, match.index)));
      const value = match[0];
      if (/^\[[CA]/.test(value)) {
        const label = value.slice(1, -1);
        const evidence = citations.find((item) => item.label === label);
        const element = document.createElement(evidence ? "button" : "span");
        element.className = evidence ? "as-citation-ref" : "as-citation-missing";
        element.textContent = value;
        if (evidence) {
          element.type = "button";
          element.setAttribute("aria-label", "查看引用 " + label);
          element.onclick = () => activate(label);
        } else element.title = "服务未提供此引用的来源";
        root.appendChild(element);
      } else {
        const element = document.createElement(value.startsWith("**") ? "strong" : "code");
        element.textContent = value.startsWith("**") ? value.slice(2, -2) : value.slice(1, -1);
        root.appendChild(element);
      }
      cursor = match.index + value.length;
    }
    root.appendChild(document.createTextNode(content.slice(cursor)));
  }

  /* Only simple paragraphs, headings, lists, quotes and code are supported. No raw HTML or model links. */
  function renderMarkdown(root, content, citations, activate) {
    const lines = text(content).replace(/\r/g, "").split("\n");
    let paragraph = [], listElement = null, code = null;
    const flush = () => {
      if (!paragraph.length) return;
      const element = document.createElement("p");
      inlineText(element, paragraph.join("\n"), citations, activate);
      root.appendChild(element);
      paragraph = [];
    };
    for (const line of lines) {
      if (/^\s*```/.test(line)) {
        flush(); listElement = null;
        if (code) { root.appendChild(code); code = null; }
        else code = document.createElement("pre");
        continue;
      }
      if (code) { code.textContent += (code.textContent ? "\n" : "") + line; continue; }
      if (!line.trim()) { flush(); listElement = null; continue; }
      const heading = line.match(/^#{1,4}\s+(.+)$/);
      const item = line.match(/^\s*(?:([-*])|\d+[.)])\s+(.+)$/);
      const quote = line.match(/^>\s?(.*)$/);
      if (heading) {
        flush(); listElement = null;
        const element = document.createElement("h3"); inlineText(element, heading[1], citations, activate); root.appendChild(element);
      } else if (item) {
        flush();
        const kind = item[1] ? "UL" : "OL";
        if (!listElement || listElement.tagName !== kind) { listElement = document.createElement(kind.toLowerCase()); root.appendChild(listElement); }
        const element = document.createElement("li"); inlineText(element, item[2], citations, activate); listElement.appendChild(element);
      } else if (quote) {
        flush(); listElement = null;
        const element = document.createElement("blockquote"); inlineText(element, quote[1], citations, activate); root.appendChild(element);
      } else { listElement = null; paragraph.push(line); }
    }
    flush();
    if (code) root.appendChild(code);
  }

  window.ZGCLAB_ASSISTANT = async function (params, api) {
    if (disposeCurrent) disposeCurrent();
    params = params && typeof params.get === "function" ? params : new URLSearchParams(params || "");
    api = api || {};
    const view = api.view;
    if (!view) throw new Error("资料问答缺少 view 容器");
    const META = object(api.REAL_META || api.META || window.ZGCLAB_META);
    const workspace = object(api.workspace);
    const institutions = Array.isArray(META.institutions) ? META.institutions : [];
    const institutionIds = new Set(institutions.map((item) => String(item.ktid)));
    const ownController = new AbortController();
    const routeSignal = api.signal;
    const signal = ownController.signal;
    const fmt = typeof api.fmt === "function" ? api.fmt : (n) => Number(n).toLocaleString("zh-CN");
    const instName = (id) => typeof api.instName === "function" ? api.instName(Number(id)) : (institutions.find((item) => String(item.ktid) === String(id)) || {}).cn || String(id || "");
    const titleOf = (angle, record) => typeof api.titleOf === "function" ? api.titleOf(angle, record) : record.title_cn || record.title || record.account_name || record.id;
    const angleName = (angle) => text(object(object(META.angles)[angle]).name, 80) || angle || "角度未提供";
    const toast = (message) => { if (typeof api.showToast === "function") api.showToast(message); else if (live()) $("#asProgress").textContent = message; };
    const saveWorkspace = () => {
      if (typeof api.saveWorkspace !== "function") return false;
      try {
        const result = api.saveWorkspace();
        if (result && typeof result.then === "function") { result.then((saved) => storageNotice(saved !== false), () => storageNotice(false)); return null; }
        return result !== false;
      } catch (_) { return false; }
    };
    const parsed = api.Q && typeof api.Q.parse === "function" ? api.Q.parse(params) : {};
    const range = api.Q && typeof api.Q.dateRange === "function" ? api.Q.dateRange(parsed) : {};
    const filters = {
      ids: list(parsed.ids || params.get("ids") || params.get("ktid")).filter((id) => institutionIds.has(id)),
      angle: ANGLES.includes(parsed.angle || params.get("angle")) ? parsed.angle || params.get("angle") : "all",
      platforms: list(parsed.platforms || params.get("platforms")),
      from: validDay(range.from || params.get("from")) ? range.from || params.get("from") : "",
      to: validDay(range.to || params.get("to")) ? range.to || params.get("to") : "",
    };
    const state = {
      mode: ["chat", "dialogue"].includes(params.get("mode")) ? "chat" : "search",
      filters, expand: params.get("expand") !== "0", semantic: params.get("semantic") !== "0" && params.get("expand") !== "0", query: text(params.get("q") || params.get("query"), MAX_QUERY),
      turns: [], result: null, status: null, connection: "checking", error: "", busy: false,
      keep: object(workspace.assistantPreferences).keepHistory === true,
      sessionId: makeID(), createdAt: new Date().toISOString(), lastRequest: null,
    };
    let activeRequest = null, statusRequest = null, requestSerial = 0, statusSerial = 0;
    let entriesPromise = null, entryMap = new Map();
    let resolvedClient = api.serviceClient || window.ZGCLAB_SERVICE_CLIENT || null;
    const textCache = new WeakMap();

    function dispose() {
      ownController.abort();
      if (activeRequest) activeRequest.abort();
      if (statusRequest) statusRequest.abort();
      const dialog = view.querySelector("#asPasswordDialog");
      if (dialog && dialog.open) dialog.close();
      if (routeSignal) routeSignal.removeEventListener("abort", dispose);
      if (disposeCurrent === dispose) disposeCurrent = null;
    }
    disposeCurrent = dispose;
    if (routeSignal) {
      if (routeSignal.aborted) { dispose(); return; }
      routeSignal.addEventListener("abort", dispose, { once: true });
    }
    const live = () => !signal.aborted;
    const $ = (selector) => view.querySelector(selector);
    const options = (rows, selected) => rows.map(([value, label]) => `<option value="${esc(value)}"${String(value) === String(selected) ? " selected" : ""}>${esc(label)}</option>`).join("");
    const platforms = [...new Set([...Object.keys(object(object(META.stats).social).platforms || {}), ...filters.platforms])].sort();
    const dateMins = ANGLES.map((angle) => text(object(object(META.stats)[angle]).date_min, 20)).filter(Boolean).sort();
    const dateMaxs = ANGLES.map((angle) => text(object(object(META.stats)[angle]).date_max, 20)).filter(Boolean).sort();
    const snapshotRange = dateMins.length ? dateMins[0] + " 至 " + dateMaxs[dateMaxs.length - 1] : "日期范围未提供";

    view.innerHTML = `<section class="as-root" aria-labelledby="asHeading">
      <header class="page-head as-head"><div><div class="as-eyebrow">研究工作区 <span aria-hidden="true">/</span> 资料助手</div><h1 id="asHeading">资料问答</h1><p>从真实资料出发，查找证据，围绕引用继续研究。</p></div><div class="as-head-meta"><span class="as-snapshot">${esc(institutions.length)} 家机构 · 真实交付快照</span><a href="#/fulltext">完整正文检索 <span aria-hidden="true">↗</span></a></div></header>
      <div class="as-layout"><div class="as-main">
        <div class="as-workspace-head"><div class="as-modebar" role="tablist" aria-label="资料助手模式"><button type="button" id="asSearchTab" role="tab" aria-controls="asSearchPanel" data-as-mode="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>资料检索</button><button type="button" id="asChatTab" role="tab" aria-controls="asChatPanel" data-as-mode="chat"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-8 8H4l1.7-4.2A8 8 0 1 1 20 11.5Z"/><path d="M8 10h8M8 14h5"/></svg>资料对话</button></div><p class="as-intro" id="asModeHelp"></p></div>
        <details class="as-session-area" id="asSessionArea" hidden><summary>会话与保存 <span id="asSessionState">仅保留在本页</span></summary><div class="as-session-tools"><label class="as-check"><input id="asKeep" type="checkbox" ${state.keep ? "checked" : ""}>在本浏览器保存</label><label class="as-saved-label"><span class="as-sr-only">已保存会话</span><select id="asSessions" aria-label="打开已保存的会话"></select></label><button class="btn" type="button" id="asNew">新对话</button><button class="as-text-button" type="button" id="asClear">清空当前对话</button></div><p id="asStorageStatus" class="as-note" role="status"></p></details>
        <div class="as-reading" id="asReading"><div class="as-compose-dock" id="asComposeDock"><form id="asForm" class="as-composer"><div class="as-compose-label"><label for="asQuestion" id="asQuestionLabel">检索问题</label><span id="asQuestionLimit">最多 1200 字符</span></div><textarea id="asQuestion" name="question" rows="3" maxlength="1200" required placeholder="描述研究主题、机构或你想了解的问题…" aria-describedby="asKeyboardHelp asHistoryHelp asQuestionLimit">${esc(state.query)}</textarea><div class="as-compose-actions"><span id="asKeyboardHelp"><kbd>Enter</kbd> 发送 <span aria-hidden="true">·</span> Shift + Enter 换行</span><div><button class="btn" id="asCancel" type="button" hidden>取消请求</button><button class="btn primary" id="asSubmit" type="submit">检索资料</button></div></div></form><div class="as-progress" id="asProgress" role="status" aria-live="polite"></div><div class="as-error" id="asError" role="alert" hidden><p id="asErrorText"></p><div class="as-actions"><button class="btn" type="button" id="asRetry">重试请求</button><button class="btn" type="button" id="asUseLocal">使用本地索引检索</button></div></div></div>
        <section class="as-start" id="asWelcome" aria-labelledby="asWelcomeTitle"><div class="as-start-intro"><span class="as-start-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 4h6c1.2 0 2 .8 2 2v14c0-1.2-.8-2-2-2H4V4Zm16 0h-6c-1.2 0-2 .8-2 2v14c0-1.2.8-2 2-2h6V4Z"/><path d="M7 8h2m-2 4h2m6-4h2m-2 4h2"/></svg></span><div><h2 id="asWelcomeTitle">从一个研究问题开始</h2><p id="asWelcomeHelp">选择一个示例，或在上方描述你要查找的资料。</p></div></div><div class="as-examples" aria-label="中文问题示例">${[["主题探索", "人工智能安全", "有哪些关于人工智能安全的资料？"], ["定向查找", "国土安全与网络安全", "查找国土安全部的网络安全相关记录"], ["机构研究", "CSIS 对华议题", "CSIS 最近关注了哪些对华议题？"]].map(([label, title, q], i) => `<button type="button" data-as-example="${esc(q)}"><span class="as-example-category"><span>${esc(label)}</span><span aria-hidden="true">0${i + 1}</span></span><strong>${esc(title)}</strong><span class="as-example-question">${esc(q)}</span><span class="as-example-open" aria-hidden="true">使用此问题 <span>↗</span></span></button>`).join("")}</div><p class="as-start-footnote">每条结果保留命中片段、原始来源和可核对的引用。</p></section>
        <div class="as-output-tools" id="asOutputTools" hidden><span id="asOutputLabel">检索结果</span><div class="as-actions"><button class="btn" type="button" id="asCopy" disabled>复制 Markdown</button><button class="btn" type="button" id="asExport" disabled>导出 Markdown</button></div></div>
        <section id="asSearchPanel" role="tabpanel" aria-labelledby="asSearchTab"><div id="asSearchResults" class="as-results"></div></section><section id="asChatPanel" role="tabpanel" aria-labelledby="asChatTab" hidden><div id="asTranscript" class="as-transcript" aria-label="对话记录"></div></section></div>
      </div><aside class="as-sidebar" aria-label="资料范围与服务状态">
        <details class="as-card as-scope" id="asScope" open><summary class="as-scope-summary"><span class="as-scope-heading">资料范围 <span class="as-scope-badge" id="asScopeCount">全部</span></span><span class="as-scope-description" id="asFilterSummary"></span></summary><div class="as-scope-body"><div class="as-card-head"><span>限定本次检索与对话</span><button type="button" class="as-text-button" id="asResetFilters">重置</button></div><label class="as-field">采集角度<select id="asAngle">${options([["all", "全部角度"], ...ANGLES.map((angle) => [angle, angleName(angle)])], filters.angle)}</select></label>
        <details class="as-filter-disclosure" ${filters.ids.length ? "open" : ""}><summary>机构 <span id="asInstCount"></span></summary><div class="as-institution-options">${institutions.map((item) => `<label class="as-check"><input type="checkbox" data-as-inst="${esc(item.ktid)}" ${filters.ids.includes(String(item.ktid)) ? "checked" : ""}>${esc(item.cn)}</label>`).join("")}</div></details>
        <details class="as-filter-disclosure" ${filters.platforms.length ? "open" : ""}><summary>社媒平台 <span id="asPlatformCount"></span></summary><div class="as-platform-options">${platforms.map((platform) => `<label class="as-check"><input type="checkbox" data-as-platform="${esc(platform)}" ${filters.platforms.includes(platform) ? "checked" : ""}>${esc(platform)}</label>`).join("") || '<span class="as-note">快照未提供平台分类。</span>'}</div><p class="as-note">选择平台时，只匹配该平台的社媒记录。</p></details>
        <div class="as-date-fields"><label class="as-field">开始日期<input id="asFrom" type="date" value="${esc(filters.from)}"></label><label class="as-field">结束日期<input id="asTo" type="date" value="${esc(filters.to)}"></label></div><p class="as-note as-date-note">按发布时间筛选 · 北京时间<br>指定日期时排除缺少发布时间的记录。</p><div class="as-query-options"><h3>检索方式</h3><label class="as-check as-expand-choice"><input type="checkbox" id="asSemantic" ${state.semantic ? "checked" : ""}><span>模型理解问题<span class="as-check-description">默认使用 DeepSeek Flash，实际参与状态随结果展示。</span></span></label><label class="as-check as-expand-choice"><input type="checkbox" id="asExpand" ${state.expand ? "checked" : ""}><span>扩展相关词与近似词<span class="as-check-description">关闭后停用模型重写、近义词和近似词；支持撤回后重查。</span></span></label><label class="as-field as-limit-field">返回证据上限<select id="asLimit">${options([[10, "10 段"], [20, "20 段"], [30, "30 段"]], 20)}</select></label></div><p class="as-note" id="asImportedNote" hidden>已带入机构、角度、平台和日期。其他组合条件请返回数据浏览核对。</p></div></details>
        <section class="as-card as-service"><div class="as-card-head"><h2>连接状态</h2><button class="as-text-button" type="button" id="asReconnect">重新连接</button></div><div id="asServiceStatus" role="status" aria-live="polite"></div><button class="btn" type="button" id="asLogin" hidden>输入站点密码</button></section>
        <details class="as-card as-data-note"><summary>资料与引用说明</summary><div><p>资料版本 <b>${esc(META.version || "未提供")}</b><br>快照生成 ${esc(text(META.generated_at, 40) || "未提供")}<br>记录日期 ${esc(snapshotRange)}</p><p>服务端资料版本与截止信息会随结果展示；记录日期上限不代表已完整覆盖此前的公开信息。</p><p>引用是外部资料中的陈述，可能有遗漏或错误。请结合完整记录与原文核实。</p><p id="asHistoryHelp"></p><p>仅保存问题、回答和引用；共享设备使用后请清空。登录密码、令牌和模型密钥不会写入对话。</p><a href="#/workspace">管理工作台备份与导入 →</a></div></details>
      </aside></div><dialog class="as-password-dialog" id="asPasswordDialog" aria-labelledby="asPasswordHeading" aria-describedby="asPasswordHelp"><form id="asPasswordForm"><h2 id="asPasswordHeading">登录研究服务</h2><p class="as-note" id="asPasswordHelp">请输入站点访问密码。密码只保留在当前会话内存中，用于换取短期令牌。</p><label class="as-field">站点密码<input type="password" id="asServicePassword" required autocomplete="current-password" maxlength="256"></label><p id="asPasswordError" class="as-warning" role="alert" hidden></p><div class="as-actions"><button class="btn primary" type="submit" id="asPasswordSubmit">登录并重试</button><button class="btn" type="button" id="asPasswordCancel">取消</button></div></form></dialog></section>`;

    function recordUrl(item) {
      return item.entry ? "#/record/" + encodeURIComponent(item.entry.angle) + "/" + encodeURIComponent(item.entry.r.id) : "";
    }

    function absoluteRecordUrl(item) {
      const relative = recordUrl(item);
      return relative ? location.href.split("#")[0] + relative : "";
    }

    async function allEntries() {
      if (!entriesPromise) {
        if (typeof api.entriesFor !== "function") throw errorWith("INDEX", "本地索引接口不可用");
        entriesPromise = Promise.resolve(api.entriesFor("all")).then((rows) => {
          if (!Array.isArray(rows)) throw errorWith("INDEX");
          const real = rows.filter((entry) => entry && ANGLES.includes(entry.angle) && entry.r && !entry.r._simulation && !/^sim-/i.test(String(entry.r.id || "")));
          entryMap = new Map(real.map((entry) => [entry.angle + ":" + entry.r.id, entry]));
          return real;
        }).catch((error) => { entriesPromise = null; throw error; });
      }
      return entriesPromise;
    }

    async function verifyEvidence(items, requestSignal) {
      try { await abortable(allEntries(), requestSignal || signal); }
      catch (_) { /* Service evidence remains readable if the snapshot index failed to load. */ }
      if (requestSignal && requestSignal.aborted) throw abortError();
      for (const item of items) {
        item.entry = entryMap.get(item.angle + ":" + item.id) || null;
        if (item.entry) {
          item.title = text(titleOf(item.entry.angle, item.entry.r), 500);
          item.ktid = String(item.entry.r.ktid || "");
          const record = item.entry.r;
          item.source_url = safeUrl(record.source_url || record.content_url || record.original_url || record.url) || item.source_url;
        }
      }
      return items;
    }

    async function serviceClient(requestSignal) {
      if (!resolvedClient) resolvedClient = api.serviceClient || window.ZGCLAB_SERVICE_CLIENT || null;
      if (!resolvedClient && typeof api.serviceSession === "function") {
        const value = await abortable(api.serviceSession(), requestSignal);
        resolvedClient = object(value).client || null;
      }
      if (!resolvedClient) throw errorWith("UNCONFIGURED");
      return resolvedClient;
    }

    async function serviceRequest(path, body, requestSignal) {
      const client = await serviceClient(requestSignal);
      if (requestSignal.aborted || !live()) throw abortError();
      const name = { "/api/status": "status", "/api/search": "search", "/api/chat": "chat" }[path];
      let task;
      if (name && typeof client[name] === "function") task = body ? client[name](body, { signal: requestSignal }) : client[name]({ signal: requestSignal });
      else if (typeof client.request === "function") task = client.request(path, { method: body ? "POST" : "GET", body, signal: requestSignal });
      else throw errorWith("UNCONFIGURED");
      let payload = await abortable(task, requestSignal);
      if (payload && typeof payload.json === "function") {
        if (!payload.ok) throw errorWith([401, 403].includes(payload.status) ? "AUTH" : payload.status === 429 ? "RATE_LIMIT" : "SERVICE");
        payload = await abortable(payload.json(), requestSignal);
      }
      if (requestSignal.aborted || !live()) throw abortError();
      return unwrap(payload);
    }

    function updateServiceStatus() {
      if (!live()) return;
      const status = serviceStatusModel(state.status);
      const { snapshot, count, modelLabel } = status;
      const label = { checking: "正在连接研究服务…", connected: "研究服务已连接", offline: "研究服务未连接", auth: "研究服务需要重新登录" }[state.connection];
      $("#asServiceStatus").innerHTML = `<p class="as-connection ${state.connection === "connected" ? "is-connected" : ""}"><span aria-hidden="true"></span>${esc(label)}</p>${state.connection === "connected" ? `<p class="as-service-count">${esc(status.databaseUnavailable ? "资料库暂不可用" : count !== null ? fmt(count) + " 条真实记录可检索" : "资料库：" + (status.databaseState || "状态尚未返回"))}</p><p class="as-model-status ${status.modelAvailable === false ? "as-warning" : ""}">${esc(modelLabel)}</p>` : '<p class="as-note">本地资料索引可独立使用；不会生成模型回答。</p>'}<details class="as-service-details"><summary>服务与版本详情</summary><p class="as-note">${state.connection === "checking" ? "连接后展示指定模型与实际服务状态。" : "指定模型：" + REQUESTED_MODEL + "。实际模型以服务返回状态为准。"}</p>${state.connection === "connected" ? `<p class="as-note">${esc(coverageText(snapshot))}</p>${status.healthScope === "relay_health" ? '<p class="as-note">模型状态来自 relay 健康检查；本次是否实际使用以结果为准。</p>' : ""}${snapshot.ingested_at ? `<p class="as-note">入库时间 ${esc(snapshot.ingested_at)}</p>` : ""}${snapshot.source_generated_at ? `<p class="as-note">服务快照生成 ${esc(snapshot.source_generated_at)}</p>` : ""}` : ""}</details>`;
      $("#asReconnect").disabled = state.connection === "checking";
      $("#asLogin").hidden = state.connection !== "auth";
    }

    async function refreshStatus() {
      if (!live()) return;
      if (statusRequest) statusRequest.abort();
      const controller = new AbortController(); statusRequest = controller;
      const serial = ++statusSerial;
      let timedOut = false;
      const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
      state.connection = "checking"; updateServiceStatus();
      try {
        const payload = await serviceRequest("/api/status", null, controller.signal);
        if (!live() || serial !== statusSerial) return;
        state.status = payload; state.connection = "connected";
      } catch (error) {
        if (!live() || serial !== statusSerial) return;
        if (error.name === "AbortError" && !timedOut) return;
        state.connection = authenticationError(error) ? "auth" : "offline";
      } finally {
        window.clearTimeout(timeout);
        if (live() && serial === statusSerial) { statusRequest = null; updateServiceStatus(); }
      }
    }

    function readFilters() {
      state.filters.ids = [...view.querySelectorAll("[data-as-inst]:checked")].map((el) => el.dataset.asInst);
      state.filters.angle = $("#asAngle").value;
      state.filters.platforms = [...view.querySelectorAll("[data-as-platform]:checked")].map((el) => el.dataset.asPlatform);
      state.filters.from = $("#asFrom").value;
      state.filters.to = $("#asTo").value;
      state.expand = $("#asExpand").checked;
      if (!state.expand) $("#asSemantic").checked = false;
      $("#asSemantic").disabled = !state.expand;
      state.semantic = state.expand && $("#asSemantic").checked;
      updateFilterSummary();
      return JSON.parse(JSON.stringify(state.filters));
    }

    function updateFilterSummary() {
      const f = state.filters;
      const active = [f.ids.length > 0, f.angle !== "all", f.platforms.length > 0, !!(f.from || f.to)].filter(Boolean).length;
      $("#asScopeCount").textContent = active ? active + " 项限定" : "全部";
      $("#asScope").classList.toggle("has-filters", active > 0);
      $("#asInstCount").textContent = f.ids.length ? "已选 " + f.ids.length + " 家" : "全部";
      $("#asPlatformCount").textContent = f.platforms.length ? f.platforms.join("、") : "全部";
      $("#asFilterSummary").textContent = [f.ids.length ? f.ids.length + " 家机构" : "全部机构", f.angle === "all" ? "全部角度" : angleName(f.angle), f.platforms.length ? f.platforms.join("、") : "", f.from || f.to ? (f.from || "不限") + " 至 " + (f.to || "不限") : "全部日期"].filter(Boolean).join(" · ");
    }

    function filterBody(filtersValue) {
      const result = { date_field: "published_at" };
      if (filtersValue.ids.length) result.institution = filtersValue.ids.map(Number);
      if (ANGLES.includes(filtersValue.angle)) result.angle = [filtersValue.angle];
      if (filtersValue.platforms.length) result.platform = filtersValue.platforms;
      if (filtersValue.from) result.date_from = filtersValue.from;
      if (filtersValue.to) result.date_to = filtersValue.to;
      return result;
    }

    function synchronizeUrl() {
      const p = new URLSearchParams();
      p.set("mode", state.mode);
      const f = state.filters;
      if (f.angle !== "all") p.set("angle", f.angle);
      if (f.ids.length) p.set("ids", f.ids.join(","));
      if (f.platforms.length) p.set("platforms", f.platforms.join(","));
      if (f.from) p.set("from", f.from);
      if (f.to) p.set("to", f.to);
      if (!state.expand) p.set("expand", "0");
      if (!state.semantic) p.set("semantic", "0");
      if (state.mode === "search" && state.query) p.set("q", state.query);
      try { history.replaceState(null, "", "#/assistant?" + p.toString()); } catch (_) { /* Embedded previews may not allow history updates. */ }
    }

    function setMode(mode) {
      state.mode = mode;
      for (const name of ["search", "chat"]) {
        const tab = $(name === "search" ? "#asSearchTab" : "#asChatTab");
        tab.setAttribute("aria-selected", String(name === mode));
        tab.tabIndex = name === mode ? 0 : -1;
      }
      $("#asSearchPanel").hidden = mode !== "search";
      $("#asChatPanel").hidden = mode !== "chat";
      $("#asModeHelp").textContent = mode === "search" ? "描述主题，定位相关资料与原文片段。" : "围绕证据连续提问，逐条核对引用。";
      $("#asSessionArea").hidden = mode !== "chat";
      $("#asSemantic").closest("label").hidden = mode === "chat";
      $("#asQuestionLabel").textContent = mode === "search" ? "检索问题" : "研究问题或追问";
      $("#asSubmit").textContent = mode === "search" ? "检索资料" : "发送问题";
      $("#asHistoryHelp").textContent = mode === "chat" ? "最多发送最近 4 轮历史（合计不超过 12000 字符）；当前会话保留最近 12 轮。" : "仅查询真实资料，模拟记录不作为问答证据。";
      updateOutputButtons(); synchronizeUrl();
    }

    function setBusy(busy) {
      state.busy = busy;
      $("#asSubmit").disabled = busy;
      $("#asCancel").hidden = !busy;
      $("#asForm").setAttribute("aria-busy", String(busy));
      $("#asRetry").disabled = busy;
      $("#asUseLocal").disabled = busy;
      $("#asClear").disabled = busy;
      $("#asNew").disabled = busy;
      $("#asSessions").disabled = busy;
      view.querySelectorAll("[data-as-mode]").forEach((button) => { button.disabled = busy; });
      view.querySelectorAll("[data-as-withdraw]").forEach((button) => { button.disabled = busy; });
    }

    function showError(message) {
      state.error = message;
      $("#asError").hidden = !message;
      $("#asErrorText").textContent = message;
      $("#asRetry").hidden = !state.lastRequest;
      $("#asUseLocal").hidden = !state.lastRequest;
    }

    function localTerms(query, expand) {
      const normalized = norm(query);
      const stop = new Set(["the", "and", "for", "what", "which", "about", "with", "from", "recent", "有哪些", "相关", "资料", "记录", "最近", "关注", "问题", "查找", "请问", "关于"]);
      const cleaned = normalized.replace(/有哪些|有什么|帮我|查找|找出|查询|检索|请问|请|关于|相关|资料|记录|最近|关注了|哪些|的|了|吗|呢|议题/gu, " ");
      const words = [...new Set((cleaned.match(/[a-z0-9][a-z0-9_.-]*|[\u3400-\u9fff]+/g) || []).filter((word) => word.length >= 2 && !stop.has(word)))].slice(0, 25);
      const grams = [...new Set(words.filter((word) => /[\u3400-\u9fff]/.test(word) && word.length > 3).flatMap((word) => Array.from({ length: word.length - 1 }, (_, i) => word.slice(i, i + 2))))].slice(0, 40);
      const additions = expand ? [...new Set(ALIASES.filter((group) => group.some((term) => {
        const key = norm(term);
        return /^[a-z]{2,4}$/.test(key) ? new RegExp("(?:^|[^a-z])" + key + "(?:$|[^a-z])").test(normalized) : normalized.includes(key);
      })).flat().filter((term) => !normalized.includes(norm(term))))] : [];
      return { normalized, words, grams, additions, aliases: additions.map(norm) };
    }

    function recordText(entry) {
      if (!textCache.has(entry.r)) {
        const values = Object.entries(entry.r).filter(([key]) => !key.startsWith("_")).map(([, value]) => typeof value === "object" ? "" : String(value == null ? "" : value));
        const institution = institutions.find((item) => String(item.ktid) === String(entry.r.ktid)) || {};
        textCache.set(entry.r, norm(values.join(" ") + " " + (institution.cn || "") + " " + (institution.en || "")));
      }
      return textCache.get(entry.r);
    }

    function snippetFor(record, terms) {
      const values = [record.summary_cn, record.summary, record.chinese_translation, record.chinese_trans, record.content_cn, record.original_content, record.content].filter((value) => typeof value === "string" && value.trim());
      const keys = [...terms.words, ...terms.aliases, ...terms.grams];
      const value = values.find((candidate) => keys.some((key) => norm(candidate).includes(key))) || values[0] || "当前索引没有摘要，可打开完整记录查阅。";
      const normalized = norm(value);
      const positions = keys.map((key) => normalized.indexOf(key)).filter((position) => position >= 0);
      const start = Math.max(0, (positions.length ? Math.min(...positions) : 0) - 75);
      return (start ? "…" : "") + value.slice(start, start + 500) + (start + 500 < value.length ? "…" : "");
    }

    async function localSearch(request, requestSignal) {
      const rows = await abortable(allEntries(), requestSignal);
      if (requestSignal.aborted) throw abortError();
      const terms = localTerms(request.question, request.expand);
      const f = request.filters;
      const candidates = rows.filter(({ angle, r }) => {
        if (f.angle !== "all" && angle !== f.angle || f.ids.length && !f.ids.includes(String(r.ktid))) return false;
        if (f.platforms.length && (angle !== "social" || !f.platforms.includes(String(r.platform)))) return false;
        const day = api.Q && typeof api.Q.recordDay === "function" ? api.Q.recordDay(r.publish_time) : text(r.publish_time, 10);
        return !((f.from || f.to) && (!day || f.from && day < f.from || f.to && day > f.to));
      });
      const scored = [];
      for (let i = 0; i < candidates.length; i++) {
        if (requestSignal.aborted || !live()) throw abortError();
        const entry = candidates[i], haystack = recordText(entry), title = norm(titleOf(entry.angle, entry.r));
        const whole = terms.normalized.length > 1 && haystack.includes(terms.normalized);
        const hits = terms.words.filter((word) => haystack.includes(word));
        const aliasHits = terms.aliases.filter((word) => haystack.includes(word));
        const gramHits = terms.grams.filter((word) => haystack.includes(word));
        const approximate = request.expand && terms.grams.length >= 2 && gramHits.length >= Math.max(2, Math.ceil(terms.grams.length * 0.4));
        if (whole || hits.length || aliasHits.length || approximate) {
          const score = (whole ? 20 : 0) + hits.reduce((sum, word) => sum + (title.includes(word) ? 9 : 4), 0) + aliasHits.reduce((sum, word) => sum + (title.includes(word) ? 6 : 2), 0) + (approximate ? gramHits.length / Math.max(1, terms.grams.length) : 0);
          scored.push({ entry, score });
        }
        if (i && i % 350 === 0) await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
      scored.sort((a, b) => b.score - a.score || String(a.entry.r.id).localeCompare(String(b.entry.r.id)));
      const limit = request.limit || LOCAL_LIMIT;
      const items = scored.slice(0, limit).map(({ entry, score }, index) => {
        const record = entry.r;
        return { label: "C" + (index + 1), id: String(record.id), angle: entry.angle, ktid: String(record.ktid || ""), title: text(titleOf(entry.angle, record), 500), source_url: safeUrl(record.source_url || record.content_url || record.original_url || record.url), excerpt: snippetFor(record, terms), paragraph: "索引摘要（非完整正文段落）", field: "", score, entry };
      });
      return { items, total: scored.length, returned: items.length, limit, expansions: terms.additions, coverage: "本地快照 " + (META.version || "未提供版本") + " · 已检查 " + fmt(candidates.length) + " 条索引记录；未扫描全部完整正文。", source: "local", query: request.question, filters: request.filters, requestedExpand: request.expand, requestedSemantic: request.semantic, aggregates: [], modelInfo: { used: false, attempted: false } };
    }

    function buildHistory(replaceTurn) {
      const stop = replaceTurn ? state.turns.findIndex((turn) => turn.id === replaceTurn) : state.turns.length;
      const groups = [];
      for (const turn of state.turns.slice(0, stop < 0 ? state.turns.length : stop)) {
        const question = typeof turn.question === "string" ? turn.question.trim().slice(0, MAX_QUERY) : "";
        if (!question) continue;
        // User questions retain institution/topic context even after retrieval-only fallbacks.
        const messages = [{ role: "user", content: question }];
        if ((turn.kind === "answer" || turn.kind === "database") && typeof turn.answer === "string" && turn.answer.trim()) {
          messages.push({ role: "assistant", content: turn.answer.slice(0, 4000) });
        }
        groups.push(messages);
      }
      let count = groups.reduce((sum, group) => sum + group.length, 0);
      let chars = groups.flat().reduce((sum, message) => sum + message.content.length, 0);
      // Trim whole turns so the first retained message always belongs to its user question.
      while (groups.length && (count > MAX_HISTORY_MESSAGES || chars > 12000)) {
        const removed = groups.shift();
        count -= removed.length;
        chars -= removed.reduce((sum, message) => sum + message.content.length, 0);
      }
      return groups.flat();
    }

    async function remoteSearch(request, requestSignal) {
      const payload = await serviceRequest("/api/search", { query: request.question, filters: filterBody(request.filters), expand: request.expand, semantic: request.expand && request.semantic, limit: request.limit }, requestSignal);
      const rows = Array.isArray(payload.results) ? payload.results : null;
      if (!rows) throw errorWith("BAD_RESPONSE");
      const items = [...new Map(rows.slice(0, MAX_EVIDENCE).map(normalizeEvidence).filter(Boolean).map((item) => [item.label, item])).values()];
      await verifyEvidence(items, requestSignal);
      const aggregates = object(payload.aggregates), plan = object(payload.plan);
      return { items, total: finite(object(aggregates.matched).total ?? payload.total), returned: rows.length, returnedRecords: new Set(items.map((item) => item.id)).size, omitted: rows.length - items.length, limit: request.limit, expansions: planTerms(plan), coverage: coverageText(payload.coverage), source: "service", query: text(payload.query || request.question, MAX_QUERY), originalQuery: request.question, filters: request.filters, requestedExpand: request.expand, requestedSemantic: request.semantic, modelInfo: normalizedModel(payload.model || plan.model), strategy: text(plan.strategy, 100), modelQuery: text(plan.model_query || object(plan.model).rewritten_query, MAX_QUERY), aggregates: aggregates.scope ? [normalizeAggregate({ citation_id: "A1", ...aggregates }, 0)].filter(Boolean) : [] };
    }

    async function remoteChat(request, requestSignal) {
      const payload = await serviceRequest("/api/chat", { message: request.question, history: request.expand ? buildHistory(request.replaceTurn) : [], filters: filterBody(request.filters), expand: request.expand }, requestSignal);
      const rows = Array.isArray(payload.citations) ? payload.citations : Array.isArray(payload.results) ? payload.results : [];
      const items = [...new Map(rows.slice(0, MAX_EVIDENCE).map(normalizeEvidence).filter(Boolean).map((item) => [item.label, item])).values()];
      await verifyEvidence(items, requestSignal);
      const answer = text(payload.answer || payload.content), model = normalizedModel(payload.model);
      const mode = text(payload.state || payload.mode, 100), plan = object(payload.plan);
      if (!answer && !rows.length && payload.answer === undefined) throw errorWith("BAD_RESPONSE");
      const aggregates = (Array.isArray(payload.aggregate_citations) ? payload.aggregate_citations : []).slice(0, 5).map(normalizeAggregate).filter(Boolean);
      return { id: request.replaceTurn || makeID(), question: request.question, created_at: new Date().toISOString(), kind: mode === "database_answer" || model.reason === "exact_database_aggregate" ? "database" : model.used && mode === "answered" ? "answer" : "retrieval", answer, items, aggregates, model: model.id, modelInfo: model, mode, answerFormat: text(payload.answer_format, 60), source: "service", coverage: coverageText(payload.coverage), expansions: planTerms(plan), query: text(plan.model_query || object(plan.model).rewritten_query || payload.query, MAX_QUERY), filters: request.filters, requestedExpand: request.expand, requestedSemantic: request.semantic };
    }

    function countText(result) {
      const total = result.total === null || result.total === undefined ? "服务未提供总命中记录数" : "共 " + fmt(result.total) + " 条记录命中";
      const returned = result.returned === undefined ? result.items.length : result.returned;
      const distinct = result.returnedRecords ?? new Set(result.items.map((item) => item.id)).size;
      return total + " · 本次返回 " + fmt(returned) + " 段证据 / " + fmt(distinct) + " 条记录" + (result.limit ? " · 本次上限 " + fmt(result.limit) + " 段" : "") + (returned !== result.items.length ? " · 不展示模拟或无效记录，界面最多 100 段" : "");
    }

    function renderAggregates(parent, aggregates, scopeID) {
      for (const item of aggregates || []) {
        const article = document.createElement("article"); article.className = "as-aggregate as-evidence"; article.tabIndex = -1; article.dataset.asCitation = item.label;
        article.id = "as-aggregate-" + scopeID + "-" + item.label;
        const scope = item.scope, filters = scope.filters;
        const filterLabel = [filters.ids.length ? filters.ids.map(instName).join("、") : "全部机构", filters.angles && filters.angles.length ? filters.angles.map(angleName).join("、") : "全部角度", filters.platforms.length ? filters.platforms.join("、") : "全部平台", (filters.from || "不限") + " 至 " + (filters.to || "不限")].join(" · ");
        const count = (value) => value === null ? "未提供" : fmt(value);
        article.innerHTML = `<div class="as-evidence-top"><b class="as-evidence-label">[${esc(item.label)}]</b><span>数据库精确统计</span><span class="as-aggregate-tag">真实记录去重</span></div><div class="as-aggregate-overview"><div><span>检索规则命中</span><strong>${count(item.matched.total)} <small>条</small></strong></div><div><span>结构化筛选范围</span><strong>${count(item.scoped.total)} <small>条</small></strong></div></div><p class="as-note as-aggregate-boundary">仅覆盖已入库快照；不以返回段落估算，不代表全网数量或实时覆盖。</p><details class="as-aggregate-details"><summary>查看统计口径与角度分布</summary><h3>按真实记录去重计数</h3><p class="as-note">结构化筛选范围：${esc(filterLabel)}</p><p class="as-note">资料版本 ${esc(scope.source_version || "未提供")} · 时间字段 ${esc(scope.date_field)} · ${esc(scope.timezone || "Asia/Shanghai")}</p><div class="as-aggregate-table"><table><caption>范围总数与按检索规则命中数；均不以返回段落数量估算</caption><thead><tr><th scope="col">口径</th><th scope="col">全部</th>${ANGLES.map((angle) => `<th scope="col">${esc(angleName(angle))}</th>`).join("")}</tr></thead><tbody>${[["结构化范围", item.scoped], ["检索规则命中", item.matched]].map(([label, value]) => `<tr><th scope="row">${label}</th><td>${count(value.total)}</td>${ANGLES.map((angle) => `<td>${count(value.by_angle[angle])}</td>`).join("")}</tr>`).join("")}</tbody></table></div><p class="as-note">检索规则 ${esc(scope.strategy || "未提供")}；检索词 ${esc(scope.terms.join("、") || "无额外关键词")}</p></details>`;
        const params = new URLSearchParams(); params.set("angle", filters.angle);
        if (filters.ids.length) params.set("ids", filters.ids.join(","));
        if (filters.platforms.length) params.set("platforms", filters.platforms.join(","));
        if (filters.from) params.set("from", filters.from);
        if (filters.to) params.set("to", filters.to);
        const link = document.createElement("a"); link.href = "#/explore?" + params; link.textContent = "在数据浏览查看结构化范围 →"; article.appendChild(link);
        if (scope.date_field !== "published_at" || filters.angles && filters.angles.length > 1) { const note = document.createElement("p"); note.className = "as-warning"; note.textContent = "此链接只带入数据浏览支持的条件；多角度、服务日期口径和关键词规则请以上方统计说明为准。"; article.appendChild(note); }
        if (item.matched.by_institution.length || item.matched.by_platform.length) {
          const details = document.createElement("details"), summary = document.createElement("summary"); summary.textContent = "查看命中记录的机构与平台分布"; details.appendChild(summary);
          const paragraph = document.createElement("p"); paragraph.className = "as-note"; paragraph.textContent = item.matched.by_institution.map((row) => (row.cn || instName(row.ktid)) + " " + count(row.count) + " 条").join("；") + "。平台：" + item.matched.by_platform.map((row) => (row.platform || "未标注") + " " + count(row.count) + " 条").join("；"); details.appendChild(paragraph); article.appendChild(details);
        }
        parent.appendChild(article);
      }
    }

    function renderExpansions(parent, value, request, replaceTurn) {
      if (!value.length && !request.expand && !request.semantic) return;
      const container = document.createElement("div"); container.className = "as-expansions";
      const label = document.createElement("span"); label.textContent = "本次检索词 / 扩展与近似词"; container.appendChild(label);
      for (const term of value) { const chip = document.createElement("span"); chip.className = "as-term"; chip.textContent = term; container.appendChild(chip); }
      const button = document.createElement("button"); button.type = "button"; button.className = "as-text-button"; button.dataset.asWithdraw = "1"; button.textContent = "撤回扩展并重查"; button.disabled = state.busy;
      button.onclick = () => {
        state.expand = false; state.semantic = false; $("#asExpand").checked = false; $("#asSemantic").checked = false; $("#asSemantic").disabled = true;
        runRequest({ ...request, expand: false, semantic: false, replaceTurn, forceLocal: request.forceLocal || request.source === "local" });
      };
      if (request.expand !== false || request.semantic) container.appendChild(button); parent.appendChild(container);
    }

    async function loadParagraph(item, block, button) {
      if (!item.entry || typeof api.ensureDetail !== "function") return;
      button.disabled = true; button.textContent = "正在载入正文…";
      try {
        const detail = await abortable(api.ensureDetail(item.entry.angle, item.entry.r), signal);
        if (!live() || !block.isConnected) return;
        const fields = object(object(detail).fields || detail);
        const terms = localTerms($("#asQuestion").value || state.query, true);
        const candidates = [];
        for (const field of ["content_cn", "chinese_trans", "chinese_translation", "content", "original_content"]) {
          const content = text(fields[field], 1000000);
          if (!content) continue;
          const paragraphs = content.split(/\n\s*\n|\r\n\s*\r\n/).filter((p) => p.trim());
          paragraphs.forEach((paragraph, index) => { candidates.push({ field, paragraph, index, score: [...terms.words, ...terms.aliases].reduce((score, term) => score + (norm(paragraph).includes(term) ? 1 : 0), 0) }); });
        }
        candidates.sort((a, b) => b.score - a.score);
        const hit = candidates[0];
        if (!hit) { button.textContent = "未找到可读取的正文字段"; return; }
        const extra = document.createElement("details"); extra.className = "as-body-preview"; extra.open = true;
        const summary = document.createElement("summary"); summary.textContent = "补充阅读：完整记录字段 " + hit.field + " · 第 " + (hit.index + 1) + " 段（按空行分段，与服务分段编号独立）";
        const quote = document.createElement("blockquote"); quote.className = "as-excerpt"; quote.textContent = hit.paragraph.slice(0, 1800) + (hit.paragraph.length > 1800 ? "…（片段截断，可打开完整记录）" : "");
        extra.append(summary, quote); block.appendChild(extra);
        button.textContent = "已载入正文段落";
      } catch (_) {
        if (live() && block.isConnected) { button.disabled = false; button.textContent = "正文加载失败，重试"; }
      }
    }

    function renderEvidence(parent, items, scope, visibleCount = items.length) {
      const listElement = document.createElement("div"); listElement.className = "as-evidence-list";
      let additional = null;
      for (const [index, item] of items.entries()) {
        if (index === visibleCount) {
          additional = document.createElement("details"); additional.className = "as-more-sources"; additional.dataset.asExtraSources = "1";
          const summary = document.createElement("summary"); summary.textContent = "展开其余 " + (items.length - visibleCount) + " 段引用资料";
          const extraList = document.createElement("div"); extraList.className = "as-evidence-list";
          additional.append(summary, extraList); listElement.appendChild(additional);
        }
        const article = document.createElement("article"); article.className = "as-evidence"; article.tabIndex = -1; article.dataset.asCitation = item.label;
        article.id = "as-evidence-" + scope + "-" + item.label;
        const record = recordUrl(item);
        article.innerHTML = `<div class="as-evidence-top"><b class="as-evidence-label">[${esc(item.label)}]</b><span>${esc(angleName(item.angle))}</span>${item.ktid ? `<span>${esc(instName(item.ktid))}</span>` : ""}${Number.isFinite(item.score) ? `<span class="as-score" title="检索排序分数，不是事实置信度">排序分 ${esc(Number(item.score).toFixed(2))}</span>` : ""}</div><h3>${record ? `<a href="${esc(record)}">${esc(item.title)}</a>` : esc(item.title)}</h3><p class="as-paragraph">${esc(item.paragraph ? (item.field ? item.field + " · " : "") + (/^\d+$/.test(item.paragraph) ? (item.paragraphScheme === "service_field_chunks_v1" ? "服务分段 " + item.paragraph + "（服务按字段切分，非原网页段落号）" : "段落 " + item.paragraph) : item.paragraph) : "服务未提供段落编号")}</p><blockquote class="as-excerpt"></blockquote><div class="as-evidence-links">${record ? `<a href="${esc(record)}">查看本站记录 →</a>` : '<span class="as-warning">当前快照未找到该记录；请核对服务资料版本。</span>'}${item.source_url ? `<a href="${esc(item.source_url)}" target="_blank" rel="noopener noreferrer">打开原文 ↗</a>` : '<span class="as-note">原文链接未提供或无效</span>'}</div>`;
        if (item.version || item.dateOrigin || item.translation) {
          const metadata = document.createElement("p"); metadata.className = "as-note";
          const dateLabel = { missing: "原始发布时间缺失", recovered: "日期有恢复依据，默认筛选仍按原始发布时间", provided: "原始发布时间已提供" }[item.dateOrigin] || item.dateOrigin;
          metadata.textContent = [item.version ? "服务资料版本 " + item.version : "", dateLabel, item.translation ? "翻译状态 " + item.translation : ""].filter(Boolean).join(" · ");
          article.insertBefore(metadata, article.querySelector(".as-evidence-links"));
        }
        article.querySelector(".as-excerpt").textContent = item.excerpt || "服务未返回命中片段，请打开完整记录核对。";
        if (item.entry && typeof api.ensureDetail === "function") {
          const button = document.createElement("button"); button.type = "button"; button.className = "as-text-button"; button.textContent = "载入正文段落";
          button.onclick = () => loadParagraph(item, article, button); article.querySelector(".as-evidence-links").appendChild(button);
        }
        (additional ? additional.lastElementChild : listElement).appendChild(article);
      }
      parent.appendChild(listElement);
    }

    function addProjectButton(parent, items, query) {
      if (!window.ZGCLAB_PROJECTS || typeof window.ZGCLAB_PROJECTS.addEntries !== "function") return;
      const entries = [...new Map(items.filter((item) => item.entry).map((item) => [item.angle + ":" + item.id, item.entry])).values()];
      if (!entries.length) return;
      const button = document.createElement("button"); button.type = "button"; button.className = "btn"; button.textContent = "加入专题（" + entries.length + " 条）";
      button.onclick = async () => {
        button.disabled = true;
        try { await window.ZGCLAB_PROJECTS.addEntries(entries, api, { sourceLabel: "资料问答：" + query.slice(0, 80) }); }
        catch (_) { if (live()) toast("暂时无法加入专题，请稍后重试。"); }
        finally { if (live()) button.disabled = false; }
      };
      parent.appendChild(button);
    }

    function renderSearch() {
      const parent = $("#asSearchResults"); parent.replaceChildren();
      if (!state.result) { updateOutputButtons(); return; }
      const result = state.result;
      const header = document.createElement("div"); header.className = "as-result-head";
      const heading = document.createElement("h2"); heading.textContent = result.source === "local" ? "本地索引检索结果 · 未调用大模型" : result.modelInfo && result.modelInfo.used ? "模型理解后的资料检索结果" : "数据库资料检索结果"; header.appendChild(heading);
      const count = document.createElement("p"); count.className = "as-note"; count.textContent = countText(result); header.appendChild(count);
      if (result.source === "local") { const notice = document.createElement("p"); notice.className = "as-retrieval-note"; notice.textContent = "采用关键词、显式词表与字面近似匹配；不理解语义，未扫描全部正文。可进入完整正文检索继续核对。"; header.appendChild(notice); }
      if (result.source === "service") { const modelNote = document.createElement("p"); modelNote.className = "as-note"; modelNote.textContent = modelExplanation(result.modelInfo, "search"); header.appendChild(modelNote); }
      const process = document.createElement("details"); process.className = "as-process";
      const summary = document.createElement("summary"); summary.textContent = "查看检索过程、扩展词与覆盖范围"; process.appendChild(summary);
      if (result.modelQuery) { const planNote = document.createElement("p"); planNote.className = "as-note"; planNote.textContent = "模型检索式：" + result.modelQuery; process.appendChild(planNote); }
      if (result.strategy) { const strategy = document.createElement("p"); strategy.className = "as-note"; strategy.textContent = "实际检索规则：" + result.strategy + (result.strategy === "fts5_or_fallback" ? "（全部条件未命中后放宽为任一词组匹配）" : ""); process.appendChild(strategy); }
      if (result.coverage) { const coverage = document.createElement("p"); coverage.className = "as-note"; coverage.textContent = result.coverage; process.appendChild(coverage); }
      renderExpansions(process, result.expansions, { ...state.lastRequest, mode: "search", question: result.originalQuery || result.query, expand: result.requestedExpand, semantic: result.requestedSemantic, filters: result.filters, source: result.source }, null);
      header.appendChild(process);
      const tools = document.createElement("div"); tools.className = "as-result-actions";
      addProjectButton(tools, result.items, result.query); header.appendChild(tools); parent.appendChild(header);
      renderAggregates(parent, result.aggregates || [], "search");
      if (result.items.length) {
        const sources = document.createElement("h3"); sources.className = "as-sources-heading"; sources.textContent = "相关资料 · " + result.items.length + " 段证据"; parent.appendChild(sources);
        renderEvidence(parent, result.items, "search");
      }
      else { const empty = document.createElement("div"); empty.className = "as-empty"; empty.textContent = "当前范围没有匹配记录。可减少筛选、换用机构简称或中英文关键词，再尝试完整正文检索。"; parent.appendChild(empty); }
      updateOutputButtons();
    }

    function renderTranscript() {
      const parent = $("#asTranscript"); parent.replaceChildren();
      if (!state.turns.length) { updateOutputButtons(); return; }
      for (const turn of state.turns) {
        const article = document.createElement("article"); article.className = "as-turn"; article.dataset.asTurn = turn.id;
        const question = document.createElement("div"); question.className = "as-user-question";
        const label = document.createElement("span"); label.className = "as-note"; label.textContent = "研究问题";
        const content = document.createElement("p"); content.textContent = turn.question; question.append(label, content); article.appendChild(question);
        const answer = document.createElement("div"); answer.className = "as-answer";
        const heading = document.createElement("h2"); heading.textContent = turn.kind === "database" ? "数据库精确统计 · 未调用大模型" : turn.kind === "retrieval" ? "资料检索摘录 · 无模型答案" : turn.answerFormat === "verbatim_extracts" ? "模型选取的原文摘录" : "资料回答"; answer.appendChild(heading);
        const meta = document.createElement("p"); meta.className = "as-note";
        meta.textContent = turn.source === "local" ? "本地索引，未调用大模型；仅关键词与字面近似匹配。" : turn.answerFormat === "verbatim_extracts" ? "实际模型：" + (turn.model || "服务未报告") + " · 模型选取来源中的逐字摘录；请结合原文核对含义与上下文。" : modelExplanation(turn.modelInfo, turn.kind === "database" ? "database" : "chat");
        answer.appendChild(meta);
        if (turn.answer) {
          const body = document.createElement("div"); body.className = "as-markdown";
          renderMarkdown(body, turn.answer, [...turn.items, ...(turn.aggregates || [])], (citationLabel) => {
            const element = [...article.querySelectorAll("[data-as-citation]")].find((node) => node.dataset.asCitation === citationLabel);
            if (element) {
              for (let ancestor = element.parentElement; ancestor && ancestor !== article; ancestor = ancestor.parentElement) if (ancestor.tagName === "DETAILS") ancestor.open = true;
              element.scrollIntoView({ behavior: "auto", block: "center" }); element.focus({ preventScroll: true });
            }
          });
          answer.appendChild(body);
          const unknown = [...turn.answer.matchAll(/\[([CA]\d{1,3})\]/g)].some((match) => ![...turn.items, ...(turn.aggregates || [])].some((item) => item.label === match[1]));
          if ((!turn.items.length && !(turn.aggregates || []).length) || unknown) {
            const warning = document.createElement("p"); warning.className = "as-warning";
            warning.textContent = !turn.items.length && !(turn.aggregates || []).length ? "服务未返回可核对的引用，请勿将此回答当作已证实结论。" : "回答包含没有对应资料的引用标记，请人工核对。"; answer.appendChild(warning);
          }
        }
        const process = document.createElement("details"); process.className = "as-process";
        const summary = document.createElement("summary"); summary.textContent = "查看检索过程与资料范围"; process.appendChild(summary);
        if (turn.coverage) { const coverage = document.createElement("p"); coverage.className = "as-note"; coverage.textContent = turn.coverage; process.appendChild(coverage); }
        if (turn.query) { const query = document.createElement("p"); query.className = "as-note"; query.textContent = "服务检索式：" + turn.query; process.appendChild(query); }
        renderExpansions(process, turn.expansions || [], { mode: "chat", question: turn.question, filters: turn.filters, expand: turn.requestedExpand, semantic: turn.requestedSemantic, limit: 20, source: turn.source }, turn.id);
        answer.appendChild(process);
        const tools = document.createElement("div"); tools.className = "as-actions as-turn-tools";
        const copy = document.createElement("button"); copy.type = "button"; copy.className = "btn"; copy.textContent = "复制本轮与引用"; copy.onclick = () => copyMarkdown(turnMarkdown(turn)); tools.appendChild(copy);
        addProjectButton(tools, turn.items, turn.question);
        const followUp = document.createElement("button"); followUp.type = "button"; followUp.className = "as-text-button"; followUp.textContent = "继续追问 ↓";
        followUp.onclick = () => { $("#asForm").scrollIntoView({ behavior: "auto", block: "center" }); $("#asQuestion").focus({ preventScroll: true }); }; tools.appendChild(followUp);
        answer.appendChild(tools);
        renderAggregates(answer, turn.aggregates || [], turn.id);
        if (turn.items.length) {
          const title = document.createElement("h3"); title.className = "as-sources-heading"; title.textContent = "引用资料 · " + turn.items.length + " 段证据"; answer.appendChild(title); renderEvidence(answer, turn.items, turn.id, 3);
        } else if (turn.kind === "retrieval") { const empty = document.createElement("div"); empty.className = "as-empty"; empty.textContent = "当前范围没有匹配资料，请缩小问题或减少筛选后重试。"; answer.appendChild(empty); }
        article.appendChild(answer); parent.appendChild(article);
      }
      updateOutputButtons();
    }

    function updateOutputButtons() {
      if (!live()) return;
      const available = state.mode === "search" ? !!state.result : state.turns.length > 0;
      $("#asCopy").disabled = !available; $("#asExport").disabled = !available;
      $("#asOutputTools").hidden = !available;
      $("#asOutputLabel").textContent = state.mode === "search" ? "检索结果" : "当前对话 · " + state.turns.length + " 轮";
      $("#asWelcome").hidden = available;
      $("#asWelcomeTitle").textContent = state.mode === "search" ? "从一个研究问题开始" : "让资料成为对话的起点";
      $("#asWelcomeHelp").textContent = state.mode === "search" ? "选择一个示例，或在上方描述你要查找的资料。" : "从研究问题出发，回答和引用会保留在同一段对话中。";
      const followUp = state.mode === "chat" && available;
      $(".as-main").classList.toggle("as-has-conversation", followUp);
      $("#asQuestionLabel").textContent = state.mode === "search" ? "检索问题" : followUp ? "继续追问" : "研究问题或追问";
      const reading = $("#asReading"), dock = $("#asComposeDock"), sessions = $("#asSessionArea");
      if (followUp) $(".as-workspace-head").after(sessions);
      else reading.insertBefore(sessions, $("#asWelcome"));
      if (followUp && reading.lastElementChild !== dock) reading.appendChild(dock);
      else if (!followUp && reading.firstElementChild !== dock) reading.prepend(dock);
    }

    function savedSessions() {
      return (Array.isArray(workspace.chatSessions) ? workspace.chatSessions : []).filter((item) => item && item.kind === "assistant" && typeof item.id === "string" && Array.isArray(item.turns));
    }

    function updateSessionPicker() {
      const sessions = savedSessions().slice().sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
      $("#asSessions").innerHTML = '<option value="">选择已保存会话</option>' + sessions.map((item) => `<option value="${esc(item.id)}"${item.id === state.sessionId ? " selected" : ""}>${esc(text(item.title, 55) || "未命名会话")} · ${esc(text(item.updated_at, 10))}</option>`).join("");
    }

    function storageNotice(saved) {
      if (!live()) return;
      $("#asSessionState").textContent = saved === false ? "保存失败 · 请导出" : state.keep ? "已开启浏览器保存" : "仅保留在本页";
      if (saved === false) $("#asSessionArea").open = true;
      $("#asStorageStatus").textContent = saved === false ? "浏览器未能保存：当前对话仅保留在本次页面内存，关闭或刷新将丢失，请导出 Markdown 或工作台备份。" : state.keep && state.turns.length ? "当前对话已保存至本浏览器。" : "当前对话未开启持久保存；可随时导出。";
    }

    function persistConversation() {
      let sessionStored = true;
      workspace.assistantPreferences = { keepHistory: state.keep, lastSessionId: state.keep ? state.sessionId : "" };
      if (state.keep && state.turns.length) {
        const saved = {
          kind: "assistant", schema: 1, id: state.sessionId, title: state.turns[0].question.slice(0, 70),
          created_at: state.createdAt, updated_at: new Date().toISOString(), filters: state.filters,
          turns: state.turns.slice(-MAX_TURNS).map(sanitizedTurn),
        };
        const other = (Array.isArray(workspace.chatSessions) ? workspace.chatSessions : []).filter((item) => item && item.id !== state.sessionId);
        if (other.filter((item) => item.kind === "assistant").length >= MAX_SAVED_SESSIONS) { sessionStored = false; toast("已保存会话较多，请导出备份后清理旧会话；本轮仍保留在当前页面。"); }
        else workspace.chatSessions = [...other, saved];
      }
      const saved = saveWorkspace(); if (saved !== null) storageNotice(saved && sessionStored); updateSessionPicker();
    }

    async function openSession(id) {
      const saved = savedSessions().find((item) => item.id === id);
      if (!saved || state.busy) return;
      const turns = saved.turns.slice(-MAX_TURNS).map(sanitizedTurn);
      await verifyEvidence(turns.flatMap((turn) => turn.items), signal);
      if (!live()) return;
      state.sessionId = saved.id; state.createdAt = text(saved.created_at, 50) || new Date().toISOString(); state.turns = turns;
      state.keep = true; $("#asKeep").checked = true; state.lastRequest = null; showError("");
      renderTranscript(); persistConversation(); $("#asProgress").textContent = "已打开本浏览器保存的会话；资料引用按当前快照重新核对。";
    }

    function sanitizeFilters(value) {
      const f = normalizeFilters(value);
      f.ids = f.ids.filter((id) => institutionIds.has(id));
      return f;
    }

    function resetConversation(clear) {
      if (state.busy) return;
      if (clear && (state.turns.length || savedSessions().some((item) => item.id === state.sessionId)) && !window.confirm("清空当前对话？本浏览器中保存的这个会话也会被移除。")) return;
      if (clear && Array.isArray(workspace.chatSessions)) workspace.chatSessions = workspace.chatSessions.filter((item) => !item || item.id !== state.sessionId);
      if (!clear) persistConversation();
      state.turns = []; state.sessionId = makeID(); state.createdAt = new Date().toISOString(); state.lastRequest = null;
      $("#asQuestion").value = ""; showError(""); $("#asProgress").textContent = clear ? "当前对话已清空。" : "已开始新对话。";
      renderTranscript(); persistConversation(); $("#asQuestion").focus();
    }

    function citationsMarkdown(items) {
      return items.map((item) => {
        const record = absoluteRecordUrl(item);
        return "- [" + item.label + "] " + markdownText(item.title) + "（" + markdownText(angleName(item.angle)) + (item.ktid ? " / " + markdownText(instName(item.ktid)) : "") + "）\n" + (item.paragraph ? "  - " + (item.paragraphScheme === "service_field_chunks_v1" ? "服务字段分段（非原网页段落号）：" : "段落：") + markdownText(item.paragraph) + "\n" : "") + "  - 片段：" + markdownText(item.excerpt || "未提供") + "\n" + (record ? "  - 本站记录：<" + record.replace(/[<>\r\n]/g, encodeURIComponent) + ">\n" : "  - 当前快照未找到对应记录\n") + (item.source_url ? "  - 原文：<" + item.source_url.replace(/[<>\r\n]/g, encodeURIComponent) + ">" : "  - 原文链接未提供或无效");
      }).join("\n\n");
    }

    function aggregateMarkdown(items) {
      return (items || []).map((item) => "- [" + item.label + "] 数据库精确统计：结构化范围 " + (item.scoped.total ?? "未提供") + " 条；检索规则命中 " + (item.matched.total ?? "未提供") + " 条。\n  - 资料版本：" + markdownText(item.scope.source_version) + "；时间字段：" + markdownText(item.scope.date_field) + "；时区：" + markdownText(item.scope.timezone || "Asia/Shanghai") + "；规则：" + markdownText(item.scope.strategy) + "\n  - 机构：" + item.scope.filters.ids.map(instName).map(markdownText).join("、") + "；角度：" + (item.scope.filters.angles || []).map(angleName).map(markdownText).join("、") + "；平台：" + item.scope.filters.platforms.map(markdownText).join("、") + "；日期：" + (item.scope.filters.from || "不限") + " 至 " + (item.scope.filters.to || "不限") + "\n  - 检索词：" + item.scope.terms.map(markdownText).join("、") + "\n  - 统计仅覆盖已入库真实快照，不代表全网总量。").join("\n\n");
    }

    function turnMarkdown(turn) {
      const heading = turn.kind === "database" ? "数据库精确统计（未调用大模型）" : turn.kind === "answer" ? (turn.answerFormat === "verbatim_extracts" ? "模型选取的原文摘录" : "资料回答") : "资料检索摘录（无模型答案）";
      return "## 问题\n\n" + markdownText(turn.question) + "\n\n## " + heading + "\n\n" + (turn.answer ? turn.answer.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "\n\n" : "请结合以下资料人工阅读。\n\n") + (turn.source === "local" ? "本地索引，未调用大模型。" : markdownText(turn.answerFormat === "verbatim_extracts" ? "实际模型：" + turn.model + "；模型选取来源逐字摘录，请核对原文上下文。" : modelExplanation(turn.modelInfo, turn.kind === "database" ? "database" : "chat"))) + "\n\n" + (turn.coverage ? markdownText(turn.coverage) + "\n\n" : "") + ((turn.expansions || []).length ? "检索词 / 扩展词：" + turn.expansions.map(markdownText).join("、") + "\n\n" : "") + "### 引用资料与统计依据\n\n" + ([citationsMarkdown(turn.items), aggregateMarkdown(turn.aggregates)].filter(Boolean).join("\n\n") || "未返回可核对引用。") + "\n";
    }

    function exportMarkdown() {
      const header = "# ZGCLab 资料" + (state.mode === "chat" ? "问答" : "检索") + "\n\n导出时间：" + new Date().toISOString() + "\n\n本站快照：" + markdownText(META.version || "未提供") + "\n\n引用为外部资料，请核对完整记录与原文。\n\n";
      if (state.mode === "chat") return header + state.turns.map(turnMarkdown).join("\n---\n\n");
      const result = state.result;
      if (!result) return header;
      return header + "## 检索问题\n\n" + markdownText(result.query) + "\n\n" + (result.source === "local" ? "本地索引检索，未调用大模型；仅关键词与字面近似匹配。\n\n" : markdownText(modelExplanation(result.modelInfo, "search")) + "\n\n") + countText(result) + "\n\n" + markdownText(result.coverage) + "\n\n" + (result.expansions.length ? "检索扩展词：" + result.expansions.map(markdownText).join("、") + "\n\n" : "") + "## 结果与引用\n\n" + ([citationsMarkdown(result.items), aggregateMarkdown(result.aggregates)].filter(Boolean).join("\n\n") || "没有匹配记录。") + "\n";
    }

    async function copyMarkdown(value) {
      try {
        if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(value);
        else {
          const area = document.createElement("textarea"); area.value = value; area.className = "as-copy-area"; document.body.appendChild(area); area.select();
          const copied = document.execCommand("copy"); area.remove(); if (!copied) throw new Error("Clipboard unavailable");
        }
        if (live()) toast("已复制 Markdown（含资料引用）。");
      } catch (_) { if (live()) toast("无法自动复制，可导出 Markdown 文件。"); }
    }

    async function runRequest(override) {
      if (!live() || state.busy) return;
      const rawQuestion = String(override && override.question || $("#asQuestion").value || "");
      if (rawQuestion.length > MAX_QUERY) { showError("问题最多 1200 字符，请缩短后重新发送。"); return; }
      const question = rawQuestion.trim();
      if (!question) { $("#asQuestion").focus(); $("#asProgress").textContent = "请先输入研究问题或检索词。"; return; }
      const currentFilters = override && override.filters ? sanitizeFilters(override.filters) : readFilters();
      if (currentFilters.from && currentFilters.to && currentFilters.from > currentFilters.to) { showError("开始日期不能晚于结束日期。"); return; }
      const request = { question, mode: override && override.mode || state.mode, filters: currentFilters, expand: override && typeof override.expand === "boolean" ? override.expand : state.expand, semantic: override && typeof override.semantic === "boolean" ? override.semantic : state.semantic, limit: Math.min(30, Math.max(1, Number(override && override.limit || $("#asLimit").value) || 20)), forceLocal: !!(override && override.forceLocal), replaceTurn: override && override.replaceTurn || null };
      const serial = ++requestSerial, controller = new AbortController(); activeRequest = controller;
      let timedOut = false;
      const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 135000);
      state.query = question; state.lastRequest = request; showError(""); setBusy(true); synchronizeUrl();
      $("#asProgress").textContent = request.forceLocal ? "正在检索本地快照索引…" : request.mode === "chat" ? "正在查找资料并等待研究服务回答…" : "正在检索研究服务资料…";
      try {
        let result, turn;
        if (!request.expand) request.semantic = false;
        if (request.forceLocal) result = await localSearch(request, controller.signal);
        else {
          try {
            if (request.mode === "search") result = await remoteSearch(request, controller.signal);
            else turn = await remoteChat(request, controller.signal);
            if (!state.status && !statusRequest) refreshStatus();
            else { if (state.status) state.connection = "connected"; updateServiceStatus(); }
          } catch (error) {
            if (!live() || controller.signal.aborted || error.name === "AbortError") throw error;
            if (authenticationError(error)) { state.connection = "auth"; if (passwordRequired(error)) openPasswordDialog(); }
            else state.connection = "offline";
            updateServiceStatus(); showError(failureMessage(error));
            $("#asProgress").textContent = "研究服务当前不可用，正在检索本地索引（未调用大模型）…";
            result = await localSearch(request, controller.signal);
          }
        }
        if (!live() || serial !== requestSerial || controller.signal.aborted) return;
        if (request.mode === "search") { state.result = result; renderSearch(); }
        else {
          if (!turn) turn = { id: request.replaceTurn || makeID(), question, created_at: new Date().toISOString(), kind: "retrieval", answer: "", items: result.items, source: result.source, model: "", mode: "local_retrieval", coverage: countText(result) + " · " + result.coverage, expansions: result.expansions, filters: request.filters, requestedExpand: request.expand, requestedSemantic: request.semantic, aggregates: [], modelInfo: { used: false, attempted: false } };
          if (request.replaceTurn && state.turns.some((item) => item.id === request.replaceTurn)) state.turns = state.turns.map((item) => item.id === request.replaceTurn ? turn : item);
          else state.turns = [...state.turns, turn].slice(-MAX_TURNS);
          state.lastRequest = { ...request, replaceTurn: turn.id };
          renderTranscript(); persistConversation();
        }
        $("#asProgress").textContent = request.mode === "search" ? (result.items.length ? "资料检索完成。" : "检索完成，当前范围没有匹配资料。") : turn.kind === "database" ? "数据库统计已返回，可点击 [A1] 核对范围与口径。" : turn.kind === "retrieval" ? "已展示资料检索摘录，无模型生成答案。" : "回答已返回，请逐条核对引用。";
        if (request.mode === "chat") $("#asQuestion").value = "";
      } catch (error) {
        if (!live() || serial !== requestSerial) return;
        if (controller.signal.aborted && !timedOut || error.name === "AbortError" && !timedOut) $("#asProgress").textContent = "请求已取消，可以修改问题后重新发送。";
        else {
          showError(timedOut ? failureMessage(errorWith("TIMEOUT")) : error.code === "INDEX" ? "本地索引加载失败。请重试，或重新登录后再加载资料。" : failureMessage(error));
          $("#asProgress").textContent = "请求未完成，可重试。";
        }
      } finally {
        window.clearTimeout(timeout);
        if (live() && serial === requestSerial) { activeRequest = null; setBusy(false); }
      }
    }

    $("#asForm").onsubmit = (event) => { event.preventDefault(); runRequest(); };
    $("#asQuestion").onkeydown = (event) => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); runRequest(); } };
    $("#asCancel").onclick = () => { if (activeRequest) activeRequest.abort(); };
    $("#asRetry").onclick = () => { if (state.lastRequest) runRequest({ ...state.lastRequest, forceLocal: false }); };
    $("#asUseLocal").onclick = () => { if (state.lastRequest) runRequest({ ...state.lastRequest, forceLocal: true }); };
    function openPasswordDialog() {
      const dialog = $("#asPasswordDialog");
      $("#asPasswordError").hidden = true;
      if (!dialog.open) dialog.showModal();
      $("#asServicePassword").focus();
    }

    $("#asReconnect").onclick = () => refreshStatus();
    $("#asLogin").onclick = openPasswordDialog;
    $("#asPasswordCancel").onclick = () => $("#asPasswordDialog").close();
    $("#asPasswordDialog").addEventListener("close", () => { const input = $("#asServicePassword"); if (input) input.value = ""; });
    $("#asPasswordForm").onsubmit = async (event) => {
      event.preventDefault();
      const input = $("#asServicePassword"), button = $("#asPasswordSubmit");
      button.disabled = true; $("#asPasswordError").hidden = true;
      let password = input.value; input.value = "";
      try {
        const client = await serviceClient(signal);
        if (typeof client.authenticate !== "function") throw errorWith("UNCONFIGURED");
        await abortable(client.authenticate(password, { signal }), signal); password = "";
        if (!live()) return;
        $("#asPasswordDialog").close();
        await refreshStatus();
        if (state.lastRequest && !state.busy) runRequest({ ...state.lastRequest, forceLocal: false });
      } catch (error) {
        if (live()) { $("#asPasswordError").textContent = authenticationError(error) ? "站点密码未通过验证，请重新输入。" : failureMessage(error); $("#asPasswordError").hidden = false; input.focus(); }
      } finally { password = ""; if (live()) button.disabled = false; }
    };
    $("#asCopy").onclick = () => copyMarkdown(exportMarkdown());
    $("#asExport").onclick = () => {
      const blob = new Blob([exportMarkdown()], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = "zgclab-资料" + (state.mode === "chat" ? "问答" : "检索") + "-" + new Date().toISOString().slice(0, 10) + ".md"; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    $("#asNew").onclick = () => resetConversation(false);
    $("#asClear").onclick = () => resetConversation(true);
    $("#asKeep").onchange = () => {
      state.keep = $("#asKeep").checked;
      if (!state.keep && Array.isArray(workspace.chatSessions)) workspace.chatSessions = workspace.chatSessions.filter((item) => !item || item.id !== state.sessionId);
      persistConversation();
    };
    $("#asSessions").onchange = () => { const id = $("#asSessions").value; if (id) openSession(id).catch(() => toast("保存的会话暂时无法打开，请重试。")); };
    view.querySelectorAll("[data-as-mode]").forEach((button) => {
      button.onclick = () => setMode(button.dataset.asMode);
      button.onkeydown = (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); const next = event.key === "Home" ? "search" : event.key === "End" ? "chat" : state.mode === "search" ? "chat" : "search"; setMode(next); $(next === "search" ? "#asSearchTab" : "#asChatTab").focus();
      };
    });
    view.querySelectorAll("[data-as-example]").forEach((button) => { button.onclick = () => { $("#asQuestion").value = button.dataset.asExample; $("#asQuestion").focus(); }; });
    view.querySelectorAll("[data-as-inst], [data-as-platform], #asAngle, #asFrom, #asTo, #asExpand, #asSemantic").forEach((input) => { input.onchange = () => { readFilters(); synchronizeUrl(); }; });
    $("#asResetFilters").onclick = () => {
      view.querySelectorAll("[data-as-inst], [data-as-platform]").forEach((input) => { input.checked = false; });
      $("#asAngle").value = "all"; $("#asFrom").value = ""; $("#asTo").value = ""; readFilters(); synchronizeUrl();
    };
    const supported = new Set(["mode", "q", "query", "ids", "ktid", "angle", "platforms", "from", "to", "period", "expand", "semantic", "session"]);
    $("#asImportedNote").hidden = ![...params.keys()].some((key) => !supported.has(key));
    // Keep the mobile range control discoverable without pushing the composer below it.
    $("#asScope").open = !window.matchMedia("(max-width: 1279px)").matches;
    readFilters(); updateSessionPicker(); setMode(state.mode); updateServiceStatus(); storageNotice(true);
    const savedID = params.get("session") || (state.keep ? object(workspace.assistantPreferences).lastSessionId : "");
    if (savedID) openSession(savedID).catch(() => { if (live()) toast("保存的会话暂时无法打开，可开始新对话。"); });
    refreshStatus();
  };
  Object.assign(window.ZGCLAB_ASSISTANT, { mergeBackup, validateSessions: validatedSessions, serviceStatusModel });
})();
