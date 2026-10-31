/* ZGCLab 数据展示系统 — 前端（无依赖，数据快照驱动） */
(function () {
  "use strict";

  const META = window.ZGCLAB_META;
  const ANGLES = ["news", "clue", "social"];
  const ANG = META.angles;
  const COLORS = { news: "#f59e0b", clue: "#0ea5e9", social: "#8b5cf6" };
  const RISK_CLASS = { "高": "risk-High", "中": "risk-Mid", "低": "risk-Low" };
  const PAGE = 14;
  const ALL = "all";

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

  function safeUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      const u = new URL(raw, location.href);
      return /^https?:$/.test(u.protocol) ? u.href : "";
    } catch (_) {
      return "";
    }
  }

  function recordText(angle, r) {
    return Object.values(r).filter((v) => v != null && v !== "").join(" ") + " " + titleOf(angle, r) + " " + snippetOf(angle, r);
  }

  function timestampOf(angle, r) {
    const raw = dateOf(angle, r);
    const parsed = raw ? Date.parse(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function csvCell(value) {
    return '"' + String(value == null ? "" : value).replace(/"/g, '""').replace(/\r?\n/g, " ") + '"';
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
    URL.revokeObjectURL(url);
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
        document.execCommand("copy");
        input.remove();
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
    return baseUrl() + "#/record/" + encodeURIComponent(angle) + "/" + encodeURIComponent(id);
  }

  function queryLink(params) {
    const qs = new URLSearchParams();
    if (params.angle && params.angle !== "news") qs.set("angle", params.angle);
    if (params.ktid) qs.set("ktid", params.ktid);
    if (params.q) qs.set("q", params.q);
    if (params.sub) qs.set("sub", params.sub);
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    if (params.sort && params.sort !== "newest") qs.set("sort", params.sort);
    return baseUrl() + "#/explore" + (qs.toString() ? "?" + qs.toString() : "");
  }

  function replaceExploreUrl(state) {
    history.replaceState(null, "", queryLink(state));
  }

  /* ---------- 数据懒加载 ---------- */
  const cache = {};
  function ensure(angle) {
    if (cache[angle]) return Promise.resolve(cache[angle]);
    const key = "ZGCLAB_" + angle.toUpperCase();
    if (window[key]) { cache[angle] = window[key]; return Promise.resolve(cache[angle]); }
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "data/" + angle + ".js";
      s.onload = () => { cache[angle] = window[key]; res(cache[angle]); };
      s.onerror = () => rej(new Error("数据文件加载失败：" + s.src));
      document.head.appendChild(s);
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

  function exportEntries(entries, filename) {
    const keys = [];
    const seen = new Set();
    entries.forEach(({ r }) => Object.keys(r).forEach((key) => {
      if (key !== "_month" && !seen.has(key)) { seen.add(key); keys.push(key); }
    }));
    const headers = ["采集角度", "记录ID", "机构", "ktid", ...keys.map((key) => FIELD_LABELS[key] ? `${FIELD_LABELS[key]} (${key})` : key)];
    const rows = entries.map(({ angle, r }) => [
      angleName(angle), r.id || "", instName(r.ktid), r.ktid || "",
      ...keys.map((key) => r[key] == null ? "" : r[key]),
    ]);
    downloadCsv(filename, headers, rows);
  }

  function recCard(angle, r) {
    const snippet = snippetOf(angle, r);
    const src = angle === "news" ? r.publish_source : angle === "clue" ? (r.publisher_website || r.publish_subject) : (r.account_handle || r.content_type);
    return `<article class="rec" data-angle="${angle}" data-id="${esc(r.id || "")}">
      <div class="r-top">${angleDot(angle)}<span class="tag ${angle}">${esc(ANG[angle].name)}</span>${badgeOf(angle, r)}
        <span class="date" style="margin-left:auto">${esc(day(dateOf(angle, r)) || "时间未标注")}</span></div>
      <h4>${esc(titleOf(angle, r))}</h4>
      ${snippet ? `<p>${esc(snippet)}</p>` : ""}
      <div class="r-meta">
        <span>机构 <b>${esc(instName(r.ktid))}</b></span>
        ${src ? `<span>来源 <b>${esc(String(src).slice(0, 46))}</b></span>` : ""}
      </div>
    </article>`;
  }

  function pager(total, page, onGo) {
    const pages = Math.max(1, Math.ceil(total / PAGE));
    if (pages <= 1) return "";
    const cur = Math.min(Math.max(1, page), pages);
    let nums = [];
    const push = (p) => { if (!nums.includes(p) && p >= 1 && p <= pages) nums.push(p); };
    push(1); push(cur - 1); push(cur); push(cur + 1); push(pages);
    nums.sort((a, b) => a - b);
    let btns = "";
    let prev = 0;
    for (const p of nums) {
      if (p - prev > 1) btns += `<span class="pinfo">…</span>`;
      btns += `<button data-p="${p}" class="${p === cur ? "active" : ""}">${p}</button>`;
      prev = p;
    }
    return `<div class="pager">
      <button data-p="${cur - 1}" ${cur <= 1 ? "disabled" : ""}>上一页</button>${btns}<button data-p="${cur + 1}" ${cur >= pages ? "disabled" : ""}>下一页</button>
      <span class="pinfo">共 ${fmt(total)} 条 · 第 ${cur}/${pages} 页</span></div>`;
  }
  function bindPager(root, onGo) {
    root.querySelectorAll(".pager button[data-p]").forEach((b) => {
      b.addEventListener("click", () => onGo(Number(b.dataset.p)));
    });
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
      <text x="100" y="97" text-anchor="middle" font-size="26" font-weight="800" fill="#0f172a">${fmt(total)}</text>
      <text x="100" y="117" text-anchor="middle" font-size="11" fill="#64748b">条入表数据</text></svg>`;
  }

  function hbars(items, color) {
    const max = Math.max(1, ...items.map((i) => i.v));
    return items.map((i) => `<div class="bar-row">
      <span class="bar-label" data-goto="${i.href || ""}" title="${esc(i.label)}">${esc(i.label)}</span>
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
      grid += `<line x1="${pl}" y1="${gy}" x2="${W - pr}" y2="${gy}" stroke="#eef2f7"/>
        <text x="${pl - 7}" y="${gy + 3}" text-anchor="end" font-size="9.5" fill="#94a3b8">${fmt(gv)}</text>`;
    }
    const step = Math.max(1, Math.ceil(months.length / 9));
    let labels = "";
    months.forEach((m, i) => {
      if (i % step === 0 || i === months.length - 1) {
        labels += `<text x="${(pl + i * bw + bw / 2).toFixed(1)}" y="${H - 9}" text-anchor="middle" font-size="9.5" fill="#94a3b8">${m.slice(2)}</text>`;
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
    document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === route));
  }
  function setCrumb(text) { crumb.innerHTML = text; }

  /* ---------- 视图：总览 ---------- */
  function viewOverview() {
    setActive("overview");
    setCrumb("<b>数据总览</b>");
    const total = ANGLES.reduce((s, a) => s + (META.totals[a] || 0), 0);
    const units = META.institutions.length;
    const covered = META.institutions.filter((i) => i.counts.news + i.counts.clue + i.counts.social > 0).length;
    const rank = META.institutions.slice(0, 10).map((i) => ({
      label: i.cn, v: i.counts.news + i.counts.clue + i.counts.social, href: "#/institution/" + i.ktid,
    }));

    const socialPlats = META.stats.social.platforms || {};
    const risk = META.stats.clue.risk_levels || {};
    const tags = META.stats.news.tags || {};
    const platColors = { X: "#1d9bf0", Facebook: "#1877f2", LinkedIn: "#0a66c2" };

    view.innerHTML = `
      <div class="page-head">
        <div><span class="kicker">OVERVIEW</span><h1>数据总览</h1>
          <p>${units} 个验证单位 · 三个采集角度 · 已审核入表的真实交付数据</p></div>
      </div>

      <section class="kpis">
        <div class="kpi"><div class="k-label">验证机构</div><div class="k-value">${units}</div><div class="k-sub">任务总纲默认名单</div></div>
        <div class="kpi"><div class="k-label">采集角度</div><div class="k-value">3</div><div class="k-sub">官网 · 社媒 · 新闻舆情</div></div>
        <div class="kpi"><div class="k-label">入表数据</div><div class="k-value">${fmt(total)}</div><div class="k-sub">舆情 + 线索 + 社媒</div></div>
        <div class="kpi"><div class="k-label">机构覆盖</div><div class="k-value">${Math.round(covered / units * 100)}<small style="font-size:16px">%</small></div><div class="k-sub">${covered}/${units} 单位有数据</div></div>
      </section>

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
          ${hbars(rank, "#2563eb")}
        </div>
      </div></section>

      <section class="section"><div class="card pad">
        <div class="section-head"><h2>入库时间趋势</h2><span class="hint">按发布时间聚合 · 月度</span></div>
        ${trendChart()}
        <div class="legend" style="flex-direction:row;gap:18px;margin-top:6px">
          ${ANGLES.map((a) => `<span class="legend-item" style="width:auto"><span class="dot" style="background:${COLORS[a]}"></span>${ANG[a].name}</span>`).join("")}
        </div>
      </div></section>

      <section class="section"><div class="grid g3">
        <div class="card pad"><div class="section-head"><h2>社媒平台</h2></div>
          ${hbars(Object.entries(socialPlats).map(([k, v]) => ({ label: k, v, color: platColors[k] || "#8b5cf6" })), "#8b5cf6")}
        </div>
        <div class="card pad"><div class="section-head"><h2>线索风险等级</h2></div>
          ${hbars(Object.entries(risk).map(([k, v]) => ({ label: "风险 " + k, v, color: k === "高" ? "#ef4444" : k === "中" ? "#f59e0b" : k === "低" ? "#10b981" : "#94a3b8" })), "#94a3b8")}
        </div>
        <div class="card pad"><div class="section-head"><h2>舆情主题标签</h2></div>
          ${hbars(Object.entries(tags).slice(0, 6).map(([k, v]) => ({ label: k, v, color: "#f59e0b" })), "#f59e0b")}
        </div>
      </div></section>

      <section class="section"><div class="card pad">
        <div class="section-head"><h2>最新入库</h2><span class="hint">跨三个角度的最近记录</span></div>
        <div class="rec-list">
          ${(META.recent || []).map((r) => `<article class="rec" data-angle="${r.angle}" data-ktid="${r.ktid}" data-id="">
            <div class="r-top">${angleDot(r.angle)}<span class="tag ${r.angle}">${esc(ANG[r.angle].name)}</span>
              <span class="date" style="margin-left:auto">${esc(day(r.date) || "—")}</span></div>
            <h4>${esc(r.title || "(无标题)")}</h4>
            ${r.snippet ? `<p>${esc(r.snippet)}</p>` : ""}
            <div class="r-meta"><span>机构 <b>${esc(instName(r.ktid))}</b></span></div>
          </article>`).join("")}
        </div>
      </div></section>`;

    view.querySelectorAll("[data-goto]").forEach((el) => {
      el.addEventListener("click", () => { if (el.dataset.goto) location.hash = el.dataset.goto; });
    });
    view.querySelectorAll(".rec[data-ktid]").forEach((el) => {
      el.addEventListener("click", () => {
        if (el.dataset.id) openRecord(el.dataset.angle, el.dataset.id);
        else location.hash = "#/institution/" + el.dataset.ktid;
      });
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
        <input type="text" id="instQ" placeholder="搜索机构中文名 / 英文名 / ktid" value="${esc(instFilter.q)}">
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
      return `<article class="inst-card" data-ktid="${i.ktid}">
        <div class="ic-head"><h3>${esc(i.cn)}</h3><span class="chip">${esc(i.type || "机构")}</span></div>
        <div class="en">${esc(i.en)}</div>
        <div class="en" style="color:#94a3b8">ktid ${i.ktid} · ${esc(i.country || "")}</div>
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
    });
  }

  /* ---------- 视图：机构详情 ---------- */
  function viewInstitution(ktid) {
    const inst = instMap.get(Number(ktid));
    setActive("institutions");
    if (!inst) { view.innerHTML = '<div class="empty">机构不存在</div>'; return; }
    setCrumb(`机构库 / <b>${esc(inst.cn)}</b>`);

    const state = { angle: "news", q: "", page: 1 };
    view.innerHTML = `
      <div class="page-head" style="align-items:center">
        <div style="flex:1"><a href="#/institutions" style="font-size:12.5px">← 返回机构库</a>
          <h1 style="margin-top:6px">${esc(inst.cn)}</h1>
          <p>${esc(inst.en)} · ktid ${inst.ktid} · ${esc(inst.type || "")} · ${esc(inst.country || "")}${inst.legacy ? " · 历史线索/报告 " + fmt(inst.legacy) : ""}</p></div>
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
        <div class="filters"><input type="text" id="instRecQ" placeholder="在该角度的记录内搜索标题 / 摘要 / 来源">
          <button class="btn" id="exportInstitution">导出当前角度 CSV</button><span class="hint" id="instRecSummary"></span></div>
        <div id="instRecs" class="rec-list"><div class="skeleton">正在加载数据…</div></div>
        <div id="instPager"></div>
      </section>`;

    const recsBox = $("#instRecs"), pagerBox = $("#instPager");
    async function draw() {
      recsBox.innerHTML = '<div class="skeleton">正在加载数据…</div>';
      pagerBox.innerHTML = "";
      try {
        const all = (await ensure(state.angle)).filter((r) => r.ktid === inst.ktid);
        const q = state.q.trim().toLowerCase();
        const list = q ? all.filter((r) => recordText(state.angle, r).toLowerCase().includes(q)) : all;
        const start = (state.page - 1) * PAGE;
        const slice = list.slice(start, start + PAGE);
        $("#instRecSummary").textContent = `筛选结果 ${fmt(list.length)} 条`;
        recsBox.innerHTML = slice.length ? slice.map((r) => recCard(state.angle, r)).join("") : '<div class="empty">该角度暂无可展示的记录</div>';
        pagerBox.innerHTML = pager(list.length, state.page, (p) => { state.page = p; draw(); window.scrollTo({ top: recsBox.offsetTop - 120, behavior: "smooth" }); });
        bindPager(pagerBox, (p) => { state.page = p; draw(); });
        recsBox.querySelectorAll(".rec").forEach((el) => {
          el.addEventListener("click", () => openRecord(el.dataset.angle, el.dataset.id));
        });
      } catch (e) {
        recsBox.innerHTML = '<div class="empty">数据加载失败：' + esc(e.message) + "</div>";
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
    $("#exportInstitution").addEventListener("click", async () => {
      const entries = (await ensure(state.angle)).filter((r) => r.ktid === inst.ktid);
      const q = state.q.trim().toLowerCase();
      const filtered = q ? entries.filter((r) => recordText(state.angle, r).toLowerCase().includes(q)) : entries;
      exportEntries(filtered.map((r) => ({ angle: state.angle, r })), `zgclab-${inst.ktid}-${ANG[state.angle].short}.csv`);
    });
    draw();
  }

  /* ---------- 视图：数据浏览 ---------- */
  function viewExplore(params) {
    setActive("explore");
    setCrumb("<b>数据浏览</b>");
    const state = {
      angle: [ALL, ...ANGLES].includes(params.get("angle")) ? params.get("angle") : "news",
      ktid: params.get("ktid") || "",
      q: params.get("q") || "",
      sub: params.get("sub") || "",
      from: params.get("from") || "",
      to: params.get("to") || "",
      sort: ["newest", "oldest", "relevance"].includes(params.get("sort")) ? params.get("sort") : "newest",
      page: 1,
    };
    view.innerHTML = `
      <div class="page-head"><div><span class="kicker">EXPLORER</span><h1>数据浏览</h1>
        <p>按角度、机构、关键词、标签、时间组合筛选三张目标表的真实记录</p></div>
        <div class="page-actions"><button class="btn" id="copyQuery">复制当前查询链接</button><button class="btn primary" id="exportResults">导出筛选结果 CSV</button></div></div>
      <div class="card pad">
        <div class="tabs" id="exTabs">
          <button class="tab ${state.angle === ALL ? "active" : ""}" data-angle="${ALL}"><span class="dot" style="background:var(--accent)"></span>全部数据<span class="cnt">${fmt(ANGLES.reduce((s, a) => s + META.totals[a], 0))}</span></button>
          ${ANGLES.map((a) => `<button class="tab ${a === state.angle ? "active" : ""}" data-angle="${a}">${angleDot(a)}${ANG[a].name}<span class="cnt">${fmt(META.totals[a])}</span></button>`).join("")}
        </div>
        <div class="filters explorer-filters">
          <select id="exInst">
            <option value="">全部机构</option>
            ${META.institutions.map((i) => `<option value="${i.ktid}" ${String(i.ktid) === state.ktid ? "selected" : ""}>${esc(i.cn)}</option>`).join("")}
          </select>
          <input type="text" id="exQ" placeholder="搜索标题 / 摘要 / 正文 / 关键词 / 来源" value="${esc(state.q)}">
          <select id="exSub"></select>
          <label class="date-filter">从 <input type="date" id="exFrom" value="${esc(state.from)}"></label>
          <label class="date-filter">至 <input type="date" id="exTo" value="${esc(state.to)}"></label>
          <select id="exSort" aria-label="结果排序">
            <option value="newest" ${state.sort === "newest" ? "selected" : ""}>按时间最新</option>
            <option value="oldest" ${state.sort === "oldest" ? "selected" : ""}>按时间最早</option>
            <option value="relevance" ${state.sort === "relevance" ? "selected" : ""}>按关键词相关度</option>
          </select>
          <button class="filter-chip" id="clearExplore">清除筛选</button>
        </div>
        <div class="result-bar"><span id="exCount" class="result-count"></span><span class="hint">点击任意行查看完整字段与原文依据</span></div>
        <div class="table-wrap"><table class="data"><thead id="exHead"></thead><tbody id="exBody"></tbody></table></div>
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
      const q = state.q.trim().toLowerCase();
      if (q) list = list.filter(({ angle, r }) => recordText(angle, r).toLowerCase().includes(q));
      if (state.from) list = list.filter(({ angle, r }) => !day(dateOf(angle, r)) || day(dateOf(angle, r)) >= state.from);
      if (state.to) list = list.filter(({ angle, r }) => !day(dateOf(angle, r)) || day(dateOf(angle, r)) <= state.to);
      list = [...list].sort((a, b) => {
        if (state.sort === "relevance" && q) {
          const score = (entry) => {
            const text = recordText(entry.angle, entry.r).toLowerCase();
            return (text.match(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
          };
          return score(b) - score(a) || timestampOf(b.angle, b.r) - timestampOf(a.angle, a.r);
        }
        const direction = state.sort === "oldest" ? 1 : -1;
        return direction * (timestampOf(a.angle, a.r) - timestampOf(b.angle, b.r));
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
      const body = $("#exBody");
      body.innerHTML = `<tr><td colspan="5"><div class="skeleton">正在加载数据…</div></td></tr>`;
      try {
        const all = await entriesFor(state.angle);
        const list = filtered(all);
        const start = (state.page - 1) * PAGE;
        const slice = list.slice(start, start + PAGE);
        $("#exHead").innerHTML = head();
        $("#exCount").textContent = `筛选结果 ${fmt(list.length)} 条 · 当前显示 ${slice.length} 条`;
        body.innerHTML = slice.length ? slice.map(({ angle, r }) => row(angle, r)).join("") : `<tr><td colspan="5"><div class="empty">没有匹配的记录，请调整筛选条件</div></td></tr>`;
        body.querySelectorAll("tr[data-id]").forEach((tr) => {
          tr.addEventListener("click", () => openRecord(tr.dataset.angle, tr.dataset.id));
        });
        $("#exPager").innerHTML = pager(list.length, state.page, (p) => { state.page = p; refresh(); });
        bindPager($("#exPager"), (p) => { state.page = p; refresh(); });
        $("#exportResults").onclick = () => exportEntries(list, `zgclab-${state.angle === ALL ? "全部" : ANG[state.angle].short}-筛选结果.csv`);
        replaceExploreUrl(state);
      } catch (e) {
        body.innerHTML = `<tr><td colspan="5"><div class="empty">加载失败：${esc(e.message)}</div></td></tr>`;
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
    $("#exQ").addEventListener("input", (e) => { state.q = e.target.value; state.page = 1; refresh(); });
    $("#exSub").addEventListener("change", (e) => { state.sub = e.target.value; state.page = 1; refresh(); });
    $("#exFrom").addEventListener("change", (e) => { state.from = e.target.value; state.page = 1; refresh(); });
    $("#exTo").addEventListener("change", (e) => { state.to = e.target.value; state.page = 1; refresh(); });
    $("#exSort").addEventListener("change", (e) => { state.sort = e.target.value; state.page = 1; refresh(); });
    $("#clearExplore").addEventListener("click", () => {
      state.ktid = ""; state.q = ""; state.sub = ""; state.from = ""; state.to = ""; state.sort = "newest"; state.page = 1;
      $("#exInst").value = ""; $("#exQ").value = ""; $("#exFrom").value = ""; $("#exTo").value = ""; $("#exSort").value = "newest";
      subOptions(); refresh();
    });
    $("#copyQuery").addEventListener("click", () => copyText(queryLink(state), "查询链接已复制"));
    $("#globalSearch").value = state.q;
    subOptions();
    refresh();
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
          · 本页面为需求 1 的本地数据展示系统，数据来自已审核入表的交付快照，共 <b>${fmt(total)}</b> 条记录。<br>
          · 快照生成时间：${esc(META.generated_at.replace("T", " ").slice(0, 19))} UTC；数据包：<span class="mono">${esc(String(META.source_package).split("/").slice(-1)[0])}</span><br>
          · 交付口径：系统字段（主键、创建/修改时间、删除标记等）由接收系统生成，不计入采集方未完成；无法确认的字段留空，不写占位词。<br>
          · 当前展示仅覆盖 20 个验证单位，不代表历史全量；20 家名单用于本阶段练习、回归与验证。
        </div>
      </section>`;

    view.querySelectorAll("tr[data-ktid]").forEach((tr) => {
      tr.addEventListener("click", () => { location.hash = "#/institution/" + tr.dataset.ktid; });
    });
  }

  /* ---------- 记录详情弹窗 ---------- */
  const FIELD_LABELS = {
    id: "快照记录 ID", ktid: "机构 ktid",
    title_cn: "中文标题", title_en: "英文标题", summary_cn: "中文摘要", summary_en: "英文摘要",
    tag: "主题标签", founddate: "发现时间", url: "新闻地址", publish_source: "发布来源", publish_time: "发布时间",
    content_cn: "正文（中文）",
    title: "标题", summary: "摘要", risk_level: "风险等级", risk_desc: "风险描述", publish_channel: "发布渠道",
    publish_subject: "发布主体", industry: "所属行业", discovery_time: "发现时间", language: "语言",
    key_words: "关键词", original_url: "原文地址", publisher_website: "发布者网站", publisher_type: "发布者类型",
    publisher_business: "发布者业务", publisher_cn_attitude: "对华态度", chinese_trans: "中文翻译", source: "来源",
    platform: "平台", account_name: "账号名称", account_handle: "账号 handle", account_url: "账号主页",
    content_type: "内容类型", content_url: "内容链接", original_content: "原始内容", chinese_translation: "中文翻译",
    collected_time: "采集时间", keywords: "关键词", mentions: "提及账号", hashtags: "话题标签",
    like_count: "点赞数", comment_count: "评论数", repost_count: "转发数", view_count: "浏览数", source_url: "数据依据 URL",
  };
  const LONG_FIELDS = new Set(["content_cn", "original_content", "chinese_trans", "summary_cn", "summary_en", "summary", "chinese_translation", "risk_desc"]);

  function openRecord(angle, id) {
    const all = cache[angle] || [];
    const r = all.find((x) => String(x.id) === String(id));
    if (!r) return;
    const link = safeUrl(r.url || r.original_url || r.content_url || r.source_url || "");
    const keys = [...new Set([...Object.keys(FIELD_LABELS), ...Object.keys(r)])];
    const rows = keys
      .filter((k) => r[k] != null && r[k] !== "" && !LONG_FIELDS.has(k) && k !== "_month")
      .map((k) => `<dt>${esc(FIELD_LABELS[k] || k)}</dt><dd>${k === "risk_level" ? `<span class="tag clue ${RISK_CLASS[r[k]] || ""}">${esc(r[k])}</span>` : k === "tag" ? `<span class="tag news">${esc(r[k])}</span>` : esc(r[k])}</dd>`).join("");

    const longBlocks = [["content_cn", "正文（中文）"], ["chinese_trans", "中文翻译"], ["summary_cn", "中文摘要"], ["summary_en", "英文摘要"], ["summary", "摘要"], ["risk_desc", "风险描述"], ["original_content", "原始内容"], ["chinese_translation", "中文翻译"]]
      .filter(([k]) => r[k]).map(([k, label]) => `<div class="snippet"><h5>${label}</h5>${esc(r[k])}</div>`).join("");

    const root = $("#modalRoot");
    root.innerHTML = `<div class="modal-mask"><div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${esc(titleOf(angle, r))}</h3><button class="modal-close" id="modalClose">×</button></div>
      <div class="modal-body">
        <div class="r-top" style="margin-bottom:12px">${angleDot(angle)}<span class="tag ${angle}">${esc(ANG[angle].name)}</span>${badgeOf(angle, r)}
          <span class="date" style="margin-left:auto">${esc(day(dateOf(angle, r)) || "时间未标注")}</span></div>
        <dl class="kv">${rows}</dl>
        ${longBlocks}
        <div class="modal-actions">
          ${link ? `<a class="btn primary" href="${esc(link)}" target="_blank" rel="noopener">打开原文 ↗</a>` : ""}
          <button class="btn" id="copyRecordLink">复制记录链接</button>
          <button class="btn" id="downloadRecord">下载当前记录 CSV</button>
          <a class="btn" href="#/institution/${r.ktid}" id="modalInst">查看该机构</a>
          <button class="btn" id="modalClose2">关闭</button>
        </div>
      </div></div></div>`;

    const close = () => { root.innerHTML = ""; document.removeEventListener("keydown", onKey); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    root.querySelector(".modal-mask").addEventListener("click", (e) => { if (e.target.classList.contains("modal-mask")) close(); });
    $("#modalClose").addEventListener("click", close);
    $("#modalClose2").addEventListener("click", close);
    $("#modalInst").addEventListener("click", close);
    $("#copyRecordLink").addEventListener("click", () => copyText(recordLink(angle, r.id), "记录链接已复制"));
    $("#downloadRecord").addEventListener("click", () => exportEntries([{ angle, r }], `zgclab-${angle}-${r.id}.csv`));
  }

  async function viewRecord(angle, id) {
    if (!ANGLES.includes(angle)) {
      view.innerHTML = '<div class="empty">记录角度无效。<br><a href="#/explore">返回数据浏览</a></div>';
      return;
    }
    setActive("explore");
    setCrumb(`数据浏览 / <b>${esc(ANG[angle].name)}</b>`);
    view.innerHTML = `<div class="card pad record-route"><a href="#/explore?angle=${encodeURIComponent(angle)}">← 返回数据浏览</a><div class="skeleton">正在打开记录…</div></div>`;
    try {
      await ensure(angle);
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
      view.querySelector(".skeleton").textContent = "记录加载失败：" + e.message;
    }
  }

  /* ---------- 启动 ---------- */
  function route() {
    const r = parseHash();
    if (r.name === "record" && r.id && r.extra) return viewRecord(r.id, r.extra);
    if (r.name === "institution" && r.id) return viewInstitution(r.id);
    if (r.name === "institutions") return viewInstitutions();
    if (r.name === "explore") return viewExplore(r.params);
    if (r.name === "about") return viewAbout();
    return viewOverview();
  }

  $("#snapAt").textContent = META.generated_at.slice(0, 10);
  $("#globalSearch").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const q = e.target.value.trim();
    location.hash = "#/explore?" + new URLSearchParams(q ? { q } : {}).toString();
  });
  window.addEventListener("hashchange", () => { window.scrollTo({ top: 0 }); route(); });
  route();
})();
