# PDF 资料库 / 电子书架

把网盘里的 PDF（可选 EPUB）文件夹发布成 `SITES_HOST` 上的书架页。

复用现有 `POST /api/sites` 的 `bookshelf` 载荷，**不新增 API / MCP**。

## 你会得到

| 路径 | 用途 |
| --- | --- |
| `sites/{slug}/index.html` | 书架页：文件名、大小、浏览器打开 / 下载；有缩略图时显示封面 |
| `sites/{slug}/*.(pdf\|epub)` | 复制进去的资料（不是引用） |
| `sites/{slug}/covers/*.png` | 可选封面（来自网盘已有 `fd-thumbnail`） |

## 步骤

1. 把 PDF / EPUB 放进同一文件夹（只取当前层；子文件夹跳过）。
2. 网页端：选中该文件夹 → **发布为 PDF 资料库**（文件菜单 / 多选工具栏也有）。
3. 复制 `https://<SITES_HOST>/{slug}/`。

## 和其他站点类型的区别

| 类型 | 侧重点 |
| --- | --- |
| 软件下载页 | 安装包 + SHA-256 + README 更新说明 |
| 文档站 | Markdown → HTML |
| 相册 | 图片灯箱 |
| 播客 | RSS + 媒体 enclosure |
| 公开目录 | 通用文件列表 |
| 导航站 | 书签链接 |
| **PDF 资料库** | 教研 / 资料分享书架 — 打开阅读 + 可选封面 |

## 限制（v1）

- 只发布当前层的 `.pdf` / `.epub`。
- 最多 200 个文件 / 合计 512 MB。
- 封面仅在源文件已有缩略图摘要时复制，不新开 PDF 渲染服务。

## curl 形态发布（会话 / API Key）

```bash
curl -X POST "https://<drive>/api/sites" \
  -H "Authorization: Bearer <apiKey>" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "my-lib",
    "bookshelf": {
      "lang": "zh",
      "title": "我的资料",
      "files": ["docs/guide.pdf", "docs/novel.epub"]
    }
  }'
```

更多：[docs/sites.zh-CN.md](../../../docs/sites.zh-CN.md)。
