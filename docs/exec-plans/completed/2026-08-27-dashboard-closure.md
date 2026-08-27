# 首页经营工作台

- 类型：business-feature
- 功能：`DASH-001`
- 风险等级：L2
- 当前阶段：verification
- 状态：completed
- 完成日期：2026-08-27
- 最近更新：2026-08-27

## 目标

完成 Dashboard 首页四区工作台：待办、营业情况、预警中心和通知公告。只读聚合各领域公开 provider，保持 unavailable 边界，不修改订单、库存、资金或客户事实。

## 范围与非目标

范围为角色过滤、待办跳转、核心指标、预警处理标记、通知已读和 normal/empty/error/permission-denied 场景。非目标为实时大屏、自由拖拽、生产级报表、真实通知和未定义同比/环比计算。

## 事实来源

- `docs/product-specs/dashboard.md`：DASH-001 字段与交互契约、provider 边界和验收。
- `docs/references/requirements/01-整体架构与首页.md §3`：首页区域、待办、经营卡片、趋势、预警和通知。
- `docs/references/requirements/01-整体架构与首页.md §4～§5`：页面状态、角色和跳转规范。
- `ARCHITECTURE.md`、`docs/RELIABILITY.md`：跨域只读 provider 和 unavailable 约束。

## 前置门禁

`CUS-010`、`FIN-005`、`INV-006`、`ORD-006`、`SET-002` 均已完成并有证据；`DEC-DASH-001` 已决定并写回 `dashboard.md` 与 `docs/product-specs/index.md`。

## 验证路径

- Service：角色过滤、日界线、unavailable、不修改业务事实。
- View：四区、跳转 query、已读/处理、normal/empty/error/permission-denied。
- 工程：全量测试、typecheck、build、verify:harness、Mock reset、干净重启和 1280px 浏览器检查。

## 风险与阻塞

- Dashboard 不得复制跨域事实或把 provider 失败显示为 0。
- 真实实时推送和复杂同比/环比不在原型范围。

## 开放决策

无

## 进度日志

- [x] 读取 `dashboard.md` 与首页原始需求并完成 DEC-DASH-001。
- [x] 实现 Dashboard service、角色过滤、跳转和四区 View。
- [x] 专项和全量验证已通过，浏览器 1280px 检查已通过。
- [x] 同步首页完成证据并归档本计划。

## 中断恢复点

当前实现和验证已完成；恢复时只需更新总体顺序、质量摘要并将本计划归档，不得新增未定义指标或跨域写入。

## 完成证据

- 自动：`src/features/dashboard/services/dashboard-service.spec.ts` 与 `src/features/dashboard/views/HarnessOverviewView.spec.ts` 通过；全量 91 个测试文件、442 条测试通过。
- 工程：`npm run verify:harness`、`npm run typecheck`、`npm run build`、`git diff --check` 通过；`npm run mock:reset` 恢复 baseline。
- 浏览器：`http://127.0.0.1:5179/dashboard` 在 1280px 检查待办、营业、预警、通知四区、角色选择和 unavailable 展示，控制台无 error/warning。
- 边界：同比/环比、实时大屏和未接入 provider 保持 unavailable，不伪造业务数值。
