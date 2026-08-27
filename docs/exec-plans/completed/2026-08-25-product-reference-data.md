# 商品辅助资料批次

- 类型：business-feature
- 功能：`PRD-005`
- 风险等级：L2
- 当前阶段：verification
- 状态：completed
- 完成日期：2026-08-25
- 最近更新：2026-08-25

## 目标

实现商品分类、品牌、单位、标签、智能标签和展示分类的统一辅助资料管理。所有资料继续由 Product Repository 持有，商品、订单、采购和库存只通过 Product public provider 消费；不建立第二套主数据。

## 范围与非目标

范围：分类最多三级树、品牌、单位及换算率、标签颜色与排序、AI 智能标签 fake 分析建议、面向客户的独立展示分类、启停/引用保护、设置入口和商品表单选项同步。

非目标：商品 SPU/SKU 主档、价格/授权/铺货/订单模板、真实 AI、真实图片上传、移动端展示页面、关联商品推荐 `PRD-006`。

## 事实来源

- `docs/product-specs/products.md`：商品领域现有 ProductFeatureState、引用校验、PRD-001 消费边界。
- `docs/references/requirements/03-商品模块.md §6.1～§6.6`：分类、品牌、单位、标签、智能标签和展示分类字段与操作。
- `docs/references/requirements/01-整体架构与首页.md §4～§5`：列表、表单、空态和角色模块权限。
- `ARCHITECTURE.md`：Product Repository 作为商品主数据 owner；跨域只消费 `public.ts`。

## 前置门禁

- `PRD-001` 已完成并提供唯一 Product Repository、商品引用校验和 `getReferenceData`。
- 当前没有其他业务 active plan；本计划是唯一业务现场。
- 进入 implementation 前，`PRD-005` 契约完整、`DEC-PRD-042～049` 均为 decided、`npm run verify:harness` 通过。

## 批次切片状态

| 功能 | 当前阶段 | 最后检查点 | 下一动作 | 结果 |
|---|---|---|---|---|
| `PRD-005` | verification | 六类辅助资料、引用保护、权限和 fake AI 已实现并通过专项/全量与页面冒烟 | 归档本计划，下一批为 `CUS-002 + CUS-004 + CUS-005` | completed |

## 验证路径

1. specification：逐字段登记六类资料、引用关系、排序、启停和 fake AI 边界。
2. decision：按推荐方案固化分类层级、编码、引用保护、单位换算、标签白名单、展示分类和角色权限。
3. ready gate：契约包含 Harness 要求的八个章节，`PRD-14` 有规则追踪，依赖 passing 后进入实现。
4. implementation：沿 `Types → Schema → Repository → Service → Runtime/Store → View` 扩展现有 Product owner；智能标签只生成建议，人工确认命令才更新商品标签。
5. verification：normal/empty/error/slow/permission-denied/partial-failure，三层权限、引用保护、树深度、编码唯一、单位换算精度、AI 上限和人工确认；收尾运行全量测试、构建、Harness、Mock reset 和页面冒烟。

## 风险与阻塞

- 商品主档已引用这些集合，删除必须先检查引用；停用保留历史引用但不得作为新选择。
- 单位换算影响订单、采购、库存和价格，基本单位换算率固定为 1，辅助单位换算率使用正数精度校验。
- 智能标签属于 fake adapter，分析结果不能自动写入，也不能使用真实商品资料上传到外部服务。
- 展示分类与后台商品分类独立维护；展示分类修改不改变商品 `categoryId`。

## 进度日志

- [x] 从总体顺序选择 `PRD-005`，确认 `PRD-001` 依赖已 passing。
- [x] 阅读商品 §6.1～§6.6、全局 §4～§5 和 ProductFeatureState owner 边界。
- [x] 写入 `products.md` 的 `PRD-005` 字段与交互契约，并登记 `DEC-PRD-042～049`。
- [x] `PRD-005` 已达到 `ready`，Harness 规格门禁通过。
- [x] 扩展现有 Product owner 的 Types、Service、Runtime/Store、路由和统一管理页面；未建立第二套 Repository。
- [x] 补充分类深度/循环、名称唯一、单位精度、引用保护、停用新选择、财务拒绝和智能标签确认/版本冲突测试。
- [x] Store 统一收口智能标签 error 场景，避免分析列表加载产生未处理 Promise。
- [x] 完成验证：83 个测试文件/420 条测试、`npm run typecheck`、`npm run build`、`npm run verify:harness`、`git diff --check`、`npm run mock:reset` 均通过。
- [x] 浏览器冒烟：六个辅助资料路由均可进入；场景切换和财务无权限提示通过。

## 开放决策

| 决策 ID | 缺失事实与证据 | 可选方案及影响 | 阻塞范围 | 可安全继续 | 决定人 | 状态 | 结论与写回位置 |
|---|---|---|---|---|---|---|---|
| `DEC-PRD-042` | 分类层级、编码、排序、停用和引用后删除未定义 | 推荐最多三级；编码自动生成且企业内唯一；有商品/子分类引用时拒绝删除，停用保留引用 | 分类 CRUD | 商品引用只读 | 产品负责人/商品管理员 | decided | 已按推荐方案写入 `products.md` 与 Product Service；分类测试通过 |
| `DEC-PRD-043` | 品牌编码、Logo 保存、排序、停用和商品引用删除未定义 | 推荐名称/编码企业内唯一；Logo 只保存 fake 元数据；有商品引用时拒绝删除 | 品牌 CRUD | 商品品牌只读 | 产品负责人/商品管理员 | decided | 已按推荐方案实现品牌 CRUD 与引用保护；Logo 不接真实上传 |
| `DEC-PRD-044` | 基本/辅助单位换算率、精度、停用和引用生命周期未定义 | 推荐基本单位换算率固定 1；辅助单位为正数最多 6 位小数；有引用时停用而非删除 | 单位 CRUD、订单/库存换算 | 单位选项只读 | 产品负责人/商品/库存 | decided | 已按推荐方案实现换算率校验、停用和引用保护 |
| `DEC-PRD-045` | 标签颜色、排序、停用、删除和 AI 白名单边界未定义 | 推荐名称企业内唯一；颜色为受控十六进制；有商品引用时停用；`aiAllowed` 默认关闭 | 标签 CRUD、智能标签 | 标签只读展示 | 产品负责人/商品管理员 | decided | 已按推荐方案实现颜色、排序、白名单和引用保护 |
| `DEC-PRD-046` | 展示分类是否与后台分类共享树、图片/排序和删除规则未定义 | 推荐完全独立的平面分类；名称唯一、排序为非负整数；图片为 fake 元数据；有商品引用时停用 | 展示分类 CRUD、商品展示字段 | 商品后台分类 | 产品负责人/商品运营 | decided | 展示分类使用独立集合；不会修改商品后台 `categoryId` |
| `DEC-PRD-047` | 智能标签分析是否自动生效、范围、上限、失败和结果保留未定义 | 推荐 fake 分析最多 1000 个商品；只生成新增/移除建议，人工确认后原子写入；失败保留旧标签 | 智能标签分析/确认 | 标签基础 CRUD | 产品负责人/商品管理员 | decided | fake 分析只生成 pending 建议，确认时做版本校验并原子写入 |
| `DEC-PRD-048` | 辅助资料管理与查看、导入导出、智能分析的角色细权限未定义 | 推荐超级管理员完整读写；销售主管只读；业务员/仓库消费启用选项但不能配置；财务不可进入；三层一致 | PRD-005 路由/UI/Service | 商品主档既有读取 | 产品负责人/管理员 | decided | UI、路由和 Service 三层一致；财务被拒绝，非管理员只读启用资料 |
| `DEC-PRD-049` | 六类资料是否共用 Repository、审计和 Mock reset 边界未定义 | 推荐 Product Repository 单一 owner；每次写入原子并追加变更日志；reset 恢复同一 baseline | 跨商品引用与验收 | 现有 `getReferenceData` | 技术负责人/商品管理员 | decided | 所有写入复用 Product Repository 事务、变更日志和 Mock reset |

## 中断恢复点

当前处于 verification 已完成。恢复时先阅读本计划的验证证据和 `docs/PLANS.md`，下一批创建唯一 active plan `CUS-002 + CUS-004 + CUS-005`；不要重做 PRD-005，也不要实现真实 AI 或外部图片上传。
