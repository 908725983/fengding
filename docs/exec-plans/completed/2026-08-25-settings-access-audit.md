# 权限与审计批次

- 类型：business-batch
- 功能：`SET-002,SET-004`
- 风险等级：L2
- 当前阶段：verification
- 状态：completed
- 最近更新：2026-08-25
- 完成日期：2026-08-25

## 目标

从设置原始需求固化角色权限、员工账号和系统日志的可编码契约。权限必须同时作用于路由、UI 可见性和 Service command；员工账号、首次登录、重置密码和日志全部使用原型 fake 能力，不宣称真实认证安全。

## 范围与非目标

范围：角色列表与权限树；系统默认角色与自定义角色；员工列表、筛选、新增/编辑、停用、重置密码；登录状态的原型模拟；系统日志筛选、展示和 fake 导出。

非目标：真实登录服务、密码加密证明、短信/邮件验证、SSO、真实审计数据库、日志物理清理、行级数据范围配置、SET-001/003 已完成的公司/组织/仓库字段重做。

## 事实来源

- `docs/product-specs/settings.md`：设置领域权限边界、已完成组织资料、日志不可篡改规则。
- `docs/references/requirements/08-设置模块.md §3.1、§3.2、§5.1、§6`：权限树、角色继承、员工字段与账号规则、日志字段和保留期限。
- `docs/references/requirements/01-整体架构与首页.md §4～§5`：全局页面规则和五类角色的模块级权限矩阵。
- `ARCHITECTURE.md`：固定分层、公开接口、共享 Mock Runtime 和跨领域权限边界。
- `docs/SECURITY.md`、`docs/RELIABILITY.md`、`docs/FRONTEND.md`：原型安全边界、错误恢复和后台页面规范。

## 前置门禁

- `SET-001`、`SET-003` 已在规格索引为 `ready`，并已归档 passing；设置 Runtime、部门和区域 provider 可复用。
- 当前没有其他业务 active plan；本计划是唯一业务现场。
- Harness 基线应通过：45 个功能切片、365 个决策门、8 份领域规格和 8 份需求快照。

## 批次切片状态

| 功能 | 当前阶段 | 最后检查点 | 下一动作 | 结果 |
|---|---|---|---|---|
| `SET-002` | completed | 权限 catalog、角色/员工 Service、Runtime/Store 和页面已实现 | 后续按总体顺序恢复 `PRD-005` | completed |
| `SET-004` | completed | 日志 Service、筛选、fake CSV 和页面已实现 | 后续按总体顺序恢复 `PRD-005` | completed |

## 验证路径

1. specification：逐字段登记角色、权限、员工和日志来源及页面状态。
2. decision：把默认角色权限、会话生效、账号密码 fake 语义、角色/员工生命周期、日志不可变和导出边界登记为 `DEC-SET-*`；按默认推荐直接固化。
3. ready gate：两个切片契约完整、决策均 `decided`、依赖 passing 后进入实现。
4. implementation：沿 `Types → Config → Schema → Repository → Service → Runtime/Store → View` 实现；权限 catalog 作为设置公开接口供其他领域消费，不能在各领域复制角色规则。
5. verification：normal/empty/error/slow/permission-denied、权限树校验、系统管理员保护、账号唯一、首次登录/重置密码 fake、权限重新登录生效、日志不可变/导出和敏感字段遮蔽；收尾运行全量测试、构建、Harness、Mock reset 和页面冒烟。

## 风险与阻塞

- 原文只给五类角色模块级“完整/部分/只读”，没有给每一权限点的默认映射；本计划通过 `DEC-SET-001/002` 固化原型最小可验证映射，不宣称生产 RBAC。
- 真实登录、密码加密和移动端通知不可实现；页面必须标识 fake，Service 不接触真实凭据。
- 权限变化要求重新登录生效；当前会话保留旧权限快照，不能通过刷新单个按钮伪造实时变化。
- 日志不能由 UI 或 Service 提供删除/编辑命令；导出只生成 fake CSV，不泄露完整密码、token 或敏感账号。

## 进度日志

- [x] 从总体顺序选择 `SET-002 + SET-004`，确认无其他业务 active plan。
- [x] 阅读设置 §3.1、§3.2、§5.1、§6 及全局 §4～§5，确认权限需要公开 catalog、员工和日志共用操作者事实。
- [x] 写入 `settings.md` 的 `SET-002`、`SET-004` 字段与交互契约，并登记 `DEC-SET-010～013` 决策门。
- [x] 两个切片已达到 `ready`，Harness 规格门禁通过。
- [x] 实现权限 catalog、角色/员工会话与系统日志的 Types → Config → Schema → Repository → Service → Runtime/Store → View 链路。
- [x] 专项测试：设置 Service 5 条通过；覆盖系统管理员保护、账号唯一、fake 密码边界、权限会话快照、日志导出。
- [x] 收尾验证：83 个测试文件/415 条测试通过；`npm run typecheck`、`npm run build`、`npm run verify:harness`、`git diff --check`、`npm run mock:reset` 通过。
- [x] 页面冒烟：`/settings/roles`、`/settings/employees`、`/settings/logs` 加载；财务角色可查看日志但导出按钮禁用；浏览器控制台无错误。

## 开放决策

| 决策 ID | 缺失事实与证据 | 可选方案及影响 | 阻塞范围 | 可安全继续 | 决定人 | 状态 | 结论与写回位置 |
|---|---|---|---|---|---|---|---|
| `DEC-SET-001` | 模块级权限之外的机构、区域、客户归属和行级数据范围未定义 | 推荐原型默认企业内全量数据，不实现行级范围配置；权限只控制模块/操作 | SET-002 权限与各领域消费 | 权限树结构 | 产品负责人/管理员 | decided | 2026-08-25 按推荐方案固化，写回 `docs/product-specs/index.md` |
| `DEC-SET-002` | “只读/部分”没有默认角色到具体权限项映射，权限变更生效时点需落地 | 推荐按领域现有可见角色建立最小操作映射；权限写入版本快照，重新登录后生效 | SET-002 默认角色与会话 | 自定义角色编辑壳 | 产品负责人/管理员 | decided | 2026-08-25 按推荐方案固化，写回 `docs/product-specs/index.md` |
| `DEC-SET-010` | 系统默认角色是否可改名/删、角色名唯一和员工引用后的删除边界未定义 | 推荐系统管理员不可编辑/删除；自定义角色企业内名称唯一，有员工引用时停用而非删除 | 角色 CRUD | 权限树展示 | 产品负责人/管理员 | decided | 2026-08-25 按推荐方案固化，写回 `docs/product-specs/index.md` |
| `DEC-SET-011` | 员工账号、初始密码、重置密码和首次登录状态的保存方式未定义 | 推荐保存 fake 密码元数据与 `mustChangePassword`；不保存明文密码，不接真实认证；重置生成固定 fake 默认值并要求首次修改 | 员工表单、登录模拟 | 员工列表只读 | 产品负责人/管理员 | decided | 2026-08-25 按推荐方案固化，写回 `docs/product-specs/index.md` |
| `DEC-SET-012` | 员工多角色的权限合并、禁用员工和停用角色对当前会话影响未定义 | 推荐多角色取并集；禁用/停用只阻止新登录，当前会话保留快照直到重新登录 | 员工角色分配、权限生效 | 员工基础字段 | 产品负责人/管理员 | decided | 2026-08-25 按推荐方案固化，写回 `docs/product-specs/index.md` |
| `DEC-SET-013` | 日志保留六个月的时钟、不可变约束、导出范围和敏感字段遮蔽未定义 | 推荐 Asia/Shanghai 受控时钟；日志追加不可编辑/删除；导出当前筛选 fake CSV；密码/token/完整敏感账号不入日志 | SET-004 日志 | 日志只读列表 | 产品负责人/审计/管理员 | decided | 2026-08-25 按推荐方案固化，写回 `docs/product-specs/index.md` |

## 中断恢复点

当前处于 verification，所有实现和验证已完成，计划可移动到 `docs/exec-plans/completed/2026-08-25-settings-access-audit.md`。回退检查点为 Mock reset 后的 `createSettingsMockSession('normal')`；权限、员工和日志均由同一 Settings Repository 持有，未创建第二套事实。后续从总体顺序中的商品辅助资料批次恢复。
