# Davflare

[English](README.md) | [中文](README.zh-CN.md)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/fanchenggang/Davflare)

Cloudflare R2 file manager on Pages + Workers — free 10 GB storage and 100,000 Worker invocations per day. [R2 pricing](https://developers.cloudflare.com/r2/platform/pricing/)

基于 Cloudflare R2 的网盘：免费 10GB 存储、每天 10 万次 Worker 调用。[R2 定价](https://developers.cloudflare.com/r2/platform/pricing/)

## Screenshots

File browser (light theme):

![File browser](docs/screenshots/browser.png)

Preview / share:

![Preview](docs/screenshots/preview.png)

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

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/fanchenggang/Davflare)

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

Create keys in the web UI (「API」 / 「开放接口」). Auth: `Authorization: Bearer <apiKey>` or `X-Api-Key: <apiKey>`. Full request examples: [Open API docs](docs/API.md).

| Method | Path | Purpose |
| --- | --- | --- |
| GET / POST / DELETE | `/api/keys` | Create, list, and revoke keys (session auth) |
| POST / PUT / DELETE | `/api/upload` | Upload a file (multipart, raw body, overwrite, or chunked >100MB) |
| GET | `/api/list` | Depth-1 folder listing (size, uploaded, etag) |
| GET | `/api/download` | Download one file |
| POST | `/api/mkdir` | Create a folder (parents auto-created) |
| POST | `/api/rename` | Rename or move a file or folder |
| POST | `/api/backup` | Rename remote to `name.conflict-<UTC>` before overwrite |
| DELETE | `/api/delete` | Hard delete, or `soft=1` to trash |
| POST | `/api/shares` | Share a file or folder (folder → zip) |

Same keys work for a bidirectional sync client (local wins; backup remote on conflict). Details in the [API docs](docs/API.md).

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
