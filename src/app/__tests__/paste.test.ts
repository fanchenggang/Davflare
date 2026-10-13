import { vi } from "vitest";
import {
  PASTE_MAX_CHARS,
  createPasteShare,
  defaultPasteFilename,
  joinCwdKey,
  sanitizePasteFilename,
  uploadPlainText,
} from "../paste";
import { authFetch } from "../auth";
import { createShare } from "../share";
import { setLang } from "../strings";
import { asAuthFetchMock } from "../testUtils";

vi.mock("../auth", () => ({
  authFetch: vi.fn(),
}));

vi.mock("../share", async () => {
  const actual = await vi.importActual<typeof import("../share")>("../share");
  return {
    ...actual,
    createShare: vi.fn(),
  };
});

const mockAuthFetch = asAuthFetchMock(authFetch);
const mockCreateShare = createShare as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockAuthFetch.mockReset();
  mockCreateShare.mockReset();
  setLang("zh");
});

describe("paste helpers", () => {
  test("defaultPasteFilename uses local timestamp", () => {
    const local = new Date(2026, 9, 13, 16, 5, 9); // month is 0-based
    expect(defaultPasteFilename(local)).toBe("paste-20261013-160509.txt");
  });

  test("sanitizePasteFilename strips path and ensures .txt", () => {
    expect(sanitizePasteFilename("note")).toBe("note.txt");
    expect(sanitizePasteFilename("a/b\\c.md")).toBe("a_b_c.md.txt");
    expect(sanitizePasteFilename("hello.TXT")).toBe("hello.TXT");
  });

  test("joinCwdKey joins cwd and filename", () => {
    expect(joinCwdKey("", "a.txt")).toBe("a.txt");
    expect(joinCwdKey("notes/", "a.txt")).toBe("notes/a.txt");
    expect(joinCwdKey("/docs", "a.txt")).toBe("docs/a.txt");
  });
});

describe("uploadPlainText", () => {
  test("PUT text/plain via WebDAV", async () => {
    mockAuthFetch.mockOk({});
    await uploadPlainText("notes/hi.txt", "hello");
    const [url, init] = mockAuthFetch.mock.calls[0];
    expect(url).toContain("/webdav/");
    expect(url).toContain("notes");
    expect(init.method).toBe("PUT");
    expect(init.headers["Content-Type"]).toBe("text/plain; charset=utf-8");
    expect(init.body).toBe("hello");
  });

  test("失败抛错", async () => {
    mockAuthFetch.mockError(500, "boom");
    await expect(uploadPlainText("a.txt", "x")).rejects.toThrow("boom");
  });
});

describe("createPasteShare", () => {
  test("上传后创建分享并返回剪贴板文本", async () => {
    mockAuthFetch.mockOk({});
    mockCreateShare.mockResolvedValue({
      token: "tok",
      key: "notes/paste.txt",
      name: "paste.txt",
      expiresAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      url: "https://x/share/tok",
      extractCode: "1234",
    });
    const result = await createPasteShare({
      cwd: "notes",
      text: "hello paste",
      filename: "paste.txt",
      expiresInHours: 24,
      extractCode: "1234",
    });
    expect(mockCreateShare).toHaveBeenCalledWith("notes/paste.txt", 24, "1234");
    expect(result.share.url).toContain("/share/tok");
    expect(result.clipboard).toContain("https://x/share/tok");
    expect(result.clipboard).toContain("1234");
  });

  test("空文本 / 过长拒绝", async () => {
    await expect(createPasteShare({ cwd: "", text: "   " })).rejects.toThrow(/粘贴|文本/);
    await expect(
      createPasteShare({ cwd: "", text: "x".repeat(PASTE_MAX_CHARS + 1) })
    ).rejects.toThrow(/过长|too long/i);
  });
});
