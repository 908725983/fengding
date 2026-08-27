# INV-006 库存统计

- 类型：business-feature
- 功能：INV-006
- 风险等级：L1
- 当前阶段：verification
- 状态：completed
- 完成日期：2026-08-24
- 最近更新：2026-08-24

## 目标

把库存原文 §7 的四张报表整理为同一库存事实口径：进销存统计、按仓库进销存汇总、出入库汇总、库存收发仓库统计。报表必须从不可变库存移动、成本调整历史和库存结转快照计算，不能从页面临时数组、采购/订单累计状态或当前库存倒填历史结果。

## 范围与非目标

范围包括四报表的原文字段、日期/仓库/商品分类筛选、统计卡片、稳定分页、URL 恢复、角色与金额遮蔽、normal/empty/error/permission-denied/partial-failure/boundary 场景，以及库存扩展批次收尾验证。

原文未要求导出，本切片不增加 CSV/Excel；不新增库存移动类型，不改变盘点、转仓、加工、销售出库、采购入库或退货规则；不建设独立 BI、图表、同比环比、跨组织数据仓库，也不修改历史主数据。`slow` 复用共享异步基础设施；只读报表不制造 `concurrent` 写冲突和 `unavailable` 外部能力。

## 事实来源

- `docs/references/requirements/05-库存模块.md §7.1～§7.4`：四报表名称、筛选、统计卡片和字段。
- `docs/references/requirements/01-整体架构与首页.md §4～§5`：30 条分页、空状态和五角色粗权限。
- `docs/references/requirements/08-设置模块.md §3.1.3 四`：查看进销存统计、查看出入库汇总权限名；原文没有库存统计导出权限。
- `docs/product-specs/inventory.md` 的 `INV-001～005`：基本单位、流水成本、转仓、盘点、成本调整、结转、加工、分拣配送和金额遮蔽的已确认事实。
- `ARCHITECTURE.md`、`docs/FRONTEND.md`、`docs/RELIABILITY.md`、`docs/SECURITY.md`：只提供分层、只读报表风险、页面状态和原型安全边界，不补造统计业务口径。

## 前置门禁

- `INV-002/003/004/005` 均有 completed 计划和 passing 证据。
- 开工时 `docs/exec-plans/active/` 只有 `.gitkeep`；本文件是唯一业务 active plan。
- 用户于 2026-08-24 确认 `INV-006` 全部按推荐方案执行；`DEC-INV-077～085` 已写回为 `decided`，`INV-006` 达到 `ready`。

## 验证路径

1. specification：逐行核对原文 §7、全局列表/角色规则、设置权限和库存既有事实，确认九项会改变统计结果的产品决策。
2. implementation：`Types → Query Schema → Repository 单次快照 → Statistics Service → Store → 单路由四 Tab UI`；不得让 View 直接读 fixture。
3. 自动验证：日期端点、全部实际移动类型、反向移动、转仓双向、成本调整、结转校验、单据去重、当前商品资料降级、零值、合计不受分页影响、权限和一次快照一致性。
4. 页面验证：一个代表性 1280px 页面覆盖四 Tab、URL 恢复、normal/empty/error/retry/permission-denied/partial-failure/boundary、键盘和控制台。
5. 黄金旅程：Mock reset 后从本次新建的库存业务事实开始，至少形成入库、出库、转仓和成本调整，核对 SKU、仓库及卡片数量/金额守恒；随后执行库存扩展批次收尾的全量验证、Mock reset 和干净重启。

## 风险与阻塞

- `OpeningBalance` 现有 fixture 与完整移动流水不是同一套可复算事实，直接混用会令期初、期末和当前库存不守恒。
- 成本调整不生成数量移动；若只汇总流水金额，期末金额会遗漏价值变化。
- 一次业务命令可能因多个 SKU/批次产生多条移动，直接按移动行计数会把“单据笔数”放大。
- 商品分类、名称和单位目前由当前商品 provider 提供，历史分类快照不存在；必须明确资料变更和 provider 失败时的语义。
- 仓库报表把不同 SKU 的基本单位数量相加，原文要求该指标但其业务含义有限，页面必须明确这是跨品项基本数量合计。

## 进度日志

- [x] 从长期顺序恢复 `INV-006`，确认依赖 passing、active 为空并保留现有未提交工作。
- [x] 阅读原始库存 §7、全局列表/权限、设置细权限、库存规格、计划/可靠性/前端/安全约束及采购统计参考实现。
- [x] 建立唯一 active plan，并提取四报表原文字段与九项统计口径缺口。
- [x] 运行 `./scripts/init.ps1`：Harness 45 个功能切片/338 个决策门、类型检查、79 个测试文件/391 项测试和生产构建通过；仅有既有 chunk size warning。
- [x] 用户确认 `DEC-INV-077～085` 全部推荐方案；已写回规格并把 `INV-006` 升为 ready。
- [x] 完成统计 Types、单次 Repository 快照查询、Service、Store、路由和单页四 Tab；View 未直接读取 fixture。
- [x] 增加 2 个专项测试文件、11 项测试，覆盖日期边界、全部移动事实、反向与转仓、成本调整、结转冲突、单据去重、商品资料降级、分页合计和金额权限。
- [x] 真实浏览器验证四 Tab 的字段/行数/URL，1280px 整页宽度 `1265 = 1265` 无横向溢出；验证 normal/empty/error/permission-denied/partial-failure 和销售主管金额遮蔽，控制台无 warning/error。
- [x] Mock reset 后执行干净初始化：Harness、类型检查、81 个测试文件/402 项测试和生产构建通过；仅保留既有 chunk size warning。
- [x] 修复全量门禁发现的第 52 份局部场景/角色控制条：统计页不再复制原型控制，继续消费应用级共享库存 Runtime；Harness 恢复通过。
- [x] 干净启动 `http://127.0.0.1:5180` 后，库存统计路由恢复 4 个报表入口和 3 行基线数据，浏览器控制台无 warning/error。
- [x] 当前步骤：完成最终文档审计并归档；下一批为 `FIN-004 + FIN-005` 资金扩展。

## 完成证据

- 专项自动验证：`npx vitest run src/features/inventory/services/inventory-statistics.spec.ts src/features/inventory/views/InventoryStatisticsView.spec.ts --pool=forks --maxWorkers=1`，2 个测试文件/11 项测试通过。
- 批次全量验证：Mock reset 后运行 `./scripts/init.ps1`，Harness 45 个功能切片/338 个决策门、类型检查、81 个测试文件/402 项测试及生产构建通过；构建仅有既有大 chunk 提示。
- 代表性浏览器：四 Tab 分别显示 12/7/10/8 个约定字段，URL 保存报表和筛选；1280px 下 `scrollWidth=clientWidth=1265`；normal、empty、error/retry、permission-denied、partial-failure、销售主管金额遮蔽均按契约呈现，控制台无 warning/error。
- 数据与重启：报表从不可变移动、成本历史和结转快照计算；Mock reset 后干净启动再次打开 `/inventory/statistics`，4 个报表入口、3 行基线统计和控制台干净均可重复。
- 完成边界：原始需求没有导出权限，页面不增加导出；已结束未结转期间只警告，快照冲突整份 unavailable；仓库跨 SKU 数量明确标注为“跨品项基本数量合计”。

## 开放决策

| 决策 ID | 缺失事实与证据 | 推荐方案及影响 | 阻塞范围 | 可安全继续 | 决定人 | 状态 | 结论与写回位置 |
|---|---|---|---|---|---|---|---|
| `DEC-INV-077` | 原文只有“统计时间范围/日期范围”，未定义默认值、时区和端点 | 推荐 Asia/Shanghai 自然日，起止日均包含；默认当月 1 日至 Mock 当前日，开始不得晚于结束 | 查询 Schema、默认结果、边界测试 | 页面骨架 | 产品负责人/仓库 | decided | 2026-08-24 用户确认；写回 `inventory.md`、`index.md`。 |
| `DEC-INV-078` | 原文未说明哪些来源、作废反向流水和转仓是否进入收发 | 推荐只纳入已实际落库的不可变 `InventoryMovement`；按其方向统计全部销售/采购/退货/转仓/盘点/其他/加工事实，反向流水按真实方向纳入；转仓在来源仓算出库、目标仓算入库 | 四报表数量与金额 | 字段映射 | 产品负责人/仓库/财务 | decided | 2026-08-24 用户确认；写回 `inventory.md`、`index.md`。 |
| `DEC-INV-079` | 期初/期末与结转快照、现有 `OpeningBalance`、历史流水发生冲突时没有优先级 | 推荐不可变移动账本为数量唯一来源；期初为开始日前累计净移动，期末为结束日累计净移动；已结转月末必须与 closing snapshot 一致，不一致则整份报表 unavailable，禁止静默挑一个结果 | 历史数量、结转一致性 | 当前筛选 UI | 产品负责人/仓库/技术负责人 | decided | 2026-08-24 用户确认；写回 `inventory.md`、`index.md`。 |
| `DEC-INV-080` | 原文未定义金额公式，也未说明无数量移动的成本调整 | 推荐每条出入库金额=`quantityMilli×movement.costPerBaseUnitCents÷1000` 四舍五入到分；期初/期末价值按累计移动金额并叠加生效的 `InventoryCostHistory.valueDeltaCents`；成本调整只影响期初/期末，不伪装为入库或出库 | 四报表金额与守恒 | 纯数量字段 | 产品负责人/仓库/财务 | decided | 2026-08-24 用户确认；写回 `inventory.md`、`index.md`。 |
| `DEC-INV-081` | 多 SKU/批次移动如何计算入库/出库笔数未定义 | 推荐同一方向、仓库、`requestId` 计一笔；一个请求产生的多行/多批次不重复计数，转仓出入两端分别计一笔 | 仓库汇总和统计卡片 | SKU 数量金额 | 产品负责人/仓库 | decided | 2026-08-24 用户确认；写回 `inventory.md`、`index.md`。 |
| `DEC-INV-082` | SKU 单位与仓库跨商品数量合计的口径未定义 | 推荐 SKU 行统一按已确认的基本单位展示；仓库/卡片按原文累加基本单位毫数量，并明确标注“跨品项基本数量合计”，不伪装成可换算的单一物理单位 | 单位列、仓库数量、统计卡片 | 金额汇总 | 产品负责人/仓库 | decided | 2026-08-24 用户确认；写回 `inventory.md`、`index.md`。 |
| `DEC-INV-083` | 当前商品改名/换分类/删除后，历史统计使用何种资料未定义 | 推荐移动事实保持历史不变，名称、规格、单位和分类筛选读取当前商品主数据；商品缺失时保留 SKU ID 并标记资料不可用，分类筛选不把未知资料静默归入其他分类 | 商品列、分类筛选、partial-failure | 仓库汇总 | 产品负责人/商品负责人 | decided | 2026-08-24 用户确认；写回 `inventory.md`、`index.md`。 |
| `DEC-INV-084` | 全零 SKU、停用仓库、无期间移动但有期初/期末库存的行是否显示未定义 | 推荐任一期初/入/出/期末数量或金额非零即显示；全部为零的行省略；停用仓库和已删除商品的历史事实仍保留，仓库筛选列出有历史事实的仓库 | 行集合与空态 | 非零结果 | 产品负责人/仓库 | decided | 2026-08-24 用户确认；写回 `inventory.md`、`index.md`。 |
| `DEC-INV-085` | 已结束但未结转期间能否查看、补录后结果是否冻结未定义 | 推荐允许查看并显示“未结转，结果可能变化”；已结转月份显示“已结转”并校验快照；报表本身只读，不自动结转、不冻结、不补造历史 | 历史状态提示、结转校验 | 当前月报表 | 产品负责人/仓库/财务 | decided | 2026-08-24 用户确认；写回 `inventory.md`、`index.md`。 |

## 中断恢复点

`INV-006` 已完成 audit：专项、全量、真实浏览器、Mock reset 和干净启动证据均通过；局部原型控制重复已按 Harness 门禁消除。若归档动作中断，只需更新 `PLANS.md`、`QUALITY_SCORE.md`、`implementation-sequence.md`，再把本文件移至 `completed/` 并运行 `npm run verify:harness` 与 `git diff --check`；不得重跑已经通过的全量验证。
