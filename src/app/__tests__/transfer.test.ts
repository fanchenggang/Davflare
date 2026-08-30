import {
  collectFilesFromDataTransfer,
  copyPaste,
  createFolder,
  davHrefToKey,
  ensureParentDirs,
  fetchFolderCounts,
  fetchPath,
  processTransferTask,
  searchFiles,
} from "../transfer";
import { authFetch } from "../auth";
import { setLang } from "../strings";

jest.mock("p-limit", () => ({
  __esModule: true,
  default: () => (fn: () => Promise<unknown>) => fn(),
}));

jest.mock("../auth", () => ({
  authFetch: jest.fn(),
  basicAuthHeader: jest.fn(),
}));

const mockAuthFetch = authFetch as unknown as jest.Mock;

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function xmlResponse(body: string, ok = true) {
  return {
    ok,
    status: ok ? 207 : 500,
    headers: { get: (n: string) => (n.toLowerCase() === "content-type" ? "application/xml; charset=utf-8" : null) },
    text: async () => body,
  } as unknown as Response;
}

const XML_ONE_FILE = `<?xml version="1.0" encoding="utf-8"?>
<multistatus>
  <response>
    <href>/webdav/</href>
    <propstat>
      <prop>
        <resourcetype><collection/></resourcetype>
        <getcontenttype>application/x-directory</getcontenttype>
      </prop>
    </propstat>
  </response>
  <response>
    <href>/webdav/a.txt</href>
    <propstat>
      <prop>
        <resourcetype/>
        <getcontenttype>text/plain</getcontenttype>
        <getcontentlength>12</getcontentlength>
        <getlastmodified>Mon, 01 Jan 2026 00:00:00 GMT</getlastmodified>
      </prop>
    </propstat>
  </response>
</multistatus>`;

beforeEach(() => {
  mockAuthFetch.mockReset();
});

describe("transfer / davHrefToKey", () => {
  test("相对路径", () => {
    expect(davHrefToKey("/webdav/a/b.txt")).toBe("a/b.txt");
    expect(davHrefToKey("/webdav/")).toBe("");
    expect(davHrefToKey("")).toBe("");
  });

  test("绝对 URL 与编码解码", () => {
    expect(davHrefToKey("https://x.example/webdav/a%20b/%E4%B8%AD.txt")).toBe("a b/中.txt");
    expect(davHrefToKey("https://x.example/webdav/a/b/")).toBe("a/b");
  });

  test("无 /webdav/ 前缀时按路径处理", () => {
    expect(davHrefToKey("/a/b.txt")).toBe("a/b.txt");
    expect(davHrefToKey("a/b.txt")).toBe("a/b.txt");
    expect(davHrefToKey("/webdav")).toBe("");
  });
});

describe("transfer / fetchPath", () => {
  test("解析 PROPFIND XML 并过滤当前目录", async () => {
    mockAuthFetch.mockResolvedValue(xmlResponse(XML_ONE_FILE));
    const items = await fetchPath("");
    expect(mockAuthFetch).toHaveBeenCalledWith("/webdav/", {
      method: "PROPFIND",
      headers: { Depth: "1" },
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      key: "a.txt",
      name: "a.txt",
      isDir: false,
      size: 12,
      contentType: "text/plain",
      uploaded: "Mon, 01 Jan 2026 00:00:00 GMT",
    });
  });

  test("非 XML 响应抛错", async () => {
    mockAuthFetch.mockResolvedValue(jsonResponse({}, true));
    await expect(fetchPath("")).rejects.toThrow("Invalid response");
  });
});

describe("transfer / searchFiles", () => {
  test("映射搜索结果字段", async () => {
    mockAuthFetch.mockResolvedValue(jsonResponse({
      items: [
        { key: "docs/a.txt", size: 3, uploaded: "2026-01-01", contentType: "text/plain", thumbnail: null },
        { key: "docs/", size: 0, uploaded: null, contentType: "application/x-directory" },
      ],
      hasMore: true,
      nextCursor: "c1",
    }));
    const res = await searchFiles("a", "c0", 50);
    expect(mockAuthFetch.mock.calls[0][0]).toBe("/api/search?q=a&limit=50&cursor=c0");
    expect(res.items[0]).toMatchObject({ key: "docs/a.txt", name: "a.txt", isDir: false });
    expect(res.items[1]).toMatchObject({ key: "docs/", name: "docs", isDir: true });
    expect(res.nextCursor).toBe("c1");
  });

  test("失败抛错", async () => {
    mockAuthFetch.mockResolvedValue(jsonResponse({}, false, 500));
    await expect(searchFiles("a")).rejects.toThrow("Search failed");
  });
});

describe("transfer / fetchFolderCounts", () => {
  test("并发统计并静默失败项", async () => {
    const xmlFor = (path: string) => `<?xml version="1.0"?><multistatus>
  <response><href>/webdav/${path}/</href><propstat><prop><resourcetype><collection/></resourcetype></prop></propstat></response>
  <response><href>/webdav/${path}/a.txt</href><propstat><prop><getcontenttype>text/plain</getcontenttype><getcontentlength>1</getcontentlength></prop></propstat></response>
</multistatus>`;
    mockAuthFetch.mockImplementation(async (url: string) => {
      const path = String(url).split("/webdav/")[1] ?? "";
      if (path.includes("bad")) return jsonResponse({}, false, 500);
      return xmlResponse(xmlFor(path));
    });
    const counts = await fetchFolderCounts(["a", "bad"], 2);
    expect(counts).toEqual({ a: 1 });
  });
});

describe("transfer / createFolder", () => {
  beforeEach(() => setLang("zh"));

  test("空名称与斜杠名称报错", async () => {
    await expect(createFolder("", "  ")).rejects.toThrow("请输入文件夹名称");
    await expect(createFolder("", "a/b")).rejects.toThrow("文件夹名称不能包含 /");
  });

  test("成功 MKCOL", async () => {
    mockAuthFetch.mockResolvedValue({ ok: true, status: 201 } as unknown as Response);
    await createFolder("docs/", "notes");
    expect(mockAuthFetch).toHaveBeenCalledWith("/webdav/docs/notes", { method: "MKCOL" });
  });

  test("MKCOL 失败抛错", async () => {
    mockAuthFetch.mockResolvedValue({ ok: false, status: 405, text: async () => "no" } as unknown as Response);
    await expect(createFolder("", "notes")).rejects.toThrow("新建文件夹失败");
  });
});

describe("transfer / copyPaste", () => {
  beforeEach(() => setLang("zh"));

  test("COPY 与 MOVE 使用不同方法并设置 Destination", async () => {
    mockAuthFetch.mockResolvedValue({ ok: true, status: 200 } as unknown as Response);

    await copyPaste("a.txt", "b.txt");
    let [url, init] = mockAuthFetch.mock.calls[0];
    expect(url).toBe("/webdav/a.txt");
    expect(init.method).toBe("COPY");
    expect(String(init.headers.Destination)).toContain("/webdav/b.txt");

    mockAuthFetch.mockReset();
    mockAuthFetch.mockResolvedValue({ ok: true, status: 200 } as unknown as Response);
    await copyPaste("a.txt", "b.txt", true);
    [url, init] = mockAuthFetch.mock.calls[0];
    expect(init.method).toBe("MOVE");
  });

  test("失败抛错", async () => {
    mockAuthFetch.mockResolvedValue({ ok: false, status: 409, text: async () => "x" } as unknown as Response);
    await expect(copyPaste("a", "b")).rejects.toThrow("复制失败");
  });
});

describe("transfer / ensureParentDirs", () => {
  test("逐级 MKCOL，重复目录跳过", async () => {
    mockAuthFetch.mockResolvedValue({ ok: true, status: 201 } as unknown as Response);
    await ensureParentDirs("a/b/c/file.txt");
    expect(mockAuthFetch).toHaveBeenCalledTimes(3);
    expect(mockAuthFetch.mock.calls[0][0]).toBe("/webdav/a");
    expect(mockAuthFetch.mock.calls[1][0]).toBe("/webdav/a/b");
    expect(mockAuthFetch.mock.calls[2][0]).toBe("/webdav/a/b/c");

    mockAuthFetch.mockClear();
    await ensureParentDirs("a/b/c/file2.txt");
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });

  test("MKCOL 失败被忽略", async () => {
    mockAuthFetch.mockRejectedValue(new Error("405"));
    await expect(ensureParentDirs("x/y/file.txt")).resolves.toBeUndefined();
  });
});

describe("transfer / collectFilesFromDataTransfer", () => {
  test("files 非空直接返回", async () => {
    const file = new File(["a"], "a.txt");
    const dt = { files: [file], items: [] } as unknown as DataTransfer;
    await expect(collectFilesFromDataTransfer(dt)).resolves.toEqual([file]);
  });

  test("无文件无 items 返回空", async () => {
    const dt = { files: [], items: [] } as unknown as DataTransfer;
    await expect(collectFilesFromDataTransfer(dt)).resolves.toEqual([]);
  });

  test("items 无 webkitGetAsEntry 返回空", async () => {
    const dt = { files: [], items: [{}] } as unknown as DataTransfer;
    await expect(collectFilesFromDataTransfer(dt)).resolves.toEqual([]);
  });
});

describe("transfer / processTransferTask", () => {
  test("非上传任务抛 Invalid task", async () => {
    await expect(
      processTransferTask({ task: { type: "download" } as any })
    ).rejects.toThrow("Invalid task");
  });

  test("已取消 signal 抛 AbortError", async () => {
    const controller = new AbortController();
    controller.abort();
    const file = new File(["a"], "a.txt", { type: "text/plain" });
    await expect(
      processTransferTask({ task: { type: "upload", remoteKey: "a.txt", file } as any, signal: controller.signal })
    ).rejects.toThrow("Aborted");
  });
});
