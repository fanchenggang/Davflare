/// <reference types="node" />
import { TextDecoder, TextEncoder } from "util";
beforeAll(() => {
  (global as any).TextEncoder = TextEncoder;
  (global as any).TextDecoder = TextDecoder;
});

import {
  MCP_DOWNLOAD_PART_SIZE,
  MCP_MAX_BYTES,
  MCP_MAX_UPLOAD_BYTES,
  MCP_PROTOCOL_VERSION,
  AGENT_MERGE_ORDER,
  MCP_TOOL_NAMES,
  MCP_TOOLS,
  MCP_UPLOAD_PART_SIZE,
  decodeUploadContent,
  dispatchMcpRequest,
  mcpJsonHasRawSecrets,
  parseJsonRpcBody,
  type ToolCallApis,
} from "../../../functions/_mcp";
import { httpJsonResponse, rpc } from "../testUtils";

function mockApis(overrides: Partial<ToolCallApis> = {}): ToolCallApis {
  return {
    list: async () => httpJsonResponse({ items: [] }),
    upload: async () => httpJsonResponse({ key: "notes.txt", overwritten: false }, 201),
    download: async () => new Response("hello", { status: 200, headers: { "Content-Type": "text/plain" } }),
    mkdir: async () => httpJsonResponse({ key: "folder/", created: true }, 201),
    delete: async () => httpJsonResponse({ key: "notes.txt", deleted: true, soft: true }),
    search: async () => httpJsonResponse({ matches: [], nextCursor: null }),
    move: async () => httpJsonResponse({ from: "a", to: "b", kind: "file" }),
    copy: async () => httpJsonResponse({ from: "a", to: "b", copied: true }),
    stat: async () => httpJsonResponse({ key: "a.txt", kind: "file", size: 5 }),
    downloadRange: async () => new Response("hello", {
      status: 206,
      headers: { "Content-Type": "application/octet-stream" },
    }),
    uploadStart: async () => httpJsonResponse({ key: "big.bin", uploadId: "uid-1" }, 201),
    uploadPart: async () => httpJsonResponse({ partNumber: 1, etag: "etag-1" }),
    uploadComplete: async () => httpJsonResponse({ key: "big.bin", size: 10 }),
    uploadAbort: async () => new Response(null, { status: 204 }),
    shareCreate: async () => httpJsonResponse({ token: "tok-1", url: "http://x/share/tok-1" }, 201),
    shareList: async () => httpJsonResponse([]),
    shareRevoke: async () => new Response(null, { status: 204 }),
    sitesList: async () => httpJsonResponse({ sitesHost: "sites.example.com", sites: [] }),
    sitesConfig: async () => httpJsonResponse({ slug: "demo", spa: true }),
    sitesDelete: async () => httpJsonResponse({ slug: "demo", deleted: 2 }),
    sitesEnabled: async () => true,
    imageList: async () => httpJsonResponse({ sitesHost: "sites.example.com", images: [] }),
    imageUpload: async () =>
      httpJsonResponse(
        {
          id: "a".repeat(32),
          name: "shot.png",
          size: 4,
          uploaded: "2026-01-01T00:00:00.000Z",
          contentType: "image/png",
          url: "https://sites.example.com/i/" + "a".repeat(32),
          markdown: "![](https://sites.example.com/i/" + "a".repeat(32) + ")",
        },
        201
      ),
    imageDelete: async () => httpJsonResponse({ id: "a".repeat(32), deleted: true }),
    imageHostEnabled: async () => true,
    ...overrides,
  };
}

function callTool(name: string, args: Record<string, unknown>, apis?: Partial<ToolCallApis>) {
  return dispatchMcpRequest(
    rpc({ method: "tools/call", params: { name, arguments: args } }),
    mockApis(apis)
  );
}

function toolPayload(result: Awaited<ReturnType<typeof dispatchMcpRequest>>) {
  if (result.kind !== "rpc") throw new Error("expected rpc result");
  return result.body.result as { isError?: boolean; content: { text: string }[] };
}

describe("mcp protocol", () => {
  test("tool catalog: base + search/move/copy/stat/share/sites + pull/push/publish_site", () => {
    expect(MCP_TOOL_NAMES).toEqual([
      "list",
      "upload",
      "download",
      "mkdir",
      "delete",
      "search",
      "move",
      "copy",
      "stat",
      "share_create",
      "share_list",
      "share_revoke",
      "sites_list",
      "sites_config",
      "sites_delete",
      "pull",
      "push",
      "publish_site",
      "image_upload",
      "image_list",
      "image_delete",
    ]);
    expect(MCP_TOOLS).toHaveLength(21);
  });

  test("parseJsonRpcBody rejects invalid json", () => {
    const parsed = parseJsonRpcBody("{not json");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.body.error?.code).toBe(-32700);
  });

  test("initialize returns protocol + serverInfo", async () => {
    const result = await dispatchMcpRequest(
      rpc({ method: "initialize", params: { protocolVersion: MCP_PROTOCOL_VERSION } }),
      mockApis()
    );
    expect(result.kind).toBe("rpc");
    if (result.kind !== "rpc") return;
    expect(result.body.result).toMatchObject({
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: "davflare", version: "0.1.0" },
    });
  });

  test("notifications/initialized is 202-style accepted", async () => {
    const result = await dispatchMcpRequest(
      rpc({ method: "notifications/initialized", hasId: false }),
      mockApis()
    );
    expect(result).toEqual({ kind: "accepted" });
  });

  test("tools/list returns the full catalog", async () => {
    const result = await dispatchMcpRequest(rpc({ method: "tools/list" }), mockApis());
    expect(result.kind).toBe("rpc");
    if (result.kind !== "rpc") return;
    const tools = (result.body.result as { tools: { name: string }[] }).tools;
    expect(tools.map((t) => t.name)).toEqual(MCP_TOOL_NAMES);
  });

  test("unknown method is -32601", async () => {
    const result = await dispatchMcpRequest(rpc({ method: "nope" }), mockApis());
    expect(result.kind).toBe("rpc");
    if (result.kind !== "rpc") return;
    expect(result.body.error?.code).toBe(-32601);
  });

  test("upload over the MCP cap is a tool error, not an API call", async () => {
    const upload = jest.fn();
    const result = await callTool(
      "upload",
      { name: "big.bin", content: "x".repeat(MCP_MAX_UPLOAD_BYTES + 1), encoding: "utf8" },
      { upload }
    );
    expect(upload).not.toHaveBeenCalled();
    const body = toolPayload(result);
    expect(body.isError).toBe(true);
    expect(body.content[0].text).toMatch(/MB/);
  });

  test("upload over 1 MiB switches to multipart chunks and completes", async () => {
    const content = "y".repeat(MCP_UPLOAD_PART_SIZE + 10); // 5MiB 整块 + 10 字节末块
    const parts: Array<{ body: Uint8Array; partNumber: number }> = [];
    const result = await callTool(
      "upload",
      { name: "big.bin", path: "docs", content, encoding: "utf8" },
      {
        upload: async () => {
          throw new Error("inline upload should not be used for >1MiB");
        },
        uploadStart: async ({ key }) => httpJsonResponse({ key, uploadId: "uid-42" }, 201),
        uploadPart: async ({ partNumber, body }) => {
          parts.push({ partNumber, body });
          return httpJsonResponse({ partNumber, etag: `etag-${partNumber}` });
        },
        uploadComplete: async ({ uploadId, parts: completed }) => {
          expect(uploadId).toBe("uid-42");
          expect(completed).toHaveLength(2);
          return httpJsonResponse({ key: "docs/big.bin", size: content.length });
        },
        uploadAbort: async () => {
          throw new Error("abort should not fire on the happy path");
        },
      }
    );
    expect(parts.map((p) => p.partNumber)).toEqual([1, 2]);
    expect(parts[0].body.byteLength).toBe(MCP_UPLOAD_PART_SIZE);
    expect(parts[1].body.byteLength).toBe(content.length - MCP_UPLOAD_PART_SIZE);
    const body = toolPayload(result);
    expect(body.isError).toBeFalsy();
    expect(JSON.parse(body.content[0].text).key).toBe("docs/big.bin");
  });

  test("multipart upload aborts and surfaces error when a part fails", async () => {
    let aborted = false;
    const result = await callTool(
      "upload",
      { name: "big.bin", content: "x".repeat(MCP_MAX_BYTES + 1), encoding: "utf8" },
      {
        uploadPart: async () => new Response("part boom", { status: 500 }),
        uploadAbort: async () => {
          aborted = true;
          return new Response(null, { status: 204 });
        },
      }
    );
    expect(aborted).toBe(true);
    const body = toolPayload(result);
    expect(body.isError).toBe(true);
    expect(body.content[0].text).toMatch(/part boom/);
  });

  test("download over 1 MiB without part is an error hinting paging", async () => {
    const result = await callTool("download", { path: "big.bin" }, {
      download: async () =>
        new Response("x".repeat(12), {
          status: 200,
          headers: { "Content-Length": String(MCP_MAX_BYTES + 1) },
        }),
    });
    const body = toolPayload(result);
    expect(body.isError).toBe(true);
    expect(body.content[0].text).toMatch(/part=1/);
  });

  test("download with part returns base64 slice via stat + range", () =>
    (async () => {
      const big = "A".repeat(MCP_DOWNLOAD_PART_SIZE + 10);
      const downloadRange = jest.fn(async () =>
        new Response(big.slice(0, 100), {
          status: 206,
          headers: { "Content-Type": "application/octet-stream" },
        })
      );
      const result = await callTool(
        "download",
        { path: "big.bin", part: 1, partSize: 100 },
        {
          stat: async () =>
            httpJsonResponse({ key: "big.bin", kind: "file", size: big.length }),
          downloadRange,
        }
      );
      expect(downloadRange).toHaveBeenCalledWith({ path: "big.bin", offset: 0, length: 100 });
      const body = toolPayload(result);
      expect(body.isError).toBeFalsy();
      const parsed = JSON.parse(body.content[0].text);
      expect(parsed.totalParts).toBe(Math.ceil(big.length / 100));
      expect(parsed.part).toBe(1);
      expect(Buffer.from(parsed.content, "base64").toString()).toBe("A".repeat(100));
    })());

  test("decodeUploadContent utf8 and base64", () => {
    const utf8 = decodeUploadContent("hi", "utf8");
    expect(utf8.ok).toBe(true);
    if (utf8.ok) expect(new TextDecoder().decode(utf8.bytes)).toBe("hi");
    const decoded = decodeUploadContent("aGk=", "base64");
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(new TextDecoder().decode(decoded.bytes)).toBe("hi");
  });

  test("list tool wraps API json", async () => {
    const result = await callTool("list", { path: "" }, {
      list: async () => httpJsonResponse({ items: [{ key: "a.txt", isDir: false }] }),
    });
    const body = toolPayload(result);
    expect(body.isError).toBeFalsy();
    expect(JSON.parse(body.content[0].text).items[0].key).toBe("a.txt");
  });

  test("search/move/copy/stat forward arguments", async () => {
    const search = jest.fn(async () => httpJsonResponse({ matches: [{ key: "a.txt" }] }));
    const searchResult = await callTool("search", { query: "a.txt", limit: 10 }, { search });
    expect(search).toHaveBeenCalledWith({ query: "a.txt", limit: 10, cursor: undefined });
    expect(JSON.parse(toolPayload(searchResult).content[0].text).matches).toHaveLength(1);

    const move = jest.fn(async () => httpJsonResponse({ from: "a", to: "b" }));
    await callTool("move", { from: "a", to: "b", overwrite: true }, { move });
    expect(move).toHaveBeenCalledWith({ from: "a", to: "b", overwrite: true });

    const copy = jest.fn(async () => httpJsonResponse({ copied: true }));
    await callTool("copy", { from: "a", to: "b" }, { copy });
    expect(copy).toHaveBeenCalledWith({ from: "a", to: "b", overwrite: undefined });

    const stat = jest.fn(async () => httpJsonResponse({ kind: "file", size: 3 }));
    await callTool("stat", { path: "a.txt" }, { stat });
    expect(stat).toHaveBeenCalledWith({ path: "a.txt" });
  });

  test("share tools create, list, revoke", async () => {
    const shareCreate = jest.fn(async () => httpJsonResponse({ token: "tok-1" }, 201));
    const created = await callTool(
      "share_create",
      { path: "docs/report.pdf", extractCode: "abcd", expiresInHours: 24 },
      { shareCreate }
    );
    expect(shareCreate).toHaveBeenCalledWith({
      key: "docs/report.pdf",
      extractCode: "abcd",
      expiresInHours: 24,
    });
    expect(JSON.parse(toolPayload(created).content[0].text).token).toBe("tok-1");

    const shareList = jest.fn(async () => httpJsonResponse([{ token: "tok-1" }]));
    const listed = await callTool("share_list", {}, { shareList });
    expect(shareList).toHaveBeenCalledTimes(1);
    expect(JSON.parse(toolPayload(listed).content[0].text)).toHaveLength(1);

    const shareRevoke = jest.fn(async () => new Response(null, { status: 204 }));
    await callTool("share_revoke", { token: "tok-1" }, { shareRevoke });
    expect(shareRevoke).toHaveBeenCalledWith({ token: "tok-1" });
  });

  test("share_create rejects missing path and short codes are left to the API", async () => {
    const shareCreate = jest.fn(async () => httpJsonResponse({ token: "t" }, 201));
    const missing = await callTool("share_create", {}, { shareCreate });
    expect(toolPayload(missing).isError).toBe(true);
    expect(shareCreate).not.toHaveBeenCalled();
  });

  test("sites tools list/config/delete", async () => {
    const sitesList = jest.fn(async () =>
      httpJsonResponse({ sitesHost: "sites.example.com", sites: [{ slug: "demo", spa: false }] })
    );
    const listed = await callTool("sites_list", {}, { sitesList });
    expect(sitesList).toHaveBeenCalledWith({ withStats: true });
    expect(JSON.parse(toolPayload(listed).content[0].text).sites[0].slug).toBe("demo");

    const sitesConfig = jest.fn(async () => httpJsonResponse({ slug: "demo", spa: true }));
    await callTool("sites_config", { slug: "demo", spa: true }, { sitesConfig });
    expect(sitesConfig).toHaveBeenCalledWith({ slug: "demo", spa: true });

    const sitesDelete = jest.fn(async () => httpJsonResponse({ slug: "demo", deleted: 3 }));
    await callTool("sites_delete", { slug: "demo", purge: true }, { sitesDelete });
    expect(sitesDelete).toHaveBeenCalledWith({ slug: "demo", purge: true });
  });

  test("sites_config requires slug and spa", async () => {
    const sitesConfig = jest.fn(async () => httpJsonResponse({ slug: "demo", spa: true }));
    const missing = await callTool("sites_config", { slug: "demo" }, { sitesConfig });
    expect(toolPayload(missing).isError).toBe(true);
    expect(sitesConfig).not.toHaveBeenCalled();
  });

  test("pull walks layers and documents merge order project > agent > global", async () => {
    const trees: Record<string, Array<{ key: string; name: string; isDir: boolean }>> = {
      "agents/global/skills": [{ key: "agents/global/skills/commit", name: "commit", isDir: true }],
      "agents/global/skills/commit": [
        { key: "agents/global/skills/commit/SKILL.md", name: "SKILL.md", isDir: false },
      ],
      "agents/cursor/rules": [
        { key: "agents/cursor/rules/typescript.mdc", name: "typescript.mdc", isDir: false },
      ],
      "agents/cursor/Davflare/skills": [
        { key: "agents/cursor/Davflare/skills/pages-deploy", name: "pages-deploy", isDir: true },
      ],
      "agents/cursor/Davflare/skills/pages-deploy": [
        {
          key: "agents/cursor/Davflare/skills/pages-deploy/SKILL.md",
          name: "SKILL.md",
          isDir: false,
        },
      ],
    };
    const contents: Record<string, string> = {
      "agents/global/skills/commit/SKILL.md": "global-commit",
      "agents/cursor/rules/typescript.mdc": "agent-rule",
      "agents/cursor/Davflare/skills/pages-deploy/SKILL.md": "project-skill",
    };
    const list = jest.fn(async ({ path }: { path: string }) => {
      const folder = path.replace(/\/+$/, "");
      const items = trees[folder];
      if (!items) return new Response("目录不存在", { status: 404 });
      return httpJsonResponse({ items });
    });
    const download = jest.fn(async ({ path }: { path: string }) => {
      const text = contents[path];
      if (!text) return new Response("missing", { status: 404 });
      return new Response(text, { status: 200, headers: { "Content-Type": "text/plain" } });
    });
    const result = await callTool(
      "pull",
      { agent: "cursor", project: "Davflare" },
      { list, download }
    );
    const body = toolPayload(result);
    expect(body.isError).toBeFalsy();
    const parsed = JSON.parse(body.content[0].text);
    expect(parsed.mergeOrder).toEqual([...AGENT_MERGE_ORDER]);
    expect(parsed.mergeOrder).toEqual(["project", "agent", "global"]);
    expect(parsed.mergeHint).toMatch(/project > agent > global/);
    const byKey = Object.fromEntries(parsed.files.map((f: { key: string }) => [f.key, f]));
    expect(byKey["agents/global/skills/commit/SKILL.md"]).toMatchObject({
      layer: "global",
      type: "skills",
      rel: "skills/commit/SKILL.md",
      content: "global-commit",
    });
    expect(byKey["agents/cursor/rules/typescript.mdc"]).toMatchObject({
      layer: "agent",
      type: "rules",
      rel: "rules/typescript.mdc",
      content: "agent-rule",
    });
    expect(byKey["agents/cursor/Davflare/skills/pages-deploy/SKILL.md"]).toMatchObject({
      layer: "project",
      type: "skills",
      rel: "skills/pages-deploy/SKILL.md",
      content: "project-skill",
    });
    expect(parsed.files.map((f: { layer: string }) => f.layer)).toEqual([
      "global",
      "agent",
      "project",
    ]);
  });

  test("mcpJsonHasRawSecrets detects fd_ keys and raw Bearer tokens", () => {
    expect(mcpJsonHasRawSecrets('{"headers":{"Authorization":"Bearer ${env:DAVFLARE_API_KEY}"}}')).toBe(
      false
    );
    expect(mcpJsonHasRawSecrets("Bearer ${env:DAVFLARE_API_KEY}")).toBe(false);
    expect(
      mcpJsonHasRawSecrets(
        '{"headers":{"Authorization":"Bearer fd_0123456789abcdef0123456789abcdef"}}'
      )
    ).toBe(true);
    expect(mcpJsonHasRawSecrets("Authorization: Bearer sk-live-secret")).toBe(true);
    expect(mcpJsonHasRawSecrets('{"headers":{"X-Api-Key":"fd_0123456789abcdef01234567"}}')).toBe(
      true
    );
  });

  test("push rejects raw keys in mcp.json", async () => {
    const upload = jest.fn(async () => httpJsonResponse({ key: "agents/cursor/mcp/mcp.json" }, 201));
    const rejected = await callTool(
      "push",
      {
        agent: "cursor",
        files: [
          {
            path: "mcp/mcp.json",
            content: JSON.stringify({
              mcpServers: {
                davflare: {
                  url: "https://example.com/mcp",
                  headers: { Authorization: "Bearer fd_0123456789abcdef0123456789abcdef" },
                },
              },
            }),
          },
        ],
      },
      { upload }
    );
    expect(toolPayload(rejected).isError).toBe(true);
    expect(toolPayload(rejected).content[0].text).toMatch(/mcp\.json/);
    expect(toolPayload(rejected).content[0].text).toMatch(/\$\{env:/);
    expect(upload).not.toHaveBeenCalled();

    const accepted = await callTool(
      "push",
      {
        agent: "cursor",
        files: [
          {
            path: "mcp/mcp.json",
            content: JSON.stringify({
              mcpServers: {
                davflare: {
                  url: "https://example.com/mcp",
                  headers: { Authorization: "Bearer ${env:DAVFLARE_API_KEY}" },
                },
              },
            }),
          },
        ],
      },
      { upload }
    );
    expect(toolPayload(accepted).isError).toBeFalsy();
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "agents/cursor/mcp",
        name: "mcp.json",
        overwrite: true,
      })
    );
  });

  test("publish_site copies into sites/{slug}/ and respects sites flag", async () => {
    const trees: Record<string, Array<{ key: string; name: string; isDir: boolean }>> = {
      "draft/hello": [
        { key: "draft/hello/index.html", name: "index.html", isDir: false },
        { key: "draft/hello/css", name: "css", isDir: true },
      ],
      "draft/hello/css": [{ key: "draft/hello/css/app.css", name: "app.css", isDir: false }],
    };
    const list = jest.fn(async ({ path }: { path: string }) => {
      const items = trees[path.replace(/\/+$/, "")];
      if (!items) return new Response("目录不存在", { status: 404 });
      return httpJsonResponse({ items });
    });
    const copy = jest.fn(async () => httpJsonResponse({ copied: true }));
    const copied = await callTool(
      "publish_site",
      { slug: "hello", source: "draft/hello" },
      { list, copy, sitesEnabled: async () => true }
    );
    expect(toolPayload(copied).isError).toBeFalsy();
    const payload = JSON.parse(toolPayload(copied).content[0].text);
    expect(payload.slug).toBe("hello");
    expect(payload.copied).toBe(2);
    expect(copy).toHaveBeenCalledWith({
      from: "draft/hello/index.html",
      to: "sites/hello/index.html",
      overwrite: true,
    });
    expect(copy).toHaveBeenCalledWith({
      from: "draft/hello/css/app.css",
      to: "sites/hello/css/app.css",
      overwrite: true,
    });

    const blocked = await callTool(
      "publish_site",
      { slug: "hello", source: "draft/hello" },
      { list, copy, sitesEnabled: async () => false }
    );
    expect(toolPayload(blocked).isError).toBe(true);
    expect(toolPayload(blocked).content[0].text).toMatch(/404/);
    expect(copy).toHaveBeenCalledTimes(2);
  });

  test("image_upload/list/delete wrap /api/images and respect flag", async () => {
    const id = "a".repeat(32);
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const imageUpload = jest.fn(async (query: { name: string; body: Uint8Array }) => {
      expect(query.name).toBe("dot.png");
      expect(query.body.byteLength).toBeGreaterThan(0);
      return httpJsonResponse(
        {
          id,
          name: query.name,
          size: query.body.byteLength,
          url: `https://sites.example.com/i/${id}`,
          markdown: `![](https://sites.example.com/i/${id})`,
        },
        201
      );
    });
    const uploaded = await callTool(
      "image_upload",
      { name: "dot.png", content: png, encoding: "base64" },
      { imageUpload, imageHostEnabled: async () => true }
    );
    const payload = JSON.parse(toolPayload(uploaded).content[0].text);
    expect(payload.url).toBe(`https://sites.example.com/i/${id}`);
    expect(payload.markdown).toContain("/i/");
    expect(imageUpload).toHaveBeenCalled();

    const listed = await callTool("image_list", {}, {
      imageList: async () => httpJsonResponse({ images: [{ id, url: payload.url, markdown: payload.markdown }] }),
      imageHostEnabled: async () => true,
    });
    expect(toolPayload(listed).content[0].text).toContain(id);

    const deleted = await callTool("image_delete", { id }, {
      imageDelete: async (query) => {
        expect(query.id).toBe(id);
        return httpJsonResponse({ id, deleted: true });
      },
      imageHostEnabled: async () => true,
    });
    expect(toolPayload(deleted).content[0].text).toContain('"deleted":true');

    const blocked = await callTool(
      "image_upload",
      { name: "dot.png", content: png },
      { imageHostEnabled: async () => false }
    );
    expect(toolPayload(blocked).isError).toBe(true);
  });

});
