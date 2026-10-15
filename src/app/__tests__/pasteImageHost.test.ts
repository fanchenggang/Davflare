import { vi } from "vitest";

import { uploadImage } from "../images";
import {
  collectClipboardFiles,
  isPasteImageFile,
  namePastedFile,
  partitionPasteFiles,
  uploadPastedImagesToHost,
} from "../pasteImageHost";
import { setLang } from "../strings";
import { asAuthFetchMock } from "../testUtils";
import { authFetch } from "../auth";

vi.mock("../auth", () => ({
  authFetch: vi.fn(),
}));

vi.mock("../images", async () => {
  const actual = await vi.importActual<typeof import("../images")>("../images");
  return {
    ...actual,
    uploadImage: vi.fn(),
  };
});

const mockUpload = uploadImage as unknown as ReturnType<typeof vi.fn>;
const mockAuthFetch = asAuthFetchMock(authFetch);

beforeEach(() => {
  mockUpload.mockReset();
  mockAuthFetch.mockReset();
  setLang("zh");
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe("pasteImageHost helpers", () => {
  test("isPasteImageFile 认 type 与扩展名", () => {
    expect(isPasteImageFile(new File(["x"], "a.png", { type: "image/png" }))).toBe(true);
    expect(isPasteImageFile(new File(["x"], "a.PNG", { type: "" }))).toBe(true);
    expect(isPasteImageFile(new File(["x"], "a.txt", { type: "text/plain" }))).toBe(false);
  });

  test("namePastedFile 给无名截图盖时间戳", () => {
    const generic = new File(["b"], "image.png", { type: "image/png" });
    const named = namePastedFile(generic);
    expect(named.name).not.toBe("image.png");
    expect(named.name).toMatch(/\.png$/);
    expect(namePastedFile(new File(["a"], "photo.jpg", { type: "image/jpeg" })).name).toBe(
      "photo.jpg"
    );
  });

  test("collectClipboardFiles 只取 kind=file", () => {
    const file = new File(["a"], "a.png", { type: "image/png" });
    const items = [
      { kind: "string", getAsFile: () => null },
      { kind: "file", getAsFile: () => null },
      { kind: "file", getAsFile: () => file },
    ] as unknown as DataTransferItemList;
    Object.defineProperty(items, "length", { value: 3 });
    expect(collectClipboardFiles(items)).toEqual([file]);
    expect(collectClipboardFiles(undefined)).toEqual([]);
  });

  test("partitionPasteFiles 分图片与其它", () => {
    const img = new File(["a"], "a.png", { type: "image/png" });
    const txt = new File(["b"], "b.txt", { type: "text/plain" });
    expect(partitionPasteFiles([img, txt])).toEqual({ images: [img], others: [txt] });
  });
});

describe("uploadPastedImagesToHost", () => {
  test("成功上传并自动复制 URL，toast 带复制动作", async () => {
    mockUpload.mockResolvedValue({
      id: "abc",
      name: "shot.png",
      size: 3,
      uploaded: "2026-01-01T00:00:00.000Z",
      contentType: "image/png",
      url: "https://sites.example/i/abc",
      markdown: "![shot.png](https://sites.example/i/abc)",
    });
    const onNotify = vi.fn();
    const onUploaded = vi.fn();
    const file = new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" });
    const created = await uploadPastedImagesToHost({
      files: [file],
      onNotify,
      onUploaded,
    });
    expect(created).toHaveLength(1);
    expect(onUploaded).toHaveBeenCalledWith(expect.objectContaining({ id: "abc" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://sites.example/i/abc");
    expect(onNotify).toHaveBeenCalledWith(
      expect.stringContaining("链接已复制"),
      "success",
      expect.objectContaining({
        action: expect.objectContaining({ label: expect.any(String) }),
      })
    );
  });

  test("无公开 URL 时 info toast", async () => {
    mockUpload.mockResolvedValue({
      id: "abc",
      name: "shot.png",
      size: 1,
      uploaded: "2026-01-01T00:00:00.000Z",
      contentType: "image/png",
      url: null,
      markdown: "",
    });
    const onNotify = vi.fn();
    await uploadPastedImagesToHost({
      files: [new File(["x"], "shot.png", { type: "image/png" })],
      onNotify,
    });
    expect(onNotify).toHaveBeenCalledWith(expect.stringContaining("SITES_HOST"), "info", expect.any(Object));
  });

  test("上传失败走 error toast", async () => {
    mockUpload.mockRejectedValue(new Error("boom"));
    const onNotify = vi.fn();
    await uploadPastedImagesToHost({
      files: [new File(["x"], "shot.png", { type: "image/png" })],
      onNotify,
    });
    expect(onNotify).toHaveBeenCalledWith("boom", "error");
  });
});
