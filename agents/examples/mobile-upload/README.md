# Phone upload — iOS Shortcuts / Android HTTP Shortcuts

Drop a photo or file from your phone into free R2 in ~30 seconds.

Reuses existing **Open API** `POST /api/upload` and/or `POST /api/images` — **no new API / MCP**.

Settings card: `#/settings` → **Phone upload (iOS Shortcuts / Android)**.

| File | Use |
| --- | --- |
| [`davflare-android-upload.json`](./davflare-android-upload.json) | Documented recipe for HTTP Shortcuts / Tasker (drive folder) |
| [`davflare-android-images.json`](./davflare-android-images.json) | Same, but `POST /api/images` (public CDN URL) |
| [`upload.sh`](./upload.sh) | curl one-liner wrapper (`$1` = local file) |

Replace `https://drive.example.com` with your Davflare **drive** origin and `YOUR_API_KEY` with a real `fd_…` key. **Never** commit a live key.

## 30-second checklist

1. Deploy Davflare, leave **API Key** on, create a key (`fd_…`).
2. Open `#/settings` → **Phone upload**:
   - Set **Target folder** (default `mobile/`).
   - **iOS:** copy the steps → build one Shortcut (Share Sheet → Get Contents of URL → POST).
   - **Android:** copy/download the recipe JSON, or paste the curl into HTTP Shortcuts **Import from cURL**.
3. Share a photo from the gallery → your shortcut → file appears under the target folder (or get `https://<SITES_HOST>/i/{id}` in image-host mode).

## curl (Open API upload)

```bash
curl -X POST "https://<drive-origin>/api/upload?path=mobile/" \
  -H "Authorization: Bearer <apiKey>" \
  -H "X-Api-Key: <apiKey>" \
  -H "X-File-Name: photo.jpg" \
  --data-binary @photo.jpg
```

Multipart also works: `-F "file=@photo.jpg"`.

## curl (image host CDN)

```bash
curl -X POST "https://<drive-origin>/api/images" \
  -H "Authorization: Bearer <apiKey>" \
  -H "X-File-Name: shot.png" \
  --data-binary @shot.png
# → { "url": "https://<SITES_HOST>/i/{id}", ... }
```

## Distinct from

| Feature | Difference |
| --- | --- |
| WebDAV mount | Protocol client / desktop sync, not Share Sheet |
| PicGo / ShareX / Typora | Desktop Markdown image host exporters |
| Paste screenshot | In-browser Ctrl/Cmd+V → `/api/images` |
| File request (collect) links | Anonymous upload into one folder; no API key |

More: [docs/API.md](../../../docs/API.md) · [image-host-export/](../image-host-export/) · [paste-image-host/](../paste-image-host/).
