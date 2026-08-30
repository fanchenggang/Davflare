import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, DavflareClient } from "../src/client.js";

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DavflareClient.walk", () => {
  it("分页目录会继续请求 nextCursor，而不是重复第一页", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: any) => {
        const url = new URL(String(input));
        const path = url.searchParams.get("path") ?? "";
        const cursor = url.searchParams.get("cursor");
        calls.push(`${path}|${cursor ?? ""}`);
        if (path === "" && !cursor) {
          return jsonResponse({
            items: [
              { key: "a0", name: "a0", isDir: false, size: 1, uploaded: "" },
              { key: "a1", name: "a1", isDir: false, size: 1, uploaded: "" },
            ],
            nextCursor: "cur1",
          });
        }
        if (path === "" && cursor === "cur1") {
          return jsonResponse({
            items: [
              { key: "a2", name: "a2", isDir: false, size: 1, uploaded: "" },
            ],
            nextCursor: undefined,
          });
        }
        throw new Error(`unexpected call: ${path}|${cursor}`);
      })
    );

    const client = new DavflareClient("https://example.com", "k");
    const keys: string[] = [];
    for await (const entry of client.walk("")) {
      keys.push(entry.key);
      if (keys.length > 10) break;
    }
    expect(keys).toEqual(["a0", "a1", "a2"]);
    expect(calls).toEqual(["|", "|cur1"]);
  });

  it("子目录 404 时跳过该目录并继续处理队列中的其他目录", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: any) => {
        const url = new URL(String(input));
        const path = url.searchParams.get("path") ?? "";
        if (path === "") {
          return jsonResponse({
            items: [
              { key: "missing", name: "missing", isDir: true, size: 0, uploaded: "" },
              { key: "ok", name: "ok", isDir: true, size: 0, uploaded: "" },
            ],
            nextCursor: undefined,
          });
        }
        if (path === "missing/") {
          throw new ApiError(404, "Not Found");
        }
        if (path === "ok/") {
          return jsonResponse({
            items: [
              { key: "ok/file.txt", name: "file.txt", isDir: false, size: 1, uploaded: "" },
            ],
            nextCursor: undefined,
          });
        }
        throw new Error(`unexpected call: ${path}`);
      })
    );

    const client = new DavflareClient("https://example.com", "k");
    const keys: string[] = [];
    for await (const entry of client.walk("")) {
      keys.push(entry.key);
    }
    expect(keys).toEqual(["ok/file.txt"]);
  });
});
