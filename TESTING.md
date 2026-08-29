# FlareDrive 回归测试清单

> 最近一轮：2026-08-29 第五批（A9 i18n 中英双语 + scripts/api-e2e.sh 回归套件沉淀）
> 前几轮：第四批（多选拖拽/面包屑下拉/图标扩展）、第三批（目录分享/回收站清理/搜索高亮/动效 11 项）、第二批（目录级 API 等）、首批（暗色模式等）
> 前几轮：第三批（目录分享/回收站清理/搜索高亮/动效等 11 项）、第二批（目录级 API 等）、首批（暗色模式等）
> 约束：所有测试数据操作仅在自己创建的目录内进行，测试后清理。

## 0a-5. 第五批新增与新验证（2026-08-29）

| 项 | 内容 | 验证 |
|----|------|------|
| 测试沉淀 | `scripts/api-e2e.sh`：开放 API + WebDAV 的 48 项断言回归套件（参数化 BASE/凭据，自建前缀 + 自动清理），补入 backup 用独立文件的顺序修正 | ✅ 本地 48/48 全过（可重复执行） |
| A9 i18n（第一阶段） | 双语字典 + Proxy strings（现有 `strings.xxx` 用法零改动生效）+ `translate(key, params)` 参数化模板 + localStorage/navigator.language 检测 + Header 语言切换按钮（中文/English）+ App 根订阅语言切换触发整树重渲染；核心界面文案收编（登录/页头/工具栏/统计胶囊/上传队列状态与按钮/删除确认/通知 toast/预览过大/空状态） | ✅ GUI：切英文全界面生效（截图）、`flaredrive.lang` 持久化、刷新保持、回切中文正常 |

说明：i18n 第二阶段（TrashView/SharesView/WebDavPanel/ApiKeysPanel/TextPadDrawer 等专业面板的剩余硬编码 + 英文润色）待后续；未迁移文案在英文界面下仍显示中文原文，不影响功能。

## 0a-4. 第四批新增与新验证（2026-08-29）

| 项 | 内容 | 验证 |
|----|------|------|
| B8 | 多选拖拽整组移动：多选后拖动任一选中项 = 整组剪切到目标文件夹（dataTransfer 载荷为 JSON 数组，兼容旧单键格式；目标自身/子项自动过滤） | ✅ GUI：Ctrl+Click 选 2 项 → 合成 dragstart 载荷为整组 → drop 后 PROPFIND 目标目录两项都在 |
| B7 | 面包屑同级下拉：路径栏新增 ▾ 按钮，列出父目录下全部子文件夹（当前项高亮），点击跳转 | ✅ GUI：根下一层与深层目录均正确列出同级；点击 target-dir 成功跳转。验证中修复：单层目录 parentPath 误算为 "/" 导致 PROPFIND 404 |
| C4 | 缩略图 hover 微缩放（scale 1.06，reduced-motion 禁用） | ✅ 构建渲染无回归（CSS 动效） |
| C8 | 文件图标扩展：演示文稿（ppt/pptx/key/odp 橙红）、电子书（epub/mobi/azw3 绿）、字体（ttf/otf/woff 紫） | ✅ GUI：三类文件图标与配色正确 |

## 0a. 第三批新增与新验证（2026-08-29）

| 项 | 内容 | 验证 |
|----|------|------|
| A6 | 目录分享：分享链接访问时打包整树 zip 流（条目相对分享目录），提取码/过期/撤销沿用 | ✅ curl：isDir 字段、提取码表单 200/错误 403/正确 200、zip 树与内容逐字节一致、文件分享回归无损；GUI：目录右键菜单出现「分享」→ 创建成功 |
| A7 | 回收站惰性过期清理：`TRASH_RETENTION_DAYS`（默认 30，0=全部过期，-1=关闭），打开回收站时清理，每批 ≤200 | ✅ curl：0 天配置下软删项下次打开即清空；默认 30 天下软删项正常可见 |
| A8 | 搜索命中高亮（文件名拆分渲染，主色加粗，React 文本转义防 XSS） | ✅ GUI：搜「demo」三个文件名命中片段橙色高亮 |
| B6 | 网格卡片 hover/focus 快捷操作条（下载/分享/删除；触屏隐藏） | ✅ GUI：hover 显示 opacity=1 + 三按钮，分享按钮直达对话框 |
| B9 | 预览增强：图片旋转 90°（按钮累计）、视频倍速循环（1/1.5/2/0.5） | ✅ GUI：transform rotate(180deg) 两次生效；倍速按钮渲染（视频流播放本地无素材验证 UI） |
| B10 | 日期相对化：24h 内「刚刚/N 分钟前」，更早回退日期，tooltip 绝对时间 | ✅ GUI：新上传显示「刚刚」 |
| C2 | 空状态分层浮动画风（暖橙圆底+倾斜卡片+悬浮图标卡+圆点，亮暗自适应，reduced-motion 禁用） | ✅ GUI：空目录截图核验 |
| C3 | 网格/列表项进入动效（stagger ≤24 项，prefers-reduced-motion 禁用） | ✅ 构建与渲染无回归 |
| C5 | 顶栏滚动阴影（内容滚动 >8px 出现，回顶消失） | ✅ GUI：滚动前 none → 滚动后阴影 |
| C6 | 移动端底部导航：文件页高亮、点按图标弹跳（reduced-motion 禁用）、上传 tab 环形总进度 | ✅ 构建通过；动效为 CSS 侧，逻辑 props 接线完成 |
| C9 | 透明图片棋盘格衬底（亮暗双色格） | ✅ GUI：透明 PNG 预览棋盘格清晰可见 |

本轮无新增缺陷修复；目录分享曾发现两处缺口并在验证中当场修复：① zip 条目使用全 key 路径 → 加 stripPrefix 相对化；② 目录右键菜单缺「分享」项（filesOnly 遗留）→ 放开。

## 0. 本轮（第二批）新增与新验证

### 新落地功能
| 项 | 内容 | 验证 |
|----|------|------|
| A1 | 开放接口目录级 rename（递归移动）/ delete（递归删除）/ backup（整树改名 `.conflict-<戳>`），上限 1000 对象 | ✅ curl：目录改名子项跟随、删目录后 404、子路径改名 400、目录 backup 名正确 |
| A2 | `DELETE /api/delete?soft=1` 软删除（文件+目录，进回收站可还原） | ✅ curl：trashId 返回、回收站可见、restore 后内容一致 |
| A4 | `GET /api/list?limit=&cursor=` 分页 | ✅ curl：5 条 limit=2 三页取尽无重复；limit=0/1001 拒绝 |
| A5 | 开放接口分块上传 `?uploads` → PUT part → complete / abort | ✅ curl：5MiB+小块拼装逐字节一致、abort 后 complete 400、partNumber=0 拒绝。注意 R2 限制：除末块外每块 ≥5MiB（错误信息透传） |
| A3 | 文件夹计数真实化（惰性并发补数 + sessionStorage 缓存） | ✅ GUI：bulk 105 项 / empty-dir 0 项 / 子目录甲 2 项 |
| B1 | 键盘增强：F2 支持目录、Home/End、Shift+Click 范围选、Ctrl/Cmd+Click 选、修饰键点击不触发打开 | ✅ GUI：End 聚焦末项、F2 弹目录重命名（预填 bulk）|
| B2 | 删除可撤销（toast「撤销」7 秒） | ✅ GUI：删除→撤销→文件原位恢复 |
| B3 | 上传队列：速度/ETA 显示、全部暂停/继续、失败自动重试 1 次 | ✅ 按钮/文案渲染；持续速率本地瞬时完成无法观察（环境受限，见未覆盖） |
| B4 | 全盘搜索触底自动加载 + 「已全部加载」 | ✅ GUI：181→滚动→223 条+已全部加载 |
| B5 | 错误 Snackbar 带重试（列目录/重命名/粘贴） | ✅ 基建接入；断网场景未本地模拟 |
| C1 | 代码预览语法高亮（json/clike/hash 注释族，≤1MB） | ✅ GUI：js 关键字紫/字符串绿/注释灰/数字橙，暗色配色独立；JSON 格式化+高亮 |
| C7 | 对比度审计 + z-index 收敛 | ✅ 7 项文本 token 对比度 4.79–15.72:1 全过 WCAG AA；z-index 常量化 |

### 本轮发现并修复的真实缺陷
1. **预览重开 412**（严重，历史遗留）：浏览器第二次 GET 同一文件带 `If-None-Match` 缓存再验证，WebDAV GET 把它透传给 R2 `onlyIf` 得到 412「打开文件失败」。修复：`protocol.ts` 对 If-None-Match 命中返回 **304**（curl 验证 304/200 双路径）。
2. **全盘搜索丢结果**（严重，历史遗留）：凑满 limit 立即截断，同页剩余命中被丢弃且桶 ≤1000 对象时无 cursor 可翻页（实测 102 命中只返回 100 且 hasMore=false）。修复：固定 100/页步长扫完当前页再截断。
3. **复选框聚焦吞键盘**：isTypingTarget 把 checkbox 当文本输入，Delete/方向键失效。修复：checkbox/radio/button 不再视为输入目标。
4. **Snackbar action 不渲染**：MUI Snackbar 有 children（Alert）时 action prop 不生效，改挂 Alert 的 action prop。

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
- **上传速率/ETA 与传输中「全部暂停」的实际效果**：本地 miniflare 吞吐即时（6MB 瞬间完成），按钮渲染与状态机已验证，持续传输表现需真实网络环境观察。
- B5 重试按钮的断网触发：需网络故障注入，本地未模拟（代码路径已接入列目录/重命名/粘贴三处）。
- 分享过期（410）与 `WEBDAV_PUBLIC_READ=1` 分支：需要时间/配置切换，未跑。
- 视频倍速对真实视频流的播放效果：本地无视频素材，按钮与 playbackRate 设置逻辑已接。
- IAB 嵌入环境的 IntersectionObserver / requestAnimationFrame 不触发回调（原生自检确认），B4 已加 scroll 捕获兜底；普通浏览器主路径仍为 IO。
- cua 合成按键在部分焦点状态下不可达（checkbox 聚焦时），改用合成 KeyboardEvent 验证；真实键盘事件走 window 监听不受影响。

## 4. 已知问题 / 后续建议

- `functions/api/upload.ts` 仍内联复制 `_apikey.ts` 的鉴权逻辑（历史债务），建议后续统一引用。
- 大目录（数千项）无虚拟滚动，PROPFIND 全量渲染可能卡顿；搜索结果 200+ 条渲染已可感知变慢。
- IMPROVEMENT_PLAN 全部功能项已落地（A6-A9、B1-B10、C1-C9，A9 i18n 第二阶段为文案收编扫尾）。
- 弱验证项：B5 断网重试、视频倍速真实流、上传速率真实网络表现（见第 3 节）。
- 历史债务：upload.ts 鉴权内联去重、大目录虚拟滚动。
- `npm test`（CRA Jest）当前无任何测试用例，API 断言脚本可迁移为自动化套件。
