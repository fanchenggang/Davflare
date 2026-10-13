# picgo-plugin-davflare

[PicGo](https://github.com/Molunerfinn/PicGo) / [PicList](https://github.com/Kuingsmile/PicList) uploader for [Davflare](https://github.com/fanchenggang/Davflare).

Uploads via existing `POST /api/images` (API Key auth). Public URL is `https://<SITES_HOST>/i/{id}` from the JSON response. **No new Davflare APIs.**

中文说明：[README.zh-CN.md](./README.zh-CN.md)

## Prerequisites

1. Davflare deployed with **API Key** and **Image host** switches on, and `SITES_HOST` bound.
2. An API key created in the web UI (`fd_…`).
3. PicGo ≥ 2.3 / PicGo-Core ≥ 1.5, or PicList.

## Install

### From npm (after publish)

```bash
picgo install picgo-plugin-davflare
# or in PicGo GUI: Plugin → search picgo-plugin-davflare
```

### Local (from this repo, before / without npm)

```bash
# PicGo CLI
picgo install "$(pwd)/picgo-plugin-davflare"

# or link for development
cd picgo-plugin-davflare && npm link
picgo use davflare
```

PicGo GUI: **Plugin settings → Import local plugin** → select this folder.

## Configure

| Field | Meaning | Example |
| --- | --- | --- |
| Site URL | Davflare **drive** origin (not `SITES_HOST`) | `https://drive.example.com` |
| API Key | Bearer / `X-Api-Key` value | `fd_…` |

Then set the current uploader to **Davflare**.

## Publish to npm (maintainers only)

This package ships in the Davflare monorepo. **Do not publish from CI bots** — the repo owner publishes when ready:

```bash
cd picgo-plugin-davflare
# bump version in package.json if needed
npm login
npm publish --access public
```

After publish, users can `picgo install picgo-plugin-davflare`.

## How it works

1. `POST https://<drive>/api/images` with multipart field `file` (or raw body + `X-File-Name`).
2. Headers: `Authorization: Bearer <key>` and `X-Api-Key: <key>`.
3. Response JSON `{ url, markdown, id, … }` — plugin sets `imgUrl` to `url`.

See [docs/sites.md](../docs/sites.md) and Davflare Settings → **Image host clients**.

## License

MIT
