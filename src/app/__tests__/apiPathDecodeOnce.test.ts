/**
 * /api/* 的 path 参数只解码一次：查询参数由 URLSearchParams 解码，JSON 正文按原始键使用。
 * 文件名里的字面量 `%XX`（`%2e`、`a%2Fb`、`100%25`）不再被二次解码成别的路径。
 * 同时锁住现有客户端的编码方式：CLI（URL.searchParams.set，空格编码成 +）、
 * 网页端（encodeURIComponent 拼查询串、JSON 正文传原始键）、curl 直接写 ASCII / UTF-8。
 */
import { onRequestDelete as deleteOnDelete } from "../../../functions/api/delete";
import { onRequestGet as downloadOnGet } from "../../../functions/api/download";
import { onRequestGet as listOnGet } from "../../../functions/api/list";
import { onRequestGet as statOnGet } from "../../../functions/api/stat";
import { onRequestPost as renameOnPost } from "../../../functions/api/rename";
import { onRequestPost as copyOnPost } from "../../../functions/api/copy";
import { onRequestPost as mkdirOnPost } from "../../../functions/api/mkdir";
import { onRequestPost as backupOnPost } from "../../../functions/api/backup";
import { onRequestPost as uploadOnPost } from "../../../functions/api/upload";
import { onRequestPost as countsOnPost } from "../../../functions/api/counts";
import { onRequestGet as archiveOnGet, onRequestPost as archiveOnPost } from "../../../functions/api/archive";
import { decodeRawPath, normalizeDirKey, normalizeFileKey } from "../../../functions/api/_apikey";
import { InMemoryBucket, basicAuthHeader, makeContext } from "../testInMemoryBucket";

const HOST = "http://drive.example.com";
const API_KEY = "fd_test_key_1234567890";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function freshBucket() {
  const bucket = new InMemoryBucket();
  bucket.seed([
    {
      key: "_$flaredrive$/apikeys/testrecord.json",
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
  return bucket;
}

/** CLI 的写法：new URL + searchParams.set（空格 → +，+ → %2B，% → %25） */
function cliUrl(path: string, params: Record<string, string>) {
  const url = new URL(path, HOST);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

/** 网页端 / 文档里的写法：encodeURIComponent 拼查询串 */
function encUrl(path: string, key: string, extra = "") {
  return `${HOST}${path}?path=${encodeURIComponent(key)}${extra}`;
}

function run(handler: PagesFunction<any>, bucket: InMemoryBucket, url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  // counts 只认网页会话 / Basic；其余接口用 API key（第三方客户端的路径）
  if (!headers.has("Authorization")) headers.set("X-Api-Key", API_KEY);
  if (typeof init.body === "string" && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return handler(makeContext(new Request(url, { ...init, headers }), { BUCKET: bucket.asBucket(), WEBDAV_USERNAME: "user", WEBDAV_PASSWORD: "pass" }));
}

const TRICKY = ["Projects/%2e", "Projects/%2e%2e", "Projects/Projects%2Fkeep.txt", "Projects/100%25 off.txt", "Projects/a%5cb.txt"];

async function seedProjects() {
  const bucket = await freshBucket();
  bucket.seedDir("Projects");
  bucket.seed([
    { key: "Projects/keep.txt", body: "precious" },
    ...TRICKY.map((key) => ({ key, body: `literal ${key}` })),
  ]);
  return bucket;
}

describe("decodeRawPath no longer URL-decodes", () => {
  test("literal %XX survives; slashes are still normalized", () => {
    expect(decodeRawPath("a/%2e")).toBe("a/%2e");
    expect(decodeRawPath("a%2Fb.txt")).toBe("a%2Fb.txt");
    expect(decodeRawPath("100%.txt")).toBe("100%.txt");
    expect(decodeRawPath("  /a\\b/c ")).toBe("a/b/c");
    expect(normalizeFileKey("dir/%2e")).toBe("dir/%2e");
    expect(normalizeDirKey("dir/%2e%2e")).toBe("dir/%2e%2e");
    // 真正的 .. 仍然拒绝
    expect(normalizeFileKey("dir/../x")).toBeInstanceOf(Response);
  });
});

describe("query-string path: decoded exactly once", () => {
  test("soft delete of a file named %2e removes only that file, not its folder", async () => {
    const bucket = await seedProjects();
    for (const url of [encUrl("/api/delete", "Projects/%2e", "&soft=1"), cliUrl("/api/delete", { path: "Projects/%2e", soft: "1" })]) {
      bucket.seed([{ key: "Projects/%2e", body: "again" }]);
      const response = await run(deleteOnDelete, bucket, url, { method: "DELETE" });
      expect(response.status).toBe(200);
      expect(bucket.has("Projects/%2e")).toBe(false);
      expect(bucket.has("Projects/keep.txt")).toBe(true);
      expect(bucket.has("Projects")).toBe(true);
    }
  });

  test("download / stat / backup target the literal name, not the decoded path", async () => {
    const bucket = await seedProjects();
    for (const key of TRICKY) {
      for (const url of [encUrl("/api/download", key), cliUrl("/api/download", { path: key })]) {
        const response = await run(downloadOnGet, bucket, url);
        expect(response.status).toBe(200);
        expect(await response.text()).toBe(`literal ${key}`);
      }
      const stat = await run(statOnGet, bucket, encUrl("/api/stat", key));
      expect(stat.status).toBe(200);
      expect(((await stat.json()) as { key: string }).key).toBe(key);
    }
    const backup = await run(backupOnPost, bucket, cliUrl("/api/backup", { path: "Projects/Projects%2Fkeep.txt" }), { method: "POST" });
    expect(backup.status).toBe(200);
    expect(bucket.has("Projects/keep.txt")).toBe(true);
    expect(await (await bucket.asBucket().get("Projects/keep.txt"))!.text()).toBe("precious");
  });

  test("list of a folder whose name contains %2F lists that folder", async () => {
    const bucket = await freshBucket();
    bucket.seed([
      { key: "a%2Fb/inside.txt", body: "1" },
      { key: "a/b/other.txt", body: "2" },
    ]);
    const response = await run(listOnGet, bucket, encUrl("/api/list", "a%2Fb/"));
    expect(response.status).toBe(200);
    const items = ((await response.json()) as { items: Array<{ key: string }> }).items.map((item) => item.key);
    expect(items).toEqual(["a%2Fb/inside.txt"]);
  });

  test("CLI-style encoding keeps working for spaces, +, #, & and UTF-8", async () => {
    const bucket = await freshBucket();
    const key = "笔记 本/a+b & c #1 100%.txt";
    bucket.seed([{ key, body: "ok" }]);
    const url = cliUrl("/api/download", { path: key });
    expect(url).toContain("+"); // 空格按表单规则编码成 +，字面量 + 编码成 %2B
    const response = await run(downloadOnGet, bucket, url);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  test("curl-style raw ASCII / UTF-8 paths keep working", async () => {
    const bucket = await freshBucket();
    bucket.seed([{ key: "DBX/sync/快照.json", body: "{}" }]);
    const response = await run(downloadOnGet, bucket, `${HOST}/api/download?path=DBX/sync/快照.json`);
    expect(response.status).toBe(200);
  });

  test("upload into a folder named with %2e%2e stays in that folder (single and multipart)", async () => {
    const bucket = await freshBucket();
    const single = await run(uploadOnPost, bucket, cliUrl("/api/upload", { path: "in/%2e%2e/" }), {
      method: "POST",
      headers: { "X-File-Name": "x.txt", "Content-Type": "application/octet-stream" },
      body: "x",
    });
    expect(single.status).toBe(201);
    expect(bucket.has("in/%2e%2e/x.txt")).toBe(true);
    expect(bucket.has("x.txt")).toBe(false);
    const create = await run(uploadOnPost, bucket, cliUrl("/api/upload", { uploads: "1", path: "in/%2e%2e/big.bin" }), { method: "POST" });
    expect(create.status).toBe(201);
    expect(((await create.json()) as { key: string }).key).toBe("in/%2e%2e/big.bin");
  });

  test("GET /api/archive?path= with an encoded folder that contains %25", async () => {
    const bucket = await freshBucket();
    bucket.seed([{ key: "rep%25/a.txt", body: "a" }, { key: "rep%/b.txt", body: "b" }]);
    const response = await run(archiveOnGet, bucket, encUrl("/api/archive", "rep%25/"));
    expect(response.status).toBe(200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("a.txt");
    expect(text).not.toContain("b.txt");
  });
});

describe("JSON-body paths are raw keys (no decoding at all)", () => {
  test("rename / copy with literal %2F names do not touch Projects/keep.txt", async () => {
    const bucket = await seedProjects();
    const renamed = await run(renameOnPost, bucket, `${HOST}/api/rename`, {
      method: "POST",
      body: JSON.stringify({ from: "Projects/Projects%2Fkeep.txt", to: "Projects/renamed%2Fx.txt" }),
    });
    expect(renamed.status).toBe(200);
    expect(bucket.has("Projects/renamed%2Fx.txt")).toBe(true);
    expect(bucket.has("Projects/renamed/x.txt")).toBe(false);
    expect(await (await bucket.asBucket().get("Projects/keep.txt"))!.text()).toBe("precious");
    const copied = await run(copyOnPost, bucket, `${HOST}/api/copy`, {
      method: "POST",
      body: JSON.stringify({ from: "Projects/100%25 off.txt", to: "Projects/copy 100%25.txt" }),
    });
    expect(copied.status).toBe(200);
    expect(bucket.has("Projects/copy 100%25.txt")).toBe(true);
  });

  test("mkdir with %2e%2e creates that literal folder", async () => {
    const bucket = await freshBucket();
    const response = await run(mkdirOnPost, bucket, `${HOST}/api/mkdir`, {
      method: "POST",
      body: JSON.stringify({ path: "top/%2e%2e" }),
    });
    expect(response.status).toBe(201);
    expect(bucket.has("top/%2e%2e")).toBe(true);
  });

  test("counts and POST /api/archive use raw keys (web client sends raw keys)", async () => {
    const bucket = await freshBucket();
    bucket.seed([
      { key: "d%2e/one.txt", body: "1" },
      { key: "d./two.txt", body: "2" },
      { key: "d./three.txt", body: "3" },
    ]);
    const counts = await run(countsOnPost, bucket, `${HOST}/api/counts`, {
      method: "POST",
      headers: { Authorization: basicAuthHeader("user", "pass") },
      body: JSON.stringify({ paths: ["d%2e"] }),
    });
    expect(((await counts.json()) as { counts: Record<string, number> }).counts).toEqual({ "d%2e": 1 });
    const archive = await run(archiveOnPost, bucket, `${HOST}/api/archive`, {
      method: "POST",
      body: JSON.stringify({ keys: ["d%2e/one.txt"] }),
    });
    expect(archive.status).toBe(200);
    const text = new TextDecoder().decode(new Uint8Array(await archive.arrayBuffer()));
    expect(text).toContain("one.txt");
    expect(text).not.toContain("two.txt");
  });
});
