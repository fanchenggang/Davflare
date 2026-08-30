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
  MCP_TOOL_NAMES,
  MCP_TOOLS,
  MCP_UPLOAD_PART_SIZE,
  decodeUploadContent,
  dispatchMcpRequest,
  parseJsonRpcBody,
  type JsonRpcRequest,
  type ToolCallApis,
} from "../../../functions/_mcp";

function rpc(partial: Partial<JsonRpcRequest> & { method: string }): JsonRpcRequest {
  const hasId = partial.hasId !== undefined ? partial.hasId : true;
  return {
    jsonrpc: "2.0",
    id: hasId ? (partial.id ?? 1) : undefined,
    method: partial.method,
    params: partial.params,
    hasId,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function mockApis(overrides: Partial<ToolCallApis> = {}): ToolCallApis {
  return {
    list: async () => jsonResponse({ items: [] }),
    upload: async () => jsonResponse({ key: "notes.txt", overwritten: false }, 201),
    download: async () => new Response("hello", { status: 200, headers: { "Content-Type": "text/plain" } }),
    mkdir: async () => jsonResponse({ key: "folder/", created: true }, 201),
    delete: async () => jsonResponse({ key: "notes.txt", deleted: true, soft: true }),
    search: async () => jsonResponse({ matches: [], nextCursor: null }),
    move: async () => jsonResponse({ from: "a", to: "b", kind: "file" }),
    copy: async () => jsonResponse({ from: "a", to: "b", copied: true }),
    stat: async () => jsonResponse({ key: "a.txt", kind: "file", size: 5 }),
    downloadRange: async () => new Response("hello", {
      status: 206,
      headers: { "Content-Type": "application/octet-stream" },
    }),
    uploadStart: async () => jsonResponse({ key: "big.bin", uploadId: "uid-1" }, 201),
    uploadPart: async () => jsonResponse({ partNumber: 1, etag: "etag-1" }),
    uploadComplete: async () => jsonResponse({ key: "big.bin", size: 10 }),
    uploadAbort: async () => new Response(null, { status: 204 }),
    shareCreate: async () => jsonResponse({ token: "tok-1", url: "http://x/share/tok-1" }, 201),
    shareList: async () => jsonResponse([]),
    shareRevoke: async () => new Response(null, { status: 204 }),
    sitesList: async () => jsonResponse({ sitesHost: "sites.example.com", sites: [] }),
    sitesConfig: async () => jsonResponse({ slug: "demo", spa: true }),
    sitesDelete: async () => jsonResponse({ slug: "demo", deleted: 2 }),
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
  test("tool catalog: base + search/move/copy/stat/share/sites", () => {
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
    ]);
    expect(MCP_TOOLS).toHaveLength(15);
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
        uploadStart: async ({ key }) => jsonResponse({ key, uploadId: "uid-42" }, 201),
        uploadPart: async ({ partNumber, body }) => {
          parts.push({ partNumber, body });
          return jsonResponse({ partNumber, etag: `etag-${partNumber}` });
        },
        uploadComplete: async ({ uploadId, parts: completed }) => {
          expect(uploadId).toBe("uid-42");
          expect(completed).toHaveLength(2);
          return jsonResponse({ key: "docs/big.bin", size: content.length });
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
            jsonResponse({ key: "big.bin", kind: "file", size: big.length }),
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
      list: async () => jsonResponse({ items: [{ key: "a.txt", isDir: false }] }),
    });
    const body = toolPayload(result);
    expect(body.isError).toBeFalsy();
    expect(JSON.parse(body.content[0].text).items[0].key).toBe("a.txt");
  });

  test("search/move/copy/stat forward arguments", async () => {
    const search = jest.fn(async () => jsonResponse({ matches: [{ key: "a.txt" }] }));
    const searchResult = await callTool("search", { query: "a.txt", limit: 10 }, { search });
    expect(search).toHaveBeenCalledWith({ query: "a.txt", limit: 10, cursor: undefined });
    expect(JSON.parse(toolPayload(searchResult).content[0].text).matches).toHaveLength(1);

    const move = jest.fn(async () => jsonResponse({ from: "a", to: "b" }));
    await callTool("move", { from: "a", to: "b", overwrite: true }, { move });
    expect(move).toHaveBeenCalledWith({ from: "a", to: "b", overwrite: true });

    const copy = jest.fn(async () => jsonResponse({ copied: true }));
    await callTool("copy", { from: "a", to: "b" }, { copy });
    expect(copy).toHaveBeenCalledWith({ from: "a", to: "b", overwrite: undefined });

    const stat = jest.fn(async () => jsonResponse({ kind: "file", size: 3 }));
    await callTool("stat", { path: "a.txt" }, { stat });
    expect(stat).toHaveBeenCalledWith({ path: "a.txt" });
  });

  test("share tools create, list, revoke", async () => {
    const shareCreate = jest.fn(async () => jsonResponse({ token: "tok-1" }, 201));
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

    const shareList = jest.fn(async () => jsonResponse([{ token: "tok-1" }]));
    const listed = await callTool("share_list", {}, { shareList });
    expect(shareList).toHaveBeenCalledTimes(1);
    expect(JSON.parse(toolPayload(listed).content[0].text)).toHaveLength(1);

    const shareRevoke = jest.fn(async () => new Response(null, { status: 204 }));
    await callTool("share_revoke", { token: "tok-1" }, { shareRevoke });
    expect(shareRevoke).toHaveBeenCalledWith({ token: "tok-1" });
  });

  test("share_create rejects missing path and short codes are left to the API", async () => {
    const shareCreate = jest.fn(async () => jsonResponse({ token: "t" }, 201));
    const missing = await callTool("share_create", {}, { shareCreate });
    expect(toolPayload(missing).isError).toBe(true);
    expect(shareCreate).not.toHaveBeenCalled();
  });

  test("sites tools list/config/delete", async () => {
    const sitesList = jest.fn(async () =>
      jsonResponse({ sitesHost: "sites.example.com", sites: [{ slug: "demo", spa: false }] })
    );
    const listed = await callTool("sites_list", {}, { sitesList });
    expect(sitesList).toHaveBeenCalledWith({ withStats: true });
    expect(JSON.parse(toolPayload(listed).content[0].text).sites[0].slug).toBe("demo");

    const sitesConfig = jest.fn(async () => jsonResponse({ slug: "demo", spa: true }));
    await callTool("sites_config", { slug: "demo", spa: true }, { sitesConfig });
    expect(sitesConfig).toHaveBeenCalledWith({ slug: "demo", spa: true });

    const sitesDelete = jest.fn(async () => jsonResponse({ slug: "demo", deleted: 3 }));
    await callTool("sites_delete", { slug: "demo", purge: true }, { sitesDelete });
    expect(sitesDelete).toHaveBeenCalledWith({ slug: "demo", purge: true });
  });

  test("sites_config requires slug and spa", async () => {
    const sitesConfig = jest.fn(async () => jsonResponse({ slug: "demo", spa: true }));
    const missing = await callTool("sites_config", { slug: "demo" }, { sitesConfig });
    expect(toolPayload(missing).isError).toBe(true);
    expect(sitesConfig).not.toHaveBeenCalled();
  });
});
