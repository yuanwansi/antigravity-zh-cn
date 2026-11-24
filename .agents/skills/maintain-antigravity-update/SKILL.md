---
name: maintain-antigravity-update
description: >-
  End-to-end maintenance runbook for upgrading antigravity-zh-cn whenever a new
  Google Antigravity Desktop version is installed or released. Audits client hooks,
  extracts new UI strings, updates dictionaries, runs tests, and publishes a new release.
---

# Antigravity 版本更新自动维护流程

当用户提示「Antigravity 更新了，帮我维护汉化程序」或由定时自动化任务触发版本巡检时，严格按以下步骤执行：

## 1. 运行本机客户端兼容性与增量词条巡检

在仓库根目录 `d:\agy` 运行内置巡检命令（只读检查，不会修改正在运行的客户端）：

```bash
node bin/cli.js audit-client --json
```

检查返回结果中的四个关键指标：
1. `clientVersion`：当前本机安装的 Antigravity 客户端版本号（对比 `README.md` 或最新 GitHub Release 记录的版本）。
2. `patched`：当前本机 `app.asar` 是否被官方更新覆盖回了未汉化的英文原版（`patched: false` 说明客户端刚刚自动更新过）。
3. `hooksOk` / `mainPatchedFiles`：确认 `dist/preload.js` 以及 `dist/menu.js`、`dist/tray.js`、`dist/ipcHandlers.js`、`dist/updater.js` 四个主进程钩子是否全部命中并通过 `vm.Script` 语法预检。
4. `untranslatedLiterals`：客户端 `dist/*.js` 中新增且尚未收录进 `dicts/*.json` 的面向用户的英文 UI 文案列表。

## 2. 补充新增词条与修复钩子（如有变更）

- **若有新增 `untranslatedLiterals`**：
  - 过滤内部调试报错码后，将真正面向用户的弹窗、菜单、提示文案翻译为自然简体中文，按模块归入 `dicts/01-common.json` ~ `dicts/07-extended-ui.json`。
  - 若遇到含动态数字、日期或名称的新句式，将其加入 `src/runtime.js` 的 `DYNAMIC_RULES`。
- **若某个主进程钩子未命中（`mainPatchedFiles.length < 4`）**：
  - 用 `src/asar.js` 的 `readAsarFile` 只读检查对应 `dist/*.js` 文件的新函数签名，更新 `src/main-patches.js` 中的匹配锚点与 `test/main-patches.test.js` 测试用例。

## 3. 严格校验与全量测试

每次修改后必须执行：

```bash
npm run check:dict
npm test
```

确保 **0 错误、0 警告** 且全部单元测试通过。注意所有 `.github/workflows/*.yml` 中的 Action 必须保持固定为 40 位完整 Commit SHA，以维持 HOL Plugin Scanner 100/100 满分。

## 4. 升级版本号、推送并发布 GitHub Release

若有词典或引擎更新：
1. 更新 `package.json` 版本号（如 `1.2.2` -> `1.2.3`）并运行 `npm install --package-lock-only` 同步锁文件。
2. 提交并推送至 `origin main`：
   ```bash
   git add -A
   git commit -m "feat: 适配 Antigravity v<新版本号> 新增词条与兼容性维护"
   git push origin main
   ```
3. 推送版本标签触发 `.github/workflows/release.yml` 自动打包上传免 Git `.zip` 懒人包：
   ```bash
   git tag v<新版本号>
   git push origin v<新版本号>
   ```
4. 提醒用户（若本机客户端已被更新还原为英文）：退出 Antigravity 客户端后双击 `scripts/一键安装中文汉化.bat` 重新应用新版汉化（绝不在 Agent 会话内部强杀正在运行的宿主客户端）。
