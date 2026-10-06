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

Upload a folder to `sites/{slug}/` (web file manager **Publish as site**, Sites zip deploy, Open API, MCP `mkdir` + `upload`, MCP `publish_site` from a drive folder, or `davflare sites publish ./dist --slug <slug>` / davflare-cli cp/sync). `{slug}` is `[a-z0-9][a-z0-9-]{0,62}`.

```
sites/blog/index.html
sites/blog/style.css
```

Then open `https://sites.<your-domain>/blog/` (or `/blog/style.css`). Missing files 404. Directory URLs resolve to `index.html`. No Pages project per site; to publish from CI use the [GitHub Action](#github-action-deploy-to-davflare-site).

## GitHub Action (Deploy to Davflare Site)

Publish a build directory from CI with the official composite action (`action.yml` at the repo root; it builds and runs `davflare sites publish` from the action checkout — no npm install needed).

1. In the drive web UI create an API key (**API keys**).
2. In your repo: **Settings → Secrets and variables → Actions** → add `DAVFLARE_URL` (e.g. `https://drive.example.com`, include `https://`) and `DAVFLARE_API_KEY`.
3. Add a workflow:

```yaml
# .github/workflows/deploy-site.yml
name: Deploy site
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci && npm run build        # produces dist/
      - name: Deploy to Davflare Site
        id: davflare
        uses: fanchenggang/Davflare@main
        with:
          path: dist
          slug: my-site
          url: ${{ secrets.DAVFLARE_URL }}
          api-key: ${{ secrets.DAVFLARE_API_KEY }}
      - run: echo "Live at ${{ steps.davflare.outputs.url }}"
```

| Input | Required | Description |
| --- | --- | --- |
| `path` | yes | Build output directory (relative to the workspace), e.g. `dist` |
| `slug` | yes | Site slug `[a-z0-9][a-z0-9-]{0,62}` → `https://<SITES_HOST>/<slug>/` |
| `url` | yes | Davflare instance URL (from a secret) |
| `api-key` | yes | Davflare API key (from a secret) |

| Output | Description |
| --- | --- |
| `url` | Public site URL (also printed in the log, as a notice and in the job summary; empty if the instance has no `SITES_HOST`) |

- **Key safety:** the key is passed to the CLI only through an environment variable (never argv), registered with `::add-mask::`, and the script never uses `set -x`.
- **Fails loudly:** a wrong/expired/revoked key fails the step with `Davflare API key rejected (401)` before anything is uploaded; empty `path`/`slug`/`url`/`api-key`, a missing or empty build directory, an invalid slug or an unreachable instance also fail with a clear message.
- Requires Node.js ≥ 18 on the runner (preinstalled on GitHub-hosted runners). Same semantics as `davflare sites publish`: files with the same name are overwritten; the SPA flag / password / custom hostname config is kept.
- Tip: pin a commit SHA instead of `@main` for reproducible builds. Optional README badge: `[![Deploy site](https://github.com/<owner>/<repo>/actions/workflows/deploy-site.yml/badge.svg)](https://github.com/<owner>/<repo>/actions/workflows/deploy-site.yml)`.
- Manual demo workflow: [`docs/examples/deploy-site-demo.yml`](examples/deploy-site-demo.yml) — copy it to `.github/workflows/`, then **Actions → Deploy site demo → Run workflow** (`workflow_dispatch` only; skips with a notice when the two secrets are not set).

## Management API & UI

- Web UI: in the file manager, select a folder → **Publish as site** (`POST /api/sites` with `source`, same semantics as MCP `publish_site`); **Sites** section (`#/sites`) — list/stats, zip deploy, SPA toggle, optional access password, optional custom hostname, delete. "Manage files" opens `sites/<slug>/`.
- MCP: `sites_list`, `sites_config`, `sites_delete` (same `/api/sites` handlers). `publish_site` copies a drive folder onto `sites/{slug}/` (overwrite same names; SPA config is kept).
- `GET /api/sites` — list sites (`?stats=1` adds cached object count / total size). Session (Basic) or API key.
- `POST /api/sites` — `{"slug":"blog","source":"my-folder"}` publishes a drive folder to `sites/{slug}/` (overwrite same names; SPA config kept; 404 if Sites switch is off); or `{"slug":"blog","spa":true}` toggles SPA fallback; or `{"slug":"blog","hostname":"blog.example.com"}` sets/clears a custom hostname (`null`/empty clears; site must already exist).
- `DELETE /api/sites?slug=blog` — remove all site files (config kept, so a redeploy keeps the SPA flag); add `&purge=1` to also delete the config.
- SPA fallback: on a final miss, `spa=true` serves `sites/<slug>/index.html` with 200; otherwise a custom `sites/<slug>/404.html` is served with status 404 when present.

## Custom hostname (per slug)

Optional: bind a hostname such as `blog.example.com` to one slug so the site is served at the **domain root** (`https://blog.example.com/`), not at `https://sites.<domain>/blog/`.

1. In **Sites** (`#/sites`), open the DNS / custom-domain control for the slug and set the hostname (or `POST /api/sites` with `{"slug":"blog","hostname":"blog.example.com"}`; `hostname: null` clears it).
2. DNS: create a **CNAME** for that hostname pointing at your Pages project hostname (e.g. `flaredrive-xxx.pages.dev` or the project’s Cloudflare target).
3. Cloudflare Dashboard → Pages → your project → **Custom domains** → add the **same** hostname so TLS terminates on this Worker/Pages deploy.
4. Wait for the domain to become Active, then open `https://blog.example.com/` (root). Path-based `SITES_HOST` URLs keep working.

Rules:

- One hostname → one slug (409 if already taken).
- Hostname must be a DNS name with at least one dot (`blog.example.com`); it cannot equal `SITES_HOST`.
- Do **not** use your drive/manager hostname — the custom-host middleware would shadow the app.
- Coexists with site access password: Host resolve → Basic Auth gate → content (same order as a future `_redirects` hook).
- `/api`, `/webdav`, `/mcp`, `/share`, and `/collect` on a custom hostname are not remapped to site files (reserved for the drive product).

## Site index and the trash

Publishing a public directory, album, docs site or nav page writes a generated `index.html` at the site root, and folder re-publishes clean up files the previous generated site owned. If the existing `index.html` was not written by Davflare (uploaded by hand, uploaded while a publish was in progress, or copied in from a folder), it is moved to the **trash** before being overwritten or cleaned up, so you can restore it from there. Generated pages are tagged and are replaced or deleted directly.

- **What is protected**: only the site-root `sites/{slug}/index.html`. Files in subfolders and other cleaned-up files are still deleted directly (sending each one to the trash would blow the free plan's per-request budget and flood the trash). A plain folder publish still overwrites site files with same-named files from the source folder, `index.html` included.
- **Old index from before the upgrade**: an index generated before this release carries no tag, so Davflare cannot tell it generated it; the first re-publish moves it to the trash once, as if it were hand-made. Every index written afterwards is tagged and won't be moved again. This is harmless; delete it from the trash if you don't need it.
- **Restore conflicts**: if the site root currently has a generated index, restoring `index.html` from the trash fails with `目标位置已存在：sites/{slug}/index.html` ("target already exists"; the server message is Chinese-only) and does not overwrite it. First do a plain publish from a folder without an `index.html` (which removes the generated index) or delete `sites/{slug}/index.html` in the drive, then restore.
- **Retention**: trash entries are kept for **30 days** by default, controlled by `TRASH_RETENTION_DAYS` (`-1` disables automatic purging). Expired entries are purged when the trash is opened (Pages Functions has no scheduled trigger).
- **Deleting a site skips the trash**: deleting a site from the sites list (including a full delete that also removes its config) deletes every object under `sites/{slug}/` directly; nothing goes to the trash.

## Caching

Site responses are `Cache-Control: public, no-cache` (`private, no-cache` behind a password): browsers and the edge revalidate every time and get a cheap `304` when nothing changed, so password, site-type and content changes apply on the next request. The serving rules (forced download, password) are part of the `ETag`, `Last-Modified` also covers the site's manifest (and the moment a generated site was switched back to a plain one), and html/svg/xml/js are sent with `CDN-Cache-Control: no-store`, so an old inline copy is never revalidated after a site switches to a docs site, public directory or album.

Two zone settings on the sites hostname can override this:

- **Browser Cache TTL** (Caching → Configuration) defaults to 4 hours on many zones and rewrites `no-cache` on css/images/fonts to `max-age=14400`, so visitors may not revalidate for hours (html/svg/xml/js carry `CDN-Cache-Control: no-store` and keep `no-cache`). Set it to **Respect Existing Headers**, or add a Cache Rule for the sites hostname that does the same.
- **Email Obfuscation** (Scrape Shield, on by default) strips `ETag` from HTML. Pages then revalidate with `Last-Modified` / `If-Modified-Since` instead, which still works; turn it off for the sites hostname if you prefer ETags.

## Security

- `SITES_HOST` must differ from the drive's own hostname (see the warning above): when they match, the sites middleware intercepts all GET/HEAD requests on that host.
- Different origin from the file manager: site JS cannot read drive credentials.
- All slugs share the sites origin (`sites.domain/a/` and `/b/`). Fine for one owner; do not host untrusted third-party HTML on the same sites host.
- Do not put API keys in the uploaded HTML.

## Image host UI

Upload images in the drive UI (`#/images`): drag/drop, copy the public URL or Markdown `![](url)`, list and delete. Blobs live at `_$flaredrive$/img/{id}` with an unguessable id (not the original filename). Public URL is only `https://<SITES_HOST>/i/{id}` (no scheme in `SITES_HOST`). SVG is served as a download (`Content-Disposition: attachment` + `nosniff`), never as a navigable document.

On the sites host, `/i/{id}` is matched **before** slug static sites. The image-host switch is independent of the sites switch: sites off + image host on → slugs 404 but `/i/{id}` works; image host off → `/i/*` 404 even if sites is on. If `SITES_HOST` is unset, the switch can still exist but the UI tells you to bind the host first.
