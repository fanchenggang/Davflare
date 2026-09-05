import { authFetch } from "../auth";
import { deleteImage, listImages, uploadImage } from "../images";
import { asAuthFetchMock } from "../testUtils";

jest.mock("../auth", () => ({
  authFetch: jest.fn(),
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
