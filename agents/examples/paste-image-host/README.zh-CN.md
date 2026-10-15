# 粘贴截图上图床

零安装演示：在网页里粘贴剪贴板图片，拿到 `https://<SITES_HOST>/i/{id}`。

复用现有 `POST /api/images`，**不新增 API / MCP**。

## 在哪里粘贴

| 位置 | 行为 |
| --- | --- |
| 文件管理器（文件夹视图） | Ctrl/Cmd+V 图片 → 上传图床 + toast 复制链接；**同时**入队到当前目录 |
| 图床页（`#/images`） | Ctrl/Cmd+V → 上传 + 刷新列表 + toast 复制链接 |
| 设置 → 图床客户端（`#/settings`） | Ctrl/Cmd+V → 同上传/toast（不入队文件夹） |

剪贴板**文本**不变：顶栏 **文本快传** 仍做 Pastebin 式分享。粘贴图片不会打开该对话框。

## 十秒清单

1. 部署并配置 `SITES_HOST`，保持 **图床** 开启。
2. 登录网盘 UI。
3. 系统快捷键截图，焦点在文件管理器（或 `#/images` / 设置页），按 Ctrl/Cmd+V。
4. toast 成功；点 **复制链接**（或用已自动复制的地址）→ `https://<SITES_HOST>/i/{id}`。

## curl 等价

```bash
curl -X POST "https://<drive-origin>/api/images" \
  -H "Authorization: Bearer <apiKey>" \
  -H "X-File-Name: shot.png" \
  --data-binary @shot.png
```

更多：[docs/sites.zh-CN.md](../../../docs/sites.zh-CN.md#10-分钟把-r2-变成-markdown-图床) · [image-host-export/](../image-host-export/)。
