/* 推演与干预系统：SPA 路由渲染 */
const MAS_HTML = `

  

  <div class="databar" id="databar"></div>

  <div class="tabs" id="masTabs"><div class="tab on" data-p="p1">推演总览</div><div class="tab" data-p="p2">关键节点</div><div class="tab" data-p="p3">情景对比</div></div>

  <div class="pane on" id="p1">
  <div class="g g3" style="margin-bottom:14px">
    <!-- 左：智能体 -->
    <div class="panel">
      <div class="ph"><div class="t">智能体集群</div><div class="s">6 类角色 · 2 路并行</div></div>
      <div class="agents" id="agents"></div>
      <div class="ctrl" style="margin-top:12px">
        <span class="badge b-cyan">协同框架正常</span>
        <span class="badge b-blue">黑板 · 消息总线</span>
      </div>
    </div>

    <!-- 中：日志与控制 -->
    <div class="panel">
      <div class="ph"><div class="t">推演日志</div><div class="s">事件注入 → 态势 → 交互 → 演化 → 风险输出</div></div>
      <div class="log" id="log"></div>
      <div class="ctrl">
        <span class="lb">轮次</span>
        <input class="range" type="range" min="1" max="12" value="7" id="round">
        <span class="lb" id="roundTxt">7 / 12</span>
        <div class="seg" id="mode">
          <span class="on">单情景</span><span>多情景对比</span>
        </div>
        <button class="btn">继续推演</button>
      </div>
    </div>

    <!-- 右：曲线与指标 -->
    <div class="panel">
      <div class="ph"><div class="t">极化指数推演</div><div class="s">实际 vs 推演</div></div>
      <div id="pline" style="height:190px"></div>
      <div class="ks" style="margin-top:10px;grid-template-columns:1fr 1fr">
        <div class="k"><div class="l">单轮耗时</div><div class="v">4.82<small style="font-size:12px;color:#8fa7ba"> s</small></div><div class="d">6 类角色 · 12 轮</div></div>
        <div class="k"><div class="l">消息吞吐</div><div class="v">1247<small style="font-size:12px;color:#8fa7ba"> 条/秒</small></div><div class="d">总线峰值</div></div>
        <div class="k"><div class="l">关键节点识别</div><div class="v">0.78</div><div class="d">F1 · 4 类事件</div></div>
        <div class="k"><div class="l">置信度</div><div class="v">0.86</div><div class="d">一致性校验通过</div></div>
      </div>
    </div>
  </div>

  </div>

  <div class="pane" id="p2">
  <div class="g g2" style="grid-template-columns:1.55fr 1fr">
  <div class="panel">
    <div class="ph"><div class="t">推演关键节点</div><div class="s">E-2f7c9a · 与人工标注对照</div></div>
    <table class="tb" style="table-layout:fixed;width:100%">
      <thead><tr><th style="width:8%">轮次</th><th style="width:14%">时间</th><th style="width:36%">节点</th><th style="width:10%">情感极性</th><th style="width:18%">立场分布</th><th style="width:14%">与标注一致</th></tr></thead>
      <tbody>
        <tr><td class="mono">R02</td><td>10-18 09:00</td><td>首条报道出现，话题创建</td><td>−0.12</td><td>支 18 / 反 9 / 中 73</td><td><span class="badge b-cyan">一致</span></td></tr>
        <tr><td class="mono">R04</td><td>10-18 15:00</td><td>转发量出现拐点，媒体跟进</td><td>−0.28</td><td>支 21 / 反 26 / 中 53</td><td><span class="badge b-cyan">一致</span></td></tr>
        <tr><td class="mono">R07</td><td>10-19 11:00</td><td>立场性内容占比上升，意见领袖入场</td><td>−0.41</td><td>支 24 / 反 41 / 中 35</td><td><span class="badge b-amber">部分一致</span></td></tr>
        <tr><td class="mono">R10</td><td>10-19 21:00</td><td>群体间立场距离扩大，出现对立话题</td><td>−0.53</td><td>支 26 / 反 48 / 中 26</td><td><span class="badge b-cyan">一致</span></td></tr>
      </tbody>
    </table>
  </div>
  </div>
  <div class="pane" id="p3">
  <div class="panel">
    <div class="ph"><div class="t">情景对比</div><div class="s">同一事件 · 三种处置强度</div></div>
    <div id="scn" style="height:210px"></div>
    <div style="font-size:11px;color:#8fa7ba;margin-top:6px">最终极化指数：无干预 0.73 · 权威发布 0.61 · 核查+引导 0.55</div>
  </div>
  </div>

  <div class="panel" style="margin-top:14px">
    <div class="ph"><div class="t">数据底座</div><div class="s">来自 ZGCLab 数据平台已审核快照</div></div>
    <table class="tb" id="instTable">
      <thead><tr><th style="width:120px">机构编号</th><th>机构名称</th><th style="width:90px">类型</th><th style="width:80px">舆情</th><th style="width:80px">线索</th><th style="width:80px">社媒</th><th style="width:80px">合计</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>

`;
const RISK_HTML = `

  

  <div class="databar" id="databar"></div>

  <div class="tabs" id="riskTabs"><div class="tab on" data-p="r1">态势总览</div><div class="tab" data-p="r2">分级依据</div><div class="tab" data-p="r3">干预方案</div><div class="tab" data-p="r4">效果评估</div></div>

  <div class="pane on" id="r1">
  <div class="g g3" style="margin-bottom:14px">
    <div class="panel">
      <div class="ph"><div class="t">态势等级</div><div class="s">综合分值由七维加权</div></div>
      <div class="risk">
        <div class="lv"><b>二级</b><span>重大</span></div>
        <div>
          <div class="score">0.74<small>/ 1.00</small></div>
          <div style="font-size:11px;color:#8fa7ba;margin-top:6px">响应时限 2 小时 · 日报 + 专报</div>
        </div>
      </div>
      <div style="margin-top:16px">
        <div style="font-size:11px;color:#8fa7ba;letter-spacing:.12em;margin-bottom:8px">处置建议</div>
        <div class="tpl" style="cursor:default"><span class="id">01</span><div><div class="nm">2 小时内发布权威信息</div><div class="ds">针对「延期」传闻，发布时间线与事实清单</div></div></div>
        <div class="tpl" style="cursor:default;margin-top:8px"><span class="id">02</span><div><div class="nm">对高传播节点做事实核查</div><div class="ds">选取 5 个关键账号，定向推送核查结论</div></div></div>
        <div class="tpl" style="cursor:default;margin-top:8px"><span class="id">03</span><div><div class="nm">准备正面引导口径</div><div class="ds">面向摇摆群体，由意见领袖转发</div></div></div>
      </div>
      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
        <span class="badge b-amber">人工复核：已确认</span>
        <span class="badge b-cyan">置信度 0.86</span>
        <span class="badge b-blue">报告已生成</span>
      </div>
    </div>

    <div class="panel">
      <div class="ph"><div class="t">七维风险画像</div><div class="s">0–1 归一化</div></div>
      <div id="radar" style="height:230px"></div>
    </div>

    <div class="panel">
      <div class="ph"><div class="t">分级依据</div><div class="s">权重 × 得分</div></div>
      <table class="tb">
        <thead><tr><th>指标</th><th style="width:56px">权重</th><th style="width:56px">得分</th><th style="width:64px">等级</th></tr></thead>
        <tbody>
          <tr><td>事件热度</td><td class="mono">0.18</td><td class="mono">0.78</td><td><span class="badge b-red">高</span></td></tr>
          <tr><td>传播速度</td><td class="mono">0.16</td><td class="mono">0.66</td><td><span class="badge b-amber">中</span></td></tr>
          <tr><td>情感极性</td><td class="mono">0.15</td><td class="mono">0.71</td><td><span class="badge b-red">高</span></td></tr>
          <tr><td>群体对立</td><td class="mono">0.17</td><td class="mono">0.74</td><td><span class="badge b-red">高</span></td></tr>
          <tr><td>关键节点活跃度</td><td class="mono">0.12</td><td class="mono">0.62</td><td><span class="badge b-amber">中</span></td></tr>
          <tr><td>议题敏感度</td><td class="mono">0.11</td><td class="mono">0.80</td><td><span class="badge b-red">高</span></td></tr>
          <tr><td>跨平台扩散</td><td class="mono">0.11</td><td class="mono">0.58</td><td><span class="badge b-amber">中</span></td></tr>
        </tbody>
      </table>
    </div>
  </div>

  </div>

  <div class="pane" id="r2">
    <div class="panel">
      <div class="ph"><div class="t">分级依据</div><div class="s">七维权重与得分</div></div>
      <div id="gradeTable"></div>
    </div>
  </div>

  <div class="pane" id="r3">
  <div class="g g2">
    <div class="panel">
      <div class="ph"><div class="t">干预方案</div><div class="s">1 套模板 · 4 类策略</div></div>
      <div class="tpls" id="tpls"></div>
      <div style="margin-top:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
        <div class="k"><div class="l">干预对象</div><div class="v" style="font-size:15px">全体受众</div></div>
        <div class="k"><div class="l">介入时机</div><div class="v" style="font-size:15px">发酵初期</div></div>
        <div class="k"><div class="l">发布渠道</div><div class="v" style="font-size:15px">官方账号</div></div>
      </div>
      <div class="ctrl" style="margin-top:12px">
        <span class="badge b-cyan">合规审查通过</span>
        <button class="btn">进入推演评估</button>
      </div>
    </div>

  </div>
  <div class="pane" id="r4">
    <div class="panel">
      <div class="ph"><div class="t">干预效果对比</div><div class="s">同一事件 · 同一时点 · 对照组</div></div>
      <div id="cmp" style="height:200px"></div>
      <div style="display:flex;gap:0;margin:6px 0 10px" id="tl"></div>
      <div class="ks" style="margin-top:8px">
        <div class="k"><div class="l">极化指数变化</div><div class="v" style="color:#62e6d2">−0.084</div><div class="d">T-01</div></div>
        <div class="k"><div class="l">情感改善</div><div class="v" style="color:#62e6d2">+6.8%</div><div class="d">负向占比下降</div></div>
        <div class="k"><div class="l">传播降温</div><div class="v" style="color:#62e6d2">−11.4%</div><div class="d">转发量</div></div>
        <div class="k"><div class="l">综合收益</div><div class="v" style="color:#f6c66b">0.72</div><div class="d">越高越好</div></div>
      </div>
    </div>
  </div>

`;
function initMas(){

(function(){
  const M = window.ZGCLAB_META || {};
  const tot = M.totals || {};
  const sum = (tot.news||0)+(tot.clue||0)+(tot.social||0);
  const el = document.getElementById('databar');
  if (el) el.innerHTML = `<span>数据底座</span><b>${(M.scope&&M.scope.units)||20}</b> 个验证机构 · <b>${sum.toLocaleString()}</b> 条已审核记录 · 新闻 ${(tot.news||0).toLocaleString()} / 官网线索 ${(tot.clue||0).toLocaleString()} / 社媒 ${(tot.social||0).toLocaleString()}`;
  const tb = document.querySelector('#instTable tbody');
  if (tb && M.institutions) {
    const rows = M.institutions.slice().sort((a,b)=>((b.counts.news+b.counts.clue+b.counts.social)-(a.counts.news+a.counts.clue+a.counts.social))).slice(0,5);
    tb.innerHTML = rows.map(r=>`<tr><td class="mono">${r.ktid}</td><td>${r.cn}</td><td>${r.type}</td><td class="mono">${r.counts.news}</td><td class="mono">${r.counts.clue}</td><td class="mono">${r.counts.social}</td><td class="mono">${r.counts.news+r.counts.clue+r.counts.social}</td></tr>`).join('');
  }
})();

const agents=[
  ["态势感知","事件发现与热度跟踪","#62e6d2","62.4 ms","运行"],
  ["事件理解","要素抽取与阶段判定","#73a7ff","88.7 ms","运行"],
  ["情感与立场","情感 / 情绪 / 立场","#62e6d2","54.3 ms","完成"],
  ["传播推演","路径与规模推演","#f6c66b","143.6 ms","运行"],
  ["风险研判","等级与置信度","#f6c66b","96.2 ms","等待"],
  ["策略评估","方案收益评估","#73a7ff","121.8 ms","等待"]
];
document.getElementById('agents').innerHTML=agents.map((a,i)=>`
  <div class="agent ${i<4?'on':''}">
    <div class="ic" style="background:${a[2]}">${String(i+1).padStart(2,'0')}</div>
    <div><div class="nm">${a[0]}</div><div class="ds">${a[1]}</div></div>
    <div class="st">${i<4?'<i></i>':''}${a[4]} · ${a[3]}</div>
  </div>`).join('');

const logs=[
 ["09:12:04","info","任务注入：E-2f7c9a / 情景 A / 12 轮"],
 ["09:12:05","ok","态势感知：事件卡片生成，热度 0.64"],
 ["09:12:06","ok","事件理解：要素 7 项，阶段判定为「扩散」"],
 ["09:12:07","ok","情感与立场：3,842 条评论完成打标"],
 ["09:12:09","info","编排：DAG 调度 4 个下游智能体"],
 ["09:12:14","ok","传播推演：第 7 轮完成，曲线已更新"],
 ["09:12:15","warn","风险研判：分歧 0.18，触发一致性复核"],
 ["09:12:18","ok","复核通过，置信度 0.86"],
 ["09:12:19","info","策略评估：候选模板 T-01 / T-03"],
 ["09:12:21","ok","第 7 轮输出：极化指数 0.58，等级「二级」"]
];
document.getElementById('log').innerHTML=logs.map(l=>`<div><span class="ts">${l[0]}</span><span class="${l[1]}">${l[2]}</span></div>`).join('');
document.getElementById('log').scrollTop=9999;

const round=document.getElementById('round'), rt=document.getElementById('roundTxt');
round.oninput=()=>{rt.textContent=round.value+' / 12';};

document.querySelectorAll('#mode span').forEach(s=>s.onclick=()=>{
  document.querySelectorAll('#mode span').forEach(x=>x.classList.remove('on')); s.classList.add('on');
});

const c=echarts.init(document.getElementById('pline'));
const rounds=['R1','R2','R3','R4','R5','R6','R7','R8','R9','R10','R11','R12'];
c.setOption({
  backgroundColor:'transparent',
  grid:{left:34,right:12,top:26,bottom:22},
  tooltip:{trigger:'axis',backgroundColor:'#0d1c2e',borderColor:'#1d3853',textStyle:{color:'#e9f2fa',fontSize:11}},
  legend:{show:true,top:0,right:0,itemWidth:8,itemHeight:8,textStyle:{color:'#8fa7ba',fontSize:10}},
  xAxis:{type:'category',data:rounds,axisLine:{lineStyle:{color:'#1d3853'}},axisLabel:{color:'#8fa7ba',fontSize:10},axisTick:{show:false}},
  yAxis:{type:'value',min:0,max:1,splitLine:{lineStyle:{color:'#14283d'}},axisLabel:{color:'#8fa7ba',fontSize:10}},
  series:[
    {name:'实际',type:'line',smooth:true,symbolSize:4,data:[.12,.21,.27,.33,.39,.44,.50,.55,.61,.66,.70,.73],lineStyle:{color:'#62e6d2',width:2.5},itemStyle:{color:'#62e6d2'},areaStyle:{color:'#62e6d21a'}},
    {name:'推演',type:'line',smooth:true,symbolSize:4,data:[.11,.20,.28,.32,.40,.45,.49,.56,.60,.67,.69,.74],lineStyle:{color:'#73a7ff',width:2,type:'dashed'},itemStyle:{color:'#73a7ff'}}
  ]
});
const s2=echarts.init(document.getElementById('scn'));
s2.setOption({
  backgroundColor:'transparent',
  grid:{left:44,right:14,top:16,bottom:28},
  xAxis:{type:'category',data:['无干预','权威发布','核查+引导'],axisLine:{lineStyle:{color:'#1d3853'}},axisLabel:{color:'#8fa7ba',fontSize:11},axisTick:{show:false}},
  yAxis:{type:'value',min:0.4,max:0.8,splitLine:{lineStyle:{color:'#14283d'}},axisLabel:{color:'#8fa7ba',fontSize:10}},
  series:[{type:'bar',barWidth:34,data:[
      {value:0.73,itemStyle:{color:'#ff7f86'}},
      {value:0.61,itemStyle:{color:'#f6c66b'}},
      {value:0.55,itemStyle:{color:'#62e6d2'}}],
    label:{show:true,position:'top',color:'#cfe3ef',fontSize:11}}]
});
window.addEventListener('resize',()=>{c.resize();s2.resize();});

document.querySelectorAll('#masTabs .tab').forEach(function(tab){
  tab.onclick=function(){
    document.querySelectorAll('#masTabs .tab').forEach(function(x){x.classList.remove('on')});
    tab.classList.add('on');
    document.querySelectorAll('.pane').forEach(function(p){p.classList.remove('on')});
    var el=document.getElementById(tab.dataset.p); if(el) el.classList.add('on');
    setTimeout(function(){ window.dispatchEvent(new Event('resize')); },30);
  };
});

}
function initRisk(){

(function(){
  const M = window.ZGCLAB_META || {};
  const tot = M.totals || {};
  const sum = (tot.news||0)+(tot.clue||0)+(tot.social||0);
  const el = document.getElementById('databar');
  if (el) el.innerHTML = `<span>预警数据源</span>20 个验证机构 · <b>${sum.toLocaleString()}</b> 条已审核记录 · 新闻 ${(tot.news||0).toLocaleString()} / 官网线索 ${(tot.clue||0).toLocaleString()} / 社媒 ${(tot.social||0).toLocaleString()} · 快照 ${(M.generated_at||'').slice(0,10)}`;
})();

const tpls=[
  ["T-01","权威信息发布","全体受众 · 发酵初期 · 官方账号 · 中","0.72"],
  ["T-02","事实核查","谣言受众 · 扩散期 · 媒体+平台 · 强","0.64"],
  ["T-03","正面引导","摇摆群体 · 极化前 · 意见领袖 · 中","0.58"],
  ["T-04","议题降温","对立群体 · 高峰期 · 多平台 · 弱","0.49"]
];
document.getElementById('tpls').innerHTML=tpls.map((t,i)=>`
  <div class="tpl ${i===0?'on':''}">
    <span class="id">${t[0]}</span>
    <div><div class="nm">${t[1]}</div><div class="ds">${t[2]}</div></div>
    <div style="margin-left:auto" class="mono">收益 ${t[3]}</div>
  </div>`).join('');
document.querySelectorAll('.tpl').forEach(x=>x.onclick=()=>{
  document.querySelectorAll('.tpl').forEach(y=>y.classList.remove('on')); x.classList.add('on');
});

const tl=[["T+0","发现","系统告警，人工复核"],["T+2h","发布","权威信息上线"],["T+6h","核查","5 个节点定向推送"],["T+24h","复盘","效果回写模板"]];
document.getElementById('tl').innerHTML=tl.map((x,i)=>`
  <div style="flex:1;text-align:center;position:relative">
    <div style="width:26px;height:26px;border-radius:50%;margin:0 auto 6px;background:${i<3?'#62e6d2':'#1d3853'};color:#06101d;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center">${i+1}</div>
    <div style="font-size:11px;color:#cfe3ef">${x[0]} · ${x[1]}</div>
    <div style="font-size:10px;color:#8fa7ba">${x[2]}</div>
  </div>`).join('');

const r=echarts.init(document.getElementById('radar'));
r.setOption({
  backgroundColor:'transparent',
  radar:{
    indicator:[
      {name:'热度',max:1},{name:'速度',max:1},{name:'情感',max:1},{name:'对立',max:1},
      {name:'节点',max:1},{name:'敏感',max:1},{name:'扩散',max:1}
    ],
    radius:'62%',center:['50%','52%'],
    axisName:{color:'#8fa7ba',fontSize:10},
    splitLine:{lineStyle:{color:'#1d3853'}},
    splitArea:{areaStyle:{color:['#0a1727','#0d1c2e']}},
    axisLine:{lineStyle:{color:'#1d3853'}}
  },
  series:[{
    type:'radar',symbolSize:4,
    data:[{value:[.78,.66,.71,.74,.62,.80,.58],name:'当前',
      lineStyle:{color:'#62e6d2',width:2},itemStyle:{color:'#62e6d2'},
      areaStyle:{color:'#62e6d233'}}]
  }]
});

const c=echarts.init(document.getElementById('cmp'));
const xs=['T0','T+1','T+2','T+3','T+4','T+5','T+6','T+7','T+8'];
c.setOption({
  backgroundColor:'transparent',
  grid:{left:34,right:10,top:26,bottom:22},
  tooltip:{trigger:'axis',backgroundColor:'#0d1c2e',borderColor:'#1d3853',textStyle:{color:'#e9f2fa',fontSize:11}},
  legend:{top:0,right:0,itemWidth:8,itemHeight:8,textStyle:{color:'#8fa7ba',fontSize:10}},
  xAxis:{type:'category',data:xs,axisLine:{lineStyle:{color:'#1d3853'}},axisLabel:{color:'#8fa7ba',fontSize:10},axisTick:{show:false}},
  yAxis:{type:'value',min:.35,max:.75,splitLine:{lineStyle:{color:'#14283d'}},axisLabel:{color:'#8fa7ba',fontSize:10}},
  series:[
    {name:'对照组',type:'line',smooth:true,symbolSize:3,data:[.47,.52,.56,.60,.63,.66,.68,.70,.71],lineStyle:{color:'#ff7f86',width:2},itemStyle:{color:'#ff7f86'}},
    {name:'干预组',type:'line',smooth:true,symbolSize:3,data:[.47,.49,.51,.53,.55,.57,.59,.60,.61],lineStyle:{color:'#62e6d2',width:2.5},itemStyle:{color:'#62e6d2'},areaStyle:{color:'#62e6d21a'}}
  ]
});
window.addEventListener('resize',()=>{r.resize();c.resize();});

document.querySelectorAll('#riskTabs .tab').forEach(function(tab){
  tab.onclick=function(){
    document.querySelectorAll('#riskTabs .tab').forEach(function(x){x.classList.remove('on')});
    tab.classList.add('on');
    document.querySelectorAll('.pane').forEach(function(p){p.classList.remove('on')});
    var el=document.getElementById(tab.dataset.p); if(el) el.classList.add('on');
    setTimeout(function(){ window.dispatchEvent(new Event('resize')); },30);
  };
});
(function(){
  var src=document.querySelector('#r1 table.tb');
  var dst=document.getElementById('gradeTable');
  if(src&&dst&&!dst.firstChild) dst.appendChild(src.cloneNode(true));
})();

}

window.ZGCLAB_SYSTEMS = function (name) {
  const view = document.getElementById('view');
  const crumb = document.getElementById('crumb');
  if (name === 'risk') {
    view.innerHTML = RISK_HTML;
    if (crumb) crumb.innerHTML = '<b>风险预警与干预</b>';
    document.title = '风险预警与干预 · ZGCLab 数据平台';
    try { initRisk(); } catch (e) { console.error(e); }
  } else {
    view.innerHTML = MAS_HTML;
    if (crumb) crumb.innerHTML = '<b>多智能体推演</b>';
    document.title = '多智能体推演 · ZGCLab 数据平台';
    try { initMas(); } catch (e) { console.error(e); }
  }
};
