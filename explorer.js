/* The business query workspace; all statistics refer to the current snapshot. */
(function () {
  "use strict";
  window.ZGCLAB_EXPLORER = function (params, api) {
    const Q = window.ZGCLAB_QUERY;
    const { META, view, esc, fmt, entriesFor, recCard, bindRecords, pager, bindPager, exportEntries, copyText, showToast, workspace, saveWorkspace, isRead, markRead } = api;
    const $ = (selector) => view.querySelector(selector);
    const instMap = new Map(META.institutions.map((i) => [i.ktid, i]));
    const instName = (id) => (instMap.get(Number(id)) || {}).cn || id;
    const state = Q.parse(params);
    state.sim = META.simulation ? "1" : "";
    state.version = state.version || META.version;
    state.ids = state.ids.filter((id) => instMap.has(Number(id)));
    const metrics = { like_count: "点赞", comment_count: "评论", repost_count: "转发", view_count: "浏览", engagement: "互动合计" };
    let request = 0, timer, current = [], customDates = !!(state.from || state.to);
    const alive = () => api.version === api.currentVersion() && view.contains($("#exBody"));
    const href = () => location.href.split("#")[0] + "#/explore?" + Q.serialize(state);
    const options = (values, value) => values.map(([key, label]) => `<option value="${esc(key)}" ${String(key) === String(value) ? "selected" : ""}>${esc(label)}</option>`).join("");
    const types = [...new Set(META.institutions.map((i) => i.type))];
    const countries = [...new Set(META.institutions.map((i) => i.country))];
    const filters = {
      ids: { label: "机构", empty: "全部机构", angles: ["news","clue","social"] },
      type: { label: "机构类型", single: true, angles: ["news","clue","social"] },
      country: { label: "国家", single: true, angles: ["news","clue","social"] },
      platforms: { label: "社媒平台", angles: ["social"] },
      risks: { label: "线索风险", angles: ["clue"] },
      tags: { label: "新闻标签", angles: ["news"] },
      ...Q.FACETS,
      account: { label: "精确账号", single: true, angles: ["social"] },
      translation: { label: "中文正文 / 翻译", single: true, angles: ["news","clue","social"] },
      media: { label: "媒体 / 附件", single: true, angles: ["news","clue","social"] },
      missing: { label: "缺失字段", single: true, angles: ["news","clue","social"] },
    };
    const selections = (key) => Array.isArray(state[key]) ? state[key] : state[key] ? [state[key]] : [];
    const filterLabel = (key,value) => key === "ids" ? instName(value) : Q.FACETS[key] ? Q.facetLabel(key,value) : (facetCatalog.get(key)||[]).find((item)=>item.value===value)?.label || value;
    let facetScope = "", facetCatalog = new Map(), facetEntries = [];
    const facetSearch = new Map(), facetLimits = new Map();
    const filterIDs = {ids:"exInst",type:"exType",country:"exCountry",platforms:"platformChoices",risks:"riskChoices",tags:"tagChoices",account:"exAccount",translation:"exTranslation",media:"exMedia",missing:"exMissing"};
    const facetMarkup = (keys) => keys.map((key) => {
      const descriptor=filters[key];
      return `<details class="field-facet" data-facet-panel="${key}" ${filterIDs[key]?`id="${filterIDs[key]}"`:""}><summary aria-label="${esc(descriptor.label)}筛选"><span class="facet-name">${esc(descriptor.label)}</span><span class="facet-preview" data-facet-preview="${key}">${esc(descriptor.empty||"不限")}</span><span class="facet-selected" data-facet-selected="${key}" hidden></span><span class="facet-chevron" aria-hidden="true">⌄</span></summary><div class="field-facet-body" role="group" aria-label="${esc(descriptor.label)}选项"><div class="facet-panel-head"><b>${esc(descriptor.label)}</b><button type="button" class="text-button" data-facet-clear="${key}">清空</button><button type="button" class="facet-close" data-facet-close="${key}" aria-label="关闭${esc(descriptor.label)}筛选">×</button></div><input type="search" data-facet-search="${key}" aria-label="搜索${esc(descriptor.label)}" placeholder="搜索${esc(descriptor.label)}" autocomplete="off"><div class="facet-choice-list" data-facet-options="${key}"></div><button type="button" class="text-button facet-more" data-facet-more="${key}" hidden>显示更多选项</button><div class="facet-panel-foot"><span>${descriptor.single?"单选 · 自动生效":"可多选 · 任一匹配"}</span><button type="button" class="text-button" data-facet-close="${key}">完成</button></div>${descriptor.help?`<span class="facet-help" title="${esc(descriptor.help)}">${esc(descriptor.help)}</span>`:""}</div></details>`;
    }).join("");
    view.innerHTML = `
      <div class="explorer-workspace">
      <div class="page-head explore-head"><h1>数据浏览</h1><div class="page-actions"><button class="btn" id="saveQuery">保存查询</button><button class="btn" id="copyQuery">复制链接</button><button class="btn" id="createBrief" disabled>生成简报</button><button class="btn primary" id="exportResults" disabled>导出 CSV</button></div></div>
      <section class="card explore-card">
        <div class="explore-scope-row">
        <div class="tabs" id="exTabs">${["all", "news", "clue", "social"].map((angle) => `<button class="tab ${state.angle === angle ? "active" : ""}" data-angle="${angle}"><span class="dot" style="background:var(--${angle === "all" ? "accent" : angle})"></span>${angle === "all" ? "全部数据" : META.angles[angle].name}<span class="cnt">${fmt(angle === "all" ? Object.values(META.totals).reduce((s,v) => s+v,0) : META.totals[angle])}</span></button>`).join("")}</div>
        <button class="text-button" id="toggleFilters" aria-controls="exFilterControls" aria-expanded="true">收起筛选</button></div>
        <div id="exFilterControls">
        <div class="query-form-grid basic-query">
          <label class="keyword-control"><span class="sr-only">关键词</span><input id="exQ" type="search" aria-label="查询关键词" placeholder="搜索关键词、&quot;完整短语&quot;、-排除词" value="${esc(state.q)}"></label>
          ${facetMarkup(["ids"])}
          <label class="inline-select"><span>时间</span><select id="exPeriod" aria-label="时间范围">${options([["all","全部日期"],["today","今天"],["7","近 7 天"],["30","近 30 天"],["custom","指定日期"]],state.period === "custom" && !state.from && !state.to ? "all" : state.period)}</select></label>
        </div>
        <div class="query-form-grid custom-dates" id="exCustomDates" hidden><label>开始日期<input type="date" id="exFrom" value="${esc(state.from)}"></label><label>结束日期<input type="date" id="exTo" value="${esc(state.to)}"></label></div>
        <details class="more-filters" id="exMoreFilters"><summary><span>更多筛选 <span id="moreFilterCount" class="facet-count" hidden></span></span><span class="hint">分类、标签与数值</span></summary>
        <div class="filter-grid" id="exFieldFilters" aria-label="分类筛选">${facetMarkup(["type","country","platforms","risks","tags",...Object.keys(Q.FACETS)])}</div>
        <div class="extra-filter-bar"><details class="query-shortcuts"><summary>常用查询</summary><div class="query-presets"><button data-preset="risk">高风险线索</button><button data-preset="company">企业类信息</button><button data-preset="ngo">NGO / 智库信息</button><button data-preset="popular">X 点赞 ≥ 100</button></div></details><details class="query-extra" id="exAdvanced"><summary>更多条件与互动数值</summary>
          <div class="extra-controls"><div class="filter-grid">${facetMarkup(["account","translation","media","missing"])}</div>
          <div class="query-form-grid query-preferences"><label class="inline-select"><span>词语匹配</span><select id="exMode" aria-label="关键词匹配方式">${options([["all","全部词"],["any","任一词"]],state.mode)}</select></label><label class="inline-select"><span>时间口径</span><select id="exDateField" aria-label="时间口径">${options([["published","发布时间"],["collected","采集时间（社媒）"],["discovered","发现时间（官网）"],["found","发现时间（新闻）"],["record","记录时间（允许回退）"]],state.dateField)}</select></label><label class="source-keyword"><span class="sr-only">来源关键词</span><input id="exSource" type="text" aria-label="来源或账号关键词" placeholder="来源、域名或账号模糊搜索" value="${esc(state.source)}"></label></div>
          <div class="metric-filters" id="exMetricFilters">${Q.METRICS.map((name) => `<label>${metrics[name]}<div class="number-range"><input type="number" min="0" step="any" data-bound="${name}Min" aria-label="${metrics[name]}下限" placeholder="最低" value="${esc(state[name+"Min"])}"><span>—</span><input type="number" min="0" step="any" data-bound="${name}Max" aria-label="${metrics[name]}上限" placeholder="最高" value="${esc(state[name+"Max"])}"></div></label>`).join("")}</div>
          </div></details><details class="query-guide"><summary>筛选说明</summary><p>同字段多选任一匹配，不同字段同时满足。选项数量按当前角度、机构、类型和国家计数。关键词查标题、摘要、正文节选及机构名，支持双引号和减号排除。时间按北京时间，数值门槛包含边界，缺失指标不当作 0。</p></details></div>
        </details></div>
        <div id="exError" class="inline-error" role="alert" hidden></div>
        <div id="exCondition" class="active-conditions" aria-label="已选筛选条件" hidden></div>
        <div class="query-results-tools"><span id="exCount" class="result-count" role="status" aria-live="polite"></span><label><span class="sr-only">阅读状态</span><select id="exRead" aria-label="阅读状态">${options([["","全部阅读状态"],["unread","只看未读"],["read","只看已读"]],state.read)}</select></label><label><span class="sr-only">排序</span><select id="exSort" aria-label="排序">${options([["newest","时间最新"],["oldest","时间最早"],["relevance","关键词相关度"], ...Q.METRICS.map((m) => [m,metrics[m]+"从高到低"])],state.sort)}</select></label><label><span class="sr-only">结果上限</span><select id="exLimit" aria-label="结果上限">${options([[0,"全部结果"],[10,"前 10 条"],[20,"前 20 条"],[50,"前 50 条"]],state.limit)}</select></label><label><span class="sr-only">每页记录数</span><select id="exSize" aria-label="每页记录数">${options([14,25,50,100].map((size) => [size,size+" 条 / 页"]),state.size)}</select></label><button class="text-button" id="markResultsRead" disabled>标记已读</button></div>
        <div id="exBreakdown" class="query-breakdown"></div><div class="table-wrap explorer-table"><table class="data"><thead id="exHead"></thead><tbody id="exBody"></tbody></table></div><div class="mobile-results rec-list" id="exCards"></div><div id="exPager"></div>
        <details class="query-notes" id="exNotes"><summary>数据范围与时间口径说明</summary><div id="exCoverage" class="coverage-note" role="status"></div></details>
      </section>
      <details class="section card pad query-analysis"><summary>当前结果分析 <span class="hint">展开查看分布、排行与对比</span></summary><div id="exAnalytics"></div></details>
      <section id="briefPanel" class="section card pad" hidden><div class="section-head"><h2>观察简报草稿</h2><button class="btn" id="downloadBrief">下载 Markdown</button></div><p class="hint">事实清单，按当前结果顺序摘录前 20 条，未自动判断重要性或风险走向；可编辑后下载。</p><textarea id="briefText" aria-label="观察简报草稿" rows="15"></textarea></section></div>`;

    function summary() {
      const parts = [state.angle === "all" ? "全部角度" : META.angles[state.angle].name];
      if (state.type) parts.push(state.type);
      if (state.country) parts.push(state.country);
      if (state.ids.length) parts.push(state.ids.map(instName).join("、"));
      for (const [field,label] of [["platforms","平台"],["risks","风险"],["tags","标签"]]) if (state[field].length) parts.push(label+"："+state[field].join(" / "));
      if (state.q) parts.push("关键词："+state.q);
      if (state.source) parts.push("来源："+state.source);
      const range = Q.dateRange(state);
      const period = { today:"今天",7:"近 7 天",30:"近 30 天" }[state.period];
      if (range.from || range.to) parts.push(`${period || "指定日期"} ${range.from || "不限"} 至 ${range.to || "不限"}`);
      parts.push({published:"发布时间",collected:"采集时间",discovered:"官网发现时间",found:"新闻发现时间",record:"记录时间（允许回退）"}[state.dateField]);
      for (const name of Q.METRICS) {
        if (state[name+"Min"] !== "") parts.push(metrics[name]+" ≥ "+state[name+"Min"]);
        if (state[name+"Max"] !== "") parts.push(metrics[name]+" ≤ "+state[name+"Max"]);
      }
      if (state.account) parts.push("账号："+state.account);
      for (const [key, descriptor] of Object.entries(Q.FACETS)) if (state[key].length) parts.push(descriptor.label+"："+state[key].map((v)=>Q.facetLabel(key,v)).join(" / "));
      if (state.translation) parts.push(state.translation === "yes" ? "有中文正文 / 翻译" : "缺中文正文 / 翻译");
      if (state.media) parts.push("附件："+state.media);
      if (state.missing) parts.push("缺失字段："+state.missing);
      if (state.limit) parts.push("前 "+state.limit+" 条");
      if (state.read) parts.push(state.read === "read" ? "只看已读" : "只看未读");
      if (state.sim) parts.push("包含模拟数据（仅供测试）");
      return parts.join(" · ");
    }
    function sync() {
      for (const [id,key] of [["exQ","q"],["exMode","mode"],["exSource","source"],["exDateField","dateField"],["exSort","sort"],["exLimit","limit"],["exSize","size"],["exRead","read"]]) $("#"+id).value = state[key];
      const range = Q.dateRange(state), rolling = state.period !== "custom";
      $("#exFrom").value = range.from; $("#exTo").value = range.to;
      $("#exFrom").disabled = rolling; $("#exTo").disabled = rolling;
      $("#exPeriod").value = rolling ? state.period : customDates || state.from || state.to ? "custom" : "all";
      $("#exCustomDates").hidden = rolling || !customDates && !state.from && !state.to;
      const moreCount = [state.type,state.country,state.source,state.mode === "any",state.ids.length > 1,state.platforms.length,state.risks.length,state.tags.length,state.account,state.translation,state.media,state.missing,state.dateField !== "published",...Object.keys(Q.FACETS).map((key)=>state[key].length),...Q.METRICS.map((name) => state[name+"Min"]!==""||state[name+"Max"]!=="")].filter(Boolean).length;
      $("#moreFilterCount").hidden = !moreCount; $("#moreFilterCount").textContent = `已选 ${moreCount} 项`;
      view.querySelectorAll("[data-bound]").forEach((input) => { input.value = state[input.dataset.bound]; });
      view.querySelectorAll("#exTabs .tab").forEach((button) => button.classList.toggle("active",button.dataset.angle === state.angle));
      $("#exMetricFilters").hidden = !["all","social"].includes(state.angle);
      view.querySelectorAll("[data-facet-panel]").forEach((panel)=>{
        const key=panel.dataset.facetPanel,descriptor=filters[key],chosen=selections(key);
        panel.hidden=state.angle!=="all"&&!descriptor.angles.includes(state.angle);
        if(panel.hidden)panel.open=false;
        const preview=panel.querySelector("[data-facet-preview]"),badge=panel.querySelector("[data-facet-selected]");
        preview.textContent=chosen.length ? filterLabel(key,chosen[0]) : descriptor.empty||"不限";
        preview.title=chosen.map((value)=>filterLabel(key,value)).join("、");
        badge.hidden=chosen.length<2;badge.textContent=chosen.length>1?`+${chosen.length-1}`:"";
        panel.classList.toggle("has-selection",!!chosen.length);
        panel.querySelector("[data-facet-clear]").disabled=!chosen.length;
      });
      renderConditions();
    }
    function renderConditions() {
      const chips=[];
      const add=(key,value,label)=>chips.push(`<button type="button" class="condition-chip" data-remove-filter="${key}" ${value==null?"":`data-remove-value="${esc(value)}"`} aria-label="移除${esc(label)}"><span>${esc(label)}</span><span aria-hidden="true">×</span></button>`);
      for(const [key,descriptor] of Object.entries(filters))for(const value of selections(key))add(key,value,`${descriptor.label}：${filterLabel(key,value)}`);
      if(state.q)add("q",null,"关键词："+state.q);
      if(state.source)add("source",null,"来源关键词："+state.source);
      if(state.mode==="any")add("mode",null,"任一关键词");
      const range=Q.dateRange(state);
      if(range.from||range.to)add("dates",null,({today:"今天",7:"近 7 天",30:"近 30 天"})[state.period]||`${range.from||"不限"} 至 ${range.to||"不限"}`);
      if(state.dateField!=="published")add("dateField",null,({collected:"采集时间",discovered:"官网发现时间",found:"新闻发现时间",record:"记录时间"})[state.dateField]);
      for(const metric of Q.METRICS)for(const suffix of ["Min","Max"])if(state[metric+suffix]!=="")add(metric+suffix,null,metrics[metric]+(suffix==="Min"?" ≥ ":" ≤ ")+state[metric+suffix]);
      if(state.read)add("read",null,state.read==="read"?"只看已读":"只看未读");
      if(state.limit)add("limit",null,"前 "+state.limit+" 条");
      $("#exCondition").hidden=!chips.length;
      $("#exCondition").innerHTML=chips.join("")+(chips.length?'<button type="button" class="text-button clear-filters" id="clearExplore">清除全部</button>':"");
    }
    function positionFacet(panel) {
      if(!panel.open||panel.hidden)return;
      const body=panel.querySelector(".field-facet-body"),anchor=panel.querySelector("summary").getBoundingClientRect();
      const width=Math.min(328,innerWidth-24),left=Math.max(12,Math.min(anchor.left,innerWidth-width-12));
      const below=innerHeight-anchor.bottom-12,above=anchor.top-12,up=below<260&&above>below;
      body.style.width=width+"px";body.style.left=left+"px";
      body.style.maxHeight=Math.max(140,Math.min(440,up?above-6:below-6))+"px";
      body.style.top=up?"auto":(anchor.bottom+6)+"px";body.style.bottom=up?(innerHeight-anchor.top+6)+"px":"auto";
    }
    function closeFacets(except) {
      view.querySelectorAll("[data-facet-panel][open]").forEach((panel)=>{if(panel!==except)panel.open=false;});
    }
    function renderFacet(key) {
      const panel=$(`[data-facet-panel="${key}"]`);
      if(panel.hidden)return;
      const chosen=selections(key),selected=new Set(chosen.map((value)=>Q.facetNormalize(key,value)));
      const isSelected=(value)=>selected.has(Q.facetNormalize(key,value));
      let catalog=[...(facetCatalog.get(key)||[])];
      for(const value of chosen)if(!catalog.some((item)=>Q.facetNormalize(key,item.value)===Q.facetNormalize(key,value)))catalog.unshift({value,count:0});
      const search=api.CORE.normalize(facetSearch.get(key)||"");
      const label=(item)=>item.label||filterLabel(key,item.value);
      catalog=catalog.filter((item)=>isSelected(item.value)||!search||api.CORE.normalize(label(item)).includes(search));
      catalog.sort((a,b)=>Number(isSelected(b.value))-Number(isSelected(a.value)));
      const limit=facetLimits.get(key)||30, shown=catalog.slice(0,limit);
      const active=document.activeElement,focusValue=active?.dataset.facetChoice===key?active.value:null;
      panel.querySelector("[data-facet-options]").innerHTML=shown.map((item)=>`<label class="facet-option"><input type="${filters[key].single?"radio":"checkbox"}" name="facet-${key}" data-facet-choice="${key}" value="${esc(item.value)}" ${isSelected(item.value)?"checked":""}><span>${esc(label(item))}</span><small>${item.count==null?"":fmt(item.count)}</small></label>`).join("")||'<p class="hint">没有匹配选项。</p>';
      if(focusValue!=null)[...panel.querySelectorAll("[data-facet-choice]")].find((input)=>input.value===focusValue)?.focus({preventScroll:true});
      const more=panel.querySelector("[data-facet-more]");more.hidden=catalog.length<=shown.length;more.textContent=`显示更多（已显示 ${shown.length}/${catalog.length}）`;
      positionFacet(panel);
    }
    function populateFacets(all) {
      const signature=JSON.stringify([state.angle,state.ids,state.type,state.country]);
      if(signature!==facetScope){
        facetScope=signature;facetEntries=all.filter(({r})=>{const i=instMap.get(r.ktid)||{};return (!state.ids.length||state.ids.includes(String(r.ktid)))&&(!state.type||i.type===state.type)&&(!state.country||i.country===state.country);});
        facetCatalog=new Map(Object.keys(Q.FACETS).map((key)=>[key,Q.facetOptions(facetEntries,key)]));
        const counts=(entries,field,angle)=>{
          const result=new Map();
          for(const entry of entries){if(angle&&entry.angle!==angle)continue;const value=String(field(entry)||"");if(value)result.set(value,(result.get(value)||0)+1);}
          return [...result].map(([value,count])=>({value,count})).sort((a,b)=>b.count-a.count||a.value.localeCompare(b.value));
        };
        const institutionScope=all.filter(({r})=>{const inst=instMap.get(r.ktid)||{};return (!state.type||inst.type===state.type)&&(!state.country||inst.country===state.country);});
        facetCatalog.set("ids",counts(institutionScope,({r})=>r.ktid).map((item)=>({...item,label:instName(item.value)})));
        facetCatalog.set("type",types.map((value)=>({value,count:all.filter(({r})=>(instMap.get(r.ktid)||{}).type===value&&(!state.country||(instMap.get(r.ktid)||{}).country===state.country)).length})));
        facetCatalog.set("country",countries.map((value)=>({value,count:all.filter(({r})=>(instMap.get(r.ktid)||{}).country===value&&(!state.type||(instMap.get(r.ktid)||{}).type===state.type)).length})));
        for(const [key,field,angle,fallback] of [["platforms","platform","social","未提供"],["risks","risk_level","clue","未判定"],["tags","tag","news","未分类"]])facetCatalog.set(key,counts(facetEntries,({r})=>r[field]||fallback,angle));
        facetCatalog.set("account",counts(facetEntries,({r})=>`${r.platform}:${r.account_handle||r.account_name||""}`,"social").map((item)=>({...item,label:item.value.replace(":"," · ")})));
        facetCatalog.set("translation",[{value:"yes",label:"有中文正文 / 翻译",count:facetEntries.filter(({r})=>r._has_translation).length},{value:"missing",label:"有原文，缺中文正文 / 翻译",count:facetEntries.filter(({r})=>r._has_original&&!r._has_translation).length}]);
        facetCatalog.set("media",[["image","包含图片"],["video","包含视频"],["pdf","包含 PDF"],["attachment","包含媒体 / 附件链接"]].map(([value,label])=>({value,label,count:facetEntries.filter(({r})=>(r._media_types||[]).includes(value)).length})));
        facetCatalog.set("missing",[["publish_time","缺少发布时间"],["url","缺少有效原文链接"],["risk","缺少风险等级（官网）"]].map(([value,label])=>({value,label,count:facetEntries.filter(({angle,r})=>value==="publish_time"?!r.publish_time:value==="url"?!api.CORE.safeUrl(Q.sourceLink(r)):angle==="clue"&&!r.risk_level).length})));
      }
      for(const key of Object.keys(filters))renderFacet(key);
      sync();
    }
    function row(angle,r) {
      const counts = angle === "social" ? `<span class="row-metrics">${Object.entries(metrics).map(([key,label]) => { const value=Q.metric(r,key); return `${label} ${value==null ? "未提供" : fmt(value)}`; }).join(" · ")}</span>` : "";
      const badge = angle === "clue" ? r.risk_level || "未判定" : angle === "news" ? r.tag || "未分类" : r.platform || "未提供";
      return `<tr data-angle="${angle}" data-id="${esc(r.id)}"><td><span class="tag ${angle}">${META.angles[angle].name}</span>${r._simulation?'<span class="simulation-badge">模拟数据</span>':""}</td><td><span class="cell-title">${esc(api.titleOf(angle,r))}</span><span class="read-badge">${isRead(angle,r.id) ? "已读" : "未读"}</span>${counts}</td><td>${esc(instName(r.ktid))}</td><td><span class="tag ${angle} ${angle === "clue" ? ({高:"risk-High",中:"risk-Mid",低:"risk-Low"}[r.risk_level]||"") : ""}">${esc(badge)}</span></td><td class="cell-muted">${esc(Q.recordDay(Q.dateValue(r,state.dateField))||"未提供")}</td></tr>`;
    }
    function metricCard(angle,r) {
      const card = recCard(angle,r);
      if (angle !== "social") return card;
      return card.replace("</article>",`<div class="card-metrics">${Object.entries(metrics).slice(0,4).map(([key,label])=>{const value=Q.metric(r,key);return `<span>${label} <b>${value==null?"未提供":fmt(value)}</b></span>`;}).join("")}</div></article>`);
    }
    function drill(field,value) {
      if (field === "institution") state.ids = [value];
      else {
        const target = {platform:["social","platforms"],risk:["clue","risks"],tag:["news","tags"]}[field];
        Q.setAngle(state,target[0]);state[target[1]]=[value];
      }
      state.page=1; sync(); refresh();
    }
    function analytics(entries,all) {
      const cards = [["institution","机构数量排行"],["platform","社媒平台分布"],["risk","线索风险分布"],["tag","新闻标签分布"]].map(([field,label])=>{
        const complete=Q.groups(entries,field),groups=complete.slice(0,field === "institution"?10:20), total=complete.reduce((s,[,n])=>s+n,0);
        return `<div class="analysis-block"><h3>${label}</h3>${groups.length?groups.map(([key,n])=>`<button class="analysis-row" data-group="${field}" data-value="${esc(key)}"><span>${esc(field === "institution"?instName(key):key)}</span><b>${fmt(n)}</b><small>${total?(n/total*100).toFixed(1):0}%</small></button>`).join(""):'<p class="hint">当前结果没有该角度的数据。</p>'}</div>`;
      }).join("");
      const comparison=Q.periodComparison(all,state,instMap);
      const table=Q.groups(entries,"institution").map(([id,n])=>{
        const rows=entries.filter((e)=>String(e.r.ktid)===id&&e.angle==="social");
        return `<tr><td>${esc(instName(id))}</td><td>${n}</td>${["like_count","comment_count","repost_count","view_count"].map((name)=>{const vals=rows.map(({r})=>Q.metric(r,name)).filter((v)=>v!=null);return `<td>${vals.length?fmt(vals.reduce((s,v)=>s+v,0)):"未提供"}<small>${vals.length}/${rows.length} 条有值</small></td>`;}).join("")}</tr>`;
      }).join("");
      $("#exAnalytics").innerHTML=`<div class="analysis-grid">${cards}</div><div class="period-comparison"><h3>最近 7 天与前 7 天</h3><p>${comparison.from} 至 ${comparison.to}：<b>${fmt(comparison.current)}</b> 条；${comparison.previousFrom} 至 ${comparison.previousTo}：<b>${fmt(comparison.previous)}</b> 条；变化 <b>${comparison.change>=0?"+":""}${comparison.change}</b> 条${comparison.percent==null?"（前期为 0，不计算百分比）":`（${comparison.percent>=0?"+":""}${comparison.percent.toFixed(1)}%）`}。</p><p class="hint">按当前时间口径，保留其他筛选；此对比不使用自定义日期与结果上限。基于已有快照，不代表实时监测。</p></div>
        <details class="query-options"><summary>机构互动对比（当前筛选范围）</summary><div class="table-wrap"><table class="data metric-comparison"><thead><tr><th>机构</th><th>记录数</th><th>点赞合计</th><th>评论合计</th><th>转发合计</th><th>浏览合计</th></tr></thead><tbody>${table||'<tr><td colspan="6">没有匹配记录</td></tr>'}</tbody></table></div><p class="hint">每列仅汇总有值的社媒记录，同时显示有效样本数；跨平台数值口径不同，建议先限定平台再比较。</p></details>`;
      $("#exAnalytics").querySelectorAll("[data-group]").forEach((button)=>button.onclick=()=>drill(button.dataset.group,button.dataset.value));
    }
    function coverage(all) {
      const relevant=all.filter(({r})=>{const i=instMap.get(r.ktid)||{};return (!state.ids.length||state.ids.includes(String(r.ktid)))&&(!state.type||state.type===i.type)&&(!state.country||state.country===i.country);});
      const dates=relevant.map(({r})=>Q.recordDay(Q.dateValue(r,state.dateField))).filter(Boolean).sort();
      const missing=relevant.length-dates.length;
      $("#exCoverage").textContent=`历史交付快照 ${META.source_package} · 当前机构范围的可用${$("#exDateField option:checked").textContent}：${dates.length?dates[0]+" 至 "+dates[dates.length-1]:"暂无"} · 时间未提供 ${missing} 条。近期零结果不会自动改为旧日期。`;
      if(state.version!==META.version)$("#exCoverage").textContent+=` 注意：分享链接的数据版本 ${state.version} 与当前版本 ${META.version} 不同，当前显示现有数据，不能视为原版本复现。`;
      if(state.version!==META.version)$("#exNotes").open=true;
    }
    async function refresh() {
      const id=++request;
      $("#exError").hidden=true; $("#exportResults").disabled=true;$("#createBrief").disabled=true;$("#markResultsRead").disabled=true;$("#briefPanel").hidden=true;
      const problem=Q.validate(state);
      if(problem){$("#exError").hidden=false;$("#exError").textContent=problem;$("#exCount").textContent="筛选条件无效";$("#exBody").innerHTML='<tr><td colspan="5"><div class="empty">请调整条件后继续查询</div></td></tr>';$("#exCards").innerHTML='<div class="empty">请调整条件后继续查询</div>';$("#exPager").innerHTML="";$("#exAnalytics").innerHTML="";return;}
      $("#exBody").innerHTML='<tr><td colspan="5"><div class="skeleton">正在加载数据…</div></td></tr>';$("#exCards").innerHTML='<div class="skeleton">正在加载数据…</div>';$("#exCount").textContent="正在查询…";
      try {
        const loaded=await entriesFor(state.angle);
        if(id!==request||!alive())return;
        const all=state.read ? loaded.filter(({angle,r}) => isRead(angle,r.id) === (state.read === "read")) : loaded;
        const result=Q.filter(all,state,instMap);current=result.entries;
        sync();
        state.page=api.CORE.pageNumber(state.page,current.length,state.size);
        const start=(state.page-1)*state.size,slice=current.slice(start,start+state.size);
        $("#exCount").textContent=`筛选结果 ${fmt(current.length)} 条 · ${new Set(current.map(({r})=>r.ktid)).size} 个机构 · 当前显示 ${current.length?start+1:0}–${start+slice.length} 条${state.limit?`（全部匹配 ${fmt(result.matched)} 条，取前 ${state.limit} 条）`:""}`;
        $("#exBreakdown").hidden=state.angle!=="all";
        $("#exBreakdown").innerHTML=["news","clue","social"].map((a)=>`<span class="tag ${a}">${META.angles[a].name} ${fmt(current.filter((e)=>e.angle===a).length)}</span>`).join("");
        $("#exHead").innerHTML='<tr><th>角度</th><th>标题 / 内容与互动值</th><th>机构</th><th>风险 / 标签 / 平台</th><th>所选时间</th></tr>';
        $("#exBody").innerHTML=slice.length?slice.map(({angle,r})=>row(angle,r)).join(""):'<tr><td colspan="5"><div class="empty">没有匹配的记录。可调整日期或条件；当前数据是交付快照。</div></td></tr>';
        $("#exCards").innerHTML=slice.length?slice.map(({angle,r})=>metricCard(angle,r)).join(""):'<div class="empty">没有匹配的记录，请调整日期或条件。</div>';
        bindRecords($("#exBody"),current);bindRecords($("#exCards"),current);
        $("#exPager").innerHTML=pager(current.length,state.page,null,state.size);bindPager($("#exPager"),(page)=>{state.page=page;refresh();});
        $("#exportResults").disabled=!current.length;$("#createBrief").disabled=false;
        $("#markResultsRead").disabled=!current.length;
        coverage(all);populateFacets(loaded);analytics(current,all);
        history.replaceState(null,"",href());
        $("#exCount").dataset.query = Q.serialize(state);
      }catch(failure){
        if(id!==request||!alive())return;
        $("#exCount").textContent="查询未完成";$("#exError").hidden=false;$("#exError").textContent=failure.message;
        $("#exBody").innerHTML='<tr><td colspan="5"><button class="btn" id="retryExplore">重试</button></td></tr>';$("#retryExplore").onclick=refresh;
        $("#exCards").innerHTML='<button class="btn" id="retryMobile">重试</button>';$("#retryMobile").onclick=refresh;
      }
    }
    function changed() {state.sim=META.simulation?"1":"";state.page=1;sync();refresh();}
    const delayed=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(alive())changed();},180);};
    $("#exFilterControls").addEventListener("change",(event)=>{
      const input=event.target;if(!input.matches("[data-facet-choice]"))return;
      const key=input.dataset.facetChoice,descriptor=filters[key];
      if(input.checked){
        if(descriptor.angles.length===1)Q.setAngle(state,descriptor.angles[0]);
        state[key]=descriptor.single?input.value:[...new Set([...state[key],input.value])];
      }else state[key]=descriptor.single?"":state[key].filter((v)=>Q.facetNormalize(key,v)!==Q.facetNormalize(key,input.value));
      if(descriptor.single){input.closest("[data-facet-panel]").open=false;input.closest("[data-facet-panel]").querySelector("summary").focus();}
      changed();
    });
    view.querySelectorAll("[data-facet-panel]").forEach((panel)=>{
      const trigger=panel.querySelector("summary");
      trigger.addEventListener("click",()=>{
        if(!panel.open){closeFacets(panel);positionFacetAfterOpen(panel);}
      });
      panel.addEventListener("toggle",()=>{
        trigger.setAttribute("aria-expanded",String(panel.open));
        if(panel.open){closeFacets(panel);renderFacet(panel.dataset.facetPanel);positionFacet(panel);}
      });
    });
    function positionFacetAfterOpen(panel){requestAnimationFrame(()=>{if(alive()&&panel.open)positionFacet(panel);});}
    document.addEventListener("pointerdown",(event)=>{if(!event.target.closest("[data-facet-panel]"))closeFacets();},{signal:api.signal});
    document.addEventListener("keydown",(event)=>{
      if(event.key!=="Escape")return;
      const open=view.querySelector("[data-facet-panel][open]");
      if(open){event.preventDefault();closeFacets();open.querySelector("summary").focus();}
    },{signal:api.signal});
    window.addEventListener("resize",()=>view.querySelectorAll("[data-facet-panel][open]").forEach(positionFacet),{signal:api.signal});
    document.addEventListener("scroll",(event)=>{
      if(event.target instanceof Element&&event.target.closest(".field-facet-body"))return;
      view.querySelectorAll("[data-facet-panel][open]").forEach(positionFacet);
    },{capture:true,signal:api.signal});
    view.querySelectorAll("[data-facet-close]").forEach((button)=>button.onclick=()=>{const panel=button.closest("[data-facet-panel]");panel.open=false;panel.querySelector("summary").focus();});
    view.querySelectorAll("[data-facet-clear]").forEach((button)=>button.onclick=()=>{const key=button.dataset.facetClear;state[key]=filters[key].single?"":[];changed();});
    view.querySelectorAll("[data-facet-search]").forEach((input)=>input.oninput=()=>{facetSearch.set(input.dataset.facetSearch,input.value);facetLimits.set(input.dataset.facetSearch,30);renderFacet(input.dataset.facetSearch);});
    view.querySelectorAll("[data-facet-more]").forEach((button)=>button.onclick=()=>{const key=button.dataset.facetMore;facetLimits.set(key,(facetLimits.get(key)||30)+60);renderFacet(key);});
    for(const [id,key] of [["exMode","mode"],["exDateField","dateField"],["exSort","sort"],["exRead","read"]])$("#"+id).onchange=(event)=>{state[key]=event.target.value;changed();};
    for(const [id,key] of [["exQ","q"],["exSource","source"]])$("#"+id).oninput=(event)=>{state[key]=event.target.value;delayed();};
    $("#exLimit").onchange=(event)=>{state.limit=Number(event.target.value);changed();};
    $("#exSize").onchange=(event)=>{state.size=Number(event.target.value);changed();};
    $("#exPeriod").onchange=(event)=>{customDates=event.target.value==="custom";state.period=event.target.value==="all"?"custom":event.target.value;if(event.target.value==="all"){state.from="";state.to="";}changed();};
    for(const [id,key] of [["exFrom","from"],["exTo","to"]])$("#"+id).onchange=(event)=>{state[key]=event.target.value;state.period="custom";changed();};
    view.querySelectorAll("[data-bound]").forEach((input)=>input.oninput=()=>{state[input.dataset.bound]=input.value;delayed();});
    view.querySelectorAll("#exTabs .tab").forEach((button)=>button.onclick=()=>{closeFacets();Q.setAngle(state,button.dataset.angle);changed();});
    $("#exCondition").onclick=(event)=>{
      const clear=event.target.closest("#clearExplore"),remove=event.target.closest("[data-remove-filter]");
      if(clear){Object.assign(state,Q.parse(new URLSearchParams({angle:state.angle})));state.version=META.version;customDates=false;changed();}
      else if(remove){
        const key=remove.dataset.removeFilter,value=remove.dataset.removeValue;
        if(Array.isArray(state[key]))state[key]=state[key].filter((v)=>Q.facetNormalize(key,v)!==Q.facetNormalize(key,value));
        else if(key==="dates"){state.from="";state.to="";state.period="custom";customDates=false;}
        else state[key]=key==="mode"?"all":key==="dateField"?"published":key==="limit"?0:"";
        changed();
      }
    };
    $("#toggleFilters").onclick=(event)=>{closeFacets();const hidden=!$("#exFilterControls").hidden;$("#exFilterControls").hidden=hidden;event.currentTarget.setAttribute("aria-expanded",String(!hidden));event.currentTarget.textContent=hidden?"展开筛选":"收起筛选";};
    $("#exMoreFilters").addEventListener("toggle",()=>{if(!$("#exMoreFilters").open)closeFacets();});
    $("#exAdvanced").addEventListener("toggle",()=>closeFacets());
    $("#markResultsRead").onclick=()=>{markRead(current,true);showToast(`已标记 ${current.length} 条为已读`);refresh();};
    document.addEventListener("zgclab:readchange",()=>{if(alive())refresh();},{signal:api.signal});
    view.querySelectorAll("[data-preset]").forEach((button)=>button.onclick=()=>{
      Object.assign(state,Q.parse(new URLSearchParams()));
      state.version=META.version;
      if(button.dataset.preset==="risk"){state.angle="clue";state.risks=["高"];}
      if(button.dataset.preset==="company")state.type="企业";
      if(button.dataset.preset==="ngo")state.type="NGO";
      if(button.dataset.preset==="popular"){state.angle="social";state.platforms=["X"];state.like_countMin="100";state.sort="like_count";}
      changed();
    });
    $("#copyQuery").onclick=()=>copyText(href(),"完整查询链接已复制");
    $("#saveQuery").onclick=()=>{
      const hash="/explore?"+Q.serialize(state);
      if(workspace.queries.some((item)=>item.hash===hash)){showToast("当前查询已经保存");return;}
      workspace.queries.unshift({name:summary(),hash,savedAt:new Date().toISOString(),version:META.version});saveWorkspace();showToast("查询已保存；近期条件每次打开都会重新计算");
    };
    $("#exportResults").onclick=()=>exportEntries(current,"zgclab-筛选结果.csv",{"数据版本":META.version,"数据包":META.source_package,"查询条件":summary(),"查询链接":href(),"导出时间":new Date().toISOString(),"时间口径":"北京时间 / "+state.dateField,"结果总数":current.length});
    function brief() {
      const lines=["# 监测观察简报（事实草稿）","",`生成时间：${new Date().toISOString()}`,`数据包：${META.source_package}；版本：${META.version}`,`筛选：${summary()}`,`查询：${href()}`,"",`当前结果：${current.length} 条，涉及 ${new Set(current.map(({r})=>r.ktid)).size} 家机构。`,"",...Q.groups(current,"angle").map(([a,n])=>`- ${META.angles[a].name}：${n} 条`),"","以下按当前排序列出前 20 条；不等同于重要性排名或自动研判。",""];
      current.slice(0,20).forEach(({angle,r},index)=>lines.push(`## ${index+1}. ${api.titleOf(angle,r)}`,`${instName(r.ktid)} · ${META.angles[angle].name} · ${Q.recordDay(Q.dateValue(r,state.dateField))||"时间未提供"}`,api.snippetOf(angle,r)||"未提供摘要",`原文：${Q.sourceLink(r)||"未提供"}`,""));
      lines.push("说明：仅基于当前交付快照；正文可能为节选。未核实外部链接的当前可用性，未推断风险变化或因果关系。");
      $("#briefText").value=lines.join("\n");$("#briefPanel").hidden=false;
    }
    $("#createBrief").onclick=brief;
    $("#downloadBrief").onclick=()=>{const url=URL.createObjectURL(new Blob([$("#briefText").value],{type:"text/markdown;charset=utf-8"}));const anchor=document.createElement("a");anchor.href=url;anchor.download="zgclab-观察简报.md";anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    document.querySelector("#globalSearch").value=state.q;
    sync();refresh();
  };
})();
