# WebDAV

[English](webdav.md) | [中文](webdav.zh-CN.md)

← [README](../README.zh-CN.md)

地址：`https://<your-domain.com>/webdav`

可用任意 WebDAV 客户端（例如 [Cx File Explorer](https://play.google.com/store/apps/details?id=com.cxinventor.file.explorer) 或 [BD File Manager](https://play.google.com/store/apps/details?id=com.liuzho.file.explorer)）。填入上述地址以及你设置的用户名和密码。

Cloudflare Workers 单次 PUT 上限为 **128 MB**。超限会返回 **HTTP 413**（提示使用网页上传）。大文件请走网页端分片上传。

应用内 WebDAV 面板会显示 URL、用户名，以及是否开启公开读取。**不会**显示密码。

## 用 rclone 挂载（可选）

1. `rclone config` → New remote → 类型 `webdav` → URL `https://<your-domain.com>/webdav` → vendor `other` → 用户名/密码 = Pages 里的 `WEBDAV_USERNAME` / `WEBDAV_PASSWORD`。
2. `#/settings` 里保持 WebDAV 开关打开。
3. `rclone ls davflare:`（远程名随你）应能列出网盘根目录。

部署与环境变量见 [deploy.zh-CN.md](./deploy.zh-CN.md)。

