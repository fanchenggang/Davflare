/** 网页端文件夹/多选下载与 GET /api/archive 对齐：`<文件夹名>.zip`、条目相对文件夹（#119 同 PR）。 */
import { vi } from "vitest";
import {
  archiveNameFor,
  downloadArchive,
  downloadFolderArchive,
  downloadSelectionArchive,
} from "../transfer";
import { authFetch } from "../auth";
import { asAuthFetchMock } from "../testUtils";

vi.mock("../auth", () => ({
  authFetch: vi.fn(),
  basicAuthHeader: vi.fn(() => "Basic abc"),
}));

const mockAuthFetch = asAuthFetchMock(authFetch);
let savedNames: string[] = [];

beforeEach(() => {
  mockAuthFetch.mockReset();
  mockAuthFetch.mockResolvedValue({
    ok: true,
    blob: async () => new Blob(["zip"]),
    text: async () => "",
  } as unknown as Response);
  savedNames = [];
  (URL as any).createObjectURL = vi.fn(() => "blob:x");
  (URL as any).revokeObjectURL = vi.fn();
  const orig = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    const el = orig(tag);
    if (tag === "a") {
      (el as HTMLAnchorElement).click = () => savedNames.push((el as HTMLAnchorElement).download);
    }
    return el;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("archiveNameFor", () => {
  test("folder name .zip; root → archive.zip", () => {
    expect(archiveNameFor("")).toBe("archive.zip");
    expect(archiveNameFor("资料/子目录/")).toBe("子目录.zip");
    expect(archiveNameFor("docs")).toBe("docs.zip");
  });
});

describe("downloadFolderArchive", () => {
  test("GET /api/archive?path=<folder>/ and saves <folder>.zip", async () => {
    await downloadFolderArchive("资料/子目录/");
    expect(mockAuthFetch).toHaveBeenCalledWith(
      `/api/archive?path=${encodeURIComponent("资料/子目录/")}`
    );
    expect(savedNames).toEqual(["子目录.zip"]);
  });

  test("throws server text on failure", async () => {
    mockAuthFetch.mockResolvedValue({ ok: false, text: async () => "路径不存在" } as unknown as Response);
    await expect(downloadFolderArchive("nope")).rejects.toThrow("路径不存在");
  });
});

describe("downloadSelectionArchive", () => {
  test("all keys under cwd → base=cwd, <cwd>.zip", async () => {
    await downloadSelectionArchive(["资料/a.txt", "资料/子目录"], "资料/");
    const init = mockAuthFetch.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      keys: ["资料/a.txt", "资料/子目录"],
      base: "资料/",
    });
    expect(savedNames).toEqual(["资料.zip"]);
  });

  test("drive root → archive.zip without base", async () => {
    await downloadSelectionArchive(["a.txt", "b.txt"], "");
    const init = mockAuthFetch.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ keys: ["a.txt", "b.txt"] });
    expect(savedNames).toEqual(["archive.zip"]);
  });

  test("keys outside cwd (e.g. global search) → full paths + archive.zip", async () => {
    await downloadSelectionArchive(["资料/a.txt", "other/b.txt"], "资料/");
    const init = mockAuthFetch.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ keys: ["资料/a.txt", "other/b.txt"] });
    expect(savedNames).toEqual(["archive.zip"]);
  });

  test("downloadArchive default name stays archive.zip", async () => {
    await downloadArchive(["x"]);
    expect(savedNames).toEqual(["archive.zip"]);
  });
});
