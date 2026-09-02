import {
  backupCurlExample,
  createApiKey,
  deleteCurlExample,
  downloadCurlExample,
  formatApiUsage,
  listApiKeys,
  listCurlExample,
  mkdirCurlExample,
  overwriteCurlExample,
  renameCurlExample,
  revokeApiKey,
  uploadCurlExample,
} from "../apikeys";
import { authFetch } from "../auth";
import { getLang, setLang } from "../strings";

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

describe("apikeys / listApiKeys", () => {
  test("成功返回 JSON", async () => {
    const keys = [{ id: "1", name: "k", prefix: "fd_", createdAt: "", expiresAt: null }];
    mockAuthFetch.mockResolvedValue(jsonResponse(keys));
    await expect(listApiKeys()).resolves.toEqual(keys);
    expect(mockAuthFetch).toHaveBeenCalledWith("/api/keys");
  });

  test("失败抛出响应文本", async () => {
    mockAuthFetch.mockResolvedValue({ ok: false, status: 500, text: async () => "boom" } as unknown as Response);
    await expect(listApiKeys()).rejects.toThrow("boom");
  });
});

describe("apikeys / createApiKey", () => {
  test("携带可选参数与自定义 key", async () => {
    const created = { id: "1", name: "k", prefix: "fd_", createdAt: "", expiresAt: null, key: "fd_xxx" };
    mockAuthFetch.mockResolvedValue(jsonResponse(created));
    await createApiKey({ name: "k", expiresInHours: 24, key: "  custom  " });
    const [, init] = mockAuthFetch.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ name: "k", expiresInHours: 24, key: "custom" });
  });

  test("空可选参数不进 body", async () => {
    mockAuthFetch.mockResolvedValue(jsonResponse({}));
    await createApiKey({ name: "k", expiresInHours: 0, key: "   " });
    const [, init] = mockAuthFetch.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ name: "k" });
  });

  test("失败抛出响应文本", async () => {
    mockAuthFetch.mockResolvedValue({ ok: false, status: 400, text: async () => "bad key" } as unknown as Response);
    await expect(createApiKey({ name: "k" })).rejects.toThrow("bad key");
  });
});

describe("apikeys / revokeApiKey", () => {
  test("成功 DELETE", async () => {
    mockAuthFetch.mockResolvedValue({ ok: true, status: 200 } as unknown as Response);
    await revokeApiKey("abc");
    expect(mockAuthFetch).toHaveBeenCalledWith("/api/keys?id=abc", { method: "DELETE" });
  });

  test("失败抛出响应文本", async () => {
    mockAuthFetch.mockResolvedValue({ ok: false, status: 500, text: async () => "no" } as unknown as Response);
    await expect(revokeApiKey("abc")).rejects.toThrow("no");
  });
});

describe("apikeys / curl 示例", () => {
  test("各命令包含 origin 与默认 key", () => {
    expect(uploadCurlExample("https://d.example")).toContain('https://d.example/api/upload?path=folder/');
    expect(uploadCurlExample("https://d.example")).toContain('Authorization: Bearer <apiKey>');
    expect(downloadCurlExample("https://d.example")).toContain('https://d.example/api/download?path=DBX/sync/snapshot.json');
    expect(listCurlExample("https://d.example")).toContain('https://d.example/api/list?path=folder/');
    expect(overwriteCurlExample("https://d.example")).toContain('overwrite=1');
    expect(backupCurlExample("https://d.example")).toContain('/api/backup?path=folder/notes.txt');
    expect(deleteCurlExample("https://d.example")).toContain('curl -X DELETE');
    expect(renameCurlExample("https://d.example")).toContain('{"from":"folder/old.txt","to":"folder/new.txt"}');
    expect(mkdirCurlExample("https://d.example")).toContain('{"path":"folder/sub"}');
  });

  test("formatApiUsage 按语言返回文档", () => {
    setLang("zh");
    const zh = formatApiUsage("https://d.example", "key1");
    expect(zh).toContain("调用说明");
    expect(zh).toContain("https://d.example/api/upload");
    expect(zh).toContain("Bearer key1");
    setLang("en");
    const en = formatApiUsage("https://d.example", "key2");
    expect(en).toContain("Usage");
    expect(en).toContain("Bearer key2");
    setLang("zh");
    expect(getLang()).toBe("zh");
  });

  test("formatApiUsage can omit the MCP section", () => {
    setLang("en");
    const withMcp = formatApiUsage("https://d.example", "key2");
    const without = formatApiUsage("https://d.example", "key2", {
      includeMcp: false,
    });
    expect(withMcp).toContain("MCP / Cursor");
    expect(without).not.toContain("MCP / Cursor");
    expect(without).toContain("Upload");
    setLang("zh");
  });
});
