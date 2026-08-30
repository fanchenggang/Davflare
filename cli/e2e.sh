#!/bin/bash
# davflare-cli e2e：对 wrangler pages dev 全命令回归。
# 用法：SKIP_BUILD=1 npm run test:e2e 之后可用；或直接：
#   BASE=http://127.0.0.1:8788 WEBDAV_USER=admin WEBDAV_PASS=xxx bash cli/e2e.sh
set -u
cd "$(dirname "$0")/.."

BASE="${BASE:-http://127.0.0.1:8788}"
USER="${WEBDAV_USER:-admin}"
PASSWD="${WEBDAV_PASS:-admin}"
DAVFLARE_SERVER="$BASE"
DAVFLARE_KEY=$(curl -s --noproxy '*' -X POST "$BASE/api/keys" -u "$USER:$PASSWD" -H "Content-Type: application/json" -d '{"name":"cli-e2e"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['key'])")
if [ -z "$DAVFLARE_KEY" ]; then echo "无法创建 API key"; exit 1; fi
export DAVFLARE_SERVER DAVFLARE_KEY

DAV="node cli/dist/index.js"
CLI_DIR="cli-e2e-$(date +%H%M%S)"
LOCAL_DIR="/tmp/$CLI_DIR"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  PASS  $1"; }
bad() { FAIL=$((FAIL+1)); echo "  FAIL  $1  (got: $2, want: $3)"; }

mkdir -p "$LOCAL_DIR/docs"
echo "hello cli" > "$LOCAL_DIR/a.txt"
echo "# readme" > "$LOCAL_DIR/docs/readme.md"
dd if=/dev/zero of="$LOCAL_DIR/docs/blob.bin" bs=1000 count=250 2>/dev/null

echo "== login（环境变量模式）=="
$DAV ls 2>/dev/null >/dev/null && ok "auth via env works" || bad "auth via env works" "fail" "ok"

echo "== mkdir / ls =="
$DAV mkdir "$CLI_DIR/docs" >/dev/null 2>&1 && ok "mkdir" || bad "mkdir" "fail" "ok"
$DAV cp "$LOCAL_DIR/a.txt" "$CLI_DIR/a.txt" >/dev/null 2>&1 && ok "cp upload single" || bad "cp upload single" "fail" "ok"
LS=$($DAV ls "$CLI_DIR" --json)
echo "$LS" | grep -q '"name": "a.txt"' && ok "ls json shows a.txt" || bad "ls json shows a.txt" "$LS" "a.txt"

echo "== cp 目录（循环上传）与下载 =="
for f in docs/readme.md docs/blob.bin; do
  $DAV cp "$LOCAL_DIR/$f" "$CLI_DIR/$f" >/dev/null 2>&1 || bad "cp upload $f" "fail" "ok"
done
ok "cp upload nested files"
mkdir -p "$LOCAL_DIR/back"
$DAV cp "$CLI_DIR/docs/blob.bin" "$LOCAL_DIR/back/blob.bin" >/dev/null 2>&1 && ok "cp download" || bad "cp download" "fail" "ok"
cmp -s "$LOCAL_DIR/docs/blob.bin" "$LOCAL_DIR/back/blob.bin" && ok "download byte-identical" || bad "download byte-identical" "diff" "same"

echo "== mv / rm =="
$DAV mv "$CLI_DIR/a.txt" "$CLI_DIR/a-moved.txt" >/dev/null 2>&1 && ok "mv" || bad "mv" "fail" "ok"
$DAV ls "$CLI_DIR" --json | grep -q '"name": "a-moved.txt"' && ok "mv visible" || bad "mv visible" "fail" "ok"
$DAV rm "$CLI_DIR/a-moved.txt" >/dev/null 2>&1 && ok "rm soft" || bad "rm soft" "fail" "ok"

echo "== sync push =="
$DAV sync push "$LOCAL_DIR/syncsrc" "$CLI_DIR/sync" >/dev/null 2>&1
mkdir -p "$LOCAL_DIR/syncsrc/sub"
echo "s1" > "$LOCAL_DIR/syncsrc/s1.txt"
echo "s2" > "$LOCAL_DIR/syncsrc/sub/s2.txt"
$DAV sync push "$LOCAL_DIR/syncsrc" "$CLI_DIR/sync" >/dev/null 2>&1 && ok "sync push" || bad "sync push" "fail" "ok"
$DAV ls "$CLI_DIR/sync" --json | grep -q '"name": "s1.txt"' && ok "sync pushed s1" || bad "sync pushed s1" "fail" "ok"
$DAV ls "$CLI_DIR/sync/sub" --json | grep -q '"name": "s2.txt"' && ok "sync pushed sub/s2" || bad "sync pushed sub/s2" "fail" "ok"
DRY=$($DAV sync push --dry-run "$LOCAL_DIR/syncsrc" "$CLI_DIR/sync" 2>&1)
echo "$DRY" | grep -q "传输 0" && ok "sync dry-run idempotent" || bad "sync dry-run idempotent" "$DRY" "传输 0"

echo "== sync pull =="
rm -rf "$LOCAL_DIR/pulldst"
$DAV sync pull "$LOCAL_DIR/pulldst" "$CLI_DIR/sync" >/dev/null 2>&1 && ok "sync pull" || bad "sync pull" "fail" "ok"
cmp -s "$LOCAL_DIR/syncsrc/sub/s2.txt" "$LOCAL_DIR/pulldst/sub/s2.txt" && ok "pull content identical" || bad "pull content identical" "diff" "same"

echo "== 清理 =="
$DAV rm -r "$CLI_DIR" >/dev/null 2>&1 && ok "rm -r dir" || bad "rm -r dir" "fail" "ok"
rm -rf "$LOCAL_DIR"

echo ""
echo "=============================="
echo "PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" = "0" ]
