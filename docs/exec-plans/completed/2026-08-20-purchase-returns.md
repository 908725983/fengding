# 采购退单

- 类型：business-feature
- 功能：PUR-003
- 当前阶段：verification
- 状态：completed
- 完成日期：2026-08-20
- 最近更新：2026-08-20

## 目标

从采购退单原文、`PUR-002` 采购订单/实际入库事实、`INV-001` 库存出库 command 和 `FIN-002` 供应商应付贷项 command 提取采购退单的可编码契约。先固化来源关联、数量金额、三重状态、退采出库、应付冲减、退款义务、作废、权限、幂等和跨域回滚；决策写回前不创建采购退单实体、库存流水、应付贷项、Mock 数据或页面。

## 范围与非目标

范围：`PUR-003` 采购退单列表、新增/详情、审核、部分/完整退采出库、三重状态、库存扣减和供应商应付贷项交接。

非目标：采购统计（`PUR-005`）、通用其他出库（`INV-002`）、供应商退款实际到账/其他收支（`FIN-004`）、直送执行 provider、真实供应商/银行接口、发票税务与生产打印上传。

## 事实来源

- `docs/references/requirements/04-采购模块.md §2.4、§5、§7 PUR-06～07`：退单列表/表单字段、库存扣减、建议关联原采购单与三重状态。
- `docs/references/requirements/01-整体架构与首页.md §4～§5`：全局列表、详情、表单和五角色矩阵。
- `docs/references/requirements/08-设置模块.md §3.1.3`：采购退单查看、管理、审核、作废、打印、导出权限名。
- `docs/product-specs/procurement.md PUR-002`：采购订单、实际入库、成交价/单位/赠品/优惠与费用快照。
- `docs/product-specs/inventory.md INV-001`：基本单位千分量、FIFO、库存不足、批次/库位和幂等出库 command。
- `docs/product-specs/finance.md FIN-002`：Finance 唯一 owner 的不可变供应商应付贷项，先冲待付、超出形成退款义务。
- `docs/RELIABILITY.md`、`docs/SECURITY.md`：分层、原子事务、确定场景、权限与 fake adapter 约束。

## 前置门禁

- [x] `PUR-002` 已完成采购订单、部分/完整入库和入库事实。
- [x] `INV-001` 已提供库存出库 command；不得直接改库存 Repository。
- [x] `FIN-002` 已提供供应商应付贷项 command；不得在采购域复制应付余额。
- [x] `npm run verify` 基线通过：45 个功能切片、239 个决策门、68 个测试文件/315 项测试、类型检查和构建。
- [x] 用户于 2026-08-20 确认 `PUR-003` 全部按推荐方案执行；`DEC-PUR-001、047～060` 已写回采购规格和产品索引，切片达到 ready。

## 验证路径

规格阶段：逐项追踪采购 §2.4/PUR-06～07、`PUR-002` 入库行、`INV-001` 出库和 `FIN-002` 贷项；所有缺失行为进入唯一决策表。

实现阶段（决策完成后）：Types → Schema → Repository → Service → 跨域 coordinator → Mock/Store → View；验证数量/金额守恒、三重状态、部分出库、库存不足、应付冲减、退款义务、作废、requestId 幂等、expectedVersion 冲突和三域回滚。

验收阶段：normal、empty、error、slow、permission-denied、partial-failure、unavailable、concurrent、boundary；1280px 列表/详情/表单，完整“已入库采购单→退单→审核→部分/完整出库→贷项/退款投影”黄金旅程，控制台、Mock reset 和干净重启。

## 风险与阻塞

- 原文“建议关联”与“退货量≤已入库量”冲突；无来源无法可靠校验数量或应付贷项。
- 原文退单单价可填写，但没有说明原成交价、优惠/其他费用和赠品如何回退；金额规则必须人工确认。
- 三重状态没有完成条件；库存出库、贷项和供应商退款若局部成功会破坏库存/资金守恒。
- `FIN-004` 尚未实现供应商退款到账；不能把退款义务伪装成已退款或资金收入。
- 直送采购没有执行事实和库存来源；不能用普通库存退采冒充直送退单。

## 进度日志

- [x] `FIN-002` 已完成归档，长期顺序确认下一切片为 `PUR-003`。
- [x] 阅读采购 §2.4/§5/§7、全局权限、设置细权限以及 `PUR-002`/`INV-001`/`FIN-002` 公开契约。
- [x] 提取 source-only 字段、状态、跨域、Mock 与验收候选，登记 `DEC-PUR-001、047～060`。
- [x] 用户确认全部推荐方案，逐项固化来源关联、金额、三重状态、跨域原子性、权限、并发和验收契约。
- [x] 完成 Types/Schema/Repository/Service：来源快照、可退量、金额尾差、三重状态、作废、幂等与版本冲突。
- [x] 完成跨域 coordinator：Inventory FIFO 批量出库、Finance 多入库 FIFO 贷项、退款义务投影和三域快照回滚。
- [x] 完成 Store、九场景、列表/新增/详情、审核、部分/完整出库、CSV、fake 打印和五角色边界。
- [x] 完成自动、1280×800 浏览器、Mock reset、控制台和干净重启验收；当前步骤为归档本计划。

## PUR-003 验证证据（2026-08-20）

- 自动证据：`npm run verify` 通过 Harness 45 个功能切片/253 个决策门、类型检查、69 个测试文件/321 项测试和生产构建；`git diff --check` 通过。
- 领域规则：聚焦测试覆盖来源必须实际入库、累计超量拒绝、编号与 requestId 幂等、金额尾差、部分/完整出库、多入库 FIFO 贷项、待付冲减、已付形成退款义务、版本冲突、作废边界，以及贷项失败时采购/库存/Finance 三域恢复。
- 页面与场景：Store/页面统一支持 `normal/empty/error/slow/permission-denied/partial-failure/unavailable/concurrent/boundary`；未知贷项 provider 明确 unavailable，不显示为 0 或成功。
- 浏览器黄金旅程（本地 `http://127.0.0.1:5176`，1280×800）：同一 SPA 内完成 `PO260810000001` 新增→审核→2 件入库→`CGTH-260810-00001` 新增→审核→1+1 两次退采出库；最终显示已完成/已出库/无需退款，两次各 1 条库存流水和 1 条 Finance 贷项。页面无整页横向溢出，宽表仅内部滚动，控件重叠为 0，控制台 warning/error 为 0。
- 权限复核：浏览器发现销售主管仍可见 fake 打印/导出，已收紧为只读金额；复核时审核、出库、打印、导出均不可见，管理员/仓库保留完整操作。
- Mock reset：重置前后 `mock/fixtures/baseline.json` 与 `work/mock-state.json` SHA-256 均为 `30D11134C851990C05240731089FF56589073374BCA3718BD14C2CBED6E745E9`。
- 干净重启：停止原开发服务并在 `http://127.0.0.1:5177` 新启动后，`/procurement/purchase-returns` 恢复 0 条基线；1280px 宽度守恒且控制台无错误。

## 开放决策

| 决策 ID | 推荐方案 | 主要影响 | 决定人 | 状态 | 结论与写回位置 |
|---|---|---|---|---|---|
| `DEC-PUR-001` | 每张退单必须关联一张已有实际入库的采购单；可退量按原单各行累计有效入库减已生效退采计算 | 来源追踪、数量上限、应付关联 | 产品负责人/采购/仓库 | decided | 2026-08-20 用户确认 PUR-003 全部按推荐方案执行；写回 `procurement.md` 与本计划。 |
| `DEC-PUR-047` | 保存供应商、原采购单/仓库、商品/单位/价格和操作者快照；编号 `CGTH-YYMMDD-#####`，不删除 | 实体、编号、历史回显 | 产品负责人/采购 | decided | 2026-08-20 用户确认全部推荐；写回 `procurement.md` 与本计划。 |
| `DEC-PUR-048` | 退单金额按原入库成交价及其优惠/其他费用累计比例回退，末次承接分尾差；赠品金额为 0，不开放任意改价 | 金额、贷项、赠品 | 产品负责人/财务/采购 | decided | 2026-08-20 用户确认全部推荐；写回 `procurement.md` 与本计划。 |
| `DEC-PUR-049` | 工作流 `pending-review/approved/completed/voided`、出库 `not-shipped/partially-shipped/shipped`、退款 `not-required/pending/refunded` 并行；全量出库和贷项完成即业务 completed | 三重状态和完成条件 | 产品负责人/采购/仓库/财务 | decided | 2026-08-20 用户确认全部推荐；写回 `procurement.md` 与本计划。 |
| `DEC-PUR-050` | 审核后允许多次部分出库；从原采购目标仓选择启用库位，按 INV-001 FIFO 扣减，累计不得超退单量且库存不足整体拒绝 | 库存、批次、部分出库 | 产品负责人/仓库 | decided | 2026-08-20 用户确认全部推荐；写回 `procurement.md` 与本计划。 |
| `DEC-PUR-051` | 每次退采出库与对应 Finance 贷项及采购状态在同一 coordinator 原子提交；任一失败恢复三域快照 | 跨域事务和失败恢复 | 产品负责人/财务/仓库/技术负责人 | decided | 2026-08-20 用户确认全部推荐；写回 `procurement.md` 与本计划。 |
| `DEC-PUR-052` | 一张采购单多次入库时，退量按有效入库时间 FIFO 分配到应付分录，同一分录不超原数量/金额 | 多入库贷项归属和守恒 | 产品负责人/财务/采购 | decided | 2026-08-20 用户确认全部推荐；写回 `procurement.md` 与本计划。 |
| `DEC-PUR-053` | 贷项只冲待付时显示无需退款；超出形成 pending 退款义务，实际到账与 refunded 留 `FIN-004`，当前明确 unavailable | 退款状态和范围边界 | 产品负责人/财务 | decided | 2026-08-20 用户确认全部推荐；写回 `procurement.md` 与本计划。 |
| `DEC-PUR-054` | 直送退单在直送执行 provider 完成前保持 unavailable，不创建普通库存出库或虚构退单事实 | 直送与统计边界 | 产品负责人/采购/仓库 | decided | 2026-08-20 用户确认全部推荐；写回 `procurement.md` 与本计划。 |
| `DEC-PUR-055` | 管理员/仓库完整管理、审核、出库、打印导出；销售主管只读金额；业务员/财务拒绝，资金结果在 Finance 页面查看 | 五层权限和敏感数据 | 产品负责人/管理员/仓库/财务 | decided | 2026-08-20 用户确认全部推荐；写回 `procurement.md` 与本计划。 |
| `DEC-PUR-056` | 默认创建时间倒序、30条分页、筛选写 URL；导出当前筛选 UTF-8 CSV，详情 fake 打印；原文无导入，不新增 | 查询、导出、打印 | 产品负责人/采购 | decided | 2026-08-20 用户确认全部推荐；写回 `procurement.md` 与本计划。 |
| `DEC-PUR-057` | 所有写命令 requestId 幂等，状态命令带 expectedVersion；编号不复用，过期查询丢弃，日志保存原因和来源 ID | 并发、重试、审计 | 产品负责人/技术负责人 | decided | 2026-08-20 用户确认全部推荐；写回 `procurement.md` 与本计划。 |
| `DEC-PUR-058` | 复用唯一 baseline 和九场景；partial-failure 验证三域回滚，unknown provider 显示 unavailable，reset 哈希一致 | Mock 与可信验收 | 产品负责人/技术负责人 | decided | 2026-08-20 用户确认全部推荐；写回 `procurement.md` 与本计划。 |
| `DEC-PUR-059` | 数量按采购单位正整数并保存基本单位千分量；行备注≤200、整单备注≤500；日期不得未来，所有上限由 Service 重验 | Schema、输入边界 | 产品负责人/采购/仓库 | decided | 2026-08-20 用户确认全部推荐；写回 `procurement.md` 与本计划。 |
| `DEC-PUR-060` | 待审核或已审核且未出库可填写原因整单作废；已有任何有效出库/贷项后不可作废，本切片不实现反向退采 | 作废、副作用和后续更正 | 产品负责人/采购/仓库/财务 | decided | 2026-08-20 用户确认全部推荐；写回 `procurement.md` 与本计划。 |

## 中断恢复点

`PUR-003` 已完成实现和归档准备：规格、领域核心、Inventory/Finance 公开 provider 交接、九场景、权限、自动回归、1280×800 黄金旅程、Mock reset 与干净重启均有证据。下一切片按长期顺序为 `PUR-005` 采购统计；必须新建 active plan 并从 `04-采购模块.md §6` 提取 source-only 规格，不在本计划扩写统计口径、`FIN-004`、`INV-002` 或直送执行。
