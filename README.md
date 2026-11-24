# antigravity-zh-cn

**Google Antigravity 桌面端动态中文汉化引擎 + 官方标准中文交互插件（双形态、零第三方依赖、安全备份与字节级无损还原）**

[![CI](https://github.com/yuanwansi/antigravity-zh-cn/actions/workflows/ci.yml/badge.svg)](https://github.com/yuanwansi/antigravity-zh-cn/actions/workflows/ci.yml)
[![Node.js >= 18](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 核心特性

### 1. 形态一：Antigravity 桌面端动态中文汉化引擎
- **零外部依赖，纯 Node.js（>=18）驱动**：内置原生 Chromium Pickle 格式 Electron ASAR 解析与增量重打包引擎（`src/asar.js`），无需联网下载 `@electron/asar`，完整保留 `app.asar.unpacked` 原生模块并自动重算 Electron SHA-256 分块完整性哈希。
- **字节级无损备份与崩溃自愈**：
  - 首次安装自动备份原版 `app.asar` 并记录 SHA-256 校验清单（`.zh-cn.bak` + `.zh-cn.meta.json`）；
  - 重复安装/升级词典始终以原版备份为基底重打包，绝不叠加多重补丁；
  - 采用原子替换与 `.zh-cn.swap-old` 冷启动自愈机制，避免中途断电导致客户端无法启动；
  - 一键还原时校验备份哈希，确保 100% 恢复官方原版字节。
- **全方位内容禁区隔离与独立控件守卫**：
  - 自动跳过聊天用户输入、模型思考正文、代码块、Monaco 编辑器、工作区文件树、文件路径面包屑、终端输出与图标字体（`.codicon` / `.google-symbols` 等），绝不误译业务代码与文件名；
  - 单字/短词（如 `Save`、`Edit`、`High`）仅在独立 UI 控件（按钮、菜单、标签页、表头、表单标签）内翻译，绝不污染自然语言段落；
  - 任意 DOM 容器添加 `data-ag-i18n-skip` 属性即可显式跳过。
- **实时中/英热切换**：安装后按 **`Alt + Shift + L`** 即可在中文与英文界面之间即时切换，无需重启。
- **用户自定义覆盖词典**：支持在 `~/.antigravity-zh-cn/custom-dict.json` 自定义译文，客户端官方更新也不会丢失你的个人词条。

### 2. 形态二：官方标准中文交互插件（零侵入）
- 仓库内附带符合 Antigravity 官方插件规范的 `plugin/antigravity-zh-cn/`：
  - `plugin.json`：标准插件元数据清单；
  - `rules/AGENTS.md`：全局简体中文对话、实现计划、任务进度与注释规范；
  - `skills/zh-dict-helper/SKILL.md`：词典维护与审计辅助技能。
- 不想改动客户端文件，或官方刚刚发布更新时，可单独安装此插件，直接在左侧 **Customizations → Installed** 中随时开关。

---

## 快速开始

> **环境要求**：Node.js `>= 18.0.0`（运行安装或还原前请先完全退出 Antigravity 桌面端）。

### 方式 A：双击一键脚本（推荐）

- **Windows**：
  - 安装（桌面端汉化 + 官方标准中文插件）：双击运行 [`scripts/一键安装中文汉化.bat`](scripts/一键安装中文汉化.bat)
  - 无损还原官方英文：双击运行 [`scripts/一键还原官方英文.bat`](scripts/一键还原官方英文.bat)
- **macOS / Linux**：
  ```bash
  bash scripts/install.sh
  # 无损还原
  bash scripts/uninstall.sh
  ```

### 方式 B：命令行（CLI）

```bash
# 1. 安装桌面端中文汉化（附加 --with-plugin 可同时安装标准中文插件）
node bin/cli.js install --with-plugin

# 如自动探测不到安装目录，可手动指定客户端目录或 app.asar 路径
node bin/cli.js install --target "C:\Users\<用户名>\AppData\Local\Programs\antigravity"

# 2. 查看当前汉化与插件状态
node bin/cli.js status

# 3. 仅安装/卸载官方标准中文交互插件（零侵入客户端本体）
node bin/cli.js install-plugin
node bin/cli.js uninstall-plugin

# 4. 校验词典完整性与安全规范
node bin/cli.js check-dict

# 5. 一键无损还原官方英文原版
node bin/cli.js restore
```

---

## 自定义词典

将 [`dicts/99-custom.example.json`](dicts/99-custom.example.json) 复制为 `~/.antigravity-zh-cn/custom-dict.json`（Windows 路径为 `C:\Users\<用户名>\.antigravity-zh-cn\custom-dict.json`），按 `英文原文: 中文译文` 填写即可自动覆盖默认词条：

```json
{
  "New Conversation": "开启新对话",
  "Ask anything...": "有什么我可以帮你的？"
}
```

---

## 目录结构

```text
antigravity-zh-cn/
├── bin/cli.js                          # 跨平台 CLI 命令行入口
├── src/
│   ├── asar.js                         # 纯 JS 零依赖 Electron ASAR 解析、SHA-256 分块完整性与增量重打包
│   ├── paths.js                        # 跨平台安装路径探测、冷启动自愈与受保护环境安全守卫
│   ├── dict-loader.js                  # 模块化词典加载、冲突/禁词校验与用户覆盖词典合并
│   ├── runtime.js                      # 注入 preload 的动态 DOM 汉化引擎（禁区隔离 + 热切换）
│   ├── patcher.js                      # 备份、校验、原子替换与字节级无损还原核心引擎
│   └── plugin-installer.js             # 官方标准中文插件安装/卸载器
├── dicts/                              # 模块化简体中文词典（通用、导航、对话、设置、定制与 MCP）
├── plugin/antigravity-zh-cn/           # 符合官方规范的 Antigravity 中文助手插件
├── scripts/                            # Windows / macOS / Linux 一键安装与还原脚本
├── test/                               # 基于 node:test 的全链路单元测试与模拟端到端测试
└── .github/workflows/ci.yml            # 跨平台 GitHub Actions CI（Windows / macOS / Linux）
```

---

## 常见问题

1. **Antigravity 官方更新后变回英文怎么办？**
   官方升级会覆盖 `app.asar`。只需重新执行 `node bin/cli.js install`（或重新双击安装脚本），工具会自动识别新的官方原版并刷新备份后重新应用汉化。
2. **为什么在 Antigravity 内置终端或 Agent 会话里直接运行 `install` 会被拦截？**
   工具内置了受保护环境守卫，防止正在运行中的宿主客户端文件被误改或被强杀。请完全退出 Antigravity 后，在系统外部终端（PowerShell / CMD / Terminal）中运行。
3. **如何运行自动化测试？**
   ```bash
   npm run check:dict
   npm test
   ```

---

## 参考与致谢

本项目在架构设计、内容禁区隔离策略及安全备份还原实践上，参考并致谢以下优秀的 MIT 开源社区项目：
- [Silas-02/antigravity-desktop-cn](https://github.com/Silas-02/antigravity-desktop-cn)（内容禁区隔离、独立控件守卫与模块分包词典规范思路）
- [yiheng8023/antigravity-chinese](https://github.com/yiheng8023/antigravity-chinese)（跨平台路径探测、断电自愈守卫与双形态设计思路）

## 开源协议

本项目基于 [MIT License](LICENSE) 开源。
