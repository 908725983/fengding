# Mock handlers

业务功能实现时在此建立 repository/API handler。handler 只负责已经 ready 的字段契约和场景注入，状态流转和金额/库存规则必须留在领域 service。不得根据 fixture 反向发明产品字段；fixture 必须由 schema 和产品规格生成。跨切片读取遵守实体拥有者和 ID 引用，不在 handler 中拼出另一份可变业务事实。

`baseline.json` 是重置来源，不是每个页面各自复制的运行数据库。需要跨模块交接的 handler 必须由应用组合根装配到同一个共享 Mock Runtime；业务 Store 只能消费注入后的接口，不得自行创建独立 `create*MockSession()`。模块级测试可以创建隔离 session，但跨模块 integration 必须共用同一组 Repository，并用本次新建业务单据的关联 ID 验证交接。

当前组合入口是 `mock/runtime/application-mock-runtime.ts`，应用缓存入口是 `src/app/runtime/app-mock-runtime.ts`。Order 与 Procurement handler 的独立 session 工厂只用于领域单测和组合根构造；应用 Store 必须从 controller 注入的稳定 proxy 取 session。订单客户财务摘要、发货应收、采购应付和退货退款都以共享 Finance Repository 为唯一事实，不能再回退到独立演示汇总。

normal/empty/error/slow/permission-denied 是共享故障注入能力，不等于每个页面都必须各自实现五套 handler。业务切片按 `docs/RELIABILITY.md` 的 L1/L2/L3 选择场景；partial-failure、concurrent、unavailable 仅在对应风险真实存在时增加。场景和角色由应用壳开发入口统一控制，新增业务页面不得复制新的 ScenarioBar。
