# 蜂订全渠道营销系统原型

本仓库是蜂订 PC 管理后台的 Vue 3 + Mock 原型，也是面向 coding agent 的 Harness 工程环境。

## 当前目标

- 用可重复启动的前端原型验证核心业务流程、页面结构和交互。
- 以仓库内文档作为产品、业务规则、架构、计划和验收的唯一事实来源。
- 先验证核心纵向切片，不在原型阶段接入真实后端、支付、地图、企微或生产数据。

## 快速开始

```powershell
./scripts/init.ps1
./scripts/start.ps1
```

标准验证：

```powershell
./scripts/verify.ps1
```

## 阅读入口

- AI 工作入口：`AGENTS.md`
- 系统架构与依赖边界：`ARCHITECTURE.md`
- 产品目标与原型边界：`docs/PRODUCT_SENSE.md`
- 整体开发顺序与阶段目标：`docs/ROADMAP.md`
- 业务规格索引：`docs/product-specs/index.md`
- 页面字段规格规则：`docs/ui-specs/README.md`
- AI 开发护栏：`docs/ENGINEERING_GUARDRAILS.md`
- 待确认问题：`docs/OPEN_QUESTIONS.md`
- 原型安全边界：`docs/SECURITY.md`
- Harness 质量审计：`docs/QUALITY_SCORE.md`
- 当前功能状态：`feature_list.json`
- 当前已验证状态：`progress.md`
- 最近完成计划：`docs/exec-plans/completed/2026-08-10-prototype-foundation.md`

## 目录职责

```text
src/                    Vue 3 产品代码
mock/                   Mock 数据、场景和接口处理
src/**/*.spec.ts        与功能代码同位置的可执行验证
docs/product-specs/     用户可见行为和业务规则
docs/exec-plans/        跨会话执行计划
docs/references/        外部来源与待核实项
scripts/                标准启动、验证和数据重置入口
```

不要从聊天记录恢复项目事实；聊天中的有效决策必须回写到上述仓库文件。
