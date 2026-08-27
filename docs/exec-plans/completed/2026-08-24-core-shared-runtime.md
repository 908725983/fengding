# 核心共享 Mock Runtime 与跨模块闭环

- 类型：integration
- 功能：不适用
- 流程：`FLOW-SALES-001`、`FLOW-PURCHASE-001`、`FLOW-RETURN-001`
- 风险等级：L3
- 当前阶段：audit
- 状态：completed
- 最近更新：2026-08-24
- 完成日期：2026-08-24

## 目标

建立应用级唯一共享 Mock Runtime，使客户、商品、订单、库存、采购和资金页面在同一次 SPA 会话及路由切换后读取同一份业务事实；从 Mock reset 后的新建源头单据出发，分别完成销售收款、采购付款和客户退货三条跨模块黄金旅程，并以关联编号、数量/金额守恒、权限及失败回滚证据判定每条 `FLOW-*` 是否通过。

## 范围与非目标

- 范围：应用 Runtime 组合根；Customer、Product、Order、Inventory、Procurement、Finance Store 的会话消费方式；订单履约、采购入库、客户退货与主数据/库存/资金既有公开 Service 的组合；三条流程的集成自动测试和代表性浏览器旅程。
- 允许 fixture 提供客户、商品、价格、授权、供应商、仓库、库位、库存批次和资金账户等主数据。
- 销售旅程不得使用预置订单、出库、应收、收款或核销；采购旅程不得使用预置采购单、入库、应付、付款或核销；退货旅程必须从本次旅程的新建并已履约销售订单创建退单。
- 不新增或修改业务字段、金额公式、状态转换、权限或跨域形成时点；这些继续以各 completed 业务计划和领域规格为准。
- 不实现真实后端、刷新持久化、支付、银行、物流或消息接口；刷新后恢复 fixture 不影响本计划对同一 SPA 会话的验收。

## 事实来源

- `ARCHITECTURE.md §固定分层、§硬性依赖规则、§横切接口、§Mock 运行态与跨模块所有权`：唯一组合根、公开接口、事实所有权和回滚约束。
- `docs/PLANS.md §integration、§验证证据`：共享 Runtime、从零单据、关联编号和守恒门禁。
- `docs/RELIABILITY.md §业务验证分级、§跨模块黄金旅程`：L3 自动/浏览器证据和禁止假通过。
- `docs/design-docs/implementation-sequence.md §跨模块流程验收状态`：三条 `FLOW-*` 的依赖、当前状态和阶段出口。
- `docs/product-specs/orders.md`：`ORD-002/003/004/005` 已确认订单、履约和退货契约。
- `docs/product-specs/inventory.md`：`INV-001` 库存余额、批次和流水契约。
- `docs/product-specs/procurement.md`：`PUR-001/002/003` 采购、入库和退采契约。
- `docs/product-specs/finance.md`：`FIN-001/002/003` 应收应付、收付款、核销和账户契约。
- `docs/references/requirements/01-整体架构与首页.md §3`、`02-订单模块.md §2～§3`、`04-采购模块.md §2～§4`、`05-库存模块.md §2～§4`、`07-资金模块.md §2～§5`：跨模块原始流程和页面来源。
- `engineering-constraint`：每个 Pinia 根实例绑定一套 Runtime，保证浏览器唯一会话且让组件测试通过新 Pinia 自动隔离；场景切换整体重建 Runtime，普通角色/路由切换不重建。

## 前置门禁

- [x] 三条流程依赖切片均有 completed 模块证据；流程状态仍为 blocked/not-run，未提前宣称闭环。
- [x] `INV-003` 已归档，active 目录原为空，本计划是唯一当前计划。
- [x] 审计复现 Order、Inventory、Procurement、Finance Store 分别调用 `create*MockSession()`，且 Order/Procurement handler 内再次复制库存和资金 Repository。
- [x] 既有产品决策已固定跨域形成时点与 owner；本计划不需要新增产品人工决策。
- [x] `npm run verify:harness` 在本计划建立后通过。

## 实现设计

1. 在 Mock 层建立应用 Runtime 组合根，一次创建 Order、Inventory、Procurement、Finance 的 canonical Repository 和 Service；Order/Procurement handler 改为支持注入共享依赖，同时保留独立 session 工厂供领域单测隔离使用。
2. 在应用 Runtime 层按 Pinia 根实例缓存 Runtime controller；业务 Store 每次动作从 controller 读取当前领域 session，不再自行克隆 fixture。场景切换调用 controller reset，一次性重建全部领域会话。
3. 跨域协调仍由主领域 Service 通过既有窄 provider 完成：订单履约调用库存并形成 Finance 应收；采购入库调用库存并形成 Finance 应付；客户退货调用库存回库并形成 Finance 贷项/退款。
4. 增加共享 Runtime 身份和快照诊断，只用于测试与 Harness 证据，不把 Repository 暴露给业务页面。

实现落点：`mock/runtime/application-mock-runtime.ts` 创建 canonical Customer/Product/Order/Inventory/Procurement/Finance session；`src/app/runtime/app-mock-runtime.ts` 按 Pinia 根实例缓存 controller，并以稳定 proxy 在场景 reset 后原子重定向全部 Store。各 handler 保留领域单测可用的独立工厂，但应用 Store（含采购补货 Store）不再自行创建 session。订单客户/商品 provider 动态读取 canonical 主数据；订单客户财务卡、发货应收、采购应付和退货退款均读取同一 Finance Service/Repository。

## 验证路径

### 自动集成

- `FLOW-SALES-001`：从新建订单开始，审核、FIFO 出库、发货形成唯一应收、创建收款并核销；记录 `订单号 → 出库单号 → 应收单号 → 收款单号 → 核销单号`，核对库存减少、账户余额增加、应收未收金额归零、请求幂等和跨域失败原子回滚。
- `FLOW-PURCHASE-001`：从新建采购单开始，审核、入库形成应付、创建付款并核销；记录 `采购单号 → 入库单号 → 应付单号 → 付款单号 → 核销单号`，核对库存增加、账户余额减少、应付未付金额归零、请求幂等和失败回滚。
- `FLOW-RETURN-001`：复用本次销售旅程新建且已发货订单，创建退单、审核、退货入库并处理对应贷项/退款；记录源订单、退单、库存流水、贷项/退款关联，核对退货数量、应收/退款金额和失败回滚。
- Store 集成：同一 Pinia 下切换 Customer/Product/Order/Finance/Inventory/Procurement Store 可见同一主数据和新建事实；新 Pinia 获得隔离 Runtime；场景 reset 清空本次运行态。

### 浏览器与收尾

- Mock reset 后启动应用，在 1280px 下走代表性销售与收款主路径，并抽查采购、退货跨路由可见；不使用预置业务单据作为主链路。
- 记录 Runtime ID、所有关联业务编号、关键前后数量/金额、UI 可见结果及控制台结果。
- 收尾运行 `npm run verify:harness`、`npm run typecheck`、专项 integration 测试、全量测试、`npm run build`、`git diff --check`、`npm run mock:reset` 和干净重启。

## 验收证据

### 自动流程与守恒

- `src/app/runtime/core-business-flows.spec.ts` 从独立新 Runtime 分别新建三条源头业务链，不读取预置上下游单据；专项为 2 文件/6 项测试通过（含 Runtime identity/reset 测试）。
- `FLOW-SALES-001`：新订单经两级审核、FIFO 出库、发货、应收、收款和核销；断言 Order/Inventory/Finance Repository identity 相同，库存减少量等于销售数量，应收 `receivedCents = amountCents`、`outstandingCents = 0`，且订单详情的客户应收等于 Finance 实时汇总。
- `FLOW-PURCHASE-001`：新采购单经审核、入库、应付、付款和核销；修正并断言 `payable.inboundId` 等于实际入库记录 ID，库存增加量等于采购基础数量，应付 `paidCents = amountCents`、`outstandingCents = 0`。
- `FLOW-RETURN-001`：测试内先新建并结清销售订单，再创建 `TH-260810-00007`，完成审核、退货入库、贷项和原路退款；库存增加量等于退货数量，贷项的 source/order/amount 与退单一致，最终 `receivingStatus=received`、`refundStatus=refunded`、`status=completed`。

### 1280px 浏览器旅程

- 销售主链：`CA-260810-00001 → XSCK-260810-00007 → YS-260810-00001 → SK-260810-00001 → HX-260810-00001`，订单金额 ¥208.74；FIFO 使用 `DEMO-BATCH-0720` 8 件和 `DEMO-BATCH-0801` 13 件。跨到资金页收款核销后返回原订单，无刷新看到应收 ¥208.74、已收 ¥208.74、待收 ¥0.00、状态“已收清”。
- 采购抽查：`PO260810000001 → CGRK-260810-00001 → YF-260810-00001 → FK-260810-00001 → HX-260810-00002`，金额全程 ¥7.60；采购入库后跨到资金页立即看到同一采购单/入库单应付，付款核销后状态有效。
- 退货抽查：从本次新建并已发货的销售单进入“新增客户退单”，原订单候选明确出现 `CA-260810-00001 · 演示客户甲`；完整退货入库/退款由上述自动旅程覆盖。
- 固定 viewport 1280×800 下 `innerWidth=1280`、`clientWidth=1265`、`scrollWidth=1265`，没有整页横向溢出；浏览器 console warning/error 为空。

## 风险与阻塞

- handler 目前在创建会话时写入演示履约/退货数据；共享 Runtime 必须保留列表演示数据，但黄金旅程只能追踪本次生成 ID，不能把 seeded 事实计入通过证据。
- 场景切换若只重建一个领域，会再次造成隐性分叉；controller reset 必须是应用级原子替换。
- Store 持有旧 session 引用会让 reset 后写入旧 Repository；Store 动作必须动态读取 controller 当前 session。
- 跨域失败注入必须恢复所有相关 Repository；不能通过测试清理或二次补写掩盖半完成状态。
- 若既有页面缺少完成某一步的真实入口，先区分“Runtime 断链”和“模块 UI 缺口”；不可用入口必须如实记录，不能用直接改 Repository 代替浏览器证据。

## 进度日志

- [x] 创建 integration active plan，锁定三条流程、共享 Runtime 技术边界、从零单据和 L3 证据要求。
- [x] 审计现状：四个业务 Store 独立建会话；Order/Procurement handler 各自复制 Inventory/Finance。
- [x] 归档门复核继续发现 Customer/Product Store 独立会话；将两者纳入组合根，并验证主数据修改会即时进入新订单快照。
- [x] 实现可注入的共享 session 组合根与按 Pinia 隔离的 Runtime controller，迁移 Customer/Product/Order/Inventory/Procurement/Replenishment/Finance Store。
- [x] 补共享 Runtime identity、Pinia 隔离、原子 reset、Store 场景同步和跨域财务投影测试。
- [x] 完成 `FLOW-SALES-001` 自动集成和浏览器从零完整旅程。
- [x] 完成 `FLOW-PURCHASE-001` 自动集成和浏览器从零完整旅程。
- [x] 完成 `FLOW-RETURN-001` 从零自动完整旅程及浏览器源订单交接抽查。
- [x] 执行全仓收尾验证，按每条流程真实结果更新顺序表和质量评分并归档。

## 收尾验证

- `npm run verify:harness`：45 个功能切片、3 条流程、297 个决策门、8 份领域规格、8 份需求快照和 53 行入口导航通过；计划移动并更新流程表后复跑应显示 3 条流程 passing。
- `npm run typecheck`：通过。
- `npm run test:run -- --pool=forks --maxWorkers=2`：76 个测试文件、363 项测试通过。
- `npm run build`：通过；仅保留既有单 chunk 大于 500kB 的非阻塞 warning。
- `git diff --check`：通过。
- `npm run mock:reset`：baseline 恢复成功。
- 干净重启：停止本任务 Vite 会话、reset 后重新运行 `scripts/start.ps1`；因用户已有 5173 进程，本任务干净实例自动使用 `http://localhost:5174/dashboard`，浏览器可见应用壳、八领域导航和 Harness 总览，console warning/error 为空；随后停止本任务 5174 服务，不影响用户已有进程。

## 开放决策

无。本计划只组合已确认契约；发现会改变业务结果的新缺失事实时，立即停止受影响流程并登记 `DEC-*`，不得在 integration 计划内新增业务规则。

## 中断恢复点

- 最后完成：共享 Runtime、Store 迁移、三条流程、总体顺序、质量评分、Mock reset 和干净重启全部完成。
- 当前阶段：audit，状态 completed。
- 代码现场：应用组合根、Pinia controller、handler 注入、Store proxy、采购入库追溯修正、订单财务共享投影和集成测试已落地；临时浏览器 tab 已关闭，1280×800 viewport 已 reset，本任务 Vite 服务已停止。
- 下一条动作：无；后续从总体顺序的 `INV-004` 新建 active plan，不重复本 integration。
- 最近验证：Harness、类型、76 文件/363 测试、构建、diff、Mock reset、HTTP 200、应用壳和浏览器 console 全部通过。
- 未决问题：无产品决策；逐页 ScenarioBar 合并仍是单独 UI 技术债，不阻塞共享业务事实和本 integration 结论。
