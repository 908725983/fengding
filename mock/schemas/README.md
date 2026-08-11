# Mock schemas

业务功能达到 ready 后，先为请求、响应和 fixture 增加可执行 schema，再增加数据。所有金额为整数分，日期为 ISO 8601，数量必须有单位，引用 ID 必须可解析。

`mock/fixtures/baseline.json` 的业务数据统一放在 `featureData.<功能ID>` 下；功能 ID 必须来自产品规格索引且字段准备度为 ready。禁止提前放入“以后可能会用”的字段，也禁止把示例值当成业务默认值。

每类业务实体只能有一个拥有者切片：例如客户主数据由 `CUS-001` 保存，后续商机、订单或应收只保存 `customerId` 引用，不复制第二份客户名称、状态或额度作为可变事实。新增引用时 schema 必须验证目标 ID 存在；跨切片展示通过拥有者 repository/provider 读取，避免不同 fixture 各说一套。
