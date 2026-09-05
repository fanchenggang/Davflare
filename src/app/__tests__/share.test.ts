import { createShare, formatShareClipboard, formatShareCountdown, listShares, revokeShare, shareExpiryView } from "../share";
import { authFetch } from "../auth";
import { setLang } from "../strings";
import { asAuthFetchMock } from "../testUtils";

jest.mock("../auth", () => ({
  authFetch: jest.fn(),
}));

const mockAuthFetch = asAuthFetchMock(authFetch);

beforeEach(() => {
  mockAuthFetch.mockReset();
});

describe("share / createShare", () => {
  test("默认 body 只含 key", async () => {
    mockAuthFetch.mockOk({ token: "t" });
    await createShare("a/b.txt");
    const [, init] = mockAuthFetch.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ key: "a/b.txt" });
  });

  test("携带过期时间与提取码（trim）", async () => {
    mockAuthFetch.mockOk({ token: "t" });
    await createShare("a.txt", 12, " 1234 ");
    const [, init] = mockAuthFetch.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ key: "a.txt", expiresInHours: 12, extractCode: "1234" });
  });

  test("失败抛出响应文本", async () => {
    mockAuthFetch.mockError(400, "bad");
    await expect(createShare("a.txt")).rejects.toThrow("bad");
  });
});

describe("share / listShares & revokeShare", () => {
  test("listShares 成功返回 JSON", async () => {
    const shares = [{ token: "t", key: "a", name: "a", expiresAt: null, createdAt: "", url: "" }];
    mockAuthFetch.mockOk(shares);
    await expect(listShares()).resolves.toEqual(shares);
    expect(mockAuthFetch).toHaveBeenCalledWith("/api/shares");
  });

  test("revokeShare DELETE 并编码 token", async () => {
    mockAuthFetch.mockOk({});
    await revokeShare("a b&c");
    expect(mockAuthFetch).toHaveBeenCalledWith("/api/shares?token=a%20b%26c", { method: "DELETE" });
  });

  test("失败抛出默认文案", async () => {
    mockAuthFetch.mockError(500);
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

// 四象限：>=48h → 天 / 2-48h → 小时 / <2h → 分钟 / 永久（expiresAt 缺失 → null）
describe("share / 过期倒计时", () => {
  const HOUR = 60 * 60 * 1000;
  const NOW = Date.parse("2026-01-01T00:00:00.000Z");

  beforeEach(() => setLang("zh"));
  afterEach(() => setLang("zh"));

  test("剩余 >=48h 按「N 天」展示", () => {
    expect(formatShareCountdown(72 * HOUR)).toBe("3 天");
    expect(shareExpiryView(new Date(NOW + 100 * HOUR).toISOString(), NOW)).toEqual({
      label: "4 天后过期",
      urgent: false,
    });
  });

  test("剩余 2-48h 按「N 小时」展示", () => {
    expect(formatShareCountdown(48 * HOUR)).toBe("48 小时");
    expect(formatShareCountdown(5 * HOUR)).toBe("5 小时");
    const view = shareExpiryView(new Date(NOW + 30 * HOUR).toISOString(), NOW);
    expect(view).toEqual({ label: "30 小时后过期", urgent: false });
  });

  test("剩余 <2h 按「N 分钟」展示且 <24h 为 warning", () => {
    expect(formatShareCountdown(90 * 60 * 1000)).toBe("90 分钟");
    expect(formatShareCountdown(30 * 1000)).toBe("1 分钟");
    const view = shareExpiryView(new Date(NOW + 90 * 60 * 1000).toISOString(), NOW);
    expect(view).toEqual({ label: "90 分钟后过期", urgent: true });
  });

  test("24 小时是 default/warning 分界", () => {
    expect(shareExpiryView(new Date(NOW + 23 * HOUR).toISOString(), NOW)?.urgent).toBe(true);
    expect(shareExpiryView(new Date(NOW + 25 * HOUR).toISOString(), NOW)?.urgent).toBe(false);
  });

  test("永久（expiresAt 缺失）与非法值返回 null", () => {
    expect(shareExpiryView(null, NOW)).toBeNull();
    expect(shareExpiryView(undefined, NOW)).toBeNull();
    expect(shareExpiryView("not-a-date", NOW)).toBeNull();
  });

  test("已过期（负剩余）标记过期且 urgent", () => {
    expect(formatShareCountdown(-1000)).toBe("已过期");
    expect(shareExpiryView(new Date(NOW - 1000).toISOString(), NOW)).toEqual({
      label: "已过期",
      urgent: true,
    });
  });

  test("英文插值", () => {
    setLang("en");
    expect(formatShareCountdown(72 * HOUR)).toBe("3 days");
    expect(formatShareCountdown(5 * HOUR)).toBe("5 hours");
    expect(formatShareCountdown(90 * 60 * 1000)).toBe("90 minutes");
  });
});
