import { authFetch } from "../auth";
import { deleteImage, listImages, uploadImage } from "../images";

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

describe("images client", () => {
  test("listImages GETs /api/images", async () => {
    mockAuthFetch.mockResolvedValue(jsonResponse({ sitesHost: null, images: [] }));
    await listImages();
    expect(mockAuthFetch).toHaveBeenCalledWith("/api/images");
  });

  test("uploadImage POSTs the file with original name header", async () => {
    mockAuthFetch.mockResolvedValue(jsonResponse({ id: "x", name: "a.png" }, true, 201));
    const file = new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" });
    await uploadImage(file);
    const [url, init] = mockAuthFetch.mock.calls[0];
    expect(url).toBe("/api/images");
    expect(init.method).toBe("POST");
    expect(init.headers["X-File-Name"]).toBe("a.png");
    expect(init.body).toBe(file);
  });

  test("deleteImage DELETEs by id", async () => {
    mockAuthFetch.mockResolvedValue(jsonResponse({ deleted: true }));
    await deleteImage("ab".repeat(16));
    const [url, init] = mockAuthFetch.mock.calls[0];
    expect(url).toBe(`/api/images?id=${"ab".repeat(16)}`);
    expect(init.method).toBe("DELETE");
  });
});
