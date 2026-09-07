# WebDAV

[English](webdav.md) | [中文](webdav.zh-CN.md)

← [README](../README.md)

Endpoint: `https://<your-domain.com>/webdav`

Use any WebDAV client (for example [Cx File Explorer](https://play.google.com/store/apps/details?id=com.cxinventor.file.explorer) or [BD File Manager](https://play.google.com/store/apps/details?id=com.liuzho.file.explorer)). Fill in the endpoint plus the username and password you set.

Cloudflare Workers limit a single PUT to **128 MB**. Oversized PUTs return **HTTP 413** (Chinese message: use the web uploader). Upload large files through the web UI, which supports chunked uploads.

The in-app WebDAV panel shows URL, username, and whether public-read is on. It does **not** display the password.

## Mount with rclone (optional)

1. In rclone: `rclone config` → New remote → type `webdav` → URL `https://<your-domain.com>/webdav` → vendor `other` → user/pass = your Pages `WEBDAV_USERNAME` / `WEBDAV_PASSWORD`.
2. Leave the WebDAV switch on in `#/settings`.
3. `rclone ls davflare:` (or whatever you named the remote) should list the drive root.

Deploy / env vars: [deploy.md](./deploy.md).

