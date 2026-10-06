import { vi } from "vitest";
import {
  COLLECT_EXPIRY_OPTIONS,
  collectStatusLabel,
  createCollect,
  deleteCollect,
  disableCollect,
  listCollects,
} from "../collects";
import { authFetch } from "../auth";
import { setLang, translate } from "../strings";
import { asAuthFetchMock } from "../testUtils";

vi.mock("../auth", () => ({ authFetch: vi.fn() }));

const mockAuthFetch = asAuthFetchMock(authFetch);

beforeEach(() => {
  setLang("zh");
  mockAuthFetch.mockReset();
});

describe("collects client", () => {
  test("listCollects GETs /api/collects", async () => {
    mockAuthFetch.mockOk([{ token: "t" }]);
    await expect(listCollects()).resolves.toEqual([{ token: "t" }]);
    expect(mockAuthFetch).toHaveBeenCalledWith("/api/collects");
    mockAuthFetch.mockError(500);
    await expect(listCollects()).rejects.toThrow(translate("loadCollectsFailed"));
  });

  test("createCollect posts folder, hours and trimmed note", async () => {
    mockAuthFetch.mockOk({ token: "t" }, 201);
    await createCollect("inbox", 72, "  hi  ");
    const [url, init] = mockAuthFetch.mock.calls[0];
    expect(url).toBe("/api/collects");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ folder: "inbox", expiresInHours: 72, note: "hi" });
    mockAuthFetch.mockOk({ token: "t" }, 201);
    await createCollect("inbox", 24, "   ");
    expect(JSON.parse(mockAuthFetch.mock.calls[1][1].body)).toEqual({ folder: "inbox", expiresInHours: 24 });
  });

  test("createCollect surfaces short server text, falls back for long/empty", async () => {
    mockAuthFetch.mockError(404, "文件夹不存在");
    await expect(createCollect("x", 24)).rejects.toThrow("文件夹不存在");
    mockAuthFetch.mockError(500, "");
    await expect(createCollect("x", 24)).rejects.toThrow(translate("createCollectFailed"));
    mockAuthFetch.mockError(500, "x".repeat(500));
    await expect(createCollect("x", 24)).rejects.toThrow(translate("createCollectFailed"));
  });

  test("disableCollect PATCHes, deleteCollect DELETEs with encoded token", async () => {
    mockAuthFetch.mockOk({ token: "a b", status: "disabled" });
    await disableCollect("a b");
    expect(mockAuthFetch.mock.calls[0][0]).toBe("/api/collects?token=a%20b");
    expect(mockAuthFetch.mock.calls[0][1].method).toBe("PATCH");
    expect(JSON.parse(mockAuthFetch.mock.calls[0][1].body)).toEqual({ disabled: true });
    mockAuthFetch.mockError(503, "");
    await expect(disableCollect("t")).rejects.toThrow(translate("disableCollectFailed"));
    mockAuthFetch.mockOk({});
    await deleteCollect("t");
    expect(mockAuthFetch).toHaveBeenLastCalledWith("/api/collects?token=t", { method: "DELETE" });
    mockAuthFetch.mockError(500);
    await expect(deleteCollect("t")).rejects.toThrow(translate("deleteCollectFailed"));
  });

  test("status labels and expiry options", () => {
    expect(collectStatusLabel("active")).toBe("收集中");
    expect(collectStatusLabel("expired")).toBe("已过期");
    expect(collectStatusLabel("disabled")).toBe("已停用");
    expect(COLLECT_EXPIRY_OPTIONS.map((option) => option.hours)).toEqual([24, 72, 168]);
    expect(Math.max(...COLLECT_EXPIRY_OPTIONS.map((option) => option.hours))).toBe(168);
  });
});
