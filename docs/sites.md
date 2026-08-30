# Static sites (v1)

Serve folders from R2 as public websites on a **separate hostname**. Same Worker as the drive; routing is by `Host`. Never serve site HTML on the drive origin — uploaded pages could read `localStorage` login state.

## Enable

1. Bind a custom domain to the same Cloudflare Pages project: `sites.<your-domain>`.
2. Set the Pages env var `SITES_HOST=sites.<your-domain>` (exact hostname, no `https://`).
3. Redeploy. If `SITES_HOST` is empty, static hosting stays off.

The drive host (`*.pages.dev` or your app domain) is unchanged. `/api`, `/mcp`, and `/webdav` are not exposed on the sites host.

## Publish

Upload a folder to `sites/{slug}/` (web UI, Open API, or MCP `mkdir` + `upload`). `{slug}` is `[a-z0-9][a-z0-9-]{0,62}`.

```
sites/blog/index.html
sites/blog/style.css
```

Then open `https://sites.<your-domain>/blog/` (or `/blog/style.css`). Missing files 404. Directory URLs resolve to `index.html`. No git deploy, no Pages project per site.

## Security

- Different origin from the file manager: site JS cannot read drive credentials.
- All slugs share the sites origin (`sites.domain/a/` and `/b/`). Fine for one owner; do not host untrusted third-party HTML on the same sites host.
- Do not put API keys in the uploaded HTML.
