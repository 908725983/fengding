# 页面字段规格

## 定位

`docs/product-specs/` 说明业务行为，`docs/ui-specs/` 说明这些行为在具体页面如何呈现，包括字段、控件、表格列、按钮、权限、状态和交互。

原始需求已经包含大量字段，因此不提前复制全部页面。每个业务功能开始前，只提取本功能涉及的页面，完成后在 `feature_list.json` 增加：

```json
"ui_spec": "docs/ui-specs/customers/customer-foundation.md"
```

自动检查会阻止没有 `ui_spec` 的业务功能进入 `in_progress` 或 `passing`。

## 建议目录

```text
docs/ui-specs/
├─ dashboard/
├─ orders/
├─ products/
├─ procurement/
├─ inventory/
├─ customers/
├─ finance/
└─ settings/
```

一个功能可对应一份包含多个紧密页面的规格；大型功能可建立目录索引并在 `feature_list.json` 指向索引。

## 提取原则

1. 逐段读取 `source-requirements.md` 登记的原需求，不凭记忆摘录。
2. 保留原业务字段名称、顺序、必填性、只读性、单位和说明。
3. 将原需求没有定义、但为实现补充的内容标注为“设计补充”。
4. 将冲突、含义不明和高风险缺口登记到 `OPEN_QUESTIONS.md`。
5. 页面按钮必须关联权限点、可见状态、可执行状态和 command。
6. 计算字段必须关联业务规则 ID 或明确公式。
7. 页面规格完成后才能创建组件；组件实现不得成为字段事实来源。

## 页面规格最小内容

- 页面目的、路由、入口和角色。
- 页面骨架与响应式行为。
- 筛选字段、默认值、查询触发和重置行为。
- 表格列、宽度策略、格式、排序、固定和点击行为。
- 表单字段、控件、必填、默认、来源、校验、联动和权限。
- 详情分组、Tab、关联记录和审计信息。
- 页面动作、确认文案、状态限制、权限点和成功/失败结果。
- loading、empty、no-result、error、restricted、slow 状态。
- Mock 数据与人工验收步骤。

复制 `docs/ui-specs/TEMPLATE.md` 开始，不允许删除不适用章节；不适用时写明原因。

## 当前状态

业务开发尚未开始，因此暂未提取具体页面字段。下一项 `CUS-001` 开始时，先创建 `docs/ui-specs/customers/customer-foundation.md`。
