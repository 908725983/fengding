# 蜂订管理后台原型

这是一个 Vue 3 + Mock 的 PC 管理后台原型，也是按照《Harness Engineering 学习指南》第 101—102 页高级结构组织的 AI 工程环境。产品代码仍放在 `src/` 和 `mock/`；Harness 作为仓库内的导航、规格、计划、验证与证据层存在。

## 使用入口

```powershell
./scripts/init.ps1
./scripts/start.ps1
./scripts/verify.ps1
```

- AI 开工入口：[AGENTS.md](AGENTS.md)
- 系统地图：[ARCHITECTURE.md](ARCHITECTURE.md)
- 产品规格：[docs/product-specs/index.md](docs/product-specs/index.md)
- 当前质量：[docs/QUALITY_SCORE.md](docs/QUALITY_SCORE.md)
- 执行计划规则：[docs/PLANS.md](docs/PLANS.md)

## Harness 目录

```text
AGENTS.md
ARCHITECTURE.md
docs/
├── design-docs/
│   ├── index.md
│   ├── core-beliefs.md
│   └── implementation-sequence.md
├── exec-plans/
│   ├── active/
│   ├── completed/
│   └── tech-debt-tracker.md
├── generated/
│   └── db-schema.md
├── product-specs/
│   ├── index.md
│   └── 各业务领域规格.md
├── references/
│   ├── source-requirements.md
│   ├── requirements-manifest.json
│   └── requirements/
├── DESIGN.md
├── FRONTEND.md
├── PLANS.md
├── PRODUCT_SENSE.md
├── QUALITY_SCORE.md
├── RELIABILITY.md
└── SECURITY.md
```

目录中的文件按职责只有一个入口：业务事实进产品规格，设计理由进设计文档，执行现场进 active plan，外部材料进 references，生成物进 generated。聊天记录不作为项目事实来源。
