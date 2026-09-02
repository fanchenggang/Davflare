import {
  collectFilesFromDataTransfer,
  davHrefToKey,
  downloadArchive,
  downloadFile,
  fetchPath,
  openFile,
  processTransferTask,
  selectDirectoryFiles,
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

function blobResponse(ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    headers: { get: () => null },
    blob: async () => new Blob(["data"]),
    text: async () => (ok ? "" : "fail"),
  } as unknown as Response;
}

beforeEach(() => {
  mockAuthFetch.mockReset();
  setLang("zh");
  if (!(URL as any).createObjectURL) {
    (URL as any).createObjectURL = jest.fn(() => "blob:x");
  }
  if (!(URL as any).revokeObjectURL) {
    (URL as any).revokeObjectURL = jest.fn();
  }
});

describe("davHrefToKey extra", () => {
  test("invalid absolute URL falls back to /webdav/ slice", () => {
    expect(davHrefToKey("not-a-url:/webdav/z.txt")).toBe("z.txt");
  });
});

describe("fetchPath extra", () => {
  test("non-ok throws", async () => {
    mockAuthFetch.mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => "application/xml" },
      text: async () => "x",
    });
    await expect(fetchPath("")).rejects.toThrow("Failed to fetch");
  });
});

describe("open/download", () => {
  test("openFile success", async () => {
    mockAuthFetch.mockResolvedValue(blobResponse(true));
    const open = jest.fn();
    window.open = open;
    await openFile("a.txt");
    expect(open).toHaveBeenCalled();
  });

  test("openFile failure", async () => {
    mockAuthFetch.mockResolvedValue(blobResponse(false));
    await expect(openFile("a.txt")).rejects.toThrow();
  });

  test("downloadFile success", async () => {
    mockAuthFetch.mockResolvedValue(blobResponse(true));
    const click = jest.fn();
    const orig = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = orig(tag);
      if (tag === "a") (el as HTMLAnchorElement).click = click;
      return el;
    });
    await downloadFile("a.txt");
    expect(click).toHaveBeenCalled();
    (document.createElement as jest.Mock).mockRestore();
  });

  test("downloadArchive failure", async () => {
    mockAuthFetch.mockResolvedValue(blobResponse(false));
    await expect(downloadArchive(["a.txt"])).rejects.toThrow();
  });
});

describe("collectFilesFromDataTransfer extra", () => {
  test("walks directory entry", async () => {
    const file = new File(["x"], "a.txt");
    const fileEntry = {
      isFile: true,
      isDirectory: false,
      name: "a.txt",
      file: (resolve: (f: File) => void) => resolve(file),
    };
    const dirEntry = {
      isFile: false,
      isDirectory: true,
      name: "d",
      createReader: () => {
        let n = 0;
        return {
          readEntries: (resolve: (entries: unknown[]) => void) => {
            if (n === 0) {
              n += 1;
              resolve([fileEntry]);
            } else {
              resolve([]);
            }
          },
        };
      },
    };
    const dt = {
      files: [],
      items: [{ webkitGetAsEntry: () => dirEntry }],
    } as unknown as DataTransfer;
    const files = await collectFilesFromDataTransfer(dt);
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("a.txt");
  });
});

describe("selectDirectoryFiles", () => {
  test("falls back to input when picker missing", async () => {
    const origPicker = (window as any).showDirectoryPicker;
    delete (window as any).showDirectoryPicker;
    const orig = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = orig(tag) as HTMLInputElement;
      if (tag === "input") {
        el.click = () => {
          Object.defineProperty(el, "files", {
            value: [new File(["a"], "picked.txt")],
            configurable: true,
          });
          el.onchange?.(new Event("change") as any);
        };
      }
      return el;
    });
    const files = await selectDirectoryFiles();
    expect(files[0].name).toBe("picked.txt");
    (document.createElement as jest.Mock).mockRestore();
    if (origPicker) (window as any).showDirectoryPicker = origPicker;
  });
});

describe("processTransferTask extra", () => {
  test("small file upload via xhr", async () => {
    class MockXHR {
      upload = { onprogress: null as any };
      status = 201;
      responseText = "";
      onload: any;
      onerror: any;
      onabort: any;
      open() {}
      setRequestHeader() {}
      getAllResponseHeaders() {
        return "";
      }
      abort() {}
      send() {
        this.onload?.();
      }
    }
    (global as any).XMLHttpRequest = MockXHR;
    const file = new File(["hello"], "plain.txt", { type: "text/plain" });
    const res = await processTransferTask({
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
    });
    expect(res.status).toBe(201);
  });

  test("xhr non-ok throws", async () => {
    class MockXHR {
      upload = { onprogress: null as any };
      status = 500;
      responseText = "nope";
      onload: any;
      onerror: any;
      onabort: any;
      open() {}
      setRequestHeader() {}
      getAllResponseHeaders() {
        return "";
      }
      abort() {}
      send() {
        this.onload?.();
      }
    }
    (global as any).XMLHttpRequest = MockXHR;
    const file = new File(["hello"], "plain2.txt", { type: "text/plain" });
    await expect(
      processTransferTask({
        task: {
          id: "2",
          type: "upload",
          status: "in-progress",
          name: "plain2.txt",
          basedir: "",
          remoteKey: "plain2.txt",
          loaded: 0,
          total: 5,
          file,
        } as any,
      })
    ).rejects.toThrow();
  });
});
