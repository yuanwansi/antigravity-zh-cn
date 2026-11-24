#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "========================================================"
echo "  Antigravity 中文汉化引擎 - macOS / Linux 一键还原脚本"
echo "========================================================"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "[错误] 未检测到 Node.js（需要 Node.js >= 18）。"
  exit 1
fi

echo "[提示] 还原前请先完全退出 Antigravity 桌面端。"
node "${ROOT_DIR}/bin/cli.js" restore "$@"
