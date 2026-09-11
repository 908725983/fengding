# 蜂订项目交接：先看这个

接手后只需要按下面两步操作。

## 一、把项目启动起来

电脑需要先安装：

- Git
- Node.js 20.19 或更高版本

解压交接包，在解压后的文件夹里打开 PowerShell，然后依次运行：

```powershell
git clone .\fengding-prototype-2026-09-11.bundle 蜂订项目
cd .\蜂订项目
git switch main
npm ci
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\start.ps1
```

终端出现网址后，用浏览器打开该网址。通常是 `http://127.0.0.1:5173`。

以后再次启动，只需要进入 `蜂订项目` 文件夹并运行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\start.ps1
```

停止运行时，在终端按 `Ctrl+C`。

## 二、交给 AI 继续修改

在 Codex 中打开刚才生成的 `蜂订项目` 文件夹。不要打开 ZIP，也不要把 `.bundle` 文件直接交给 AI。

新建任务后，把下面这段话完整发给 AI：

```text
你现在接手的是蜂订管理后台原型。先不要修改代码。

请先完整阅读 AGENTS.md、HANDOFF.md、ARCHITECTURE.md，以及 docs/exec-plans/active 目录中的当前计划；再检查 git status 和最近 5 次提交，并运行 npm run typecheck、npm run test:run、npm run build。先向我说明项目现状、原本就存在的失败和你准备怎样处理，等我给出具体需求后再动手。

以后每次修改都遵守这些要求：
1. 一次只处理我明确提出的一个问题，不顺手重做其他模块。
2. 修改前检查 git status，不覆盖、不删除已有但未提交的改动。
3. 尽量少改文件，沿用项目现有写法，不伪造测试结果。
4. 修改后运行相关测试、npm run typecheck 和 npm run build；页面改动还要在浏览器里实际检查。
5. 不得增加新的测试失败。完成后告诉我改了什么、检查结果是什么，再按我的要求提交 Git。
6. 不要使用 git reset --hard，不要删除现有功能或数据来绕过问题。
```

之后提需求时，用最简单的话告诉 AI 三件事：哪个页面、现在有什么问题、希望改成什么样。能附截图就一起附上。

这套做法不能保证任何修改绝对没有 Bug，但能保留原代码、识别项目原有问题，并在每次改动后检查是否引入了新问题。
