# antigravity-zh-cn

<p align="center">
  <a href="README.md">简体中文</a> | <b>English</b>
</p>

<p align="center">
  <b>Zero-dependency Simplified Chinese localization engine &amp; official-format companion plugin for Google Antigravity Desktop (Windows / macOS / Linux).</b>
</p>

<p align="center">
  <a href="https://github.com/yuanwansi/antigravity-zh-cn/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/yuanwansi/antigravity-zh-cn/ci.yml?branch=main&label=CI&logo=github" alt="CI"></a>
  <a href="https://github.com/yuanwansi/antigravity-zh-cn/releases/latest"><img src="https://img.shields.io/github/v/release/yuanwansi/antigravity-zh-cn?color=blue&label=Release" alt="Release"></a>
  <a href="https://github.com/yuanwansi/antigravity-zh-cn/releases"><img src="https://img.shields.io/github/downloads/yuanwansi/antigravity-zh-cn/total?color=0ea5e9&label=Downloads" alt="Downloads"></a>
  <a href="https://github.com/yuanwansi/antigravity-zh-cn/stargazers"><img src="https://img.shields.io/github/stars/yuanwansi/antigravity-zh-cn?color=f59e0b&logo=github" alt="Stars"></a>
  <img src="https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen?logo=node.js" alt="Node.js >= 18">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="MIT License"></a>
</p>

---

## Highlights

- **Zero External Dependencies**: Pure Node.js (`>= 18`) Electron ASAR parser & incremental patcher with automatic SHA-256 block integrity recalculation — works completely offline without `npx @electron/asar`.
- **Full-Stack Coverage (~6,000 Verified UI Strings)**:
  - **Renderer Layer**: Self-contained sandbox-safe `preload.js` bundle covering welcome screens, settings, chat canvas, customizations, marketplace, MCP, scheduled tasks, React multi-node JSX interpolations, and same-origin `<iframe>` sidecars.
  - **Main-Process Native Menus**: Translates native application menus (`menu.js`), system tray (`tray.js`), right-click context menus (`ipcHandlers.js`), and updater dialogs (`updater.js`), guarded by `vm.Script` syntax preflight checks.
- **Strict Content Isolation**: Never touches user prompts, AI markdown responses, code blocks, Monaco editor, terminal output, file trees, git branch names, or external websites.
- **Instant Toggle & Byte-for-Byte Lossless Restore**:
  - Press **`Alt + Shift + L`** anytime to switch between **简体中文** and **English** live without restarting.
  - Automatic `.zh-cn.bak` SHA-256 backup and crash-resilient atomic swap for 100% lossless uninstallation.
- **Dual Mode**: Includes a non-intrusive, official-schema Antigravity plugin (`plugin/antigravity-zh-cn/`) for global Chinese agent responses and dictionary maintenance skills.

## Quick Start

1. Download the latest `.zip` archive from **[Releases](https://github.com/yuanwansi/antigravity-zh-cn/releases/latest)** (or `git clone` this repository).
2. Completely quit **Antigravity Desktop** (including the system tray icon).
3. Run the one-click script:
   - **Windows**: Double-click `scripts/一键安装中文汉化.bat` (or `scripts/一键还原官方英文.bat` to restore).
   - **macOS / Linux**: Run `bash scripts/install.sh` (or `bash scripts/uninstall.sh` to restore).

For full Chinese documentation, custom dictionary configuration, and architecture details, see **[README.md](README.md)**.

## License & Credits

Released under the [MIT License](LICENSE). Special thanks to [Silas-02/antigravity-desktop-cn](https://github.com/Silas-02/antigravity-desktop-cn) and [yiheng8023/antigravity-chinese](https://github.com/yiheng8023/antigravity-chinese) (see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)).
