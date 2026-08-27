# INV-005 分拣与配送

- 类型：business-feature
- 功能：`INV-005`
- 风险等级：L3
- 当前阶段：verification
- 状态：completed
- 完成日期：2026-08-24
- 最近更新：2026-08-24

## 目标

实现待出库、订单分拣、波次分拣、配送任务、配送线路、车辆和分拣标签七类页面，并与既有订单审核、销售出库、发货、签收、应收及库存 FIFO 事实形成单一可追溯链路；分拣不得暗扣库存，配送不得重复形成发货、签收或应收。

## 范围与非目标

- 范围：`INV-005` 七个页面、分拣/波次/配送状态机、差异记录、线路车辆主数据、打印 fake adapter、共享 Order provider/command、权限和 L3 验收。
- 订单、销售出库、发货、签收、应收和短装差异继续由 Order/Finance 领域持有；Inventory 只保存分拣配送事实和跨域关联。
- 不实现真实地图、GPS、路径优化、司机移动端、电子围栏、物流商接口、打印机驱动、库存预占或装箱算法。
- 不提前实现 `INV-006` 库存统计，也不修改 `INV-004` 加工状态机。

## 事实来源

- `docs/references/requirements/05-库存模块.md §6.1～§6.7、§8 INV-10/15/16`：七类页面、字段、状态草图、差异与波次规则。
- `docs/references/requirements/01-整体架构与首页.md §2.1、§4～§5`：销售履约顺序、全局列表/表单和角色粗权限。
- `docs/references/requirements/08-设置模块.md §3.2 四`：查看待出库、订单/波次分拣、管理配送任务/线路/车辆/标签、确认发货和打印权限名。
- `docs/product-specs/orders.md` 的 `ORD-003/004`：审核、销售出库、短装差异、发货、签收和应收的 canonical owner。
- `docs/product-specs/inventory.md` 的 `INV-001～004`：基本单位千分量、FIFO、库位、盘点锁、月份锁、幂等和不可变流水。
- `engineering-constraint`：依赖保持 `Repository → Service → Store/Composable → View`；跨域只经 `public.ts` 窄接口并使用共享 Mock Runtime。

## 前置门禁

- [x] `INV-001`、`ORD-004` 依赖均有 completed 证据，核心销售流程 integration 为 passing。
- [x] active 目录原来为空，本计划是唯一业务 active plan。
- [x] 初始化基线通过：Harness、类型检查、78 个测试文件/380 项测试和生产构建。
- [x] 原始需求 §6.1～§6.7、INV-10/15/16 及设置细权限已逐项提取。
- [x] `DEC-INV-061～076` 已由用户于 2026-08-24 确认全部推荐，并已写回 ready 契约。

## 验证路径

- 从本次新建并审核的送货上门订单开始，创建订单分拣，录入匹配数量，显式确认销售出库，再创建配送任务、开始配送并完成；核对订单号、分拣单号、出库单号、配送任务号、发货记录和应收均可追溯且库存只扣一次。
- 从多张同仓订单创建波次，按 SKU 汇总拣货并分播到订单；核对汇总数量等于分播数量，订单不会同时进入个人分拣和另一活动波次。
- 差异旅程录入短拣，自动形成分拣差异，分别验证继续补拣与接受短装；接受短装后只由 Order canonical command 形成一次短装差异和一次库存出库。
- 验证旧版本、重复 requestId、并发占用订单/车辆、库存不足、过期批次、盘点/月结锁和跨订单批量发货中途失败均原子回滚。
- 代表性 1280px 浏览器旅程检查七入口、表单、宽表内部滚动、错误恢复、权限遮蔽和控制台；库存扩展批次的全量验证、Mock reset 和干净重启统一留到 `INV-006` 收尾。

## 风险与阻塞

- 分拣位于订单审核与确认出库之间，但原文没有定义是否预占或扣库存；若重复扣减会破坏 `ORD-004` 已验证守恒。
- `INV-10` 要求自动生成差异单，而 `ORD-004` 已有 canonical 短装差异；必须固定两者关联，避免两套退款/差异 owner。
- 配送任务包含“开始/完成”，既有 Order 已以确认发货形成应收、确认签收完成订单；必须固定配送动作的跨域时点。
- 波次要求先汇总拣货再分播，但原文未给短拣分配算法；自动猜测会改变客户实际发货数量。
- 司机和区域来源依赖尚未完成的设置资料；原型只能复用已有窄 provider，缺失时明确 unavailable。

## 进度日志

- [x] 读取 Harness 导航、架构、质量、计划、前端、可靠性和安全边界。
- [x] 运行 `./scripts/init.ps1`，基线 78 个测试文件/380 项测试与构建通过。
- [x] 提取七类原始页面、字段、状态及 `INV-10/15/16`，核对 `ORD-004` canonical 履约实现。
- [x] 建立 `DEC-INV-061～076` 集中决策门和推荐方案，未在确认前写业务代码。
- [x] 用户确认全部推荐方案，已写回 Inventory/Order 规格并将 `INV-005` 升级为 ready。
- [x] 完成分拣/波次/差异/线路/车辆/标签/配送实体、Schema、Service、Store 与共享 Order 协调接口。
- [x] 完成七个独立路由、库存二级导航前置入口、URL 筛选、30 条分页、全量 CSV、逐行实拣/分播、线路车辆维护、配送编辑和打印预览。
- [x] 专项与共享 Runtime 验证覆盖准确分拣、真实 0、短拣、波次来源冲突、混合差异、批量出库/发货回滚、配送任务修改、权限、标签幂等、partial/empty 和从零订单→分拣→出库→配送→发货→应收。
- [x] 浏览器 1280px 检查七路由均可见、无整页横向溢出、控制台无 warning/error；线路和车辆表单真实保存通过，证据 `docs/exec-plans/evidence/INV-005-pending-picking-1280.png`。
- [x] 最终 `npm run verify` 通过：Harness、类型检查、79 个测试文件/391 项测试和生产构建；仅保留既有 chunk size warning。
- [x] `git diff --check`、`npm run mock:reset`、干净停止/启动通过；七个 INV-005 路由均返回 HTTP 200。
- [x] 写回产品索引、总体顺序、计划现场和质量摘要；计划完成归档。

## 验证证据

- `src/features/inventory/services/inventory-picking-delivery.spec.ts`：准确单单分拣不暗扣库存、0/短拣、来源版本、波次差异守恒、跨域出库/发货原子回滚、配送编辑与车辆状态、权限、标签幂等及 partial/empty。
- `src/app/runtime/core-business-flows.spec.ts` 的 `FLOW-PICKING-001`：从本次新建并双审核的送货上门订单开始，准确分拣后只在 canonical Order 出库扣一次库存，配送开始形成 shipment 与 receivable，完成配送不自动签收。
- 同文件 `FLOW-PICKING-SHORT-001`：从本次新建订单录入真实 0，Inventory 差异回链唯一 Order canonical difference，待确认差异期间不重复进入分拣候选。
- 浏览器：七个路由在 1280px 与 390px 均渲染标题且 `scrollWidth === clientWidth`，控制台 0 warning/error；最终按 Harness 的 PC 门保留 1280px 关键截图，390px 只作额外非门禁检查。

## 开放决策

| 决策 ID | 缺失事实与证据 | 推荐方案及影响 | 阻塞范围 | 可安全继续 | 决定人 | 状态 | 结论与写回位置 |
|---|---|---|---|---|---|---|---|
| `DEC-INV-061` | 七页面路由、查询恢复、分页、导出和打印失败语义未定义 | 推荐七个独立路由、URL query、默认30条稳定分页、筛选全量 CSV；打印必须预览后走 fake adapter，取消/失败不计数 | 页面、导航、CSV/打印 | 原文字段静态契约 | 产品负责人/仓库/设计 | decided | 2026-08-24 用户确认全部推荐，结论写回 `docs/product-specs/inventory.md` 与 `orders.md`。 |
| `DEC-INV-062` | “已审核未出库”是否包含部分出库、订单能否同时进入个人/波次及来源变化未定义 | 推荐候选为 `approved/outbound-in-progress` 的剩余行；同一订单同一时刻只允许一个活动个人任务或波次，保存订单版本/行剩余快照，来源变化则冲突重载 | Order provider、候选和唯一性 | 只读订单快照 | 产品负责人/仓库 | decided | 2026-08-24 用户确认全部推荐，结论写回 `docs/product-specs/inventory.md` 与 `orders.md`。 |
| `DEC-INV-063` | 订单分拣待分拣/分拣中/完成的动作、取消删除、完成后纠错未定义 | 推荐 `pending→picking→completed`；只有 pending 可取消且保留审计，不物理删除；completed 不重开，订单后续剩余量可新建下一任务 | 状态机、按钮、历史 | 列表状态标签 | 产品负责人/仓库/审计 | decided | 2026-08-24 用户确认全部推荐，结论写回 `docs/product-specs/inventory.md` 与 `orders.md`。 |
| `DEC-INV-064` | 应拣口径、实拣 null/0、精度、超拣、库位批次和分拣是否改变库存未定义 | 推荐应拣取创建时订单待出基本量；null 未录、0 真实、千分定点、禁止超拣；库位/FIFO 只作实时建议并在确认出库重验，分拣不预占也不扣库存 | 明细、库存守恒、并发 | 商品/储位只读提示 | 产品负责人/仓库/技术负责人 | decided | 2026-08-24 用户确认全部推荐，结论写回 `docs/product-specs/inventory.md` 与 `orders.md`。 |
| `DEC-INV-065` | `INV-10` 分拣差异与 ORD-004 短装差异的 owner、处理动作和出库关系未定义 | 推荐 Inventory 自动保存分拣差异审计并保持 picking；可继续补拣或接受短装。显式“确认出库”才调用 Order command，接受短装时由 Order 只生成一次 canonical 短装差异并回链分拣差异 | 差异、出库、退款边界 | 匹配数量主路径 | 产品负责人/销售/仓库/财务 | decided | 2026-08-24 用户确认全部推荐，结论写回 `docs/product-specs/inventory.md` 与 `orders.md`。 |
| `DEC-INV-066` | 波次四种策略的筛选语义、仓库一致性、订单重复和截止时间边界未定义 | 推荐用户显式选择同一启用非禁售仓订单；策略只预筛候选：交货截止、地址区域、启用线路覆盖区、任一商品分类；不后台自动成波，截止时间不早于当前 | 波次创建、provider | 手工同仓选择 | 产品负责人/仓库/配送 | decided | 2026-08-24 用户确认全部推荐，结论写回 `docs/product-specs/inventory.md` 与 `orders.md`。 |
| `DEC-INV-067` | 波次汇总实拣如何分播、短拣分配、状态和取消未定义 | 推荐 `pending→picking→completed`，内部记录分播阶段；按 SKU 录汇总实拣后必须逐订单手工确认分配，默认按交货时间/订单号建议但不自动提交；汇总=分播，差异沿用 `DEC-INV-065` | 波次引擎、分播和守恒 | 汇总只读表 | 产品负责人/仓库 | decided | 2026-08-24 用户确认全部推荐，结论写回 `docs/product-specs/inventory.md` 与 `orders.md`。 |
| `DEC-INV-068` | 分拣完成后何时生成商品/箱/订单标签、箱数算法、模板、条码和重打计数未定义 | 推荐完成分播后按用户选择创建标签；订单标签默认每订单1张，商品/箱标签必须手填数量，不推导装箱；编号生成条码，预览后模拟打印，requestId 幂等累计份数 | 标签实体、预览/打印 | 标签列表字段 | 产品负责人/仓库/打印 | decided | 2026-08-24 用户确认全部推荐，结论写回 `docs/product-specs/inventory.md` 与 `orders.md`。 |
| `DEC-INV-069` | 待配送订单范围及三种配送方式是否都进入自营配送未定义 | 推荐仅已完整确认出库、已完成分拣、尚未发货且 `door-delivery` 的订单进入配送任务；物流配送和客户自提继续走既有 Order 发货入口，不伪造自营线路 | 配送候选和跨域范围 | 路线/车辆主数据 | 产品负责人/配送/销售 | decided | 2026-08-24 用户确认全部推荐，结论写回 `docs/product-specs/inventory.md` 与 `orders.md`。 |
| `DEC-INV-070` | 配送开始/完成是否等于发货/签收、应收时点及多订单失败语义未定义 | 推荐任务 `pending→delivering→completed`；开始配送原子调用每单 canonical 确认发货并形成既有应收，完成只结束配送任务、不自动签收；签收仍由 Order 明确确认，批量任一失败全回滚 | 配送状态、Order/Finance 事务 | pending 任务展示 | 产品负责人/配送/销售/财务 | decided | 2026-08-24 用户确认全部推荐，结论写回 `docs/product-specs/inventory.md` 与 `orders.md`。 |
| `DEC-INV-071` | 配送任务编辑取消、订单重复、线路/司机/车辆快照和时间校验未定义 | 推荐 pending 可版本化编辑/取消；开始后不可改订单/线路/司机/车辆，完成时间不早于实际出发；同一订单只能有一个非取消任务，保存全部快照 | 任务 Schema、并发和审计 | 基本列表 | 产品负责人/配送 | decided | 2026-08-24 用户确认全部推荐，结论写回 `docs/product-specs/inventory.md` 与 `orders.md`。 |
| `DEC-INV-072` | 线路编码、区域/站点字段、排序、停用删除和引用后编辑语义未定义 | 推荐系统日序列唯一编码；站点为名称+省市区+地址+顺序，至少1站；引用后禁删，停用不影响历史任务，编辑只影响未来任务快照 | 线路 CRUD、历史 | 名称/状态列表 | 产品负责人/配送 | decided | 2026-08-24 用户确认全部推荐，结论写回 `docs/product-specs/inventory.md` 与 `orders.md`。 |
| `DEC-INV-073` | 车辆类型闭集、载重精度、牌照唯一、状态变化、维修和容量校验未定义 | 推荐牌照企业内唯一；类型为小面/4.2米/7.6米/9.6米/其他，载重以整数千克保存并按吨显示；任务开始自动空闲→出车中，完成/取消恢复空闲，维修车不可派；重量缺失时显示 unavailable，不以估算重量阻塞 | 车辆 CRUD、派车并发 | 车辆列表字段 | 产品负责人/配送 | decided | 2026-08-24 用户确认全部推荐，结论写回 `docs/product-specs/inventory.md` 与 `orders.md`。 |
| `DEC-INV-074` | 司机与区域资料 owner 未实现，是否在 Inventory 自造员工/行政区未定义 | 推荐复用应用已有启用员工窄 provider 和订单地址快照；缺失 provider 明确 unavailable，不在 Inventory 建第二套员工/行政区主数据 | 司机选择、线路区域 | 手工文本快照展示 | 产品负责人/设置/技术负责人 | decided | 2026-08-24 用户确认全部推荐，结论写回 `docs/product-specs/inventory.md` 与 `orders.md`。 |
| `DEC-INV-075` | 五角色细权限、导出/打印、确认出库/发货和敏感地址可见性未定义 | 推荐管理员/仓库完整；销售主管只读且地址只显示省市区、不可导出/打印；业务员/财务拒绝。所有确认出库/发货仍同时通过 Order Service 权限 | 路由/UI/Service/数据遮蔽 | 管理员静态页 | 产品负责人/管理员/仓库 | decided | 2026-08-24 用户确认全部推荐，结论写回 `docs/product-specs/inventory.md` 与 `orders.md`。 |
| `DEC-INV-076` | requestId/version、波次/车辆竞争、跨域回滚、外部地图/打印和完成后反操作未定义 | 推荐全部写命令幂等+乐观锁；订单/车辆活动占用唯一；跨 Inventory/Order/Finance 原子回滚；完成事实不可改，真实地图/GPS/优化/打印机均明确 unavailable/fake | L3 可靠性、安全和恢复 | 只读历史 | 产品负责人/技术负责人/仓库 | decided | 2026-08-24 用户确认全部推荐，结论写回 `docs/product-specs/inventory.md` 与 `orders.md`。 |

## 中断恢复点

`INV-005` 已完成，不存在待恢复实现。最终证据为 Harness 通过、79 个测试文件/391 项测试、生产构建、diff、Mock reset、干净启动和七路由 HTTP 200；浏览器七页面 1280px 无整页溢出、控制台无 warning/error。下一切片是仍为 source-only 的 `INV-006`，必须新建 active plan、从 `docs/references/requirements/05-库存模块.md §7` 提取规格并完成决策门，不能沿用本计划直接编码。
