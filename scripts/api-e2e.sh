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

echo "== 开放接口：path 只解码一次 =="
curl -s --noproxy '*' -X POST "$BASE/api/upload?path=$DIR/pct/" -H "$A" -H "X-File-Name: keep.txt" --data-binary "keep" -o /dev/null
curl -s --noproxy '*' -X POST "$BASE/api/upload?path=$DIR/pct/" -H "$A" -H "X-File-Name: %2e" --data-binary "dot" -o /dev/null
code=$(curl -s --noproxy '*' -o /tmp/o.json -w "%{http_code}" -X DELETE "$BASE/api/delete?path=$DIR/pct/%252e&soft=1" -H "$A")
assert_code "soft delete literal %2e 200" "$code" "200"
assert_contains "folder kept after deleting %2e" "$(curl -s --noproxy '*' "$BASE/api/list?path=$DIR/pct/" -H "$A")" "keep.txt"

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

echo "== counts 批量计数 =="
code=$(curl -s --noproxy '*' -o /tmp/o.json -w "%{http_code}" -X POST "$BASE/api/counts" -H "$BASIC" -H "Content-Type: application/json" -d "{\"paths\":[\"$DIR/paged\",\"$DIR/nonexistent-dir\"]}")
assert_code "counts 200" "$code" "200"
assert_contains "counts paged dir = 5" "$(cat /tmp/o.json)" "\"$DIR/paged\":5"
assert_contains "counts missing dir = 0" "$(cat /tmp/o.json)" "\"$DIR/nonexistent-dir\":0"
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" -X POST "$BASE/api/counts" -H "$A" -H "Content-Type: application/json" -d '{"paths":["x"]}')
assert_code "counts api key = 401" "$code" "401"

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

echo "== 分享（落地页/download=1/raw=1/提取码/过期/撤销）=="
# 显式 text/plain：让 ?raw=1 走内联预览（application/octet-stream 会回退 attachment）
curl -s --noproxy '*' -X POST "$BASE/api/upload?path=$DIR/apitest/" -H "$A" -H "X-File-Name: shareable.txt" -H "Content-Type: text/plain" --data-binary "share me 中文" -o /dev/null
SHARE_FILE=$(curl -s --noproxy '*' -X POST "$BASE/api/shares" -H "$BASIC" -H "Content-Type: application/json" -d "{\"key\":\"$DIR/apitest/shareable.txt\"}")
STOKEN=$(echo "$SHARE_FILE" | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
[ -n "$STOKEN" ] && ok "share file created" || bad "share file created" "$SHARE_FILE" "token"
LANDING=$(curl -s --noproxy '*' "$BASE/share/$STOKEN")
assert_contains "landing page shows file name" "$LANDING" "shareable.txt"
assert_contains "landing page links download=1" "$LANDING" "download=1"
assert_contains "landing page en by default" "$LANDING" "Download"
assert_contains "landing page zh via Accept-Language" "$(curl -s --noproxy '*' -H 'Accept-Language: zh-CN' "$BASE/share/$STOKEN")" "下载"
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" -I "$BASE/share/$STOKEN")
assert_code "landing HEAD 200" "$code" "200"
DLHEAD=$(curl -s --noproxy '*' -D - -o /tmp/suite-share-dl.txt "$BASE/share/$STOKEN?download=1")
code=$(curl -s --noproxy '*' -o /dev/null -w "%{http_code}" "$BASE/share/$STOKEN?download=1")
assert_code "download=1 200" "$code" "200"
assert_contains "download=1 raw bytes intact" "$(cat /tmp/suite-share-dl.txt)" "share me 中文"
assert_contains "download=1 attachment" "$DLHEAD" "attachment"
RAWHEAD=$(curl -s --noproxy '*' -D - -o /tmp/suite-share-raw.txt "$BASE/share/$STOKEN?raw=1")
code=$(curl -s --noproxy '*' -o /dev/null -w "%{http_code}" "$BASE/share/$STOKEN?raw=1")
assert_code "raw=1 200" "$code" "200"
assert_contains "raw=1 inline disposition" "$RAWHEAD" "inline"
assert_contains "raw=1 keeps sandbox" "$RAWHEAD" "sandbox"
assert_contains "raw=1 keeps nosniff" "$RAWHEAD" "nosniff"
assert_contains "raw=1 bytes intact" "$(cat /tmp/suite-share-raw.txt)" "share me 中文"
python3 -c "import base64;open('/tmp/suite-share.png','wb').write(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='))"
code=$(curl -s --noproxy '*' -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload?path=$DIR/apitest/" -H "$A" -H "X-File-Name: shareable.png" -H "Content-Type: image/png" --data-binary @/tmp/suite-share.png)
assert_code "png upload 201" "$code" "201"
SHARE_PNG=$(curl -s --noproxy '*' -X POST "$BASE/api/shares" -H "$BASIC" -H "Content-Type: application/json" -d "{\"key\":\"$DIR/apitest/shareable.png\"}")
PTOKEN=$(echo "$SHARE_PNG" | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
PLANDING=$(curl -s --noproxy '*' "$BASE/share/$PTOKEN")
assert_contains "image landing has img preview" "$PLANDING" "<img"
assert_contains "image landing links raw=1" "$PLANDING" "raw=1"
SHARE_DIR=$(curl -s --noproxy '*' -X POST "$BASE/api/shares" -H "$BASIC" -H "Content-Type: application/json" -d "{\"key\":\"$DIR/paged\"}")
DTOKEN=$(echo "$SHARE_DIR" | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
[ -n "$DTOKEN" ] && ok "share dir created" || bad "share dir created" "$SHARE_DIR" "token"
curl -s --noproxy '*' -o /tmp/suite-dir.zip "$BASE/share/$DTOKEN?download=1"
assert_contains "dir share zip contains children" "$(python3 -c "
import zipfile
try:
    print('ZIP-OK' if any(n.endswith('f2.txt') for n in zipfile.ZipFile('/tmp/suite-dir.zip').namelist()) else 'ZIP-BAD')
except Exception:
    print('ZIP-BAD')
")" "ZIP-OK"
DTHEAD=$(curl -s --noproxy '*' -o /dev/null -w "%{http_code}|%{content_type}" -I "$BASE/share/$DTOKEN")
# HEAD 与 GET 语义对齐（TESTING.md 分享落地页批次）：默认落地页 text/html，
# ?download=1 / ?raw=1 才是 zip/文件本体。（原断言 HEAD 无参即 zip 是旧语义残留，
# 与 8150589 引入、TESTING.md 记载的现行语义矛盾，基线 2ad064f 上也必失败。）
assert_contains "dir share HEAD 200 landing-html" "$DTHEAD" "200|text/html"
DTZIPHEAD=$(curl -s --noproxy '*' -o /dev/null -w "%{http_code}|%{content_type}" -I "$BASE/share/$DTOKEN?download=1")
assert_contains "dir share HEAD download=1 zip" "$DTZIPHEAD" "200|application/zip"
assert_contains "dir landing folder badge" "$(curl -s --noproxy '*' "$BASE/share/$DTOKEN")" "Folder (zip download)"
# 过期：expiresInHours 接受小数（0.00001h = 36ms），落地页与直链都应 410
EXP_SHARE=$(curl -s --noproxy '*' -X POST "$BASE/api/shares" -H "$BASIC" -H "Content-Type: application/json" -d "{\"key\":\"$DIR/apitest/shareable.txt\",\"expiresInHours\":0.00001}")
ETOKEN=$(echo "$EXP_SHARE" | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
sleep 1
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" "$BASE/share/$ETOKEN")
assert_code "expired share landing 410" "$code" "410"
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" "$BASE/share/$ETOKEN?download=1")
assert_code "expired share download 410" "$code" "410"
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" "$BASE/share/$STOKEN")
assert_code "share GET before revoke 200" "$code" "200"
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" -X DELETE "$BASE/api/shares?token=$STOKEN" -H "$BASIC")
assert_code "share revoke 204" "$code" "204"
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" "$BASE/share/$STOKEN")
assert_code "revoked share 404" "$code" "404"
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" "$BASE/share/$STOKEN?download=1")
assert_code "revoked share download 404" "$code" "404"
SHARE_CODE=$(curl -s --noproxy '*' -X POST "$BASE/api/shares" -H "$BASIC" -H "Content-Type: application/json" -d "{\"key\":\"$DIR/apitest/shareable.txt\",\"extractCode\":\"fd42\"}")
CTOKEN=$(echo "$SHARE_CODE" | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
[ -n "$CTOKEN" ] && ok "share with extract code created" || bad "share with code" "$SHARE_CODE" "token"
assert_contains "no code shows form" "$(curl -s --noproxy '*' -H 'Accept-Language: zh-CN' "$BASE/share/$CTOKEN")" "提取码"
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" "$BASE/share/$CTOKEN?code=wrong")
assert_code "wrong extract code 403" "$code" "403"
assert_contains "correct code downloads" "$(curl -s --noproxy '*' "$BASE/share/$CTOKEN?code=fd42&download=1")" "share me 中文"
assert_contains "correct code raw preview" "$(curl -s --noproxy '*' "$BASE/share/$CTOKEN?code=fd42&raw=1")" "share me 中文"
code=$(curl -s --noproxy '*' -o /tmp/o -w "%{http_code}" -X POST "$BASE/share/$CTOKEN" -d "code=wrong")
assert_code "form POST wrong code 403" "$code" "403"
JAR=$(mktemp)
code=$(curl -s --noproxy '*' -c "$JAR" -o /tmp/o -w "%{http_code}" -X POST "$BASE/share/$CTOKEN" -d "code=fd42")
assert_code "form POST correct code 303" "$code" "303"
assert_contains "cookie unlocks landing page" "$(curl -s --noproxy '*' -b "$JAR" "$BASE/share/$CTOKEN")" "shareable.txt"
assert_contains "cookie unlocks raw preview" "$(curl -s --noproxy '*' -b "$JAR" "$BASE/share/$CTOKEN?raw=1")" "share me 中文"
code=$(curl -s --noproxy '*' -H 'Accept-Language: zh-CN' -o /tmp/o -w "%{http_code}" "$BASE/share/$CTOKEN")
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
  # #145：不带结尾斜杠的站点根 301 到 /{slug}/（保留查询串），否则页面相对链接会解析到域名根
  code=$(curl -s --noproxy '*' -D /tmp/suite-slash-headers -o /dev/null -w "%{http_code}" "$BASE/$SITE?from=e2e" -H "$SH")
  assert_code "sites root without slash 301" "$code" "301"
  assert_contains "slash redirect location" "$(grep -i '^Location' /tmp/suite-slash-headers)" "/$SITE/?from=e2e"

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

  # #146：公开目录里的 html/svg 以附件下载，生成的列表页照常渲染
  DSITE="e2edir"
  curl -s --noproxy '*' -o /dev/null -X POST "$BASE/api/upload?path=$DIR/pubdir/" -H "$A" -H "X-File-Name: evil.html" --data-binary "<script>alert(1)</script>"
  curl -s --noproxy '*' -o /dev/null -X POST "$BASE/api/upload?path=$DIR/pubdir/" -H "$A" -H "X-File-Name: evil.svg" --data-binary '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'
  PLAN=$(curl -s --noproxy '*' -X POST "$BASE/api/sites" -H "$BASIC" -H "Content-Type: application/json" -d "{\"slug\":\"$DSITE\",\"dir\":{\"phase\":\"plan\",\"source\":\"$DIR/pubdir\",\"lang\":\"en\"}}")
  PLAN_ID=$(echo "$PLAN" | python3 -c "import sys,json;print(json.load(sys.stdin)['planId'])")
  curl -s --noproxy '*' -o /dev/null -X POST "$BASE/api/sites" -H "$BASIC" -H "Content-Type: application/json" -d "{\"slug\":\"$DSITE\",\"dir\":{\"phase\":\"copy\",\"planId\":\"$PLAN_ID\",\"files\":[\"evil.html\",\"evil.svg\"]}}"
  code=$(curl -s --noproxy '*' -o /dev/null -w "%{http_code}" -X POST "$BASE/api/sites" -H "$BASIC" -H "Content-Type: application/json" -d "{\"slug\":\"$DSITE\",\"dir\":{\"phase\":\"finish\",\"planId\":\"$PLAN_ID\"}}")
  assert_code "dir site publish finish 200" "$code" "200"
  curl -s --noproxy '*' -D /tmp/suite-dir-html -o /dev/null "$BASE/$DSITE/evil.html" -H "$SH"
  assert_contains "dir site html is attachment" "$(grep -i '^Content-Disposition' /tmp/suite-dir-html)" "attachment"
  curl -s --noproxy '*' -D /tmp/suite-dir-svg -o /dev/null "$BASE/$DSITE/evil.svg" -H "$SH"
  assert_contains "dir site svg is attachment" "$(grep -i '^Content-Disposition' /tmp/suite-dir-svg)" "attachment"
  # #170：active 类型边缘不存；ETag 带上强制下载标记
  assert_contains "dir site svg CDN no-store" "$(grep -i '^CDN-Cache-Control' /tmp/suite-dir-svg)" "no-store"
  assert_contains "dir site svg etag variant" "$(grep -i '^ETag' /tmp/suite-dir-svg)" "-dl"
  curl -s --noproxy '*' -D /tmp/suite-dir-index -o /dev/null "$BASE/$DSITE/" -H "$SH"
  if grep -qi '^Content-Disposition' /tmp/suite-dir-index; then bad "dir listing page inline" "attachment" "inline"; else ok "dir listing page inline"; fi
  curl -s --noproxy '*' -D /tmp/suite-plain-html -o /dev/null "$BASE/$SITE/index.html" -H "$SH"
  if grep -qi '^Content-Disposition' /tmp/suite-plain-html; then bad "plain site html inline" "attachment" "inline"; else ok "plain site html inline"; fi
  curl -s --noproxy '*' -o /dev/null -X DELETE "$BASE/api/sites?slug=$DSITE&purge=1" -H "$BASIC"

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
assert_contains "mcp tools/list has image_upload" "$TOOLS_JSON" '"name":"image_upload"'
assert_contains "mcp tools/list has image_list" "$TOOLS_JSON" '"name":"image_list"'
assert_contains "mcp tools/list has image_delete" "$TOOLS_JSON" '"name":"image_delete"'
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
args='{"name":"e2e.png","encoding":"base64","content":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="}'
IMG_JSON=$(mcp_call image_upload "$args")
assert_contains "mcp image_upload url" "$IMG_JSON" '/i/'
assert_contains "mcp image_upload markdown" "$IMG_JSON" '![]('
IMG_ID=$(python3 -c "import json,sys; print(json.loads(sys.argv[1]).get('id',''))" "$IMG_JSON")
if [ -n "$IMG_ID" ]; then ok "mcp image_upload id"; else bad "mcp image_upload id" "empty" "id"; fi
assert_contains "mcp image_list" "$(mcp_call image_list '{}')" "$IMG_ID"
args='{"id":"'"$IMG_ID"'"}'
assert_contains "mcp image_delete" "$(mcp_call image_delete "$args")" '"deleted":true'

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

echo "== 文件收集链接（匿名只写）=="
COLLECT_OUT=$(BASE="$BASE" BASIC="$BASIC" APIKEY="$KEY" DIR="$DIR" python3 - <<'PYEOF'
import http.client, json, os, time, urllib.parse

BASE = os.environ["BASE"]
BASIC = os.environ["BASIC"].split(": ", 1)[1]
APIKEY = os.environ["APIKEY"]
DIR = os.environ["DIR"]
u = urllib.parse.urlparse(BASE)
PART = 10 * 1024 * 1024
passed = failed = 0

def req(method, path, body=None, headers=None, chunked=False):
    conn = http.client.HTTPConnection(u.hostname, u.port, timeout=60)
    h = dict(headers or {})
    if isinstance(body, (dict, list)):
        body = json.dumps(body).encode()
        h.setdefault("Content-Type", "application/json")
    if chunked:
        conn.putrequest(method, path)
        for k, v in h.items():
            conn.putheader(k, v)
        conn.putheader("Transfer-Encoding", "chunked")
        conn.endheaders()
        conn.send(b"%x\r\n%s\r\n0\r\n\r\n" % (len(body), body))
    else:
        conn.request(method, path, body=body, headers=h)
    res = conn.getresponse()
    data = res.read()
    out = (res.status, dict((k.lower(), v) for k, v in res.getheaders()), data)
    conn.close()
    return out

def check(name, cond, got=""):
    global passed, failed
    if cond:
        passed += 1
        print("  PASS  " + name)
    else:
        failed += 1
        print("  FAIL  " + name + "  (got: " + str(got)[:140] + ")")

def owner(method, path, body=None):
    return req(method, path, body, {"Authorization": BASIC})

def jbody(r):
    try:
        return json.loads(r[2] or b"{}")
    except Exception:
        return {}

def create_link(folder, **extra):
    r = owner("POST", "/api/collects", dict(folder=folder, **extra))
    return r, jbody(r).get("token", "")

def anon_create(token, name, size, typ="text/plain"):
    r = req("POST", "/collect/%s/create" % token, {"name": name, "size": size, "type": typ})
    return r, jbody(r)

def anon_part(token, upload_id, n, data):
    return req("PUT", "/collect/%s/part?uploadId=%s&partNumber=%d" % (token, urllib.parse.quote(upload_id, safe=""), n), data)

def upload(token, name, data, typ="text/plain"):
    r, c = anon_create(token, name, len(data), typ)
    if r[0] != 200:
        return r
    parts = []
    for i in range(c["partCount"]):
        pr = anon_part(token, c["uploadId"], i + 1, data[i * PART:(i + 1) * PART])
        if pr[0] != 200:
            return pr
        parts.append(jbody(pr))
    return req("POST", "/collect/%s/complete" % token, {"uploadId": c["uploadId"], "parts": parts})

def dav_get(key):
    return req("GET", "/webdav/" + urllib.parse.quote(key), headers={"Authorization": BASIC})

folder = DIR + "/collect"
r = req("POST", "/api/mkdir", {"path": folder}, {"Authorization": "Bearer " + APIKEY})
req("PUT", "/webdav/" + urllib.parse.quote(folder + "/existing.txt"), b"owner secret", {"Authorization": BASIC})

r = req("POST", "/api/collects", {"folder": folder})
check("collects create without auth = 401", r[0] == 401, r[0])
r, token = create_link(folder)
check("collects create (Basic) = 201", r[0] == 201 and len(token) == 32, r)
check("collect url uses /collect/", jbody(r).get("url", "").endswith("/collect/" + token), r[2])
r = req("POST", "/api/collects", {"folder": folder, "expiresInHours": 24}, {"Authorization": "Bearer " + APIKEY})
check("collects create (API key) = 201", r[0] == 201, r[0])
check("collects reject internal folder = 400", create_link("_$flaredrive$/shares")[0][0] == 400)
check("collects reject sites/ folder = 400", create_link("sites/demo")[0][0] == 400)
check("collects reject > 7 days = 400", create_link(folder, expiresInHours=169)[0][0] == 400)
check("collects missing folder = 404", create_link(DIR + "/nope-folder")[0][0] == 404)

r = req("GET", "/collect/" + token, headers={"Accept-Language": "en"})
csp = r[1].get("content-security-policy", "")
check("upload page 200", r[0] == 200, r[0])
check("upload page CSP nonce", "script-src 'nonce-" in csp and "default-src 'none'" in csp, csp)
check("upload page hides folder path", DIR.encode() not in r[2] and b"existing.txt" not in r[2])

r = upload(token, "hello.txt", b"hello collect")
check("anon upload small file = 200", r[0] == 200, r)
check("complete response has no name/key", b"hello" not in r[2] and DIR.encode() not in r[2], r[2])
check("owner sees uploaded file", dav_get(folder + "/hello.txt")[2] == b"hello collect")

big = bytes(range(256)) * ((PART + 5) // 256 + 1)
big = big[:PART + 5]
r = upload(token, "big.bin", big, "application/octet-stream")
check("anon upload 2 parts (10 MiB + 5) = 200", r[0] == 200, r)
check("2-part upload byte-identical", dav_get(folder + "/big.bin")[2] == big)

r = upload(token, "existing.txt", b"from anon")
check("name collision upload = 200", r[0] == 200, r)
check("existing file not overwritten", dav_get(folder + "/existing.txt")[2] == b"owner secret")
check("collision saved as existing-2.txt", dav_get(folder + "/existing-2.txt")[2] == b"from anon")

r = upload(token, "../../escape.txt", b"x")
check("traversal name upload = 200", r[0] == 200, r)
check("traversal lands inside folder", dav_get(folder + "/escape.txt")[0] == 200)
check("traversal did not escape", dav_get(DIR + "/escape.txt")[0] == 404 and dav_get("escape.txt")[0] == 404)

upload(token, "page.html", b"<script>alert(1)</script>", "text/html")
ct = dav_get(folder + "/page.html")[1].get("content-type", "")
check("html upload stored as octet-stream", ct.startswith("application/octet-stream"), ct)

r, c = anon_create(token, "huge.iso", 100 * 1024 * 1024 + 1)
check("declared > 100 MiB = 413", r[0] == 413 and c.get("error") == "file_too_large", r)
r, c = anon_create(token, "empty.txt", 0)
check("empty file = 400", r[0] == 400, r)

r, c = anon_create(token, "parts.bin", PART + 5)
up = c.get("uploadId", "")
r = anon_part(token, up, 1, b"\0" * (PART + 1))
check("oversized part = 413", r[0] == 413, r)
r = req("PUT", "/collect/%s/part?uploadId=%s&partNumber=1" % (token, urllib.parse.quote(up, safe="")), b"abc", chunked=True)
check("part without Content-Length rejected (411)", r[0] == 411, r)
r = anon_part(token, up, 1, b"\0" * 5)
check("wrong part length = 400", r[0] == 400, r)
r = anon_part(token, up, 3, b"\0" * 5)
check("part beyond partCount = 400", r[0] == 400, r)
r = req("POST", "/collect/%s/abort" % token, {"uploadId": up})
check("abort = 204", r[0] == 204, r)
r = anon_part(token, up, 2, b"\0" * 5)
check("part after abort = 404", r[0] == 404, r)

r, token_b = create_link(folder)
r, c = anon_create(token, "a.txt", 3)
up = c.get("uploadId", "")
r = anon_part(token_b, up, 1, b"abc")
check("foreign uploadId on other link = 404", r[0] == 404 and b"unknown_upload" in r[2], r)
pr = anon_part(token, up, 1, b"abc")
r = req("POST", "/collect/%s/complete" % token_b, {"uploadId": up, "parts": [jbody(pr)]})
check("foreign uploadId complete = 404", r[0] == 404, r)
r = req("POST", "/api/upload?uploads&path=" + urllib.parse.quote(folder + "/existing.txt"), b"", {"Authorization": "Bearer " + APIKEY})
owner_up = jbody(r).get("uploadId", "")
r = anon_part(token, owner_up, 1, b"pwn")
check("owner multipart uploadId rejected = 404", bool(owner_up) and r[0] == 404, r)
req("DELETE", "/api/upload?path=%s&uploadId=%s" % (urllib.parse.quote(folder + "/existing.txt"), urllib.parse.quote(owner_up, safe="")), headers={"Authorization": "Bearer " + APIKEY})
req("POST", "/collect/%s/abort" % token, {"uploadId": up})

r = owner("POST", "/api/shares", {"key": folder + "/hello.txt"})
share_token = jbody(r).get("token", "")
r, c = anon_create(share_token, "x.txt", 1)
check("share token on /collect = 404", r[0] == 404, r)
check("share token page on /collect = 404", req("GET", "/collect/" + share_token)[0] == 404)
r = req("GET", "/share/" + token)
check("collect token on /share = 404", r[0] == 404 and b"hello collect" not in r[2], r[0])
owner("DELETE", "/api/shares?token=" + share_token)

r = owner("GET", "/api/collects")
items = [i for i in jbody(r) if isinstance(jbody(r), list) and i.get("token") == token] if r[0] == 200 else []
check("list shows usage", bool(items) and items[0]["usage"]["files"] == 5, r[2][:200])

r, exp_token = create_link(folder, expiresInHours=0.0006)
time.sleep(3)
check("expired link page = 410", req("GET", "/collect/" + exp_token)[0] == 410)
r, c = anon_create(exp_token, "late.txt", 1)
check("expired link create = 410", r[0] == 410 and c.get("error") == "expired", r)

r, dis_token = create_link(folder)
r, c = anon_create(dis_token, "inflight.txt", 3)
up = c.get("uploadId", "")
r = owner("PATCH", "/api/collects?token=" + dis_token, {"disabled": True})
check("disable link = 200", r[0] == 200 and jbody(r).get("status") == "disabled", r)
check("disabled link page = 410", req("GET", "/collect/" + dis_token)[0] == 410)
r, c = anon_create(dis_token, "x.txt", 1)
check("disabled link create = 410", r[0] == 410 and c.get("error") == "disabled", r)
check("disabled link in-flight part = 410", anon_part(dis_token, up, 1, b"abc")[0] == 410)

gone = DIR + "/collect-gone"
req("POST", "/api/mkdir", {"path": gone}, {"Authorization": "Bearer " + APIKEY})
r, gone_token = create_link(gone)
req("DELETE", "/webdav/" + urllib.parse.quote(gone) + "/", headers={"Authorization": BASIC})
r, c = anon_create(gone_token, "x.txt", 1)
check("deleted target folder = 410 folder_gone", r[0] == 410 and c.get("error") == "folder_gone", r)

r = owner("DELETE", "/api/collects?token=" + token)
check("delete link = 204", r[0] == 204, r)
check("deleted link page = 404", req("GET", "/collect/" + token)[0] == 404)
check("files kept after link delete", dav_get(folder + "/hello.txt")[0] == 200)

# 清理本套件创建的全部收集链接
r = owner("GET", "/api/collects")
for item in (jbody(r) if r[0] == 200 else []):
    if str(item.get("folder", "")).startswith(DIR):
        owner("DELETE", "/api/collects?token=" + item["token"])
print("COLLECT_COUNTS %d %d" % (passed, failed))
PYEOF
)
echo "$COLLECT_OUT" | grep -v '^COLLECT_COUNTS'
read -r _ CP CF <<< "$(echo "$COLLECT_OUT" | grep '^COLLECT_COUNTS' || echo 'COLLECT_COUNTS 0 1')"
PASS=$((PASS+CP)); FAIL=$((FAIL+CF))

echo "== cleanup =="
curl -s --noproxy '*' -X DELETE "$BASE/webdav/$DIR/" -H "$BASIC" -o /dev/null
curl -s --noproxy '*' -X DELETE "$BASE/api/trash" -H "$BASIC" -H "Content-Type: application/json" -d '{"all":true}' -o /dev/null
KID=$(curl -s --noproxy '*' "$BASE/api/keys" -H "$BASIC" | python3 -c "import sys,json;print(' '.join(k['id'] for k in json.load(sys.stdin)))")
for id in $KID; do curl -s --noproxy '*' -X DELETE "$BASE/api/keys?id=$id" -H "$BASIC" -o /dev/null; done
rm -f "$FIXTURE" "$P1BIN" "$P2BIN" /tmp/suite-*.json /tmp/suite-*.txt /tmp/suite-*.zip /tmp/suite-*.bin /tmp/suite-share*.png /tmp/s1.json /tmp/s2.json /tmp/s3.json /tmp/o /tmp/o.json /tmp/mcp-big.json /tmp/mcp-big.bin /tmp/mcp-big-dl.bin /tmp/mcp-part.json 2>/dev/null

echo ""
echo "PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" = "0" ]
