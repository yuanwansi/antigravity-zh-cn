# Antigravity 中文汉化引擎 & 中文助手插件 (`antigravity-zh-cn`)

<p align="center">
  <b>简体中文</b> | <a href="README.en.md">English</a>
</p>

<p align="center">
  <b>Google Antigravity 2.0 桌面端全栈中文汉化工具 —— 零外部依赖 · 原生菜单+渲染层全覆盖 · 一键安装与字节级无损还原</b>
</p>

<p align="center">
  <a href="https://github.com/yuanwansi/antigravity-zh-cn/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/yuanwansi/antigravity-zh-cn/ci.yml?branch=main&label=CI&logo=github" alt="CI 状态"></a>
  <a href="https://github.com/yuanwansi/antigravity-zh-cn/releases/latest"><img src="https://img.shields.io/github/v/release/yuanwansi/antigravity-zh-cn?color=blue&label=Release" alt="最新版本"></a>
  <a href="https://github.com/yuanwansi/antigravity-zh-cn/releases"><img src="https://img.shields.io/github/downloads/yuanwansi/antigravity-zh-cn/total?color=0ea5e9&label=Downloads" alt="下载量"></a>
  <a href="https://github.com/yuanwansi/antigravity-zh-cn/stargazers"><img src="https://img.shields.io/github/stars/yuanwansi/antigravity-zh-cn?color=f59e0b&logo=github" alt="GitHub Stars"></a>
  <img src="https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen?logo=node.js" alt="Node.js >= 18">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="MIT License"></a>
</p>

---

## 为什么选择 `antigravity-zh-cn`？

| 痛点 / 维度 | `antigravity-zh-cn` 解决方案 |
| :--- | :--- |
| **安装慢、断网报错** | **纯 Node.js（`>=18`）零外部依赖**：自研原生 Electron ASAR 增量重打包与 SHA-256 分块完整性引擎，无需联网拉取 `@electron/asar`，离线 1 秒装完 |
| **顶栏下拉/右键菜单还是英文** | **渲染层 + 主进程双栈覆盖**：同步汉化顶栏系统下拉菜单、右下角托盘菜单、编辑器/会话原生右键菜单与更新弹窗（均带 `vm.Script` 语法预检保护） |
| **动态问候语、倒计时翻不全** | **近 6,000 条精选词条 + 组合式动态引擎**：支持 React JSX 多文本插值节点自动合并，覆盖随机欢迎语池、紧凑时间戳（`now`/`2m`）、配额倒计时与定时周期 |
| **担心误改代码、分支名或聊天内容** | **严格禁区隔离 + 域名边界**：自动跳过用户输入、AI 回复正文、代码块、Monaco、终端、文件树、Git 分支名及内置浏览器外部网页 |
| **想临时切回英文对照或彻底卸载** | 按 **`Alt + Shift + L`** 无需重启实时无损切换中/英；自带原版 SHA-256 备份与断电自愈，随时**一键字节级还原官方原版** |
| **不想改动客户端本体文件** | 附带符合官方规范的 **Antigravity 中文助手插件**（`plugin/antigravity-zh-cn/`），可零侵入单独安装，锁定全中文回复与计划体验 |

---

## 30 秒快速上手（免 Git 懒人包）

> **前置环境**：电脑已安装 [Node.js](https://nodejs.org/)（版本 `>= 18`）。安装或还原前请**先完全退出 Antigravity 桌面客户端（含右下角托盘图标）**。

1. 前往 **[Releases 页面](https://github.com/yuanwansi/antigravity-zh-cn/releases/latest)** 下载最新版的 `antigravity-zh-cn-v*.zip` 并解压到任意文件夹。
2. **Windows 用户**：
   - 双击运行 [`scripts/一键安装中文汉化.bat`](scripts/一键安装中文汉化.bat) 完成安装；
   - 如需恢复英文原版，双击运行 [`scripts/一键还原官方英文.bat`](scripts/一键还原官方英文.bat)。
3. **macOS / Linux 用户**：
   ```bash
   bash scripts/install.sh
   # 无损还原官方原版
   bash scripts/uninstall.sh
   ```
4. 重新打开 Antigravity 即可享受完整中文界面！运行期间按 **`Alt + Shift + L`** 可随时在 **中文 / English** 之间无缝切换。

---

## 进阶命令行用法（CLI）

如果你通过 `git clone https://github.com/yuanwansi/antigravity-zh-cn.git` 使用源码仓库，也可以直接通过 CLI 精细控制：

```bash
# 安装或升级桌面端汉化（附加 --with-plugin 可同时安装官方标准中文插件）
node bin/cli.js install --with-plugin

# 手动指定自定义安装目录或 app.asar 路径
node bin/cli.js install --target "C:\Users\<用户名>\AppData\Local\Programs\antigravity"

# 查看当前客户端汉化备份状态与标准插件状态
node bin/cli.js status

# 仅安装 / 卸载官方标准中文交互插件（完全不修改客户端 app.asar）
node bin/cli.js install-plugin
node bin/cli.js uninstall-plugin

# 校验全量词典完整性与防污染安全规则
node bin/cli.js check-dict

# 字节级无损还原官方英文原版
node bin/cli.js restore
```

---

## 用户自定义词典（升级不丢失）

将 [`dicts/99-custom.example.json`](dicts/99-custom.example.json) 复制到 `~/.antigravity-zh-cn/custom-dict.json`（Windows 下为 `C:\Users\<用户名>\.antigravity-zh-cn\custom-dict.json`），即可按个人习惯覆盖任意译文，客户端更新重新打补丁时也会自动保留：

```json
{
  "New Conversation": "开启新对话",
  "Ask anything, @ to mention, / for actions": "尽管吩咐，输入 @ 引用上下文，/ 调用技能"
}
```

---

## 项目架构

```text
antigravity-zh-cn/
├── bin/cli.js                          # 跨平台 CLI 命令行入口
├── src/
│   ├── asar.js                         # 纯 JS 零依赖 Electron ASAR 解析、SHA-256 分块完整性与增量重打包
│   ├── paths.js                        # 跨平台安装路径探测、冷启动断电自愈与受保护环境安全守卫
│   ├── dict-loader.js                  # 模块化词典加载、弯引号归一化、冲突/禁词审计与用户词典合并
│   ├── runtime.js                      # 沙盒兼容动态 DOM 汉化引擎（React 多节点合并 + 禁区隔离 + 热切换）
│   ├── main-patches.js                 # Electron 主进程顶栏菜单/托盘/右键菜单/更新器补丁（带 vm.Script 预检）
│   ├── patcher.js                      # SHA-256 备份、原子替换与字节级无损还原核心控制器
│   └── plugin-installer.js             # 官方标准中文交互插件安装/卸载器
├── dicts/                              # 7 个模块化简体中文词典分包（5,960+ 条已审计词条）
├── plugin/antigravity-zh-cn/           # 符合官方规范的零侵入中文助手插件
├── scripts/                            # Windows (.bat) / macOS & Linux (.sh) 一键安装与还原脚本
├── test/                               # 13 项单元与端到端模拟测试套件（node:test）
└── .github/                            # 跨平台 CI、Tag 自动打包 Release 工作流与反馈 Issue 模板
```

---

## 常见问题

1. **Antigravity 官方自动更新后变回英文怎么办？**
   官方客户端升级会替换 `app.asar`。只需退出客户端后重新运行一次安装脚本，工具会自动识别新原版、刷新备份并重新注入汉化。
2. **发现个别新界面还没翻译怎么办？**
   欢迎直接提交 **[🈶 漏翻 / 误译截图反馈 Issue](https://github.com/yuanwansi/antigravity-zh-cn/issues/new?template=translation_feedback.yml)**，贴张图即可快速补齐！
3. **如果觉得好用，欢迎点一颗右上角的 ⭐️ Star 支持后续版本持续跟进维护！**

---

## 参考与致谢

本项目在架构设计、内容禁区隔离策略、词典覆盖及安全备份还原实践上，参考并致谢以下优秀的 MIT 开源社区项目（完整第三方版权与许可声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)）：
- [Silas-02/antigravity-desktop-cn](https://github.com/Silas-02/antigravity-desktop-cn)
- [yiheng8023/antigravity-chinese](https://github.com/yiheng8023/antigravity-chinese)

## 开源协议

本项目基于 [MIT License](LICENSE) 开源。
