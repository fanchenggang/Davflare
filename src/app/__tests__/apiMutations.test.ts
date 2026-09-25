/**
 * functions/api/mkdir + delete + copy + rename + backup 分支级直测：
 * 参数校验（缺参/内部前缀/../坏 JSON）、目录 marker 语义（实体/虚拟）、
 * 覆盖冲突 409、目录整体移动/删除/备份、软删除进回收站。
 */
import { afterEach, vi } from "vitest";
import { onRequestPost as mkdirOnPost } from "../../../functions/api/mkdir";
import { onRequestDelete as deleteOnDelete } from "../../../functions/api/delete";
import { onRequestPost as copyOnPost } from "../../../functions/api/copy";
import { onRequestPost as renameOnPost } from "../../../functions/api/rename";
import { onRequestPost as backupOnPost } from "../../../functions/api/backup";
import { InMemoryBucket, makeContext } from "../testInMemoryBucket";

const HOST = "http://drive.example.com";
const API_KEY = "fd_test_key_1234567890";
const KEYS_PREFIX = "_$flaredrive$/apikeys/";
const TRASH_PREFIX = "_$flaredrive$/trash/";

// backup 的 conflict 文件名含秒级时间戳，冻结时钟让断言确定
beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-06-01T12:00:00.000Z") });
});
afterEach(() => {
  vi.useRealTimers();
});

const BACKUP_STAMP = "20260601T120000";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function makeEnv(bucket: InMemoryBucket, extra: Record<string, unknown> = {}) {
  return { BUCKET: bucket.asBucket(), ...extra };
}

async function seedApiKey(bucket: InMemoryBucket) {
  bucket.seed([
    {
      key: `${KEYS_PREFIX}testrecord.json`,
      body: JSON.stringify({
        id: "testrecord",
        name: "test",
        prefix: "fd_",
        keyHash: await sha256Hex(API_KEY),
        createdAt: "2026-01-01T00:00:00.000Z",
        expiresAt: null,
      }),
      contentType: "application/json",
    },
  ]);
}

async function call(
  handler: PagesFunction<any>,
  bucket: InMemoryBucket,
  path: string,
  body?: Record<string, unknown> | string,
  headers: Record<string, string> = {}
): Promise<Response> {
  const isRaw = typeof body === "string" || body === undefined;
  const request = new Request(`${HOST}${path}`, {
    method: "POST",
    headers: {
      "X-Api-Key": API_KEY,
      ...(isRaw ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: isRaw ? (body as string | undefined) : JSON.stringify(body),
  });
  return handler(makeContext(request, makeEnv(bucket)));
}

async function del(bucket: InMemoryBucket, path: string): Promise<Response> {
  const request = new Request(`${HOST}${path}`, {
    method: "DELETE",
    headers: { "X-Api-Key": API_KEY },
  });
  return deleteOnDelete(makeContext(request, makeEnv(bucket)));
}

async function jsonOf(response: Response): Promise<any> {
  expect(response.headers.get("Content-Type")).toContain("application/json");
  return response.json();
}

describe("mkdir", () => {
  test("JSON body 创建目录：201 + x-directory marker，嵌套父级补齐", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    const response = await call(mkdirOnPost, bucket, "/api/mkdir", { path: "a/b/newdir" });
    expect(response.status).toBe(201);
    expect(await jsonOf(response)).toEqual({ key: "a/b/newdir", created: true });
    const marker = await bucket.asBucket().head("a/b/newdir");
    expect(marker?.httpMetadata?.contentType).toBe("application/x-directory");
    expect(marker?.customMetadata?.resourcetype).toBe("<collection />");
    expect(await bucket.asBucket().head("a")).not.toBeNull();
    expect(await bucket.asBucket().head("a/b")).not.toBeNull();
  });

  test("X-File-Path 头与 query 参数也能指定路径", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    const viaHeader = await call(
      mkdirOnPost,
      bucket,
      "/api/mkdir",
      undefined,
      { "X-File-Path": "by-header" }
    );
    expect(viaHeader.status).toBe(201);

    const viaQuery = await call(mkdirOnPost, bucket, "/api/mkdir?path=by-query");
    expect(viaQuery.status).toBe(201);
    expect(bucket.has("by-header")).toBe(true);
    expect(bucket.has("by-query")).toBe(true);
  });

  test("已存在目录 → created:false existed:directory（200）", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seedDir("docs");
    const response = await call(mkdirOnPost, bucket, "/api/mkdir", { path: "docs" });
    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toEqual({ key: "docs", created: false, existed: "directory" });
  });

  test("同名文件是 409", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seed([{ key: "plain.txt", body: "P" }]);
    const response = await call(mkdirOnPost, bucket, "/api/mkdir", { path: "plain.txt" });
    expect(response.status).toBe(409);
    expect(await response.text()).toContain("同名文件");
  });

  test("前缀虚拟目录 → existed:prefix", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seed([{ key: "vdir/inner.txt", body: "I" }]);
    const response = await call(mkdirOnPost, bucket, "/api/mkdir", { path: "vdir" });
    expect(await jsonOf(response)).toEqual({ key: "vdir", created: false, existed: "prefix" });
  });

  test("缺少 path / 内部前缀 / 坏 JSON 都是 400", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    const missing = await call(mkdirOnPost, bucket, "/api/mkdir");
    expect(missing.status).toBe(400);
    expect(await missing.text()).toBe("缺少 path 参数");

    const internal = await call(mkdirOnPost, bucket, "/api/mkdir", { path: "_$flaredrive$" });
    expect(internal.status).toBe(400);

    const badJson = await call(mkdirOnPost, bucket, "/api/mkdir", "{nope", {
      "Content-Type": "application/json",
    });
    expect(badJson.status).toBe(400);
  });
});

describe("delete", () => {
  test("硬删文件：对象移除", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seed([{ key: "a.txt", body: "A" }]);
    const response = await del(bucket, "/api/delete?path=a.txt");
    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toEqual({ key: "a.txt", deleted: true });
    expect(bucket.has("a.txt")).toBe(false);
  });

  test("硬删目录（含 marker）：后代与 marker 一并移除", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seedDir("docs");
    bucket.seed([{ key: "docs/a.txt", body: "A" }, { key: "docs/sub/b.txt", body: "B" }]);
    const response = await del(bucket, "/api/delete?path=docs");
    const body = await jsonOf(response);
    expect(body.deleted).toBe(true);
    expect(body.kind).toBe("directory");
    expect(bucket.has("docs")).toBe(false);
    expect(bucket.has("docs/a.txt")).toBe(false);
    expect(bucket.has("docs/sub/b.txt")).toBe(false);
  });

  test("硬删虚拟目录：无 marker 也按前缀删除", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seed([{ key: "vdir/inner.txt", body: "I" }]);
    const response = await del(bucket, "/api/delete?path=vdir");
    const body = await jsonOf(response);
    expect(body.kind).toBe("directory");
    expect(bucket.has("vdir/inner.txt")).toBe(false);
  });

  test("软删除：内容进回收站，响应带 trashKey", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seed([{ key: "a.txt", body: "AAA" }]);
    const response = await del(bucket, "/api/delete?path=a.txt&soft=1");
    const body = await jsonOf(response);
    expect(body).toMatchObject({ key: "a.txt", deleted: true, soft: true });
    expect(typeof body.trashKey).toBe("string");
    expect(bucket.has("a.txt")).toBe(false);
    expect(bucket.has(`${TRASH_PREFIX}${body.trashKey}.json`)).toBe(true);
  });

  test("软删除虚拟目录也支持", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seed([{ key: "vdir/inner.txt", body: "I" }]);
    const response = await del(bucket, "/api/delete?path=vdir&soft=1");
    const body = await jsonOf(response);
    expect(body.soft).toBe(true);
    const meta = bucket.rawJson<{ virtualDir: boolean }>(
      `${TRASH_PREFIX}${body.trashKey}.json`
    );
    expect(meta?.virtualDir).toBe(true);
  });

  test("软删除不存在的键是 404", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    const response = await del(bucket, "/api/delete?path=ghost&soft=1");
    expect(response.status).toBe(404);
  });

  test("不存在 / 缺参 / 内部前缀 / .. 都是错误", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    expect((await del(bucket, "/api/delete?path=ghost")).status).toBe(404);
    expect((await del(bucket, "/api/delete")).status).toBe(400);
    const internal = await del(bucket, "/api/delete?path=_$flaredrive$/apikeys");
    expect(internal.status).toBe(400);
    expect(await internal.text()).toBe("禁止访问内部目录");
    const dotDot = await del(bucket, "/api/delete?path=a/../b");
    expect(dotDot.status).toBe(400);
    expect(await dotDot.text()).toBe("路径不合法");
  });
});

describe("copy", () => {
  test("复制文件保留元数据", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seed([
      {
        key: "src.txt",
        body: "SRC",
        contentType: "text/plain",
        customMetadata: { thumbnail: "t" },
      },
    ]);
    const response = await call(copyOnPost, bucket, "/api/copy", {
      from: "src.txt",
      to: "dst.txt",
    });
    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toEqual({ from: "src.txt", to: "dst.txt", copied: true });
    expect(bucket.rawText("src.txt")).toBe("SRC");
    expect(bucket.rawText("dst.txt")).toBe("SRC");
    const head = await bucket.asBucket().head("dst.txt");
    expect(head?.httpMetadata?.contentType).toBe("text/plain");
    expect(head?.customMetadata?.thumbnail).toBe("t");
  });

  test("目标已存在：默认 409，overwrite 后替换", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seed([{ key: "a.txt", body: "A" }, { key: "b.txt", body: "B" }]);

    const conflict = await call(copyOnPost, bucket, "/api/copy", {
      from: "a.txt",
      to: "b.txt",
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.text()).toBe("目标已存在");
    expect(bucket.rawText("b.txt")).toBe("B");

    const overwrite = await call(copyOnPost, bucket, "/api/copy", {
      from: "a.txt",
      to: "b.txt",
      overwrite: true,
    });
    expect(overwrite.status).toBe(200);
    expect(bucket.rawText("b.txt")).toBe("A");
  });

  test("源是目录是 400；源不存在是 404", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seedDir("docs");
    const dir = await call(copyOnPost, bucket, "/api/copy", { from: "docs", to: "docs2" });
    expect(dir.status).toBe(400);
    expect(await dir.text()).toBe("只能操作文件，不能操作目录");

    const missing = await call(copyOnPost, bucket, "/api/copy", { from: "ghost", to: "x" });
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe("文件不存在");
  });

  test("参数校验：缺参/相同/嵌套自身/内部前缀/坏 JSON/query 传参", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);

    const noFrom = await call(copyOnPost, bucket, "/api/copy", { to: "x" });
    expect(noFrom.status).toBe(400);
    expect(await noFrom.text()).toBe("缺少 from 参数");

    const noTo = await call(copyOnPost, bucket, "/api/copy?from=a");
    expect(noTo.status).toBe(400);
    expect(await noTo.text()).toBe("缺少 to 参数");

    const same = await call(copyOnPost, bucket, "/api/copy", { from: "a", to: "a" });
    expect(same.status).toBe(400);
    expect(await same.text()).toBe("from 与 to 不能相同");

    const nested = await call(copyOnPost, bucket, "/api/copy", { from: "a", to: "a/b" });
    expect(nested.status).toBe(400);
    expect(await nested.text()).toBe("to 不能位于 from 内部");

    const internal = await call(copyOnPost, bucket, "/api/copy", {
      from: "a",
      to: "_$flaredrive$/x",
    });
    expect(internal.status).toBe(400);

    const badJson = await call(copyOnPost, bucket, "/api/copy", "{nope", {
      "Content-Type": "application/json",
    });
    expect(badJson.status).toBe(400);
    expect(await badJson.text()).toBe("无法解析 JSON");

    // query 参数路径同样可用
    bucket.seed([{ key: "q.txt", body: "Q" }]);
    const viaQuery = await call(copyOnPost, bucket, "/api/copy?from=q.txt&to=q2.txt");
    expect(viaQuery.status).toBe(200);
    expect(bucket.rawText("q2.txt")).toBe("Q");
  });
});

describe("rename", () => {
  test("文件重命名：旧键移除、目标父级 marker 自动补齐", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seed([{ key: "a.txt", body: "AAA" }]);
    const response = await call(renameOnPost, bucket, "/api/rename", {
      from: "a.txt",
      to: "nested/dir/b.txt",
    });
    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toEqual({ from: "a.txt", to: "nested/dir/b.txt" });
    expect(bucket.has("a.txt")).toBe(false);
    expect(bucket.rawText("nested/dir/b.txt")).toBe("AAA");
    const dir = await bucket.asBucket().head("nested/dir");
    expect(dir?.httpMetadata?.contentType).toBe("application/x-directory");
  });

  test("目标已存在：默认 409；overwrite 覆盖；目标是目录 409", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seed([{ key: "a.txt", body: "A" }, { key: "b.txt", body: "B" }]);
    bucket.seedDir("docs");

    const conflict = await call(renameOnPost, bucket, "/api/rename", {
      from: "a.txt",
      to: "b.txt",
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.text()).toBe("目标已存在");

    const overwrite = await call(renameOnPost, bucket, "/api/rename", {
      from: "a.txt",
      to: "b.txt",
      overwrite: true,
    });
    expect(overwrite.status).toBe(200);
    expect(bucket.rawText("b.txt")).toBe("A");

    const toDir = await call(renameOnPost, bucket, "/api/rename?overwrite=1", {
      from: "b.txt",
      to: "docs",
    });
    expect(toDir.status).toBe(409);
    expect(await toDir.text()).toBe("目标已存在且为目录");
  });

  test("目标是前缀虚拟目录也是 409", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seed([{ key: "a.txt", body: "A" }, { key: "vdir/inner.txt", body: "I" }]);
    const response = await call(renameOnPost, bucket, "/api/rename", {
      from: "a.txt",
      to: "vdir",
    });
    expect(response.status).toBe(409);
  });

  test("目录整体移动：后代 + marker 迁移，kind=directory", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seedDir("docs");
    bucket.seedDir("docs/sub");
    bucket.seed([
      { key: "docs/a.txt", body: "A", contentType: "text/plain" },
      { key: "docs/sub/b.txt", body: "B" },
    ]);
    const response = await call(renameOnPost, bucket, "/api/rename", {
      from: "docs",
      to: "archived",
    });
    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toEqual({
      from: "docs",
      to: "archived",
      kind: "directory",
    });
    expect(bucket.has("docs")).toBe(false);
    expect(bucket.has("docs/a.txt")).toBe(false);
    expect(bucket.rawText("archived/a.txt")).toBe("A");
    expect(bucket.rawText("archived/sub/b.txt")).toBe("B");
    const marker = await bucket.asBucket().head("archived");
    expect(marker?.httpMetadata?.contentType).toBe("application/x-directory");
    const sub = await bucket.asBucket().head("archived/sub");
    expect(sub?.httpMetadata?.contentType).toBe("application/x-directory");
  });

  test("虚拟目录（无 marker）移动后在目标补 marker", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seed([{ key: "vdir/inner.txt", body: "I" }]);
    const response = await call(renameOnPost, bucket, "/api/rename", {
      from: "vdir",
      to: "vdir2",
    });
    expect(response.status).toBe(200);
    const marker = await bucket.asBucket().head("vdir2");
    expect(marker?.httpMetadata?.contentType).toBe("application/x-directory");
    expect(bucket.rawText("vdir2/inner.txt")).toBe("I");
  });

  test("目录移动拒绝：overwrite / 目标是自身子路径 / 目标已存在", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seedDir("docs");
    bucket.seed([{ key: "docs/a.txt", body: "A" }]);
    bucket.seedDir("other");

    const withOverwrite = await call(renameOnPost, bucket, "/api/rename", {
      from: "docs",
      to: "docs2",
      overwrite: true,
    });
    expect(withOverwrite.status).toBe(400);
    expect(await withOverwrite.text()).toBe("目录移动不支持 overwrite");

    const intoSelf = await call(renameOnPost, bucket, "/api/rename", {
      from: "docs",
      to: "docs/sub",
    });
    expect(intoSelf.status).toBe(400);

    const destExists = await call(renameOnPost, bucket, "/api/rename", {
      from: "docs",
      to: "other",
    });
    expect(destExists.status).toBe(409);
    expect(await destExists.text()).toBe("目标目录已存在");
  });

  test("参数校验：缺 from / 缺 to / 相同 / 内部前缀 / 源不存在 / 坏 JSON", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seed([{ key: "a.txt", body: "A" }]);

    expect((await call(renameOnPost, bucket, "/api/rename", { to: "x" })).status).toBe(400);
    const noTo = await call(renameOnPost, bucket, "/api/rename?from=a");
    expect(noTo.status).toBe(400);
    expect(await noTo.text()).toBe("缺少 to 参数");

    const same = await call(renameOnPost, bucket, "/api/rename", { from: "a", to: "a" });
    expect(same.status).toBe(400);
    expect(await same.text()).toBe("from 与 to 不能相同");

    const internal = await call(renameOnPost, bucket, "/api/rename", {
      from: "a",
      to: "_$flaredrive$",
    });
    expect(internal.status).toBe(400);

    const missing = await call(renameOnPost, bucket, "/api/rename", {
      from: "ghost",
      to: "x",
    });
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe("文件不存在");

    const badJson = await call(renameOnPost, bucket, "/api/rename", "{nope", {
      "Content-Type": "application/json",
    });
    expect(badJson.status).toBe(400);
    expect(await badJson.text()).toBe("无法解析 JSON");
  });
});

describe("backup", () => {
  test("文件备份：复制为 name.conflict-<UTC戳>.ext 并删除原件", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seed([{ key: "report.txt", body: "R1", contentType: "text/plain" }]);
    const response = await call(backupOnPost, bucket, "/api/backup", { path: "report.txt" });
    expect(response.status).toBe(200);
    const body = (await jsonOf(response)) as { from: string; to: string };
    expect(body.from).toBe("report.txt");
    expect(body.to).toBe(`report.conflict-${BACKUP_STAMP}.txt`);
    expect(bucket.has("report.txt")).toBe(false);
    expect(bucket.rawText(body.to)).toBe("R1");
    const head = await bucket.asBucket().head(body.to);
    expect(head?.httpMetadata?.contentType).toBe("text/plain");
  });

  test("同秒第二次备份自动追加 -2 序号", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seed([{ key: "a.txt", body: "1" }]);
    const first = (await (
      await call(backupOnPost, bucket, "/api/backup", { path: "a.txt" })
    ).json()) as { to: string };
    expect(first.to).toBe(`a.conflict-${BACKUP_STAMP}.txt`);

    bucket.seed([{ key: "a.txt", body: "2" }]);
    const second = (await (
      await call(backupOnPost, bucket, "/api/backup", { path: "a.txt" })
    ).json()) as { to: string };
    expect(second.to).toBe(`a.conflict-${BACKUP_STAMP}-2.txt`);
    expect(bucket.rawText(first.to)).toBe("1");
    expect(bucket.rawText(second.to)).toBe("2");
  });

  test("目录备份：整树改名并带 kind=directory", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seedDir("docs");
    bucket.seed([{ key: "docs/a.txt", body: "A" }]);
    const response = await call(backupOnPost, bucket, "/api/backup", { path: "docs" });
    expect(response.status).toBe(200);
    const body = (await jsonOf(response)) as { from: string; to: string; kind: string };
    expect(body.from).toBe("docs");
    expect(body.kind).toBe("directory");
    expect(body.to).toBe(`docs.conflict-${BACKUP_STAMP}`);
    expect(bucket.has("docs")).toBe(false);
    expect(bucket.rawText(`${body.to}/a.txt`)).toBe("A");
    const marker = await bucket.asBucket().head(body.to);
    expect(marker?.httpMetadata?.contentType).toBe("application/x-directory");
  });

  test("目录备份名冲突超过序号上限时回退时间戳", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    bucket.seedDir("docs");
    // 预置 docs.conflict-<戳> 与 -2…-99，逼出 Date.now() 兜底
    const seeds: Array<{ key: string; body: Uint8Array; contentType: string }> = [
      { key: `docs.conflict-${BACKUP_STAMP}`, body: new Uint8Array(0), contentType: "application/x-directory" },
    ];
    for (let i = 2; i <= 99; i += 1) {
      seeds.push({
        key: `docs.conflict-${BACKUP_STAMP}-${i}`,
        body: new Uint8Array(0),
        contentType: "application/x-directory",
      });
    }
    bucket.seed(seeds);
    const response = await call(backupOnPost, bucket, "/api/backup", { path: "docs" });
    const body = (await jsonOf(response)) as { to: string };
    // Date.now() 被冻结为固定毫秒值，兜底名 = base-<ms>
    expect(body.to).toBe(`docs.conflict-${BACKUP_STAMP}-${Date.now()}`);
  });

  test("参数校验：缺 path / 源不存在 / 内部前缀", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);

    const noPath = await call(backupOnPost, bucket, "/api/backup");
    expect(noPath.status).toBe(400);
    expect(await noPath.text()).toBe("缺少 path 参数");

    const missing = await call(backupOnPost, bucket, "/api/backup", { path: "ghost" });
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe("文件不存在");

    const internal = await call(backupOnPost, bucket, "/api/backup", {
      path: "_$flaredrive$/apikeys/k.json",
    });
    expect(internal.status).toBe(400);
  });
});
