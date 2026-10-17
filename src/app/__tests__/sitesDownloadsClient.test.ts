import { vi } from "vitest";

import { authFetch } from "../auth";
import {
  DOWNLOADS_MAX_FILES,
  downloadsPublishBlockReason,
  partitionDownloadsFiles,
  publishDownloadsSite,
} from "../sites";
import { setLang } from "../strings";
import { asAuthFetchMock } from "../testUtils";
import { FileItem } from "../types";

vi.mock("../auth", () => ({
  authFetch: vi.fn(),
}));

const mockAuthFetch = asAuthFetchMock(authFetch);

function file(name: string, size = 10): FileItem {
  return {
    key: `rel/${name}`,
    name,
    isDir: false,
    size,
    uploaded: "2026-01-01T00:00:00.000Z",
    contentType: "application/octet-stream",
  };
}

describe("downloads client helpers", () => {
  beforeEach(() => {
    mockAuthFetch.mockReset();
    setLang("zh");
  });

  test("partitionDownloadsFiles", () => {
    const { assets, readme, ignored } = partitionDownloadsFiles([
      file("app.zip"),
      file("README.md"),
      file(".DS_Store"),
      { ...file("folder"), isDir: true, name: "folder", key: "rel/folder" },
    ]);
    expect(assets.map((a) => a.name)).toEqual(["app.zip"]);
    expect(readme?.name).toBe("README.md");
    expect(ignored).toBe(2);
  });

  test("downloadsPublishBlockReason", () => {
    expect(downloadsPublishBlockReason([])).toMatch(/没有可发布|no top-level/);
    expect(downloadsPublishBlockReason([file("a.zip")])).toBeNull();
    const many = Array.from({ length: DOWNLOADS_MAX_FILES + 1 }, (_, i) => file(`f${i}.zip`));
    expect(downloadsPublishBlockReason(many)).toMatch(/超过上限|exceed/);
  });

  test("publishDownloadsSite POSTs downloads payload", async () => {
    mockAuthFetch.mockOk({
      slug: "rel",
      kind: "downloads",
      copied: 1,
      sitesHost: "sites.example.com",
    });
    const result = await publishDownloadsSite("Rel", ["rel/a.zip"], {
      lang: "zh",
      title: "发布",
      readmeKey: "rel/README.md",
    });
    expect(result.kind).toBe("downloads");
    const [url, init] = mockAuthFetch.mock.calls[0];
    expect(url).toBe("/api/sites");
    expect(JSON.parse(init.body)).toEqual({
      slug: "rel",
      downloads: {
        lang: "zh",
        title: "发布",
        files: ["rel/a.zip"],
        readmeKey: "rel/README.md",
      },
    });
  });

  test("publishDownloadsSite rejects bad slug / non-2xx", async () => {
    await expect(publishDownloadsSite("BAD", ["a.zip"])).rejects.toThrow();
    mockAuthFetch.mockError(500, "boom");
    await expect(publishDownloadsSite("ok", ["a.zip"])).rejects.toThrow("boom");
  });
});
