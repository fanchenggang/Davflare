#!/usr/bin/env bash
# 回归 scripts/deploy-site-action.sh（"Deploy to Davflare Site" action）against a mock API：
# 成功打印 URL / 写 GITHUB_OUTPUT；密钥错误非零退出且报错明确；密钥永不出现在日志；输入缺失/空目录报错。
#   bash scripts/test-deploy-site-action.sh
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
SCRIPT="$ROOT/scripts/deploy-site-action.sh"

GOOD_KEY="fd_good_$(date +%s)_S3CR3T"
BAD_KEY="fd_wrong_$(date +%s)_S3CR3T"
TMP="$(mktemp -d)"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  PASS  $1"; }
bad() { FAIL=$((FAIL+1)); echo "  FAIL  $1"; echo "----- output -----"; cat "$TMP/out.log"; echo "------------------"; }

start_mock() { # $1 = sites host ("" = unset)
  MOCK_KEY="$GOOD_KEY" MOCK_SITES_HOST="$1" node scripts/mock-davflare-api.mjs >"$TMP/mock.port" 2>"$TMP/mock.err" &
  MOCK_PID=$!
  for _ in $(seq 1 50); do grep -q listening "$TMP/mock.port" 2>/dev/null && break; sleep 0.1; done
  MOCK_URL="http://127.0.0.1:$(awk '{print $2}' "$TMP/mock.port")"
}
stop_mock() { kill "$MOCK_PID" 2>/dev/null; wait "$MOCK_PID" 2>/dev/null; }
trap 'stop_mock; rm -rf "$TMP"' EXIT

mkdir -p "$TMP/dist/assets" "$TMP/empty"
echo "<h1>hello</h1>" >"$TMP/dist/index.html"
echo "body{}" >"$TMP/dist/assets/app.css"

# run <env assignments...>：清空 INPUT_*，运行脚本，合并 stdout+stderr 到 out.log，返回退出码
run() {
  : >"$TMP/github_output"
  env -u INPUT_PATH -u INPUT_SLUG -u INPUT_URL -u INPUT_API_KEY \
    GITHUB_ACTIONS=false GITHUB_OUTPUT="$TMP/github_output" GITHUB_STEP_SUMMARY="$TMP/summary" \
    "$@" bash "$SCRIPT" >"$TMP/out.log" 2>&1
}
no_key_leak() { # $1 = key that must not appear
  if grep -qF "$1" "$TMP/out.log"; then bad "$2: key leaked into log"; else ok "$2: key not in log"; fi
}

start_mock "sites.mock.test"

echo "== build CLI via the action script (first run) + success =="
run INPUT_PATH="$TMP/dist" INPUT_SLUG="Demo-Site" INPUT_URL="$MOCK_URL/" INPUT_API_KEY="$GOOD_KEY"
rc=$?
[ $rc -eq 0 ] && ok "success exits 0" || bad "success exits 0 (rc=$rc)"
grep -q "Davflare site published: https://sites.mock.test/demo-site/" "$TMP/out.log" && ok "prints site URL" || bad "prints site URL"
grep -qx "url=https://sites.mock.test/demo-site/" "$TMP/github_output" && ok "sets url output" || bad "sets url output"
grep -q "https://sites.mock.test/demo-site/" "$TMP/summary" && ok "writes step summary" || bad "writes step summary"
no_key_leak "$GOOD_KEY" "success"
LEFT="$(curl -s --noproxy '*' "$MOCK_URL/__mock/objects")"
[ "$LEFT" = "[]" ] && ok "no staging leftover (.davflare-publish*) after publish" || bad "no staging leftover after publish (objects: $LEFT)"

echo "== legacy empty .davflare-publish/ is cleaned; non-empty one is kept =="
curl -s --noproxy '*' -X POST "$MOCK_URL/__mock/seed?key=.davflare-publish&dir=1" >/dev/null
run INPUT_PATH="$TMP/dist" INPUT_SLUG="demo" INPUT_URL="$MOCK_URL" INPUT_API_KEY="$GOOD_KEY"
LEFT="$(curl -s --noproxy '*' "$MOCK_URL/__mock/objects")"
[ "$LEFT" = "[]" ] && ok "legacy empty .davflare-publish/ removed" || bad "legacy empty .davflare-publish/ removed (objects: $LEFT)"
curl -s --noproxy '*' -X POST "$MOCK_URL/__mock/seed?key=.davflare-publish/other-job/index.html" >/dev/null
run INPUT_PATH="$TMP/dist" INPUT_SLUG="demo" INPUT_URL="$MOCK_URL" INPUT_API_KEY="$GOOD_KEY"
LEFT="$(curl -s --noproxy '*' "$MOCK_URL/__mock/objects")"
[ "$LEFT" = '[".davflare-publish",".davflare-publish/other-job",".davflare-publish/other-job/index.html"]' ] \
  && ok "non-empty legacy .davflare-publish/ kept (concurrent staging safe)" || bad "non-empty legacy kept (objects: $LEFT)"
curl -s --noproxy '*' -X DELETE -H "Authorization: Bearer $GOOD_KEY" "$MOCK_URL/api/delete?path=.davflare-publish/" >/dev/null

echo "== GitHub Actions mode: key only in ::add-mask:: =="
run GITHUB_ACTIONS=true INPUT_PATH="$TMP/dist" INPUT_SLUG="demo" INPUT_URL="$MOCK_URL" INPUT_API_KEY="$GOOD_KEY"
rc=$?
[ $rc -eq 0 ] && ok "actions mode exits 0" || bad "actions mode exits 0 (rc=$rc)"
[ "$(head -n1 "$TMP/out.log")" = "::add-mask::$GOOD_KEY" ] && ok "first line masks key" || bad "first line masks key"
[ "$(grep -cF "$GOOD_KEY" "$TMP/out.log")" = "1" ] && ok "key appears only in the add-mask command" || bad "key appears only in the add-mask command"
grep -q "^::notice title=Davflare site published::https://sites.mock.test/demo/" "$TMP/out.log" && ok "emits ::notice with URL" || bad "emits ::notice with URL"

echo "== wrong key =="
run INPUT_PATH="$TMP/dist" INPUT_SLUG="demo" INPUT_URL="$MOCK_URL" INPUT_API_KEY="$BAD_KEY"
rc=$?
[ $rc -ne 0 ] && ok "wrong key exits non-zero ($rc)" || bad "wrong key exits non-zero"
grep -q "Error: Davflare API key rejected (401)" "$TMP/out.log" && ok "clear 'API key rejected (401)' error" || bad "clear 'API key rejected (401)' error"
grep -q "上传 " "$TMP/out.log" && bad "wrong key must fail before uploading" || ok "fails before uploading"
no_key_leak "$BAD_KEY" "wrong key"
run GITHUB_ACTIONS=true INPUT_PATH="$TMP/dist" INPUT_SLUG="demo" INPUT_URL="$MOCK_URL" INPUT_API_KEY="$BAD_KEY"
grep -q "^::error title=Deploy to Davflare Site::Davflare API key rejected (401)" "$TMP/out.log" && ok "emits ::error annotation" || bad "emits ::error annotation"

echo "== input validation =="
expect_fail() { # $1 = label, $2 = expected message fragment, rest = env
  local label="$1" msg="$2"; shift 2
  run "$@"; local rc=$?
  if [ $rc -ne 0 ] && grep -qF "$msg" "$TMP/out.log"; then ok "$label"; else bad "$label (rc=$rc, want: $msg)"; fi
}
expect_fail "missing url"   "Input 'url' is empty"     INPUT_PATH="$TMP/dist" INPUT_SLUG=demo INPUT_API_KEY="$GOOD_KEY"
expect_fail "missing key"   "Input 'api-key' is empty" INPUT_PATH="$TMP/dist" INPUT_SLUG=demo INPUT_URL="$MOCK_URL"
expect_fail "missing path"  "Input 'path' is empty"    INPUT_SLUG=demo INPUT_URL="$MOCK_URL" INPUT_API_KEY="$GOOD_KEY"
expect_fail "missing slug"  "Input 'slug' is empty"    INPUT_PATH="$TMP/dist" INPUT_URL="$MOCK_URL" INPUT_API_KEY="$GOOD_KEY"
expect_fail "invalid slug"  "Invalid slug 'bad_slug'"  INPUT_PATH="$TMP/dist" INPUT_SLUG=bad_slug INPUT_URL="$MOCK_URL" INPUT_API_KEY="$GOOD_KEY"
expect_fail "missing dir"   "not found"                INPUT_PATH="$TMP/nope" INPUT_SLUG=demo INPUT_URL="$MOCK_URL" INPUT_API_KEY="$GOOD_KEY"
expect_fail "empty dir"     "is empty — nothing to publish" INPUT_PATH="$TMP/empty" INPUT_SLUG=demo INPUT_URL="$MOCK_URL" INPUT_API_KEY="$GOOD_KEY"
expect_fail "unreachable"   "Cannot reach Davflare instance" INPUT_PATH="$TMP/dist" INPUT_SLUG=demo INPUT_URL="http://127.0.0.1:9" INPUT_API_KEY="$GOOD_KEY"
no_key_leak "$GOOD_KEY" "unreachable"

echo "== instance without SITES_HOST =="
stop_mock; start_mock ""
run INPUT_PATH="$TMP/dist" INPUT_SLUG=demo INPUT_URL="$MOCK_URL" INPUT_API_KEY="$GOOD_KEY"
rc=$?
[ $rc -eq 0 ] && grep -q "no SITES_HOST" "$TMP/out.log" && grep -qx "url=" "$TMP/github_output" \
  && ok "no SITES_HOST: exit 0 + warning + empty url" || bad "no SITES_HOST: exit 0 + warning + empty url (rc=$rc)"

echo ""
echo "deploy-site action: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
