/* Research projects. No dependencies; mutations are confined to workspace.projects.
 * Integrate: ZGCLAB_PROJECTS(params, api); addRecord(angle, r, api);
 * addEntries([{angle, r}], api, {projectId?, sourceLabel?}).
 * Backups: validateImport(payload), mergeProjects(workspace, payload), exportData(workspace).
 * mergeProjects validates the whole input before mutation and never touches other fields.
 */
(function (root, factory) {
  "use strict";
  const projects = factory();
  if (typeof module === "object" && module.exports) module.exports = projects;
  else root.ZGCLAB_PROJECTS = projects;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const ANGLES = ["news", "clue", "social"];
  const STATUS = { pending: "待核查", verified: "已核对", adopted: "采用" };
  const FORMAT = "zgclab-projects";
  const LIMITS = { projects: 500, items: 100000, file: 25 * 1024 * 1024, report: 2000000 };
  const PAGE = 20;
  const unsavedWorkspaces = new WeakSet();
  const STORAGE_WARNING = "浏览器未能保存，编辑仅在本次访问中保留；请导出专题或工作台备份后再刷新。";
  const own = (o, key) => Object.prototype.hasOwnProperty.call(o, key);
  const object = (o) => !!o && typeof o === "object" && !Array.isArray(o);
  const text = (value) => value == null ? "" : String(value);
  const esc = (value) => text(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const normalize = (value) => text(value).normalize("NFKC").toLowerCase();
  const ICONS = { folder: '<path d="M3 7h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm0 0V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v1"/>', plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>', file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Zm0 0v6h6M8 13h8M8 17h5"/>', arrow: '<path d="m9 5 7 7-7 7"/>', down: '<path d="m6 9 6 6 6-6"/>', download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>', upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 17v4h16v-4"/>', bookmark: '<path d="M6 3h12v18l-6-4-6 4V3Z"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>', up: '<path d="M12 19V5m-5 5 5-5 5 5"/>', moveDown: '<path d="M12 5v14m-5-5 5 5 5-5"/>', link: '<path d="M14 4h6v6m0-6-9 9M10 4H4v16h16v-6"/>' };
  const icon = (name) => `<svg class="project-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.file}</svg>`;
  const dateLabel = (value) => text(value).slice(0, 10);
  const now = () => new Date().toISOString();
  const keyOf = (item) => `${item.angle}:${item.id}`;
  const uid = () => "prj-" + (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12));
  function safeUrl(value) {
    const raw = text(value).trim();
    if (!/^https?:\/\//i.test(raw)) return "";
    try { const u = new URL(raw); return /^https?:$/.test(u.protocol) ? u.href : ""; } catch (_) { return ""; }
  }
  function stringField(value, max, label, required) {
    if (value == null && !required) return "";
    if (typeof value !== "string" && typeof value !== "number") throw new Error(`${label}必须是文本`);
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`${label}无效`);
    const out = String(value);
    if (out.length > max || (required && !out.trim())) throw new Error(`${label}${out.length > max ? "过长" : "不能为空"}`);
    return out;
  }
  function dateField(value, label) {
    const s = stringField(value, 80, label);
    if (s && !Number.isFinite(Date.parse(s))) throw new Error(`${label}无效`);
    return s;
  }
  function recordId(value) {
    const id = stringField(value, 160, "记录 ID", true);
    if (!/^[a-z0-9._:-]+$/i.test(id)) throw new Error("记录 ID 格式不正确");
    return id;
  }
  function sanitizeItem(raw) {
    if (!object(raw) || !ANGLES.includes(raw.angle)) throw new Error("材料角度无效");
    if (raw.status != null && !own(STATUS, raw.status)) throw new Error("材料核查状态无效");
    if (raw.selected != null && typeof raw.selected !== "boolean") throw new Error("报告材料选择格式不正确");
    if (raw.simulation != null && typeof raw.simulation !== "boolean") throw new Error("模拟数据标记无效");
    return {
      angle: raw.angle, id: recordId(raw.id), title: stringField(raw.title, 12000, "材料标题"),
      ktid: stringField(raw.ktid, 160, "机构 ID"), institution: stringField(raw.institution, 1000, "机构名称"),
      date: stringField(raw.date, 160, "记录日期"), url: safeUrl(stringField(raw.url, 12000, "原文链接")),
      dataVersion: stringField(raw.dataVersion, 200, "数据版本"), simulation: raw.simulation === true,
      snippet: stringField(raw.snippet, 30000, "材料摘要"), note: stringField(raw.note, 30000, "批注"),
      excerpt: stringField(raw.excerpt, 50000, "重点摘录"), status: raw.status || "pending", selected: raw.selected !== false,
      addedAt: dateField(raw.addedAt, "材料添加时间"), updatedAt: dateField(raw.updatedAt, "材料更新时间"),
    };
  }
  function sanitizeProject(raw) {
    if (!object(raw)) throw new Error("专题格式不正确");
    const id = stringField(raw.id, 160, "专题 ID", true);
    if (!/^[a-z0-9_-]+$/i.test(id)) throw new Error("专题 ID 格式不正确");
    if (raw.archived != null && typeof raw.archived !== "boolean") throw new Error("专题归档标记无效");
    if (!Array.isArray(raw.items) || raw.items.length > LIMITS.items) throw new Error("专题材料列表无效或过大");
    const seen = new Set(), items = raw.items.map(sanitizeItem).filter((item) => {
      const key = keyOf(item); if (seen.has(key)) throw new Error("同一专题包含重复材料"); seen.add(key); return true;
    });
    const report = raw.report == null ? {} : raw.report;
    if (!object(report)) throw new Error("专题报告格式不正确");
    if (report.materialKeys != null && (!Array.isArray(report.materialKeys) || report.materialKeys.length > LIMITS.items || report.materialKeys.some((key) => typeof key !== "string" || key.length > 180))) throw new Error("报告引用列表格式不正确");
    return {
      id, name: stringField(raw.name, 200, "专题名称", true).trim(), description: stringField(raw.description, 20000, "专题说明"),
      archived: raw.archived === true, createdAt: dateField(raw.createdAt, "专题创建时间"), updatedAt: dateField(raw.updatedAt, "专题更新时间"), items,
      report: {
        markdown: stringField(report.markdown, LIMITS.report, "专题报告"), updatedAt: dateField(report.updatedAt, "报告更新时间"),
        generatedAt: dateField(report.generatedAt, "报告生成时间"), materialKeys: [...new Set(report.materialKeys || [])],
        dataVersion: stringField(report.dataVersion, 200, "报告数据版本"),
      },
    };
  }
  function validateProjects(list) {
    if (!Array.isArray(list) || list.length > LIMITS.projects) throw new Error("专题列表无效或超过 500 个专题");
    const seen = new Set(); let count = 0;
    return list.map((raw) => {
      const project = sanitizeProject(raw);
      if (seen.has(project.id)) throw new Error("专题 ID 重复"); seen.add(project.id);
      count += project.items.length; if (count > LIMITS.items) throw new Error("材料总数超过 100000 条");
      return project;
    });
  }
  function validateImport(payload) {
    if (!object(payload) || !Array.isArray(payload.projects)) throw new Error("请选择含 projects 数组的专题 JSON 或工作台备份");
    if (payload.format != null && payload.format !== FORMAT) throw new Error("专题备份类型不受支持");
    if (payload.schemaVersion != null && payload.schemaVersion !== 1) throw new Error("专题备份版本不受支持");
    return validateProjects(payload.projects);
  }
  function projectsOf(workspace) {
    if (!object(workspace)) throw new Error("工作台不可用");
    if (workspace.projects == null) workspace.projects = [];
    if (!Array.isArray(workspace.projects)) throw new Error("已有专题数据格式不正确，请先导出工作台备份");
    return workspace.projects;
  }
  function createProject(workspace, name, description) {
    const list = projectsOf(workspace);
    if (list.length >= LIMITS.projects) throw new Error("最多可建立 500 个专题");
    const time = now();
    const project = sanitizeProject({ id: uid(), name, description: description || "", createdAt: time, updatedAt: time, items: [], report: {} });
    list.push(project); return project;
  }
  function snapshot(angle, r, api) {
    if (!ANGLES.includes(angle) || !object(r)) throw new Error("待添加记录格式不正确");
    const version = r._simulation ? r._simulation_version || api.META?.simulation?.version || api.META?.version : api.META?.version;
    const time = now();
    return sanitizeItem({
      angle, id: r.id, ktid: r.ktid, title: api.titleOf ? api.titleOf(angle, r) : r.title_cn ?? r.title ?? r.id,
      institution: api.instName ? api.instName(r.ktid) : r.ktid, date: r.publish_time ?? r.founddate ?? r.discovery_time ?? r.collected_time,
      url: api.Q?.sourceLink ? api.Q.sourceLink(r) : r.url ?? r.original_url ?? r.content_url ?? r.source_url,
      dataVersion: text(version), simulation: !!r._simulation, snippet: text(api.snippetOf ? api.snippetOf(angle, r) : r.summary_cn ?? r.summary ?? r.original_content).slice(0, 30000),
      status: "pending", selected: true, addedAt: time, updatedAt: time,
    });
  }
  function prepareEntries(entries, api) {
    if (!Array.isArray(entries) || entries.length > LIMITS.items) throw new Error("待添加材料列表无效或过大");
    const seen = new Set(), items = [];
    for (const entry of entries) {
      if (!object(entry)) throw new Error("待添加材料格式不正确");
      const item = snapshot(entry.angle, entry.r, api), key = keyOf(item);
      if (!seen.has(key)) { items.push(item); seen.add(key); }
    }
    return items;
  }
  function addToProject(workspace, projectId, entries, api) {
    const list = projectsOf(workspace), project = list.find((p) => p.id === projectId);
    if (!project) throw new Error("专题不存在，请重新选择");
    if (project.archived) throw new Error("请先恢复已归档专题，再添加材料");
    const items = prepareEntries(entries, api), seen = new Set(project.items.map(keyOf));
    const fresh = items.filter((item) => !seen.has(keyOf(item)));
    if (list.reduce((sum, p) => sum + p.items.length, 0) + fresh.length > LIMITS.items) throw new Error("材料总数超过 100000 条");
    project.items.push(...fresh); if (fresh.length) project.updatedAt = now();
    return { project, added: fresh.length, skipped: entries.length - fresh.length };
  }
  function comparableItem(item) {
    const { updatedAt, addedAt, ...content } = item; return JSON.stringify(content);
  }
  function projectConflicts(local, incoming) {
    if (local.name !== incoming.name || local.description !== incoming.description || local.archived !== incoming.archived) return true;
    if (local.report.markdown !== incoming.report.markdown && incoming.report.markdown) return true;
    const byKey = new Map(local.items.map((item) => [keyOf(item), item]));
    return incoming.items.some((item) => byKey.has(keyOf(item)) && comparableItem(byKey.get(keyOf(item))) !== comparableItem(item));
  }
  function hash(value) {
    let result = 2166136261;
    for (let n = 0; n < value.length; n++) result = Math.imul(result ^ value.charCodeAt(n), 16777619);
    return (result >>> 0).toString(36);
  }
  function planImport(workspace, payload) {
    if (!object(workspace)) throw new Error("工作台不可用");
    const incoming = validateImport(payload), list = validateProjects(workspace.projects == null ? [] : workspace.projects);
    const byId = new Map(list.map((p) => [p.id, p]));
    const result = { addedProjects: 0, addedItems: 0, conflictCopies: 0, skippedProjects: 0, projects: list };
    for (const project of incoming) {
      const local = byId.get(project.id);
      if (!local) { list.push(project); byId.set(project.id, project); result.addedProjects++; result.addedItems += project.items.length; continue; }
      if (projectConflicts(local, project)) {
        const digest = hash(JSON.stringify(project)), copyId = project.id.slice(0, 120) + "-import-" + digest;
        if (byId.has(copyId)) { result.skippedProjects++; continue; }
        const copy = { ...project, id: copyId, name: project.name.slice(0, 190) + "（导入副本）" };
        list.push(copy); byId.set(copy.id, copy); result.addedProjects++; result.addedItems += copy.items.length; result.conflictCopies++; continue;
      }
      const seen = new Set(local.items.map(keyOf)), fresh = project.items.filter((item) => !seen.has(keyOf(item)));
      local.items.push(...fresh); result.addedItems += fresh.length;
      if (!local.report.markdown && project.report.markdown) local.report = project.report;
      if (fresh.length) local.updatedAt = now(); else result.skippedProjects++;
    }
    validateProjects(list); return result;
  }
  function mergeProjects(workspace, payload) {
    const result = planImport(workspace, payload);
    workspace.projects = result.projects;
    const { projects, ...summary } = result; return summary;
  }
  function mergeBackup(projects, workspace) {
    if (projects == null) return { addedProjects: 0, addedItems: 0, conflictCopies: 0, skippedProjects: 0 };
    return mergeProjects(workspace, { projects });
  }
  function exportData(workspace, options) {
    const projects = validateProjects(projectsOf(workspace)).filter((p) => !options?.projectId || p.id === options.projectId);
    return { format: FORMAT, schemaVersion: 1, exportedAt: now(), dataVersion: text(options?.dataVersion), projects };
  }
  function recordHref(item) { return `#/record/${item.angle}/${encodeURIComponent(item.id)}${item.simulation ? "?sim=1" : ""}`; }
  const mdText = (value) => text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[\\`*_[\]{}()#+.!|~-]/g, "\\$&");
  const mdUrl = (value) => text(value).replace(/[\s<>"()\\]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  function reportText(project, options) {
    const selected = project.items.filter((item) => item.selected);
    const time = options?.generatedAt || now(), base = safeUrl(options?.baseUrl);
    const link = (item) => (base ? base.split("#")[0] : "") + recordHref(item);
    const lines = ["# " + mdText(project.name), "", "专题说明：" + mdText(project.description || "未填写"), "", `生成时间：${mdText(time)}`, "", `材料范围：用户选定的 ${selected.length} 条材料；按专题内顺序排列。`, "", "## 研究结论", "", "请在此填写研究结论，并用下方材料编号标注依据。", "", "## 材料与批注", ""];
    selected.forEach((item, index) => {
      const source = safeUrl(item.url);
      lines.push(`### ${index + 1}. ${mdText(item.title || item.id)}`, "", `- 核查状态：${STATUS[item.status] || STATUS.pending}`, `- 机构：${mdText(item.institution || item.ktid || "未提供")}`, `- 记录日期：${mdText(item.date || "未提供")}`, `- 记录链接：[${mdText(item.angle + ":" + item.id)}](${mdUrl(link(item))})`, source ? `- 原文：[打开原文](${mdUrl(source)})` : "- 原文：未提供可用的 HTTP(S) 链接", `- 数据版本：${mdText(item.dataVersion || "未提供")}${item.simulation ? "（模拟数据）" : ""}`, "", "重点摘录：", "", ...text(item.excerpt || item.snippet || "未填写").split(/\r?\n/).map((line) => "> " + mdText(line)), "", "批注：", "", mdText(item.note || "未填写"), "");
    });
    lines.push("## 引用清单", "");
    selected.forEach((item, index) => lines.push(`${index + 1}. [${mdText(item.title || item.id)}](${mdUrl(link(item))}) · ${safeUrl(item.url) ? `[原文](${mdUrl(safeUrl(item.url))})` : "原文链接未提供"} · 数据版本 ${mdText(item.dataVersion || "未提供")}`));
    if (!selected.length) lines.push("尚未选定材料。");
    return lines.join("\n") + "\n";
  }
  const CSV_HEADERS = ["专题ID", "专题名称", "专题说明", "已归档", "顺序", "角度", "记录ID", "标题", "机构ID", "机构", "记录日期", "核查状态", "批注", "重点摘录", "用于报告", "摘要", "记录链接", "原文链接", "数据版本", "数据性质"];
  function csvRows(projects) {
    return projects.flatMap((p) => p.items.length ? p.items.map((item, index) => [p.id, p.name, p.description, p.archived ? "是" : "否", index + 1, item.angle, item.id, item.title, item.ktid, item.institution, item.date, STATUS[item.status], item.note, item.excerpt, item.selected ? "是" : "否", item.snippet, recordHref(item), safeUrl(item.url), item.dataVersion, item.simulation ? "模拟数据" : "真实交付数据"]) : [[p.id, p.name, p.description, p.archived ? "是" : "否", ...Array(16).fill("")]]);
  }
  function csvText(projects) {
    const cell = (value) => {
      let s = text(value); if (/^[\s\uFEFF]*[=+@-]/.test(s) && !/^-?\d+(?:\.\d+)?$/.test(s.trim())) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    return "\ufeff" + [CSV_HEADERS, ...csvRows(projects)].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
  }
  function download(filename, content, type, signal) {
    const url = URL.createObjectURL(new Blob([content], { type })), a = document.createElement("a");
    a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
    let timer;
    const clean = () => { URL.revokeObjectURL(url); clearTimeout(timer); signal?.removeEventListener("abort", clean); };
    timer = setTimeout(clean, 1000); signal?.addEventListener("abort", clean, { once: true });
  }
  function alive(api) { return !api.signal?.aborted && !(api.version != null && api.currentVersion && api.version !== api.currentVersion()); }
  function notify(api, message) { if (alive(api)) api.showToast?.(message); }
  function save(api) {
    let saved = false;
    try { saved = api.saveWorkspace() !== false; } catch (_) { /* Keep in-memory edits available for export. */ }
    if (saved) unsavedWorkspaces.delete(api.workspace); else unsavedWorkspaces.add(api.workspace);
    if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent("zgclab:projectsave", { detail: { workspace: api.workspace, saved } }));
    return saved;
  }
  function changed(api) {
    const saved = save(api);
    if (!saved) notify(api, STORAGE_WARNING);
    if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent("zgclab:projectschange"));
    return saved;
  }
  function dialog(api, title, body, submitLabel, handler) {
    if (!alive(api)) return Promise.resolve(null);
    return new Promise((resolve) => {
      const previousFocus = document.activeElement, el = document.createElement("dialog");
      el.className = "projects-dialog"; el.tabIndex = -1;
      const titleId = uid() + "-title"; el.setAttribute("aria-labelledby", titleId);
      el.innerHTML = `<form><div class="projects-dialog-head"><h2 id="${titleId}">${esc(title)}</h2><button class="icon-btn" type="button" data-dialog-close aria-label="关闭">${icon("close")}</button></div><div class="projects-dialog-content">${body}<p class="projects-error" role="alert" hidden></p></div><div class="projects-dialog-actions"><button class="btn" type="button" data-dialog-close>取消</button><button class="btn primary" type="submit">${esc(submitLabel)}</button></div></form>`;
      document.body.append(el); let settled = false;
      const close = (result) => {
        if (settled) return; settled = true;
        api.signal?.removeEventListener("abort", cancel); window.removeEventListener("hashchange", cancel);
        document.removeEventListener("keydown", trapFocus, true);
        el.removeEventListener("close", onNativeClose);
        if (el.open) el.close(); el.remove();
        if (previousFocus?.isConnected && alive(api)) previousFocus.focus({ preventScroll: true }); resolve(result);
      };
      const cancel = () => close(null);
      const onNativeClose = () => { if (!el.open) cancel(); };
      const focusable = () => [...el.querySelectorAll('a[href],area[href],button,input,select,textarea,summary,iframe,object,embed,[contenteditable],[tabindex]')]
        .filter((node) => {
          if (node.tabIndex < 0 || node.matches(':disabled,input[type="hidden"]') || node.closest('[hidden],[inert],[aria-hidden="true"]') || !node.getClientRects().length || ["hidden", "collapse"].includes(getComputedStyle(node).visibility)) return false;
          for (let parent = node.parentElement; parent && parent !== el; parent = parent.parentElement) {
            if (parent.matches("details:not([open])")) {
              const summary = [...parent.children].find((child) => child.tagName === "SUMMARY");
              if (!summary?.contains(node)) return false;
            }
          }
          return true;
        })
        .sort((a, b) => (a.tabIndex > 0 ? a.tabIndex : Infinity) - (b.tabIndex > 0 ? b.tabIndex : Infinity));
      const trapFocus = (event) => {
        if (settled || !el.open || !el.isConnected || event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
        const active = document.activeElement, activeModal = active?.closest("dialog:modal");
        // Another native modal may temporarily sit above this one. It owns its keys.
        if (activeModal && activeModal !== el) return;
        if (!el.contains(active) && [...document.querySelectorAll("dialog:modal")].some((other) => other !== el)) return;
        const targets = focusable(), first = targets[0], last = targets[targets.length - 1];
        if (!first) { event.preventDefault(); el.focus({ preventScroll: true }); return; }
        if (!targets.includes(active) || event.shiftKey && active === first || !event.shiftKey && active === last) {
          event.preventDefault(); (event.shiftKey ? last : first).focus({ preventScroll: true });
        }
      };
      el.addEventListener("close", onNativeClose);
      el.querySelectorAll("[data-dialog-close]").forEach((button) => button.onclick = cancel);
      el.addEventListener("cancel", (event) => { event.preventDefault(); cancel(); });
      el.addEventListener("click", (event) => { if (event.target === el) { const rect = el.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) cancel(); } });
      el.querySelector("form").onsubmit = async (event) => {
        event.preventDefault(); const button = el.querySelector('[type="submit"]'), error = el.querySelector('[role="alert"]');
        button.disabled = true; error.hidden = true;
        try { const result = await handler(el); if (alive(api) && !settled) close(result); else cancel(); }
        catch (failure) { if (!settled && alive(api)) { error.textContent = failure.message || "操作失败"; error.hidden = false; button.disabled = false; } }
      };
      api.signal?.addEventListener("abort", cancel, { once: true }); window.addEventListener("hashchange", cancel);
      document.addEventListener("keydown", trapFocus, true);
      el.showModal();
      if (!el.contains(document.activeElement)) (focusable()[0] || el).focus({ preventScroll: true });
    });
  }
  async function editProject(api, project) {
    return dialog(api, project ? "编辑专题" : "新建专题", `<label>专题名称<input name="name" required maxlength="200" value="${esc(project?.name)}" placeholder="例如：人工智能政策跟踪" autofocus></label><label>专题说明<textarea name="description" rows="4" maxlength="20000" placeholder="研究问题、范围和交付目标">${esc(project?.description)}</textarea></label>`, project ? "保存专题" : "建立专题", (el) => {
      const name = el.querySelector('[name="name"]').value.trim(), description = el.querySelector('[name="description"]').value;
      if (!name) throw new Error("请填写专题名称");
      if (project) { project.name = name; project.description = description; project.updatedAt = now(); }
      else project = createProject(api.workspace, name, description);
      changed(api); return project;
    });
  }
  async function addEntries(entries, api, options) {
    if (!alive(api)) return null;
    let prepared;
    try { prepared = prepareEntries(entries, api); validateProjects(projectsOf(api.workspace)); }
    catch (error) { notify(api, error.message); return null; }
    if (!prepared.length) { notify(api, "当前没有可添加的材料"); return null; }
    const list = projectsOf(api.workspace).filter((p) => !p.archived), selected = list.find((p) => p.id === options?.projectId) || list[0];
    const body = `<p>将${esc(options?.sourceLabel ? "“" + options.sourceLabel + "”中的 " : "")}<strong>${prepared.length}</strong> 条材料加入专题，已有记录自动跳过。</p><label>选择专题<select name="project"><option value="" ${!selected ? "selected" : ""}>＋ 新建专题</option>${list.map((p) => `<option value="${esc(p.id)}" ${p === selected ? "selected" : ""}>${esc(p.name)}（${p.items.length} 条）</option>`).join("")}</select></label><fieldset class="projects-new-fields" ${selected ? "hidden" : ""}><label>新专题名称<input name="name" maxlength="200" placeholder="填写专题名称" ${!selected ? "required" : ""}></label><label>专题说明<textarea name="description" rows="3" maxlength="20000"></textarea></label></fieldset><details><summary>查看待加入材料（共 ${prepared.length} 条）</summary><ul class="projects-add-preview">${prepared.slice(0, 50).map((item) => `<li>${esc(item.title || item.id)}</li>`).join("")}</ul>${prepared.length > 50 ? `<p class="note">预览显示前 50 条，加入时处理全部 ${prepared.length} 条。</p>` : ""}</details>`;
    // Bind before showModal's focus step without installing any persistent listener.
    const resultPromise = dialog(api, "加入专题", body, "确认加入", (el) => {
      const projectId = el.querySelector('[name="project"]').value;
      let project = projectsOf(api.workspace).find((p) => p.id === projectId);
      const total = projectsOf(api.workspace).reduce((sum, p) => sum + p.items.length, 0);
      if (total + (project ? prepared.filter((item) => !project.items.some((x) => keyOf(x) === keyOf(item))).length : prepared.length) > LIMITS.items) throw new Error("材料总数超过 100000 条");
      if (!projectId) project = createProject(api.workspace, el.querySelector('[name="name"]').value.trim(), el.querySelector('[name="description"]').value);
      if (!project) throw new Error("专题不存在，请重新选择");
      if (project.archived) throw new Error("请先恢复已归档专题");
      const seen = new Set(project.items.map(keyOf)), fresh = prepared.filter((item) => !seen.has(keyOf(item)));
      project.items.push(...fresh); if (fresh.length) project.updatedAt = now(); const saved = changed(api);
      const result = { project, added: fresh.length, skipped: entries.length - fresh.length };
      notify(api, `已加入 ${fresh.length} 条${result.skipped ? `，跳过 ${result.skipped} 条重复材料` : ""}${saved ? "" : "；" + STORAGE_WARNING}`); return result;
    });
    const el = document.querySelector("dialog.projects-dialog:last-of-type");
    if (el) el.querySelector('[name="project"]').onchange = (event) => { const isNew = !event.target.value; el.querySelector("fieldset").hidden = !isNew; el.querySelector('[name="name"]').required = isNew; };
    return resultPromise;
  }
  function addRecord(angle, record, api) { return addEntries([{ angle, r: record }], api); }
  async function render(params, api) {
    const { view, workspace } = api;
    if (!alive(api)) return;
    try { workspace.projects = validateProjects(projectsOf(workspace)); }
    catch (error) { view.innerHTML = `<div class="page-head"><h1>专题资料夹</h1></div><div class="card pad"><p role="alert">${esc(error.message)}</p><p>请在“我的工作台”导出备份后检查专题数据。</p><a class="btn" href="#/workspace">前往我的工作台</a></div>`; return; }
    let currentId = params?.get("id") || "", projectSearch = "", archiveFilter = "active", search = "", status = "", angle = "", page = 1, undo = null, saveTimer, dirty = false, run = 0, generating = 0, panel = "materials";
    if (projectsOf(workspace).find((p) => p.id === currentId)?.archived) archiveFilter = "archived";
    let current = () => projectsOf(workspace).find((p) => p.id === currentId);
    const $ = (s) => view.querySelector(s), listen = (node, type, handler) => node.addEventListener(type, handler, api.signal ? { signal: api.signal } : undefined);
    function updateSaveStatus() {
      const failed = unsavedWorkspaces.has(workspace), banner = $("#projectsStorageStatus"), label = $("#projectReportSaved"), p = current();
      if (banner) { banner.hidden = !failed; banner.textContent = failed ? STORAGE_WARNING : ""; }
      if (label && p) label.textContent = failed ? STORAGE_WARNING : dirty ? "编辑已保留，自动保存中…" : p.report.updatedAt ? "已保存于 " + p.report.updatedAt : "尚未编写报告";
    }
    const flush = () => {
      clearTimeout(saveTimer);
      if (dirty || unsavedWorkspaces.has(workspace)) { dirty = false; save(api); }
      if (alive(api)) updateSaveStatus();
    };
    const persist = (immediate) => { dirty = true; if (immediate) flush(); else { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 350); } };
    const touch = (project) => { project.updatedAt = now(); };
    const cleanup = () => {
      run++; flush(); window.removeEventListener("hashchange", cleanup);
      window.removeEventListener("pagehide", flush); window.removeEventListener("beforeunload", flush);
    };
    api.signal?.addEventListener("abort", cleanup, { once: true }); window.addEventListener("hashchange", cleanup, { once: true });
    window.addEventListener("pagehide", flush); window.addEventListener("beforeunload", flush);
    view.innerHTML = `<div class="projects-page"><div class="page-head"><div><span class="kicker">研究工作区 / PROJECTS</span><h1>专题资料夹</h1><p>围绕研究问题收集材料，把核查与批注整理成有出处的报告。</p></div><div class="page-actions"><button class="btn primary" id="projectsNew">${icon("plus")}新建专题</button><button class="btn" id="projectsExportAll">${icon("download")}备份全部专题</button><label class="btn import-label" tabindex="0" role="button" aria-label="导入专题 JSON 备份">${icon("upload")}导入 JSON<input id="projectsImport" type="file" accept=".json,application/json" hidden></label></div></div><p id="projectsStorageStatus" class="inline-error" role="status" hidden></p><div class="projects-layout"><aside class="projects-sidebar" aria-label="专题列表"><details id="projectsNavigation" open><summary><span class="projects-nav-heading">${icon("folder")}专题导航 <span id="projectsFolderCount" class="projects-nav-count rw-count"></span></span><span id="projectsNavigationCurrent" class="projects-nav-current"></span>${icon("down")}</summary><div class="projects-nav-content"><label class="projects-search-label"><span class="sr-only">搜索专题</span>${icon("search")}<input type="search" id="projectsSearch" placeholder="搜索专题名称或说明"></label><label class="projects-scope"><span>显示范围</span><select id="projectsArchive"><option value="active">进行中</option><option value="archived">已归档</option><option value="all">全部专题</option></select></label><div id="projectsList" class="projects-list"></div><p class="projects-local-note">${icon("bookmark")}<span>保存在当前浏览器<br>定期备份，可随时导入恢复。</span></p></div></details></aside><section id="projectBody" class="projects-main" aria-label="专题内容"></section></div></div>`;
    const compactNavigation = window.matchMedia("(max-width: 820px)");
    const syncNavigation = () => { const nav = $("#projectsNavigation"); if (nav) nav.open = !compactNavigation.matches; const menu = $(".project-management"); if (menu) menu.open = !compactNavigation.matches; };
    syncNavigation(); listen(compactNavigation, "change", syncNavigation);
    listen($(".import-label"), "keydown", (event) => { if ((event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) { event.preventDefault(); $("#projectsImport").click(); } });
    $("#projectsArchive").value = archiveFilter;
    listen(document, "zgclab:projectsave", (event) => { if (event.detail?.workspace === workspace && alive(api)) updateSaveStatus(); });
    function choose(id) {
      flush(); run++; currentId = id; search = ""; status = ""; angle = ""; page = 1; undo = null; panel = "materials";
      if (compactNavigation.matches) { $("#projectsNavigation").open = false; $("#projectsNavigation > summary").focus({ preventScroll: true }); }
      const qs = new URLSearchParams(); if (id) qs.set("id", id); if (api.META?.simulation) qs.set("sim", "1");
      history.replaceState(null, "", "#/projects" + (qs.size ? "?" + qs : "")); drawList(); drawProject();
    }
    function drawList() {
      const list = projectsOf(workspace).filter((p) => (archiveFilter === "all" || p.archived === (archiveFilter === "archived")) && (!projectSearch || normalize(p.name + " " + p.description).includes(normalize(projectSearch))));
      $("#projectsFolderCount").textContent = list.length;
      $("#projectsNavigationCurrent").textContent = current()?.name || "选择专题";
      $("#projectsList").innerHTML = list.length ? list.map((p) => `<button type="button" class="projects-list-item ${p.id === currentId ? "active" : ""}" data-project-id="${esc(p.id)}" ${p.id === currentId ? 'aria-current="true"' : ""}><span class="projects-folder-icon">${icon("folder")}</span><span class="projects-folder-info"><strong>${esc(p.name)}</strong><span class="projects-folder-meta">${p.archived ? "已归档" : "进行中"}${p.report.markdown ? " · 已有报告" : ""}</span>${p.description ? `<small>${esc(p.description)}</small>` : ""}</span><span class="projects-item-count rw-count" aria-label="${p.items.length} 条材料">${p.items.length}</span></button>`).join("") : `<div class="projects-list-empty">${icon("folder")}<p>${projectSearch ? "没有匹配的专题" : archiveFilter === "archived" ? "暂无归档专题" : "从一个研究问题开始"}</p><span>${projectSearch ? "试试其他关键词" : archiveFilter === "archived" ? "归档的专题会保存在这里" : "点击「新建专题」整理第一份材料"}</span></div>`;
      $("#projectsList").querySelectorAll("[data-project-id]").forEach((button) => button.onclick = () => choose(button.dataset.projectId));
    }
    function filtered(project) {
      const q = normalize(search).trim();
      return project.items.filter((item) => (!status || item.status === status) && (!angle || item.angle === angle) && (!q || normalize([item.title, item.institution, item.ktid, item.id, item.snippet, item.note, item.excerpt, item.dataVersion].join(" ")).includes(q)));
    }
    function updateReportCount() {
      const p = current(); if (!p || !$("#projectReportCount")) return;
      const selected = p.items.filter((item) => item.selected), previous = new Set(p.report.materialKeys);
      const stale = p.report.generatedAt && (previous.size !== selected.length || selected.some((item) => !previous.has(keyOf(item)) || item.updatedAt > p.report.generatedAt));
      if ($("#projectSummaryMaterialCount")) $("#projectSummaryMaterialCount").textContent = p.items.length;
      if ($("#projectSummaryReviewed")) $("#projectSummaryReviewed").textContent = p.items.filter((item) => item.status !== "pending").length;
      if ($("#projectSummarySelected")) $("#projectSummarySelected").textContent = selected.length;
      if ($("#projectReviewedProgress")) $("#projectReviewedProgress").style.width = `${p.items.length ? p.items.filter((item) => item.status !== "pending").length / p.items.length * 100 : 0}%`;
      if ($("#projectPanelMaterialCount")) $("#projectPanelMaterialCount").textContent = p.items.length;
      if ($(".project-report-indicator")) $(".project-report-indicator").textContent = p.report.markdown ? "已编写" : "待编写";
      $("#projectReportCount").textContent = `已选 ${selected.length}/${p.items.length} 条材料，跨全部分页${stale ? " · 材料已变化，可重新生成引用草稿" : ""}`;
      $("#projectGenerateReport").disabled = p.archived || !selected.length || !!(generating && generating === run);
      $("#projectExportMarkdown").disabled = !p.report.markdown;
    }
    function drawItems() {
      const p = current(); if (!p) return;
      const rows = filtered(p); page = Math.min(Math.max(1, page), Math.max(1, Math.ceil(rows.length / PAGE)));
      const sample = rows.slice((page - 1) * PAGE, page * PAGE), disabled = p.archived ? "disabled" : "";
      $("#projectMaterialCount").textContent = `匹配 ${rows.length} / 共 ${p.items.length} 条材料`;
      $("#projectMaterials").innerHTML = sample.length ? sample.map((item) => {
        const index = p.items.indexOf(item), key = keyOf(item), source = safeUrl(item.url);
        return `<article class="project-material" data-material="${esc(key)}" data-status="${esc(item.status)}"><div class="project-material-top"><span class="tag ${item.angle}">${esc(api.META?.angles?.[item.angle]?.name || item.angle)}</span><span class="project-material-order">${String(index + 1).padStart(2, "0")}</span><label class="project-status-label"><span class="sr-only">核查状态</span><select data-item-field="status" aria-label="核查状态：${esc(item.title || item.id)}" ${disabled}>${Object.entries(STATUS).map(([key, label]) => `<option value="${key}" ${item.status === key ? "selected" : ""}>${label}</option>`).join("")}</select></label></div><h3><a href="${esc(recordHref(item))}">${esc(item.title || item.id)}</a></h3><div class="project-material-meta"><span>${esc(item.institution || item.ktid || "机构未提供")}</span><time datetime="${esc(item.date)}" title="${esc(item.date || "日期未提供")}">${esc(dateLabel(item.date) || "日期未提供")}</time>${item.simulation ? '<span class="project-simulation">模拟数据</span>' : ""}</div>${item.snippet ? `<p class="project-material-snippet">${esc(item.snippet)}</p>` : ""}<div class="project-material-links"><a href="${esc(recordHref(item))}">查看记录 ${icon("arrow")}</a>${source ? `<a href="${esc(source)}" target="_blank" rel="noopener noreferrer">原文 ${icon("link")}</a>` : '<span class="hint">原文链接未提供</span>'}<span class="project-material-version">数据版本 ${esc(item.dataVersion || "未提供")}</span></div><details class="project-annotations" ${item.note || item.excerpt ? "open" : ""}><summary>批注与重点摘录<span>${item.note || item.excerpt ? "已填写" : "添加批注"}</span>${icon("down")}</summary><div class="project-annotation-fields"><label>批注<textarea data-item-field="note" rows="3" maxlength="30000" placeholder="核查过程、用途和待解决的问题" ${disabled}>${esc(item.note)}</textarea></label><label>重点摘录<textarea data-item-field="excerpt" rows="3" maxlength="50000" placeholder="记录可引用的原文片段" ${disabled}>${esc(item.excerpt)}</textarea></label></div></details><div class="project-material-actions"><label class="projects-select-material"><input type="checkbox" data-item-field="selected" aria-label="选择报告材料：${esc(item.title || item.id)}" ${item.selected ? "checked" : ""} ${disabled}><span>用于报告</span></label><div class="project-order-actions"><button type="button" class="btn" data-item-action="up" ${index === 0 || p.archived ? "disabled" : ""} aria-label="上移材料：${esc(item.title || item.id)}" title="上移材料">${icon("up")}<span class="sr-only">上移</span></button><button type="button" class="btn" data-item-action="down" ${index === p.items.length - 1 || p.archived ? "disabled" : ""} aria-label="下移材料：${esc(item.title || item.id)}" title="下移材料">${icon("moveDown")}<span class="sr-only">下移</span></button><button type="button" class="btn project-remove" data-item-action="remove" ${disabled}>移除</button></div></div></article>`;
      }).join("") : `<div class="projects-empty project-material-empty"><span class="rw-icon">${icon(p.items.length ? "search" : "file")}</span><h3>${p.items.length ? "没有匹配的材料" : "为这个专题加入第一份材料"}</h3><p>${p.items.length ? "试着减少关键词，或调整核查状态和采集角度。" : "从收藏中选取记录，或浏览数据，将相关材料集中到这里。"}</p>${p.items.length ? '<button class="btn" type="button" data-project-clear-filters>重置材料筛选</button>' : `<div class="projects-actions"><button class="btn" type="button" data-project-add-favorites ${disabled}>${icon("bookmark")}从收藏添加</button><a class="btn" href="#/explore">浏览材料 ${icon("arrow")}</a></div>`}</div>`;
      $("[data-project-clear-filters]")?.addEventListener("click", () => { search = ""; status = ""; angle = ""; page = 1; $("#projectMaterialSearch").value = ""; $("#projectStatus").value = ""; $("#projectAngle").value = ""; drawItems(); });
      $("[data-project-add-favorites]")?.addEventListener("click", () => $("#projectAddFavorites").click());
      const pages = Math.max(1, Math.ceil(rows.length / PAGE));
      $("#projectMaterialPager").innerHTML = `<div class="projects-pager"><button class="btn" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>上一页</button><span>第 ${page} / ${pages} 页</span><button class="btn" data-page="${page + 1}" ${page >= pages ? "disabled" : ""}>下一页</button></div>`;
      $("#projectMaterialPager").hidden = rows.length <= PAGE;
      $("#projectMaterialPager").querySelectorAll("[data-page]").forEach((button) => button.onclick = () => { page = Number(button.dataset.page); drawItems(); $("#projectMaterials").scrollIntoView({ block: "start" }); });
      $("#projectMaterials").querySelectorAll("[data-material]").forEach((card) => {
        const item = p.items.find((i) => keyOf(i) === card.dataset.material);
        card.querySelectorAll("[data-item-field]").forEach((input) => {
          const field = input.dataset.itemField;
          input.addEventListener(field === "note" || field === "excerpt" ? "input" : "change", () => {
            if (!alive(api) || p.archived) return;
            item[field] = field === "selected" ? input.checked : input.value; item.updatedAt = now(); touch(p); persist(field === "selected" || field === "status");
            if (field === "status") card.dataset.status = item.status;
            if (field === "status" && status) drawItems(); else updateReportCount();
          });
        });
        card.querySelectorAll("[data-item-action]").forEach((button) => button.onclick = () => {
          if (!alive(api) || p.archived) return;
          const index = p.items.indexOf(item), action = button.dataset.itemAction;
          if (action === "remove") { p.items.splice(index, 1); undo = { projectId: p.id, item, index }; drawUndo(); }
          else { const next = index + (action === "up" ? -1 : 1); if (next < 0 || next >= p.items.length) return; [p.items[index], p.items[next]] = [p.items[next], p.items[index]]; }
          touch(p); persist(true); drawItems(); drawList();
        });
      });
      updateReportCount();
    }
    function drawUndo() {
      const box = $("#projectUndo"); if (!box) return;
      box.innerHTML = undo ? `<div class="projects-undo" role="status"><span>已移除“${esc(undo.item.title || undo.item.id)}”</span><button class="btn" id="projectUndoRemove">撤销移除</button></div>` : "";
      if (undo) $("#projectUndoRemove").onclick = () => {
        const p = projectsOf(workspace).find((p) => p.id === undo.projectId);
        if (p && !p.archived && !p.items.some((i) => keyOf(i) === keyOf(undo.item))) { p.items.splice(Math.min(undo.index, p.items.length), 0, undo.item); touch(p); persist(true); }
        undo = null; drawUndo(); drawItems(); drawList();
      };
    }
    function drawProject() {
      run++; generating = 0;
      const p = current();
      if (!p) {
        $("#projectBody").innerHTML = `<div class="projects-welcome"><div class="project-welcome-visual" aria-hidden="true"><span class="project-welcome-sheet"></span><span class="project-welcome-sheet"></span><span class="rw-icon">${icon("folder")}</span></div><span class="rw-section-label">你的研究，从这里开始</span><h2>给一个研究问题<br>留出专属空间</h2><p>将分散的记录整理为专题，核对来源、留下批注，<br class="project-wide-break">再形成一份可编辑、有引用的报告。</p><button class="btn primary" id="projectWelcomeNew">${icon("plus")}建立第一个专题</button><div class="project-welcome-steps"><span><b>01</b> 收集相关材料</span><span><b>02</b> 核查与批注</span><span><b>03</b> 整理成报告</span></div></div>`;
        $("#projectWelcomeNew").onclick = () => $("#projectsNew").click(); return;
      }
      const locked = p.archived ? "disabled" : "";
      $("#projectBody").dataset.panel = panel;
      $("#projectBody").innerHTML = `<div class="project-summary"><div class="projects-section-head"><div class="project-summary-heading"><span class="project-state ${p.archived ? "archived" : ""}">${p.archived ? "已归档" : "进行中"}</span><h2>${esc(p.name)}</h2><span class="project-updated">更新于 ${esc(p.updatedAt.slice(0, 10) || "未提供")}${p.archived ? " · 恢复后可继续整理" : ""}</span></div></div>${p.description.length > 160 ? `<details class="project-description-disclosure"><summary><span class="project-description-preview">${esc(Array.from(p.description).slice(0, 100).join(""))}…</span><span class="project-description-expand">查看完整说明 ${icon("down")}</span></summary><p class="project-description">${esc(p.description)}</p></details>` : `<p class="project-description">${esc(p.description || "添加研究范围、关键问题或交付目标，让材料整理更有方向。")}</p>`}<div class="project-overview"><div class="project-overview-stat"><strong id="projectSummaryMaterialCount" class="rw-count">${p.items.length}</strong><span>专题材料</span></div><div class="project-overview-stat"><strong id="projectSummaryReviewed" class="rw-count">${p.items.filter((item) => item.status !== "pending").length}</strong><span>已核对 / 采用</span></div><div class="project-overview-stat"><strong id="projectSummarySelected" class="rw-count">${p.items.filter((item) => item.selected).length}</strong><span>用于报告</span></div><div class="project-review-meter" aria-hidden="true"><span id="projectReviewedProgress"></span></div></div><div class="project-summary-toolbar"><div class="projects-actions"><button class="btn primary" id="projectAddFavorites" ${locked}>${icon("bookmark")}从收藏添加</button><a class="btn" href="#/explore">浏览材料 ${icon("arrow")}</a></div><div class="projects-actions project-export-actions"><details class="project-management" ${compactNavigation.matches ? "" : "open"}><summary>专题设置 ${icon("down")}</summary><div class="projects-actions project-manage-actions"><button class="btn" id="projectEdit">编辑专题</button><button class="btn" id="projectArchive">${p.archived ? "恢复专题" : "归档专题"}</button></div></details><span>导出</span><button class="btn" id="projectExportJson" aria-label="导出专题 JSON">JSON</button><button class="btn" id="projectExportCsv" aria-label="导出专题 CSV">CSV</button></div></div></div><div class="project-workspace-switch" role="group" aria-label="专题工作区"><button type="button" data-project-panel="materials" aria-controls="projectMaterialsPanel" aria-pressed="${panel === "materials"}">${icon("folder")}材料整理<span id="projectPanelMaterialCount" class="rw-count">${p.items.length}</span></button><button type="button" data-project-panel="report" aria-controls="projectReportPanel" aria-pressed="${panel === "report"}">${icon("file")}专题报告<span class="project-report-indicator">${p.report.markdown ? "已编写" : "待编写"}</span></button></div><div class="project-editor-layout"><section id="projectMaterialsPanel" class="project-materials-panel" aria-label="材料整理"><div class="project-material-tools"><div class="projects-section-head"><h2>专题材料</h2><span class="hint" id="projectMaterialCount" role="status"></span></div><div class="project-filters"><label class="project-material-search"><span class="sr-only">搜索材料</span>${icon("search")}<input type="search" id="projectMaterialSearch" placeholder="搜索标题、机构、批注或摘录" value="${esc(search)}"></label><label><span class="sr-only">核查状态</span><select id="projectStatus" aria-label="筛选核查状态"><option value="">全部状态</option>${Object.entries(STATUS).map(([key, label]) => `<option value="${key}" ${key === status ? "selected" : ""}>${label}</option>`).join("")}</select></label><label><span class="sr-only">角度</span><select id="projectAngle" aria-label="筛选采集角度"><option value="">全部角度</option>${ANGLES.map((a) => `<option value="${a}" ${a === angle ? "selected" : ""}>${esc(api.META?.angles?.[a]?.name || a)}</option>`).join("")}</select></label></div><div class="projects-actions project-selection-tools"><span>报告选材</span><button class="btn" id="projectSelectFiltered" ${locked}>选中全部匹配</button><button class="btn" id="projectDeselectFiltered" ${locked}>取消匹配选择</button></div></div><div id="projectUndo"></div><div id="projectMaterials" class="project-materials"></div><div id="projectMaterialPager"></div></section><section id="projectReportPanel" class="project-report" aria-label="专题报告"><div class="projects-section-head"><div><span class="rw-section-label">报告编辑器</span><h2>专题报告 <span>Markdown</span></h2></div><button class="btn" id="projectExportMarkdown">${icon("download")}导出 Markdown</button></div><p class="project-report-intro">将选定材料整理为引用草稿，保留批注、摘录与来源。你可以继续编辑，内容自动保存。</p><div class="project-report-toolbar"><p id="projectReportCount" class="hint" role="status"></p><div class="projects-actions"><button class="btn" id="projectGenerateReport" ${locked}>${icon("file")}生成引用草稿</button><button class="btn" id="projectCancelReport" hidden>停止生成</button></div><span id="projectReportProgress" class="hint" role="status"></span></div><div class="project-editor"><div class="project-editor-label"><span>报告正文</span><span>MARKDOWN</span></div><label class="sr-only" for="projectMarkdown">编辑专题报告 Markdown</label><textarea id="projectMarkdown" rows="18" maxlength="${LIMITS.report}" spellcheck="false" placeholder="在这里写下研究观察。&#10;&#10;也可以先选定材料，再生成带引用的草稿。" ${locked}>${esc(p.report.markdown)}</textarea><p class="hint" id="projectReportSaved">${p.report.updatedAt ? "已保存于 " + esc(p.report.updatedAt) : "尚未编写报告"}</p></div></section></div>`;
      $("#projectBody").querySelectorAll("[data-project-panel]").forEach((button) => button.onclick = () => {
        panel = button.dataset.projectPanel; $("#projectBody").dataset.panel = panel;
        $("#projectBody").querySelectorAll("[data-project-panel]").forEach((control) => control.setAttribute("aria-pressed", String(control === button)));
      });
      $("#projectEdit").onclick = async () => { const edited = await editProject(api, p); if (edited && alive(api)) { drawList(); drawProject(); } };
      $("#projectArchive").onclick = () => { flush(); run++; p.archived = !p.archived; touch(p); changed(api); archiveFilter = p.archived ? "archived" : "active"; $("#projectsArchive").value = archiveFilter; undo = null; drawList(); drawProject(); };
      $("#projectAddFavorites").onclick = async (event) => {
        const button = event.currentTarget; button.disabled = true;
        try {
          const favorites = Array.isArray(workspace.favorites) ? workspace.favorites : [];
          const valid = favorites.filter((item) => item && ANGLES.includes(item.angle) && (typeof item.id === "string" || typeof item.id === "number"));
          if (!valid.length) { notify(api, "当前没有收藏记录，可在记录详情中收藏材料"); return; }
          const wanted = new Set(valid.map(keyOf)), loaded = [];
          for (const a of [...new Set(valid.map((item) => item.angle))]) { if (!alive(api)) return; loaded.push(...(await api.entriesFor(a)).filter((entry) => wanted.has(keyOf({ angle: entry.angle, id: entry.r.id })))); }
          if (!alive(api)) return;
          const result = await addEntries(loaded, api, { projectId: p.id, sourceLabel: "现有收藏" });
          if (result && alive(api)) { drawList(); drawItems(); }
          if (loaded.length < valid.length) notify(api, `收藏中 ${valid.length - loaded.length} 条记录未出现在当前数据版本，未加入专题`);
        } catch (error) { notify(api, error.message); }
        finally { if (alive(api) && button.isConnected) button.disabled = p.archived; }
      };
      $("#projectMaterialSearch").oninput = (event) => { search = event.target.value; page = 1; drawItems(); };
      $("#projectStatus").onchange = (event) => { status = event.target.value; page = 1; drawItems(); };
      $("#projectAngle").onchange = (event) => { angle = event.target.value; page = 1; drawItems(); };
      for (const [id, selected] of [["projectSelectFiltered", true], ["projectDeselectFiltered", false]]) $("#" + id).onclick = () => { if (p.archived) return; const time = now(); filtered(p).forEach((item) => { item.selected = selected; item.updatedAt = time; }); touch(p); persist(true); drawItems(); };
      $("#projectMarkdown").oninput = (event) => { if (p.archived) return; p.report.markdown = event.target.value; p.report.updatedAt = now(); touch(p); persist(); updateSaveStatus(); updateReportCount(); };
      $("#projectMarkdown").onblur = () => { flush(); };
      $("#projectExportJson").onclick = () => { flush(); download("zgclab-project-" + p.id + ".json", JSON.stringify(exportData(workspace, { projectId: p.id, dataVersion: api.META?.version }), null, 2), "application/json;charset=utf-8", api.signal); };
      $("#projectExportCsv").onclick = () => { flush(); download("zgclab-project-" + p.id + ".csv", csvText([p]), "text/csv;charset=utf-8", api.signal); };
      $("#projectExportMarkdown").onclick = () => { flush(); download("zgclab-project-" + p.id + ".md", p.report.markdown, "text/markdown;charset=utf-8", api.signal); };
      $("#projectCancelReport").onclick = () => { run++; generating = 0; $("#projectMarkdown").readOnly = false; $("#projectCancelReport").hidden = true; $("#projectReportProgress").textContent = "生成已停止，现有报告已保留。"; updateReportCount(); };
      $("#projectGenerateReport").onclick = () => generateReport(p);
      drawUndo(); drawItems(); updateSaveStatus();
    }
    async function generateReport(p) {
      if (!alive(api) || p.archived) return;
      if (p.report.markdown) {
        const ok = await dialog(api, "重新生成引用草稿", "<p>现有报告包含已保存的内容。重新生成将替换报告正文；可先导出 Markdown 留存。</p>", "替换报告正文", () => true);
        if (!ok || !alive(api)) return;
      }
      const id = ++run, generatedAt = now(), selected = p.items.filter((item) => item.selected).map((item) => ({ ...item }));
      if (!selected.length) return;
      const live = () => alive(api) && id === run && currentId === p.id;
      generating = id; $("#projectMarkdown").readOnly = true;
      $("#projectGenerateReport").disabled = true; $("#projectCancelReport").hidden = false;
      let done = 0, failed = 0;
      const missing = selected.filter((item) => !item.url);
      try {
        if (missing.length && api.entriesFor && api.ensureDetail) {
          const lookups = new Map();
          for (const a of [...new Set(missing.map((item) => item.angle))]) {
            if (!live()) return;
            const entries = await api.entriesFor(a); if (!live()) return;
            lookups.set(a, new Map(entries.map((entry) => [text(entry.r.id), entry.r])));
          }
          let cursor = 0;
          async function worker() {
            while (cursor < missing.length && live()) {
              const item = missing[cursor++], r = lookups.get(item.angle)?.get(item.id);
              try {
                if (r) {
                  const detail = await api.ensureDetail(item.angle, r); if (!live()) return;
                  const fields = detail?.fields || detail || r;
                  item.url = safeUrl(api.Q?.sourceLink ? api.Q.sourceLink(fields) : fields.url ?? fields.original_url ?? fields.content_url ?? fields.source_url);
                } else failed++;
              } catch (_) { failed++; }
              if (!live()) return;
              done++; $("#projectReportProgress").textContent = `正在核对原文引用 ${done}/${missing.length}`;
            }
          }
          await Promise.all([worker(), worker(), worker()]);
        }
        if (!live()) return;
        const markdown = reportText({ ...p, items: selected }, { generatedAt, baseUrl: location.href });
        if (markdown.length > LIMITS.report) throw new Error("报告超过 200 万字符，请减少选定材料或缩短摘录后重试");
        p.report = { markdown, updatedAt: now(), generatedAt, materialKeys: selected.map(keyOf), dataVersion: text(api.META?.version) };
        touch(p); persist(true); $("#projectMarkdown").value = markdown;
        updateSaveStatus();
        $("#projectReportProgress").textContent = `已生成 ${selected.length} 条材料的引用草稿${failed ? `；${failed} 条原文引用暂未补全` : ""}。`;
      } catch (error) { if (live()) $("#projectReportProgress").textContent = error.message || "报告生成失败，现有报告已保留。"; }
      finally { if (live()) { generating = 0; $("#projectMarkdown").readOnly = false; $("#projectCancelReport").hidden = true; updateReportCount(); } }
    }
    listen($("#projectsNew"), "click", async () => { const p = await editProject(api); if (p && alive(api)) { archiveFilter = "active"; $("#projectsArchive").value = archiveFilter; projectSearch = ""; $("#projectsSearch").value = ""; choose(p.id); } });
    listen($("#projectsSearch"), "input", (event) => { projectSearch = event.target.value; drawList(); });
    listen($("#projectsArchive"), "change", (event) => { archiveFilter = event.target.value; drawList(); });
    listen($("#projectsExportAll"), "click", () => { flush(); download("zgclab-projects.json", JSON.stringify(exportData(workspace, { dataVersion: api.META?.version }), null, 2), "application/json;charset=utf-8", api.signal); });
    listen($("#projectsImport"), "change", async (event) => {
      const file = event.target.files[0]; event.target.value = ""; if (!file) return;
      try {
        if (file.size > LIMITS.file) throw new Error("专题备份超过 25 MB，请检查文件");
        const payload = JSON.parse(await file.text()); if (!alive(api)) return;
        const plan = planImport(workspace, payload);
        const result = await dialog(api, "合并专题备份", `<p>将新增 ${plan.addedProjects} 个专题和 ${plan.addedItems} 条材料。</p><p>${plan.conflictCopies ? `其中 ${plan.conflictCopies} 个专题存在编辑差异，将保留为“导入副本”。` : "同一专题的重复材料会跳过。"}现有批注、报告和其他工作台内容会保留。</p>`, "合并导入", () => { const summary = mergeProjects(workspace, payload); changed(api); return summary; });
        if (result && alive(api)) { flush(); drawList(); drawProject(); notify(api, `已合并专题备份：新增 ${result.addedProjects} 个专题、${result.addedItems} 条材料${unsavedWorkspaces.has(workspace) ? "；" + STORAGE_WARNING : ""}`); }
      } catch (error) { notify(api, error.message || "备份读取失败"); }
    });
    if (!currentId) currentId = projectsOf(workspace).find((p) => !p.archived)?.id || "";
    drawList(); drawProject(); updateSaveStatus();
  }
  Object.assign(render, { addRecord, addEntries, validateImport, normalizeProjects: validateProjects, mergeBackup, mergeProjects, exportData, createProject, addToProject, reportText, csvText, csvRows, CSV_HEADERS, recordHref, safeUrl, esc, LIMITS, STATUS });
  return render;
});
