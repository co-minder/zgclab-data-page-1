/* Shared query, sorting and export rules. Runs in browsers and Node. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ZGCLAB_CORE = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const normalize = (value) => String(value == null ? "" : value).normalize("NFKC").toLowerCase();

  function parseQuery(value) {
    const tokens = [];
    const pattern = /(-?)(?:"([^"]+)"|“([^”]+)”|(\S+))/g;
    let match;
    while ((match = pattern.exec(normalize(value)))) {
      const text = (match[2] || match[3] || match[4] || "").trim();
      if (text) tokens.push({ text, exclude: match[1] === "-" });
    }
    return tokens;
  }

  function matches(text, tokens, mode) {
    const normalized = normalize(text);
    if (tokens.some((token) => token.exclude && normalized.includes(token.text))) return false;
    const positive = tokens.filter((token) => !token.exclude);
    return !positive.length || (mode === "any"
      ? positive.some((token) => normalized.includes(token.text))
      : positive.every((token) => normalized.includes(token.text)));
  }

  function relevance(title, text, tokens) {
    const a = normalize(title), b = normalize(text);
    return tokens.reduce((sum, token) => token.exclude ? sum : sum +
      (a.includes(token.text) ? 8 : 0) + Math.min(6, b.split(token.text).length - 1), 0);
  }

  function dateDay(value) {
    const match = String(value || "").match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
    return match ? match.slice(1).join("-") : "";
  }

  function validDay(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
    const dt = new Date(value + "T00:00:00Z");
    return Number.isFinite(dt.getTime()) && dt.toISOString().slice(0, 10) === value;
  }

  function withinDates(value, from, to) {
    const d = dateDay(value);
    return (!from && !to) || (!!d && (!from || d >= from) && (!to || d <= to));
  }

  function time(value) {
    if (!value) return null;
    const parsed = Date.parse(String(value).replace(" ", "T"));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function compareDates(a, b, oldest) {
    const x = time(a), y = time(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return oldest ? x - y : y - x;
  }

  function safeUrl(value) {
    const raw = String(value || "").trim();
    if (!/^https?:\/\//i.test(raw)) return "";
    try { const url = new URL(raw); return /^https?:$/.test(url.protocol) ? url.href : ""; }
    catch (_) { return ""; }
  }

  function csvCell(value) {
    let text = String(value == null ? "" : value);
    if (/^[\s\uFEFF]*[=+@-]/.test(text) && !/^-?\d+(?:\.\d+)?$/.test(text.trim())) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function csv(headers, rows) {
    return "\ufeff" + [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
  }

  function pageNumber(value, total, size) {
    return Math.min(Math.max(1, Math.floor(Number(value)) || 1), Math.max(1, Math.ceil(total / size)));
  }

  return { normalize, parseQuery, matches, relevance, dateDay, validDay, withinDates, compareDates, safeUrl, csvCell, csv, pageNumber };
});
