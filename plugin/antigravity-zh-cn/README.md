# Antigravity 中文助手插件（`antigravity-zh-cn`）

这是符合 Google Antigravity 官方插件规范的零侵入中文增强包，启用后无需修改客户端文件即可生效：

- **全局中文回复规范（`rules/AGENTS.md`）**：确保所有对话、实现计划、任务清单、分析说明和执行总结始终使用自然流畅的简体中文，同时保留代码标识符、命令和专有名词原样。
- **词典维护技能（`skills/zh-dict-helper/SKILL.md`）**：协助开发者按规范向 `antigravity-zh-cn` 词典分包补充或审查中文译文。

## 安装方式

在仓库根目录执行：

```bash
node bin/cli.js install-plugin
```

安装完成后可在 Antigravity 左侧边栏 **Customizations → Installed** 中随时开启或关闭。
