# 原型 Harness 与应用壳基线

- 日期：2026-08-10
- 关联功能：HNS-001、SHELL-001
- 状态：已完成

## 目标

建立可干净启动、可导航、可机械检查的 Vue 3 原型仓库。AI 能通过短入口找到产品、业务、架构、UI、Mock、计划和验收事实；没有需求依据的模块保持 blocked。

## 非目标

- 不在本计划实现订单、库存等业务页面。
- 不接真实后端或外部系统。
- Dashboard 只展示 Harness 状态与模块规划，不冒充业务经营数据。

## 事实来源

- `docs/references/source-requirements.md` 登记的八份需求文档。
- `learn-harness-engineering-guide-zh.pdf` 第 100 页以后关于短入口、深链接、功能清单、进度、启动与验证的组织原则。
- 用户提供的参考截图，仅用于抽象前端风格。

## 影响范围

仓库根入口、`docs/`、`feature_list.json`、`scripts/`、Vue 应用壳、Mock 基准、自动测试与构建配置。

## 里程碑

- [x] 建立短 `AGENTS.md`、架构与进度入口。
- [x] 建立产品、前端、Mock、计划、可靠性文档。
- [x] 拆分八个有依据的业务规格并登记缺口。
- [x] 建立机器可读功能清单且只有一个 `in_progress`。
- [x] 建立可运行 Vue 3 应用壳与确定性 Mock 基线。
- [x] 完成 Harness、类型、测试、构建验证。
- [x] 写入证据并关闭本计划。

## 验收证据

- `npm run verify:harness`：通过；23 个功能、8 份领域规格、50 行入口导航。
- `npm run typecheck`：通过。
- `npm run test:run`：2 个测试文件、3 个测试全部通过。
- `npm run build`：Vite 生产构建通过。
- Mock reset：`baseline.json` 成功恢复到 `work/mock-state.json`。
- 浏览器：八领域导航和订单规划页可达，控制台无警告/错误。
- 响应式：1280px 和 720px 均无页面级横向溢出，窄屏切换横向导航。

## 决策记录

- 采用中等强度 Harness：保留原型当前真正需要的事实、计划和机械验证，不提前引入生产运维文档群。
- `AGENTS.md` 只做导航与硬规则，业务细节下沉到模块规格。
- 商家和独立数据分析保持 blocked，防止 AI 按竞品自行补全。
- 应用壳使用原创的冷色 B2B 视觉语言，未实现入口显示“规划中”。
- TypeScript 固定为 5.9.3，避免 TypeScript 7 与当前 `vue-tsc` 的内部导出不兼容。

## 风险与后续

- 首批功能若同时开发会稀释验证质量；继续保持最多一个 `in_progress`。
- 下一个功能为路线图阶段一的 `CUS-001`；先建立订单依赖的客户事实，再逐步补齐商品、价格授权和库存。
