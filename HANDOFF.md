# 蜂订原型项目交接

## 一句话说明

蜂订当前是一个使用 Vue 3、Pinia 和本地 Mock 构建的 PC 管理后台原型，用于验证业务流程、字段和页面交互；它没有真实后端数据库，也不能直接作为生产系统上线。

## 接手基线

- 项目目录：`C:\project\fengding`
- 当前分支：`main`
- 交接还原点：`fengding-prototype-handoff-2026-09-11`
- 远程仓库：当前未配置，交接时必须复制完整 Git 仓库或先推送到公司 Git 仓库。
- 功能演示：项目根目录的 `功能演示.mp4`，文件不进入 Git，需通过公司网盘或移动存储单独交付。

如果收到桌面交接包中的 Git bundle，可以这样恢复完整仓库和历史：

```powershell
git clone .\fengding-prototype-2026-09-11.bundle fengding
cd .\fengding
git switch main
```

查看交接版本：

```powershell
git show fengding-prototype-handoff-2026-09-11 --stat
```

从交接版本创建恢复分支：

```powershell
git switch -c restore/handoff-2026-09-11 fengding-prototype-handoff-2026-09-11
```

不要用 `git reset --hard` 直接覆盖尚未保存的工作。

## 启动和验证

环境要求：Windows PowerShell、Node.js 20.19+、npm。

```powershell
cd C:\project\fengding
./scripts/init.ps1
./scripts/start.ps1
```

常用检查：

```powershell
npm run typecheck
npm run test:run
npm run build
```

需要恢复确定性 Mock 基准时运行：

```powershell
./scripts/reset-mock.ps1
```

`reset-mock.ps1` 会恢复 Mock 基准。需要保留当前操作现场时不要运行。

## 系统边界

- 没有真实后端、数据库和生产数据持久化。
- 没有接入真实支付、退款、物流、短信、地图、企微和文件存储。
- 页面中的付款、退款、发货等结果均为本地业务模拟。
- 页面操作产生的数据主要保存在当前内存 Runtime 中，刷新、重启或切换模拟场景后可能丢失。
- 页面存在不等于功能已经达到生产标准；真实接口、鉴权、事务、并发和审计仍需单独设计。

## 三条核心流程

### 采购和付款

```text
供应商 -> 供货关系 -> 采购订单 -> 审核 -> 入库
-> 供应商应付 -> 供应商付款 -> 付款核销
```

采购入库增加库存并形成供应商应付；供应商付款减少资金账户余额；付款核销只建立付款和应付的对应关系，不重复扣款。

### 销售和收款

```text
客户 -> 销售订单 -> 审核 -> 销售出库 -> 发货 -> 签收
-> 客户应收 -> 客户收款 -> 收款核销
```

创建和审核订单不扣库存；销售出库才扣库存；收款改变资金账户，核销只处理收款和应收的对应关系。

### 客户退货退款

```text
已出库订单 -> 客户退单 -> 审核 -> 退货入库
-> 冲减客户欠款或形成退款义务 -> 财务确认退款
```

退货入库增加库存。未付款部分优先冲减客户欠款，只有需要实际退钱的部分才形成退款义务。

## 当前状态

- 当前活跃计划：`docs/exec-plans/active/2026-09-01-production-field-optimization.md`。
- 该计划的代码实施基本完成，目前处于 `verification` 阶段。
- 最近完成了库存字段直白化、订单库存跨仓汇总、实时仓库读取和退货库位同步。
- 2026-09-11 验证结果：类型检查通过、生产构建通过、订单与库存专项 189 项测试通过。
- 全量测试 459 项中有 458 项通过，1 项失败：商品授权页面测试期望显示“永久”。
- `npm run verify:harness` 当前未通过，主要是需求快照和 active plan 格式不符合现有 Harness 门禁。

## 下一步顺序

1. 修复 `npm run verify:harness` 报告的需求快照和 active plan 格式问题。
2. 修复商品授权页面“永久”文案测试，使全量测试通过。
3. 从 Mock reset 开始，分别跑通采购付款、销售收款、客户退货退款三条浏览器黄金旅程。
4. 记录关键单号、库存变化、资金变化和应收应付守恒结果。
5. 验证完成后更新并归档当前 active plan。
6. 再由负责人决定是否进入真实后端、数据库和外部接口设计。

不要同时展开多个新模块，也不要为了让单次测试通过而删除测试、修改基准数据或绕过 Repository/Service。

## 接手 AI 的开场提示

接手人开启新的 AI 任务时，可以发送：

```text
你正在接手蜂订管理后台原型。项目目录是 C:\project\fengding，交接还原点是
fengding-prototype-handoff-2026-09-11。

先不要修改代码。依次阅读 HANDOFF.md、AGENTS.md、ARCHITECTURE.md、
docs/QUALITY_SCORE.md、docs/RELIABILITY.md，以及 docs/exec-plans/active/ 下的当前计划。
然后执行 git status，向我说明项目定位、当前状态、已知问题和下一步唯一任务。
未经确认不要扩大范围、不要重置 Mock、不要删除已有改动。
```

## 交接时怎么说

可以直接向接手人说明：

> 这是蜂订业务管理后台的前端 Mock 原型，主要用于验证采购、销售和退货三条业务流程，不是已经接好后端的生产系统。代码、Git 历史和说明都在项目仓库里，先看根目录的 HANDOFF.md 和 AGENTS.md。启动用 scripts/start.ps1，交接基线以 Git 标签 fengding-prototype-handoff-2026-09-11 为准。当前主要功能已经可以演示，但还剩 Harness 文档门禁、一个商品授权文案测试以及三条主流程的最终浏览器回归。功能演示视频我会单独发给你。以后让 AI 修改时，每次先让它读 HANDOFF.md 和当前 active plan，再只处理一个明确任务。

## 资料入口

- AI 工作规则：`AGENTS.md`
- 系统架构：`ARCHITECTURE.md`
- 启动、验证和恢复：`docs/RELIABILITY.md`
- 当前可信质量：`docs/QUALITY_SCORE.md`
- 产品规格目录：`docs/product-specs/index.md`
- 当前执行计划：`docs/exec-plans/active/2026-09-01-production-field-optimization.md`
- 已知技术债：`docs/exec-plans/tech-debt-tracker.md`
