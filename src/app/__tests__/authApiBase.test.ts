import { afterEach, describe, expect, it, vi } from "vitest";
import { authFetch, setApiBase } from "../auth";

// 扩展网盘视图依赖 authFetch 的 apiBase 拼接:扩展页没有同源后端,
// 相对路径必须拼到实例地址上;Web 端保持空 base,行为不变。
describe("authFetch apiBase", () => {
  afterEach(() => {
    setApiBase("");
    vi.unstubAllGlobals();
  });

  it("prepends apiBase to root-relative paths", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response("{}", { status: 200 });
    });

    setApiBase("https://drive.example.com");
    await authFetch("/api/counts", { method: "POST" });
    expect(calls[0]).toBe("https://drive.example.com/api/counts");

    await authFetch("/webdav/a%20b");
    expect(calls[1]).toBe("https://drive.example.com/webdav/a%20b");
  });

  it("leaves absolute URLs untouched", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response("{}", { status: 200 });
    });

    setApiBase("https://drive.example.com");
    await authFetch("https://other.example/x");
    expect(calls[0]).toBe("https://other.example/x");
  });

  it("keeps relative paths when apiBase is empty (web default)", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response("{}", { status: 200 });
    });

    setApiBase("");
    await authFetch("/api/stat");
    expect(calls[0]).toBe("/api/stat");
  });
});
