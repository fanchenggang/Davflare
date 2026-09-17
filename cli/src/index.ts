#!/usr/bin/env node
/** davflare-cli — Davflare Open API 命令行客户端 */
import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import os from "node:os";
import crypto from "node:crypto";

import { ApiError, DavflareClient } from "./client.js";
import {
  ConfigError,
  clearConfig,
  loadConfig,
  normalizeServer,
  saveConfig,
} from "./config.js";
import { conflictBackupKeys, planSync, SyncDirection } from "./sync.js";
import { ensureLocalDir, humanSize, makeProgressBar, remoteKeyToLocal, walkLocal } from "./util.js";

const program = new Command();
program.name("davflare").description("Davflare (Cloudflare R2 drive) 命令行客户端").version("0.1.0");

function client(): DavflareClient {
  const config = loadConfig();
  return new DavflareClient(config.server, config.key);
}

function fail(error: unknown): never {
  if (error instanceof ConfigError || error instanceof ApiError) {
    console.error(`错误: ${error.message}`);
  } else {
    console.error(`错误: ${(error as Error)?.message ?? error}`);
  }
  process.exit(1);
}

program
  .command("login")
  .description("登录并在本机创建专用 API 密钥（存 ~/.config/davflare/config.json）")
  .option("--server <url>", "服务地址（默认 https://<你的域名>）")
  .action(async (options: { server?: string }) => {
    try {
      const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
      const server = normalizeServer(options.server ?? (await rl.question("服务地址 (如 drive.example.com): ")));
      const username = await rl.question("用户名: ");
      const password = await rl.question("密码: ");
      rl.close();
      const probe = new DavflareClient(server, "none");
      const keyName = `cli-${os.hostname()}-${new Date().toISOString().slice(0, 10)}`;
      const created = await probe.createKeyWithSession(username, password, keyName);
      saveConfig({ server, key: created.key, keyId: created.id, keyName });
      console.error(`已登录 ${server}（密钥 ${keyName} 已保存，权限等同完整 Open API）`);
    } catch (error) {
      fail(error);
    }
  });

program
  .command("logout")
  .description("吊销本机密钥并清除本地配置（尽力而为：吊销需要会话权限）")
  .action(async () => {
    try {
      const config = loadConfig();
      const removed = clearConfig();
      console.error(removed ? "已清除本地配置。" : "本地没有已保存的配置。");
      if (config.keyId) {
        try {
          await new DavflareClient(config.server, config.key).revokeKey(config.keyId);
          console.error("服务端密钥已吊销。");
        } catch {
          console.error("服务端吊销失败（密钥管理需会话权限），请到网页端「API 密钥」手动作废。");
        }
      }
    } catch (error) {
      fail(error);
    }
  });

program
  .command("ls")
  .description("列出目录（Depth-1）")
  .option("-l, --long", "显示大小与时间")
  .option("--json", "输出原始 JSON")
  .argument("[path]", "远端目录", "")
  .action(async (folder: string, options: { long?: boolean; json?: boolean }) => {
    try {
      const api = client();
      const prefix = folder ? `${folder.replace(/\/+$/, "")}/` : "";
      const items = [];
      let cursor: string | undefined;
      do {
        const page = await api.listPage(prefix, cursor);
        items.push(...page.items);
        cursor = page.nextCursor || undefined;
      } while (cursor);
      if (options.json) {
        console.log(JSON.stringify(items, null, 2));
        return;
      }
      for (const item of items) {
        const name = item.isDir ? `${item.name}/` : item.name;
        if (options.long) {
          console.log(`${item.isDir ? "d" : "-"}  ${humanSize(item.size).padStart(10)}  ${item.uploaded ?? ""}  ${name}`);
        } else {
          console.log(name);
        }
      }
    } catch (error) {
      fail(error);
    }
  });

program
  .command("mkdir")
  .description("创建目录（父级自动创建）")
  .argument("<path>")
  .action(async (folder: string) => {
    try {
      await client().mkdir(folder.replace(/\/+$/, ""));
      console.error(`已创建 ${folder}`);
    } catch (error) {
      fail(error);
    }
  });

program
  .command("rm")
  .description("删除文件或目录（默认进回收站；--hard 彻底删除）")
  .option("-r, --recursive", "允许删除目录")
  .option("--hard", "彻底删除（不进回收站）")
  .argument("<paths...>")
  .action(async (paths: string[], options: { recursive?: boolean; hard?: boolean }) => {
    try {
      const api = client();
      for (const target of paths) {
        const isDir = target.endsWith("/");
        if (isDir && !options.recursive) {
          console.error(`跳过 ${target}（目录需要 -r）`);
          continue;
        }
        await api.remove(target.replace(/\/+$/, isDir ? "/" : ""), options.hard === true);
        console.error(`已删除 ${target}${options.hard ? "（彻底）" : "（进回收站）"}`);
      }
    } catch (error) {
      fail(error);
    }
  });

program
  .command("mv")
  .description("重命名/移动（目录整树移动）")
  .option("--overwrite", "目标存在时覆盖")
  .argument("<from>")
  .argument("<to>")
  .action(async (from: string, to: string, options: { overwrite?: boolean }) => {
    try {
      await client().move(from.replace(/\/+$/, ""), to.replace(/\/+$/, ""), options.overwrite === true);
      console.error(`已移动 ${from} → ${to}`);
    } catch (error) {
      fail(error);
    }
  });

program
  .command("cp")
  .description("本地 ⇄ 远端复制：源在本地存在则上传，否则视为远端键下载到目标")
  .option("--overwrite", "远端已存在时覆盖（上传默认覆盖）")
  .argument("<source>")
  .argument("<destination>")
  .action(async (source: string, destination: string, options: { overwrite?: boolean }) => {
    try {
      const api = client();
      if (fs.existsSync(source) && fs.statSync(source).isFile()) {
        // 上传：目标以 / 结尾时保留本地文件名
        const remoteKey = destination.endsWith("/")
          ? `${destination}${path.basename(source)}`
          : destination;
        const progress = makeProgressBar(`上传 ${path.basename(source)}`);
        await api.uploadFile(source, remoteKey, progress);
        console.error(`已上传 → ${remoteKey}`);
      } else {
        // 下载：目标是本地路径（目录则保留远端文件名）
        const localPath = fs.existsSync(destination) && fs.statSync(destination).isDirectory()
          ? path.join(destination, path.basename(source))
          : destination;
        ensureLocalDir(localPath);
        const progress = makeProgressBar(`下载 ${path.basename(source)}`);
        const resumed = await api.downloadFile(source, localPath, progress);
        console.error(`已下载 → ${localPath}${resumed ? "（断点续传）" : ""}`);
      }
    } catch (error) {
      fail(error);
    }
  });

program
  .command("sync")
  .description("目录双向同步：push=本地→远端；pull=远端→本地")
  .option("--dry-run", "只显示计划，不执行")
  .option("--delete", "删除目标端多出的文件（默认保留）")
  .option("--backup-conflicts", "push 时远端内容先备份为 name.conflict-<UTC> 再覆盖")
  .argument("<direction>", "push 或 pull")
  .argument("<localDir>", "本地目录")
  .argument("<remoteDir>", "远端目录")
  .action(async (direction: string, localDir: string, remoteDir: string, options: { dryRun?: boolean; delete?: boolean; backupConflicts?: boolean }) => {
    try {
      if (direction !== "push" && direction !== "pull") {
        throw new Error("direction 必须是 push 或 pull");
      }
      const dir = direction as SyncDirection;
      const root = path.resolve(localDir);
      fs.mkdirSync(root, { recursive: true });
      const remoteBase = remoteDir.replace(/\/+$/, "");
      const api = client();

      const local = walkLocal(root);
      const remote: Array<{ path: string; size: number; uploadedMs: number }> = [];
      for await (const entry of api.walk(remoteBase)) {
        remote.push({
          // remoteBase 为空（同步根目录）时 key 即相对路径，不能 slice(1)；
          // 非空时 key 以 `${remoteBase}/` 开头，剥掉该前缀得到相对路径。
          path:
            remoteBase && entry.key.startsWith(`${remoteBase}/`)
              ? entry.key.slice(remoteBase.length + 1)
              : entry.key,
          size: entry.size,
          uploadedMs: entry.uploaded ? Date.parse(entry.uploaded) : 0,
        });
      }
      const plan = planSync(dir, local, remote);

      console.error(
        `同步计划 (${dir})：传输 ${plan.transfer.length}，更新 ${plan.changed.length}，目标端多出 ${plan.deleteCandidates.length}，一致 ${plan.upToDate.length}`
      );
      for (const p of plan.transfer) console.error(`  传输  ${p}`);
      for (const p of plan.deleteCandidates) console.error(`  可清理(${dir === "push" ? "远端" : "本地"}) ${p}`);
      if (options.dryRun) return;

      if (dir === "push") {
        if (options.backupConflicts) {
          for (const key of conflictBackupKeys(dir, plan)) {
            try {
              await api.backup(`${remoteBase}/${key}`);
              console.error(`  冲突备份 ${key}`);
            } catch {
              // 远端不存在该键（新文件）时忽略
            }
          }
        }
        for (const rel of plan.transfer) {
          const localPath = path.join(root, rel);
          const progress = makeProgressBar(`上传 ${rel}`);
          await api.uploadFile(localPath, `${remoteBase}/${rel}`, progress);
        }
        if (options.delete) {
          for (const rel of plan.deleteCandidates) {
            await api.remove(`${remoteBase}/${rel}`);
            console.error(`  已删除远端 ${rel}`);
          }
        }
      } else {
        for (const rel of plan.transfer) {
          const localPath = remoteKeyToLocal(root, rel);
          ensureLocalDir(localPath);
          const progress = makeProgressBar(`下载 ${rel}`);
          await api.downloadFile(`${remoteBase}/${rel}`, localPath, progress);
        }
        if (options.delete) {
          for (const rel of plan.deleteCandidates) {
            fs.rmSync(path.join(root, rel));
            console.error(`  已删除本地 ${rel}`);
          }
        }
      }
      console.error("同步完成。");
    } catch (error) {
      fail(error);
    }
  });


const SITE_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

function assertSiteSlug(slug: string): string {
  const normalized = slug.trim().toLowerCase();
  if (!SITE_SLUG_RE.test(normalized)) {
    throw new Error("slug 须匹配 [a-z0-9][a-z0-9-]{0,62}");
  }
  return normalized;
}

function sitePublicUrl(sitesHost: string | null | undefined, slug: string): string | null {
  if (!sitesHost) return null;
  return `https://${sitesHost.replace(/\/$/, "")}/${slug}/`;
}

const sitesCmd = program.command("sites").description("管理静态站点（list / publish / delete，走 /api/sites）");

sitesCmd
  .command("list")
  .description("列出已发布站点")
  .option("--stats", "显示文件数与总大小")
  .option("--json", "输出原始 JSON")
  .action(async (options: { stats?: boolean; json?: boolean }) => {
    try {
      const api = client();
      const data = await api.listSites(options.stats === true);
      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }
      if (data.sitesHost) {
        console.error(`sitesHost: ${data.sitesHost}`);
      } else {
        console.error("sitesHost: （未配置 SITES_HOST）");
      }
      if (data.sites.length === 0) {
        console.log("(无站点)");
        return;
      }
      for (const site of data.sites) {
        const url = sitePublicUrl(data.sitesHost, site.slug);
        const spa = site.spa ? " spa" : "";
        let stats = "";
        if (site.stats) {
          const trunc = site.stats.truncated ? "+" : "";
          stats = `  ${site.stats.objects}${trunc} files  ${humanSize(site.stats.size)}`;
        }
        console.log(`${site.slug}${spa}${stats}${url ? `  ${url}` : ""}`);
      }
    } catch (error) {
      fail(error);
    }
  });

sitesCmd
  .command("publish")
  .description("发布本地目录到 sites/{slug}/（先上传暂存，再走 /api/sites，语义同 MCP publish_site）")
  .argument("<localDir>", "本地目录")
  .requiredOption("--slug <slug>", "站点 slug（[a-z0-9][a-z0-9-]{0,62}）")
  .action(async (localDir: string, options: { slug: string }) => {
    const stagingPrefix = `.davflare-publish/${crypto.randomUUID()}`;
    try {
      const slug = assertSiteSlug(options.slug);
      const root = path.resolve(localDir);
      if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
        throw new Error(`${localDir} 不是本地目录`);
      }
      const files = walkLocal(root);
      if (files.length === 0) {
        throw new Error("本地目录没有可发布的文件");
      }
      const api = client();
      console.error(`上传 ${files.length} 个文件到暂存 ${stagingPrefix}/ …`);
      for (const entry of files) {
        const localPath = path.join(root, ...entry.path.split("/"));
        const progress = makeProgressBar(`上传 ${entry.path}`);
        await api.uploadFile(localPath, `${stagingPrefix}/${entry.path}`, progress);
      }
      console.error(`发布到 sites/${slug}/ …`);
      const result = await api.publishSite(stagingPrefix, slug);
      try {
        await api.remove(`${stagingPrefix}/`, true);
      } catch {
        console.error(`警告: 暂存目录 ${stagingPrefix}/ 清理失败，可稍后手动删除`);
      }
      const url = sitePublicUrl(result.sitesHost, result.slug);
      console.error(`已发布 ${result.copied} 个文件 → sites/${result.slug}/`);
      if (url) console.log(url);
      else console.error("未配置 SITES_HOST，公开地址不可用");
    } catch (error) {
      try {
        await client().remove(`${stagingPrefix}/`, true);
      } catch {
        // best-effort cleanup
      }
      fail(error);
    }
  });

sitesCmd
  .command("delete")
  .description("删除站点文件（默认保留 SPA 等配置；--purge 连配置一起删）")
  .argument("<slug>", "站点 slug")
  .option("--purge", "连配置一起删除")
  .action(async (slugArg: string, options: { purge?: boolean }) => {
    try {
      const slug = assertSiteSlug(slugArg);
      const result = await client().deleteSite(slug, options.purge === true);
      console.error(
        `已删除站点 ${result.slug}（${result.deleted} 个对象）${options.purge ? "（含配置）" : ""}`
      );
    } catch (error) {
      fail(error);
    }
  });


program.parseAsync(process.argv).catch((error) => {
  console.error(`错误: ${(error as Error)?.message ?? error}`);
  process.exit(1);
});
