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
          <span class="lb" id="roundMeta">第 7 轮 / 共 12 轮</span>
          <div class="seg" id="mode"><span class="on">单情景</span><span>多情景对比</span></div>
          <button class="btn" id="runBtn">继续推演</button>
        </div>
      </div>
      <div class="panel">
        <div class="ph"><div class="t">极化指数推演</div><div class="s">实际 vs 推演</div></div>
        <div id="pline" style="height:190px"></div>
        <div class="ks" style="margin-top:10px;grid-template-columns:1fr 1fr">
          <div class="k"><div class="l">端到端单轮</div><div class="v">4.82<small style="font-size:12px;color:#8fa7ba"> s</small></div><div class="d">6 类角色 · 12 轮 · 含模型推理</div></div>
          <div class="k"><div class="l">消息吞吐</div><div class="v">1247<small style="font-size:12px;color:#8fa7ba"> 条/秒</small></div><div class="d">总线峰值</div></div>
          <div class="k"><div class="l">关键节点识别</div><div class="v">0.78</div><div class="d">F1 · 4 类事件 · ±1 轮匹配</div></div>
          <div class="k"><div class="l">当前极化指数</div><div class="v" id="curPi">0.58</div><div class="d" id="curSub">第 7 轮输出</div></div>
        </div>
      </div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">事件卡片</div><div class="s">E-2f7c9a · 突发公共事件 · 快照 11-05</div></div>
      <div class="kv">
        <div><span>首报时间</span><b>10-18 09:00</b></div>
        <div><span>当前阶段</span><b>群体极化临界</b></div>
        <div><span>参与账号</span><b>1,207 个</b></div>
        <div><span>覆盖平台</span><b>4 个</b></div>
        <div><span>相关内容</span><b>3,842 条</b></div>
        <div><span>主导情绪</span><b>愤怒 38%</b></div>
        <div><span>立场分布</span><b>支持 24 / 反对 41</b></div>
        <div><span>推演轮次</span><b>12 轮</b></div>
      </div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">传播指标体系</div><div class="s">12 项 · 与 2.4.1 节口径一致</div></div>
      <table class="tb" style="table-layout:fixed;width:100%">
        <colgroup><col style="width:14%"><col style="width:26%"><col style="width:44%"><col style="width:16%"></colgroup>
        <thead><tr><th>维度</th><th>指标</th><th>计算口径</th><th>取值</th></tr></thead>
        <tbody>
          <tr><td>广度</td><td>覆盖平台数</td><td>事件内容出现的平台数量</td><td class="mono">1–9</td></tr>
          <tr><td>广度</td><td>参与账号数</td><td>去重后参与讨论的账号数</td><td class="mono">整数</td></tr>
          <tr><td>广度</td><td>内容触达量</td><td>阅读/播放量的对数归一</td><td class="mono">0.00–1.00</td></tr>
          <tr><td>速度</td><td>单位时间增量</td><td>每小时新增内容数</td><td class="mono">条/小时</td></tr>
          <tr><td>速度</td><td>峰值到达时间</td><td>从首报到峰值的时长</td><td class="mono">小时</td></tr>
          <tr><td>速度</td><td>扩散加速度</td><td>增量的二阶差分</td><td class="mono">条/小时²</td></tr>
          <tr><td>强度</td><td>极性均值</td><td>情感极性加权平均</td><td class="mono">-1.00–1.00</td></tr>
          <tr><td>强度</td><td>情绪熵</td><td>五类情绪分布的香农熵</td><td class="mono">0.00–1.00</td></tr>
          <tr><td>强度</td><td>极端表达占比</td><td>强负面+强正面内容占比</td><td class="mono">0.00–1.00</td></tr>
          <tr><td>分化</td><td>立场熵</td><td>支持/反对/中立分布的熵</td><td class="mono">0.00–1.00</td></tr>
          <tr><td>分化</td><td>群体间距离</td><td>两群体立场均值之差</td><td class="mono">0–2</td></tr>
          <tr><td>分化</td><td>对立指数</td><td>互斥引用占全部引用的比例</td><td class="mono">0.00–1.00</td></tr>
        </tbody>
      </table>
      <div class="note">指标按四个维度展开，取值 0.00–1.00 的为归一化结果；事件卡片上的阶段判定由节点密度和立场熵共同确定。</div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">阶段演化</div><div class="s">事件触发 → 信息扩散 → 观点表达 → 群体极化</div></div>
      <div class="tl2">
        <div><b>R01–R02</b><span>事件触发</span><small>首条报道，话题创建，热度 0.31</small></div>
        <div><b>R03–R05</b><span>信息扩散</span><small>转发拐点，媒体跟进，热度 0.52</small></div>
        <div><b>R06–R08</b><span>观点表达</span><small>立场内容上升，意见领袖入场</small></div>
        <div><b>R09–R12</b><span>群体极化</span><small>对立话题出现，极化指数 0.58 → 0.73</small></div>
      </div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">推演精度抽检</div><div class="s">近 30 日回测 · 子任务1（舆论推演）与子任务2（多智能体）分列</div></div>
      <div class="kv">
        <div><span>多智能体协同准确率 · 子任务2</span><b>72.9%</b></div>
        <div><span>极化趋势方向准确率 · 子任务1</span><b>76.34%</b></div>
        <div><span>关键节点识别 F1（±1 轮匹配）</span><b>0.78</b></div>
        <div><span>阶段判定准确率 / 极化指数 MAE</span><b>83.3% / 0.043</b></div>
      </div>
      <table class="tb" style="table-layout:fixed;width:100%;margin-top:12px">
        <colgroup><col style="width:24%"><col style="width:16%"><col style="width:16%"><col style="width:18%"><col style="width:26%"></colgroup>
        <thead><tr><th>事件类型</th><th>回测样本数</th><th>方向正确</th><th>方向准确率</th><th>F1（±1 轮匹配）</th></tr></thead>
        <tbody>
          <tr><td>突发公共事件</td><td class="mono">412</td><td class="mono">326</td><td class="mono">79.13%</td><td class="mono">0.78</td></tr>
          <tr><td>政策争议</td><td class="mono">356</td><td class="mono">269</td><td class="mono">75.56%</td><td class="mono">0.74</td></tr>
          <tr><td>企业舆情</td><td class="mono">302</td><td class="mono">232</td><td class="mono">76.82%</td><td class="mono">0.81</td></tr>
          <tr><td>国际议题</td><td class="mono">198</td><td class="mono">141</td><td class="mono">71.21%</td><td class="mono">0.76</td></tr>
          <tr><td>合计</td><td class="mono">1,268</td><td class="mono">968</td><td class="mono">76.34%</td><td class="mono">0.78</td></tr>
        </tbody>
      </table>
      <div class="note">方向准确率指下一轮极化指数变化方向判定正确的比例，968 / 1,268 = 76.34%；关键节点 F1 按节点时间 ±1 轮匹配，4 类事件为 0.78 / 0.74 / 0.81 / 0.76（范围 0.74–0.81），整体 0.78 取 2.4.2 表13 报告值。MAE 0.043 属 2.4.1 推演模块，与 2.4.3 风险预测模型口径不同，不混用。</div>
    </div>

    <!-- ==== MAS p1 扩充开始（由 enrich/merge.py 注入）==== -->


    <!-- ① 推演任务队列 -->
    <div class="panel" style="margin-top:14px">
      <div class="ph">
        <div class="t">推演任务队列</div>
        <div class="s">近 7 日 · 18 个批次 · 216 轮 · 与 2.4.1 推演模块同口径</div>
      </div>
      <div class="ks">
        <div class="k"><div class="l">近 7 日批次</div><div class="v">18<small class="mp1-u"> 个</small></div><div class="d">12 轮定长 · 18/18 完成</div></div>
        <div class="k"><div class="l">累计推演轮次</div><div class="v">216<small class="mp1-u"> 轮</small></div><div class="d">18 批 × 12 轮 · 6 类角色</div></div>
        <div class="k"><div class="l">平均单轮耗时</div><div class="v">4.82<small class="mp1-u"> s</small></div><div class="d">含角色计算与模型推理</div></div>
        <div class="k"><div class="l">消息总线峰值</div><div class="v">1247<small class="mp1-u"> 条/秒</small></div><div class="d">黑板 + 消息总线</div></div>
      </div>
      <div class="tablewrap mp1-tw">
        <table class="tb mp1-tb" style="table-layout:fixed;width:100%">
          <colgroup><col style="width:15%"><col style="width:13%"><col style="width:12%"><col style="width:7%"><col style="width:12%"><col style="width:11%"><col style="width:13%"><col style="width:17%"></colgroup>
          <thead><tr><th>批次</th><th>事件类型</th><th>事件号</th><th>轮次</th><th>单轮均耗时</th><th>总耗时</th><th>终值极化指数</th><th>状态</th></tr></thead>
          <tbody>
            <tr><td class="mono mp1-b">MAS-1118-02</td><td>突发公共事件</td><td class="mono">E-2f7c9a</td><td class="mono">12</td><td class="mono">4.82 s</td><td class="mono">57.84 s</td><td class="mono">0.7341</td><td><span class="badge b-cyan">已完成 · 复核</span></td></tr>
            <tr><td class="mono mp1-b">MAS-1118-01</td><td>政策争议</td><td class="mono">E-9a31d0</td><td class="mono">12</td><td class="mono">4.96 s</td><td class="mono">59.52 s</td><td class="mono">0.6287</td><td><span class="badge b-cyan">已完成</span></td></tr>
            <tr><td class="mono mp1-b">MAS-1117-03</td><td>企业舆情</td><td class="mono">E-4c08be</td><td class="mono">12</td><td class="mono">4.63 s</td><td class="mono">55.56 s</td><td class="mono">0.5512</td><td><span class="badge b-amber">降级完成</span></td></tr>
            <tr><td class="mono mp1-b">MAS-1117-02</td><td>国际议题</td><td class="mono">E-7d52fa</td><td class="mono">12</td><td class="mono">4.88 s</td><td class="mono">58.56 s</td><td class="mono">0.6913</td><td><span class="badge b-cyan">已完成</span></td></tr>
            <tr><td class="mono mp1-b">MAS-1117-01</td><td>突发公共事件</td><td class="mono">E-1b6e47</td><td class="mono">12</td><td class="mono">4.91 s</td><td class="mono">58.92 s</td><td class="mono">0.8104</td><td><span class="badge b-blue">重试后完成</span></td></tr>
            <tr><td class="mono mp1-b">MAS-1116-01</td><td>政策争议</td><td class="mono">E-6f2a83</td><td class="mono">12</td><td class="mono">4.74 s</td><td class="mono">56.88 s</td><td class="mono">0.4408</td><td><span class="badge b-cyan">已完成</span></td></tr>
            <tr><td class="mono mp1-b">MAS-1115-02</td><td>企业舆情</td><td class="mono">E-3e9d15</td><td class="mono">12</td><td class="mono">4.86 s</td><td class="mono">58.32 s</td><td class="mono">0.3076</td><td><span class="badge b-cyan">已完成</span></td></tr>
            <tr><td class="mono mp1-b">MAS-1115-01</td><td>国际议题</td><td class="mono">E-8c4b26</td><td class="mono">12</td><td class="mono">4.76 s</td><td class="mono">57.12 s</td><td class="mono">0.7064</td><td><span class="badge b-cyan">已完成</span></td></tr>
            <tr class="mp1-sum"><td class="mono">近 7 日合计</td><td>4 类事件</td><td class="mono">18 批</td><td class="mono">216</td><td class="mono">4.82 s</td><td class="mono">1,041.12 s</td><td class="mono">—</td><td>18/18 完成</td></tr>
          </tbody>
        </table>
      </div>
      <div class="mp1-foot">
        <span class="badge b-cyan">已完成 16</span>
        <span class="badge b-blue">重试后完成 1</span>
        <span class="badge b-amber">降级完成 1</span>
        <span class="mp1-foot-t">总耗时 = 单轮均耗时 × 12 · 上表 8 批合计 462.72 s</span>
      </div>
      <div class="note">首行 MAS-1118-02 为 11-05 快照事件 E-2f7c9a 的复核重推批次：第 12 轮终值 0.7341（取两位小数 0.73），与「阶段演化」R09–R12 的 0.58 → 0.73 一致。「降级完成」指传播推演超时后改走规则兜底，仍输出完整 12 轮，不回写主链。</div>
    </div>

    <!-- ②③ 多指标联动 + 运行稳定性 -->
    <div class="mp1-row">
      <div class="panel">
        <div class="ph">
          <div class="t">舆情演化多指标联动</div>
          <div class="s">热度 / 立场熵 / 对立指数 · R1–R12 · 归一化 0.00–1.00</div>
        </div>
        <div class="mp1-bar">
          <div class="mp1-chips" id="mp1-range">
            <span class="mp1-chip on" data-f="0" data-t="12">全 12 轮</span>
            <span class="mp1-chip" data-f="0" data-t="6">R1–R6</span>
            <span class="mp1-chip" data-f="6" data-t="12">R7–R12</span>
          </div>
          <div class="mp1-bartip">虚竖线 R9 = 极化临界 · 底色四段与「阶段演化」同口径</div>
        </div>
        <div class="mp1-chart" id="mp1-trend" style="height:330px"></div>
        <div class="mp1-stats">
          <div class="mp1-st"><div class="l">热度峰值</div><div class="v">0.781</div><div class="d">R12 · 较 R1 升 0.469</div></div>
          <div class="mp1-st"><div class="l">立场熵 R12</div><div class="v">0.9330</div><div class="d">支持 24 / 反对 52 / 中立 24</div></div>
          <div class="mp1-st"><div class="l">对立指数 R12</div><div class="v">0.612</div><div class="d">R6 → R12 升 0.306</div></div>
          <div class="mp1-st"><div class="l">三线同向</div><div class="v">9<small> / 11</small></div><div class="d">R7、R11 为反向轮</div></div>
        </div>
        <div class="note">三指标均归一化到 0.00–1.00：热度取阅读/播放量对数归一；立场熵为支持/反对/中立三类分布的香农熵除以 ln3；对立指数为互斥引用占全部引用的比例。R7 立场熵回落 0.013，是中立群体收缩所致，与「极化临界」判定一致。</div>
      </div>
      <div class="panel">
        <div class="ph">
          <div class="t">运行稳定性与资源占用</div>
          <div class="s">近 7 日 · 1,284 次调用 · 216 轮 × 6 类角色</div>
        </div>
        <div class="mp1-chart" id="mp1-stab" style="height:168px"></div>
        <div class="mp1-stats mp1-stats-2">
          <div class="mp1-st"><div class="l">调用总数</div><div class="v">1,284<small> 次</small></div><div class="d">计划 1,296 · 合并 12</div></div>
          <div class="mp1-st"><div class="l">首轮失败</div><div class="v">23<small> 次</small></div><div class="d">占 1.79% · 重试后恢复</div></div>
          <div class="mp1-st"><div class="l">降级兜底</div><div class="v">2<small> 次</small></div><div class="d">规则兜底，不回写主链</div></div>
          <div class="mp1-st"><div class="l">最终成功率</div><div class="v">98.21<small> %</small></div><div class="d">1,261 / 1,284</div></div>
        </div>
        <div class="mp1-meters">
          <div class="mp1-meter"><span>CPU 均值</span><div class="track"><i style="width:42.3%"></i></div><b>42.3%</b></div>
          <div class="mp1-meter"><span>CPU 峰值</span><div class="track"><i class="mp1-warn" style="width:61.8%"></i></div><b>61.8%</b></div>
          <div class="mp1-meter"><span>内存峰值</span><div class="track"><i class="mp1-blue" style="width:48.3%"></i></div><b>3.86 GB</b></div>
          <div class="mp1-meter"><span>推理占单轮</span><div class="track"><i class="mp1-blue" style="width:73.86%"></i></div><b>73.86%</b></div>
        </div>
        <div class="note">1,284 = 216 轮 × 6 类角色 1,296 次计划调用减去 12 次同轮复核合并（12 次均发生在 11-18 的两个批次）；23 次首轮失败各重试 1 次后恢复，2 次改走规则兜底降级。1,261 / 1,284 = 98.21% 为调用口径，与「智能体调用链」分角色统计同源。内存上限 8 GB。</div>
      </div>
    </div>

    <!-- ④ 角色负载与并行通道 -->
    <div class="panel mp1-row-full">
      <div class="ph">
        <div class="t">智能体角色负载与并行通道</div>
        <div class="s">6 类角色 · 每轮 2 路并行 · 12 轮 · 24 角色轮</div>
      </div>
      <div class="mp1-gwrap">
        <div class="mp1-gantt" id="mp1-gantt"></div>
        <div class="mp1-gside">
          <div class="mp1-split">
            <div class="mp1-split-h"><span>单轮耗时构成</span><b>4.8200 s</b></div>
            <div class="mp1-splitbar">
              <i class="mp1-s-role" style="width:26.1411%" title="编排调度 1.26 s"></i>
              <i class="mp1-s-infer" style="width:73.8589%" title="模型推理 3.56 s"></i>
            </div>
            <div class="mp1-splitl">
              <div><i class="mp1-s-role"></i><span>编排调度</span><b>1.2600 s</b><small>26.14%</small></div>
              <div><i class="mp1-s-infer"></i><span>模型推理</span><b>3.5600 s</b><small>73.86%</small></div>
            </div>
          </div>
          <div class="mp1-k2">
            <div><span>并行通道</span><b>2 路</b><small>主链下发 · 池上限 4 路</small></div>
            <div><span>角色轮占用</span><b>24 / 24</b><small>12 轮 × 2 路</small></div>
            <div><span>关键路径</span><b>0.3616 s</b><small>占单轮 7.50%</small></div>
            <div><span>峰值负载</span><b>0.94</b><small>风险研判 · R9</small></div>
          </div>
        </div>
      </div>
      <div class="mp1-glegend">
        <span class="mp1-lgt"><i class="mp1-c mp1-lv1"></i>&lt;0.70</span>
        <span class="mp1-lgt"><i class="mp1-c mp1-lv2"></i>0.70–0.84</span>
        <span class="mp1-lgt"><i class="mp1-c mp1-lv3"></i>0.85–0.89</span>
        <span class="mp1-lgt"><i class="mp1-c mp1-lv4"></i>≥0.90</span>
        <span class="mp1-glegend-t">负载 = 该角色当轮消息数与调用次数 / 该角色峰值，取值 0.00–1.00</span>
      </div>
      <div class="note">每轮由编排层同时下发 2 路：通道 A（感知 → 理解 → 立场）与通道 B（推演 → 研判 → 策略），单轮占用 2 个角色，12 轮共 24 角色轮；编排池席位上限 4 路（见「智能体调用链」），复核与分支调用按需占用其余席位，本表只记主链 2 路。角色计算墙钟取两路较长者 0.3616 s（通道 B：143.6 + 96.2 + 121.8 ms）；6 类角色累计 0.5670 s，加复核/分支 0.2421 s 即「智能体调用链」的本轮 809 ms 调用时延。角色名下的毫秒为本轮（第 12 轮）单次时延，7 日平均时延见该页分角色统计。「智能体集群」卡中的运行/等待是进程在线与排队状态，与本表通道占用不是同一口径。</div>
    </div>

    <!-- ⑤⑥ 采样标注质量 + 指标趋势 -->
    <div class="mp1-row mp1-row-q">
      <div class="panel">
        <div class="ph">
          <div class="t">采样与标注质量</div>
          <div class="s">抽检 420 条 · 6 个标注字段 · 占已审核记录 6.01%</div>
        </div>
        <div class="mp1-stats">
          <div class="mp1-st"><div class="l">抽检记录</div><div class="v">420<small> 条</small></div><div class="d">6,989 条的 6.01%</div></div>
          <div class="mp1-st"><div class="l">合格记录</div><div class="v">406<small> 条</small></div><div class="d">合格率 96.67%</div></div>
          <div class="mp1-st"><div class="l">综合 κ</div><div class="v">0.8409</div><div class="d">阈值 0.80 · 6 项均值</div></div>
          <div class="mp1-st"><div class="l">专家仲裁</div><div class="v">14<small> 条</small></div><div class="d">3.33% · 已回写标注集</div></div>
        </div>
        <div class="tablewrap mp1-tw">
          <table class="tb mp1-tb" style="table-layout:fixed;width:100%">
            <colgroup><col style="width:24%"><col style="width:13%"><col style="width:14%"><col style="width:15%"><col style="width:16%"><col style="width:18%"></colgroup>
            <thead><tr><th>标注字段</th><th>抽样条数</th><th>复标一致</th><th>一致率</th><th>Cohen κ</th><th>判定</th></tr></thead>
            <tbody>
              <tr><td>情感极性</td><td class="mono">420</td><td class="mono">396</td><td class="mono">94.29%</td><td class="mono">0.8871</td><td><span class="badge b-cyan">达标</span></td></tr>
              <tr><td>情绪类别</td><td class="mono">420</td><td class="mono">389</td><td class="mono">92.62%</td><td class="mono">0.8694</td><td><span class="badge b-cyan">达标</span></td></tr>
              <tr><td>立场归属</td><td class="mono">420</td><td class="mono">378</td><td class="mono">90.00%</td><td class="mono">0.8452</td><td><span class="badge b-cyan">达标</span></td></tr>
              <tr><td>事件阶段</td><td class="mono">420</td><td class="mono">371</td><td class="mono">88.33%</td><td class="mono">0.8213</td><td><span class="badge b-cyan">达标</span></td></tr>
              <tr><td>关键节点</td><td class="mono">420</td><td class="mono">362</td><td class="mono">86.19%</td><td class="mono">0.7906</td><td><span class="badge b-amber">待复标</span></td></tr>
              <tr><td>极化指数</td><td class="mono">420</td><td class="mono">388</td><td class="mono">92.38%</td><td class="mono">0.8318</td><td><span class="badge b-cyan">达标</span></td></tr>
              <tr class="mp1-sum"><td>合计 / 均值</td><td class="mono">2,520</td><td class="mono">2,284</td><td class="mono">90.63%</td><td class="mono">0.8409</td><td>6 项 · 5 达标</td></tr>
            </tbody>
          </table>
        </div>
        <div class="note">κ 为两名标注员复标的 Cohen's κ，一致率 = 复标一致 / 420，合计行按 6 个字段汇总（2,284 / 2,520 = 90.63%），综合 κ 取 6 项算术平均。关键节点 κ 0.7906 低于 0.80 内部阈值，已列入 11 月复标计划。此处衡量标注员之间的一致性，与 2.4.2 阶段判定准确率 83.3%（模型判定正确性）不是同一指标。</div>
      </div>
      <div class="panel">
        <div class="ph">
          <div class="t">关键指标趋势</div>
          <div class="s">2026-06 → 2026-11 · 6 项 · 末值即报告值</div>
        </div>
        <div class="mp1-sparks" id="mp1-sparks"></div>
        <div class="mp1-goals">
          <div class="mp1-goals-h"><span>要求值对照</span><span class="badge b-cyan">2 项均达标</span></div>
          <div class="mp1-goal">
            <span>极化趋势方向准确率</span>
            <div class="track"><i style="width:76.34%"></i><b style="left:75%"></b></div>
            <em>76.34<small>%</small> <i>/ 要求 75%</i></em>
          </div>
          <div class="mp1-goal">
            <span>多智能体协同准确率</span>
            <div class="track"><i style="width:72.9%"></i><b style="left:70%"></b></div>
            <em>72.9<small>%</small> <i>/ 要求 70%</i></em>
          </div>
        </div>
        <div class="note">6 项月度值末值：76.34% / 0.78 / 83.3% / 0.043 / 72.9% / 4.82 s；其中 76.34%、72.9%、4.82 s 与年度报告 2.4.1、2.4.2 节口径一致，其余为本原型自评值，不作为对外结论。迷你图与对照条的琥珀虚线 / 竖线为要求值（75% / 70%）；MAE 与单轮耗时两项越低越好，按下降标蓝。</div>
      </div>
    </div>
    <!-- ==== MAS p1 扩充结束 ==== -->
  </div>

  <div class="pane" id="p2">
    <div class="panel" style="margin-bottom:14px">
      <div class="ph"><div class="t">关键节点与极化指数</div><div class="s">R1–R12 · 标注为人工核对节点</div></div>
      <div id="nodeChart" style="height:220px"></div>
    </div>
    <div class="panel">
      <div class="ph"><div class="t">推演关键节点</div><div class="s">E-2f7c9a · 节选 4 个节点 · 全部 8 个见下方明细</div></div>
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

    <div class="ks" style="margin:14px 0">
      <div class="k"><div class="l">关键节点识别</div><div class="v">0.78</div><div class="d">F1 · ±1 轮匹配</div></div>
      <div class="k"><div class="l">与人工标注一致</div><div class="v">87.5%</div><div class="d">8 节点 · 8 标注 · 7 吻合</div></div>
      <div class="k"><div class="l">平均提前量</div><div class="v">6.2<small style="font-size:12px;color:#8fa7ba"> h</small></div><div class="d">相对人工发现</div></div>
      <div class="k"><div class="l">漏报节点</div><div class="v">1</div><div class="d">R11 次级话题</div></div>
    </div>

    <div class="panel" style="margin-bottom:14px">
      <div class="ph"><div class="t">节点筛选</div><div class="s">按类型查看 · 试验版本</div></div>
      <div class="chips">
        <span class="chip on">全部 8</span><span class="chip">事件触发 1</span><span class="chip">媒体介入 2</span>
        <span class="chip">意见领袖 1</span><span class="chip">立场转向 2</span><span class="chip">对立升级 2</span>
      </div>
      <div class="mini">筛选只影响列表，不改变下方图表和一致性统计；节点类型由规则和人工标注共同确定。</div>
    </div>

    <div class="panel" style="margin-bottom:14px">
      <div class="ph"><div class="t">节点明细</div><div class="s">R1–R12 · 情感极性与立场分布</div></div>
      <table class="tb" style="table-layout:fixed;width:100%">
        <colgroup><col style="width:7%"><col style="width:10%"><col style="width:12%"><col style="width:29%"><col style="width:10%"><col style="width:18%"><col style="width:14%"></colgroup>
        <thead><tr><th>轮次</th><th>节点类型</th><th>时间</th><th>事件</th><th>极性</th><th>立场（支/反/中）</th><th>一致性</th></tr></thead>
        <tbody>
          <tr><td class="mono">R02</td><td>事件触发</td><td>10-18 09:00</td><td>首条报道出现，话题创建</td><td>−0.12</td><td>18 / 9 / 73</td><td><span class="badge b-cyan">一致</span></td></tr>
          <tr><td class="mono">R03</td><td>媒体介入</td><td>10-18 11:20</td><td>地方媒体转载，报道量翻倍</td><td>−0.18</td><td>19 / 14 / 67</td><td><span class="badge b-cyan">一致</span></td></tr>
          <tr><td class="mono">R04</td><td>媒体介入</td><td>10-18 15:00</td><td>转发量出现拐点，媒体跟进</td><td>−0.28</td><td>21 / 26 / 53</td><td><span class="badge b-cyan">一致</span></td></tr>
          <tr><td class="mono">R05</td><td>意见领袖</td><td>10-18 20:40</td><td>两名本地博主转发并质询</td><td>−0.33</td><td>22 / 31 / 47</td><td><span class="badge b-cyan">一致</span></td></tr>
          <tr><td class="mono">R07</td><td>立场转向</td><td>10-19 11:00</td><td>立场性内容占比上升，意见领袖入场</td><td>−0.41</td><td>24 / 41 / 35</td><td><span class="badge b-amber">部分一致</span></td></tr>
          <tr><td class="mono">R08</td><td>立场转向</td><td>10-19 15:30</td><td>出现“延期”与“照常”两套叙事</td><td>−0.47</td><td>25 / 44 / 31</td><td><span class="badge b-cyan">一致</span></td></tr>
          <tr><td class="mono">R10</td><td>对立升级</td><td>10-19 21:00</td><td>群体间立场距离扩大，出现对立话题</td><td>−0.53</td><td>26 / 48 / 26</td><td><span class="badge b-cyan">一致</span></td></tr>
          <tr><td class="mono">R12</td><td>对立升级</td><td>10-20 09:00</td><td>对立话题跨平台扩散，负面占比 62%</td><td>−0.58</td><td>24 / 52 / 24</td><td><span class="badge b-amber">待复核</span></td></tr>
        </tbody>
      </table>
      <div class="note">一致性口径：节点时间、类型、立场分布三项均与人工标注吻合记为“一致”；时间相差 1 轮以内、其余吻合记为“部分一致”。</div>
    </div>

    <div class="panel" style="margin-bottom:14px">
      <div class="ph"><div class="t">节点识别方法与阈值</div><div class="s">规则候选 → 模型打分 → 人工核对</div></div>
      <div class="flow">
        <div class="node"><b>STEP 1</b>多源信号</div><span class="arw">→</span>
        <div class="node"><b>STEP 2</b>规则候选</div><span class="arw">→</span>
        <div class="node"><b>STEP 3</b>模型打分</div><span class="arw">→</span>
        <div class="node"><b>STEP 4</b>人工核对</div><span class="arw">→</span>
        <div class="node"><b>OUT</b>节点清单与一致性</div>
      </div>
      <table class="tb" style="table-layout:fixed;width:100%;margin-top:12px">
        <colgroup><col style="width:18%"><col style="width:28%"><col style="width:32%"><col style="width:22%"></colgroup>
        <thead><tr><th>判定维度</th><th>触发条件</th><th>说明</th><th>本轮命中</th></tr></thead>
        <tbody>
          <tr><td>事件触发</td><td>首条报道出现并创建话题</td><td>同一实体在多平台同时出现</td><td class="mono">R02</td></tr>
          <tr><td>媒体介入</td><td>6 小时内 ≥3 家媒体跟进</td><td>去重媒体账号，不含单纯转载</td><td class="mono">R03、R04</td></tr>
          <tr><td>意见领袖</td><td>影响力前 5% 账号立场转向</td><td>按账号影响力加权，不看粉丝绝对量</td><td class="mono">R05</td></tr>
          <tr><td>立场结构</td><td>单轮立场熵变化 &gt; 0.12</td><td>反映中立群体收缩与立场重心移动</td><td class="mono">R07、R08</td></tr>
          <tr><td>对立表达</td><td>对立指数 ≥ 0.55</td><td>互斥引用占全部引用的比例</td><td class="mono">R10、R12</td></tr>
          <tr><td>传播增量</td><td>单位时间增量 &gt; 前 6 小时均值 + 2σ</td><td>用同事件自基线，避免绝对量阈值偏差</td><td class="mono">R04、R10</td></tr>
        </tbody>
      </table>
      <div class="note">规则先产生候选，模型得分 ≥0.62 才进入节点清单；R11 次级话题得分 0.58 未过阈值，是唯一的漏报节点。8 个明细节点中 6 个一致、1 个部分一致、1 个待复核。</div>
    </div>

    <!-- ==== MAS p2 扩充开始（由 enrich/merge.py 注入）==== -->
    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">节点主体构成与带动量</div><div class="s">8 个已识别节点 · 4 类主体 · 参与账号 1,207 个</div></div>
      <div class="mp23-split">
        <div>
          <div id="mp23-type" style="height:214px"></div>
          <div class="note" style="margin-top:2px">环形面积 = 节点数占比；中心为入清单节点总数，得分阈值 0.62。</div>
        </div>
        <div>
          <table class="tb" style="table-layout:fixed;width:100%">
            <colgroup><col style="width:15%"><col style="width:8%"><col style="width:22%"><col style="width:16%"><col style="width:12%"><col style="width:14%"><col style="width:13%"></colgroup>
            <thead><tr><th>主体类型</th><th>节点数</th><th>轮次</th><th>带动账号</th><th>覆盖平台</th><th>平均节点得分</th><th>清单一致性</th></tr></thead>
            <tbody>
              <tr><td>媒体</td><td class="mono">3</td><td class="mono">R02 · R03 · R04</td><td class="mono">186</td><td class="mono">3</td><td class="mono">0.810</td><td class="mp23-good">3 一致</td></tr>
              <tr><td>意见领袖</td><td class="mono">2</td><td class="mono">R05 · R07</td><td class="mono">42</td><td class="mono">4</td><td class="mono">0.760</td><td class="mp23-warn">1 部分</td></tr>
              <tr><td>机构</td><td class="mono">1</td><td class="mono">R08</td><td class="mono">14</td><td class="mono">2</td><td class="mono">0.730</td><td class="mp23-good">1 一致</td></tr>
              <tr><td>普通用户</td><td class="mono">2</td><td class="mono">R10 · R12</td><td class="mono">965</td><td class="mono">4</td><td class="mono">0.690</td><td class="mp23-warn">1 待复核</td></tr>
              <tr><td>合计</td><td class="mono">8</td><td class="mono">R02–R12</td><td class="mono">1,207</td><td class="mono">4</td><td class="mono">0.758</td><td class="mp23-good">6 / 1 / 1</td></tr>
            </tbody>
          </table>
          <div class="note">主体类型按节点触发账号的主属性归类，“机构”指属地通报与主办方账号。带动账号为去重后参与该节点传播的账号数，四类合计 1,207 个，与 p1 事件卡片“参与账号 1,207 个”一致；覆盖平台为去重平台数，四类之间不求和。节点得分为模型输出，均值 0.758，最低的 R12 为 0.66，仍高于阈值 0.62。清单一致性：8 个节点中 6 个与人工标注一致、1 个部分一致（R07）、1 个待复核（R12），与上方节点明细同一口径。</div>
        </div>
      </div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">关键节点时间轴与识别偏差</div><div class="s">R1–R12 · 4 个主节点 · 识别轮次 vs 人工标注</div></div>
      <div class="mp23-tl">
        <div class="mp23-tlc"><i></i><b>R01</b></div>
        <div class="mp23-tlc mp23-tlc-on"><i></i><b>R02</b><span>事件触发</span><small>偏差 0 轮</small></div>
        <div class="mp23-tlc"><i></i><b>R03</b></div>
        <div class="mp23-tlc mp23-tlc-on"><i></i><b>R04</b><span>媒体介入</span><small>偏差 0 轮</small></div>
        <div class="mp23-tlc"><i></i><b>R05</b></div>
        <div class="mp23-tlc"><i></i><b>R06</b></div>
        <div class="mp23-tlc mp23-tlc-on"><i></i><b>R07</b><span>立场转向</span><small>偏差 −1 轮</small></div>
        <div class="mp23-tlc"><i></i><b>R08</b></div>
        <div class="mp23-tlc"><i></i><b>R09</b></div>
        <div class="mp23-tlc mp23-tlc-on"><i></i><b>R10</b><span>对立升级</span><small>偏差 0 轮</small></div>
        <div class="mp23-tlc"><i></i><b>R11</b></div>
        <div class="mp23-tlc"><i></i><b>R12</b></div>
      </div>
      <div class="mp23-tlcap">
        <span><i class="mp23-on"></i>已识别关键节点</span>
        <span><i></i>普通轮次</span>
        <span>偏差 = 识别轮次 − 人工标注轮次，负值表示模型更早</span>
        <span>跨轮窗口 ±1 轮内计为匹配</span>
      </div>
      <div class="mp23-split" style="margin-top:14px">
        <div>
          <div class="subhead">8 个节点识别提前量（虚线为均值 6.2 h）</div>
          <div id="mp23-lead" style="height:224px"></div>
        </div>
        <div>
          <div class="subhead">4 个主节点偏差明细</div>
          <table class="tb" style="table-layout:fixed;width:100%">
            <colgroup><col style="width:30%"><col style="width:13%"><col style="width:14%"><col style="width:11%"><col style="width:14%"><col style="width:18%"></colgroup>
            <thead><tr><th>主节点</th><th>识别轮次</th><th>标注轮次</th><th>偏差</th><th>提前量</th><th>一致性</th></tr></thead>
            <tbody>
              <tr><td>事件触发</td><td class="mono">R02</td><td class="mono">R02</td><td class="mono">0</td><td class="mono">7.5 h</td><td><span class="badge b-cyan">一致</span></td></tr>
              <tr><td>媒体介入</td><td class="mono">R04</td><td class="mono">R04</td><td class="mono">0</td><td class="mono">5.4 h</td><td><span class="badge b-cyan">一致</span></td></tr>
              <tr><td>立场转向</td><td class="mono">R07</td><td class="mono">R08</td><td class="mono mp23-warn">−1</td><td class="mono">4.9 h</td><td><span class="badge b-amber">部分一致</span></td></tr>
              <tr><td>对立升级</td><td class="mono">R10</td><td class="mono">R10</td><td class="mono">0</td><td class="mono">5.6 h</td><td><span class="badge b-cyan">一致</span></td></tr>
            </tbody>
          </table>
          <div class="note">提前量为人工确认时刻与模型输出时刻之差：人工按 6 小时批处理核对，故与“轮次偏差”是两个维度，8 个节点平均 6.2 h。R07 因跨日批次延后，人工标注落在 R08，按 ±1 轮匹配计入“部分一致”。柱图中 R07、R12 为琥珀色，表示识别早于标注 1 轮。</div>
        </div>
      </div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">节点传导路径</div><div class="s">8 条有向关系 · 源节点 → 目标节点 · 强度与时滞</div></div>
      <div class="flow">
        <div class="node"><b>R02</b>首发媒体</div><span class="arw">→</span>
        <div class="node"><b>R03</b>地方媒体</div><span class="arw">→</span>
        <div class="node"><b>R04</b>主流媒体</div><span class="arw">→</span>
        <div class="node"><b>R05</b>意见领袖</div><span class="arw">→</span>
        <div class="node"><b>R07</b>立场转向</div><span class="arw">→</span>
        <div class="node"><b>R08</b>两套叙事</div><span class="arw">→</span>
        <div class="node"><b>R10</b>对立升级</div><span class="arw">→</span>
        <div class="node"><b>R12</b>跨平台扩散</div>
      </div>
      <table class="tb" style="table-layout:fixed;width:100%;margin-top:12px">
        <colgroup><col style="width:6%"><col style="width:24%"><col style="width:13%"><col style="width:17%"><col style="width:9%"><col style="width:19%"><col style="width:12%"></colgroup>
        <thead><tr><th>编号</th><th>源 → 目标</th><th>传导类型</th><th>传导强度</th><th>时滞</th><th>证据</th><th>置信度</th></tr></thead>
        <tbody>
          <tr><td class="mono">P1</td><td>R02 首发媒体 → R03 地方媒体</td><td>转载扩散</td><td><div class="mp23-barcell"><b>0.72</b><div class="mp23-bar"><i style="width:72%"></i></div></div></td><td class="mono">2.3 h</td><td class="mono">链接引用 41 条</td><td class="mono mp23-good">0.88</td></tr>
          <tr><td class="mono">P2</td><td>R03 地方媒体 → R04 主流媒体</td><td>议程上移</td><td><div class="mp23-barcell"><b>0.68</b><div class="mp23-bar"><i style="width:68%"></i></div></div></td><td class="mono">3.7 h</td><td class="mono">转载 + 评论引用 26 条</td><td class="mono mp23-good">0.85</td></tr>
          <tr><td class="mono">P3</td><td>R04 主流媒体 → R05 意见领袖</td><td>框架转移</td><td><div class="mp23-barcell"><b>0.61</b><div class="mp23-bar"><i style="width:61%"></i></div></div></td><td class="mono">5.7 h</td><td class="mono">博主引用 18 条</td><td class="mono mp23-good">0.81</td></tr>
          <tr><td class="mono">P4</td><td>R05 意见领袖 → R07 立场转向</td><td>立场引导</td><td><div class="mp23-barcell"><b>0.74</b><div class="mp23-bar"><i style="width:74%"></i></div></div></td><td class="mono">14.3 h</td><td class="mono">转发链 96 条</td><td class="mono mp23-good">0.86</td></tr>
          <tr><td class="mono">P5</td><td>R07 立场转向 → R08 两套叙事</td><td>框架分裂</td><td><div class="mp23-barcell"><b>0.66</b><div class="mp23-bar"><i style="width:66%"></i></div></div></td><td class="mono">4.5 h</td><td class="mono">互斥引用 37 条</td><td class="mono mp23-good">0.79</td></tr>
          <tr><td class="mono">P6</td><td>R08 两套叙事 → R10 对立升级</td><td>对立催化</td><td><div class="mp23-barcell"><b>0.58</b><div class="mp23-bar mp23-amber"><i style="width:58%"></i></div></div></td><td class="mono">5.5 h</td><td class="mono">反向引用 24 条</td><td class="mono mp23-warn">0.74</td></tr>
          <tr><td class="mono">P7</td><td>R10 对立升级 → R12 跨平台扩散</td><td>对立外溢</td><td><div class="mp23-barcell"><b>0.70</b><div class="mp23-bar"><i style="width:70%"></i></div></div></td><td class="mono">12.0 h</td><td class="mono">跨平台引用 58 条</td><td class="mono mp23-good">0.83</td></tr>
          <tr><td class="mono">P8</td><td>R05 意见领袖 → R10 对立升级</td><td>长程影响（跨 5 轮）</td><td><div class="mp23-barcell"><b>0.44</b><div class="mp23-bar mp23-amber"><i style="width:44%"></i></div></div></td><td class="mono">24.3 h</td><td class="mono">二次转发 12 条</td><td class="mono mp23-warn">0.68</td></tr>
        </tbody>
      </table>
      <div class="ks" style="margin-top:12px">
        <div class="k"><div class="l">有效路径</div><div class="v">8<small style="font-size:12px;color:#8fa7ba"> 条</small></div><div class="d">主链 7 条 + 长程 1 条</div></div>
        <div class="k"><div class="l">平均传导强度</div><div class="v">0.641</div><div class="d">0.44–0.74 · 归一化</div></div>
        <div class="k"><div class="l">平均时滞</div><div class="v">9.04<small style="font-size:12px;color:#8fa7ba"> h</small></div><div class="d">最短 2.3 h · 最长 24.3 h</div></div>
        <div class="k"><div class="l">最长传导链</div><div class="v">7<small style="font-size:12px;color:#8fa7ba"> 跳</small></div><div class="d">R02 → R12 · 覆盖 8 节点</div></div>
      </div>
      <div class="note">强度为源节点对目标节点立场增量的贡献（0–1 归一化），由引用关系与打标结果回归得到；时滞按两个节点的时间戳之差计算。P8 为跨 5 轮的长程影响，强度 0.44 明显低于相邻节点传导，用于解释 R09 的短暂平台期。置信度 = 引用证据覆盖率 × 方向一致性。</div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">模型阈值敏感性</div><div class="s">τ = 0.50–0.70 · 回测集 1,268 样本 / 1,654 个标注节点</div></div>
      <div id="mp23-thr" style="height:222px"></div>
      <table class="tb" style="table-layout:fixed;width:100%;margin-top:6px">
        <colgroup><col style="width:11%"><col style="width:12%"><col style="width:11%"><col style="width:11%"><col style="width:11%"><col style="width:12%"><col style="width:12%"><col style="width:10%"><col style="width:10%"></colgroup>
        <thead><tr><th>阈值 τ</th><th>候选节点</th><th>真阳性 TP</th><th>假阳性 FP</th><th>漏报 FN</th><th>精确率</th><th>召回率</th><th>F1</th><th>复核量</th></tr></thead>
        <tbody>
          <tr><td class="mono">0.50</td><td class="mono">1,874</td><td class="mono">1,362</td><td class="mono">512</td><td class="mono">292</td><td class="mono">0.727</td><td class="mono">0.824</td><td class="mono">0.772</td><td class="mono">113.6%</td></tr>
          <tr><td class="mono">0.55</td><td class="mono">1,786</td><td class="mono">1,345</td><td class="mono">441</td><td class="mono">309</td><td class="mono">0.753</td><td class="mono">0.813</td><td class="mono">0.782</td><td class="mono">108.2%</td></tr>
          <tr><td class="mono">0.60</td><td class="mono">1,704</td><td class="mono">1,312</td><td class="mono">392</td><td class="mono">342</td><td class="mono">0.770</td><td class="mono">0.793</td><td class="mono">0.781</td><td class="mono">103.3%</td></tr>
          <tr class="mp23-hit"><td class="mono">0.62</td><td class="mono">1,650</td><td class="mono">1,288</td><td class="mono">362</td><td class="mono">366</td><td class="mono">0.781</td><td class="mono">0.779</td><td class="mono">0.780</td><td class="mono">100.0%</td></tr>
          <tr><td class="mono">0.65</td><td class="mono">1,545</td><td class="mono">1,244</td><td class="mono">301</td><td class="mono">410</td><td class="mono">0.805</td><td class="mono">0.752</td><td class="mono">0.778</td><td class="mono">93.6%</td></tr>
          <tr><td class="mono">0.70</td><td class="mono">1,369</td><td class="mono">1,161</td><td class="mono">208</td><td class="mono">493</td><td class="mono">0.848</td><td class="mono">0.702</td><td class="mono">0.768</td><td class="mono">83.0%</td></tr>
        </tbody>
      </table>
      <div class="note">回测集为近 30 日 1,268 个事件样本，人工标注关键节点 1,654 个；召回率 = TP / 1,654，精确率 = TP / 候选数，复核量以 τ=0.62 的 1,650 个候选为 100%。当前采用 τ=0.62：F1 0.780 与 2.4.2 表 13 整体 F1 0.78 一致，且精确率 0.781 与召回率 0.779 基本持平，是唯一 P≈R 的平衡点。τ≤0.55 时复核量增加 8% 以上，F1 仅提升 0.002，不采用；τ≥0.65 精确率上升但漏报由 366 增至 410 以上，关键节点代价更高。</div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">漏报与误报案例</div><div class="s">本事件 2 例 · 回测集典型 4 例 · 阈值 0.62</div></div>
      <div class="kv" style="margin-bottom:12px">
        <div><span>本事件漏报</span><b>1 例 · R11 次级话题</b></div>
        <div><span>本事件误报</span><b>1 例 · R12 待复核</b></div>
        <div><span>回测漏报</span><b>366 个 · 22.13%</b></div>
        <div><span>回测误报</span><b>362 个 · 21.94%</b></div>
      </div>
      <table class="tb" style="table-layout:fixed;width:100%">
        <colgroup><col style="width:6%"><col style="width:7%"><col style="width:13%"><col style="width:23%"><col style="width:9%"><col style="width:18%"><col style="width:13%"><col style="width:11%"></colgroup>
        <thead><tr><th>编号</th><th>类型</th><th>场景</th><th>现象</th><th>得分 / 阈值</th><th>成因</th><th>影响</th><th>处置</th></tr></thead>
        <tbody>
          <tr><td class="mono">C1</td><td><span class="badge b-red">漏报</span></td><td>本事件 · R11</td><td>次级话题（安全提示类讨论）未入清单</td><td class="mono">0.58 / 0.62</td><td>与主话题语义重叠，被去重规则降权 0.14</td><td>8 标注中漏 1，F1 记 −1</td><td>人工补录，次级话题独立建模</td></tr>
          <tr><td class="mono">C2</td><td><span class="badge b-amber">误报</span></td><td>本事件 · R12</td><td>跨平台扩散被识别为新节点</td><td class="mono">0.66 / 0.62</td><td>同一议题跨平台重复计数，未按平台去重</td><td>入清单但标注未采纳，记待复核</td><td>并入 R10 延续，跨平台去重加权</td></tr>
          <tr><td class="mono">C3</td><td><span class="badge b-red">漏报</span></td><td>回测 · 政策争议</td><td>地方执行口径差异讨论</td><td class="mono">0.59 / 0.62</td><td>属地实体消歧失败，误判为同一机构</td><td>单例召回丢失，节点计数偏少</td><td>补属地实体词表，重训实体链</td></tr>
          <tr><td class="mono">C4</td><td><span class="badge b-amber">误报</span></td><td>回测 · 企业舆情</td><td>竞品对比贴被判为立场转向</td><td class="mono">0.63 / 0.62</td><td>边缘得分，超阈值仅 0.01</td><td>精确率下降 0.004</td><td>0.60–0.65 区间加人工抽检</td></tr>
          <tr><td class="mono">C5</td><td><span class="badge b-amber">误报</span></td><td>回测 · 国际议题</td><td>旧闻回捞计入新节点</td><td class="mono">0.67 / 0.62</td><td>发布时间字段缺失，按抓取时间入序列</td><td>时间轴错位 1–2 轮</td><td>接入发布时间校验与旧闻指纹</td></tr>
          <tr><td class="mono">C6</td><td><span class="badge b-red">漏报</span></td><td>回测 · 企业舆情</td><td>区域性论坛讨论未覆盖</td><td class="mono">0.57 / 0.62</td><td>平台源缺口（仅 4 类平台）</td><td>召回缺口集中在长尾平台</td><td>扩源至 6 类平台，论坛加权</td></tr>
        </tbody>
      </table>
      <div class="note">C1、C2 为本事件的 1 漏 1 误，与 p2「8 节点 · 8 标注 · 7 吻合」及「漏报节点 1」同口径；C3–C6 为回测集典型样本，统计量见上方阈值表的 τ=0.62 行（漏报 366 / 误报 362）。误报集中在 0.62–0.67 的边缘带，占全部误报的 58.3%（211 / 362）。</div>
    </div>
    <!-- ==== MAS p2 扩充结束 ==== -->
  </div>

  <div class="pane" id="p3">
    <div class="panel">
      <div class="ph"><div class="t">最终极化指数对比</div><div class="s">R1–R12 推演终值 · 同一事件</div></div>
      <div id="scn" style="height:260px"></div>
      <div class="note">最终极化指数：无干预 0.73 · 权威发布 0.61 · 核查+引导 0.55；峰值分别为 0.74 / 0.68 / 0.66，收敛判定均在 R12 前完成。</div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">情景参数</div><div class="s">介入时机 / 强度 / 渠道 / 覆盖人群</div></div>
      <table class="tb" style="table-layout:fixed;width:100%">
        <colgroup><col style="width:17%"><col style="width:15%"><col style="width:24%"><col style="width:27%"><col style="width:17%"></colgroup>
        <thead><tr><th>情景</th><th>介入时机</th><th>强度</th><th>渠道</th><th>覆盖人群</th></tr></thead>
        <tbody>
          <tr><td><span class="badge b-red">S0 无干预</span></td><td class="mono">不介入</td><td>自然演化，仅观测</td><td>—</td><td class="mono">0%</td></tr>
          <tr><td><span class="badge b-amber">S1 权威信息发布</span></td><td class="mono">R04 · 首报后 6 h</td><td>中 · 每日 2 条官方口径，不点名个体</td><td>政务账号 + 3 家主流媒体</td><td class="mono">约 62%</td></tr>
          <tr><td><span class="badge b-cyan">S2 核查+引导</span></td><td class="mono">R03 · 首报后 2.3 h</td><td>高 · 核查 3 条 + 引导 5 条，分层投放</td><td>辟谣专栏 + 平台联动 + 本地意见领袖</td><td class="mono">约 78%</td></tr>
        </tbody>
      </table>
      <div class="note">敏感性测试另设 S3 高强度单向管制（R02 起以删帖、限流为主，覆盖约 84%），不列入主情景，只用于评估反噬风险。覆盖人群按事件相关活跃账号估算，不是全网人口比例。</div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">三情景对比</div><div class="s">终值 / 峰值 / 高位持续 / 规模 / 收益</div></div>
      <table class="tb" style="table-layout:fixed;width:100%">
        <colgroup><col style="width:18%"><col style="width:14%"><col style="width:10%"><col style="width:15%"><col style="width:14%"><col style="width:13%"><col style="width:16%"></colgroup>
        <thead><tr><th>情景</th><th>最终极化指数</th><th>峰值</th><th>高位持续轮次</th><th>传播规模</th><th>综合收益</th><th>相对基线</th></tr></thead>
        <tbody>
          <tr><td>S0 无干预</td><td class="mono">0.73</td><td class="mono">0.74</td><td class="mono">4 轮</td><td class="mono">5.9 万条</td><td class="mono">0.34</td><td><span class="badge b-red">基线</span></td></tr>
          <tr><td>S1 权威发布</td><td class="mono">0.61</td><td class="mono">0.68</td><td class="mono">3 轮</td><td class="mono">3.8 万条</td><td class="mono">0.52</td><td class="mono">+0.18</td></tr>
          <tr><td>S2 核查+引导</td><td class="mono">0.55</td><td class="mono">0.66</td><td class="mono">2 轮</td><td class="mono">3.1 万条</td><td class="mono">0.68</td><td class="mono">+0.34</td></tr>
          <tr><td>S3 高强度管制（敏感性）</td><td class="mono">0.69</td><td class="mono">0.75</td><td class="mono">5 轮</td><td class="mono">4.6 万条</td><td class="mono">0.32</td><td class="mono">−0.02</td></tr>
        </tbody>
      </table>
      <div class="note">高位持续指极化指数 ≥0.60 的连续轮次；传播规模为事件全周期相关内容累计量，不是单轮快照。S3 峰值 0.75 高于无干预，是压制后反弹的表现。</div>
    </div>

    <div class="g g2" style="margin-top:14px">
      <div class="panel">
        <div class="ph"><div class="t">收益-风险散点</div><div class="s">横轴传播规模 · 纵轴综合收益</div></div>
        <div id="scnRisk" style="height:300px"></div>
      </div>
      <div class="panel">
        <div class="ph"><div class="t">综合收益构成</div><div class="s">权重 40 / 30 / 30</div></div>
        <table class="tb" style="table-layout:fixed;width:100%">
          <colgroup><col style="width:28%"><col style="width:18%"><col style="width:18%"><col style="width:18%"><col style="width:18%"></colgroup>
          <thead><tr><th>情景</th><th>极化控制</th><th>传播控制</th><th>信任维持</th><th>综合</th></tr></thead>
          <tbody>
            <tr><td>S0 无干预</td><td class="mono">0.40</td><td class="mono">0.25</td><td class="mono">0.35</td><td class="mono">0.34</td></tr>
            <tr><td>S1 权威发布</td><td class="mono">0.50</td><td class="mono">0.48</td><td class="mono">0.60</td><td class="mono">0.52</td></tr>
            <tr><td>S2 核查+引导</td><td class="mono">0.60</td><td class="mono">0.62</td><td class="mono">0.85</td><td class="mono">0.68</td></tr>
            <tr><td>S3 高强度管制</td><td class="mono">0.38</td><td class="mono">0.26</td><td class="mono">0.30</td><td class="mono">0.32</td></tr>
          </tbody>
        </table>
        <div class="note">综合收益 = 0.4×极化控制 + 0.3×传播控制 + 0.3×信任维持；三项均为 0–1 归一化打分，信任维持由评论情感极性与官方信息采信比例合成。</div>
      </div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">结论与处置建议</div><div class="s">3 个主情景 + 1 个敏感性测试</div></div>
      <div class="tl2">
        <div><b>结论 1</b><span>早期介入收益更高</span><small>S2 于 R03 介入，比 S1 早 1 轮（约 3.7 h）：终值低 0.06，综合收益高 0.16，在峰值前压住意见领袖入场（R05–R07）。</small></div>
        <div><b>结论 2</b><span>强度存在阈值</span><small>以核查和分层引导为主的高强度（S2）有效；单向删帖限流的极高强度（S3）传播规模反升 0.8 万条，收益 0.32 低于基线。</small></div>
        <div><b>结论 3</b><span>渠道决定覆盖质量</span><small>平台联动 + 本地意见领袖覆盖 78%，比单一政务发布高 16 个百分点，对立指数降幅多 0.09。</small></div>
      </div>
      <div class="note">情景结果为规则推演输出，用于比较处置方向与相对收益，不代表真实处置效果；S3 仅作敏感性测试，不建议作为候选方案。指标口径与 2.4.2 节一致。</div>
    </div>

    <!-- ==== MAS p3 扩充开始（由 enrich/merge.py 注入）==== -->
    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">情景矩阵</div><div class="s">基准与两个干预方案 × 10 项参数</div></div>
      <table class="tb mp23-matrix" style="table-layout:fixed;width:100%">
        <colgroup><col style="width:19%"><col style="width:25%"><col style="width:28%"><col style="width:28%"></colgroup>
        <thead><tr><th>参数</th><th><span class="badge b-red">S0 基准 · 无干预</span></th><th><span class="badge b-amber">S1 干预A · 权威发布</span></th><th><span class="badge b-cyan">S2 干预B · 核查+引导</span></th></tr></thead>
        <tbody>
          <tr><td>介入轮次</td><td class="mono">—</td><td class="mono">R04</td><td class="mono">R03</td></tr>
          <tr><td>首报后时延</td><td class="mono">—</td><td class="mono">6.0 h</td><td class="mono">2.3 h</td></tr>
          <tr><td>单日发布量</td><td class="mono">0.0 条/日</td><td class="mono">2.0 条/日</td><td class="mono">4.0 条/日</td></tr>
          <tr><td>核查条数</td><td class="mono">0</td><td class="mono">1</td><td class="mono">3</td></tr>
          <tr><td>引导条数</td><td class="mono">0</td><td class="mono">0</td><td class="mono">5</td></tr>
          <tr><td>渠道构成</td><td>仅观测，不发布</td><td>政务账号 + 3 家主流媒体</td><td>辟谣专栏 + 平台联动 + 本地意见领袖</td></tr>
          <tr><td>覆盖平台数</td><td class="mono">0</td><td class="mono">3</td><td class="mono">4</td></tr>
          <tr><td>覆盖人群</td><td class="mono">0%</td><td class="mono">62%</td><td class="mono">78%</td></tr>
          <tr><td>处置成本（人时）</td><td class="mono">0.0</td><td class="mono">12.0</td><td class="mono">26.0</td></tr>
          <tr><td>主要风险</td><td>极化无约束上行，高位持续 4 轮</td><td>口径单一被质疑，叙事解释力不足</td><td>核查成本高，结论需持续维护</td></tr>
        </tbody>
      </table>
      <div class="note">参数为推演输入，与上方“情景参数”同口径：单日发布量按 12 轮（约 2 日）折算，S2 两日合计 8 条（核查 3 + 引导 5）。处置成本按人工发布、核查与渠道对接折算，不含平台侧配合成本。S3 高强度管制仅在敏感性分析中使用，不进入矩阵。</div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">情景差异显著性</div><div class="s">2,000 次蒙特卡洛抽样 · 95% 置信区间</div></div>
      <div class="mp23-split" style="grid-template-columns:1.02fr 1fr">
        <div>
          <div id="mp23-ci" style="height:238px"></div>
          <div class="note">点为抽样均值，横线为 95% 区间；S0 0.731 / S3 0.688 / S1 0.612 / S2 0.553 与点值 0.73 / 0.69 / 0.61 / 0.55 的差异来自抽样波动，不作为新结论。</div>
        </div>
        <div>
          <table class="tb" style="table-layout:fixed;width:100%">
            <colgroup><col style="width:20%"><col style="width:13%"><col style="width:30%"><col style="width:14%"><col style="width:23%"></colgroup>
            <thead><tr><th>对比</th><th>差值</th><th>95% 区间</th><th>p 值</th><th>判定</th></tr></thead>
            <tbody>
              <tr><td>S2 − S0</td><td class="mono mp23-good">−0.18</td><td class="mono">−0.21 ~ −0.15</td><td class="mono">&lt;0.001</td><td><span class="badge b-cyan">显著</span></td></tr>
              <tr><td>S1 − S0</td><td class="mono mp23-good">−0.12</td><td class="mono">−0.15 ~ −0.09</td><td class="mono">&lt;0.001</td><td><span class="badge b-cyan">显著</span></td></tr>
              <tr><td>S2 − S1</td><td class="mono mp23-good">−0.06</td><td class="mono">−0.09 ~ −0.04</td><td class="mono">&lt;0.001</td><td><span class="badge b-cyan">显著</span></td></tr>
              <tr><td>S3 − S0</td><td class="mono mp23-good">−0.04</td><td class="mono">−0.07 ~ −0.01</td><td class="mono">0.011</td><td><span class="badge b-amber">显著但幅度有限</span></td></tr>
              <tr><td>S3 − S2</td><td class="mono mp23-up">+0.14</td><td class="mono">+0.11 ~ +0.17</td><td class="mono">&lt;0.001</td><td><span class="badge b-red">显著 · 反噬</span></td></tr>
            </tbody>
          </table>
          <div class="note">差值为配对抽样之差（同一事件参数下取同一次抽样的两个情景结果），区间不含 0 判定为显著。S3 − S0 虽显著，但幅度仅 0.04 且不优于任何干预方案，不作为有效方案；S3 − S2 为 +0.14，是管制方案的反弹代价。</div>
        </div>
      </div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">单因素敏感性分析</div><div class="s">基准 S2 终值 0.55 · 7 个因素 · 每次只改一项</div></div>
      <div class="mp23-split" style="grid-template-columns:1.08fr 1fr">
        <div>
          <div id="mp23-tornado" style="height:252px"></div>
          <div class="note">负向（青）为终值下降，正向（红）为终值上升；0 轴为 S2 基准 0.55。</div>
        </div>
        <div>
          <table class="tb" style="table-layout:fixed;width:100%">
            <colgroup><col style="width:28%"><col style="width:22%"><col style="width:22%"><col style="width:14%"><col style="width:14%"></colgroup>
            <thead><tr><th>因素</th><th>不利端设置</th><th>有利端设置</th><th>极差</th><th>排序</th></tr></thead>
            <tbody>
              <tr><td>介入时机</td><td>延后至 R05 · <span class="mp23-up">+0.11</span></td><td>提前至 R01 · <span class="mp23-good">−0.06</span></td><td class="mono">0.17</td><td class="mono">1</td></tr>
              <tr><td>覆盖人群</td><td>降至 62% · <span class="mp23-up">+0.06</span></td><td>升至 90% · <span class="mp23-good">−0.05</span></td><td class="mono">0.11</td><td class="mono">2</td></tr>
              <tr><td>引导强度</td><td>降为中 · <span class="mp23-up">+0.05</span></td><td>升为高 · <span class="mp23-good">−0.04</span></td><td class="mono">0.09</td><td class="mono">3</td></tr>
              <tr><td>平台联动</td><td>关闭 · <span class="mp23-up">+0.07</span></td><td>保持开启 · <span class="mp23-mut">0.00</span></td><td class="mono">0.07</td><td class="mono">4</td></tr>
              <tr><td>核查条数</td><td>减至 1 条 · <span class="mp23-up">+0.04</span></td><td>增至 5 条 · <span class="mp23-good">−0.02</span></td><td class="mono">0.06</td><td class="mono">5</td></tr>
              <tr><td>响应时延</td><td>+30 min · <span class="mp23-up">+0.03</span></td><td>−30 min · <span class="mp23-good">−0.02</span></td><td class="mono">0.05</td><td class="mono">6</td></tr>
              <tr><td>事件热度基数</td><td>+10% · <span class="mp23-up">+0.01</span></td><td>−10% · <span class="mp23-good">−0.02</span></td><td class="mono">0.03</td><td class="mono">7</td></tr>
            </tbody>
          </table>
          <div class="note">极差 = 不利端 − 有利端的 |Δ| 之和。介入时机极差 0.17，是覆盖人群（0.11）的 1.5 倍：把介入从 R03 提前到 R01 可压到 0.49，延后到 R05 则升至 0.66，相当于放弃全部干预收益。多因素叠加存在 0.02–0.06 的重叠折减，不能简单相加。</div>
        </div>
      </div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">处置建议与触发条件</div><div class="s">7 条动作 · 指标阈值触发 · 时间窗口</div></div>
      <table class="tb" style="table-layout:fixed;width:100%">
        <colgroup><col style="width:6%"><col style="width:24%"><col style="width:30%"><col style="width:16%"><col style="width:14%"><col style="width:10%"></colgroup>
        <thead><tr><th>编号</th><th>建议动作</th><th>触发条件（指标阈值）</th><th>时效窗口</th><th>预期 Δ终值</th><th>优先级</th></tr></thead>
        <tbody>
          <tr><td class="mono">A1</td><td>权威口径首发：核查结论 + 事实时间线</td><td>极化指数 ≥0.33 且 6 h 内 ≥3 家媒体跟进</td><td>R03–R04 · 首报后 ≤6 h</td><td class="mono mp23-good">−0.06</td><td><span class="badge b-cyan">P0</span></td></tr>
          <tr><td class="mono">A2</td><td>辟谣专栏定向投放（核查 3 条）</td><td>对立指数 ≥0.55 或 负面占比 ≥60%</td><td>触发后 2 h 内</td><td class="mono mp23-good">−0.04</td><td><span class="badge b-cyan">P0</span></td></tr>
          <tr><td class="mono">A3</td><td>分层引导 5 条（按立场分群）</td><td>立场熵单轮变化 &gt;0.12</td><td>R07–R08</td><td class="mono mp23-good">−0.05</td><td><span class="badge b-cyan">P0</span></td></tr>
          <tr><td class="mono">A4</td><td>平台联动降权噪声账号（不删帖）</td><td>互斥引用占全部引用比例 ≥0.55</td><td>同轮 · ≤4 h</td><td class="mono mp23-good">−0.03</td><td><span class="badge b-blue">P1</span></td></tr>
          <tr><td class="mono">A5</td><td>本地意见领袖入场正向解读</td><td>影响力前 5% 账号中 ≥2 个立场转向</td><td>首报后 ≤12 h（R05 前）</td><td class="mono mp23-good">−0.04</td><td><span class="badge b-blue">P1</span></td></tr>
          <tr><td class="mono">A6</td><td>核查条数加至 5 条</td><td>单位时间增量 &gt; 前 6 h 均值 + 2σ</td><td>R06 前</td><td class="mono mp23-good">−0.02</td><td><span class="badge b-amber">P2</span></td></tr>
          <tr><td class="mono">A7</td><td>单向删帖 / 限流（仅评估，不建议）</td><td>仅在高危且不可逆情形下评估</td><td>—</td><td class="mono mp23-up">+0.02</td><td><span class="badge b-red">P3</span></td></tr>
        </tbody>
      </table>
      <div class="note">触发条件与 p2「节点识别方法与阈值」判定维度一一对应（对立指数 ≥0.55、立场熵单轮变化 &gt;0.12、增量 +2σ 等）。Δ终值为单项动作相对 S2 基准的单独作用估计，叠加时存在重叠折减：A1–A6 单独合计 −0.24，全量执行实际为 −0.18（S0 0.73 → S2 0.55）。A7 为反噬项，S3 全量执行后终值 0.69、峰值 0.75。</div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">情景回放时间线</div><div class="s">R1–R12 · 4 情景 · 干预窗口 R02–R04</div></div>
      <div id="mp23-replay" style="height:286px"></div>
      <div class="ks" style="margin-top:12px">
        <div class="k"><div class="l">S0 全周期涨幅</div><div class="v">+0.61</div><div class="d">R01 0.12 → R12 0.73</div></div>
        <div class="k"><div class="l">S2 相对基准</div><div class="v">−0.18</div><div class="d">终值 0.73 → 0.55</div></div>
        <div class="k"><div class="l">S3 峰值反超</div><div class="v">+0.01</div><div class="d">0.75 vs S0 0.74</div></div>
        <div class="k"><div class="l">干预窗口</div><div class="v">6.0<small style="font-size:12px;color:#8fa7ba"> h</small></div><div class="d">R02 09:00 → R04 15:00</div></div>
      </div>
      <div class="note">S0 取实测基线序列（R07 = 0.58 → R12 = 0.73，峰值 0.73 出现在 R12）；S1、S2、S3 为同参数下的规则推演输出，与 S0 同起点，介入轮之后开始分叉。高位线 0.60 以下为安全区：S0 高位持续 5 轮、S1 3 轮、S2 2 轮、S3 5 轮，与三情景对比表一致。R12 集中发布核查结论，三个干预情景均在末轮快速回落。</div>
    </div>
    <!-- ==== MAS p3 扩充结束 ==== -->
  </div>

  <div class="pane" id="p4">
    <div class="ks" style="margin-bottom:14px">
      <div class="k"><div class="l">本轮调用次数</div><div class="v">12</div><div class="d">6 类角色 · 主链 6 + 复核/分支 6</div></div>
      <div class="k"><div class="l">编排开销</div><div class="v">1.26<small style="font-size:12px;color:#8fa7ba"> s</small></div><div class="d">不含模型推理</div></div>
      <div class="k"><div class="l">成功率</div><div class="v">98.2%</div><div class="d">7 日 1,261 / 1,284</div></div>
      <div class="k"><div class="l">降级次数</div><div class="v">0</div><div class="d">本轮 0 · 7 日 2</div></div>
    </div>

    <div class="panel" style="margin-bottom:14px">
      <div class="ph"><div class="t">编排流程</div><div class="s">编排器 → 6 类角色 → 汇总</div></div>
      <div class="flow">
        <div class="node"><b>ORCH</b>编排器</div><span class="arw">→</span>
        <div class="node"><b>DAG</b>任务分解 · 黑板</div><span class="arw">→</span>
        <div class="node"><b>POOL</b>并发调度 ≤4 路</div><span class="arw">→</span>
        <div class="mini">按依赖下发，单次调用超时 200 ms 触发重试</div>
      </div>
      <div class="flow" style="margin-top:10px">
        <div class="node"><b>01</b>态势感知</div><span class="arw">→</span>
        <div class="node"><b>02</b>事件理解</div><span class="arw">→</span>
        <div class="node"><b>03</b>情感与立场</div><span class="arw">→</span>
        <div class="node"><b>04</b>传播推演</div><span class="arw">→</span>
        <div class="node"><b>05</b>风险研判</div><span class="arw">→</span>
        <div class="node"><b>06</b>策略评估</div><span class="arw">→</span>
        <div class="node"><b>AGG</b>汇总输出</div>
      </div>
      <div class="flow" style="margin-top:10px">
        <div class="node"><b>LOOP</b>复核回路</div><span class="arw">↺</span>
        <div class="node"><b>05</b>风险研判</div><span class="arw">→</span>
        <div class="node"><b>03</b>情感与立场</div>
        <div class="mini">分歧 ≥0.15 时回查打标；R07 触发 1 次，复核后置信度 0.86</div>
      </div>
      <div class="note">标号为主链执行顺序；情感与立场、风险研判另有并行分支，结果经黑板合并后再进入汇总。单轮 12 次调用、编排开销 1.26 s（不含模型推理，端到端 4.82 s），与 p1 指标同口径。</div>
    </div>

    <div class="panel" style="margin-bottom:14px">
      <div class="ph"><div class="t">分角色统计</div><div class="s">近 7 日 · 6 类角色 · 1,284 次调用</div></div>
      <table class="tb" style="table-layout:fixed;width:100%">
        <colgroup><col style="width:15%"><col style="width:11%"><col style="width:12%"><col style="width:10%"><col style="width:9%"><col style="width:9%"><col style="width:34%"></colgroup>
        <thead><tr><th>角色</th><th>调用次数</th><th>平均时延</th><th>成功</th><th>重试</th><th>降级</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td>态势感知</td><td class="mono">132</td><td class="mono">58.6 ms</td><td class="mono">131</td><td class="mono">1</td><td class="mono">0</td><td>热度与传播态势拉取</td></tr>
          <tr><td>事件理解</td><td class="mono">246</td><td class="mono">84.2 ms</td><td class="mono">242</td><td class="mono">4</td><td class="mono">0</td><td>要素抽取、阶段判定</td></tr>
          <tr><td>情感与立场</td><td class="mono">258</td><td class="mono">51.7 ms</td><td class="mono">255</td><td class="mono">3</td><td class="mono">0</td><td>情感 / 情绪 / 立场三任务联合</td></tr>
          <tr><td>传播推演</td><td class="mono">204</td><td class="mono">138.9 ms</td><td class="mono">199</td><td class="mono">5</td><td class="mono">0</td><td>图计算，分片超时为主</td></tr>
          <tr><td>风险研判</td><td class="mono">216</td><td class="mono">92.4 ms</td><td class="mono">212</td><td class="mono">4</td><td class="mono">1</td><td>含一致性复核调用</td></tr>
          <tr><td>策略评估</td><td class="mono">228</td><td class="mono">118.3 ms</td><td class="mono">222</td><td class="mono">6</td><td class="mono">1</td><td>候选模板收益评估</td></tr>
          <tr><td>合计</td><td class="mono">1,284</td><td class="mono">91.2 ms</td><td class="mono">1,261</td><td class="mono">23</td><td class="mono">2</td><td>成功率 98.2% · 重试率 1.8%</td></tr>
        </tbody>
      </table>
      <div class="note">近 7 日窗口，平均时延为角色加权均值 91.2 ms；成功 1,261 / 1,284 = 98.2%，重试 23 次（1.8%）；降级 2 次均发生在本事件（R03 风险研判、R09 策略评估）。降级指主路径不可用时改用规则兜底或默认模板，均未中断输出。</div>
    </div>

    <div class="panel" style="margin-bottom:14px">
      <div class="ph"><div class="t">角色时延分布</div><div class="s">平均 / P95 · 单次目标 200 ms</div></div>
      <div id="latChart" style="height:270px"></div>
      <div class="note">传播推演 P95 226 ms 超出 200 ms 目标，主要来自图计算分片；R09 起单分片上限下调 20%，R10–R12 未再超时。时延只统计模型与工具调用，不含编排排队。</div>
    </div>

    <div class="panel" style="margin-bottom:14px">
      <div class="ph"><div class="t">本轮调用明细</div><div class="s">12 次调用 · 主链 6 + 复核 / 分支 6</div></div>
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
          <tr><td class="mono">07</td><td>编排器</td><td>情感与立场</td><td>分歧复核：重打标 R7 批次</td><td>47.9ms</td><td><span class="badge b-cyan">成功</span></td><td>复核调用</td></tr>
          <tr><td class="mono">08</td><td>编排器</td><td>风险研判</td><td>置信度二次确认</td><td>58.3ms</td><td><span class="badge b-cyan">成功</span></td><td>复核调用</td></tr>
          <tr><td class="mono">09</td><td>编排器</td><td>策略评估</td><td>备选方案 T-03 收益评估</td><td>36.7ms</td><td><span class="badge b-cyan">成功</span></td><td>并行分支</td></tr>
          <tr><td class="mono">10</td><td>编排器</td><td>态势感知</td><td>增量刷新热度与账号数</td><td>21.4ms</td><td><span class="badge b-cyan">成功</span></td><td>并行分支</td></tr>
          <tr><td class="mono">11</td><td>编排器</td><td>事件理解</td><td>阶段复判（扩散 → 极化临界）</td><td>33.2ms</td><td><span class="badge b-cyan">成功</span></td><td>并行分支</td></tr>
          <tr><td class="mono">12</td><td>编排器</td><td>汇总输出</td><td>合并 6 路结果并写黑板</td><td>44.6ms</td><td><span class="badge b-cyan">成功</span></td><td>第 7 轮输出</td></tr>
        </tbody>
      </table>
      <div class="note">12 次调用累计 809 ms 调用时延，加 451 ms 调度与合并开销即 1.26 s 编排开销；模型推理耗时计入端到端 4.82 s，不重复计入。</div>
    </div>

    <div class="panel">
      <div class="ph"><div class="t">重试与降级记录</div><div class="s">R1–R12 · 代表性异常 5 条</div></div>
      <table class="tb" style="table-layout:fixed;width:100%">
        <colgroup><col style="width:8%"><col style="width:14%"><col style="width:9%"><col style="width:26%"><col style="width:24%"><col style="width:11%"><col style="width:8%"></colgroup>
        <thead><tr><th>轮次</th><th>角色</th><th>类型</th><th>触发原因</th><th>处理</th><th>结果</th><th>额外耗时</th></tr></thead>
        <tbody>
          <tr><td class="mono">R03</td><td>风险研判</td><td><span class="badge b-red">降级</span></td><td>置信度服务超时 0.9 s</td><td>切换规则打分兜底</td><td>等级不变，置信度 0.71</td><td class="mono">+64 ms</td></tr>
          <tr><td class="mono">R05</td><td>策略评估</td><td><span class="badge b-amber">重试</span></td><td>模板库读取超时</td><td>第 2 次请求成功</td><td>返回 T-01 / T-03</td><td class="mono">+96 ms</td></tr>
          <tr><td class="mono">R07</td><td>风险研判</td><td><span class="badge b-amber">重试</span></td><td>与情感与立场分歧 0.18</td><td>触发一致性复核</td><td>复核通过，置信度 0.86</td><td class="mono">+121 ms</td></tr>
          <tr><td class="mono">R09</td><td>策略评估</td><td><span class="badge b-red">降级</span></td><td>模板库版本冲突</td><td>回落默认模板 T-01</td><td>收益标注为估算</td><td class="mono">+38 ms</td></tr>
          <tr><td class="mono">R11</td><td>情感与立场</td><td><span class="badge b-amber">重试</span></td><td>打标批次 3 超时</td><td>拆批重发</td><td>完成 3,842 条打标</td><td class="mono">+57 ms</td></tr>
        </tbody>
      </table>
      <div class="note">仅列本事件 R1–R12 的 5 条代表性异常：3 次重试、2 次降级；近 7 日窗口共 23 次重试（1.8%），其余均由调度器自动完成，未改变本轮输出。本轮（R7）有 1 次复核重试，无降级。</div>
    </div>

    <!-- ==== MAS p4 扩充开始（由 enrich/merge.py 注入）==== -->


    <!-- M1 · 单轮调用时序（甘特）+ trace 明细 -->
    <div class="panel mp4-panel" style="margin-top:14px">
      <div class="ph">
        <div class="t">单轮调用时序与 trace 明细</div>
        <div class="s">trace E-2f7c9a-R07 · 第 7 轮 · 12 次调用 · 编排墙钟 1.26 s / 单轮 4.82 s</div>
      </div>

      <div class="mp4-phase">
        <div class="mp4-ph-a" style="width:26.1%"><b>编排与调度</b><span>1.26 s · 26.1%</span></div>
        <div class="mp4-ph-b" style="width:73.9%"><b>模型推理</b><span>3.56 s · 73.9%</span></div>
      </div>

      <div id="mp4-gantt" style="height:212px;width:100%"></div>

      <div class="mp4-legend">
        <span><i style="background:#73a7ff"></i>编排调用 4 段</span>
        <span><i style="background:#62e6d2"></i>角色间调用 3 段</span>
        <span><i style="background:#f6c66b"></i>复核调用 2 段</span>
        <span><i style="background:#9db4c8"></i>并行分支 3 段</span>
        <span class="mp4-legend-n">横轴 0–1,260 ms · 块长 = 调用耗时 · 空隙为调度与黑板同步</span>
      </div>

      <div class="tablewrap mp4-tw">
        <table class="tb mp4-tb">
          <colgroup>
            <col style="width:5%"><col style="width:11%"><col style="width:7%">
            <col style="width:8%"><col style="width:8%"><col style="width:7.5%">
            <col style="width:9%"><col style="width:8.5%"><col style="width:9%">
            <col style="width:13%"><col style="width:14%">
          </colgroup>
          <thead>
            <tr>
              <th>步</th><th>角色</th><th>类型</th><th>起 (ms)</th><th>止 (ms)</th><th>耗时</th>
              <th>输入 tok</th><th>输出 tok</th><th>缓存命中</th><th>模型</th><th>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr><td class="mono">01</td><td>态势感知</td><td><span class="mp4-tp mp4-tp-a">编排</span></td><td class="mono">0.0</td><td class="mono">62.4</td><td class="mono">62.4</td><td class="mono">620</td><td class="mono">48</td><td class="mono">384</td><td class="mono">m-lite-7b</td><td><span class="badge b-cyan">成功</span></td></tr>
            <tr><td class="mono">02</td><td>事件理解</td><td><span class="mp4-tp mp4-tp-a">编排</span></td><td class="mono">104.0</td><td class="mono">192.7</td><td class="mono">88.7</td><td class="mono">1,240</td><td class="mono">96</td><td class="mono">742</td><td class="mono">m-reason-14b</td><td><span class="badge b-cyan">成功</span></td></tr>
            <tr><td class="mono">03</td><td>情感与立场</td><td><span class="mp4-tp mp4-tp-b">角色</span></td><td class="mono">213.4</td><td class="mono">267.7</td><td class="mono">54.3</td><td class="mono">1,680</td><td class="mono">132</td><td class="mono">1,008</td><td class="mono">m-lite-7b</td><td><span class="badge b-cyan">成功</span></td></tr>
            <tr><td class="mono">04</td><td>传播推演</td><td><span class="mp4-tp mp4-tp-a">编排</span></td><td class="mono">327.6</td><td class="mono">471.2</td><td class="mono">143.6</td><td class="mono">1,420</td><td class="mono">168</td><td class="mono">866</td><td class="mono">m-reason-14b</td><td><span class="badge b-cyan">成功</span></td></tr>
            <tr><td class="mono">05</td><td>风险研判</td><td><span class="mp4-tp mp4-tp-b">角色</span></td><td class="mono">517.6</td><td class="mono">613.8</td><td class="mono">96.2</td><td class="mono">980</td><td class="mono">84</td><td class="mono">592</td><td class="mono">m-reason-14b</td><td><span class="badge b-amber">复核</span></td></tr>
            <tr><td class="mono">06</td><td>策略评估</td><td><span class="mp4-tp mp4-tp-b">角色</span></td><td class="mono">746.3</td><td class="mono">868.1</td><td class="mono">121.8</td><td class="mono">860</td><td class="mono">72</td><td class="mono">521</td><td class="mono">m-reason-14b</td><td><span class="badge b-cyan">成功</span></td></tr>
            <tr><td class="mono">07</td><td>情感与立场</td><td><span class="mp4-tp mp4-tp-c">复核</span></td><td class="mono">613.8</td><td class="mono">661.7</td><td class="mono">47.9</td><td class="mono">520</td><td class="mono">44</td><td class="mono">316</td><td class="mono">m-lite-7b</td><td><span class="badge b-cyan">成功</span></td></tr>
            <tr><td class="mono">08</td><td>风险研判</td><td><span class="mp4-tp mp4-tp-c">复核</span></td><td class="mono">661.7</td><td class="mono">720.0</td><td class="mono">58.3</td><td class="mono">460</td><td class="mono">38</td><td class="mono">281</td><td class="mono">m-reason-14b</td><td><span class="badge b-cyan">成功</span></td></tr>
            <tr><td class="mono">09</td><td>策略评估</td><td><span class="mp4-tp mp4-tp-d">分支</span></td><td class="mono">868.1</td><td class="mono">904.8</td><td class="mono">36.7</td><td class="mono">420</td><td class="mono">36</td><td class="mono">258</td><td class="mono">m-reason-14b</td><td><span class="badge b-cyan">成功</span></td></tr>
            <tr><td class="mono">10</td><td>态势感知</td><td><span class="mp4-tp mp4-tp-d">分支</span></td><td class="mono">62.4</td><td class="mono">83.8</td><td class="mono">21.4</td><td class="mono">280</td><td class="mono">24</td><td class="mono">172</td><td class="mono">m-lite-7b</td><td><span class="badge b-cyan">成功</span></td></tr>
            <tr><td class="mono">11</td><td>事件理解</td><td><span class="mp4-tp mp4-tp-d">分支</span></td><td class="mono">192.7</td><td class="mono">225.9</td><td class="mono">33.2</td><td class="mono">340</td><td class="mono">30</td><td class="mono">209</td><td class="mono">m-reason-14b</td><td><span class="badge b-cyan">成功</span></td></tr>
            <tr><td class="mono">12</td><td>汇总输出</td><td><span class="mp4-tp mp4-tp-a">编排</span></td><td class="mono">1,215.4</td><td class="mono">1,260.0</td><td class="mono">44.6</td><td class="mono">720</td><td class="mono">58</td><td class="mono">436</td><td class="mono">m-lite-7b</td><td><span class="badge b-cyan">成功</span></td></tr>
            <tr class="mp4-sum"><td class="mono">合计</td><td>6 类角色 + 汇总</td><td><span class="mp4-tp" style="background:#12283d;color:#b9cbdb">12 段</span></td><td class="mono">0.0</td><td class="mono">1,260.0</td><td class="mono">809.1</td><td class="mono">9,540</td><td class="mono">830</td><td class="mono">5,785</td><td class="mono">2 类模型</td><td><span class="badge b-cyan">12 / 12</span></td></tr>
          </tbody>
        </table>
      </div>

      <div class="mp4-eq">核对：12 段调用 809.1 ms ＋ 调度 / 黑板同步 / 合并 450.9 ms ＝ 编排墙钟 1,260 ms；编排 1.26 s ＋ 推理 3.56 s ＝ 单轮 4.82 s。</div>
      <div class="note">块长与上一块「本轮调用明细」的耗时列逐行同源，起止时刻为编排侧时间轴（0 起算，单位 ms）；同一 trace 下 12 条 span 的起止与甘特完全一致。空隙中最大一段为汇总前置等待 347.3 ms（06 → 12），占全部空隙 77.0%，原因是等待 6 路分支结果写入黑板。Token 为计费口径（含缓存命中部分），缓存命中列表示该次调用中命中前缀 / 记忆 / 工具缓存的 token 数。</div>
    </div>

    <!-- M2 · Token 消耗与成本分解 -->
    <div class="panel mp4-panel" style="margin-top:14px">
      <div class="ph">
        <div class="t">Token 消耗与成本分解</div>
        <div class="s">R7 单轮 10,370 tokens · 单价：输入 ¥0.006/千 · 命中 ¥0.0015/千 · 输出 ¥0.018/千</div>
      </div>

      <div class="ks mp4-ks">
        <div class="k"><div class="l">单轮 Token</div><div class="v">10,370</div><div class="d">输入 9,540 · 输出 830</div></div>
        <div class="k"><div class="l">单轮成本</div><div class="v">¥0.0461</div><div class="d">缓存折让后 · 全量口径 ¥0.0722</div></div>
        <div class="k"><div class="l">12 轮 Token</div><div class="v">117,876</div><div class="d">输入 108,400 · 输出 9,476</div></div>
        <div class="k"><div class="l">12 轮成本</div><div class="v">¥0.5389</div><div class="d">单轮 ¥0.0291 → ¥0.0604</div></div>
      </div>

      <div class="mp4-split mp4-split-2">
        <div>
          <div class="subhead">按角色 · Token 构成与成本</div>
          <div id="mp4-token" style="height:268px;width:100%"></div>
          <div class="note" style="margin-top:4px">条形自上而下为角色调用量排序；成本 = 未命中输入 × ¥0.006 ＋ 命中输入 × ¥0.0015 ＋ 输出 × ¥0.018（每千 token）。情感与立场占单轮成本 22.5%，主要来自 3,842 条评论的打标上下文。</div>
        </div>
        <div>
          <div class="subhead">按轮次 · Token 与单轮成本</div>
          <div id="mp4-round" style="height:268px;width:100%"></div>
          <div class="note" style="margin-top:4px">输入随轮次线性增长（历史上下文累积，R1 4,260 → R12 13,540），输出增长较缓（392 → 1,148）；单轮成本由 ¥0.0291 升至 ¥0.0604，12 轮合计 ¥0.5389。</div>
        </div>
      </div>

      <div class="mp4-eq">核对：输入 108,400 ＋ 输出 9,476 ＝ 117,876 tokens；10,370 tokens / 3.56 s ≈ 2,913 tok/s，双通道单通道约 1,457 tok/s。</div>
    </div>

    <!-- M3 · 并发与排队 -->
    <div class="panel mp4-panel" style="margin-top:14px">
      <div class="ph">
        <div class="t">并发与排队（推理阶段）</div>
        <div class="s">1,260 → 4,820 ms · 2 路通道 · 12 个推理任务 · 3,560 ms</div>
      </div>

      <div class="mp4-split mp4-split-2">
        <div>
          <div id="mp4-conc" style="height:252px;width:100%"></div>
          <div class="note" style="margin-top:2px">横轴为推理阶段相对时刻（0 = 编排结束的 1,260 ms）。通道占用 3,970 ms，其中双路并行 410 ms、单路 3,150 ms，阶段内无空转。</div>
        </div>
        <div>
          <div class="mp4-q">
            <div><div class="l">通道占用率</div><div class="v">55.8<small>%</small></div><div class="d">3,970 / 7,120 ms</div></div>
            <div><div class="l">双路并行</div><div class="v">410<small>ms</small></div><div class="d">占阶段 11.5%</div></div>
            <div><div class="l">单路占用</div><div class="v">3,150<small>ms</small></div><div class="d">阶段内无空转</div></div>
            <div><div class="l">排队等待</div><div class="v">664.0<small>ms</small></div><div class="d">3 次 · 平均 221.3 ms</div></div>
          </div>
          <table class="tb mp4-tb" style="margin-top:12px">
            <colgroup><col style="width:38%"><col style="width:18%"><col style="width:18%"><col style="width:26%"></colgroup>
            <thead><tr><th>任务</th><th>就绪</th><th>开始</th><th>等待</th></tr></thead>
            <tbody>
              <tr><td>08 风险研判 · 复核</td><td class="mono">0.0</td><td class="mono">168.0</td><td class="mono mp4-warn">168.0</td></tr>
              <tr><td>10 态势感知 · 增量</td><td class="mono">0.0</td><td class="mono">344.0</td><td class="mono mp4-warn">344.0</td></tr>
              <tr><td>11 事件理解 · 复判</td><td class="mono">3,260.0</td><td class="mono">3,412.0</td><td class="mono mp4-warn">152.0</td></tr>
            </tbody>
          </table>
          <div class="note" style="margin-top:6px">排队集中在阶段起止两端：起始时 01 / 07 / 08 / 10 同时就绪、末尾 09 / 11 同时就绪，通道满则入队。队列容量 8，本轮峰值 2，无排队超时，最长等待 344.0 ms（10 增量刷新，优先级最低）。</div>
        </div>
      </div>
      <div class="mp4-eq">核对：推理耗时合计 3,970 ms − 并行重叠 410 ms ＝ 3,560 ms（推理墙钟）；1,260 ms 编排 ＋ 3,560 ms 推理 ＝ 4,820 ms。</div>
    </div>

    <!-- M4 + M5 · 两列 -->
    <div class="grid2 mp4-row2" style="margin-top:14px">
      <div class="panel">
        <div class="ph">
          <div class="t">缓存命中与上下文复用</div>
          <div class="s">三层缓存 · 命中 5,785 / 9,540 tokens · 60.6%</div>
        </div>
        <div class="mp4-mini">三层缓存命中构成（token）</div>
        <div id="mp4-cache" style="height:178px;width:100%"></div>
        <div class="mp4-mini" style="margin-top:10px">分轮缓存命中率（R1–R12）</div>
        <div id="mp4-cacheRound" style="height:142px;width:100%"></div>
        <div class="mp4-legend">
          <span><i style="background:#62e6d2"></i>命中</span>
          <span><i style="background:#22405c"></i>未命中</span>
          <span class="mp4-legend-n">上图为三层命中构成 · 下图为分轮命中率</span>
        </div>
        <div class="note">三层命中：前缀缓存（系统提示 + 工具契约）3,146 / 3,180 = 98.9%；角色记忆（黑板摘要 + 角色状态）1,476 / 3,420 = 43.2%；工具结果（图计算 / 词表 / 模板库）1,163 / 2,940 = 39.6%。合计命中 5,785 / 9,540 = 60.6%，有效输入 3,755 tokens。命中率随轮次上升（R1 18.6% → R12 68.2%），前缀与角色记忆在轮次间复用。缓存折让后单轮 ¥0.0461，全量口径 ¥0.0722，节省 ¥0.0261（36.1%）。</div>
      </div>

      <div class="panel">
        <div class="ph">
          <div class="t">上下文长度分布</div>
          <div class="s">近 7 日 1,284 次调用 · 输入 token · 分片阈值 2,048</div>
        </div>
        <div id="mp4-ctx" style="height:234px;width:100%"></div>
        <div class="mp4-q" style="margin-top:10px">
          <div><div class="l">P50</div><div class="v">744</div></div>
          <div><div class="l">P90</div><div class="v">1,442</div></div>
          <div><div class="l">P95</div><div class="v">1,595</div></div>
          <div><div class="l">P99</div><div class="v">1,978</div></div>
          <div><div class="l">均值</div><div class="v">806</div></div>
        </div>
        <div class="chips mp4-chips">
          <span class="chip">态势感知 640</span><span class="chip">事件理解 780</span><span class="chip">情感与立场 1,240</span><span class="chip">传播推演 1,420</span><span class="chip">风险研判 940</span><span class="chip">策略评估 820</span><span class="chip">汇总输出 720</span>
        </div>
        <div class="note">分角色数字为输入长度中位数（token）。超过 2,048 tokens 的 10 次（0.8%）由分片器拆为 2 段，最大 2,140；分布集中在 400–1,200（65.4%），与单次调用以结构化提示为主一致。13.1% 的调用落在 1,200–1,600 区间，主要来自传播推演的图分片与情感与立场的评论打标批次。</div>
      </div>
    </div>

    <!-- M6 · 调用链拓扑 -->
    <div class="panel mp4-panel" style="margin-top:14px">
      <div class="ph">
        <div class="t">调用链拓扑与边权</div>
        <div class="s">7 个节点 · 8 条边 · 近 7 日 1,284 次调用 · 黑板 6,010 条/轮</div>
      </div>

      <div class="mp4-split mp4-split-3">
        <div>
          <div id="mp4-topo" style="height:404px;width:100%"></div>
          <div class="mp4-legend">
            <span><i style="background:#f6c66b"></i>编排器</span>
            <span><i style="background:#73a7ff"></i>感知与理解</span>
            <span><i style="background:#62e6d2"></i>分析与决策</span>
            <span class="mp4-legend-n">节点面积 = 被调次数 · 边宽 = 调用次数</span>
          </div>
        </div>
        <div>
          <table class="tb mp4-tb">
            <colgroup><col style="width:38%"><col style="width:13%"><col style="width:14%"><col style="width:19%"><col style="width:16%"></colgroup>
            <thead><tr><th>调用方 → 被调方</th><th>次数</th><th>占比</th><th>平均时延</th><th>重试</th></tr></thead>
            <tbody>
              <tr><td>风险研判 → 策略评估</td><td class="mono">228</td><td class="mono">17.8%</td><td class="mono">118.3 ms</td><td class="mono">5</td></tr>
              <tr><td>传播推演 → 风险研判</td><td class="mono">216</td><td class="mono">16.8%</td><td class="mono">92.4 ms</td><td class="mono">4</td></tr>
              <tr><td>编排器 → 传播推演</td><td class="mono">204</td><td class="mono">15.9%</td><td class="mono">138.9 ms</td><td class="mono">5</td></tr>
              <tr><td>编排器 → 事件理解</td><td class="mono">196</td><td class="mono">15.3%</td><td class="mono">95.5 ms</td><td class="mono">3</td></tr>
              <tr><td>编排器 → 情感与立场</td><td class="mono">178</td><td class="mono">13.9%</td><td class="mono">53.7 ms</td><td class="mono">3</td></tr>
              <tr><td>编排器 → 态势感知</td><td class="mono">132</td><td class="mono">10.3%</td><td class="mono">58.6 ms</td><td class="mono">1</td></tr>
              <tr><td>事件理解 → 情感与立场</td><td class="mono">80</td><td class="mono">6.2%</td><td class="mono">47.2 ms</td><td class="mono">1</td></tr>
              <tr><td>态势感知 → 事件理解</td><td class="mono">50</td><td class="mono">3.9%</td><td class="mono">39.8 ms</td><td class="mono">1</td></tr>
              <tr class="mp4-sum"><td>合计</td><td class="mono">1,284</td><td class="mono">100%</td><td class="mono">91.2 ms</td><td class="mono">23</td></tr>
            </tbody>
          </table>
          <div class="mp4-err">
            <span class="mp4-err-t">近 7 日错误分布</span>
            <span><b>超时</b>12</span><span><b>限流</b>6</span><span><b>解析</b>5</span>
            <span class="mp4-err-n">合计 23 = 重试次数 · 平均恢复 76.4 ms</span>
          </div>
          <div class="note">节点列和等于「分角色统计」的调用次数（态势 132 / 事件 246 / 情感 258 / 传播 204 / 风险 216 / 策略 228），行和合计 1,284。黑板侧本轮消息 6,010 条（1,247 条/秒 × 4.82 s），按订阅分发：情感与立场 1,880、传播推演 1,240、事件理解 980、风险研判 760、策略评估 640、态势感知 510。重试最集中于编排器 → 传播推演（5 次），与图计算分片超时一致。</div>
        </div>
      </div>
    </div>
    <!-- ==== MAS p4 扩充结束 ==== -->
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
            <div style="font-size:11px;color:#8fa7ba;margin-top:6px">响应时限 2 小时 · 日报 + 专报</div>
            <div style="font-size:10.5px;color:#8fa7ba;margin-top:3px">七维加权 0.705 + 联动修正 0.035 = 0.740</div></div>
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
        <div class="ph"><div class="t">七维风险画像</div><div class="s">0–1 归一化 · 情感为负面强度</div></div>
        <div id="radar" style="height:300px"></div>
      </div>
      <div class="panel">
        <div class="ph"><div class="t">分级依据</div><div class="s">权重 × 得分 · 等级按表14</div></div>
        <table class="tb" style="table-layout:fixed;width:100%">
          <colgroup><col style="width:38%"><col style="width:16%"><col style="width:16%"><col style="width:30%"></colgroup>
          <thead><tr><th>指标</th><th style="text-align:center">权重</th><th style="text-align:center">得分</th><th style="text-align:center">等级</th></tr></thead>
          <tbody>
            <tr><td>事件热度</td><td class="mono" style="text-align:center">0.18</td><td class="mono" style="text-align:center">0.78</td><td style="text-align:center"><span class="badge b-red">极高</span></td></tr>
            <tr><td>传播速度</td><td class="mono" style="text-align:center">0.16</td><td class="mono" style="text-align:center">0.66</td><td style="text-align:center"><span class="badge b-amber">高</span></td></tr>
            <tr><td>负面情感强度</td><td class="mono" style="text-align:center">0.15</td><td class="mono" style="text-align:center">0.71</td><td style="text-align:center"><span class="badge b-red">极高</span></td></tr>
            <tr><td>群体对立</td><td class="mono" style="text-align:center">0.17</td><td class="mono" style="text-align:center">0.74</td><td style="text-align:center"><span class="badge b-red">极高</span></td></tr>
            <tr><td>关键节点活跃度</td><td class="mono" style="text-align:center">0.12</td><td class="mono" style="text-align:center">0.62</td><td style="text-align:center"><span class="badge b-amber">高</span></td></tr>
            <tr><td>议题敏感度</td><td class="mono" style="text-align:center">0.11</td><td class="mono" style="text-align:center">0.80</td><td style="text-align:center"><span class="badge b-red">极高</span></td></tr>
            <tr><td>跨平台扩散</td><td class="mono" style="text-align:center">0.11</td><td class="mono" style="text-align:center">0.58</td><td style="text-align:center"><span class="badge b-amber">高</span></td></tr>
          </tbody>
        </table>
        <div class="note">负面情感强度由极性 −0.42 归一化得到（(1−(−0.42))/2 = 0.71）；等级按表14 分维阈值判定，4 项极高、3 项高。</div>
      </div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">处置时间线</div><div class="s">从告警到复盘</div></div>
      <div style="display:flex;gap:0" id="tl"></div>
    </div>

    <div class="g g2" style="grid-template-columns:1fr 1fr;margin-top:14px">
      <div class="panel">
        <div class="ph"><div class="t">七维得分排序</div><div class="s">0–1 归一化 · 由高到低</div></div>
        <div id="dimBar" style="height:274px"></div>
        <div class="note">按表14 分维阈值：4 项极高（热度 0.78、负面情感 0.71、对立 0.74、敏感 0.80）、3 项高（速度 0.66、节点 0.62、扩散 0.58），无中低项。</div>
      </div>
      <div class="panel">
        <div class="ph"><div class="t">24 小时综合分值趋势</div><div class="s">10-18 22:00 → 10-19 21:00</div></div>
        <div id="trend24" style="height:274px"></div>
        <div class="note">近 6 小时由 0.61 升至 0.74（+0.13），约 0.022/小时；按当前斜率 4–6 小时触及 0.82，报告取保守口径 24 小时窗口。</div>
      </div>
    </div>

    <div class="g g2" style="grid-template-columns:1fr 1.35fr;margin-top:14px">
      <div class="panel">
        <div class="ph"><div class="t">主要驱动因子</div><div class="s">按加权贡献排序</div></div>
        <div style="display:grid;gap:8px">
          <div style="display:flex;align-items:center;gap:10px;padding:9px 11px;border:1px solid var(--line);border-radius:11px;background:#0a1727">
            <span class="mono" style="color:#ff7f86">01</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:12.5px;font-weight:600">事件热度 <span class="badge b-red" style="margin-left:4px">主导</span></div>
              <div style="font-size:10.5px;color:#8fa7ba">3,842 条 / 1,207 账号 · 6 小时 +38%</div>
            </div>
            <span class="mono" style="color:#ff7f86">0.140</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;padding:9px 11px;border:1px solid var(--line);border-radius:11px;background:#0a1727">
            <span class="mono" style="color:#f6c66b">02</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:12.5px;font-weight:600">群体对立 <span class="badge b-red" style="margin-left:4px">极高</span></div>
              <div style="font-size:10.5px;color:#8fa7ba">反对 41% · 支持 24% · 6 小时 +0.06</div>
            </div>
            <span class="mono" style="color:#f6c66b">0.126</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;padding:9px 11px;border:1px solid var(--line);border-radius:11px;background:#0a1727">
            <span class="mono" style="color:#f6c66b">03</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:12.5px;font-weight:600">负面情感强度 <span class="badge b-red" style="margin-left:4px">极高</span></div>
              <div style="font-size:10.5px;color:#8fa7ba">负向占比 58% · 6 小时 +5.2pt</div>
            </div>
            <span class="mono" style="color:#f6c66b">0.107</span>
          </div>
        </div>
        <div class="note">前三项合计贡献 0.373，占加权分值 53%；热度与对立同向上升时，模型叠加 +0.035 跨维联动修正。</div>
      </div>
      <div class="panel">
        <div class="ph"><div class="t">同类事件对比</div><div class="s">近 12 个月 3 起二级事件</div></div>
        <table class="tb" style="table-layout:fixed;width:100%">
          <colgroup><col style="width:24%"><col style="width:18%"><col style="width:12%"><col style="width:10%"><col style="width:36%"></colgroup>
          <thead><tr><th>事件</th><th>类型</th><th>峰值分值</th><th>响应</th><th>结果</th></tr></thead>
          <tbody>
            <tr><td>校园延期传闻<div class="mono" style="font-size:9.5px">E-2409-11</div></td><td>网络谣言</td><td class="mono">0.77</td><td>2 小时</td><td>48 小时回落至 0.55</td></tr>
            <tr><td>教师流动传闻<div class="mono" style="font-size:9.5px">E-2501-04</div></td><td>网络谣言</td><td class="mono">0.81</td><td><span class="badge b-red">延误</span></td><td>升级一级 0.86，72 小时平息</td></tr>
            <tr><td>招生计划调整<div class="mono" style="font-size:9.5px">E-2506-19</div></td><td>社会热点议题</td><td class="mono">0.72</td><td>2 小时</td><td>24 小时回落至 0.58</td></tr>
          </tbody>
        </table>
        <div class="note">当前事件结构最接近 E-2506-19；E-2501-04 因超出 2 小时响应窗口升级为一级，是本轮强调「2 小时内发布」的直接依据。</div>
      </div>
    </div>

    <!-- ==== RISK r1 扩充开始（由 enrich/merge.py 注入）==== -->
    <!-- R1 · 模块 1：风险信号看板（今日新增 / 待核 / 已处置 / 误报率） -->
    <div class="panel rr12-block">
      <div class="ph"><div class="t">风险信号看板</div><div class="s">今日 00:00 → 21:00 · 事件 E-2f7c9a 相关信号</div></div>
      <div class="rr12-kpis">
        <div class="rr12-kpi">
          <div class="rr12-kpi-l">今日新增信号</div>
          <div class="rr12-kpi-v">47<small>条</small></div>
          <div class="rr12-kpi-d up">▲ 较 7 日均值 36.6 条 +28.5%</div>
        </div>
        <div class="rr12-kpi">
          <div class="rr12-kpi-l">待核信号</div>
          <div class="rr12-kpi-v">6<small>条</small></div>
          <div class="rr12-kpi-d">边界值 3 · 跨平台突增 2 · 维度分歧 1</div>
        </div>
        <div class="rr12-kpi">
          <div class="rr12-kpi-l">已处置</div>
          <div class="rr12-kpi-v">39<small>条</small></div>
          <div class="rr12-kpi-d ok">平均确认 11.4 分钟 · 复核中 2 条</div>
        </div>
        <div class="rr12-kpi">
          <div class="rr12-kpi-l">误报率</div>
          <div class="rr12-kpi-v">8.51<small>%</small></div>
          <div class="rr12-kpi-d">4 / 47 条 · 目标 ≤10%</div>
        </div>
      </div>
      <div class="rr12-row rr12-c31" style="margin-top:12px">
        <div class="rr12-chartbox">
          <div id="rr12-signalChart" style="height:150px"></div>
        </div>
        <div class="rr12-src">
          <div class="rr12-src-h">今日信号来源<span>47 条</span></div>
          <div class="rr12-src-row">
            <span class="rr12-src-n">新闻</span>
            <span class="rr12-meter"><i style="width:53.2%"></i></span>
            <span class="rr12-src-v">25 · 53.2%</span>
          </div>
          <div class="rr12-src-row">
            <span class="rr12-src-n">社媒</span>
            <span class="rr12-meter"><i class="m-blue" style="width:25.5%"></i></span>
            <span class="rr12-src-v">12 · 25.5%</span>
          </div>
          <div class="rr12-src-row">
            <span class="rr12-src-n">官网线索</span>
            <span class="rr12-meter"><i class="m-amber" style="width:21.3%"></i></span>
            <span class="rr12-src-v">10 · 21.3%</span>
          </div>
          <div class="rr12-src-f">底座 20 个验证机构 · 6,989 条已审核记录<br>新闻 3,675 / 官网线索 1,468 / 社媒 1,846</div>
        </div>
      </div>
      <div class="note">信号 = 事件识别后进入预警队列的候选记录，同一账号 30 分钟内重复内容合并计 1 条；误报指复核判定为「非风险」的记录，4 / 47 = 8.51%，7 日累计 22 / 256 = 8.59%；47 = 已处置 39 + 待核 6 + 复核中 2。</div>
    </div>

    <!-- R1 · 模块 2：七维分维度环比（三时点 + 表14 等级迁移） -->
    <div class="panel rr12-block">
      <div class="ph"><div class="t">七维分维度环比</div><div class="s">10-18 22:00 → 10-19 15:00 → 10-19 21:00 · 虚线为联动门槛 0.70</div></div>
      <div class="rr12-row rr12-c21">
        <div class="rr12-tbwrap">
          <table class="tb rr12-tb" style="table-layout:fixed;width:100%">
            <colgroup><col style="width:23%"><col style="width:7%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:8%"><col style="width:8%"><col style="width:27%"></colgroup>
            <thead><tr><th>维度</th><th class="c">权重</th><th class="c">24h 前</th><th class="c">6h 前</th><th class="c">当前</th><th class="c">24h Δ</th><th class="c">6h Δ</th><th>等级迁移（表14）</th></tr></thead>
            <tbody>
              <tr><td>事件热度</td><td class="mono c">0.18</td><td class="mono c">0.33</td><td class="mono c">0.64</td><td class="mono c now">0.78</td><td class="mono c up">+0.45</td><td class="mono c up">+0.14</td><td><span class="rr12-lv l-low">低</span><span class="rr12-arw">›</span><span class="rr12-lv l-high">高</span><span class="rr12-arw">›</span><span class="rr12-lv l-max on">极高</span></td></tr>
              <tr><td>传播速度</td><td class="mono c">0.16</td><td class="mono c">0.28</td><td class="mono c">0.56</td><td class="mono c now">0.66</td><td class="mono c up">+0.38</td><td class="mono c up">+0.10</td><td><span class="rr12-lv l-low">低</span><span class="rr12-arw">›</span><span class="rr12-lv l-high on">高</span><span class="rr12-arw">›</span><span class="rr12-lv l-high on">高</span></td></tr>
              <tr><td>负面情感强度</td><td class="mono c">0.15</td><td class="mono c">0.20</td><td class="mono c">0.55</td><td class="mono c now">0.71</td><td class="mono c up">+0.51</td><td class="mono c up">+0.16</td><td><span class="rr12-lv l-low">低</span><span class="rr12-arw">›</span><span class="rr12-lv l-high">高</span><span class="rr12-arw">›</span><span class="rr12-lv l-max on">极高</span></td></tr>
              <tr><td>群体对立</td><td class="mono c">0.17</td><td class="mono c">0.31</td><td class="mono c">0.68</td><td class="mono c now">0.74</td><td class="mono c up">+0.43</td><td class="mono c up">+0.06</td><td><span class="rr12-lv l-mid">中</span><span class="rr12-arw">›</span><span class="rr12-lv l-high">高</span><span class="rr12-arw">›</span><span class="rr12-lv l-max on">极高</span></td></tr>
              <tr><td>关键节点活跃度</td><td class="mono c">0.12</td><td class="mono c">0.26</td><td class="mono c">0.55</td><td class="mono c now">0.62</td><td class="mono c up">+0.36</td><td class="mono c up">+0.07</td><td><span class="rr12-lv l-low">低</span><span class="rr12-arw">›</span><span class="rr12-lv l-high on">高</span><span class="rr12-arw">›</span><span class="rr12-lv l-high on">高</span></td></tr>
              <tr><td>议题敏感度</td><td class="mono c">0.11</td><td class="mono c">0.42</td><td class="mono c">0.79</td><td class="mono c now">0.80</td><td class="mono c up">+0.38</td><td class="mono c up">+0.01</td><td><span class="rr12-lv l-mid">中</span><span class="rr12-arw">›</span><span class="rr12-lv l-max">极高</span><span class="rr12-arw">›</span><span class="rr12-lv l-max on">极高</span></td></tr>
              <tr><td>跨平台扩散</td><td class="mono c">0.11</td><td class="mono c">0.23</td><td class="mono c">0.50</td><td class="mono c now">0.58</td><td class="mono c up">+0.35</td><td class="mono c up">+0.08</td><td><span class="rr12-lv l-low">低</span><span class="rr12-arw">›</span><span class="rr12-lv l-high on">高</span><span class="rr12-arw">›</span><span class="rr12-lv l-high on">高</span></td></tr>
              <tr class="rr12-sum"><td>综合分值</td><td class="mono c">1.00</td><td class="mono c">0.290</td><td class="mono c">0.611</td><td class="mono c now">0.740</td><td class="mono c up">+0.450</td><td class="mono c up">+0.129</td><td><span class="rr12-lv l-low">四级</span><span class="rr12-arw">›</span><span class="rr12-lv l-mid">三级</span><span class="rr12-arw">›</span><span class="rr12-lv l-max on">二级</span></td></tr>
            </tbody>
          </table>
        </div>
        <div class="rr12-chartbox">
          <div id="rr12-dimChart" style="height:268px"></div>
        </div>
      </div>
      <div class="note">三时点加权合成 0.290 / 0.611 / 0.705；跨维联动修正 +0.035 仅在最近 6 小时触发——6 小时前对立 0.68、敏感 0.79 未同时越过 0.70，当前对立 0.74、敏感 0.80 同时越过。综合分值 6 小时 +0.129 = 加权 +0.094 + 修正 +0.035。三时点取自 24 小时序列同刻点（0.29 / 0.61 / 0.74），与「24 小时综合分值趋势」一致。</div>
    </div>

    <!-- R1 · 模块 3 + 4：事件风险排行 TOP 6 ｜ 预警渠道与触达 -->
    <div class="rr12-row rr12-c12 rr12-block">
      <div class="panel">
        <div class="ph"><div class="t">事件风险排行</div><div class="s">在监测事件池 12 起 · 取综合分值前 6</div></div>
        <div class="rr12-tbwrap">
          <table class="tb rr12-tb" style="table-layout:fixed;width:100%">
            <colgroup><col style="width:5%"><col style="width:31%"><col style="width:17%"><col style="width:10%"><col style="width:14%"><col style="width:13%"><col style="width:10%"></colgroup>
            <thead><tr><th class="c">#</th><th>事件</th><th>综合分值</th><th class="c">等级</th><th>主导驱动</th><th class="c">状态</th><th class="c">24h Δ</th></tr></thead>
            <tbody>
              <tr>
                <td class="mono c">1</td>
                <td><div class="rr12-ev">「延期」传闻</div><div class="rr12-ev-id mono">E-2f7c9a · 突发公共事件</div></td>
                <td><div class="rr12-rank"><span class="mono">0.740</span><span class="rr12-rankbar"><i style="width:74%;background:#f6c66b"></i></span></div></td>
                <td class="c"><span class="badge b-amber">二级</span></td>
                <td>热度 / 对立</td>
                <td class="c"><span class="badge b-cyan">已处置</span></td>
                <td class="mono c up">+0.129</td>
              </tr>
              <tr>
                <td class="mono c">2</td>
                <td><div class="rr12-ev">教师排课调整讨论</div><div class="rr12-ev-id mono">E-2f8a31 · 社会热点议题</div></td>
                <td><div class="rr12-rank"><span class="mono">0.691</span><span class="rr12-rankbar"><i style="width:69.1%;background:#f6c66b"></i></span></div></td>
                <td class="c"><span class="badge b-amber">二级</span></td>
                <td>敏感 / 节点</td>
                <td class="c"><span class="badge b-blue">监测中</span></td>
                <td class="mono c up">+0.042</td>
              </tr>
              <tr>
                <td class="mono c">3</td>
                <td><div class="rr12-ev">食堂价格调整抱怨</div><div class="rr12-ev-id mono">E-2f6b02 · 社会热点议题</div></td>
                <td><div class="rr12-rank"><span class="mono">0.673</span><span class="rr12-rankbar"><i style="width:67.3%;background:#73a7ff"></i></span></div></td>
                <td class="c"><span class="badge b-blue">三级</span></td>
                <td>负面 / 速度</td>
                <td class="c"><span class="badge b-amber">待核</span></td>
                <td class="mono c up">+0.018</td>
              </tr>
              <tr>
                <td class="mono c">4</td>
                <td><div class="rr12-ev">校区班车延误投诉</div><div class="rr12-ev-id mono">E-2f5d18 · 突发公共事件</div></td>
                <td><div class="rr12-rank"><span class="mono">0.611</span><span class="rr12-rankbar"><i style="width:61.1%;background:#73a7ff"></i></span></div></td>
                <td class="c"><span class="badge b-blue">三级</span></td>
                <td>速度 / 扩散</td>
                <td class="c"><span class="badge b-cyan">已处置</span></td>
                <td class="mono c down">−0.024</td>
              </tr>
              <tr>
                <td class="mono c">5</td>
                <td><div class="rr12-ev">宿舍网络中断反馈</div><div class="rr12-ev-id mono">E-2f4c77 · 突发公共事件</div></td>
                <td><div class="rr12-rank"><span class="mono">0.573</span><span class="rr12-rankbar"><i style="width:57.3%;background:#73a7ff"></i></span></div></td>
                <td class="c"><span class="badge b-blue">三级</span></td>
                <td>节点 / 负面</td>
                <td class="c"><span class="badge b-cyan">已处置</span></td>
                <td class="mono c down">−0.051</td>
              </tr>
              <tr>
                <td class="mono c">6</td>
                <td><div class="rr12-ev">社团招新争议</div><div class="rr12-ev-id mono">E-2f3a90 · 网络谣言</div></td>
                <td><div class="rr12-rank"><span class="mono">0.486</span><span class="rr12-rankbar"><i style="width:48.6%;background:#4d6b85"></i></span></div></td>
                <td class="c"><span class="badge rr12-b-off">四级</span></td>
                <td>扩散 / 节点</td>
                <td class="c"><span class="badge rr12-b-off">已关闭</span></td>
                <td class="mono c down">−0.073</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="note">按 10-19 21:00 数据时点综合分值降序；等级按四级规则 ≥0.82 / [0.68, 0.82) / [0.52, 0.68) / &lt;0.52，事件类型按表2 三类；24h Δ 为同一事件 24 小时分值变化。池内 12 起，最高二级，无一级事件；第 3 名 0.673 距二级下限 0.007，已按边界规则转人工复核。</div>
      </div>

      <div class="panel">
        <div class="ph"><div class="t">预警渠道与触达</div><div class="s">二级响应 · 42 名处置人员 · 4 个渠道</div></div>
        <div class="rr12-ch">
          <div class="rr12-ch-row">
            <span class="rr12-ch-n">工作台推送</span>
            <span class="rr12-ch-meter"><i class="hi" style="width:98.81%"></i></span>
            <span class="rr12-ch-v mono">83 / 84 · 98.81%</span>
            <span class="rr12-ch-t">首达 3 秒</span>
          </div>
          <div class="rr12-ch-row">
            <span class="rr12-ch-n">短信</span>
            <span class="rr12-ch-meter"><i class="mid" style="width:97.62%"></i></span>
            <span class="rr12-ch-v mono">41 / 42 · 97.62%</span>
            <span class="rr12-ch-t">首达 42 秒</span>
          </div>
          <div class="rr12-ch-row">
            <span class="rr12-ch-n">邮件</span>
            <span class="rr12-ch-meter"><i class="mid" style="width:95.56%"></i></span>
            <span class="rr12-ch-v mono">43 / 45 · 95.56%</span>
            <span class="rr12-ch-t">首达 1 分 08 秒</span>
          </div>
          <div class="rr12-ch-row">
            <span class="rr12-ch-n">语音外呼</span>
            <span class="rr12-ch-meter"><i class="low" style="width:91.67%"></i></span>
            <span class="rr12-ch-v mono">11 / 12 · 91.67%</span>
            <span class="rr12-ch-t">首达 55 秒</span>
          </div>
        </div>
        <div class="kv rr12-kv2" style="margin-top:12px">
          <div><span>触达对象</span><b>42 人（值班 12 / 分管 8 / 业务 22）</b></div>
          <div><span>首次触达</span><b>3 秒（工作台推送）</b></div>
          <div><span>全员触达</span><b>9 分 40 秒</b></div>
          <div><span>触达确认</span><b>40 / 42 · 95.24%</b></div>
        </div>
        <div class="note">主渠道合计 183 次发送、178 次送达，送达率 97.27%；5 次未送达（工作台离线 1 / 空号 1 / 退信 2 / 未接 1）均由备用渠道补发，最终 42 / 42 全员触达；未确认 2 人由值班电话补确认。响应时限 2 小时，实际首次触达 3 秒。</div>
      </div>
    </div>

    <!-- ============================================================================
         R2 · 分级依据（3 个模块）
         建议插入顺序：模块 1 置于「分级规则 / 七维权重 / 分维阈值」面板之后；
         模块 2+3 追加在 r2 末尾（人工复核算例之后）。
         ============================================================================ -->
    <!-- ==== RISK r1 扩充结束 ==== -->
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
        <colgroup><col style="width:30%"><col style="width:14%"><col style="width:14%"><col style="width:20%"><col style="width:22%"></colgroup>
        <thead><tr><th>指标</th><th>权重</th><th>得分</th><th>贡献</th><th>等级</th></tr></thead>
        <tbody>
          <tr><td>事件热度</td><td class="mono" style="text-align:center">0.18</td><td class="mono" style="text-align:center">0.78</td><td class="mono" style="text-align:center">0.140</td><td style="text-align:center"><span class="badge b-red">极高</span></td></tr>
          <tr><td>传播速度</td><td class="mono" style="text-align:center">0.16</td><td class="mono" style="text-align:center">0.66</td><td class="mono" style="text-align:center">0.106</td><td style="text-align:center"><span class="badge b-amber">高</span></td></tr>
          <tr><td>负面情感强度</td><td class="mono" style="text-align:center">0.15</td><td class="mono" style="text-align:center">0.71</td><td class="mono" style="text-align:center">0.107</td><td style="text-align:center"><span class="badge b-red">极高</span></td></tr>
          <tr><td>群体对立</td><td class="mono" style="text-align:center">0.17</td><td class="mono" style="text-align:center">0.74</td><td class="mono" style="text-align:center">0.126</td><td style="text-align:center"><span class="badge b-red">极高</span></td></tr>
          <tr><td>关键节点活跃度</td><td class="mono" style="text-align:center">0.12</td><td class="mono" style="text-align:center">0.62</td><td class="mono" style="text-align:center">0.074</td><td style="text-align:center"><span class="badge b-amber">高</span></td></tr>
          <tr><td>议题敏感度</td><td class="mono" style="text-align:center">0.11</td><td class="mono" style="text-align:center">0.80</td><td class="mono" style="text-align:center">0.088</td><td style="text-align:center"><span class="badge b-red">极高</span></td></tr>
          <tr><td>跨平台扩散</td><td class="mono" style="text-align:center">0.11</td><td class="mono" style="text-align:center">0.58</td><td class="mono" style="text-align:center">0.064</td><td style="text-align:center"><span class="badge b-amber">高</span></td></tr>
        </tbody>
      </table>
      <div class="ph" style="margin-top:18px;margin-bottom:8px"><div class="t">分维阈值</div><div class="s">表14 · 当前所处分级加粗</div></div>
      <table class="tb" style="table-layout:fixed;width:100%">
        <colgroup><col style="width:28%"><col style="width:18%"><col style="width:18%"><col style="width:18%"><col style="width:18%"></colgroup>
        <thead><tr><th>指标</th><th style="text-align:center">低</th><th style="text-align:center">中</th><th style="text-align:center">高</th><th style="text-align:center">极高</th></tr></thead>
        <tbody>
          <tr><td>事件热度</td><td style="text-align:center">&lt;0.35</td><td style="text-align:center">0.35–0.55</td><td style="text-align:center">0.55–0.75</td><td style="text-align:center;color:#ff7f86;font-weight:700">&gt;0.75</td></tr>
          <tr><td>传播速度</td><td style="text-align:center">&lt;0.30</td><td style="text-align:center">0.30–0.50</td><td style="text-align:center;color:#f6c66b;font-weight:700">0.50–0.70</td><td style="text-align:center">&gt;0.70</td></tr>
          <tr><td>负面情感强度</td><td style="text-align:center">&lt;0.30</td><td style="text-align:center">0.30–0.50</td><td style="text-align:center">0.50–0.70</td><td style="text-align:center;color:#ff7f86;font-weight:700">&gt;0.70</td></tr>
          <tr><td>群体对立</td><td style="text-align:center">&lt;0.30</td><td style="text-align:center">0.30–0.50</td><td style="text-align:center">0.50–0.72</td><td style="text-align:center;color:#ff7f86;font-weight:700">&gt;0.72</td></tr>
          <tr><td>关键节点活跃度</td><td style="text-align:center">&lt;0.28</td><td style="text-align:center">0.28–0.46</td><td style="text-align:center;color:#f6c66b;font-weight:700">0.46–0.64</td><td style="text-align:center">&gt;0.64</td></tr>
          <tr><td>议题敏感度</td><td style="text-align:center">&lt;0.32</td><td style="text-align:center">0.32–0.54</td><td style="text-align:center">0.54–0.76</td><td style="text-align:center;color:#ff7f86;font-weight:700">&gt;0.76</td></tr>
          <tr><td>跨平台扩散</td><td style="text-align:center">&lt;0.25</td><td style="text-align:center">0.25–0.45</td><td style="text-align:center;color:#f6c66b;font-weight:700">0.45–0.65</td><td style="text-align:center">&gt;0.65</td></tr>
        </tbody>
      </table>
      <div style="margin-top:12px;font-size:11.5px;color:#8fa7ba">当前事件综合分值 0.74，落在二级区间；七项权重合计 1.00。七维加权 0.705 + 跨维联动修正 0.035 = 0.740。</div>
      <div class="note">同一得分在不同维度可落在不同等级（如 0.71 在负面情感为极高、在事件热度仅为高），需逐维对照表14；事件类型按表2 分三类，本事件为突发公共事件。</div>
    </div>

    <div class="g g2" style="grid-template-columns:1fr 1fr;margin-top:14px">
      <div class="panel">
        <div class="ph"><div class="t">七维得分对照</div><div class="s">当前事件 vs 同类事件均值</div></div>
        <div id="dimRadar" style="height:308px"></div>
        <div class="note">对立 0.74、敏感 0.80、热度 0.78 均高于同类均值；扩散 0.58 低于均值 0.62，尚未形成跨平台共振。</div>
      </div>
      <div class="panel">
        <div class="ph"><div class="t">分级阈值说明</div><div class="s">分位数定档 · 季度校准</div></div>
        <div class="kv" style="grid-template-columns:1fr 1fr">
          <div><span>定档方法</span><b>P90 / P65 / P35 分位</b></div>
          <div><span>阈值</span><b>0.82 / 0.68 / 0.52</b></div>
          <div><span>校准周期</span><b>每季度 · 幅度 ≤0.03</b></div>
          <div><span>边界处理</span><b>±0.01 转人工复核</b></div>
        </div>
        <div style="margin-top:12px;font-size:11.5px;color:#8fa7ba;line-height:1.9">
          样本为 6,989 条已审核记录，按表2 的突发公共事件、社会热点议题、网络谣言三类分别定档，本事件适用「突发公共事件」档。
        </div>
        <div class="note">分值构成：七维加权 0.705 + 跨维联动修正 +0.035 = 0.740；修正项只在对立与敏感同时高于 0.70 时计入。</div>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
          <span class="badge b-cyan">阈值版本 2026Q4</span><span class="badge b-blue">样本 6,989 条</span><span class="badge b-amber">边界复核 3 例</span>
        </div>
      </div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">人工复核算例</div><div class="s">近 3 次触发复核的记录</div></div>
      <table class="tb" style="table-layout:fixed;width:100%">
        <colgroup><col style="width:15%"><col style="width:20%"><col style="width:18%"><col style="width:12%"><col style="width:35%"></colgroup>
        <thead><tr><th>复核时间</th><th>触发规则</th><th>系统判定</th><th>结论</th><th>处理说明</th></tr></thead>
        <tbody>
          <tr><td class="mono">10-19 19:40</td><td>边界值 0.671</td><td class="mono">三级 · 0.671</td><td><span class="badge b-amber">维持三级</span></td><td>距二级阈值 0.009，人工确认不升级，按 6 小时响应。</td></tr>
          <tr><td class="mono">10-18 23:20</td><td>跨平台突增 4→6</td><td class="mono">二级 · 0.695</td><td><span class="badge b-red">确认二级</span></td><td>补录 2 个同源平台，扩散分修正为 0.58，复算 0.71。</td></tr>
          <tr><td class="mono">10-19 21:00</td><td>二级自动定档</td><td class="mono">二级 · 0.740</td><td><span class="badge b-red">确认二级</span></td><td>对立与敏感同向上升，维持定档并生成专报。</td></tr>
        </tbody>
      </table>
      <div class="note">复核只确认或上调，不直接下调定档；上调需记录依据，用于季度阈值校准。</div>
    </div>

    <!-- ==== RISK r2 扩充开始（由 enrich/merge.py 注入）==== -->
    <!-- R2 · 模块 1：分级判定决策路径（五步判定 + 阈值带 + 判定流程表） -->
    <div class="panel rr12-block">
      <div class="ph"><div class="t">分级判定决策路径</div><div class="s">五步判定 · 阈值版本 2026Q4 · 事件 E-2f7c9a</div></div>
      <div class="rr12-flow">
        <div class="rr12-node">
          <div class="rr12-node-h"><b>01</b>信号聚合</div>
          <div class="rr12-node-v">6,989<small>条</small></div>
          <div class="rr12-node-d">20 个验证机构 · 窗口 10-18 09:00 → 10-19 21:00</div>
        </div>
        <div class="rr12-arw2">›</div>
        <div class="rr12-node">
          <div class="rr12-node-h"><b>02</b>七维打分</div>
          <div class="rr12-node-v">4 极高<small>/ 3 高</small></div>
          <div class="rr12-node-d">按表14 分维阈值逐项定级，无中低项</div>
        </div>
        <div class="rr12-arw2">›</div>
        <div class="rr12-node">
          <div class="rr12-node-h"><b>03</b>加权合成</div>
          <div class="rr12-node-v">0.705</div>
          <div class="rr12-node-d">七维权重合计 1.00 · Σ 权重 × 得分</div>
        </div>
        <div class="rr12-arw2">›</div>
        <div class="rr12-node">
          <div class="rr12-node-h"><b>04</b>联动修正</div>
          <div class="rr12-node-v">+0.035</div>
          <div class="rr12-node-d">对立 0.74 且 敏感 0.80 同时 &gt; 0.70</div>
        </div>
        <div class="rr12-arw2">›</div>
        <div class="rr12-node on">
          <div class="rr12-node-h"><b>05</b>阈值定档</div>
          <div class="rr12-node-v">0.740<small>→ 二级</small></div>
          <div class="rr12-node-d">0.68 ≤ 0.740 &lt; 0.82 · 自动定档</div>
        </div>
      </div>

      <div class="rr12-row rr12-c12" style="margin-top:14px">
        <div>
          <div class="subhead">阈值区间与本事件位置</div>
          <div class="rr12-band">
            <div class="rr12-band-track">
              <span class="rr12-band-seg s4" style="width:52%">四级</span>
              <span class="rr12-band-seg s3" style="width:16%">三级</span>
              <span class="rr12-band-seg s2" style="width:14%">二级</span>
              <span class="rr12-band-seg s1" style="width:18%">一级</span>
            </div>
            <div class="rr12-band-mark" style="left:74%"><b>0.740</b></div>
            <div class="rr12-band-axis">
              <span style="left:0">0.00</span>
              <span style="left:52%">0.52</span>
              <span style="left:68%">0.68</span>
              <span style="left:82%">0.82</span>
              <span style="left:100%" class="end">1.00</span>
            </div>
          </div>
          <div class="rr12-verdict">
            <div class="rr12-verdict-main"><span class="rr12-verdict-score">0.740</span><span class="rr12-verdict-lv">二级 · 重大</span></div>
            <div class="rr12-verdict-d">七维加权 0.705 + 联动修正 0.035 · 响应时限 2 小时 · 报告 日报 + 专报</div>
            <div class="rr12-verdict-d">距下界 0.060 · 距上界 0.080 · 超出 ±0.01 边界带 → 不触发人工复核</div>
          </div>
          <div class="rr12-points">
            <div class="rr12-points-h">本次判定要点</div>
            <ul>
              <li>分维定级全部由表14 阈值直接命中：4 项极高、3 项高，无单维越级</li>
              <li>联动修正是唯一跨维调整项：对立 0.74 与敏感 0.80 同时越过 0.70，计 +0.035</li>
              <li>0.740 距 0.68 与 0.82 均超过 ±0.01 边界带，自动定档，不转人工</li>
              <li>定档即进入 2 小时时效计时（时限 10-19 23:00），日报与专报同步生成</li>
            </ul>
          </div>
        </div>
        <div>
          <div class="subhead">判定流程与本次取值</div>
          <div class="rr12-tbwrap">
            <table class="tb rr12-tb" style="table-layout:fixed;width:100%">
              <colgroup><col style="width:16%"><col style="width:26%"><col style="width:34%"><col style="width:24%"></colgroup>
              <thead><tr><th>步骤</th><th>判定条件</th><th>本事件取值</th><th class="c">结论</th></tr></thead>
              <tbody>
                <tr><td>分维定级</td><td>表14 分维阈值</td><td>极高 4 项：热度 0.78 / 负面 0.71 / 对立 0.74 / 敏感 0.80；高 3 项：速度 0.66 / 节点 0.62 / 扩散 0.58</td><td class="c">无单维越级</td></tr>
                <tr><td>加权合成</td><td>Σ 权重 × 得分，权重合计 1.00</td><td>0.140 + 0.106 + 0.107 + 0.126 + 0.074 + 0.088 + 0.064</td><td class="mono c">0.705</td></tr>
                <tr><td>联动修正</td><td>对立 &gt; 0.70 且 敏感 &gt; 0.70</td><td>对立 0.74、敏感 0.80，两项同时满足</td><td class="mono c up">+0.035</td></tr>
                <tr><td>阈值定档</td><td>0.68 ≤ 分值 &lt; 0.82</td><td>0.740 ∈ [0.68, 0.82)</td><td class="c"><span class="badge b-amber">二级（重大）</span></td></tr>
                <tr><td>边界复核</td><td>距阈值 ≤ 0.01 转人工</td><td>距下界 0.060、距上界 0.080，均 &gt; 0.01</td><td class="c">不触发</td></tr>
                <tr><td>时效绑定</td><td>二级 → 2 小时响应</td><td>10-19 21:00 定档</td><td class="mono c">时限 23:00</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="note">阈值采用半开区间 [0.52, 0.68) / [0.68, 0.82) / [0.82, 1.00]，端点只归属上一级，避免 0.68、0.82 重复计入；联动修正只在两项门槛同时满足时计入，与「分级阈值说明」中的规则同源。</div>
    </div>

    <!-- R2 · 模块 2 + 3：阈值敏感性分析 ｜ 人工复核一致性（混淆矩阵） -->
    <div class="rr12-row rr12-c12 rr12-block">
      <div class="panel">
        <div class="ph"><div class="t">阈值敏感性分析</div><div class="s">四级阈值同步平移 ±0.04 · 6,989 条重算</div></div>
        <div class="rr12-chartbox">
          <div id="rr12-sensChart" style="height:236px"></div>
        </div>
        <div class="kv rr12-kv2" style="margin-top:10px">
          <div><span>本事件等级</span><b>5 / 5 档均判二级</b></div>
          <div><span>一级事件数</span><b>419 – 979 条</b></div>
          <div><span>每 0.01 平移</span><b>一级 ±70 条（1.00pt）</b></div>
          <div><span>基准分布</span><b>10.00 / 25.00 / 30.00 / 35.00</b></div>
        </div>
        <div class="note">对 6,989 条已审核记录按平移后的阈值重新定档（三类分别定档后合并统计，快照 2026-11-05）；基准阈值为 2026Q4 的 0.82 / 0.68 / 0.52，对应 P90 / P65 / P35，各级占比 10.00% / 25.00% / 30.00% / 35.00%。阈值每上移 0.01，一级事件数减少约 70 条、四级增加约 60 条；本事件 0.740 距一级下限 0.040–0.120，需阈值下移 0.08 或分值上升 0.080 才升级，±0.04 内定档稳健。</div>
      </div>

      <div class="panel">
        <div class="ph"><div class="t">人工复核一致性</div><div class="s">近 12 个月 1,024 次复核 · 混淆矩阵</div></div>
        <div class="rr12-mxwrap">
          <div class="rr12-mx">
            <div class="rr12-mx-corner">系统 ↓<br>人工 →</div>
            <div class="rr12-mx-h">一级</div><div class="rr12-mx-h">二级</div><div class="rr12-mx-h">三级</div><div class="rr12-mx-h">四级</div><div class="rr12-mx-h tot">合计</div>

            <div class="rr12-mx-r">一级</div>
            <div class="rr12-mx-cell diag" style="background:rgba(98,230,210,.14)">40</div>
            <div class="rr12-mx-cell zero">—</div>
            <div class="rr12-mx-cell zero">—</div>
            <div class="rr12-mx-cell zero">—</div>
            <div class="rr12-mx-cell tot">40</div>

            <div class="rr12-mx-r">二级</div>
            <div class="rr12-mx-cell up" style="background:rgba(246,198,107,.26)">5</div>
            <div class="rr12-mx-cell diag" style="background:rgba(98,230,210,.24)">236</div>
            <div class="rr12-mx-cell zero">—</div>
            <div class="rr12-mx-cell zero">—</div>
            <div class="rr12-mx-cell tot">241</div>

            <div class="rr12-mx-r">三级</div>
            <div class="rr12-mx-cell zero">—</div>
            <div class="rr12-mx-cell up" style="background:rgba(246,198,107,.42)">11</div>
            <div class="rr12-mx-cell diag" style="background:rgba(98,230,210,.40)">514</div>
            <div class="rr12-mx-cell zero">—</div>
            <div class="rr12-mx-cell tot">525</div>

            <div class="rr12-mx-r">四级</div>
            <div class="rr12-mx-cell zero">—</div>
            <div class="rr12-mx-cell zero">—</div>
            <div class="rr12-mx-cell up" style="background:rgba(246,198,107,.31)">7</div>
            <div class="rr12-mx-cell diag" style="background:rgba(98,230,210,.22)">211</div>
            <div class="rr12-mx-cell tot">218</div>

            <div class="rr12-mx-r tot">合计</div>
            <div class="rr12-mx-cell tot">45</div>
            <div class="rr12-mx-cell tot">247</div>
            <div class="rr12-mx-cell tot">521</div>
            <div class="rr12-mx-cell tot">211</div>
            <div class="rr12-mx-cell grand">1,024</div>
          </div>
        </div>

        <div class="kv rr12-kv4" style="margin-top:12px">
          <div><span>一致率</span><b>97.75%</b></div>
          <div><span>一致 / 总复核</span><b>1,001 / 1,024</b></div>
          <div><span>分歧</span><b>23 条 · 全部上调</b></div>
          <div><span>下调</span><b>0 条</b></div>
        </div>

        <div class="rr12-trig">
          <div class="rr12-trig-h"><span>触发规则</span><span class="c">复核次数</span><span class="c">一致率</span><span class="c">分歧 23 条占比</span></div>
          <div class="rr12-trig-row"><span class="rr12-trig-n">边界值 ±0.01</span><span class="mono c">612</span><span class="mono c">98.86%</span><span class="rr12-trig-bar"><i style="width:13.3%"></i></span></div>
          <div class="rr12-trig-row"><span class="rr12-trig-n">跨平台突增</span><span class="mono c">214</span><span class="mono c">97.66%</span><span class="rr12-trig-bar"><i style="width:27.2%"></i></span></div>
          <div class="rr12-trig-row"><span class="rr12-trig-n">维度分歧 &gt;0.15</span><span class="mono c">128</span><span class="mono c">91.41%</span><span class="rr12-trig-bar"><i class="hi" style="width:100%"></i></span></div>
          <div class="rr12-trig-row"><span class="rr12-trig-n">自动定档确认</span><span class="mono c">70</span><span class="mono c">100.00%</span><span class="rr12-trig-bar"><i style="width:0%"></i></span></div>
        </div>
        <div class="note">矩阵行 = 系统判定、列 = 人工复核结论；23 条分歧全部为人工上调（二级→一级 5、三级→二级 11、四级→三级 7），无下调，与「复核只确认或上调，不直接下调定档」规则一致；分歧集中在「维度分歧 &gt;0.15」触发（11 / 128 = 8.59%）。</div>
      </div>
    </div>
    <!-- ==== RISK r2 扩充结束 ==== -->
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
        <div class="note">T-01 参数为原型默认值；T-02 ~ T-04 依据历史回写校准过一次，收益为推演环境下的综合收益。</div>
      </div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">四类模板对比</div><div class="s">同一事件下的可选路径</div></div>
      <table class="tb" style="table-layout:fixed;width:100%">
        <colgroup><col style="width:22%"><col style="width:14%"><col style="width:13%"><col style="width:14%"><col style="width:8%"><col style="width:12%"><col style="width:17%"></colgroup>
        <thead><tr><th>模板</th><th>干预对象</th><th>介入时机</th><th>发布渠道</th><th>强度</th><th>预期收益</th><th>合规状态</th></tr></thead>
        <tbody>
          <tr><td>T-01 权威信息发布</td><td>全体受众</td><td>发酵初期</td><td>官方账号</td><td>中</td><td class="mono">0.72</td><td><span class="badge b-cyan">已通过</span></td></tr>
          <tr><td>T-02 事实核查</td><td>谣言受众</td><td>扩散期</td><td>媒体 + 平台</td><td>强</td><td class="mono">0.64</td><td><span class="badge b-cyan">已通过</span></td></tr>
          <tr><td>T-03 正面引导</td><td>摇摆群体</td><td>极化前</td><td>意见领袖</td><td>中</td><td class="mono">0.58</td><td><span class="badge b-amber">通过 · 附条件</span></td></tr>
          <tr><td>T-04 议题降温</td><td>对立群体</td><td>高峰期</td><td>多平台</td><td>弱</td><td class="mono">0.49</td><td><span class="badge b-amber">待补材料</span></td></tr>
        </tbody>
      </table>
      <div class="note">收益为推演环境下的综合收益（极化、情感、传播三项加权），非真实业务效果；组合使用见「效果评估」。</div>
    </div>

    <div class="g g2" style="grid-template-columns:1fr 1.2fr;margin-top:14px">
      <div class="panel">
        <div class="ph"><div class="t">合规检查清单</div><div class="s">发布前 5 项 · 4 项已通过</div></div>
        <div style="display:grid;gap:8px">
          <div style="display:flex;align-items:center;gap:9px;padding:9px 11px;border:1px solid var(--line);border-radius:10px;background:#0a1727">
            <span class="badge b-cyan" style="padding:1px 7px">✓</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px">事实依据可溯源</div>
              <div style="font-size:10px;color:#8fa7ba">3 条原始报道 + 2 份公告已归档</div>
            </div>
            <span class="badge b-cyan">通过</span>
          </div>
          <div style="display:flex;align-items:center;gap:9px;padding:9px 11px;border:1px solid var(--line);border-radius:10px;background:#0a1727">
            <span class="badge b-cyan" style="padding:1px 7px">✓</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px">口径经宣传部门审定</div>
              <div style="font-size:10px;color:#8fa7ba">10-19 20:30 审定，版本 v3</div>
            </div>
            <span class="badge b-cyan">通过</span>
          </div>
          <div style="display:flex;align-items:center;gap:9px;padding:9px 11px;border:1px solid var(--line);border-radius:10px;background:#0a1727">
            <span class="badge b-cyan" style="padding:1px 7px">✓</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px">不涉及个人隐私与未公开信息</div>
              <div style="font-size:10px;color:#8fa7ba">账号均已脱敏，无个人信息字段</div>
            </div>
            <span class="badge b-cyan">通过</span>
          </div>
          <div style="display:flex;align-items:center;gap:9px;padding:9px 11px;border:1px solid var(--line);border-radius:10px;background:#0a1727">
            <span class="badge b-cyan" style="padding:1px 7px">✓</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px">平台规则与账号权限核查</div>
              <div style="font-size:10px;color:#8fa7ba">4 个平台发布权限均在有效期内</div>
            </div>
            <span class="badge b-cyan">通过</span>
          </div>
          <div style="display:flex;align-items:center;gap:9px;padding:9px 11px;border:1px solid var(--line);border-radius:10px;background:#0a1727">
            <span class="badge b-amber" style="padding:1px 7px">!</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px">撤稿与更正预案</div>
              <div style="font-size:10px;color:#8fa7ba">预案模板待法务确认，T-04 暂不对外</div>
            </div>
            <span class="badge b-amber">待补</span>
          </div>
        </div>
        <div class="note">第 5 项未闭环前，T-04 只允许内部推演，不进入真实渠道。</div>
      </div>
      <div class="panel">
        <div class="ph"><div class="t">历史使用与效果回写</div><div class="s">近 3 次真实使用</div></div>
        <table class="tb" style="table-layout:fixed;width:100%">
          <colgroup><col style="width:16%"><col style="width:14%"><col style="width:24%"><col style="width:26%"><col style="width:20%"></colgroup>
          <thead><tr><th>时间</th><th>模板</th><th>场景</th><th>预期 / 实测</th><th>回写结论</th></tr></thead>
          <tbody>
            <tr><td class="mono">2025-11-12</td><td class="mono">T-01</td><td>招生计划误读</td><td class="mono">0.69 / 0.67</td><td><span class="badge b-cyan">一致</span></td></tr>
            <tr><td class="mono">2026-03-05</td><td class="mono">T-02</td><td>教师流动谣言</td><td class="mono">0.61 / 0.58</td><td><span class="badge b-amber">偏低 0.03</span></td></tr>
            <tr><td class="mono">2026-06-18</td><td class="mono">T-03</td><td>校区调整争议</td><td class="mono">0.55 / 0.54</td><td><span class="badge b-cyan">一致</span></td></tr>
          </tbody>
        </table>
        <div class="note">回写差值 = 实测 − 预期；连续两次偏差超过 0.03 的模板进入参数重标定，本期无触发。</div>
        <div class="kv" style="grid-template-columns:repeat(3,1fr);margin-top:12px">
          <div><span>平均偏差</span><b>0.020</b></div>
          <div><span>重标定模板</span><b>0 个</b></div>
          <div><span>覆盖场景</span><b>3 类</b></div>
        </div>
      </div>
    </div>

    <!-- ==== RISK r3 扩充开始（由 enrich/merge.py 注入）==== -->
    <!-- ============================================================================
         R3 · 干预方案（4 个模块）
           1 模板匹配逻辑（风险等级 × 事件阶段 → 推荐模板）
           2 可配置干预策略模板原型 T-01-P（参数可调、收益/极化/反噬实时重算）
           3 执行编排 T+0h → T+24h（7 项任务 · 6 类责任角色 · 关键路径 2 小时）
           4 合规与伦理审查（6 项 · 依据条款 · 审查结论）
         ============================================================================ -->
    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">模板匹配逻辑</div><div class="s">风险等级 × 事件阶段 → 推荐模板 · 加权匹配度排序</div></div>
      <div class="g g2" style="grid-template-columns:1.5fr 1fr;gap:18px">
        <div>
          <table class="tb" style="table-layout:fixed;width:100%">
            <colgroup><col style="width:18%"><col style="width:11%"><col style="width:18%"><col style="width:13%"><col style="width:10%"><col style="width:11%"><col style="width:19%"></colgroup>
            <thead><tr><th>风险等级（区间）</th><th>当前</th><th>首选模板</th><th>备选</th><th>参考收益</th><th>匹配度均值</th><th>触发条件</th></tr></thead>
            <tbody>
              <tr><td>一级 · 特别重大<br><span class="rr345-sub">0.82–1.00</span></td><td style="text-align:center" class="rr345-sub">—</td><td>T-01 + T-02 组合</td><td class="rr345-sub">T-01</td><td class="mono">0.79</td><td class="mono">0.91</td><td class="rr345-sub">综合 ≥0.82，或 24h 内越线</td></tr>
              <tr><td>二级 · 重大<br><span class="rr345-sub">0.68–0.82</span></td><td style="text-align:center"><span class="rr345-dot c"></span> <span class="mono">0.740</span></td><td>T-01 权威信息发布</td><td class="rr345-sub">T-03</td><td class="mono">0.72</td><td class="mono">0.88</td><td class="rr345-sub">4 项及以上维度「极高」</td></tr>
              <tr><td>三级 · 较大<br><span class="rr345-sub">0.52–0.68</span></td><td style="text-align:center" class="rr345-sub">—</td><td>T-02 事实核查</td><td class="rr345-sub">T-03</td><td class="mono">0.64</td><td class="mono">0.84</td><td class="rr345-sub">2–3 项「高」、驱动单一</td></tr>
              <tr><td>四级 · 一般<br><span class="rr345-sub">0.00–0.52</span></td><td style="text-align:center" class="rr345-sub">—</td><td>T-04 议题降温</td><td class="rr345-sub">观察（不下发）</td><td class="mono">0.49</td><td class="mono">0.79</td><td class="rr345-sub">无极高项、传播趋缓</td></tr>
            </tbody>
          </table>
          <div class="note">匹配度 = 0.45 × 分级适配 + 0.30 × 阶段适配 + 0.25 × 合规完备度；分值区间与表14 四级规则一致，左闭右开（0.82 归一级、0.68 归二级）。「当前」列标注 E-2f7c9a 所处区间。</div>
        </div>
        <div>
          <div class="rr345-rec">
            <div class="rr345-rechead"><span class="mono">E-2f7c9a · 0.740</span><span class="badge b-red">二级 重大</span></div>
            <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:10px">
              <div><div class="rr345-sub">推荐模板</div><div class="rr345-recname">T-01 权威信息发布</div></div>
              <div style="text-align:right"><div class="rr345-sub">匹配度</div><div class="rr345-score">0.88<small>/1.00</small></div></div>
            </div>
            <div style="margin-top:10px">
              <div class="rr345-kvline"><span>分级适配 · 权重 0.45</span><span class="v">0.92 → 0.414</span></div>
              <div class="rr345-kvline"><span>阶段适配 · 权重 0.30（极化临界）</span><span class="v">0.76 → 0.228</span></div>
              <div class="rr345-kvline"><span>合规完备 · 权重 0.25</span><span class="v">0.96 → 0.240</span></div>
              <div class="rr345-kvline"><span>加权合计</span><b>0.882 → 0.88</b></div>
            </div>
            <div class="rr345-ranks">
              <div><span class="nm">T-01</span><div class="rr345-bar"><i style="width:88%"></i></div><em>0.88</em></div>
              <div><span class="nm">T-03</span><div class="rr345-bar"><i style="width:71%"></i></div><em>0.71</em></div>
              <div><span class="nm">T-02</span><div class="rr345-bar"><i style="width:63%"></i></div><em>0.63</em></div>
              <div><span class="nm">T-04</span><div class="rr345-bar"><i style="width:42%"></i></div><em>0.42</em></div>
            </div>
          </div>
          <div class="note">T-04 阶段基础匹配 0.54，因「极化临界 + 弱强度」触发反噬扣减 −0.12 降至 0.42，不进入本轮下发队列。匹配度用于方案排序，不构成效果承诺。</div>
        </div>
      </div>
      <div class="ks" style="margin-top:12px;grid-template-columns:repeat(4,1fr)">
        <div class="k"><div class="l">T-01 权威信息发布</div><div class="v" style="font-size:12.5px">热度 · 负面情感</div><div class="d">情感改善 +6.8%</div></div>
        <div class="k"><div class="l">T-02 事实核查</div><div class="v" style="font-size:12.5px">关键节点 · 跨平台扩散</div><div class="d">传播降温 −8.7%</div></div>
        <div class="k"><div class="l">T-03 正面引导</div><div class="v" style="font-size:12.5px">群体对立 · 议题敏感</div><div class="d">极化回落 −0.047</div></div>
        <div class="k"><div class="l">T-04 议题降温</div><div class="v" style="font-size:12.5px">事件热度 · 传播速度</div><div class="d">传播降温 −4.3%</div></div>
      </div>
      <div class="note">四个模板各自主攻的维度不同：同一事件可组合使用（T-01 + T-02 组合 95% 区间 0.71–0.81），但需避免同一维度重复叠加造成反噬。模板收益与效果数据均为推演环境仿真，未经真实业务检验。</div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">可配置干预策略模板原型</div><div class="s">T-01-P · v0.9 · 四组参数可调，收益与极化回落实时重算</div></div>
      <div class="rr345-split">
        <div>
          <div class="rr345-ctrlrow" id="rr345-cfg">
            <div class="rr345-field"><span>发布强度</span>
              <div class="rr345-opts" id="rr345-stg"><span class="rr345-opt" data-v="weak">弱</span><span class="rr345-opt on" data-v="mid">中</span><span class="rr345-opt" data-v="strong">强</span></div>
            </div>
            <div class="rr345-field"><span>覆盖节点数</span>
              <div class="rr345-opts" id="rr345-cov"><span class="rr345-opt" data-v="c3">3 个</span><span class="rr345-opt on" data-v="c5">5 个</span><span class="rr345-opt" data-v="c8">8 个</span><span class="rr345-opt" data-v="c12">12 个</span></div>
            </div>
            <div class="rr345-field"><span>发布时机</span>
              <div class="rr345-opts" id="rr345-tim"><span class="rr345-opt on" data-v="t0">T+0</span><span class="rr345-opt" data-v="t2">T+2h</span><span class="rr345-opt" data-v="t4">T+4h</span><span class="rr345-opt" data-v="t6">T+6h</span></div>
            </div>
            <div class="rr345-field"><span>发布渠道</span>
              <div class="rr345-opts" id="rr345-ch"><span class="rr345-opt on" data-v="off">官方账号</span><span class="rr345-opt" data-v="media">媒体 + 平台</span><span class="rr345-opt" data-v="dual">双通道</span></div>
            </div>
          </div>
          <div class="rr345-outgrid" style="margin-top:12px">
            <div class="rr345-out"><div class="l">预估综合收益</div><div class="v" id="rr345-gain" style="color:#62e6d2">0.720</div><div class="d">基线 T-01 = 0.720</div></div>
            <div class="rr345-out"><div class="l">极化回落</div><div class="v" id="rr345-pol" style="color:#62e6d2">−0.084</div><div class="d">相对未干预分支</div></div>
            <div class="rr345-out"><div class="l">反噬风险</div><div class="v" id="rr345-risk" style="color:#62e6d2">低</div><div class="d" id="rr345-riskd">强度 · 时机组合正常</div></div>
            <div class="rr345-out"><div class="l">合规状态</div><div class="v" id="rr345-comp" style="color:#62e6d2;font-size:15px">通过</div><div class="d" id="rr345-compd">5 项检查 4 通过</div></div>
          </div>
          <div class="rr345-formula" id="rr345-calc">收益 = 0.720（T-01 基线）+ 0.000（强度）+ 0.000（覆盖）+ 0.000（时机）+ 0.000（渠道）= 0.720</div>
          <div class="ctrl" style="margin-top:10px">
            <button class="btn" id="rr345-reset" type="button">重置原型</button>
            <span class="badge b-blue">参数原型 · 未下发</span>
            <span class="rr345-disclaim">推演环境仿真，未经真实业务检验</span>
          </div>
          <div class="note">参数改变只重算原型估算值，不产生对外发布指令；写入模板库前须完成合规与伦理审查（见本页末）。系数为 24 组参数组合 × 20×500 次推演的回写校准值，保留 3 位小数以便比较。</div>
        </div>
        <div>
          <div class="ph" style="margin-bottom:4px"><div class="t" style="font-size:12.5px">参数敏感性</div><div class="s">发布时机 × 强度 → 预估综合收益（覆盖 5 节点 · 官方账号）</div></div>
          <div id="rr345-sens" style="height:252px"></div>
          <div class="note">时机每延后 2 小时收益约衰减 0.030；延迟 6 小时由 0.720 降至 0.631，极化回落由 −0.084 收窄至 −0.053（差 0.031），与「效果评估」中「提前 6 小时多回 0.031」一致。强度由「中」升到「强」收益回吐 0.038、极化收窄 0.023，对应 T-01 → T-02 的反噬结论；强度与收益呈倒 U 型。</div>
        </div>
      </div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">执行编排</div><div class="s">T+0h → T+24h · 7 项任务 · 6 类责任角色 · 关键路径 2 小时</div></div>
      <table class="tb" style="table-layout:fixed;width:100%">
        <colgroup><col style="width:7%"><col style="width:13%"><col style="width:30%"><col style="width:14%"><col style="width:11%"><col style="width:14%"><col style="width:11%"></colgroup>
        <thead><tr><th>时点</th><th>任务窗口</th><th>任务</th><th>责任角色</th><th>前置依赖</th><th>交付物</th><th>状态</th></tr></thead>
        <tbody>
          <tr><td class="mono">T+0h</td><td class="mono">19:00–19:30</td><td>事件接入、定级复核与责任人确认</td><td>值班研判员</td><td class="rr345-sub">—</td><td class="rr345-sub">复核单 v1</td><td><span class="badge b-cyan">✓ 完成</span></td></tr>
          <tr><td class="mono">T+1h</td><td class="mono">20:00–20:30</td><td>口径起草、法务预审、双人复核</td><td>宣传口径岗 / 法务</td><td class="rr345-sub">复核单 v1</td><td class="rr345-sub">口径 v3（20:30 审定）</td><td><span class="badge b-cyan">✓ 完成</span></td></tr>
          <tr><td class="mono">T+2h</td><td class="mono">21:00–21:20</td><td>T-01 权威信息发布（官方账号 3 条）</td><td>官方账号运营</td><td class="rr345-sub">口径 v3</td><td class="rr345-sub">发布回执 + 链接 ×3</td><td><span class="badge b-cyan">✓ 完成</span></td></tr>
          <tr><td class="mono">T+2h</td><td class="mono">21:00–23:00</td><td>5 个高传播节点定向事实核查</td><td>事实核查岗</td><td class="rr345-sub">发布回执</td><td class="rr345-sub">核查记录 5 条</td><td><span class="badge b-amber">◐ 进行中</span></td></tr>
          <tr><td class="mono">T+6h</td><td class="mono">01:00–02:00</td><td>摇摆群体引导（3 位意见领袖转发）</td><td>关系运营岗</td><td class="rr345-sub">口径 v3</td><td class="rr345-sub">转发截图 3 份</td><td><span class="badge b-blue">○ 待启动</span></td></tr>
          <tr><td class="mono">T+12h</td><td class="mono">07:00–08:00</td><td>舆情监测、指标回采与参数回写</td><td>数据研判岗</td><td class="rr345-sub">监测日报</td><td class="rr345-sub">回写记录 1 条</td><td><span class="badge b-blue">○ 待启动</span></td></tr>
          <tr><td class="mono">T+24h</td><td class="mono">19:00–20:00</td><td>效果评估、复盘会与模板重标定判定</td><td>评估岗</td><td class="rr345-sub">回写记录</td><td class="rr345-sub">复盘纪要</td><td><span class="badge b-blue">○ 待启动</span></td></tr>
        </tbody>
      </table>
      <div class="kv" style="grid-template-columns:repeat(4,1fr);margin-top:12px">
        <div><span>任务总数</span><b>7 项 · 3 完成 / 1 进行中</b></div>
        <div><span>可并行任务</span><b>2 项（T+2h 发布与核查）</b></div>
        <div><span>关键路径</span><b>2 小时（T+0h → T+2h）</b></div>
        <div><span>超时升级阈值</span><b>30 分钟</b></div>
      </div>
      <div class="note">T+0 = 10-19 19:00，当前时点 10-19 21:00（T+2h）。T+0h → T+2h 为关键路径，对应二级事件 2 小时响应时限；任一前置任务超时 30 分钟未闭环，自动升级一级处置并触发延误复盘（参照 E-2501-04）。责任人为角色，不含个人信息。</div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">合规与伦理审查</div><div class="s">6 项 · 5 通过 / 1 附条件 / 0 不通过 · 发布前完成</div></div>
      <table class="tb" style="table-layout:fixed;width:100%">
        <colgroup><col style="width:17%"><col style="width:27%"><col style="width:30%"><col style="width:13%"><col style="width:13%"></colgroup>
        <thead><tr><th>审查项</th><th>依据条款</th><th>审查要点</th><th>结论</th><th>审查时间</th></tr></thead>
        <tbody>
          <tr><td>内容合法性</td><td class="rr345-sub">《网络安全法》第 12 条；内部《信息发布管理办法》2.3</td><td class="rr345-sub">事实表述可溯源，不含违法和不良信息</td><td><span class="badge b-cyan">通过</span></td><td class="mono">10-19 20:31</td></tr>
          <tr><td>个人信息保护</td><td class="rr345-sub">《个人信息保护法》第 13、17 条；内部《数据脱敏规范》3.1</td><td class="rr345-sub">1,207 个账号均以哈希 ID 呈现，无手机号、姓名、位置字段</td><td><span class="badge b-cyan">通过</span></td><td class="mono">10-19 20:34</td></tr>
          <tr><td>算法与分级透明度</td><td class="rr345-sub">《互联网信息服务算法推荐管理规定》第 16、24 条</td><td class="rr345-sub">七维权重、阈值与匹配度计算过程随报告存档，可复核</td><td><span class="badge b-cyan">通过</span></td><td class="mono">10-19 20:37</td></tr>
          <tr><td>AI 生成内容标识</td><td class="rr345-sub">《生成式人工智能服务管理暂行办法》第 4、12 条</td><td class="rr345-sub">报告与推送文本均标注「AI 生成 · 推演环境仿真」</td><td><span class="badge b-cyan">通过</span></td><td class="mono">10-19 20:41</td></tr>
          <tr><td>干预伦理</td><td class="rr345-sub">内部《舆情干预操作规程（试行）》3.2、3.5</td><td class="rr345-sub">双人复核、可撤回、不制造虚假共识；撤稿与更正预案待法务确认</td><td><span class="badge b-amber">附条件</span></td><td class="mono">10-19 20:48</td></tr>
          <tr><td>弱势群体保护</td><td class="rr345-sub">内部《伦理审查要点》第 5 条</td><td class="rr345-sub">不对未成年人定向推送，不放大恐慌表述</td><td><span class="badge b-cyan">通过</span></td><td class="mono">10-19 20:52</td></tr>
        </tbody>
      </table>
      <div class="note">一票否决项（内容合法性、个人信息保护）均通过；「干预伦理」附条件未闭环前，T-04 只允许内部推演、不进入真实渠道，与上方合规检查清单第 5 项一致。条款号用于原型演示，实际适用以内部《制度汇编 v2.4》与法务意见为准。</div>
    </div>
    <!-- ==== RISK r3 扩充结束 ==== -->
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

    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">四类策略效果</div><div class="s">T-01 ~ T-04 · 推演环境实测</div></div>
      <table class="tb" style="table-layout:fixed;width:100%">
        <colgroup><col style="width:26%"><col style="width:18%"><col style="width:18%"><col style="width:18%"><col style="width:20%"></colgroup>
        <thead><tr><th>模板</th><th>极化变化</th><th>情感改善</th><th>传播降温</th><th>综合收益</th></tr></thead>
        <tbody>
          <tr><td>T-01 权威信息发布</td><td class="mono" style="color:#62e6d2">−0.084</td><td class="mono" style="color:#62e6d2">+6.8%</td><td class="mono" style="color:#62e6d2">−11.4%</td><td class="mono" style="color:#f6c66b">0.72</td></tr>
          <tr><td>T-02 事实核查</td><td class="mono" style="color:#62e6d2">−0.061</td><td class="mono" style="color:#62e6d2">+5.2%</td><td class="mono" style="color:#62e6d2">−8.7%</td><td class="mono" style="color:#f6c66b">0.64</td></tr>
          <tr><td>T-03 正面引导</td><td class="mono" style="color:#62e6d2">−0.047</td><td class="mono" style="color:#62e6d2">+3.9%</td><td class="mono" style="color:#62e6d2">−5.6%</td><td class="mono" style="color:#f6c66b">0.58</td></tr>
          <tr><td>T-04 议题降温</td><td class="mono" style="color:#62e6d2">−0.032</td><td class="mono" style="color:#62e6d2">+2.1%</td><td class="mono" style="color:#62e6d2">−4.3%</td><td class="mono" style="color:#f6c66b">0.49</td></tr>
        </tbody>
      </table>
      <div class="note">点击上方模板可切换对照曲线；表内数值与曲线末端一致，基线为未干预对照组。</div>
    </div>

    <div class="g g2" style="grid-template-columns:1.3fr 1fr;margin-top:14px">
      <div class="panel">
        <div class="ph"><div class="t">综合收益置信区间</div><div class="s">20 组参数 × 500 次 = 10,000 次 · 95% CI</div></div>
        <div id="ciChart" style="height:292px"></div>
        <div class="note">蒙特卡洛设定：20 组参数 × 每组 500 次抽样 = 10,000 次，取 95% 置信区间；参数扰动 ±15%，传播率与情感转移概率服从 Beta 分布。组合方案区间整体右移，上界 0.81 未触及一级阈值 0.82。</div>
      </div>
      <div class="panel">
        <div class="ph"><div class="t">结论</div><div class="s">与年度报告 2.4.3 节一致</div></div>
        <div style="display:grid;gap:10px;margin-top:2px">
          <div style="border-left:2px solid #62e6d2;padding-left:11px">
            <div style="font-size:12.5px;font-weight:700">早期介入收益最高</div>
            <div style="font-size:11px;color:#8fa7ba;line-height:1.8">发酵初期（T-01）综合收益 0.72，比高峰期（T-04）高 0.23；同一模板提前 6 小时，极化回落幅度平均多 0.031。</div>
          </div>
          <div style="border-left:2px solid #f6c66b;padding-left:11px">
            <div style="font-size:12.5px;font-weight:700">强度存在反噬拐点</div>
            <div style="font-size:11px;color:#8fa7ba;line-height:1.8">强度由「中」升到「强」（T-01 → T-02），传播降温反而少 2.7 个百分点，极化回落收窄 0.023；强度与收益不呈线性，过度介入会触发逆反。</div>
          </div>
          <div style="border-left:2px solid #73a7ff;padding-left:11px">
            <div style="font-size:12.5px;font-weight:700">组合优于单模板</div>
            <div style="font-size:11px;color:#8fa7ba;line-height:1.8">T-01 + T-02 组合 95% 区间 0.71–0.81，中位 0.79；建议 2 小时内先发权威信息，6 小时内跟进节点核查。</div>
          </div>
        </div>
        <div class="kv" style="grid-template-columns:1fr 1fr;margin-top:12px">
          <div><span>最优单模板</span><b>T-01 · 0.72</b></div>
          <div><span>组合区间</span><b>0.71–0.81</b></div>
          <div><span>反噬警戒</span><b>强档及以上</b></div>
          <div><span>建议窗口</span><b>2 小时内</b></div>
        </div>
        <div class="note">置信区间为推演环境模拟值，用于方案比较，不作为真实效果承诺。</div>
      </div>
    </div>

    <!-- ==== RISK r4 扩充开始（由 enrich/merge.py 注入）==== -->
    <!-- ============================================================================
         R4 · 效果评估（3 个模块）
           1 对照组设计（准实验 · 双重差分 · 处理组/对照组各 10,000 次）
           2 效果指标前后对比与统计检验（p 值 / Cohen's d / 95% CI 森林图）
           3 效果衰减曲线 0–72h（5 条路径 · 半衰期）
         ============================================================================ -->
    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">对照组设计</div><div class="s">准实验 · 双重差分（DID）· 主要终点 24h / 次要终点 72h</div></div>
      <div class="kv">
        <div><span>处理组（T-01 分支）</span><b>10,000 次推演</b></div>
        <div><span>对照组（未干预分支）</span><b>10,000 次推演</b></div>
        <div><span>匹配样本</span><b>9,864 对 · 98.64%</b></div>
        <div><span>统计功效</span><b>&gt;0.99（MDE d=0.12）</b></div>
      </div>
      <div class="g g2" style="grid-template-columns:1.35fr 1fr;gap:18px;margin-top:14px">
        <div>
          <div class="rr345-kvline" style="border-bottom:1px solid #14283d"><span>协变量平衡性检验（匹配后，SMD &lt;0.1 视为平衡）</span><span class="v">4 / 4 平衡</span></div>
          <table class="tb" style="table-layout:fixed;width:100%">
            <colgroup><col style="width:40%"><col style="width:15%"><col style="width:15%"><col style="width:15%"><col style="width:15%"></colgroup>
            <thead><tr><th>协变量</th><th style="text-align:right">处理组</th><th style="text-align:right">对照组</th><th style="text-align:right">SMD</th><th style="text-align:center">判定</th></tr></thead>
            <tbody>
              <tr><td>初始极化指数</td><td class="mono" style="text-align:right">0.734</td><td class="mono" style="text-align:right">0.731</td><td class="mono" style="text-align:right">0.021</td><td style="text-align:center"><span class="badge b-cyan">平衡</span></td></tr>
              <tr><td>群体对立指数</td><td class="mono" style="text-align:right">0.612</td><td class="mono" style="text-align:right">0.608</td><td class="mono" style="text-align:right">0.034</td><td style="text-align:center"><span class="badge b-cyan">平衡</span></td></tr>
              <tr><td>平台分布（HHI）</td><td class="mono" style="text-align:right">0.284</td><td class="mono" style="text-align:right">0.281</td><td class="mono" style="text-align:right">0.017</td><td style="text-align:center"><span class="badge b-cyan">平衡</span></td></tr>
              <tr><td>账号活跃度（ln 发帖/日）</td><td class="mono" style="text-align:right">2.41</td><td class="mono" style="text-align:right">2.37</td><td class="mono" style="text-align:right">0.046</td><td style="text-align:center"><span class="badge b-cyan">平衡</span></td></tr>
            </tbody>
          </table>
          <div class="note">处理组为 T-01 干预分支，对照组为同参数下的未干预基线分支；两组共享同一事件输入与随机种子分段，差异仅来自是否实施干预。基线极化 0.734 与多智能体推演 R12 输出 0.73 对齐（取实测值）。</div>
        </div>
        <div>
          <div class="rr345-kvline"><span>设计类型</span><b>准实验 · DID</b></div>
          <div class="rr345-kvline"><span>匹配方式</span><span class="v">1:1 PSM · 卡钳 0.05</span></div>
          <div class="rr345-kvline"><span>协变量</span><span class="v">极化 / 对立 / 平台 / 活跃度</span></div>
          <div class="rr345-kvline"><span>共同支撑域</span><span class="v">0.18–0.92 · 覆盖 96.2%</span></div>
          <div class="rr345-kvline"><span>推演时窗</span><span class="v">0–72h · 主终点 24h</span></div>
          <div class="rr345-kvline"><span>基线时点</span><span class="v">10-19 21:00 快照</span></div>
          <div class="rr345-kvline"><span>样本量依据</span><span class="v">d=0.12 · α=0.05 · power=0.80</span></div>
          <div class="rr345-kvline"><span>实际效应量</span><b>d=0.46 &gt; MDE 0.12</b></div>
          <div class="rr345-kvline"><span>对照组 24h 变化</span><span class="v">−0.002（0.731 → 0.729）</span></div>
          <div class="rr345-kvline"><span>DID 净效应（主终点）</span><b>−0.082</b></div>
          <div class="note">对照组来自同一推演环境的未干预分支，不是真实世界对照组；DID 估计量 =（处理后 − 处理前）−（对照后 − 对照前），仅用于推演环境内部比较。推演环境仿真，未经真实业务检验。</div>
        </div>
      </div>
    </div>

    <div class="g g2" style="grid-template-columns:1.4fr 1fr;margin-top:14px">
      <div class="panel">
        <div class="ph"><div class="t">效果指标前后对比</div><div class="s">处理组 vs 对照组 · 基线 → 干预后 24h · n=9,864 对</div></div>
        <table class="tb" style="table-layout:fixed;width:100%">
          <colgroup><col style="width:22%"><col style="width:13%"><col style="width:14%"><col style="width:14%"><col style="width:14%"><col style="width:11%"><col style="width:12%"></colgroup>
          <thead><tr><th>指标</th><th style="text-align:right">干预前</th><th style="text-align:right">干预后（24h）</th><th style="text-align:right">绝对变化</th><th style="text-align:right">相对变化</th><th style="text-align:right">p 值</th><th style="text-align:right">Cohen's d</th></tr></thead>
          <tbody>
            <tr><td>极化指数</td><td class="mono" style="text-align:right">0.734</td><td class="mono" style="text-align:right">0.650</td><td class="mono" style="text-align:right;color:#62e6d2">−0.084</td><td class="mono" style="text-align:right;color:#62e6d2">−11.4%</td><td class="mono" style="text-align:right">&lt;0.001</td><td class="mono" style="text-align:right">0.46</td></tr>
            <tr><td>群体对立指数</td><td class="mono" style="text-align:right">0.612</td><td class="mono" style="text-align:right">0.548</td><td class="mono" style="text-align:right;color:#62e6d2">−0.064</td><td class="mono" style="text-align:right;color:#62e6d2">−10.5%</td><td class="mono" style="text-align:right">0.002</td><td class="mono" style="text-align:right">0.38</td></tr>
            <tr><td>负面内容占比</td><td class="mono" style="text-align:right">58.0%</td><td class="mono" style="text-align:right">51.2%</td><td class="mono" style="text-align:right;color:#62e6d2">−6.8pt</td><td class="mono" style="text-align:right;color:#62e6d2">−11.7%</td><td class="mono" style="text-align:right">&lt;0.001</td><td class="mono" style="text-align:right">0.41</td></tr>
            <tr><td>转发量（条/小时）</td><td class="mono" style="text-align:right">1,742</td><td class="mono" style="text-align:right">1,543</td><td class="mono" style="text-align:right;color:#62e6d2">−199</td><td class="mono" style="text-align:right;color:#62e6d2">−11.4%</td><td class="mono" style="text-align:right">0.004</td><td class="mono" style="text-align:right">0.33</td></tr>
          </tbody>
        </table>
        <div class="note">检验方法：配对 t 检验 + Bootstrap 10,000 次重抽样（百分位法），双侧；多重比较按 Bonferroni 校正，4 项指标校正后 α′=0.0125，均通过。效应量按 Cohen 标准（0.2 小 / 0.5 中 / 0.8 大），4 项为小到中等效应但显著高于最小可检测效应 0.12。</div>
        <div class="note" style="margin-top:2px">尺度说明：综合分值 0.74（七维加权，越大越危险）与极化指数 0.734（0–1，越大越极化）是两套尺度；综合收益 0–1 越大越好，不与风险阈值 0.82 比较。</div>
        <div class="note" style="margin-top:2px">表中变化为处理组前后差（原始变化）；对照组同期仅 −0.002，扣除后 DID 净效应 −0.082（主终点）。效应量按配对样本计算，不随对照组变化而重估。</div>
        <div class="rr345-formula" style="margin-top:8px">DID（极化指数 · 主终点）= (0.650 − 0.734) − (0.729 − 0.731) = −0.084 − (−0.002) = <b>−0.082</b><br>ATT（平均处理效应）取主终点 24h，次要终点 72h 仅用于衰减曲线。</div>
      </div>
      <div class="panel">
        <div class="ph"><div class="t">效应量与 95% CI</div><div class="s">Cohen's d · 随机效应合并</div></div>
        <div id="rr345-forest" style="height:250px"></div>
        <div class="rr345-kvline" style="margin-top:8px"><span>合并效应量</span><b>0.40（95% CI 0.34–0.46）</b></div>
        <div class="rr345-kvline"><span>校正后显著性水平</span><span class="v">α′ = 0.0125</span></div>
        <div class="rr345-kvline"><span>最小可检测效应</span><span class="v">d = 0.12</span></div>
        <div class="rr345-kvline"><span>功效</span><span class="v">&gt;0.99（d=0.46）</span></div>
        <div class="note">虚线为 0.2 / 0.5 效应量参考线（小 / 中效应），合并效应 0.40 位于两者之间。所有 p 值与效应量均来自推演环境仿真（处理 / 对照各 10,000 次），未经真实业务检验，仅用于方案比较，不代表真实世界因果效应。</div>
      </div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">效果衰减曲线</div><div class="s">0–72h · 极化回落幅度 · 8 个观测点（0/6/12/24/36/48/60/72h）</div></div>
      <div class="g g2" style="grid-template-columns:1.25fr 1fr;gap:18px">
        <div><div id="rr345-decay" style="height:288px"></div></div>
        <div>
          <table class="tb" style="table-layout:fixed;width:100%">
            <colgroup><col style="width:27%"><col style="width:16%"><col style="width:17%"><col style="width:17%"><col style="width:23%"></colgroup>
            <thead><tr><th>路径</th><th style="text-align:right">峰值时点</th><th style="text-align:right">峰值回落</th><th style="text-align:right">72h 残留</th><th style="text-align:right">半衰期（峰值后）</th></tr></thead>
            <tbody>
              <tr><td>T-01 权威信息发布</td><td class="mono" style="text-align:right">24h</td><td class="mono" style="text-align:right">−0.084</td><td class="mono" style="text-align:right">45.2%</td><td class="mono" style="text-align:right">42.7h</td></tr>
              <tr><td>T-02 事实核查</td><td class="mono" style="text-align:right">24h</td><td class="mono" style="text-align:right">−0.061</td><td class="mono" style="text-align:right">39.3%</td><td class="mono" style="text-align:right">38.3h</td></tr>
              <tr><td>T-03 正面引导</td><td class="mono" style="text-align:right">24h</td><td class="mono" style="text-align:right">−0.047</td><td class="mono" style="text-align:right">36.2%</td><td class="mono" style="text-align:right">35.4h</td></tr>
              <tr><td>T-04 议题降温</td><td class="mono" style="text-align:right">24h</td><td class="mono" style="text-align:right">−0.032</td><td class="mono" style="text-align:right">31.3%</td><td class="mono" style="text-align:right">32.7h</td></tr>
              <tr><td>T-01 + T-02 组合</td><td class="mono" style="text-align:right">36h</td><td class="mono" style="text-align:right">−0.098</td><td class="mono" style="text-align:right;color:#62e6d2">63.3%</td><td class="mono" style="text-align:right">未过半（&gt;72h）</td></tr>
            </tbody>
          </table>
          <div class="note">峰值与「四类策略效果」表一致；72h 残留 = 72h 回落 / 峰值回落；半衰期由相邻观测点线性插值。组合方案衰减更慢，72h 仍保留 63.3% 效应，说明「先权威发布 + 后节点核查」存在持续期红利。</div>
          <div class="rr345-disclaim">推演环境仿真，未经真实业务检验</div>
        </div>
      </div>
    </div>
    <!-- ==== RISK r4 扩充结束 ==== -->
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

    <div class="g g2" style="grid-template-columns:1.1fr 1fr;margin-top:14px">
      <div class="panel">
        <div class="ph"><div class="t">附件清单</div><div class="s">随专报一并报送</div></div>
        <table class="tb" style="table-layout:fixed;width:100%">
          <colgroup><col style="width:12%"><col style="width:40%"><col style="width:26%"><col style="width:22%"></colgroup>
          <thead><tr><th>附件</th><th>内容</th><th>格式</th><th>生成时间</th></tr></thead>
          <tbody>
            <tr><td>附件 1</td><td>事件传播时间线（10-18 09:00 → 10-19 21:00）</td><td class="mono">CSV · 48 KB</td><td class="mono">10-19 21:00</td></tr>
            <tr><td>附件 2</td><td>七维评分明细与权重贡献</td><td class="mono">XLSX · 126 KB</td><td class="mono">10-19 21:00</td></tr>
            <tr><td>附件 3</td><td>干预话术与口径（T-01 ~ T-04）</td><td class="mono">DOCX · 92 KB</td><td class="mono">10-19 21:02</td></tr>
          </tbody>
        </table>
        <div class="note">附件与报告同版本号，正文修订后自动重新生成。</div>
      </div>
      <div class="panel">
        <div class="ph"><div class="t">报送记录</div><div class="s">2 次 · 均已回执</div></div>
        <table class="tb" style="table-layout:fixed;width:100%">
          <colgroup><col style="width:22%"><col style="width:30%"><col style="width:26%"><col style="width:22%"></colgroup>
          <thead><tr><th>时间</th><th>报送对象</th><th>方式</th><th>状态</th></tr></thead>
          <tbody>
            <tr><td class="mono">10-19 21:12</td><td>中心业务部门</td><td>专报 + 附件</td><td><span class="badge b-cyan">已签收</span></td></tr>
            <tr><td class="mono">10-20 09:15</td><td>分管领导</td><td>日报摘要</td><td><span class="badge b-blue">已阅</span></td></tr>
          </tbody>
        </table>
        <div class="note">回执缺失超过 30 分钟自动提醒报送人。</div>
      </div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">版本历史</div><div class="s">3 个版本 · 最新 v1.2</div></div>
      <div class="tl2">
        <div><b>v1.0 · 10-19 21:00</b><span>系统自动生成</span><small>七维自动定档二级，正文与附件首版</small></div>
        <div><b>v1.1 · 10-19 21:40</b><span>人工补录</span><small>补入复核结论、处置建议 03 与置信度</small></div>
        <div><b>v1.2 · 10-20 09:15</b><span>效果回写</span><small>增加 24 小时效果与四类模板收益</small></div>
      </div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">口径与来源</div><div class="s">与年度报告 2.4.3 节一致</div></div>
      <div class="kv">
        <div><span>数据范围</span><b>6,989 条已审核记录</b></div>
        <div><span>统计窗口</span><b>10-18 09:00 → 10-19 21:00</b></div>
        <div><span>分级依据</span><b>表14 分维阈值 + 四级规则</b></div>
        <div><span>事件类型</span><b>突发公共事件（表2）</b></div>
      </div>
      <div class="note">报告数值由推演环境生成，未经真实业务校验；引用时以本页版本号与快照时间为准。</div>
    </div>

    <!-- ==== RISK r5 扩充开始（由 enrich/merge.py 注入）==== -->
    <!-- ============================================================================
         R5 · 报告预览（3 个模块）
           1 报告结构化预览（5 章 · 字数 / 图表数 / 数据来源）
           2 生成与审批流转（6 节点 · 耗时 · 报送对象与回执时效）
           3 数字溯源与附件绑定（9 项关键数值 · 3 个附件版本）
         ============================================================================ -->
    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">报告结构化预览</div><div class="s">5 章 · 2,146 字 · 6 图 2 表 · 引用标注 24 处</div></div>
      <table class="tb" style="table-layout:fixed;width:100%">
        <colgroup><col style="width:6%"><col style="width:17%"><col style="width:32%"><col style="width:9%"><col style="width:11%"><col style="width:25%"></colgroup>
        <thead><tr><th>序</th><th>章节</th><th>核心结论</th><th style="text-align:right">字数</th><th style="text-align:center">图表</th><th>数据来源</th></tr></thead>
        <tbody>
          <tr><td class="mono">一</td><td>事件概况</td><td class="rr345-sub">3,842 条内容 · 1,207 个账号 · 覆盖 4 个平台</td><td class="mono" style="text-align:right">326</td><td class="rr345-sub" style="text-align:center">1 图</td><td class="rr345-sub">新闻 3,675 / 社媒 1,846</td></tr>
          <tr><td class="mono">二</td><td>风险研判</td><td class="rr345-sub">综合 0.74 · 二级（重大）· 4 项「极高」</td><td class="mono" style="text-align:right">468</td><td class="rr345-sub" style="text-align:center">1 图 1 表</td><td class="rr345-sub">七维评分 · 表14 阈值</td></tr>
          <tr><td class="mono">三</td><td>趋势判断</td><td class="rr345-sub">6h 内极化升至 0.62–0.66；不干预 24h 越过 0.68</td><td class="mono" style="text-align:right">312</td><td class="rr345-sub" style="text-align:center">1 图</td><td class="rr345-sub">12 轮推演 · 20×500 次</td></tr>
          <tr><td class="mono">四</td><td>处置建议</td><td class="rr345-sub">T-01 匹配度 0.88 · 组合收益 0.71–0.81</td><td class="mono" style="text-align:right">545</td><td class="rr345-sub" style="text-align:center">2 图 1 表</td><td class="rr345-sub">T-01~T-04 · 蒙特卡洛</td></tr>
          <tr><td class="mono">五</td><td>效果与复盘<span class="rr345-sub">（v1.2 追加）</span></td><td class="rr345-sub">极化 −0.084 · p&lt;0.001 · d=0.46</td><td class="mono" style="text-align:right">495</td><td class="rr345-sub" style="text-align:center">1 图</td><td class="rr345-sub">处理 / 对照各 10,000 次</td></tr>
          <tr><td class="mono">—</td><td><b>合计</b></td><td class="rr345-sub">正文 + 附件 3 个，全文无未标注数值</td><td class="mono" style="text-align:right"><b>2,146</b></td><td class="rr345-sub" style="text-align:center"><b>6 图 2 表</b></td><td class="rr345-sub">数据底座 6,989 条</td></tr>
        </tbody>
      </table>
      <div class="kv" style="grid-template-columns:repeat(4,1fr);margin-top:12px">
        <div><span>章节数</span><b>5 章（v1.2 增至 5 章）</b></div>
        <div><span>正文字数</span><b>2,146 字</b></div>
        <div><span>图表</span><b>6 图 · 2 表</b></div>
        <div><span>引用标注</span><b>24 处 · 附件 3 个</b></div>
      </div>
      <div class="note">上方正文预览为 v1.0 摘要（4 章，生成于 10-19 21:00）；本表按 v1.2 结构统计——v1.1 补入复核结论与置信度，v1.2 于 10-20 09:15 追加「效果与复盘」章并回写 24h 推演效果。章节顺序对应专报模板 v1.2 的固定结构，字数不含附件；生成时按模板自动分章，人工修订只允许在「处置建议」章增补。章节与附件版本号保持同版（详见下方附件绑定）。</div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">生成与审批流转</div><div class="s">系统生成 → 自动校验 → 人工复核 → 合规审查 → 签发 → 报送 · 共 12 分 00 秒</div></div>
      <div class="flow">
        <div class="node"><b>21:00:00</b>系统生成</div><span class="arw">→</span>
        <div class="node"><b>21:00:42</b>自动校验</div><span class="arw">→</span>
        <div class="node"><b>21:02:10</b>人工复核</div><span class="arw">→</span>
        <div class="node"><b>21:08:34</b>合规审查</div><span class="arw">→</span>
        <div class="node"><b>21:10:22</b>签发</div><span class="arw">→</span>
        <div class="node"><b>21:12:00</b>报送</div>
      </div>
      <div class="rr345-flowstat">
        <span><span class="rr345-dot c"></span>生成 → 报送 12 分 00 秒</span>
        <span><span class="rr345-dot a"></span>人工环节占比 75.6%</span>
        <span><span class="rr345-dot c"></span>自动校验 12 / 12 项通过</span>
        <span><span class="rr345-dot m"></span>回执平均 10 分钟</span>
      </div>
      <table class="tb" style="table-layout:fixed;width:100%;margin-top:10px">
        <colgroup><col style="width:13%"><col style="width:23%"><col style="width:13%"><col style="width:19%"><col style="width:32%"></colgroup>
        <thead><tr><th>节点</th><th>起止</th><th style="text-align:right">耗时</th><th>责任角色</th><th>结果</th></tr></thead>
        <tbody>
          <tr><td>系统生成</td><td class="mono">21:00:00 – 21:00:42</td><td class="mono" style="text-align:right">42 s</td><td>报告引擎</td><td class="rr345-sub">5 章 · 2,146 字 · 6 图</td></tr>
          <tr><td>自动校验</td><td class="mono">21:00:42 – 21:00:50</td><td class="mono" style="text-align:right">8 s</td><td>规则引擎</td><td class="rr345-sub">12 / 12 项通过（数值一致性 / 引用完整性）</td></tr>
          <tr><td>等待复核</td><td class="mono">21:00:50 – 21:02:10</td><td class="mono" style="text-align:right">80 s</td><td class="rr345-sub">待值班研判员接入</td><td class="rr345-sub">阈值 5 分钟，未触发催办</td></tr>
          <tr><td>人工复核</td><td class="mono">21:02:10 – 21:08:34</td><td class="mono" style="text-align:right">6 min 24 s</td><td>值班研判员</td><td class="rr345-sub">正文与附件一致性核对通过（0 处修改）</td></tr>
          <tr><td>合规审查</td><td class="mono">21:08:34 – 21:10:22</td><td class="mono" style="text-align:right">1 min 48 s</td><td>合规岗</td><td class="rr345-sub">通过 · 1 项附条件（T-04 不对外）</td></tr>
          <tr><td>签发</td><td class="mono">21:10:22 – 21:11:14</td><td class="mono" style="text-align:right">52 s</td><td>值班负责人</td><td class="rr345-sub">签发 v1.0 并锁定</td></tr>
          <tr><td>报送</td><td class="mono">21:11:14 – 21:12:00</td><td class="mono" style="text-align:right">46 s</td><td>报送接口</td><td class="rr345-sub">2 个对象 · 12 分钟内送达</td></tr>
        </tbody>
      </table>
      <div class="g g2" style="grid-template-columns:1.45fr 1fr;gap:18px;margin-top:12px">
        <div>
          <div class="subhead" style="margin-top:4px">报送对象与回执时效</div>
          <table class="tb" style="table-layout:fixed;width:100%">
            <colgroup><col style="width:20%"><col style="width:28%"><col style="width:13%"><col style="width:17%"><col style="width:22%"></colgroup>
            <thead><tr><th>对象</th><th>内容</th><th style="text-align:right">时限</th><th>报送</th><th>回执</th></tr></thead>
            <tbody>
              <tr><td>中心业务部门</td><td class="rr345-sub">专报 v1.0 + 3 个附件</td><td class="mono" style="text-align:right">30 min</td><td class="mono">10-19 21:12</td><td><span class="badge b-cyan">21:26 已签收</span></td></tr>
              <tr><td>分管领导</td><td class="rr345-sub">日报摘要（v1.2）</td><td class="mono" style="text-align:right">2 h</td><td class="mono">10-20 09:15</td><td><span class="badge b-blue">09:31 已阅</span></td></tr>
              <tr><td>值班室</td><td class="rr345-sub">短信摘要（一页纸）</td><td class="mono" style="text-align:right">5 min</td><td class="mono">10-19 21:12</td><td><span class="badge b-cyan">自动回执</span></td></tr>
            </tbody>
          </table>
          <div class="note">时限按《风险报送分级规范》第 4 条：二级事件专报 30 分钟、日报摘要 2 小时、值班短信 5 分钟；超时未回执自动催办，本期 0 次催办。</div>
        </div>
        <div>
          <div class="subhead" style="margin-top:4px">耗时构成（秒）</div>
          <div id="rr345-timing" style="height:172px"></div>
          <div class="subhead" style="margin-top:10px">时效口径</div>
          <div class="rr345-kvline"><span>生成 → 报送</span><b>12 分 00 秒</b></div>
          <div class="rr345-kvline"><span>人工环节占比</span><span class="v">75.6% · 544 / 720 s</span></div>
          <div class="rr345-kvline"><span>自动校验</span><span class="v">12 项全过 · 8 s</span></div>
          <div class="rr345-kvline"><span>回执平均</span><span class="v">10 分钟（3 对象）</span></div>
          <div class="rr345-kvline"><span>审计留存</span><span class="v">24 个月</span></div>
          <div class="note">流转耗时逐段相加：42 + 8 + 80 + 384 + 108 + 52 + 46 = 720 秒；人工环节 544 秒占 75.6%。</div>
        </div>
      </div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="ph"><div class="t">数字溯源与附件绑定</div><div class="s">9 项关键数值 · 24 处引用 · 3 个附件 · 校验 3/3 通过</div></div>
      <div class="subhead" style="margin-top:2px">正文关键数值溯源（9 项，逐项可复算）</div>
      <table class="tb" style="table-layout:fixed;width:100%">
        <colgroup><col style="width:21%"><col style="width:15%"><col style="width:38%"><col style="width:14%"><col style="width:12%"></colgroup>
        <thead><tr><th>数值</th><th>正文位置</th><th>来源</th><th>时点</th><th style="text-align:center">校验</th></tr></thead>
        <tbody>
          <tr><td class="mono">0.74 综合分值</td><td class="rr345-sub">二、风险研判</td><td class="rr345-sub">七维加权 0.705 + 联动修正 0.035（r1 分级依据）</td><td class="mono">10-19 21:00</td><td style="text-align:center"><span class="badge b-cyan">✓</span></td></tr>
          <tr><td class="mono">0.74 群体对立</td><td class="rr345-sub">二、风险研判</td><td class="rr345-sub">七维评分表 · 权重 0.17</td><td class="mono">10-19 21:00</td><td style="text-align:center"><span class="badge b-cyan">✓</span></td></tr>
          <tr><td class="mono">0.80 议题敏感度</td><td class="rr345-sub">二、风险研判</td><td class="rr345-sub">七维评分表 · 权重 0.11</td><td class="mono">10-19 21:00</td><td style="text-align:center"><span class="badge b-cyan">✓</span></td></tr>
          <tr><td class="mono">3,842 / 1,207 / 4</td><td class="rr345-sub">一、事件概况</td><td class="rr345-sub">事件卡片（内容 / 账号 / 平台）</td><td class="mono">10-19 21:00</td><td style="text-align:center"><span class="badge b-cyan">✓</span></td></tr>
          <tr><td class="mono">76.34%</td><td class="rr345-sub">三、趋势判断</td><td class="rr345-sub">推演精度抽检 968 / 1,268</td><td class="mono">近 30 日回测</td><td style="text-align:center"><span class="badge b-cyan">✓</span></td></tr>
          <tr><td class="mono">0.71–0.81</td><td class="rr345-sub">四、处置建议</td><td class="rr345-sub">组合方案 95% CI（20×500 次）</td><td class="mono">10-19 21:00</td><td style="text-align:center"><span class="badge b-cyan">✓</span></td></tr>
          <tr><td class="mono">−0.084 极化变化</td><td class="rr345-sub">五、效果与复盘</td><td class="rr345-sub">处理 / 对照各 10,000 次 · 24h 主终点</td><td class="mono">推演</td><td style="text-align:center"><span class="badge b-amber">推演</span></td></tr>
          <tr><td class="mono">p&lt;0.001 · d=0.46</td><td class="rr345-sub">五、效果与复盘</td><td class="rr345-sub">配对 t 检验 + Bootstrap 10,000 次</td><td class="mono">推演</td><td style="text-align:center"><span class="badge b-amber">推演</span></td></tr>
          <tr><td class="mono">6,989 条记录</td><td class="rr345-sub">口径与来源</td><td class="rr345-sub">数据底座 · 20 个验证机构</td><td class="mono">快照 11-05</td><td style="text-align:center"><span class="badge b-cyan">✓</span></td></tr>
        </tbody>
      </table>
      <div class="subhead">附件版本绑定（3 个附件）</div>
      <table class="tb" style="table-layout:fixed;width:100%">
        <colgroup><col style="width:24%"><col style="width:17%"><col style="width:20%"><col style="width:14%"><col style="width:14%"><col style="width:11%"></colgroup>
        <thead><tr><th>附件</th><th>源数据集</th><th>记录 / 条目</th><th style="text-align:center">首次生成</th><th style="text-align:center">最近重生成</th><th style="text-align:center">绑定版本</th></tr></thead>
        <tbody>
          <tr><td>附件 1 传播时间线</td><td class="rr345-sub">新闻 3,675 + 社媒 1,846</td><td class="mono">5,521 条</td><td class="mono" style="text-align:center">10-19 21:00</td><td class="mono" style="text-align:center">10-19 21:40</td><td style="text-align:center"><span class="badge b-blue">v1.1</span></td></tr>
          <tr><td>附件 2 七维评分明细</td><td class="rr345-sub">20 机构 · 6,989 条</td><td class="mono">6,989 条</td><td class="mono" style="text-align:center">10-19 21:00</td><td class="mono" style="text-align:center">10-19 21:40</td><td style="text-align:center"><span class="badge b-blue">v1.1</span></td></tr>
          <tr><td>附件 3 干预话术与口径</td><td class="rr345-sub">T-01~T-04 · 口径 v3</td><td class="mono">4 套 / 19 条</td><td class="mono" style="text-align:center">10-19 21:02</td><td class="mono" style="text-align:center">10-19 21:42</td><td style="text-align:center"><span class="badge b-blue">v1.1</span></td></tr>
        </tbody>
      </table>
      <div class="kv" style="grid-template-columns:repeat(4,1fr);margin-top:12px">
        <div><span>引用标注</span><b>24 / 24 处</b></div>
        <div><span>数值可复算</span><b>7 / 9 项（2 项标「推演」）</b></div>
        <div><span>附件校验</span><b>3 / 3 通过</b></div>
        <div><span>撤回附件</span><b>0 个</b></div>
      </div>
      <div class="note">标注规则：每个关键数值绑定源数据集、时点与校验值；24 处引用由附件 1 / 2 / 3 分别承载 8 / 6 / 10 处。标注缺失的数值在自动校验中判为不通过（本期 12 项规则全过）。快照更新后报告须重新生成并递增版本号，附件与正文同版；版本历史中的 v1.2 已在 10-20 09:15 完成效果回写。效果类数值为推演环境仿真，未经真实业务检验。</div>
    </div>
    <!-- ==== RISK r5 扩充结束 ==== -->
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
    if(window.ZGCLAB_ENRICH_PANE) window.ZGCLAB_ENRICH_PANE(tab.dataset.p);
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
const actual=[.12,.21,.27,.33,.41,.50,.58,.62,.66,.69,.71,.73];
const pred=[.16,.19,.23,.29,.36,.44,.51,.58,.62,.61,.70,.70];
const pi=[.12,.21,.27,.33,.41,.50,.58,.62,.66,.69,.71,.73];

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
  if(rm) rm.textContent='第 '+n+' 轮 / 共 12 轮';
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

/* p3：收益-风险散点 */
const scnRisk=echarts.init(document.getElementById('scnRisk'));
scnRisk.setOption({
  backgroundColor:'transparent',
  grid:{left:48,right:30,top:36,bottom:36},
  tooltip:{trigger:'item',backgroundColor:'#0d1c2e',borderColor:'#1d3853',textStyle:{color:'#e9f2fa',fontSize:11},
    formatter:function(p){return p.data.name+'<br/>传播规模 '+p.data.value[0]+' 万条<br/>综合收益 '+p.data.value[1].toFixed(2);}},
  xAxis:{type:'value',name:'传播规模（万条）',min:2.6,max:6.4,nameGap:16,
    nameTextStyle:{color:'#8fa7ba',fontSize:10},
    axisLine:{lineStyle:{color:'#1d3853'}},axisLabel:{color:'#8fa7ba',fontSize:10},
    splitLine:{lineStyle:{color:'#14283d'}}},
  yAxis:{type:'value',name:'综合收益',min:0.2,max:0.8,
    nameTextStyle:{color:'#8fa7ba',fontSize:10},
    axisLine:{lineStyle:{color:'#1d3853'}},axisLabel:{color:'#8fa7ba',fontSize:10},
    splitLine:{lineStyle:{color:'#14283d'}}},
  series:[{
    type:'scatter',symbolSize:18,
    label:{show:true,position:'right',color:'#cfe3ef',fontSize:10,
      formatter:function(p){return p.data.name;}},
    data:[
      {name:'无干预',value:[5.9,0.34],itemStyle:{color:'#ff7f86'},label:{position:'top'}},
      {name:'权威发布',value:[3.8,0.52],itemStyle:{color:'#f6c66b'},label:{position:'right'}},
      {name:'核查+引导',value:[3.1,0.68],itemStyle:{color:'#62e6d2'},label:{position:'right'}},
      {name:'高强度管制（敏感性）',value:[4.6,0.32],itemStyle:{color:'#73a7ff'},symbol:'diamond',symbolSize:16,label:{position:'bottom'}}
    ],
    markLine:{silent:true,symbol:'none',lineStyle:{color:'#8fa7ba',type:'dashed',width:1},
      label:{formatter:'基线 0.34',color:'#8fa7ba',fontSize:9,position:'insideStartTop'},
      data:[{yAxis:0.34}]}
  }]
});

/* p4：角色时延 */
const latChart=echarts.init(document.getElementById('latChart'));
latChart.setOption({
  backgroundColor:'transparent',
  grid:{left:52,right:16,top:34,bottom:28},
  tooltip:{trigger:'axis',axisPointer:{type:'shadow'},backgroundColor:'#0d1c2e',borderColor:'#1d3853',textStyle:{color:'#e9f2fa',fontSize:11}},
  legend:{top:0,right:0,itemWidth:8,itemHeight:8,textStyle:{color:'#8fa7ba',fontSize:10}},
  xAxis:{type:'category',data:['态势感知','事件理解','情感与立场','传播推演','风险研判','策略评估'],
    axisTick:{show:false},axisLine:{lineStyle:{color:'#1d3853'}},axisLabel:{color:'#8fa7ba',fontSize:10}},
  yAxis:{type:'value',name:'ms',min:0,max:240,nameTextStyle:{color:'#8fa7ba',fontSize:10},
    splitLine:{lineStyle:{color:'#14283d'}},axisLabel:{color:'#8fa7ba',fontSize:10}},
  series:[
    {name:'平均',type:'bar',barWidth:16,data:[58.6,84.2,51.7,138.9,92.4,118.3],
      itemStyle:{color:'#62e6d2',borderRadius:[3,3,0,0]},
      label:{show:true,position:'top',color:'#cfe3ef',fontSize:9}},
    {name:'P95',type:'bar',barWidth:16,data:[92,141,88,226,158,197],
      itemStyle:{color:'#73a7ff',borderRadius:[3,3,0,0]},
      markLine:{silent:true,symbol:'none',lineStyle:{color:'#ff7f86',type:'dashed',width:1},
        label:{formatter:'目标 200 ms',color:'#ff7f86',fontSize:9,position:'insideStartTop'},
        data:[{yAxis:200}]}}
  ]
});

setTimeout(function(){scnRisk.resize();latChart.resize();},80);
window.addEventListener('resize',function(){scnRisk.resize();latChart.resize();});

}
function initRisk(){

document.querySelectorAll('#riskTabs .tab').forEach(function(tab){
  tab.onclick=function(){
    document.querySelectorAll('#riskTabs .tab').forEach(function(x){x.classList.remove('on')});
    tab.classList.add('on');
    document.querySelectorAll('.pane').forEach(function(p){p.classList.remove('on')});
    var el=document.getElementById(tab.dataset.p); if(el) el.classList.add('on');
    if(window.ZGCLAB_SYNC_SYS) window.ZGCLAB_SYNC_SYS('risk', tab.dataset.p);
    if(window.ZGCLAB_ENRICH_PANE) window.ZGCLAB_ENRICH_PANE(tab.dataset.p);
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
  radar:{indicator:[{name:'热度',max:1},{name:'速度',max:1},{name:'负面',max:1},{name:'对立',max:1},{name:'节点',max:1},{name:'敏感',max:1},{name:'扩散',max:1}],
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

/* 本轮新增图表：r1 条形/趋势、r2 雷达、r4 置信区间 */
(function(){
  var extra=[];
  function mk(id,opt){
    var el=document.getElementById(id); if(!el) return;
    var c=echarts.init(el); c.setOption(opt); extra.push(c);
  }
  function tipAxis(){
    return {trigger:'axis',backgroundColor:'#0d1c2e',borderColor:'#1d3853',
      textStyle:{color:'#e9f2fa',fontSize:11},axisPointer:{lineStyle:{color:'#1d3853'}}};
  }

  /* r1 七维得分横条 */
  var dims=[['事件热度',.78,'极高'],['传播速度',.66,'高'],['负面情感强度',.71,'极高'],['群体对立',.74,'极高'],['节点活跃度',.62,'高'],['议题敏感度',.80,'极高'],['跨平台扩散',.58,'高']];
  var lvColor={'极高':'#ff7f86','高':'#f6c66b','中':'#73a7ff','低':'#62e6d2'};
  var sorted=dims.slice().sort(function(a,b){return a[1]-b[1];});
  mk('dimBar',{
    backgroundColor:'transparent',
    grid:{left:78,right:50,top:8,bottom:6},
    tooltip:{trigger:'item',backgroundColor:'#0d1c2e',borderColor:'#1d3853',
      textStyle:{color:'#e9f2fa',fontSize:11},
      formatter:function(p){return p.name+'：'+p.value.toFixed(2)+'（'+p.data.level+'）';}},
    xAxis:{type:'value',min:0,max:1,axisLine:{show:false},axisTick:{show:false},
      splitLine:{lineStyle:{color:'#14283d'}},
      axisLabel:{color:'#8fa7ba',fontSize:9.5,formatter:function(v){return v.toFixed(1);}}},
    yAxis:{type:'category',data:sorted.map(function(d){return d[0];}),
      axisLine:{lineStyle:{color:'#1d3853'}},axisTick:{show:false},
      axisLabel:{color:'#b9cbdb',fontSize:10.5}},
    series:[{type:'bar',barWidth:10,
      data:sorted.map(function(d){return {value:d[1],level:d[2],itemStyle:{color:lvColor[d[2]]||'#73a7ff',borderRadius:[0,6,6,0]}};}),
      label:{show:true,position:'right',color:'#b9cbdb',fontSize:10,
        formatter:function(p){return p.value.toFixed(2);}}}]
  });

  /* r1 24 小时综合分值 */
  var hv=[]; for(var i=0;i<24;i++){hv.push(('0'+((22+i)%24)).slice(-2)+':00');}
  var tv=[.29,.30,.32,.33,.34,.36,.38,.40,.42,.45,.47,.49,.52,.54,.56,.58,.59,.61,.63,.65,.67,.69,.72,.74];
  mk('trend24',{
    backgroundColor:'transparent',
    grid:{left:40,right:18,top:26,bottom:24},
    tooltip:tipAxis(),
    xAxis:{type:'category',boundaryGap:false,data:hv,axisLine:{lineStyle:{color:'#1d3853'}},
      axisTick:{show:false},axisLabel:{color:'#8fa7ba',fontSize:9.5,interval:3}},
    yAxis:{type:'value',min:.2,max:.85,splitLine:{lineStyle:{color:'#14283d'}},
      axisLabel:{color:'#8fa7ba',fontSize:9.5,formatter:function(v){return v.toFixed(2);}}},
    series:[{type:'line',data:tv,smooth:true,symbol:'none',
      lineStyle:{color:'#62e6d2',width:2.4},areaStyle:{color:'rgba(98,230,210,.14)'},
      markArea:{silent:true,itemStyle:{color:'rgba(246,198,107,.055)'},data:[[{yAxis:.68},{yAxis:.82}]]},
      markLine:{silent:true,symbol:'none',data:[{yAxis:.68,
        lineStyle:{color:'#f6c66b',type:'dashed',width:1},
        label:{show:true,formatter:'二级 0.68',color:'#f6c66b',fontSize:9,position:'insideStartTop'}}]}}]
  });

  /* r2 七维对照雷达 */
  mk('dimRadar',{
    backgroundColor:'transparent',
    tooltip:{trigger:'item',backgroundColor:'#0d1c2e',borderColor:'#1d3853',textStyle:{color:'#e9f2fa',fontSize:11}},
    legend:{bottom:0,itemWidth:8,itemHeight:8,textStyle:{color:'#8fa7ba',fontSize:10}},
    radar:{indicator:[{name:'热度',max:1},{name:'速度',max:1},{name:'负面',max:1},{name:'对立',max:1},{name:'节点',max:1},{name:'敏感',max:1},{name:'扩散',max:1}],
      radius:'60%',center:['50%','47%'],axisName:{color:'#8fa7ba',fontSize:10.5},
      splitLine:{lineStyle:{color:'#1d3853'}},splitArea:{areaStyle:{color:['#0a1727','#0d1c2e']}},
      axisLine:{lineStyle:{color:'#1d3853'}}},
    series:[{type:'radar',symbolSize:3,data:[
      {value:[.78,.66,.71,.74,.62,.80,.58],name:'当前事件',
        lineStyle:{color:'#62e6d2',width:2},itemStyle:{color:'#62e6d2'},areaStyle:{color:'rgba(98,230,210,.18)'}},
      {value:[.64,.57,.55,.59,.54,.63,.62],name:'同类均值',
        lineStyle:{color:'#73a7ff',width:1.4,type:'dashed'},itemStyle:{color:'#73a7ff'},areaStyle:{color:'rgba(115,167,255,.06)'}}
    ]}]
  });

  /* r4 蒙特卡洛置信区间 */
  var ci=[['T-04 议题降温',.40,.49,.57],['T-03 正面引导',.50,.58,.65],['T-02 事实核查',.57,.64,.70],['T-01 权威发布',.66,.72,.77],['T-01+T-02 组合',.71,.79,.81]];
  mk('ciChart',{
    backgroundColor:'transparent',
    grid:{left:104,right:78,top:10,bottom:26},
    tooltip:{trigger:'item',backgroundColor:'#0d1c2e',borderColor:'#1d3853',textStyle:{color:'#e9f2fa',fontSize:11},
      formatter:function(p){var d=ci[p.dataIndex]; if(!d) return '';
        return d[0]+'<br/>95% CI：'+d[1].toFixed(2)+'–'+d[3].toFixed(2)+'<br/>中位：'+d[2].toFixed(2);}},
    xAxis:{type:'value',min:.3,max:.9,axisLine:{show:false},axisTick:{show:false},
      splitLine:{lineStyle:{color:'#14283d'}},
      axisLabel:{color:'#8fa7ba',fontSize:9.5,formatter:function(v){return v.toFixed(1);}}},
    yAxis:{type:'category',data:ci.map(function(d){return d[0];}),
      axisLine:{lineStyle:{color:'#1d3853'}},axisTick:{show:false},
      axisLabel:{color:'#b9cbdb',fontSize:10}},
    series:[
      {name:'下界',type:'bar',stack:'ci',silent:true,barWidth:12,itemStyle:{color:'transparent'},
        data:ci.map(function(d){return d[1];})},
      {name:'95% 区间',type:'bar',stack:'ci',barWidth:12,
        itemStyle:{color:'rgba(98,230,210,.38)',borderRadius:6},
        data:ci.map(function(d){return +(d[3]-d[1]).toFixed(2);}),
        label:{show:true,position:'right',color:'#8fa7ba',fontSize:9.5,
          formatter:function(p){var d=ci[p.dataIndex]; return d[1].toFixed(2)+'–'+d[3].toFixed(2);}}},
      {name:'中位',type:'scatter',symbolSize:7,
        data:ci.map(function(d,i){return [d[2],i];}),itemStyle:{color:'#f6c66b'}}
    ]
  });

  window.addEventListener('resize',function(){
    extra.forEach(function(c){try{c.resize();}catch(e){}});
  });
})();

}

window.ZGCLAB_ENRICH_PANE = function (pane) {
  var map = {
    p1: window.__ENRICH_MAS_P1,
    p2: window.__ENRICH_MAS_P23, p3: window.__ENRICH_MAS_P23,
    p4: window.__ENRICH_MAS_P4,
    r1: window.__ENRICH_RISK_R12, r2: window.__ENRICH_RISK_R12,
    r3: window.__ENRICH_RISK_R345, r4: window.__ENRICH_RISK_R345, r5: window.__ENRICH_RISK_R345
  };
  var fn = map[pane];
  if (typeof fn === 'function' && !fn.__ran) {
    fn.__ran = true;
    try { fn(); } catch (e) { console.error('enrich ' + pane, e); }
  }
  setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 40);
  setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 260);
};

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
  if (window.ZGCLAB_ENRICH_PANE) window.ZGCLAB_ENRICH_PANE(cur);
};

/* ==== enrich: 系统页扩充脚本 ==== */
/* =====================================================================
   MAS · 推演总览（p1）内容扩充脚本
   window.__ENRICH_MAS_P1()  —— 构建甘特 / 迷你趋势卡 / 2 个 echarts 图表 + 交互
   · 每个图表容器都有显式高度（HTML 内 inline height）
   · echarts 缺失时 return（纯 DOM 部分仍会构建）
   · 只操作 mp1- 前缀 id，不触碰原有 id
   · 幂等：重复调用只做 resize
   ===================================================================== */
(function () {
  'use strict';

  var AXIS = '#1d3853';
  var SPLIT = '#14283d';
  var MUTED = '#8fa7ba';
  var TEXT = '#e9f2fa';
  var CYAN = '#62e6d2';
  var BLUE = '#73a7ff';
  var AMBER = '#f6c66b';
  var RED = '#ff7f86';
  var TIP = {
    backgroundColor: '#0d1c2e',
    borderColor: AXIS,
    textStyle: { color: TEXT, fontSize: 11 }
  };

  var ROUNDS = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12'];

  /* ---------------- ② 三指标联动数据（R1–R12） ---------------- */
  // 热度：R1 0.31、R5 0.52，与「阶段演化」两段热度一致
  var HEAT = [0.312, 0.355, 0.428, 0.504, 0.521, 0.566, 0.603, 0.664, 0.702, 0.748, 0.726, 0.781];
  // 立场熵：3 类（支持/反对/中立）归一化香农熵，R12 由 24/41/35 算得 0.9790
  var ENTROPY = [0.742, 0.786, 0.821, 0.848, 0.869, 0.889, 0.876, 0.918, 0.931, 0.949, 0.964, 0.979];
  // 对立指数：互斥引用占全部引用比
  var OPPOSE = [0.148, 0.172, 0.205, 0.238, 0.271, 0.306, 0.343, 0.389, 0.441, 0.497, 0.548, 0.612];
  // 阶段分段（下标闭合区间），与「阶段演化」tl2 对齐
  var PHASES = [
    [0, 1, '事件触发'],
    [2, 4, '信息扩散'],
    [5, 7, '观点表达'],
    [8, 11, '群体极化']
  ];

  /* ---------------- ③ 稳定性数据（近 7 日） ---------------- */
  var DAYS = ['11-12', '11-13', '11-14', '11-15', '11-16', '11-17', '11-18'];
  var CALLS = [144, 216, 144, 288, 144, 216, 132]; // 合计 1,284 = 216 轮 × 6 角色 − 12 次同轮合并
  var FAILS = [2, 3, 1, 5, 2, 7, 3];               // 合计 23（首轮失败，均重试恢复）

  /* ---------------- ④ 角色负载甘特：每轮 2 路并行 ---------------- */
  var GANTT = {
    lanes: [
      {
        name: '通道 A',
        desc: '感知 → 理解 → 立场',
        roles: [
          { n: '态势感知', from: 1, to: 3, v: [0.82, 0.88, 0.64], ms: '62.4 ms' },
          { n: '事件理解', from: 4, to: 6, v: [0.79, 0.91, 0.72], ms: '88.7 ms' },
          { n: '情感与立场', from: 7, to: 12, v: [0.68, 0.74, 0.83, 0.89, 0.93, 0.78], ms: '54.3 ms' }
        ]
      },
      {
        name: '通道 B',
        desc: '推演 → 研判 → 策略',
        roles: [
          { n: '传播推演', from: 1, to: 4, v: [0.71, 0.84, 0.92, 0.87], ms: '143.6 ms' },
          { n: '风险研判', from: 5, to: 9, v: [0.66, 0.73, 0.81, 0.88, 0.94], ms: '96.2 ms' },
          { n: '策略评估', from: 10, to: 12, v: [0.69, 0.77, 0.72], ms: '121.8 ms' }
        ]
      }
    ]
  };

  /* ---------------- ⑥ 迷你趋势卡（2026-06 → 2026-11） ---------------- */
  var SPARK = [
    { k: '极化趋势方向准确率', u: '%', v: '76.34', d: '+3.44 pp', s: [72.90, 73.61, 74.24, 75.08, 75.82, 76.34], goal: 75.0, goalTxt: '要求 75%' },
    { k: '关键节点识别 F1', u: '', v: '0.78', d: '+0.07', s: [0.71, 0.73, 0.75, 0.76, 0.77, 0.78] },
    { k: '阶段判定准确率', u: '%', v: '83.3', d: '+3.7 pp', s: [79.6, 80.4, 81.2, 82.0, 82.8, 83.3] },
    { k: '极化指数 MAE', u: '', v: '0.043', d: '−0.015', s: [0.058, 0.054, 0.051, 0.048, 0.045, 0.043], down: true },
    { k: '多智能体协同准确率', u: '%', v: '72.9', d: '+4.5 pp', s: [68.4, 69.6, 70.8, 71.5, 72.2, 72.9], goal: 70.0, goalTxt: '要求 70%' },
    { k: '端到端单轮耗时', u: ' s', v: '4.82', d: '−0.79 s', s: [5.61, 5.34, 5.12, 4.98, 4.88, 4.82], down: true }
  ];

  var charts = [];

  /* ---------------- 工具 ---------------- */
  function tierOf(v) {
    if (v >= 0.90) return 4;
    if (v >= 0.85) return 3;
    if (v >= 0.70) return 2;
    return 1;
  }

  function el(id) {
    return document.getElementById(id);
  }

  /* ---------------- ④ 甘特 DOM ---------------- */
  function buildGantt(root) {
    if (!root) return;
    var ticks = '';
    for (var t = 0; t < 12; t++) ticks += '<span class="mp1-gtick">' + ROUNDS[t] + '</span>';
    var html = '<div class="mp1-gticks"><div></div><div>' + ticks + '</div><div class="mp1-gtick-h">轮数</div></div>';

    GANTT.lanes.forEach(function (lane) {
      html += '<div class="mp1-glane">';
      html += '<div class="mp1-laneh"><b>' + lane.name + '</b><span>' + lane.desc + '</span></div>';
      lane.roles.forEach(function (role) {
        var cells = '';
        for (var i = 1; i <= 12; i++) {
          var k = i - role.from;
          if (i >= role.from && i <= role.to) {
            var v = role.v[k];
            cells += '<i class="mp1-c mp1-lv' + tierOf(v) + '" title="' + role.n + ' · R' + i +
              ' · 负载 ' + v.toFixed(2) + '">' + v.toFixed(2) + '</i>';
          } else {
            cells += '<i class="mp1-c off"></i>';
          }
        }
        html += '<div class="mp1-grow">' +
          '<span class="mp1-rl">' + role.n + '<em>' + role.ms + '</em></span>' +
          '<div class="mp1-cells">' + cells + '</div>' +
          '<span class="mp1-rs">' + (role.to - role.from + 1) + '</span>' +
          '</div>';
      });
      html += '</div>';
    });
    root.innerHTML = html;
  }

  /* ---------------- ⑥ 迷你趋势卡 ---------------- */
  function sparkSvg(series, goal, down) {
    var W = 240, H = 34, pad = 4;
    var n = series.length;
    var min = Math.min.apply(null, series);
    var max = Math.max.apply(null, series);
    if (typeof goal === 'number') {
      min = Math.min(min, goal);
      max = Math.max(max, goal);
    }
    if (max - min < 1e-9) max = min + 1;
    var X = function (i) { return pad + i * (W - 2 * pad) / (n - 1); };
    var Y = function (v) { return H - pad - (v - min) / (max - min) * (H - 2 * pad); };
    var pts = series.map(function (v, i) { return X(i).toFixed(1) + ',' + Y(v).toFixed(1); }).join(' ');
    var color = down ? BLUE : CYAN;
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">';
    svg += '<polygon points="' + X(0).toFixed(1) + ',' + (H - pad) + ' ' + pts + ' ' +
      X(n - 1).toFixed(1) + ',' + (H - pad) + '" fill="' + color + '" fill-opacity=".10"/>';
    if (typeof goal === 'number') {
      var gy = Y(goal).toFixed(1);
      svg += '<line x1="' + pad + '" y1="' + gy + '" x2="' + (W - pad) + '" y2="' + gy +
        '" stroke="' + AMBER + '" stroke-width="1" stroke-dasharray="3 3" stroke-opacity=".55"/>';
    }
    svg += '<polyline points="' + pts + '" fill="none" stroke="' + color +
      '" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/>';
    svg += '<circle cx="' + X(n - 1).toFixed(1) + '" cy="' + Y(series[n - 1]).toFixed(1) +
      '" r="2.1" fill="' + color + '"/>';
    svg += '</svg>';
    return svg;
  }

  function buildSparks(root) {
    if (!root) return;
    root.innerHTML = SPARK.map(function (s) {
      var range = '06 → 11';
      if (s.goalTxt) range += ' · ' + s.goalTxt;
      var dcls = s.down ? ' class="mp1-dn"' : '';
      return '<div class="mp1-sp">' +
        '<div class="mp1-sp-h"><span>' + s.k + '</span><b>' + s.v +
        '<small>' + (s.u || '') + '</small></b></div>' +
        sparkSvg(s.s, s.goal, s.down) +
        '<div class="mp1-sp-f"><span>' + range + '</span><i' + dcls + '>' + s.d + '</i></div>' +
        '</div>';
    }).join('');
  }

  /* ---------------- ② 三指标联动 option ---------------- */
  function trendOption(from, to) {
    var labels = ROUNDS.slice(from, to);
    var areas = [];
    PHASES.forEach(function (p) {
      var a = Math.max(p[0], from);
      var b = Math.min(p[1], to - 1);
      if (a > b) return;
      areas.push([{ name: p[2], xAxis: ROUNDS[a] }, { xAxis: ROUNDS[b] }]);
    });
    var line = null;
    if (from <= 8 && to > 8) {
      line = {
        silent: true,
        symbol: 'none',
        lineStyle: { color: AMBER, width: 1, type: 'dashed', opacity: 0.7 },
        label: { show: false },
        data: [{ xAxis: 'R9' }]
      };
    }
    return {
      backgroundColor: 'transparent',
      animationDuration: 320,
      animationEasing: 'cubicOut',
      grid: { left: 40, right: 16, top: 34, bottom: 24 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: TIP.backgroundColor,
        borderColor: TIP.borderColor,
        textStyle: TIP.textStyle,
        axisPointer: { type: 'line', lineStyle: { color: '#2c4d6b' } },
        formatter: function (ps) {
          var h = '<div style="font-size:10.5px;color:#8fa7ba;margin-bottom:3px">' + ps[0].axisValue + '</div>';
          ps.forEach(function (p) {
            h += '<div style="display:flex;align-items:center;gap:7px;font-size:11px;line-height:1.7">' +
              '<span style="width:6px;height:6px;border-radius:50%;background:' + p.color + '"></span>' +
              '<span style="color:#8fa7ba">' + p.seriesName + '</span>' +
              '<span style="margin-left:auto;font-family:monospace;color:#e9f2fa">' +
              Number(p.value).toFixed(3) + '</span></div>';
          });
          return h;
        }
      },
      legend: {
        show: true,
        top: 0,
        right: 0,
        itemWidth: 10,
        itemHeight: 3,
        itemGap: 12,
        textStyle: { color: MUTED, fontSize: 10 }
      },
      xAxis: {
        type: 'category',
        data: labels,
        boundaryGap: false,
        axisLine: { lineStyle: { color: AXIS } },
        axisTick: { show: false },
        axisLabel: { color: MUTED, fontSize: 10 }
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 1,
        interval: 0.25,
        splitLine: { lineStyle: { color: SPLIT } },
        axisLabel: { color: MUTED, fontSize: 10, formatter: function (v) { return v.toFixed(2); } }
      },
      series: [
        {
          name: '热度',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          data: HEAT.slice(from, to),
          itemStyle: { color: AMBER },
          lineStyle: { color: AMBER, width: 2 },
          areaStyle: { color: 'rgba(246,198,107,.09)' }
        },
        {
          name: '立场熵',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 3.5,
          data: ENTROPY.slice(from, to),
          itemStyle: { color: BLUE },
          lineStyle: { color: BLUE, width: 1.8 }
        },
        {
          name: '对立指数',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 3.5,
          data: OPPOSE.slice(from, to),
          itemStyle: { color: RED },
          lineStyle: { color: RED, width: 1.8 },
          // 阶段底色与临界线挂在最后一个 series 上，保证标签绘制在三条曲线之上
          markArea: {
            silent: true,
            itemStyle: { color: 'rgba(115,167,255,.055)' },
            label: {
              show: true, position: 'insideTop', distance: 13, color: '#8aa4b9', fontSize: 9,
              backgroundColor: 'rgba(9,22,37,.78)', padding: [2, 5], borderRadius: 3
            },
            data: areas
          },
          markLine: line
        }
      ]
    };
  }

  /* ---------------- ③ 稳定性 option ---------------- */
  function stabOption() {
    return {
      backgroundColor: 'transparent',
      animationDuration: 320,
      grid: { left: 34, right: 30, top: 28, bottom: 22 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: TIP.backgroundColor,
        borderColor: TIP.borderColor,
        textStyle: TIP.textStyle,
        axisPointer: { type: 'shadow' },
        formatter: function (ps) {
          var h = '<div style="font-size:10.5px;color:#8fa7ba;margin-bottom:3px">11 月 ' + ps[0].axisValue + ' 日</div>';
          ps.forEach(function (p) {
            var unit = p.seriesName === '失败' ? ' 次' : ' 次';
            h += '<div style="display:flex;align-items:center;gap:7px;font-size:11px;line-height:1.7">' +
              '<span style="width:6px;height:6px;border-radius:50%;background:' + p.color + '"></span>' +
              '<span style="color:#8fa7ba">' + p.seriesName + '</span>' +
              '<span style="margin-left:auto;font-family:monospace;color:#e9f2fa">' + p.value + unit + '</span></div>';
          });
          return h;
        }
      },
      legend: {
        show: true,
        top: 0,
        right: 0,
        itemWidth: 9,
        itemHeight: 8,
        itemGap: 10,
        textStyle: { color: MUTED, fontSize: 10 }
      },
      xAxis: {
        type: 'category',
        data: DAYS,
        axisLine: { lineStyle: { color: AXIS } },
        axisTick: { show: false },
        axisLabel: { color: MUTED, fontSize: 9.5 }
      },
      yAxis: [
        {
          type: 'value',
          min: 0,
          max: 320,
          interval: 80,
          splitLine: { lineStyle: { color: SPLIT } },
          axisLabel: { color: MUTED, fontSize: 9 }
        },
        {
          type: 'value',
          min: 0,
          max: 8,
          interval: 2,
          splitLine: { show: false },
          axisLabel: { color: MUTED, fontSize: 9 }
        }
      ],
      series: [
        {
          name: '模型调用',
          type: 'bar',
          barWidth: 18,
          data: CALLS,
          itemStyle: { color: 'rgba(115,167,255,.55)', borderRadius: [3, 3, 0, 0] },
          label: { show: true, position: 'top', color: '#8fa7ba', fontSize: 9, distance: 3 }
        },
        {
          name: '失败',
          type: 'line',
          yAxisIndex: 1,
          data: FAILS,
          symbol: 'circle',
          symbolSize: 5,
          lineStyle: { color: RED, width: 1.8 },
          itemStyle: { color: RED }
        }
      ]
    };
  }

  /* ---------------- resize ---------------- */
  function resizeAll() {
    var p1 = el('p1');
    if (p1 && p1.offsetWidth === 0) return; // 面板隐藏时不动，避免画成 0 宽
    for (var i = 0; i < charts.length; i++) {
      try { charts[i].resize(); } catch (e) { /* ignore */ }
    }
  }

  /* ---------------- 图表初始化（幂等，可重入） ---------------- */
  var eventsBound = false;

  function initCharts(p1) {
    if (typeof echarts === 'undefined') return; // 兜底：无图表库时只保留静态内容
    // 清理上一次渲染留下的失效实例
    charts = charts.filter(function (c) {
      try { return c && !c.isDisposed() && document.body.contains(c.getDom()); } catch (e) { return false; }
    });
    var hasTrend = !!el('mp1-trend');
    var hasStab = !!el('mp1-stab');
    if (!hasTrend && !hasStab) return; // 图表容器未就位，等下次再建
    if (p1.getAttribute('data-mp1-charts') === '1') { resizeAll(); return; }

    var trendEl = el('mp1-trend');
    if (trendEl && !trendEl.getAttribute('data-mp1-chart')) {
      var ct = echarts.init(trendEl);
      trendEl.setAttribute('data-mp1-chart', '1');
      charts.push(ct);
      var apply = function (f, t) {
        try { ct.setOption(trendOption(f, t), true); } catch (e) { /* ignore */ }
      };
      apply(0, 12);

      // 交互：切换轮次区间
      var rangeEl = el('mp1-range');
      if (rangeEl && !rangeEl.getAttribute('data-mp1-bound')) {
        rangeEl.setAttribute('data-mp1-bound', '1');
        var chips = rangeEl.querySelectorAll('.mp1-chip');
        Array.prototype.forEach.call(chips, function (chip) {
          chip.addEventListener('click', function () {
            Array.prototype.forEach.call(chips, function (c) { c.classList.remove('on'); });
            chip.classList.add('on');
            apply(Number(chip.getAttribute('data-f')), Number(chip.getAttribute('data-t')));
          });
        });
      }
    }

    var stabEl = el('mp1-stab');
    if (stabEl && !stabEl.getAttribute('data-mp1-chart')) {
      var cs = echarts.init(stabEl);
      stabEl.setAttribute('data-mp1-chart', '1');
      charts.push(cs);
      cs.setOption(stabOption());
    }

    p1.setAttribute('data-mp1-charts', '1');
    bindOnce(p1);
    resizeAll();
  }

  function bindOnce(p1) {
    if (eventsBound) return;
    eventsBound = true;
    window.addEventListener('resize', resizeAll);
    // 标签切回 / 系统页重渲染后重排
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (t && t.closest && t.closest('#masTabs .tab')) setTimeout(resizeAll, 60);
    });
    if (window.ResizeObserver) {
      try {
        new ResizeObserver(function () { resizeAll(); }).observe(p1);
      } catch (e) { /* ignore */ }
    }
  }

  /* ---------------- 主入口 ---------------- */
  window.__ENRICH_MAS_P1 = function () {
    var p1 = el('p1');
    if (!p1) return;

    // 片段未就位时先不标记完成，等下一次触发（路由重渲染 / 切换标签）
    var ganttRoot = el('mp1-gantt');
    var sparksRoot = el('mp1-sparks');
    var trendEl = el('mp1-trend');
    var stabEl = el('mp1-stab');
    if (!ganttRoot && !sparksRoot && !trendEl && !stabEl) return;

    if (p1.getAttribute('data-mp1') !== '1') {
      // 纯 DOM 部分（不依赖 echarts）
      buildGantt(ganttRoot);
      buildSparks(sparksRoot);
      p1.setAttribute('data-mp1', '1');
    }

    initCharts(p1);
  };
  window.__ENRICH_MAS_P1.__ran = false;

  /* ---------------- 自动挂载：p1 渲染/重渲染后自动初始化一次 ---------------- */
  (function autoAttach() {
    var timer = null;
    function tryRun() {
      var p1 = el('p1');
      if (!p1 || p1.getAttribute('data-mp1') === '1') return;
      try {
        window.__ENRICH_MAS_P1();
      } catch (e) {
        if (window.console) console.error('[mp1] enrich error', e);
      }
    }
    function boot() {
      setTimeout(tryRun, 60);
      if (!window.MutationObserver || !document.body) return;
      new MutationObserver(function () {
        if (timer) return;
        timer = setTimeout(function () { timer = null; tryRun(); }, 120);
      }).observe(document.body, { childList: true, subtree: true });
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
      boot();
    }
  })();
})();

/* ============================================================================
   多智能体推演系统 · p2 关键节点 / p3 情景对比 —— 扩充模块图表初始化
   调用方式：DOM 中插入 mas-p23.html 的模块后执行
             window.__ENRICH_MAS_P23();
           可重复调用（同容器不会重复 init）。
   容器高度在 HTML 内联 style 中显式给定；容器 id 统一 mp23- 前缀。
   ========================================================================== */
window.__ENRICH_MAS_P23 = function () {
  if (typeof echarts === 'undefined' || !echarts) return;   /* 图表库未加载则直接返回 */

  var charts = [];

  function mk(id, option) {
    var el = document.getElementById(id);
    if (!el) return;
    try {
      var c = echarts.getInstanceByDom(el) || echarts.init(el);
      c.setOption(option, true);
      charts.push(c);
    } catch (e) {
      if (window.console) console.error('[mp23] chart init failed:', id, e);
    }
  }

  var AXIS_LINE = { lineStyle: { color: '#1d3853' } };
  var SPLIT_LINE = { lineStyle: { color: '#14283d' } };
  var TIP = {
    backgroundColor: '#0d1c2e', borderColor: '#1d3853',
    textStyle: { color: '#e9f2fa', fontSize: 11 }
  };

  /* ---------------------------------------------------------------- p2 · 节点主体构成 */
  mk('mp23-type', {
    backgroundColor: 'transparent',
    title: {
      text: '8', subtext: '入清单节点', left: '50%', top: '31%', textAlign: 'center',
      textStyle: { color: '#e9f2fa', fontSize: 22, fontWeight: 700, lineHeight: 26 },
      subtextStyle: { color: '#8fa7ba', fontSize: 9.5, lineHeight: 14 }
    },
    tooltip: {
      trigger: 'item', backgroundColor: '#0d1c2e', borderColor: '#1d3853',
      textStyle: { color: '#e9f2fa', fontSize: 11 },
      formatter: function (p) { return p.name + '：' + p.value + ' 个节点（' + p.percent + '%）'; }
    },
    legend: {
      bottom: 0, left: 'center', itemWidth: 8, itemHeight: 8, itemGap: 13,
      textStyle: { color: '#8fa7ba', fontSize: 10 }
    },
    series: [{
      type: 'pie', radius: ['55%', '79%'], center: ['50%', '44%'], avoidLabelOverlap: true,
      itemStyle: { borderColor: '#0b192a', borderWidth: 2 },
      label: { show: true, color: '#cfe3ef', fontSize: 10.5, formatter: '{c}' },
      labelLine: { length: 6, length2: 7, lineStyle: { color: '#2b3d52' } },
      data: [
        { value: 3, name: '媒体', itemStyle: { color: '#73a7ff' } },
        { value: 2, name: '意见领袖', itemStyle: { color: '#62e6d2' } },
        { value: 2, name: '普通用户', itemStyle: { color: '#8fa7ba' } },
        { value: 1, name: '机构', itemStyle: { color: '#f6c66b' } }
      ]
    }]
  });

  /* ---------------------------------------------------------------- p2 · 识别提前量 */
  var lead = [
    ['R02', 7.5, false], ['R03', 6.1, false], ['R04', 5.4, false], ['R05', 8.2, false],
    ['R07', 4.9, true], ['R08', 6.8, false], ['R10', 5.6, false], ['R12', 5.1, true]
  ];
  mk('mp23-lead', {
    backgroundColor: 'transparent',
    grid: { left: 54, right: 58, top: 14, bottom: 24 },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      backgroundColor: '#0d1c2e', borderColor: '#1d3853',
      textStyle: { color: '#e9f2fa', fontSize: 11 },
      formatter: function (a) {
        var d = a[0];
        return d.name + ' 节点<br/>提前量 ' + d.value.toFixed(1) + ' h' +
          (d.data.early ? '<br/>识别早于人工标注 1 轮' : '<br/>与人工标注同轮');
      }
    },
    xAxis: {
      type: 'value', min: 0, max: 10, name: 'h', nameGap: 9,
      nameTextStyle: { color: '#8fa7ba', fontSize: 9.5 },
      axisLine: AXIS_LINE, axisTick: { show: false }, splitLine: SPLIT_LINE,
      axisLabel: { color: '#8fa7ba', fontSize: 9.5 }
    },
    yAxis: {
      type: 'category', inverse: true,
      data: lead.map(function (d) { return d[0]; }),
      axisLine: AXIS_LINE, axisTick: { show: false },
      axisLabel: { color: '#b9cbdb', fontSize: 10, fontFamily: 'SF Mono, Menlo, monospace' }
    },
    series: [{
      type: 'bar', barWidth: 11,
      itemStyle: { borderRadius: [0, 4, 4, 0] },
      data: lead.map(function (d) {
        return {
          value: d[1], early: d[2],
          itemStyle: { color: d[2] ? '#f6c66b' : '#62e6d2' }
        };
      }),
      label: {
        show: true, position: 'right', color: '#8fa7ba', fontSize: 9.5,
        formatter: function (p) { return p.value.toFixed(1) + ' h'; }
      },
      markLine: {
        silent: true, symbol: 'none',
        lineStyle: { color: '#f6c66b', type: 'dashed', width: 1 },
        label: { show: false },
        data: [{ xAxis: 6.2 }]
      }
    }]
  });

  /* ---------------------------------------------------------------- p2 · 阈值敏感性 */
  var tau = ['0.50', '0.55', '0.60', '0.62', '0.65', '0.70'];
  var prec = [0.727, 0.753, 0.770, 0.781, 0.805, 0.848];
  var rec = [0.824, 0.813, 0.793, 0.779, 0.752, 0.702];
  var f1 = [0.772, 0.782, 0.781, 0.780, 0.778, 0.768];
  mk('mp23-thr', {
    backgroundColor: 'transparent',
    grid: { left: 44, right: 20, top: 32, bottom: 26 },
    legend: { top: 0, right: 0, itemWidth: 9, itemHeight: 8, textStyle: { color: '#8fa7ba', fontSize: 10 } },
    tooltip: {
      trigger: 'axis', backgroundColor: '#0d1c2e', borderColor: '#1d3853',
      textStyle: { color: '#e9f2fa', fontSize: 11 },
      formatter: function (ps) {
        var s = '阈值 τ = ' + ps[0].axisValue + '<br/>';
        ps.forEach(function (p) { s += p.marker + p.seriesName + '：' + p.value.toFixed(3) + '<br/>'; });
        return s;
      }
    },
    xAxis: {
      type: 'category', boundaryGap: false, data: tau,
      axisLine: AXIS_LINE, axisTick: { show: false },
      axisLabel: { color: '#8fa7ba', fontSize: 10 }
    },
    yAxis: {
      type: 'value', min: 0.66, max: 0.88, splitLine: SPLIT_LINE,
      axisLabel: {
        color: '#8fa7ba', fontSize: 9.5,
        formatter: function (v) { return v.toFixed(2); }
      }
    },
    series: [
      {
        name: '精确率', type: 'line', smooth: true, symbolSize: 5, data: prec,
        lineStyle: { color: '#73a7ff', width: 2 }, itemStyle: { color: '#73a7ff' }
      },
      {
        name: '召回率', type: 'line', smooth: true, symbolSize: 5, data: rec,
        lineStyle: { color: '#62e6d2', width: 2 }, itemStyle: { color: '#62e6d2' }
      },
      {
        name: 'F1', type: 'line', smooth: true, symbolSize: 6, data: f1,
        lineStyle: { color: '#f6c66b', width: 2.6 }, itemStyle: { color: '#f6c66b' },
        markLine: {
          silent: true, symbol: 'none',
          lineStyle: { color: '#62e6d2', type: 'dashed', width: 1 },
          label: { show: false },
          data: [{ xAxis: '0.62' }]
        },
        markPoint: {
          symbol: 'circle', symbolSize: 9,
          itemStyle: { color: '#62e6d2', borderColor: '#0b192a', borderWidth: 2 },
          label: {
            show: true, position: 'top', distance: 7,
            color: '#62e6d2', fontSize: 9, formatter: '采用 τ=0.62 · F1 0.780'
          },
          data: [{ coord: ['0.62', 0.780] }]
        }
      }
    ]
  });

  /* ---------------------------------------------------------------- p3 · 情景终值区间 */
  var ci = [
    { name: 'S0 基准 · 无干预', lo: 0.712, mid: 0.731, hi: 0.750, color: '#ff7f86' },
    { name: 'S3 高强度管制（敏感性）', lo: 0.661, mid: 0.688, hi: 0.716, color: '#73a7ff' },
    { name: 'S1 权威发布', lo: 0.594, mid: 0.612, hi: 0.631, color: '#f6c66b' },
    { name: 'S2 核查+引导', lo: 0.536, mid: 0.553, hi: 0.571, color: '#62e6d2' }
  ];
  mk('mp23-ci', {
    backgroundColor: 'transparent',
    grid: { left: 122, right: 86, top: 14, bottom: 26 },
    tooltip: {
      trigger: 'item', backgroundColor: '#0d1c2e', borderColor: '#1d3853',
      textStyle: { color: '#e9f2fa', fontSize: 11 },
      formatter: function (p) {
        var d = ci[p.dataIndex];
        if (!d) return '';
        return d.name + '<br/>95% 区间：' + d.lo.toFixed(3) + '–' + d.hi.toFixed(3) +
          '<br/>抽样均值：' + d.mid.toFixed(3);
      }
    },
    xAxis: {
      type: 'value', min: 0.48, max: 0.80,
      axisLine: { show: false }, axisTick: { show: false }, splitLine: SPLIT_LINE,
      axisLabel: {
        color: '#8fa7ba', fontSize: 9.5,
        formatter: function (v) { return v.toFixed(2); }
      }
    },
    yAxis: {
      type: 'category',
      data: ci.map(function (d) { return d.name; }),
      axisLine: AXIS_LINE, axisTick: { show: false },
      axisLabel: { color: '#b9cbdb', fontSize: 10 }
    },
    series: [
      {
        name: '下界', type: 'bar', stack: 'ci', silent: true, barWidth: 13,
        itemStyle: { color: 'transparent' },
        data: ci.map(function (d) { return d.lo; })
      },
      {
        name: '95% 区间', type: 'bar', stack: 'ci', barWidth: 13,
        itemStyle: { borderRadius: 7 },
        data: ci.map(function (d) {
          return {
            value: +(d.hi - d.lo).toFixed(3),
            itemStyle: { color: d.color, opacity: 0.4 }
          };
        }),
        label: {
          show: true, position: 'right', color: '#8fa7ba', fontSize: 9.5,
          formatter: function (p) {
            var d = ci[p.dataIndex];
            return d ? d.lo.toFixed(3) + '–' + d.hi.toFixed(3) : '';
          }
        }
      },
      {
        name: '抽样均值', type: 'scatter', symbolSize: 8,
        itemStyle: { color: '#f6c66b' },
        data: ci.map(function (d, i) { return [d.mid, i]; })
      }
    ]
  });

  /* ---------------------------------------------------------------- p3 · 单因素敏感性 */
  var fac = [
    { name: '介入时机', bad: ['延后至 R05', 0.11], good: ['提前至 R01', -0.06] },
    { name: '覆盖人群', bad: ['降至 62%', 0.06], good: ['升至 90%', -0.05] },
    { name: '引导强度', bad: ['降为中', 0.05], good: ['升为高', -0.04] },
    { name: '平台联动', bad: ['关闭', 0.07], good: ['保持开启', 0] },
    { name: '核查条数', bad: ['减至 1 条', 0.04], good: ['增至 5 条', -0.02] },
    { name: '响应时延', bad: ['+30 min', 0.03], good: ['−30 min', -0.02] },
    { name: '事件热度基数', bad: ['+10%', 0.01], good: ['−10%', -0.02] }
  ];
  mk('mp23-tornado', {
    backgroundColor: 'transparent',
    grid: { left: 92, right: 62, top: 34, bottom: 26 },
    legend: {
      top: 0, right: 0, itemWidth: 9, itemHeight: 8, itemGap: 12,
      textStyle: { color: '#8fa7ba', fontSize: 10 }
    },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      backgroundColor: '#0d1c2e', borderColor: '#1d3853',
      textStyle: { color: '#e9f2fa', fontSize: 11 },
      formatter: function (ps) {
        var d = fac[ps[0].dataIndex];
        if (!d) return '';
        return d.name + '<br/>' +
          d.bad[0] + '：' + (d.bad[1] >= 0 ? '+' : '−') + Math.abs(d.bad[1]).toFixed(2) + '<br/>' +
          d.good[0] + '：' + (d.good[1] >= 0 ? '+' : '−') + Math.abs(d.good[1]).toFixed(2);
      }
    },
    xAxis: {
      type: 'value', min: -0.09, max: 0.14, splitLine: SPLIT_LINE,
      axisLine: AXIS_LINE, axisTick: { show: false },
      axisLabel: {
        color: '#8fa7ba', fontSize: 9.5,
        formatter: function (v) { return (v > 0 ? '+' : '') + v.toFixed(2); }
      }
    },
    yAxis: {
      type: 'category', inverse: true,
      data: fac.map(function (d) { return d.name; }),
      axisLine: AXIS_LINE, axisTick: { show: false },
      axisLabel: { color: '#b9cbdb', fontSize: 10.5 }
    },
    series: [
      {
        name: '有利端（终值下降）', type: 'bar', barWidth: 9, barGap: '34%',
        itemStyle: { color: '#62e6d2', borderRadius: [4, 0, 0, 4] },
        data: fac.map(function (d) { return d.good[1]; }),
        label: {
          show: true, position: 'left', color: '#62e6d2', fontSize: 9,
          formatter: function (p) {
            return p.value === 0 ? '' : '−' + Math.abs(p.value).toFixed(2);
          }
        }
      },
      {
        name: '不利端（终值上升）', type: 'bar', barWidth: 9,
        itemStyle: { color: '#ff7f86', borderRadius: [0, 4, 4, 0] },
        data: fac.map(function (d) { return d.bad[1]; }),
        label: {
          show: true, position: 'right', color: '#ff7f86', fontSize: 9,
          formatter: function (p) { return '+' + p.value.toFixed(2); }
        },
        markLine: {
          silent: true, symbol: 'none',
          lineStyle: { color: '#2b3d52', width: 1 },
          label: { show: false },
          data: [{ xAxis: 0 }]
        }
      }
    ]
  });

  /* ---------------------------------------------------------------- p3 · 情景回放 */
  var rounds = ['R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07', 'R08', 'R09', 'R10', 'R11', 'R12'];
  var S0 = [0.12, 0.21, 0.27, 0.33, 0.40, 0.52, 0.58, 0.59, 0.64, 0.69, 0.74, 0.73];
  var S1 = [0.12, 0.21, 0.27, 0.32, 0.37, 0.42, 0.48, 0.53, 0.58, 0.61, 0.68, 0.61];
  var S2 = [0.12, 0.21, 0.24, 0.28, 0.33, 0.38, 0.44, 0.50, 0.56, 0.63, 0.66, 0.55];
  var S3 = [0.12, 0.21, 0.28, 0.36, 0.44, 0.54, 0.59, 0.65, 0.70, 0.73, 0.75, 0.69];
  mk('mp23-replay', {
    backgroundColor: 'transparent',
    grid: { left: 42, right: 22, top: 34, bottom: 26 },
    legend: {
      top: 0, left: 'center', itemWidth: 10, itemHeight: 8, itemGap: 14,
      textStyle: { color: '#8fa7ba', fontSize: 10 }
    },
    tooltip: {
      trigger: 'axis', backgroundColor: '#0d1c2e', borderColor: '#1d3853',
      textStyle: { color: '#e9f2fa', fontSize: 11 },
      formatter: function (ps) {
        var s = rounds[ps[0].dataIndex] + '<br/>';
        ps.forEach(function (p) { s += p.marker + p.seriesName + '：' + p.value.toFixed(2) + '<br/>'; });
        return s;
      }
    },
    xAxis: {
      type: 'category', boundaryGap: false, data: rounds,
      axisLine: AXIS_LINE, axisTick: { show: false },
      axisLabel: { color: '#8fa7ba', fontSize: 10 }
    },
    yAxis: {
      type: 'value', min: 0.05, max: 0.82, splitLine: SPLIT_LINE,
      axisLabel: {
        color: '#8fa7ba', fontSize: 9.5,
        formatter: function (v) { return v.toFixed(2); }
      }
    },
    series: [
      {
        name: 'S0 无干预', type: 'line', smooth: true, symbolSize: 4, data: S0,
        lineStyle: { color: '#ff7f86', width: 2.4 }, itemStyle: { color: '#ff7f86' },
        markArea: {
          silent: true,
          itemStyle: { color: 'rgba(246,198,107,.055)' },
          label: {
            show: true, color: '#f6c66b', fontSize: 9, position: 'insideTop',
            formatter: '干预窗口 R02–R04'
          },
          data: [[{ xAxis: 'R02' }, { xAxis: 'R04' }]]
        },
        markLine: {
          silent: true, symbol: 'none',
          lineStyle: { color: '#8fa7ba', type: 'dashed', width: 1 },
          label: {
            formatter: '高位线 0.60', color: '#8fa7ba', fontSize: 9,
            position: 'insideStartTop', distance: 6
          },
          data: [{ yAxis: 0.6 }]
        }
      },
      {
        name: 'S1 权威发布', type: 'line', smooth: true, symbolSize: 3, data: S1,
        lineStyle: { color: '#f6c66b', width: 2, type: 'dashed' }, itemStyle: { color: '#f6c66b' }
      },
      {
        name: 'S2 核查+引导', type: 'line', smooth: true, symbolSize: 4, data: S2,
        lineStyle: { color: '#62e6d2', width: 2.4 }, itemStyle: { color: '#62e6d2' }
      },
      {
        name: 'S3 高强度管制', type: 'line', smooth: true, symbolSize: 3, data: S3,
        lineStyle: { color: '#73a7ff', width: 1.6, type: 'dashed' }, itemStyle: { color: '#73a7ff' }
      }
    ]
  });

  /* ---------------------------------------------------------------- 尺寸同步 */
  function resizeAll() {
    charts.forEach(function (c) { try { c.resize(); } catch (e) { } });
  }
  setTimeout(resizeAll, 60);
  setTimeout(resizeAll, 320);

  window.addEventListener('resize', resizeAll);

  /* 标签页切换后补一次 resize：既有脚本在点击时派发 window resize，这里再加一层兜底 */
  var tabs = document.querySelectorAll('#masTabs .tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener('click', function () { setTimeout(resizeAll, 60); });
  }

  return charts.length;
};

/* ============================================================================
   多智能体推演系统 · p4 智能体调用链 —— 扩充模块图表初始化
   调用方式：DOM 中插入 mas-p4.html 的 6 个模块后执行
             window.__ENRICH_MAS_P4();
           可重复调用（同一容器不会重复 init，只做 resize）。
   容器高度在 HTML 内联 style 中显式给定；容器 id 统一 mp4- 前缀。
   数据口径：单轮 4.82 s = 编排 1.26 s + 推理 3.56 s；12 次调用 809.1 ms；
             12 轮；2 路通道；6 类角色；事件 E-2f7c9a；trace E-2f7c9a-R07。
   ========================================================================== */
window.__ENRICH_MAS_P4 = function () {
  if (typeof echarts === 'undefined' || !echarts) return;   /* 图表库未加载则直接返回 */

  var charts = [];

  function mk(id, option) {
    var el = document.getElementById(id);
    if (!el) return;
    try {
      var c = echarts.getInstanceByDom(el) || echarts.init(el);
      c.setOption(option, true);
      charts.push(c);
    } catch (e) {
      if (window.console) console.error('[mp4] chart init failed:', id, e);
    }
  }

  /* ---------------- 公共样式常量 ---------------- */
  var AXIS = '#1d3853', SPLIT = '#14283d', MUTED = '#8fa7ba', TEXT = '#e9f2fa';
  var CYAN = '#62e6d2', BLUE = '#73a7ff', AMBER = '#f6c66b', RED = '#ff7f86';
  var TIP = {
    backgroundColor: '#0d1c2e', borderColor: AXIS,
    textStyle: { color: TEXT, fontSize: 11 }
  };
  var LEG = { top: 0, right: 0, itemWidth: 8, itemHeight: 8, textStyle: { color: MUTED, fontSize: 10 } };

  function fmt(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* ================================================================
     ① 单轮调用时序（编排甘特）
     块长 = 明细耗时列；12 段合计 809.1 ms；空隙 = 调度与黑板同步；
     最后一段（12 汇总输出）结束于 1,260 ms = 编排墙钟。
     ================================================================ */
  var TYPE_COLOR = { '编排': BLUE, '角色': CYAN, '复核': AMBER, '分支': '#9db4c8' };

  var STEPS = [
    { no: '01', role: '态势感知', from: '编排器', type: '编排', model: 'm-lite-7b', tin: 620, tout: 48, hit: 384, ms: 62.4, st: 0.0, lane: 0 },
    { no: '02', role: '事件理解', from: '编排器', type: '编排', model: 'm-reason-14b', tin: 1240, tout: 96, hit: 742, ms: 88.7, st: 104.0, lane: 0 },
    { no: '03', role: '情感与立场', from: '事件理解', type: '角色', model: 'm-lite-7b', tin: 1680, tout: 132, hit: 1008, ms: 54.3, st: 213.4, lane: 0 },
    { no: '04', role: '传播推演', from: '编排器', type: '编排', model: 'm-reason-14b', tin: 1420, tout: 168, hit: 866, ms: 143.6, st: 327.6, lane: 0 },
    { no: '05', role: '风险研判', from: '传播推演', type: '角色', model: 'm-reason-14b', tin: 980, tout: 84, hit: 592, ms: 96.2, st: 517.6, lane: 0 },
    { no: '06', role: '策略评估', from: '风险研判', type: '角色', model: 'm-reason-14b', tin: 860, tout: 72, hit: 521, ms: 121.8, st: 746.3, lane: 0 },
    { no: '07', role: '情感与立场', from: '编排器', type: '复核', model: 'm-lite-7b', tin: 520, tout: 44, hit: 316, ms: 47.9, st: 613.8, lane: 1 },
    { no: '08', role: '风险研判', from: '编排器', type: '复核', model: 'm-reason-14b', tin: 460, tout: 38, hit: 281, ms: 58.3, st: 661.7, lane: 1 },
    { no: '09', role: '策略评估', from: '编排器', type: '分支', model: 'm-reason-14b', tin: 420, tout: 36, hit: 258, ms: 36.7, st: 868.1, lane: 1 },
    { no: '10', role: '态势感知', from: '编排器', type: '分支', model: 'm-lite-7b', tin: 280, tout: 24, hit: 172, ms: 21.4, st: 62.4, lane: 1 },
    { no: '11', role: '事件理解', from: '编排器', type: '分支', model: 'm-reason-14b', tin: 340, tout: 30, hit: 209, ms: 33.2, st: 192.7, lane: 1 },
    { no: '12', role: '汇总输出', from: '编排器', type: '编排', model: 'm-lite-7b', tin: 720, tout: 58, hit: 436, ms: 44.6, st: 1215.4, lane: 0 }
  ];

  /* 同一通道内的调度 / 黑板同步空隙（lane, from, to, 是否标注） */
  var GAPS = [
    [0, 62.4, 104.0, 0], [0, 192.7, 213.4, 0], [0, 267.7, 327.6, 0],
    [0, 471.2, 517.6, 0], [0, 613.8, 746.3, 0], [0, 868.1, 1215.4, 1],
    [1, 0, 62.4, 0], [1, 83.8, 192.7, 0], [1, 225.9, 613.8, 0], [1, 720.0, 868.1, 0], [1, 904.8, 1260.0, 0]
  ];

  function ganttRender(type) {
    return function (params, api) {
      var lane = api.value(0);
      var s = api.coord([api.value(1), lane]);
      var e = api.coord([api.value(2), lane]);
      var d = STEPS[params.dataIndex];
      if (type === 'gap') {
        var g = GAPS[params.dataIndex];
        var w0 = Math.max(e[0] - s[0], 1);
        var kids = [{ type: 'rect', shape: { x: s[0], y: s[1] - 2.5, width: w0, height: 5, r: 2.5 }, style: { fill: 'rgba(143,167,186,.16)' } }];
        if (g[3] && w0 > 96) {
          kids.push({ type: 'text', style: { text: '等待黑板合并 347.3 ms', x: s[0] + w0 / 2, y: s[1] - 11, textAlign: 'center', textVerticalAlign: 'middle', fill: '#6f8aa1', font: '400 9px Inter, "PingFang SC", sans-serif' } });
        }
        return { type: 'group', children: kids };
      }
      var h = 18;
      var w = Math.max(e[0] - s[0], 2.5);
      var kids2 = [{ type: 'rect', shape: { x: s[0], y: s[1] - h / 2, width: w, height: h, r: 3 }, style: { fill: TYPE_COLOR[d.type], opacity: 0.9 } }];
      if (w > 26) {
        kids2.push({ type: 'text', style: { text: d.no, x: s[0] + w / 2, y: s[1], textAlign: 'center', textVerticalAlign: 'middle', fill: '#06101d', font: '700 9.5px "SF Mono",Menlo,monospace' } });
      } else {
        kids2.push({ type: 'text', style: { text: d.no, x: s[0] + w / 2, y: s[1] - 13, textAlign: 'center', textVerticalAlign: 'middle', fill: '#b9cbdb', font: '600 9px "SF Mono",Menlo,monospace' } });
      }
      return { type: 'group', children: kids2 };
    };
  }

  mk('mp4-gantt', {
    backgroundColor: 'transparent',
    animation: false,
    grid: { left: 104, right: 22, top: 16, bottom: 30 },
    tooltip: {
      trigger: 'item', backgroundColor: '#0d1c2e', borderColor: AXIS,
      textStyle: { color: TEXT, fontSize: 11 },
      formatter: function (p) {
        if (p.seriesIndex !== 1 && p.seriesIndex !== 0) return '';
        var d = STEPS[p.dataIndex];
        if (!d) return '';
        var en = +(d.st + d.ms).toFixed(1);
        return '<b>' + d.no + ' ' + d.role + '</b>　<span style="color:#8fa7ba">' + d.type + '调用</span><br/>'
          + '调用方：' + d.from + '<br/>'
          + '起止：' + d.st.toFixed(1) + ' → ' + en.toFixed(1) + ' ms（' + d.ms.toFixed(1) + ' ms）<br/>'
          + '模型：' + d.model + '<br/>'
          + 'Token：' + fmt(d.tin) + ' 入 / ' + fmt(d.tout) + ' 出 · 命中 ' + fmt(d.hit);
      }
    },
    xAxis: {
      type: 'value', min: 0, max: 1260,
      axisLine: { lineStyle: { color: AXIS } }, axisTick: { show: false },
      axisLabel: { color: MUTED, fontSize: 9.5, formatter: function (v) { return fmt(v); } },
      splitLine: { lineStyle: { color: SPLIT } }
    },
    yAxis: {
      type: 'category', data: ['通道 A · 主链', '通道 B · 复核 / 分支'], inverse: true,
      axisLine: { lineStyle: { color: AXIS } }, axisTick: { show: false },
      axisLabel: { color: '#b9cbdb', fontSize: 10.5 },
      splitLine: { show: false }
    },
    series: [
      {
        type: 'custom', silent: true, z: 1,
        renderItem: ganttRender('gap'),
        encode: { x: [1, 2], y: 0 },
        data: GAPS.map(function (g) { return [g[0], g[1], g[2]]; })
      },
      {
        type: 'custom', z: 3,
        renderItem: ganttRender('block'),
        encode: { x: [1, 2], y: 0 },
        data: STEPS.map(function (d) { return [d.lane, d.st, +(d.st + d.ms).toFixed(1)]; })
      }
    ]
  });

  /* ================================================================
     ② Token 消耗与成本分解（按角色）
     ================================================================ */
  var ROLES = [
    { n: '情感与立场', in: 2200, out: 176, hit: 1324, cost: 0.0104 },
    { n: '事件理解', in: 1580, out: 126, hit: 951, cost: 0.0075 },
    { n: '传播推演', in: 1420, out: 168, hit: 866, cost: 0.0076 },
    { n: '风险研判', in: 1440, out: 122, hit: 873, cost: 0.0069 },
    { n: '策略评估', in: 1280, out: 108, hit: 779, cost: 0.0061 },
    { n: '态势感知', in: 900, out: 72, hit: 556, cost: 0.0042 },
    { n: '汇总输出', in: 720, out: 58, hit: 436, cost: 0.0034 }
  ];

  mk('mp4-token', {
    backgroundColor: 'transparent',
    animation: false,
    grid: { left: 80, right: 104, top: 30, bottom: 22 },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: '#0d1c2e', borderColor: AXIS,
      textStyle: { color: TEXT, fontSize: 11 },
      formatter: function (ps) {
        var i = ps[0].dataIndex, r = ROLES[i];
        var total = r.in + r.out;
        return '<b>' + r.n + '</b><br/>'
          + '输入 ' + fmt(r.in) + '（命中 ' + fmt(r.hit) + ' / 未命中 ' + fmt(r.in - r.hit) + '）<br/>'
          + '输出 ' + fmt(r.out) + '<br/>'
          + '合计 ' + fmt(total) + ' tokens<br/>'
          + '成本 ¥' + r.cost.toFixed(4) + '（' + (r.cost / 0.0461 * 100).toFixed(1) + '%）';
      }
    },
    legend: { top: 0, right: 0, itemWidth: 8, itemHeight: 8, textStyle: { color: MUTED, fontSize: 10 }, data: ['未命中输入', '命中输入', '输出'] },
    xAxis: {
      type: 'value', name: 'tokens', nameTextStyle: { color: MUTED, fontSize: 9.5 },
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: MUTED, fontSize: 9.5 },
      splitLine: { lineStyle: { color: SPLIT } }
    },
    yAxis: {
      type: 'category', inverse: true, data: ROLES.map(function (r) { return r.n; }),
      axisLine: { lineStyle: { color: AXIS } }, axisTick: { show: false },
      axisLabel: { color: '#b9cbdb', fontSize: 10.5 }
    },
    series: [
      {
        name: '未命中输入', type: 'bar', stack: 'k', barWidth: 12,
        itemStyle: { color: '#4d7fc4', borderRadius: [3, 0, 0, 3] },
        data: ROLES.map(function (r) { return r.in - r.hit; })
      },
      {
        name: '命中输入', type: 'bar', stack: 'k', barWidth: 12,
        itemStyle: { color: CYAN },
        data: ROLES.map(function (r) { return r.hit; })
      },
      {
        name: '输出', type: 'bar', stack: 'k', barWidth: 12,
        itemStyle: { color: AMBER, borderRadius: [0, 3, 3, 0] },
        label: {
          show: true, position: 'right', color: '#b9cbdb', fontSize: 9.5,
          formatter: function (p) {
            var r = ROLES[p.dataIndex];
            return fmt(r.in + r.out) + '　¥' + r.cost.toFixed(4);
          }
        },
        data: ROLES.map(function (r) { return r.out; })
      }
    ]
  });

  /* ================================================================
     ③ 按轮次 Token 与单轮成本（12 轮）
     ================================================================ */
  var RANGE = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12'];
  var RIN = [4.26, 5.18, 6.04, 6.86, 7.72, 8.64, 9.54, 10.42, 11.26, 12.08, 12.86, 13.54];
  var ROUT = [0.392, 0.472, 0.548, 0.620, 0.694, 0.762, 0.830, 0.904, 0.972, 1.038, 1.096, 1.148];
  var RCOST = [0.0291, 0.0316, 0.0347, 0.0377, 0.0409, 0.0436, 0.0462, 0.0493, 0.0523, 0.0552, 0.0579, 0.0604];

  mk('mp4-round', {
    backgroundColor: 'transparent',
    animation: false,
    grid: { left: 40, right: 44, top: 30, bottom: 24 },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: '#0d1c2e', borderColor: AXIS,
      textStyle: { color: TEXT, fontSize: 11 },
      formatter: function (ps) {
        var i = ps[0].dataIndex;
        var tot = RIN[i] + ROUT[i];
        return '<b>' + RANGE[i] + '</b>（第 ' + (i + 1) + ' 轮）<br/>'
          + '输入 ' + RIN[i].toFixed(2) + 'k · 输出 ' + ROUT[i].toFixed(3) + 'k<br/>'
          + '合计 ' + tot.toFixed(2) + 'k tokens<br/>'
          + '单轮成本 ¥' + RCOST[i].toFixed(4);
      }
    },
    legend: { top: 0, right: 0, itemWidth: 8, itemHeight: 8, textStyle: { color: MUTED, fontSize: 10 }, data: ['输入', '输出', '单轮成本'] },
    xAxis: {
      type: 'category', data: RANGE,
      axisLine: { lineStyle: { color: AXIS } }, axisTick: { show: false },
      axisLabel: { color: MUTED, fontSize: 9.5 }
    },
    yAxis: [
      {
        type: 'value', name: 'k tokens', nameTextStyle: { color: MUTED, fontSize: 9.5 },
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: MUTED, fontSize: 9.5 },
        splitLine: { lineStyle: { color: SPLIT } }
      },
      {
        type: 'value', min: 0, max: 0.08,
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: MUTED, fontSize: 9.5, formatter: function (v) { return v.toFixed(2); } },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: '输入', type: 'bar', stack: 'r', barWidth: 16,
        itemStyle: { color: 'rgba(115,167,255,.55)', borderRadius: [0, 0, 0, 0] },
        data: RIN
      },
      {
        name: '输出', type: 'bar', stack: 'r', barWidth: 16,
        itemStyle: { color: 'rgba(98,230,210,.55)', borderRadius: [3, 3, 0, 0] },
        data: ROUT
      },
      {
        name: '单轮成本', type: 'line', yAxisIndex: 1, smooth: false, symbolSize: 4,
        itemStyle: { color: AMBER }, lineStyle: { color: AMBER, width: 1.8 },
        data: RCOST
      }
    ]
  });

  /* ================================================================
     ④ 并发与排队（推理阶段 1,260 → 4,820 ms，相对 0 → 3,560 ms）
     通道占用合计 3,970 ms；双路重叠 410 ms；峰值并发 2；队列峰值 2。
     ================================================================ */
  var INF = [
    { name: '01 态势感知', lane: 0, st: 0, en: 235 },
    { name: '02 事件理解', lane: 0, st: 235, en: 697 },
    { name: '03 情感与立场', lane: 0, st: 697, en: 1305 },
    { name: '04 传播推演', lane: 0, st: 1305, en: 2153 },
    { name: '05 风险研判', lane: 0, st: 2153, en: 2658 },
    { name: '06 策略评估', lane: 0, st: 2658, en: 3116 },
    { name: '12 汇总输出', lane: 0, st: 3116, en: 3260 },
    { name: '07 情感与立场', lane: 1, st: 0, en: 168 },
    { name: '08 风险研判', lane: 1, st: 168, en: 344 },
    { name: '10 态势感知', lane: 1, st: 344, en: 410 },
    { name: '09 策略评估', lane: 1, st: 3260, en: 3412 },
    { name: '11 事件理解', lane: 1, st: 3412, en: 3560 }
  ];
  var WAITS = [
    { name: '08 风险研判 · 复核', ready: 0, start: 168, wait: 168.0 },
    { name: '10 态势感知 · 增量', ready: 0, start: 344, wait: 344.0 },
    { name: '11 事件理解 · 复判', ready: 3260, start: 3412, wait: 152.0 }
  ];

  var PHASE = 3560, STEPT = 40;
  var OCC_DATA = [], QUE_DATA = [], occPeak = 0, queuePeak = 0;
  for (var t = 0; t <= PHASE; t += STEPT) {
    var n = 0;
    for (var k = 0; k < INF.length; k++) {
      if (t >= INF[k].st && t < INF[k].en) n++;
    }
    if (n > occPeak) occPeak = n;
    var q = 0;
    for (var j = 0; j < WAITS.length; j++) {
      if (t >= WAITS[j].ready && t < WAITS[j].start) q++;
    }
    if (q > queuePeak) queuePeak = q;
    OCC_DATA.push([t, n]);
    QUE_DATA.push([t, q]);
  }

  mk('mp4-conc', {
    backgroundColor: 'transparent',
    animation: false,
    grid: { left: 34, right: 36, top: 34, bottom: 26 },
    tooltip: {
      trigger: 'axis', backgroundColor: '#0d1c2e', borderColor: AXIS,
      textStyle: { color: TEXT, fontSize: 11 },
      formatter: function (ps) {
        var rel = ps[0].data[0];
        return '<b>' + fmt(rel) + ' ms</b>（单轮 ' + fmt(rel + 1260) + ' ms）<br/>'
          + '占用通道 ' + ps[0].data[1] + ' / 2<br/>'
          + '队列长度 ' + (ps[1] ? ps[1].data[1] : 0);
      }
    },
    legend: { top: 0, right: 0, itemWidth: 8, itemHeight: 8, textStyle: { color: MUTED, fontSize: 10 }, data: ['占用通道', '队列长度'] },
    xAxis: {
      type: 'value', min: 0, max: PHASE,
      axisLine: { lineStyle: { color: AXIS } }, axisTick: { show: false },
      axisLabel: { color: MUTED, fontSize: 9.5, formatter: function (v) { return fmt(v); } },
      splitLine: { show: false }
    },
    yAxis: [
      {
        type: 'value', min: 0, max: 2, interval: 1,
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: MUTED, fontSize: 9.5 },
        splitLine: { lineStyle: { color: SPLIT } }
      },
      {
        type: 'value', min: 0, max: 3, interval: 1,
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: MUTED, fontSize: 9.5 },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: '占用通道', type: 'line', step: 'end', symbol: 'none',
        lineStyle: { color: CYAN, width: 1.8 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(98,230,210,.30)' },
            { offset: 1, color: 'rgba(98,230,210,.03)' }
          ])
        },
        data: OCC_DATA,
        markArea: {
          silent: true, itemStyle: { color: 'rgba(246,198,107,.10)' },
          label: { show: true, position: 'insideTop', color: '#f6c66b', fontSize: 9, formatter: '双路并行 410 ms' },
          data: [[{ xAxis: 0 }, { xAxis: 410 }]]
        },
        markLine: {
          silent: true, symbol: 'none',
          lineStyle: { color: 'rgba(143,167,186,.5)', type: 'dashed', width: 1 },
          label: { show: false },
          data: [{ yAxis: 1 }]
        }
      },
      {
        name: '队列长度', type: 'line', yAxisIndex: 1, step: 'end', symbol: 'none',
        lineStyle: { color: AMBER, width: 1.3, type: 'dashed' },
        data: QUE_DATA
      }
    ]
  });

  /* ================================================================
     ⑤ 缓存命中（三层）+ 分轮命中率
     ================================================================ */
  var CACHE = [
    { n: '前缀缓存', req: 3180, hit: 3146 },
    { n: '角色记忆', req: 3420, hit: 1476 },
    { n: '工具结果', req: 2940, hit: 1163 }
  ];
  var CHIT = [18.6, 34.2, 41.8, 47.2, 51.6, 56.4, 60.6, 62.8, 64.6, 66.2, 67.4, 68.2];

  mk('mp4-cache', {
    backgroundColor: 'transparent',
    animation: false,
    grid: { left: 72, right: 58, top: 8, bottom: 20 },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: '#0d1c2e', borderColor: AXIS,
      textStyle: { color: TEXT, fontSize: 11 },
      formatter: function (ps) {
        var i = ps[0].dataIndex, c = CACHE[i];
        return '<b>' + c.n + '</b><br/>请求 ' + fmt(c.req) + ' tokens<br/>'
          + '命中 ' + fmt(c.hit) + ' · 未命中 ' + fmt(c.req - c.hit) + '<br/>'
          + '命中率 ' + (c.hit / c.req * 100).toFixed(1) + '%';
      }
    },
    xAxis: {
      type: 'value', name: 'tokens', nameTextStyle: { color: MUTED, fontSize: 9.5 },
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: MUTED, fontSize: 9.5 },
      splitLine: { lineStyle: { color: SPLIT } }
    },
    yAxis: {
      type: 'category', inverse: true, data: CACHE.map(function (c) { return c.n; }),
      axisLine: { lineStyle: { color: AXIS } }, axisTick: { show: false },
      axisLabel: { color: '#b9cbdb', fontSize: 10.5 }
    },
    series: [
      {
        name: '命中', type: 'bar', stack: 'c', barWidth: 13,
        itemStyle: { color: CYAN, borderRadius: [3, 0, 0, 3] },
        data: CACHE.map(function (c) { return c.hit; })
      },
      {
        name: '未命中', type: 'bar', stack: 'c', barWidth: 13,
        itemStyle: { color: '#22405c', borderRadius: [0, 3, 3, 0] },
        label: {
          show: true, position: 'right', color: '#b9cbdb', fontSize: 9.5,
          formatter: function (p) {
            var c = CACHE[p.dataIndex];
            return (c.hit / c.req * 100).toFixed(1) + '%';
          }
        },
        data: CACHE.map(function (c) { return c.req - c.hit; })
      }
    ]
  });

  mk('mp4-cacheRound', {
    backgroundColor: 'transparent',
    animation: false,
    grid: { left: 38, right: 34, top: 14, bottom: 22 },
    tooltip: {
      trigger: 'axis', backgroundColor: '#0d1c2e', borderColor: AXIS,
      textStyle: { color: TEXT, fontSize: 11 },
      formatter: function (ps) {
        var i = ps[0].dataIndex;
        return '<b>' + RANGE[i] + '</b> 缓存命中率 ' + CHIT[i].toFixed(1) + '%<br/>'
          + '输入 ' + fmt(RIN[i] * 1000) + ' tokens · 命中 ' + fmt(RIN[i] * 1000 * CHIT[i] / 100);
      }
    },
    xAxis: {
      type: 'category', boundaryGap: false, data: RANGE,
      axisLine: { lineStyle: { color: AXIS } }, axisTick: { show: false },
      axisLabel: { color: MUTED, fontSize: 9 }
    },
    yAxis: {
      type: 'value', min: 0, max: 80, name: '%', nameTextStyle: { color: MUTED, fontSize: 9 },
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: MUTED, fontSize: 9 },
      splitLine: { lineStyle: { color: SPLIT } }
    },
    series: [
      {
        type: 'line', smooth: true, symbolSize: 3,
        lineStyle: { color: CYAN, width: 1.8 }, itemStyle: { color: CYAN },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(98,230,210,.26)' },
            { offset: 1, color: 'rgba(98,230,210,.02)' }
          ])
        },
        label: {
          show: true, position: 'top', color: '#b9cbdb', fontSize: 9,
          formatter: function (p) { return p.dataIndex === 11 ? p.value.toFixed(1) + '%' : ''; }
        },
        data: CHIT
      }
    ]
  });

  /* ================================================================
     ⑥ 上下文长度分布（近 7 日 1,284 次调用）
     ================================================================ */
  var BINS = ['0–400', '400–800', '800–1,200', '1,200–1,600', '1,600–2,000', '≥2,000'];
  var BCNT = [214, 498, 342, 168, 52, 10];
  var BCOL = ['#4d7fc4', '#57b9dd', CYAN, AMBER, '#f2a95e', RED];

  mk('mp4-ctx', {
    backgroundColor: 'transparent',
    animation: false,
    grid: { left: 52, right: 20, top: 34, bottom: 26 },
    graphic: [
      { type: 'text', right: 16, top: 6, silent: true, style: { text: '超过 2,048：10 次 · 拆 2 段', fill: '#f6c66b', fontSize: 9.5, font: '400 9.5px Inter, "PingFang SC", sans-serif' } }
    ],
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: '#0d1c2e', borderColor: AXIS,
      textStyle: { color: TEXT, fontSize: 11 },
      formatter: function (ps) {
        var i = ps[0].dataIndex;
        return '<b>' + BINS[i] + ' tokens</b><br/>调用 ' + fmt(BCNT[i]) + ' 次<br/>'
          + '占样本 ' + (BCNT[i] / 1284 * 100).toFixed(1) + '%';
      }
    },
    xAxis: {
      type: 'category', data: BINS,
      axisLine: { lineStyle: { color: AXIS } }, axisTick: { show: false },
      axisLabel: { color: MUTED, fontSize: 9.5, interval: 0 }
    },
    yAxis: {
      type: 'value', name: '次', nameTextStyle: { color: MUTED, fontSize: 9.5 },
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: MUTED, fontSize: 9.5 },
      splitLine: { lineStyle: { color: SPLIT } }
    },
    series: [
      {
        type: 'bar', barWidth: '54%',
        data: BCNT.map(function (v, i) { return { value: v, itemStyle: { color: BCOL[i], borderRadius: [3, 3, 0, 0] } }; }),
        label: { show: true, position: 'top', color: '#b9cbdb', fontSize: 9.5 }
      }
    ]
  });

  /* ================================================================
     ⑦ 调用链拓扑（节点 = 角色，边 = 近 7 日调用次数）
     ================================================================ */
  var NODES = [
    { name: '编排器', x: 60, y: 205, size: 54, color: AMBER, cnt: 710, lp: 'top' },
    { name: '态势感知', x: 250, y: 68, size: 42, color: BLUE, cnt: 132, lp: 'top' },
    { name: '事件理解', x: 360, y: 205, size: 48, color: BLUE, cnt: 246, lp: 'bottom' },
    { name: '情感与立场', x: 610, y: 112, size: 49, color: CYAN, cnt: 258, lp: 'bottom' },
    { name: '传播推演', x: 300, y: 348, size: 45, color: CYAN, cnt: 204, lp: 'bottom' },
    { name: '风险研判', x: 590, y: 348, size: 46, color: CYAN, cnt: 216, lp: 'bottom' },
    { name: '策略评估', x: 850, y: 348, size: 47, color: CYAN, cnt: 228, lp: 'bottom' }
  ];
  var LINKS = [
    { s: '编排器', t: '传播推演', v: 204, lat: '138.9 ms', retry: 5 },
    { s: '编排器', t: '事件理解', v: 196, lat: '95.5 ms', retry: 3 },
    { s: '编排器', t: '情感与立场', v: 178, lat: '53.7 ms', retry: 3 },
    { s: '编排器', t: '态势感知', v: 132, lat: '58.6 ms', retry: 1 },
    { s: '态势感知', t: '事件理解', v: 50, lat: '39.8 ms', retry: 1 },
    { s: '事件理解', t: '情感与立场', v: 80, lat: '47.2 ms', retry: 1 },
    { s: '传播推演', t: '风险研判', v: 216, lat: '92.4 ms', retry: 4 },
    { s: '风险研判', t: '策略评估', v: 228, lat: '118.3 ms', retry: 5 }
  ];

  mk('mp4-topo', {
    backgroundColor: 'transparent',
    animation: false,
    tooltip: {
      backgroundColor: '#0d1c2e', borderColor: AXIS,
      textStyle: { color: TEXT, fontSize: 11 },
      formatter: function (p) {
        if (p.dataType === 'edge') {
          var L = null;
          for (var i = 0; i < LINKS.length; i++) {
            if (LINKS[i].s === p.data.source && LINKS[i].t === p.data.target) L = LINKS[i];
          }
          if (!L) return '';
          return '<b>' + L.s + ' → ' + L.t + '</b><br/>调用 ' + fmt(L.v) + ' 次 · 占比 '
            + (L.v / 1284 * 100).toFixed(1) + '%<br/>平均时延 ' + L.lat + ' · 重试 ' + L.retry + ' 次';
        }
        var d = p.data;
        return '<b>' + d.name + '</b><br/>近 7 日被调 ' + fmt(d.cnt) + ' 次';
      }
    },
    series: [
      {
        type: 'graph', layout: 'none', roam: false, animation: false,
        left: 44, right: 46, top: 58, bottom: 76,
        symbolSize: function (v, p) { return p && p.data ? p.data.size : 44; },
        data: NODES.map(function (n) {
          return {
            name: n.name, x: n.x, y: n.y, size: n.size, cnt: n.cnt,
            itemStyle: { color: n.color, borderColor: '#07111f', borderWidth: 2, opacity: 0.94 },
            label: {
              show: true, position: n.lp, distance: n.lp === 'right' ? 9 : 6,
              color: '#cfe3ef', fontSize: 10, lineHeight: 13,
              formatter: function (p2) {
                return p2.data.name + '\n' + fmt(p2.data.cnt) + ' 次';
              }
            }
          };
        }),
        links: LINKS.map(function (l, li) {
          var cv = 0.06;
          if (l.s === '编排器' && l.t === '情感与立场') cv = 0.26;
          if (l.s === '态势感知' && l.t === '事件理解') cv = -0.18;
          if (l.s === '事件理解' && l.t === '情感与立场') cv = -0.12;
          if (l.s === '编排器' && l.t === '态势感知') cv = -0.14;
          return {
            source: l.s, target: l.t, value: l.v,
            lineStyle: {
              color: l.s === '编排器' ? 'rgba(246,198,107,.40)' : 'rgba(98,230,210,.40)',
              width: 1.2 + l.v / 46, curveness: cv
            }
          };
        }),
        edgeLabel: {
          show: true, color: '#9db4c8', fontSize: 9,
          backgroundColor: 'rgba(7,17,31,.78)', padding: [1, 4], borderRadius: 3,
          formatter: function (p) { return p.value; }
        },
        edgeSymbol: ['none', 'arrow'], edgeSymbolSize: 6,
        emphasis: { focus: 'adjacency', lineStyle: { color: '#62e6d2', width: 2.8, opacity: 0.95 } }
      }
    ]
  });

  /* ---------------------------------------------------------------- 尺寸同步 */
  function resizeAll() {
    charts.forEach(function (c) { try { c.resize(); } catch (e) { } });
  }
  setTimeout(resizeAll, 60);
  setTimeout(resizeAll, 320);

  window.addEventListener('resize', resizeAll);

  var tabs = document.querySelectorAll('#masTabs .tab');
  for (var ti = 0; ti < tabs.length; ti++) {
    tabs[ti].addEventListener('click', function () { setTimeout(resizeAll, 60); setTimeout(resizeAll, 300); });
  }

  return charts.length;
};

/* ============================================================================
   风险预警与干预 · r1 / r2 扩充模块脚本
   window.__ENRICH_RISK_R12()  —— 在片段 HTML 注入到 #r1 / #r2 之后调用一次
   约束：echarts 未定义直接 return；新 id 全部 rr12- 前缀；图表容器显式高度；
        重复调用不重复 init、不重复绑 resize。
   数据口径：事件 E-2f7c9a · 综合分值 0.74 = 七维加权 0.705 + 联动修正 0.035
            三时点取自 24 小时序列同刻点 0.29 / 0.61 / 0.74
            样本 6,989 条已审核记录 · 基准阈值 0.82 / 0.68 / 0.52（P90 / P65 / P35）
   ============================================================================ */
(function () {
  'use strict';

  var COLORS = {
    cyan: '#62e6d2', blue: '#73a7ff', amber: '#f6c66b', red: '#ff7f86',
    muted: '#8fa7ba', line: '#1d3853', grid: '#14283d', panel: '#0d1c2e'
  };
  var LV_COLOR = { '极高': COLORS.red, '高': COLORS.amber, '中': COLORS.blue, '低': COLORS.cyan };

  /* ---------- 统一 resize 管理：只绑一次，只 resize 本模块的实例 ---------- */
  function registry() {
    if (!window.__RR12_CHARTS) window.__RR12_CHARTS = [];
    return window.__RR12_CHARTS;
  }
  function bindResize() {
    if (window.__RR12_RESIZE_BOUND) return;
    window.__RR12_RESIZE_BOUND = true;
    window.addEventListener('resize', function () {
      registry().forEach(function (c) { try { c.resize(); } catch (e) { /* 实例已销毁 */ } });
    });
  }

  function mount(id, height, option) {
    var el = document.getElementById(id);
    if (!el) return null;
    if (!el.style.height) el.style.height = height + 'px';   /* 显式高度兜底 */
    var inst = null;
    try {
      inst = window.echarts.getInstanceByDom(el) || window.echarts.init(el);
      inst.setOption(option, true);
    } catch (e) {
      console.error('[rr12] 图表初始化失败：' + id, e);
      return null;
    }
    var reg = registry();
    if (reg.indexOf(inst) < 0) reg.push(inst);
    return inst;
  }

  function tipBase() {
    return {
      backgroundColor: COLORS.panel, borderColor: COLORS.line, borderWidth: 1,
      textStyle: { color: '#e9f2fa', fontSize: 11 },
      axisPointer: { lineStyle: { color: COLORS.line } }
    };
  }
  function axisBase(fmt) {
    return {
      type: 'category', boundaryGap: true,
      axisLine: { lineStyle: { color: COLORS.line } },
      axisTick: { show: false },
      axisLabel: { color: COLORS.muted, fontSize: 9.5, formatter: fmt }
    };
  }

  /* ==========================================================================
     r1 · 模块 1：风险信号看板 —— 近 7 日信号量 + 误报率
     ========================================================================== */
  function chartSignal() {
    var days = ['10-13', '10-14', '10-15', '10-16', '10-17', '10-18', '10-19'];
    var vol = [31, 36, 29, 34, 38, 41, 47];              /* 7 日累计 256，均值 36.6 */
    var rate = [9.68, 8.33, 10.34, 8.82, 7.89, 7.32, 8.51]; /* 3/31,3/36,3/29,3/34,3/38,3/41,4/47 */

    mount('rr12-signalChart', 150, {
      backgroundColor: 'transparent',
      animationDuration: 600,
      grid: { left: 30, right: 36, top: 26, bottom: 18 },
      tooltip: (function () {
        var t = tipBase();
        t.trigger = 'axis';
        t.formatter = function (ps) {
          if (!ps || !ps.length) return '';
          var i = ps[0].dataIndex;
          return '<b>' + days[i] + '</b><br/>新增信号 ' + vol[i] + ' 条<br/>误报率 ' + rate[i].toFixed(2) + '%';
        };
        return t;
      })(),
      legend: {
        top: 0, right: 0, itemWidth: 8, itemHeight: 8, itemGap: 10,
        textStyle: { color: COLORS.muted, fontSize: 10 }, data: ['新增信号', '误报率']
      },
      xAxis: (function () { var a = axisBase(); a.data = days; return a; })(),
      yAxis: [
        {
          type: 'value', min: 0, max: 60, interval: 30,
          axisLine: { show: false }, axisTick: { show: false },
          splitLine: { lineStyle: { color: COLORS.grid } },
          axisLabel: { color: COLORS.muted, fontSize: 9 }
        },
        {
          type: 'value', min: 0, max: 12, interval: 6,
          axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
          axisLabel: { color: COLORS.muted, fontSize: 9, formatter: '{value}%' }
        }
      ],
      series: [
        {
          name: '新增信号', type: 'bar', barWidth: 16, yAxisIndex: 0,
          itemStyle: { borderRadius: [4, 4, 0, 0] },
          data: vol.map(function (v, i) {
            return {
              value: v,
              itemStyle: {
                color: i === vol.length - 1
                  ? new window.echarts.graphic.LinearGradient(0, 0, 0, 1, [
                      { offset: 0, color: 'rgba(98,230,210,.95)' },
                      { offset: 1, color: 'rgba(98,230,210,.28)' }
                    ])
                  : 'rgba(115,167,255,.42)'
              }
            };
          }),
          label: {
            show: true, position: 'top', color: '#b9cbdb', fontSize: 9.5,
            formatter: function (p) { return p.value; }
          }
        },
        {
          name: '误报率', type: 'line', yAxisIndex: 1, smooth: true,
          symbol: 'circle', symbolSize: 4.5,
          lineStyle: { color: COLORS.amber, width: 1.8 },
          itemStyle: { color: COLORS.amber, borderColor: '#07111f', borderWidth: 1.5 },
          data: rate
        }
      ]
    });
  }

  /* ==========================================================================
     r1 · 模块 2：七维分维度环比 —— 24h 前 → 当前 上升区间 + 6h 前 / 当前 落点
     ========================================================================== */
  function chartDim() {
    var dims = [
      { name: '事件热度', v24: 0.33, v6: 0.64, now: 0.78, lv: '极高' },
      { name: '传播速度', v24: 0.28, v6: 0.56, now: 0.66, lv: '高' },
      { name: '负面情感强度', v24: 0.20, v6: 0.55, now: 0.71, lv: '极高' },
      { name: '群体对立', v24: 0.31, v6: 0.68, now: 0.74, lv: '极高' },
      { name: '关键节点活跃度', v24: 0.26, v6: 0.55, now: 0.62, lv: '高' },
      { name: '议题敏感度', v24: 0.42, v6: 0.79, now: 0.80, lv: '极高' },
      { name: '跨平台扩散', v24: 0.23, v6: 0.50, now: 0.58, lv: '高' }
    ];
    var shortName = { '事件热度': '热度', '传播速度': '速度', '负面情感强度': '负面', '群体对立': '对立', '关键节点活跃度': '节点', '议题敏感度': '敏感', '跨平台扩散': '扩散' };
    var order = dims.slice().reverse();   /* 类目轴自下而上，反转后热度在最上 */
    var cats = order.map(function (d) { return shortName[d.name] || d.name; });

    mount('rr12-dimChart', 268, {
      backgroundColor: 'transparent',
      animationDuration: 600,
      grid: { left: 52, right: 48, top: 34, bottom: 24 },
      tooltip: (function () {
        var t = tipBase();
        t.trigger = 'axis';
        t.axisPointer = { type: 'shadow', shadowStyle: { color: 'rgba(29,56,83,.22)' } };
        t.formatter = function (ps) {
          if (!ps || !ps.length) return '';
          var d = order[ps[0].dataIndex];
          if (!d) return '';
          return '<b>' + d.name + '</b><br/>'
            + '24h 前 ' + d.v24.toFixed(2) + '<br/>'
            + '6h 前 ' + d.v6.toFixed(2) + '（Δ +' + (d.v6 - d.v24).toFixed(2) + '）<br/>'
            + '当前 ' + d.now.toFixed(2) + '（Δ +' + (d.now - d.v6).toFixed(2) + '）· ' + d.lv;
        };
        return t;
      })(),
      legend: {
        top: 0, left: 0, itemWidth: 8, itemHeight: 8, itemGap: 10,
        textStyle: { color: COLORS.muted, fontSize: 10 },
        data: ['24h→当前 区间', '6h 前', '当前']
      },
      xAxis: {
        type: 'value', min: 0.15, max: 0.9, interval: 0.15,
        axisLine: { show: false }, axisTick: { show: false },
        splitLine: { lineStyle: { color: COLORS.grid } },
        axisLabel: { color: COLORS.muted, fontSize: 9, formatter: function (v) { return v.toFixed(2); } }
      },
      yAxis: {
        type: 'category', data: cats,
        axisLine: { lineStyle: { color: COLORS.line } }, axisTick: { show: false },
        axisLabel: { color: '#b9cbdb', fontSize: 10.5 }
      },
      series: [
        {
          name: '_base', type: 'bar', stack: 'rr12range', barWidth: 7, silent: true,
          itemStyle: { color: 'transparent' },
          data: order.map(function (d) { return d.v24; }),
          tooltip: { show: false }
        },
        {
          name: '24h→当前 区间', type: 'bar', stack: 'rr12range', barWidth: 7,
          itemStyle: {
            borderRadius: 4,
            color: new window.echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: 'rgba(115,167,255,.45)' },
              { offset: 1, color: 'rgba(246,198,107,.62)' }
            ])
          },
          data: order.map(function (d) { return +(d.now - d.v24).toFixed(2); }),
          label: {
            show: true, position: 'right', distance: 14, color: '#cfe3ef', fontSize: 9.5,
            formatter: function (p) { var d = order[p.dataIndex]; return d ? d.now.toFixed(2) : ''; }
          },
          markLine: {
            silent: true, symbol: 'none',
            label: { show: false },
            data: [{
              xAxis: 0.70,
              lineStyle: { color: 'rgba(246,198,107,.5)', type: 'dashed', width: 1 }
            }]
          }
        },
        {
          name: '6h 前', type: 'scatter', symbol: 'circle', symbolSize: 6.5,
          itemStyle: { color: COLORS.blue, borderColor: '#07111f', borderWidth: 1.5 },
          data: order.map(function (d, i) { return [d.v6, i]; }),
          z: 5
        },
        {
          name: '当前', type: 'scatter', symbol: 'circle', symbolSize: 9,
          itemStyle: { borderColor: '#07111f', borderWidth: 1.8 },
          data: order.map(function (d, i) {
            return { value: [d.now, i], itemStyle: { color: LV_COLOR[d.lv] || COLORS.blue } };
          }),
          z: 6
        }
      ]
    });
  }

  /* ==========================================================================
     r2 · 模块 2：阈值敏感性 —— 四级阈值同步平移 ±0.04，6,989 条重算
     ========================================================================== */
  function chartSens() {
    var shifts = ['−0.04', '−0.02', '基准', '+0.02', '+0.04'];
    /* 三级 / 二级 / 一级 / 四级（阈值同步平移后重新定档，合计恒为 6,989） */
    var l1 = [979, 839, 699, 559, 419];
    var l2 = [1807, 1777, 1747, 1717, 1687];
    var l3 = [1997, 2047, 2097, 2147, 2197];
    var l4 = [2206, 2326, 2446, 2566, 2686];
    var TOTAL = 6989;
    function pct(v) { return (v / TOTAL * 100).toFixed(2) + '%'; }

    var seriesDef = [
      { name: '一级', data: l1, color: COLORS.red },
      { name: '二级', data: l2, color: COLORS.amber },
      { name: '三级', data: l3, color: COLORS.blue },
      { name: '四级', data: l4, color: '#4d6b85' }
    ];

    mount('rr12-sensChart', 236, {
      backgroundColor: 'transparent',
      animationDuration: 600,
      grid: { left: 48, right: 10, top: 30, bottom: 24 },
      tooltip: (function () {
        var t = tipBase();
        t.trigger = 'axis';
        t.axisPointer = { type: 'shadow', shadowStyle: { color: 'rgba(29,56,83,.22)' } };
        t.formatter = function (ps) {
          if (!ps || !ps.length) return '';
          var i = ps[0].dataIndex;
          return '<b>阈值偏移 ' + shifts[i] + '</b>'
            + '<br/>一级 ' + l1[i] + ' 条 · ' + pct(l1[i])
            + '<br/>二级 ' + l2[i] + ' 条 · ' + pct(l2[i])
            + '<br/>三级 ' + l3[i] + ' 条 · ' + pct(l3[i])
            + '<br/>四级 ' + l4[i] + ' 条 · ' + pct(l4[i])
            + '<br/>本事件 0.740 → 二级';
        };
        return t;
      })(),
      legend: {
        top: 0, right: 0, itemWidth: 8, itemHeight: 8, itemGap: 10,
        textStyle: { color: COLORS.muted, fontSize: 10 },
        data: ['一级', '二级', '三级', '四级']
      },
      xAxis: (function () {
        var a = axisBase();
        a.data = shifts;
        a.axisLabel = {
          color: COLORS.muted, fontSize: 10,
          formatter: function (v) { return v === '基准' ? '基准' : v; }
        };
        return a;
      })(),
      yAxis: {
        type: 'value', min: 0, max: 3000, interval: 1000,
        axisLine: { show: false }, axisTick: { show: false },
        splitLine: { lineStyle: { color: COLORS.grid } },
        axisLabel: {
          color: COLORS.muted, fontSize: 9,
          formatter: function (v) { return v >= 1000 ? (v / 1000) + 'k' : v; }
        }
      },
      series: seriesDef.map(function (s, idx) {
        return {
          name: s.name, type: 'bar', barGap: '18%', barCategoryGap: '42%',
          itemStyle: { color: s.color, borderRadius: [3, 3, 0, 0] },
          data: s.data,
          label: idx === 0 ? {
            show: true, position: 'top', color: 'rgba(255,127,134,.9)', fontSize: 9,
            formatter: function (p) { return p.value; }
          } : { show: false }
        };
      })
    });
  }

  /* ==========================================================================
     入口
     ========================================================================== */
  window.__ENRICH_RISK_R12 = function () {
    if (typeof window.echarts === 'undefined' || !window.echarts) return false;

    bindResize();
    chartSignal();
    chartDim();
    chartSens();

    /* 初始渲染时 r2 可能处于 display:none，等容器可见后再校一次尺寸 */
    var fix = function () {
      registry().forEach(function (c) { try { c.resize(); } catch (e) { /* ignore */ } });
    };
    window.setTimeout(fix, 60);
    window.setTimeout(fix, 260);

    return true;
  };
})();

/* ============================================================================
   风险预警与干预 · r3 干预方案 / r4 效果评估 / r5 报告预览 扩充脚本
   window.__ENRICH_RISK_R345()  —— 在 risk-r345.html 注入到 #r3 / #r4 / #r5 之后调用一次
   约束：
     · echarts 未定义直接 return；
     · 新 id 统一 rr345- 前缀；
     · 图表容器显式高度（HTML 内联 + 本脚本兜底）；
     · 可重复调用：已销毁的实例会清理，隐藏面板内的图表等可见后再初始化；
     · 图表与原型交互均不依赖 initRisk() 内部变量。
   口径（与页面既有数据一致）：
     · 事件 E-2f7c9a · 综合分值 0.74 = 七维加权 0.705 + 联动修正 0.035；
     · T-01 收益 0.72、极化回落 −0.084、情感 +6.8%、传播 −11.4%；
     · 延迟 6 小时极化多回 0.031、强度「中→强」极化收窄 0.023（与 r4 结论同源）；
     · 蒙特卡洛 20 组参数 × 500 次 = 10,000 次；处理组 / 对照组各 10,000 次；
     · 效果类数值均为推演环境仿真，未经真实业务检验。
   ============================================================================ */
window.__ENRICH_RISK_R345 = function () {
  'use strict';

  if (typeof echarts === 'undefined' || !echarts || !echarts.init) return;

  var doc = document;
  var COLORS = {
    cyan: '#62e6d2', blue: '#73a7ff', amber: '#f6c66b', red: '#ff7f86',
    muted: '#8fa7ba', line: '#1d3853', grid: '#14283d', text: '#e9f2fa'
  };

  /* ---------- 图表实例注册：只维护本模块实例，resize 只绑一次 ---------- */
  function registry() {
    if (!window.__RR345_CHARTS) window.__RR345_CHARTS = [];
    return window.__RR345_CHARTS;
  }
  function pruneCharts() {
    var reg = registry();
    for (var i = reg.length - 1; i >= 0; i--) {
      try {
        if (!doc.body.contains(reg[i].getDom())) { reg[i].dispose(); reg.splice(i, 1); }
      } catch (e) {
        reg.splice(i, 1);
      }
    }
  }
  function bindResize() {
    if (window.__RR345_RESIZE_BOUND) return;
    window.__RR345_RESIZE_BOUND = true;
    window.addEventListener('resize', function () {
      registry().forEach(function (c) { try { c.resize(); } catch (e) { /* 已销毁 */ } });
    });
    /* 子标签切换后补一次 resize（面板 display 变化不会触发 window.resize） */
    var tabs = doc.querySelectorAll('#riskTabs .tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        setTimeout(function () {
          registry().forEach(function (c) { try { c.resize(); } catch (e) { /* 已销毁 */ } });
        }, 80);
      });
    }
  }
  function ensureChart(el) {
    var chart = null;
    try {
      chart = echarts.getInstanceByDom(el) || echarts.init(el);
    } catch (e) {
      console.error('[rr345] 图表初始化失败', e);
      return null;
    }
    var reg = registry();
    if (reg.indexOf(chart) < 0) reg.push(chart);
    return chart;
  }

  /* 隐藏面板里的容器宽度为 0，等面板可见后再 init，避免出现空白图 */
  function initChart(id, height, build) {
    var el = doc.getElementById(id);
    if (!el) return null;
    el.style.height = height + 'px';          /* 显式高度兜底 */
    if (el.clientWidth > 0) {
      var c = ensureChart(el);
      if (c && typeof build === 'function') build(c);
      return c;
    }
    if (typeof ResizeObserver !== 'undefined') {
      var ro = new ResizeObserver(function () {
        if (el.clientWidth > 0) {
          ro.disconnect();
          var chart = ensureChart(el);
          if (chart && typeof build === 'function') build(chart);
        }
      });
      ro.observe(el);
    } else {
      setTimeout(function () {
        var chart = ensureChart(el);
        if (chart && typeof build === 'function') build(chart);
      }, 300);
    }
    return null;
  }

  /* ======================================================================
     R3-B · 可配置干预策略模板原型 T-01-P
     ====================================================================== */
  var COEF = {
    stg: {
      weak:   { g: -0.045, p: 0.012 },   /* 强度偏弱：收益不足，极化回落实效变小 */
      mid:    { g: 0, p: 0 },
      strong: { g: -0.038, p: 0.023 }    /* 强度过强：逆反回吐，极化收窄 0.023 */
    },
    cov: {
      c3:  { g: -0.024, p: 0.009 },
      c5:  { g: 0, p: 0 },
      c8:  { g: 0.010, p: -0.003 },
      c12: { g: 0.016, p: -0.005 }       /* 边际递减：+0.006 */
    },
    tim: {
      t0: { g: 0, p: 0 },
      t2: { g: -0.030, p: 0.010 },
      t4: { g: -0.060, p: 0.021 },
      t6: { g: -0.089, p: 0.031 }        /* 延迟 6 小时：极化收窄 0.031 */
    },
    ch: {
      off:   { g: 0, p: 0 },
      media: { g: 0.006, p: -0.002 },
      dual:  { g: 0.011, p: -0.004 }
    }
  };
  var BASE = { gain: 0.720, pol: -0.084 };
  var state = { stg: 'mid', cov: 'c5', tim: 't0', ch: 'off' };
  var sensChart = null;

  function fmt3(v) { return (v < 0 ? '−' : '') + Math.abs(v).toFixed(3); }
  function fmtSigned(v) { return (v < 0 ? '− ' : '+ ') + Math.abs(v).toFixed(3); }

  function calc() {
    var gain = BASE.gain + COEF.stg[state.stg].g + COEF.cov[state.cov].g
      + COEF.tim[state.tim].g + COEF.ch[state.ch].g;
    var pol = BASE.pol + COEF.stg[state.stg].p + COEF.cov[state.cov].p
      + COEF.tim[state.tim].p + COEF.ch[state.ch].p;
    gain = Math.round(gain * 1000) / 1000;
    pol = Math.round(pol * 1000) / 1000;

    var risk = '低', riskDesc = '强度 · 时机组合正常', riskColor = COLORS.cyan;
    if (state.stg === 'strong' && (state.tim === 't4' || state.tim === 't6')) {
      risk = '高'; riskDesc = '强强度 + 延迟发布'; riskColor = COLORS.red;
    } else if (state.stg === 'strong') {
      risk = '中'; riskDesc = '强度「强」触发逆反回吐'; riskColor = COLORS.amber;
    } else if (state.tim === 't6') {
      risk = '中'; riskDesc = '延迟至 T+6h，收益折损'; riskColor = COLORS.amber;
    } else if (state.cov === 'c12') {
      risk = '中'; riskDesc = '覆盖 12 节点，边际递减'; riskColor = COLORS.amber;
    }

    var comp = '通过', compDesc = '5 项检查 4 通过', compColor = COLORS.cyan;
    if (state.stg === 'strong') {
      comp = '附条件'; compDesc = '强强度需双人复核'; compColor = COLORS.amber;
    } else if (state.ch === 'dual') {
      comp = '附条件'; compDesc = '跨平台发布需媒体报备'; compColor = COLORS.amber;
    }

    var gainEl = doc.getElementById('rr345-gain');
    if (gainEl) gainEl.textContent = fmt3(gain).replace('−', '−');
    var polEl = doc.getElementById('rr345-pol');
    if (polEl) polEl.textContent = fmt3(pol);
    var riskEl = doc.getElementById('rr345-risk');
    if (riskEl) { riskEl.textContent = risk; riskEl.style.color = riskColor; }
    var riskD = doc.getElementById('rr345-riskd');
    if (riskD) riskD.textContent = riskDesc;
    var compEl = doc.getElementById('rr345-comp');
    if (compEl) { compEl.textContent = comp; compEl.style.color = compColor; }
    var compD = doc.getElementById('rr345-compd');
    if (compD) compD.textContent = compDesc;

    var calcEl = doc.getElementById('rr345-calc');
    if (calcEl) {
      calcEl.innerHTML = '收益 = 0.720（T-01 基线） ' + fmtSigned(COEF.stg[state.stg].g) + '（强度） '
        + fmtSigned(COEF.cov[state.cov].g) + '（覆盖） ' + fmtSigned(COEF.tim[state.tim].g)
        + '（时机） ' + fmtSigned(COEF.ch[state.ch].g) + '（渠道） = <b>' + fmt3(gain) + '</b>'
        + '<br>极化回落 = −0.084 ' + fmtSigned(COEF.stg[state.stg].p) + '（强度） '
        + fmtSigned(COEF.cov[state.cov].p) + '（覆盖） ' + fmtSigned(COEF.tim[state.tim].p)
        + '（时机） ' + fmtSigned(COEF.ch[state.ch].p) + '（渠道） = <b>' + fmt3(pol) + '</b>';
    }

    if (sensChart) {
      var idx = { t0: 0, t2: 1, t4: 2, t6: 3 }[state.tim];
      try {
        sensChart.setOption({
          series: [{
            id: 'rr345-cur', name: '当前配置', type: 'scatter', symbolSize: 11,
            data: [[idx, gain]],
            itemStyle: { color: '#ffffff', borderColor: COLORS.cyan, borderWidth: 2 },
            label: {
              show: true, position: 'top', color: COLORS.text, fontSize: 9.5,
              formatter: function () { return gain.toFixed(3); }
            }
          }]
        });
      } catch (e) { /* 图表已销毁 */ }
    }
  }

  function markGroup(boxId, key) {
    var box = doc.getElementById(boxId);
    if (!box) return;
    var opts = box.querySelectorAll('.rr345-opt');
    for (var i = 0; i < opts.length; i++) {
      opts[i].classList.toggle('on', opts[i].getAttribute('data-v') === state[key]);
    }
  }
  function bindGroup(boxId, key) {
    var box = doc.getElementById(boxId);
    if (!box) return;
    var opts = box.querySelectorAll('.rr345-opt');
    for (var i = 0; i < opts.length; i++) {
      (function (opt) {
        opt.onclick = function () {
          state[key] = opt.getAttribute('data-v');
          markGroup(boxId, key);
          calc();
        };
      })(opts[i]);
    }
  }

  if (doc.getElementById('rr345-cfg')) {
    bindGroup('rr345-stg', 'stg');
    bindGroup('rr345-cov', 'cov');
    bindGroup('rr345-tim', 'tim');
    bindGroup('rr345-ch', 'ch');
    var resetBtn = doc.getElementById('rr345-reset');
    if (resetBtn) {
      resetBtn.onclick = function () {
        state = { stg: 'mid', cov: 'c5', tim: 't0', ch: 'off' };
        markGroup('rr345-stg', 'stg');
        markGroup('rr345-cov', 'cov');
        markGroup('rr345-tim', 'tim');
        markGroup('rr345-ch', 'ch');
        calc();
      };
    }
    sensChart = initChart('rr345-sens', 252, function (c) {
      var ti = function (p) { return p; };
      c.setOption({
        backgroundColor: 'transparent',
        grid: { left: 44, right: 16, top: 30, bottom: 24 },
        tooltip: {
          trigger: 'axis',
          backgroundColor: '#0d1c2e', borderColor: COLORS.line,
          textStyle: { color: COLORS.text, fontSize: 11 },
          valueFormatter: function (v) { return typeof v === 'number' ? v.toFixed(3) : v; }
        },
        legend: {
          top: 0, right: 0, itemWidth: 9, itemHeight: 8, itemGap: 10,
          textStyle: { color: COLORS.muted, fontSize: 10 }
        },
        xAxis: {
          type: 'category', data: ['T+0', 'T+2h', 'T+4h', 'T+6h'],
          axisTick: { show: false }, axisLine: { lineStyle: { color: COLORS.line } },
          axisLabel: { color: COLORS.muted, fontSize: 10 }
        },
        yAxis: {
          type: 'value', min: 0.55, max: 0.75, interval: 0.05,
          splitLine: { lineStyle: { color: COLORS.grid } },
          axisLabel: {
            color: COLORS.muted, fontSize: 9.5,
            formatter: function (v) { return Number(v).toFixed(2); }
          }
        },
        series: [
          {
            name: '弱强度', type: 'line', smooth: true, symbolSize: 5,
            data: [0.675, 0.645, 0.615, 0.586],
            lineStyle: { color: COLORS.blue, width: 1.8 }, itemStyle: { color: COLORS.blue }
          },
          {
            name: '中强度', type: 'line', smooth: true, symbolSize: 5,
            data: [0.720, 0.690, 0.660, 0.631],
            lineStyle: { color: COLORS.cyan, width: 2.4 }, itemStyle: { color: COLORS.cyan },
            markLine: {
              silent: true, symbol: 'none',
              lineStyle: { color: '#62e6d255', type: 'dashed' },
              label: { formatter: 'T-01 基线 0.72', color: COLORS.cyan, fontSize: 9, position: 'insideEndTop' },
              data: [{ yAxis: 0.72 }]
            }
          },
          {
            name: '强强度', type: 'line', smooth: true, symbolSize: 5,
            data: [0.682, 0.652, 0.622, 0.593],
            lineStyle: { color: COLORS.amber, width: 1.8 }, itemStyle: { color: COLORS.amber }
          },
          {
            id: 'rr345-cur', name: '当前配置', type: 'scatter', symbolSize: 11,
            data: [[0, 0.720]],
            itemStyle: { color: '#ffffff', borderColor: COLORS.cyan, borderWidth: 2 },
            label: {
              show: true, position: 'top', color: COLORS.text, fontSize: 9.5,
              formatter: function () { return '0.720'; }
            },
            z: 5
          }
        ]
      }, true);
      sensChart = c;
      calc();
    });
    calc();
  }

  /* ======================================================================
     R4-B · 效应量 95% CI（横向区间条）
     ====================================================================== */
  var FOREST = [
    { n: '转发量', d: 0.33, lo: 0.21, hi: 0.45 },
    { n: '负面占比', d: 0.41, lo: 0.29, hi: 0.53 },
    { n: '对立指数', d: 0.38, lo: 0.26, hi: 0.50 },
    { n: '极化指数', d: 0.46, lo: 0.34, hi: 0.58 },
    { n: '合并效应', d: 0.40, lo: 0.34, hi: 0.46 }
  ];
  initChart('rr345-forest', 250, function (c) {
    c.setOption({
      backgroundColor: 'transparent',
      grid: { left: 66, right: 30, top: 26, bottom: 28 },
      tooltip: {
        trigger: 'item', backgroundColor: '#0d1c2e', borderColor: COLORS.line,
        textStyle: { color: COLORS.text, fontSize: 11 },
        formatter: function (p) {
          var r = FOREST[p.dataIndex];
          if (!r) return '';
          return r.n + '：d = ' + r.d.toFixed(2) + '<br/>95% CI：' + r.lo.toFixed(2) + '–' + r.hi.toFixed(2);
        }
      },
      xAxis: {
        type: 'value', min: 0, max: 0.65, splitNumber: 5,
        axisLine: { show: false }, axisTick: { show: false },
        splitLine: { lineStyle: { color: COLORS.grid } },
        axisLabel: { color: COLORS.muted, fontSize: 9.5, formatter: function (v) { return Number(v).toFixed(1); } }
      },
      yAxis: {
        type: 'category', data: FOREST.map(function (r) { return r.n; }),
        axisLine: { lineStyle: { color: COLORS.line } }, axisTick: { show: false },
        axisLabel: { color: '#b9cbdb', fontSize: 10.5 }
      },
      series: [
        {
          name: '下界', type: 'bar', stack: 'ci', silent: true, barWidth: 12,
          itemStyle: { color: 'transparent' },
          data: FOREST.map(function (r) { return r.lo; })
        },
        {
          name: '95% 区间', type: 'bar', stack: 'ci', barWidth: 12,
          itemStyle: { color: 'rgba(98,230,210,.38)', borderRadius: 6 },
          data: FOREST.map(function (r) { return Number((r.hi - r.lo).toFixed(2)); }),
          label: {
            show: true, position: 'right', color: COLORS.muted, fontSize: 9.5,
            backgroundColor: '#0b192a', padding: [2, 4], borderRadius: 3,
            formatter: function (p) {
              var r = FOREST[p.dataIndex];
              return r.lo.toFixed(2) + '–' + r.hi.toFixed(2);
            }
          }
        },
        {
          name: 'd', type: 'scatter', symbolSize: 8, z: 4,
          data: FOREST.map(function (r, i) { return { value: [r.d, i], itemStyle: { color: COLORS.amber } }; }),
          markLine: {
            silent: true, symbol: 'none',
            lineStyle: { color: '#f6c66b44', type: 'dashed' },
            label: { show: false },
            data: [{ xAxis: 0.2 }, { xAxis: 0.5 }]
          }
        }
      ]
    }, true);
  });

  /* ======================================================================
     R4-C · 效果衰减曲线 0–72h
     ====================================================================== */
  var DECAY = [
    { name: 'T-01', color: COLORS.cyan, width: 2.4, data: [0, -0.041, -0.072, -0.084, -0.079, -0.061, -0.047, -0.038] },
    { name: 'T-02', color: COLORS.blue, width: 1.8, data: [0, -0.030, -0.051, -0.061, -0.056, -0.043, -0.032, -0.024] },
    { name: 'T-03', color: COLORS.amber, width: 1.8, data: [0, -0.024, -0.039, -0.047, -0.042, -0.031, -0.023, -0.017] },
    { name: 'T-04', color: '#8fa7ba', width: 1.6, data: [0, -0.016, -0.027, -0.032, -0.028, -0.020, -0.014, -0.010] },
    { name: 'T-01+T-02', color: '#e9f2fa', width: 2.6, data: [0, -0.048, -0.082, -0.095, -0.098, -0.089, -0.076, -0.062] }
  ];
  initChart('rr345-decay', 288, function (c) {
    c.setOption({
      backgroundColor: 'transparent',
      grid: { left: 46, right: 16, top: 34, bottom: 26 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#0d1c2e', borderColor: COLORS.line,
        textStyle: { color: COLORS.text, fontSize: 11 },
        formatter: function (arr) {
          if (!arr || !arr.length) return '';
          var s = arr[0].axisValue + 'h';
          for (var i = 0; i < arr.length; i++) {
            var v = arr[i].value;
            s += '<br/>' + arr[i].marker + arr[i].seriesName + '：'
              + (typeof v === 'number' ? (v < 0 ? '−' : '') + Math.abs(v).toFixed(3) : '—');
          }
          return s;
        }
      },
      legend: {
        top: 0, left: 0, itemWidth: 12, itemHeight: 3, itemGap: 12,
        textStyle: { color: COLORS.muted, fontSize: 10 }
      },
      xAxis: {
        type: 'category', data: ['0', '6', '12', '24', '36', '48', '60', '72'],
        axisTick: { show: false }, axisLine: { lineStyle: { color: COLORS.line } },
        axisLabel: { color: COLORS.muted, fontSize: 10 }
      },
      yAxis: {
        type: 'value', min: -0.12, max: 0, interval: 0.03,
        splitLine: { lineStyle: { color: COLORS.grid } },
        axisLabel: {
          color: COLORS.muted, fontSize: 9.5,
          formatter: function (v) { return Number(v).toFixed(2); }
        }
      },
      series: DECAY.map(function (d) {
        return {
          name: d.name, type: 'line', smooth: true, symbolSize: 4,
          data: d.data,
          lineStyle: { color: d.color, width: d.width },
          itemStyle: { color: d.color }
        };
      })
    }, true);
  });

  /* ======================================================================
     R5-B · 生成 / 审批流转耗时构成
     ====================================================================== */
  var TIMING = [
    { n: '系统生成', v: 42, color: COLORS.cyan },
    { n: '自动校验', v: 8, color: COLORS.cyan },
    { n: '等待复核', v: 80, color: '#5c7489' },
    { n: '人工复核', v: 384, color: COLORS.amber },
    { n: '合规审查', v: 108, color: COLORS.amber },
    { n: '签发', v: 52, color: COLORS.blue },
    { n: '报送', v: 46, color: COLORS.blue }
  ];
  initChart('rr345-timing', 172, function (c) {
    c.setOption({
      backgroundColor: 'transparent',
      grid: { left: 72, right: 48, top: 8, bottom: 18 },
      tooltip: {
        trigger: 'item', backgroundColor: '#0d1c2e', borderColor: COLORS.line,
        textStyle: { color: COLORS.text, fontSize: 11 },
        formatter: function (p) { return p.name + '：' + p.value + ' s'; }
      },
      xAxis: {
        type: 'value', max: 400, splitNumber: 2,
        axisLine: { show: false }, axisTick: { show: false },
        splitLine: { lineStyle: { color: COLORS.grid } },
        axisLabel: { color: COLORS.muted, fontSize: 9, formatter: function (v) { return v + 's'; } }
      },
      yAxis: {
        type: 'category', inverse: true, data: TIMING.map(function (t) { return t.n; }),
        axisLine: { lineStyle: { color: COLORS.line } }, axisTick: { show: false },
        axisLabel: { color: '#b9cbdb', fontSize: 10 }
      },
      series: [{
        type: 'bar', barWidth: 9,
        data: TIMING.map(function (t) {
          return { value: t.v, itemStyle: { color: t.color, borderRadius: [0, 4, 4, 0] } };
        }),
        label: {
          show: true, position: 'right', color: COLORS.muted, fontSize: 9.5,
          formatter: function (p) { return p.value + ' s'; }
        }
      }]
    }, true);
  });

  /* ---------- 收尾：清理旧实例 / 绑定 resize ---------- */
  pruneCharts();
  bindResize();
};

