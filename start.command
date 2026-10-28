#!/usr/bin/env bash
# crypto-basis — 一键启动（单进程，前端产物由后端托管）
# 用法：
#   ./start.command                                  默认端口 3001，自动打开浏览器
#   ./start.command --proxy http://127.0.0.1:7890    指定行情代理
#   ./start.command --no-proxy                       不用代理（取不到价会降级为手动填价）
#   ./start.command --port 8080                      换端口
#   ./start.command --no-open                        不自动打开浏览器
set -e -o pipefail

cd "$(dirname "$0")"

PORT="${PORT:-3001}"
OPEN=1
ARGS=()
for a in "$@"; do
  case "$a" in
    --no-open) OPEN=0 ;;
    *) ARGS+=("$a") ;;
  esac
done

echo "==> 检查依赖"
[ -d server/node_modules ] || npm --prefix server install
[ -d web/node_modules ] || npm --prefix web install

# 源码比产物新，或产物不存在时重新构建（改了前端代码再启动会自动生效）
need_build=0
if [ ! -f web/dist/index.html ]; then
  need_build=1
elif [ -n "$(find web/src web/index.html -newer web/dist/index.html 2>/dev/null)" ]; then
  need_build=1
fi
if [ "$need_build" = 1 ]; then
  echo "==> 构建前端"
  npm --prefix web run build
fi

if [ "$OPEN" = 1 ]; then
  (sleep 1 && open "http://127.0.0.1:${PORT}") &
fi

echo "==> 服务启动：http://127.0.0.1:${PORT}（Ctrl+C 停止）"
exec node server/src/index.js --port "$PORT" "${ARGS[@]}"
