# 业务规格索引

实现功能前必须打开对应规格；跨模块链路需同时阅读所有相关规格。

| 领域 | 规格 | 当前原型优先级 |
|---|---|---|
| 首页 | [dashboard.md](dashboard.md) | P0 |
| 订单 | [orders.md](orders.md) | P0 |
| 商品 | [products.md](products.md) | P0 |
| 采购 | [procurement.md](procurement.md) | P1 |
| 库存 | [inventory.md](inventory.md) | P0 |
| 客户 | [customers.md](customers.md) | P0 |
| 资金 | [finance.md](finance.md) | P0 |
| 设置 | [settings.md](settings.md) | P1 |

## 阅读规则

- “页面范围”说明需要呈现什么，“业务规则”决定允许发生什么，“验收”决定何时完成。
- 字段级实现以原始需求文档为上游；本规格没有列出的字段不得凭竞品补造为强制规则。
- 状态流转、金额、库存、权限和跨单据关系发生变化时，必须在对应规则 ID 下补充说明和测试。
- 商家模块与独立数据分析模块暂不建立规格，状态见 `feature_list.json`。
