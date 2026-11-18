/* 推演与干预系统：SPA 路由渲染 */
const MAS_HTML = `

  

  <div class="databar" id="databar"><span>数据底座</span>20 个验证机构 · 6,989 条已审核记录 · 新闻 3,675 / 官网线索 1,468 / 社媒 1,846</div>

  <div class="tabs" id="masTabs">
    <div class="tab on" data-p="p1">推演总览</div>
    <div class="tab" data-p="p2">关键节点</div>
    <div class="tab" data-p="p3">情景对比</div>
    <div class="tab" data-p="p4">智能体调用链</div>
  </div>

  <div class="pane on" id="p1">
    <div class="g g3">
      <div class="panel">
        <div class="ph"><div class="t">智能体集群</div><div class="s">6 类角色 · 2 路并行</div></div>
        <div class="agents" id="agents"></div>
        <div class="ctrl" style="margin-top:12px">
          <span class="badge b-cyan">协同框架正常</span>
          <span class="badge b-blue">黑板 · 消息总线</span>
        </div>
      </div>
      <div class="panel">
        <div class="ph"><div class="t">推演日志</div><div class="s">事件注入 → 态势 → 交互 → 演化 → 风险输出</div></div>
        <div class="log" id="log"></div>
        <div class="ctrl">
          <span class="lb">轮次</span>
          <input class="range" type="range" min="1" max="12" value="7" id="round">
          <span class="lb" id="roundTxt">7 / 12</span>
          <div class="seg" id="mode"><span class="on">单情景</span><span>多情景对比</span></div>
          <button class="btn" id="runBtn">继续推演</button>
        </div>
      </div>
      <div class="panel">
        <div class="ph"><div class="t">极化指数推演</div><div class="s">实际 vs 推演</div></div>
        <div id="pline" style="height:190px"></div>
        <div class="ks" style="margin-top:10px;grid-template-columns:1fr 1fr">
          <div class="k"><div class="l">单轮耗时</div><div class="v">4.82<small style="font-size:12px;color:#8fa7ba"> s</small></div><div class="d">6 类角色 · 12 轮</div></div>
          <div class="k"><div class="l">消息吞吐</div><div class="v">1247<small style="font-size:12px;color:#8fa7ba"> 条/秒</small></div><div class="d">总线峰值</div></div>
          <div class="k"><div class="l">关键节点识别</div><div class="v">0.78</div><div class="d">F1 · 4 类事件</div></div>
          <div class="k"><div class="l">当前极化指数</div><div class="v" id="curPi">0.58</div><div class="d" id="curSub">第 7 轮输出</div></div>
        </div>
      </div>
    </div>
  </div>

  <div class="pane" id="p2">
    <div class="panel" style="margin-bottom:14px">
      <div class="ph"><div class="t">关键节点与极化指数</div><div class="s">R1–R12 · 标注为人工核对节点</div></div>
      <div id="nodeChart" style="height:220px"></div>
    </div>
    <div class="panel">
      <div class="ph"><div class="t">推演关键节点</div><div class="s">E-2f7c9a · 与人工标注对照</div></div>
      <table class="tb" style="table-layout:fixed;width:100%">
        <colgroup><col style="width:8%"><col style="width:14%"><col style="width:34%"><col style="width:10%"><col style="width:20%"><col style="width:14%"></colgroup>
        <thead><tr><th>轮次</th><th>时间</th><th>节点</th><th>情感极性</th><th>立场分布</th><th>与标注一致</th></tr></thead>
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
      <div id="scn" style="height:260px"></div>
      <div style="font-size:11px;color:#8fa7ba;margin-top:6px">最终极化指数：无干预 0.73 · 权威发布 0.61 · 核查+引导 0.55</div>
    </div>
  </div>

  <div class="pane" id="p4">
    <div class="ks" style="margin-bottom:14px">
      <div class="k"><div class="l">本轮调用次数</div><div class="v">12</div><div class="d">6 类角色</div></div>
      <div class="k"><div class="l">累计耗时</div><div class="v">1.26<small style="font-size:12px;color:#8fa7ba"> s</small></div><div class="d">含编排开销</div></div>
      <div class="k"><div class="l">成功率</div><div class="v">98.2%</div><div class="d">失败重试 1.8%</div></div>
      <div class="k"><div class="l">降级次数</div><div class="v">0</div><div class="d">本轮未触发</div></div>
    </div>
    <div class="panel">
      <div class="ph"><div class="t">智能体调用链</div><div class="s">最近一轮 · 12 次调用</div></div>
      <table class="tb" style="table-layout:fixed;width:100%">
        <colgroup><col style="width:10%"><col style="width:12%"><col style="width:12%"><col style="width:30%"><col style="width:10%"><col style="width:10%"><col style="width:16%"></colgroup>
        <thead><tr><th>序号</th><th>调用方</th><th>被调方</th><th>动作</th><th>耗时</th><th>状态</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td class="mono">01</td><td>编排器</td><td>态势感知</td><td>拉取事件热度与传播态势</td><td>62.4ms</td><td><span class="badge b-cyan">成功</span></td><td>返回态势卡片</td></tr>
          <tr><td class="mono">02</td><td>编排器</td><td>事件理解</td><td>抽取要素并判定阶段</td><td>88.7ms</td><td><span class="badge b-cyan">成功</span></td><td>阶段=扩散</td></tr>
          <tr><td class="mono">03</td><td>事件理解</td><td>情感与立场</td><td>对 3,842 条评论打标</td><td>54.3ms</td><td><span class="badge b-cyan">成功</span></td><td>三任务联合</td></tr>
          <tr><td class="mono">04</td><td>编排器</td><td>传播推演</td><td>第 7 轮演化计算</td><td>143.6ms</td><td><span class="badge b-cyan">成功</span></td><td>曲线更新</td></tr>
          <tr><td class="mono">05</td><td>传播推演</td><td>风险研判</td><td>等级与置信度评估</td><td>96.2ms</td><td><span class="badge b-amber">复核</span></td><td>分歧 0.18</td></tr>
          <tr><td class="mono">06</td><td>风险研判</td><td>策略评估</td><td>候选模板收益评估</td><td>121.8ms</td><td><span class="badge b-cyan">成功</span></td><td>T-01 / T-03</td></tr>
        </tbody>
      </table>
    </div>
  </div>

`;
const RISK_HTML = `

  

  <div class="databar"><span>预警数据源</span>20 个验证机构 · 6,989 条已审核记录 · 新闻 3,675 / 官网线索 1,468 / 社媒 1,846 · 快照 2026-11-05</div>

  <div class="tabs" id="riskTabs">
    <div class="tab on" data-p="r1">态势总览</div>
    <div class="tab" data-p="r2">分级依据</div>
    <div class="tab" data-p="r3">干预方案</div>
    <div class="tab" data-p="r4">效果评估</div>
    <div class="tab" data-p="r5">报告预览</div>
  </div>

  <div class="pane on" id="r1">
    <div class="g g3">
      <div class="panel">
        <div class="ph"><div class="t">态势等级</div><div class="s">综合分值由七维加权</div></div>
        <div class="risk">
          <div class="lv"><b>二级</b><span>重大</span></div>
          <div><div class="score">0.74<small>/ 1.00</small></div>
            <div style="font-size:11px;color:#8fa7ba;margin-top:6px">响应时限 2 小时 · 日报 + 专报</div></div>
        </div>
        <div style="margin-top:16px">
          <div style="font-size:11px;color:#8fa7ba;letter-spacing:.12em;margin-bottom:8px">处置建议</div>
          <div class="tpl" style="cursor:default"><span class="id">01</span><div><div class="nm">2 小时内发布权威信息</div><div class="ds">针对「延期」传闻，发布时间线与事实清单</div></div></div>
          <div class="tpl" style="cursor:default;margin-top:8px"><span class="id">02</span><div><div class="nm">对高传播节点做事实核查</div><div class="ds">选取 5 个关键账号，定向推送核查结论</div></div></div>
          <div class="tpl" style="cursor:default;margin-top:8px"><span class="id">03</span><div><div class="nm">准备正面引导口径</div><div class="ds">面向摇摆群体，由意见领袖转发</div></div></div>
        </div>
        <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
          <span class="badge b-amber">人工复核：已确认</span><span class="badge b-cyan">置信度 0.86</span><span class="badge b-blue">报告已生成</span>
        </div>
      </div>
      <div class="panel">
        <div class="ph"><div class="t">七维风险画像</div><div class="s">0–1 归一化</div></div>
        <div id="radar" style="height:300px"></div>
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

    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">处置时间线</div><div class="s">从告警到复盘</div></div>
      <div style="display:flex;gap:0" id="tl"></div>
    </div>
  </div>

  <div class="pane" id="r2">
    <div class="panel">
      <div class="ph"><div class="t">分级规则</div><div class="s">综合分值 → 四级态势</div></div>
      <table class="tb" style="table-layout:fixed;width:100%">
        <colgroup><col style="width:22%"><col style="width:18%"><col style="width:18%"><col style="width:42%"></colgroup>
        <thead><tr><th>等级</th><th>综合分值</th><th>响应时限</th><th>报告要求</th></tr></thead>
        <tbody>
          <tr><td>一级（特别重大）</td><td class="mono">≥0.82</td><td>30 分钟</td><td>专报，同步电话报告</td></tr>
          <tr><td>二级（重大）</td><td class="mono">0.68–0.82</td><td>2 小时</td><td>日报 + 专报</td></tr>
          <tr><td>三级（较大）</td><td class="mono">0.52–0.68</td><td>6 小时</td><td>日报</td></tr>
          <tr><td>四级（一般）</td><td class="mono">&lt;0.52</td><td>24 小时</td><td>周报</td></tr>
        </tbody>
      </table>
      <div class="ph" style="margin-top:20px;margin-bottom:8px"><div class="t">七维权重</div><div class="s">合计 1.00</div></div>
      <table class="tb" id="weightTable" style="table-layout:fixed;width:100%">
        <colgroup><col style="width:40%"><col style="width:20%"><col style="width:20%"><col style="width:20%"></colgroup>
        <thead><tr><th>指标</th><th style="width:80px">权重</th><th style="width:80px">得分</th><th style="width:80px">贡献</th></tr></thead>
        <tbody>
          <tr><td>事件热度</td><td class="mono" style="text-align:center">0.18</td><td class="mono" style="text-align:center">0.78</td><td class="mono" style="text-align:center">0.140</td></tr>
          <tr><td>传播速度</td><td class="mono" style="text-align:center">0.16</td><td class="mono" style="text-align:center">0.66</td><td class="mono" style="text-align:center">0.106</td></tr>
          <tr><td>情感极性</td><td class="mono" style="text-align:center">0.15</td><td class="mono" style="text-align:center">0.71</td><td class="mono" style="text-align:center">0.107</td></tr>
          <tr><td>群体对立</td><td class="mono" style="text-align:center">0.17</td><td class="mono" style="text-align:center">0.74</td><td class="mono" style="text-align:center">0.126</td></tr>
          <tr><td>关键节点活跃度</td><td class="mono" style="text-align:center">0.12</td><td class="mono" style="text-align:center">0.62</td><td class="mono" style="text-align:center">0.074</td></tr>
          <tr><td>议题敏感度</td><td class="mono" style="text-align:center">0.11</td><td class="mono" style="text-align:center">0.80</td><td class="mono" style="text-align:center">0.088</td></tr>
          <tr><td>跨平台扩散</td><td class="mono" style="text-align:center">0.11</td><td class="mono" style="text-align:center">0.58</td><td class="mono" style="text-align:center">0.064</td></tr>
        </tbody>
      </table>
      <div style="margin-top:12px;font-size:11.5px;color:#8fa7ba">当前事件综合分值 0.74，落在二级区间；七项权重合计 1.00，阈值按事件类型分档。</div>
    </div>
  </div>

  <div class="pane" id="r3">
    <div class="g g2">
      <div class="panel">
        <div class="ph"><div class="t">干预模板</div><div class="s">1 套模板 · 4 类策略</div></div>
        <div class="tpls" id="tpls"></div>
        <div class="ctrl" style="margin-top:12px"><span class="badge b-cyan">合规审查通过</span><button class="btn">进入推演评估</button></div>
      </div>
      <div class="panel">
        <div class="ph"><div class="t">模板参数</div><div class="s" id="tplName">T-01 权威信息发布</div></div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
          <div class="k"><div class="l">干预对象</div><div class="v" style="font-size:15px" id="pObj">全体受众</div></div>
          <div class="k"><div class="l">介入时机</div><div class="v" style="font-size:15px" id="pTime">发酵初期</div></div>
          <div class="k"><div class="l">发布渠道</div><div class="v" style="font-size:15px" id="pCh">官方账号</div></div>
          <div class="k"><div class="l">强度</div><div class="v" style="font-size:15px" id="pLv">中</div></div>
          <div class="k"><div class="l">预期综合收益</div><div class="v" style="font-size:15px;color:#62e6d2" id="pGain">0.72</div></div>
          <div class="k"><div class="l">当前状态</div><div class="v" style="font-size:15px">原型</div></div>
        </div>
        <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
          <span class="badge b-blue">权威信息发布</span><span class="badge b-blue">事实核查</span><span class="badge b-blue">正面引导</span>
        </div>
      </div>
    </div>
  </div>

  <div class="pane" id="r4">
    <div class="panel">
      <div class="ph"><div class="t">干预效果对比</div><div class="s">同一事件 · 同一时点 · 对照组</div></div>
      <div id="cmp" style="height:260px"></div>
      <div class="ks" style="margin-top:8px">
        <div class="k"><div class="l">极化指数变化</div><div class="v" style="color:#62e6d2" id="kPi">−0.084</div><div class="d" id="kTpl">T-01</div></div>
        <div class="k"><div class="l">情感改善</div><div class="v" style="color:#62e6d2" id="kEmo">+6.8%</div><div class="d">负向占比下降</div></div>
        <div class="k"><div class="l">传播降温</div><div class="v" style="color:#62e6d2" id="kSpd">−11.4%</div><div class="d">转发量</div></div>
        <div class="k"><div class="l">综合收益</div><div class="v" style="color:#f6c66b" id="kGain">0.72</div><div class="d">越高越好</div></div>
      </div>
    </div>
  </div>

  <div class="pane" id="r5">
    <div class="panel">
      <div class="ph"><div class="t">报告预览</div><div class="s">二级 · 重大 · 生成于 10-19 21:00</div></div>
      <div style="background:#0a1727;border:1px solid var(--line);border-radius:12px;padding:18px 20px;font-size:12.5px;line-height:2;color:#cfe3ef">
        <div style="font-size:15px;font-weight:700;color:#e9f2fa;margin-bottom:8px">认知事件风险研判专报（E-2f7c9a）</div>
        <div>一、事件概况：10 月 18 日出现首条报道，截至 19 日 21 时，全网相关内容 3,842 条，参与账号 1,207 个，覆盖 4 个平台。</div>
        <div>二、风险研判：综合分值 0.74，等级二级（重大）。群体对立 0.74、议题敏感度 0.80，为主要驱动项；跨平台扩散 0.58，仍处可控区间。</div>
        <div>三、趋势判断：未来 6 小时极化指数预计升至 0.61–0.64，若不加干预，24 小时内可能进入一级区间。</div>
        <div>四、处置建议：2 小时内发布权威信息；对 5 个高传播节点定向核查；准备正面引导口径，视情由意见领袖转发。</div>
        <div style="margin-top:10px;color:#8fa7ba;font-size:11px">本报告为原型系统自动生成，数据来自推演环境，未经真实业务校验。</div>
        <div style="margin-top:14px;display:flex;gap:8px;align-items:center">
          <button class="btn">下载报告</button><button class="btn" style="background:#1d3853;color:#cfe3ef">复制要点</button>
          <span class="badge b-blue">报送：中心业务部门</span>
        </div>
      </div>
    </div>
  </div>

`;
function initMas(){

document.querySelectorAll('#masTabs .tab').forEach(function(tab){
  tab.onclick=function(){
    document.querySelectorAll('#masTabs .tab').forEach(function(x){x.classList.remove('on')});
    tab.classList.add('on');
    document.querySelectorAll('.pane').forEach(function(p){p.classList.remove('on')});
    var el=document.getElementById(tab.dataset.p); if(el) el.classList.add('on');
    if(window.ZGCLAB_SYNC_SYS) window.ZGCLAB_SYNC_SYS('mas', tab.dataset.p);
    setTimeout(function(){ window.dispatchEvent(new Event('resize')); },30);
  };
});

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
const logEl=document.getElementById('log');
function renderLog(){ logEl.innerHTML=logs.map(l=>`<div><span class="ts">${l[0]}</span><span class="${l[1]}">${l[2]}</span></div>`).join(''); logEl.scrollTop=9999; }
renderLog();

const rounds=['R1','R2','R3','R4','R5','R6','R7','R8','R9','R10','R11','R12'];
const actual=[.12,.21,.27,.33,.39,.44,.50,.55,.61,.66,.70,.73];
const pred=[.11,.20,.28,.32,.40,.45,.49,.56,.60,.67,.69,.74];
const pi=[.12,.21,.28,.33,.40,.45,.49,.56,.61,.67,.70,.74];

const c=echarts.init(document.getElementById('pline'));
function drawLine(n){
  c.setOption({
    backgroundColor:'transparent',
    grid:{left:34,right:12,top:26,bottom:22},
    tooltip:{trigger:'axis',backgroundColor:'#0d1c2e',borderColor:'#1d3853',textStyle:{color:'#e9f2fa',fontSize:11}},
    legend:{show:true,top:0,right:0,itemWidth:8,itemHeight:8,textStyle:{color:'#8fa7ba',fontSize:10}},
    xAxis:{type:'category',data:rounds,axisLine:{lineStyle:{color:'#1d3853'}},axisLabel:{color:'#8fa7ba',fontSize:10},axisTick:{show:false}},
    yAxis:{type:'value',min:0,max:1,splitLine:{lineStyle:{color:'#14283d'}},axisLabel:{color:'#8fa7ba',fontSize:10}},
    series:[
      {name:'实际',type:'line',smooth:true,symbolSize:4,data:actual.map((v,i)=>i<n?v:null),lineStyle:{color:'#62e6d2',width:2.5},itemStyle:{color:'#62e6d2'},areaStyle:{color:'#62e6d21a'}},
      {name:'推演',type:'line',smooth:true,symbolSize:4,data:pred.map((v,i)=>i<n?v:null),lineStyle:{color:'#73a7ff',width:2,type:'dashed'},itemStyle:{color:'#73a7ff'}}
    ]
  }, true);
}
drawLine(7);

const round=document.getElementById('round'), rt=document.getElementById('roundTxt'), rm=document.getElementById('roundMeta'), cur=document.getElementById('curPi');
round.oninput=function(){
  const n=+round.value;
  rt.textContent=n+' / 12';
  rm.textContent='第 '+n+' 轮 / 共 12 轮';
  drawLine(n);
  cur.textContent=pi[n-1].toFixed(2);
  var cs=document.getElementById('curSub'); if(cs) cs.textContent='第 '+n+' 轮输出';
};
document.getElementById('runBtn').onclick=function(){
  let n=+round.value; n=n>=12?1:n+1; round.value=n; round.oninput();
  const t=new Date(); const ts=[t.getHours(),t.getMinutes(),t.getSeconds()].map(x=>String(x).padStart(2,'0')).join(':');
  logs.push([ts,'ok','第 '+n+' 轮推演完成：极化指数 '+pi[n-1].toFixed(2)]);
  if(logs.length>14) logs.shift();
  renderLog();
};
document.querySelectorAll('#mode span').forEach(s=>s.onclick=()=>{
  document.querySelectorAll('#mode span').forEach(x=>x.classList.remove('on')); s.classList.add('on');
});

const nc=echarts.init(document.getElementById('nodeChart'));
nc.setOption({
  backgroundColor:'transparent',
  grid:{left:34,right:16,top:24,bottom:24},
  tooltip:{trigger:'axis',backgroundColor:'#0d1c2e',borderColor:'#1d3853',textStyle:{color:'#e9f2fa',fontSize:11}},
  xAxis:{type:'category',data:rounds,axisLine:{lineStyle:{color:'#1d3853'}},axisLabel:{color:'#8fa7ba',fontSize:10},axisTick:{show:false}},
  yAxis:{type:'value',min:0,max:1,splitLine:{lineStyle:{color:'#14283d'}},axisLabel:{color:'#8fa7ba',fontSize:10}},
  series:[{type:'line',smooth:true,symbolSize:6,data:pi,lineStyle:{color:'#62e6d2',width:2.5},itemStyle:{color:'#62e6d2'},
    markPoint:{symbolSize:38,label:{fontSize:9,color:'#06101d'},data:[
      {name:'R02',coord:['R2',pi[1]],value:'R02'},{name:'R04',coord:['R4',pi[3]],value:'R04'},
      {name:'R07',coord:['R7',pi[6]],value:'R07'},{name:'R10',coord:['R10',pi[9]],value:'R10'}]}}]
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
window.addEventListener('resize',function(){c.resize();s2.resize();nc.resize();});

(function(){
  const q=new URLSearchParams(location.search);
  const tab=q.get('tab');
  if(tab){var el=document.querySelector('#masTabs .tab[data-p="'+tab+'"]'); if(el) el.click();}
  const rd=q.get('round');
  if(rd){var r=document.getElementById('round'); if(r){r.value=rd; r.oninput();}}
})();

}
function initRisk(){

document.querySelectorAll('#riskTabs .tab').forEach(function(tab){
  tab.onclick=function(){
    document.querySelectorAll('#riskTabs .tab').forEach(function(x){x.classList.remove('on')});
    tab.classList.add('on');
    document.querySelectorAll('.pane').forEach(function(p){p.classList.remove('on')});
    var el=document.getElementById(tab.dataset.p); if(el) el.classList.add('on');
    if(window.ZGCLAB_SYNC_SYS) window.ZGCLAB_SYNC_SYS('risk', tab.dataset.p);
    setTimeout(function(){ window.dispatchEvent(new Event('resize')); },30);
  };
});

const TP=[
 {id:'T-01',name:'权威信息发布',obj:'全体受众',time:'发酵初期',ch:'官方账号',lv:'中',gain:'0.72',pi:'−0.084',emo:'+6.8%',spd:'−11.4%'},
 {id:'T-02',name:'事实核查',obj:'谣言受众',time:'扩散期',ch:'媒体+平台',lv:'强',gain:'0.64',pi:'−0.061',emo:'+5.2%',spd:'−8.7%'},
 {id:'T-03',name:'正面引导',obj:'摇摆群体',time:'极化前',ch:'意见领袖',lv:'中',gain:'0.58',pi:'−0.047',emo:'+3.9%',spd:'−5.6%'},
 {id:'T-04',name:'议题降温',obj:'对立群体',time:'高峰期',ch:'多平台',lv:'弱',gain:'0.49',pi:'−0.032',emo:'+2.1%',spd:'−4.3%'}
];
const tplBox=document.getElementById('tpls');
tplBox.innerHTML=TP.map((t,i)=>`
  <div class="tpl ${i===0?'on':''}" data-i="${i}">
    <span class="id">${t.id}</span>
    <div><div class="nm">${t.name}</div><div class="ds">${t.obj} · ${t.time} · ${t.ch} · ${t.lv}</div></div>
    <div style="margin-left:auto" class="mono">收益 ${t.gain}</div>
  </div>`).join('');

function pick(i){
  const t=TP[i];
  document.querySelectorAll('#tpls .tpl').forEach((x,k)=>x.classList.toggle('on',k===i));
  document.getElementById('tplName').textContent=t.id+' '+t.name;
  document.getElementById('pObj').textContent=t.obj;
  document.getElementById('pTime').textContent=t.time;
  document.getElementById('pCh').textContent=t.ch;
  document.getElementById('pLv').textContent=t.lv;
  document.getElementById('pGain').textContent=t.gain;
  document.getElementById('kPi').textContent=t.pi;
  document.getElementById('kEmo').textContent=t.emo;
  document.getElementById('kSpd').textContent=t.spd;
  document.getElementById('kGain').textContent=t.gain;
  document.getElementById('kTpl').textContent=t.id;
  const base=[.47,.52,.56,.60,.63,.66,.68,.70,.71];
  const cut={0:.06,1:.045,2:.035,3:.025}[i]||0;
  const treat=base.map((v,k)=>+(v-cut*k/8).toFixed(3));
  cmp.setOption({series:[{name:'对照组',data:base},{name:'干预组',data:treat}]});
}
document.querySelectorAll('#tpls .tpl').forEach(el=>el.onclick=()=>pick(+el.dataset.i));

const tl=[['T+0','发现','系统告警，人工复核'],['T+2h','发布','权威信息上线'],['T+6h','核查','5 个节点定向推送'],['T+24h','复盘','效果回写模板']];
document.getElementById('tl').innerHTML=tl.map(function(x,i){return '<div style="flex:1;text-align:center"><div style="width:26px;height:26px;border-radius:50%;margin:0 auto 6px;background:'+(i<3?'#62e6d2':'#1d3853')+';color:#06101d;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center">'+(i+1)+'</div><div style="font-size:11px;color:#cfe3ef">'+x[0]+' · '+x[1]+'</div><div style="font-size:10px;color:#8fa7ba">'+x[2]+'</div></div>';}).join('');

const r=echarts.init(document.getElementById('radar'));
r.setOption({
  backgroundColor:'transparent',
  radar:{indicator:[{name:'热度',max:1},{name:'速度',max:1},{name:'情感',max:1},{name:'对立',max:1},{name:'节点',max:1},{name:'敏感',max:1},{name:'扩散',max:1}],
    radius:'64%',center:['50%','52%'],axisName:{color:'#8fa7ba',fontSize:11},splitLine:{lineStyle:{color:'#1d3853'}},
    splitArea:{areaStyle:{color:['#0a1727','#0d1c2e']}},axisLine:{lineStyle:{color:'#1d3853'}}},
  series:[{type:'radar',symbolSize:4,data:[{value:[.78,.66,.71,.74,.62,.80,.58],name:'当前',lineStyle:{color:'#62e6d2',width:2},itemStyle:{color:'#62e6d2'},areaStyle:{color:'#62e6d233'}}]}]
});

const cmp=echarts.init(document.getElementById('cmp'));
const xs=['T0','T+1','T+2','T+3','T+4','T+5','T+6','T+7','T+8'];
const base=[.47,.52,.56,.60,.63,.66,.68,.70,.71];
cmp.setOption({
  backgroundColor:'transparent',
  grid:{left:34,right:10,top:26,bottom:22},
  tooltip:{trigger:'axis',backgroundColor:'#0d1c2e',borderColor:'#1d3853',textStyle:{color:'#e9f2fa',fontSize:11}},
  legend:{top:0,right:0,itemWidth:8,itemHeight:8,textStyle:{color:'#8fa7ba',fontSize:10}},
  xAxis:{type:'category',data:xs,axisLine:{lineStyle:{color:'#1d3853'}},axisLabel:{color:'#8fa7ba',fontSize:10},axisTick:{show:false}},
  yAxis:{type:'value',min:.35,max:.75,splitLine:{lineStyle:{color:'#14283d'}},axisLabel:{color:'#8fa7ba',fontSize:10}},
  series:[
    {name:'对照组',type:'line',smooth:true,symbolSize:3,data:base,lineStyle:{color:'#ff7f86',width:2},itemStyle:{color:'#ff7f86'}},
    {name:'干预组',type:'line',smooth:true,symbolSize:3,data:[.47,.49,.51,.53,.55,.57,.59,.60,.61],lineStyle:{color:'#62e6d2',width:2.5},itemStyle:{color:'#62e6d2'},areaStyle:{color:'#62e6d21a'}}
  ]
});
window.addEventListener('resize',function(){r.resize();cmp.resize();});

(function(){
  const q=new URLSearchParams(location.search);
  const tab=q.get('tab');
  if(tab){var el=document.querySelector('#riskTabs .tab[data-p="'+tab+'"]'); if(el) el.click();}
  const tp=q.get('tpl');
  if(tp){var el2=document.querySelector('#tpls .tpl[data-i="'+tp+'"]'); if(el2) el2.click();}
})();

}

window.ZGCLAB_SYSTEMS = function (name, tab) {
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
  const dft = name === 'risk' ? 'r1' : 'p1';
  const cur = tab || dft;
  if (tab) {
    const el = view.querySelector('.tab[data-p="' + tab + '"]');
    if (el) { el.click(); return; }
  }
  if (window.ZGCLAB_SYNC_SYS) window.ZGCLAB_SYNC_SYS(name, cur);
};
