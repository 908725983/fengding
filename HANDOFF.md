# 蜂订项目交接

## 手动启动

电脑需要先安装 Node.js 20.19 或更高版本。

如果拿到的是交接压缩包，先解压，然后在解压目录打开 PowerShell：

```powershell
git clone .\fengding-prototype-2026-09-11.bundle fengding
cd .\fengding
git switch main
```

如果电脑里已经有完整项目，直接进入项目目录即可。

打开 PowerShell，进入项目目录后运行：

```powershell
cd C:\project\fengding
./scripts/init.ps1
./scripts/start.ps1
```

`init.ps1` 用来安装依赖，第一次启动或依赖有变化时运行一次即可。以后启动项目只需运行：

```powershell
cd C:\project\fengding
./scripts/start.ps1
```

启动成功后，按照终端显示的网址在浏览器中打开系统。停止系统时，在运行窗口中按 `Ctrl+C`。

## 交给 AI 继续修改

把完整项目文件夹交给接手人。接手人用 Codex 打开项目目录 `C:\project\fengding`，新建任务并发送下面这段话：

```text
这是蜂订管理后台原型项目。请先阅读根目录中的 AGENTS.md、HANDOFF.md 和 ARCHITECTURE.md，再检查 git status 和最近的提交记录。先告诉我你理解的项目现状，不要立即改代码。之后我会逐条说明需要修改的内容。每次修改都要保留已有数据和改动，并完成相关测试。
```

后续每次只需要直接告诉 AI：在哪个页面、现在有什么问题、希望改成什么样。最好同时附上页面截图。

不要只把演示视频发给 AI。AI 需要能够读取完整项目目录，尤其是 `.git`、`AGENTS.md`、源代码和测试文件。
