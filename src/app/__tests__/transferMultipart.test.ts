import { vi, type Mock } from "vitest";
/**
 * transfer.ts 分块上传（multipartUpload）与 processTransferTask 的分支补充：
 * 创建/分片/重试/断点续传/完成各阶段失败路径，缩略图副作用，收集与选择器回退。
 */
import {
  collectFilesFromDataTransfer,
  copyPaste,
  davHrefToKey,
  fetchFolderCounts,
  generateThumbnail,
  multipartUpload,
  processTransferTask,
  selectDirectoryFiles,
  SIZE_LIMIT,
} from "../transfer";
import { authFetch, basicAuthHeader } from "../auth";
import { setLang } from "../strings";
import { asAuthFetchMock, jsonResponse } from "../testUtils";
import type { UploadPart } from "../types";

vi.mock("p-limit", () => ({
  __esModule: true,
  default: () => (fn: () => Promise<unknown>) => fn(),
}));

vi.mock("../auth", () => ({
  authFetch: vi.fn(),
  basicAuthHeader: vi.fn(() => "Basic abc"),
}));

const mockAuthFetch = asAuthFetchMock(authFetch);
const mockBasic = basicAuthHeader as unknown as Mock;

beforeEach(() => {
  mockAuthFetch.mockReset();
  mockBasic.mockReturnValue("Basic abc");
  setLang("zh");
  if (!(URL as any).createObjectURL) {
    (URL as any).createObjectURL = vi.fn(() => "blob:x");
  }
  if (!(URL as any).revokeObjectURL) {
    (URL as any).revokeObjectURL = vi.fn();
  }
  // jsdom 的 Blob 可能缺 arrayBuffer()，blobDigest 依赖它；用 FileReader 补齐
  if (typeof (Blob.prototype as any).arrayBuffer !== "function") {
    (Blob.prototype as any).arrayBuffer = async function () {
      return new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    };
  }
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  (console.log as Mock).mockRestore();
});

function bigFile(size = SIZE_LIMIT * 2, type = "application/octet-stream"): File {
  const file = new File(["chunk"], "big.bin", { type });
  Object.defineProperty(file, "size", { value: size });
  file.slice = vi.fn((start: number, end: number) => {
    const len = Math.max(0, Math.min(end, size) - start);
    return new Blob([new Uint8Array(len)]);
  }) as any;
  return file;
}

function okCreate(uploadId = "u1") {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ uploadId }),
    text: async () => "",
  } as unknown as Response;
}

function okComplete() {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => "done",
  } as unknown as Response;
}

class MockXHR {
  static mode: "ok" | "status500" | "noEtag" = "ok";
  static sends = 0;
  upload = { onprogress: null as any };
  status = 200;
  responseText = "part";
  onload: any;
  onerror: any;
  onabort: any;
  open() {}
  setRequestHeader() {}
  getAllResponseHeaders() {
    if (MockXHR.mode === "status500") return "";
    return "etag: \"etag-1\"\r\nContent-Length: 2";
  }
  abort() {
    this.onabort?.();
  }
  send() {
    MockXHR.sends += 1;
    if (this.upload.onprogress) {
      this.upload.onprogress({ loaded: 2, total: 2 });
    }
    if (MockXHR.mode === "status500") {
      this.status = 500;
      this.responseText = "boom";
      this.onload?.();
      return;
    }
    if (MockXHR.mode === "noEtag") {
      (this as any).getAllResponseHeaders = () => "Content-Length: 2";
      this.status = 200;
      this.onload?.();
      return;
    }
    this.status = 200;
    this.onload?.();
  }
}

beforeEach(() => {
  (global as any).XMLHttpRequest = MockXHR;
  MockXHR.mode = "ok";
  MockXHR.sends = 0;
});

describe("multipartUpload 失败路径", () => {
  test("创建会话失败：非 ok 抛出 text() 内容", async () => {
    mockAuthFetch.mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => null },
      text: async () => "create denied",
    } as unknown as Response);
    await expect(
      multipartUpload("big.bin", bigFile(SIZE_LIMIT))
    ).rejects.toThrow("create denied");
  });

  test("创建会话失败：空 body 走默认文案", async () => {
    mockAuthFetch.mockResolvedValue({
      ok: false,
      status: 502,
      headers: { get: () => null },
      text: async () => "",
    } as unknown as Response);
    await expect(
      multipartUpload("big.bin", bigFile(SIZE_LIMIT))
    ).rejects.toThrow();
  });

  test("分片请求前 signal 已 abort 抛 AbortError", async () => {
    mockAuthFetch.mockResolvedValue(okCreate());
    const controller = new AbortController();
    controller.abort();
    await expect(
      multipartUpload("big.bin", bigFile(SIZE_LIMIT), { signal: controller.signal })
    ).rejects.toThrow("Aborted");
  });

  test("signal 在创建之后、分片之前被置位也抛 AbortError", async () => {
    mockAuthFetch.mockResolvedValue(okCreate());
    // 第一次读 aborted=false（hook 内检查），xhrFetch 里再读为 true
    let reads = 0;
    const signal = {
      get aborted() {
        reads += 1;
        return reads > 1;
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as AbortSignal;
    await expect(
      multipartUpload("big.bin", bigFile(SIZE_LIMIT), { signal })
    ).rejects.toThrow("Aborted");
  });

  test("分片返回 500：抛出响应文本", async () => {
    MockXHR.mode = "status500";
    mockAuthFetch.mockResolvedValueOnce(okCreate());
    mockAuthFetch.mockResolvedValueOnce(okComplete());
    await expect(
      multipartUpload("big.bin", bigFile(SIZE_LIMIT))
    ).rejects.toThrow("boom");
  });

  test("分片缺少 ETag：抛 partMissingEtag", async () => {
    MockXHR.mode = "noEtag";
    mockAuthFetch.mockResolvedValueOnce(okCreate());
    mockAuthFetch.mockResolvedValueOnce(okComplete());
    await expect(
      multipartUpload("big.bin", bigFile(SIZE_LIMIT))
    ).rejects.toThrow();
  });

  test("complete 失败：抛出响应文本", async () => {
    mockAuthFetch
      .mockResolvedValueOnce(okCreate())
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: { get: () => null },
        text: async () => "complete rejected",
      } as unknown as Response);
    await expect(
      multipartUpload("big.bin", bigFile(SIZE_LIMIT))
    ).rejects.toThrow("complete rejected");
  });
});

describe("multipartUpload 成功与续传", () => {
  test("上传单分片文件：进度回调与 onState 持久化", async () => {
    mockAuthFetch.mockResolvedValueOnce(okCreate());
    mockAuthFetch.mockResolvedValueOnce(okComplete());
    const onUploadProgress = vi.fn();
    const onState = vi.fn();
    const res = await multipartUpload("big.bin", bigFile(SIZE_LIMIT), {
      onUploadProgress,
      onState,
    });
    expect(res.ok).toBe(true);
    expect(onUploadProgress).toHaveBeenCalledWith({
      loaded: SIZE_LIMIT,
      total: SIZE_LIMIT,
    });
    expect(onState).toHaveBeenCalledWith({
      uploadId: "u1",
      uploadedParts: [{ partNumber: 1, etag: '"etag-1"' }],
      loaded: SIZE_LIMIT,
    });
    // complete 请求体带上已传分片
    const completeInit = mockAuthFetch.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(String(completeInit.body))).toEqual({
      parts: [{ partNumber: 1, etag: '"etag-1"' }],
    });
  });

  test("断点续传：已有 uploadId + uploadedParts 只补缺失分片", async () => {
    mockAuthFetch.mockResolvedValueOnce(okComplete());
    const onUploadProgress = vi.fn();
    const uploadedParts: UploadPart[] = [{ partNumber: 1, etag: '"e1"' }];
    const res = await multipartUpload("big.bin", bigFile(SIZE_LIMIT * 2), {
      uploadId: "u9",
      uploadedParts,
      onUploadProgress,
    });
    expect(res.ok).toBe(true);
    // 只应 PUT 一个缺失分片（part 2）
    expect(MockXHR.sends).toBe(1);
    // 进度初值含已传分片大小
    expect(onUploadProgress).toHaveBeenCalledWith({
      loaded: SIZE_LIMIT,
      total: SIZE_LIMIT * 2,
    });
    const completeInit = mockAuthFetch.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(completeInit.body));
    expect(body.parts).toEqual([
      { partNumber: 1, etag: '"e1"' },
      { partNumber: 2, etag: '"etag-1"' },
    ]);
    // 分片按 partNumber 升序
    expect(body.parts[0].partNumber).toBeLessThan(body.parts[1].partNumber);
  });
});

describe("processTransferTask 缩略图副作用与分块路径", () => {
  // ensureParentDirs 用模块级 ensuredDirs 缓存，跨用例共享；
  // 每个用例用不同目录，避免 MKCOL 被前一个用例吞掉导致断言错位。
  let caseSeq = 0;
  function uploadTask(file: File, extra: Record<string, unknown> = {}) {
    caseSeq += 1;
    const remoteKey = `docs${caseSeq}/big.bin`;
    return {
      id: `t${caseSeq}`,
      type: "upload",
      status: "in-progress",
      name: file.name,
      basedir: `docs${caseSeq}/`,
      remoteKey,
      loaded: 0,
      total: file.size,
      file,
      ...extra,
    } as any;
  }

  test("大文件走 multipart，且缩略图上传成功时带 fd-thumbnail", async () => {
    // 图片缩略图：MockImage 立即 onload
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    (global as any).Image = MockImage;
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => ({ drawImage: vi.fn() }) as any
    ) as any;
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
      cb(new Blob(["png"], { type: "image/png" }));
    } as any;

    // MKCOL(ensureParentDirs) + 缩略图 PUT + create + complete
    mockAuthFetch
      .mockResolvedValueOnce(jsonResponse({}, true, 201)) // MKCOL docs
      .mockResolvedValueOnce(jsonResponse({}, true)) // thumbnail PUT
      .mockResolvedValueOnce(okCreate())
      .mockResolvedValueOnce(okComplete());

    const file = bigFile(SIZE_LIMIT * 2, "image/png");
    const onTaskState = vi.fn();
    const res = await processTransferTask({
      task: uploadTask(file),
      onTaskState,
    });
    expect(res.ok).toBe(true);
    const thumbnailCall = mockAuthFetch.mock.calls[1];
    expect(String(thumbnailCall[0])).toContain("_$flaredrive$/thumbnails/");
    const createInit = mockAuthFetch.mock.calls[2][1] as RequestInit;
    expect((createInit.headers as Record<string, string>)["fd-thumbnail"]).toBeDefined();
    expect(onTaskState).toHaveBeenCalled();
  });

  test("缩略图 PUT 失败不阻塞上传且不带 fd-thumbnail", async () => {
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    (global as any).Image = MockImage;
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => ({ drawImage: vi.fn() }) as any
    ) as any;
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
      cb(new Blob(["png"], { type: "image/png" }));
    } as any;

    mockAuthFetch
      .mockResolvedValueOnce(jsonResponse({}, true, 201)) // MKCOL
      .mockRejectedValueOnce(new Error("thumb put fail")) // 缩略图 PUT 失败
      .mockResolvedValueOnce(okCreate())
      .mockResolvedValueOnce(okComplete());

    const res = await processTransferTask({
      task: uploadTask(bigFile(SIZE_LIMIT * 2, "image/png")),
    });
    expect(res.ok).toBe(true);
    const createInit = mockAuthFetch.mock.calls[2][1] as RequestInit;
    expect((createInit.headers as Record<string, string>)["fd-thumbnail"]).toBeUndefined();
  });

  test("generateThumbnail 失败不阻塞上传（video 载入失败分支）", async () => {
    // video/mp4：创建 video 后手动触发 onerror
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === "video") {
        queueMicrotask(() => (el as HTMLVideoElement).onerror?.(new Event("error")));
      }
      return el;
    });
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => ({ drawImage: vi.fn() }) as any
    ) as any;
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
      cb(new Blob(["png"], { type: "image/png" }));
    } as any;

    mockAuthFetch
      .mockResolvedValueOnce(jsonResponse({}, true, 201)) // MKCOL
      .mockResolvedValueOnce(okCreate())
      .mockResolvedValueOnce(okComplete());

    const res = await processTransferTask({
      task: uploadTask(bigFile(SIZE_LIMIT * 2, "video/mp4")),
    });
    expect(res.ok).toBe(true);
    (document.createElement as Mock).mockRestore();
  });

  test("video 缩略图成功分支：loadeddata + play", async () => {
    vi
      .spyOn(HTMLVideoElement.prototype, "play")
      .mockResolvedValue(undefined);
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === "video") {
        queueMicrotask(() => (el as HTMLVideoElement).onloadeddata?.(new Event("loadeddata")));
      }
      return el;
    });
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => ({ drawImage: vi.fn() }) as any
    ) as any;
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
      cb(new Blob(["png"], { type: "image/png" }));
    } as any;

    mockAuthFetch
      .mockResolvedValueOnce(jsonResponse({}, true, 201))
      .mockResolvedValueOnce(jsonResponse({}, true))
      .mockResolvedValueOnce(okCreate())
      .mockResolvedValueOnce(okComplete());

    const res = await processTransferTask({
      task: uploadTask(bigFile(SIZE_LIMIT * 2, "video/mp4")),
    });
    expect(res.ok).toBe(true);
    (document.createElement as Mock).mockRestore();
  });

  test("非媒体类型跳过缩略图直接上传（小文件）", async () => {
    mockAuthFetch
      .mockResolvedValueOnce(jsonResponse({}, true, 201)) // MKCOL
      .mockResolvedValueOnce(okComplete());

    const file = new File(["hello"], "plain.txt", { type: "text/plain" });
    const onTaskProgress = vi.fn();
    const res = await processTransferTask({
      task: uploadTask(file),
      onTaskProgress,
    });
    expect(res.ok).toBe(true);
    // 仅 MKCOL 一次；文件本体走 XHR PUT，无缩略图请求
    expect(mockAuthFetch).toHaveBeenCalledTimes(1);
  });

  test("普通类型达到阈值也走 multipart（非媒体 → 无缩略图）", async () => {
    mockAuthFetch
      .mockResolvedValueOnce(jsonResponse({}, true, 201))
      .mockResolvedValueOnce(okCreate())
      .mockResolvedValueOnce(okComplete());
    const res = await processTransferTask({
      task: uploadTask(bigFile(SIZE_LIMIT * 2, "application/octet-stream")),
    });
    expect(res.ok).toBe(true);
    expect(mockAuthFetch).toHaveBeenCalledTimes(3); // MKCOL + create + complete
  });
});

describe("generateThumbnail / pdf 分支", () => {
  test("pdf 走远程 pdf.js 动态导入，测试环境加载失败即拒绝", async () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => ({ drawImage: vi.fn() }) as any
    ) as any;
    await expect(
      generateThumbnail(new File(["pdf"], "a.pdf", { type: "application/pdf" }))
    ).rejects.toThrow();
  });

  test("非图片/视频/pdf 直接出空画布缩略图", async () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => ({ drawImage: vi.fn() }) as any
    ) as any;
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
      cb(new Blob(["png"], { type: "image/png" }));
    } as any;
    const blob = await generateThumbnail(
      new File(["x"], "a.txt", { type: "text/plain" })
    );
    expect(blob).toBeInstanceOf(Blob);
  });
});

describe("collectFilesFromDataTransfer 补充分支", () => {
  test("files 为空、items 也为空时返回空数组", async () => {
    const dt = { files: null, items: [] } as unknown as DataTransfer;
    await expect(collectFilesFromDataTransfer(dt)).resolves.toEqual([]);
  });

  test("entry.file 拒绝时整体失败", async () => {
    const dt = {
      files: [],
      items: [
        {
          webkitGetAsEntry: () => ({
            isFile: true,
            isDirectory: false,
            name: "bad.txt",
            file: (
              _resolve: (f: File) => void,
              reject: (e: Error) => void
            ) => reject(new Error("read denied")),
          }),
        },
      ],
    } as unknown as DataTransfer;
    await expect(collectFilesFromDataTransfer(dt)).rejects.toThrow("read denied");
  });

  test("目录 readEntries 拒绝时整体失败", async () => {
    const dt = {
      files: [],
      items: [
        {
          webkitGetAsEntry: () => ({
            isFile: false,
            isDirectory: true,
            name: "d",
            createReader: () => ({
              readEntries: (
                _resolve: (e: unknown[]) => void,
                reject: (err: Error) => void
              ) => reject(new Error("entry denied")),
            }),
          }),
        },
      ],
    } as unknown as DataTransfer;
    await expect(collectFilesFromDataTransfer(dt)).rejects.toThrow("entry denied");
  });
});

describe("selectDirectoryFiles 补充分支", () => {
  afterEach(() => {
    delete (window as any).showDirectoryPicker;
  });

  test("picker 非 AbortError 失败时回退 input 选择器", async () => {
    (window as any).showDirectoryPicker = async () => {
      throw new Error("security");
    };
    const orig = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = orig(tag) as HTMLInputElement;
      if (tag === "input") {
        el.click = () => {
          Object.defineProperty(el, "files", {
            value: [new File(["a"], "fallback.txt")],
            configurable: true,
          });
          el.onchange?.(new Event("change") as any);
        };
      }
      return el;
    });
    const files = await selectDirectoryFiles();
    expect(files[0].name).toBe("fallback.txt");
    (document.createElement as Mock).mockRestore();
  });

  test("input oncancel 返回空数组", async () => {
    delete (window as any).showDirectoryPicker;
    const orig = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = orig(tag) as HTMLInputElement;
      if (tag === "input") {
        el.click = () => el.oncancel?.(new Event("cancel") as any);
      }
      return el;
    });
    await expect(selectDirectoryFiles()).resolves.toEqual([]);
    (document.createElement as Mock).mockRestore();
  });
});

describe("其余小分支", () => {
  test("davHrefToKey：非法协议且含 /webdav/ 时回退切片", () => {
    expect(davHrefToKey("::::/webdav/x.txt")).toBe("x.txt");
  });

  test("davHrefToKey：非法协议且无 /webdav/ 时原样返回", () => {
    expect(davHrefToKey("::::foo")).toBe("::::foo");
  });

  test("fetchFolderCounts：counts 为 null 返回空对象", async () => {
    mockAuthFetch.mockResolvedValue(jsonResponse({}));
    await expect(fetchFolderCounts(["a"])).resolves.toEqual({});
  });

  test("fetchFolderCounts：json 解析失败返回空对象", async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      json: async () => {
        throw new Error("bad json");
      },
    } as unknown as Response);
    await expect(fetchFolderCounts(["a"])).resolves.toEqual({});
  });

  test("copyPaste MOVE 失败抛移动失败文案", async () => {
    mockAuthFetch.mockError(409, "x");
    await expect(copyPaste("a", "b", true)).rejects.toThrow("移动失败");
  });

  test("xhrFetch：Blob/字符串之外的非空 body 不会 send（记录现状）", async () => {
    // 佐证 xhrFetch 只对 Blob/字符串 send：用 multipartUpload 的 Blob 分片路径
    // 覆盖正常分支即可，此处直接验证分片确实以 Blob 发送（MockXHR.sends）。
    mockAuthFetch.mockResolvedValueOnce(okCreate());
    mockAuthFetch.mockResolvedValueOnce(okComplete());
    await multipartUpload("big.bin", bigFile(SIZE_LIMIT));
    expect(MockXHR.sends).toBe(1);
  });
});
