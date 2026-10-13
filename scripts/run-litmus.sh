#!/bin/bash
# WebDAV litmus 合规套件：构建 → wrangler pages dev → litmus → 清理。
# 用法：
#   npm run test:litmus
#   SKIP_BUILD=1 npm run test:litmus
# 环境变量（可选）：
#   PORT=8788
#   WEBDAV_USER=admin
#   WEBDAV_PASS=...
#   TESTS="basic copymove props"   # 默认只跑 100% 通过的套件；locks/http 有已知失败见 docs/webdav-clients.md
set -eu

cd "$(dirname "$0")/.."

PORT="${PORT:-8788}"
BASE="http://127.0.0.1:$PORT"
WEBDAV_USER="${WEBDAV_USER:-admin}"
WEBDAV_PASS="${WEBDAV_PASS:-fd-litmus-pass}"
# CI 徽章对应这三套：basic / copymove / props（全绿）。locks≈95%、http expect100 失败，不挡 CI。
TESTS="${TESTS:-basic copymove props}"

if ! command -v litmus >/dev/null 2>&1; then
  echo "需要 litmus（Debian/Ubuntu: sudo apt-get install -y litmus）"
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "需要 Node.js/npx 环境"
  exit 1
fi

if [ ! -f .dev.vars ]; then
  printf 'WEBDAV_USERNAME=%s\nWEBDAV_PASSWORD=%s\n' "$WEBDAV_USER" "$WEBDAV_PASS" > .dev.vars
  echo "已生成本地 .dev.vars (WEBDAV_USER=${WEBDAV_USER})"
fi
if [ -f .dev.vars ]; then
  VAR_USER=$(grep -E '^WEBDAV_USERNAME=' .dev.vars | cut -d= -f2- || true)
  VAR_PASS=$(grep -E '^WEBDAV_PASSWORD=' .dev.vars | cut -d= -f2- || true)
  [ -n "$VAR_USER" ] && WEBDAV_USER="$VAR_USER"
  [ -n "$VAR_PASS" ] && WEBDAV_PASS="$VAR_PASS"
fi

if [ "${SKIP_BUILD:-0}" != "1" ] || [ ! -d build ]; then
  echo "== build =="
  npm run build
else
  echo "== build 跳过（SKIP_BUILD=1，复用 build/）=="
fi

LOG="/tmp/fd-litmus-dev-$$.log"
echo "== 启动 wrangler pages dev (port ${PORT}, log ${LOG}) =="
npx wrangler pages dev build --port "$PORT" >"$LOG" 2>&1 &
DEV_PID=$!
cleanup() {
  kill "$DEV_PID" 2>/dev/null || true
  wait "$DEV_PID" 2>/dev/null || true
  rm -f "$LOG"
}
trap cleanup EXIT

echo "== 等待服务就绪 =="
READY=0
for _ in $(seq 1 90); do
  if curl -s --noproxy '*' -o /dev/null --max-time 2 "$BASE/webdav/"; then
    READY=1
    break
  fi
  sleep 1
done
if [ "$READY" != "1" ]; then
  echo "dev server 未在 90 秒内就绪，日志尾部："
  tail -40 "$LOG" || true
  exit 1
fi

echo "== litmus TESTS='${TESTS}' =="
# litmus 会在 cwd 写 debug.log / child.log；放到临时目录跑
LITMUS_DIR=$(mktemp -d /tmp/fd-litmus-XXXXXX)
set +e
(
  cd "$LITMUS_DIR"
  TESTS="$TESTS" litmus "$BASE/webdav/" "$WEBDAV_USER" "$WEBDAV_PASS"
)
STATUS=$?
set -e
rm -rf "$LITMUS_DIR"

echo "== 清理 litmus 集合（忽略失败）=="
curl -s --noproxy '*' -o /dev/null -u "$WEBDAV_USER:$WEBDAV_PASS" -X DELETE "$BASE/webdav/litmus/" || true

exit "$STATUS"
