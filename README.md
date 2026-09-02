# Davflare

[English](README.md) | [中文](README.zh-CN.md)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/fanchenggang/Davflare)

Cloudflare R2 file manager on Pages + Workers — free 10 GB storage and 100,000 Worker invocations per day. [R2 pricing](https://developers.cloudflare.com/r2/platform/pricing/)

基于 Cloudflare R2 的网盘：免费 10GB 存储、每天 10 万次 Worker 调用。[R2 定价](https://developers.cloudflare.com/r2/platform/pricing/)

## Screenshots

Grid light:

![Grid light](docs/screenshots/grid-light.png)

Grid dark:

![Grid dark](docs/screenshots/grid-dark.png)

Image preview:

![Image preview](docs/screenshots/preview.png)

Share (expiry + extract code):

![Share (expiry + extract code)](docs/screenshots/share.png)

## Features

- Chunked web uploads for large files
- Folders, search, drag-and-drop, image/video/PDF thumbnails
- Share links with expiry or forever, extract code, and folder zip download
- Recycle bin with `TRASH_RETENTION_DAYS` (default 30; `-1` disables; lazy purge up to 200 items when trash is opened)
- WebDAV Class 1/2 at `/webdav` (can be switched off without affecting the web file manager)
- API keys for scripted upload, download, and bidirectional sync
- Remote MCP at `/mcp` (18 tools: files, search, move/copy, shares, sites, plus `pull` / `push` / `publish_site`). Uploads auto-chunk up to 25 MB; downloads page with `part`. **MCP requires an API Key** — if the API Key switch is off, `/mcp` is 404 even when the MCP switch is on
- Sites manager in the UI (`#/sites`): zip deploy, SPA toggle, per-site delete
- Static sites on a separate host (`SITES_HOST` + `sites/{slug}/`); [docs/sites.md](docs/sites.md)
- Image host on the same sites hostname at `/i/{id}` (stored under `_$flaredrive$/img/`, not `sites/` or share links)
- Owner Settings (`#/settings`) with five persistent feature switches (default all on)
- `davflare-cli` for login / ls / mkdir / rm / mv / cp / sync ([cli/README.md](cli/README.md))
- Optional Chrome MV3 extension in `extension/` (toolbar opens **your** instance; New Tab override defaults off)
- Agent layouts on R2: `agents/{global|agent|agent/project}/{skills|rules|mcp}/` (`pull` / `push` tools; see [docs/agents.md](docs/agents.md))
- Chinese / English UI (globe icon in the header; defaults to browser language, persisted locally)

## Follow along

Three short paths. Use **your** bound host — there is no public live demo other people can open.

### Publish a static site from Cursor

1. In `#/settings`, leave **API Key** and **MCP** on. Create a key (account menu → API keys) and paste it into Cursor `mcp.json` as in [MCP](#mcp).
2. Ask Cursor (copy-paste):

   ```
   Upload this folder to sites/hello/ on Davflare (mkdir parents, overwrite same names). Then call sites_config for slug hello if this is an SPA.
   ```

3. Open `https://<SITES_HOST>/hello/` on the hostname you bound to **this** Pages project. Until `SITES_HOST` is set and redeployed, that URL will not open.

### Host an image and copy its URL

1. Open `#/images` in the drive UI.
2. Drag an image onto the page (or click Upload).
3. Click **Copy URL** or **Copy Markdown** (`![](https://<SITES_HOST>/i/{id})`). Public URLs only work after you bind a custom domain and set Pages env `SITES_HOST` (hostname only).

### Toggle the five Settings switches

1. Open `#/settings` from the account menu.
2. The five switches are WebDAV, MCP, API Key, Sites, and Image host (all default on). Stored files are not deleted when a switch is off.
3. MCP depends on API Key: if Key is off, `/mcp` is 404 even if MCP is on. Sites and image-host public URLs also need `SITES_HOST`.

## Deploy

One-click:

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/fanchenggang/Davflare)

You need a [Cloudflare](https://dash.cloudflare.com/) account with a payment method and R2 activated (create at least one bucket).

After the first deploy:

1. Bind your R2 bucket to the `BUCKET` variable
2. Set `WEBDAV_USERNAME` and `WEBDAV_PASSWORD`
3. Optional: `WEBDAV_PUBLIC_READ=1` for public read; `TRASH_RETENTION_DAYS` (default `30`, `-1` disables purge)
4. Optional static sites: bind `sites.<your-domain>` to this same Pages project and set `SITES_HOST=sites.<your-domain>`
5. Retry deploy so the binding and env vars apply
6. Optional: add a custom domain for the drive UI

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
| GET / PATCH | `/api/config` | Session: username, public-read, sitesHost, feature flags. PATCH is Basic-only |
| GET / POST / DELETE | `/api/images` | Image host (session): list, upload, delete. Public bytes on `SITES_HOST /i/{id}` |
| GET / POST / DELETE | `/api/keys` | Create, list, and revoke keys (session auth) |
| POST / PUT / DELETE | `/api/upload` | Upload a file (multipart, raw body, overwrite, or chunked >100MB) |
| GET | `/api/list` | Depth-1 folder listing (size, uploaded, etag) |
| GET | `/api/download` | Download one file (Range / 206 resume) |
| POST | `/api/mkdir` | Create a folder (parents auto-created) |
| POST | `/api/rename` | Rename or move a file or folder |
| POST | `/api/copy` | Copy a file |
| GET | `/api/stat` | Object metadata |
| GET | `/api/search` | Filename substring search |
| POST | `/api/backup` | Rename remote to `name.conflict-<UTC>` before overwrite |
| DELETE | `/api/delete` | Hard delete, or `soft=1` to trash |
| POST | `/api/shares` | Share a file or folder (folder → zip) |
| GET / POST / DELETE | `/api/sites` | List, SPA-config, or delete static sites |
| POST | `/mcp` | Remote MCP (JSON-RPC 2.0; same API keys; 18 tools) |

Same keys work for a bidirectional sync client (local wins; backup remote on conflict). Details in the [API docs](docs/API.md).

`GET /api/config` (session) returns username, public-read, `sitesHost`, and the five feature flags. `PATCH /api/config` updates flags and is **web session (Basic) only** — API keys cannot change switches.

## Feature switches

Owner-only Settings (`#/settings`, account menu) persist five flags in R2 at `_$flaredrive$/config.json` (survive deploys; not set in `wrangler.toml`). Default: all **on**.

| Switch | Off means |
| --- | --- |
| WebDAV | Hide the WebDAV button/panel. Clients cannot mount `/webdav` (404). The web file manager still uses session (Basic) I/O. |
| MCP | `POST /mcp` → 404; hide MCP copy in the API panel. |
| API Key | Hide key management. Bearer / `X-Api-Key` Open API calls fail (401). Session APIs keep working. **MCP also becomes 404/unusable** because it authenticates with API keys. |
| Sites | Hide `#/sites`. Slug sites on `SITES_HOST` 404. Objects under `sites/` are not deleted. |
| Image host | Hide the image-host UI. `/i/*` on `SITES_HOST` 404. Stored images are not deleted. |

`SITES_HOST` empty still turns public hosting off at the infra level. The Sites / Image host switches are extra product toggles when that host is bound.

## MCP

Same-origin Model Context Protocol (Streamable HTTP) at `/mcp`. Auth is the same API key as the Open API (`Authorization: Bearer <apiKey>` or `X-Api-Key`). **MCP depends on API Key: if the API Key switch is off, MCP is unusable even if the MCP switch is on.**

Tools (18): `list`, `upload`, `download`, `mkdir`, `delete`, `search`, `move`, `copy`, `stat`, `share_create`, `share_list`, `share_revoke`, `sites_list`, `sites_config`, `sites_delete`, `pull`, `push`, `publish_site`.

Uploads up to 1 MiB go inline; larger content is auto-chunked (cap **25 MB**). Bigger files: web UI or `davflare-cli`. Downloads over 1 MiB page with `part` / `partSize`. Default `delete` is trash; `hard=true` permanently deletes. Publish a static site by uploading into `sites/{slug}/` (or `publish_site` from a drive folder), then `sites_config` if you need SPA fallback. `pull` / `push` walk `agents/…` (merge: project > agent > global). Details: [docs/API.md](docs/API.md).

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

## Static sites

Public HTML from `sites/{slug}/` on a **separate hostname** (`SITES_HOST`). Same Worker, Host routing — not `/sites` on the drive origin.

In the drive UI, **Sites** (`#/sites`) lists each slug with stats, one-click zip deploy, SPA toggle, and delete. MCP `sites_list` / `sites_config` / `sites_delete` wrap the same `/api/sites` endpoints. Details: [docs/sites.md](docs/sites.md).

## CLI

[`davflare-cli`](cli/README.md) is the Open API command-line client: `login`, `ls`, `mkdir`, `rm`, `mv`, `cp`, `sync`. Uploads over 100 MB are chunked; downloads resume with HTTP Range. See `cli/README.md` for install, login, and sync semantics.

## Extension

A Chrome Manifest V3 helper that opens **your** Davflare instance. It is not on the Chrome Web Store.

- Options: paste the URL of the Pages / custom-domain host you deployed. The field starts empty — there is no built-in site.
- Toolbar click opens that URL. If it is unset, the toolbar opens Options instead.
- Optional New Tab is **off** by default. Leave it off to keep Chrome’s normal new tab; turn it on to open your drive.

**Load unpacked:** Chrome → `chrome://extensions` → Developer mode → Load unpacked → select the `extension/` folder in this repo.

**Release zip:** download `davflare-extension.zip` from [GitHub Releases](https://github.com/fanchenggang/Davflare/releases), unzip, then load unpacked from that folder. A tag (`v*` / `extension-*`) or **Actions → Release extension** builds the zip.

## Image host

Upload images in the drive UI (`#/images`): drag/drop, copy the public URL or Markdown `![](url)`, list and delete. Blobs live at `_$flaredrive$/img/{id}` with an unguessable id (not the original filename). Public URL is only `https://<SITES_HOST>/i/{id}` (no scheme in `SITES_HOST`). SVG is served as a download (`Content-Disposition: attachment` + `nosniff`), never as a navigable document.

On the sites host, `/i/{id}` is matched **before** slug static sites. The image-host switch is independent of the sites switch: sites off + image host on → slugs 404 but `/i/{id}` works; image host off → `/i/*` 404 even if sites is on. If `SITES_HOST` is unset, the switch can still exist but the UI tells you to bind the host first.

## Agent layouts

Skills, rules, and MCP snippets live on R2 under `agents/`. v2 `pull` / `push` walk that tree (or use the web UI). Merge order: project > agent > global. Never store raw API keys in `mcp.json` — use `${env:DAVFLARE_API_KEY}`. Cursor local paths: [docs/agents.md](docs/agents.md).

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
