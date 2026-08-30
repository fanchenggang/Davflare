# davflare-cli

Davflare（Cloudflare R2 网盘）Open API 的命令行客户端。

## 安装

```bash
# 本地开发：在仓库根目录
npm install && npm run build && node cli/dist/index.js --help

# 发布后（npm publish 由维护者执行）
npm install -g davflare-cli
```

需要 Node.js ≥ 18。

## 登录

```bash
davflare login --server drive.example.com
# 输入用户名/密码后，自动创建名为 cli-<主机名>-<日期> 的专用 API 密钥，
# 保存到 ~/.config/davflare/config.json（0600）。

davflare logout   # 清除本地配置；服务端吊销需网页端确认
```

CI / 无交互场景用环境变量：

```bash
export DAVFLARE_SERVER=https://drive.example.com
export DAVFLARE_KEY=fd_xxx
```

## 命令

| 命令 | 说明 |
|---|---|
| `ls [-l] [--json] [path]` | 列目录（自动翻页） |
| `mkdir <path>` | 创建目录（父级自动创建） |
| `rm [-r] [--hard] <path...>` | 删除（默认进回收站，`--hard` 彻底删除） |
| `mv [--overwrite] <from> <to>` | 重命名/移动（目录整树） |
| `cp <src> <dst>` | 本地⇄远端复制：源是本地文件则上传（>100MB 自动分块），否则下载（支持 Range 断点续传） |
| `sync push\|pull [--dry-run] [--delete] [--backup-conflicts] <localDir> <remoteDir>` | 目录同步 |
| `login` / `logout` | 登录/登出 |

进度输出走 stderr，管道安全；`ls --json` 输出机器可读 JSON。

## 同步语义

- 比对规则：同路径 size 一致视为已同步（不比较 mtime）。
- `push`：本地新增/变更 → 上传；**local wins**，可用 `--backup-conflicts` 先把远端旧内容备份为 `name.conflict-<UTC>`。
- `pull`：远端新增/变更 → 下载；**remote wins**。
- `--delete`：额外删除目标端多出的文件（默认保留）。建议先 `--dry-run`。

## 测试

```bash
cd cli && npm install
npm test            # vitest：sync diff 引擎单测
# e2e（先启动 wrangler pages dev 或复用 npm run test:e2e 的服务）
BASE=http://127.0.0.1:8788 WEBDAV_USER=admin WEBDAV_PASS=xxx bash cli/e2e.sh
```

## 发布清单

1. 更新 `package.json` 版本号与 CHANGELOG（如有）。
2. `npm run build && npm test` 全绿。
3. `npm publish`（`prepublishOnly` 会自动再跑一遍构建与测试）。
