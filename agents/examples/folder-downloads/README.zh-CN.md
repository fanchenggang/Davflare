# 软件下载页（「R2 上的 Releases」）

把网盘里的安装包 / 压缩包文件夹发布成 `SITES_HOST` 上的下载站。

复用现有 `POST /api/sites` 的 `downloads` 载荷，**不新增 API / MCP**。

## 你会得到

| 路径 | 用途 |
| --- | --- |
| `sites/{slug}/index.html` | 下载页：文件名、大小、SHA-256；可选 README 更新说明 |
| `sites/{slug}/*.(zip\|exe\|dmg\|…)` | 复制进去的安装包（不是引用） |

## 步骤

1. 把安装包放进同一文件夹（只取当前层；子文件夹跳过）。可选放 `README.md` 当更新说明。
2. 网页端：选中该文件夹 → **发布为软件下载页**（文件菜单 / 多选工具栏也有）。
3. 复制 `https://<SITES_HOST>/{slug}/`。

## 和其他站点类型的区别

| 类型 | 侧重点 |
| --- | --- |
| 公开目录 | 文件下载列表（无 SHA-256 / README 更新说明） |
| 相册 | 图片灯箱 |
| 文档站 | Markdown → HTML |
| 播客 | RSS + 媒体 enclosure |
| 导航站 | 书签链接 |
| **软件下载页** | R2 上的 Releases — 校验和 + 可选 README |

## 限制（v1）

- 只发布当前层；`README.md` 渲染进页面，不作为下载项。
- 最多 100 个文件 / 合计 256 MB（发布时计算 SHA-256）。

## curl 形态发布（会话 / API Key）

```bash
curl -X POST "https://<drive>/api/sites" \
  -H "Authorization: Bearer <apiKey>" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "my-app",
    "downloads": {
      "lang": "zh",
      "title": "我的应用",
      "files": ["releases/app.zip", "releases/Setup.exe"],
      "readmeKey": "releases/README.md"
    }
  }'
```

更多：[docs/sites.zh-CN.md](../../../docs/sites.zh-CN.md)。
