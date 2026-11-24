---
name: zh-dict-helper
description: >-
  Assists with adding, auditing, and organizing Simplified Chinese UI translations
  for the antigravity-zh-cn localization project while preventing wildcard pollution
  and preserving technical terminology.
---

# Antigravity 中文词典维护技能

当用户希望向 `antigravity-zh-cn` 项目新增界面翻译词条、排查误译或校验词典质量时，按以下步骤执行：

## 1. 词条归属原则

按功能模块归入对应的 `dicts/*.json` 文件：
- `dicts/01-common.json`：通用按钮、弹窗操作、状态标签、时间短语
- `dicts/02-sidebar-nav.json`：左侧导航、项目管理、工作区与辅助面板
- `dicts/03-chat-agent.json`：对话区、模型选择、思考深度、审批与多智能体
- `dicts/04-settings.json`：全局与项目设置、权限策略、终端沙盒、账单与额度
- `dicts/05-customizations-mcp.json`：技能、规则、插件市场、MCP 与计划任务

## 2. 严格安全规范

1. **禁止收录高危通配单字**：不要录入英语介词、代词、助动词或通用技术命令词（如 `on`、`in`、`to`、`git`、`npm`、`plugin`、`skill`）。
2. **动态数字走正则模板**：含动态计数、耗时、百分比或版本号的文案（如 `Working for 2m 10s`）不要写死在 JSON 词典中，应添加到 `src/runtime.js` 的 `DYNAMIC_RULES`。
3. **保留专有名词**：品牌名与模型名（如 `Antigravity`、`Gemini`、`Claude`、`MCP`、`SSH`、`Cron`）保持原样。
4. **修改后必须校验**：每次修改词典后运行：
   ```bash
   npm run check:dict && npm test
   ```
