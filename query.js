/* Business query rules shared by the interface and automated checks. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"));
  else root.ZGCLAB_QUERY = factory(root.ZGCLAB_CORE);
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";
  const ANGLES = ["news", "clue", "social"];
  const METRICS = ["like_count", "comment_count", "repost_count", "view_count", "engagement"];
  const DATE_FIELDS = { published: "publish_time", collected: "collected_time", discovered: "discovery_time", found: "founddate" };
  const SORTS = ["newest", "oldest", "relevance", ...METRICS];
  const cache = new WeakMap();
  const dayCache = new Map();
  const beijingFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" });
  const list = (value) => [...new Set((Array.isArray(value) ? value : String(value || "").split(",")).filter(Boolean).map(String))];
  function count(value) {
    if (value == null || String(value).trim() === "") return null;
    const text = String(value).trim();
    if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
  }
  function metric(row, name) {
    if (name !== "engagement") return count(row[name]);
    const values = ["like_count", "comment_count", "repost_count"].map((key) => count(row[key]));
    return values.some((v) => v == null) ? null : values.reduce((sum, value) => sum + value, 0);
  }
  function beijingDay(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    const parts = beijingFormatter.formatToParts(date);
    const get = (type) => parts.find((part) => part.type === type).value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  }
  function shiftDay(day, amount) {
    return new Date(Date.parse(day + "T00:00:00Z") + amount * 86400000).toISOString().slice(0, 10);
  }
  function recordDay(value) {
    const raw = String(value || "");
    if (!dayCache.has(raw)) dayCache.set(raw, /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) && Number.isFinite(Date.parse(raw)) ? beijingDay(raw) : core.dateDay(raw));
    return dayCache.get(raw);
  }
  function dateValue(row, field = "published") {
    return field === "record" ? row.publish_time || row.founddate || row.discovery_time || row.collected_time || "" : row[DATE_FIELDS[field] || "publish_time"] || "";
  }
  function dateRange(state, now = new Date()) {
    const today = beijingDay(now);
    if (state.period === "today") return { from: today, to: today };
    if (state.period === "7" || state.period === "30") return { from: shiftDay(today, 1 - Number(state.period)), to: today };
    return { from: state.from || "", to: state.to || "" };
  }
  function parse(params) {
    const state = {
      angle: ANGLES.includes(params.get("angle")) ? params.get("angle") : "all",
      ids: list(params.get("ids") || params.get("ktid")), type: params.get("type") || "", country: params.get("country") || "",
      platforms: list(params.get("platforms")), risks: list(params.get("risks")), tags: list(params.get("tags")),
      account: params.get("account") || "", language: params.get("language") || "", translation: params.get("translation") || "", media: params.get("media") || "",
      q: params.get("q") || "", mode: params.get("mode") === "any" ? "any" : "all", source: params.get("source") || "",
      period: ["today", "7", "30", "custom"].includes(params.get("period")) ? params.get("period") : "custom",
      from: core.validDay(params.get("from")) ? params.get("from") : "", to: core.validDay(params.get("to")) ? params.get("to") : "",
      dateField: ["published", "record", "collected", "discovered", "found"].includes(params.get("dateField")) ? params.get("dateField") : "published",
      missing: ["publish_time", "url", "risk"].includes(params.get("missing")) ? params.get("missing") : "",
      sort: SORTS.includes(params.get("sort")) ? params.get("sort") : "newest", limit: [10, 20, 50].includes(Number(params.get("limit"))) ? Number(params.get("limit")) : 0,
      size: [14, 25, 50, 100].includes(Number(params.get("size"))) ? Number(params.get("size")) : 14,
      page: Math.max(1, Math.floor(Number(params.get("page"))) || 1),
      version: params.get("version") || "",
      read: ["read", "unread"].includes(params.get("read")) ? params.get("read") : "",
      sim: params.get("sim") === "1" ? "1" : "",
    };
    for (const name of METRICS) for (const suffix of ["Min", "Max"]) state[name + suffix] = params.get(name + suffix) || "";
    const legacy = params.get("sub") || "";
    const match = legacy.match(/^(?:(news|clue|social):)?(tag|risk_level|platform):(.+)$/);
    if (match) state[{ tag: "tags", risk_level: "risks", platform: "platforms" }[match[2]]] = [match[3]];
    return state;
  }
  function serialize(state) {
    const params = new URLSearchParams();
    params.set("angle", state.angle || "all");
    for (const key of ["ids", "platforms", "risks", "tags"]) if ((state[key] || []).length) params.set(key, state[key].join(","));
    for (const key of ["type", "country", "q", "source", "account", "language", "translation", "media", "missing", "version", "read", "sim"]) if (state[key]) params.set(key, state[key]);
    if (state.mode === "any") params.set("mode", "any");
    if (state.dateField && state.dateField !== "published") params.set("dateField", state.dateField);
    if (state.period && state.period !== "custom") params.set("period", state.period);
    else for (const key of ["from", "to"]) if (state[key]) params.set(key, state[key]);
    if (state.sort && state.sort !== "newest") params.set("sort", state.sort);
    for (const key of ["limit", "page", "size"]) if (state[key] && state[key] !== ({ limit: 0, page: 1, size: 14 })[key]) params.set(key, state[key]);
    for (const name of METRICS) for (const suffix of ["Min", "Max"]) if (state[name + suffix] !== "" && state[name + suffix] != null) params.set(name + suffix, state[name + suffix]);
    return params.toString();
  }
  function validate(state) {
    const range = dateRange(state);
    if (range.from && range.to && range.from > range.to) return "开始日期不能晚于结束日期。";
    for (const name of METRICS) {
      const min = state[name + "Min"], max = state[name + "Max"];
      if (min !== "" && min != null && count(min) == null || max !== "" && max != null && count(max) == null) return "互动数值必须是大于或等于 0 的数字。";
      if (min !== "" && max !== "" && min != null && max != null && Number(min) > Number(max)) return "数值下限不能大于上限。";
    }
    if (state.risks.length && state.tags.length || state.risks.length && state.platforms.length || state.tags.length && state.platforms.length) return "风险等级、新闻标签、社媒平台属于不同角度，请分别查询。";
    return "";
  }
  function text(row) {
    if (!cache.has(row)) cache.set(row, core.normalize(Object.entries(row).filter(([key]) => !key.startsWith("_")).map(([, value]) => value).join(" ")));
    return cache.get(row);
  }
  function sourceLink(row) { return row.url || row.original_url || row.content_url || row.source_url || ""; }
  function hasTranslation(row) { return row._has_translation != null ? !!row._has_translation : !!(row.content_cn || row.chinese_trans || row.chinese_translation); }
  function hasOriginal(row) { return row._has_original != null ? !!row._has_original : !!row.original_content; }
  function filter(entries, state, institutions, now = new Date()) {
    const range = dateRange(state, now), tokens = core.parseQuery(state.q), source = core.normalize(state.source).trim();
    const map = institutions instanceof Map ? institutions : new Map(institutions.map((i) => [i.ktid, i]));
    let rows = entries.filter(({ angle, r }) => {
      const inst = map.get(r.ktid) || {};
      if (state.angle !== "all" && angle !== state.angle) return false;
      if (state.ids.length && !state.ids.includes(String(r.ktid))) return false;
      if (state.type && inst.type !== state.type || state.country && inst.country !== state.country) return false;
      if (state.platforms.length && (angle !== "social" || !state.platforms.includes(r.platform))) return false;
      if (state.risks.length && (angle !== "clue" || !state.risks.includes(r.risk_level || "未判定"))) return false;
      if (state.tags.length && (angle !== "news" || !state.tags.includes(r.tag || "未分类"))) return false;
      if (state.account && (angle !== "social" || `${r.platform}:${r.account_handle || r.account_name || ""}` !== state.account)) return false;
      if (state.language && r.language !== state.language) return false;
      if (state.translation === "yes" && !hasTranslation(r) || state.translation === "missing" && !(hasOriginal(r) && !hasTranslation(r))) return false;
      if (state.media && !(r._media_types || []).includes(state.media)) return false;
      if (state.missing === "publish_time" && r.publish_time || state.missing === "url" && core.safeUrl(sourceLink(r)) || state.missing === "risk" && (angle !== "clue" || r.risk_level)) return false;
      if (tokens.length && !core.matches(text(r) + " " + core.normalize(inst.cn + " " + inst.en), tokens, state.mode)) return false;
      if (source && !core.normalize([r.publish_source, r.publisher_website, r.publish_subject, r.account_name, r.account_handle, sourceLink(r)].join(" ")).includes(source)) return false;
      const day = recordDay(dateValue(r, state.dateField));
      if ((range.from || range.to) && (!day || range.from && day < range.from || range.to && day > range.to)) return false;
      for (const name of METRICS) {
        const min = state[name + "Min"], max = state[name + "Max"];
        if ((min !== "" && min != null) || (max !== "" && max != null)) {
          const value = angle === "social" ? metric(r, name) : null;
          if (value == null || min !== "" && min != null && value < Number(min) || max !== "" && max != null && value > Number(max)) return false;
        }
      }
      if (METRICS.includes(state.sort) && (angle !== "social" || metric(r, state.sort) == null)) return false;
      return true;
    });
    const scores = new Map();
    if (state.sort === "relevance") rows.forEach((entry) => scores.set(entry, core.relevance(entry.r.title_cn || entry.r.title || "", text(entry.r), tokens)));
    rows.sort((a, b) => {
      if (METRICS.includes(state.sort)) {
        const x = a.angle === "social" ? metric(a.r, state.sort) : null, y = b.angle === "social" ? metric(b.r, state.sort) : null;
        if (x == null && y != null) return 1;
        if (y == null && x != null) return -1;
        if (x != null && y != null && x !== y) return y - x;
      }
      return (state.sort === "relevance" ? scores.get(b) - scores.get(a) : 0) || core.compareDates(dateValue(a.r, state.dateField), dateValue(b.r, state.dateField), state.sort === "oldest") || String(a.r.id).localeCompare(String(b.r.id));
    });
    const matched = rows.length;
    if (state.limit) rows = rows.slice(0, state.limit);
    return { entries: rows, matched, range };
  }
  function groups(entries, field) {
    const counts = new Map();
    for (const entry of entries) {
      const value = field === "institution" ? String(entry.r.ktid) : field === "risk" ? entry.angle === "clue" ? entry.r.risk_level || "未判定" : null : field === "tag" ? entry.angle === "news" ? entry.r.tag || "未分类" : null : field === "platform" ? entry.angle === "social" ? entry.r.platform || "未提供" : null : entry.angle;
      if (value != null) counts.set(value, (counts.get(value) || 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  }
  function periodComparison(entries, state, institutions, now = new Date()) {
    const end = beijingDay(now), from = shiftDay(end, -6), previousTo = shiftDay(from, -1), previousFrom = shiftDay(from, -7);
    const basic = { ...state, period: "custom", limit: 0, page: 1 };
    const current = filter(entries, { ...basic, from, to: end }, institutions, now).entries;
    const previous = filter(entries, { ...basic, from: previousFrom, to: previousTo }, institutions, now).entries;
    return { from, to: end, previousFrom, previousTo, current: current.length, previous: previous.length, change: current.length - previous.length, percent: previous.length ? (current.length - previous.length) / previous.length * 100 : null };
  }
  return { METRICS, list, count, metric, beijingDay, recordDay, shiftDay, dateValue, dateRange, parse, serialize, validate, filter, groups, periodComparison, sourceLink };
});
