# 渠道原型批次

- 类型：business-batch
- 功能：`CUS-008 + CUS-009`
- 风险等级：L2
- 当前阶段：verification
- 状态：completed
- 完成日期：2026-08-27
- 最近更新：2026-08-27

## 目标

在 Customer owner 下实现企微运营和商城运营的 PC 管理端原型。所有企微发送、客户同步、商城账号认证、支付、文件上传和移动端发布均使用确定性 fake adapter 或 unavailable 边界；不创建第二套客户、商品、订单或支付事实。

## 范围与非目标

- `CUS-008`：同步设置/记录、群发草稿/定时/撤回、标签映射、话术库、欢迎语、群管理、朋友圈草稿/发布记录。
- `CUS-009`：商城客户/员工账号资料、装修页面配置/预览/发布、扩展模块开关、广告、弹窗、渠道消息和商城基础/显示/功能/支付设置。
- 非目标：真实企微 API、真实消息、真实客户同步、真实密码登录、真实支付、真实图片/文件上传、完整移动端商城。

## 事实来源

- `docs/references/requirements/06-客户模块.md §6.1～§6.8`：企微字段、操作和状态。
- `docs/references/requirements/06-客户模块.md §7.1～§7.8`：商城字段、装修、扩展、广告、弹窗、消息和设置。
- `docs/product-specs/customers.md`：Customer owner、客户/标签/营销公开事实和 fake 外部边界。
- `docs/product-specs/products.md`：商品候选项只能来自公开 Product provider。
- `docs/references/requirements/01-整体架构与首页.md §4～§5`：列表、表单、空态和角色规范。

## 决策门

| 决策 ID | 推荐结论 | 阻塞范围 | 状态 |
|---|---|---|---|
| `DEC-CUS-042` | 企微同步、群发、朋友圈和欢迎语只保存 fake 请求/预览/结果记录；不访问企微、不发送消息；撤回只改变本地 fake 状态。 | CUS-008 外部动作 | decided |
| `DEC-CUS-043` | 企微标签映射、话术、群和同步设置由 Customer owner 保存；系统标签只引用公开 Customer 标签，停用/删除引用按现有标签规则拒绝。 | CUS-008 事实归属 | decided |
| `DEC-CUS-044` | 商城客户/员工账号只保存脱敏 fake 账号元数据和状态，不保存可登录密码；重置密码只生成 fake 操作记录。 | CUS-009 账号安全 | decided |
| `DEC-CUS-045` | 商城装修、广告、弹窗、扩展和渠道消息保存结构化配置快照；商品/客户候选项引用公开 provider；支付设置只展示 fake 配置，不产生支付动作。 | CUS-009 配置/支付 | decided |
| `DEC-DASH-001` | 首页四区使用各领域公开只读 provider；未接入指标显示 unavailable；待办/预警按角色过滤；日界线采用 Asia/Shanghai 当前自然日，趋势与同比暂不伪造。 | DASH-001 聚合口径 | decided |

## 前置门禁

- `CUS-001`、`PRD-001`、`PRD-003`、`CUS-006`、`CUS-010`、`FIN-005`、`INV-006`、`ORD-006`、`SET-002` 均有 passing 或 completed 证据。
- 本计划是唯一业务 active plan；`CUS-008`、`CUS-009` 已完成 ready gate 并进入 verification。

## 批次切片状态

| 功能 | 当前阶段 | 最后检查点 | 下一动作 | 结果 |
|---|---|---|---|---|
| `CUS-008` | verification | 已完成 fake 企微工作台、同步/群发/状态边界 | 专项、全量和浏览器验证 | implemented |
| `CUS-009` | verification | 已完成商城账号、扩展、装修预览和设置 | 专项、全量和浏览器验证 | implemented |

## 验证路径

- CUS-008/CUS-009：设置保存、列表 CRUD、状态命令、fake 预览/发布、账号不保存密码、商品/客户 provider 引用、normal/empty/error/permission-denied。
- 批次收尾：CUS-008/CUS-009 专项测试、全量测试、typecheck、build、verify:harness、Mock reset、干净重启和浏览器检查。

## 风险与阻塞

- 外部渠道动作不可逆且涉及账号/消息边界；所有动作只写 fake 记录，真实连接必须另建 integration 计划。
- Dashboard 跨域聚合不能复制订单、库存、资金或客户事实；provider 不可用必须保留 unavailable。
- `MER-001`、`ANA-001`、`PRD-006` 仍 blocked，不属于本计划；`DASH-001` 已实现，随后使用独立首页计划归档。

## 开放决策

无

## 进度日志

- [x] 从总体顺序选择 `CUS-008 + CUS-009`，确认依赖和非目标。
- [x] 补齐 `customers.md` / `dashboard.md` 字段与交互契约并通过 ready gate。
- [x] 实现 CUS-008/CUS-009 的 Types → Schema → Service → Runtime → View 和路由。
- [x] 额外实现 DASH-001 的只读聚合 service、角色过滤、跳转和四区工作台，随后单独记录完成计划。
- [x] 专项测试通过：3 个文件、5 条测试；typecheck 和 verify:harness 通过。
- [x] 运行全量测试（91 个文件、442 条测试）、构建、Mock reset、干净重启和浏览器验收。
- [x] 归档 CUS-008/CUS-009 批次并建立 DASH-001 独立完成计划。

## 完成证据

- 自动：`src/features/customers/services/channel-service.spec.ts`、`src/features/dashboard/services/dashboard-service.spec.ts` 与 `src/features/dashboard/views/HarnessOverviewView.spec.ts` 专项测试共 5 条通过；全量 91 个测试文件、442 条测试通过。
- 工程：`npm run verify:harness`、`npm run typecheck`、`npm run build`、`git diff --check` 通过；`npm run mock:reset` 恢复 baseline。
- 浏览器：`http://127.0.0.1:5179/customers/wecom`、`/customers/mall` 和 `/dashboard` 可达，企微/商城 fake 边界与首页 unavailable 正常展示，控制台无 error/warning。
- 边界：真实企微、消息、密码登录、支付、文件上传和移动端发布未实现，保持 fake/unavailable。

## 中断恢复点

当前已完成 CUS-008/CUS-009 verification。归档后建立 `DASH-001` 独立计划并写入首页完成证据；不得接入真实企微、支付、文件或密码，也不得复制跨域事实。
