# CRM 运营批次

- 类型：business-batch
- 功能：`CUS-002 + CUS-004 + CUS-005`
- 风险等级：L2
- 当前阶段：verification
- 状态：completed
- 完成日期：2026-08-26
- 最近更新：2026-08-26

## 目标

在已有 `CUS-001` 客户主数据之上，提取并实现商机与常购商品、客户地图与公海、外勤拜访三组功能。三个切片共享 Customer Repository 的客户、业务员、地区和受控时钟事实；本计划不新建第二套客户主数据，也不把地图/GPS/订单统计接成真实外部服务。

## 范围与非目标

范围：

- `CUS-002`：商机列表、筛选、创建/编辑、阶段推进、关闭/删除、导出；客户常购商品的来源、阈值、手工维护和快速下单入口。
- `CUS-004`：客户地图的 fake 地图标记/筛选/聚合展示；公海列表、回收规则、领取、分配和保护期。
- `CUS-005`：销售任务看板、拜访统计/明细、拜访签到与记录、线路和计划的原型闭环。

非目标：会员、优惠券/促销/积分、企微、商城、独立 BI、真实地图/GPS、真实照片上传、真实消息推送，以及客户档案/分类/标签 `CUS-001` 的重复实现。

## 事实来源

- `docs/product-specs/customers.md`：Customer Repository、客户/分类/标签结构、权限和跨域边界。
- `docs/product-specs/index.md`：`CUS-002`、`CUS-004`、`CUS-005` 已达到 ready，依赖和来源章节。
- `docs/references/requirements/06-客户模块.md §2.2～§2.3`：商机和常购商品字段、筛选、阶段与自动生成规则。
- `docs/references/requirements/06-客户模块.md §2.8～§2.9`：客户地图、公海规则、领取/分配和保护期字段。
- `docs/references/requirements/06-客户模块.md §3.1～§3.5`：任务看板、拜访统计/明细、线路和计划字段与操作。
- `docs/references/requirements/01-整体架构与首页.md §4～§5`：列表、详情、表单、空态、角色和导航规则。
- `ARCHITECTURE.md`、`docs/FRONTEND.md`、`docs/RELIABILITY.md`：单一 owner、公开 provider、fake adapter、受控时钟和页面状态约束。

## 前置门禁

- `CUS-001` 已完成并归档，Customer Repository、客户权限和客户主数据公开接口已存在。
- 当前无其他业务 active plan；本文件是唯一业务现场。
- 三个切片已完成规格提取并达到 `ready`；实现复用 CUS-001 的 Customer Repository，未创建第二套客户主数据。

## 规格提取清单

| 切片 | 必须提取 | 已确认边界 | 当前下一动作 |
|---|---|---|---|
| `CUS-002` | 商机字段/阶段/概率/状态机/金额精度/负责人权限；常购商品事实来源、自动阈值、手工覆盖、快速下单副作用 | 客户和商品只通过公开 provider；订单统计未确认前不得显示为 0 | 浏览器商机/常购黄金路径与全量回归收尾 |
| `CUS-004` | 地图标记字段、聚合/筛选、坐标 fake 边界；公海回收规则、领取上限、分配权限、保护期、时钟和幂等 | 不请求真实地图/GPS；公海客户仍是 Customer owner 的客户事实 | 浏览器地图/公海、角色和受控时钟回归收尾 |
| `CUS-005` | 任务指标口径、拜访状态/签到/签退/结果、照片 fake 元数据、线路/计划状态和统计来源 | GPS、照片、路线规划和订单指标均为 fake/unavailable，不能伪造真实外部结果 | 浏览器拜访/线路/计划状态变化与布局回归收尾 |

## 批次切片状态

| 功能 | 当前阶段 | 最后检查点 | 下一动作 | 结果 |
|---|---|---|---|---|
| `CUS-002` | verification | Types/Schema、operations service、Store、商机/常购路由与 service 测试已完成 | 浏览器场景、全量回归、证据写回 | implemented |
| `CUS-004` | verification | fake 地图、公海规则/领取/保护期/回收与路由已完成 | 浏览器场景、角色与受控时钟回归 | implemented |
| `CUS-005` | verification | 拜访 fake 签到/完成、线路/计划类型、Store 与路由已完成 | 浏览器状态变化、角色与页面布局回归 | implemented |

## 规格阶段退出条件

1. 三个切片的字段、列表/表单操作、状态机、权限、Mock 场景和验收逐项映射到原文章节。
2. 未定义或相互冲突的金额、时间、阈值、回收、认领、统计和外部能力边界全部新增 `DEC-CUS-*` 并在本计划与 `customers.md`、`index.md` 同步。
3. 明确跨域只读 provider：订单/商品/设置/库存/资金只通过各自 `public.ts`；不能在 Customer Service 复制外域事实。
4. `CUS-002`、`CUS-004`、`CUS-005` 已达到 `ready`，并已完成实现；本阶段只允许补验证证据和修复发现的问题。

## 验证路径

本批次先完成 specification/ready gate，再进入 implementation；实现和验收路径如下：

- specification：章节、字段、规则、决策、依赖和边界审计已完成。
- implementation：沿 `Types → Schema → Repository → Service → public.ts → Runtime/Store → View` 扩展现有 Customer owner；新增 `customer-operations-service.ts`，不复制 Customer Repository。
- verification：normal/empty/error/slow/permission-denied/partial-failure，角色矩阵、受控时钟、公海领取上限、金额/数量精度、状态机、跨域 unavailable、fake 地图/GPS、浏览器 1280px 和 Mock reset。

## 风险与阻塞

- 原文没有为商机关闭/删除、常购自动计算的订单快照、公海回收并发、地图聚合口径、拜访有效性和统计指标来源给出完整定义；未登记决策前不得猜测。
- `CUS-004` 和 `CUS-005` 依赖订单、员工、地区等公开 provider；provider 未接入时必须显示 unavailable，而不是使用预置数字冒充业务事实。
- 外勤涉及位置、照片和客户敏感信息；只保存明显虚构的 fake 元数据，不读取真实设备权限或上传文件。

## 进度日志

- [x] 从总体顺序选择 `CUS-002 + CUS-004 + CUS-005`，确认 `CUS-001` 依赖已 passing。
- [x] 阅读客户领域规格、Harness 入口和原始需求 §2.2～§2.3、§2.8～§2.9、§3。
- [x] 完成三切片字段、状态、权限、Mock 和验收契约；每个切片八个固定章节已补齐。
- [x] 登记并写回 `DEC-CUS-014～022`，三切片达到 `ready`。
- [x] `npm run verify:harness` ready gate 通过：35 个 ready 切片、382 个决策门。
- [x] 扩展 Customer owner：Types、Schema、operations service、public.ts、Runtime/Store、CRM 运营工作台与稳定路由。
- [x] 增加 CUS-002/CUS-004/CUS-005 service 回归：商机终态/金额、常购主键/快速下单、副海幂等/额度、fake 签到/完成与角色拒绝。
- [x] 客户专项回归：10 个测试文件、25 条测试通过；全量回归：85 个测试文件、425 条测试通过。
- [x] `npm run typecheck`、`npm run build`、`npm run verify:harness`、`git diff --check` 通过。
- [x] 浏览器 1280px：商机、地图、公海、拜访路由渲染；fake 地图标记、fake 签到状态变化和无控制台错误已验证。
- [x] Mock reset 与干净重启后的 CRM 路由验证通过；归档本计划。

## 开放决策

无

## 中断恢复点

本批次已完成。后续恢复应创建下一批 `CUS-003 + CUS-007` 的新 active plan；不要创建第二套客户主数据、真实地图/GPS/照片上传，也不要重做已完成的 `CUS-001`、`CUS-002`、`CUS-004` 或 `CUS-005`。
