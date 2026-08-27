# INV-002 转仓与其他出入库

- 类型：business-feature
- 功能：INV-002
- 当前阶段：verification
- 状态：completed
- 最近更新：2026-08-21
- 完成日期：2026-08-21

## 目标

从库存原文 §4.1～§4.3 提取转仓单、其他出库单和其他入库单的可编码契约。先固定单据字段、状态时点、库存增减、批次/FIFO、成本、关联单号、作废/删除、权限、幂等和页面状态；所有阻塞决策写回后，`INV-002` 才能进入实现。

## 范围与非目标

范围：转仓单列表/新增/详情/审核/源仓出库/目标仓入库；其他出库单列表/新增/详情/审核/完成；其他入库单列表/新增/详情/审核/完成；库存流水、批次余额、成本快照和 fake CSV。

非目标：盘点、盘盈盘亏审核、成本调整、库存结转（`INV-003`）；加工、分拣配送、库存统计；销售出库、采购入库、客户退货入库和采购退采出库；真实打印、扫码、财务记账或生产接口。客户退货入库继续使用 `ORD-005` 的窄 public command，不由通用其他入库重复实现。

## 事实来源

- `docs/references/requirements/05-库存模块.md §2.3、§4.1～§4.3、§8 INV-01～INV-08、INV-14～INV-15`：流水字段、转仓/其他出入库字段、状态草图和库存规则。
- `docs/references/requirements/01-整体架构与首页.md §4～§5`：列表排序、分页、空状态和角色粗权限。
- `docs/references/requirements/08-设置模块.md §3.2 四、库存模块权限`：查看、管理、审核、删除转仓/其他出入库的权限名。
- `docs/product-specs/inventory.md`：`INV-001` 的基本单位、批次、FIFO、仓库/库位、成本和 command 边界；已确认的 `DEC-INV-001～015` 不能被本切片改写。
- `ARCHITECTURE.md`、`docs/FRONTEND.md`、`docs/RELIABILITY.md`、`docs/SECURITY.md`：分层、页面状态、fake adapter、幂等和安全边界。

## 前置门禁

- `INV-001` 已归档并有 passing 证据；库存 Repository、批次/FIFO、基本单位和公开 command 可复用。
- `PUR-002/003`、`ORD-004/005` 的既有真实业务来源不得被通用单据替代或重复扣增库存。
- 当前 active 目录只有本文件且 Harness 基线通过；本文件是 `INV-002` 唯一业务 active plan。
- 原文未定义的状态时点、成本、作废/删除、权限细分和跨域副作用必须先通过 `DEC-INV-016～025` 决定。

## 规格提取结果（ready）

| 子功能 | 原文事实 | 当前未定义、不可猜测内容 |
|---|---|---|
| 转仓 | 源仓、目标仓、时间、商品数量/批次；待审核→已审核→已出库→已入库；源仓和目标仓分两步 | 已按 `DEC-INV-016～019` 固定为独立页面、审核锁单、真实出库流水批次追溯、两步原子和版本校验 |
| 其他出库 | 仓库、报损/领用/赠品/其他、时间、商品数量、待审核→已审核→已完成 | 已按 `DEC-INV-017/020/022/023/024` 固定为审核并完成时 FIFO 出库、整单原子、待审核可删和角色权限 |
| 其他入库 | 仓库、盘盈/退货/赠品/其他、时间、关联单号、供应商、商品数量、待审核→已审核→已完成 | 已按 `DEC-INV-021/022/023/024/025` 固定为通用退货边界、成本快照、整单原子和纯库存副作用 |
| 通用页面 | 列表筛选全部/日期/关键字，刷新/导出/新增，详情查看 | 已按 `DEC-INV-016/024` 固定三路由、URL 筛选、30 条分页、CSV 全量和错误/权限态 |

## 验证路径

1. specification：逐行核对原文 §4.1～§4.3、全局列表规则、设置库存权限和 `INV-001` 公开 command；新增并解决 `DEC-INV-016～025`。
2. implementation（决策完成后）：Types/Schema/Repository → 转仓与其他出入库 Service → Mock 场景 → Store/路由/页面 → fake CSV。
3. 自动验证：状态机、两段转仓、库存守恒、FIFO/批次、成本、盘点/月结锁、幂等、版本冲突、删除/作废和权限。
4. 页面验证：normal、empty、error、slow、permission-denied、partial-failure、boundary、concurrent；区分真实 0、空值、unavailable 和禁止操作。
5. 黄金旅程：重置 → 新建转仓 → 审核 → 源仓出库 → 目标仓入库；新建其他入库/出库 → 审核/完成 → 核对余额和流水 → 重试同 requestId → 角色/失败/回退 → Mock reset 和干净重启。

## 实际验证证据

- `npm run verify:harness`：通过；45 个功能切片、278 个决策门、8 份领域规格、8 份需求快照通过。
- `npm run typecheck`：通过。
- `npm run test:run -- --pool=forks --maxWorkers=2`：73 个测试文件、343 项测试全部通过。
- `npm run build`：生产构建通过。
- `git diff --check`：通过。
- 浏览器桌面验收：三个 INV-002 路由 HTTP 200；1280px 无整页横向溢出；控制台无 warning/error；销售主管隐藏新增、导出并遮蔽敏感字段。
- 浏览器移动验收：约 390px 视口下三个页面 `document/body scrollWidth = 375`；仅主导航和库存二级导航内部滚动；筛选工具栏可换行；控制台无 warning/error。
- Mock reset 后重跑及干净启动结果与上述自动验证一致。

## 风险与阻塞

- 盘点锁和月结锁由 `operationLocks` provider 表达；INV-003 尚未提供管理页面，当前只验证锁定时 Service 明确拒绝。
- 页面仍是单行明细原型，复杂多行编辑和批次预览属于后续 UI 增强，但不能绕过本切片 Service 的 FIFO 与原子约束。

## 进度日志

- [x] 选择 `INV-002`：`INV-001` 已 passing，PUR-005 已归档，长期顺序下一项为 `INV-002`。
- [x] 阅读库存原文 §2.3、§4.1～§4.3、§8、全局列表/权限、库存领域规格与现有 Service/Repository。
- [x] 解决 `DEC-INV-016～025`，将 `INV-002` 从 source-only 升级为 ready；用户于 2026-08-20 确认全部推荐方案。
- [x] 实现领域核心、Runtime/UI、CSV、九场景自动证据和页面组件。
- [x] 运行最终 Harness/类型/全量测试/构建；`npm run verify` 通过（73 个测试文件、343 项测试），`git diff --check` 通过。
- [x] 用真实浏览器检查三个路由：均返回 200，1280px `scrollWidth=clientWidth`，正常/销售主管切换无控制台 warning/error，销售主管隐藏新增/导出。
- [x] 完成桌面与移动端布局、控制台、权限和场景验证，补充证据并准备归档。

## 开放决策

| 决策 ID | 阻塞主题 | 推荐方案摘要 | 状态 | 结论与写回位置 |
|---|---|---|---|---|
| `DEC-INV-016` | 路由、筛选 query、分页和 CSV | 三类独立页面；状态/日期/关键字写 URL；默认30条；CSV当前筛选全量 | decided | 2026-08-20 用户确认，写回 `inventory.md` 与 `index.md` |
| `DEC-INV-017` | 其他出入库审核、完成与库存变化时点 | 审核只锁单；审核并完成时写流水；转仓审核锁明细；每步失败整步不变 | decided | 2026-08-20 用户确认，写回 `inventory.md` 与 `index.md` |
| `DEC-INV-018` | 转仓两段确认、在途和中途失败 | 两个幂等 command；`shipped` 表示在途；目标入库成功后 `received`；单步与状态同事务 | decided | 2026-08-20 用户确认，写回 `inventory.md` 与 `index.md` |
| `DEC-INV-019` | 批次、库位、数量和 FIFO | 基本单位千分量；默认 FIFO；调整不得超过可用非过期库存；目标库位启用且归属正确 | decided | 2026-08-20 用户确认，写回 `inventory.md` 与 `index.md` |
| `DEC-INV-020` | 其他出库类型和边界 | 固定四类；过期/不足/盘点锁/月结锁拒绝；整单原子；完成后不可编辑 | decided | 2026-08-20 用户确认，写回 `inventory.md` 与 `index.md` |
| `DEC-INV-021` | 其他入库退货与 ORD-005 边界 | 通用退货需已有外部来源；客户退货只走 ORD-005；不得手工冒充 | decided | 2026-08-20 用户确认，写回 `inventory.md` 与 `index.md` |
| `DEC-INV-022` | 成本、金额和加权成本 | 出库 FIFO 成本；入库非负成本；金额按千分量×成本四舍五入到分；不重算加权成本 | decided | 2026-08-20 用户确认，写回 `inventory.md` 与 `index.md` |
| `DEC-INV-023` | 删除、作废与反向流水 | 仅待审核可删除；后续状态不可编辑/删除；历史流水不可修改，纠错走反向业务单据 | decided | 2026-08-20 用户确认，写回 `inventory.md` 与 `index.md` |
| `DEC-INV-024` | 五角色查看、管理、审核、删除、导出 | 管理员/仓库可管理审核删除导出；销售主管只读遮蔽成本金额且不可导出；业务员/财务拒绝 | decided | 2026-08-20 用户确认，写回 `inventory.md` 与 `index.md` |
| `DEC-INV-025` | Finance/订单/采购副作用 | 只写 Inventory 单据、流水和审计；不创建 Finance/订单/采购副作用；外部资料不可用显示 unavailable | decided | 2026-08-20 用户确认，写回 `inventory.md` 与 `index.md` |

## 中断恢复点

本计划已完成并准备归档：`DEC-INV-016～025` 已确认，领域事务、流水追溯、锁、权限、Mock、Store、路由、查询和页面自动测试已创建；自动验证、桌面/移动浏览器验收、Mock reset 和干净重启均有证据。后续从 `docs/design-docs/implementation-sequence.md` 的下一切片 `INV-003` 新建 active plan 恢复；任何新增未定义事实仍需登记 `DEC-*`，不得静默猜测。
