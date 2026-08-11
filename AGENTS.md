# AGENTS.md

本仓库用于构建“蜂订全渠道营销系统”PC 管理后台原型。本文件只做 AI 的短导航；业务、设计、计划和验收细节必须进入对应文档，不在这里展开。

## 开工顺序

1. 确认当前目录是仓库根目录。
2. 阅读 `ARCHITECTURE.md`，确认边界与依赖方向。
3. 阅读 `docs/QUALITY_SCORE.md`，了解哪些能力已有证据、哪些仍未实现。
4. 阅读 `docs/PLANS.md`；若 `docs/exec-plans/active/` 有计划，先从计划中的当前步骤恢复。
5. 从 `docs/product-specs/index.md` 打开本次工作涉及的产品规格；需要字段细节时查 `docs/references/requirements/`，并先把确认结果写回产品规格。
6. 阅读与改动相关的 `docs/DESIGN.md`、`docs/FRONTEND.md`、`docs/RELIABILITY.md` 或 `docs/SECURITY.md`。
7. 运行 `./scripts/init.ps1`。基线失败时先恢复基线，再做功能改动。

## 知识路由

| 要找的事实 | 唯一入口 |
|---|---|
| 系统组成、代码位置、依赖边界 | `ARCHITECTURE.md` |
| 用户、任务、范围、产品判断 | `docs/PRODUCT_SENSE.md` |
| 页面行为、字段、业务规则、验收 | `docs/product-specs/` |
| 设计理由与长期实现顺序 | `docs/DESIGN.md` |
| 当前任务、恢复点、验证证据 | `docs/PLANS.md`、`docs/exec-plans/active/` |
| 前端视觉、组件、交互与页面状态 | `docs/FRONTEND.md` |
| 启动、调试、重置、黄金旅程 | `docs/RELIABILITY.md` |
| 安全边界、外部动作、敏感数据 | `docs/SECURITY.md` |
| 当前质量、缺口与简化记录 | `docs/QUALITY_SCORE.md` |
| 已确认但延期处理的技术债 | `docs/exec-plans/tech-debt-tracker.md` |
| 原始需求与外部参考 | `docs/references/` |

## 工作约定

- 一次只推进一个边界明确、能独立验收的切片；复杂工作先建立 active plan。
- 规格缺失或冲突时不要猜：在相关产品规格和 active plan 的“开放决策”中记录后暂停受影响部分。
- 页面不得直接读取 fixture；数据必须经过 `repository -> service -> store/composable -> view`。
- 产品可见行为变化时同步更新产品规格；架构边界变化时同步更新 `ARCHITECTURE.md` 和设计文档。
- 重复出现的评审意见要转化为测试、静态检查或生成规则，而不是继续堆入口文档。
- 生成内容放入 `docs/generated/`；外部材料放入 `docs/references/`。
- 原型不接真实支付、消息、地图、企微或生产数据；相关动作使用明确标识的 fake adapter。

## 完成与收尾

只有在行为已实现、相关验证已实际运行、证据已写入 active plan 与 `docs/QUALITY_SCORE.md`、文档已同步、干净重启后仍可复现时，任务才算完成。

收尾时更新 active plan 的进度和恢复点；完成后移入 `docs/exec-plans/completed/`；真实但延期的缺口登记到技术债台账，并写明下一步。
