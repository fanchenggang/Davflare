import { createShare, formatShareClipboard, listShares, revokeShare } from "../share";
import { authFetch } from "../auth";
import { setLang } from "../strings";

jest.mock("../auth", () => ({
  authFetch: jest.fn(),
}));

const mockAuthFetch = authFetch as unknown as jest.Mock;

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

beforeEach(() => {
  mockAuthFetch.mockReset();
});

describe("share / createShare", () => {
  test("默认 body 只含 key", async () => {
    mockAuthFetch.mockResolvedValue(jsonResponse({ token: "t" }));
    await createShare("a/b.txt");
    const [, init] = mockAuthFetch.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ key: "a/b.txt" });
  });

  test("携带过期时间与提取码（trim）", async () => {
    mockAuthFetch.mockResolvedValue(jsonResponse({ token: "t" }));
    await createShare("a.txt", 12, " 1234 ");
    const [, init] = mockAuthFetch.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ key: "a.txt", expiresInHours: 12, extractCode: "1234" });
  });

  test("失败抛出响应文本", async () => {
    mockAuthFetch.mockResolvedValue({ ok: false, status: 400, text: async () => "bad" } as unknown as Response);
    await expect(createShare("a.txt")).rejects.toThrow("bad");
  });
});

describe("share / listShares & revokeShare", () => {
  test("listShares 成功返回 JSON", async () => {
    const shares = [{ token: "t", key: "a", name: "a", expiresAt: null, createdAt: "", url: "" }];
    mockAuthFetch.mockResolvedValue(jsonResponse(shares));
    await expect(listShares()).resolves.toEqual(shares);
    expect(mockAuthFetch).toHaveBeenCalledWith("/api/shares");
  });

  test("revokeShare DELETE 并编码 token", async () => {
    mockAuthFetch.mockResolvedValue({ ok: true, status: 200 } as unknown as Response);
    await revokeShare("a b&c");
    expect(mockAuthFetch).toHaveBeenCalledWith("/api/shares?token=a%20b%26c", { method: "DELETE" });
  });

  test("失败抛出默认文案", async () => {
    mockAuthFetch.mockResolvedValue({ ok: false, status: 500, text: async () => "" } as unknown as Response);
    setLang("zh");
    await expect(listShares()).rejects.toThrow("获取分享失败");
    await expect(revokeShare("t")).rejects.toThrow("撤销分享失败");
  });
});

describe("share / formatShareClipboard", () => {
  afterEach(() => setLang("zh"));

  test("仅 URL", () => {
    setLang("zh");
    const text = formatShareClipboard({ token: "t", key: "a", name: "a", expiresAt: null, createdAt: "", url: "https://x/t" });
    expect(text).toContain("https://x/t");
    expect(text).not.toContain("提取码");
  });

  test("含过期时间与提取码", () => {
    setLang("zh");
    const text = formatShareClipboard({ token: "t", key: "a", name: "a", expiresAt: "2026-01-02T00:00:00.000Z", createdAt: "", url: "https://x/t", extractCode: "1234" });
    expect(text).toContain("https://x/t");
    expect(text).toContain("1234");
  });
});
