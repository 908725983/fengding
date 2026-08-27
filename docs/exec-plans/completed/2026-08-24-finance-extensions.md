# FIN-004 + FIN-005 资金扩展批次

- 类型：business-batch
- 功能：`FIN-004,FIN-005`
- 风险等级：L3
- 当前阶段：verification
- 状态：completed
- 最近更新：2026-08-25
- 完成日期：2026-08-25

## 目标

在 Finance 唯一 owner 和应用级共享 Mock Runtime 内补齐原始资金需求的退款、转账、其他收支、机构收款和资金统计。所有账户变化必须来自不可变资金流水，退款继续复用 `ORD-005/FIN-001` 已有贷项与退款对象，不能再造第二套退款状态机；统计只消费已确认的 canonical 资金事实。

## 范围与非目标

范围为 `07-资金模块.md §4.5～§4.6、§5.4～§5.5、§6～§9` 及 `FIN-05/07/08/10/11`：通用退款查询与更正边界、拉新提现、账户转账、其他收款/付款及其明细汇总、机构收款、四张资金统计；同时复核设置中的资金细权限和全局五角色。

本批次不接真实银行、支付、提现或文件上传，不建设后端会计总账、发票、税务、复式记账、跨币种、手续费、汇率、多租户结算或未在原文定义的独立 BI。`ORD-005` 已实现的客户退单退款只做复用和回归，不复制实体或改变其既有规则；供应商退采超额贷项只在原文和已确认 owner 允许范围内接入。

## 事实来源

- `docs/product-specs/index.md`：`FIN-004/005` 目录、依赖、准备度和人工决策门唯一入口。
- `docs/product-specs/finance.md`：`FIN-001/002/003` 与 `ORD-005` 已确认 owner、账户流水、期间锁、退款和权限事实；本批次规格写回位置。
- `docs/references/requirements/07-资金模块.md §4.5～§4.6、§5.4～§5.5、§6、§7`：`FIN-004` 的退款、提现、转账、其他收支页面、字段和直接规则。
- `docs/references/requirements/07-资金模块.md §8、§9、§10 FIN-05/07/08/10/11`：`FIN-005` 的机构收款、四张资金统计和本批次业务规则。
- `docs/references/requirements/04-采购模块.md §2.4`：采购退单待退款/已退款投影；与 `DEC-FIN-053` 的供应商退款义务共同约束 `FIN-004` 实际到账边界。
- `docs/references/requirements/01-整体架构与首页.md §2.2、§2.4、§4～§5`：退货/资金流程、列表/详情/表单通则和五角色粗权限。
- `docs/references/requirements/08-设置模块.md §3.1.3 六`：退款、提现、转账、其他收支、机构收款和资金统计细权限名称。
- `ARCHITECTURE.md`、`docs/FRONTEND.md`、`docs/RELIABILITY.md`、`docs/SECURITY.md`：共享 Runtime、分层、L3 守恒、页面控制条和外部能力模拟边界；这些是 engineering-constraint，不补造业务口径。

## 前置门禁

- `FIN-001/002/003`、`ORD-005` 及三条核心共享 Runtime 流程均有 passing/completed 证据。
- 开工时 `docs/exec-plans/active/` 只有 `.gitkeep`；本文件是唯一业务 active plan。
- `FIN-004/005` 已于 2026-08-24 经用户确认全部推荐方案并升级为 `ready`；`DEC-FIN-055～070` 是本批次实现、测试与验收的唯一补充口径。

## 批次切片状态

| 功能 | 当前阶段 | 最后检查点 | 下一动作 | 结果 |
|---|---|---|---|---|
| `FIN-004` | completed | `DEC-FIN-055～063` 已确认，客户退款更正与供应商退款详情已验收 | 无 | completed |
| `FIN-005` | completed | `DEC-FIN-064～070` 已确认，四 Tab 分页/CSV/权限和 unavailable 边界已验收 | 无 | completed；依赖 FIN-004 |

## 验证路径

1. specification：逐字段核对原文与现有 Finance 对象，分别形成 `FIN-004/005` 的 ready 章节；所有改变金额、状态、账户或统计结果的缺口登记 `DEC-FIN-*`。
2. implementation：沿 `Types → Schema → Repository → Service → shared Runtime → Store → View` 实施；退款复用既有对象，转账双流水、其他收支审核和统计查询保持一次快照与原子性。
3. 自动验证：整数分、账户/期间、双边转账守恒、审核/取消、幂等、并发、回滚、退款上限、其他收支汇总、机构/方式/订单/账户统计和权限。
4. 浏览器黄金旅程：Mock reset 后从本次新建其他收支和转账开始，完成审核/账户变化并核对统计；复用一张本次 Runtime 内可追溯退款义务验证通用退款查询，不用孤立预置单据冒充闭环。
5. 批次收尾：一个代表性 1280px 页面、适用错误恢复、Mock reset、一次全量 `npm run verify` 和干净重启；不为每个报表重复九场景。

## 风险与阻塞

- 原文把确认退款、拉新提现、转账、其他收支、机构收款和统计列出字段，但多数状态机、金额形成时点、机构来源、时间范围和取消/更正副作用未定义，不能按行业惯例静默补齐。
- `ORD-005` 已存在窄退款实现；若新建第二套通用退款实体会造成退款金额、账户流水和状态分叉。
- 转账必须同时产生同额转出/转入流水；任何一侧失败或月份/账户非法都必须整体回滚，且企业总资金不变。
- 拉新奖励与机构主数据的 owner 尚未实现；缺少可靠来源时必须显示 unavailable，不能用虚构业务数据宣称完成。
- 资金统计跨收款、付款、退款、转账和其他收支，必须明确每张报表的事实范围和去重口径，否则卡片与账户流水无法对账。

## 进度日志

- [x] 从长期顺序恢复资金扩展批次，确认 active 为空、依赖 passing 并建立唯一 active plan。
- [x] 阅读 Harness 导航、架构、计划、前端、可靠性、安全边界及本批次原始章节。
- [x] 开工 `./scripts/init.ps1` 通过：Harness 45 个切片/338 个决策门、类型检查、81 个测试文件/402 项测试和生产构建；仅有既有 chunk size warning。
- [x] 逐项提取 `FIN-004/005` 的事实来源、页面、字段、表单、状态/公式、权限、Mock 和验收，登记 `DEC-FIN-055～070`。
- [x] 用户于 2026-08-24 确认“FIN-004 + FIN-005 全部按推荐方案执行”；`DEC-FIN-055～070` 已逐项写回，两个切片均升级为 ready。
- [x] 规格阶段 Harness 门禁通过：45 个切片、354 个决策门、8 份规格和 53 行导航。
- [x] FIN-004 首批实现：转账待审核/原子双流水/取消、其他收支项目与审核入账、供应商退款义务整笔到账、提现 unavailable。
- [x] FIN-005 首批实现：收款方式、订单支付、账户交易明细、账户汇总四类统计；机构收款 provider unavailable；统一 URL 月份与导出入口。
- [x] 自动验证：专项 12 项通过；全量 82 个测试文件/410 项测试通过；类型检查、生产构建和 `git diff --check` 通过。
- [x] 浏览器验收：`/finance/transfers` 从零创建 `ZZ-260810-00001` 并审核为已完成，页面显示“已写入双边流水”；`/finance/statistics?month=2026-08&report=methods` 在 1280px 展示四方式统计；`/finance/institution-receipts` 明确 provider unavailable；代表性页面无整页横向溢出，首次加载无 console warning/error。
- [x] Mock reset：`npm run mock:reset` 已恢复 baseline。
- [x] 统计四 Tab 分页：`page/pageSize` 从 URL 恢复，支持 10/30/50/100，切页后 URL 和当前列表一致；四类导出均使用当前筛选的完整数据集。
- [x] 客户退款更正：少退生成关联新贷项和新待审核退款，多退生成关联原退款的其他收款追回；原退款、原流水不可变，专项测试覆盖金额守恒、关联、幂等和审核入账。
- [x] 供应商退款详情：返回义务来源、退款金额、供应商快照、到账账户、到账流水和审计日志；页面提供详情入口，provider/空数据仍保持明确语义。
- [x] 最终自动验收（2026-08-25）：82 个测试文件/410 项通过；`npm run typecheck`、`npm run build`、`npm run verify:harness`、`git diff --check`、`npm run mock:reset` 全部通过。
- [x] 最终浏览器验收（2026-08-25）：供应商退款页空义务状态明确；统计四 Tab、URL `month/report/page/pageSize`、分页和导出入口可见；控制台无 warning/error。

## 开放决策

无

`DEC-FIN-055～070` 均已确认；若实施发现新的业务事实缺口，必须先在本节和 `docs/product-specs/index.md` 新增 open 决策并停止受影响范围。

## 已确认决策

以下决策均由用户于 2026-08-24 以“FIN-004 + FIN-005 全部按推荐方案执行”一次性确认；实现不得静默偏离。

| 决策 ID | 缺失事实与证据 | 可选方案及影响 | 阻塞范围 | 可安全继续 | 决定人 | 状态 | 结论与写回位置 |
|---|---|---|---|---|---|---|---|
| `DEC-FIN-055` | §4.5 只写销售退款；现有客户退款和供应商退款义务 owner 不同 | 推荐客户退款复用唯一 `CustomerRefund`，供应商退款到账独立对象/Tab，禁止无来源手工退款 | FIN-004 退款模型/导航 | 客户退款只读字段 | 产品/财务/采购 | decided | 2026-08-24 用户确认推荐；写回 `finance.md/index.md`。 |
| `DEC-FIN-056` | 已退款后的少退/多退更正未定义 | 推荐原退款终态不可变；少退由新贷项形成新退款，多退用关联原退款、需审核的其他收款追回 | FIN-004 退款更正 | 正常待审核退款 | 产品/财务 | decided | 2026-08-24 用户确认推荐；写回 `finance.md/index.md`。 |
| `DEC-FIN-057` | 供应商退款到账方式、账户、部分到账和上限未定义 | 推荐每个义务整笔确认，只选启用 cash/bank，开放月原子入账，不能超义务 | FIN-004/PUR-003 退款闭环 | 贷项待退款投影 | 产品/财务/采购 | decided | 2026-08-24 用户确认推荐；写回 `finance.md/procurement.md/index.md`。 |
| `DEC-FIN-058` | 转账审核、取消、双流水和完成后纠错未定义 | 推荐创建 pending-review 不动账；审核原子双流水；待审核可取消，完成后用关联反向转账纠错 | FIN-004 转账状态机 | 列表/表单列 | 产品/财务 | decided | 2026-08-24 用户确认推荐；写回 `finance.md/index.md`。 |
| `DEC-FIN-059` | 其他收支审核、拒绝、入账、删除和更正未定义 | 推荐 pending-review→approved/rejected；批准才入账，单据不删除，批准后用相反方向关联更正 | FIN-004 其他收支 | 固定字段/汇总列 | 产品/财务 | decided | 2026-08-24 用户确认推荐；写回 `finance.md/index.md`。 |
| `DEC-FIN-060` | 收支项目 owner/方向/停用及往来单位关系未定义 | 推荐 Finance 持有方向区分项目，同方向名称唯一，可停用不删历史；往来单位保存自由文本快照 | FIN-004 表单和项目汇总 | 自由文本展示 | 产品/财务 | decided | 2026-08-24 用户确认推荐；写回 `finance.md/index.md`。 |
| `DEC-FIN-061` | 三类单号、日期、附件和防重未定义 | 推荐 `ZZ/QTSK/QTFK-YYMMDD-#####`；非未来、开放月且不早于账户最新流水；单个 fake 5MB；requestId/版本防重 | FIN-004 schema/审计 | 内部 ID | 产品/财务/技术 | decided | 2026-08-24 用户确认推荐；写回 `finance.md/index.md`。 |
| `DEC-FIN-062` | 拉新提现缺奖励账本、申请人和可提现余额 provider | 推荐当前明确 unavailable，不造假提现/打款；待 CUS-010/SET-002 provider 后另行接入 | FIN-004 提现 | 页面字段入口 | 产品/财务/客户 | decided | 2026-08-24 用户确认推荐；写回 `finance.md/index.md`。 |
| `DEC-FIN-063` | FIN-004 五角色和敏感字段未定义 | 推荐管理员/财务读写，销售主管企业级只读且遮蔽账号/联系方式，业务员/仓库拒绝；原文无导出则不增加 | FIN-004 四层权限 | 管理员路径 | 产品/管理员/财务 | decided | 2026-08-24 用户确认推荐；写回 `finance.md/index.md`。 |
| `DEC-FIN-064` | 机构 owner、收款机构确定和历史快照未定义 | 推荐使用未来 `InstitutionProvider` 并在收款时存快照；未接前机构页 unavailable，不归到“总部” | FIN-005 机构页 | 四张资金统计 | 产品/财务/设置 | decided | 2026-08-24 用户确认推荐；写回 `finance.md/index.md`。 |
| `DEC-FIN-065` | 机构累计/本期/笔数纳入哪些收款和状态未定义 | 推荐只汇总带机构快照的 normal 实际客户收款，balance 不算到账，void 不进合计但详情可追溯，不制造待确认 | FIN-005 机构聚合 | 机构列结构 | 产品/财务 | decided | 2026-08-24 用户确认推荐；写回 `finance.md/index.md`。 |
| `DEC-FIN-066` | 本期和统计时间范围未定义 | 推荐统一 Asia/Shanghai 自然月，默认 Mock 当前月，未来月禁止，month 写 URL；行和 totals 同一快照 | FIN-005 全部查询 | 固定列 | 产品/财务 | decided | 2026-08-24 用户确认推荐；写回 `finance.md/index.md`。 |
| `DEC-FIN-067` | 收款现金统计的方式范围、笔数和占比未定义 | 推荐仅 normal 客户 cash/wechat/alipay/bank 实收；排除 balance/void/其他收支/退款；按收款单计数，0 分母 unavailable | FIN-005 方式统计 | 四个分组标签 | 产品/财务 | decided | 2026-08-24 用户确认推荐；写回 `finance.md/index.md`。 |
| `DEC-FIN-068` | 订单支付的退单、贷项、优惠、净额与下单时间未定义 | 推荐一行一个订单并附退单号；净应收扣有效贷项，净已收扣贷项已结算部分，待收取差；保存真实 orderedAt，缺失不拿发货时间替代 | FIN-005 订单支付 | 应收基础行 | 产品/财务/订单 | decided | 2026-08-24 用户确认推荐；写回 `finance.md/index.md`。 |
| `DEC-FIN-069` | 账户统计与 FIN-003 重复、movement 范围和转账双计未定义 | 推荐完全复用唯一账本/期间投影，转账分账户双边显示但企业净额 0，反向按实际方向，不保存第二套汇总 | FIN-005 账户报表 | 原文列 | 产品/财务/技术 | decided | 2026-08-24 用户确认推荐；写回 `finance.md/index.md`。 |
| `DEC-FIN-070` | FIN-005 分页、CSV、权限、脱敏和局部失败未定义 | 推荐四 Tab 单路由、30 条稳定分页；管理员/财务与主管可看，只有管理员/财务导出筛选全量；机构失败只影响该 Tab | FIN-005 URL/导出/权限 | 页面字段 | 产品/管理员/财务 | decided | 2026-08-24 用户确认推荐；写回 `finance.md/index.md`。 |

## 中断恢复点

`FIN-004 + FIN-005` 已完成：契约与决策已确认；Finance Types/Schema/Service/Runtime/Store/View、路由和 Mock 已接入。2026-08-25 自动验证为 82 个测试文件/410 项通过，类型检查、构建、Harness 校验、差异检查和 Mock reset 均通过；浏览器验证了供应商退款空状态、统计四 Tab 分页/导出入口和无控制台错误。该批次无待处理恢复点，后续从 `docs/exec-plans/active/` 的下一业务批次继续，不重做本批次。
