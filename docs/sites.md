# Static sites (v1)

Serve folders from R2 as public websites on a **separate hostname**. Same Worker as the drive; routing is by `Host`. Never serve site HTML on the drive origin — uploaded pages could read `localStorage` login state.

## Enable

1. Bind a custom domain to the same Cloudflare Pages project: `sites.<your-domain>`.
2. In the Cloudflare dashboard, add the Pages project env var `SITES_HOST=sites.<your-domain>` (Production and/or Preview; exact hostname, no `https://`). Do **not** hard-code it in `wrangler.toml`'s `[vars]`.
3. Redeploy. If `SITES_HOST` is empty, static hosting stays off.

> `SITES_HOST` must be a hostname you do **not** use to open the drive. If you point it at the drive's own domain, site content shadows every GET/HEAD on that host and takes the manager offline.

The drive host (`*.pages.dev` or your app domain) is unchanged. `/api`, `/mcp`, and `/webdav` are not exposed on the sites host.

On this host, `/i/{id}` (image host) is matched **first**, then slug static sites. The image-host and sites feature switches are independent: sites off still serves `/i/{id}` when image host is on; image host off 404s `/i/*` even if sites is on. Image blobs are stored at `_$flaredrive$/img/{id}`, not under `sites/`.

## Publish

Upload a folder to `sites/{slug}/` (web UI Sites zip deploy, Open API, MCP `mkdir` + `upload`, or davflare-cli cp/sync). `{slug}` is `[a-z0-9][a-z0-9-]{0,62}`.

```
sites/blog/index.html
sites/blog/style.css
```

Then open `https://sites.<your-domain>/blog/` (or `/blog/style.css`). Missing files 404. Directory URLs resolve to `index.html`. No git deploy, no Pages project per site.

## Management API & UI

- Web UI: open the **Sites** section (`#/sites`) — list sites with stats, one-click zip deploy (client-side unzip + upload queue), SPA toggle, per-site delete. "Manage files" jumps into the regular file manager at `sites/<slug>/`.
- MCP: `sites_list`, `sites_config`, `sites_delete` (same `/api/sites` handlers).
- `GET /api/sites` — list sites (`?stats=1` adds cached object count / total size). Session (Basic) or API key.
- `POST /api/sites` — `{"slug":"blog","spa":true}` toggles SPA fallback. The site must already exist.
- `DELETE /api/sites?slug=blog` — remove all site files (config kept, so a redeploy keeps the SPA flag); add `&purge=1` to also delete the config.
- SPA fallback: on a final miss, `spa=true` serves `sites/<slug>/index.html` with 200; otherwise a custom `sites/<slug>/404.html` is served with status 404 when present.

## Security

- `SITES_HOST` must differ from the drive's own hostname (see the warning above): when they match, the sites middleware intercepts all GET/HEAD requests on that host.
- Different origin from the file manager: site JS cannot read drive credentials.
- All slugs share the sites origin (`sites.domain/a/` and `/b/`). Fine for one owner; do not host untrusted third-party HTML on the same sites host.
- Do not put API keys in the uploaded HTML.
