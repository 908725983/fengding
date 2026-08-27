# 采购订单与入库

- 类型：business-feature
- 功能：PUR-002
- 当前阶段：verification
- 状态：completed
- 完成日期：2026-08-20
- 最近更新：2026-08-20

## 目标

从采购原文、`INV-001` 库存公开 command、`PUR-004` 供应商供货 provider 和 `PUR-001` 候选草稿交接中提取采购订单与采购入库的可编码契约，登记影响状态、金额、单位、库存、应付和权限的人工决策门。决策写回并满足实现门前，不创建采购订单、采购入库、库存流水、应付记录、页面或 fixture。

## 范围与非目标

范围：`PUR-02` 智能/快速采购订单交接、`PUR-04` 采购订单状态流转、`PUR-05` 采购入库库存结果、`PUR-09` 采购单号；采购订单列表、详情、创建编辑、审核/作废/取消、部分入库和导入导出契约。

非目标：`PUR-003` 采购退单、`PUR-005` 采购统计、`FIN-002` 应付与付款、`INV-002` 通用出入库、真实供应商/支付/物流接口，以及未由本切片拥有的直送统计。

## 事实来源

- `docs/references/requirements/04-采购模块.md §2.2～§2.3、§5、§7（PUR-02、PUR-04、PUR-05、PUR-09）`：采购订单、智能采购、状态、明细、入库单字段和原始操作。
- `docs/references/requirements/01-整体架构与首页.md §2、§4～§5`：全局列表、表单、分页、角色和权限资料。
- `docs/references/requirements/08-设置模块.md §3.1.3`：采购细权限名称。
- `docs/product-specs/procurement.md`：`PUR-004` 供应商/供货关系 provider、`PUR-001` 候选草稿契约和采购领域边界。
- `docs/product-specs/inventory.md`：`INV-001` 库存余额、单位数量和入库 command 的公开边界。
- `docs/product-specs/orders.md`：订单来源候选、出库状态和订单 provider 的只读边界。
- `docs/product-specs/finance.md`：资金 owner 和应付未决边界。
- `docs/product-specs/index.md`：`DEC-FIN-002`、`DEC-PUR-003` 及本切片决策登记。
- `docs/design-docs/implementation-sequence.md`：切片顺序与实现门。

## 前置门禁

- [x] `./scripts/init.ps1` 基线通过：45 个功能切片、207 个决策门、67 个测试文件/296 条测试、类型检查、构建。
- [x] `INV-001`、`PUR-004`、`PUR-001` 依赖已有 passing 证据。
- [x] `DEC-PUR-029～046`、`DEC-PUR-003` 和 `DEC-FIN-002` 已由决定人确认并写回产品规格。
- [x] `docs/product-specs/procurement.md` 的 `PUR-002 字段与交互契约` 已升级为 `ready`。
- [x] `npm run verify:harness` 与依赖事实复核通过后进入 implementation。

## 验证路径

规格阶段：`npm run verify:harness`、`git diff --check`；核对原文章节、字段追踪、决策表、非目标和 provider 边界。

实现阶段（决策完成后才执行）：Schema/Repository/Service 规则测试；订单号并发与幂等；审核/取消/作废/部分入库状态机；金额和单位边界；`INV-001` 原子入库回滚；权限四层拒绝；normal/empty/error/slow/permission-denied/partial-failure/unavailable/concurrent/boundary；Mock reset 哈希。

验收阶段：1280px 列表、详情、创建、审核和部分入库黄金旅程；键盘与错误恢复；导入预览/整批拒绝；控制台无应用错误；干净停止/启动后状态可复现。证据写入本计划和 `docs/QUALITY_SCORE.md` 后才归档。

## 风险与阻塞

- 原文同时列出订单状态、入库状态和合并状态流，不能在未确认前自行合并。
- `DEC-FIN-002` 未决定应付形成时点；采购订单不得把付款状态或应付金额伪装成已接入。
- 当前没有采购订单、入库或应付 baseline；不得为填充页面预先伪造跨域事实。
- 导入、直送、批次、库位、采购成本等字段若无来源，必须显示 unavailable 或列为未实现，不以空值/0 猜测。

## 进度日志

- [x] 当前步骤：核对 active 目录、依赖状态和 Harness 基线。
- [x] 当前步骤：阅读采购原文、全局权限、`PUR-004`、`PUR-001`、`INV-001`、Finance 公开边界。
- [x] 已完成步骤：把 `DEC-PUR-029～046` 写入产品索引，并在采购规格中形成 source-only 契约。
- [x] 已完成步骤：`npm run verify:harness` 与 `git diff --check` 通过（225 个决策门）。
- [x] 已完成步骤：用户确认全部推荐方案，决策写回且 `PUR-002` 升级为 `ready`。
- [x] 已完成步骤：采购订单 Types、Schema、Service、库存 provider、Mock、Store、路由与采购订单页面实现。
- [x] 已完成步骤：采购单号、创建幂等、状态/权限、直送供应商拒绝、部分/完整入库、超额拒绝和库存原子回滚测试。
- [x] 已完成步骤：`npm run verify` 通过 Harness、类型检查、68 个测试文件/301 项测试和生产构建。
- [x] 已完成步骤：1280px 浏览器黄金旅程、布局、控制台、Mock 重置与干净重启验收通过。

## 实际验证证据

- 聚焦自动测试：`purchase-order-service.spec.ts` 4 项、`ProcurementViews.spec.ts` 3 项全部通过；覆盖创建/requestId 幂等、审核/取消/作废权限、直送供应商拒绝、入库/超额拒绝/终态和页面创建表单。
- 全仓验证：`npm run verify` 通过，Harness 为 45 个切片/225 个决策门，类型检查通过，68 个测试文件/301 项测试通过，生产构建通过；仅保留 Vite 既有的大 chunk 提示。
- Mock 确定性：连续两次 `npm run mock:reset` 后，`mock/fixtures/baseline.json` 与 `work/mock-state.json` SHA-256 均为 `30D11134C851990C05240731089FF56589073374BCA3718BD14C2CBED6E745E9`。
- 浏览器黄金旅程：正常场景、超级管理员下新增采购订单，创建表单仅提供可入仓供应商，供应价默认 `760` 分；创建 `PO260810000001`，审核后选择“演示常温一区”、填写批次和生产日期完成入库，最终可见 `已审核 / 已入库 / ¥7.60 / 未接入`。
- 浏览器可靠性：独立 1280px 页面从空状态完成上述旅程，`warn/error` 为 0；页面 `documentWidth=1280`，宽表 `1100px` 内容限制在 `1054px` 内部滚动容器，没有整页横向溢出。
- 失败修复：首次验收发现创建弹窗过渡时直接访问缺失首行导致 Vue render error；改为仅在首行存在时挂载字段并禁用无供货关系保存，随后聚焦测试、全仓验证及独立浏览器旅程全部重跑通过。
- 干净重启：重置 Mock、停止并重新启动 Vite 后，`/procurement/purchase-orders` 返回确定性空状态，标题可见，1280px 无溢出，控制台 `warn/error` 为 0。

## 开放决策
无

## 中断恢复点

`PUR-002` 已完成实现、自动验证、浏览器黄金旅程、Mock 重置和干净重启验证。本计划应归档到 `docs/exec-plans/completed/2026-08-20-purchase-orders-inbound.md`；下一切片按长期顺序为 `FIN-002`，必须新建 active plan 并先做 source-only 规格提取，不在本计划继续编码。
