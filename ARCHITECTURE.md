# 系统架构

本文件是系统地图，只说明稳定边界和依赖方向；产品行为在 `docs/product-specs/`，设计理由在 `docs/design-docs/`。

## 系统形态

- 产品：蜂订全渠道营销系统 PC 管理后台原型。
- 前端：Vue 3 单页应用。
- 数据：浏览器内应用级共享 Mock Runtime、固定 fixture 与可切换场景；当前无真实后端和数据库。
- 领域：首页、订单、商品、采购、库存、客户、资金、设置。
- 原型目标：验证信息架构、页面交互和关键业务闭环，不证明生产安全、性能或第三方可用性。

## 领域地图

| 领域 | 职责 | 产品规格 | 代码入口 |
|---|---|---|---|
| Dashboard | 待办、经营概览、预警、公告 | `docs/product-specs/dashboard.md` | `src/features/dashboard/` |
| Order | 订单、退单、差异、销售出库、统计 | `docs/product-specs/orders.md` | `src/features/orders/` |
| Product | 商品、SKU、价格、授权、铺货、模板 | `docs/product-specs/products.md` | `src/features/products/` |
| Procurement | 补货、采购、退采、供应商、统计 | `docs/product-specs/procurement.md` | `src/features/procurement/` |
| Inventory | 仓库、库存、出入库、盘点、分拣配送 | `docs/product-specs/inventory.md` | `src/features/inventory/` |
| Customer | 客户、商机、外勤、营销、商城 | `docs/product-specs/customers.md` | `src/features/customers/` |
| Finance | 应收应付、收付款、核销、账户、统计 | `docs/product-specs/finance.md` | `src/features/finance/` |
| Settings | 公司、组织、角色权限、员工、日志 | `docs/product-specs/settings.md` | `src/features/settings/` |

“商家”和独立“数据分析”只有总览名称，没有独立详细需求；在规格补齐前不得自行扩写成完整领域。

## 固定分层

```text
Types -> Config -> Repository -> Service -> Runtime(Store/Composable) -> UI(View/Component)
```

- Types：领域类型、状态枚举、输入输出契约。
- Config：权限点、导航、静态配置与功能开关。
- Repository：数据访问接口；原型实现连接 Mock，未来可替换真实 API。
- Service：业务规则、计算、状态流转与跨实体协调。
- Runtime：页面运行状态与异步流程。
- UI：只负责交互和展示，通过 Runtime/Service 使用数据。

## 硬性依赖规则

- 低层不得反向依赖高层；`shared/` 不包含具体业务规则。
- UI 不得直接导入 fixture、访问浏览器存储或自行实现业务状态机。
- 跨领域调用只通过对方 `public.ts` 暴露的稳定 service/provider；不得访问其他领域的 store、view 或内部 repository。
- 需要形成业务闭环的领域必须连接同一个应用级 Mock Runtime；业务 Store 不得各自复制 fixture 或创建互不相通的领域会话来冒充跨域集成。
- 金额内部统一使用“分”，数量显式携带单位；换算经过商品单位规则。
- 数据变化必须通过 repository；测试通过注入 clock、ID 和场景保持确定性。
- 新领域、外部依赖、跨领域状态流转或分层例外，必须先进入 active plan 与设计文档。
- 架构文档不得补造业务事实；需求未定义的状态、字段、默认值和跨域时点以产品规格中的人工决策门为准。

## 横切接口

- Mock：`mock/fixtures/` 只保存可重置基准，`mock/scenarios/` 表达共享的 normal/empty/error/slow/permission-denied 基础能力，`mock/handlers/` 暴露接口，`mock/schemas/` 校验契约；应用启动时由唯一组合根创建共享 Runtime 和各领域 Repository，Store 只消费已注入的公开能力。场景/角色切换是应用壳的开发能力，业务页面不各自复制控制条。
- 外部能力：导入导出、打印、消息、支付、地图、企微、AI 默认走 fake adapter，并在界面标明“原型模拟”。
- 权限：原型通过路由、UI 与 service command 三层模拟；它不是生产安全边界。
- 可观测性：异步失败必须形成可理解的页面错误；调试和黄金旅程入口见 `docs/RELIABILITY.md`。

## 关键链路与热点

```text
客户 + 商品/价格/授权 -> 订单 -> 审核 -> 出库可用量校验与扣减 -> 发货 -> [待决策时点]应收 -> 收款/核销
库存预警/订单需求 -> 补货建议 -> 采购订单 -> 采购入库 -> [待决策时点]应付 -> 付款/核销
```

原始需求没有订单库存预占规则，也没有明确应收/应付形成时点；这些能力在产品决策完成前不得因架构图而被实现。

高风险热点：金额精度、库存原子性、状态回退、权限范围、删除与作废语义、跨单据追溯。修改这些区域必须同时更新产品规格、规则测试和 active plan 验证路径。

## Mock 运行态与跨模块所有权

- `baseline.json` 相同只说明重置来源相同，不证明运行中的数据共享；“共用 baseline”和“共用 Runtime”必须分别验收。
- 应用内同一次业务旅程只能有一份客户、商品、库存、订单、采购和资金运行状态。页面路由切换不得重新克隆领域 fixture；场景切换和显式 Mock reset 才能按契约重建状态。
- 跨领域写入由主领域 Service 经对方 `public.ts` command 协调；成功后所有消费方读取同一事实，失败时相关 Repository 一起回滚。
- 领域 Store 可以维护加载、筛选和弹窗等页面状态，但不得拥有另一套 canonical 业务数据，也不得在 Store 内直接 `create*MockSession()`。
- 原型是否要求浏览器刷新后保存运行状态由具体计划决定；同一 SPA 会话内跨路由共享是业务闭环验收的最低要求。
- 具体组合根位于 `mock/runtime/application-mock-runtime.ts`；`src/app/runtime/app-mock-runtime.ts` 为每个 Pinia 根实例持有唯一 controller。Store 使用稳定领域 proxy，应用级场景 reset 会一次替换 Customer、Product、Order、Inventory、Procurement、Finance 六个 canonical session，已有 Store 引用自动转向新 Runtime；新 Pinia 仍获得隔离状态供组件测试使用。

## 变更检查

- 新页面：确认所属领域、产品规格、风险等级、适用页面状态和批次验收路径；不为凑齐场景数制造无业务意义的状态。
- 新数据流：确认不绕过 Repository/Service，并能在 Mock 中稳定复现。
- 新跨领域调用：确认只依赖公开接口、使用同一共享 Runtime，且失败不会留下半完成状态。
- 新完成声明：确认是模块通过、集成通过还是阶段闭环通过；没有同一新建业务单据的关联编号和守恒证据时不得宣称闭环。
- 新第三方或真实接口：先更新 active plan、`docs/SECURITY.md` 与 `docs/RELIABILITY.md`。
