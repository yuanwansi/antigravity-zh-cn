#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "========================================================"
echo "  Antigravity 中文汉化引擎 - macOS / Linux 一键安装脚本"
echo "========================================================"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "[错误] 未检测到 Node.js（需要 Node.js >= 18）。"
  echo "请先通过 https://nodejs.org 或 nvm/Homebrew 安装 Node.js。"
  exit 1
fi

echo "[提示] 安装前请先完全退出 Antigravity 桌面端。"
node "${ROOT_DIR}/bin/cli.js" install --with-plugin "$@"

if [[ "$(uname -s)" == "Darwin" ]] && [[ -d "/Applications/Antigravity.app" ]]; then
  echo ""
  echo "[macOS 提示] 若重启时系统提示应用签名变更，可执行以下命令刷新本地自签名："
  echo "  xattr -dr com.apple.quarantine /Applications/Antigravity.app"
  echo "  codesign --force --deep --sign - /Applications/Antigravity.app"
fi
