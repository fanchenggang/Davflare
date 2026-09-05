import {
  blobDigest,
  collectFilesFromDataTransfer,
  davHrefToKey,
  downloadArchive,
  fetchPath,
  generateThumbnail,
  multipartUpload,
  processTransferTask,
  selectDirectoryFiles,
  SIZE_LIMIT,
} from "../transfer";
import { authFetch, basicAuthHeader } from "../auth";
import { setLang } from "../strings";
import {
  asAuthFetchMock,
  propfindResponse,
  type PropfindEntry,
} from "../testUtils";

jest.mock("p-limit", () => ({
  __esModule: true,
  default: () => (fn: () => Promise<unknown>) => fn(),
}));

jest.mock("../auth", () => ({
  authFetch: jest.fn(),
  basicAuthHeader: jest.fn(() => "Basic abc"),
}));

const mockAuthFetch = asAuthFetchMock(authFetch);
const mockBasic = basicAuthHeader as unknown as jest.Mock;

// 空 href 跳过 / 纯 collection 目录 / 带缩略图的图片（等价于原手写 XML）
const PROPFIND_LEFTOVERS: PropfindEntry[] = [
  { href: "" },
  { href: "/webdav/docs/", isDir: true },
  {
    href: "/webdav/pic.png",
    contentType: "image/png",
    size: 9,
    thumbnail: "abc",
  },
];

beforeEach(() => {
  mockAuthFetch.mockReset();
  mockBasic.mockReturnValue("Basic abc");
  setLang("zh");
  if (!(URL as any).createObjectURL) {
    (URL as any).createObjectURL = jest.fn(() => "blob:x");
  }
  if (!(URL as any).revokeObjectURL) {
    (URL as any).revokeObjectURL = jest.fn();
  }
});

describe("davHrefToKey leftovers", () => {
  test("invalid percent-encoding keeps segment", () => {
    expect(davHrefToKey("/webdav/%E0%A4%A")).toContain("%E0");
  });
});

describe("fetchPath leftovers", () => {
  test("parses collection dirs, thumbnails, and skips empty href", async () => {
    mockAuthFetch.mockResolvedValue(propfindResponse(PROPFIND_LEFTOVERS));
    const items = await fetchPath("");
    const dir = items.find((i) => i.key === "docs");
    const pic = items.find((i) => i.key === "pic.png");
    expect(dir?.isDir).toBe(true);
    expect(pic?.thumbnail).toBe("abc");
    expect(pic?.uploaded).toBeTruthy();
  });
});

describe("downloadArchive success", () => {
  test("clicks an anchor", async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["zip"]),
      text: async () => "",
    } as unknown as Response);
    const click = jest.fn();
    const orig = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = orig(tag);
      if (tag === "a") (el as HTMLAnchorElement).click = click;
      return el;
    });
    await downloadArchive(["a.txt"], "pack.zip");
    expect(click).toHaveBeenCalled();
    (document.createElement as jest.Mock).mockRestore();
  });
});

describe("blobDigest / generateThumbnail", () => {
  test("hashes a blob", async () => {
    const file = new File(["hello"], "a.bin");
    if (!(file as any).arrayBuffer) {
      (file as any).arrayBuffer = async () => new TextEncoder().encode("hello").buffer;
    }
    const hex = await blobDigest(file);
    expect(hex).toMatch(/^[0-9a-f]{40}$/);
  });

  test("image thumbnail draws to canvas", async () => {
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    (global as any).Image = MockImage;
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
      drawImage: jest.fn(),
    })) as any;
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
      cb(new Blob(["png"], { type: "image/png" }));
    } as any;
    const blob = await generateThumbnail(
      new File(["xx"], "a.png", { type: "image/png" })
    );
    expect(blob).toBeInstanceOf(Blob);
  });

  test("image load failure rejects", async () => {
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    (global as any).Image = MockImage;
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
      drawImage: jest.fn(),
    })) as any;
    await expect(
      generateThumbnail(new File(["xx"], "a.png", { type: "image/png" }))
    ).rejects.toThrow("Image load failed");
  });
});

describe("selectDirectoryFiles picker", () => {
  afterEach(() => {
    delete (window as any).showDirectoryPicker;
  });

  test("walks file handles", async () => {
    (window as any).showDirectoryPicker = async () => ({
      async *[Symbol.asyncIterator]() {},
      values: async function* () {
        yield {
          kind: "file",
          name: "a.txt",
          getFile: async () => new File(["x"], "a.txt"),
        };
        yield {
          kind: "directory",
          name: "sub",
          values: async function* () {
            yield {
              kind: "file",
              name: "b.txt",
              getFile: async () => new File(["y"], "b.txt"),
            };
          },
        };
      },
    });
    const files = await selectDirectoryFiles();
    expect(files.map((f) => f.name).sort()).toEqual(["a.txt", "b.txt"]);
  });

  test("AbortError returns empty", async () => {
    (window as any).showDirectoryPicker = async () => {
      const err = new Error("no");
      (err as any).name = "AbortError";
      throw err;
    };
    await expect(selectDirectoryFiles()).resolves.toEqual([]);
  });
});

describe("collectFilesFromDataTransfer file entry", () => {
  test("walks a file entry without directory", async () => {
    const file = new File(["x"], "solo.txt");
    const dt = {
      files: [],
      items: [
        {
          webkitGetAsEntry: () => ({
            isFile: true,
            isDirectory: false,
            name: "solo.txt",
            file: (resolve: (f: File) => void) => resolve(file),
          }),
        },
      ],
    } as unknown as DataTransfer;
    const files = await collectFilesFromDataTransfer(dt);
    expect(files[0].name).toBe("solo.txt");
  });
});

class MockXHR {
  static mode: "ok" | "error" | "abort" | "zero" | "retry" | "204" = "ok";
  static etag = '"etag-1"';
  upload = { onprogress: null as any };
  status = 201;
  responseText = "ok";
  onload: any;
  onerror: any;
  onabort: any;
  open() {}
  setRequestHeader() {}
  getAllResponseHeaders() {
    if (MockXHR.mode === "retry") return "retry-after: 0\r\nbadline\r\netag: " + MockXHR.etag;
    return "etag: " + MockXHR.etag;
  }
  abort() {
    this.onabort?.();
  }
  send() {
    if (this.upload.onprogress) {
      this.upload.onprogress({ loaded: 2, total: 2 });
    }
    if (MockXHR.mode === "error") {
      this.onerror?.();
      return;
    }
    if (MockXHR.mode === "abort") {
      this.onabort?.();
      return;
    }
    if (MockXHR.mode === "zero") {
      this.status = 0;
      this.onload?.();
      return;
    }
    if (MockXHR.mode === "204") {
      this.status = 204;
      this.responseText = "ignored";
      this.onload?.();
      return;
    }
    this.status = 200;
    this.onload?.();
  }
}

describe("xhr / multipart leftovers", () => {
  beforeEach(() => {
    (global as any).XMLHttpRequest = MockXHR;
    MockXHR.mode = "ok";
  });

  test("multipart upload completes parts", async () => {
    mockAuthFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ uploadId: "u1" }),
        text: async () => "",
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "done",
      } as unknown as Response);
    const file = new File(["ab"], "big.bin", { type: "application/octet-stream" });
    Object.defineProperty(file, "size", { value: SIZE_LIMIT });
    file.slice = jest.fn(() => new Blob(["ab"])) as any;
    const onState = jest.fn();
    const res = await multipartUpload("big.bin", file, {
      onState,
      onUploadProgress: jest.fn(),
    });
    expect(res.ok).toBe(true);
    expect(onState).toHaveBeenCalled();
  });

  test("xhr network error", async () => {
    MockXHR.mode = "error";
    const file = new File(["hello"], "plain.txt", { type: "text/plain" });
    await expect(
      processTransferTask({
        task: {
          id: "1",
          type: "upload",
          status: "in-progress",
          name: "plain.txt",
          basedir: "",
          remoteKey: "plain.txt",
          loaded: 0,
          total: 5,
          file,
        } as any,
      })
    ).rejects.toThrow();
  });

  test("xhr abort and status 0", async () => {
    MockXHR.mode = "abort";
    const file = new File(["hello"], "plain.txt", { type: "text/plain" });
    await expect(
      processTransferTask({
        task: {
          id: "1",
          type: "upload",
          status: "in-progress",
          name: "plain.txt",
          basedir: "",
          remoteKey: "plain.txt",
          loaded: 0,
          total: 5,
          file,
        } as any,
      })
    ).rejects.toThrow("Aborted");

    MockXHR.mode = "zero";
    await expect(
      processTransferTask({
        task: {
          id: "2",
          type: "upload",
          status: "in-progress",
          name: "plain.txt",
          basedir: "",
          remoteKey: "plain.txt",
          loaded: 0,
          total: 5,
          file,
        } as any,
      })
    ).rejects.toThrow();
  });

  test("xhr 204 upload succeeds", async () => {
    MockXHR.mode = "204";
    const file = new File(["hello"], "plain.txt", { type: "text/plain" });
    const res = await processTransferTask({
      task: {
        id: "3",
        type: "upload",
        status: "in-progress",
        name: "plain.txt",
        basedir: "",
        remoteKey: "plain.txt",
        loaded: 0,
        total: 5,
        file,
      } as any,
    });
    expect(res.status).toBe(204);
  });

  test("processTransferTask with aborted signal before upload", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      processTransferTask({
        task: {
          type: "upload",
          remoteKey: "a.txt",
          file: new File(["a"], "a.txt", { type: "text/plain" }),
        } as any,
        signal: controller.signal,
      })
    ).rejects.toThrow("Aborted");
  });
});
