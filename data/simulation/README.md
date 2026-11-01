# 模拟测试数据

仅供功能验收，不代表真实机构行为。平台统一 test；记录 ID 以 sim- 开头。

source/ 保存源 CSV；news.js、clue.js、social.js 保存列表；details/ 保存完整字段。真实快照仍在上一级 data/ 与 data/details/，从不覆盖。

使用 build_simulation.py 可按当天重新生成 30,000 条；打开网页“带模拟数据”开关后加载。日期基准见 meta.js，不自动伪装为实时数据。附件使用 example.invalid 测试地址，不能作为可访问证据。
