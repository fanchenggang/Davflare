import {
  listTrash,
  moveToTrash,
  permanentDeleteTrash,
  restoreTrash,
} from "../trash";
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

describe("trash / listTrash", () => {
  test("成功返回 JSON", async () => {
    const items = [{ trashKey: "t", originalKey: "a.txt", name: "a.txt", deletedAt: "", size: 1 }];
    mockAuthFetch.mockResolvedValue(jsonResponse(items));
    await expect(listTrash()).resolves.toEqual(items);
  });

  test("失败抛出默认文案", async () => {
    mockAuthFetch.mockResolvedValue({ ok: false, status: 500, text: async () => "" } as unknown as Response);
    setLang("zh");
    await expect(listTrash()).rejects.toThrow("获取回收站失败");
  });
});

describe("trash / moveToTrash", () => {
  test("POST keys 并返回 results", async () => {
    const result = { results: [{ key: "a.txt", id: "t1" }] };
    mockAuthFetch.mockResolvedValue(jsonResponse(result));
    await moveToTrash(["a.txt", "b.txt"]);
    const [url, init] = mockAuthFetch.mock.calls[0];
    expect(url).toBe("/api/trash");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ keys: ["a.txt", "b.txt"] });
  });
});

describe("trash / restoreTrash", () => {
  test("POST restore action", async () => {
    mockAuthFetch.mockResolvedValue(jsonResponse([]));
    await restoreTrash(["t1"]);
    const [url, init] = mockAuthFetch.mock.calls[0];
    expect(url).toBe("/api/trash?action=restore");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ trashKeys: ["t1"] });
  });
});

describe("trash / permanentDeleteTrash", () => {
  test("DELETE 默认 all=false", async () => {
    mockAuthFetch.mockResolvedValue({ ok: true, status: 200 } as unknown as Response);
    await permanentDeleteTrash(["t1"]);
    const [url, init] = mockAuthFetch.mock.calls[0];
    expect(url).toBe("/api/trash");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body)).toEqual({ trashKeys: ["t1"], all: false });
  });

  test("DELETE all=true", async () => {
    mockAuthFetch.mockResolvedValue({ ok: true, status: 200 } as unknown as Response);
    await permanentDeleteTrash([], true);
    expect(JSON.parse(mockAuthFetch.mock.calls[0][1].body)).toEqual({ trashKeys: [], all: true });
  });
});

describe("trash / 错误路径", () => {
  test("moveToTrash 失败抛出响应文本", async () => {
    mockAuthFetch.mockResolvedValue({ ok: false, status: 400, text: async () => "bad move" } as unknown as Response);
    await expect(moveToTrash(["a"])).rejects.toThrow("bad move");
  });

  test("restoreTrash 失败抛出默认文案", async () => {
    mockAuthFetch.mockResolvedValue({ ok: false, status: 500, text: async () => "" } as unknown as Response);
    setLang("zh");
    await expect(restoreTrash(["t"])).rejects.toThrow("恢复失败");
  });

  test("permanentDeleteTrash 失败抛出默认文案", async () => {
    mockAuthFetch.mockResolvedValue({ ok: false, status: 500, text: async () => "" } as unknown as Response);
    setLang("zh");
    await expect(permanentDeleteTrash(["t"])).rejects.toThrow("彻底删除失败");
  });
});
