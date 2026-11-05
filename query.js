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
  const EMPTY = "__field_missing__";
  const FACETS = {
    sources: { field: "source", label: "采集来源", angles: ["news", "clue"], help: "采集途径，例如 Google News RSS；与发布媒体分开。" },
    publishSources: { field: "publish_source", label: "发布媒体", angles: ["news"], help: "新闻交付字段中的发布来源，按原值匹配。" },
    channels: { field: "publish_channel", label: "发布渠道", angles: ["clue"] },
    languages: { field: "language", label: "原文语言", angles: ["clue", "social"], help: "语言代码分别匹配；可同时选择 en 和 en-US。" },
    publisherTypes: { field: "publisher_type", label: "发布者类型", angles: ["clue"] },
    publisherDomains: { field: "publisher_domain", label: "发布者域名", angles: ["clue"], help: "例如 dhs.gov；区别于所属行业。" },
    attitudes: { field: "publisher_cn_attitude", label: "对华态度", angles: ["clue"], help: "沿用交付标注，“无法判断”作为独立值，不代表已作出立场结论。" },
    publishSubjects: { field: "publish_subject", label: "发布主体", angles: ["clue"] },
    relatedSubjects: { field: "related_subject", label: "关联主体", angles: ["clue"] },
    industries: { field: "industry", label: "所属行业", angles: ["clue"], help: "按交付字段原值选择，尚未合并近义行业名称。" },
    contentTypes: { field: "content_type", label: "内容类型", angles: ["social"] },
    hashtags: { field: "hashtags", label: "话题标签", angles: ["social"], tokens: true, prefix: "#", help: "只匹配 hashtags 字段中的完整标签，忽略大小写和前导 #。" },
    mentions: { field: "mentions", label: "提及账号", angles: ["social"], tokens: true, prefix: "@", help: "只匹配 mentions 字段中的完整账号，忽略大小写和前导 @。" },
    keywords: { field: "keywords", label: "社媒关键词", angles: ["social"], tokens: true, help: "匹配 keywords 字段中的关键词项，不在正文里模糊匹配。" },
    dataStates: { field: "data_status", label: "数据状态", angles: ["social"] },
    batches: { field: "batch_no", label: "采集批次", angles: ["social"] },
  };
  const cache = new WeakMap(), tokenCache = new WeakMap();
  const dayCache = new Map();
  const beijingFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" });
  const list = (value) => [...new Set((Array.isArray(value) ? value : String(value || "").split(",")).filter(Boolean).map(String))];
  function tokenValues(value) {
    if (Array.isArray(value)) return [...new Set(value.filter((v) => typeof v === "string" || typeof v === "number").map((v) => String(v).trim()).filter(Boolean))];
    const raw = String(value == null ? "" : value).trim();
    if (!raw || /^(?:\[\s*\]|\{\s*\}|null|none)$/i.test(raw)) return [];
    try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) return tokenValues(parsed); } catch (_) { /* Legacy lists may use Python quotes. */ }
    if (/^\[.*\]$/s.test(raw)) {
      const quoted = [...raw.matchAll(/'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"/g)].map((m) => (m[1] == null ? m[2] : m[1]).replace(/\\(['"\\])/g, "$1"));
      return quoted.length ? tokenValues(quoted) : [];
    }
    return tokenValues(raw.split(/[\s,，;；|]+/u));
  }
  function facetValues(row, key) {
    const descriptor = FACETS[key];
    if (!descriptor) return [];
    if (descriptor.tokens) {
      if (!tokenCache.has(row)) tokenCache.set(row, {});
      const parsed = tokenCache.get(row);
      if (!parsed[key]) parsed[key] = tokenValues(row[descriptor.field]);
      return parsed[key];
    }
    const value = String(row[descriptor.field] == null ? "" : row[descriptor.field]).trim();
    return value ? [value] : [];
  }
  function facetNormalize(key, value) {
    const descriptor = FACETS[key];
    let normalized = core.normalize(value).trim();
    if (descriptor && descriptor.prefix) normalized = normalized.replace(descriptor.prefix === "#" ? /^#+/ : /^@+/, "");
    return normalized;
  }
  function facetLabel(key, value) {
    if (value === EMPTY) return "未提供";
    if (key === "languages") {
      const names = { en: "英语", "en-US": "英语（美国）", zh: "中文", "zh-Hans": "简体中文", ar: "阿拉伯语", "ja-JP": "日语（日本）", es: "西班牙语", ro: "罗马尼亚语", et: "爱沙尼亚语", und: "语言未确定", zxx: "无语言内容", art: "人工语言" };
      return names[value] ? `${names[value]} · ${value}` : value;
    }
    if (key === "contentTypes") return ({ post: "原创帖 · post", repost: "转发帖 · repost" })[value] || value;
    const prefix = (FACETS[key] || {}).prefix;
    return prefix ? prefix + String(value).replace(/^[@#]+/, "") : value;
  }
  function facetOptions(entries, key) {
    const descriptor = FACETS[key], counts = new Map();
    for (const { angle, r } of entries) {
      if (!descriptor.angles.includes(angle)) continue;
      const values = facetValues(r, key), seen = new Set();
      for (const value of values.length ? values : [EMPTY]) {
        const normalized = facetNormalize(key, value);
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        const item = counts.get(normalized) || { value, count: 0 };
        item.count += 1; counts.set(normalized, item);
      }
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }
  function setAngle(state, angle) {
    state.angle = angle;
    for (const [key, descriptor] of Object.entries(FACETS)) if (angle !== "all" && !descriptor.angles.includes(angle)) state[key] = [];
    for (const [key, target] of [["platforms", "social"], ["risks", "clue"], ["tags", "news"]]) if (angle !== "all" && angle !== target) state[key] = [];
    if (angle !== "all" && angle !== "social") {
      state.account = "";
      for (const metric of METRICS) for (const suffix of ["Min", "Max"]) state[metric + suffix] = "";
      if (METRICS.includes(state.sort)) state.sort = "newest";
    }
    return state;
  }
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
      account: params.get("account") || "", translation: params.get("translation") || "", media: params.get("media") || "",
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
    for (const key of Object.keys(FACETS)) state[key] = [...new Set(params.getAll(key).filter(Boolean))];
    if (!state.languages.length && params.get("language")) state.languages = [params.get("language")];
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
    for (const key of ["type", "country", "q", "source", "account", "translation", "media", "missing", "version", "read", "sim"]) if (state[key]) params.set(key, state[key]);
    for (const key of Object.keys(FACETS)) for (const value of state[key] || []) params.append(key, value);
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
    let applicable = ANGLES.filter((angle) => state.angle === "all" || state.angle === angle);
    for (const [key, descriptor] of Object.entries(FACETS)) if ((state[key] || []).length) applicable = applicable.filter((angle) => descriptor.angles.includes(angle));
    for (const [key, angle] of [["risks", "clue"], ["tags", "news"], ["platforms", "social"]]) if (state[key].length) applicable = applicable.filter((a) => a === angle);
    if (!applicable.length) return "这些字段属于不同采集角度，请切换角度或移除不适用的筛选条件。";
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
      for (const [key, descriptor] of Object.entries(FACETS)) {
        const selected = state[key] || [];
        if (!selected.length) continue;
        if (!descriptor.angles.includes(angle)) return false;
        const values = facetValues(r, key);
        if (!selected.some((value) => value === EMPTY ? !values.length : values.some((v) => facetNormalize(key, v) === facetNormalize(key, value)))) return false;
      }
      if (state.translation === "yes" && !hasTranslation(r) || state.translation === "missing" && !(hasOriginal(r) && !hasTranslation(r))) return false;
      if (state.media && !(r._media_types || []).includes(state.media)) return false;
      if (state.missing === "publish_time" && r.publish_time || state.missing === "url" && core.safeUrl(sourceLink(r)) || state.missing === "risk" && (angle !== "clue" || r.risk_level)) return false;
      if (tokens.length && !core.matches(text(r) + " " + core.normalize(inst.cn + " " + inst.en), tokens, state.mode)) return false;
      if (source && !core.normalize([r.source, r.publish_source, r.publisher_domain, r.publisher_website, r.publish_subject, r.account_name, r.account_handle, sourceLink(r)].join(" ")).includes(source)) return false;
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
  return { METRICS, FACETS, EMPTY, tokenValues, facetValues, facetNormalize, facetLabel, facetOptions, setAngle, list, count, metric, beijingDay, recordDay, shiftDay, dateValue, dateRange, parse, serialize, validate, filter, groups, periodComparison, sourceLink };
});
