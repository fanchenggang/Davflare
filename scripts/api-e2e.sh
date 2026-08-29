#!/bin/bash
# FlareDrive 开放 API + WebDAV 断言回归套件（对应 TEST_CASES.md 模块 11/12）
# 用法：本地起服务后执行
#   BASE=http://127.0.0.1:8788 WEBDAV_USER=admin WEBDAV_PASS=xxx bash scripts/api-e2e.sh
# 所有测试数据写入自建前缀目录，结束自动清理（目录/回收站/密钥）。
set -u
BASE="${BASE:-http://127.0.0.1:8788}"
USER="${WEBDAV_USER:-admin}"
PASSWD="${WEBDAV_PASS:-admin}"
DIR="fd-e2e-$(date +%H%M%S)-suite"
BASIC="Authorization: Basic $(printf '%s:%s' "$USER" "$PASSWD" | base64)"
PASS=0; FAIL=0

ok()  { PASS=$((PASS+1)); echo "  PASS  $1"; }
bad() { FAIL=$((FAIL+1)); echo "  FAIL  $1  (got: $2, want: $3)"; }
assert_code() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "$2" "$3"; fi; }
assert_contains() { case "$2" in *"$3"*) ok "$1";; *) bad "$1" "$(echo "$2" | head -c 140)" "$3";; esac; }

FIXTURE=$(mktemp /tmp/fd-suite-XXXXXX.txt)
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
assert_contains "soft delete trashId" "$(cat /tmp/o.json)" '"trashId"'
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
P1BIN=$(mktemp /tmp/suite-p1-XXXX.bin); head -c 5242880 /dev/zero > "$P1BIN"
P2BIN=$(mktemp /tmp/suite-p2-XXXX.bin); printf 'tail-content\n' > "$P2BIN"
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

echo "== cleanup =="
curl -s --noproxy '*' -X DELETE "$BASE/webdav/$DIR/" -H "$BASIC" -o /dev/null
curl -s --noproxy '*' -X DELETE "$BASE/api/trash" -H "$BASIC" -H "Content-Type: application/json" -d '{"all":true}' -o /dev/null
KID=$(curl -s --noproxy '*' "$BASE/api/keys" -H "$BASIC" | python3 -c "import sys,json;print(' '.join(k['id'] for k in json.load(sys.stdin)))")
for id in $KID; do curl -s --noproxy '*' -X DELETE "$BASE/api/keys?id=$id" -H "$BASIC" -o /dev/null; done
rm -f "$FIXTURE" "$P1BIN" "$P2BIN" /tmp/suite-*.json /tmp/suite-dl.txt /tmp/s1.json /tmp/s2.json /tmp/s3.json /tmp/o /tmp/o.json 2>/dev/null

echo ""
echo "=============================="
echo "PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" = "0" ]
