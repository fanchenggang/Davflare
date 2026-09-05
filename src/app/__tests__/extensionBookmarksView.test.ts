import { createRequire } from "module";

const nodeRequire = createRequire(import.meta.url);

const BookmarksView = nodeRequire("../../../extension/bookmarksView.js") as {
  domainOf: (url: unknown) => string;
  fallbackLetter: (item: unknown) => string;
  filterBookmarks: (
    model: unknown,
    opts?: { query?: string; folder?: string | null; tag?: string | null }
  ) => Array<Record<string, unknown>>;
  formatDate: (ms: number, lang?: string) => string;
  formatBytes: (n: number) => string;
  formatRelative: (ms: number, now: number, lang?: string) => string;
  folderList: (model: unknown) => Array<{ name: string; count: number }>;
  tagList: (model: unknown) => Array<{ name: string; count: number }>;
};

function modelWith(bookmarks: Array<Record<string, unknown>>) {
  return { version: 1, bookmarks };
}

describe("extension/bookmarksView.js basics", () => {
  test("domainOf keeps only http(s) hosts", () => {
    expect(BookmarksView.domainOf("https://a.example/x")).toBe("a.example");
    expect(BookmarksView.domainOf("http://b.example:8080/")).toBe("b.example");
    expect(BookmarksView.domainOf("chrome://settings")).toBe("");
    expect(BookmarksView.domainOf("not a url")).toBe("");
    expect(BookmarksView.domainOf(null)).toBe("");
  });

  test("fallbackLetter prefers the title, then domain, then a placeholder", () => {
    expect(BookmarksView.fallbackLetter({ title: "github home", url: "https://x.io" })).toBe("G");
    expect(BookmarksView.fallbackLetter({ title: "", url: "https://docs.io" })).toBe("D");
    expect(BookmarksView.fallbackLetter({ title: "", url: "" })).toBe("?");
  });

  test("formatBytes spans B / KB / MB", () => {
    expect(BookmarksView.formatBytes(0)).toBe("0 B");
    expect(BookmarksView.formatBytes(512)).toBe("512 B");
    expect(BookmarksView.formatBytes(2048)).toBe("2.0 KB");
    expect(BookmarksView.formatBytes(5 * 1024 * 1024)).toBe("5.00 MB");
  });

  test("formatRelative handles never / just now / minutes / hours / days in both languages", () => {
    const now = Date.UTC(2026, 8, 5, 12, 0, 0);
    expect(BookmarksView.formatRelative(0, now, "en")).toBe("never synced");
    expect(BookmarksView.formatRelative(0, now, "zh")).toBe("从未同步");
    expect(BookmarksView.formatRelative(now - 30_000, now, "zh")).toBe("刚刚");
    expect(BookmarksView.formatRelative(now - 5 * 60_000, now, "en")).toBe("5m ago");
    expect(BookmarksView.formatRelative(now - 3 * 3_600_000, now, "zh")).toBe("3 小时前");
    expect(BookmarksView.formatRelative(now - 2 * 86_400_000, now, "en")).toBe("2d ago");
    expect(BookmarksView.formatRelative(now - 40 * 86_400_000, now, "en")).toBe(
      "2026/07/27"
    );
  });

  test("formatDate renders yyyy/mm/dd or a placeholder", () => {
    expect(BookmarksView.formatDate(Date.UTC(2026, 7, 24), "en")).toBe("2026/08/24");
    expect(BookmarksView.formatDate(0, "zh")).toBe("未知");
  });
});

describe("extension/bookmarksView.js folderList / tagList", () => {
  test("folders keep unfiled first, then alphabetical, with counts", () => {
    const folders = BookmarksView.folderList(
      modelWith([
        { folder: "Dev" },
        { folder: "" },
        { folder: "Dev" },
        { folder: "Art" },
      ])
    );
    expect(folders).toEqual([
      { name: "", count: 1 },
      { name: "Art", count: 1 },
      { name: "Dev", count: 2 },
    ]);
  });

  test("tags aggregate counts and sort by count desc then name", () => {
    const tags = BookmarksView.tagList(
      modelWith([
        { tags: ["dev", "rust"] },
        { tags: ["dev"] },
        { tags: ["aigc"] },
      ])
    );
    expect(tags).toEqual([
      { name: "dev", count: 2 },
      { name: "aigc", count: 1 },
      { name: "rust", count: 1 },
    ]);
  });
});

describe("extension/bookmarksView.js filterBookmarks", () => {
  const model = modelWith([
    { id: "1", title: "Rust book", url: "https://doc.rust-lang.org", folder: "Dev", tags: ["rust", "docs"], note: "" },
    { id: "2", title: "腾讯云", url: "https://cloud.tencent.com", folder: "Work", tags: ["infra"], note: "控制台" },
    { id: "3", title: "Hoppscotch", url: "https://hoppscotch.io", folder: "Dev", tags: ["api"], note: "" },
  ]);

  test("matches the query against title, url, note, tags, and domain", () => {
    const q = (query: string) =>
      BookmarksView.filterBookmarks(model, { query }).map((b) => b.id);
    expect(q("rust")).toEqual(["1"]);
    expect(q("tencent")).toEqual(["2"]);
    expect(q("控制台")).toEqual(["2"]);
    expect(q("infra")).toEqual(["2"]);
    expect(q("HOPPS")).toEqual(["3"]);
    expect(q("no-such-thing")).toEqual([]);
    expect(q("")).toHaveLength(3);
  });

  test("folder and tag filters narrow the list and combine with the query", () => {
    const folder = BookmarksView.filterBookmarks(model, { folder: "Dev" });
    expect(folder.map((b) => b.id)).toEqual(["1", "3"]);

    const tag = BookmarksView.filterBookmarks(model, { tag: "rust" });
    expect(tag.map((b) => b.id)).toEqual(["1"]);

    const combined = BookmarksView.filterBookmarks(model, {
      query: "book",
      folder: "Dev",
      tag: "rust",
    });
    expect(combined.map((b) => b.id)).toEqual(["1"]);

    const miss = BookmarksView.filterBookmarks(model, { folder: "Dev", tag: "infra" });
    expect(miss).toEqual([]);
  });
});
