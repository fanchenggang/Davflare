# Davflare 开放接口

[English](API.md) | [中文](API.zh-CN.md)

← [README](../README.zh-CN.md)

在网页端创建密钥：资源管理栏「API」，或账号菜单「开放接口」。完整密钥只展示一次，服务端仅保存 SHA-256 哈希。鉴权方式为 `Authorization: Bearer <apiKey>` 或 `X-Api-Key: <apiKey>`（不走网页会话）。通过已登录会话调用 `GET` / `POST` / `DELETE` `/api/keys` 管理密钥。API 设置页也有使用说明。

内部 `_$flaredrive$/` 路径会被拒绝。单次操作覆盖超过 1000 个对象会返回 **400**，需要分批处理。

### 上传

默认 `POST /api/upload` 遇到重名会自动改名（`name (2).ext`）。加上 `?overwrite=1`（或 `true`）则按相同路径 + 文件名覆盖写入。

```bash
# multipart
curl -X POST "https://<your-domain.com>/api/upload?path=folder/" \
  -H "Authorization: Bearer <apiKey>" \
  -F "file=@photo.jpg"

# also accepts X-Api-Key, or a raw body with X-File-Name
curl -X POST "https://<your-domain.com>/api/upload?path=docs/" \
  -H "X-Api-Key: <apiKey>" \
  -H "X-File-Name: notes.txt" \
  --data-binary @notes.txt

# overwrite upload
curl -X POST "https://<your-domain.com>/api/upload?path=folder/&overwrite=1" \
  -H "Authorization: Bearer <apiKey>" \
  -F "file=@photo.jpg"
```

单次请求上传上限约 100 MB（超出返回 **HTTP 413**）。更大的文件请使用三步分片 API：

```bash
# 1) create
curl -X POST "https://<your-domain.com>/api/upload?uploads&path=folder/big.bin" \
  -H "Authorization: Bearer <apiKey>"
# → 201 { key, uploadId }

# 2) upload each part (≤100MB per request, partNumber 1..10000)
curl -X PUT "https://<your-domain.com>/api/upload?path=folder/big.bin&uploadId=<id>&partNumber=1" \
  -H "Authorization: Bearer <apiKey>" \
  --data-binary @part1.bin
# → 200 { partNumber, etag }

# 3) complete with the collected parts (order matters)
curl -X POST "https://<your-domain.com>/api/upload?path=folder/big.bin&uploadId=<id>" \
  -H "Authorization: Bearer <apiKey>" \
  -H "Content-Type: application/json" \
  -d '{"parts":[{"partNumber":1,"etag":"..."},{"partNumber":2,"etag":"..."}]}'

# abort an unfinished upload
curl -X DELETE "https://<your-domain.com>/api/upload?path=folder/big.bin&uploadId=<id>" \
  -H "Authorization: Bearer <apiKey>"
```

### 列出、下载、创建目录

同一把密钥可以列出文件夹并逐个下载文件（`/api/download` 不会把文件夹打成 zip；目录 zip 请走目录分享）。

```bash
# Depth-1 list (empty path = root). Does not recurse.
curl "https://<your-domain.com>/api/list?path=folder/" \
  -H "Authorization: Bearer <apiKey>"

# download each item where isDir is false
curl -L "https://<your-domain.com>/api/download?path=folder/notes.txt" \
  -H "Authorization: Bearer <apiKey>" \
  -o notes.txt

# also accepts X-Api-Key
curl -L "https://<your-domain.com>/api/download?path=folder/notes.txt" \
  -H "X-Api-Key: <apiKey>" \
  -o notes.txt
```

`GET /api/list` 只返回当前文件夹的 `{ items: [{ key, name, size, isDir, uploaded, etag }] }`。文件始终包含数值 `size`、ISO `uploaded`（以及别名 `updated`）和 R2 `etag`。前缀分隔出来的文件夹为 `isDir: true`、`size: 0`、`uploaded: null`（未知；不会伪造 mtime）。嵌套目录：再用该项的 `key` 调用一次 `/api/list`。若 `path` 指向文件，列表接口返回 **400** 并提示改用 `/api/download`。目录不存在：**404**。密钥无效或过期：**401**。大目录可加 `limit=1..1000`（以及上一页返回的 `cursor`）做分页 —— 还有下一页时响应会带 `nextCursor`。

`GET /api/download` 的 `path` 是对象 key。**HTTP 200** 会流式返回文件（`Content-Type` 来自 R2，否则为 `application/octet-stream`，`Content-Disposition: attachment`）。`path` 缺失/为空，或指向目录/前缀文件夹，返回 **400**；对象不存在 **404**；密钥无效或过期 **401**。内部 `_$flaredrive$/` 路径会被拒绝。

脚本创建文件夹（父目录会自动创建）：

```bash
# JSON body or ?path= both work. 201 created / 200 already exists / 409 same-name file
curl -X POST "https://<your-domain.com>/api/mkdir" \
  -H "Authorization: Bearer <apiKey>" \
  -H "Content-Type: application/json" \
  -d '{"path":"folder/sub"}'
```

### 备份、重命名、删除

```bash
# conflict backup: rename remote to name.conflict-YYYYMMDDTHHMMSS.ext (UTC)
curl -X POST "https://<your-domain.com>/api/backup?path=folder/notes.txt" \
  -H "Authorization: Bearer <apiKey>"

# rename (409 if `to` exists unless overwrite=1; directories move recursively, no overwrite)
curl -X POST "https://<your-domain.com>/api/rename" \
  -H "Authorization: Bearer <apiKey>" \
  -H "Content-Type: application/json" \
  -d '{"from":"folder/old.txt","to":"folder/new.txt"}'

# delete a file only
curl -X DELETE "https://<your-domain.com>/api/delete?path=folder/notes.txt" \
  -H "Authorization: Bearer <apiKey>"

# soft delete (goes to the recycle bin, restorable; works for directories too)
curl -X DELETE "https://<your-domain.com>/api/delete?path=folder/notes.txt&soft=1" \
  -H "Authorization: Bearer <apiKey>"

# delete a whole directory recursively (≤1000 objects per call)
curl -X DELETE "https://<your-domain.com>/api/delete?path=folder/sub" \
  -H "Authorization: Bearer <apiKey>"
```

`/api/rename` 和 `/api/delete` 也支持目录 —— 重命名会移动整棵子树，删除会递归移除（默认硬删除，除非带 `soft=1`）。对目录调用 `/api/backup` 会把整棵子树重命名为 `name.conflict-<UTCstamp>`。单次操作覆盖超过 1000 个对象会返回 **400**，需要分批处理。

### 分享

`POST /api/shares` 也接受文件夹 key —— 打开分享链接会把整棵子树以 zip 流式下载（提取码和过期时间照常生效）。分享管理（GET/POST/DELETE /api/shares）同时接受网页会话（Basic）和 API key。

### 复制、stat、搜索

`POST /api/copy` 复制文件（to 已存在则 409，除非 overwrite=1；不支持目录）。`GET /api/stat?path=` 返回 kind / size / etag / uploaded / contentType。`GET /api/search?q=` 按文件名子串搜索（cursor 分页）。`GET /api/download` 会发 Accept-Ranges: bytes，并响应单个 Range 为 206。

### 静态站点 API

GET / POST / DELETE /api/sites 列站、切 SPA、删站。会话或 API key 均可。详见 [sites.zh-CN.md](./sites.zh-CN.md)。

### MCP

同源 Streamable HTTP MCP：`POST /mcp`（JSON-RPC 2.0）。鉴权与其它开放接口相同（`Authorization: Bearer <apiKey>` 或 `X-Api-Key`；不走网页会话，无 OAuth）。密钥缺失或无效返回 **HTTP 401**。工具：`list`、`upload`、`download`、`mkdir`、`delete`、`search`、`move`、`copy`、`stat`、`share_create`、`share_list`、`share_revoke`、`sites_list`、`sites_config`、`sites_delete`（包装上方 Open API）。超过 1 MiB 的上传自动改走分块（上限 **25 MB**；再大返回工具错误，请用网页端或 davflare-cli）。下载超过 1 MiB 用 `part` / `partSize` 分页。`delete` 默认进回收站；`hard=true` 为永久删除。`sites_*` 管理 `sites/` 下的静态站；`upload` / `delete` 也可以直接操作 `sites/<slug>/`。

```bash
# initialize
curl -X POST "https://<your-domain.com>/mcp" \
  -H "Authorization: Bearer <apiKey>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{}}}'

# tools/list
curl -X POST "https://<your-domain.com>/mcp" \
  -H "Authorization: Bearer <apiKey>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

Cursor（`mcp.json`）：

```json
{
  "mcpServers": {
    "davflare": {
      "url": "https://<your-domain.com>/mcp",
      "headers": {
        "Authorization": "Bearer <apiKey>"
      }
    }
  }
}
```

### Agent 目录

skills / rules / MCP 片段：`agents/{global|{agent}|{agent}/{project}}/{skills|rules|mcp}/`。v1 手动（现有 list/upload/download/mkdir/delete 或网页端）。合并：project 覆盖 agent 覆盖 global。`mcp.json` 不要明文密钥。完整约定：[agents.zh-CN.md](./agents.zh-CN.md)。

### 双向同步示例

以本地为准；冲突时先备份远端。鉴权与上传相同（Bearer / `X-Api-Key`），不走网页会话。WebDAV 协议不变。

1. 用 `GET /api/list` 列出，比较本地 mtime/size/etag 与远端 `uploaded` / `size` / `etag`。
2. 仅本地新增/变更 → `POST /api/upload?overwrite=1`。
3. 仅远端新增/变更 → `GET /api/download`。
4. 两边都变 → `POST /api/backup?path=remoteKey`，再把本地内容覆盖上传到原文件名。
5. 可选的本地删除：`DELETE /api/delete`（除非客户端维护同步库，否则跳过）。远端多出来的文件：下载下来。
