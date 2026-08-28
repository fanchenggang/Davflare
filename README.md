# FlareDrive

Cloudflare R2 storage manager with Pages and Workers. Free 10 GB storage.
Free serverless backend with a limit of 100,000 invocation requests per day.
[More about pricing](https://developers.cloudflare.com/r2/platform/pricing/)

## Features

- Chunked web uploads for large files
- Create folders
- Search files
- Image/video/PDF thumbnails
- WebDAV Class 1/2
- Drag and drop upload
- Share links with expiry and trash
- API keys for scripted uploads, downloads, and bidirectional sync

## Usage

### Installation

Before starting, you should make sure that

- you have created a [Cloudflare](https://dash.cloudflare.com/) account
- your payment method is added
- R2 service is activated and at least one bucket is created

Steps:

1. Fork this project and connect your fork with Cloudflare Pages
   - Use `None (React CRA, not Docusaurus)` framework preset
   - Output directory is build
   - Set `WEBDAV_USERNAME` and `WEBDAV_PASSWORD`
   - (Optional) Set `WEBDAV_PUBLIC_READ` to `1` to enable public read
2. After initial deployment, bind your R2 bucket to `BUCKET` variable
3. Retry deployment in `Deployments` page to apply the changes
4. (Optional) Add a custom domain

You can also deploy this project using Wrangler CLI:

```bash
npm run build
npx wrangler pages deploy build
```

### WebDAV endpoint

You can use any client (such as [Cx File Explorer](https://play.google.com/store/apps/details?id=com.cxinventor.file.explorer), [BD File Manager](https://play.google.com/store/apps/details?id=com.liuzho.file.explorer))
that supports the WebDAV protocol to access your files.
Fill the endpoint URL as `https://<your-domain.com>/webdav` and use the username and password you set.

However, the standard WebDAV protocol does not support large file (≥128MB) uploads due to the limitation of Cloudflare Workers.
You must upload large files through the web interface which supports chunked uploads.
The in-app WebDAV panel shows URL, username, and whether public-read is on. It does not display the secret. Oversized single PUTs return HTTP 413 with a Chinese message to use the web uploader.

### API upload

Create keys in the web UI: ExplorerBar 「API」 or account menu 「开放接口」. Full keys are shown once; only SHA-256 hashes are stored.

```bash
# multipart
curl -X POST "https://<your-domain.com>/api/upload?path=folder/" \
  -H "Authorization: Bearer <apiKey>" \
  -F "file=@photo.jpg"

# also accepts X-Api-Key, or a raw body with X-File-Name
curl -X POST "https://<your-domain.com>/api/upload?path=docs/" \
  -H "X-Api-Key: <apiKey>" \
  -H "X-File-Name: notes.txt" \
  --data-binary @notes.txt
```

Single-request uploads are limited to about 100MB (HTTP 413 otherwise). Larger files still need the web chunked uploader. Manage keys via session-authenticated `GET/POST/DELETE /api/keys`. Usage docs are also shown on the API settings page.

The same keys can list a folder and download each file (folders are not a zip):

```bash
# Depth-1 list (empty path = root). Does not recurse.
curl "https://<your-domain.com>/api/list?path=folder/" \
  -H "Authorization: Bearer <apiKey>"

# download each item where isDir is false
curl -L "https://<your-domain.com>/api/download?path=DBX/sync/snapshot.json" \
  -H "Authorization: Bearer <apiKey>" \
  -o snapshot.json

# also accepts X-Api-Key
curl -L "https://<your-domain.com>/api/download?path=DBX/sync/snapshot.json" \
  -H "X-Api-Key: <apiKey>" \
  -o snapshot.json
```

`GET /api/list` returns `{ items: [{ key, name, size, isDir, uploaded, etag }] }` for the current folder only. Files always include numeric `size`, ISO `uploaded` (and alias `updated`), and R2 `etag`. Delimited-prefix folders have `isDir: true`, `size: 0`, and `uploaded: null` (unknown; no fake mtime). Nested folders: call `/api/list` again with that item's `key`. If `path` is a file, the list API returns 400 and tells you to use `/api/download`. Missing folder: 404. Bad/expired key: 401.

`GET /api/download` `path` is the object key. HTTP 200 streams the file (`Content-Type` from R2 or `application/octet-stream`, `Content-Disposition: attachment`). Missing/empty path or a directory/prefix folder returns 400; unknown object 404; bad/expired key 401. Internal `_$flaredrive$/` keys are rejected.

Default `POST /api/upload` still uniqueNames collisions (`name (2).ext`). Add `?overwrite=1` (or `true`) to PUT/replace the same path+filename.

```bash
# overwrite upload
curl -X POST "https://<your-domain.com>/api/upload?path=folder/&overwrite=1" \
  -H "Authorization: Bearer <apiKey>" \
  -F "file=@photo.jpg"

# conflict backup: rename remote to name.conflict-YYYYMMDDTHHMMSS.ext (UTC)
curl -X POST "https://<your-domain.com>/api/backup?path=folder/notes.txt" \
  -H "Authorization: Bearer <apiKey>"

# rename (409 if `to` exists unless overwrite=1)
curl -X POST "https://<your-domain.com>/api/rename" \
  -H "Authorization: Bearer <apiKey>" \
  -H "Content-Type: application/json" \
  -d '{"from":"folder/old.txt","to":"folder/new.txt"}'

# delete a file only
curl -X DELETE "https://<your-domain.com>/api/delete?path=folder/notes.txt" \
  -H "Authorization: Bearer <apiKey>"
```

Bidirectional sync recipe (local wins; backup remote on conflict): list with `GET /api/list` and compare local mtime/size/etag vs remote `uploaded`/`size`/`etag`. Local-only new/changed → `POST /api/upload?overwrite=1`. Remote-only new/changed → `GET /api/download`. Both changed → `POST /api/backup?path=remoteKey` then overwrite-upload local bytes to the original name. Optional local deletes: `DELETE /api/delete` (skip unless the client tracks a sync db). Extra remote-only files: download them. Same Bearer / `X-Api-Key` auth as upload; no web session. WebDAV protocol is unchanged.

## Acknowledgments

WebDAV related code is based on [r2-webdav](
  https://github.com/abersheeran/r2-webdav
) project by [abersheeran](
  https://github.com/abersheeran
).
