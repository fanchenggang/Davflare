#!/bin/bash
# FlareDrive 开放 API + WebDAV 断言回归套件（对应 TEST_CASES.md 模块 11/12）
# 用法：本地起服务后执行
#   BASE=http://127.0.0.1:8788 WEBDAV_USER=admin WEBDAV_PASS=xxx bash scripts/api-e2e.sh
# 所有测试数据写入自建前缀目录，结束自动清理（目录/回收站/密钥）。
set -u
BASE="${BASE:-http://127.0.0.1:8788}"
USER="${WEBDAV_USER:-admin}"
PASSWD="${WEBDAV_PASS:-admin}"
SITES_HOST="${SITES_HOST:-}"
DIR="fd-e2e-$(date +%H%M%S)-suite"
BASIC="Authorization: Basic $(printf '%s:%s' "$USER" "$PASSWD" | base64)"
PASS=0; FAIL=0

ok()  { PASS=$((PASS+1)); echo "  PASS  $1"; }
bad() { FAIL=$((FAIL+1)); echo "  FAIL  $1  (got: $2, want: $3)"; }
assert_code() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "$2" "$3"; fi; }
assert_contains() { case "$2" in *"$3"*) ok "$1";; *) bad "$1" "$(echo "$2" | head -c 140)" "$3";; esac; }

# BSD mktemp 对带后缀模板不做替换，改用进程号保证唯一
FIXTURE="/tmp/fd-suite-$(date +%H%M%S)-$$.txt"
echo "fixture-$(date +%s)" > "$FIXTURE"
FIXNAME=$(basename "$FIXTURE")

echo "== setup: API key =="
KEY=$(curl -s --noproxy '*' -X POST "$BASE/api/keys" -H "$BASIC" -H "Content-Type: application/json" -d '{"name":"suite"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['key'])")
if [ -z "$KEY" ]; then echo "无法创建 API key，请检查 BASE/凭据"; exit 1; fi
A="Authorization: Bearer $KEY"

echo "== 开放接口：上传/列表 =="
code=$(curl -s --noproxy '*' -o /tmp/suite-r1.json -w "%{http_code}" -X POST "$BASE/api/upload?path=$DIR/apitest/" -H "$A" -F "file=@$FIXTURE")
assert_code "upload multipart 201" "$code" "201"
code=$(curl -s --noproxy '*' -o /tmp/suite-r2.json -w "%{http_code}" -X POST "$BASE/api/upload?path=$DIR/apitest/" -H "$A" -H "X-File-Name: raw.txt" --data-binary "raw 中文")
assert_code "upload raw body 201" "$code" "201"
code=$(curl -s --noproxy '*' -o /tmp/suite-r3.json -w "%{http_code}" -X POST "$BASE/api/upload?path=$DIR/apitest/" -H "$A" -F "file=@$FIXTURE")
assert_contains "duplicate renamed (2)" "$(cat /tmp/suite-r3.json)" "(2)"
code=$(curl -s --noproxy '*' -o /tmp/suite-r4.json -w "%{http_code}" -X POST "$BASE/api/upload?path=$DIR/apitest/&overwrite=1" -H "$A" -F "file=@$FIXTURE")
assert_contains "overwrite=true" "$(cat /tmp/suite-r4.json)" '"overwritten":true'
LIST=$(curl -s --noproxy '*' "$BASE/api/list?path=$DIR/apitest/" -H "$A")
assert_contains "list has size/uploaded/etag" "$LIST" '"etag"'
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" "$BASE/api/list?path=$DIR/apitest/$FIXNAME" -H "$A")
assert_code "list on file = 400" "$code" "400"
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" "$BASE/api/list?path=$DIR/none/" -H "$A")
assert_code "list missing = 404" "$code" "404"

echo "== 开放接口：下载 =="
code=$(curl -s --noproxy '*' -o /tmp/suite-dl.txt -w "%{http_code}" "$BASE/api/download?path=$DIR/apitest/raw.txt" -H "$A")
assert_code "download 200" "$code" "200"
assert_contains "download content intact" "$(cat /tmp/suite-dl.txt)" "raw 中文"
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" "$BASE/api/download?path=$DIR/apitest/" -H "$A")
assert_code "download dir = 400" "$code" "400"
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" "$BASE/api/download?path=$DIR/apitest/nope.txt" -H "$A")
assert_code "download missing = 404" "$code" "404"

echo "== 开放接口：mkdir =="
code=$(curl -s --noproxy '*' -o /tmp/o.json -w "%{http_code}" -X POST "$BASE/api/mkdir" -H "$A" -H "Content-Type: application/json" -d "{\"path\":\"$DIR/mk/a/b/c\"}")
assert_code "mkdir creates parents 201" "$code" "201"
assert_contains "mkdir idempotent" "$(curl -s --noproxy '*' -X POST "$BASE/api/mkdir" -H "$A" -H "Content-Type: application/json" -d "{\"path\":\"$DIR/mk/a/b/c/\"}")" '"created":false'
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" -X POST "$BASE/api/mkdir" -H "$A" -H "Content-Type: application/json" -d "{\"path\":\"$DIR/apitest/$FIXNAME\"}")
assert_code "mkdir on file = 409" "$code" "409"
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" -X POST "$BASE/api/mkdir" -H "$A" -H "Content-Type: application/json" -d '{"path":"../escape"}')
assert_code "mkdir traversal = 400" "$code" "400"
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" -X POST "$BASE/api/mkdir" -H "$A" -H "Content-Type: application/json" -d '{"path":"_$flaredrive$/evil"}')
assert_code "mkdir internal = 400" "$code" "400"

echo "== 开放接口：rename（文件+目录）=="
code=$(curl -s --noproxy '*' -o /tmp/o.json -w "%{http_code}" -X POST "$BASE/api/rename" -H "$A" -H "Content-Type: application/json" -d "{\"from\":\"$DIR/apitest/raw.txt\",\"to\":\"$DIR/apitest/raw-renamed.txt\"}")
assert_code "rename file 200" "$code" "200"
curl -s --noproxy '*' -X POST "$BASE/api/upload?path=$DIR/mk/a/b/c/" -H "$A" -F "file=@$FIXTURE" -o /dev/null
code=$(curl -s --noproxy '*' -o /tmp/o.json -w "%{http_code}" -X POST "$BASE/api/rename" -H "$A" -H "Content-Type: application/json" -d "{\"from\":\"$DIR/mk/a\",\"to\":\"$DIR/mk/a-moved\"}")
assert_code "rename directory 200" "$code" "200"
assert_contains "rename dir kind=directory" "$(cat /tmp/o.json)" '"kind":"directory"'
assert_contains "dir rename moved children" "$(curl -s --noproxy '*' "$BASE/api/list?path=$DIR/mk/a-moved/b/c/" -H "$A")" "$FIXNAME"
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" -X POST "$BASE/api/rename" -H "$A" -H "Content-Type: application/json" -d "{\"from\":\"$DIR/mk/a-moved\",\"to\":\"$DIR/mk/a-moved/b\"}")
assert_code "rename into own child = 400" "$code" "400"

echo "== 开放接口：delete（硬删/软删/目录）=="
code=$(curl -s --noproxy '*' -o /tmp/o.json -w "%{http_code}" -X DELETE "$BASE/api/delete?path=$DIR/apitest/raw-renamed.txt" -H "$A")
assert_code "delete file 200" "$code" "200"
code=$(curl -s --noproxy '*' -o /tmp/o.json -w "%{http_code}" -X DELETE "$BASE/api/delete?path=$DIR/apitest/$FIXNAME&soft=1" -H "$A")
assert_code "soft delete 200" "$code" "200"
assert_contains "soft delete trashId" "$(cat /tmp/o.json)" '"trashKey"'
assert_contains "soft-deleted visible in trash" "$(curl -s --noproxy '*' "$BASE/api/trash" -H "$BASIC")" "$FIXNAME"
code=$(curl -s --noproxy '*' -o /tmp/o.json -w "%{http_code}" -X DELETE "$BASE/api/delete?path=$DIR/mk/a-moved" -H "$A")
assert_code "delete directory 200" "$code" "200"
assert_contains "dir gone after delete" "$(curl -s --noproxy '*' "$BASE/api/list?path=$DIR/mk/" -H "$A")" '"items":[]'
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" -X DELETE "$BASE/api/delete?path=$DIR/apitest/missing.txt" -H "$A")
assert_code "delete missing = 404" "$code" "404"

echo "== 开放接口：backup =="
curl -s --noproxy '*' -X POST "$BASE/api/upload?path=$DIR/apitest/" -H "$A" -H "X-File-Name: backup-target.txt" --data-binary "to-backup" -o /dev/null
code=$(curl -s --noproxy '*' -o /tmp/o.json -w "%{http_code}" -X POST "$BASE/api/backup?path=$DIR/apitest/backup-target.txt" -H "$A")
assert_code "backup file 200" "$code" "200"
assert_contains "backup conflict name" "$(cat /tmp/o.json)" "conflict-"
code=$(curl -s --noproxy '*' -o /tmp/o.json -w "%{http_code}" -X POST "$BASE/api/backup?path=$DIR/mk" -H "$A")
assert_code "backup directory 200" "$code" "200"

echo "== 鉴权边界 =="
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" -X POST "$BASE/api/mkdir" -H "Content-Type: application/json" -d '{"path":"x"}')
assert_code "no key = 401" "$code" "401"
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" "$BASE/api/list?path=" -H "Authorization: Bearer fd_bogus")
assert_code "bogus key = 401" "$code" "401"
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" -X POST "$BASE/api/keys?id=x" -H "$A")
assert_code "api key on /api/keys = 401" "$code" "401"

echo "== list 分页 =="
for i in 1 2 3 4 5; do curl -s --noproxy '*' -X POST "$BASE/api/upload?path=$DIR/paged/" -H "$A" -H "X-File-Name: f$i.txt" --data-binary "$i" -o /dev/null; done
P1=$(curl -s --noproxy '*' "$BASE/api/list?path=$DIR/paged/&limit=2" -H "$A")
assert_contains "page1 has nextCursor" "$P1" "nextCursor"
C1=$(echo "$P1" | python3 -c "import sys,json;print(json.load(sys.stdin)['nextCursor'])")
P2=$(curl -s --noproxy '*' "$BASE/api/list?path=$DIR/paged/&limit=2&cursor=$C1" -H "$A")
C2=$(echo "$P2" | python3 -c "import sys,json;print(json.load(sys.stdin).get('nextCursor',''))")
P3=$(curl -s --noproxy '*' "$BASE/api/list?path=$DIR/paged/&limit=2&cursor=$C2" -H "$A")
echo "$P1" > /tmp/s1.json; echo "$P2" > /tmp/s2.json; echo "$P3" > /tmp/s3.json
TOTAL=$(python3 -c "
import json
seen = set()
for f in ['/tmp/s1.json','/tmp/s2.json','/tmp/s3.json']:
    for item in json.load(open(f))['items']:
        seen.add(item['key'])
print(len(seen))
")
assert_code "paged unique total = 5" "$TOTAL" "5"
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" "$BASE/api/list?path=$DIR/paged/&limit=0" -H "$A")
assert_code "limit=0 rejected" "$code" "400"

echo "== 大文件分块上传（除末块外 ≥5MiB）=="
P1BIN="/tmp/fd-suite-$$.p1.bin"; head -c 5242880 /dev/zero > "$P1BIN"
P2BIN="/tmp/fd-suite-$$.p2.bin"; printf 'tail-content\n' > "$P2BIN"
MC=$(curl -s --noproxy '*' -X POST "$BASE/api/upload?uploads&path=$DIR/big/big.bin" -H "$A")
UPID=$(echo "$MC" | python3 -c "import sys,json;print(json.load(sys.stdin)['uploadId'])")
[ -n "$UPID" ] && ok "create uploadId" || bad "create uploadId" "$MC" ""
E1=$(curl -s --noproxy '*' -X PUT "$BASE/api/upload?path=$DIR/big/big.bin&uploadId=$UPID&partNumber=1" -H "$A" --data-binary "@$P1BIN" | python3 -c "import sys,json;print(json.load(sys.stdin)['etag'])")
E2=$(curl -s --noproxy '*' -X PUT "$BASE/api/upload?path=$DIR/big/big.bin&uploadId=$UPID&partNumber=2" -H "$A" --data-binary "@$P2BIN" | python3 -c "import sys,json;print(json.load(sys.stdin)['etag'])")
[ -n "$E1" ] && [ -n "$E2" ] && ok "parts uploaded with etags" || bad "parts uploaded" "$E1/$E2" "etags"
EXPECT=$(( $(stat -f%z "$P1BIN" 2>/dev/null || stat -c%s "$P1BIN") + $(stat -f%z "$P2BIN" 2>/dev/null || stat -c%s "$P2BIN") ))
SZ=$(curl -s --noproxy '*' -X POST "$BASE/api/upload?path=$DIR/big/big.bin&uploadId=$UPID" -H "$A" -H "Content-Type: application/json" -d "{\"parts\":[{\"partNumber\":1,\"etag\":\"$E1\"},{\"partNumber\":2,\"etag\":\"$E2\"}]}" | python3 -c "import sys,json;print(json.load(sys.stdin)['size'])")
assert_code "complete size = $EXPECT" "$SZ" "$EXPECT"
code=$(curl -s --noproxy '*' -o /dev/null -w "%{http_code}" -X PUT "$BASE/api/upload?path=$DIR/big/x.bin&uploadId=fake&partNumber=0" -H "$A" --data-binary x)
assert_code "partNumber=0 rejected" "$code" "400"

echo "== config 与 search =="
code=$(curl -s --noproxy '*' -o /tmp/o.json -w "%{http_code}" "$BASE/api/config" -H "$BASIC")
assert_code "config 200" "$code" "200"
assert_contains "config has username" "$(cat /tmp/o.json)" '"username"'
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" "$BASE/api/config")
assert_code "config no auth 401" "$code" "401"
curl -s --noproxy '*' -X POST "$BASE/api/upload?path=$DIR/apitest/" -H "$A" -H "X-File-Name: searchable-raw.txt" --data-binary "findme" -o /dev/null
code=$(curl -s --noproxy '*' -o /tmp/o.json -w "%{http_code}" "$BASE/api/search?q=searchable-raw" -H "$BASIC")
assert_code "search 200" "$code" "200"
assert_contains "search finds uploaded file" "$(cat /tmp/o.json)" "searchable-raw.txt"
code=$(curl -s --noproxy '*' -o /tmp/o.json -w "%{http_code}" "$BASE/api/search?q=zzz-no-hit-zzz" -H "$BASIC")
assert_contains "search empty on no match" "$(cat /tmp/o.json)" '"items":[]'
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" "$BASE/api/search?q=x")
assert_code "search no auth 401" "$code" "401"

echo "== 分享（文件/目录/提取码/撤销）=="
curl -s --noproxy '*' -X POST "$BASE/api/upload?path=$DIR/apitest/" -H "$A" -H "X-File-Name: shareable.txt" --data-binary "share me 中文" -o /dev/null
SHARE_FILE=$(curl -s --noproxy '*' -X POST "$BASE/api/shares" -H "$BASIC" -H "Content-Type: application/json" -d "{\"key\":\"$DIR/apitest/shareable.txt\"}")
STOKEN=$(echo "$SHARE_FILE" | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
[ -n "$STOKEN" ] && ok "share file created" || bad "share file created" "$SHARE_FILE" "token"
assert_contains "file share GET content" "$(curl -s --noproxy '*' "$BASE/share/$STOKEN")" "share me 中文"
SHARE_DIR=$(curl -s --noproxy '*' -X POST "$BASE/api/shares" -H "$BASIC" -H "Content-Type: application/json" -d "{\"key\":\"$DIR/paged\"}")
DTOKEN=$(echo "$SHARE_DIR" | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
[ -n "$DTOKEN" ] && ok "share dir created" || bad "share dir created" "$SHARE_DIR" "token"
curl -s --noproxy '*' -o /tmp/suite-dir.zip "$BASE/share/$DTOKEN"
assert_contains "dir share zip contains children" "$(python3 -c "
import zipfile
try:
    print('ZIP-OK' if any(n.endswith('f2.txt') for n in zipfile.ZipFile('/tmp/suite-dir.zip').namelist()) else 'ZIP-BAD')
except Exception:
    print('ZIP-BAD')
")" "ZIP-OK"
DTHEAD=$(curl -s --noproxy '*' -o /dev/null -w "%{http_code}|%{content_type}" -I "$BASE/share/$DTOKEN")
assert_contains "dir share HEAD 200 zip" "$DTHEAD" "200|application/zip"
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" "$BASE/share/$STOKEN")
assert_code "share GET before revoke 200" "$code" "200"
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" -X DELETE "$BASE/api/shares?token=$STOKEN" -H "$BASIC")
assert_code "share revoke 204" "$code" "204"
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" "$BASE/share/$STOKEN")
assert_code "revoked share 404" "$code" "404"
SHARE_CODE=$(curl -s --noproxy '*' -X POST "$BASE/api/shares" -H "$BASIC" -H "Content-Type: application/json" -d "{\"key\":\"$DIR/apitest/shareable.txt\",\"extractCode\":\"fd42\"}")
CTOKEN=$(echo "$SHARE_CODE" | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
[ -n "$CTOKEN" ] && ok "share with extract code created" || bad "share with code" "$SHARE_CODE" "token"
assert_contains "no code shows form" "$(curl -s --noproxy '*' "$BASE/share/$CTOKEN")" "提取码"
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" "$BASE/share/$CTOKEN?code=wrong")
assert_code "wrong extract code 403" "$code" "403"
assert_contains "correct code downloads" "$(curl -s --noproxy '*' "$BASE/share/$CTOKEN?code=fd42")" "share me 中文"
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" -X POST "$BASE/share/$CTOKEN" -d "code=wrong")
assert_code "form POST wrong code 403" "$code" "403"
JAR=$(mktemp)
code=$(curl -s --noproxy '*' -c "$JAR" -o /tmp/o -w "%{http_code}" -X POST "$BASE/share/$CTOKEN" -d "code=fd42")
assert_code "form POST correct code 303" "$code" "303"
assert_contains "cookie unlocks clean share URL" "$(curl -s --noproxy '*' -b "$JAR" "$BASE/share/$CTOKEN")" "share me 中文"
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" "$BASE/share/$CTOKEN")
assert_code "clean URL still gated without cookie" "$code" "200"
grep -q "提取码" /tmp/o && ok "clean URL shows form" || bad "clean URL shows form" "$(cat /tmp/o)" "提取码"
rm -f "$JAR"
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" -X DELETE "$BASE/api/shares?token=$CTOKEN" -H "$BASIC")
assert_code "coded share revoke 204" "$code" "204"

echo "== 回收站还原（含父级 marker 补建）=="
curl -s --noproxy '*' -X POST "$BASE/api/upload?path=$DIR/rst/parent/deep/" -H "$A" -H "X-File-Name: restorable.txt" --data-binary "restore-me" -o /dev/null
RDEL=$(curl -s --noproxy '*' -X DELETE "$BASE/api/delete?path=$DIR/rst/parent/deep&soft=1" -H "$A")
RKEY=$(echo "$RDEL" | python3 -c "import sys,json;print(json.load(sys.stdin)['trashKey'])")
[ -n "$RKEY" ] && ok "soft delete returns trashKey" || bad "trashKey" "$RDEL" "key"
# 还原前把父级目录整树硬删，还原时需要重建父级 marker
curl -s --noproxy '*' -X DELETE "$BASE/api/delete?path=$DIR/rst" -H "$A" -o /dev/null
RRES=$(curl -s --noproxy '*' -X POST "$BASE/api/trash?action=restore" -H "$BASIC" -H "Content-Type: application/json" -d "{\"trashKeys\":[\"$RKEY\"]}")
assert_contains "restore status restored" "$RRES" '"restored"'
assert_contains "restored file back in place" "$(curl -s --noproxy '*' "$BASE/api/list?path=$DIR/rst/parent/deep/" -H "$A")" "restorable.txt"
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" "$BASE/api/list?path=$DIR/rst/parent/deep/" -H "$A")
assert_code "restored parent listable 200" "$code" "200"

echo "== archive 打包下载 =="
curl -s --noproxy '*' -o /tmp/suite-archive.zip -X POST "$BASE/api/archive" -H "$BASIC" -H "Content-Type: application/json" -d "{\"keys\":[\"$DIR/apitest/shareable.txt\"]}"
assert_contains "archive zip contains file" "$(python3 -c "
import zipfile
print('ARCHIVE-OK' if any(n.endswith('shareable.txt') for n in zipfile.ZipFile('/tmp/suite-archive.zip').namelist()) else 'ARCHIVE-BAD')
" 2>/dev/null)" "ARCHIVE-OK"
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" -X POST "$BASE/api/archive" -H "Content-Type: application/json" -d '{"keys":[]}')
assert_code "archive no auth 401" "$code" "401"

echo "== WebDAV =="
code=$(curl -s --noproxy '*' -o /dev/null -w "%{http_code}" -X OPTIONS "$BASE/webdav/")
assert_code "OPTIONS no auth 200" "$code" "200"
code=$(curl -s --noproxy '*' -o /dev/null -w "%{http_code}" -X PROPFIND "$BASE/webdav/$DIR/" -H "$BASIC" -H "Depth: 1")
assert_code "PROPFIND 207" "$code" "207"
code=$(curl -s --noproxy '*' -o /dev/null -w "%{http_code}" -X PROPFIND "$BASE/webdav/" -H "Authorization: Basic $(printf '%s:wrong' "$USER" | base64)")
assert_code "wrong password 401" "$code" "401"
code=$(curl -s --noproxy '*' -o /dev/null -w "%{http_code}" -X PUT "$BASE/webdav/$DIR/dav.txt" -H "$BASIC" --data-binary "dav")
assert_code "PUT 201" "$code" "201"
assert_contains "GET content" "$(curl -s --noproxy '*' "$BASE/webdav/$DIR/dav.txt" -H "$BASIC")" "dav"
code=$(curl -s --noproxy '*' -o /dev/null -w "%{http_code}" -X MOVE "$BASE/webdav/$DIR/dav.txt" -H "$BASIC" -H "Destination: /webdav/$DIR/dav-moved.txt")
assert_code "MOVE 201" "$code" "201"
code=$(curl -s --noproxy '*' -o /dev/null -w "%{http_code}" -X DELETE "$BASE/webdav/_\$flaredrive\$/evil.txt" -H "$BASIC" --data-binary x)
assert_code "internal prefix hidden 404" "$code" "404"
code=$(curl -s --noproxy '*' -o /dev/null -w "%{http_code}" -X MKCOL "$BASE/webdav/$DIR/davcol/" -H "$BASIC")
assert_code "MKCOL 201" "$code" "201"
code=$(curl -s --noproxy '*' -o /dev/null -w "%{http_code}" -X COPY "$BASE/webdav/$DIR/dav-moved.txt" -H "$BASIC" -H "Destination: /webdav/$DIR/davcol/dav-copy.txt")
assert_code "COPY 201" "$code" "201"
assert_contains "COPY content intact" "$(curl -s --noproxy '*' "$BASE/webdav/$DIR/davcol/dav-copy.txt" -H "$BASIC")" "dav"
LOCKRES=$(curl -s --noproxy '*' -D /tmp/suite-lock-headers -o /tmp/suite-lock-body -w "%{http_code}" -X LOCK "$BASE/webdav/$DIR/davcol/dav-copy.txt" -H "$BASIC" -H "Timeout: Second-60" -H "Content-Type: application/xml" --data-binary '<?xml version="1.0" encoding="utf-8"?><D:lockinfo xmlns:D="DAV:"><D:lockscope><D:exclusive/></D:lockscope><D:locktype><D:write/></D:locktype><D:owner>e2e</D:owner></D:lockinfo>')
assert_code "LOCK 200/201" "$LOCKRES" "201"
assert_contains "LOCK returns lock-token" "$(grep -i '^Lock-Token' /tmp/suite-lock-headers)" "urn:uuid"

echo "== 静态站点：/api/sites 与 SPA/404 兜底 =="
if [ -n "$SITES_HOST" ]; then
  SH="Host: $SITES_HOST"
  SITE="e2esite"
  code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" -X POST "$BASE/api/upload?path=sites/$SITE/" -H "$A" -H "X-File-Name: index.html" --data-binary "<h1>e2e-site-ok</h1>")
  assert_code "site index upload 201" "$code" "201"
  assert_contains "sites host serves index" "$(curl -s --noproxy '*' "$BASE/$SITE/index.html" -H "$SH")" "e2e-site-ok"
  code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" "$BASE/$SITE/missing-page" -H "$SH")
  assert_code "sites miss plain 404 (spa off)" "$code" "404"

  code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" -X POST "$BASE/api/sites" -H "$BASIC" -H "Content-Type: application/json" -d "{\"slug\":\"$SITE\",\"spa\":true}")
  assert_code "sites config spa=1 200" "$code" "200"
  code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" "$BASE/$SITE/missing-page" -H "$SH")
  assert_code "sites miss spa fallback 200" "$code" "200"
  assert_contains "spa fallback serves index" "$(cat /tmp/o)" "e2e-site-ok"

  code=$(curl -s --noproxy '*' -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload?path=sites/$SITE/" -H "$A" -H "X-File-Name: 404.html" --data-binary "custom-not-found")
  assert_code "site 404 page upload 201" "$code" "201"
  code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" -X POST "$BASE/api/sites" -H "$BASIC" -H "Content-Type: application/json" -d "{\"slug\":\"$SITE\",\"spa\":false}")
  assert_code "sites config spa=0 200" "$code" "200"
  code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" "$BASE/$SITE/missing-page" -H "$SH")
  assert_code "custom 404 keeps status 404" "$code" "404"
  assert_contains "custom 404 page body" "$(cat /tmp/o)" "custom-not-found"

  SITES_LIST=$(curl -s --noproxy '*' "$BASE/api/sites" -H "$BASIC")
  assert_contains "sites list contains site" "$SITES_LIST" "\"slug\":\"$SITE\""
  assert_contains "sites list reports spa=false" "$SITES_LIST" '"spa":false'
  SITES_STATS=$(curl -s --noproxy '*' "$BASE/api/sites?stats=1" -H "$BASIC")
  assert_contains "sites stats objects counted" "$SITES_STATS" '"objects":2'

  code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" -X POST "$BASE/api/sites" -H "$BASIC" -H "Content-Type: application/json" -d '{"slug":"Bad_Slug","spa":true}')
  assert_code "sites bad slug 400" "$code" "400"
  code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" -X POST "$BASE/api/sites" -H "$BASIC" -H "Content-Type: application/json" -d '{"slug":"nosuchsite","spa":true}')
  assert_code "sites config on missing site 404" "$code" "404"
  code=$(curl -s --noproxy '*' -o /dev/null -w "%{http_code}" "$BASE/api/sites" -H "Authorization: Basic $(printf '%s:wrong' "$USER" | base64)")
  assert_code "sites unauthorized 401" "$code" "401"

  code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" -X DELETE "$BASE/api/sites?slug=$SITE" -H "$BASIC")
  assert_code "clear site keeps config 200" "$code" "200"
  code=$(curl -s --noproxy '*' -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload?path=sites/$SITE/" -H "$A" -H "X-File-Name: index.html" --data-binary "<h1>e2e-site-ok</h1>")
  assert_code "redeploy index upload 201" "$code" "201"
  code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" -X POST "$BASE/api/sites" -H "$BASIC" -H "Content-Type: application/json" -d "{\"slug\":\"$SITE\",\"spa\":true}")
  assert_code "sites config after redeploy 200" "$code" "200"
  code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" "$BASE/$SITE/missing-page" -H "$SH")
  assert_code "spa fallback after redeploy 200" "$code" "200"

  code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" -X DELETE "$BASE/api/sites?slug=$SITE&purge=1" -H "$BASIC")
  assert_code "purge site 200" "$code" "200"
  code=$(curl -s --noproxy '*' -o /dev/null -w "%{http_code}" "$BASE/$SITE/index.html" -H "$SH")
  assert_code "site gone after purge 404" "$code" "404"
  SITES_LIST2=$(curl -s --noproxy '*' "$BASE/api/sites" -H "$BASIC")
  if echo "$SITES_LIST2" | grep -q "$SITE"; then
    bad "site removed from list" "still present" "absent"
  else
    ok "site removed from list"
  fi
else
  echo "  SKIP  静态站点断言（未设置 SITES_HOST，run-e2e.sh 会自动补齐）"
fi

echo "== MCP：新工具与大文件分块 =="
# 解开 JSON-RPC 包装，直接取工具结果文本（工具返回的就是接口 JSON/错误文本）。
# 注意：arguments JSON 必须先拼进变量再传入 —— 在 $( ) 里内嵌 \" 会被 bash
# 花括号展开按逗号拆碎（血泪教训，见 mcp mkdir 通过而 upload 静默失败的历史）。
mcp_call() {
  curl -s --noproxy '*' -X POST "$BASE/mcp" -H "$A" -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$1\",\"arguments\":$2}}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin)['result']['content'][0]['text'])"
}
TOOLS_JSON=$(curl -s --noproxy '*' -X POST "$BASE/mcp" -H "$A" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')
assert_contains "mcp tools/list has search" "$TOOLS_JSON" '"name":"search"'
assert_contains "mcp tools/list has sites_list" "$TOOLS_JSON" '"name":"sites_list"'
assert_contains "mcp tools/list has pull" "$TOOLS_JSON" '"name":"pull"'
assert_contains "mcp tools/list has push" "$TOOLS_JSON" '"name":"push"'
assert_contains "mcp tools/list has publish_site" "$TOOLS_JSON" '"name":"publish_site"'
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" -X POST "$BASE/mcp" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')
assert_code "mcp no key 401" "$code" "401"
MCP_DIR="$DIR/mcp/f"
args='{"path":"'"$MCP_DIR"'/"}'
assert_contains "mcp mkdir" "$(mcp_call mkdir "$args")" '"created":true'
args='{"path":"'"$MCP_DIR"'/","name":"mcp.txt","content":"mcp-hello"}'
assert_contains "mcp upload small" "$(mcp_call upload "$args")" '"key"'
args='{"path":"'"$MCP_DIR"'/mcp.txt"}'
assert_contains "mcp stat size" "$(mcp_call stat "$args")" '"size":9'
args='{"from":"'"$MCP_DIR"'/mcp.txt","to":"'"$MCP_DIR"'/mcp-copy.txt"}'
assert_contains "mcp copy" "$(mcp_call copy "$args")" '"copied":true'
args='{"path":"'"$MCP_DIR"'/mcp-copy.txt"}'
assert_contains "mcp stat copy" "$(mcp_call stat "$args")" '"size":9'
args='{"from":"'"$MCP_DIR"'/mcp-copy.txt","to":"'"$MCP_DIR"'/mcp-moved.txt"}'
assert_contains "mcp move" "$(mcp_call move "$args")" '"to":"'"$MCP_DIR"'/mcp-moved.txt"'
args='{"path":"'"$MCP_DIR"'/mcp-moved.txt"}'
assert_contains "mcp stat moved" "$(mcp_call stat "$args")" '"size":9'
args='{"query":"mcp-moved"}'
assert_contains "mcp search finds moved" "$(mcp_call search "$args")" 'mcp-moved'
args='{"agent":"cursor","files":[{"path":"skills/e2e/SKILL.md","content":"# e2e-skill"}]}'
assert_contains "mcp push skill" "$(mcp_call push "$args")" '"uploaded"'
args='{"agent":"cursor","type":"skills"}'
assert_contains "mcp pull skill" "$(mcp_call pull "$args")" 'e2e-skill'
args='{"agent":"cursor","files":[{"path":"mcp/mcp.json","content":"{\"servers\":{\"x\":{\"headers\":{\"Authorization\":\"Bearer fd_secret\"}}}}"}]}'
assert_contains "mcp push rejects raw key" "$(mcp_call push "$args")" 'must not contain raw API keys'
PUBLISH_SRC="$DIR/mcp/site-src"
args='{"path":"'"$PUBLISH_SRC"'/"}'
assert_contains "mcp mkdir site src" "$(mcp_call mkdir "$args")" '"created":true'
args='{"path":"'"$PUBLISH_SRC"'/","name":"index.html","content":"<h1>e2e-site</h1>"}'
assert_contains "mcp upload site index" "$(mcp_call upload "$args")" '"key"'
args='{"slug":"e2eqa","source":"'"$PUBLISH_SRC"'"}'
assert_contains "mcp publish_site" "$(mcp_call publish_site "$args")" 'e2eqa'

args='{"key":"'"$MCP_DIR"'/mcp.txt"}'
assert_contains "shares accept api key (create)" "$(curl -s --noproxy '*' -X POST "$BASE/api/shares" -H "$A" -H "Content-Type: application/json" -d "$args")" '"token"'
assert_contains "shares accept api key (list)" "$(curl -s --noproxy '*' "$BASE/api/shares" -H "$A")" '"token"'
args='{"path":"'"$MCP_DIR"'/mcp.txt"}'
SHARED_TOKEN=$(mcp_call share_create "$args" | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
if [ -n "$SHARED_TOKEN" ]; then ok "mcp share_create token"; else bad "mcp share_create token" "empty" "token"; fi
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" "$BASE/share/$SHARED_TOKEN")
assert_code "mcp-created share serves file" "$code" "200"
args='{"token":"'"$SHARED_TOKEN"'"}'
assert_contains "mcp share_revoke" "$(mcp_call share_revoke "$args")" 'HTTP 204'
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" "$BASE/share/$SHARED_TOKEN")
assert_code "mcp-revoked share 404" "$code" "404"

# 2MB 二进制：MCP upload 自动三段式 → /api/download 逐字节校验
python3 - "$DIR" <<'PYEOF'
import base64, json, sys
data = (b"0123456789abcdef" * 131072)[:2000000]  # 2,000,000 bytes
open("/tmp/mcp-big.bin", "wb").write(data)
payload = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "upload", "arguments": {
    "path": sys.argv[1] + "/mcp/f/", "name": "big.bin", "content": base64.b64encode(data).decode(), "encoding": "base64"}}}
open("/tmp/mcp-big.json", "w").write(json.dumps(payload))
PYEOF
BIG_RESP=$(curl -s --noproxy '*' -X POST "$BASE/mcp" -H "$A" -H "Content-Type: application/json" --data-binary @/tmp/mcp-big.json | python3 -c "import sys,json;print(json.load(sys.stdin)['result']['content'][0]['text'])")
assert_contains "mcp upload 2MB via multipart chunks" "$BIG_RESP" '"key"'
assert_contains "mcp 2MB uploaded size intact" "$BIG_RESP" '"size":2000000'
curl -s --noproxy '*' -o /tmp/mcp-big-dl.bin "$BASE/api/download?path=$MCP_DIR/big.bin" -H "$A"
if cmp -s /tmp/mcp-big.bin /tmp/mcp-big-dl.bin; then ok "mcp 2MB download byte-identical"; else bad "mcp 2MB download byte-identical" "differs" "identical"; fi
args='{"path":"'"$MCP_DIR"'/big.bin","part":1,"partSize":1048576}'
mcp_call download "$args" > /tmp/mcp-part.json
python3 - <<'PYEOF'
import base64, json
parsed = json.loads(open("/tmp/mcp-part.json").read())
data = open("/tmp/mcp-big.bin", "rb").read()
assert parsed["totalParts"] == 2, parsed["totalParts"]
assert parsed["part"] == 1
assert base64.b64decode(parsed["content"]) == data[: parsed["length"]]
print("  PASS  mcp download part paging matches")
PYEOF
if [ $? -eq 0 ]; then PASS=$((PASS+1)); else bad "mcp download part paging matches" "mismatch" "match"; fi

args='{}'
assert_contains "mcp sites_list" "$(mcp_call sites_list "$args")" '"sitesHost"'

echo "== cleanup =="
curl -s --noproxy '*' -X DELETE "$BASE/webdav/$DIR/" -H "$BASIC" -o /dev/null
curl -s --noproxy '*' -X DELETE "$BASE/api/trash" -H "$BASIC" -H "Content-Type: application/json" -d '{"all":true}' -o /dev/null
KID=$(curl -s --noproxy '*' "$BASE/api/keys" -H "$BASIC" | python3 -c "import sys,json;print(' '.join(k['id'] for k in json.load(sys.stdin)))")
for id in $KID; do curl -s --noproxy '*' -X DELETE "$BASE/api/keys?id=$id" -H "$BASIC" -o /dev/null; done
rm -f "$FIXTURE" "$P1BIN" "$P2BIN" /tmp/suite-*.json /tmp/suite-*.txt /tmp/suite-*.zip /tmp/suite-*.bin /tmp/s1.json /tmp/s2.json /tmp/s3.json /tmp/o /tmp/o.json /tmp/mcp-big.json /tmp/mcp-big.bin /tmp/mcp-big-dl.bin /tmp/mcp-part.json 2>/dev/null

echo ""
echo "=============================="
echo "PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" = "0" ]
