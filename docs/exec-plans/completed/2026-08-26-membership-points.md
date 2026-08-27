# 会员与积分批次

- 类型：business-batch
- 功能：`CUS-003 + CUS-007`
- 风险等级：L3
- 当前阶段：verification
- 状态：completed
- 完成日期：2026-08-26
- 最近更新：2026-08-26

## 目标

从已完成的 `CUS-001` 客户主数据出发，提取会员等级与权益、积分账户与规则的可编码契约。会员等级决定会员折扣和权益，积分使用独立不可变账本；订单、退单退款和客户资料只通过公开 provider 交换事实，不复制客户或订单状态。

## 范围与非目标

范围：

- `CUS-003`：会员等级列表、等级排序、等级 CRUD、升级/保级条件、会员折扣、积分倍数、包邮/优先发货/专属客服/生日权益、状态和客户等级关联。
- `CUS-007`：积分账户列表、积分明细、积分调整、获取/使用/过期规则、每日/每单上限、有效期、积分等级设置和订单/退款边界。

非目标：真实商城积分兑换、真实优惠券发放、真实消息提醒、外部支付、复杂会计结算、动态权限扩展，以及 `CUS-006` 优惠券/促销计算本身。

## 事实来源

- `docs/product-specs/customers.md`：Customer Repository、CUS-001 权限、价格组合边界和跨领域 provider 约束。
- `docs/product-specs/index.md`：`CUS-003`、`CUS-007` 目录、依赖和 `DEC-PRD-001`。
- `docs/references/requirements/06-客户模块.md §2.7`：会员等级字段、升级条件、权益、状态和操作。
- `docs/references/requirements/06-客户模块.md §5.1～§5.2`：积分账户、明细、调整、获取/使用/有效期/等级设置字段。
- `docs/references/requirements/06-客户模块.md §9 CUS-08、CUS-11`：积分上限和会员升级业务规则。
- `docs/references/requirements/01-整体架构与首页.md §4～§5`：列表、表单、空态、角色和导航规范。
- `ARCHITECTURE.md`、`docs/RELIABILITY.md`、`docs/FRONTEND.md`：单一 owner、账本不可变、受控时钟、Mock 与页面状态约束。

## 前置门禁

- `CUS-001`、`ORD-005` 已完成并提供客户主数据、退单/退款事实和权限基线。
- `DEC-PRD-001` 已固定会员折扣位于分类折扣之后、促销和优惠券之前；本批次不得重定义价格顺序。
- 本文件曾是唯一业务 active plan；`CUS-003`、`CUS-007` 已通过 ready gate，当前实现和验证均已完成。

## 批次切片状态

| 功能 | 当前阶段 | 必须提取 | 下一动作 | 结果 |
|---|---|---|---|---|
| `CUS-003` | verification | 等级字段、条件类型/值、自动或人工升级、保级、权益 owner、客户关联、状态和删除引用 | 会员等级 CRUD、排序、关联和引用保护已实现并验证 | implemented |
| `CUS-007` | verification | 账户/明细字段、账本方向、上限、退款返还、过期、调整权限、设置条件和订单 provider | 积分账户、不可变流水、人工调整、设置条件、幂等和受控过期已实现并验证 | implemented |

## 决策门

本批次按用户既有“按推荐方案执行”约定登记推荐结论；每项结论都必须写入 `customers.md` 和 `docs/product-specs/index.md` 后才能进入 `ready`。

| 决策 ID | 缺失事实与推荐结论 | 阻塞范围 | 状态 |
|---|---|---|---|
| `DEC-CUS-023` | 会员等级编码企业内唯一；等级排序值越大越高；同客户同一时刻只保留一个有效等级；新客户无等级，后台不自动发放默认等级 | CUS-003 等级模型/关联 | decided |
| `DEC-CUS-024` | 升级条件按累计消费金额、订单数或累计积分三选一；条件值非负；自动升级只在受控刷新/业务事件后计算，人工升级提供独立命令；成交不自动创建订单 | CUS-003 升级状态 | decided |
| `DEC-CUS-025` | 保级条件和周期可空；启用保级时周期为正整数月；低于条件只标记待处理，不自动降级，人工确认后降级 | CUS-003 保级/降级 | decided |
| `DEC-CUS-026` | 会员折扣 1～100、积分倍数非负且默认 1；包邮、优先发货、专属客服、生日礼、生日券、专属商品只保存权益快照/引用，真实消费由对应 provider 决定 | CUS-003 权益与价格 | decided |
| `DEC-CUS-027` | 等级停用不影响历史快照；停用等级不可新关联；已有客户保留等级但新订单价格 provider 返回 unavailable，不能静默按普通等级计算；有客户引用或历史快照时不物理删除 | CUS-003 生命周期 | decided |
| `DEC-CUS-028` | 积分账户按客户唯一；可用积分=获得-使用-过期+退款返还+人工调整；每条变动不可编辑/删除，余额由账本重算并保存快照 | CUS-007 账户/账本 | decided |
| `DEC-CUS-029` | 下单积分按确认订单金额和设置比例计算，受单笔上限；每日上限按 Asia/Shanghai 自然日计数；订单取消/退单不重复扣减，退款返还使用独立反向流水 | CUS-007 订单/退单 provider | decided |
| `DEC-CUS-030` | 积分调整仅超级管理员/销售主管可执行；调整必须为正数并填写原因；扣减不得超过可用余额；同一 requestId 幂等 | CUS-007 调整/权限 | decided |
| `DEC-CUS-031` | 积分有效期支持永不过期/固定天数/按年度；过期由受控时钟产生不可变过期流水；“即将过期”按未来 30 个自然日展示 | CUS-007 过期 | decided |
| `DEC-CUS-032` | 积分设置保存整体校验并原子提交：开启系统时获取/使用/有效期必填；抵现比例、抵扣上限、最低使用积分和兑换比例不得为负，兑换商城开启时兑换比例必填 | CUS-007 设置 | decided |
| `DEC-CUS-033` | 会员/积分统计未接入订单、退单或商城 provider 时显示 unavailable，不显示 0；CUS-003/007 不复制订单金额、退款状态或商品权益事实 | CUS-003/007 跨域聚合 | decided |

## 验证路径

- specification：逐字段、操作、状态、权限、跨域 provider 和验收写入 customers 规格，并通过 `npm run verify:harness`。
- implementation：达到 ready 后沿 `Types → Schema → Repository → Service → public.ts → Runtime/Store → View` 扩展 Customer owner；积分使用同一事务 Repository 和不可变流水。
- verification：金额/积分精度、条件边界、自动/人工升级、停用引用保护、账本守恒、每日/每单上限、退款反向流水、过期受控时钟、requestId 幂等、角色矩阵、六种 Mock 场景和 1280px 浏览器路径。

## 风险与阻塞

- 积分是 L3 账本能力，任何订单/退单 provider 不可用、重复 requestId、余额不足或期间边界都必须失败且不留下半条流水。
- 会员折扣与积分抵扣只作为订单公开 provider 的输入；本批次不得在客户页面复制订单金额或重算最终价。
- 真实商城兑换、消息提醒、生日券发放和专属商品授权仍为 fake/unavailable，不因字段存在而宣称外部能力完成。

## 进度日志

- [x] 从总体顺序选择 `CUS-003 + CUS-007`，确认 `CUS-001`、`ORD-005` 和 `DEC-PRD-001` 依赖。
- [x] 阅读会员设置 §2.7、积分管理 §5.1～§5.2 和业务规则 CUS-08/CUS-11。
- [x] 登记 `DEC-CUS-023～033` 推荐结论并写回领域规格与索引。
- [x] 在 `customers.md` 补齐 CUS-003/CUS-007 八个固定契约章节，完成 ready gate。
- [x] `npm run verify:harness` ready gate 通过并进入 implementation，完成后再次通过收尾验证。
- [x] 扩展 Customer owner 的会员等级与积分账本 Types → Schema → Service → public.ts → Runtime/Store → View。
- [x] 修复积分设置表单为可写响应式草稿，并在加载/切换场景时同步设置事实。
- [x] 增加会员等级、积分调整、设置条件和 slow/empty/error/permission-denied 页面专项测试：4 个测试通过。
- [x] 收尾验证：全量 87 个测试文件/432 条测试通过；`npm run typecheck`、`npm run build`、`npm run verify:harness`、`git diff --check` 通过。

## 开放决策

| 决策 ID | 缺失事实与证据 | 可选方案及影响 | 阻塞范围 | 可安全继续 | 决定人 | 状态 | 结论与写回位置 |
|---|---|---|---|---|---|---|---|
| `DEC-CUS-002` | 会员/优惠券/促销/积分的叠加顺序原文未完整定义 | 沿 `DEC-PRD-001` 先优惠后积分，避免积分改变优惠券条件；其他顺序会改变订单应付金额 | `CUS-007` 订单积分与 `CUS-006` 促销结算 | 会员/积分主数据字段与账本结构 | 产品负责人/订单负责人 | decided | 2026-08-26 按推荐方案：先商品价格、分类/会员折扣、单品促销、优惠券和整单优惠，再积分抵扣；积分获取不含积分抵扣。写回 `customers.md`、`orders.md`、`products.md` 与本计划。 |

## 中断恢复点

本批次已完成 verification，计划可归档。会员等级和积分均沿 Customer owner 实现；不得复制订单、退单或客户主数据，也不得接入真实商城/消息服务。后续营销批次仍需复用本批次的会员折扣输入和积分公开 provider，不得在页面重算订单金额。

## 完成证据

- 自动：`src/features/customers/services/membership-points-service.spec.ts` 3 条、`src/features/customers/views/CustomerMembershipPointsView.spec.ts` 4 条专项测试；全量 87 个测试文件/432 条测试通过。
- 规则：等级编码唯一、停用引用保护、单客户单等级、账本守恒、积分调整权限/余额/requestId 幂等、设置条件校验和受控过期均有 Service 测试；权限拒绝、空数据、错误、慢请求页面状态有 View/Runtime 测试。
- 工程：`npm run typecheck`、`npm run build`、`npm run verify:harness`、`git diff --check` 通过；Mock reset 后未改变基线。
- 浏览器：本地 `http://127.0.0.1:5176/` 在 1280×720 检查会员等级新增、积分账户/明细、积分设置固定天数条件字段；页面 `scrollWidth=1265`、无控制台 error/warning。
- 边界：订单最终价格、积分获取/抵扣顺序、商城兑换、消息和真实外部服务仍按 provider/unavailable 契约保留，未宣称完成。
