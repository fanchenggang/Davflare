import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  buildMcpJsonSnippet,
  loadStoredApiKey,
  mcpToolsList,
  mcpTryListRoot,
  parseToolCallPayload,
  parseToolsListPayload,
  storeApiKey,
} from "../mcpPlayground";

describe("mcpPlayground helpers", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  test("buildMcpJsonSnippet matches setup shape with placeholder or key", () => {
    const withPlaceholder = buildMcpJsonSnippet("https://example.com/");
    expect(JSON.parse(withPlaceholder)).toEqual({
      mcpServers: {
        davflare: {
          url: "https://example.com/mcp",
          headers: { Authorization: "Bearer <apiKey>" },
        },
      },
    });

    const withKey = buildMcpJsonSnippet("https://example.com", "fd_abc");
    expect(JSON.parse(withKey).mcpServers.davflare.headers.Authorization).toBe(
      "Bearer fd_abc"
    );
  });

  test("session store round-trips api key", () => {
    expect(loadStoredApiKey()).toBe("");
    storeApiKey("  fd_secret  ");
    expect(loadStoredApiKey()).toBe("fd_secret");
    storeApiKey("");
    expect(loadStoredApiKey()).toBe("");
  });

  test("parseToolsListPayload extracts tool names", () => {
    const tools = parseToolsListPayload({
      jsonrpc: "2.0",
      id: 1,
      result: {
        tools: [
          { name: "list", description: "List files" },
          { name: "upload" },
        ],
      },
    });
    expect(tools).toEqual([
      { name: "list", description: "List files" },
      { name: "upload", description: undefined },
    ]);
  });

  test("parseToolsListPayload throws on RPC error", () => {
    expect(() =>
      parseToolsListPayload({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32000, message: "nope" },
      })
    ).toThrow(/nope/);
  });

  test("parseToolCallPayload reads text content", () => {
    const parsed = parseToolCallPayload({
      jsonrpc: "2.0",
      id: 2,
      result: {
        content: [{ type: "text", text: '{"items":[]}' }],
      },
    });
    expect(parsed.isError).toBe(false);
    expect(parsed.text).toBe('{"items":[]}');
  });

  test("mcpToolsList posts JSON-RPC tools/list with Bearer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: { tools: [{ name: "list" }, { name: "stat" }] },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const tools = await mcpToolsList("fd_key");
    expect(tools.map((t) => t.name)).toEqual(["list", "stat"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/mcp$/);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer fd_key");
    expect(JSON.parse(init.body)).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
  });

  test("mcpTryListRoot posts tools/call list on root", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          result: {
            content: [{ type: "text", text: '{"items":[{"key":"a/"}]}' }],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await mcpTryListRoot("fd_key");
    expect(result.isError).toBe(false);
    expect(result.text).toContain("items");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "list", arguments: { path: "" } },
    });
  });

  test("mcpToolsList surfaces HTTP errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Unauthorized", { status: 401 }))
    );
    await expect(mcpToolsList("bad")).rejects.toThrow(/Unauthorized|401/);
  });

  test("mcpToolsList rejects empty key", async () => {
    await expect(mcpToolsList("   ")).rejects.toThrow(/API key is required/);
  });

  test("mcpToolsList surfaces JSON-RPC error body on HTTP failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "key expired" } }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    await expect(mcpToolsList("fd_x")).rejects.toThrow(/key expired/);
  });

  test("mcpToolsList rejects empty 200 body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 200 }))
    );
    await expect(mcpToolsList("fd_x")).rejects.toThrow(/Empty MCP response/);
  });

  test("mcpToolsList rejects non-JSON 200 body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not-json", { status: 200 }))
    );
    await expect(mcpToolsList("fd_x")).rejects.toThrow(/Empty MCP response/);
  });

  test("parseToolCallPayload throws on RPC error and isError flag", () => {
    expect(() =>
      parseToolCallPayload({
        jsonrpc: "2.0",
        id: 2,
        error: { code: -1, message: "boom" },
      })
    ).toThrow(/boom/);

    const flagged = parseToolCallPayload({
      jsonrpc: "2.0",
      id: 2,
      result: {
        isError: true,
        content: [{ type: "text", text: "tool failed" }],
      },
    });
    expect(flagged.isError).toBe(true);
    expect(flagged.text).toBe("tool failed");
  });

  test("parseToolsListPayload rejects invalid tool entries", () => {
    expect(() =>
      parseToolsListPayload({
        jsonrpc: "2.0",
        id: 1,
        result: { tools: [{ description: "no name" }] },
      })
    ).toThrow(/Invalid tool entry/);
  });
});
