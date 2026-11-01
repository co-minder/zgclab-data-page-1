# ZGCLab 境外机构数据平台

ZGCLab 是一个基于真实交付数据的数据检索与研究工作台。前端使用 HTML、CSS 和原生 JavaScript，运行无需安装 npm 依赖。它把需求 1 的已审核交付快照按“机构 × 采集角度”组织起来，支持核验数据覆盖、检索证据、查看原文和附件、比较机构以及保存研究结果。

界面采用黑色科技风：深黑底色、石墨色面板、青蓝色高亮与等宽数字。图表、筛选控件、记录详情、工作台和手机卡片均使用统一的深色主题。

## 当前数据范围

| 采集角度 | 目标表 | 字段数 | 记录数 |
| --- | --- | ---: | ---: |
| 新闻舆情 | `t_kt_public_sentiment` | 16 | 3,675 |
| 机构官网 / 线索 | `t_kt_risk_clue_detect` | 35 | 1,468 |
| 社交媒体 | `t_kt_social_media_content` | 34 | 1,846 |

当前快照共 **6,989 条**已审核入表记录，覆盖 **20 个验证机构**。数据来源为 `20261011-current-reviewed` 交付包。

## 页面与功能

- **数据总览**：机构覆盖率、总量 KPI、三个角度分布、机构数据量排行、月度记录时间趋势、可点击的平台 / 风险 / 标签统计、最近记录。
- **机构库**：按中文名、英文名、ktid、机构类型检索；按数据量、名称或 ktid 排序；导出机构清单 CSV。
- **机构详情**：查看单个机构的三类数据，支持角度切换、多关键词检索、分页、角度内导出或机构全部数据 CSV 导出。
- **数据浏览**：默认跨角度查询，可组合机构、关键词、主题标签 / 风险等级 / 平台、来源域名 / 发布主体 / 账号、日期和排序；支持每页 14 / 25 / 50 / 100 条与页码跳转。查询参数和分页保留在 URL 中。
- **关键词语法**：空格组合多个词，可选择全部匹配或任一匹配；双引号匹配短语，如 `"climate policy"`；减号排除词，如 `OpenAI -military`。检索覆盖列表快照中的标题、摘要、正文节选、关键词和机构名称。
- **结果操作**：导出当前全部筛选结果 CSV、复制查询链接、保存查询、按 Enter 打开记录。`/` 快捷键聚焦全局搜索。
- **完整记录详情**：按需加载交付表全部原始字段、完整正文、翻译、媒体 / 附件地址和原始 JSON。可切换空字段、收藏记录、复制稳定链接、切换上一条 / 下一条、导出完整单条 CSV / JSON。Escape 关闭弹窗并恢复焦点。
- **机构对比**：同时对比最多 4 个机构的总量、三个角度数量 / 占比与覆盖；点击数字进入对应查询，支持对比链接和 CSV 导出。
- **我的工作台**：收藏记录、保存查询、常用查询入口。数据保存在当前浏览器，支持 JSON 备份导入 / 导出和收藏 CSV 导出。
- **任务与交付**：数据链路、三张表、20 个验证单位、日期 / 原文地址 / 摘要覆盖统计和交付口径。

## 在线查看

代码仓库：<https://github.com/co-minder/zgclab-1>（私有）。当前账号套餐不支持该私有仓库的 GitHub Pages，接口返回 `Your current plan does not support GitHub Pages for this repository.`。如果将来启用支持私有仓库 Pages 的套餐，发布源选择 `main` 分支根目录即可。

网页可直接由 `social` 服务器托管，长驻服务运行在 `zgclab-1-web` tmux 会话。浏览器只读取静态快照，不需要数据库或模型 API。完整复制整个站点后，在本机启动静态 HTTP 服务即可离线使用；在线访问时，没有预先加载的角度和完整详情仍需要网络。

## 本地或服务器运行

```bash
cd /home/ubuntu/zgclab-1-web
python3 serve.py --bind 127.0.0.1 --port 8788
```

访问 `http://127.0.0.1:8788/`。`serve.py` 只提供前端和 `data/*.js` 文件，支持 gzip、ETag 与版本化详情缓存，拒绝访问 `.git`、脚本和其他项目文件。服务器上使用 tmux 常驻并保存日志：

```bash
tmux new-window -d -t zgclab-1-web -n public-web \
  'cd /home/ubuntu/zgclab-1-web && python3 -u serve.py --bind 0.0.0.0 --port 8788 > /home/ubuntu/log/zgclab-web-public.log 2>&1'
```

Mac 端通过 SSH 转发：

```bash
ssh -N -L 8788:127.0.0.1:8788 social
```

然后打开 <http://127.0.0.1:8788/>。原先 8787 的开发服务也保留在 tmux 会话中。

## 更新快照

列表快照 `data/meta.js`、`data/news.js`、`data/clue.js`、`data/social.js` 和完整记录 `data/details/<version>/*.js` 都由 `build_data.py` 生成。默认读取需求 1 的交付包：

```bash
cd /home/ubuntu/zgclab-1-web
python3 build_data.py
```

也可以显式指定交付包目录：

```bash
python3 build_data.py /path/to/delivery-package
# 在其他机器构建时，也可指定机构目录 CSV
python3 build_data.py /path/to/delivery-package /path/to/institutions.csv
```

生成脚本会：

- 按三张目标表生成可供前端直接加载的 JavaScript 快照；
- 继承已有记录 ID；新增记录按机构与原文地址生成标识，避免新增数据改变旧链接；
- 列表截取正文 / 翻译节选；完整交付字段每 75 条一个详情分块，点击记录后按需载入；
- 先限制为机构目录中的单位，再生成全部统计，保证查询结果与覆盖统计一致；
- 生成总量、机构计数、时间趋势、标签、风险和平台统计；
- 在公开元数据中只写交付包名称，不写服务器绝对路径。

更新后重新加载静态服务即可。提交前建议检查：

```bash
node --check app.js
node --test tests/core.test.cjs
python3 -m py_compile build_data.py serve.py
git diff --check
# 服务器现有 Python Playwright + Google Chrome 可运行浏览器回归：
ZGCLAB_TEST_URL=http://127.0.0.1:8788/ python3 tests/smoke.py
```

## 文件结构

```text
zgclab-1-web/
├── index.html        页面外壳、导航和 favicon 引用
├── favicon.svg       ZGCLab 站点图标
├── styles.css        布局、图表、表格、筛选器和响应式样式
├── app.js            路由、检索、筛选、导出、详情和懒加载
├── core.js           查询、日期、排序和 CSV 规则
├── build_data.py     从交付包生成 data/*.js
├── serve.py          只提供站点文件的压缩 HTTP 服务
├── tests/            查询规则与浏览器回归
├── data/
│   ├── meta.js       页面统计和机构目录
│   ├── news.js       新闻舆情记录
│   ├── clue.js       官网线索记录
│   ├── social.js     社交媒体列表快照
│   └── details/      版本化的完整交付字段与正文分块
├── .nojekyll         允许 GitHub Pages 直接发布静态文件
└── README.md
```

## 交付口径

- 数据来自需求 1 已审核入表的交付快照，不是前端编造的样例。
- 当前页面只覆盖交付包内的 20 个验证单位，不代表历史全量数据。
- 主键、创建 / 修改时间、删除标记等系统字段按接收系统约定处理；本地快照使用稳定 ID 支持页面定位。
- 无法确认的采集字段保持空值，不用“未知”“无”等词替代。
- CSV 导出在浏览器本地生成，导出的内容只来自当前已加载的静态快照。
- 批量 CSV 对应列表快照，含正文节选；完整字段可从单条详情导出，表内系统字段空值保持原样。
- 时间趋势是记录时间的聚合，优先使用发布时间，缺失时使用发现 / 采集时间，不代表数据库实际入库时间。
- 收藏与保存查询不跨用户自动同步；更换浏览器 / 清理站点存储前可从工作台导出 JSON 备份。
