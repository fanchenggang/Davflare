import { vi } from "vitest";

import { authFetch } from "../auth";
import {
  BOOKSHELF_MAX_FILES,
  bookshelfPublishBlockReason,
  partitionBookshelfFiles,
  publishBookshelfSite,
  siteSlugConflictMessage,
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
    key: `lib/${name}`,
    name,
    isDir: false,
    size,
    uploaded: "2026-01-01T00:00:00.000Z",
    contentType: "application/pdf",
  };
}

describe("bookshelf client helpers", () => {
  beforeEach(() => {
    mockAuthFetch.mockReset();
    setLang("zh");
  });

  test("partitionBookshelfFiles", () => {
    const { assets, ignored } = partitionBookshelfFiles([
      file("a.pdf"),
      file("b.epub"),
      file("c.zip"),
      { ...file("folder"), isDir: true, name: "folder", key: "lib/folder" },
    ]);
    expect(assets.map((a) => a.name)).toEqual(["a.pdf", "b.epub"]);
    expect(ignored).toBe(2);
  });

  test("bookshelfPublishBlockReason", () => {
    expect(bookshelfPublishBlockReason([])).toMatch(/没有可发布|No top-level/);
    expect(bookshelfPublishBlockReason([file("a.pdf")])).toBeNull();
    const many = Array.from({ length: BOOKSHELF_MAX_FILES + 1 }, (_, i) => file(`f${i}.pdf`));
    expect(bookshelfPublishBlockReason(many)).toMatch(/超过上限|exceed/);
    const huge = [file("big.pdf", 512 * 1024 * 1024 + 1)];
    expect(bookshelfPublishBlockReason(huge)).toMatch(/超过上限|too large|exceed/i);
  });

  test("publishBookshelfSite POSTs bookshelf payload", async () => {
    mockAuthFetch.mockOk({
      slug: "lib",
      kind: "bookshelf",
      copied: 1,
      sitesHost: "sites.example.com",
    });
    const result = await publishBookshelfSite("Lib", ["lib/a.pdf"], {
      lang: "zh",
      title: "资料",
    });
    expect(result.kind).toBe("bookshelf");
    const [url, init] = mockAuthFetch.mock.calls[0];
    expect(url).toBe("/api/sites");
    expect(JSON.parse(init.body)).toEqual({
      slug: "lib",
      bookshelf: {
        lang: "zh",
        title: "资料",
        files: ["lib/a.pdf"],
      },
    });
  });

  test("publishBookshelfSite rejects bad slug / non-2xx", async () => {
    await expect(publishBookshelfSite("BAD", ["a.pdf"])).rejects.toThrow();
    mockAuthFetch.mockError(500, "boom");
    await expect(publishBookshelfSite("ok", ["a.pdf"])).rejects.toThrow("boom");
  });

  test("siteSlugConflictMessage allows same-kind bookshelf republish", () => {
    expect(
      siteSlugConflictMessage(
        { slug: "lib", exists: true, kind: "bookshelf", source: null },
        "bookshelf",
        null
      )
    ).toBeNull();
    expect(
      siteSlugConflictMessage(
        { slug: "lib", exists: true, kind: "downloads", source: null },
        "bookshelf",
        null
      )
    ).toMatch(/占用|taken|下载|download/i);
  });
});
