# Deploy

[English](deploy.md) | [中文](deploy.zh-CN.md)

← [README](../README.md)

## One-click

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/fanchenggang/Davflare)

You need a [Cloudflare](https://dash.cloudflare.com/) account with a payment method and R2 activated (create at least one bucket).

After the first deploy:

1. Bind your R2 bucket to the `BUCKET` variable
2. Set `WEBDAV_USERNAME` and `WEBDAV_PASSWORD`
3. Optional: `WEBDAV_PUBLIC_READ=1` for public read; `TRASH_RETENTION_DAYS` (default `30`, `-1` disables purge)
4. Optional static sites: bind `sites.<your-domain>` to this same Pages project and set `SITES_HOST=sites.<your-domain>`
5. Retry deploy so the binding and env vars apply
6. Optional: add a custom domain for the drive UI

## Manual Cloudflare Pages

- Framework preset: **None (React/Vite, not Docusaurus)**
- Output directory: `build`
- Then bind `BUCKET`, set the env vars above, and retry deploy

## Wrangler CLI

`wrangler.toml` binds R2 as `BUCKET` (default bucket name `webdav`). Change `bucket_name` to your bucket if needed.

```bash
npm run build
npx wrangler pages deploy build
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

