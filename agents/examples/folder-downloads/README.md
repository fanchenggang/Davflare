# Software download page (“Releases on R2”)

Publish a drive folder of installers / archives as a download site on `SITES_HOST`.

Reuses existing `POST /api/sites` with a `downloads` payload — **no new API / MCP**.

## What you get

| Path | Purpose |
| --- | --- |
| `sites/{slug}/index.html` | Download page: filename, size, SHA-256; optional README notes |
| `sites/{slug}/*.(zip\|exe\|dmg\|…)` | Copied assets (not live references) |

## Steps

1. Put installers in one folder (top level only; subfolders are skipped). Optional: add `README.md` as release notes.
2. In the web UI: select the folder → **Publish as download page** (also on the file action sheet / multi-select toolbar).
3. Copy `https://<SITES_HOST>/{slug}/`.

## Unlike other site kinds

| Kind | Focus |
| --- | --- |
| Public directory | File download list (no SHA-256 / README notes) |
| Album | Photo lightbox |
| Docs | Markdown → HTML site |
| Podcast | RSS + media enclosures |
| Nav | Bookmark links |
| **Downloads** | Releases on R2 — checksums + optional README |

## Limits (v1)

- Top-level files only; `README.md` is rendered, not listed as an asset.
- Up to 100 files / 256 MB total (SHA-256 is computed while publishing).

## curl-shaped publish (session / API key)

```bash
curl -X POST "https://<drive>/api/sites" \
  -H "Authorization: Bearer <apiKey>" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "my-app",
    "downloads": {
      "lang": "en",
      "title": "My App",
      "files": ["releases/app.zip", "releases/Setup.exe"],
      "readmeKey": "releases/README.md"
    }
  }'
```

More: [docs/sites.md](../../../docs/sites.md).
