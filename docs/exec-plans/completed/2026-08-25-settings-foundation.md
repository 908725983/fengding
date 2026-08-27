# 设置基础资料批次

- 类型：business-batch
- 功能：`SET-001,SET-003`
- 风险等级：L2
- 当前阶段：verification
- 状态：completed
- 最近更新：2026-08-25
- 完成日期：2026-08-25

## 目标

从设置领域原始需求提取 `SET-001` 公司、部门、内部公告与 `SET-003` 区域、共享仓库资料的可编码契约。设置入口不得复制库存仓库事实；公告、组织树和区域树的状态、删除、发布及 fake 外部能力边界必须先写入规格并解决阻塞决策，再进入实现。

## 范围与非目标

范围：公司信息查看/编辑；部门树及部门表单；内部公告列表、草稿、发布和接收对象；区域树及区域表单；设置入口的共享仓库列表、查询、新增/编辑和禁售字段同步。列表分页、筛选、表单校验、错误恢复和角色门禁沿全局规范执行。

非目标：角色/权限/员工/系统日志（`SET-002/SET-004`）；库存库位、库存移动和禁售仓销售出库规则本体（由 `INV-001` 持有）；真实认证、密码、移动端 Push、富文本 AI、图片/附件上传、地图和真实组织/区域 provider。上述外部能力只允许明确标注的 fake adapter。

## 事实来源

- `docs/product-specs/settings.md`：设置领域当前边界、唯一仓库 owner 和已登记 `SET-01～SET-10` 规则。
- `docs/references/requirements/08-设置模块.md §2、§4`：公司、部门、公告、区域和仓库字段、列表、表单、流程及直接规则。
- `docs/references/requirements/05-库存模块.md §3.1～§3.2`：库存仓库/库位页面字段，证明仓库资料必须与 Inventory 共用。
- `docs/references/requirements/01-整体架构与首页.md §4～§5`：列表/详情/表单通则和设置模块粗权限。
- `ARCHITECTURE.md`：`Repository → Service → Runtime → View` 分层、跨域公开 provider 和共享 Mock Runtime 约束。
- `docs/FRONTEND.md`、`docs/RELIABILITY.md`、`docs/SECURITY.md`：PC 管理后台视觉、错误恢复、fake 外部能力和权限三层一致性。

## 前置门禁

- `SET-001`、`SET-003` 已达到 `ready`；`DEC-SET-003～009` 已于 2026-08-25 按推荐方案确认，可进入实现。
- `SHELL-001`、`CUS-001`、`INV-001` 均有 completed/passing 证据；仓库数据由 Inventory 唯一持有。
- Harness 基线已通过：45 个功能切片、361 个决策门、8 份规格和 53 行导航。
- 当前 `docs/exec-plans/active/` 只有本计划；若中断从本文件“当前步骤”和“中断恢复点”继续。

## 批次切片状态

| 功能 | 当前阶段 | 最后检查点 | 下一动作 | 结果 |
|---|---|---|---|---|
| `SET-001` | verification | Types/Schema/Repository/Service/Runtime/Store/View 已完成 | 全量测试与页面冒烟已通过 | passing |
| `SET-003` | verification | 区域树与 Inventory 仓库 provider 已完成 | 跨页仓库事实与禁售透传已验证 | passing |

## 验证路径

1. specification：逐字段映射设置和库存原文，标出冲突/未定义事实；在 `docs/product-specs/settings.md` 写入两个固定标题的完整契约。
2. decision：把会改变状态、删除、副作用、字段 owner 或权限结果的缺口登记到 `docs/product-specs/index.md`，等待用户一次性确认推荐方案。
3. ready gate：只有两个切片的契约完整、决策均为 `decided`、依赖 passing 后，才把索引字段准备度改为 `ready` 并进入 implementation。
4. implementation（后续阶段）：沿唯一 Inventory 仓库 provider 接入 Settings Types/Repository/Service/Runtime/View；组织、区域、公告各自事务化，页面不得读 fixture。
5. verification（后续阶段）：normal/empty/error/retry/permission-denied、树循环/删除引用、公告草稿发布、仓库字段同步和禁售透传；L2 批次收尾一次全量测试、1280px 浏览器验收、Mock reset 和干净重启。

## 风险与阻塞

- 设置原文只给模块级权限，细权限/行级范围仍由 `DEC-SET-001/002` 约束；本批次不伪造角色权限树。
- 设置仓库字段比现有 Inventory `Warehouse` 更宽，且“仓位标签/禁售/地区”存在跨域语义；未经 `DEC-SET-007～009` 决定不得复制或静默扩展第二套仓库模型。
- 公告富文本、图片、链接、附件、AI 文案和移动端推送没有真实 provider；不能把 fake 预览宣称为已发布到移动端。
- 删除部门/区域的原文只明确员工/客户引用，子树、公告接收对象和仓库引用的副作用需要人工确认。

## 进度日志

- [x] 从总体顺序选择 `SET-001 + SET-003`，确认无其他业务 active plan。
- [x] 运行开工基线并核对 Harness、架构、质量、前端、可靠性和安全边界。
- [x] 阅读设置 §2/§4、库存 §3.1～§3.2 及全局 §4～§5，确认仓库必须复用 Inventory owner。
- [x] 写入 `settings.md` 的 `SET-001`、`SET-003` 字段与交互契约，并登记新的 `DEC-SET-*` 决策门。
- [x] 用户于 2026-08-25 确认 `DEC-SET-003～009` 全部按推荐方案执行，索引字段准备度改为 `ready`。
- [x] 实现 Types/Schema/Repository/Service/Runtime/Store/View，并接入应用级共享 Mock Runtime。
- [x] 接入 `/settings/company`、`/settings/departments`、`/settings/announcements`、`/settings/regions`、`/settings/warehouses` 路由及设置导航。
- [x] 通过设置服务专项测试、共享 Runtime 测试、全量测试和页面冒烟检查。
- [x] 当前步骤：验证完成，准备归档本计划。

## 开放决策

| 决策 ID | 缺失事实与证据 | 可选方案及影响 | 阻塞范围 | 可安全继续 | 决定人 | 状态 | 结论与写回位置 |
|---|---|---|---|---|---|---|---|
| `DEC-SET-003` | 公司电话/邮箱/编码校验、Logo/简介保存格式和编辑审计未定义 | 推荐沿用 fake 元数据与最小格式校验，具体格式写入契约 | 公司表单 | 字段展示与空态 | 产品负责人/管理员 | decided | 2026-08-25 用户确认推荐方案。 |
| `DEC-SET-004` | 部门有子部门、公告接收对象或历史引用时能否删除，停用影响未定义 | 推荐有任一子节点/员工/客户/公告引用即拒绝删除，停用只影响新分配 | 部门删除/停用 | 树展示、无引用新增编辑 | 产品负责人/管理员 | decided | 2026-08-25 用户确认推荐方案。 |
| `DEC-SET-005` | 公告富文本 AI/图片/附件保存格式、附件限制和草稿编辑边界未定义 | 推荐保存结构化 fake 内容元数据，AI 只生成待确认草稿，不上传真实文件 | 公告表单 | 列表与标题/类型筛选 | 产品负责人/管理员 | decided | 2026-08-25 用户确认推荐方案。 |
| `DEC-SET-006` | 已发布公告编辑/撤回/删除及推送失败对发布状态的影响未定义 | 推荐发布快照不可改，撤回/删除需单独命令，fake 推送失败不回滚已发布公告 | 公告状态机 | 草稿保存和只读展示 | 产品负责人/管理员 | decided | 2026-08-25 用户确认推荐方案。 |
| `DEC-SET-007` | 设置仓库字段比 Inventory Warehouse 更宽，仓位标签、类型、地区/联系人/禁售 owner 未定义 | 推荐 Inventory 保持唯一 owner，Settings 通过 provider 消费/编辑兼容字段，不建第二套仓库 | SET-003 仓库模型/provider | 区域规格与仓库只读入口 | 产品负责人/库存负责人/技术负责人 | decided | 2026-08-25 用户确认推荐方案。 |
| `DEC-SET-008` | 区域编码、默认区域、类型、子区域和仓库引用删除限制未定义 | 推荐保留唯一默认根区域，树编码稳定生成，有任一子节点/客户/仓库引用即拒绝删除 | SET-003 区域树 | 无副作用树展示 | 产品负责人/销售/管理员 | decided | 2026-08-25 用户确认推荐方案。 |
| `DEC-SET-009` | 设置仓库与库存仓库权限联动、禁售生效时点和已有履约引用边界未定义 | 推荐沿 Inventory 既有权限/状态校验，禁售立即影响后续销售可用性，不改历史出库 | SET-003 权限和 SET-10 | 超级管理员入口与现有库存规则 | 产品负责人/管理员/仓库 | decided | 2026-08-25 用户确认推荐方案。 |

无。本批次 DEC-SET-003～009 已全部按用户确认的推荐方案固化。

## 验收证据

- `src/features/settings/services/settings-service.spec.ts`：公司格式校验与审计、部门循环与引用删除阻断、公告不可变发布快照/fake 推送失败、区域默认根和引用删除阻断通过。
- `npm run test:run -- --pool=forks --maxWorkers=2`：83 个测试文件、414 条测试全部通过。
- `npm run typecheck`：通过。
- `npm run build`：通过；仅保留既有单 chunk 体积提示。
- `npm run verify:harness`：45 个功能切片、361 个决策门、8 份领域规格、8 份需求快照通过。
- `git diff --check`：通过；`npm run mock:reset`：baseline 恢复成功。
- 页面冒烟：`http://127.0.0.1:5173/settings/company` 返回 200；公司、部门、区域、共享仓库页面均可通过导航渲染，仓库页显示 Inventory provider 的两条仓库事实。

## 中断恢复点

当前阶段 verification 已完成，计划状态 completed。已按 `Types → Schema → Repository → Service → Runtime/Store → View` 实现并验证；仓库通过 Inventory public provider 共享。后续 SET-002/SET-004 应新建独立 active plan，不在本批次继续扩展设置字段。
