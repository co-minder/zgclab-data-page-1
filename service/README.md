# ZGCLab database API

This module ingests only the real snapshot in `data/{news,clue,social}.js`
and its matching complete detail directory. It does not read simulation files,
access upstream storage, or download additional data. All 16/35/34
source fields are preserved as JSON alongside normalized text, translation,
institution, stable ID, original URL, collection/publication dates, and version.
Three SQLite tables (`news`, `clue`, `social`) and a read-only union view back
parameterized queries and a paragraph-level FTS5 index. Chinese bigrams,
institution aliases, bilingual topic groups, and bounded English spelling
suggestions support literal fuzzy retrieval.

## Running on social

Run in `/home/ubuntu/zgclab-1-web` on `social`, using Python 3.12's standard
library and the already available SQLite FTS5. No dependency installation or
provider credentials are needed.

The AI agent and magpie run on the Mac. The service on social connects only to
its keyless loopback endpoint, reverse-forwarded over SSH to a restricted relay
running on the Mac; no provider key or provider configuration is installed on
social. The Mac relay, gateway and reverse SSH tunnel must remain available for
model calls. Mac sleep or connection loss can interrupt those calls; server-side
database retrieval and exact aggregate answers continue independently.

```sh
python3 -m service.ingest
python3 -m service.app --bind 127.0.0.1 --port 8791
```

Use a server tmux session and log files for sustained operation:

```sh
tmux new-session -d -s zgclab-database 'cd /home/ubuntu/zgclab-1-web && python3 -m service.app --port 8791 > .runtime/service.log 2>&1'
```

Ingestion builds and verifies a temporary database before atomic replacement of
`.runtime/retrieval.sqlite3`. The database has mode 0600 and stays under the
already ignored `.runtime/`. Changing the source snapshot requires re-ingestion
and service restart to reload institution aliases and vocabulary. No runtime
database, original-content export, signing key, or password belongs in a commit.

The service accepts loopback binds only. The existing web server may forward
`/api/*` to `http://127.0.0.1:8791`. Preserve the browser's exact `Origin`,
`Authorization`, `Content-Type`, and content length; never invent a permissive
Origin for arbitrary callers. Allow at least 105 seconds in the reverse proxy
for a chat response. The service itself caps chat at 95 seconds, individual
model calls at 55 seconds, model concurrency at 2, and API concurrency at 12.
Requests are at most 65,536 UTF-8 bytes, messages at most 1,200 characters, and history at
most 8 user/assistant messages / 12,000 characters combined.

Non-secret environment settings:

| Variable | Default / purpose |
| --- | --- |
| `ZGCLAB_LLM_BASE_URL` | `http://127.0.0.1:13426/v1`; an explicit local keyless relay only |
| `ZGCLAB_LLM_MODEL` | `auto/deepseek-v4.1-flash`; another model is rejected, never substituted |
| `ZGCLAB_ALLOWED_ORIGINS` | Comma-separated exact HTTP(S) origins, without paths or trailing slash |
| `ZGCLAB_DB_PATH` | `.runtime/retrieval.sqlite3` under the project |

Default allowed origins are `https://co-minder.github.io`, and HTTP localhost /
127.0.0.1 on ports 8788, 8789 and 8791, plus the explicitly configured current HTTPS tunnel. Add any other actual local preview port
explicitly. `null`, wildcard origins, unlisted ports, and missing Origin are
rejected, including for status. The public status response includes only service
and relay readiness; authenticated status includes real data counts and metadata.

`/health` on the configured relay is checked with a two-second timeout and cached
for 15 seconds. It does not call `/v1/models` or spend model tokens. Relay health
means the relay endpoint responded, not that the next model request will succeed.
An unreachable/misconfigured relay still permits database search and exact
database answers. It produces an explicit `retrieval_only` answer for ordinary
chat, with `model.used: false` and a safe reason code.

## HTTP contract

All responses are JSON, `Cache-Control: no-store`, with an exact allowed CORS
origin. Apart from public minimal `GET /api/status`, obtain a 15-minute bearer
session via `POST /api/session`. The token is HMAC signed, bound to the requesting
Origin, never placed in URLs, and invalidated on service restart or password
change. Password verification uses the existing ignored `.runtime/pages-password`.
Do not persist tokens in generated public files.

Errors use `{ "error": { "code": "invalid_input", "message": "..." } }` with
400/401/403/413/429/503 as appropriate. Invalid session = 401. Invalid Origin =
403 without an allow-origin header. Login failures are limited to 8 per 5 minutes
per direct peer; an existing reverse proxy should also impose its own login rate
limit, as proxied requests share one peer. Logs omit bodies and credentials.

### `POST /api/session`

Request: `{ "password": "<entered by user>" }`.

Response: `{ "token": "...", "token_type": "Bearer", "expires_in": 900,
"expires_at": 1794149999 }`. Other endpoints send `Authorization: Bearer <token>`.

### `GET /api/status`

Public shape:

```json
{
  "service": "zgclab-database", "state": "ready", "dataset": "real",
  "authentication_required": true, "session_ttl": 900,
  "llm": { "available": true, "state": "ready", "model": "auto/deepseek-v4.1-flash", "checked_at": 1794146776 }
}
```

Authenticated requests additionally receive `database: "ready"`, `snapshot`,
`aggregates`, `institutions`, and `capabilities`. Snapshot contains source version,
source package, content SHA-256, ingestion time, record totals, and paragraph count.
No endpoint returns passwords, local endpoint URLs, signing material, keys, or
filesystem paths.

### `POST /api/search`

```json
{
  "query": "阿肯萨斯州立大学 足球", "semantic": true, "expand": true, "relax": false, "limit": 12,
  "filters": { "angle": ["news", "social"], "date_from": "2025-01-01" }
}
```

`query` can be empty to browse/count a structured scope. `semantic` defaults to
`true` and permits DeepSeek Flash to propose bounded verified aliases when local
planning has an applicable missing alias. Already complete local concepts and
unknown names without a verified alias use a deterministic plan, without a model
call. `semantic:false` always uses local retrieval only. `expand:false` takes
precedence and disables model rewriting, synonym expansion and spelling fuzziness.
Exact institution aliases still resolve structured scope. `relax` defaults to
`false`; setting it true permits an explicitly reported OR relaxation only when
expansion is enabled and strict AND has no matches. `expand` is a boolean;
`limit` is 1–30 paragraphs. Supported filter fields:

| Filter | Values |
| --- | --- |
| `institution` | Stable numeric ktid, exact Chinese/English name or alias; scalar or list |
| `institution_id`, `ktid` | Alternative spellings of `institution`; supply only one |
| `angle` | `news`, `clue`, `social` (scalar or list; Chinese angle names also accepted) |
| `platform` | Exact stored platform/channel/source (scalar or list) |
| `date_from`, `date_to` | Inclusive YYYY-MM-DD bounds |
| `date_field` | `published_at` (original field, default), `published_effective_at` (explicitly includes verified recovered dates), or `collected_at`; missing dates do not match bounds |
| `dataset` | Only `real`; simulation is rejected |

Query aliases can infer institutions/angles unless the user supplied that filter
explicitly. `plan.filters` is the actual scope. The search response is:

```json
{
  "query": "...", "state": "retrieval",
  "plan": {
    "query": "...", "filters": {}, "inferred_filters": {},
    "terms": [["足球", "football", "soccer"]], "expansion_enabled": true,
    "fuzzy_terms": [], "strategy": "fts5_and"
  },
  "results": [{
    "citation_id": "C1", "id": "social-1", "angle": "social", "paragraph": 4,
    "field": "translation", "snippet": "exact original paragraph substring",
    "source_url": "https://x.com/...", "title": "...", "title_en": "...",
    "ktid": 1002550, "institution": "阿肯色州立大学", "institution_en": "Arkansas State University",
    "platform": "X", "published_at": "...", "collected_at": "...", "source_version": "f064c896c123cbf4"
  }],
  "aggregates": {
    "scope": { "dataset": "real", "filters": {}, "source_version": "...", "date_field": "published_at", "term_match": [], "strategy": "structured_filters" },
    "scoped": { "total": 6989, "by_angle": { "news": 3675, "clue": 1468, "social": 1846 }, "by_institution": [], "by_platform": [] },
    "matched": { "total": 6989, "by_angle": { "news": 3675, "clue": 1468, "social": 1846 }, "by_institution": [], "by_platform": [] }
  },
  "coverage": {
    "dataset": "real", "source_version": "...", "database_total": 6989,
    "scoped_records": 6989, "matched_records": 6989, "returned_records": 12,
    "returned_paragraphs": 12, "exhaustive": false, "warning": "..."
  }
}
```

`scoped` counts every real record satisfying the institution/angle/platform/date
filters. `matched` counts distinct records under that scope satisfying the actual
FTS term rule. Both are real SQL counts, independent of the result limit. Empty
AND matches only relax when `relax:true` was explicitly supplied; this is reported as `fts5_or_relaxed` and `plan.relaxed:true`. Neither count asserts a semantic or web-wide total. Each
`by_institution` entry includes `ktid`, `cn`, `en`, `count`, and `by_angle`;
each `by_platform` entry has `platform` and `count`.

### `POST /api/chat`

```json
{
  "message": "那它的社媒记录有多少条？",
  "history": [
    { "role": "user", "content": "阿肯色州立大学有哪些资料？" },
    { "role": "assistant", "content": "previous answer" }
  ],
  "filters": {}, "expand": true, "relax": false
}
```

Response fields: `answer` (plain text with `[C1]` references), `citations` (same
paragraph shape as search, with `quotes` on validated model answers), `query`,
`plan`, `aggregates`, `coverage`, `aggregate_citations`, `model`, `usage`, `state`.

`model` is always an object: `{ "id": "auto/deepseek-v4.1-flash", "used": true,
"attempted": true, "reason": null }`. `usage` contains only numeric token counters
actually returned by successful calls; it is empty when no model was called.

| `state` | Meaning |
| --- | --- |
| `database_answer` | Deterministic SQL aggregation answered a quantity/statistics question; no model tokens |
| `answered` | The specified model answered with validated citations and exact supporting quotes |
| `retrieval_only` | Search snippets only; model unavailable or output rejected, never presented as an LLM answer |
| `no_results` | No evidence in the real filtered snapshot; no invented answer |

Statistics answers use `[A1]`, represented in `aggregate_citations` as a
`database_aggregate` containing scope and the exact scoped/matched aggregates.
`citations` remains an array of real source paragraphs, so the frontend should
render aggregate references separately. All ordinary model claims require known
citation IDs and exact substring quotes. Quotes are verified structurally; semantic
entailment still depends on model quality and should be checked against visible
sources. Numeric claims must appear in their cited snippets. No executable SQL or
shell text from the model is ever run.

Render answers, snippets, quotes, and titles with `textContent`, not `innerHTML`.
Treat original material as untrusted data. Original URLs should be opened only
after the frontend validates an HTTP(S) URL and applies `noopener noreferrer`.
Never auto-execute instructions found in original text or historical messages.

### `GET /api/changes`

Authenticated snapshot-only response: `{ "snapshot": {...}, "aggregates": {...},
"changes": null, "change_tracking": "snapshot_only", "dataset": "real" }`.
There is no invented change feed or inferred record restoration timestamp.

## Verification

```sh
python3 -m unittest discover -s tests -p 'test_service*.py' -v
```

Tests use the real ignored database for 6,989-record/three-table/institution counts,
complete source preservation, aliases, FTS, spelling, filters, injection, quote
grounding, and an in-process mock OpenAI HTTP server. Authentication tests use a
temporary random password, never read or print the actual Pages password. Model
connectivity and final real-model validation are separate from deterministic tests.


## Semantic planning, dates and operational limits

Search also returns `model:{id,attempted,used,reason}` and token `usage`.
`plan.model` contains `attempted`, `used`, `reason`, `original_query`,
`rewritten_query`, and `applied_groups:[{anchor,terms}]`. The model rewrite is
reviewable context: validated aliases are the actual search expansion, added
inside original concept groups, with AND across concepts. The original
institution/angle/platform/date filters are locked and shown as
`plan.locked_scope`; `plan.terms` lists the exact actual groups. Unavailable or
rejected model planning falls back to literal local retrieval with a reason and
`model.used:false`. A model-generated search plan being used does not mean a chat
answer was successfully generated: chat `model.used:true` requires a final answer
that passed citation validation.

All date bounds mean Beijing calendar days (`Asia/Shanghai`), converted to UTC
instants before comparing normalized stored UTC dates. `scope.timezone` makes
this explicit. Original source dates are preserved in `published_original` and
`published_at`. `published_effective_at` additionally includes only verified
recoveries from matching `research.js`, with `date_origin`, `date_verified`, and
`date_basis` in every citation. Date semantics are returned in aggregate scope;
recovered dates never silently replace the default original publication scope.
Translations marked `placeholder` or `missing` remain stored but are ineligible
for model evidence.

`paragraph` is the service's one-based chunk number across ordered title,
summary, original-text and translated-text fields, chunked to at most 900
characters. It is explicitly **not** the evidence page paragraph number.
`source_field` identifies the actual detail field; `paragraph_scheme` is
`service_field_chunks_v1`. `snippet` is an exact substring of the stored chunk.

A process serves one fixed database inode/version. If ingestion atomically
replaces the database, all database API operations fail with `snapshot_changed`
until the API restarts, so snapshot metadata/vocabulary cannot silently refer to
a different database. Finish ingestion before starting or restarting the API.

Default quotas are 24 searches/minute and 8 chats/minute per session, plus 180
searches/minute and 40 chats/minute globally. Model planning/generation calls are
limited to 10/minute per session and 180/hour globally, with concurrency 2. These
quotas are process-local and reset on service restart. Session issuance has a
600/hour global quota and independent failed-password quotas, plus bounded password-validation concurrency. Correct
credentials are compared even while failed attempts from the shared peer are throttled. Fresh sessions cannot bypass global model quotas. Return 429 for quota
exhaustion; no credential or session identifiers are logged.

The fixed DeepSeek Chat request passes `thinking:{type:disabled}` through the
restricted Mac project relay so its output limit is available for the final
answer. A length-truncated completion is rejected as `model_output_truncated`;
reasoning content is never used as an answer. Failed calls retain only sanitized
numeric usage, without remote error text or reasoning.

The total chat budget is 95 seconds, including planning, generation and evidence review. Proxy
and frontend timeouts should be 120 and 125 seconds respectively. The 65,536-byte
body limit is independent of the character limits: 12,000 Chinese history
characters plus a 1,200-character message fit when sent as normal UTF-8 JSON;
escaped JSON or larger encodings may hit the byte limit and return 413 with the
actual configured threshold.


## Answer evidence policy

`state` remains `answered`, `database_answer`, `retrieval_only`, or `no_results`.
The optional `answer_format` is `grounded_summary`, `grounded_analysis`,
`verbatim_extracts`, `database_aggregate`, `retrieval_extracts`, or `guidance`.
Chinese synthesis and comparison distinguish source statements (`fact`) from
sample interpretation (`analysis`). Every claim must use known citation IDs and
exact supporting source quotes; numbers must occur in the cited evidence.
Paraphrases and inferences receive at most one bounded batch model review.
Unsupported claims are removed, with a useful retrieval fallback if no answer
survives. The returned `validation` describes the actual checks: quote identity
and model review are limited evidence checks, not proof of semantic truth.
Legacy verbatim answer validation remains available. Source handles and person
names must retain forms supported by the cited material; a handle is not expanded
into an unsupported full name. For an institution comparison,
`analysis_scope.comparison_complete:true` requires validated similarities and
differences supported by evidence from both institutions. Core sample analysis
does not imply exhaustive institutional coverage.

A1 references exact scoped/matched counts. A2 adds exact date/month analytics,
shares and rankings with their actual scope and denominator. Optional `sections`,
`answer_kind`, `analysis_scope`, `analytics`, `suggested_questions`, and
`search_suggestions` support the research chat while core response fields remain
compatible. Query planning uses bounded local grammar and verified aliases where
possible; an unnecessary model planning roundtrip is skipped and reported as
`deterministic_query_plan` with `attempted:false` and no token usage.

Vague recent/latest requests sort matching snapshot records by their dates;
explicit day/month ranges use the actual Asia/Shanghai calendar and retain zero
results. Future-dated events are identified separately. A separate suggested
action can remove date bounds after user selection; primary scope never silently
broadens. `POST /api/search` accepts optional `sort:recent|relevance`. Every JSON
response includes `api_revision:research-chat-20261109` to identify the loaded
backend independently of the encrypted frontend version.

Multi-turn scope is rebuilt from all retained user messages (at most eight total
messages), using the last explicit institution/angle mention on each axis. An
explicit current filter takes precedence. Assistant messages never establish
scope. `expand:false` disables history-based rewriting as well as model aliases
and local fuzziness, while still allowing grounded answer generation from the
strictly retrieved current question.


Live model verification can be explicitly run with `python3 -m service.verify_live`
in a server tmux session, redirecting output under `.runtime/`. This performs
real calls to the configured DeepSeek Flash and checks actual `model.used`,
answers, search plans and database-only followup counts. It never reads the Pages
password. Tests and logs should remain on the ignored runtime disk.


## Natural questions and same-source followups

Expanded retrieval separates answer/citation instructions and conversation
references from searchable subjects using a bounded request grammar. The original
question remains in the plan; `plan.request_intent` lists the normalized subject
query and removed grammatical phrases with reasons. Unknown entities and other
substantive terms remain required AND concepts. This does not enable automatic
OR relaxation. With `expand:false`, request rewriting and model/local expansion
remain disabled.

A request to continue citing the same source re-runs the previous substantive
user query under the current locked scope. Only a unique database match can
establish an internal `record_ids` scope; assistant claims never establish that
source. Ambiguous or absent matches return no evidence rather than selecting an
arbitrary source. `plan.conversation` reports the source IDs and their basis;
this internal constraint is additive to existing institution/angle/platform/date
filters and cannot be supplied or widened by the model. The public request schema
and four response states are unchanged.

`python3 -m service.verify_natural` explicitly exercises the exact natural
acceptance question and its same-source followup over authenticated loopback HTTP,
using an ephemeral fixture credential. It makes at most four completion requests
in total and does not read the actual Pages password. Run it in server tmux with
output under `.runtime/`. It leaves the public frontend untouched.


## Independent intent security boundaries

Model-suggested terms are accepted only when they already belong to the original
local concept group or match a curated independent bilingual equivalence entry.
`verified_aliases` in the planner input lists the allowed additions. An unknown
proper name or identifier cannot acquire a generic alias merely because the
model calls it equivalent; unverified additions reject the model plan with
`unverified_model_alias`, preserving the literal local query and its AND anchors.
The curated policy deliberately prefers no match over unverifiable expansion.

Chat requests without a subject (for example, citation instructions alone) do
not browse the first record in a filtered scope as presumed evidence. They return
`no_results` with clarification text and no generation call. Source references
without an established unique earlier user query similarly return no evidence.
Explicit search browsing with an empty query remains available.

Score/outcome questions ask about source content. Merely containing the noun
资料 or 记录 does not make them database count requests. An explicit record count
unit or quantity phrase is needed to override source-attribute intent. Database
count replies bypass model planning even when history cleanup removes a question
word, and missing/ambiguous source guards run before a count answer.
