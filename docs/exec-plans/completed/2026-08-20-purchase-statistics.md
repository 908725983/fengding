# PUR-005 采购统计

- 类型：business-feature
- 功能：PUR-005
- 当前阶段：verification
- 状态：completed
- 完成日期：2026-08-20
- 最近更新：2026-08-20

## 目标

把采购原文 §6 的五张统计报表整理为可追溯、可计算且不依赖 AI 猜测的契约。统计必须区分采购下单事实、实际入库事实和实际退采出库事实，固定日期端点、状态纳入、快照、单位、金额、正负、权限、一致性和 unavailable 语义；全部阻塞决策写回且 `PUR-005` 达到 `ready` 后才允许创建统计代码。

## 范围与非目标

范围包括采购订单明细、采购订单汇总-按供应商、采购出入库明细、采购出入库汇总-按商品、采购出入库汇总-按供应商；包括筛选、URL 恢复、分页、合计、CSV fake 导出、五角色权限、九类 Mock 场景和 1280px 验收。

直送供应统计仍属于 `PUR-004` 的 unavailable 边界；通用其他出入库、采购预测、供应商绩效、库存成本重算、Finance 资金统计、任意二维表/BI、真实 Excel 和生产分析数据库不在本切片。统计是只读能力，不创建、修改、审核、入库、出库、应付或退款。

## 事实来源

- `docs/references/requirements/04-采购模块.md §6`：五张报表的名称、筛选、列和合计。
- `docs/references/requirements/01-整体架构与首页.md §4～§5`：默认排序、30 条分页、空状态和五角色粗权限。
- `docs/references/requirements/08-设置模块.md §3.1.3`：查看采购统计、导出采购统计权限名。
- `docs/product-specs/procurement.md`：`PUR-002/003` 已确认的订单、实际入库、退采出库、单位、优惠/费用、状态和权限事实。
- `docs/product-specs/products.md`：SKU、条码、分类、多单位和快照边界。
- `docs/product-specs/inventory.md`：库存流水只表达实际移动，数量使用基本单位千分量。
- `ARCHITECTURE.md`、`docs/FRONTEND.md`、`docs/RELIABILITY.md`、`docs/SECURITY.md`：只提供分层、一致性、页面状态、fake 输出和隐私约束，不补造统计口径。

## 前置门禁

- `PUR-002`、`PUR-003` 已完成归档并有实际入库、部分/完整退采出库、金额分配和跨域回滚证据。
- 开工时 active 目录只有 `.gitkeep`；本文件是唯一业务 active plan。
- 2026-08-20 运行 `./scripts/init.ps1`：Harness 45 个切片/253 个决策门、类型检查、69 个测试文件/321 项测试和生产构建通过；仅有既知 chunk size 警告。
- 用户于 2026-08-20 确认 `PUR-005` 全部按推荐方案执行；`DEC-PUR-061～075` 已写回，切片达到 ready，允许进入 implementation。

## 验证路径

1. specification：逐行核对原文 §6、全局列表规则、设置权限和 `PUR-002/003` 已有字段；确认 `DEC-PUR-061～075` 并把 `PUR-005` 升级为 ready。
2. implementation：`Types → Schema/Query → 入库事实记录补强 → 一次 Repository snapshot → Statistics Service → Store → UI → fake CSV`。
3. 自动验证：状态纳入、日期端点、历史快照、单位换算、优惠/费用分配、部分入库、部分退采、正负方向、分组去重、合计不受分页影响、权限和并发刷新。
4. 页面验证：normal、empty、error、slow、permission-denied、partial-failure、unavailable、concurrent、boundary；真实 0、空值、`—` 和 unavailable 分开。
5. 黄金旅程：重置 → 创建并审核采购单 → 两次部分入库 → 创建退单并两次部分出库 → 核对五报表守恒 → CSV/权限/故障 → 1280px/键盘/控制台 → Mock 重置和干净重启。

## 风险与阻塞

- `PurchaseOrder` 目前只有累计入库量，不能据此伪造每次出入库时间、单号、仓库和金额；实现前必须持久化真实入库事实记录。
- 原文“数量/包装数量/单位”没有说明单位方向，直接按常见 ERP 解释会造成汇总不可复算。
- 原文没有说明作废/取消订单、待审核订单是否进入统计，也没有说明退采数量和金额的正负方向。
- 订单级优惠和其他费用若不稳定分摊到行，订单汇总与出入库汇总无法守恒。
- 商品条码和分类不在现有采购订单行快照中；使用当前主数据会改写历史，空字符串又会伪装为真实空值。
- 五角色粗权限与既有采购切片的销售主管只读规则不同，必须在 Service 和导出层明确固定。
- 页面 rows 与 totals 若分次读取，入库/退采并发时会显示两个版本。

## 进度日志

- [x] 从长期顺序恢复 `PUR-005`，确认依赖 passing、active 为空且保留现有未提交工作。
- [x] 阅读 Harness 导航、架构、计划、质量、前端、可靠性、安全、采购规格、原始 §6、全局列表规则和设置采购统计权限。
- [x] 运行 `./scripts/init.ps1`，基线全部通过。
- [x] 在采购规格写入五报表的直接事实、候选事实源、字段缺口和验收边界；未改业务代码或 Mock 数据。
- [x] 在唯一决策目录登记 `DEC-PUR-061～075` 推荐方案。
- [x] 用户确认推荐方案，已写回决定并将 `PUR-005` 升级为 ready。
- [x] 实现真实入库记录、只读统计核心、Runtime/UI、CSV 和九场景。
- [x] 自动、浏览器、Mock reset、布局、控制台和干净重启验收完成。

## 完成证据

- `npm run verify:harness`：45 个功能切片、268 个决策门、8 份领域规格和 8 份需求快照通过。
- `npm run typecheck`：通过。
- `npx vitest run src/features/procurement/statistics/service.spec.ts src/features/procurement/views/PurchaseStatisticsView.spec.ts`：2 个测试文件、9 项测试通过。
- `npm run test:run`：71 个测试文件、330 项测试通过。
- `npm run build`：生产构建通过；仅有既有 chunk size warning。
- `git diff --check`：通过。
- `npm run mock:reset`：`mock/fixtures/baseline.json` 与 `work/mock-state.json` SHA-256 均为 `30D11134C851990C05240731089FF56589073374BCA3718BD14C2CBED6E745E9`。
- 浏览器：`http://127.0.0.1:5176/procurement/statistics` 显示五个 Tab、URL 可恢复筛选、空/不可用/权限态和 CSV 控件；1280px 下 `scrollWidth=clientWidth=1265`，无整页横向溢出，控制台无应用错误。

## 开放决策

| 决策 ID | 阻塞主题 | 推荐方案摘要 | 状态 | 结论与写回位置 |
|---|---|---|---|---|
| `DEC-PUR-061～075` | 路由、状态、日期、快照、单位、金额、真实移动、汇总、权限和一致性 | 全部采用推荐方案 | decided | 2026-08-20 写回 `docs/product-specs/index.md`、`docs/product-specs/procurement.md` 与本计划。 |

## 中断恢复点

`PUR-005` 已完成 verification：真实采购入库记录、退采出库单号、一次 Repository snapshot 统计、五 Tab 页面、URL 筛选、权限、CSV、九场景和自动/浏览器验收均已完成。不得扩大到直送、其他出入库或资金统计。
