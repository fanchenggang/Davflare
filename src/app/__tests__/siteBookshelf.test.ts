import {
  BOOKSHELF_MAX_FILES,
  bookshelfCoverRel,
  bookshelfMimeType,
  bookshelfNameCandidate,
  bookshelfPublicBase,
  checkBookshelfLimits,
  isBookshelfAssetName,
  renderBookshelfPage,
} from "../../../functions/sitePages";

describe("bookshelf helpers", () => {
  test("asset name filters", () => {
    expect(isBookshelfAssetName("guide.pdf")).toBe(true);
    expect(isBookshelfAssetName("book.EPUB")).toBe(true);
    expect(isBookshelfAssetName("app.zip")).toBe(false);
    expect(isBookshelfAssetName("README.md")).toBe(false);
    expect(isBookshelfAssetName(".hidden.pdf")).toBe(false);
  });

  test("mime + name candidate + cover rel", () => {
    expect(bookshelfMimeType("Guide.pdf")).toBe("application/pdf");
    expect(bookshelfMimeType("Novel.epub")).toBe("application/epub+zip");
    expect(bookshelfNameCandidate("guide.pdf", 1)).toBe("guide.pdf");
    expect(bookshelfNameCandidate("guide.pdf", 2)).toBe("guide-2.pdf");
    expect(bookshelfNameCandidate("app.zip", 1)).toBeNull();
    expect(bookshelfCoverRel("guide.pdf")).toBe("covers/guide.png");
  });

  test("checkBookshelfLimits", () => {
    expect(checkBookshelfLimits(0, 0).ok).toBe(false);
    expect(checkBookshelfLimits(1, 10).ok).toBe(true);
    expect(checkBookshelfLimits(BOOKSHELF_MAX_FILES + 1, 1).ok).toBe(false);
  });

  test("bookshelfPublicBase", () => {
    expect(bookshelfPublicBase("sites.example.com", "lib")).toBe("https://sites.example.com/lib");
    expect(bookshelfPublicBase(null, "lib")).toBeNull();
  });

  test("renderBookshelfPage lists open/download and cover", () => {
    const html = renderBookshelfPage({
      lang: "zh",
      title: "资料",
      files: [
        {
          name: "guide.pdf",
          size: 1200,
          uploaded: "2026-01-02T00:00:00.000Z",
          contentType: "application/pdf",
          url: "https://sites.example.com/lib/guide.pdf",
          cover: "covers/guide.png",
        },
      ],
    });
    expect(html).toContain("guide.pdf");
    expect(html).toContain("covers/guide.png");
    expect(html).toContain("打开");
    expect(html).toContain("下载");
    expect(html).toContain('download="guide.pdf"');
  });
});
