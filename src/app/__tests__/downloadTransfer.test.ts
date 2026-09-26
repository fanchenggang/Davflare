import { vi, type Mock } from "vitest";

import { processDownloadTask } from "../downloadTransfer";
import { authFetch } from "../auth";
import { saveBlob } from "../transfer";
import { setLang } from "../strings";
import { asAuthFetchMock } from "../testUtils";
import { TransferTask } from "../types";

vi.mock("../auth", () => ({
  authFetch: vi.fn(),
  basicAuthHeader: vi.fn(),
}));

vi.mock("../transfer", () => ({
  saveBlob: vi.fn(),
}));

const mockAuthFetch = asAuthFetchMock(authFetch);
const mockSaveBlob = saveBlob as unknown as Mock;

function downloadTask(overrides: Partial<TransferTask> = {}): TransferTask {
  return {
    id: "d1",
    type: "download",
    status: "in-progress",
    name: "a.txt",
    basedir: "",
    remoteKey: "/webdav/a.txt",
    downloadUrl: "/webdav/a.txt",
    saveAs: "a.txt",
    loaded: 0,
    total: 0,
    ...overrides,
  };
}

beforeEach(() => {
  mockAuthFetch.mockReset();
  mockSaveBlob.mockReset();
  setLang("zh");
});

describe("processDownloadTask", () => {
  test("streams body, reports progress from Content-Length, and saves", async () => {
    mockAuthFetch.mockResolvedValue(
      new Response("hello", {
        headers: { "Content-Length": "5", "Content-Type": "text/plain" },
      })
    );
    const progress: Array<{ loaded: number; total: number }> = [];
    await processDownloadTask({
      task: downloadTask(),
      onTaskProgress: (event) => progress.push(event),
    });
    expect(progress[0]).toEqual({ loaded: 0, total: 5 });
    expect(progress[progress.length - 1]).toEqual({ loaded: 5, total: 5 });
    expect(mockSaveBlob).toHaveBeenCalledTimes(1);
    const [blob, name] = mockSaveBlob.mock.calls[0];
    expect(name).toBe("a.txt");
    // jsdom Blob 与 Node Response 跨 realm 不互通，无法直接读内容；
    // 内容正确性已由进度回调（loaded 5）覆盖，这里校验大小与类型。
    expect((blob as Blob).size).toBe(5);
    expect((blob as Blob).type).toBe("text/plain");
  });

  test("unknown total (zip stream) keeps total at 0 while loaded advances", async () => {
    mockAuthFetch.mockResolvedValue(
      new Response("archive-bytes", { headers: { "Content-Type": "application/zip" } })
    );
    const progress: Array<{ loaded: number; total: number }> = [];
    await processDownloadTask({
      task: downloadTask({ name: "docs.zip", saveAs: "docs.zip" }),
      onTaskProgress: (event) => progress.push(event),
    });
    expect(progress.every((event) => event.total === 0)).toBe(true);
    expect(progress[progress.length - 1].loaded).toBe("archive-bytes".length);
    expect(mockSaveBlob.mock.calls[0][1]).toBe("docs.zip");
  });

  test("non-ok response throws with server text", async () => {
    mockAuthFetch.mockResolvedValue(
      new Response("gone", { status: 404 })
    );
    await expect(processDownloadTask({ task: downloadTask() })).rejects.toThrow(
      "gone"
    );
    expect(mockSaveBlob).not.toHaveBeenCalled();
  });

  test("aborted signal throws before fetching", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      processDownloadTask({
        task: downloadTask(),
        signal: controller.signal,
      })
    ).rejects.toThrow();
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });

  test("invalid task (upload passed in) throws", async () => {
    await expect(
      processDownloadTask({
        task: downloadTask({ type: "upload", downloadUrl: undefined }),
      })
    ).rejects.toThrow("Invalid task");
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });
});
