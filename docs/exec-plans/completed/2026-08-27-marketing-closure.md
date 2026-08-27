# 营销闭环批次

- 类型：business-batch
- 功能：`CUS-006 + CUS-010`
- 风险等级：L3
- 当前阶段：verification
- 状态：completed
- 完成日期：2026-08-27
- 最近更新：2026-08-27

## 目标

从已完成的客户主数据、商品主数据、会员积分和订单公开 provider 提取优惠券、促销、易发券、获客文章及营销分析的可编码契约。营销配置由 Customer owner 持有；订单价格、积分账本、商品范围和客户事实只通过公开 provider 交换，不在营销页面复制或重算。

## 范围与非目标

范围：

- `CUS-006`：优惠券模板与生命周期、四种优惠券类型、适用范围、领取限制；促销活动与四种促销类型、阶梯/买赠规则、同享开关、互斥保护；易发券活动、预览、模拟发放记录；获客文章草稿/发布/下架、关联商品/优惠券/促销及 fake 预览。
- `CUS-010`：优惠券/促销/拉新/积分统计卡片与活动效果列表；AI 营销分析的筛选、指标和效果列表，以 fake/unavailable provider 明确边界；客户拉新提成表格只在存在归因与提成 provider 时展示事实。

非目标：真实商城、微信/小程序/H5/APP 发布，真实短信/微信/站内信，真实富文本文件上传，真实 AI、订单优惠结算、积分流水、客户推荐关系和财务提成结算。订单只通过公开营销 provider 消费已配置的优惠规则。

## 事实来源

- `docs/product-specs/customers.md`：Customer Repository、CUS-001 客户事实、会员/积分 provider 和跨领域 owner 边界。
- `docs/product-specs/products.md`：商品、分类、品牌、标签和 SKU provider，营销适用范围只能引用这些公开事实。
- `docs/product-specs/orders.md`：订单价格组合、营销优惠输入和金额精度边界；本批次不重算订单最终价。
- `docs/product-specs/index.md`：`CUS-006`、`CUS-010` 目录、依赖、规则和 ready gate。
- `docs/references/requirements/06-客户模块.md §4.1～§4.4`：优惠券、促销、易发券、获客文章字段、操作、状态和统计。
- `docs/references/requirements/06-客户模块.md §8.1～§8.4`：营销分析、AI 分析、积分统计和拉新提成字段。
- `docs/references/requirements/06-客户模块.md §9 CUS-05～CUS-07`：优惠券类型、限领和同一商品促销互斥规则。
- `docs/references/requirements/01-整体架构与首页.md §4～§5`：列表、表单、分页、空态、角色和导航规范。
- `ARCHITECTURE.md`、`docs/FRONTEND.md`、`docs/RELIABILITY.md`、`docs/SECURITY.md`：分层、金额、Mock、页面状态、fake adapter 和安全边界。

## 前置门禁

- `CUS-001`、`PRD-001`、`CUS-003`、`CUS-007` 已完成并有 passing 证据；`ORD-002/003/004` 的营销价格输入边界已固定。
- 当前文件是唯一业务 active plan；`CUS-006`、`CUS-010` 已达到 ready gate，允许沿 Customer owner 实现，不复制订单、积分、商品或客户事实。
- 原文没有定义优惠券编码、促销规则精度/冲突时点、文章富文本保存格式、营销统计 provider、AI 输出真实性和拉新归因公式；这些缺口必须先登记并写回领域规格。

## 批次切片状态

| 功能 | 当前阶段 | 必须提取 | 下一动作 | 结果 |
|---|---|---|---|---|
| `CUS-006` | verification | 优惠券/促销/易发券/文章字段、枚举、条件规则、状态命令、适用范围、权限和 fake 外部边界 | 已完成 Types → Schema → Service → public.ts → Runtime → View；执行专项与全量验证 | passing |
| `CUS-010` | verification | 统计卡片、活动效果列、AI 分析筛选/指标、积分 provider、拉新提成归因与 unavailable 语义 | 已完成只读分析 provider、Runtime 和 View；执行专项与全量验证 | passing |

## 决策门

以下为按现有 Harness 约定登记的推荐结论；已写入 `customers.md` 与 `docs/product-specs/index.md`，并通过 `npm run verify:harness` ready gate。

| 决策 ID | 缺失事实与推荐结论 | 阻塞范围 | 状态 |
|---|---|---|---|
| `DEC-CUS-034` | 优惠券模板企业内编码稳定唯一；发行数量为正整数且不超过 10,000,000；四种类型金额使用整数分、折扣 1～100；领取后 N 天从领取时刻计算，指定日期使用 Asia/Shanghai 日期闭区间；优惠券模板与客户券实例分离，实例不可编辑/删除 | CUS-006 优惠券模型/生命周期 | decided |
| `DEC-CUS-035` | 优惠券适用范围只能选择全部/分类/品牌/标签/商品之一；领取对象只能选择全部/分类/标签/客户之一；指定客户最多 100 个；每人限领 1～10 或不限；新人限制和原价/促销使用限制保存为规则快照 | CUS-006 优惠券范围/领取 | decided |
| `DEC-CUS-036` | 促销编码企业内唯一；同一 SKU 在重叠有效期内只能被一个有效促销引用，保存/启用时原子拒绝冲突；规则门槛和金额为整数分；限时折扣、满减、满赠、买赠规则必须完整且正数；促销统计消费 Order provider，不在 Customer 复制订单事实 | CUS-006 促销规则/互斥 | decided |
| `DEC-CUS-037` | 优惠券/促销状态由受控时钟计算未开始/进行中/已结束/已暂停；暂停/结束是独立命令并保留历史，已结束不可重新启用；易发券发放只写不可变 fake 发放记录，短信/微信/站内信不发送 | CUS-006 状态/易发券 | decided |
| `DEC-CUS-038` | 获客文章保存纯文本/结构化 fake 富文本和 fake 图片元数据；立即发布、定时发布、草稿三种方式，定时发布需未来时间；发布/下架保留快照；微信/小程序/H5/APP 仅显示 fake 预览，不上传或分发 | CUS-006 文章/外部渠道 | decided |
| `DEC-CUS-039` | 营销统计中的领取/使用/发券数量只来自 CUS-006 不可变记录；订单金额、订单数、客单价、毛利率只通过 Order/Product/Finance public provider，未接入时显示 unavailable，不显示 0；筛选按 Asia/Shanghai 日期闭区间 | CUS-010 活动统计 | decided |
| `DEC-CUS-040` | AI 营销分析只使用确定性 fake adapter；活动次数、覆盖客户/商品和成本若无 AI provider 显示 unavailable；不得生成看似真实的 AI 建议、订单金额或成本；筛选条件只保存页面查询，不产生外部动作 | CUS-010 AI 分析 | decided |
| `DEC-CUS-041` | 积分账户统计复用 CUS-007 public provider，不复制积分流水；客户拉新提成因原始需求未定义推荐关系、提成公式和发放 owner，列表保留字段契约但所有指标显示 unavailable，并提供“归因规则未接入”边界，不伪造金额或客户数 | CUS-010 积分/拉新提成 | decided |

## 验证路径

- specification：逐字段、操作、状态、权限、适用范围、互斥、跨域 provider 和验收写入 customers 规格，并通过 `npm run verify:harness`。
- implementation：ready 后沿 Customer owner 实现 `Types → Schema → Repository → Service → public.ts → Runtime/Store → View`；商品/客户选择使用公开 lookup provider，订单/积分/统计只读 provider。
- verification：优惠券四类型边界、限领/发行上限、促销互斥与状态时钟、易发券不可变记录、文章草稿/定时/下架、统计 unavailable、AI fake 边界、角色矩阵和 normal/empty/error/permission-denied 场景；必要时验证 L3 原子拒绝和 requestId 幂等。

## 风险与阻塞

- CUS-006 涉及优惠叠加输入和促销互斥；任何冲突不得保存部分规则或静默覆盖已有促销。
- CUS-010 的订单、毛利、AI 和拉新提成事实必须明确 unavailable；不能把没有 provider 的统计显示为 0，也不能在客户领域重新计算订单金额。
- 真实外部渠道、AI、文件上传、消息和财务提成仍为原型非目标；若产品要实现，必须另建决策和 integration 计划。

## 进度日志

- [x] 从总体顺序选择 `CUS-006 + CUS-010`，确认 `CUS-001`、`PRD-001`、`CUS-003`、`CUS-007` 和订单公开 provider 依赖。
- [x] 阅读原始需求 §4、§8、§9 CUS-05～CUS-07，并确认营销字段范围。
- [x] 登记 DEC-CUS-034～041，写回 `customers.md` 和 `docs/product-specs/index.md`。
- [x] 运行 `npm run verify:harness` 通过 ready gate；通过前不写业务代码。
- [x] 沿 Customer owner 完成 CUS-006/CUS-010 的 Types → Schema → Service → public.ts → Runtime → View。
- [x] 运行营销专项测试：2 个文件、6 条测试通过。
- [x] 运行全量测试：89 个文件、438 条测试通过；`npm run typecheck`、`npm run build`、`npm run verify:harness` 通过。
- [x] 1280px 检查 7 个营销路由可达且无控制台错误；分析页展示订单/商品/财务/AI/归因 provider 的 unavailable 原因。
- [x] 执行 `npm run mock:reset`，Mock 状态恢复 baseline。
- [x] 将验证完成的计划归档，并同步 Harness 总体状态。

## 开放决策

| 决策 ID | 缺失事实与推荐结论 | 阻塞范围 | 可安全继续 | 决定人 | 状态 | 结论与写回位置 |
|---|---|---|---|---|---|---|
| `DEC-CUS-034～038` | 采用计划中的优惠券、促销、易发券和文章推荐边界 | CUS-006 | 无业务代码，继续 Harness 门禁 | 产品负责人/技术负责人 | decided | 已写回 `customers.md`、`docs/product-specs/index.md` 和本计划决策门 |
| `DEC-CUS-039～041` | 采用计划中的统计 provider、AI fake/unavailable、积分和拉新提成边界 | CUS-010 | 无业务代码，继续 Harness 门禁 | 产品负责人/技术负责人 | decided | 已写回 `customers.md`、`docs/product-specs/index.md` 和本计划决策门 |

## 中断恢复点

本批次已完成 verification 并归档。若后续恢复或审计，从本计划的完成证据和 `docs/design-docs/implementation-sequence.md` 下一批 `CUS-008 + CUS-009` 开始；不得重复创建营销事实，也不得把订单、积分、商品或客户事实复制到 Customer。

## 完成证据

- 自动：`src/features/customers/services/marketing-service.spec.ts` 与 `src/features/customers/views/CustomerMarketingView.spec.ts` 共 6 条专项测试通过；全量 89 个测试文件、438 条测试通过。
- 规则：优惠券发行上限/精度、编码唯一、促销重叠原子拒绝、状态命令、易发券不可变记录、文章发布边界、统计 provider/unavailable、AI fake 和拉新归因 unavailable 均有 Service/View 覆盖。
- 工程：`npm run verify:harness`、`npm run typecheck`、`npm run build`、`git diff --check` 通过；`npm run mock:reset` 恢复 baseline。
- 浏览器：本地 `http://127.0.0.1:5177/` 在 1280px 检查优惠券、促销、易发券、获客文章、营销分析、AI 分析和拉新提成 7 个路由可达；无控制台 error/warning，分析页明确展示订单/商品/财务/AI/归因 provider 的 unavailable 原因。
- 边界：真实短信/微信/站内信、真实渠道发布、文件上传、AI、订单最终价格、财务提成结算仍按 provider/fake/unavailable 契约保留，未宣称完成。
