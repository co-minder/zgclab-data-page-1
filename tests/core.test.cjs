const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../core.js");

test("query phrases, exclusions, all/any matching, and full-width normalization", () => {
  const tokens = core.parseQuery('"climate policy" ＯｐｅｎＡＩ -military');
  assert.equal(core.matches("OpenAI climate policy report", tokens), true);
  assert.equal(core.matches("OpenAI climate policy military report", tokens), false);
  assert.equal(core.matches("OpenAI climate change policy", tokens), false);
  assert.equal(core.matches("OpenAI research", tokens, "any"), true);
  assert.equal(core.matches("military OpenAI", tokens, "any"), false);
  assert.equal(core.matches("security policy", core.parseQuery("-weapons")), true);
});

test("date bounds are inclusive and exclude undated records when a range is set", () => {
  assert.equal(core.withinDates("2026-09-30T23:59:00-05:00", "2026-09-01", "2026-09-30"), true);
  assert.equal(core.withinDates("2026-10-01", "2026-09-01", "2026-09-30"), false);
  assert.equal(core.withinDates("", "2026-09-01", ""), false);
  assert.equal(core.withinDates("", "", ""), true);
  assert.equal(core.validDay("2026-02-30"), false);
  assert.equal(core.validDay("2024-02-29"), true);
});

test("both sort directions keep missing dates at the end and respect offsets", () => {
  const dates = ["", "2026-09-01T10:00:00Z", "2026-09-01T08:00:00-05:00"];
  assert.deepEqual([...dates].sort((a, b) => core.compareDates(a, b, false)), [dates[2], dates[1], ""]);
  assert.deepEqual([...dates].sort((a, b) => core.compareDates(a, b, true)), [dates[1], dates[2], ""]);
});

test("CSV preserves quotes/newlines and blocks spreadsheet formulas", () => {
  assert.equal(core.csvCell('a,"b"\nc'), '"a,""b""\nc"');
  assert.equal(core.csvCell("=HYPERLINK(\"https://example.com\")").startsWith('"\''), true);
  assert.equal(core.csvCell("  +cmd").startsWith('"\''), true);
  assert.equal(core.csvCell(-12), '"-12"');
  assert.equal(core.csv(["标题"], [["内容"]]).startsWith("\ufeff"), true);
});

test("only absolute HTTP(S) source links are accepted", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,test", "file:///secret", "/relative", "example.org"]) assert.equal(core.safeUrl(url), "");
  assert.equal(core.safeUrl("https://example.org/item?id=1"), "https://example.org/item?id=1");
});

test("page clamps and title-weighted relevance", () => {
  assert.equal(core.pageNumber(9, 3, 25), 1);
  assert.equal(core.pageNumber(-2, 100, 25), 1);
  assert.equal(core.pageNumber("oops", 100, 25), 1);
  const q = core.parseQuery("OpenAI");
  assert.ok(core.relevance("OpenAI report", "research", q) > core.relevance("Report", "OpenAI", q));
});
