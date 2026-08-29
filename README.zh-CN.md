# Davflare

[English](README.md) | [中文](README.zh-CN.md)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/fanchenggang/FlareDrive)

基于 Cloudflare Pages + Workers 的 R2 网盘 —— 免费 10 GB 存储、每天 10 万次 Worker 调用。[R2 定价](https://developers.cloudflare.com/r2/platform/pricing/)

本项目最初 fork 自 [longern/FlareDrive](https://github.com/longern/FlareDrive)，现已全面重写。GitHub 仓库名目前仍为 **FlareDrive**，以便 Pages 与 CI 继续正常工作。

## 截图

文件浏览器（浅色主题）：

![File browser](docs/screenshots/browser.png)

预览 / 分享：

![Preview](docs/screenshots/preview.png)

## 功能

- 网页端分片上传大文件
- 文件夹、搜索、拖放，以及图片 / 视频 / PDF 缩略图
- 分享链接（限时或永久）、提取码、文件夹 zip 下载
- 回收站，由 `TRASH_RETENTION_DAYS` 控制（默认 30 天；`-1` 关闭；打开回收站时惰性清理最多 200 项）
- WebDAV Class 1/2，路径 `/webdav`
- API Key，可用于脚本上传、下载与双向同步
- 中 / 英界面（标题栏地球图标；默认跟随浏览器语言，并保存在本地）

## 部署

一键部署：

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/fanchenggang/FlareDrive)

你需要一个已绑定支付方式、并已开通 R2 的 [Cloudflare](https://dash.cloudflare.com/) 账号（至少创建一个 bucket）。

首次部署之后：

1. 将 R2 bucket 绑定到 `BUCKET` 变量
2. 设置 `WEBDAV_USERNAME` 和 `WEBDAV_PASSWORD`
3. 可选：`WEBDAV_PUBLIC_READ=1` 开启公开读取；`TRASH_RETENTION_DAYS`（默认 `30`，`-1` 关闭清理）
4. 重新部署，使绑定和环境变量生效
5. 可选：绑定自定义域名

### 手动部署 Cloudflare Pages

- 框架预设：**None（React CRA，不是 Docusaurus）**
- 输出目录：`build`
- 然后绑定 `BUCKET`、设置上述环境变量，并重新部署

### Wrangler CLI

`wrangler.toml` 将 R2 绑定为 `BUCKET`（默认 bucket 名为 `webdav`）。如有需要，把 `bucket_name` 改成你的 bucket。

```bash
npm run build
npx wrangler pages deploy build
```

## WebDAV

地址：`https://<your-domain.com>/webdav`

可用任意 WebDAV 客户端（例如 [Cx File Explorer](https://play.google.com/store/apps/details?id=com.cxinventor.file.explorer) 或 [BD File Manager](https://play.google.com/store/apps/details?id=com.liuzho.file.explorer)）。填入上述地址以及你设置的用户名和密码。

Cloudflare Workers 单次 PUT 上限为 **128 MB**。超限会返回 **HTTP 413**（提示使用网页上传）。大文件请走网页端分片上传。

应用内 WebDAV 面板会显示 URL、用户名，以及是否开启公开读取。**不会**显示密码。

## 开放接口

在网页端创建密钥：资源管理栏「API」，或账号菜单「开放接口」。完整密钥只展示一次，服务端仅保存 SHA-256 哈希。鉴权方式为 `Authorization: Bearer <apiKey>` 或 `X-Api-Key: <apiKey>`（不走网页会话）。通过已登录会话调用 `GET` / `POST` / `DELETE` `/api/keys` 管理密钥。API 设置页也有使用说明。

内部 `_$flaredrive$/` 路径会被拒绝。单次操作覆盖超过 1000 个对象会返回 **400**，需要分批处理。

### 上传

默认 `POST /api/upload` 遇到重名会自动改名（`name (2).ext`）。加上 `?overwrite=1`（或 `true`）则按相同路径 + 文件名覆盖写入。

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

# overwrite upload
curl -X POST "https://<your-domain.com>/api/upload?path=folder/&overwrite=1" \
  -H "Authorization: Bearer <apiKey>" \
  -F "file=@photo.jpg"
```

单次请求上传上限约 100 MB（超出返回 **HTTP 413**）。更大的文件请使用三步分片 API：

```bash
# 1) create
curl -X POST "https://<your-domain.com>/api/upload?uploads&path=folder/big.bin" \
  -H "Authorization: Bearer <apiKey>"
# → 201 { key, uploadId }

# 2) upload each part (≤100MB per request, partNumber 1..10000)
curl -X PUT "https://<your-domain.com>/api/upload?path=folder/big.bin&uploadId=<id>&partNumber=1" \
  -H "Authorization: Bearer <apiKey>" \
  --data-binary @part1.bin
# → 200 { partNumber, etag }

# 3) complete with the collected parts (order matters)
curl -X POST "https://<your-domain.com>/api/upload?path=folder/big.bin&uploadId=<id>" \
  -H "Authorization: Bearer <apiKey>" \
  -H "Content-Type: application/json" \
  -d '{"parts":[{"partNumber":1,"etag":"..."},{"partNumber":2,"etag":"..."}]}'

# abort an unfinished upload
curl -X DELETE "https://<your-domain.com>/api/upload?path=folder/big.bin&uploadId=<id>" \
  -H "Authorization: Bearer <apiKey>"
```

### 列出、下载、创建目录

同一把密钥可以列出文件夹并逐个下载文件（`/api/download` 不会把文件夹打成 zip；目录 zip 请走目录分享）。

```bash
# Depth-1 list (empty path = root). Does not recurse.
curl "https://<your-domain.com>/api/list?path=folder/" \
  -H "Authorization: Bearer <apiKey>"

# download each item where isDir is false
curl -L "https://<your-domain.com>/api/download?path=folder/notes.txt" \
  -H "Authorization: Bearer <apiKey>" \
  -o notes.txt

# also accepts X-Api-Key
curl -L "https://<your-domain.com>/api/download?path=folder/notes.txt" \
  -H "X-Api-Key: <apiKey>" \
  -o notes.txt
```

`GET /api/list` 只返回当前文件夹的 `{ items: [{ key, name, size, isDir, uploaded, etag }] }`。文件始终包含数值 `size`、ISO `uploaded`（以及别名 `updated`）和 R2 `etag`。前缀分隔出来的文件夹为 `isDir: true`、`size: 0`、`uploaded: null`（未知；不会伪造 mtime）。嵌套目录：再用该项的 `key` 调用一次 `/api/list`。若 `path` 指向文件，列表接口返回 **400** 并提示改用 `/api/download`。目录不存在：**404**。密钥无效或过期：**401**。大目录可加 `limit=1..1000`（以及上一页返回的 `cursor`）做分页 —— 还有下一页时响应会带 `nextCursor`。

`GET /api/download` 的 `path` 是对象 key。**HTTP 200** 会流式返回文件（`Content-Type` 来自 R2，否则为 `application/octet-stream`，`Content-Disposition: attachment`）。`path` 缺失/为空，或指向目录/前缀文件夹，返回 **400**；对象不存在 **404**；密钥无效或过期 **401**。内部 `_$flaredrive$/` 路径会被拒绝。

脚本创建文件夹（父目录会自动创建）：

```bash
# JSON body or ?path= both work. 201 created / 200 already exists / 409 same-name file
curl -X POST "https://<your-domain.com>/api/mkdir" \
  -H "Authorization: Bearer <apiKey>" \
  -H "Content-Type: application/json" \
  -d '{"path":"folder/sub"}'
```

### 备份、重命名、删除

```bash
# conflict backup: rename remote to name.conflict-YYYYMMDDTHHMMSS.ext (UTC)
curl -X POST "https://<your-domain.com>/api/backup?path=folder/notes.txt" \
  -H "Authorization: Bearer <apiKey>"

# rename (409 if `to` exists unless overwrite=1; directories move recursively, no overwrite)
curl -X POST "https://<your-domain.com>/api/rename" \
  -H "Authorization: Bearer <apiKey>" \
  -H "Content-Type: application/json" \
  -d '{"from":"folder/old.txt","to":"folder/new.txt"}'

# delete a file only
curl -X DELETE "https://<your-domain.com>/api/delete?path=folder/notes.txt" \
  -H "Authorization: Bearer <apiKey>"

# soft delete (goes to the recycle bin, restorable; works for directories too)
curl -X DELETE "https://<your-domain.com>/api/delete?path=folder/notes.txt&soft=1" \
  -H "Authorization: Bearer <apiKey>"

# delete a whole directory recursively (≤1000 objects per call)
curl -X DELETE "https://<your-domain.com>/api/delete?path=folder/sub" \
  -H "Authorization: Bearer <apiKey>"
```

`/api/rename` 和 `/api/delete` 也支持目录 —— 重命名会移动整棵子树，删除会递归移除（默认硬删除，除非带 `soft=1`）。对目录调用 `/api/backup` 会把整棵子树重命名为 `name.conflict-<UTCstamp>`。单次操作覆盖超过 1000 个对象会返回 **400**，需要分批处理。

### 分享

`POST /api/shares` 也接受文件夹 key —— 打开分享链接会把整棵子树以 zip 流式下载（提取码和过期时间照常生效）。

### 双向同步示例

以本地为准；冲突时先备份远端。鉴权与上传相同（Bearer / `X-Api-Key`），不走网页会话。WebDAV 协议不变。

1. 用 `GET /api/list` 列出，比较本地 mtime/size/etag 与远端 `uploaded` / `size` / `etag`。
2. 仅本地新增/变更 → `POST /api/upload?overwrite=1`。
3. 仅远端新增/变更 → `GET /api/download`。
4. 两边都变 → `POST /api/backup?path=remoteKey`，再把本地内容覆盖上传到原文件名。
5. 可选的本地删除：`DELETE /api/delete`（除非客户端维护同步库，否则跳过）。远端多出来的文件：下载下来。

## 开发与测试

```bash
npm install

npm run typecheck   # tsc --noEmit (covers src/ and functions/)
npm test            # Jest unit tests (interactive watch)
npm run test:ci     # Jest unit tests, single CI-friendly run
npm run build       # production build into build/

npm run test:e2e    # one-shot API regression: build → wrangler pages dev (local miniflare R2) → scripts/api-e2e.sh
SKIP_BUILD=1 npm run test:e2e   # reuse an existing build/ for faster iterations
```

`test:e2e` 会在缺少时创建本地 `.dev.vars`（已 gitignore）写入开发凭据，在 8788 端口启动 `wrangler pages dev`（可用 `PORT` 覆盖），等待就绪后跑约 79 条断言，再关掉服务。数据在 `.wrangler/state/` —— 删除该目录即可重置本地 bucket。完整验证记录见 [TESTING.md](./TESTING.md)，手工 GUI 用例库见 [TEST_CASES.md](./TEST_CASES.md)。

## 致谢

- [longern/FlareDrive](https://github.com/longern/FlareDrive) by [longern](https://github.com/longern) —— 最初的 fork 来源；本项目此后已全面重写。内部对象前缀仍为 `_$flaredrive$/`。
- [r2-webdav](https://github.com/abersheeran/r2-webdav) by [abersheeran](https://github.com/abersheeran) —— WebDAV 实现。

## 许可证

[MIT](./LICENSE)
