# Deploy

[English](deploy.md) | [中文](deploy.zh-CN.md)

← [README](../README.md)

## This project is Cloudflare Pages

Davflare deploys as a **Cloudflare Pages** app (static UI in `build/` + backend in `functions/` as Pages Functions).

Evidence in-repo:

- `wrangler.toml` has `pages_build_output_dir = "build"`
- There is **no** Worker `main` entry — do **not** invent one just to satisfy Workers tooling
- Correct CLI: `npx wrangler pages deploy build`
- **Wrong** CLI: `npx wrangler deploy` (Workers) → «Missing entry-point / entry point not configured»
- **Wrong** button: [Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/?url=https://github.com/fanchenggang/Davflare) — same failure mode

You need a [Cloudflare](https://dash.cloudflare.com/) account with a payment method and R2 activated (create at least one bucket).

## Deploy via Cloudflare Dashboard (recommended)

There is no official Pages equivalent of the Workers one-click Deploy button. Use the dashboard:

1. Open [Workers & Pages → Create](https://dash.cloudflare.com/?to=/:account/workers-and-pages/create)
2. Choose **Pages** → **Connect to Git** → select `fanchenggang/Davflare` (or your fork)
3. Build settings:
   - Framework preset: **None** (React/Vite, not Docusaurus)
   - Build command: `npm run build`
   - Output directory: `build`
4. Deploy, then configure bindings / env vars (next section) and **retry deploy** so they apply

Official guide: [Pages Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/).

## After the first deploy

1. Bind your R2 bucket to the `BUCKET` variable
2. Set `WEBDAV_USERNAME` and `WEBDAV_PASSWORD`
3. Optional: `WEBDAV_PUBLIC_READ=1` for public read; `TRASH_RETENTION_DAYS` (default `30`, `-1` disables purge)
4. Optional static sites: bind `sites.<your-domain>` to this same Pages project and set `SITES_HOST=sites.<your-domain>`
5. Retry deploy so the binding and env vars apply
6. Optional: add a custom domain for the drive UI

## Wrangler CLI (Pages)

`wrangler.toml` binds R2 as `BUCKET` (default bucket name `webdav`). Change `bucket_name` to your bucket if needed.

```bash
npm run build
npx wrangler pages deploy build
```

Do **not** run `npx wrangler deploy` against this repo — that is the Workers path and will complain that no entry point is configured.

Local preview (Pages + Functions):

```bash
npm run build
npx wrangler pages dev build
```

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

Toggle them in the UI:

1. Open `#/settings` from the account menu.
2. Flip any of the five switches. Stored files are not deleted when a switch is off.
3. MCP depends on API Key: if Key is off, `/mcp` is 404 even if MCP is on. Sites and image-host public URLs also need `SITES_HOST`.

See also [webdav.md](./webdav.md), [sites.md](./sites.md), [API.md](./API.md).
