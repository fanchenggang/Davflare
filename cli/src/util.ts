import fs from "node:fs";
import path from "node:path";
import { LocalEntry } from "./sync.js";

export function humanSize(bytes: number): string {
  if (!Number.isFinite(bytes)) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}

/** 递归收集本地目录文件（相对路径 / 分隔）。skipNames 用于排除 .davflare-sync 之类的元数据。 */
export function walkLocal(root: string, skipNames: string[] = [".DS_Store", ".davflare-sync"]): LocalEntry[] {
  const entries: LocalEntry[] = [];
  const visit = (dir: string) => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skipNames.includes(item.name)) continue;
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        visit(full);
      } else if (item.isFile()) {
        const stat = fs.statSync(full);
        entries.push({
          path: path.relative(root, full).split(path.sep).join("/"),
          size: stat.size,
          mtimeMs: stat.mtimeMs,
        });
      }
    }
  };
  visit(root);
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return entries;
}

/** 进度条（stderr，管道友好）。 */
export function makeProgressBar(label: string) {
  const started = Date.now();
  return (done: number, total: number) => {
    const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 100;
    const elapsed = Math.max(1, (Date.now() - started) / 1000);
    const speed = humanSize(done / elapsed) + "/s";
    process.stderr.write(`\r${label} ${percent}%  ${humanSize(done)}/${humanSize(total)}  ${speed}   `);
    if (done >= total) process.stderr.write("\n");
  };
}

export function remoteKeyToLocal(root: string, key: string): string {
  return path.join(root, ...key.split("/"));
}

/** 确保本地文件的父目录存在。 */
export function ensureLocalDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}
