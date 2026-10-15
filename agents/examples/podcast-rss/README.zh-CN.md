# 文件夹一键发播客 / RSS

把网盘里的音视频文件夹发布成 `SITES_HOST` 上的播客站。

复用现有 `POST /api/sites` 的 `podcast` 载荷，**不新增 API / MCP**。

## 会生成什么

| 路径 | 用途 |
| --- | --- |
| `sites/{slug}/feed.xml` | RSS 2.0；`<enclosure>` 直链 `https://<SITES_HOST>/{slug}/{文件}` |
| `sites/{slug}/index.html` | 简易列表 + HTML5 音视频播放 |
| `sites/{slug}/*.(mp3\|m4a\|mp4\|…)` | 媒体副本（不是原文件引用） |

## 步骤

1. 把节目放进同一个文件夹（只取当前层；子文件夹会跳过）。
2. 网页端：选中文件夹 → **发布为播客 / RSS**（文件菜单 / 多选工具栏也可）。
3. 复制 feed：`https://<SITES_HOST>/{slug}/feed.xml`。
4. 在播客客户端里添加订阅。

## 和其它站点类型的区别

| 类型 | 侧重点 |
| --- | --- |
| 相册 | 图片灯箱 |
| 文档站 | Markdown → HTML |
| 公开目录 | 文件下载列表 |
| 导航站 | 书签链接 |
| **播客** | RSS + 媒体 enclosure |

## curl 形状的发布（会话 / API Key）

```bash
curl -X POST "https://<drive>/api/sites" \
  -H "Authorization: Bearer <apiKey>" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "my-show",
    "podcast": {
      "lang": "zh",
      "title": "我的节目",
      "files": ["shows/ep1.mp3", "shows/ep2.mp3"]
    }
  }'
```

更多：[docs/sites.zh-CN.md](../../../docs/sites.zh-CN.md)。
