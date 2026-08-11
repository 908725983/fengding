# 启动与验收

## 环境基线

- Windows PowerShell 7 或兼容版本
- Node.js 20.19+ 或 22.12+（本仓验证使用 Node 24）
- npm

## 标准命令

```powershell
./scripts/init.ps1       # 缺依赖时安装，然后执行全部验证；不修改 Mock 现场
./scripts/start.ps1      # 启动本地原型
./scripts/verify.ps1     # Harness + 类型 + 测试 + 构建
./scripts/reset-mock.ps1 # 恢复确定性 Mock 状态
```

等价 npm 命令：`npm run dev`、`npm run verify`、`npm run mock:reset`。

## 干净重启

1. 停止开发服务器。
2. 仅在需要恢复确定基线时运行 `./scripts/reset-mock.ps1`；恢复中断任务时保留现场。
3. 运行 `./scripts/init.ps1` 验证依赖和代码。
4. 运行 `./scripts/start.ps1`。
5. 打开终端显示的本地地址，确认应用壳、侧栏和 Dashboard 可见。

## 基线黄金旅程

1. 页面载入后显示“蜂订业务原型”与八个有详细规格的导航领域。
2. Dashboard 显示当前阶段、Harness 检查项和模块规划状态。
3. 点击任一未开发模块，显示其规格入口和“规划中”，不展示虚构业务数据。
4. 1280px 宽度下侧栏和主内容可用；窄屏下侧栏转为顶部横向导航。
5. 运行 `npm run verify`，所有检查通过。

## 故障处理

- 安装时若全局 npm 缓存无写权限，脚本会将缓存切换到仓库 `.npm-cache/`。
- `init.ps1` 不会自动重置 Mock，避免任务恢复时丢失现场；测试必须自行隔离数据。
- Harness 检查失败时先修链接、状态或规格，不跳过 `verify:harness`。
- Mock 状态异常时重置，不手工修改 baseline 来让单次测试通过。
- 构建失败时不得把功能标为 `passing`。

## 可观测与诊断

- 异步动作记录场景、领域动作、结果和可定位的错误代码，不记录敏感字段。
- 页面显示用户能理解的失败原因与重试入口；开发日志可以补充调用耗时和关联 ID。
- Mock handler 必须能稳定切换 normal、empty、error、slow 与 permission-denied，禁止靠随机失败复现问题。
- 诊断脚本与说明留在仓库内；只有聊天里提到过的排查知识不算可恢复。

## 原型不证明的内容

本验收不代表真实 API、数据库并发、在线支付、消息到达、地图定位、生产权限安全和审计合规已验证。
