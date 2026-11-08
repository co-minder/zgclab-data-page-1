/* Independent research views over a delivered snapshot. No automatic collection. */
(function (root, factory) {
  "use strict";
  const research = factory();
  if (typeof module === "object" && module.exports) module.exports = research;
  else root.ZGCLAB_RESEARCH_UI = research.render;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const ANGLES = ["news", "clue", "social"];
  const KIND_LABELS = { added: "快照新增", content: "原文 / 标题变更", translation: "译文变更", translated: "补译", metadata: "元数据变更", recovered: "元数据恢复", absent: "当前快照未出现" };
  const CATEGORY_LABELS = { integrity: "完整性与可追溯", coverage: "来源与时间覆盖", documents: "报告、活动与关键人员", relations: "合作关系与多时点互动" };
  const STATUS_LABELS = { none: "未创建待办", todo: "待处理", doing: "进行中", done: "已完成", paused: "暂缓" };
  const OBJECT = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const str = (value) => value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  const present = (value) => value !== null && value !== undefined && str(value).trim() !== "";
  const keyOf = (entry) => entry.angle + ":" + entry.r.id;
  const normalize = (value) => str(value).normalize("NFKC").toLowerCase();
  const escapeHtml = (value) => str(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function safeUrl(value) {
    if (!/^https?:\/\//i.test(str(value).trim())) return "";
    try { const url = new URL(str(value).trim()); return ["https:", "http:"].includes(url.protocol) ? url.href : ""; } catch (_) { return ""; }
  }
  function sourceUrl(row) { return row.url || row.original_url || row.content_url || row.source_url || ""; }
  function recordDate(row) { return row.publish_time || row.founddate || row.discovery_time || row.collected_time || ""; }
  function compareDates(a, b) {
    const parse = (value) => { const t = Date.parse(str(value).replace(" ", "T")); return Number.isFinite(t) ? t : null; };
    const x = parse(a), y = parse(b);
    return x == null ? y == null ? 0 : 1 : y == null ? -1 : y - x;
  }
  function isPlaceholder(value) {
    const text = str(value).trim();
    return !!text && (/^(?:\[|【|\()?\s*(?:无法翻译|翻译失败|暂无翻译|待翻译|待译|暂无译文|翻译待补|尚未翻译|未翻译|译文缺失|翻译缺失|待补译|中文翻译待补|translation\s+(?:pending|unavailable|failed)|not\s+translated|placeholder|todo\b|n\/?a\b)/i.test(text) || /^(?:中文翻译|译文|翻译)\s*[:：]?\s*(?:待补充|待完成|待处理|占位|未提供|暂无|缺失)/.test(text));
  }
  function paragraphs(value) {
    const text = str(value).replace(/\r\n?/g, "\n").trim();
    if (!text) return [];
    return text.split(/\n\s*\n|\n/).map((part) => part.trim()).filter(Boolean);
  }
  function firstField(fields, keys) { return keys.find((key) => present(fields[key])) || ""; }
  function evidenceModel(angle, row, detail) {
    const fields = { ...row, ...OBJECT(detail && detail.fields) };
    const originalKey = firstField(fields, angle === "news" ? ["content", "original_content"] : ["original_content", "content"]);
    const translationKey = firstField(fields, angle === "news" ? ["content_cn", "chinese_trans", "chinese_translation"] : angle === "clue" ? ["chinese_trans", "chinese_translation", "content_cn"] : ["chinese_translation", "chinese_trans", "content_cn"]);
    const original = str(fields[originalKey]), translation = str(fields[translationKey]);
    const candidates = detail && (detail.pdf_pages || detail.parsed_pages) || fields.pdf_pages || fields.parsed_pages;
    const pages = (Array.isArray(candidates) ? candidates : []).filter((page) => Number.isInteger(Number(page.page_number || page.page)) && Number(page.page_number || page.page) > 0 && present(page.text || page.original_text)).map((page) => ({ page: Number(page.page_number || page.page), text: str(page.text || page.original_text) }));
    return { fields, original, translation, originalKey, translationKey, originalParts: paragraphs(original), translationParts: paragraphs(translation), placeholder: isPlaceholder(translation), pages, fullDetail: !!(detail && detail.fields) };
  }
  function canonicalUrl(value) {
    const valid = safeUrl(value);
    if (!valid) return "";
    const url = new URL(valid); url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^(?:utm_|ref_src$|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.origin.toLowerCase() + url.pathname.replace(/\/$/, "") + (url.search ? url.search : "");
  }
  function linksIn(value) {
    return [...new Set((str(value).match(/https?:\/\/[^\s<>"'\\\[\]]+/gi) || []).map((link) => canonicalUrl(link.replace(/[.,;，。；)）]+$/, ""))).filter(Boolean))];
  }
  const STOP_WORDS = new Set("the and for from with that this have has are was were into over about will your their our its news events event webinar global affairs expert resources education official state post share video watch new www com https http on in to of at by an as is be it a x".split(" "));
  function titleKeywords(row) {
    let title = str(row.title_en || row.title || row.clue_title || row.title_cn);
    if (/\(@[^)]+\) on (?:X|Twitter)/i.test(title)) title = str(row.original_content);
    title = normalize(title.replace(/https?:\/\/\S+/g, " "));
    const tokens = [];
    for (const match of title.match(/[\p{Script=Han}]+|[\p{L}\p{N}][\p{L}\p{N}'’-]{2,}/gu) || []) {
      if (/\p{Script=Han}/u.test(match)) {
        if (match.length <= 6 && match.length >= 2) tokens.push(match);
        else for (let i = 0; i < match.length - 1; i++) tokens.push(match.slice(i, i + 2));
      } else if (!STOP_WORDS.has(match) && !/^\d+$/.test(match)) tokens.push(match);
    }
    return [...new Set(tokens)];
  }
  function relatedCandidates(seed, entries, detail) {
    const model = evidenceModel(seed.angle, seed.r, detail), seedRow = { ...seed.r, ...model.fields };
    const source = canonicalUrl(sourceUrl(seedRow)), linked = new Set(linksIn([model.original, seedRow.raw_json, seedRow.attachment_urls].join("\n")));
    const keywords = new Set(titleKeywords(seedRow)), result = [];
    for (const entry of entries) {
      if (keyOf(entry) === keyOf(seed)) continue;
      const url = canonicalUrl(sourceUrl(entry.r)), reasons = [];
      if (source && url === source) reasons.push({ type: "url", text: "原文 URL 相同（忽略常见跟踪参数）" });
      if (url && linked.has(url)) reasons.push({ type: "link", text: "本条原文中的链接指向该候选 URL" });
      if (source && linksIn([entry.r.original_content, entry.r.content, entry.r.source_url].join("\n")).includes(source)) reasons.push({ type: "backlink", text: "该候选索引中的链接指向本条 URL" });
      const overlap = titleKeywords(entry.r).filter((token) => keywords.has(token));
      if (overlap.length >= 2 || overlap.some((token) => token.length >= 7)) reasons.push({ type: "keywords", text: "标题 / 帖文关键词重合：" + overlap.slice(0, 6).join("、") });
      if (reasons.length) result.push({ ...entry, reasons });
    }
    return result.sort((a, b) => compareDates(recordDate(a.r), recordDate(b.r)) || keyOf(a).localeCompare(keyOf(b)));
  }
  function stableString(value) {
    if (Array.isArray(value)) return "[" + value.map(stableString).join(",") + "]";
    if (value && typeof value === "object") return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + stableString(value[key])).join(",") + "}";
    return JSON.stringify(value == null ? null : value);
  }
  // Internal comparison signature; this is never presented as a source object hash.
  function signature(value) {
    const text = stableString(value); let a = 2166136261, b = 5381;
    for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ text.charCodeAt(i); }
    return (a >>> 0).toString(16) + (b >>> 0).toString(16);
  }
  function sidecarRow(research, angle, id) {
    if (!research) return {};
    if (typeof research.recordFor === "function") { try { return OBJECT(research.recordFor(angle, id)); } catch (_) { return {}; } }
    const records = OBJECT(research.records);
    const result = OBJECT(records[id] || records[angle + ":" + id] || OBJECT(records[angle])[id]);
    return result.angle && result.angle !== angle ? {} : result;
  }
  function snapshotFor(entries, meta, research, now = new Date().toISOString()) {
    const records = Object.create(null); let complete = 0;
    for (const { angle, r } of entries) {
      const extra = sidecarRow(research, angle, r.id), hashes = OBJECT(extra.fingerprints || extra.hashes);
      const originalHash = OBJECT(extra.evidence).snapshot_original_sha256 || hashes.original || hashes.content || extra.original_hash;
      const translationHash = OBJECT(extra.evidence).snapshot_translation_sha256 || hashes.translation || extra.translation_hash;
      if (originalHash && translationHash) complete++;
      const selected = (keys) => keys.map((key) => [key, r[key] == null ? null : r[key]]);
      const bodyKeys = ["content", "original_content", "title", "title_en", "title_cn"];
      const translationKeys = ["content_cn", "chinese_trans", "chinese_translation"];
      const ignored = new Set([...bodyKeys, ...translationKeys, "id", "ktid", "content_hash", "raw_json"]);
      const metadata = Object.fromEntries(Object.entries(r).filter(([key]) => !key.startsWith("_") && !ignored.has(key)));
      const publication = OBJECT(extra.publication), translation = OBJECT(extra.translation), evidence = OBJECT(extra.evidence);
      const missing = ["publish_time", "language", "author", "document_type", "account_id"].filter((key) => !present(key === "publish_time" ? publication.effective || r[key] : r[key] || extra[key]));
      if (!safeUrl(sourceUrl(r))) missing.push("source_url");
      for (const key of evidence.missing || []) if (!missing.includes(key)) missing.push(key);
      const translatedText = translationKeys.map((key) => r[key]).find(present);
      const translated = translation.status ? translation.status === "available" : typeof extra.has_translation === "boolean" ? extra.has_translation : present(translatedText) ? !isPlaceholder(translatedText) : !!r._has_translation;
      records[angle + ":" + r.id] = { angle, id: r.id, ktid: r.ktid, date: publication.effective || recordDate(r), title: str(r.title_cn || r.title_en || r.title || r.account_name || r.id).slice(0, 180), content: signature([originalHash || selected(bodyKeys), selected(["title", "title_en", "title_cn"]), evidence.original_chars ?? null]), translation: signature([translationHash || selected(translationKeys), translation.status || "", evidence.translation_chars ?? null]), translated, metadata: signature(hashes.metadata || [metadata, publication, extra.doc_type || null, evidence.original_path || null, evidence.source_hash || r.content_hash || null, evidence.missing || null]), missing };
    }
    return { schema: 1, comparison: 2, version: str(meta.version), establishedAt: now, records, total: entries.length, fullFingerprintCount: complete };
  }
  const MISSING_FIELDS = ["publish_time", "language", "author", "document_type", "account_id", "source_url", "original_title", "translated_title", "collected_at", "discovered_at", "original_path", "source_hash"];
  function snapshotRecord(key, row) {
    if (!Array.isArray(row)) return row;
    const split = key.indexOf(":"), angle = key.slice(0, split), id = key.slice(split + 1);
    return { angle, id, content: row[0], translation: row[1], metadata: row[2], translated: row[3] === 1, missing: typeof row[4] === "number" ? MISSING_FIELDS.filter((field, index) => (row[4] & (1 << index)) !== 0) : str(row[4]).split("|").filter(Boolean), ktid: row[5], date: row[6] || "", title: id };
  }
  function compactSnapshot(snapshot) {
    const records = Object.create(null);
    for (const [key, raw] of Object.entries(snapshot.records)) {
      const row = snapshotRecord(key, raw);
      records[key] = [row.content, row.translation, row.metadata, row.translated ? 1 : 0, (row.missing || []).reduce((mask, field) => { const index = MISSING_FIELDS.indexOf(field); return index < 0 ? mask : mask | (1 << index); }, 0), row.ktid, str(row.date).slice(0, 10)];
    }
    return { schema: 1, comparison: 2, compact: true, version: snapshot.version, establishedAt: snapshot.establishedAt, total: Object.keys(records).length, fullFingerprintCount: snapshot.fullFingerprintCount || 0, records };
  }
  function storageBytes(value) { return JSON.stringify(value).length * 2; }
  const SESSION_CHANGES = new WeakMap();
  const STORAGE_RESULTS = new WeakMap();
  const BASELINE_STORAGE_LIMIT = 2 * 1024 * 1024;
  function compareSnapshots(baseline, current) {
    if (!baseline || !baseline.records) return [];
    const result = [], previous = OBJECT(baseline.records);
    for (const [key, row] of Object.entries(current.records)) {
      const old = previous[key] ? snapshotRecord(key, previous[key]) : null, kinds = [];
      if (!old) kinds.push("added");
      else {
        if (old.content !== row.content) kinds.push("content");
        if (old.translation !== row.translation) kinds.push(!old.translated && row.translated ? "translated" : "translation");
        if (old.metadata !== row.metadata) kinds.push((old.missing || []).some((field) => !(row.missing || []).includes(field)) ? "recovered" : "metadata");
      }
      if (kinds.length) result.push({ ...row, key, kinds, previous: old || null });
    }
    for (const [key, raw] of Object.entries(previous)) if (!current.records[key]) { const row = snapshotRecord(key, raw); result.push({ ...row, key, kinds: ["absent"], previous: row }); }
    return result.sort((a, b) => compareDates(a.date, b.date) || a.key.localeCompare(b.key));
  }
  const PLAN = [
    { id: "publication-basis", category: "integrity", priority: "P0", title: "发布时间与日期恢复依据", value: "让时间筛选和引用能回到原始依据，区分发布时间、活动时间与发现时间。", fields: "publish_time、event_time、date_source、date_basis、recovered_at、missing_reason", support: "索引已有发布时间与部分发现 / 采集时间；空发布时间可直接定位。", gap: "日期恢复证据、时区、提取位置与缺失原因需要逐条保留；活动日期不可默认当作发布时间。", issue: "publish_time" },
    { id: "translation-quality", category: "integrity", priority: "P0", title: "译文、占位状态与校对记录", value: "避免把占位说明当成可引用译文，让补译过程可追溯。", fields: "original_content、translation、translation_status、translator、translation_version、reviewer、missing_reason", support: "现有原文 / 译文字段可并列阅读，已识别的占位文本会单独提示。", gap: "尚无统一逐段对齐、译者 / 版本与校对记录，不能据此宣称译文已人工核验。", issue: "translation" },
    { id: "author-type-account", category: "integrity", priority: "P1", title: "作者、文档类型与稳定账号 ID", value: "分清机构、发言人与平台账号，支持跨批次去重。", fields: "author、document_type、account_id、account_handle、content_id、identity_basis、missing_reason", support: "索引已有部分平台、账号 handle、账号名称和内容类型；账号 ID 需在详情核对。", gap: "作者、文档类型不在统一索引中披露；名称不能直接作为稳定身份 ID。", issue: "identity" },
    { id: "object-provenance", category: "integrity", priority: "P0", title: "原文对象、哈希、manifest 与缺失原因", value: "保留引用对应的原始对象及处理链，便于复核版本。", fields: "source_url、object_uri、content_hash、manifest_path、capture_time、extraction_basis、missing_reason", support: "详情中有则显示原文 URL、content_hash 与 report_path；没有就标明未提供。", gap: "不能仅用列表内容签名充当原始对象哈希；还需可验证的对象存储与清单链。", issue: "provenance" },
    { id: "source-register", category: "coverage", priority: "P0", title: "官网栏目、社媒账号与采集窗口台账", value: "知道已纳入哪些入口、账号和时间窗口，覆盖度才有分母。", fields: "source_id、section_url、platform、account_id、window_start、window_end、expected_frequency", support: "可按机构与采集角度统计当前已有记录和可见日期范围。", gap: "目标栏目、账号全集与期望窗口未统一配置；记录稀疏不能直接判作漏采。", issue: "sources" },
    { id: "collection-status", category: "coverage", priority: "P0", title: "最近成功、覆盖缺口与失败原因", value: "把源站无更新、访问失败与尚未安排采集区分开。", fields: "attempted_at、last_success_at、covered_until、gap_start、gap_end、http_status、failure_reason、retry_after", support: "当前可显示记录中的最近采集 / 发现字段，以及接入方提供的服务状态。", gap: "记录采集字段不代表任务整体成功；未接入的失败日志与缺口必须标为未知。", issue: "sources" },
    { id: "report-parsing", category: "documents", priority: "P1", title: "报告全文、附件与真实页级解析", value: "引用报告时能找到正文、版本、作者与实际页面。", fields: "report_id、document_url、document_type、author、version、parsed_pages、page_number、ocr_quality", support: "有附件类型提示与交付正文，证据阅读仅在已有页级解析时显示页码。", gap: "PDF 链接并不意味着已下载或解析；正文段号不能当作 PDF 页码。", issue: "documents" },
    { id: "events-people", category: "documents", priority: "P1", title: "活动议程、关键人员与任职时间", value: "把活动公告、出席角色和人员任期连接到明确出处。", fields: "event_id、event_start、event_end、venue、agenda、speaker_id、role、affiliation、valid_from、valid_to、evidence_url", support: "部分官网正文含活动与讲者信息，可从原文核对并人工建立资料分组。", gap: "尚无完整事件 / 人物实体表与身份核验；公告日期与活动日期需要分字段。", issue: "documents" },
    { id: "cooperation-evidence", category: "relations", priority: "P1", title: "合作、协议与关系证据", value: "将合作关系绑定到可回看的协议、公告或报道。", fields: "entity_a、entity_b、relation_type、start_date、end_date、agreement_url、evidence_record、review_status", support: "相关资料候选可解释，允许人工保存与移出分组。", gap: "关键词重合与共同链接只是候选依据，不能自动证明合作、同一事件或因果。", issue: "sources" },
    { id: "interaction-history", category: "relations", priority: "P2", title: "多时点互动、回复与引用关系", value: "保留帖子之间的真实关系及多个采集时点，避免把单次计数当作趋势。", fields: "content_id、reply_to_id、quoted_content_id、repost_of_id、observed_at、like_count、reply_count、repost_count、view_count", support: "现有部分帖子 URL / 内容 ID 与互动字段可在详情核对；缺失值不会按 0 解释。", gap: "缺少统一回复 / 引用边及连续采样；一次快照不能证明传播链或增长趋势。", issue: "interaction" },
  ];
  function coverageIssue(entry, issue, research) {
    const row = entry.r, extra = sidecarRow(research, entry.angle, row.id), evidence = OBJECT(extra.evidence), translation = OBJECT(extra.translation), publication = OBJECT(extra.publication);
    if (issue === "publish_time") return !present(row.publish_time) ? "missing" : "present";
    if (issue === "effective_date") return present(publication.effective || row.publish_time) ? "present" : "missing";
    if (issue === "url") return safeUrl(sourceUrl(row)) ? "present" : "missing";
    if (issue === "original") return typeof evidence.original_chars === "number" ? evidence.original_chars ? "present" : "missing" : row._has_original === false ? "missing" : row._has_original === true ? "present" : "unknown";
    if (issue === "translation") {
      if (translation.status) return translation.status === "available" ? "present" : "missing";
      if (!row._has_original) return "not-applicable";
      const text = [row.content_cn, row.chinese_trans, row.chinese_translation].find(present);
      return isPlaceholder(text) || row._has_translation === false ? "missing" : row._has_translation === true || present(text) ? "present" : "unknown";
    }
    if (issue === "identity") return entry.angle === "social" ? present(row.account_id) ? "present" : "unknown" : present(row.author) ? "present" : "unknown";
    if (issue === "provenance") return evidence.missing ? evidence.missing.includes("source_hash") || evidence.missing.includes("original_path") ? "missing" : "present" : present(row.content_hash) && present(row.report_path || row.manifest_path) ? "present" : "unknown";
    if (issue === "documents") return entry.angle === "clue" || (row._media_types || []).includes("pdf") ? "unknown" : "not-applicable";
    if (issue === "interaction") return entry.angle === "social" ? ["like_count", "comment_count", "repost_count", "view_count"].every((key) => present(row[key])) ? "present" : "unknown" : "not-applicable";
    return "unknown";
  }

  function serviceStatusModel(all, meta, research, status = {}) {
    const collected = all.map(({ r }) => r.collected_time).filter(present).sort(compareDates)[0];
    const discovered = all.map(({ r }) => r.discovery_time || r.founddate).filter(present).sort(compareDates)[0];
    const collection = OBJECT(status.collection || status.collector || status.monitoring);
    const collectorState = collection.state || collection.status;
    const knownStates = { not_connected: "未接入采集任务证据", unknown: "未知", running: "任务报告运行中", idle: "任务报告空闲", failed: "任务报告失败", paused: "任务报告暂停" };
    const facts = [["当前快照", meta.version || "版本未提供"], ["快照生成", meta.generated_at || "未提供"], ["最近记录采集字段", collected || "未提供"], ["最近发现字段", discovered || "未提供"], ["检索服务", status.state === "ready" || status.database === "ready" ? "已就绪（已有快照检索）" : status.state || "未收到检索服务状态"], ["采集任务证据", knownStates[collectorState] || collectorState || knownStates[research?.coverage?.monitoring_status] || "未接入采集任务证据"]];
    if (collection.last_success_at) facts.push(["采集任务报告最近成功", str(collection.last_success_at)]);
    if (collection.failure_reason) facts.push(["采集任务失败原因", str(collection.failure_reason)]);
    const version = compareServiceVersion(status, meta, research);
    if (version.sourceVersion) facts.push(["检索库资料版本", version.sourceVersion]);
    if (version.researchVersion) facts.push(["检索库研究元数据版本", version.researchVersion]);
    if (version.different) facts.push(["版本一致性", "检索库与当前页面资料版本不一致，服务答案需按其自己的版本与引用核对；不能当作当前页面的同版结果。"]);
    return facts;
  }
  function compareServiceVersion(status, meta, research) {
    const snapshot = OBJECT(status.snapshot), sourceVersion = str(snapshot.source_version || snapshot.version), researchVersion = str(snapshot.research_version);
    const currentSourceVersion = str(research?.source?.version || meta.version), currentResearchVersion = str(research?.version);
    const sourceDiffers = !!(sourceVersion && currentSourceVersion && sourceVersion !== currentSourceVersion), researchDiffers = !!(researchVersion && currentResearchVersion && researchVersion !== currentResearchVersion);
    const complete = !!(sourceVersion && researchVersion && currentSourceVersion && currentResearchVersion);
    return { sourceVersion, researchVersion, currentSourceVersion, currentResearchVersion, different: sourceDiffers || researchDiffers, complete, same: complete && !sourceDiffers && !researchDiffers, tracking: str(status.change_tracking || "snapshot_only") };
  }
  const validId = (value) => typeof value === "string" && /^[a-z0-9][a-z0-9_.:-]{0,199}$/i.test(value) && !["__proto__", "prototype", "constructor"].includes(value);
  // Return only owned fields. Text remains literal; no HTML or executable properties are imported.
  function validateWorkspaceSupplement(value) {
    const input = OBJECT(value);
    checkBackupShape(input);
    const unique = (items, key) => [...new Map(items.map((item) => [key(item), item])).values()];
    const text = (item, limit) => typeof item === "string" ? item.slice(0, limit) : "";
    const optionalText = (item, fields) => Object.fromEntries(fields.filter((key) => Object.hasOwn(item, key)).map((key) => [key, item[key]]));
    const recordRef = (item) => item && ANGLES.includes(item.angle) && validId(item.id) ? { angle: item.angle, id: item.id } : null;
    const relations = unique((Array.isArray(input.relations) ? input.relations : []).slice(0, 300).filter((group) => group && validId(group.id) && Array.isArray(group.records)).map((group) => ({ id: group.id, name: text(group.name, 120), records: unique(group.records.slice(0, 5000).map(recordRef).filter(Boolean), (item) => item.angle + ":" + item.id), ...optionalText(group, ["createdAt", "updatedAt"]) })), (group) => group.id);
    function cleanBaseline(raw) {
      const baseline = OBJECT(raw);
      if (baseline.schema !== 1 || !baseline.records || typeof baseline.records !== "object" || Array.isArray(baseline.records)) return null;
      const records = Object.create(null);
      for (const [key, raw] of Object.entries(baseline.records).slice(0, 50000)) {
        const row = snapshotRecord(key, raw);
        const ref = recordRef(row);
        if (!ref || key !== ref.angle + ":" + ref.id || typeof row.content !== "string" || typeof row.translation !== "string" || typeof row.metadata !== "string") continue;
        records[key] = { ...ref, ktid: Number.isFinite(Number(row.ktid)) ? Number(row.ktid) : null, date: text(row.date, 100), title: text(row.title, 180), content: text(row.content, 128), translation: text(row.translation, 128), metadata: text(row.metadata, 128), translated: row.translated === true, missing: (Array.isArray(row.missing) ? row.missing : []).filter((field) => typeof field === "string").slice(0, 30).map((field) => field.slice(0, 100)) };
      }
      const clean = { schema: 1, comparison: baseline.comparison === 2 ? 2 : 1, version: text(baseline.version, 200), establishedAt: text(baseline.establishedAt, 64), records, total: Object.keys(records).length, fullFingerprintCount: Math.max(0, Math.min(Object.keys(records).length, Number(baseline.fullFingerprintCount) || 0)) };
      return baseline.compact ? { ...compactSnapshot(clean), comparison: clean.comparison } : clean;
    }
    function cleanState(raw, includeImports = true) {
      const state = OBJECT(raw), output = {}, baseline = cleanBaseline(state.baseline);
      if (baseline) output.baseline = baseline;
      if (Object.hasOwn(state, "viewedAt")) output.viewedAt = state.viewedAt;
      if (state.subscription && typeof state.subscription === "object") {
        const sub = OBJECT(state.subscription);
        output.subscription = { scope: sub.scope, kind: sub.kind, ...optionalText(sub, ["queryHash", "notify", "savedAt"]) };
      }
      if (includeImports && Array.isArray(state.importedStates)) output.importedStates = state.importedStates.slice(0, 5).filter((item) => validId(item?.id)).map((item) => ({ id: item.id, ...cleanState(item, false) }));
      return output;
    }
    const researchChanges = { schema: 1 };
    for (const scopeKey of ["real", "simulation"]) if (Object.keys(OBJECT(OBJECT(input.researchChanges)[scopeKey])).length) researchChanges[scopeKey] = cleanState(input.researchChanges[scopeKey]);
    const cleanTask = (task, item) => ({ id: item.id, status: task.status, ...optionalText(task, ["title", "priority", "note", "createdAt", "updatedAt"]) });
    const collectionPlan = { schema: 1, tasks: {} };
    for (const item of PLAN) {
      const task = OBJECT(OBJECT(OBJECT(input.collectionPlan).tasks)[item.id]);
      if (["todo", "doing", "done", "paused"].includes(task.status)) collectionPlan.tasks[item.id] = cleanTask(task, item);
    }
    const importedTasks = OBJECT(input.collectionPlan).importedTasks;
    if (Array.isArray(importedTasks)) collectionPlan.importedTasks = importedTasks.slice(0, 100).map((task) => { const item = PLAN.find((plan) => plan.id === task?.id); return item && validId(task.backupId) && ["todo", "doing", "done", "paused"].includes(task.status) ? { ...cleanTask(task, item), backupId: task.backupId } : null; }).filter(Boolean);
    return { relations, researchChanges, collectionPlan };
  }
  function checkBackupShape(value) {
    const bad = () => { throw new Error("研究备份格式无效或超出上限，未合并研究数据"); };
    if (!value || typeof value !== "object" || Array.isArray(value)) bad();
    const optionalText = (item, key, limit) => { if (Object.hasOwn(item, key) && (typeof item[key] !== "string" || item[key].length > limit)) bad(); };
    if (Object.hasOwn(value, "relations")) {
      if (!Array.isArray(value.relations) || value.relations.length > 300) bad();
      for (const group of value.relations) {
        if (!group || !validId(group.id) || typeof group.name !== "string" || group.name.length > 120 || !Array.isArray(group.records) || group.records.length > 5000) bad();
        if (group.records.some((record) => !record || !ANGLES.includes(record.angle) || !validId(record.id))) bad();
        for (const key of ["createdAt", "updatedAt"]) optionalText(group, key, 64);
      }
    }
    function baseline(raw) {
      if (!raw || raw.schema !== 1 || !raw.records || typeof raw.records !== "object" || Array.isArray(raw.records) || Object.keys(raw.records).length > 50000) bad();
      for (const [key, record] of Object.entries(raw.records)) { const row = snapshotRecord(key, record); if (!row || !ANGLES.includes(row.angle) || !validId(row.id) || key !== row.angle + ":" + row.id || [row.content, row.translation, row.metadata].some((item) => typeof item !== "string" || item.length > 128)) bad(); }
    }
    function state(raw, history = true) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) bad();
      if (raw.baseline) baseline(raw.baseline);
      optionalText(raw, "viewedAt", 64);
      if (raw.subscription) {
        const sub = raw.subscription;
        if (!['all', 'query', 'watchlist'].includes(sub.scope) || !(sub.kind === "all" || Object.hasOwn(KIND_LABELS, sub.kind))) bad();
        optionalText(sub, "queryHash", 10000); optionalText(sub, "savedAt", 64);
        if (Object.hasOwn(sub, "notify") && typeof sub.notify !== "boolean") bad();
      }
      if (raw.importedStates) { if (!history || !Array.isArray(raw.importedStates) || raw.importedStates.length > 5) bad(); for (const item of raw.importedStates) { if (!validId(item.id)) bad(); state(item, false); } }
    }
    if (Object.hasOwn(value, "researchChanges")) {
      if (!value.researchChanges || value.researchChanges.schema !== 1) bad();
      for (const key of ["real", "simulation"]) if (value.researchChanges[key]) state(value.researchChanges[key]);
    }
    if (Object.hasOwn(value, "collectionPlan")) {
      const plan = value.collectionPlan;
      if (!plan || plan.schema !== 1 || !plan.tasks || typeof plan.tasks !== "object" || Array.isArray(plan.tasks)) bad();
      const task = (item) => {
        if (!item || !PLAN.some((p) => p.id === item.id) || !["todo", "doing", "done", "paused"].includes(item.status)) bad();
        optionalText(item, "title", 500); optionalText(item, "note", 2000);
        for (const key of ["createdAt", "updatedAt"]) optionalText(item, key, 64);
        if (Object.hasOwn(item, "priority") && !["P0", "P1", "P2"].includes(item.priority)) bad();
      };
      for (const [id, item] of Object.entries(plan.tasks)) { if (!item || item.id !== id) bad(); task(item); }
      if (plan.importedTasks) { if (!Array.isArray(plan.importedTasks) || plan.importedTasks.length > 100) bad(); for (const item of plan.importedTasks) { task(item); if (!validId(item.backupId)) bad(); } }
    }
  }
  function mergeBackup(parsed, workspace) {
    const result = { addedGroups: 0, addedMembers: 0, addedTasks: 0, preservedTaskCopies: 0, importedBaselines: 0, preservedChangeCopies: 0 };
    if (parsed == null || !["relations", "researchChanges", "collectionPlan"].some((key) => Object.hasOwn(OBJECT(parsed), key))) return result;
    checkBackupShape(parsed);
    checkBackupShape(workspace);
    const incoming = validateWorkspaceSupplement(parsed), existing = validateWorkspaceSupplement(workspace);
    // Build the whole merged supplement before assigning, so validation/limit failures are atomic.
    const next = structuredClone(existing);
    if (Object.hasOwn(parsed, "relations")) for (const group of incoming.relations) {
      let id = group.id, dest = next.relations.find((item) => item.id === id);
      if (dest && dest.name !== group.name) { id = group.id.slice(0, 150) + "-import-" + signature([group.name, group.createdAt]); dest = next.relations.find((item) => item.id === id); }
      if (!dest) { const copy = { ...group, id, ...(id !== group.id ? { name: group.name.slice(0, 110) + "（导入副本）" } : {}) }; next.relations.push(copy); result.addedGroups++; result.addedMembers += copy.records.length; }
      else for (const ref of group.records) if (!dest.records.some((item) => item.angle === ref.angle && item.id === ref.id)) { dest.records.push(ref); result.addedMembers++; }
    }
    if (Object.hasOwn(parsed, "collectionPlan")) {
      if (Object.hasOwn(incoming.collectionPlan, "importedTasks") && !Object.hasOwn(next.collectionPlan, "importedTasks")) next.collectionPlan.importedTasks = [];
      const preserveTask = (task) => { const backupId = "task-" + signature(task), copies = next.collectionPlan.importedTasks || []; if (!copies.some((item) => item.backupId === backupId)) { next.collectionPlan.importedTasks = [...copies, { ...task, backupId }]; result.preservedTaskCopies++; } };
      for (const [id, task] of Object.entries(incoming.collectionPlan.tasks)) {
        const dest = next.collectionPlan.tasks[id];
        if (!dest) { next.collectionPlan.tasks[id] = task; result.addedTasks++; }
        else if (stableString(dest) !== stableString(task)) preserveTask(task);
      }
      for (const task of incoming.collectionPlan.importedTasks || []) if (!(next.collectionPlan.importedTasks || []).some((item) => item.backupId === task.backupId)) { next.collectionPlan.importedTasks = [...(next.collectionPlan.importedTasks || []), task]; result.preservedTaskCopies++; }
    }
    if (Object.hasOwn(parsed, "researchChanges")) for (const scope of ["real", "simulation"]) {
      const source = incoming.researchChanges[scope]; if (!source) continue;
      const dest = next.researchChanges[scope];
      if (!dest || !dest.baseline && !dest.subscription) { next.researchChanges[scope] = source; if (source.baseline) result.importedBaselines++; continue; }
      if (Object.hasOwn(source, "importedStates") && !Object.hasOwn(dest, "importedStates")) dest.importedStates = [];
      const preserveState = (state) => { const { importedStates, id: ignored, ...copy } = state, id = "state-" + signature(copy), imports = dest.importedStates || []; if (!imports.some((item) => item.id === id)) { dest.importedStates = [...imports, { id, ...copy }]; result.preservedChangeCopies++; } };
      const conflict = !!(dest.baseline && source.baseline && stableString(dest.baseline) !== stableString(source.baseline) || dest.subscription && source.subscription && stableString(dest.subscription) !== stableString(source.subscription));
      if (!dest.baseline && source.baseline) { dest.baseline = source.baseline; if (!dest.viewedAt) dest.viewedAt = source.viewedAt; result.importedBaselines++; }
      if (!dest.subscription && source.subscription) dest.subscription = source.subscription;
      if (conflict) preserveState(source);
      for (const item of source.importedStates || []) preserveState(item);
    }
    if (next.relations.length > 300 || next.relations.some((group) => group.records.length > 5000) || (next.collectionPlan.importedTasks || []).length > 100 || ["real", "simulation"].some((scope) => (next.researchChanges[scope]?.importedStates || []).length > 5)) throw new Error("合并后研究备份超出上限，现有研究数据已保留");
    for (const key of ["relations", "researchChanges", "collectionPlan"]) if (Object.hasOwn(parsed, key)) workspace[key] = next[key];
    return result;
  }

  async function render(name, params, api) {
    const meta = api.META || {}, Q = api.Q || (typeof window !== "undefined" && window.ZGCLAB_QUERY), view = api.view;
    const esc = api.esc || escapeHtml, fmt = api.fmt || ((value) => Number(value || 0).toLocaleString("zh-CN"));
    const workspace = api.workspace || {}, signal = api.signal;
    let mounted;
    const live = () => !signal?.aborted && !!mounted && view.contains(mounted) && (!api.currentVersion || api.version === api.currentVersion());
    const $ = (selector) => view.querySelector(selector), research = typeof window !== "undefined" ? window.ZGCLAB_RESEARCH : null;
    const save = () => live() ? api.saveWorkspace?.() : false;
    const toast = (message) => { if (live()) api.showToast?.(message); };
    const institution = (id) => api.instName ? api.instName(Number(id)) : (meta.institutions || []).find((item) => String(item.ktid) === String(id))?.cn || str(id);
    const title = (entry) => api.titleOf ? api.titleOf(entry.angle, entry.r) : entry.r.title_cn || entry.r.title_en || entry.r.title || entry.r.id;
    const angleName = (angle) => ({ news: "新闻", clue: "官网", social: "社媒" })[angle] || angle;
    const options = (items, current) => items.map(([value, label]) => `<option value="${esc(value)}" ${str(value) === str(current) ? "selected" : ""}>${esc(label)}</option>`).join("");
    const href = (route, values = {}) => { const qs = new URLSearchParams(values); if (meta.simulation) qs.set("sim", "1"); return "#/" + route + (qs.size ? "?" + qs : ""); };
    const recordHref = (entry) => "#/record/" + encodeURIComponent(entry.angle) + "/" + encodeURIComponent(entry.r.id) + "?version=" + encodeURIComponent(meta.version || "");
    const evidenceHref = (entry, paragraph) => href("evidence", { angle: entry.angle, id: entry.r.id, version: meta.version || "", ...(paragraph ? { p: paragraph } : {}) });
    const fullHref = (hash) => location.href.split("#")[0] + hash;
    const headings = { evidence: ["证据阅读", "对照交付原文与译文，保留引用定位和来源依据。"], related: ["相关资料", "按可解释线索寻找候选，由你保存资料分组。"], changes: ["变化中心", "以浏览器保存的数据版本基线比对当前已加载快照。"], "collection-plan": ["未来采集建议", "把覆盖与证据缺口转成本地待办，按优先级安排后续采集。"], coverage: ["来源与缺口", "查看当前记录范围和可直接核对的缺失项。"] };
    if (!headings[name] || signal?.aborted) return;
    view.innerHTML = `<div class="research-workspace" data-research-root="${name}"><div class="page-head"><div><a class="back-overview" href="#/overview">← 全部数据总览</a><h1>${headings[name][0]}</h1><p>${headings[name][1]}</p></div></div><nav class="research-nav" aria-label="研究工具">${["changes", "collection-plan", "coverage"].map((route) => `<a class="${route === name ? "active" : ""}" href="${href(route)}" ${route === name ? 'aria-current="page"' : ""}>${headings[route][0]}</a>`).join("")}</nav><div id="researchBody" class="card pad"><div class="skeleton">正在加载已有快照…</div></div></div>`;
    mounted = $("[data-research-root]");
    try {
      if (["evidence", "related"].includes(name)) {
        const angle = params.get("angle"), id = params.get("id");
        if (!ANGLES.includes(angle) || !id) { $("#researchBody").innerHTML = '<div class="empty">请从一条记录进入证据阅读或相关资料。</div><a class="btn" href="#/explore">打开数据浏览</a>'; return; }
        const rows = await api.entriesFor(angle); if (!live()) return;
        const entry = rows.find((item) => str(item.r.id) === id);
        if (!entry) { $("#researchBody").innerHTML = '<div class="empty">当前快照未找到这条记录。链接可能来自其他数据版本。</div><a class="btn" href="#/explore">查找当前记录</a>'; return; }
        let detail = null, detailError = "";
        try { detail = await api.ensureDetail(angle, entry.r); } catch (error) { detailError = error.message || "详情暂不可用"; }
        if (!live()) return;
        if (name === "evidence") await evidence(entry, detail, detailError);
        else { const all = await api.entriesFor("all"); if (live()) related(entry, detail, all, detailError); }
      } else {
        const all = await api.entriesFor("all"); if (!live()) return;
        if (name === "changes") await changes(all);
        if (name === "collection-plan") collectionPlan(all);
        if (name === "coverage") await coverage(all);
      }
    } catch (error) {
      if (!live()) return;
      $("#researchBody").innerHTML = `<div class="inline-error" role="alert">研究视图未完成：${esc(error.message || error)}</div><button class="btn" id="retryResearch">重新加载</button>`;
      $("#retryResearch").onclick = () => render(name, params, api);
    }
    async function copy(value, message) {
      if (!live()) return;
      try {
        if (api.copyText) { await api.copyText(value, message); return; }
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
        else {
          const input = document.createElement("textarea"); input.value = value; input.className = "research-copy-buffer"; view.appendChild(input); input.select();
          const success = document.execCommand("copy"); input.remove(); if (!success) throw new Error("clipboard");
        }
        toast(message);
      } catch (_) { if (live()) { $("#researchCopyFallback")?.remove(); const block = document.createElement("textarea"); block.id = "researchCopyFallback"; block.rows = 7; block.readOnly = true; block.value = value; block.setAttribute("aria-label", "复制失败，请选择以下引用文本手动复制"); $("#researchBody").appendChild(block); block.focus(); block.select(); toast("浏览器未允许复制，请手动复制已选文本"); } }
    }
    function recordLine(entry) {
      return `<div class="research-record-heading"><span class="tag ${entry.angle}">${angleName(entry.angle)}</span><span>${esc(institution(entry.r.ktid))}</span><span>${esc(recordDate(entry.r) || "记录日期未提供")}</span></div><h2 class="research-record-title">${esc(title(entry))}</h2><div class="research-actions"><a class="btn" href="${recordHref(entry)}">记录详情</a><a class="btn" href="${evidenceHref(entry)}">证据阅读</a><a class="btn" href="${href("related", { angle: entry.angle, id: entry.r.id })}">相关资料</a></div>`;
    }
    function versionNotice() {
      return params.get("version") && params.get("version") !== str(meta.version) ? `<p class="research-warning" role="status">链接标注版本 ${esc(params.get("version"))}，当前加载 ${esc(meta.version)}。当前材料不能视为旧版原样复现。</p>` : "";
    }
    function recordList(entries, target, page = 1, size = 14) {
      const start = (page - 1) * size;
      target.innerHTML = entries.slice(start, start + size).map((entry) => `<article class="research-record">${api.recCard ? api.recCard(entry.angle, entry.r) : `<h3>${esc(title(entry))}</h3>`}<div class="research-actions"><a href="${evidenceHref(entry)}">证据阅读</a><a href="${href("related", { angle: entry.angle, id: entry.r.id })}">相关资料</a></div></article>`).join("") || '<div class="empty">当前范围没有匹配记录。</div>';
      api.bindRecords?.(target, entries);
    }
    function paginate(total, page, container, change, size = 14) {
      const max = Math.max(1, Math.ceil(total / size));
      container.innerHTML = `<div class="research-pager"><button class="btn" data-research-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>上一页</button><span>第 ${page} / ${max} 页 · ${fmt(total)} 条</span><button class="btn" data-research-page="${page + 1}" ${page >= max ? "disabled" : ""}>下一页</button></div>`;
      container.querySelectorAll("[data-research-page]").forEach((button) => button.onclick = () => { if (live()) change(Number(button.dataset.researchPage)); });
    }
    async function evidence(entry, detail, detailError) {
      const model = evidenceModel(entry.angle, entry.r, detail), fields = model.fields, url = safeUrl(sourceUrl(fields));
      const extra = sidecarRow(research, entry.angle, entry.r.id), provenance = OBJECT(extra.provenance), publication = OBJECT(extra.publication), evidence = OBJECT(extra.evidence);
      if (OBJECT(extra.translation).status === "placeholder") model.placeholder = true;
      const dateStatus = { provided: "交付字段已有（尚未据此核验事件日期）", recovered: publication.verified ? "恢复日期，已按所列依据校验" : "恢复日期，尚待核验", missing: "未提供，尚未恢复", unverified: "存在候选，尚待核验" }[publication.status];
      const facts = [
        ["快照记录 ID", entry.r.id], ["数据版本", meta.version], ["研究侧车版本", research?.version], ["原文 URL", sourceUrl(fields)], ["发布字段原值", present(publication.original) ? publication.original : fields.publish_time], ["日期状态", dateStatus],
        ["恢复日期", publication.status === "recovered" ? publication.effective : ""], ["日期恢复依据", publication.status === "recovered" || publication.status === "unverified" ? publication.basis : fields.publish_time_basis || fields.date_recovery_basis || provenance.publish_time_basis],
        ["日期恢复身份校验", publication.identity], ["日期恢复原始候选", publication.candidates], ["未恢复 / 恢复原因", publication.reason],
        ["采集时间", fields.collected_time || evidence.collected_at], ["发现时间", fields.discovery_time || fields.founddate || evidence.discovered_at],
        ["采集 / 发布来源", fields.source || fields.publish_source || fields.publish_channel], ["原文对象哈希", fields.content_hash || OBJECT(evidence.source_hash).value || extra.content_hash || provenance.content_hash], ["哈希字段 / 算法", evidence.source_hash ? `${OBJECT(evidence.source_hash).field || "未提供"} / ${OBJECT(evidence.source_hash).algorithm === "unspecified" ? "交付未声明算法" : OBJECT(evidence.source_hash).algorithm || "未提供"}` : ""],
        ["manifest / 报告路径", fields.report_path || fields.manifest_path || evidence.original_path || provenance.manifest_path],
        ["日期恢复来源", fields.publish_time_source || fields.date_recovery_source || provenance.publish_time_source], ["原始对象路径", fields.object_uri || provenance.object_uri], ["缺失原因", fields.missing_reason || provenance.missing_reason || evidence.missing],
      ];
      const paraHtml = (parts, type) => parts.map((part, index) => {
        const anchor = type + "-" + (index + 1);
        return `<section class="research-paragraph" id="research-${anchor}" tabindex="-1"><div class="research-paragraph-head"><a href="${evidenceHref(entry, anchor)}" data-paragraph-anchor="${anchor}">${type === "original" ? "原文" : "译文"}第 ${index + 1} 段</a><button class="text-button" data-copy-paragraph="${anchor}">复制${type === "original" ? "原文" : "译文"}引用</button></div><p>${esc(part)}</p></section>`;
      }).join("");
      $("#researchBody").innerHTML = `${recordLine(entry)}${versionNotice()}${detailError ? `<p class="research-warning">完整详情加载失败：${esc(detailError)}。当前只展示索引已有内容，可能为节选。</p><button class="btn" id="retryEvidenceDetail">重试详情</button>` : !model.fullDetail ? '<p class="research-warning">未加载完整详情，当前内容来自索引，可能为节选。</p>' : ""}<div class="research-toolbar"><label>阅读方式<select id="researchReadingMode">${options([["parallel", "原文与译文并列"], ["original", "只看原文"], ["translation", "只看译文"]], params.get("mode") || "parallel")}</select></label><button class="btn" id="copyResearchCitation">复制记录引用</button>${url ? `<a class="btn" href="${esc(url)}" target="_blank" rel="noopener noreferrer">打开原文 ↗</a>` : '<span class="hint">有效原文链接未提供</span>'}<button class="btn" id="markEvidenceRead">${api.isRead?.(entry.angle, entry.r.id) ? "已读" : "标记已读"}</button></div><p class="research-note">按交付文本的换行拆段，左右各按自身段序呈现；未提供经核验的逐段对应关系。段号仅用于本页定位，不代表 PDF 页码。</p>${model.placeholder ? '<p class="research-warning" role="status">译文字段是占位说明，尚不能作为中文翻译引用；下方保留该字段原值。</p>' : ""}<div id="researchReadingColumns" class="research-reading-columns"><div data-reading="original"><h3>原文 <code>${esc(model.originalKey || "原文字段未提供")}</code></h3>${paraHtml(model.originalParts, "original") || '<p class="empty">原文正文未提供。摘要不会代替原文。</p>'}</div><div data-reading="translation"><h3>${model.placeholder ? "译文占位说明" : "中文正文 / 译文"} <code>${esc(model.translationKey || "译文字段未提供")}</code></h3>${paraHtml(model.translationParts, "translation") || '<p class="empty">中文正文 / 译文未提供。</p>'}</div></div>${model.pages.length ? `<details class="research-provenance"><summary>已有 PDF 页级解析（${model.pages.length} 页）</summary>${model.pages.map((page) => `<section class="research-paragraph"><h3>解析第 ${page.page} 页</h3><p>${esc(page.text)}</p></section>`).join("")}</details>` : ""}<details class="research-provenance" open><summary>来源、版本与可追溯字段</summary><dl>${facts.map(([label, value]) => `<div><dt>${label}</dt><dd class="${present(value) ? "" : "research-missing"}">${present(value) ? esc(str(value)) : "未提供"}</dd></div>`).join("")}</dl><p class="research-note">发布时间沿用交付字段，不据此核验事件日期。链接保留版本标识，本站当前只提供已加载快照，历史版本的原样重放需相应数据包。</p></details>`;
      if ($("#retryEvidenceDetail")) $("#retryEvidenceDetail").onclick = () => render(name, params, api);
      const citation = (type, index) => {
        const original = type === "original" ? model.originalParts[index] : model.originalParts[0];
        return [str(title(entry)), "机构：" + institution(entry.r.ktid), "记录：" + entry.angle + "/" + entry.r.id, "数据版本：" + str(meta.version), "记录稳定链接：" + fullHref(recordHref(entry)), "证据定位：" + fullHref(evidenceHref(entry, type ? type + "-" + (index + 1) : "")), "原文 URL：" + (sourceUrl(fields) || "未提供"), "原文摘录：" + (original || "原文正文未提供"), ...(type === "translation" ? [(model.placeholder ? "译文占位说明（不可作译文引用）：" : "译文摘录（未核验逐段对应）：") + model.translationParts[index], "以上原文摘录为原文首段，不表示与该译文段已对齐。"] : [])].join("\n");
      };
      $("#copyResearchCitation").onclick = () => copy(citation("original", 0), "记录引用已复制，含原文 URL 和数据版本");
      view.querySelectorAll("[data-copy-paragraph]").forEach((button) => button.onclick = () => { const [type, n] = button.dataset.copyParagraph.split("-"); copy(citation(type, Number(n) - 1), "段落引用已复制"); });
      const focusParagraph = (anchor, update) => {
        if (!/^(?:original|translation)-[1-9]\d*$/.test(anchor || "")) return;
        const target = $("#research-" + anchor); if (!target) return;
        if (update) { params.set("p", anchor); history.replaceState(null, "", evidenceHref(entry, anchor) + "&mode=" + $("#researchReadingMode").value); }
        target.scrollIntoView({ block: "center", behavior: "auto" }); target.focus({ preventScroll: true });
      };
      view.querySelectorAll("[data-paragraph-anchor]").forEach((link) => link.onclick = (event) => { event.preventDefault(); focusParagraph(link.dataset.paragraphAnchor, true); });
      const changeMode = () => { const mode = $("#researchReadingMode").value; $("#researchReadingColumns").dataset.mode = mode; view.querySelectorAll("[data-reading]").forEach((column) => { column.hidden = mode !== "parallel" && column.dataset.reading !== mode; }); };
      $("#researchReadingMode").onchange = changeMode; changeMode();
      $("#markEvidenceRead").onclick = () => { api.markRead?.([entry], true); $("#markEvidenceRead").textContent = "已读"; toast("已标记为已读"); };
      const versionGroup = (research?.versions?.groups || []).find((group) => (group.members || []).some((member) => member.id === entry.r.id && member.angle === entry.angle));
      if (versionGroup) {
        const container = document.createElement("section"); container.className = "research-version-candidates";
        container.innerHTML = `<h3>同 URL 的交付记录</h3><p class="research-note">${versionGroup.status === "candidate_different_versions" ? "该 URL 对应的交付正文存在差异，列为版本候选；不同抽取方式也可能造成差异，尚未验证源站先后版本。" : "该 URL 对应多条正文相同的交付记录，可能来自不同角度或批次。"}按记录日期排序；不据此自动确定版本先后。</p>${[...(versionGroup.members || [])].sort((a, b) => compareDates(a.publish_value || a.discovered_at, b.publish_value || b.discovered_at)).map((member) => `<div class="research-saved-relation"><a href="${href("evidence", { angle: member.angle, id: member.id })}">${esc(member.id)}</a><span>${esc(member.publish_value || member.discovered_at || "日期未提供")}</span><code>${esc(member.snapshot_original_sha256 || "正文指纹未提供")}</code></div>`).join("")}`;
        $("#researchBody").appendChild(container);
      }
      focusParagraph(params.get("p"), false);
    }

    function relationsStore() {
      if (workspace.relations === undefined) workspace.relations = [];
      checkBackupShape({ relations: workspace.relations });
      return workspace.relations;
    }
    function related(seed, detail, all, detailError) {
      let page = 1, source = "all", selectedGroup = params.get("group") || "", current = [], candidates = relatedCandidates(seed, all, detail);
      const byKey = new Map(all.map((entry) => [keyOf(entry), entry]));
      $("#researchBody").innerHTML = `${recordLine(seed)}<p class="research-note">以下均为相关资料候选：同 URL、文中链接或关键词重合只提供查找依据，尚未自动验证同一事件、合作或因果关系。候选按记录日期排序，日期不是已核实的事件日期。</p>${detailError ? `<p class="research-warning">本条详情加载失败，仅使用可见索引生成候选：${esc(detailError)}</p>` : ""}<section class="research-group-editor"><h3>人工资料分组</h3><p class="hint">分组只保存在当前浏览器；将候选存入分组表示你选择把它们一起研究。</p><div class="research-toolbar"><label>目标分组<select id="relationGroup" aria-label="目标资料分组"></select></label><label>新分组名称<input id="relationGroupName" maxlength="120" placeholder="例如：朝鲜战略背景材料"></label><button class="btn" id="createRelationGroup">创建分组并加入本条</button></div><div class="research-toolbar"><label>手动加入记录的角度<select id="manualRelationAngle">${options(ANGLES.map((angle) => [angle, angleName(angle)]), "news")}</select></label><label>记录 ID<input id="manualRelationId" maxlength="200" placeholder="例如 clue-1"></label><button class="btn" id="addManualRelation">加入所选分组</button></div><p id="relationGroupStatus" role="status"></p><div id="relationSaved"></div></section><div class="research-toolbar"><label>来源类型<select id="relatedSource">${options([["all", "官网、新闻与社媒"], ...ANGLES.map((angle) => [angle, angleName(angle)])], source)}</select></label><span id="relatedCount" role="status"></span></div><div id="relatedCandidates"></div><div id="relatedPager"></div>`;
      const member = (group, entry) => group.records.some((item) => item.angle === entry.angle && str(item.id) === str(entry.r.id));
      const addTogether = (group, entries) => {
        const additions = [...new Map(entries.filter((entry) => !member(group, entry)).map((entry) => [keyOf(entry), { angle: entry.angle, id: entry.r.id }])).values()];
        if (group.records.length + additions.length > 5000) { toast("每个资料分组最多保存 5,000 条记录；本次未添加，现有资料已保留"); return false; }
        group.records.push(...additions); return true;
      };
      function refreshGroups() {
        const groups = relationsStore();
        if (!groups.some((group) => group.id === selectedGroup)) selectedGroup = groups.find((group) => member(group, seed))?.id || groups[0]?.id || "";
        $("#relationGroup").innerHTML = options([["", "先创建分组"], ...groups.map((group) => [group.id, str(group.name || "未命名分组")])], selectedGroup);
        const group = groups.find((item) => item.id === selectedGroup);
        $("#relationGroupStatus").textContent = group ? `「${group.name || "未命名分组"}」共 ${group.records.length} 条资料；人工分组，不代表关系已验证。` : "输入名称创建分组后，可保存候选或手动加入已知记录。";
        const saved = group ? group.records.filter((item) => item.angle !== seed.angle || str(item.id) !== str(seed.r.id)).sort((a, b) => compareDates(recordDate(byKey.get(a.angle + ":" + a.id)?.r || {}), recordDate(byKey.get(b.angle + ":" + b.id)?.r || {}))) : [];
        $("#relationSaved").innerHTML = saved.length ? `<h4>所选分组的资料</h4>${saved.map((item, index) => { const entry = byKey.get(item.angle + ":" + item.id); return `<div class="research-saved-relation"><a href="${href("evidence", { angle: item.angle, id: item.id })}">${esc(entry ? title(entry) : item.angle + "/" + item.id + "（当前快照未找到）")}</a><span>${esc(entry ? recordDate(entry.r) || "日期未提供" : "")}</span><button class="text-button" data-remove-relation="${index}">移出此分组</button></div>`; }).join("")}` : '<p class="hint">所选分组尚无其他资料。</p>';
        $("#relationSaved").querySelectorAll("[data-remove-relation]").forEach((button) => button.onclick = () => { const item = saved[Number(button.dataset.removeRelation)]; group.records = group.records.filter((other) => other.angle !== item.angle || str(other.id) !== str(item.id)); group.updatedAt = new Date().toISOString(); save(); refreshGroups(); draw(); });
        $("#addManualRelation").disabled = !group;
      }
      function draw() {
        current = candidates.filter((entry) => source === "all" || entry.angle === source);
        page = Math.min(page, Math.max(1, Math.ceil(current.length / 14)));
        const group = relationsStore().find((item) => item.id === selectedGroup);
        $("#relatedCount").textContent = `可解释候选 ${fmt(current.length)} 条 · 官网 ${candidates.filter((entry) => entry.angle === "clue").length} / 新闻 ${candidates.filter((entry) => entry.angle === "news").length} / 社媒 ${candidates.filter((entry) => entry.angle === "social").length}`;
        $("#relatedCandidates").innerHTML = current.slice((page - 1) * 14, page * 14).map((entry, index) => `<article class="research-related-card"><div class="research-record-heading"><span class="tag ${entry.angle}">${angleName(entry.angle)}</span><span>${esc(institution(entry.r.ktid))}</span><span>${esc(recordDate(entry.r) || "日期未提供")}</span><span class="research-candidate-badge">候选</span></div><h3><a href="${evidenceHref(entry)}">${esc(title(entry))}</a></h3><ul class="research-reasons">${entry.reasons.map((reason) => `<li>${esc(reason.text)}</li>`).join("")}</ul><div class="research-actions"><a href="${recordHref(entry)}">记录详情</a><button class="btn" data-save-relation="${(page - 1) * 14 + index}" ${!group || member(group, entry) ? "disabled" : ""}>${group && member(group, entry) ? "已存入所选分组" : "存入所选分组"}</button></div></article>`).join("") || '<div class="empty">可见索引中未找到此类候选。可使用完整正文检索继续查找，或手动添加已知记录。</div>';
        $("#relatedCandidates").querySelectorAll("[data-save-relation]").forEach((button) => button.onclick = () => { const entry = current[Number(button.dataset.saveRelation)]; if (!group || !entry) return; if (!addTogether(group, [seed, entry])) return; group.updatedAt = new Date().toISOString(); save(); refreshGroups(); draw(); });
        paginate(current.length, page, $("#relatedPager"), (next) => { page = next; draw(); });
      }
      $("#relationGroup").onchange = (event) => { selectedGroup = event.target.value; refreshGroups(); draw(); };
      $("#createRelationGroup").onclick = () => { const groupName = $("#relationGroupName").value.trim(); if (!groupName) { toast("请输入分组名称"); $("#relationGroupName").focus(); return; } if (relationsStore().length >= 300) { toast("最多保存 300 个资料分组；本次未创建，现有分组已保留"); return; } const now = new Date().toISOString(); selectedGroup = "relation-" + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2)); workspace.relations.push({ id: selectedGroup, name: groupName, records: [{ angle: seed.angle, id: seed.r.id }], createdAt: now, updatedAt: now }); save(); $("#relationGroupName").value = ""; refreshGroups(); draw(); };
      $("#addManualRelation").onclick = () => { const entry = byKey.get($("#manualRelationAngle").value + ":" + $("#manualRelationId").value.trim()), group = relationsStore().find((item) => item.id === selectedGroup); if (!entry) { toast("当前快照找不到该记录，请核对角度与 ID"); return; } if (!group) return; if (!addTogether(group, [seed, entry])) return; group.updatedAt = new Date().toISOString(); save(); refreshGroups(); draw(); };
      $("#relatedSource").onchange = (event) => { source = event.target.value; page = 1; draw(); };
      refreshGroups(); draw();
    }

    async function serviceStatus(all, target) {
      let status = OBJECT(api.researchStatus || research?.status);
      const client = api.serviceClient || (typeof window !== "undefined" && window.ZGCLAB_SERVICE_CLIENT);
      if (client?.status || api.getResearchStatus) { try { status = OBJECT(client?.status ? await client.status({ signal }) : await api.getResearchStatus(signal)); } catch (_) { status = { message: "检索服务状态读取失败；本次仍可阅读已加载快照。" }; } }
      if (!live() || !view.contains(target)) return;
      const facts = serviceStatusModel(all, meta, research, status);
      target.innerHTML = `<h2 class="research-section-title">快照、检索与采集状态</h2><dl class="research-status-facts">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl><p class="research-note">${esc(status.message || "仅比较本次已加载快照。检索服务就绪仅表示可查询已入库材料；采集任务的连续运行需另有真实任务证据。静态页面关闭后不会持续采集或推送。")}</p>`;
    }

    async function changes(all) {
      const now = new Date().toISOString(), scopeKey = meta.simulation ? "simulation" : "real";
      workspace.researchChanges = OBJECT(workspace.researchChanges); workspace.researchChanges.schema = 1;
      const sessionStates = SESSION_CHANGES.get(workspace) || {}; SESSION_CHANGES.set(workspace, sessionStates);
      const persistentState = OBJECT(workspace.researchChanges[scopeKey]);
      const state = sessionStates[scopeKey] || (meta.simulation ? { ...persistentState } : persistentState);
      const existingSubscription = OBJECT(state.subscription);
      state.subscription = { scope: ["all", "watchlist", "query"].includes(existingSubscription.scope) ? existingSubscription.scope : "all", queryHash: str(existingSubscription.queryHash), kind: existingSubscription.kind === "all" || Object.hasOwn(KIND_LABELS, existingSubscription.kind) ? existingSubscription.kind : "all", notify: existingSubscription.notify === true, savedAt: str(existingSubscription.savedAt) };
      if (state.baseline && (!state.baseline.records || typeof state.baseline.records !== "object" || Array.isArray(state.baseline.records))) delete state.baseline;
      const currentSnapshot = snapshotFor(all, meta, research, now), compactCurrent = compactSnapshot(currentSnapshot), baselineBytes = storageBytes(compactCurrent);
      const first = !state.baseline?.records, upgraded = !first && (state.baseline.comparison !== 2 || state.baseline.version === currentSnapshot.version && state.baseline.fullFingerprintCount !== currentSnapshot.fullFingerprintCount);
      let persisted = STORAGE_RESULTS.get(state) ?? null, storageMessage = "";
      function storageNotice() {
        const target = $("#researchChangesStorage");
        if (target) target.textContent = storageMessage || `当前基线估算占用 ${(baselineBytes / 1024 / 1024).toFixed(2)} MiB（UTF-16 口径，仅比较指纹与必要引用字段）。${persisted === false ? "浏览器未确认持久化，仅本次会话保留；请导出工作台备份。" : persisted === true ? "浏览器已确认保存。" : "已载入现有基线，尚未写入。"}`;
      }
      function persistState() {
        if (meta.simulation || baselineBytes > BASELINE_STORAGE_LIMIT) {
          sessionStates[scopeKey] = state;
          storageMessage = `${meta.simulation ? "模拟数据基线" : "超出 2 MiB 预算的基线"}仅保留在本次页面会话，刷新后重建；不会占用工作台持久存储。当前基线估算 ${(baselineBytes / 1024 / 1024).toFixed(2)} MiB。`;
          storageNotice(); return false;
        }
        workspace.researchChanges[scopeKey] = state;
        persisted = save() === true; STORAGE_RESULTS.set(state, persisted);
        storageMessage = ""; storageNotice(); return persisted;
      }
      let upgradeArchive = "";
      if (upgraded && state.baseline) {
        const previous = { baseline: state.baseline, viewedAt: state.viewedAt, subscription: { ...state.subscription } }, id = "state-" + signature(previous);
        const imports = Array.isArray(state.importedStates) ? state.importedStates : [];
        if (imports.some((item) => item.id === id)) upgradeArchive = "上一比较基线与订阅已保留在基线副本中。";
        else if (imports.length < 5 && storageBytes(previous) + storageBytes(workspace) < 8 * 1024 * 1024) { state.importedStates = [...imports, { id, ...previous }]; upgradeArchive = "上一比较基线与订阅已保留在基线副本中，当前关注和订阅条件保持。"; }
        else upgradeArchive = "副本空间不足，升级前基线仅在本次会话保留；可使用下方按钮导出。";
        sessionStates.previousComparisonBaseline = previous;
      }
      if (first || upgraded) { state.baseline = compactCurrent; state.viewedAt = now; persistState(); }
      else if (meta.simulation) { sessionStates[scopeKey] = state; storageMessage = "模拟数据基线仅保留在本次页面会话，刷新后重建；真实数据基线独立保存。"; }
      const baseline = state.baseline, differences = compareSnapshots(baseline, currentSnapshot), byKey = new Map(all.map((entry) => [keyOf(entry), entry]));
      state.subscription = OBJECT(state.subscription);
      let scope = state.subscription.scope || "all", kind = state.subscription.kind || "all", queryHash = state.subscription.queryHash || "", page = 1, rows = [];
      const queries = (Array.isArray(workspace.queries) ? workspace.queries : []).filter((query) => typeof query.hash === "string");
      if (scope === "query" && !queries.some((query) => query.hash === queryHash)) scope = "all";
      const scopeValue = () => scope === "query" ? "q:" + queries.findIndex((query) => query.hash === queryHash) : scope;
      $("#researchBody").innerHTML = `<div class="research-toolbar"><button class="btn" id="checkResearchVersion">检查最新资料版本</button><a class="btn" id="reloadResearchVersion" href="${esc(location.href)}" hidden>重新加载最新发布页</a></div><p id="researchVersionCheck" class="research-note" role="status">点击后比较检索服务与当前页面的资料版本；不会启动采集或调用模型。</p><section class="research-service-status" id="researchServiceStatus" aria-label="快照和采集状态"><p class="hint">正在读取已知快照状态…</p></section><div class="research-baseline-notice" id="researchBaselineNotice" role="status">${upgraded ? "比较能力已升级，已以当前快照重新建立全文比较基线；本次未把指纹规则差异记为内容变化。" + upgradeArchive : first ? `首次打开：已将当前 ${fmt(all.length)} 条历史记录建立为基线，新增计数为 0。之后比较的是快照差异，不把旧记录称作“今天新增”。` : `以 ${esc(baseline.version)}（建立于 ${esc(baseline.establishedAt)}）为已查看基线，与当前 ${esc(meta.version)} 比较。`}</div><p id="researchFingerprintCoverage" class="research-note" data-full-fingerprint-count="${currentSnapshot.fullFingerprintCount}" data-record-count="${all.length}">${currentSnapshot.fullFingerprintCount === all.length && all.length ? `全文指纹覆盖 ${fmt(currentSnapshot.fullFingerprintCount)}/${fmt(all.length)} 条，比较完整原文与译文。` : `当前 ${fmt(currentSnapshot.fullFingerprintCount)}/${fmt(all.length)} 条具备全文指纹；其他记录仅比较索引可见字段，正文尾部改动可能遗漏。`}“当前快照未出现”也可能来自采集范围变化，不等于源文已删除。</p><div class="research-toolbar"><label>订阅范围<select id="changesScope">${options([["all", "全部记录"], ["watchlist", "关注机构"], ...queries.map((query, index) => ["q:" + index, "保存查询：" + str(query.name || "未命名查询")])], scopeValue())}</select></label><label>变化类型<select id="changesKind">${options([["all", "全部变化"], ...Object.entries(KIND_LABELS)], kind)}</select></label><button class="btn" id="saveChangeSubscription">保存订阅条件</button><button class="btn" id="exportResearchChanges">导出当前变化</button><button class="btn primary" id="markSnapshotViewed">标记本次完整快照已查看</button></div><label class="research-notify-choice"><input type="checkbox" id="changesNotify" ${state.subscription.notify ? "checked" : ""}>打开变化中心时，在本页提醒匹配变化</label><p class="hint">订阅保存在当前浏览器。每次打开后检查已加载快照，离线或关闭页面时不会持续运行。</p><p id="researchChangesStorage" class="research-note" role="status"></p>${upgraded ? '<button class="btn" id="exportPreviousResearchBaseline">导出升级前基线</button>' : ""}<div id="researchChangeImports"></div><p id="researchChangesCount" role="status"></p><div id="researchChangesList"></div><div id="researchChangesPager"></div>`;
      if ($("#exportPreviousResearchBaseline")) $("#exportPreviousResearchBaseline").onclick = () => {
        const previous = sessionStates.previousComparisonBaseline; if (!previous) return;
        const blob = new Blob([JSON.stringify({ researchChanges: { schema: 1, [scopeKey]: previous } }, null, 2)], { type: "application/json;charset=utf-8" }), url = URL.createObjectURL(blob), link = document.createElement("a");
        link.href = url; link.download = "zgclab-升级前变化基线.json"; link.click(); URL.revokeObjectURL(url);
      };
      let versionCheck = 0;
      $("#checkResearchVersion").onclick = async () => {
        const request = ++versionCheck, button = $("#checkResearchVersion"), target = $("#researchVersionCheck"), reload = $("#reloadResearchVersion");
        button.disabled = true; reload.hidden = true; target.textContent = "正在检查资料服务已加载的版本…";
        try {
          const client = api.serviceClient || (typeof window !== "undefined" && window.ZGCLAB_SERVICE_CLIENT);
          if (!client?.status && !client?.request) throw new Error("资料服务未连接");
          const status = client.status ? await client.status({ signal }) : await client.request("/api/changes", { signal });
          if (!live() || request !== versionCheck || !view.contains(target)) return;
          const version = compareServiceVersion(status, meta, research), time = new Date().toLocaleString("zh-CN");
          target.classList.toggle("research-warning", version.different);
          if (version.different) {
            target.textContent = `检查于 ${time}：服务端资料版本 ${version.sourceVersion || "未提供"} / 研究元数据 ${version.researchVersion || "未提供"}，与当前页面 ${version.currentSourceVersion || "未提供"} / ${version.currentResearchVersion || "未提供"} 不一致。服务端可能已装载另一批交付；无法据此确认发布页已同步。请重新加载最新发布页（刷新后需再次输入访问密码）；若仍不一致，表示检索库与发布页尚未同步，服务答案需按其版本与引用单独核对。`;
            reload.hidden = false;
          } else if (version.same) target.textContent = `检查于 ${time}：服务与当前页面资料版本一致，未发现新发布的资料版本。仅核对当前已加载快照；服务未提供持续采集或增量推送证据。`;
          else target.textContent = `检查于 ${time}：服务未提供完整 source_version / research_version，暂时无法确认是否有新发布；当前本地快照比较仍可使用。`;
        } catch (_) { if (live() && request === versionCheck && view.contains(target)) target.textContent = "资料服务暂时无法连接，未能检查是否有新发布；本地已加载快照的变化比较仍可使用。可稍后再次手动检查。"; }
        finally { if (live() && request === versionCheck && view.contains(button)) button.disabled = false; }
      };
      storageNotice();
      const importedStates = Array.isArray(state.importedStates) ? state.importedStates : [];
      $("#researchChangeImports").innerHTML = importedStates.length ? `<details class="research-provenance"><summary>保留的导入基线 / 订阅副本（${importedStates.length}）</summary><p class="research-note">当前比较仍使用本地已查看基线；以下副本保留于工作台备份中，不自动替换本地比较状态。</p>${importedStates.map((item) => `<p class="hint">版本 ${esc(item.baseline?.version || "无基线")} · 基线 ${fmt(item.baseline?.total || 0)} 条 · ${esc(item.baseline?.establishedAt || item.subscription?.savedAt || "时间未提供")}</p>`).join("")}</details>` : "";
      function scopedKeys() {
        if (scope === "watchlist") return new Set(all.filter(({ r }) => (workspace.watchlist || []).map(String).includes(str(r.ktid))).map(keyOf));
        if (scope === "query") {
          try { const saved = queries.find((query) => query.hash === queryHash), parsed = Q.parse(new URLSearchParams((saved?.hash || "").split("?").slice(1).join("?"))); parsed.limit = 0; parsed.page = 1; const source = parsed.read && api.isRead ? all.filter((entry) => api.isRead(entry.angle, entry.r.id) === (parsed.read === "read")) : all; return new Set(Q.filter(source, parsed, meta.institutions).entries.map(keyOf)); } catch (_) { return new Set(); }
        }
        return null;
      }
      function draw() {
        const keys = scopedKeys(); rows = differences.filter((change) => (!keys || keys.has(change.key) || scope === "watchlist" && change.kinds.includes("absent") && (workspace.watchlist || []).map(String).includes(str(change.ktid))) && (kind === "all" || change.kinds.includes(kind)));
        page = Math.min(page, Math.max(1, Math.ceil(rows.length / 14)));
        $("#researchChangesCount").textContent = `当前条件匹配 ${fmt(rows.length)} 条变化；完整快照共 ${fmt(differences.length)} 条变化。${scope === "watchlist" && !(workspace.watchlist || []).length ? " 请先在关注看板选择机构。" : ""}`;
        $("#exportResearchChanges").disabled = !rows.length;
        $("#researchChangesList").innerHTML = rows.slice((page - 1) * 14, page * 14).map((change) => {
          const entry = byKey.get(change.key), hash = entry ? evidenceHref(entry) : href("explore", { angle: change.angle, q: change.title });
          return `<article class="research-change-card"><div class="research-record-heading"><span class="tag ${change.angle}">${esc(angleName(change.angle))}</span><span>${esc(institution(change.ktid))}</span><span>${esc(change.date || "记录日期未提供")}</span></div><h3><a href="${hash}">${esc(entry ? title(entry) : change.title)}</a></h3><div class="research-change-kinds">${change.kinds.map((code) => `<span>${KIND_LABELS[code]}</span>`).join("")}</div><p class="hint">${esc(change.id)} · ${esc(baseline.version)} → ${esc(meta.version)}${change.kinds.includes("added") ? " · 表示相对基线首次出现，不表示今天发布" : ""}</p></article>`;
        }).join("") || '<div class="empty">当前条件没有相对基线的变化。已有未读记录与新增记录含义不同。</div>';
        paginate(rows.length, page, $("#researchChangesPager"), (next) => { page = next; draw(); });
      }
      $("#changesScope").onchange = (event) => { const value = event.target.value; scope = value.startsWith("q:") ? "query" : value; queryHash = scope === "query" ? queries[Number(value.slice(2))]?.hash || "" : ""; page = 1; draw(); };
      $("#changesKind").onchange = (event) => { kind = event.target.value; page = 1; draw(); };
      $("#saveChangeSubscription").onclick = () => { state.subscription = { scope, queryHash, kind, notify: $("#changesNotify").checked, savedAt: new Date().toISOString() }; const saved = persistState(); toast(saved ? "订阅条件已保存；将在打开本页时检查已有快照" : "订阅条件仅本次会话保留"); };
      $("#markSnapshotViewed").onclick = () => { state.baseline = compactCurrent; state.viewedAt = new Date().toISOString(); const saved = persistState(); toast(saved ? "当前完整快照已保存为已查看基线" : "当前快照已设为本次会话基线"); differences.splice(0); $("#researchBaselineNotice").textContent = `当前快照 ${meta.version} 已设为本次已查看基线；之后将比较相对这次快照的变化。`; page = 1; draw(); };
      $("#exportResearchChanges").onclick = () => api.downloadCsv?.("zgclab-快照变化.csv", ["记录ID", "角度", "机构", "记录日期", "变化类型", "基线版本", "当前版本", "比较时间", "证据链接", "比较口径"], rows.map((change) => [change.id, angleName(change.angle), institution(change.ktid), change.date, change.kinds.map((code) => KIND_LABELS[code]).join("；"), baseline.version, meta.version, now, byKey.has(change.key) ? fullHref(evidenceHref(byKey.get(change.key))) : "当前快照未出现", "相对已查看基线；并非今天新增；全文指纹缺失时仅比较可见索引"]));
      draw();
      if (state.subscription.notify && rows.length) toast(`当前已加载快照有 ${rows.length} 条匹配订阅的变化`);
      await serviceStatus(all, $("#researchServiceStatus"));
    }

    function collectionPlan(all) {
      workspace.collectionPlan = OBJECT(workspace.collectionPlan); workspace.collectionPlan.schema = 1; workspace.collectionPlan.tasks = OBJECT(workspace.collectionPlan.tasks);
      const tasks = workspace.collectionPlan.tasks;
      let category = params.get("category") || "all", priority = "all", status = "all", search = "", current = [];
      const countGap = (item) => all.filter((entry) => coverageIssue(entry, item.issue, research) === "missing").length;
      $("#researchBody").innerHTML = `<p class="research-plan-intro">下面按四类给出可执行的补充建议。创建待办仅在当前浏览器记录计划与进度，不会启动采集或产生外部费用；“已完成”是你手动设置的工作状态，不代表数据已补齐。</p><div class="research-toolbar"><label>建议分类<select id="planCategory">${options([["all", "四类建议"], ...Object.entries(CATEGORY_LABELS)], category)}</select></label><label>优先级<select id="planPriority">${options([["all", "全部优先级"], ["P0", "P0 · 优先补齐"], ["P1", "P1 · 扩展研究"], ["P2", "P2 · 持续跟踪"]], priority)}</select></label><label>待办状态<select id="planStatus">${options([["all", "全部状态"], ...Object.entries(STATUS_LABELS)], status)}</select></label><label>搜索建议<input type="search" id="planSearch" placeholder="作者、哈希、回复关系…"></label><button class="btn" id="exportCollectionPlan">导出当前计划</button></div><p id="collectionPlanCount" role="status"></p><div id="collectionPlanImports"></div><div id="collectionPlanList" class="research-plan-grid"></div>`;
      const importedTasks = Array.isArray(workspace.collectionPlan.importedTasks) ? workspace.collectionPlan.importedTasks : [];
      $("#collectionPlanImports").innerHTML = importedTasks.length ? `<details class="research-provenance"><summary>保留的导入待办副本（${importedTasks.length}）</summary><p class="research-note">这些导入状态与本地待办不同，已保留供核对，本地状态未被覆盖。</p>${importedTasks.map((task) => `<div class="research-saved-relation"><b>${esc(task.title || task.id)}</b><span>${esc(STATUS_LABELS[task.status] || task.status)}</span><p>${esc(task.note || "无备注")}</p></div>`).join("")}</details>` : "";
      function taskFor(item) { return OBJECT(tasks[item.id]); }
      function taskStatus(item) { return STATUS_LABELS[taskFor(item).status] ? taskFor(item).status : "none"; }
      function updateTask(item, value) { const now = new Date().toISOString(), old = taskFor(item); tasks[item.id] = { ...old, id: item.id, title: item.title, status: value, priority: item.priority, createdAt: old.createdAt || now, updatedAt: now }; save(); }
      function draw() {
        current = PLAN.filter((item) => (category === "all" || item.category === category) && (priority === "all" || item.priority === priority) && (status === "all" || taskStatus(item) === status) && (!search || normalize([item.title, item.fields, item.value, item.gap].join(" ")).includes(normalize(search))));
        $("#collectionPlanCount").textContent = `显示 ${current.length}/${PLAN.length} 项建议；已创建 ${PLAN.filter((item) => taskStatus(item) !== "none").length} 个本地待办。`;
        $("#exportCollectionPlan").disabled = !current.length;
        $("#collectionPlanList").innerHTML = current.map((item) => `<article class="research-plan-card"><div class="research-plan-labels"><span>${CATEGORY_LABELS[item.category]}</span><b class="research-priority">${item.priority}</b></div><h2>${item.title}</h2><p>${item.value}</p><dl><dt>建议字段</dt><dd><code>${item.fields}</code></dd><dt>现有支持</dt><dd>${item.support}</dd><dt>待补缺口</dt><dd>${item.gap}</dd></dl><div class="research-actions"><a href="${href("coverage", { issue: item.issue })}">${countGap(item) ? `查看 ${fmt(countGap(item))} 条索引已知缺失` : "核对现有覆盖 / 待查字段"}</a>${item.id === "cooperation-evidence" ? '<a href="#/explore?angle=clue">从官网记录建立分组</a>' : ""}</div><div class="research-task-controls">${taskStatus(item) === "none" ? `<button class="btn" data-create-plan="${item.id}">创建本地待办</button>` : `<label>本地待办状态<select data-plan-status="${item.id}">${options(Object.entries(STATUS_LABELS).filter(([value]) => value !== "none"), taskStatus(item))}</select></label><label>待办备注<textarea rows="2" maxlength="2000" data-plan-note="${item.id}" placeholder="执行范围、验收依据或负责人">${esc(taskFor(item).note || "")}</textarea></label>`}</div></article>`).join("") || '<div class="empty">没有匹配的建议，调整筛选后继续。</div>';
        $("#collectionPlanList").querySelectorAll("[data-create-plan]").forEach((button) => button.onclick = () => { updateTask(PLAN.find((item) => item.id === button.dataset.createPlan), "todo"); draw(); toast("已创建本地待办；尚未启动采集"); });
        $("#collectionPlanList").querySelectorAll("[data-plan-status]").forEach((select) => select.onchange = () => { updateTask(PLAN.find((item) => item.id === select.dataset.planStatus), select.value); draw(); });
        $("#collectionPlanList").querySelectorAll("[data-plan-note]").forEach((input) => input.onchange = () => { const item = PLAN.find((plan) => plan.id === input.dataset.planNote); tasks[item.id].note = input.value.slice(0, 2000); tasks[item.id].updatedAt = new Date().toISOString(); save(); });
      }
      $("#planCategory").onchange = (event) => { category = event.target.value; draw(); };
      $("#planPriority").onchange = (event) => { priority = event.target.value; draw(); };
      $("#planStatus").onchange = (event) => { status = event.target.value; draw(); };
      $("#planSearch").oninput = (event) => { search = event.target.value.trim(); draw(); };
      $("#exportCollectionPlan").onclick = () => api.downloadCsv?.("zgclab-未来采集计划.csv", ["建议ID", "分类", "优先级", "建议", "价值", "字段", "现有支持", "缺口", "索引已知缺失数", "本地待办状态", "备注", "覆盖链接", "数据版本"], current.map((item) => [item.id, CATEGORY_LABELS[item.category], item.priority, item.title, item.value, item.fields, item.support, item.gap, countGap(item), STATUS_LABELS[taskStatus(item)], taskFor(item).note || "", fullHref(href("coverage", { issue: item.issue })), meta.version]));
      draw();
    }
    async function coverage(all) {
      const issues = [["publish_time", "发布时间原字段"], ["effective_date", "恢复后仍缺发布时间"], ["translation", "占位或缺失译文"], ["url", "原文 URL"], ["original", "原文正文"], ["identity", "作者 / 账号 ID（需查详情）"], ["provenance", "对象哈希 / manifest"], ["documents", "文档与活动字段（需查详情）"], ["interaction", "互动字段（需查详情）"], ["sources", "来源与时间范围"]];
      let issue = issues.some(([key]) => key === params.get("issue")) ? params.get("issue") : "publish_time", institutionId = params.get("ids") || "", angle = "all", page = 1, groupPage = 1, rows = [];
      $("#researchBody").innerHTML = `<section id="coverageServiceStatus" class="research-service-status" aria-label="快照和服务状态"></section><div id="coverageSummary" class="research-baseline-notice"></div><p class="research-note">本页统计本次已加载快照。原始字段未在索引或研究侧车披露时标为“待查详情”。来源观察单元来自已有记录，尚无目标账号 / 栏目全集与期望窗口，因此现有记录间隔不能自动算作漏采或采集失败；社媒汇总与平台单元有重叠，不可直接累加。</p><div class="research-toolbar"><label>检查项<select id="coverageIssue">${options(issues, issue)}</select></label><label>机构<select id="coverageInstitution">${options([["", "全部机构"], ...(meta.institutions || []).map((item) => [item.ktid, item.cn])], institutionId)}</select></label><label>采集角度<select id="coverageAngle">${options([["all", "全部角度"], ...ANGLES.map((item) => [item, angleName(item)])], angle)}</select></label><a class="btn" href="${href("collection-plan")}">安排未来采集</a><button class="btn" id="exportCoverage">导出当前检查记录</button></div><p id="researchCoverageCount" role="status"></p><div id="coverageSources"></div><div id="coverageSourcesPager"></div><div id="coverageRecords" class="rec-list"></div><div id="coveragePager"></div>`;
      function draw() {
        const subset = all.filter((entry) => (!institutionId || str(entry.r.ktid) === institutionId) && (angle === "all" || entry.angle === angle));
        const allCells = Array.isArray(research?.coverage?.cells) ? research.coverage.cells : [], cells = allCells.filter((cell) => (!institutionId || str(cell.ktid) === institutionId) && (angle === "all" || cell.angle === angle));
        const rawMissing = subset.filter((entry) => !present(entry.r.publish_time)).length, recovered = subset.filter((entry) => sidecarRow(research, entry.angle, entry.r.id).publication?.status === "recovered").length, unresolved = subset.filter((entry) => coverageIssue(entry, "effective_date", research) === "missing").length, translationGaps = subset.filter((entry) => coverageIssue(entry, "translation", research) === "missing").length;
        $("#coverageSummary").textContent = `${fmt(cells.length)} / ${fmt(allCells.length)} 个来源观察单元 · 当前记录 ${fmt(subset.length)} 条 · 发布时间原字段缺失 ${fmt(rawMissing)} 条，其中已恢复 ${fmt(recovered)} 条、仍缺 ${fmt(unresolved)} 条 · 占位或缺失译文 ${fmt(translationGaps)} 条。${meta.simulation ? "来源观察单元只涵盖真实交付数据。" : ""}`;
        const missing = subset.filter((entry) => coverageIssue(entry, issue, research) === "missing"), unknown = subset.filter((entry) => coverageIssue(entry, issue, research) === "unknown");
        rows = issue === "sources" ? subset : [...missing, ...unknown];
        rows.sort((a, b) => compareDates(recordDate(a.r), recordDate(b.r)));
        page = Math.min(page, Math.max(1, Math.ceil(rows.length / 14)));
        $("#researchCoverageCount").textContent = issue === "sources" ? `当前范围 ${fmt(subset.length)} 条已入库记录；目标覆盖窗口、未采入口与任务失败原因尚未配置。` : `当前范围 ${fmt(subset.length)} 条；已确认快照缺失 ${fmt(missing.length)} 条；待查详情 ${fmt(unknown.length)} 条。下方展示缺失与待查记录。`;
        $("#coverageSources").hidden = issue !== "sources"; $("#coverageSourcesPager").hidden = issue !== "sources";
        if (issue === "sources") {
          const values = cells.length ? cells.map((cell) => ({ ...cell, observedCell: true })) : (() => {
            const groups = new Map();
            for (const entry of subset) { const source = entry.angle === "social" ? [entry.r.platform, entry.r.account_handle || entry.r.account_name].filter(Boolean).join(" / ") : entry.r.publisher_domain || entry.r.publish_source || entry.r.source || "入口未提供", key = [entry.r.ktid, entry.angle, source].join(":"); if (!groups.has(key)) groups.set(key, { ktid: entry.r.ktid, angle: entry.angle, source, rows: [] }); groups.get(key).rows.push(entry.r); }
            return [...groups.values()];
          })();
          groupPage = Math.min(groupPage, Math.max(1, Math.ceil(values.length / 12)));
          $("#coverageSources").innerHTML = `<div class="table-wrap"><table class="data research-coverage-table"><thead><tr><th>机构 / 类型</th><th>已见来源 / 账号</th><th>记录</th><th>可用发布范围 / 日期恢复</th><th>最近采集 / 发现字段</th><th>监测 / 窗口 / 失败原因</th></tr></thead><tbody>${values.slice((groupPage - 1) * 12, groupPage * 12).map((group) => {
            if (group.observedCell) { const publication = OBJECT(group.publication); return `<tr><td>${esc(institution(group.ktid))}<small>${esc(angleName(group.angle))} · ${esc(group.platform || "角度汇总")}</small></td><td>${(group.source_entries || []).map((entry) => `<small>${esc(entry.url)} · ${fmt(entry.count)} 条</small>`).join("") || "快照未观察到入口"}${group.omitted_source_entries ? `<small>另有 ${fmt(group.omitted_source_entries)} 个已见入口</small>` : ""}</td><td>${fmt(group.count)}</td><td>${publication.min ? esc(publication.min) + " 至 " + esc(publication.max) : "发布时间未提供"}<small>原字段缺 ${fmt(publication.original_missing)} · 恢复 ${fmt(publication.recovered)} · 仍缺 ${fmt(publication.unresolved)}</small></td><td>${esc(group.latest_collected_at || group.latest_discovered_at || "未提供")}</td><td>${group.monitoring_status === "not_connected" ? "监测证据未接入" : esc(group.monitoring_status || "未知")}<small>期望窗口未配置 · 失败日志未接入</small></td></tr>`; }
            const dates = group.rows.map((row) => str(row.publish_time)).filter(Boolean).sort(compareDates), collected = group.rows.map((row) => row.collected_time || row.discovery_time || row.founddate).filter(present).sort(compareDates);
            return `<tr><td>${esc(institution(group.ktid))}<small>${angleName(group.angle)}</small></td><td>${esc(group.source)}</td><td>${group.rows.length}</td><td>${dates.length ? esc(dates[dates.length - 1]) + " 至 " + esc(dates[0]) : "发布时间未提供"}</td><td>${esc(collected[0] || "未提供")}</td><td>未配置 / 未接入</td></tr>`;
          }).join("") || '<tr><td colspan="6">当前范围尚无来源观察单元</td></tr>'}</tbody></table></div>`;
          paginate(values.length, groupPage, $("#coverageSourcesPager"), (next) => { groupPage = next; draw(); }, 12);
        }
        recordList(rows, $("#coverageRecords"), page);
        paginate(rows.length, page, $("#coveragePager"), (next) => { page = next; draw(); });
        $("#exportCoverage").disabled = !rows.length;
      }
      $("#coverageIssue").onchange = (event) => { issue = event.target.value; page = 1; groupPage = 1; draw(); };
      $("#coverageInstitution").onchange = (event) => { institutionId = event.target.value; page = 1; groupPage = 1; draw(); };
      $("#coverageAngle").onchange = (event) => { angle = event.target.value; page = 1; groupPage = 1; draw(); };
      $("#exportCoverage").onclick = () => api.downloadCsv?.("zgclab-来源与缺口.csv", ["记录ID", "角度", "机构", "检查项", "检查状态", "发布时间原值", "恢复日期", "日期状态", "日期依据", "采集时间", "发现时间", "原文URL", "证据链接", "数据版本"], rows.map((entry) => { const extra = sidecarRow(research, entry.angle, entry.r.id), publication = OBJECT(extra.publication); return [entry.r.id, angleName(entry.angle), institution(entry.r.ktid), issues.find(([key]) => key === issue)?.[1], { missing: "快照已知缺失", unknown: "索引未披露，待查详情", present: "已提供", "not-applicable": "不适用" }[coverageIssue(entry, issue, research)], entry.r.publish_time, publication.status === "recovered" ? publication.effective : "", publication.status, str(publication.basis), entry.r.collected_time, entry.r.discovery_time || entry.r.founddate, sourceUrl(entry.r), fullHref(evidenceHref(entry)), meta.version]; }));
      draw();
      await serviceStatus(all, $("#coverageServiceStatus"));
    }
  }
  render.validateWorkspaceSupplement = validateWorkspaceSupplement;
  render.mergeBackup = mergeBackup;
  return { render, evidenceModel, isPlaceholder, paragraphs, canonicalUrl, linksIn, titleKeywords, relatedCandidates, snapshotFor, compareSnapshots, coverageIssue, planCatalog: PLAN, signature, escapeHtml, validateWorkspaceSupplement, mergeBackup, sidecarRow, serviceStatusModel, compactSnapshot, storageBytes, compareServiceVersion };
});
