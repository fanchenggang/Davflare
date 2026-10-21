# PDF library / ebook bookshelf

Publish a folder of PDFs (optional EPUBs) as a bookshelf page on `SITES_HOST`.

Reuses existing `POST /api/sites` with a `bookshelf` payload — **no new API / MCP**.

## What you get

| Path | Purpose |
| --- | --- |
| `sites/{slug}/index.html` | Bookshelf: name, size, open-in-browser / download; cover when a thumbnail exists |
| `sites/{slug}/*.(pdf\|epub)` | Copied assets (not references) |
| `sites/{slug}/covers/*.png` | Optional covers from existing `fd-thumbnail` digests |

## Steps

1. Put PDFs / EPUBs in one folder (top level only; subfolders skipped).
2. In the file manager: select the folder → **Publish as PDF library**.
3. Copy `https://<SITES_HOST>/{slug}/`.

## How it differs

| Kind | Focus |
| --- | --- |
| Download page | Installers + SHA-256 + README notes |
| Docs site | Markdown → HTML |
| Album | Image lightbox |
| Podcast | RSS + media enclosures |
| Public directory | Generic file list |
| Nav site | Bookmark links |
| **PDF library** | Teaching / research bookshelf — open to read + optional covers |

## Limits (v1)

- Top-level `.pdf` / `.epub` only.
- Up to 200 files / 512 MB total.
- Covers only when the source already has a thumbnail digest — no new PDF renderer.

## curl (session / API key)

```bash
curl -X POST "https://<drive>/api/sites" \
  -H "Authorization: Bearer <apiKey>" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "my-lib",
    "bookshelf": {
      "lang": "en",
      "title": "My library",
      "files": ["docs/guide.pdf", "docs/novel.epub"]
    }
  }'
```

More: [docs/sites.md](../../../docs/sites.md).
