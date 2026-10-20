# 手机一键上传 — iOS 快捷指令 / Android HTTP Shortcuts

把手机里的照片或文件在约 30 秒内丢进免费 R2。

复用现有 **Open API** `POST /api/upload` 和/或 `POST /api/images`——**不新增接口 / MCP**。

设置页卡片：`#/settings` → **手机一键上传（iOS 快捷指令 / Android）**。

| 文件 | 用途 |
| --- | --- |
| [`davflare-android-upload.json`](./davflare-android-upload.json) | HTTP Shortcuts / Tasker 对照配方（网盘目录） |
| [`davflare-android-images.json`](./davflare-android-images.json) | 同上，但走 `POST /api/images`（公开 CDN） |
| [`upload.sh`](./upload.sh) | curl 一行封装（`$1` = 本地文件） |

把 `https://drive.example.com` 换成你的 Davflare **网盘**源站，把 `YOUR_API_KEY` 换成真实的 `fd_…`。**不要**把真密钥提交进仓库。

## 30 秒清单

1. 部署 Davflare，保持 **API Key** 开启，创建一把密钥（`fd_…`）。
2. 打开 `#/settings` → **手机一键上传**：
   - 填 **目标文件夹**（默认 `mobile/`）。
   - **iOS：** 复制步骤 → 自建一条快捷指令（分享表单 → 获取 URL 内容 → POST）。
   - **Android：** 复制/下载 recipe JSON，或把 curl 粘进 HTTP Shortcuts「从 cURL 导入」。
3. 相册分享 → 你的快捷指令 → 文件出现在目标文件夹（图床模式则拿到 `https://<SITES_HOST>/i/{id}`）。

## curl（Open API 上传）

```bash
curl -X POST "https://<drive-origin>/api/upload?path=mobile/" \
  -H "Authorization: Bearer <apiKey>" \
  -H "X-Api-Key: <apiKey>" \
  -H "X-File-Name: photo.jpg" \
  --data-binary @photo.jpg
```

也支持 multipart：`-F "file=@photo.jpg"`。

## curl（图床 CDN）

```bash
curl -X POST "https://<drive-origin>/api/images" \
  -H "Authorization: Bearer <apiKey>" \
  -H "X-File-Name: shot.png" \
  --data-binary @shot.png
# → { "url": "https://<SITES_HOST>/i/{id}", ... }
```

## 和已有能力的区别

| 能力 | 差异 |
| --- | --- |
| WebDAV 挂载 | 协议客户端 / 桌面同步，不是分享菜单 |
| PicGo / ShareX / Typora | 桌面 Markdown 图床导出 |
| 粘贴截图 | 浏览器内 Ctrl/Cmd+V → `/api/images` |
| 文件收集链接 | 匿名上传到固定文件夹；不用 API Key |

更多：[docs/API.zh-CN.md](../../../docs/API.zh-CN.md) · [image-host-export/](../image-host-export/) · [paste-image-host/](../paste-image-host/)。
