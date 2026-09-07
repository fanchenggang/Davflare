# Davflare

[English](README.md) | [中文](README.zh-CN.md)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/fanchenggang/Davflare)

Cloudflare R2 file manager on Pages + Workers — free 10 GB storage and 100,000 Worker invocations per day. [R2 pricing](https://developers.cloudflare.com/r2/platform/pricing/)

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
- API keys for scripted upload / download / sync, plus remote MCP at `/mcp` (21 tools)
- Static sites and image host on a separate hostname (`SITES_HOST`)
- Owner Settings with five persistent feature switches
- `davflare-cli`, optional Chrome MV3 extension, and agent layouts on R2
- Chinese / English UI

## Quick start

1. One-click deploy with the button above (needs a Cloudflare account with R2 activated and a payment method on file).
2. Bind your R2 bucket to `BUCKET`, set `WEBDAV_USERNAME` and `WEBDAV_PASSWORD`, then retry deploy.
3. Optional: `WEBDAV_PUBLIC_READ=1`, `TRASH_RETENTION_DAYS` (default `30`, `-1` disables), and for public sites/images bind `sites.<your-domain>` and set `SITES_HOST=sites.<your-domain>`.
4. Optional: add a custom domain for the drive UI.

Manual Pages / Wrangler steps and the five feature switches: [docs/deploy.md](docs/deploy.md).

## Documentation

| Topic | Link |
| --- | --- |
| Deploy, env vars, feature switches | [docs/deploy.md](docs/deploy.md) |
| WebDAV clients & limits | [docs/webdav.md](docs/webdav.md) |
| Open API & MCP (incl. chat share example) | [docs/API.md](docs/API.md) |
| Static sites & image host | [docs/sites.md](docs/sites.md) |
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
