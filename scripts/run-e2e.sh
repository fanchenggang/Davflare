#!/bin/bash
# FlareDrive 一键 e2e 回归：构建 → 启动 wrangler pages dev（本地 miniflare R2）→ 跑 api-e2e.sh → 清理。
# 用法：
#   npm run test:e2e
#   SKIP_BUILD=1 npm run test:e2e   # 复用已有 build/（调试时更快）
# 环境变量（可选）：
#   PORT=8788           dev server 端口
#   WEBDAV_USER=admin   本地凭据（与 .dev.vars 保持一致；run-e2e 会自动生成 .dev.vars）
#   WEBDAV_PASS=...
set -eu

cd "$(dirname "$0")/.."


PORT="${PORT:-8788}"
BASE="http://127.0.0.1:$PORT"
WEBDAV_USER="${WEBDAV_USER:-admin}"
WEBDAV_PASS="${WEBDAV_PASS:-fd-e2e-pass}"

if ! command -v npx >/dev/null 2>&1; then
  echo "需要 Node.js/npx 环境"; exit 1
fi

# .dev.vars 只用于本地开发（已在 .gitignore），没有就生成一套
if [ ! -f .dev.vars ]; then
  printf 'WEBDAV_USERNAME=%s\nWEBDAV_PASSWORD=%s\n' "$WEBDAV_USER" "$WEBDAV_PASS" > .dev.vars
  echo "已生成本地 .dev.vars (WEBDAV_USER=${WEBDAV_USER})"
fi
# 保证凭据一致：以 .dev.vars 中的值优先（wrangler pages dev 只认它）
if [ -f .dev.vars ]; then
  VAR_USER=$(grep -E '^WEBDAV_USERNAME=' .dev.vars | cut -d= -f2- || true)
  VAR_PASS=$(grep -E '^WEBDAV_PASSWORD=' .dev.vars | cut -d= -f2- || true)
  [ -n "$VAR_USER" ] && WEBDAV_USER="$VAR_USER"
  [ -n "$VAR_PASS" ] && WEBDAV_PASS="$VAR_PASS"
fi

# 站点托管 e2e 需要独立的 SITES_HOST；缺省值保证本套件可重复运行
SITES_HOST="${SITES_HOST:-sites.e2e.test}"
if [ -f .dev.vars ] && ! grep -q '^SITES_HOST=' .dev.vars; then
  printf 'SITES_HOST=%s\n' "$SITES_HOST" >> .dev.vars
fi
VAR_SITES=$(grep -E '^SITES_HOST=' .dev.vars 2>/dev/null | cut -d= -f2- || true)
[ -n "$VAR_SITES" ] && SITES_HOST="$VAR_SITES"

if [ "${SKIP_BUILD:-0}" != "1" ] || [ ! -d build ]; then
  echo "== build =="
  npm run build
else
  echo "== build 跳过（SKIP_BUILD=1，复用 build/）=="
fi

LOG="/tmp/fd-dev-$$.log"
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
for _ in $(seq 1 60); do
  if curl -s --noproxy '*' -o /dev/null --max-time 2 "$BASE/webdav/"; then
    READY=1
    break
  fi
  sleep 1
done
if [ "$READY" != "1" ]; then
  echo "dev server 未在 60 秒内就绪，日志尾部："
  tail -40 "$LOG" || true
  exit 1
fi

echo "== 运行 api-e2e.sh =="
BASE="$BASE" WEBDAV_USER="$WEBDAV_USER" WEBDAV_PASS="$WEBDAV_PASS" SITES_HOST="$SITES_HOST" bash scripts/api-e2e.sh
