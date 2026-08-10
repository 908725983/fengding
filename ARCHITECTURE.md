# 系统架构

## 系统形态

- 产品：蜂订全渠道营销系统 PC 管理后台原型
- 运行面：Vue 3 应用
- 数据面：浏览器内 Mock API 与 fixture，不连接真实后端
- 主要用户：运营、销售主管、业务员、仓库人员、财务人员、系统管理员
- 产品行为真相来源：`docs/product-specs/`

## 领域地图

| 领域 | 职责 | 规格入口 | 预期代码入口 |
|---|---|---|---|
| Dashboard | 工作台、待办、经营指标、预警、公告 | `docs/product-specs/dashboard.md` | `src/features/dashboard/` |
| Order | 订单、退单、差异单、销售出库、订单统计 | `docs/product-specs/orders.md` | `src/features/orders/` |
| Product | 商品、SKU、价格、授权、铺货、模板 | `docs/product-specs/products.md` | `src/features/products/` |
| Procurement | 补货、采购、退采、供应商、采购统计 | `docs/product-specs/procurement.md` | `src/features/procurement/` |
| Inventory | 仓库、库存、出入库、盘点、分拣配送 | `docs/product-specs/inventory.md` | `src/features/inventory/` |
| Customer | 客户、商机、公海、外勤、营销、商城 | `docs/product-specs/customers.md` | `src/features/customers/` |
| Finance | 应收应付、收付款、核销、账户、统计 | `docs/product-specs/finance.md` | `src/features/finance/` |
| Settings | 公司、组织、角色权限、员工、日志 | `docs/product-specs/settings.md` | `src/features/settings/` |

商家与数据分析虽出现在总览中，但没有独立详细需求文档；除已在现有规格中明确的统计页面外，不允许自行补全它们。

## 固定依赖方向

```text
Types -> Config -> Repository -> Service -> Store/Composable -> View
```

- `Types`：领域类型、状态枚举、输入输出契约。
- `Config`：静态配置、权限点、导航、功能开关。
- `Repository`：数据访问抽象；原型实现指向 Mock，未来可替换真实 API。
- `Service`：业务规则、计算、状态流转和跨实体协调。
- `Store/Composable`：页面运行时状态和异步流程。
- `View`：路由页面与展示组件，只调用 store/composable。

## 硬性规则

- 低层不能依赖高层；`shared/` 不得包含具体业务规则。
- View 不得直接导入 `mock/fixtures`，也不得在组件中编写金额、库存或状态流转规则。
- 跨领域调用通过公开 service/provider，禁止直接访问其他领域的 store 或内部文件。
- 订单确认出库、采购确认入库等跨领域动作必须由服务协调并形成单一事务结果。
- 金额统一使用“分”为内部单位，展示层再格式化为元；禁止浮点金额计算。
- 数量使用显式单位；跨单位换算必须经商品单位规则。
- 原型中的“导出、打印、消息、支付、地图、企微”默认只模拟结果，不调用真实外部系统。

## 建议代码结构

```text
src/
├─ app/                 应用启动、路由、导航、全局 provider
├─ features/            按业务领域垂直组织
│  └─ <domain>/
│     ├─ types/
│     ├─ config/
│     ├─ repositories/
│     ├─ services/
│     ├─ stores/
│     ├─ components/
│     ├─ views/
│     └─ tests/
├─ shared/              真正跨领域的 UI、工具、类型
├─ styles/              Token、基础样式、主题
└─ main.ts

mock/
├─ fixtures/            基准数据
├─ handlers/            Mock API 处理器
├─ scenarios/           normal/empty/error/slow 等场景
└─ schemas/             Mock 契约与校验
```

## 关键跨领域链路

```text
客户 + 商品价格/授权
        ↓
      订单
        ↓
订单审核 → 库存占用 → 出库/发货 → 应收 → 收款/核销

库存预警 → 补货建议 → 采购订单 → 采购入库 → 应付 → 付款/核销
```

## 原型边界

- 浏览器刷新后默认保留 Mock 数据；`reset-mock` 可恢复确定基线。
- 权限采用前端模拟账号与权限集，仅用于页面可见性和操作可用性验证。
- 外部副作用必须使用 fake adapter，并在 UI 明确显示“原型模拟”。
- 新的领域、外部依赖或状态流转必须先在 active plan 中说明。
