#!/bin/bash
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  printf '请先安装 Node.js 22.12+ 或 24+。\n'
  read -r -p '按回车退出…' _
  exit 1
fi
if ! test -d node_modules/vite || ! test -d node_modules/three; then npm ci; fi
printf '游戏启动后打开 http://127.0.0.1:8850/game/\n保持此窗口运行，Ctrl+C 停止。\n'
exec npm start
