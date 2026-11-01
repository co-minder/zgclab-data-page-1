/* Research views over the delivered snapshot. No generated risk judgments. */
(function () {
  "use strict";
  window.ZGCLAB_TOOLS = async function (name, params, api) {
    const {META, CORE, Q, view, esc, fmt, entriesFor, ensureDetail, recCard, bindRecords, pager, bindPager, exportEntries, downloadCsv, titleOf, instName, workspace, saveWorkspace, isRead, signal} = api;
    const $ = (selector) => view.querySelector(selector);
    const live = () => !signal.aborted;
    const angles = ["news", "clue", "social"];
    const headings = {timeline:["记录时间线","按日期串联机构的官网、新闻和社媒记录。"],quality:["数据质量","直接核对缺失字段和可用指标，点击数量查看记录。"],fulltext:["完整正文检索","检索交付包中的完整正文与译文，并显示命中上下文。"],watchlist:["关注看板","把常看机构放在一起，接续未读材料和高风险线索。"]};
    const options = (values, current) => values.map(([key,label]) => `<option value="${esc(key)}" ${String(key)===String(current)?"selected":""}>${esc(label)}</option>`).join("");
    const instOptions = (current) => options([["","全部机构"],...META.institutions.map((i)=>[i.ktid,i.cn])],current);
    const angleOptions = (current) => options([["all","全部角度"],...angles.map((a)=>[a,META.angles[a].name])],current);
    function toolUrl(path, params) { const qs=new URLSearchParams(params);if(META.simulation)qs.set("sim","1");return "#/"+path+(qs.size?"?"+qs:""); }
    const head = `<div class="page-head"><div><a class="back-overview" href="#/overview">← 全部数据总览</a><h1>${headings[name][0]}</h1><p>${headings[name][1]}</p></div></div>`;
    view.innerHTML=head+'<div class="card pad" id="toolBody"><div class="skeleton">正在加载快照…</div></div>';
    let all;
    try { all=await entriesFor("all"); }
    catch(error) { if(live())$("#toolBody").innerHTML=`<div class="inline-error">${esc(error.message)}</div><button class="btn" id="retryTool">重新加载</button>`; if(live())$("#retryTool").onclick=()=>window.ZGCLAB_TOOLS(name,params,api); return; }
    if(!live())return;
    if(name==="timeline") timeline();
    if(name==="quality") quality();
    if(name==="watchlist") watchlist();
    if(name==="fulltext") fulltext();

    function timeline() {
      const state=Q.parse(params); state.dateField="published";
      let rows=[];
      $("#toolBody").innerHTML=`<div class="tool-filters"><label>机构<select id="timelineInst">${instOptions(state.ids[0]||"")}</select></label><label>角度<select id="timelineAngle">${angleOptions(state.angle)}</select></label><label>时间范围<select id="timelinePeriod">${options([["all","全部日期"],["7","近 7 天"],["30","近 30 天"],["custom","指定日期"]],state.period==="custom"&&!state.from&&!state.to?"all":state.period)}</select></label><label>时间排序<select id="timelineSort">${options([["newest","从新到旧"],["oldest","从旧到新"]],state.sort)}</select></label><button class="btn" id="exportTimeline">导出时间线</button></div>
        <div class="tool-filters" id="timelineDates" hidden><label>开始日期<input type="date" id="timelineFrom" value="${esc(state.from)}"></label><label>结束日期<input type="date" id="timelineTo" value="${esc(state.to)}"></label></div><p class="note">按北京时间的发布时间分组；没有发布时间的记录单独列出。记录日期不是经过核实的事件发生时间。</p><div id="timelineError" role="alert" hidden></div><p id="timelineCount" role="status"></p><div id="timelineRecords" class="timeline-list"></div><div id="timelinePager"></div>`;
      function draw() {
        const error=Q.validate(state); $("#timelineError").hidden=!error;$("#timelineError").textContent=error;
        if(error){$("#exportTimeline").disabled=true;return;}
        rows=Q.filter(all,state,META.institutions).entries;
        state.page=CORE.pageNumber(state.page,rows.length,20);
        const sample=rows.slice((state.page-1)*20,state.page*20); let last=null;
        $("#timelineRecords").innerHTML=sample.map(({angle,r})=>{
          const date=Q.recordDay(r.publish_time)||"发布时间未提供",header=date!==last?`<h2 class="timeline-date">${esc(date)}</h2>`:"";last=date;
          return header+recCard(angle,r);
        }).join("")||'<div class="empty">当前日期范围没有匹配记录，可改为全部日期。</div>';
        bindRecords($("#timelineRecords"),rows);
        const range=Q.dateRange(state);
        $("#timelineCount").textContent=`共 ${fmt(rows.length)} 条 · ${range.from||range.to?(range.from||"不限")+" 至 "+(range.to||"不限"):"全部日期"}`;
        $("#timelinePager").innerHTML=pager(rows.length,state.page,null,20);bindPager($("#timelinePager"),(p)=>{state.page=p;draw();});
        $("#exportTimeline").disabled=!rows.length;
        history.replaceState(null,"",toolUrl("timeline",Q.serialize(state)));
      }
      $("#timelineInst").onchange=(e)=>{state.ids=e.target.value?[e.target.value]:[];state.page=1;draw();};
      $("#timelineAngle").onchange=(e)=>{state.angle=e.target.value;state.page=1;draw();};
      $("#timelineSort").onchange=(e)=>{state.sort=e.target.value;state.page=1;draw();};
      $("#timelinePeriod").onchange=(e)=>{state.period=e.target.value==="all"?"custom":e.target.value;$("#timelineDates").hidden=e.target.value!=="custom";if(e.target.value==="all"){state.from="";state.to="";}state.page=1;draw();};
      for(const [id,key] of [["timelineFrom","from"],["timelineTo","to"]])$("#"+id).onchange=(e)=>{state[key]=e.target.value;state.page=1;draw();};
      $("#timelineDates").hidden=!(state.from||state.to);
      $("#exportTimeline").onclick=()=>exportEntries(rows,"zgclab-记录时间线.csv",{"数据版本":META.version,"时间口径":"北京时间 / 发布时间","查询链接":location.href,"结果总数":rows.length});
      draw();
    }

    function quality() {
      let institution=params.get("ids")||"";
      $("#toolBody").innerHTML=`<div class="tool-filters"><label>机构<select id="qualityInst">${instOptions(institution)}</select></label><button class="btn" id="exportQuality">导出质量统计</button></div><div id="qualityStats"></div><div id="qualityRecords" class="rec-list"></div><div id="qualityPager"></div>`;
      let selected=null,page=1,subset=[],issueRows=[];
      const issueDefinitions=[
        ["publish_time","发布时间未提供",()=>true,({r})=>!r.publish_time],
        ["url","原文链接无效或缺失",()=>true,({r})=>!CORE.safeUrl(Q.sourceLink(r))],
        ["translation","有原文、缺中文正文 / 翻译",({r})=>!!r._has_original,({r})=>!!r._has_original&&!r._has_translation],
        ["risk","风险等级为空",({angle})=>angle==="clue",({angle,r})=>angle==="clue"&&!r.risk_level],
        ["unknown_risk","风险等级为无法判断",({angle})=>angle==="clue",({angle,r})=>angle==="clue"&&r.risk_level==="无法判断"],
        ...["like_count","comment_count","repost_count","view_count"].map((key,index)=>[key,["点赞数未提供","评论数未提供","转发数未提供","浏览量未提供"][index],({angle})=>angle==="social",({angle,r})=>angle==="social"&&Q.metric(r,key)==null])
      ];
      function detail() {
        issueRows=selected?subset.filter(issueDefinitions.find(([key])=>key===selected)[3]):[];
        const title=selected?issueDefinitions.find(([key])=>key===selected)[1]:"";
        $("#qualityRecords").innerHTML=selected?`<h2 class="tool-section-title">${esc(title)} · ${fmt(issueRows.length)} 条</h2>`+issueRows.slice((page-1)*14,page*14).map(({angle,r})=>recCard(angle,r)).join(""):'<p class="note">点击上方任意数量，查看形成该计数的记录。</p>';
        if(selected&&!issueRows.length)$("#qualityRecords").innerHTML+='<div class="empty">当前范围没有该项问题。</div>';
        bindRecords($("#qualityRecords"),issueRows);$("#qualityPager").innerHTML=selected?pager(issueRows.length,page):"";bindPager($("#qualityPager"),(p)=>{page=p;detail();});
      }
      function draw() {
        subset=all.filter(({r})=>!institution||String(r.ktid)===institution);
        $("#qualityStats").innerHTML=`<p class="note">当前范围 ${fmt(subset.length)} 条记录。各项可重叠，分母仅含适用记录；数值 0 视为已提供。统计不等同于自动完整度评分。</p><div class="quality-grid">${issueDefinitions.map(([key,label,applies,test])=>{
          const applicable=subset.filter(applies),n=applicable.filter(test).length;
          return `<button class="quality-card ${selected===key?"active":""}" data-quality="${key}"><span>${label}</span><b>${fmt(n)}</b><small>适用 ${fmt(applicable.length)} 条${applicable.length?" · "+(n/applicable.length*100).toFixed(1)+"%":""}</small></button>`;
        }).join("")}</div>`;
        $("#qualityStats").querySelectorAll("[data-quality]").forEach((b)=>b.onclick=()=>{selected=b.dataset.quality;page=1;draw();});detail();
        history.replaceState(null,"",toolUrl("quality",institution?{ids:institution}:{}));
      }
      $("#qualityInst").onchange=(e)=>{institution=e.target.value;page=1;draw();};
      $("#exportQuality").onclick=()=>downloadCsv("zgclab-数据质量统计.csv",["检查项","问题记录数","适用记录数","机构范围","数据版本"],issueDefinitions.map(([,label,applies,test])=>[label,subset.filter(applies).filter(test).length,subset.filter(applies).length,institution?instName(Number(institution)):"全部机构",META.version]));
      draw();
    }

    function watchlist() {
      $("#toolBody").innerHTML=`<details class="query-options" id="watchlistPicker" ${workspace.watchlist.length?"":"open"}><summary>管理关注机构 <span id="watchlistSelected"></span></summary><div class="institution-choices">${META.institutions.map((i)=>`<label class="choice"><input type="checkbox" data-watch="${i.ktid}" ${workspace.watchlist.includes(i.ktid)?"checked":""}>${esc(i.cn)}</label>`).join("")}</div></details><div id="watchlistStats"></div><div class="query-results-tools"><label>记录范围<select id="watchlistRead"><option value="unread">未读记录</option><option value="all">全部记录</option></select></label><a class="btn" id="openWatchQuery" href="#/explore">进入组合查询</a><button class="btn" id="exportWatchlist">导出关注记录</button></div><div id="watchlistRecords" class="rec-list"></div><div id="watchlistPager"></div><p class="note">关注和已读状态保存在当前浏览器，可从“我的工作台”导出备份。这里展示已有快照，未读不等于新发布。</p>`;
      let page=1,current=[];
      function draw() {
        const rows=all.filter(({r})=>workspace.watchlist.includes(r.ktid));
        const unread=rows.filter(({angle,r})=>!isRead(angle,r.id));
        const high=rows.filter(({angle,r})=>angle==="clue"&&r.risk_level==="高");
        $("#watchlistSelected").textContent=`已关注 ${workspace.watchlist.length} 家`;
        $("#watchlistStats").innerHTML=`<div class="kpis watchlist-kpis">${[["关注机构",workspace.watchlist.length],["全部记录",rows.length],["未读记录",unread.length],["高风险线索",high.length]].map(([label,n])=>`<div class="kpi"><div class="k-label">${label}</div><div class="k-value">${fmt(n)}</div></div>`).join("")}</div>`;
        const state=Q.parse(new URLSearchParams());current=Q.filter($("#watchlistRead").value==="unread"?unread:rows,state,META.institutions).entries;
        page=CORE.pageNumber(page,current.length,14);
        $("#watchlistRecords").innerHTML=current.slice((page-1)*14,page*14).map(({angle,r})=>recCard(angle,r)).join("")||`<div class="empty">${workspace.watchlist.length?"当前范围没有未读记录，可切换全部记录。":"先选择你希望持续关注的机构。"}</div>`;
        bindRecords($("#watchlistRecords"),current);$("#watchlistPager").innerHTML=pager(current.length,page);bindPager($("#watchlistPager"),(p)=>{page=p;draw();});
        $("#openWatchQuery").href="#/explore?angle=all&ids="+workspace.watchlist.join(",");$("#exportWatchlist").disabled=!current.length;
      }
      view.querySelectorAll("[data-watch]").forEach((input)=>input.onchange=()=>{const id=Number(input.dataset.watch);workspace.watchlist=input.checked?[...new Set([...workspace.watchlist,id])]:workspace.watchlist.filter((value)=>value!==id);saveWorkspace();page=1;draw();});
      $("#watchlistRead").onchange=()=>{page=1;draw();};
      $("#exportWatchlist").onclick=()=>exportEntries(current,"zgclab-关注机构记录.csv",{"数据版本":META.version,"关注机构":workspace.watchlist.map(instName).join("、"),"阅读范围":$("#watchlistRead").value,"结果总数":current.length});
      document.addEventListener("zgclab:readchange",()=>{if(live())draw();},{signal});draw();
    }

    function fulltext() {
      $("#toolBody").innerHTML=`<form id="fulltextForm"><div class="tool-filters fulltext-filters"><label>检索词<input id="fulltextQ" type="search" required value="${esc(params.get("q")||"")}" placeholder="多个词同时匹配，可用双引号短语"></label><label>机构<select id="fulltextInst">${instOptions(params.get("ids")||"")}</select></label><label>角度<select id="fulltextAngle">${angleOptions(params.get("angle")||"all")}</select></label><button class="btn primary" id="startFulltext" type="submit">检索完整正文</button><button class="btn" id="cancelFulltext" type="button" hidden>停止</button></div></form><p class="note">检索完整正文和译文字段，按需下载加密详情；首次检索耗时随范围增加。PDF、图片和外部网页尚未解析，不在检索范围内。</p><div id="fulltextStatus" role="status">输入检索词后开始。</div><div id="fulltextProgress" hidden><progress value="0" max="1" aria-label="正文检索进度"></progress></div><div class="tool-actions"><button class="btn" id="exportFulltext" disabled>导出命中上下文</button></div><div id="fulltextResults"></div><div id="fulltextPager"></div>`;
      let run=0,matches=[],page=1,complete=false;
      const fields=["content","content_cn","original_content","chinese_trans","chinese_translation"];
      const labels={content:"完整原文",content_cn:"中文正文",original_content:"完整原文",chinese_trans:"中文翻译",chinese_translation:"中文翻译"};
      function draw() {
        $("#fulltextResults").innerHTML=matches.slice((page-1)*14,page*14).map(({angle,r,field,context})=>`<article class="rec fulltext-hit" data-angle="${angle}" data-id="${esc(r.id)}"><div class="r-top"><span class="tag ${angle}">${META.angles[angle].name}</span><span class="hint">${esc(instName(r.ktid))}</span></div><h4>${esc(titleOf(angle,r))}</h4><span class="hint">命中：${labels[field]}（${field}）</span><blockquote>${esc(context)}</blockquote><span class="hint">打开记录查看完整字段与原文链接 →</span></article>`).join("");
        bindRecords($("#fulltextResults"),matches);$("#fulltextPager").innerHTML=pager(matches.length,page);bindPager($("#fulltextPager"),(p)=>{page=p;draw();});$("#exportFulltext").disabled=!matches.length;
      }
      $("#cancelFulltext").onclick=()=>{run++;$("#cancelFulltext").hidden=true;$("#startFulltext").disabled=false;$("#fulltextStatus").textContent=`检索已停止，已找到 ${matches.length} 条；结果不完整。`;};
      $("#fulltextForm").onsubmit=async(event)=>{
        event.preventDefault();const q=$("#fulltextQ").value.trim(),tokens=CORE.parseQuery(q);
        if(!tokens.some((t)=>!t.exclude)){ $("#fulltextStatus").textContent="请至少输入一个要查找的词。";return; }
        const id=++run;matches=[];page=1;complete=false;draw();
        const inst=$("#fulltextInst").value,angle=$("#fulltextAngle").value;
        const candidates=all.filter((e)=>(!inst||String(e.r.ktid)===inst)&&(angle==="all"||e.angle===angle));
        const chunks=new Map();for(const e of candidates){const key=e.angle+":"+e.r._detail;if(!chunks.has(key))chunks.set(key,[]);chunks.get(key).push(e);}
        const groups=[...chunks.values()];let cursor=0,done=0,failed=0;
        $("#startFulltext").disabled=true;$("#cancelFulltext").hidden=false;$("#fulltextProgress").hidden=false;const progress=$("progress");progress.max=Math.max(1,candidates.length);progress.value=0;
        history.replaceState(null,"",toolUrl("fulltext",{q,ids:inst,angle}));
        const update=()=>{if(live()&&id===run){$("#fulltextStatus").textContent=`已检查 ${done}/${candidates.length} 条，命中 ${matches.length} 条${failed?`，${failed} 条加载失败`:""}`;progress.value=done;}};update();
        async function worker() {
          while(cursor<groups.length&&live()&&id===run){const group=groups[cursor++];
            try {
              await ensureDetail(group[0].angle,group[0].r);
              for(const e of group){if(!live()||id!==run)return;const detail=await ensureDetail(e.angle,e.r);if(!detail){failed++;continue;}
                const values=fields.map((field)=>[field,String(detail.fields[field]||"")]).filter(([,v])=>v);
                if(!CORE.matches(values.map(([,v])=>v).join("\n"),tokens,"all"))continue;
                const hit=values.find(([,v])=>tokens.some((t)=>!t.exclude&&CORE.normalize(v).includes(t.text)))||values[0];
                if(hit){const token=tokens.find((t)=>!t.exclude&&CORE.normalize(hit[1]).includes(t.text));const index=token?CORE.normalize(hit[1]).indexOf(token.text):0;matches.push({...e,field:hit[0],context:(index>80?"…":"")+hit[1].slice(Math.max(0,index-80),index+220)+(index+220<hit[1].length?"…":"")});}
              }
            }catch(_){failed+=group.length;}
            if(!live()||id!==run)return;done+=group.length;update();
          }
        }
        await Promise.all([worker(),worker(),worker()]);if(!live()||id!==run)return;
        complete=!failed;matches.sort((a,b)=>String(a.r.id).localeCompare(String(b.r.id)));draw();$("#startFulltext").disabled=false;$("#cancelFulltext").hidden=true;
        $("#fulltextStatus").textContent=`${complete?"检索完成":"检索部分完成"}：检查 ${done} 条，命中 ${matches.length} 条${failed?`，${failed} 条加载失败，可重试`:""}。`;
      };
      $("#exportFulltext").onclick=()=>downloadCsv("zgclab-完整正文检索.csv",["记录ID","机构","角度","命中字段","命中上下文","原文链接","数据版本","检索词","检索完成"],matches.map(({angle,r,field,context})=>[r.id,instName(r.ktid),META.angles[angle].name,field,context,Q.sourceLink(r),META.version,$("#fulltextQ").value,complete?"是":"否"]));
    }
  };
})();
