# WebDAV client compatibility

[English](webdav-clients.md) | [中文](webdav-clients.zh-CN.md)

← [WebDAV](webdav.md) · [README](../README.md)

Only rows we have **actually exercised** are marked pass/fail. Anything not run here is **待验证** (unverified) — we do not invent results.

Endpoint: `https://<your-domain>/webdav/` · Auth: Basic (`WEBDAV_USERNAME` / `WEBDAV_PASSWORD`) · Per-file limit: **&lt; 100MB**.

## Matrix (as of 2026-10-13)

| Client | Version / how tested | Result | What we ran |
| --- | --- | --- | --- |
| **rclone** | CLI **1.75.2**, `vendor=other` | ✅ Pass | Against local `wrangler pages dev`: `mkdir` / `copy` / `ls` / `cat` / `moveto` / `delete` / `purge`; Chinese file names; 1 MiB binary |
| **litmus** | Debian package **0.13** | ✅ Pass (`basic` `copymove` `props`) | CI job runs these three suites (100%). `locks` 39/41; `http` fails `expect100` (interim 100-continue) — see [Known litmus gaps](#known-litmus-gaps) |
| **Obsidian · Remotely Save** | Plugin **0.5.25** request sequence (local `webdav` client + README replay) | ✅ Pass | OPTIONS (CORS) → MKCOL → PUT (incl. Chinese / spaces) → PROPFIND Depth 1 & infinity → rename/delete; also documented in [README](../README.md#free-obsidian-sync-in-10-minutes) |
| **阅读 / Legado** | Android app; fix in [#175](https://github.com/fanchenggang/Davflare/pull/175) | ✅ Pass (author device) | Needs `d:`-prefixed DAV XML (`<d:multistatus xmlns:d="DAV:">`). Author verified backup/restore on device after merge. This environment has no Android GUI — we only re-checked the `d:` PROPFIND shape locally |
| **Cyberduck** | Desktop GUI | 待验证 | Not runnable in this headless box |
| **Zotero** (WebDAV sync) | Desktop | 待验证 | Needs GUI / Zotero account flow |
| **Joplin** (WebDAV sync) | Desktop / mobile | 待验证 | Needs GUI |
| **Cx File Explorer** / **BD File Manager** | Android | 待验证 | Mentioned as examples in [webdav.md](webdav.md); no device here |
| **WinSCP** / **Mountain Duck** / **macOS Finder** | Desktop | 待验证 | No GUI |

## litmus in CI

```bash
# local (needs litmus + Node + wrangler)
npm run test:litmus
# or reuse an existing build/
SKIP_BUILD=1 npm run test:litmus
```

Workflow: [`.github/workflows/litmus.yml`](../.github/workflows/litmus.yml) — installs `litmus`, builds the Pages app, starts `wrangler pages dev`, runs `TESTS="basic copymove props"`.

Badge on the README tracks that workflow.

### Known litmus gaps

| Suite | Result (local 0.13) | Notes |
| --- | --- | --- |
| `basic` | 16/16 | — |
| `copymove` | 13/13 | — |
| `props` | 30/30 | Dead properties / PROPPATCH |
| `locks` | 39/41 | Failures: `copy` of locked resource (423), `fail_complex_cond_put` (complex `If` → expected 412). Class 2 locking is otherwise usable |
| `http` | 3/4 | `expect100` times out — Pages/miniflare does not speak HTTP 100-continue the way litmus expects |

CI does **not** fail on `locks` / `http`; re-run locally with `TESTS="basic copymove props locks http" npm run test:litmus` if you change locking.

## rclone quick check

```bash
rclone config   # type webdav, URL …/webdav/, vendor other, user/pass = Pages env
rclone ls davflare:
rclone copy ./notes/ davflare:notes/
```

## Contributing results

If you verify a 待验证 client, open a PR that updates **both** language files with: client name, version, date (Asia/Shanghai), and the exact ops you ran (list / upload / download / rename / delete). Do not mark pass without that evidence.
