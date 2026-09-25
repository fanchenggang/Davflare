import { vi } from "vitest";
import { authFetch } from "../auth";
import { deleteImage, listImages, uploadImage } from "../images";
import { setLang } from "../strings";
import { asAuthFetchMock } from "../testUtils";

vi.mock("../auth", () => ({
  authFetch: vi.fn(),
}));

const mockAuthFetch = asAuthFetchMock(authFetch);

beforeEach(() => {
  mockAuthFetch.mockReset();
});

describe("images client", () => {
  test("listImages GETs /api/images", async () => {
    mockAuthFetch.mockOk({ sitesHost: null, images: [] });
    await listImages();
    expect(mockAuthFetch).toHaveBeenCalledWith("/api/images");
  });

  test("uploadImage POSTs the file with original name header", async () => {
    mockAuthFetch.mockOk({ id: "x", name: "a.png" }, 201);
    const file = new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" });
    await uploadImage(file);
    const [url, init] = mockAuthFetch.mock.calls[0];
    expect(url).toBe("/api/images");
    expect(init.method).toBe("POST");
    expect(init.headers["X-File-Name"]).toBe("a.png");
    expect(init.body).toBe(file);
  });

  test("deleteImage DELETEs by id", async () => {
    mockAuthFetch.mockOk({ deleted: true });
    await deleteImage("ab".repeat(16));
    const [url, init] = mockAuthFetch.mock.calls[0];
    expect(url).toBe(`/api/images?id=${"ab".repeat(16)}`);
    expect(init.method).toBe("DELETE");
  });
});

describe("images client 错误分支", () => {
  beforeEach(() => {
    mockAuthFetch.mockReset();
  });

  test("listImages 非 2xx 抛响应文本", async () => {
    mockAuthFetch.mockError(503, "unavailable");
    await expect(listImages()).rejects.toThrow("unavailable");
  });

  test("listImages 空 body 抛默认文案", async () => {
    mockAuthFetch.mockError(500, "");
    setLang("zh");
    await expect(listImages()).rejects.toThrow("获取图片列表失败");
  });

  test("uploadImage 非 2xx 抛响应文本", async () => {
    mockAuthFetch.mockError(413, "too large");
    await expect(
      uploadImage(new File(["x"], "a.png", { type: "image/png" }))
    ).rejects.toThrow("too large");
  });

  test("deleteImage 非 2xx 抛默认文案", async () => {
    mockAuthFetch.mockError(404, "");
    setLang("zh");
    await expect(deleteImage("a".repeat(32))).rejects.toThrow("删除图片失败");
  });
});
