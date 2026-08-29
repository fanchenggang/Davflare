# Davflare Open API

[English](API.md) | [中文](API.zh-CN.md)

← [README](../README.md)

Create keys in the web UI: ExplorerBar 「API」 or account menu 「开放接口」. Full keys are shown once; only SHA-256 hashes are stored. Auth is `Authorization: Bearer <apiKey>` or `X-Api-Key: <apiKey>` (no web session). Manage keys via session-authenticated `GET` / `POST` / `DELETE` `/api/keys`. Usage docs are also on the API settings page.

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

`POST /api/shares` accepts a folder key too — visiting the share link streams the whole tree as a zip download (extract code and expiry apply as usual).

### Bidirectional sync recipe

Local wins; backup remote on conflict. Same Bearer / `X-Api-Key` auth as upload; no web session. WebDAV protocol is unchanged.

1. List with `GET /api/list` and compare local mtime/size/etag vs remote `uploaded` / `size` / `etag`.
2. Local-only new/changed → `POST /api/upload?overwrite=1`.
3. Remote-only new/changed → `GET /api/download`.
4. Both changed → `POST /api/backup?path=remoteKey` then overwrite-upload local bytes to the original name.
5. Optional local deletes: `DELETE /api/delete` (skip unless the client tracks a sync db). Extra remote-only files: download them.
