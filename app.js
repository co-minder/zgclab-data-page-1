/* ZGCLab 数据展示系统 — 前端（无依赖，数据快照驱动） */
(function () {
  "use strict";

  const REAL_META = window.ZGCLAB_META;
  let META = REAL_META;
  let simulationEnabled = false, simulationJob = null, simulationChange = 0;
  const ANGLES = ["news", "clue", "social"];
  const ANG = META.angles;
  const COLORS = { news: "var(--news)", clue: "var(--clue)", social: "var(--social)" };
  const RISK_CLASS = { "高": "risk-High", "中": "risk-Mid", "低": "risk-Low" };
  const PAGE = 14;
  const ALL = "all";
  const CORE = window.ZGCLAB_CORE;
  let routeVersion = 0;
  let routeController = new AbortController();
  let closeModal = null;
  const storageKey = "zgclab.workspace.v1";
  let workspace = { favorites: [], queries: [] };
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (stored && Array.isArray(stored.favorites) && Array.isArray(stored.queries)) workspace = stored;
  } catch (_) { /* Storage is optional; browsing works without it. */ }
  workspace.read = workspace.read && typeof workspace.read === "object" && !Array.isArray(workspace.read) ? workspace.read : {};
  workspace.watchlist = Array.isArray(workspace.watchlist) ? workspace.watchlist.map(Number).filter((id) => META.institutions.some((i) => i.ktid === id)) : [];
  const readKey = (angle, id) => `${String(id).startsWith("sim-") && window.ZGCLAB_SIM_META ? window.ZGCLAB_SIM_META.version : REAL_META.version}:${angle}:${id}`;
  const isRead = (angle, id) => !!workspace.read[readKey(angle, id)];
  function markRead(entries, value) {
    for (const { angle, r } of entries) {
      if (value) workspace.read[readKey(angle, r.id)] = new Date().toISOString();
      else delete workspace.read[readKey(angle, r.id)];
    }
    saveWorkspace();
  }
  function saveWorkspace() {
    try { localStorage.setItem(storageKey, JSON.stringify(workspace)); return true; }
    catch (_) { showToast("浏览器空间不足或未允许保存，当前操作仅在本次访问中保留；可导出工作台备份"); return false; }
  }
  const isFavorite = (angle, id) => workspace.favorites.some((item) => item.angle === angle && item.id === id);

  const $ = (s) => document.querySelector(s);
  const view = $("#view");
  const crumb = $("#crumb");

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString("zh-CN");
  const instMap = new Map(META.institutions.map((i) => [i.ktid, i]));
  const instName = (ktid) => (instMap.get(ktid) || {}).cn || String(ktid || "");
  const angleName = (angle) => angle === ALL ? "全部数据" : (ANG[angle] || {}).name || angle;
  const monthOf = (s) => (s || "").slice(0, 7);
  const day = (s) => (s || "").slice(0, 10);
  const val = (r, k) => (r[k] == null ? "" : String(r[k]));

  const safeUrl = CORE.safeUrl;
  const textCache = new WeakMap();

  function recordText(angle, r) {
    if (!textCache.has(r)) {
      const inst = instMap.get(r.ktid) || {};
      textCache.set(r, CORE.normalize(Object.entries(r).filter(([key]) => !key.startsWith("_")).map(([, v]) => v).join(" ") + " " + inst.cn + " " + inst.en));
    }
    return textCache.get(r);
  }

  function timestampOf(angle, r) {
    const raw = dateOf(angle, r);
    const parsed = raw ? Date.parse(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function csvCell(value) {
    return CORE.csvCell(value);
  }

  function downloadCsv(filename, headers, rows) {
    const csv = "\ufeff" + [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function showToast(message) {
    const old = document.querySelector(".toast");
    if (old) old.remove();
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 2200);
  }

  async function copyText(text, message) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const input = document.createElement("textarea");
        input.value = text;
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.focus();
        input.select();
        const copied = document.execCommand("copy");
        input.remove();
        if (!copied) throw new Error("Clipboard unavailable");
      }
      showToast(message || "已复制");
    } catch (_) {
      showToast("复制失败，请手动复制地址");
    }
  }

  function baseUrl() {
    return location.href.split("#")[0];
  }

  function recordLink(angle, id) {
    return baseUrl() + "#/record/" + encodeURIComponent(angle) + "/" + encodeURIComponent(id) + (String(id).startsWith("sim-") ? "?sim=1" : "");
  }

  function queryLink(params) {
    const qs = new URLSearchParams();
    if ([ALL, ...ANGLES].includes(params.angle)) qs.set("angle", params.angle);
    if (params.ktid) qs.set("ktid", params.ktid);
    if (params.q) qs.set("q", params.q);
    if (params.sub) qs.set("sub", params.sub);
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    if (params.sort && params.sort !== "newest") qs.set("sort", params.sort);
    if (params.mode === "any") qs.set("mode", "any");
    if (params.source) qs.set("source", params.source);
    if (params.page > 1) qs.set("page", params.page);
    if (params.size && Number(params.size) !== PAGE) qs.set("size", params.size);
    return baseUrl() + "#/explore" + (qs.toString() ? "?" + qs.toString() : "");
  }

  function replaceExploreUrl(state) {
    history.replaceState(null, "", queryLink(state));
  }

  /* ---------- 数据懒加载 ---------- */
  const cache = {};
  const loading = {};
  function loadAsset(path) {
    if (window.ZGCLAB_LOADER) return window.ZGCLAB_LOADER(path);
    return new Promise((resolve,reject)=>{const script=document.createElement("script");script.src=path;script.onload=resolve;script.onerror=()=>reject(new Error("模拟文件加载失败，可重试"));document.head.appendChild(script);});
  }
  function mergedMeta() {
    const meta=JSON.parse(JSON.stringify(REAL_META));
    meta.simulation=window.ZGCLAB_SIM_META;
    for(const angle of ANGLES){
      const simulated=window["ZGCLAB_SIM_"+angle.toUpperCase()];meta.totals[angle]+=simulated.length;
      const stat=meta.stats[angle];stat.total=meta.totals[angle];
      for(const r of simulated){
        const day=window.ZGCLAB_QUERY.recordDay(dateOf(angle,r));
        if(day){const month=day.slice(0,7);stat.months[month]=(stat.months[month]||0)+1;stat.date_min=!stat.date_min||day<stat.date_min?day:stat.date_min;stat.date_max=!stat.date_max||day>stat.date_max?day:stat.date_max;}
        const field={news:"tag",clue:"risk_level",social:"platform"}[angle],group={news:"tags",clue:"risk_levels",social:"platforms"}[angle];const value=r[field]||(angle==="clue"?"未判定":"未分类");stat[group][value]=(stat[group][value]||0)+1;
        if(day)stat.dated++;
        if(CORE.safeUrl(window.ZGCLAB_QUERY.sourceLink(r)))stat.linked++;
        if(snippetOf(angle,r))stat.summarized++;
      }
      for(const i of meta.institutions){const n=simulated.filter((r)=>r.ktid===i.ktid).length;i.counts[angle]+=n;i.by_angle[angle]+=n;}
    }
    meta.months=[...new Set(ANGLES.flatMap((a)=>Object.keys(meta.stats[a].months)))].filter((m)=>m>="2024-01").sort();
    return meta;
  }
  async function setSimulation(enabled) {
    const change=++simulationChange;$("#includeSimulation").disabled=true;
    try{
      if(enabled){
        if(!simulationJob)simulationJob=(async()=>{await loadAsset("data/simulation/meta.js");await Promise.all(ANGLES.map((a)=>loadAsset("data/simulation/"+a+".js")));})().catch((e)=>{simulationJob=null;throw e;});
        await simulationJob;
      }
      if(change!==simulationChange)return;
      simulationEnabled=enabled;META=enabled?mergedMeta():REAL_META;
      for(const angle of ANGLES)delete cache[angle];
      $("#includeSimulation").checked=enabled;$("#simulationStatus").hidden=!enabled;
      $("#simulationStatus").textContent=enabled?`测试模式：包含 ${fmt(Object.values(window.ZGCLAB_SIM_META.totals).reduce((s,n)=>s+n,0))} 条模拟数据 · 平台 test · 日期基准 ${window.ZGCLAB_SIM_META.generated_for}`:"";
      const raw=location.hash.split("?");const params=new URLSearchParams(raw[1]||"");if(enabled)params.set("sim","1");else params.delete("sim");history.replaceState(null,"",(raw[0]||"#/overview")+(params.size?"?"+params:""));route();
    }catch(error){$("#includeSimulation").checked=simulationEnabled;showToast(error.message);}
    finally{$("#includeSimulation").disabled=false;}
  }
  function ensure(angle) {
    if (!ANGLES.includes(angle)) return Promise.reject(new Error("数据类型无效"));
    if (cache[angle]) return Promise.resolve(cache[angle]);
    const key = "ZGCLAB_" + angle.toUpperCase();
    if (window[key]) { cache[angle] = simulationEnabled ? window[key].concat(window["ZGCLAB_SIM_" + angle.toUpperCase()] || []) : window[key]; return Promise.resolve(cache[angle]); }
    if (loading[angle]) return loading[angle];
    if (window.ZGCLAB_LOADER) {
      loading[angle] = window.ZGCLAB_LOADER("data/" + angle + ".js").then(() => {
        if (!Array.isArray(window[key])) throw new Error("数据文件格式错误，请刷新后重试");
        cache[angle] = simulationEnabled ? window[key].concat(window["ZGCLAB_SIM_" + angle.toUpperCase()] || []) : window[key];
        return cache[angle];
      }).catch((failure) => { delete loading[angle]; throw failure; });
      return loading[angle];
    }
    loading[angle] = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "data/" + angle + ".js?v=" + encodeURIComponent(META.version || META.generated_at);
      s.onload = () => {
        if (!Array.isArray(window[key])) { delete loading[angle]; s.remove(); rej(new Error("数据文件格式错误，请刷新后重试")); return; }
        cache[angle] = simulationEnabled ? window[key].concat(window["ZGCLAB_SIM_" + angle.toUpperCase()] || []) : window[key]; res(cache[angle]);
      };
      s.onerror = () => { delete loading[angle]; s.remove(); rej(new Error("数据文件加载失败，请检查网络后重试")); };
      document.head.appendChild(s);
    });
    return loading[angle];
  }

  window.ZGCLAB_DETAILS = {};
  const detailLoading = {};
  function ensureDetail(angle, r) {
    if (r._detail == null || !META.version) return Promise.resolve(null);
    const key = (r._simulation ? "sim-" : "") + angle + "-" + r._detail;
    const detailPath = r._simulation ? "data/simulation/details/" + r._simulation_version + "/" + angle + "-" + r._detail + ".js" : "data/details/" + REAL_META.version + "/" + key + ".js";
    if (window.ZGCLAB_LOADER) {
      if (!detailLoading[key]) detailLoading[key] = window.ZGCLAB_LOADER(detailPath).then(() => {
        if (!Array.isArray(window.ZGCLAB_DETAILS[key])) throw new Error("详情数据格式错误");
        return window.ZGCLAB_DETAILS[key];
      }).catch((failure) => { delete detailLoading[key]; throw failure; });
      return detailLoading[key].then((rows) => rows.find((row) => row.id === r.id) || null);
    }
    if (!detailLoading[key]) detailLoading[key] = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = detailPath;
      script.onload = () => {
        if (!Array.isArray(window.ZGCLAB_DETAILS[key])) { delete detailLoading[key]; reject(new Error("详情数据格式错误")); return; }
        resolve(window.ZGCLAB_DETAILS[key]);
      };
      script.onerror = () => { delete detailLoading[key]; script.remove(); reject(new Error("完整详情加载失败，请重试")); };
      document.head.appendChild(script);
    });
    return detailLoading[key].then((rows) => rows.find((row) => row.id === r.id) || null);
  }

  function bindRecords(root, entries) {
    root.querySelectorAll("[data-record],.rec[data-id],tr[data-id]").forEach((el) => {
      el.tabIndex = 0;
      el.setAttribute("aria-label", "查看记录：" + (el.querySelector("h4,.cell-title") || el).textContent.trim().slice(0, 150));
      const open = () => openRecord(el.dataset.angle, el.dataset.id, entries);
      el.addEventListener("click", open);
      el.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } });
    });
  }

  /* ---------- 通用片段 ---------- */
  function angleDot(angle) { return `<span class="dot" style="background:${COLORS[angle]}"></span>`; }

  function titleOf(angle, r) {
    if (angle === "news") return r.title_cn || r.title_en || "(无标题)";
    if (angle === "clue") return r.title || "(无标题)";
    return (r.account_name ? r.account_name + " · " : "") + (r.title || r.original_content || r.platform || "社交媒体");
  }
  function snippetOf(angle, r) {
    if (angle === "news") return r.summary_cn || r.content_cn || "";
    if (angle === "clue") return r.summary || r.chinese_trans || "";
    return r.chinese_translation || r.original_content || "";
  }
  function dateOf(angle, r) {
    return r.publish_time || r.founddate || r.discovery_time || r.collected_time || "";
  }
  function badgeOf(angle, r) {
    if (angle === "news" && r.tag) return `<span class="tag news">${esc(r.tag)}</span>`;
    if (angle === "clue" && r.risk_level) return `<span class="tag clue ${RISK_CLASS[r.risk_level] || ""}">风险 ${esc(r.risk_level)}</span>`;
    if (angle === "social" && r.platform) return `<span class="tag social">${esc(r.platform)}</span>`;
    return "";
  }

  async function entriesFor(angle) {
    if (angle === ALL) {
      const chunks = await Promise.all(ANGLES.map(async (a) => (await ensure(a)).map((r) => ({ angle: a, r }))));
      return chunks.flat();
    }
    return (await ensure(angle)).map((r) => ({ angle, r }));
  }

  let researchLoading;
  async function ensureResearch() {
    if (window.ZGCLAB_RESEARCH) return window.ZGCLAB_RESEARCH;
    if (!researchLoading) researchLoading = loadAsset("data/research.js").then(() => {
      if (!window.ZGCLAB_RESEARCH) throw new Error("研究元数据加载失败");
      return window.ZGCLAB_RESEARCH;
    }).catch((error) => { researchLoading = null; throw error; });
    return researchLoading;
  }
  function researchApi() {
    return {META, REAL_META, CORE, Q:window.ZGCLAB_QUERY, view, esc, fmt, entriesFor, ensureDetail, ensureResearch, recCard, bindRecords, pager, bindPager, exportEntries, downloadCsv, copyText, titleOf, snippetOf, dateOf, instName, recordLink, workspace, saveWorkspace, isRead, markRead, showToast, serviceClient:window.ZGCLAB_SERVICE_CLIENT, serviceSession:options=>window.ZGCLAB_SERVICE_CLIENT.session(options), version:routeVersion, currentVersion:()=>routeVersion, signal:routeController.signal};
  }
  async function viewResearch(name, params) {
    const titles = {projects:"专题资料夹",assistant:"资料对话与模糊查询",evidence:"证据阅读与引用",related:"相关材料",changes:"新增与变化",coverage:"来源与时间覆盖","collection-plan":"未来采集建议"};
    setActive(name);setCrumb(`<b>${esc(titles[name])}</b>`);
    const version = routeVersion;
    if (name !== "assistant" && name !== "projects") {
      view.innerHTML = '<div class="skeleton">正在载入研究资料…</div>';
      try { await ensureResearch(); }
      catch (error) { if (version !== routeVersion) return; showToast(error.message); }
      if (version !== routeVersion) return;
    }
    try {
      if (name === "projects") return await window.ZGCLAB_PROJECTS(params,researchApi());
      if (name === "assistant") return await window.ZGCLAB_ASSISTANT(params,researchApi());
      return await window.ZGCLAB_RESEARCH_UI(name,params,researchApi());
    } catch (error) {
      if (version !== routeVersion || routeController.signal.aborted) return;
      view.innerHTML = `<div class="empty">${esc(error.message || "研究页面载入失败")}<br><a href="#/overview">返回总览</a></div>`;
    }
  }

  function exportEntries(entries, filename, context) {
    const keys = [];
    const seen = new Set();
    entries.forEach(({ r }) => Object.keys(r).forEach((key) => {
      if (!key.startsWith("_") && key !== "id" && key !== "ktid" && !seen.has(key)) { seen.add(key); keys.push(key); }
    }));
    const contextKeys = Object.keys(context || {});
    const headers = ["采集角度", "记录ID", "机构", "ktid", "数据性质", ...keys.map((key) => FIELD_LABELS[key] ? `${FIELD_LABELS[key]} (${key})` : key), ...contextKeys];
    const rows = entries.map(({ angle, r }) => [
      angleName(angle), r.id || "", instName(r.ktid), r.ktid || "", r._simulation ? "模拟数据" : "真实交付数据",
      ...keys.map((key) => r[key] == null ? "" : r[key]), ...contextKeys.map((key) => context[key]),
    ]);
    downloadCsv(filename, headers, rows);
  }

  function recCard(angle, r) {
    const snippet = snippetOf(angle, r);
    const src = angle === "news" ? r.publish_source : angle === "clue" ? (r.publisher_website || r.publish_subject) : (r.account_handle || r.content_type);
    return `<article class="rec" data-angle="${angle}" data-id="${esc(r.id || "")}">
      <div class="r-top">${angleDot(angle)}<span class="tag ${angle}">${esc(ANG[angle].name)}</span>${r._simulation?'<span class="simulation-badge">模拟数据</span>':""}${badgeOf(angle, r)}
        <span class="date" style="margin-left:auto">${esc(day(dateOf(angle, r)) || "时间未标注")}</span></div>
      <h4>${esc(titleOf(angle, r))}</h4>
      ${snippet ? `<p>${esc(snippet)}</p>` : ""}
      <div class="r-meta">
        <span>机构 <b>${esc(instName(r.ktid))}</b></span>
        ${src ? `<span>来源 <b>${esc(String(src).slice(0, 46))}</b></span>` : ""}
      </div>
    </article>`;
  }

  function pager(total, page, onGo, size = PAGE) {
    const pages = Math.max(1, Math.ceil(total / size));
    const cur = Math.min(Math.max(1, page), pages);
    let nums = [];
    const push = (p) => { if (!nums.includes(p) && p >= 1 && p <= pages) nums.push(p); };
    push(1); push(cur - 1); push(cur); push(cur + 1); push(pages);
    nums.sort((a, b) => a - b);
    let btns = "";
    let prev = 0;
    for (const p of nums) {
      if (p - prev > 1) btns += `<span class="pinfo">…</span>`;
      btns += `<button data-p="${p}" ${p === cur ? 'aria-current="page"' : ""} class="${p === cur ? "active" : ""}">${p}</button>`;
      prev = p;
    }
    return `<div class="pager">
      <button data-p="${cur - 1}" ${cur <= 1 ? "disabled" : ""}>上一页</button>${btns}<button data-p="${cur + 1}" ${cur >= pages ? "disabled" : ""}>下一页</button>
      <span class="pinfo">共 ${fmt(total)} 条 · 第 ${cur}/${pages} 页</span>
      ${pages > 1 ? `<label class="pinfo">跳至 <input type="number" class="page-jump" aria-label="跳转页码" min="1" max="${pages}" value="${cur}"> 页</label>` : ""}</div>`;
  }
  function bindPager(root, onGo) {
    root.querySelectorAll(".pager button[data-p]").forEach((b) => {
      b.addEventListener("click", () => onGo(Number(b.dataset.p)));
    });
    root.querySelectorAll(".page-jump").forEach((input) => input.addEventListener("change", () => {
      onGo(Math.min(Number(input.max), Math.max(1, Number(input.value) || 1)));
    }));
  }

  /* ---------- 图表 ---------- */
  function donut() {
    const data = ANGLES.map((a) => ({ a, v: META.totals[a] || 0 }));
    const total = data.reduce((s, d) => s + d.v, 0) || 1;
    const R = 64, C = 2 * Math.PI * R;
    let acc = 0;
    const segs = data.map((d) => {
      const frac = d.v / total;
      const el = `<circle cx="100" cy="100" r="${R}" fill="none" stroke="${COLORS[d.a]}" stroke-width="24"
        stroke-dasharray="${(frac * C).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-acc * C).toFixed(2)}"
        transform="rotate(-90 100 100)"><title>${ANG[d.a].name} ${fmt(d.v)} 条</title></circle>`;
      acc += frac;
      return el;
    }).join("");
    return `<svg viewBox="0 0 200 200" class="donut">${segs}
      <text x="100" y="97" text-anchor="middle" font-size="26" font-weight="600" fill="var(--ink)">${fmt(total)}</text>
      <text x="100" y="117" text-anchor="middle" font-size="11" fill="var(--muted)">条入表数据</text></svg>`;
  }

  function hbars(items, color) {
    const max = Math.max(1, ...items.map((i) => i.v));
    return items.map((i) => `<div class="bar-row">
      ${i.href ? `<a class="bar-label" href="${esc(i.href)}" title="${esc(i.label)}">${esc(i.label)}</a>` : `<span class="bar-label" title="${esc(i.label)}">${esc(i.label)}</span>`}
      <div class="bar-track"><div class="bar-fill" style="width:${(i.v / max * 100).toFixed(1)}%;background:${i.color || color}"></div></div>
      <span class="bar-val">${fmt(i.v)}</span></div>`).join("");
  }

  function trendChart() {
    const months = META.months;
    const series = ANGLES.map((a) => ({ a, vals: months.map((m) => (META.stats[a].months || {})[m] || 0) }));
    const totals = months.map((_, i) => series.reduce((s, d) => s + d.vals[i], 0));
    const max = Math.max(1, ...totals);
    const W = 900, H = 250, pl = 44, pr = 12, pt = 14, pb = 30;
    const iw = W - pl - pr, ih = H - pt - pb, bw = iw / months.length;
    let bars = "";
    months.forEach((m, i) => {
      let y = H - pb;
      series.forEach((d) => {
        const v = d.vals[i];
        if (!v) return;
        const h = (v / max) * ih;
        y -= h;
        bars += `<rect x="${(pl + i * bw + 1).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${h.toFixed(1)}" fill="${COLORS[d.a]}" opacity=".92"><title>${m} · ${ANG[d.a].name} ${fmt(v)} 条</title></rect>`;
      });
    });
    let grid = "";
    for (let g = 0; g <= 3; g++) {
      const gy = pt + (ih * g) / 3;
      const gv = Math.round((max * (3 - g)) / 3);
      grid += `<line x1="${pl}" y1="${gy}" x2="${W - pr}" y2="${gy}" stroke="var(--line-soft)"/>
        <text x="${pl - 7}" y="${gy + 3}" text-anchor="end" font-size="9.5" fill="var(--muted)">${fmt(gv)}</text>`;
    }
    const step = Math.max(1, Math.ceil(months.length / 9));
    let labels = "";
    months.forEach((m, i) => {
      if (i % step === 0 || i === months.length - 1) {
        labels += `<text x="${(pl + i * bw + bw / 2).toFixed(1)}" y="${H - 9}" text-anchor="middle" font-size="9.5" fill="var(--muted)">${m.slice(2)}</text>`;
      }
    });
    return `<svg viewBox="0 0 ${W} ${H}" class="trend-svg" preserveAspectRatio="none">${grid}${bars}${labels}</svg>`;
  }

  /* ---------- 路由 ---------- */
  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, "") || "overview";
    const [path, qs] = raw.split("?");
    const parts = path.split("/").filter(Boolean);
    return { name: parts[0] || "overview", id: parts[1], extra: parts[2], params: new URLSearchParams(qs || "") };
  }

  function setActive(route) {
    document.body.dataset.route = route;
    document.querySelectorAll("[data-route]").forEach((a) => {
      a.classList.toggle("active", a.dataset.route === route);
      if (a.dataset.route === route) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  }
  function setCrumb(text) {
    crumb.innerHTML = text;
    document.title = crumb.textContent + " · ZGCLab 境外机构数据平台";
  }

  /* ---------- 视图：总览 ---------- */
  function viewOverview() {
    setActive("overview");
    setCrumb("<b>全部数据总览</b>");
    const total = ANGLES.reduce((s, a) => s + (META.totals[a] || 0), 0);
    const units = META.institutions.length;
    const covered = META.institutions.filter((i) => i.counts.news + i.counts.clue + i.counts.social > 0).length;
    const institutions = [...META.institutions].sort((a, b) => ANGLES.reduce((s, angle) => s + b.counts[angle] - a.counts[angle], 0));
    const rank = institutions.slice(0, 10).map((i) => ({
      label: i.cn, v: i.counts.news + i.counts.clue + i.counts.social, href: "#/institution/" + i.ktid,
    }));

    const socialPlats = META.stats.social.platforms || {};
    const risk = META.stats.clue.risk_levels || {};
    const tags = META.stats.news.tags || {};
    const platColors = { X: "var(--accent)", Facebook: "#78aaff", LinkedIn: "#7ce5ce" };

    view.innerHTML = `
      <div class="page-head">
        <div><span class="kicker">ALL DATA OVERVIEW</span><h1>全部数据总览</h1>
          <p>当前快照的全部 ${fmt(total)} 条数据 · ${units} 家机构 · 全部日期</p></div>
        <div class="page-actions"><button class="btn" id="exportOverview">导出机构汇总</button><a class="btn primary" id="browseAllData" href="#/explore?angle=all">查看全部数据</a></div>
      </div>

      <section class="kpis overview-kpis" aria-label="全部数据统计">
        <a class="kpi" data-overview-total="${total}" href="#/explore?angle=all"><div class="k-label">全部记录</div><div class="k-value">${fmt(total)}</div><div class="k-sub">查看全部机构、全部角度明细 →</div></a>
        ${ANGLES.map((a) => `<a class="kpi ${a}" data-overview-angle="${a}" href="#/explore?angle=${a}"><div class="k-label">${ANG[a].name}</div><div class="k-value">${fmt(META.totals[a])}</div><div class="k-sub">占全部 ${((META.totals[a] / total) * 100).toFixed(1)}% · 查看明细 →</div></a>`).join("")}
      </section>
      <div class="overview-scope"><span><b>${units}</b> 家机构 · <b>3</b> 个采集角度 · 机构覆盖 <b>${covered}/${units}</b></span><span>快照生成：${esc(META.generated_at.slice(0, 10))} · 本页统计全部数据</span></div>

      <section class="section"><div class="grid g2-1">
        <div class="card pad">
          <div class="section-head"><h2>三个角度的数据分布</h2><span class="hint">点击角度进入数据浏览</span></div>
          <div class="chart-box">${donut()}
            <div class="legend">
              ${ANGLES.map((a) => `<div class="legend-item" style="cursor:pointer" data-goto="#/explore?angle=${a}">
                <span class="dot" style="background:${COLORS[a]}"></span>${ANG[a].name}
                <span class="num">${fmt(META.totals[a])}</span>
                <span class="pct">${((META.totals[a] / total) * 100).toFixed(0)}%</span></div>`).join("")}
            </div>
          </div>
        </div>
        <div class="card pad">
          <div class="section-head"><h2>机构数据量 TOP 10</h2></div>
          ${hbars(rank, "var(--accent)")}
        </div>
      </div></section>

      <section class="section card pad" id="overviewInstitutions">
        <div class="section-head"><h2>全部 ${units} 家机构数据汇总</h2><span class="hint">点击数量查看明细</span></div>
        <div class="table-wrap"><table class="data overview-institutions"><thead><tr><th>机构</th><th>类型</th><th>新闻舆情</th><th>官网线索</th><th>社交媒体</th><th>合计</th></tr></thead><tbody>
          ${institutions.map((i) => `<tr data-overview-institution="${i.ktid}"><td><a href="#/institution/${i.ktid}">${esc(i.cn)}</a></td><td>${esc(i.type)}</td>${ANGLES.map((a) => `<td><a href="#/explore?angle=${a}&ids=${i.ktid}">${fmt(i.counts[a])}</a></td>`).join("")}<td><a href="#/explore?angle=all&ids=${i.ktid}">${fmt(ANGLES.reduce((s, a) => s + i.counts[a], 0))}</a></td></tr>`).join("")}
        </tbody><tfoot><tr><th>全部机构合计</th><td>${units} 家</td>${ANGLES.map((a) => `<td>${fmt(META.totals[a])}</td>`).join("")}<td>${fmt(total)}</td></tr></tfoot></table></div>
      </section>

      <section class="section"><div class="card pad">
        <div class="section-head"><h2>记录时间趋势</h2><span class="hint">按发布时间聚合，缺失时用发现 / 采集时间 · 2024 年起</span></div>
        ${trendChart()}
        <div class="legend" style="flex-direction:row;gap:18px;margin-top:6px">
          ${ANGLES.map((a) => `<span class="legend-item" style="width:auto"><span class="dot" style="background:${COLORS[a]}"></span>${ANG[a].name}</span>`).join("")}
        </div>
      </div></section>

      <section class="section"><div class="grid g3">
        <div class="card pad"><div class="section-head"><h2>社媒平台</h2></div>
          ${hbars(Object.entries(socialPlats).map(([k, v]) => ({ label: k, v, href: "#/explore?angle=social&sub=" + encodeURIComponent("platform:" + k), color: platColors[k] || COLORS.social })), COLORS.social)}
        </div>
        <div class="card pad"><div class="section-head"><h2>线索风险等级</h2></div>
          ${hbars(Object.entries(risk).map(([k, v]) => ({ label: "风险 " + k, v, href: "#/explore?angle=clue&sub=" + encodeURIComponent("risk_level:" + k), color: k === "高" ? "var(--danger)" : k === "中" ? COLORS.news : k === "低" ? "var(--ok)" : "var(--muted)" })), "var(--muted)")}
        </div>
        <div class="card pad"><div class="section-head"><h2>舆情主题标签</h2></div>
          ${hbars(Object.entries(tags).slice(0, 6).map(([k, v]) => ({ label: k, v, href: "#/explore?angle=news&sub=" + encodeURIComponent("tag:" + k), color: COLORS.news })), COLORS.news)}
        </div>
      </div></section>

      <section class="section"><div class="card pad">
        <div class="section-head"><h2>最近记录</h2><span class="hint">按记录时间排序 · 来源中的活动日期可能晚于采集日期</span></div>
        <div class="rec-list">
          ${(META.recent || []).map((r) => `<article class="rec" tabindex="0" role="link" data-angle="${r.angle}" data-ktid="${r.ktid}" data-id="${esc(r.id || "")}">
            <div class="r-top">${angleDot(r.angle)}<span class="tag ${r.angle}">${esc(ANG[r.angle].name)}</span>
              <span class="date" style="margin-left:auto">${esc(day(r.date) || "—")}</span></div>
            <h4>${esc(r.title || "(无标题)")}</h4>
            ${r.snippet ? `<p>${esc(r.snippet)}</p>` : ""}
            <div class="r-meta"><span>机构 <b>${esc(instName(r.ktid))}</b></span></div>
          </article>`).join("")}
        </div>
      </div></section>`;

    $("#exportOverview").onclick = () => downloadCsv("zgclab-全部机构数据汇总.csv", ["机构", "类型", "国家", "新闻舆情", "官网线索", "社交媒体", "合计", "数据版本"], institutions.map((i) => [i.cn, i.type, i.country, ...ANGLES.map((a) => i.counts[a]), ANGLES.reduce((s, a) => s + i.counts[a], 0), META.version]));
    view.querySelectorAll("[data-goto]").forEach((el) => {
      el.addEventListener("click", () => { if (el.dataset.goto) location.hash = el.dataset.goto; });
    });
    view.querySelectorAll(".rec[data-ktid]").forEach((el) => {
      el.addEventListener("click", () => {
        if (el.dataset.id) location.hash = "#/record/" + el.dataset.angle + "/" + el.dataset.id;
        else location.hash = "#/institution/" + el.dataset.ktid;
      });
      el.addEventListener("keydown", (event) => { if (event.key === "Enter") el.click(); });
    });
  }

  /* ---------- 视图：机构库 ---------- */
  let instFilter = { q: "", type: "全部", sort: "total" };
  function viewInstitutions() {
    setActive("institutions");
    setCrumb("<b>机构库</b>");
    const types = ["全部", ...new Set(META.institutions.map((i) => i.type).filter(Boolean))];
    view.innerHTML = `
      <div class="page-head"><div><span class="kicker">INSTITUTIONS</span><h1>机构库</h1>
        <p>${META.institutions.length} 个验证单位 · 点击查看该机构三个角度的数据</p></div>
        <div class="page-actions"><button class="btn" id="exportInstitutions">导出机构清单 CSV</button></div></div>
      <div class="filters">
        <input type="text" id="instQ" aria-label="搜索机构" placeholder="搜索机构中文名 / 英文名 / ktid" value="${esc(instFilter.q)}">
        ${types.map((t) => `<button class="filter-chip ${t === instFilter.type ? "active" : ""}" data-type="${esc(t)}">${esc(t)}</button>`).join("")}
        <select id="instSort" aria-label="机构排序">
          <option value="total" ${instFilter.sort === "total" ? "selected" : ""}>按数据量排序</option>
          <option value="name" ${instFilter.sort === "name" ? "selected" : ""}>按名称排序</option>
          <option value="ktid" ${instFilter.sort === "ktid" ? "selected" : ""}>按 ktid 排序</option>
        </select>
        <span class="hint" id="instSummary"></span>
      </div>
      <div class="inst-grid" id="instGrid"></div>`;

    const q = $("#instQ");
    q.addEventListener("input", () => { instFilter.q = q.value; drawInstGrid(); });
    $("#instSort").addEventListener("change", (e) => { instFilter.sort = e.target.value; drawInstGrid(); });
    $("#exportInstitutions").addEventListener("click", () => {
      const rows = META.institutions.map((i) => [i.ktid, i.cn, i.en, i.type, i.country, i.counts.news, i.counts.clue, i.counts.social, i.counts.news + i.counts.clue + i.counts.social]);
      downloadCsv("zgclab-机构清单.csv", ["ktid", "中文名", "英文名", "类型", "国家", "新闻舆情", "官网线索", "社交媒体", "合计"], rows);
    });
    view.querySelectorAll(".filter-chip").forEach((b) => {
      b.addEventListener("click", () => {
        instFilter.type = b.dataset.type;
        view.querySelectorAll(".filter-chip").forEach((x) => x.classList.toggle("active", x === b));
        drawInstGrid();
      });
    });
    drawInstGrid();
  }

  function drawInstGrid() {
    const grid = $("#instGrid");
    if (!grid) return;
    const q = instFilter.q.trim().toLowerCase();
    let list = META.institutions.filter((i) => {
      if (instFilter.type !== "全部" && i.type !== instFilter.type) return false;
      if (!q) return true;
      return (i.cn + " " + i.en + " " + i.ktid).toLowerCase().includes(q);
    });
    list.sort((a, b) => {
      if (instFilter.sort === "name") return a.cn.localeCompare(b.cn, "zh-CN");
      if (instFilter.sort === "ktid") return a.ktid - b.ktid;
      return (b.counts.news + b.counts.clue + b.counts.social) - (a.counts.news + a.counts.clue + a.counts.social);
    });
    const summary = $("#instSummary");
    if (summary) summary.textContent = `显示 ${list.length}/${META.institutions.length} 个机构`;
    if (!list.length) { grid.innerHTML = '<div class="empty" style="grid-column:1/-1">没有匹配的机构</div>'; return; }
    grid.innerHTML = list.map((i) => {
      const n = i.counts.news, c = i.counts.clue, s = i.counts.social, t = n + c + s;
      const pct = (v) => (t ? (v / t * 100).toFixed(1) : 0);
      return `<article class="inst-card" tabindex="0" role="link" aria-label="查看${esc(i.cn)}" data-ktid="${i.ktid}">
        <div class="ic-head"><h3>${esc(i.cn)}</h3><span class="chip">${esc(i.type || "机构")}</span></div>
        <div class="en">${esc(i.en)}</div>
        <div class="en" style="color:var(--muted)">ktid ${i.ktid} · ${esc(i.country || "")}</div>
        <div class="mini-bar"><i style="width:${pct(n)}%;background:${COLORS.news}"></i><i style="width:${pct(c)}%;background:${COLORS.clue}"></i><i style="width:${pct(s)}%;background:${COLORS.social}"></i></div>
        <div class="ic-counts">
          <div class="ic-count news"><b>${fmt(n)}</b><span>舆情</span></div>
          <div class="ic-count clue"><b>${fmt(c)}</b><span>线索</span></div>
          <div class="ic-count social"><b>${fmt(s)}</b><span>社媒</span></div>
        </div>
      </article>`;
    }).join("");
    grid.querySelectorAll(".inst-card").forEach((el) => {
      el.addEventListener("click", () => { location.hash = "#/institution/" + el.dataset.ktid; });
      el.addEventListener("keydown", (event) => { if (event.key === "Enter") el.click(); });
    });
  }

  /* ---------- 视图：机构详情 ---------- */
  function viewInstitution(ktid, params = new URLSearchParams()) {
    const version = routeVersion;
    const inst = instMap.get(Number(ktid));
    setActive("institutions");
    if (!inst) { view.innerHTML = '<div class="empty">机构不存在</div>'; return; }
    setCrumb(`机构库 / <b>${esc(inst.cn)}</b>`);

    const state = { angle: ANGLES.includes(params.get("angle")) ? params.get("angle") : "news", q: params.get("q") || "", page: Math.max(1, Number(params.get("page")) || 1) };
    let drawId = 0;
    let listEntries = [];
    view.innerHTML = `
      <div class="page-head" style="align-items:center">
        <div style="flex:1"><a href="#/institutions" style="font-size:12.5px">← 返回机构库</a>
          <h1 style="margin-top:6px">${esc(inst.cn)}</h1>
          <p>${esc(inst.en)} · ktid ${inst.ktid} · ${esc(inst.type || "")} · ${esc(inst.country || "")}</p></div>
        <div class="page-actions"><a class="btn" href="#/explore?angle=all&ktid=${inst.ktid}">跨角度检索</a><a class="btn" href="#/compare?ids=${inst.ktid}">与其他机构对比</a><button class="btn" id="exportAllInstitution">导出机构全部数据</button></div>
      </div>
      <section class="kpis">
        <div class="kpi news"><div class="k-label">新闻舆情</div><div class="k-value">${fmt(inst.counts.news)}</div><div class="k-sub">舆情表 · t_kt_public_sentiment</div></div>
        <div class="kpi clue"><div class="k-label">官网线索</div><div class="k-value">${fmt(inst.counts.clue)}</div><div class="k-sub">线索表 · t_kt_risk_clue_detect</div></div>
        <div class="kpi social"><div class="k-label">社交媒体</div><div class="k-value">${fmt(inst.counts.social)}</div><div class="k-sub">社媒表 · t_kt_social_media_content</div></div>
        <div class="kpi"><div class="k-label">数据合计</div><div class="k-value">${fmt(inst.counts.news + inst.counts.clue + inst.counts.social)}</div><div class="k-sub">已审核入表</div></div>
      </section>

      <section class="section card pad">
        <div class="tabs" id="instTabs">
          ${ANGLES.map((a) => `<button class="tab ${a === state.angle ? "active" : ""}" data-angle="${a}">${angleDot(a)}${ANG[a].name}<span class="cnt" id="cnt-${a}">${fmt(inst.counts[a])}</span></button>`).join("")}
        </div>
        <div class="filters"><input type="text" id="instRecQ" aria-label="机构内关键词" value="${esc(state.q)}" placeholder="搜索标题 / 摘要 / 来源，支持多个关键词">
          <button class="btn" id="exportInstitution">导出当前角度 CSV</button><span class="hint" id="instRecSummary"></span></div>
        <div id="instRecs" class="rec-list"><div class="skeleton">正在加载数据…</div></div>
        <div id="instPager"></div>
      </section>`;

    const recsBox = $("#instRecs"), pagerBox = $("#instPager");
    async function draw() {
      const requestId = ++drawId;
      const angle = state.angle;
      recsBox.innerHTML = '<div class="skeleton">正在加载数据…</div>';
      pagerBox.innerHTML = "";
      try {
        const all = (await ensure(angle)).filter((r) => r.ktid === inst.ktid);
        if (version !== routeVersion || requestId !== drawId || !recsBox.isConnected) return;
        const tokens = CORE.parseQuery(state.q);
        const list = tokens.length ? all.filter((r) => CORE.matches(recordText(angle, r), tokens)) : all;
        listEntries = list.map((r) => ({ angle, r }));
        state.page = CORE.pageNumber(state.page, list.length, PAGE);
        const start = (state.page - 1) * PAGE;
        const slice = list.slice(start, start + PAGE);
        $("#instRecSummary").textContent = `筛选结果 ${fmt(list.length)} 条`;
        recsBox.innerHTML = slice.length ? slice.map((r) => recCard(angle, r)).join("") : '<div class="empty">没有匹配的记录，请调整关键词</div>';
        pagerBox.innerHTML = pager(list.length, state.page, (p) => { state.page = p; draw(); window.scrollTo({ top: recsBox.offsetTop - 120, behavior: "smooth" }); });
        bindPager(pagerBox, (p) => { state.page = p; draw(); });
        bindRecords(recsBox, listEntries);
        const qs = new URLSearchParams({ angle });
        if (state.q) qs.set("q", state.q);
        if (state.page > 1) qs.set("page", state.page);
        history.replaceState(null, "", "#/institution/" + inst.ktid + "?" + qs);
      } catch (e) {
        if (version !== routeVersion || requestId !== drawId || !recsBox.isConnected) return;
        recsBox.innerHTML = '<div class="empty">数据加载失败：' + esc(e.message) + '<br><button class="btn" id="retryInst">重试</button></div>';
        $("#retryInst").onclick = draw;
      }
    }
    view.querySelectorAll("#instTabs .tab").forEach((b) => {
      b.addEventListener("click", () => {
        state.angle = b.dataset.angle; state.page = 1;
        view.querySelectorAll("#instTabs .tab").forEach((x) => x.classList.toggle("active", x === b));
        draw();
      });
    });
    $("#instRecQ").addEventListener("input", (e) => { state.q = e.target.value; state.page = 1; draw(); });
    $("#exportInstitution").addEventListener("click", () => exportEntries(listEntries, `zgclab-${inst.ktid}-${ANG[state.angle].short}.csv`));
    $("#exportAllInstitution").onclick = async (event) => {
      const button = event.currentTarget; button.disabled = true;
      try { exportEntries((await entriesFor(ALL)).filter(({r}) => r.ktid === inst.ktid), `zgclab-${inst.ktid}-全部.csv`); }
      catch (e) { showToast(e.message); }
      finally { button.disabled = false; }
    };
    draw();
  }

  /* ---------- 视图：数据浏览 ---------- */
  function viewExplore(params) {
    setActive("explore");
    setCrumb("<b>数据浏览</b>");
    return window.ZGCLAB_EXPLORER(params, {
      ...researchApi(),
      META, CORE, view, esc, fmt, entriesFor, recCard, bindRecords, pager, bindPager,
      exportEntries, copyText, showToast, workspace, saveWorkspace, titleOf, snippetOf,
      version: routeVersion, currentVersion: () => routeVersion, signal: routeController.signal, isRead, markRead,
    });
  }

  function legacyExplore(params) {
    const state = {
      angle: [ALL, ...ANGLES].includes(params.get("angle")) ? params.get("angle") : ALL,
      ktid: instMap.has(Number(params.get("ktid"))) ? params.get("ktid") : "",
      q: params.get("q") || "",
      sub: params.get("sub") || "",
      from: CORE.validDay(params.get("from")) ? params.get("from") : "",
      to: CORE.validDay(params.get("to")) ? params.get("to") : "",
      sort: ["newest", "oldest", "relevance"].includes(params.get("sort")) ? params.get("sort") : "newest",
      mode: params.get("mode") === "any" ? "any" : "all",
      source: params.get("source") || "",
      size: [14, 25, 50, 100].includes(Number(params.get("size"))) ? Number(params.get("size")) : PAGE,
      page: Math.max(1, Math.floor(Number(params.get("page"))) || 1),
    };
    const version = routeVersion;
    let refreshId = 0;
    let debounce;
    let currentEntries = [];
    view.innerHTML = `
      <div class="page-head"><div><span class="kicker">EXPLORER</span><h1>数据浏览</h1>
        <p>把机构、关键词、风险等级和时间范围组合成可复用的查询</p></div>
        <div class="page-actions"><button class="btn" id="saveQuery">保存查询</button><button class="btn" id="copyQuery">复制查询链接</button><button class="btn primary" id="exportResults" disabled>导出结果 CSV</button></div></div>
      <div class="card pad">
        <div class="tabs" id="exTabs">
          <button class="tab ${state.angle === ALL ? "active" : ""}" data-angle="${ALL}"><span class="dot" style="background:var(--accent)"></span>全部数据<span class="cnt">${fmt(ANGLES.reduce((s, a) => s + META.totals[a], 0))}</span></button>
          ${ANGLES.map((a) => `<button class="tab ${a === state.angle ? "active" : ""}" data-angle="${a}">${angleDot(a)}${ANG[a].name}<span class="cnt">${fmt(META.totals[a])}</span></button>`).join("")}
        </div>
        <div class="filters explorer-filters">
          <select id="exInst" aria-label="筛选机构">
            <option value="">全部机构</option>
            ${META.institutions.map((i) => `<option value="${i.ktid}" ${String(i.ktid) === state.ktid ? "selected" : ""}>${esc(i.cn)}</option>`).join("")}
          </select>
          <input type="text" id="exQ" aria-label="查询关键词" placeholder='关键词，如：人工智能 安全，或 "climate policy" -military' value="${esc(state.q)}">
          <select id="exMode" aria-label="关键词匹配方式"><option value="all" ${state.mode === "all" ? "selected" : ""}>包含全部关键词</option><option value="any" ${state.mode === "any" ? "selected" : ""}>包含任一关键词</option></select>
          <select id="exSub" aria-label="标签风险平台"></select>
          <input type="text" id="exSource" aria-label="筛选来源或账号" placeholder="来源域名 / 发布主体 / 社媒账号" value="${esc(state.source)}">
          <label class="date-filter">从 <input type="date" id="exFrom" value="${esc(state.from)}"></label>
          <label class="date-filter">至 <input type="date" id="exTo" value="${esc(state.to)}"></label>
          <select id="exSort" aria-label="结果排序">
            <option value="newest" ${state.sort === "newest" ? "selected" : ""}>按时间最新</option>
            <option value="oldest" ${state.sort === "oldest" ? "selected" : ""}>按时间最早</option>
            <option value="relevance" ${state.sort === "relevance" ? "selected" : ""}>按关键词相关度</option>
          </select>
          <button class="filter-chip" id="clearExplore">清除筛选</button>
        </div>
        <div class="query-help">检索标题、摘要、正文节选、关键词和机构名称；用空格组合关键词，双引号匹配短语，减号排除词。日期按原始记录中的日历日期筛选。</div>
        <div id="exError" class="inline-error" role="alert" hidden></div>
        <div class="result-bar"><span id="exCount" class="result-count" role="status" aria-live="polite"></span>
          <label class="page-size">每页 <select id="exSize" aria-label="每页记录数">${[14,25,50,100].map((size) => `<option value="${size}" ${size === state.size ? "selected" : ""}>${size} 条</option>`).join("")}</select></label></div>
        <div id="exBreakdown" class="query-breakdown"></div>
        <div class="table-wrap explorer-table"><table class="data"><thead id="exHead"></thead><tbody id="exBody"></tbody></table></div>
        <div class="mobile-results rec-list" id="exCards"></div>
        <div id="exPager"></div>
      </div>`;

    function subOptions() {
      const sel = $("#exSub"); sel.innerHTML = "";
      let items = [];
      if (state.angle === ALL || state.angle === "news") items.push(...Object.keys(META.stats.news.tags || {}).map((k) => [state.angle === ALL ? "news:tag" : "tag", k, "舆情标签：" + k]));
      if (state.angle === ALL || state.angle === "clue") items.push(...Object.keys(META.stats.clue.risk_levels || {}).map((k) => [state.angle === ALL ? "clue:risk_level" : "risk_level", k, "线索风险：" + k]));
      if (state.angle === ALL || state.angle === "social") items.push(...Object.keys(META.stats.social.platforms || {}).map((k) => [state.angle === ALL ? "social:platform" : "platform", k, "社媒平台：" + k]));
      const selected = items.some(([f, v]) => `${f}:${v}` === state.sub) ? state.sub : "";
      state.sub = selected;
      sel.innerHTML = `<option value="">全部标签 / 风险 / 平台</option>` + items.map(([f, v, label]) => `<option value="${esc(f + ":" + v)}" ${selected === f + ":" + v ? "selected" : ""}>${esc(label)}</option>`).join("");
    }

    function filtered(entries) {
      let list = entries;
      if (state.ktid) list = list.filter(({ r }) => String(r.ktid) === state.ktid);
      if (state.sub) {
        const i = state.sub.indexOf(":");
        const prefix = state.sub.slice(0, i), rest = state.sub.slice(i + 1);
        const j = rest.indexOf(":");
        const f = j >= 0 ? rest.slice(0, j) : prefix;
        const v = j >= 0 ? rest.slice(j + 1) : rest;
        list = list.filter(({ angle, r }) => {
          if (state.angle === ALL && angle !== prefix) return false;
          const fallback = f === "risk_level" ? "未判定" : f === "tag" ? "未分类" : "";
          return (val(r, f) || fallback) === v;
        });
      }
      const tokens = CORE.parseQuery(state.q);
      if (tokens.length) list = list.filter(({ angle, r }) => CORE.matches(recordText(angle, r), tokens, state.mode));
      const source = CORE.normalize(state.source).trim();
      if (source) list = list.filter(({ r }) => CORE.normalize([r.publish_source, r.publisher_website, r.publish_subject, r.account_name, r.account_handle, r.account_url, r.url, r.original_url, r.content_url].join(" ")).includes(source));
      if (state.from || state.to) list = list.filter(({ angle, r }) => CORE.withinDates(dateOf(angle, r), state.from, state.to));
      const scores = new Map();
      if (state.sort === "relevance") list.forEach((entry) => scores.set(entry, CORE.relevance(titleOf(entry.angle, entry.r), recordText(entry.angle, entry.r), tokens)));
      list = [...list].sort((a, b) => {
        return (state.sort === "relevance" ? scores.get(b) - scores.get(a) : 0) || CORE.compareDates(dateOf(a.angle, a.r), dateOf(b.angle, b.r), state.sort === "oldest") || String(a.r.id).localeCompare(String(b.r.id));
      });
      return list;
    }

    function head() {
      if (state.angle === ALL) return `<tr><th>角度</th><th>标题 / 内容</th><th>机构</th><th>标签 / 风险 / 平台</th><th>时间</th></tr>`;
      if (state.angle === "news") return `<tr><th>标题</th><th>机构</th><th>来源</th><th>标签</th><th>发布时间</th></tr>`;
      if (state.angle === "clue") return `<tr><th>线索标题</th><th>机构</th><th>风险</th><th>发布者</th><th>发布时间</th></tr>`;
      return `<tr><th>账号 / 内容</th><th>机构</th><th>平台</th><th>互动</th><th>发布时间</th></tr>`;
    }
    function row(angle, r) {
      const t = `<span class="cell-title">${esc(titleOf(angle, r))}</span>`;
      if (state.angle === ALL) return `<tr data-angle="${angle}" data-id="${esc(r.id || "")}"><td><span class="tag ${angle}">${esc(ANG[angle].name)}</span></td><td>${t}</td><td>${esc(instName(r.ktid))}</td><td>${badgeOf(angle, r) || "—"}</td><td class="cell-muted">${esc(day(dateOf(angle, r)) || "—")}</td></tr>`;
      if (angle === "news") return `<tr data-angle="${angle}" data-id="${esc(r.id || "")}"><td>${t}</td><td>${esc(instName(r.ktid))}</td><td class="cell-muted">${esc(val(r, "publish_source") || "—")}</td><td>${r.tag ? `<span class="tag news">${esc(r.tag)}</span>` : "—"}</td><td class="cell-muted">${esc(day(r.publish_time) || "—")}</td></tr>`;
      if (angle === "clue") return `<tr data-angle="${angle}" data-id="${esc(r.id || "")}"><td>${t}</td><td>${esc(instName(r.ktid))}</td><td>${r.risk_level ? `<span class="tag clue ${RISK_CLASS[r.risk_level] || ""}">${esc(r.risk_level)}</span>` : "—"}</td><td class="cell-muted">${esc(val(r, "publisher_type") || "—")}</td><td class="cell-muted">${esc(day(r.publish_time) || "—")}</td></tr>`;
      const engage = [r.like_count && "赞 " + r.like_count, r.comment_count && "评 " + r.comment_count, r.repost_count && "转 " + r.repost_count].filter(Boolean).join(" · ") || "—";
      return `<tr data-angle="${angle}" data-id="${esc(r.id || "")}"><td>${t}</td><td>${esc(instName(r.ktid))}</td><td>${r.platform ? `<span class="tag social">${esc(r.platform)}</span>` : "—"}</td><td class="cell-muted">${esc(engage)}</td><td class="cell-muted">${esc(day(r.publish_time) || "—")}</td></tr>`;
    }

    async function refresh() {
      const requestId = ++refreshId;
      const body = $("#exBody");
      const error = $("#exError");
      error.hidden = true;
      $("#exportResults").disabled = true;
      if (state.from && state.to && state.from > state.to) {
        error.hidden = false; error.textContent = "开始日期不能晚于结束日期，请调整日期范围。";
        body.innerHTML = '<tr><td colspan="5"><div class="empty">请修正日期范围后继续查询</div></td></tr>';
        $("#exCards").innerHTML = '<div class="empty">请修正日期范围后继续查询</div>';
        $("#exPager").innerHTML = ""; $("#exCount").textContent = "日期范围无效"; $("#exBreakdown").innerHTML = "";
        return;
      }
      body.innerHTML = `<tr><td colspan="5"><div class="skeleton">正在加载数据…</div></td></tr>`;
      $("#exCards").innerHTML = '<div class="skeleton">正在加载数据…</div>';
      $("#exCount").textContent = "正在查询…";
      $("#exPager").innerHTML = "";
      try {
        const all = await entriesFor(state.angle);
        if (version !== routeVersion || requestId !== refreshId || !body.isConnected) return;
        const list = filtered(all);
        currentEntries = list;
        state.page = CORE.pageNumber(state.page, list.length, state.size);
        const start = (state.page - 1) * state.size;
        const slice = list.slice(start, start + state.size);
        $("#exHead").innerHTML = head();
        $("#exCount").textContent = `筛选结果 ${fmt(list.length)} 条 · ${new Set(list.map(({r}) => r.ktid)).size} 个机构 · 当前显示 ${list.length ? start + 1 : 0}–${start + slice.length} 条`;
        $("#exBreakdown").innerHTML = ANGLES.map((angle) => `<span class="tag ${angle}">${ANG[angle].name} ${fmt(list.filter((e) => e.angle === angle).length)}</span>`).join("") + '<span class="hint">点击记录可查看完整交付字段、正文与附件</span>';
        body.innerHTML = slice.length ? slice.map(({ angle, r }) => row(angle, r)).join("") : `<tr><td colspan="5"><div class="empty">没有匹配的记录，请调整筛选条件</div></td></tr>`;
        $("#exCards").innerHTML = slice.length ? slice.map(({ angle, r }) => recCard(angle, r)).join("") : '<div class="empty">没有匹配的记录，请调整筛选条件</div>';
        bindRecords(body, list);
        bindRecords($("#exCards"), list);
        $("#exPager").innerHTML = pager(list.length, state.page, null, state.size);
        bindPager($("#exPager"), (p) => { state.page = p; refresh(); });
        $("#exportResults").disabled = !list.length;
        replaceExploreUrl(state);
      } catch (e) {
        if (version !== routeVersion || requestId !== refreshId || !body.isConnected) return;
        $("#exCount").textContent = "查询未完成";
        body.innerHTML = `<tr><td colspan="5"><div class="empty">${esc(e.message)}<br><button class="btn" id="retryExplore">重新加载</button></div></td></tr>`;
        $("#exCards").innerHTML = `<div class="empty">${esc(e.message)}<br><button class="btn" id="retryExploreMobile">重新加载</button></div>`;
        $("#retryExplore").onclick = refresh;
        $("#retryExploreMobile").onclick = refresh;
      }
    }

    view.querySelectorAll("#exTabs .tab").forEach((b) => {
      b.addEventListener("click", () => {
        state.angle = b.dataset.angle; state.page = 1; state.sub = "";
        view.querySelectorAll("#exTabs .tab").forEach((x) => x.classList.toggle("active", x === b));
        subOptions(); refresh();
      });
    });
    $("#exInst").addEventListener("change", (e) => { state.ktid = e.target.value; state.page = 1; refresh(); });
    const delayedRefresh = () => { window.clearTimeout(debounce); debounce = window.setTimeout(() => { if (version === routeVersion) refresh(); }, 180); };
    $("#exQ").addEventListener("input", (e) => { state.q = e.target.value; state.page = 1; delayedRefresh(); });
    $("#exSource").addEventListener("input", (e) => { state.source = e.target.value; state.page = 1; delayedRefresh(); });
    $("#exMode").addEventListener("change", (e) => { state.mode = e.target.value; state.page = 1; refresh(); });
    $("#exSize").addEventListener("change", (e) => { state.size = Number(e.target.value); state.page = 1; refresh(); });
    $("#exSub").addEventListener("change", (e) => { state.sub = e.target.value; state.page = 1; refresh(); });
    $("#exFrom").addEventListener("change", (e) => { state.from = e.target.value; state.page = 1; refresh(); });
    $("#exTo").addEventListener("change", (e) => { state.to = e.target.value; state.page = 1; refresh(); });
    $("#exSort").addEventListener("change", (e) => { state.sort = e.target.value; state.page = 1; refresh(); });
    $("#clearExplore").addEventListener("click", () => {
      state.ktid = ""; state.q = ""; state.sub = ""; state.from = ""; state.to = ""; state.sort = "newest"; state.page = 1; state.mode = "all"; state.source = "";
      $("#exInst").value = ""; $("#exQ").value = ""; $("#exFrom").value = ""; $("#exTo").value = ""; $("#exSort").value = "newest";
      $("#exSource").value = ""; $("#exMode").value = "all";
      subOptions(); refresh();
    });
    $("#copyQuery").addEventListener("click", () => copyText(queryLink(state), "查询链接已复制"));
    $("#exportResults").addEventListener("click", () => exportEntries(currentEntries, `zgclab-${state.angle === ALL ? "全部" : ANG[state.angle].short}-筛选结果.csv`));
    $("#saveQuery").addEventListener("click", () => {
      const hash = queryLink(state).split("#")[1];
      if (workspace.queries.some((item) => item.hash === hash)) { showToast("当前查询已经保存"); return; }
      const name = [state.q || "全部记录", state.ktid ? instName(Number(state.ktid)) : "全部机构", angleName(state.angle)].join(" · ");
      workspace.queries.unshift({ name, hash, savedAt: new Date().toISOString() });
      saveWorkspace(); showToast("查询已保存，可在“我的工作台”打开");
    });
    $("#globalSearch").value = state.q;
    subOptions();
    refresh();
  }

  /* ---------- Saved research workspace ---------- */
  function viewWorkspace() {
    setActive("workspace"); setCrumb("<b>我的工作台</b>");
    const version = routeVersion;
    view.innerHTML = `<div class="page-head"><div><span class="kicker">WORKSPACE</span><h1>我的工作台</h1><p>保存查询条件和待跟进记录 · 内容保存在当前浏览器，可导出备份</p></div><div class="page-actions"><button class="btn" id="backupWorkspace">导出工作台备份</button><label class="btn import-label">导入备份<input type="file" id="importWorkspace" accept="application/json,.json" hidden></label></div></div>
      <section class="section card pad" style="margin:0 0 16px"><div class="section-head"><h2>研究工作</h2></div><div class="quick-links"><a class="btn" href="#/projects">专题资料夹 · ${fmt((workspace.projects||[]).length)} 个专题</a><a class="btn" href="#/assistant?mode=chat">资料对话</a><a class="btn" href="#/changes">新增与变化</a><a class="btn" href="#/collection-plan">未来采集建议</a></div><p class="hint">总备份包含专题、批注、资料分组、变化基线、采集待办及选择保存的对话；导入时合并保留已有编辑。</p></section>
      <section class="grid g2"><div class="card pad"><div class="section-head"><h2>保存的查询</h2><span class="hint">${workspace.queries.length} 项</span></div>
        <div class="saved-list">${workspace.queries.length ? workspace.queries.map((item, index) => `<article class="saved-item"><a href="#${esc(item.hash)}">${esc(item.name)}</a><button class="icon-btn" data-remove-query="${index}" aria-label="移除查询：${esc(item.name)}">×</button><span class="date">保存于 ${esc(day(item.savedAt))}</span></article>`).join("") : '<div class="empty">还没有保存查询<br>在数据浏览中组合筛选后，点击“保存查询”</div>'}</div></div>
        <div class="card pad"><div class="section-head"><h2>收藏记录</h2><span class="hint">${workspace.favorites.length} 条</span><button class="btn" id="exportFavorites" ${workspace.favorites.length ? "" : "disabled"}>导出 CSV</button></div>
        <div class="saved-list">${workspace.favorites.length ? workspace.favorites.map((item, index) => `<article class="saved-item"><span class="tag ${esc(item.angle)}">${esc(angleName(item.angle))}</span><a href="#/record/${esc(item.angle)}/${esc(item.id)}">${esc(item.title)}</a><button class="icon-btn" data-remove-favorite="${index}" aria-label="移除收藏：${esc(item.title)}">×</button><span class="date">${esc(instName(item.ktid))} · ${esc(day(item.date))}</span></article>`).join("") : '<div class="empty">还没有收藏记录<br>打开记录详情，点击“☆ 收藏记录”</div>'}</div></div></section>
      <section class="section card pad"><div class="section-head"><h2>常用查询入口</h2></div><div class="quick-links"><a class="btn" href="#/explore?angle=clue&sub=risk_level%3A%E9%AB%98">查看高风险线索</a><a class="btn" href="#/explore?angle=social&sub=platform%3AX">浏览 X 平台</a><a class="btn" href="#/explore?angle=all&q=%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD">检索人工智能</a><a class="btn" href="#/compare">机构对比分析</a></div></section>`;
    view.querySelectorAll("[data-remove-query]").forEach((button) => button.onclick = () => { workspace.queries.splice(Number(button.dataset.removeQuery), 1); saveWorkspace(); viewWorkspace(); });
    view.querySelectorAll("[data-remove-favorite]").forEach((button) => button.onclick = () => { workspace.favorites.splice(Number(button.dataset.removeFavorite), 1); saveWorkspace(); viewWorkspace(); });
    $("#exportFavorites").onclick = async (event) => {
      const button = event.currentTarget; button.disabled = true;
      try {
        const angles = [...new Set(workspace.favorites.map((item) => item.angle))];
        await Promise.all(angles.map(ensure));
        const entries = workspace.favorites.map((item) => ({ angle: item.angle, r: cache[item.angle].find((r) => r.id === item.id) })).filter((e) => e.r);
        exportEntries(entries, "zgclab-收藏记录.csv");
      } catch (e) { showToast(e.message); }
      finally { if (version === routeVersion) button.disabled = false; }
    };
    $("#backupWorkspace").onclick = () => {
      const blob = new Blob([JSON.stringify({ version: 3, ...workspace }, null, 2)], {type:"application/json"});
      const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = "zgclab-workspace.json"; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    $("#importWorkspace").onchange = async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const importSignal=routeController.signal;
      try {
        if (file.size > 10 * 1024 * 1024) throw new Error("备份文件超过 10 MB，请检查文件");
        const parsed = JSON.parse(await file.text());
        if(version!==routeVersion||importSignal.aborted)return;
        if (!parsed || !Array.isArray(parsed.favorites) || !Array.isArray(parsed.queries)) throw new Error("备份格式不正确");
        if(parsed.favorites.length>50_000||parsed.queries.length>1_000)throw new Error("备份记录数量超过允许范围");
        const draft=JSON.parse(JSON.stringify(workspace));
        const favorites = parsed.favorites.filter((item) => item && ANGLES.includes(item.angle) && typeof item.id === "string" && /^[a-z0-9-]{1,100}$/i.test(item.id) && instMap.has(Number(item.ktid)));
        const queries = parsed.queries.filter((item) => item && typeof item.hash === "string" && /^\/explore(?:\?|$)/.test(item.hash) && typeof item.name === "string");
        for (const item of favorites) if (!draft.favorites.some(existing=>existing.angle===item.angle&&existing.id===item.id)) draft.favorites.push({angle:item.angle,id:item.id,ktid:Number(item.ktid),title:String(item.title || item.id).slice(0,1000),date:String(item.date || ""),savedAt:String(item.savedAt || "")});
        for (const item of queries) if (!draft.queries.some((q) => q.hash === item.hash)) draft.queries.push({name:item.name.slice(0,500),hash:item.hash.slice(0,10000),savedAt:String(item.savedAt || ""),...(typeof item.version==="string"&&/^[a-f0-9]{16,64}$/i.test(item.version)?{version:item.version}:{})});
        if (Array.isArray(parsed.watchlist)) draft.watchlist = [...new Set([...draft.watchlist, ...parsed.watchlist.map(Number).filter((id) => instMap.has(id))])];
        if (parsed.read && typeof parsed.read === "object" && !Array.isArray(parsed.read)) for (const [key, time] of Object.entries(parsed.read)) {
          if (/^[a-f0-9]{16}:(news|clue|social):[a-z0-9-]+$/i.test(key) && typeof time === "string" && Number.isFinite(Date.parse(time))) draft.read[key] = time;
        }
        if (parsed.projects !== undefined && window.ZGCLAB_PROJECTS?.mergeBackup) window.ZGCLAB_PROJECTS.mergeBackup(parsed.projects,draft);
        if (window.ZGCLAB_RESEARCH_UI?.mergeBackup) window.ZGCLAB_RESEARCH_UI.mergeBackup(parsed,draft);
        if (window.ZGCLAB_ASSISTANT?.mergeBackup) window.ZGCLAB_ASSISTANT.mergeBackup(parsed,draft);
        if(version!==routeVersion||importSignal.aborted)return;
        workspace=draft;
        const persisted=saveWorkspace(); if (version === routeVersion) viewWorkspace(); showToast(persisted ? "备份已合并导入并保存" : "备份已合并到本次访问，但浏览器未能保存；请导出备份，刷新会丢失本次导入");
      } catch (e) { showToast(e.message || "备份读取失败"); }
    };
  }

  /* ---------- Institution comparison ---------- */
  function viewCompare(params) {
    setActive("compare"); setCrumb("<b>机构对比</b>");
    const selected = [...new Set((params.get("ids") || "").split(",").map(Number).filter((id) => instMap.has(id)))].slice(0,4);
    if (!selected.length) selected.push(...META.institutions.slice(0,3).map((i) => i.ktid));
    view.innerHTML = `<div class="page-head"><div><span class="kicker">COMPARE</span><h1>机构对比</h1><p>同时比较最多 4 个机构的覆盖和数据分布，点击数量进入查询</p></div><div class="page-actions"><button class="btn" id="copyCompare">复制对比链接</button><button class="btn primary" id="exportCompare">导出对比 CSV</button></div></div>
      <div class="card pad"><div class="compare-picker">${META.institutions.map((i) => `<label><input type="checkbox" data-compare-id="${i.ktid}" ${selected.includes(i.ktid) ? "checked" : ""}>${esc(i.cn)}</label>`).join("")}</div><div id="comparison"></div></div>`;
    function render() {
      const rows = selected.map((id) => instMap.get(id));
      const total = (i) => ANGLES.reduce((sum,a) => sum + i.counts[a],0);
      $("#comparison").innerHTML = rows.length ? `<div class="table-wrap"><table class="data compare-table"><thead><tr><th>指标</th>${rows.map((i) => `<th><a href="#/institution/${i.ktid}">${esc(i.cn)}</a><small>${esc(i.en)}</small></th>`).join("")}</tr></thead><tbody>
        <tr><th>机构类型</th>${rows.map((i) => `<td>${esc(i.type)}</td>`).join("")}</tr><tr><th>国家 / ktid</th>${rows.map((i) => `<td>${esc(i.country)} / ${i.ktid}</td>`).join("")}</tr>
        <tr><th>数据合计</th>${rows.map((i) => `<td><a href="#/explore?angle=all&ktid=${i.ktid}">${fmt(total(i))}</a></td>`).join("")}</tr>
        ${ANGLES.map((a) => `<tr><th>${ANG[a].name}</th>${rows.map((i) => `<td><a href="#/explore?angle=${a}&ktid=${i.ktid}">${fmt(i.counts[a])}</a><div class="compare-bar"><i style="width:${total(i) ? i.counts[a]/total(i)*100 : 0}%;background:${COLORS[a]}"></i></div><small>${total(i) ? (i.counts[a]/total(i)*100).toFixed(1) : 0}% 占比</small></td>`).join("")}</tr>`).join("")}
        <tr><th>角度覆盖</th>${rows.map((i) => `<td>${ANGLES.filter((a) => i.counts[a] > 0).length}/3</td>`).join("")}</tr></tbody></table></div>` : '<div class="empty">选择至少一个机构开始对比</div>';
      const hash = "#/compare?ids=" + selected.join(","); history.replaceState(null,"",hash);
      $("#copyCompare").onclick = () => copyText(baseUrl()+hash,"对比链接已复制");
      $("#exportCompare").disabled = !rows.length;
      $("#exportCompare").onclick = () => downloadCsv("zgclab-机构对比.csv",["ktid","机构","英文名","类型","国家",...ANGLES.map((a) => ANG[a].name),"合计"],rows.map((i) => [i.ktid,i.cn,i.en,i.type,i.country,...ANGLES.map((a) => i.counts[a]),total(i)]));
    }
    view.querySelectorAll("[data-compare-id]").forEach((input) => input.onchange = () => {
      const id = Number(input.dataset.compareId);
      if (input.checked && selected.length >= 4) { input.checked = false; showToast("一次最多对比 4 个机构"); return; }
      if (input.checked) selected.push(id); else selected.splice(selected.indexOf(id),1);
      render();
    });
    render();
  }

  /* ---------- 视图：任务与交付 ---------- */
  function viewAbout() {
    setActive("about");
    setCrumb("<b>任务与交付</b>");
    const total = ANGLES.reduce((s, a) => s + (META.totals[a] || 0), 0);
    view.innerHTML = `
      <div class="page-head"><div><span class="kicker">MODEL & DELIVERY</span><h1>任务与交付</h1>
        <p>本系统展示的是「20 个验证单位 × 3 个采集角度」的真实交付数据</p></div></div>

      <section class="card pad">
        <div class="section-head"><h2>数据链路</h2><span class="hint">从采集到展示</span></div>
        <div class="flow">
          <div class="fstep"><b>三个采集角度</b><span>机构官网 · 社交媒体 · 新闻舆情</span></div><div class="arrow">→</div>
          <div class="fstep"><b>证据与对象存储</b><span>原文、图片、PDF、音视频、哈希与关联</span></div><div class="arrow">→</div>
          <div class="fstep"><b>加工与审核</b><span>翻译、摘要、分类、评分，保留来源依据</span></div><div class="arrow">→</div>
          <div class="fstep"><b>三张目标表</b><span>舆情 / 线索 / 社媒，按 ktid 关联</span></div><div class="arrow">→</div>
          <div class="fstep"><b>数据展示</b><span>机构 × 角度浏览、检索与详情</span></div>
        </div>
      </section>

      <section class="section"><div class="section-head"><h2>任务一的三个角度与目标表</h2></div>
        <div class="table-def">
          <div class="td-card"><h4>${angleDot("news")} 新闻舆情 → 舆情表</h4>
            <div class="tbl">t_kt_public_sentiment</div>
            <div class="big" style="color:${COLORS.news}">${fmt(META.totals.news)}</div>
            <div class="note">第三方对机构的报道。字段 ${ANG.news.fields} 个：中英标题、中英摘要、标签、正文、发布时间、来源地址等。</div></div>
          <div class="td-card"><h4>${angleDot("clue")} 机构官网 → 线索表</h4>
            <div class="tbl">t_kt_risk_clue_detect</div>
            <div class="big" style="color:${COLORS.clue}">${fmt(META.totals.clue)}</div>
            <div class="note">机构自己发布的信息与风险线索。字段 ${ANG.clue.fields} 个：线索标题、风险等级、发布主体、行业、原文与中文翻译等。</div></div>
          <div class="td-card"><h4>${angleDot("social")} 社交媒体 → 社媒表</h4>
            <div class="tbl">t_kt_social_media_content</div>
            <div class="big" style="color:${COLORS.social}">${fmt(META.totals.social)}</div>
            <div class="note">X / Facebook / LinkedIn 公开账号内容。字段 ${ANG.social.fields} 个：账号、正文、翻译、互动量、话题、媒体地址等。</div></div>
        </div>
      </section>

      <section class="section card pad">
        <div class="section-head"><h2>20 个验证单位</h2><span class="hint">按 ktid 关联全部数据</span></div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>#</th><th>ktid</th><th>机构</th><th>英文名</th><th>类型</th><th>国家</th><th>舆情</th><th>线索</th><th>社媒</th></tr></thead>
          <tbody>${META.institutions.map((i, idx) => `<tr data-ktid="${i.ktid}">
            <td class="cell-muted">${idx + 1}</td><td class="cell-muted">${i.ktid}</td>
            <td><span class="cell-title">${esc(i.cn)}</span></td><td class="cell-muted">${esc(i.en)}</td>
            <td>${esc(i.type || "—")}</td><td class="cell-muted">${esc(i.country || "—")}</td>
            <td class="mono">${fmt(i.counts.news)}</td><td class="mono">${fmt(i.counts.clue)}</td><td class="mono">${fmt(i.counts.social)}</td></tr>`).join("")}
          </tbody></table></div>
      </section>

      <section class="section card pad">
        <div class="section-head"><h2>数据说明</h2></div>
        <div class="note">
          · 本系统展示需求 1 已审核入表的交付快照，共 <b>${fmt(total)}</b> 条记录。<br>
          · 快照生成时间：${esc(META.generated_at.replace("T", " ").slice(0, 19))} UTC；数据包：<span class="mono">${esc(String(META.source_package).split("/").slice(-1)[0])}</span><br>
          · 交付口径：系统字段（主键、创建/修改时间、删除标记等）由接收系统生成，不计入采集方未完成；无法确认的字段留空，不写占位词。<br>
          · 当前展示仅覆盖 20 个验证单位，不代表历史全量；20 家名单用于本阶段练习、回归与验证。
        </div>
      </section>
      <section class="section card pad"><div class="section-head"><h2>数据完整性与查询口径</h2><span class="hint">基于当前交付快照计算</span></div>
        <div class="table-wrap"><table class="data"><thead><tr><th>采集角度</th><th>记录数</th><th>有效日期</th><th>原文地址</th><th>摘要 / 翻译</th><th>目标表字段</th></tr></thead><tbody>
          ${ANGLES.map((a) => { const stat = META.stats[a]; return `<tr><td>${ANG[a].name}</td><td>${fmt(stat.total)}</td><td>${fmt(stat.dated == null ? stat.total : stat.dated)}</td><td>${stat.linked == null ? "—" : fmt(stat.linked)}</td><td>${stat.summarized == null ? "—" : fmt(stat.summarized)}</td><td>${ANG[a].fields}</td></tr>`; }).join("")}
        </tbody></table></div>
        <p class="note">原文地址统计表示交付字段含 HTTP(S) 地址，外部网页的可访问性取决于来源站点。列表和批量 CSV 使用正文节选；打开记录详情后会加载完整交付字段，单条 CSV / JSON 包含完整原始记录。收藏与保存查询仅存于当前浏览器，可通过工作台备份迁移。</p>
      </section>`;

    view.querySelectorAll("tr[data-ktid]").forEach((tr) => {
      tr.addEventListener("click", () => { location.hash = "#/institution/" + tr.dataset.ktid; });
    });
  }

  /* ---------- 记录详情弹窗 ---------- */
  const FIELD_LABELS = {
    id: "快照记录 ID", ktid: "机构 ktid",
    title_cn: "中文标题", title_en: "英文标题", summary_cn: "中文摘要", summary_en: "英文摘要",
    tag: "主题标签", founddate: "发现时间", url: "新闻地址", publish_source: "发布媒体", publish_time: "发布时间",
    content_cn: "正文（中文）",
    title: "标题", summary: "摘要", risk_level: "风险等级", risk_desc: "风险描述", publish_channel: "发布渠道",
    publish_subject: "发布主体", industry: "所属行业", discovery_time: "发现时间", language: "语言",
    key_words: "关键词", original_url: "原文地址", publisher_website: "发布者网站", publisher_type: "发布者类型",
    publisher_business: "发布者业务", publisher_cn_attitude: "对华态度", chinese_trans: "中文翻译", source: "采集来源",
    platform: "平台", account_name: "账号名称", account_handle: "账号 handle", account_url: "账号主页",
    content_type: "内容类型", content_url: "内容链接", original_content: "原始内容", chinese_translation: "中文翻译",
    collected_time: "采集时间", keywords: "关键词", mentions: "提及账号", hashtags: "话题标签",
    like_count: "点赞数", comment_count: "评论数", repost_count: "转发数", view_count: "浏览数", source_url: "数据依据 URL",
    kt_id: "机构 ktid", clue_id: "线索主键", record_id: "原始记录标识", task_id: "任务标识", batch_no: "采集批次", account_id: "账号标识", content_id: "平台内容标识",
    clue_title: "线索标题", clue_summary: "线索摘要", related_subject: "关联主体", publisher_domain: "发布者域名", original_content: "原始正文",
    content: "原文正文", report_path: "报告 / 证据地址", media_urls: "媒体地址", attachment_urls: "附件地址", content_hash: "内容哈希", raw_json: "原始 JSON", data_status: "数据状态",
    create_time: "创建时间", update_time: "更新时间", del_flag: "删除标记", audit_status: "审核状态", audit_opinion: "审核意见", audit_tags: "审核标签", audit_risk_level: "审核风险", audit_time: "审核时间", audit_user: "审核人", is_pinned: "置顶标记",
  };
  const LONG_FIELDS = new Set(["content_cn", "original_content", "chinese_trans", "summary_cn", "summary_en", "summary", "chinese_translation", "risk_desc"]);

  function fieldValue(key, value) {
    if (value == null || value === "") return '<span class="field-empty">未提供</span>';
    if (key === "raw_json") return `<details class="raw-data"><summary>展开原始 JSON（${fmt(String(value).length)} 字符）</summary><pre>${esc(value)}</pre></details>`;
    if (/^(?:media_urls|attachment_urls)$/.test(key)) {
      let urls = [];
      try { const parsed = JSON.parse(value); urls = Array.isArray(parsed) ? parsed : [value]; }
      catch (_) { urls = String(value).split(/\s*\|\s*|\n/); }
      return urls.map((item) => {
        const raw = item && typeof item === "object" ? (item.url || item.src || JSON.stringify(item)) : String(item || "");
        const url = safeUrl(raw);
        return url ? `<a class="source-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(raw)} ↗</a>` : esc(raw);
      }).join("<br>");
    }
    const url = /(?:url|website|report_path)$/.test(key) ? safeUrl(value) : "";
    if (url) return `<a class="source-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(value)} ↗</a>`;
    return esc(value);
  }

  function schemaMarkup(angle, fields, showEmpty) {
    const schema = META.schemas && META.schemas[angle] || Object.keys(fields);
    return schema.filter((key) => showEmpty || fields[key] != null && fields[key] !== "").map((key) => {
      const Q=window.ZGCLAB_QUERY;
      const facet=Object.keys(Q.FACETS).find((name)=>Q.FACETS[name].field===key&&Q.FACETS[name].angles.includes(angle));
      const basic={tag:"tags",risk_level:"risks",platform:"platforms"}[key];
      const filter=facet||basic;
      const values=facet?Q.facetValues(fields,facet):basic&&fields[key]?[String(fields[key])]:[];
      const links=filter?values.map((value)=>{
        const currentRoute=parseHash(),params=Q.parse(currentRoute.params);Q.setAngle(params,angle);
        if(currentRoute.name==="institution"&&currentRoute.id)params.ids=[String(currentRoute.id)];
        if(facet)params[facet]=[value];else params[basic]=[value];
        params.page=1;params.version=META.version;params.sim=simulationEnabled?"1":"";
        return `<a class="field-filter-link" data-filter-field="${esc(key)}" data-filter-value="${esc(value)}" href="#/explore?${esc(Q.serialize(params))}" aria-label="按${esc(FIELD_LABELS[key]||key)}筛选：${esc(value)}">筛选${esc(facet?Q.facetLabel(facet,value):value)} →</a>`;
      }).join(""):"";
      return `<div class="schema-field"><dt>${esc(FIELD_LABELS[key] || key)}<code>${esc(key)}</code></dt><dd>${fieldValue(key, fields[key])}${links?`<div class="field-filter-links">${links}</div>`:""}</dd></div>`;
    }).join("");
  }

  function toggleFavorite(angle, r) {
    if (isFavorite(angle, r.id)) workspace.favorites = workspace.favorites.filter((item) => !(item.angle === angle && item.id === r.id));
    else workspace.favorites.unshift({ angle, id: r.id, ktid: r.ktid, title: titleOf(angle, r), date: dateOf(angle, r), savedAt: new Date().toISOString() });
    saveWorkspace();
    return isFavorite(angle, r.id);
  }

  function openRecord(angle, id, context = []) {
    const all = cache[angle] || [];
    const r = all.find((x) => String(x.id) === String(id));
    if (!r) return;
    if (closeModal) closeModal(false);
    const version = routeVersion;
    const previousFocus = document.activeElement;
    const link = safeUrl(r.url || r.original_url || r.content_url || r.source_url || "");
    const keys = [...new Set([...Object.keys(FIELD_LABELS), ...Object.keys(r)])];
    const rows = keys
      .filter((k) => r[k] != null && r[k] !== "" && !LONG_FIELDS.has(k) && !k.startsWith("_"))
      .map((k) => `<dt>${esc(FIELD_LABELS[k] || k)}</dt><dd>${k === "risk_level" ? `<span class="tag clue ${RISK_CLASS[r[k]] || ""}">${esc(r[k])}</span>` : k === "tag" ? `<span class="tag news">${esc(r[k])}</span>` : esc(r[k])}</dd>`).join("");

    const longBlocks = [["content_cn", "正文（中文）"], ["chinese_trans", "中文翻译"], ["summary_cn", "中文摘要"], ["summary_en", "英文摘要"], ["summary", "摘要"], ["risk_desc", "风险描述"], ["original_content", "原始内容"], ["chinese_translation", "中文翻译"]]
      .filter(([k]) => r[k]).map(([k, label]) => `<div class="snippet"><h5>${label}</h5>${esc(r[k])}</div>`).join("");

    const root = $("#modalRoot");
    const position = context.findIndex((entry) => entry.angle === angle && entry.r.id === id);
    root.innerHTML = `<div class="modal-mask"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="recordTitle" tabindex="-1">
      <div class="modal-head"><h3 id="recordTitle">${esc(titleOf(angle, r))}</h3><button class="modal-close" id="modalClose" aria-label="关闭记录详情">×</button></div>
      <div class="modal-body">
        <div class="record-context"><a href="#/institution/${r.ktid}">${esc(instName(r.ktid))}</a><span class="mono">${esc(r.id)}</span></div>
        <div class="r-top" style="margin-bottom:12px">${angleDot(angle)}<span class="tag ${angle}">${esc(ANG[angle].name)}</span>${badgeOf(angle, r)}
          <span class="date" style="margin-left:auto">${esc(day(dateOf(angle, r)) || "时间未标注")}</span></div>
        <div class="modal-tools"><button class="btn" id="favoriteRecord">${isFavorite(angle,id) ? "★ 已收藏" : "☆ 收藏记录"}</button><button class="btn" id="toggleReadRecord">${isRead(angle,id) ? "标为未读" : "标为已读"}</button><button class="btn" id="copyRecordLink">复制记录链接</button>
          <button class="btn" id="downloadRecord">下载记录 CSV</button><button class="btn" id="downloadRecordJson">下载 JSON</button><button class="btn" id="addRecordProject">加入专题</button><a class="btn research-record-link" href="#/evidence?${esc(new URLSearchParams({angle,id:r.id}).toString())}">对照阅读与引用</a><a class="btn research-record-link" href="#/related?${esc(new URLSearchParams({angle,id:r.id}).toString())}">相关材料</a><a class="btn research-record-link" href="#/assistant?${esc(new URLSearchParams({angle,ids:r.ktid,q:titleOf(angle,r).slice(0,160)}).toString())}">基于资料提问</a></div>
        <div class="detail-status" id="detailStatus" role="status">正在加载完整交付字段与正文…</div>
        <label class="empty-toggle" id="emptyToggleWrap" hidden><input type="checkbox" id="showEmptyFields"> 显示未填写字段</label>
        <div id="recordDetails"><dl class="kv">${rows}</dl>${longBlocks}</div>
      </div>
        <div class="modal-actions modal-footer">
          ${link ? `<a class="btn primary" href="${esc(link)}" target="_blank" rel="noopener">打开原文 ↗</a>` : ""}
          <a class="btn" href="#/institution/${r.ktid}" id="modalInst">查看该机构</a>
          ${context.length ? `<button class="btn" id="previousRecord" ${position <= 0 ? "disabled" : ""}>← 上一条</button><span class="hint">${position + 1}/${fmt(context.length)}</span><button class="btn" id="nextRecord" ${position >= context.length - 1 ? "disabled" : ""}>下一条 →</button>` : ""}
          <button class="btn" id="modalClose2">关闭</button>
        </div>
      </div></div>`;

    document.body.classList.add("modal-open");
    const close = (restoreFocus = true) => {
      root.innerHTML = ""; document.removeEventListener("keydown", onKey); document.body.classList.remove("modal-open"); closeModal = null;
      if (restoreFocus) document.dispatchEvent(new CustomEvent("zgclab:readchange"));
      if (restoreFocus && previousFocus && previousFocus.isConnected) previousFocus.focus();
    };
    closeModal = close;
    const onKey = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const targets = [...root.querySelectorAll('a[href],button:not([disabled]),input')].filter((el) => !el.closest("[hidden]"));
        const first = targets[0], last = targets[targets.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement.classList.contains("modal"))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    root.querySelector(".modal-mask").addEventListener("click", (e) => { if (e.target.classList.contains("modal-mask")) close(); });
    $("#modalClose").addEventListener("click", () => close());
    $("#modalClose2").addEventListener("click", () => close());
    $("#modalInst").addEventListener("click", () => close());
    root.querySelector(".modal").addEventListener("click",(event)=>{
      const filterLink=event.target.closest(".field-filter-link");
      if(!filterLink||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
      if(filterLink.hash===location.hash){event.preventDefault();route();}
    });
    $("#favoriteRecord").onclick = (event) => { event.currentTarget.textContent = toggleFavorite(angle, r) ? "★ 已收藏" : "☆ 收藏记录"; };
    $("#toggleReadRecord").onclick = (event) => { markRead([{angle,r}],!isRead(angle,id)); event.currentTarget.textContent=isRead(angle,id)?"标为未读":"标为已读"; };
    $("#copyRecordLink").addEventListener("click", () => copyText(recordLink(angle, r.id), "记录链接已复制"));
    $("#addRecordProject").onclick = () => { close(false);window.ZGCLAB_PROJECTS.addEntries([{angle,r}],researchApi()); };
    root.querySelectorAll(".research-record-link").forEach((a)=>a.addEventListener("click",()=>close(false)));
    let fullRecord = null;
    $("#downloadRecord").addEventListener("click", () => {
      if (fullRecord) {
        const keys = META.schemas[angle];
        downloadCsv(`zgclab-${r.id}.csv`, ["snapshot_id", "数据性质", ...keys], [[r.id, r._simulation?"模拟数据":"真实交付数据", ...keys.map((key) => fullRecord.fields[key] || "")]]);
      } else exportEntries([{ angle, r }], `zgclab-${r.id}.csv`);
    });
    $("#downloadRecordJson").onclick = () => {
      const blob = new Blob([JSON.stringify(fullRecord || r, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob), anchor = document.createElement("a");
      anchor.href = url; anchor.download = `zgclab-${r.id}.json`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    if (context.length) {
      const go = (offset) => { const next = context[position + offset]; if (next) openRecord(next.angle, next.r.id, context); };
      $("#previousRecord").onclick = () => go(-1); $("#nextRecord").onclick = () => go(1);
    }
    root.querySelector(".modal").focus();
    const token = root.querySelector(".modal");
    async function loadFull() {
      try {
        const detail = await ensureDetail(angle, r);
        if (version !== routeVersion || !token.isConnected) return;
        if (!detail) { $("#detailStatus").textContent = "当前数据包仅提供正文节选"; return; }
        fullRecord = detail;
        markRead([{angle,r}],true); $("#toggleReadRecord").textContent = "标为未读";
        const filled = Object.values(detail.fields).filter((value) => value != null && value !== "").length;
        $("#detailStatus").textContent = `已载入完整交付记录 · ${filled}/${META.schemas[angle].length} 个字段有值 · 空字段遵循交付口径`;
        $("#emptyToggleWrap").hidden = false;
        const renderFields = () => { $("#recordDetails").innerHTML = `<dl class="schema-fields">${schemaMarkup(angle, detail.fields, $("#showEmptyFields").checked)}</dl>`; };
        $("#showEmptyFields").onchange = renderFields; renderFields();
      } catch (e) {
        if (version !== routeVersion || !token.isConnected) return;
        $("#detailStatus").innerHTML = `${esc(e.message)} <button class="btn" id="retryDetail">重试</button>`;
        $("#retryDetail").onclick = loadFull;
      }
    }
    loadFull();
  }

  async function viewRecord(angle, id) {
    const version = routeVersion;
    if (!ANGLES.includes(angle)) {
      view.innerHTML = '<div class="empty">记录角度无效。<br><a href="#/explore">返回数据浏览</a></div>';
      return;
    }
    setActive("explore");
    setCrumb(`数据浏览 / <b>${esc(ANG[angle].name)}</b>`);
    view.innerHTML = `<div class="card pad record-route"><a href="#/explore?angle=${encodeURIComponent(angle)}">← 返回数据浏览</a><div class="skeleton">正在打开记录…</div></div>`;
    try {
      await ensure(angle);
      if (version !== routeVersion) return;
      const record = (cache[angle] || []).find((r) => String(r.id) === String(id));
      if (!record) {
        view.querySelector(".skeleton").innerHTML = "记录不存在或已从当前快照移除。";
        return;
      }
      view.innerHTML = `<div class="card pad record-route"><a href="#/explore?angle=${encodeURIComponent(angle)}">← 返回数据浏览</a>
        <div class="record-route-head"><span class="tag ${angle}">${esc(ANG[angle].name)}</span><span class="date">${esc(day(dateOf(angle, record)) || "时间未标注")}</span></div>
        <h1>${esc(titleOf(angle, record))}</h1><p>${esc(instName(record.ktid))} · ktid ${esc(record.ktid)}</p>
        <p class="hint">记录详情已打开。关闭弹窗后可从这里返回数据浏览或查看所属机构。</p></div>`;
      openRecord(angle, id);
    } catch (e) {
      if (version === routeVersion && view.querySelector(".skeleton")) view.querySelector(".skeleton").textContent = "记录加载失败：" + e.message;
    }
  }

  /* ---------- 启动 ---------- */
  function route() {
    routeController.abort(); routeController = new AbortController();
    routeVersion += 1;
    if (closeModal) closeModal(false);
    const r = parseHash();
    if(r.params.get("sim")==="1"&&!simulationEnabled){setSimulation(true);return;}
    const mobileMore=document.querySelector(".mobile-more");if(mobileMore)mobileMore.open=false;
    if(simulationEnabled){const parts=location.hash.split("?");const qs=new URLSearchParams(parts[1]||"");if(qs.get("sim")!=="1"){qs.set("sim","1");history.replaceState(null,"",(parts[0]||"#/overview")+"?"+qs);}}
    if (["projects","assistant","evidence","related","changes","coverage","collection-plan"].includes(r.name)) return viewResearch(r.name,r.params);
    if (["timeline", "quality", "fulltext", "watchlist"].includes(r.name)) {
      setActive(r.name); setCrumb(`<b>${{timeline:"记录时间线",quality:"数据质量",fulltext:"完整正文检索",watchlist:"关注看板"}[r.name]}</b>`);
      return window.ZGCLAB_TOOLS(r.name, r.params, researchApi());
    }
    if (r.name === "workspace") return viewWorkspace();
    if (r.name === "compare") return viewCompare(r.params);
    if (r.name === "record" && r.id && r.extra) return viewRecord(r.id, r.extra);
    if (r.name === "institution" && r.id) return viewInstitution(r.id, r.params);
    if (r.name === "institutions") return viewInstitutions();
    if (r.name === "explore") return viewExplore(r.params);
    if (r.name === "about") return viewAbout();
    return viewOverview();
  }

  $("#snapAt").textContent = META.generated_at.slice(0, 10);
  $("#includeSimulation").onchange=(event)=>setSimulation(event.target.checked);
  $("#globalSearch").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const q = e.target.value.trim();
    location.hash = "#/explore?" + new URLSearchParams({ angle: ALL, ...(q ? { q } : {}) }).toString();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !event.ctrlKey && !event.metaKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && !closeModal) {
      event.preventDefault(); ($("#exQ") || $("#globalSearch")).focus();
    }
  });
  window.addEventListener("hashchange", () => { window.scrollTo({ top: 0 }); route(); });
  if(new URLSearchParams(location.hash.split("?")[1]||"").get("sim")==="1")setSimulation(true);else route();
})();
