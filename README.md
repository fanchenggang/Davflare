# Davflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/fanchenggang/FlareDrive)

Cloudflare R2 file manager on Pages + Workers — free 10 GB storage and 100,000 Worker invocations per day. [R2 pricing](https://developers.cloudflare.com/r2/platform/pricing/)

基于 Cloudflare R2 的网盘：免费 10GB 存储、每天 10 万次 Worker 调用。[R2 定价](https://developers.cloudflare.com/r2/platform/pricing/)

Started as a fork of [longern/FlareDrive](https://github.com/longern/FlareDrive) and has been fully rewritten. The GitHub repo name is still **FlareDrive** for now so Pages and CI keep working.

## Features

- Chunked web uploads for large files
- Folders, search, drag-and-drop, image/video/PDF thumbnails
- Share links with expiry or forever, extract code, and folder zip download
- Recycle bin with `TRASH_RETENTION_DAYS` (default 30; `-1` disables; lazy purge up to 200 items when trash is opened)
- WebDAV Class 1/2 at `/webdav`
- API keys for scripted upload, download, and bidirectional sync
- Chinese / English UI (globe icon in the header; defaults to browser language, persisted locally)

## Deploy

One-click:

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/fanchenggang/FlareDrive)

You need a [Cloudflare](https://dash.cloudflare.com/) account with a payment method and R2 activated (create at least one bucket).

After the first deploy:

1. Bind your R2 bucket to the `BUCKET` variable
2. Set `WEBDAV_USERNAME` and `WEBDAV_PASSWORD`
3. Optional: `WEBDAV_PUBLIC_READ=1` for public read; `TRASH_RETENTION_DAYS` (default `30`, `-1` disables purge)
4. Retry deploy so the binding and env vars apply
5. Optional: add a custom domain

### Manual Cloudflare Pages

- Framework preset: **None (React CRA, not Docusaurus)**
- Output directory: `build`
- Then bind `BUCKET`, set the env vars above, and retry deploy

### Wrangler CLI

`wrangler.toml` binds R2 as `BUCKET` (default bucket name `webdav`). Change `bucket_name` to your bucket if needed.

```bash
npm run build
npx wrangler pages deploy build
```

## WebDAV

Endpoint: `https://<your-domain.com>/webdav`

Use any WebDAV client (for example [Cx File Explorer](https://play.google.com/store/apps/details?id=com.cxinventor.file.explorer) or [BD File Manager](https://play.google.com/store/apps/details?id=com.liuzho.file.explorer)). Fill in the endpoint plus the username and password you set.

Cloudflare Workers limit a single PUT to **128 MB**. Oversized PUTs return **HTTP 413** (Chinese message: use the web uploader). Upload large files through the web UI, which supports chunked uploads.

The in-app WebDAV panel shows URL, username, and whether public-read is on. It does **not** display the password.

## Open API

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
curl -L "https://<your-domain.com>/api/download?path=DBX/sync/snapshot.json" \
  -H "Authorization: Bearer <apiKey>" \
  -o snapshot.json

# also accepts X-Api-Key
curl -L "https://<your-domain.com>/api/download?path=DBX/sync/snapshot.json" \
  -H "X-Api-Key: <apiKey>" \
  -o snapshot.json
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

## Development & testing

```bash
npm install

npm run typecheck   # tsc --noEmit (covers src/ and functions/)
npm test            # Jest unit tests (interactive watch)
npm run test:ci     # Jest unit tests, single CI-friendly run
npm run build       # production build into build/

npm run test:e2e    # one-shot API regression: build → wrangler pages dev (local miniflare R2) → scripts/api-e2e.sh
SKIP_BUILD=1 npm run test:e2e   # reuse an existing build/ for faster iterations
```

`test:e2e` creates a local `.dev.vars` (gitignored) with dev credentials if absent, boots `wrangler pages dev` on port 8788 (override with `PORT`), waits for readiness, runs the ~79-assertion suite against it, and tears the server down. Data lives in `.wrangler/state/` — delete that directory to reset the local bucket. See [TESTING.md](./TESTING.md) for the full verification history and [TEST_CASES.md](./TEST_CASES.md) for the manual GUI case library.

## Acknowledgments

- [longern/FlareDrive](https://github.com/longern/FlareDrive) by [longern](https://github.com/longern) — original fork; this project has been fully rewritten since. Internal object prefix is still `_$flaredrive$/`.
- [r2-webdav](https://github.com/abersheeran/r2-webdav) by [abersheeran](https://github.com/abersheeran) — WebDAV implementation.

## License

[MIT](./LICENSE)
