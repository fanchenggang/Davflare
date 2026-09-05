import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { ApiError, DavflareClient } from "../src/client.js";

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textRes(text: string, status = 200): Response {
  return new Response(text, { status });
}

const SERVER = "https://example.com";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DavflareClient 元操作（URL/方法/鉴权）", () => {
  it("listPage 带 path/limit/cursor 参数并解析 JSON", async () => {
    const fetchMock = vi.fn(async () =>
      jsonRes({ items: [{ key: "a.txt", name: "a.txt", isDir: false, size: 1, uploaded: "" }] })
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new DavflareClient(SERVER, "k1");
    const page = await client.listPage("docs/", "c1", 500);

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe("/api/list");
    expect(url.searchParams.get("path")).toBe("docs/");
    expect(url.searchParams.get("limit")).toBe("500");
    expect(url.searchParams.get("cursor")).toBe("c1");
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers.Authorization).toBe("Bearer k1");
    expect(page.items[0].key).toBe("a.txt");
  });

  it("mkdir/remove/move/backup/search 走对应端点", async () => {
    const fetchMock = vi.fn(async () => jsonRes({}));
    vi.stubGlobal("fetch", fetchMock);

    const client = new DavflareClient(SERVER, "k1");
    await client.mkdir("docs/new");
    await client.remove("a.txt");
    await client.remove("gone.txt", true);
    await client.move("a.txt", "b.txt", true);
    await client.backup("folder/notes.txt");
    await client.search("hello");

    const calls = fetchMock.mock.calls.map(([input, init]) => {
      const url = new URL(String(input));
      return {
        method: init.method as string,
        pathname: url.pathname,
        params: Object.fromEntries(url.searchParams.entries()),
        body: init.body ? String(init.body) : undefined,
      };
    });

    expect(calls[0]).toMatchObject({ method: "POST", pathname: "/api/mkdir" });
    expect(JSON.parse(calls[0].body!)).toEqual({ path: "docs/new" });
    expect(calls[1]).toMatchObject({ method: "DELETE", pathname: "/api/delete", params: { path: "a.txt", soft: "1" } });
    expect(calls[2]).toMatchObject({ method: "DELETE", params: { path: "gone.txt", soft: "0" } });
    expect(calls[3]).toMatchObject({ method: "POST", pathname: "/api/rename" });
    expect(JSON.parse(calls[3].body!)).toEqual({ from: "a.txt", to: "b.txt", overwrite: true });
    expect(calls[4]).toMatchObject({ method: "POST", pathname: "/api/backup", params: { path: "folder/notes.txt" } });
    expect(calls[5]).toMatchObject({ method: "GET", pathname: "/api/search", params: { q: "hello", limit: "100" } });
  });

  it("stat 返回 JSON 对象", async () => {
    const fetchMock = vi.fn(async () => jsonRes({ key: "a.txt", kind: "file", size: 3 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new DavflareClient(SERVER, "k1");
    await expect(client.stat("a.txt")).resolves.toMatchObject({ kind: "file", size: 3 });
  });
});

describe("ApiError（非 2xx）", () => {
  it("非 2xx 且响应有文本时抛出响应文本", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => textRes("boom", 500)));
    const client = new DavflareClient(SERVER, "k1");
    const err = await client.listPage("").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(500);
    expect(err.message).toBe("boom");
  });

  it("非 2xx 且响应体为空时回退 HTTP <status>", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => textRes("  ", 503)));
    const client = new DavflareClient(SERVER, "k1");
    const err = await client.listPage("").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(503);
    expect(err.message).toBe("HTTP 503");
  });
});

describe("uploadFile（单发小文件）", () => {
  it("按 path=目录 + X-File-Name 上传原始体并上报进度", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "davflare-up-"));
    const local = path.join(dir, "note.txt");
    fs.writeFileSync(local, "hello");

    const fetchMock = vi.fn(async () => jsonRes({ key: "docs/note.txt" }, 201));
    vi.stubGlobal("fetch", fetchMock);

    const onProgress = vi.fn();
    const client = new DavflareClient(SERVER, "k1");
    await client.uploadFile(local, "docs/note.txt", onProgress);

    const [input, init] = fetchMock.mock.calls[0];
    const url = new URL(String(input));
    expect(url.pathname).toBe("/api/upload");
    expect(url.searchParams.get("path")).toBe("docs/");
    expect(url.searchParams.get("overwrite")).toBe("1");
    expect(init.method).toBe("POST");
    expect(init.headers["X-File-Name"]).toBe("note.txt");
    expect(init.headers["Content-Type"]).toBe("application/octet-stream");
    expect(Buffer.from(init.body).toString()).toBe("hello");
    expect(onProgress).toHaveBeenCalledWith(5, 5);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("根目录文件 folder 为空串", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "davflare-up-"));
    const local = path.join(dir, "top.txt");
    fs.writeFileSync(local, "x");

    const fetchMock = vi.fn(async () => jsonRes({}, 201));
    vi.stubGlobal("fetch", fetchMock);

    const client = new DavflareClient(SERVER, "k1");
    await client.uploadFile(local, "top.txt");

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("path")).toBe("");
    expect(fetchMock.mock.calls[0][1].headers["X-File-Name"]).toBe("top.txt");

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("uploadFile（>=100MB 三段式分块）", () => {
  const TOTAL = 100 * 1000 * 1000; // 与 client 内 SINGLE_UPLOAD_LIMIT 一致
  const PART = 8 * 1000 * 1000;
  let bigFile: string;
  let bigDir: string;

  beforeAll(() => {
    bigDir = fs.mkdtempSync(path.join(os.tmpdir(), "davflare-big-"));
    bigFile = path.join(bigDir, "big.bin");
    const buf = Buffer.alloc(TOTAL, 0x61);
    buf[0] = 0;
    fs.writeFileSync(bigFile, buf);
  });

  afterAll(() => {
    fs.rmSync(bigDir, { recursive: true, force: true });
  });

  it("按 8MB 分块走 create → PUT parts → complete", async () => {
    const parts: Array<{ partNumber: number; size: number }> = [];
    let completeBody: { parts: Array<{ partNumber: number; etag: string }> } | undefined;
    let deleteCalls = 0;
    const fetchMock = vi.fn(async (input: any, init: any = {}) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/upload" && url.searchParams.get("uploads") === "1") {
        return jsonRes({ uploadId: "u-1" }, 201);
      }
      if (url.pathname === "/api/upload" && init.method === "PUT") {
        const partNumber = Number(url.searchParams.get("partNumber"));
        parts.push({ partNumber, size: (init.body as Uint8Array).byteLength });
        return jsonRes({ partNumber, etag: `etag-${partNumber}` });
      }
      if (url.pathname === "/api/upload" && init.method === "POST") {
        completeBody = JSON.parse(String(init.body));
        return jsonRes({ key: "big.bin", size: TOTAL });
      }
      deleteCalls += 0;
      throw new Error(`unexpected ${init.method} ${url.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const progress: Array<[number, number]> = [];
    const client = new DavflareClient(SERVER, "k1");
    await client.uploadFile(bigFile, "big.bin", (sent, total) => progress.push([sent, total]));

    expect(parts.map((p) => p.partNumber)).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
    expect(parts[0].size).toBe(PART);
    expect(parts[12].size).toBe(TOTAL - PART * 12);
    expect(completeBody?.parts).toHaveLength(13);
    expect(completeBody?.parts[0]).toEqual({ partNumber: 1, etag: "etag-1" });
    expect(completeBody?.parts[12]).toEqual({ partNumber: 13, etag: "etag-13" });
    expect(progress.at(-1)).toEqual([TOTAL, TOTAL]);
    expect(deleteCalls).toBe(0);
  });

  it("分块失败时 abort 清理并抛出原始错误", async () => {
    const abortCalls: Array<{ path: string | null; uploadId: string | null }> = [];
    const fetchMock = vi.fn(async (input: any, init: any = {}) => {
      const url = new URL(String(input));
      if (url.searchParams.get("uploads") === "1") {
        return jsonRes({ uploadId: "u-2" }, 201);
      }
      if (init.method === "PUT") {
        const partNumber = Number(url.searchParams.get("partNumber"));
        if (partNumber === 2) return textRes("part boom", 500);
        return jsonRes({ partNumber, etag: `etag-${partNumber}` });
      }
      if (init.method === "DELETE") {
        abortCalls.push({
          path: url.searchParams.get("path"),
          uploadId: url.searchParams.get("uploadId"),
        });
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected ${init.method}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new DavflareClient(SERVER, "k1");
    const err = await client.uploadFile(bigFile, "big.bin").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(500);
    expect(err.message).toBe("part boom");
    expect(abortCalls).toEqual([{ path: "big.bin", uploadId: "u-2" }]);
  });
});

describe("downloadFile（Range 断点续传）", () => {
  const TOTAL = 11; // "hello world"
  const statRes = () => jsonRes({ key: "a.txt", kind: "file", size: TOTAL });
  let dir: string;
  let local: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "davflare-dl-"));
    local = path.join(dir, "a.txt");
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function mockDownload(body: string, status = 200) {
    const downloads: Array<{ range?: string }> = [];
    const fetchMock = vi.fn(async (input: any, init: any = {}) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/stat") return statRes();
      if (url.pathname === "/api/download") {
        downloads.push({ range: init.headers?.Range });
        return textRes(body, status);
      }
      throw new Error(`unexpected ${url.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    return { fetchMock, downloads };
  }

  it("stat 非 file 抛 ApiError(400)", async () => {
    const fetchMock = vi.fn(async () => jsonRes({ key: "a.txt", kind: "dir" }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new DavflareClient(SERVER, "k1");
    const err = await client.downloadFile("a.txt", local).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.message).toContain("不是文件");
  });

  it("本地无文件时全量下载（无 Range 头）", async () => {
    const { fetchMock, downloads } = mockDownload("hello world", 200);
    const client = new DavflareClient(SERVER, "k1");
    const onProgress = vi.fn();
    const resumed = await client.downloadFile("a.txt", local, onProgress);

    expect(resumed).toBe(false);
    expect(downloads).toEqual([{ range: undefined }]);
    expect(fs.readFileSync(local, "utf8")).toBe("hello world");
    expect(fetchMock).toHaveBeenCalledTimes(2); // stat + download
    expect(onProgress).toHaveBeenCalledWith(TOTAL, TOTAL);
  });

  it("本地有前缀时带 Range 续传并追加", async () => {
    fs.writeFileSync(local, "hello ");
    const { downloads } = mockDownload("world", 206);
    const client = new DavflareClient(SERVER, "k1");
    const resumed = await client.downloadFile("a.txt", local);

    expect(resumed).toBe(true);
    expect(downloads).toEqual([{ range: "bytes=6-" }]);
    expect(fs.readFileSync(local, "utf8")).toBe("hello world");
  });

  it("服务器不支持 Range（返回 200）时回退全量覆盖", async () => {
    fs.writeFileSync(local, "hello ");
    const { downloads } = mockDownload("hello world", 200);
    const client = new DavflareClient(SERVER, "k1");
    const resumed = await client.downloadFile("a.txt", local);

    expect(resumed).toBe(false);
    expect(downloads).toEqual([{ range: "bytes=6-" }]);
    expect(fs.readFileSync(local, "utf8")).toBe("hello world");
  });

  it("本地与远端等长时不发起下载", async () => {
    fs.writeFileSync(local, "hello world");
    const { fetchMock } = mockDownload("ignored");
    const client = new DavflareClient(SERVER, "k1");
    const resumed = await client.downloadFile("a.txt", local);

    expect(resumed).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1); // 仅 stat
    expect(fs.readFileSync(local, "utf8")).toBe("hello world");
  });

  it("本地比远端大时视为损坏，全量重下", async () => {
    fs.writeFileSync(local, "x".repeat(TOTAL + 9));
    const { downloads } = mockDownload("hello world", 200);
    const client = new DavflareClient(SERVER, "k1");
    const resumed = await client.downloadFile("a.txt", local);

    expect(resumed).toBe(false);
    expect(downloads).toEqual([{ range: undefined }]);
    expect(fs.readFileSync(local, "utf8")).toBe("hello world");
  });

  it("下载响应非 2xx 抛 ApiError", async () => {
    const fetchMock = vi.fn(async (input: any) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/stat") return statRes();
      return textRes("denied", 403);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new DavflareClient(SERVER, "k1");
    const err = await client.downloadFile("a.txt", local).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(403);
    expect(err.message).toBe("denied");
  });
});

describe("createKeyWithSession / revokeKey", () => {
  it("createKeyWithSession 用 Basic 会话凭据创建密钥", async () => {
    const fetchMock = vi.fn(async () => jsonRes({ key: "fd_new", id: "id9" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new DavflareClient(SERVER, "ignored");
    const created = await client.createKeyWithSession("alice", "s3cret", "cli-host");

    expect(created).toEqual({ key: "fd_new", id: "id9" });
    const [input, init] = fetchMock.mock.calls[0];
    expect(new URL(String(input)).pathname).toBe("/api/keys");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("alice:s3cret").toString("base64")}`);
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ name: "cli-host" });
  });

  it("createKeyWithSession 失败抛 ApiError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => textRes("bad login", 401)));
    const client = new DavflareClient(SERVER, "x");
    const err = await client.createKeyWithSession("a", "b", "n").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(err.message).toBe("bad login");
  });

  it("revokeKey DELETE /api/keys?id= 并消费响应体", async () => {
    const fetchMock = vi.fn(async () => jsonRes({ revoked: true }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new DavflareClient(SERVER, "k1");
    await expect(client.revokeKey("id9")).resolves.toBeUndefined();
    const [input, init] = fetchMock.mock.calls[0];
    const url = new URL(String(input));
    expect(url.pathname).toBe("/api/keys");
    expect(url.searchParams.get("id")).toBe("id9");
    expect(init.method).toBe("DELETE");
    expect(init.headers.Authorization).toBe("Bearer k1");
  });

  it("revokeKey 失败抛 ApiError（调用方尽力而为）", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => textRes("", 403)));
    const client = new DavflareClient(SERVER, "k1");
    const err = await client.revokeKey("id9").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe("HTTP 403");
  });
});
