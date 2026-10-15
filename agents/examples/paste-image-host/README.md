# Paste screenshot → image host

Zero-install demo for Davflare's Markdown image host: paste a clipboard image in the web UI and get `https://<SITES_HOST>/i/{id}`.

Reuses existing `POST /api/images` — **no new API / MCP**.

## Where it works

| Place | Behavior |
| --- | --- |
| File manager (`#/` folder view) | Ctrl/Cmd+V image → upload to image host + toast copy URL; **also** queues the file into the current folder |
| Image host (`#/images`) | Ctrl/Cmd+V → upload + refresh list + toast copy URL |
| Settings → Image host clients (`#/settings`) | Ctrl/Cmd+V → same upload/toast (no folder enqueue) |

Clipboard **text** is unchanged: use toolbar **Quick paste** for Pastebin-style shares. Image paste never opens that dialog.

## 10-second checklist

1. Deploy with `SITES_HOST`, leave **Image host** on.
2. Log in at the drive UI.
3. Copy a screenshot (OS shortcut), focus the file manager (or `#/images` / Settings), press Ctrl/Cmd+V.
4. Toast shows success; click **Copy URL** (or use the auto-copied link) → `https://<SITES_HOST>/i/{id}`.

## curl equivalent

```bash
curl -X POST "https://<drive-origin>/api/images" \
  -H "Authorization: Bearer <apiKey>" \
  -H "X-File-Name: shot.png" \
  --data-binary @shot.png
```

More: [docs/sites.md](../../../docs/sites.md#markdown-image-host-in-10-minutes) · [image-host-export/](../image-host-export/).
