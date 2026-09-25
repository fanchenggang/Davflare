/**
 * functions/mcp.ts 端点直测：CORS/OPTIONS/405、功能开关 404、API key 鉴权、
 * JSON-RPC 解析错误、initialize/ping/tools/list/notifications，以及 tools/call
 * 逐个打通 makeApis 里的 API 适配器（list/upload/download/zip/mkdir/stat/
 * search/move/copy/delete、share、trash、sites 系列、publish_site、image 系列）。
 */
import { onRequest } from "../../../functions/mcp";
import { MCP_TOOL_NAMES } from "../../../functions/_mcp";
import { imageObjectKey } from "../../../functions/_images";
import { siteConfigKey } from "../../../functions/_sites";
import { InMemoryBucket, makeContext } from "../testInMemoryBucket";

const HOST = "http://drive.example.com";
const API_KEY = "fd_test_key_1234567890";
const KEYS_PREFIX = "_$flaredrive$/apikeys/";

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

async function rpc(
  bucket: InMemoryBucket,
  payload: unknown,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<Response> {
  const method = init.method ?? "POST";
  const body =
    init.body !== undefined
      ? init.body
      : method === "POST"
        ? JSON.stringify(payload)
        : undefined;
  const request = new Request(`${HOST}/mcp`, {
    method,
    headers: { "X-Api-Key": API_KEY, ...init.headers },
    body,
  });
  return onRequest(makeContext(request, makeEnv(bucket)));
}

interface RpcBody {
  jsonrpc?: string;
  id?: unknown;
  result?: { content: Array<{ type: string; text: string }>; isError?: boolean };
  error?: { code: number; message: string; data?: unknown };
}

async function rpcJson(
  bucket: InMemoryBucket,
  payload: unknown,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
): Promise<RpcBody> {
  const response = await rpc(bucket, payload, init);
  return (await response.json()) as RpcBody;
}

/** tools/call 并解析文本内容（JSON 结果还原为对象，纯文本兜底为字符串）。 */
async function callTool(
  bucket: InMemoryBucket,
  name: string,
  args: Record<string, unknown> = {}
): Promise<{ ok: boolean; text: string; json: any }> {
  const body = await rpcJson(bucket, {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  });
  const result = body.result!;
  const text = result.content[0].text;
  let json: any = text;
  try {
    json = JSON.parse(text);
  } catch {
    // 错误/204 等纯文本结果原样返回
  }
  return { ok: !result.isError, text, json };
}

async function newSeededBucket(): Promise<InMemoryBucket> {
  const bucket = new InMemoryBucket();
  await seedApiKey(bucket);
  bucket.seedDir("docs");
  bucket.seed([{ key: "docs/hi.txt", body: "hello", contentType: "text/plain" }]);
  return bucket;
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

describe("mcp 端点协议层", () => {
  test("OPTIONS 预检 204 + CORS；非 POST 405 + Allow", async () => {
    const bucket = await newSeededBucket();
    const options = await rpc(bucket, null, { method: "OPTIONS", body: undefined });
    expect(options.status).toBe(204);
    expect(options.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(options.headers.get("Access-Control-Max-Age")).toBe("86400");

    const get = await rpc(bucket, null, { method: "GET", body: undefined });
    expect(get.status).toBe(405);
    expect(get.headers.get("Allow")).toBe("POST, OPTIONS");
    expect(get.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  test("mcp 或 apiKey 开关关闭时 404（nosniff）", async () => {
    const offMcp = new InMemoryBucket();
    await seedApiKey(offMcp);
    offMcp.seed([
      { key: "_$flaredrive$/config.json", body: JSON.stringify({ mcp: false }), contentType: "application/json" },
    ]);
    const disabled = await rpc(offMcp, { jsonrpc: "2.0", id: 1, method: "ping" });
    expect(disabled.status).toBe(404);
    expect(disabled.headers.get("X-Content-Type-Options")).toBe("nosniff");

    const offKey = new InMemoryBucket();
    await seedApiKey(offKey);
    offKey.seed([
      { key: "_$flaredrive$/config.json", body: JSON.stringify({ apiKey: false }), contentType: "application/json" },
    ]);
    const keyOff = await rpc(offKey, { jsonrpc: "2.0", id: 1, method: "ping" });
    expect(keyOff.status).toBe(404);
  });

  test("缺少/无效 API key 是 401（响应仍带 CORS）", async () => {
    const bucket = new InMemoryBucket();
    await seedApiKey(bucket);
    const anonymous = await onRequest(
      makeContext(new Request(`${HOST}/mcp`, { method: "POST", body: "{}" }), makeEnv(bucket))
    );
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("Access-Control-Allow-Origin")).toBe("*");

    const wrong = await rpc(bucket, { jsonrpc: "2.0", id: 1, method: "ping" }, {
      headers: { "X-Api-Key": "fd_wrong" },
    });
    expect(wrong.status).toBe(401);
  });

  test("JSON-RPC 解析错误：-32700 / -32600（非对象、缺 method）", async () => {
    const bucket = await newSeededBucket();
    const parseError = await rpcJson(bucket, null, { body: "{nope" });
    expect(parseError.error).toMatchObject({ code: -32700, message: "Parse error" });
    expect(parseError.id).toBeNull();

    const notObject = await rpcJson(bucket, null, { body: "[1,2,3]" });
    expect(notObject.error?.code).toBe(-32600);

    const noMethod = await rpcJson(bucket, { jsonrpc: "2.0", id: 7 });
    expect(noMethod.error?.code).toBe(-32600);
    expect(noMethod.id).toBe(7);
  });

  test("initialize / ping / tools/list / notifications", async () => {
    const bucket = await newSeededBucket();
    const init = await rpcJson(bucket, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05" },
    });
    expect(init.result).toMatchObject({
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
    });

    const ping = await rpcJson(bucket, { jsonrpc: "2.0", id: 2, method: "ping" });
    expect(ping.result).toEqual({});

    const list = await rpcJson(bucket, { jsonrpc: "2.0", id: 3, method: "tools/list" });
    const listedTools = (list.result as unknown as { tools: Array<{ name: string }> }).tools;
    expect(listedTools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["list", "upload", "download", "zip", "publish_site"])
    );
    expect(listedTools).toHaveLength(MCP_TOOL_NAMES.length);

    // 无 id 的通知 → 202 accepted（空 body）
    const notification = await rpc(bucket, { jsonrpc: "2.0", method: "notifications/initialized" });
    expect(notification.status).toBe(202);
    expect(await notification.text()).toBe("");

    // 未知方法 → -32601
    const unknown = await rpcJson(bucket, { jsonrpc: "2.0", id: 9, method: "no/such" });
    expect(unknown.error).toMatchObject({ code: -32601, message: "Method not found" });
  });

  test("tools/call 参数错误：缺 name -32602；未知工具 isError", async () => {
    const bucket = await newSeededBucket();
    const noName = await rpcJson(bucket, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { arguments: {} },
    });
    expect(noName.error?.code).toBe(-32602);

    const unknown = await callTool(bucket, "nope");
    expect(unknown.ok).toBe(false);
    expect(unknown.text).toBe("Unknown tool: nope");
  });
});

describe("mcp 文件工具", () => {
  test("list / mkdir / stat / search 走通", async () => {
    const bucket = await newSeededBucket();
    const list = await callTool(bucket, "list", { path: "docs" });
    expect(list.ok).toBe(true);
    expect(list.json.items.map((item: { name: string }) => item.name)).toEqual(["hi.txt"]);

    const mkdir = await callTool(bucket, "mkdir", { path: "pics" });
    expect(mkdir.json.created).toBe(true);

    const stat = await callTool(bucket, "stat", { path: "pics" });
    expect(stat.json).toMatchObject({ key: "pics", kind: "directory" });

    const search = await callTool(bucket, "search", { query: "hi" });
    expect(search.json.items.map((item: { key: string }) => item.key)).toContain("docs/hi.txt");
  });

  test("upload → download → move → copy → delete 链路", async () => {
    const bucket = await newSeededBucket();
    const upload = await callTool(bucket, "upload", {
      path: "docs",
      name: "up.txt",
      content: "UP",
      encoding: "utf8",
    });
    expect(upload.ok).toBe(true);
    expect(bucket.rawText("docs/up.txt")).toBe("UP");

    const download = await callTool(bucket, "download", { path: "docs/hi.txt" });
    expect(download.json).toMatchObject({
      path: "docs/hi.txt",
      size: 5,
      contentType: "text/plain",
      encoding: "utf8",
      content: "hello",
    });

    const paged = await callTool(bucket, "download", {
      path: "docs/hi.txt",
      part: 2,
      partSize: 2,
    });
    expect(paged.json).toMatchObject({ part: 2, totalParts: 3, offset: 2, length: 2 });
    expect(atob(paged.json.content)).toBe("ll");

    const move = await callTool(bucket, "move", { from: "docs/up.txt", to: "docs/moved.txt" });
    expect(move.ok).toBe(true);
    expect(bucket.rawText("docs/moved.txt")).toBe("UP");
    expect(bucket.has("docs/up.txt")).toBe(false);

    const copy = await callTool(bucket, "copy", { from: "docs/moved.txt", to: "docs/copy.txt" });
    expect(copy.ok).toBe(true);
    expect(bucket.rawText("docs/copy.txt")).toBe("UP");

    const del = await callTool(bucket, "delete", { path: "docs/copy.txt" });
    expect(del.ok).toBe(true);
    expect(bucket.has("docs/copy.txt")).toBe(false);
    // 默认软删除进回收站
    const trash = await callTool(bucket, "trash_list");
    expect(trash.json.some((item: { originalKey: string }) => item.originalKey === "docs/copy.txt")).toBe(true);
  });

  test("zip 返回 base64 压缩包", async () => {
    const bucket = await newSeededBucket();
    const zip = await callTool(bucket, "zip", { path: "docs" });
    expect(zip.ok).toBe(true);
    expect(zip.json.filename).toBe("docs.zip");
    expect(zip.json.encoding).toBe("base64");
    expect(zip.json.size).toBeGreaterThan(0);
  });

  test("超过 1MiB 的 upload 自动走三段式分块上传", async () => {
    const bucket = await newSeededBucket();
    const big = await callTool(bucket, "upload", {
      path: "docs",
      name: "big.bin",
      content: "a".repeat(1024 * 1024 + 1),
      encoding: "utf8",
    });
    expect(big.ok).toBe(true);
    expect(bucket.rawBytes("docs/big.bin")?.byteLength).toBe(1024 * 1024 + 1);
  });

  test("工具级参数缺失报 isError（不 500）", async () => {
    const bucket = await newSeededBucket();
    for (const [name, args] of [
      ["upload", { path: "docs" }],
      ["download", {}],
      ["zip", {}],
      ["mkdir", {}],
      ["delete", {}],
      ["search", {}],
      ["move", { from: "a" }],
      ["copy", { to: "b" }],
      ["stat", {}],
      ["share_create", {}],
      ["share_revoke", {}],
      ["trash_restore", {}],
      ["sites_config", { slug: "x" }],
      ["sites_delete", {}],
      ["image_delete", {}],
    ] as const) {
      const result = await callTool(bucket, name, { ...args });
      expect(result.ok, `${name} should fail gracefully`).toBe(false);
    }
  });
});

describe("mcp share/trash 工具", () => {
  test("share_create → share_list → share_revoke", async () => {
    const bucket = await newSeededBucket();
    const created = await callTool(bucket, "share_create", { path: "docs/hi.txt" });
    expect(created.ok).toBe(true);
    const token = created.json.token as string;
    expect(created.json.url).toBe(`${HOST}/share/${token}`);

    const list = await callTool(bucket, "share_list");
    expect(list.json.some((share: { token: string }) => share.token === token)).toBe(true);

    const revoked = await callTool(bucket, "share_revoke", { token });
    expect(revoked.ok).toBe(true);
    const after = await callTool(bucket, "share_list");
    expect(after.json.some((share: { token: string }) => share.token === token)).toBe(false);
  });

  test("trash_restore / trash_empty", async () => {
    const bucket = await newSeededBucket();
    await callTool(bucket, "delete", { path: "docs/hi.txt" });
    const list = await callTool(bucket, "trash_list");
    const trashKey = list.json[0].trashKey as string;

    const restored = await callTool(bucket, "trash_restore", { trashKey });
    expect(restored.ok).toBe(true);
    expect(bucket.rawText("docs/hi.txt")).toBe("hello");

    await callTool(bucket, "delete", { path: "docs/hi.txt" });
    const emptied = await callTool(bucket, "trash_empty");
    expect(emptied.ok).toBe(true);
    const trashPrefix = "_$flaredrive$/trash/";
    const listing = await bucket.asBucket().list({ prefix: trashPrefix });
    expect(listing.objects).toHaveLength(0);
  });
});

describe("mcp sites 工具", () => {
  test("sites_config → sites_list → publish_site → sites_delete", async () => {
    const bucket = await newSeededBucket();
    bucket.seed([{ key: "sites/demo/index.html", body: "<h1>demo" }]);

    const config = await callTool(bucket, "sites_config", { slug: "demo", spa: true });
    expect(config.json).toMatchObject({ slug: "demo", spa: true });
    expect(bucket.rawJson<{ spa: boolean }>(siteConfigKey("demo"))?.spa).toBe(true);

    const listed = await callTool(bucket, "sites_list", { stats: false });
    expect(listed.json.sites.some((site: { slug: string }) => site.slug === "demo")).toBe(true);

    const published = await callTool(bucket, "publish_site", { slug: "pub", source: "docs" });
    expect(published.json).toMatchObject({ slug: "pub", source: "docs", copied: 1 });
    expect(bucket.rawText("sites/pub/hi.txt")).toBe("hello");

    const removed = await callTool(bucket, "sites_delete", { slug: "pub" });
    expect(removed.json).toEqual({ slug: "pub", deleted: 1 });
  });

  test("publish_site 校验：非法 slug / 缺 source", async () => {
    const bucket = await newSeededBucket();
    const badSlug = await callTool(bucket, "publish_site", { slug: "Bad!", source: "docs" });
    expect(badSlug.ok).toBe(false);
    expect(badSlug.text).toContain("slug");

    const noSource = await callTool(bucket, "publish_site", { slug: "okslug" });
    expect(noSource.ok).toBe(false);
    expect(noSource.text).toContain("source");

    const missing = await callTool(bucket, "publish_site", { slug: "okslug", source: "ghost" });
    expect(missing.ok).toBe(false);
    expect(missing.text).toContain("not found");
  });
});

describe("mcp agent pull/push 工具", () => {
  test("空库 pull 返回空 files（各层缺失跳过）", async () => {
    const bucket = await newSeededBucket();
    const pulled = await callTool(bucket, "pull");
    expect(pulled.ok).toBe(true);
    expect(pulled.json.files).toEqual([]);
    expect(pulled.json.mergeOrder).toEqual(["project", "agent", "global"]);
  });

  test("pull 按 agent/type 过滤并读取各层文件", async () => {
    const bucket = await newSeededBucket();
    bucket.seed([
      { key: "agents/global/skills/base.md", body: "GLOBAL", contentType: "text/plain" },
      { key: "agents/cursor/rules/core.md", body: "CURSOR-RULES", contentType: "text/plain" },
      { key: "agents/cursor/rules/deep/nested.md", body: "NESTED", contentType: "text/plain" },
      // 不相关的对象不应出现在结果里
      { key: "agents/other-agent/rules/x.md", body: "OTHER", contentType: "text/plain" },
    ]);

    const rules = await callTool(bucket, "pull", { agent: "cursor", type: "rules" });
    expect(rules.ok).toBe(true);
    const rels = rules.json.files.map((file: { rel: string }) => file.rel);
    expect(rels).toEqual(["rules/core.md", "rules/deep/nested.md"]);
    expect(rules.json.files.every((file: { layer: string }) => file.layer === "agent")).toBe(true);
    expect(rules.json.files[0].content).toBe("CURSOR-RULES");
  });

  test("push 上传到 agent 层（自动补目录）并可带 project 层", async () => {
    const bucket = await newSeededBucket();
    const pushed = await callTool(bucket, "push", {
      agent: "cursor",
      files: [
        { path: "skills/A.md", content: "AAA", encoding: "utf8" },
        { path: "skills/sub/B.md", content: "QkI=", encoding: "base64" },
      ],
    });
    expect(pushed.ok).toBe(true);
    expect(pushed.json.layer).toBe("agent");
    expect(pushed.json.prefix).toBe("agents/cursor/");
    expect(pushed.json.uploaded.map((u: { key: string }) => u.key)).toEqual([
      "agents/cursor/skills/A.md",
      "agents/cursor/skills/sub/B.md",
    ]);
    expect(bucket.rawText("agents/cursor/skills/A.md")).toBe("AAA");
    expect(new TextDecoder().decode(bucket.rawBytes("agents/cursor/skills/sub/B.md"))).toBe("BB");

    const withProject = await callTool(bucket, "push", {
      agent: "cursor",
      project: "myproj",
      files: [{ path: "rules/R.md", content: "R", encoding: "utf8" }],
    });
    expect(withProject.json.layer).toBe("project");
    expect(withProject.json.prefix).toBe("agents/cursor/myproj/");
    expect(bucket.rawText("agents/cursor/myproj/rules/R.md")).toBe("R");
  });

  test("push 拒绝含明文密钥的 mcp.json", async () => {
    const bucket = await newSeededBucket();
    const leaked = await callTool(bucket, "push", {
      agent: "cursor",
      files: [
        { path: "mcp/mcp.json", content: '{"headers":{"X-Api-Key":"fd_0123456789abcdef01234567"}}' },
      ],
    });
    expect(leaked.ok).toBe(false);
    expect(leaked.text).toContain("raw API keys");
  });

  test("push/pull 参数校验：非法 agent slug / 缺 files / path 越界 / 非法 type", async () => {
    const bucket = await newSeededBucket();
    expect((await callTool(bucket, "push", { agent: "BAD!" })).ok).toBe(false);
    expect((await callTool(bucket, "push", { agent: "cursor" })).ok).toBe(false);
    expect(
      (await callTool(bucket, "push", {
        agent: "cursor",
        files: [{ path: "../escape.md", content: "x" }],
      })).ok
    ).toBe(false);
    expect((await callTool(bucket, "pull", { type: "nope" })).ok).toBe(false);
    expect((await callTool(bucket, "pull", { project: "p" })).ok).toBe(false);
  });
});

describe("mcp 传输分页（zip/download 错误分支）", () => {
  test("zip 分页返回 part/totalParts 与分片内容", async () => {
    const bucket = await newSeededBucket();
    const paged = await callTool(bucket, "zip", { path: "docs", part: 1, partSize: 8 });
    expect(paged.ok).toBe(true);
    expect(paged.json.part).toBe(1);
    expect(paged.json.totalParts).toBeGreaterThan(0);
    expect(typeof paged.json.content).toBe("string");
  });

  test("zip part 越界报错；download part 越界报错", async () => {
    const bucket = await newSeededBucket();
    const zipOut = await callTool(bucket, "zip", { path: "docs", part: 99, partSize: 8 });
    expect(zipOut.ok).toBe(false);
    expect(zipOut.text).toContain("part 需在");

    const dlOut = await callTool(bucket, "download", {
      path: "docs/hi.txt",
      part: 9,
      partSize: 2,
    });
    expect(dlOut.ok).toBe(false);
    expect(dlOut.text).toContain("part 需在");
  });

  test("目录不支持分页下载（stat 无法确定大小）", async () => {
    const bucket = await newSeededBucket();
    const dirPaged = await callTool(bucket, "download", { path: "docs", part: 1 });
    expect(dirPaged.ok).toBe(false);
    expect(dirPaged.text).toContain("无法确定文件大小");
  });
});

describe("mcp image 工具", () => {
  test("image_upload → image_list → image_delete", async () => {
    const bucket = await newSeededBucket();
    const uploaded = await callTool(bucket, "image_upload", {
      name: "pic.png",
      content: btoa(String.fromCharCode(...PNG_BYTES)),
      contentType: "image/png",
    });
    expect(uploaded.ok).toBe(true);
    const id = uploaded.json.id as string;
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(bucket.has(imageObjectKey(id))).toBe(true);

    const list = await callTool(bucket, "image_list");
    expect(list.json.images.some((image: { id: string }) => image.id === id)).toBe(true);

    const removed = await callTool(bucket, "image_delete", { id });
    expect(removed.ok).toBe(true);
    expect(bucket.has(imageObjectKey(id))).toBe(false);
  });

  test("开关关闭时 image 工具报错；image_upload 校验缺参", async () => {
    const offBucket = new InMemoryBucket();
    await seedApiKey(offBucket);
    offBucket.seed([
      { key: "_$flaredrive$/config.json", body: JSON.stringify({ imageHost: false }), contentType: "application/json" },
    ]);
    const list = await callTool(offBucket, "image_list");
    expect(list.ok).toBe(false);
    expect(list.text).toContain("Image Host");

    const bucket = await newSeededBucket();
    const noName = await callTool(bucket, "image_upload", { content: "aGk=" });
    expect(noName.ok).toBe(false);
    expect(noName.text).toBe("name is required");
  });
});
