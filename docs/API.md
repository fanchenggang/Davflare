# Davflare Open API

[English](API.md) | [中文](API.zh-CN.md)

← [README](../README.md)

Create keys in the web UI: ExplorerBar 「API」 or account menu 「开放接口」. Full keys are shown once; only SHA-256 hashes are stored. Auth is `Authorization: Bearer <apiKey>` or `X-Api-Key: <apiKey>` (no web session). Manage keys via session-authenticated `GET` / `POST` / `DELETE` `/api/keys`. Usage docs are also on the API settings page.

If the **API Key** feature switch is off, Bearer / `X-Api-Key` calls fail with **401**. The web session (Basic) APIs keep working. **MCP requires API Key**: `POST /mcp` is **404** when either the MCP switch or the API Key switch is off.

Owner feature flags live in R2 (`_$flaredrive$/config.json`). `GET /api/config` (session) returns `username`, `publicRead`, `sitesHost`, and `webdav` / `mcp` / `apiKey` / `sites` / `imageHost` (all default **true**). `PATCH /api/config` with a JSON object of those booleans is **Basic session only** — presenting `Bearer` or `X-Api-Key` returns **403**.

Internal `_$flaredrive$/` keys are rejected. Operations covering more than 1000 objects return **400** and must be batched.

### Upload

Default `POST /api/upload` uniqueNames collisions (`name (2).ext`). Add `?overwrite=1` (or `true`) to PUT/replace the same path + filename.

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

Single-request uploads are limited to about 100 MB (**HTTP 413** otherwise). Larger files use the 3-step multipart API:

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

### List, download, mkdir

The same keys can list a folder and download each file (folders are not a zip via `/api/download`; use a directory share for zip).

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

`GET /api/list` returns `{ items: [{ key, name, size, isDir, uploaded, etag }] }` for the current folder only. Files always include numeric `size`, ISO `uploaded` (and alias `updated`), and R2 `etag`. Delimited-prefix folders have `isDir: true`, `size: 0`, and `uploaded: null` (unknown; no fake mtime). Nested folders: call `/api/list` again with that item's `key`. If `path` is a file, the list API returns **400** and tells you to use `/api/download`. Missing folder: **404**. Bad/expired key: **401**. Large folders: add `limit=1..1000` (plus `cursor` from the previous response) for paged reads — the response then carries `nextCursor` while more pages remain.

`GET /api/download` `path` is the object key. **HTTP 200** streams the file (`Content-Type` from R2 or `application/octet-stream`, `Content-Disposition: attachment`). Missing/empty path or a directory/prefix folder returns **400**; unknown object **404**; bad/expired key **401**. Internal `_$flaredrive$/` keys are rejected.

Create folders from scripts (parents are auto-created):

```bash
# JSON body or ?path= both work. 201 created / 200 already exists / 409 same-name file
curl -X POST "https://<your-domain.com>/api/mkdir" \
  -H "Authorization: Bearer <apiKey>" \
  -H "Content-Type: application/json" \
  -d '{"path":"folder/sub"}'
```

### Backup, rename, delete

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

`/api/rename` and `/api/delete` accept directories — rename moves the whole tree, delete removes it recursively (hard delete unless `soft=1`). `/api/backup` on a directory renames the whole tree to `name.conflict-<UTCstamp>`. Operations covering more than 1000 objects return **400** and must be batched.

### Shares

`POST /api/shares` accepts a folder key too — visiting the share link streams the whole tree as a zip download (extract code and expiry apply as usual). Share management (`GET`/`POST`/`DELETE /api/shares`) accepts **both** the web session (Basic) and an API key, so scripts and MCP can create/list/revoke shares.

### Copy, stat, search

```bash
# copy a file (409 if `to` exists unless overwrite=1; directories are not supported)
curl -X POST "https://<your-domain.com>/api/copy" \
  -H "Authorization: Bearer <apiKey>" \
  -H "Content-Type: application/json" \
  -d '{"from":"folder/a.txt","to":"folder/b.txt"}'

# object metadata (kind file/directory, size, etag, uploaded, contentType)
curl "https://<your-domain.com>/api/stat?path=folder/a.txt" \
  -H "Authorization: Bearer <apiKey>"

# search all objects by filename substring (cursor pagination)
curl "https://<your-domain.com>/api/search?q=notes&limit=100" \
  -H "Authorization: Bearer <apiKey>"
```

`GET /api/download` sends `Accept-Ranges: bytes` and honors a single `Range` header with **206** responses, so resumable/chunked downloads work with plain HTTP clients.

### Feature flags and image host

```bash
# session only
curl "https://<your-domain.com>/api/config" \
  -u "$WEBDAV_USERNAME:$WEBDAV_PASSWORD"

# PATCH is Basic session only — API keys are rejected (403)
curl -X PATCH "https://<your-domain.com>/api/config" \
  -u "$WEBDAV_USERNAME:$WEBDAV_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"webdav":false,"imageHost":true}'
```

Image host (session only; public bytes are on `SITES_HOST`, not the drive origin):

```bash
# list
curl "https://<your-domain.com>/api/images" -u "$WEBDAV_USERNAME:$WEBDAV_PASSWORD"

# upload (raw body + X-File-Name, or multipart field file)
curl -X POST "https://<your-domain.com>/api/images" \
  -u "$WEBDAV_USERNAME:$WEBDAV_PASSWORD" \
  -H "X-File-Name: shot.png" \
  --data-binary @shot.png

# delete
curl -X DELETE "https://<your-domain.com>/api/images?id=<id>" \
  -u "$WEBDAV_USERNAME:$WEBDAV_PASSWORD"
```

Public URL: `https://<SITES_HOST>/i/{id}`. SVG responses use `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.

### MCP

Same-origin Streamable HTTP MCP at `POST /mcp` (JSON-RPC 2.0). Auth is the same `Authorization: Bearer <apiKey>` or `X-Api-Key` as the rest of this API (no web session, no OAuth). **MCP depends on the API Key switch** — if API Key is off (or MCP is off), `/mcp` returns **404**. Missing or invalid keys return **HTTP 401**. Tools: `list`, `upload`, `download`, `mkdir`, `delete`, `search`, `move`, `copy`, `stat`, `share_create`, `share_list`, `share_revoke`, `sites_list`, `sites_config`, `sites_delete`, `pull`, `push`, `publish_site` (they wrap the Open API handlers above). Uploads over 1 MiB are automatically sent in multipart chunks (cap **25 MB**; larger returns a tool error — use the web UI or scripts). Downloads over 1 MiB page with `part` / `partSize` (base64 slices). Default `delete` is soft-delete to trash; pass `hard=true` to permanently delete. `sites_*` manage the static sites under `sites/` (see [sites.md](./sites.md)); `upload`/`delete` also work directly on `sites/<slug>/` keys. `pull` walks `agents/{global|agent|agent/project}/{skills|rules|mcp}/` and returns layered files (merge: project > agent > global); large files page like `download`. `push` writes that tree (`mcp.json` must use `${env:...}`, not raw keys). `publish_site` copies a drive folder onto `sites/{slug}/` (overwrite same names; SPA config is kept; 404 if the Sites switch is off).

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

Cursor (`mcp.json`):

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

### Agent layouts

Skills / rules / MCP snippets: `agents/{global|{agent}|{agent}/{project}}/{skills|rules|mcp}/`. v2 `pull` / `push` walk this tree (or use the web UI). Merge: project > agent > global. Do not store raw keys in `mcp.json`. Full convention: [agents.md](./agents.md).

### Bidirectional sync recipe

Local wins; backup remote on conflict. Same Bearer / `X-Api-Key` auth as upload; no web session. WebDAV protocol is unchanged.

1. List with `GET /api/list` and compare local mtime/size/etag vs remote `uploaded` / `size` / `etag`.
2. Local-only new/changed → `POST /api/upload?overwrite=1`.
3. Remote-only new/changed → `GET /api/download`.
4. Both changed → `POST /api/backup?path=remoteKey` then overwrite-upload local bytes to the original name.
5. Optional local deletes: `DELETE /api/delete` (skip unless the client tracks a sync db). Extra remote-only files: download them.
