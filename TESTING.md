# FlareDrive 回归测试清单

> 最近一轮：2026-08-29（本地 wrangler pages dev + 浏览器 GUI 黑盒回归，全部通过）
> 约束：所有测试数据操作仅在自己创建的目录内进行（本轮为 `fd-e2e-20260829/`），测试后清理。

## 1. 本地环境搭建

```bash
npm install

# 根目录创建 .dev.vars（已被 .gitignore 忽略，本地凭证不入库）
echo 'WEBDAV_USERNAME=admin' >> .dev.vars
echo 'WEBDAV_PASSWORD=你的密码' >> .dev.vars

npm run build                      # CRA 构建到 build/
npx wrangler pages dev build       # http://localhost:8788，前端 + functions + 本地模拟 R2
```

- 本地 R2 数据落在 `.wrangler/state/`（miniflare 模拟，无需真实 Cloudflare 凭证；删除该目录即全部重置）。
- API 测试可先经 UI（「API」面板）创建密钥，或用 Basic 认证调 `POST /api/keys`。
- 建议把所有测试数据放在一个自建前缀目录下（如 `fd-e2e-<日期>/`），测完 WebDAV `DELETE` 整目录 + 清空回收站 + 作废密钥。

## 2. 回归矩阵（2026-08-29 结果）

### 浏览器 GUI（Chrome / IAB，1280×720 与 390×720）

| # | 用例 | 结果 | 备注 |
|---|------|------|------|
| 1 | 登录：错误密码拒绝 / 正确密码进入 | ✅ | 错误提示「用户名或密码错误」 |
| 2 | 新建文件夹 + toast + 统计更新 | ✅ | |
| 3 | 目录导航：进入 / 面包屑 / 返回上级 | ✅ | 搜索范围随目录自动切换 |
| 4 | 记事本创建文本文件并上传 | ✅ | 上传队列 toast + 列表刷新 |
| 5 | 拖拽上传（合成 DataTransfer drop） | ✅ | 触发上传管线与缩略图生成 |
| 6 | 缩略图显示（私有模式，Basic 认证） | ✅ | **本轮修复**：AuthThumbnail 经 authFetch 取 blob |
| 7 | 暗色模式：切换 + 刷新持久化 | ✅ | **本轮新增**：浅色/深色/跟随系统 |
| 8 | 键盘导航：方向键移动焦点 | ✅ | **本轮新增**：焦点描边 + scrollIntoView |
| 9 | 键盘：Space 选中 / Ctrl+A 全选 | ✅ | 多选工具栏联动 |
| 10 | 键盘：F2 重命名 / Enter 打开 / Delete 软删 | ✅ | Delete 弹「移入回收站」确认框 |
| 11 | 键盘：Esc 清除选择与焦点 | ✅ | |
| 12 | 预览：文本（行号/分页）/ 图片 / 左右切换 | ✅ | 「70.2 KB · 1/2」指示 |
| 13 | 重命名（对话框）| ✅ | |
| 14 | 剪切 → 进入子目录 → 粘贴移动 | ✅ | 工具栏出现「粘贴 1 项」 |
| 15 | 软删除 → 回收站 → 恢复 | ✅ | 恢复后原路径出现 |
| 16 | 类型筛选（图片）| ✅ | |
| 17 | 网格/列表视图切换 | ✅ | 列表粘性表头、文件夹计数「1 项」 |
| 18 | 排序：名称升降序（目录恒优先）| ✅ | |
| 19 | 搜索：当前文件夹过滤 / 全盘搜索 | ✅ | 子目录文件在当前目录范围不出现，全盘可搜到 |
| 20 | 分享：创建（提取码）/ 错误码拒绝 / 正确码展示 / 撤销 | ✅ | `/share/<token>` 独立页 |
| 21 | API 面板：GUI 创建密钥（明文仅显示一次）/ 调用说明 | ✅ | 说明已含 `/api/mkdir` |
| 22 | 移动端 390px：底部导航 / 两列网格 / 顶栏收缩 | ✅ | |
| 23 | 浅色模式视觉回归（改动后）| ✅ | 与深色双模式截图核验 |

### 开放 API（curl，密钥鉴权）

| # | 用例 | 结果 |
|---|------|------|
| A1 | `POST /api/upload`（multipart 与 X-File-Name 原始体）| ✅ 201 |
| A2 | `GET /api/list`（size/uploaded/etag、目录优先）| ✅ 200 |
| A3 | `GET /api/download`（内容一致、中文不乱码）| ✅ 200 |
| A4 | `POST /api/rename`（成功 / to 冲突 409 / 不存在 404）| ✅ |
| A5 | `DELETE /api/delete`（成功 / 目录拒绝）| ✅ |
| A6 | `POST /api/backup`（conflict 时间戳改名）| ✅ |
| A7 | **`POST /api/mkdir`（本轮新增）**：创建 201 / 幂等 200 / 父级自动补建 / 同名文件 409 / 内部前缀 400 / `..` 穿越拒绝 / 无密钥 401 | ✅ |
| A8 | `GET /api/search`（子串匹配）| ✅ |

### WebDAV（curl，Basic 鉴权）

| # | 用例 | 结果 |
|---|------|------|
| W1 | PROPFIND Depth 1（207）/ 错误密码 401 | ✅ |
| W2 | MKCOL 201 / PUT 201 / GET 200 / MOVE 201 / DELETE 204 | ✅ |

## 3. 本轮未覆盖项

- 文件选择器与系统拖拽上传的 GUI 路径（IAB 自动化不支持 file chooser）；已用合成 drop 事件与记事本路径覆盖上传管线，API 上传另行 curl 验证。
- >100MB 分块（multipart）上传：本地生成大文件成本高，未跑；该路径代码未变，风险低。
- 分享过期（410）与 `WEBDAV_PUBLIC_READ=1` 分支：需要时间/配置切换，未跑。
- 剪贴板粘贴图片上传（GUI 粘贴事件不可合成系统剪贴板文件）；代码未变。

## 4. 已知问题 / 后续建议

- 根目录曾有死代码副本（`Main.tsx`、`TextPadDrawer.tsx`、`utils/s3.ts`），本轮已删除。
- `functions/api/upload.ts` 内联复制了 `_apikey.ts` 的鉴权逻辑，存在漂移风险，建议后续统一引用。
- 文件夹计数仅统计当前目录，网格里其他文件夹显示占位文案「文件夹」。
- 大目录（数千项）无虚拟滚动，PROPFIND 全量渲染可能卡顿。
- `npm test`（CRA Jest）当前无任何测试用例，可作为后续沉淀方向（Playwright E2E）。
