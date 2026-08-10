# AGENTS.md

本仓库用于构建“蜂订全渠道营销系统”PC 管理后台原型。保持本文件简短：它只定义工作入口、路由和不可违反的规则。

## 开工顺序

1. 确认位于仓库根目录。
2. 阅读 `progress.md` 和 `feature_list.json`。
3. 阅读 `docs/ROADMAP.md`，确认当前阶段和依赖顺序。
4. 阅读 `ARCHITECTURE.md` 和 `docs/ENGINEERING_GUARDRAILS.md`。
5. 从 `docs/product-specs/index.md` 打开当前功能规格，并读取该功能的 `ui_spec`。
6. 检查 `docs/OPEN_QUESTIONS.md` 和 `docs/DECISIONS.md`。
7. 阅读 `docs/PLANS.md` 及当前 active plan。
8. 运行 `./scripts/init.ps1`；基础验证失败时先恢复 baseline。
9. 同一时间只允许一个功能处于 `in_progress`。

## 知识路由

| 问题 | 唯一事实来源 |
|---|---|
| 系统目的、用户、范围 | `docs/PRODUCT_SENSE.md` |
| 整体阶段、功能顺序、依赖关系 | `docs/ROADMAP.md` |
| 功能行为、业务规则、验收标准 | `docs/product-specs/` |
| 页面字段、控件、列、按钮和页面状态 | `docs/ui-specs/` |
| 系统结构、依赖方向、代码位置 | `ARCHITECTURE.md` |
| 不确定事项如何处理、开发硬护栏 | `docs/ENGINEERING_GUARDRAILS.md` |
| 已知缺口、待业务确认问题 | `docs/OPEN_QUESTIONS.md` |
| 已确认的非显然决策 | `docs/DECISIONS.md` |
| UI 风格、组件与交互规则 | `docs/FRONTEND.md` |
| Mock 契约、数据场景、重置方式 | `docs/MOCK.md` |
| 原型安全边界、敏感数据和前端安全 | `docs/SECURITY.md` |
| 计划生命周期与当前计划 | `docs/PLANS.md`、`docs/exec-plans/active/` |
| 当前功能状态 | `feature_list.json` |
| 当前已验证状态与下一步 | `progress.md` |
| 启动、重启、测试与黄金旅程 | `docs/RELIABILITY.md` |
| Harness 质量审计与剩余风险 | `docs/QUALITY_SCORE.md` |

## 工作规则

- 不猜业务规则；规格缺失或冲突时，将功能标记为 `blocked` 并记录缺口。
- 不把参考产品的品牌、Logo、文案、图标或像素级样式复制进本项目。
- 页面不能直接读取 fixture；必须经 `repository -> service -> store/composable -> view`。
- 行为变化时同步更新对应 product spec；边界变化时更新 `ARCHITECTURE.md`。
- 不通过删除、跳过或弱化验证来制造 `passing`。
- 不在原型中接入真实支付、真实消息、真实地图、真实企微或生产数据。
- 任务中断前必须更新 active plan 的恢复点和 `progress.md`；恢复时从记录继续，不重做已验证工作。
- 业务功能设为 `in_progress` 前，必须从原需求提取页面字段规格并在功能清单填写 `ui_spec`。

## 完成定义

功能只有同时满足以下条件才能标记为 `passing`：

- 规格中的目标行为已实现。
- 规格列出的验收步骤已实际运行。
- `npm run verify` 通过。
- 证据已写入 `feature_list.json` 或当前 active plan。
- 受影响文档已更新，Mock 可重置，仓库可干净重启。

## 收尾

更新当前 active plan、`feature_list.json` 和 `progress.md`，记录已运行验证、遗留风险与下一步。完成的计划移动到 `docs/exec-plans/completed/`。
