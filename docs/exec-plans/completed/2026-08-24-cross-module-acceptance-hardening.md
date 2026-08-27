# 跨模块业务闭环验收加固

- 类型：harness
- 功能：不适用
- 当前阶段：audit
- 状态：completed
- 完成日期：2026-08-24
- 最近更新：2026-08-24

## 目标

修复“各模块分别通过、组合后无法从新建单据走完整闭环”的 Harness 漏洞。把模块验收、跨模块集成验收和阶段业务闭环验收分开；业务闭环必须在同一共享 Mock 运行态中，从本次新建的源头业务单据开始，并以可关联的业务编号、金额/数量守恒和最终页面结果作为证据。

## 范围与非目标

本计划只修改 Harness、架构约束、实施顺序、质量声明和机械校验，不在本计划重构订单、资金、采购、库存或其他业务代码。现有 `INV-003` 业务 active plan 保持原现场；本计划不修改其字段、状态或实现范围。

## 事实来源

- `AGENTS.md`：完成与收尾导航。
- `ARCHITECTURE.md`：Mock、跨领域公开接口和运行态所有权。
- `docs/PLANS.md`：计划类型、阶段门和验证证据。
- `docs/RELIABILITY.md`：验证层级、黄金旅程和禁止假通过。
- `docs/design-docs/implementation-sequence.md`：销售与采购阶段出口。
- `docs/QUALITY_SCORE.md`：当前完成声明和证据可信度。
- `docs/exec-plans/completed/2026-08-14-order-fulfillment.md`、`docs/exec-plans/completed/2026-08-14-customer-receivables.md`：当时的模块级验收证据；作为历史事实保留，不改写为从零闭环证据。

## 前置门禁

- 已确认当前唯一业务 active plan 是 `INV-003`，本计划类型为 `harness`，不创建第二个业务切片。
- 已确认订单 Store 与资金 Store 分别创建 Mock 会话；相同 fixture baseline 不等于共享运行状态。
- 不删除或覆盖当前工作区中已有的业务改动。

## 验证路径

- 文档一致性：架构、计划、可靠性、实施顺序和质量评分使用相同的“模块通过/集成通过/闭环通过”定义。
- 机械验证：`scripts/verify-harness.mjs` 校验阶段集成状态、所需门禁文本，并阻止存在独立业务 Store Mock 会话时把阶段标记为 `passing`。
- 回归：运行 `npm run verify:harness` 和 `git diff --check`；本计划不要求业务类型检查、测试或构建，因为不修改业务运行代码。

## 风险与阻塞

- 本次只把真实缺口暴露并防止再次误报，不修复共享 Mock Runtime，因此销售与收款闭环状态必须保持 `blocked`。
- 采购、库存与资金也可能存在同类问题；在完成从零跨模块审计前不得仅凭各切片 completed 宣称阶段闭环。
- 历史 completed plan 是当时证据，不回写成不存在的端到端证据；修正结论写入质量评分与本计划。

## 进度日志

- [x] 核对现有 Harness、销售阶段出口、订单/资金 completed 证据和实际 Store Mock 会话。
- [x] 在架构、计划和可靠性文档中补齐共享 Runtime、三级完成声明、从零业务单据、关联编号和守恒门禁。
- [x] 在总体顺序登记 `FLOW-SALES-001` blocked、`FLOW-PURCHASE-001/FLOW-RETURN-001` not-run，并修正质量评分中的完成声明。
- [x] 在技术债台账登记业务 Store 独立 Mock session 风险和重访触发条件。
- [x] 扩展 `scripts/verify-harness.mjs`：校验 `FLOW-*` 状态、integration completed 证据和 passing 时的独立 Store session 禁令。
- [x] `npm run verify:harness` 通过：45 个功能切片、3 条跨模块流程（0 passing）、297 个决策门、8 份领域规格和8份需求快照。
- [x] `git diff --check` 通过。

## 开放决策

无。

## 中断恢复点

本 Harness 计划已完成并归档。后续不要从本计划继续写业务代码；按 `tech-debt-tracker.md` 的触发条件另建 `architecture`/`integration` 计划，先实现应用级共享 Mock Runtime，再用本次新建订单的 `订单号→出库单号→应收单号→收款单号→核销单号` 证据把 `FLOW-SALES-001` 从 blocked 升为 passing。现有 `INV-003` active plan 保持原恢复点。
