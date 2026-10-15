# Podcast / RSS from a media folder

Publish a drive folder of audio/video files as a podcast site on `SITES_HOST`.

Reuses existing `POST /api/sites` with a `podcast` payload — **no new API / MCP**.

## What you get

| Path | Purpose |
| --- | --- |
| `sites/{slug}/feed.xml` | RSS 2.0; `<enclosure>` points at `https://<SITES_HOST>/{slug}/{file}` |
| `sites/{slug}/index.html` | Simple list + HTML5 audio/video players |
| `sites/{slug}/*.(mp3\|m4a\|mp4\|…)` | Copied media (not live references) |

## Steps

1. Put episodes in one folder (top level only; subfolders are skipped).
2. In the web UI: select the folder → **Publish as podcast / RSS** (also on the file action sheet / multi-select toolbar).
3. Copy the feed URL: `https://<SITES_HOST>/{slug}/feed.xml`.
4. Subscribe in a podcast client.

## Unlike other site kinds

| Kind | Focus |
| --- | --- |
| Album | Photo lightbox |
| Docs | Markdown → HTML |
| Public directory | File download list |
| Nav | Bookmark links |
| **Podcast** | RSS + media enclosures |

## curl-shaped publish (session / API key)

```bash
curl -X POST "https://<drive>/api/sites" \
  -H "Authorization: Bearer <apiKey>" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "my-show",
    "podcast": {
      "lang": "en",
      "title": "My Show",
      "files": ["shows/ep1.mp3", "shows/ep2.mp3"]
    }
  }'
```

More: [docs/sites.md](../../../docs/sites.md).
