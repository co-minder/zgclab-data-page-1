/* ZGCLab 数据展示系统 — 前端（无依赖，数据快照驱动） */
(function () {
  "use strict";

  const META = window.ZGCLAB_META;
  const ANGLES = ["news", "clue", "social"];
  const ANG = META.angles;
  const COLORS = { news: "#f59e0b", clue: "#0ea5e9", social: "#8b5cf6" };
  const RISK_CLASS = { "高": "risk-High", "中": "risk-Mid", "低": "risk-Low" };
  const PAGE = 14;

  const $ = (s) => document.querySelector(s);
  const view = $("#view");
  const crumb = $("#crumb");

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString("zh-CN");
  const instMap = new Map(META.institutions.map((i) => [i.ktid, i]));
  const instName = (ktid) => (instMap.get(ktid) || {}).cn || String(ktid || "");
  const monthOf = (s) => (s || "").slice(0, 7);
  const day = (s) => (s || "").slice(0, 10);
  const val = (r, k) => (r[k] == null ? "" : String(r[k]));

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
    return (r.account_name ? r.account_name + " · " : "") + (r.platform || "社交媒体");
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
    return { name: parts[0] || "overview", id: parts[1], params: new URLSearchParams(qs || "") };
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
  let instFilter = { q: "", type: "全部" };
  function viewInstitutions() {
    setActive("institutions");
    setCrumb("<b>机构库</b>");
    const types = ["全部", ...new Set(META.institutions.map((i) => i.type).filter(Boolean))];
    view.innerHTML = `
      <div class="page-head"><div><span class="kicker">INSTITUTIONS</span><h1>机构库</h1>
        <p>${META.institutions.length} 个验证单位 · 点击查看该机构三个角度的数据</p></div></div>
      <div class="filters">
        <input type="text" id="instQ" placeholder="搜索机构中文名 / 英文名 / ktid" value="${esc(instFilter.q)}">
        ${types.map((t) => `<button class="filter-chip ${t === instFilter.type ? "active" : ""}" data-type="${esc(t)}">${esc(t)}</button>`).join("")}
      </div>
      <div class="inst-grid" id="instGrid"></div>`;

    const q = $("#instQ");
    q.addEventListener("input", () => { instFilter.q = q.value; drawInstGrid(); });
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
    const list = META.institutions.filter((i) => {
      if (instFilter.type !== "全部" && i.type !== instFilter.type) return false;
      if (!q) return true;
      return (i.cn + " " + i.en + " " + i.ktid).toLowerCase().includes(q);
    });
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
        <div class="filters"><input type="text" id="instRecQ" placeholder="在该角度的记录内搜索标题 / 摘要 / 来源"></div>
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
        const list = q ? all.filter((r) => (titleOf(state.angle, r) + " " + snippetOf(state.angle, r) + " " + val(r, "publish_source") + " " + val(r, "publisher_website")).toLowerCase().includes(q)) : all;
        const start = (state.page - 1) * PAGE;
        const slice = list.slice(start, start + PAGE);
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
    draw();
  }

  /* ---------- 视图：数据浏览 ---------- */
  function viewExplore(params) {
    setActive("explore");
    setCrumb("<b>数据浏览</b>");
    const state = {
      angle: ANGLES.includes(params.get("angle")) ? params.get("angle") : "news",
      ktid: params.get("ktid") || "",
      q: params.get("q") || "",
      sub: "",
      page: 1,
    };
    view.innerHTML = `
      <div class="page-head"><div><span class="kicker">EXPLORER</span><h1>数据浏览</h1>
        <p>按角度、机构、关键词筛选三张目标表的真实记录</p></div></div>
      <div class="card pad">
        <div class="tabs" id="exTabs">
          ${ANGLES.map((a) => `<button class="tab ${a === state.angle ? "active" : ""}" data-angle="${a}">${angleDot(a)}${ANG[a].name}<span class="cnt">${fmt(META.totals[a])}</span></button>`).join("")}
        </div>
        <div class="filters">
          <select id="exInst">
            <option value="">全部机构</option>
            ${META.institutions.map((i) => `<option value="${i.ktid}" ${String(i.ktid) === state.ktid ? "selected" : ""}>${esc(i.cn)}</option>`).join("")}
          </select>
          <input type="text" id="exQ" placeholder="搜索标题 / 摘要 / 关键词" value="${esc(state.q)}">
          <select id="exSub"></select>
          <span class="hint" id="exCount" style="color:var(--muted);font-size:12px"></span>
        </div>
        <div class="table-wrap"><table class="data"><thead id="exHead"></thead><tbody id="exBody"></tbody></table></div>
        <div id="exPager"></div>
      </div>`;

    function subOptions() {
      const sel = $("#exSub"); sel.innerHTML = "";
      let items = [];
      if (state.angle === "news") items = Object.keys(META.stats.news.tags || {}).map((k) => ["tag", k, "标签：" + k]);
      else if (state.angle === "clue") items = Object.keys(META.stats.clue.risk_levels || {}).map((k) => ["risk_level", k, "风险：" + k]);
      else items = Object.keys(META.stats.social.platforms || {}).map((k) => ["platform", k, "平台：" + k]);
      sel.innerHTML = `<option value="">全部</option>` + items.map(([f, v, label]) => `<option value="${f}:${esc(v)}">${esc(label)}</option>`).join("");
    }

    function filtered(all) {
      let list = all;
      if (state.ktid) list = list.filter((r) => String(r.ktid) === state.ktid);
      if (state.sub) {
        const i = state.sub.indexOf(":");
        const f = state.sub.slice(0, i), v = state.sub.slice(i + 1);
        list = list.filter((r) => (val(r, f) || (f === "risk_level" ? "未判定" : f === "tag" ? "未分类" : "")) === v);
      }
      const q = state.q.trim().toLowerCase();
      if (q) list = list.filter((r) => (titleOf(state.angle, r) + " " + snippetOf(state.angle, r) + " " + val(r, "keywords") + " " + val(r, "key_words") + " " + val(r, "publish_source") + " " + val(r, "account_name")).toLowerCase().includes(q));
      return list;
    }

    function head() {
      if (state.angle === "news") return `<tr><th>标题</th><th>机构</th><th>来源</th><th>标签</th><th>发布时间</th></tr>`;
      if (state.angle === "clue") return `<tr><th>线索标题</th><th>机构</th><th>风险</th><th>发布者</th><th>发布时间</th></tr>`;
      return `<tr><th>账号 / 内容</th><th>机构</th><th>平台</th><th>互动</th><th>发布时间</th></tr>`;
    }
    function row(angle, r) {
      const t = `<span class="cell-title">${esc(titleOf(angle, r))}</span>`;
      if (angle === "news") return `<tr data-angle="${angle}" data-id="${esc(r.id || "")}"><td>${t}</td><td>${esc(instName(r.ktid))}</td><td class="cell-muted">${esc(val(r, "publish_source") || "—")}</td><td>${r.tag ? `<span class="tag news">${esc(r.tag)}</span>` : "—"}</td><td class="cell-muted">${esc(day(r.publish_time) || "—")}</td></tr>`;
      if (angle === "clue") return `<tr data-angle="${angle}" data-id="${esc(r.id || "")}"><td>${t}</td><td>${esc(instName(r.ktid))}</td><td>${r.risk_level ? `<span class="tag clue ${RISK_CLASS[r.risk_level] || ""}">${esc(r.risk_level)}</span>` : "—"}</td><td class="cell-muted">${esc(val(r, "publisher_type") || "—")}</td><td class="cell-muted">${esc(day(r.publish_time) || "—")}</td></tr>`;
      const engage = [r.like_count && "赞 " + r.like_count, r.comment_count && "评 " + r.comment_count, r.repost_count && "转 " + r.repost_count].filter(Boolean).join(" · ") || "—";
      return `<tr data-angle="${angle}" data-id="${esc(r.id || "")}"><td>${t}</td><td>${esc(instName(r.ktid))}</td><td>${r.platform ? `<span class="tag social">${esc(r.platform)}</span>` : "—"}</td><td class="cell-muted">${esc(engage)}</td><td class="cell-muted">${esc(day(r.publish_time) || "—")}</td></tr>`;
    }

    async function refresh() {
      const body = $("#exBody");
      body.innerHTML = `<tr><td colspan="5"><div class="skeleton">正在加载数据…</div></td></tr>`;
      try {
        const all = await ensure(state.angle);
        const list = filtered(all);
        const start = (state.page - 1) * PAGE;
        const slice = list.slice(start, start + PAGE);
        $("#exHead").innerHTML = head();
        $("#exCount").textContent = `共 ${fmt(list.length)} 条`;
        body.innerHTML = slice.length ? slice.map((r) => row(state.angle, r)).join("") : `<tr><td colspan="5"><div class="empty">没有匹配的记录</div></td></tr>`;
        body.querySelectorAll("tr[data-id]").forEach((tr) => {
          tr.addEventListener("click", () => openRecord(tr.dataset.angle, tr.dataset.id));
        });
        $("#exPager").innerHTML = pager(list.length, state.page, (p) => { state.page = p; refresh(); });
        bindPager($("#exPager"), (p) => { state.page = p; refresh(); });
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
          · 快照生成时间：${esc(META.generated_at.replace("T", " ").slice(0, 19))} UTC；数据包：<span class="mono">${esc(META.source_package.split("/").slice(-1)[0])}</span><br>
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
    const link = r.url || r.original_url || r.content_url || r.source_url || "";
    const rows = Object.keys(FIELD_LABELS)
      .filter((k) => r[k] != null && r[k] !== "" && !LONG_FIELDS.has(k))
      .map((k) => `<dt>${FIELD_LABELS[k]}</dt><dd>${k === "risk_level" ? `<span class="tag clue ${RISK_CLASS[r[k]] || ""}">${esc(r[k])}</span>` : k === "tag" ? `<span class="tag news">${esc(r[k])}</span>` : esc(r[k])}</dd>`).join("");

    const longBlocks = [["content_cn", "正文（中文）"], ["chinese_trans", "中文翻译"], ["summary_cn", "中文摘要"], ["summary", "摘要"], ["original_content", "原始内容"], ["chinese_translation", "中文翻译"]]
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
  }

  /* ---------- 启动 ---------- */
  function route() {
    const r = parseHash();
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
