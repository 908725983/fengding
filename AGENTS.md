# AGENTS.md

本仓库用于构建“蜂订全渠道营销系统”PC 管理后台原型。本文件只做 AI 的短导航；业务、设计、计划和验收细节必须进入对应文档，不在这里展开。

## 开工顺序

1. 确认当前目录是仓库根目录。
2. 阅读 `ARCHITECTURE.md`，确认系统边界与依赖方向。
3. 阅读 `docs/QUALITY_SCORE.md`，只相信有证据的完成状态。
4. 阅读 `docs/product-specs/index.md` 和 `docs/design-docs/implementation-sequence.md`，确认功能 ID、来源、依赖、字段准备度、人工决策门和总体顺序。
5. 阅读 `docs/PLANS.md`；若 `docs/exec-plans/active/` 有计划，先从唯一当前步骤恢复，不另起重复任务。
6. 打开当前领域规格及其中明确链接的原始需求章节；字段结论必须先写回产品规格。
7. 阅读与改动相关的 `docs/DESIGN.md`、`docs/FRONTEND.md`、`docs/RELIABILITY.md` 和 `docs/SECURITY.md`。
8. 运行 `./scripts/init.ps1`。基线失败时先恢复基线，再做功能改动。

## 知识路由

| 要找的事实 | 唯一入口 |
|---|---|
| 系统组成、代码位置、依赖边界 | `ARCHITECTURE.md` |
| 用户、任务、范围、产品判断 | `docs/PRODUCT_SENSE.md` |
| 全部功能、来源、依赖、规格准备度、人工决策 | `docs/product-specs/index.md` |
| 页面字段、业务规则、状态、验收 | `docs/product-specs/<domain>.md` |
| 原始需求与外部参考 | `docs/references/` |
| 长期实现顺序与阶段出口 | `docs/design-docs/implementation-sequence.md` |
| 当前任务、恢复点、验证证据 | `docs/PLANS.md`、`docs/exec-plans/active/` |
| 前端视觉、组件、交互与页面状态 | `docs/FRONTEND.md` |
| 启动、调试、重置、黄金旅程 | `docs/RELIABILITY.md` |
| 安全边界、外部动作、敏感数据 | `docs/SECURITY.md` |
| 当前质量和可信完成状态 | `docs/QUALITY_SCORE.md` |
| 已确认但延期处理的技术债 | `docs/exec-plans/tech-debt-tracker.md` |

## 防猜测门禁

- `source-only` 只允许提取规格；字段准备度为 `ready`、依赖 passing、阻塞决策已解决且 active plan 进入 `implementation` 后，才允许写业务代码。
- 原文缺少字段、默认值、枚举、计算、状态转换、权限或副作用时，写“未定义”并建立人工决策；不得使用行业惯例、竞品或模型记忆补齐。
- 原始需求与产品规格冲突时不自行选择；暂停受影响范围，记录证据、选项、影响和决定人。
- 工程约束可以提高确定性、安全性和可测试性，但不能悄悄改变业务行为。
- 同一时间只推进一个业务切片；不为展示进度提前生成无契约页面。

## 工作约定

- 页面不得直接读取 fixture；数据必须经过 `repository -> service -> store/composable -> view`。
- 产品行为变化时同步产品规格；架构边界变化时同步 `ARCHITECTURE.md` 和设计文档。
- 重复反馈转化为测试、静态检查或生成规则，不增加重复事实入口。
- 生成内容放入 `docs/generated/`；外部材料放入 `docs/references/`。
- 原型不接真实支付、消息、地图、企微或生产数据；相关动作使用明确标识的 fake adapter。

## 完成与收尾

只有在行为已实现、规则和页面状态已验证、证据已写入 active plan 与 `docs/QUALITY_SCORE.md`、文档已同步、干净重启后仍可复现时，任务才算完成。

收尾时更新 active plan 的恢复点；完成后移入 `docs/exec-plans/completed/`；真实但延期的工程问题登记技术债，并明确下一切片。
