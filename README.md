# Davflare

[English](README.md) | [中文](README.zh-CN.md)

[![Deploy to Cloudflare Pages](https://img.shields.io/badge/Deploy%20to%20Cloudflare-Pages-F38020?logo=cloudflare&logoColor=white)](https://dash.cloudflare.com/?to=/:account/workers-and-pages/create) · [Deploy guide](docs/deploy.md)

Cloudflare R2 file manager on **Cloudflare Pages** (API via Pages Functions) — free 10 GB storage and 100,000 invocations per day. [R2 pricing](https://developers.cloudflare.com/r2/platform/pricing/)

> **Pages, not Workers.** This repo sets `pages_build_output_dir` in `wrangler.toml` and has no Worker `main`. Do **not** use the [Workers Deploy to Cloudflare](https://deploy.workers.cloudflare.com/) button or `wrangler deploy` — that looks for a Worker entry point and fails with «entry point not configured».

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

- Chunked web uploads, folders, search, drag-and-drop, image/video/PDF thumbnails
- Share links with expiry or forever, extract code, folder zip, and a zero-JS landing page
- Recycle bin with configurable retention (`TRASH_RETENTION_DAYS`)
- WebDAV Class 1/2 at `/webdav` (toggleable without affecting the web UI)
- API keys for scripted upload / download / sync, plus remote MCP at `/mcp` (25 tools)
- Static sites and image host on a separate hostname (`SITES_HOST`), plus a GitHub Action to deploy from CI
- Owner Settings with five persistent feature switches
- `davflare-cli`, optional Chrome MV3 extension, and agent layouts on R2
- Chinese / English UI

## Quick start

1. Open [Workers & Pages → Create](https://dash.cloudflare.com/?to=/:account/workers-and-pages/create) → **Pages** → **Connect to Git**, pick this repo (needs a Cloudflare account with R2 activated and a payment method on file).
2. Framework preset **None**, build `npm run build`, output directory `build` (or rely on `wrangler.toml`'s `pages_build_output_dir`).
3. Bind your R2 bucket to `BUCKET`, set `WEBDAV_USERNAME` and `WEBDAV_PASSWORD`, then retry deploy.
4. Optional: `WEBDAV_PUBLIC_READ=1`, `TRASH_RETENTION_DAYS` (default `30`, `-1` disables), and for public sites/images bind `sites.<your-domain>` and set `SITES_HOST=sites.<your-domain>`.
5. Optional: add a custom domain for the drive UI.

Full Pages / Wrangler steps and the five feature switches: [docs/deploy.md](docs/deploy.md).

## Free Obsidian sync in 10 minutes

Sync an Obsidian vault to Davflare's WebDAV (`/webdav`) with the community plugin [Remotely Save](https://github.com/remotely-save/remotely-save). Every device shares one copy, no extra server.

1. Deploy Davflare (see Quick start above) and keep the WebDAV switch on in `#/settings` (on by default).
2. Open the drive → **WebDAV** in the top bar → **Obsidian sync** card, then click "Copy server address" (looks like `https://<your-domain>/webdav/`) and "Copy username". The password is `WEBDAV_PASSWORD` (your web sign-in password); the card never shows it.
3. Obsidian → Settings → Community plugins. In a new vault, first turn off **Restricted mode** (turn on community plugins); only then does **Browse** appear. Browse, install and enable **Remotely Save**.
4. In Remotely Save settings:
   - Choose A Remote Service: **Webdav**
   - Server Address / Username / Password: from step 2
   - Auth Type: **basic**
   - Depth Header Sent To Servers: keep the default **only supports depth='1'**
   - Remote Base Directory: leave empty (defaults to the vault name, created at the WebDAV root); if your devices use different vault names, set the same single-level name on all of them (no `/`), then click **Confirm** next to the field — the change is not saved otherwise
5. Click "Check Connectivity" → "Check" and wait for the success notice.
6. Click the Remotely Save icon in the left ribbon to sync once. Before the first sync the plugin shows "**HUGE updates on the sync algorithm**": tick both checkboxes and click **Agree** (**Disagree** uninstalls the plugin).
7. Second device: create an **empty vault with the same name** first, configure it with steps 3–5, then sync once to pull down the same content.

Tested (local `wrangler pages dev` plus the same `webdav` client the plugin uses, replaying Remotely Save 0.5.25's request sequence as two devices syncing both ways): Chinese file names, spaces, special characters such as `+ & ' % #`, nested folders, empty folders, PNG / PDF attachments, 5MB / 12MB files, deletes, file renames, folder renames, and both depth='1' and depth='infinity' listing.

Limits: each file must be under 100MB (Cloudflare's request body limit; larger uploads get 413). Remotely Save syncs a rename as "delete old file + upload new file".

## Documentation

| Topic | Link |
| --- | --- |
| Deploy, env vars, feature switches, post-deploy `#/setup` checklist; MCP playground `#/mcp` | [docs/deploy.md](docs/deploy.md) · [docs/API.md](docs/API.md) |
| WebDAV clients & limits | [docs/webdav.md](docs/webdav.md) |
| Open API & MCP (incl. chat share / zip folder examples) | [docs/API.md](docs/API.md) |
| Static sites & image host | [docs/sites.md](docs/sites.md) |
| GitHub Action — deploy a build dir to a site (`uses: fanchenggang/Davflare@main`) | [docs/sites.md#github-action-deploy-to-davflare-site](docs/sites.md#github-action-deploy-to-davflare-site) |
| Agent layouts (`pull` / `push`) | [docs/agents.md](docs/agents.md) |
| CLI (`davflare-cli`) | [cli/README.md](cli/README.md) |
| Chrome extension (install + bookmarks) | [extension/README.md](extension/README.md) |
| Bookmark portability | [docs/bookmarks-portability.md](docs/bookmarks-portability.md) |
| Testing | [TESTING.md](TESTING.md) · [TEST_CASES.md](TEST_CASES.md) |

## Acknowledgments

- [longern/FlareDrive](https://github.com/longern/FlareDrive) by [longern](https://github.com/longern) — original fork; this project has been fully rewritten since. Internal object prefix is still `_$flaredrive$/`.
- [r2-webdav](https://github.com/abersheeran/r2-webdav) by [abersheeran](https://github.com/abersheeran) — WebDAV implementation.
- [HamHome](https://github.com/bingoYB/ham_home) by [bingoYB](https://github.com/bingoYB) — bookmark library UX was inspired by this open-source reference.

## License

[MIT](./LICENSE)
