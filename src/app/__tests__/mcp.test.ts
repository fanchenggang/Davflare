/// <reference types="node" />
import { TextDecoder, TextEncoder } from "util";
beforeAll(() => {
  (global as any).TextEncoder = TextEncoder;
  (global as any).TextDecoder = TextDecoder;
});

import {
  MCP_MAX_BYTES,
  MCP_PROTOCOL_VERSION,
  MCP_TOOL_NAMES,
  MCP_TOOLS,
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
    ...overrides,
  };
}

describe("mcp protocol", () => {
  test("five tools: list upload download mkdir delete", () => {
    expect(MCP_TOOL_NAMES).toEqual(["list", "upload", "download", "mkdir", "delete"]);
    expect(MCP_TOOLS).toHaveLength(5);
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

  test("tools/list returns the five tools", async () => {
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

  test("upload over 1 MiB is a tool error, not an API call", async () => {
    const upload = jest.fn();
    const result = await dispatchMcpRequest(
      rpc({
        method: "tools/call",
        params: {
          name: "upload",
          arguments: {
            name: "big.bin",
            content: "x".repeat(MCP_MAX_BYTES + 1),
            encoding: "utf8",
          },
        },
      }),
      mockApis({ upload })
    );
    expect(upload).not.toHaveBeenCalled();
    expect(result.kind).toBe("rpc");
    if (result.kind !== "rpc") return;
    const body = result.body.result as { isError?: boolean; content: { text: string }[] };
    expect(body.isError).toBe(true);
    expect(body.content[0].text).toMatch(/1 MiB/);
  });

  test("download over 1 MiB is a tool error", async () => {
    const result = await dispatchMcpRequest(
      rpc({ method: "tools/call", params: { name: "download", arguments: { path: "big.bin" } } }),
      mockApis({
        download: async () =>
          new Response("x".repeat(12), {
            status: 200,
            headers: { "Content-Length": String(MCP_MAX_BYTES + 1) },
          }),
      })
    );
    expect(result.kind).toBe("rpc");
    if (result.kind !== "rpc") return;
    const body = result.body.result as { isError?: boolean; content: { text: string }[] };
    expect(body.isError).toBe(true);
    expect(body.content[0].text).toMatch(/1 MiB/);
  });

  test("decodeUploadContent utf8 and base64", () => {
    const utf8 = decodeUploadContent("hi", "utf8");
    expect(utf8.ok).toBe(true);
    if (utf8.ok) expect(new TextDecoder().decode(utf8.bytes)).toBe("hi");
    const decoded = decodeUploadContent("aGk=", "base64");
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(new TextDecoder().decode(decoded.bytes)).toBe("hi");
  });

  test("list tool wraps API json", async () => {
    const result = await dispatchMcpRequest(
      rpc({ method: "tools/call", params: { name: "list", arguments: { path: "" } } }),
      mockApis({
        list: async () => jsonResponse({ items: [{ key: "a.txt", isDir: false }] }),
      })
    );
    expect(result.kind).toBe("rpc");
    if (result.kind !== "rpc") return;
    const body = result.body.result as { isError?: boolean; content: { text: string }[] };
    expect(body.isError).toBeFalsy();
    expect(JSON.parse(body.content[0].text).items[0].key).toBe("a.txt");
  });
});
