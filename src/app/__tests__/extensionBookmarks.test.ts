import { createRequire } from "module";

const nodeRequire = createRequire(import.meta.url);

type BookmarkRow = Record<string, unknown>;
type BookmarkModel = { version: number; bookmarks: BookmarkRow[]; folders?: string[] };

const Bookmarks = nodeRequire("../../../extension/bookmarks.js") as {
  MODEL_VERSION: number;
  addBookmark: (
    model: unknown,
    item: { id?: string; title?: string; url?: string; folder?: string; tags?: string[]; note?: string; added?: number },
    options?: { overwriteTitle?: boolean }
  ) => { model: BookmarkModel; added: boolean; restored?: boolean };
  trashedByUrl: (model: unknown, url: unknown) => BookmarkRow | null;
  adoptRichFields: (htmlModel: unknown, jsonModel: unknown) => BookmarkModel;
  duplicateGroups: (model: unknown) => Array<{ key: string; items: BookmarkRow[] }>;
  emptyModel: () => BookmarkModel;
  folderPaths: (model: unknown) => string[];
  isWebUrl: (url: unknown) => boolean;
  isValidModel: (value: unknown) => boolean;
  mergeModels: (base: unknown, incoming: unknown) => BookmarkModel;
  modelFromJson: (text: string) => { ok: boolean; model: BookmarkModel };
  modelToJsonText: (model: unknown) => string;
  normalizeModel: (raw: unknown) => BookmarkModel;
  parseHtml: (text: string) => BookmarkModel;
  parseRemoteLibrary: (res: {
    html?: string;
    jsonText?: string | null;
  }) => BookmarkModel;
  purgeExpiredTrash: (
    model: unknown,
    now: number,
    maxAgeMs?: number
  ) => { model: BookmarkModel; purged: number };
  restoreBookmarks: (
    model: unknown,
    entries: { bookmark: BookmarkRow; index: number }[]
  ) => BookmarkModel;
  restoreFromTrash: (model: unknown, ids: string[]) => BookmarkModel;
  removeBookmark: (model: unknown, id: string) => BookmarkModel;
  removeBookmarks: (model: unknown, ids: string[]) => BookmarkModel;
  searchBookmarks: (
    model: unknown,
    query: string,
    limit?: number
  ) => { title: string; url: string; folder: string; tags: string[] }[];
  serializeHtml: (model: unknown) => string;
  setBookmarkUrl: (
    model: unknown,
    id: string,
    url: unknown
  ) => { model: BookmarkModel; ok: boolean; reason?: string };
  deleteFolderTree: (
    model: unknown,
    path: unknown
  ) => {
    model: BookmarkModel;
    moved: number;
    undo: { moves: { id: string; folder: string }[]; folders: string[] };
  };
  folderTreeCount: (model: unknown, path: unknown) => number;
  hasSubfolders: (model: unknown, path: unknown) => boolean;
  restoreFolderTree: (
    model: unknown,
    undo: unknown
  ) => { model: BookmarkModel; restored: number };
  softDeleteBookmarks: (model: unknown, ids: string[], now?: number) => BookmarkModel;
  updateBookmark: (
    model: unknown,
    id: string,
    patch: { title?: string; note?: string; folder?: string; tags?: string[] }
  ) => BookmarkModel;
  urlKey: (url: unknown) => string;
};

const CHROME_EXPORT = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><A HREF="https://root.example/" ADD_DATE="1690000900">Root Link</A>
    <DT><H3 ADD_DATE="1690000000" PERSONAL_TOOLBAR_FOLDER="true">书签栏</H3>
    <DL><p>
        <DT><A HREF="https://example.com/" ADD_DATE="1690000100">Example</A>
        <DT><A HREF="https://example.org/?q=1&amp;x=2" ADD_DATE="1690000200">A &amp; B</A>
        <DT><A HREF="javascript:void(0)">bad</A>
        <DT><H3 ADD_DATE="1690000300">Dev</H3>
        <DL><p>
            <DT><H3 ADD_DATE="1690000400">Rust</H3>
            <DL><p>
                <DT><A HREF="https://rust-lang.org" ADD_DATE="1690000500">Rust</A>
            </DL><p>
        </DL><p>
    </DL><p>
</DL><p>
`;

describe("extension/bookmarks.js parseHtml", () => {
  test("flattens chrome-style exports into folder paths and epoch ms", () => {
    const model = Bookmarks.parseHtml(CHROME_EXPORT);
    expect(model.bookmarks).toHaveLength(4);
    expect(model.bookmarks[0]).toMatchObject({
      title: "Root Link",
      url: "https://root.example/",
      folder: "",
      added: 1690000900000,
    });
    expect(model.bookmarks[1]).toMatchObject({
      title: "Example",
      url: "https://example.com/",
      folder: "书签栏",
      added: 1690000100000,
    });
    expect(model.bookmarks[2]).toMatchObject({
      title: "A & B",
      url: "https://example.org/?q=1&x=2",
      folder: "书签栏",
    });
    expect(model.bookmarks[3]).toMatchObject({
      title: "Rust",
      url: "https://rust-lang.org",
      folder: "书签栏/Dev/Rust",
    });
  });

  test("keeps only http(s) links and tags every parsed bookmark as untagged", () => {
    const model = Bookmarks.parseHtml(CHROME_EXPORT);
    for (const item of model.bookmarks) {
      expect(String(item.url)).toMatch(/^https?:\/\//);
      expect(item.tags).toEqual([]);
    }
  });

  test("root-level links land in the unfiled folder", () => {
    const html = `<H1>Bookmarks</H1><DL><p><DT><A HREF="https://a.example" ADD_DATE="1">A</A></DL><p>`;
    const model = Bookmarks.parseHtml(html);
    expect(model.bookmarks[0].folder).toBe("");
  });

  test("empty or garbage input yields an empty model instead of throwing", () => {
    expect(Bookmarks.parseHtml("")).toEqual({ version: 1, bookmarks: [], folders: [] });
    expect(Bookmarks.parseHtml("<p>not a bookmark file</p>")).toEqual({
      version: 1,
      bookmarks: [],
      folders: [],
    });
  });

  test("fallback tokenizer matches DOM parse without DOMParser (#75 SW)", () => {
    const RealDOMParser = (globalThis as { DOMParser?: unknown }).DOMParser;
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as { DOMParser?: unknown }).DOMParser;
    try {
      const model = Bookmarks.parseHtml(CHROME_EXPORT);
      expect(model.bookmarks).toHaveLength(4);
      expect(model.bookmarks[0]).toMatchObject({
        title: "Root Link",
        url: "https://root.example/",
        folder: "",
      });
      expect(model.bookmarks[3]).toMatchObject({
        title: "Rust",
        url: "https://rust-lang.org",
        folder: "书签栏/Dev/Rust",
      });
      expect(model.bookmarks[2]).toMatchObject({
        title: "A & B",
        url: "https://example.org/?q=1&x=2",
      });
    } finally {
      if (RealDOMParser) {
        (globalThis as { DOMParser?: unknown }).DOMParser = RealDOMParser;
      }
    }
  });
});

describe("extension/bookmarks.js parseRemoteLibrary (#75)", () => {
  test("prefers JSON when HTML would need DOMParser", () => {
    const model = Bookmarks.addBookmark(Bookmarks.emptyModel(), {
      title: "T",
      url: "https://json-only.example/",
      folder: "Dev",
      tags: ["a"],
      added: 1_700_000_000_000,
    }).model;
    const RealDOMParser = (globalThis as { DOMParser?: unknown }).DOMParser;
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as { DOMParser?: unknown }).DOMParser;
    try {
      const parsed = Bookmarks.parseRemoteLibrary({
        html: "<p>ignored</p>",
        jsonText: Bookmarks.modelToJsonText(model),
      });
      expect(parsed.bookmarks).toHaveLength(1);
      expect(parsed.bookmarks[0]).toMatchObject({
        url: "https://json-only.example/",
        folder: "Dev",
        tags: ["a"],
      });
    } finally {
      if (RealDOMParser) {
        (globalThis as { DOMParser?: unknown }).DOMParser = RealDOMParser;
      }
    }
  });

  test("HTML-only still works without DOMParser via fallback", () => {
    const RealDOMParser = (globalThis as { DOMParser?: unknown }).DOMParser;
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as { DOMParser?: unknown }).DOMParser;
    try {
      const parsed = Bookmarks.parseRemoteLibrary({
        html: CHROME_EXPORT,
        jsonText: null,
      });
      expect(parsed.bookmarks).toHaveLength(4);
    } finally {
      if (RealDOMParser) {
        (globalThis as { DOMParser?: unknown }).DOMParser = RealDOMParser;
      }
    }
  });
});

describe("extension/bookmarks.js serializeHtml", () => {
  test("emits a Netscape header and escapes attributes and text", () => {
    const html = Bookmarks.serializeHtml({
      bookmarks: [
        { id: "b1", title: 'He said "<hi>" & left', url: "https://a.com/?x=1&y=2", added: 1690000100123 },
      ],
    });
    expect(html).toContain("<!DOCTYPE NETSCAPE-Bookmark-file-1>");
    expect(html).toContain('<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">');
    expect(html).toContain('HREF="https://a.com/?x=1&amp;y=2"');
    expect(html).toContain('He said "&lt;hi&gt;" &amp; left');
    expect(html).toContain('ADD_DATE="1690000100"');
  });

  test("round-trips urls, titles, and folders at second precision", () => {
    const model = {
      bookmarks: [
        { id: "b1", title: "Root", url: "https://root.example", added: 1690000100123 },
        { id: "b2", title: "Nested", url: "https://deep.example", folder: "书签栏/Dev", added: 1690000200000 },
      ],
    };
    const parsed = Bookmarks.parseHtml(Bookmarks.serializeHtml(model));
    expect(parsed.bookmarks).toHaveLength(2);
    const byUrl = new Map(parsed.bookmarks.map((b) => [b.url, b]));
    const root = byUrl.get("https://root.example") as Record<string, unknown>;
    const deep = byUrl.get("https://deep.example") as Record<string, unknown>;
    expect(root.title).toBe("Root");
    expect(root.folder).toBe("");
    expect(root.added).toBe(Math.floor(1690000100123 / 1000) * 1000);
    expect(deep.folder).toBe("书签栏/Dev");
  });

  test("a serialized empty model still parses to an empty model", () => {
    const parsed = Bookmarks.parseHtml(Bookmarks.serializeHtml(Bookmarks.emptyModel()));
    expect(parsed.bookmarks).toHaveLength(0);
  });
});

describe("extension/bookmarks.js urlKey", () => {
  test("ignores fragments and normalizes the root trailing slash", () => {
    expect(Bookmarks.urlKey("https://a.com/x#frag")).toBe(Bookmarks.urlKey("https://a.com/x"));
    expect(Bookmarks.urlKey("http://a.com")).toBe(Bookmarks.urlKey("http://a.com/"));
    expect(Bookmarks.urlKey("https://a.com/x")).not.toBe(Bookmarks.urlKey("https://a.com/y"));
  });

  test("strips tracking parameters so tagged and clean URLs dedupe together", () => {
    expect(Bookmarks.urlKey("https://a.com/x?utm_source=n&utm_medium=r&id=2")).toBe(
      Bookmarks.urlKey("https://a.com/x?id=2")
    );
    expect(Bookmarks.urlKey("https://a.com/x?fbclid=1")).toBe(Bookmarks.urlKey("https://a.com/x"));
    expect(Bookmarks.urlKey("https://a.com/x?gclid=c&utm_id=9#top")).toBe(
      Bookmarks.urlKey("https://a.com/x")
    );
    // Functional parameters survive; only the known tracker list is dropped.
    expect(Bookmarks.urlKey("https://a.com/x?q=1")).toBe(Bookmarks.urlKey("https://a.com/x?q=1"));
    expect(Bookmarks.urlKey("https://a.com/x?utm_source=n&q=1")).toBe(
      Bookmarks.urlKey("https://a.com/x?q=1")
    );
    // Non-http URLs never go through parameter stripping.
    expect(Bookmarks.urlKey("chrome://settings/?utm_source=x")).toBe("chrome://settings/?utm_source=x");
  });
});

describe("extension/bookmarks.js addBookmark / merge / remove", () => {
  test("adds a valid page once and rejects duplicates and non-http urls", () => {
    let model = Bookmarks.emptyModel();
    const first = Bookmarks.addBookmark(model, { title: "A", url: "https://a.com", added: 1 });
    expect(first.added).toBe(true);
    model = first.model;
    expect(Bookmarks.addBookmark(model, { title: "A2", url: "https://a.com#top" }).added).toBe(
      false
    );
    expect(Bookmarks.addBookmark(model, { title: "JS", url: "javascript:alert(1)" }).added).toBe(
      false
    );
    expect(model.bookmarks).toHaveLength(1);
    expect(String(model.bookmarks[0].id)).toMatch(/^bm-[0-9a-z]+-[0-9a-z]+$/);
  });

  test("mergeModels keeps the base entry on URL collisions and appends the rest", () => {
    const base = {
      bookmarks: [{ id: "b1", title: "Keep", url: "https://a.com", tags: ["x"] }],
    };
    const incoming = {
      bookmarks: [
        { id: "b2", title: "Drop", url: "https://a.com/" },
        { id: "b3", title: "New", url: "https://b.com" },
      ],
    };
    const merged = Bookmarks.mergeModels(base, incoming);
    expect(merged.bookmarks).toHaveLength(2);
    expect(merged.bookmarks[0]).toMatchObject({ title: "Keep", tags: ["x"] });
    expect(merged.bookmarks[1]).toMatchObject({ title: "New" });
  });

  test("removeBookmark drops only the matching id", () => {
    const model = Bookmarks.normalizeModel({
      bookmarks: [
        { id: "b1", url: "https://a.com" },
        { id: "b2", url: "https://b.com" },
      ],
    });
    const next = Bookmarks.removeBookmark(model, "b1");
    expect(next.bookmarks.map((b) => b.id)).toEqual(["b2"]);
  });

  test("updateBookmark patches tags/note/title/folder but never id or url", () => {
    const model = Bookmarks.normalizeModel({
      bookmarks: [{ id: "b1", url: "https://a.com", title: "A", tags: ["x"] }],
    });
    const next = Bookmarks.updateBookmark(model, "b1", {
      tags: ["dev", "docs", "dev", ""],
      note: "readme",
      title: "A2",
      folder: "Dev",
    });
    expect(next.bookmarks[0]).toMatchObject({
      id: "b1",
      url: "https://a.com",
      title: "A2",
      note: "readme",
      folder: "Dev",
      tags: ["dev", "docs"],
    });
    expect(Bookmarks.updateBookmark(model, "missing", { title: "nope" })).toEqual(model);
  });
});

describe("extension/bookmarks.js json sidecar", () => {
  test("adoptRichFields re-attaches tags, note, and id by URL without importing json-only rows", () => {
    const htmlModel = Bookmarks.parseHtml(
      `<DL><p><DT><A HREF="https://a.com" ADD_DATE="1">A</A></DL><p>`
    );
    const jsonModel = Bookmarks.normalizeModel({
      bookmarks: [
        { id: "stable-1", url: "https://a.com/", tags: ["dev", "rust"], note: "docs" },
        { id: "gone", url: "https://only-in-json.example", tags: ["ghost"] },
      ],
    });
    const merged = Bookmarks.adoptRichFields(htmlModel, jsonModel);
    expect(merged.bookmarks).toHaveLength(1);
    expect(merged.bookmarks[0]).toMatchObject({
      id: "stable-1",
      tags: ["dev", "rust"],
      note: "docs",
    });
  });

  test("modelToJsonText / modelFromJson round-trip and reject garbage", () => {
    const model = Bookmarks.normalizeModel({
      bookmarks: [{ id: "b1", url: "https://a.com", title: "A", tags: ["t"] }],
    });
    const text = Bookmarks.modelToJsonText(model);
    const back = Bookmarks.modelFromJson(text);
    expect(back.ok).toBe(true);
    expect(back.model.bookmarks[0]).toMatchObject({ id: "b1", tags: ["t"] });

    expect(Bookmarks.modelFromJson("not json").ok).toBe(false);
    expect(Bookmarks.modelFromJson('{"nope":1}').ok).toBe(false);
    expect(Bookmarks.modelFromJson("").ok).toBe(false);
  });

  test("normalizeModel sanitizes junk rows and duplicate ids", () => {
    const model = Bookmarks.normalizeModel({
      bookmarks: [
        { url: "https://a.com", tags: ["x", "x", "", 42] },
        { url: "" },
        null,
      ],
    });
    expect(model.bookmarks).toHaveLength(1);
    expect(model.bookmarks[0].tags).toEqual(["x"]);
    expect(Bookmarks.isValidModel(model)).toBe(true);
    expect(Bookmarks.isValidModel({ bookmarks: [] })).toBe(false);
    expect(Bookmarks.isWebUrl("https://a.com")).toBe(true);
    expect(Bookmarks.isWebUrl("chrome://settings")).toBe(false);
  });
});

describe("extension/bookmarks.js folderPaths", () => {
  test("lists ancestor prefixes for the popup folder datalist, sorted and unique", () => {
    const model = Bookmarks.parseHtml(CHROME_EXPORT);
    expect(Bookmarks.folderPaths(model)).toEqual([
      "书签栏",
      "书签栏/Dev",
      "书签栏/Dev/Rust",
    ]);
  });

  test("skips root-level bookmarks, trims slashes, and dedupes", () => {
    const model = Bookmarks.normalizeModel({
      bookmarks: [
        { url: "https://a.com", folder: "" },
        { url: "https://b.com", folder: "/Work/Rust/" },
        { url: "https://c.com", folder: "Work/Rust" },
        { url: "https://d.com", folder: "Work" },
      ],
    });
    expect(Bookmarks.folderPaths(model)).toEqual(["Work", "Work/Rust"]);
    expect(Bookmarks.folderPaths(Bookmarks.emptyModel())).toEqual([]);
  });
});

describe("extension/bookmarks.js searchBookmarks (issue #62 omnibox)", () => {
  const model = Bookmarks.normalizeModel({
    bookmarks: [
      { url: "https://rust-lang.org", title: "Rust", folder: "Dev/Rust", tags: ["lang"] },
      { url: "https://example.com", title: "Example", folder: "Work", tags: ["docs", "api"] },
      { url: "https://news.ycombinator.com", title: "Hacker News", folder: "", tags: ["daily"] },
    ],
  });

  test("matches title, url, tag, and folder substrings case-insensitively", () => {
    expect(Bookmarks.searchBookmarks(model, "RUST")).toHaveLength(1);
    expect(Bookmarks.searchBookmarks(model, "hacker")).toEqual([
      expect.objectContaining({ url: "https://news.ycombinator.com" }),
    ]);
    expect(Bookmarks.searchBookmarks(model, "docs")).toEqual([
      expect.objectContaining({ url: "https://example.com" }),
    ]);
    expect(Bookmarks.searchBookmarks(model, "work")).toEqual([
      expect.objectContaining({ url: "https://example.com" }),
    ]);
  });

  test("requires every whitespace-separated term (AND)", () => {
    expect(Bookmarks.searchBookmarks(model, "rust dev")).toHaveLength(1);
    expect(Bookmarks.searchBookmarks(model, "rust news")).toHaveLength(0);
  });

  test("caps results at limit and returns nothing for empty queries", () => {
    expect(Bookmarks.searchBookmarks(model, "o", 1)).toHaveLength(1);
    expect(Bookmarks.searchBookmarks(model, "")).toEqual([]);
    expect(Bookmarks.searchBookmarks(model, "   ")).toEqual([]);
    expect(Bookmarks.searchBookmarks(Bookmarks.emptyModel(), "rust")).toEqual([]);
  });
});

describe("extension/bookmarks.js setBookmarkUrl (round-2 edit dialog)", () => {
  function seeded() {
    let model = Bookmarks.emptyModel();
    model = Bookmarks.addBookmark(model, { id: "a", title: "A", url: "https://a.com/x", added: 1 })
      .model;
    model = Bookmarks.addBookmark(model, { id: "b", title: "B", url: "https://b.com", added: 2 })
      .model;
    return model;
  }

  test("changes the URL and keeps id and other rows intact", () => {
    const res = Bookmarks.setBookmarkUrl(seeded(), "a", "https://c.com/y");
    expect(res.ok).toBe(true);
    const a = res.model.bookmarks.find((b) => b.id === "a");
    expect(a && a.url).toBe("https://c.com/y");
    expect(res.model.bookmarks).toHaveLength(2);
  });

  test("rejects non-web URLs and URLs colliding with another entry", () => {
    const model = seeded();
    expect(Bookmarks.setBookmarkUrl(model, "a", "javascript:alert(1)")).toMatchObject({
      ok: false,
      reason: "invalid",
    });
    expect(
      Bookmarks.setBookmarkUrl(model, "a", "https://b.com/?utm_source=x")
    ).toMatchObject({ ok: false, reason: "exists" });
  });

  test("reports missing ids without touching the model", () => {
    const model = seeded();
    const res = Bookmarks.setBookmarkUrl(model, "nope", "https://c.com");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("missing");
    expect(res.model.bookmarks).toHaveLength(2);
  });
});

describe("extension/bookmarks.js deleteFolderTree (round-2 folder delete)", () => {
  function seeded() {
    const model = {
      version: Bookmarks.MODEL_VERSION,
      bookmarks: [
        { id: "1", title: "Dev", url: "https://a.com/1", folder: "Dev", added: 1 },
        { id: "2", title: "Rust", url: "https://a.com/2", folder: "Dev/Rust", added: 2 },
        { id: "3", title: "Root", url: "https://a.com/3", folder: "", added: 3 },
      ],
      folders: ["Dev", "Dev/Rust", "Other"],
    };
    return Bookmarks.normalizeModel(model);
  }

  test("moves direct and nested bookmarks to the root and clears declarations", () => {
    const res = Bookmarks.deleteFolderTree(seeded(), "Dev");
    expect(res.moved).toBe(2);
    expect(
      res.model.bookmarks.every((b) => b.id === "3" || b.folder === "")
    ).toBe(true);
    expect(res.model.folders).toEqual(["Other"]);
  });

  test("keeps unrelated folders and root bookmarks untouched", () => {
    const res = Bookmarks.deleteFolderTree(seeded(), "Dev");
    const root = res.model.bookmarks.find((b) => b.id === "3");
    expect(root && root.folder).toBe("");
    expect(res.model.folders).not.toContain("Dev");
  });

  test("an empty path is a no-op and an empty folder just disappears", () => {
    expect(Bookmarks.deleteFolderTree(seeded(), "").moved).toBe(0);
    expect(Bookmarks.deleteFolderTree(seeded(), null).moved).toBe(0);
    const empty = Bookmarks.deleteFolderTree(seeded(), "Other");
    expect(empty.moved).toBe(0);
    expect(empty.model.folders).toEqual(["Dev", "Dev/Rust"]);
  });
});

describe("extension/bookmarks.js recursive folder count + folder-delete undo (#126)", () => {
  // Issue #126 repro: QA125P has no direct bookmarks, QA125P/sub has two.
  function seeded() {
    return Bookmarks.normalizeModel({
      version: Bookmarks.MODEL_VERSION,
      bookmarks: [
        { id: "a", title: "A", url: "https://q.com/a", folder: "QA125P/sub", added: 1 },
        { id: "b", title: "B", url: "https://q.com/b", folder: "QA125P/sub", added: 2 },
        { id: "c", title: "C", url: "https://q.com/c", folder: "QA125Px", added: 3 },
        { id: "d", title: "D", url: "https://q.com/d", folder: "", added: 4 },
      ],
      folders: ["QA125P", "QA125P/sub", "QA125P/empty", "Keep"],
    });
  }

  test("folderTreeCount counts subfolder bookmarks, not sibling prefixes", () => {
    const model = seeded();
    expect(Bookmarks.folderTreeCount(model, "QA125P")).toBe(2);
    expect(Bookmarks.folderTreeCount(model, "/QA125P/")).toBe(2);
    expect(Bookmarks.folderTreeCount(model, "QA125P/sub")).toBe(2);
    expect(Bookmarks.folderTreeCount(model, "QA125P/empty")).toBe(0);
    // "QA125Px" shares the string prefix but is not a subfolder.
    expect(Bookmarks.folderTreeCount(model, "QA125Px")).toBe(1);
    expect(Bookmarks.folderTreeCount(model, "")).toBe(0);
    expect(Bookmarks.folderTreeCount(null, "QA125P")).toBe(0);
  });

  test("folderTreeCount equals what deleteFolderTree actually moves", () => {
    for (const path of ["QA125P", "QA125P/sub", "QA125P/empty", "QA125Px", "Keep"]) {
      expect(Bookmarks.deleteFolderTree(seeded(), path).moved).toBe(
        Bookmarks.folderTreeCount(seeded(), path)
      );
    }
  });

  test("hasSubfolders sees declared and bookmark-implied subfolders", () => {
    const model = seeded();
    expect(Bookmarks.hasSubfolders(model, "QA125P")).toBe(true);
    expect(Bookmarks.hasSubfolders(model, "QA125P/sub")).toBe(false);
    expect(Bookmarks.hasSubfolders(model, "Keep")).toBe(false);
    expect(Bookmarks.hasSubfolders(model, "")).toBe(false);
    const implied = Bookmarks.normalizeModel({
      version: Bookmarks.MODEL_VERSION,
      bookmarks: [{ id: "x", url: "https://x.com", folder: "P/deep/er" }],
      folders: [],
    });
    expect(Bookmarks.hasSubfolders(implied, "P")).toBe(true);
  });

  test("deleteFolderTree returns an undo snapshot of moves and removed declarations", () => {
    const res = Bookmarks.deleteFolderTree(seeded(), "QA125P");
    expect(res.moved).toBe(2);
    expect(res.undo.moves).toEqual([
      { id: "a", folder: "QA125P/sub" },
      { id: "b", folder: "QA125P/sub" },
    ]);
    expect(res.undo.folders.slice().sort()).toEqual(["QA125P", "QA125P/empty", "QA125P/sub"]);
    expect(res.model.folders).toEqual(["Keep"]);
    expect(res.model.bookmarks.filter((b) => b.folder === "").map((b) => b.id).sort()).toEqual([
      "a",
      "b",
      "d",
    ]);
  });

  test("restoreFolderTree puts subfolder bookmarks and the subfolders back", () => {
    const before = seeded();
    const res = Bookmarks.deleteFolderTree(before, "QA125P");
    const back = Bookmarks.restoreFolderTree(res.model, res.undo);
    expect(back.restored).toBe(2);
    expect(back.model.bookmarks).toEqual(before.bookmarks);
    expect(back.model.folders!.slice().sort()).toEqual(before.folders!.slice().sort());
  });

  test("restoreFolderTree leaves bookmarks moved or deleted meanwhile alone", () => {
    const res = Bookmarks.deleteFolderTree(seeded(), "QA125P");
    let model = Bookmarks.removeBookmark(res.model, "a");
    model = Bookmarks.normalizeModel({
      ...model,
      bookmarks: model.bookmarks.map((b) => (b.id === "b" ? { ...b, folder: "Keep" } : b)),
    });
    const back = Bookmarks.restoreFolderTree(model, res.undo);
    expect(back.restored).toBe(0);
    expect(back.model.bookmarks.find((b) => b.id === "a")).toBeUndefined();
    expect(back.model.bookmarks.find((b) => b.id === "b")!.folder).toBe("Keep");
    // Declarations still come back (no duplicates if one was re-created).
    const again = Bookmarks.restoreFolderTree(back.model, res.undo);
    expect(again.model.folders!.filter((f) => f === "QA125P")).toHaveLength(1);
  });

  test("restoreFolderTree tolerates junk snapshots", () => {
    const model = seeded();
    expect(Bookmarks.restoreFolderTree(model, null).model.bookmarks).toEqual(model.bookmarks);
    expect(Bookmarks.restoreFolderTree(model, { moves: "x", folders: 3 }).restored).toBe(0);
    const empty = Bookmarks.deleteFolderTree(model, "");
    expect(empty.undo).toEqual({ moves: [], folders: [] });
  });
});

describe("extension/bookmarks.js restoreBookmarks (round-2 undo delete)", () => {
  function seeded() {
    let model = Bookmarks.emptyModel();
    for (let i = 0; i < 3; i++) {
      model = Bookmarks.addBookmark(model, {
        id: `id${i}`,
        title: `T${i}`,
        url: `https://x.com/${i}`,
        added: i + 1,
      }).model;
    }
    return model;
  }

  test("puts entries back at their recorded indexes in order", () => {
    const model = seeded();
    const removed = model.bookmarks.map((b, i) => ({ bookmark: b, index: i }));
    const shrunken = Bookmarks.removeBookmarks(model, ["id0", "id2"]);
    const restored = Bookmarks.restoreBookmarks(shrunken, removed);
    expect(restored.bookmarks.map((b) => b.id)).toEqual(["id0", "id1", "id2"]);
  });

  test("clamps out-of-range indexes and skips entries restored meanwhile", () => {
    const model = seeded();
    const a = model.bookmarks[0];
    const shrunken = Bookmarks.removeBookmarks(model, ["id0"]);
    // id0 returns, then a stale restore of the same entry is a no-op.
    const first = Bookmarks.restoreBookmarks(shrunken, [{ bookmark: a, index: 0 }]);
    expect(first.bookmarks.map((b) => b.id)).toEqual(["id0", "id1", "id2"]);
    const again = Bookmarks.restoreBookmarks(first, [{ bookmark: a, index: 999 }]);
    expect(again.bookmarks.map((b) => b.id)).toEqual(["id0", "id1", "id2"]);
  });

  test("ignores junk entries and empty input", () => {
    const model = seeded();
    expect(Bookmarks.restoreBookmarks(model, []).bookmarks).toHaveLength(3);
    expect(
      Bookmarks.restoreBookmarks(model, [{ bookmark: null, index: 0 }] as never).bookmarks
    ).toHaveLength(3);
  });
});

describe("extension/bookmarks.js trash (soft delete)", () => {
  const base = () =>
    Bookmarks.normalizeModel({
      bookmarks: [
        { id: "b1", url: "https://a.com", title: "A", folder: "Dev", tags: ["x"] },
        { id: "b2", url: "https://b.com", title: "B", pinned: true, pinnedAt: 5 },
      ],
    });

  test("normalizeModel keeps deleted/deletedAt and drops them when live", () => {
    const model = Bookmarks.normalizeModel({
      bookmarks: [
        { id: "b1", url: "https://a.com", deleted: true, deletedAt: 123 },
        { id: "b2", url: "https://b.com", deleted: false, deletedAt: 999 },
      ],
    });
    expect(model.bookmarks[0]).toMatchObject({ deleted: true, deletedAt: 123 });
    expect(model.bookmarks[1]).toMatchObject({ deleted: false, deletedAt: 0 });
  });

  test("softDeleteBookmarks stamps deletedAt once and keeps pinned state", () => {
    const now = 1_000_000;
    const trashed = Bookmarks.softDeleteBookmarks(base(), ["b1", "b2", "nope"], now);
    expect(trashed.bookmarks[0]).toMatchObject({ deleted: true, deletedAt: now });
    expect(trashed.bookmarks[1]).toMatchObject({ deleted: true, deletedAt: now, pinned: true });
    // Re-deleting never refreshes the stamp.
    const again = Bookmarks.softDeleteBookmarks(trashed, ["b1"], now + 5);
    expect(again.bookmarks[0].deletedAt).toBe(now);
  });

  test("serializeHtml skips deleted rows so the Netscape export stays clean", () => {
    const trashed = Bookmarks.softDeleteBookmarks(base(), ["b1"], 1_000);
    const html = Bookmarks.serializeHtml(trashed);
    expect(html).toContain("https://b.com");
    expect(html).not.toContain("https://a.com");
    // And the round-trip through parseHtml only sees live rows.
    expect(Bookmarks.parseHtml(html).bookmarks).toHaveLength(1);
  });

  test("restoreFromTrash clears the marks", () => {
    const now = 1_000_000;
    const trashed = Bookmarks.softDeleteBookmarks(base(), ["b1"], now);
    const restored = Bookmarks.restoreFromTrash(trashed, ["b1"]);
    expect(restored.bookmarks[0]).toMatchObject({ deleted: false, deletedAt: 0 });
  });

  test("purgeExpiredTrash hard-removes only entries past the max age", () => {
    const now = 30 * 24 * 3600 * 1000 + 10_000;
    const model = Bookmarks.normalizeModel({
      bookmarks: [
        { id: "old", url: "https://old.com", deleted: true, deletedAt: 5_000 },
        { id: "young", url: "https://young.com", deleted: true, deletedAt: now - 1000 },
        { id: "live", url: "https://live.com" },
      ],
    });
    const { model: next, purged } = Bookmarks.purgeExpiredTrash(model, now);
    expect(purged).toBe(1);
    expect(next.bookmarks.map((b) => b.id)).toEqual(["young", "live"]);
    // Live rows are never touched regardless of age.
    const noTrash = Bookmarks.purgeExpiredTrash(base(), now + 10 * 365 * 86_400_000);
    expect(noTrash.purged).toBe(0);
    expect(noTrash.model.bookmarks).toHaveLength(2);
  });

  test("addBookmark revives a trashed URL; explicit new values win", () => {
    const now = 1_000_000;
    let model = Bookmarks.softDeleteBookmarks(base(), ["b1"], now);
    const result = Bookmarks.addBookmark(
      model,
      {
        title: "A2",
        url: "https://a.com/#frag",
        folder: "New",
        tags: ["y"],
        note: "back",
        added: now,
      },
      { overwriteTitle: true }
    );
    expect(result.added).toBe(true);
    expect(result.restored).toBe(true);
    expect(result.model.bookmarks).toHaveLength(2);
    expect(result.model.bookmarks[0]).toMatchObject({
      id: "b1",
      title: "A2",
      deleted: false,
      deletedAt: 0,
      folder: "New",
      tags: ["y"],
      note: "back",
    });
    // A live duplicate is still rejected as before.
    expect(Bookmarks.addBookmark(result.model, { url: "https://a.com" }).added).toBe(false);
  });

  describe("#130 revive keeps the original entry", () => {
    // The issue's minimal repro.
    const orig = () =>
      Bookmarks.softDeleteBookmarks(
        Bookmarks.normalizeModel({
          bookmarks: [
            {
              id: "x1",
              title: "Orig",
              url: "https://example.com/a",
              folder: "Work",
              tags: ["t1"],
              note: "keepme",
              added: 1,
              pinned: true,
              pinnedAt: 7,
            },
          ],
        }),
        ["x1"],
        100
      );

    test("add dialog / quick save (title+url+added only) keep folder, tags, note, added, title", () => {
      const res = Bookmarks.addBookmark(orig(), {
        title: "New title",
        url: "https://example.com/a",
        added: 200,
      });
      expect(res).toMatchObject({ added: true, restored: true });
      expect(res.model.bookmarks).toHaveLength(1);
      expect(res.model.bookmarks[0]).toEqual({
        id: "x1",
        title: "Orig",
        url: "https://example.com/a",
        folder: "Work",
        tags: ["t1"],
        note: "keepme",
        added: 1,
        pinned: true,
        pinnedAt: 7,
        deleted: false,
        deletedAt: 0,
      });
    });

    test("empty strings / empty tag arrays never wipe the originals (popup with blank fields)", () => {
      const res = Bookmarks.addBookmark(
        orig(),
        { title: "", url: "https://example.com/a", folder: "  ", tags: [], note: "", added: 300 },
        { overwriteTitle: true }
      );
      expect(res.model.bookmarks[0]).toMatchObject({
        title: "Orig",
        folder: "Work",
        tags: ["t1"],
        note: "keepme",
        added: 1,
        deleted: false,
      });
    });

    test("non-empty incoming folder / tags / note override one by one", () => {
      const onlyFolder = Bookmarks.addBookmark(orig(), {
        url: "https://example.com/a",
        folder: "Later",
      }).model.bookmarks[0];
      expect(onlyFolder).toMatchObject({ folder: "Later", tags: ["t1"], note: "keepme", added: 1 });
      const onlyTags = Bookmarks.addBookmark(orig(), {
        url: "https://example.com/a",
        tags: ["n1", "n2"],
      }).model.bookmarks[0];
      expect(onlyTags).toMatchObject({ folder: "Work", tags: ["n1", "n2"], note: "keepme" });
      const onlyNote = Bookmarks.addBookmark(orig(), {
        url: "https://example.com/a",
        note: "fresh",
      }).model.bookmarks[0];
      expect(onlyNote).toMatchObject({ folder: "Work", tags: ["t1"], note: "fresh" });
    });

    test("title: typed title wins only with overwriteTitle; empty original title is filled", () => {
      const typed = Bookmarks.addBookmark(
        orig(),
        { title: "Typed", url: "https://example.com/a" },
        { overwriteTitle: true }
      ).model.bookmarks[0];
      expect(typed.title).toBe("Typed");
      const untitled = Bookmarks.softDeleteBookmarks(
        Bookmarks.normalizeModel({ bookmarks: [{ id: "u", url: "https://u.com", added: 5 }] }),
        ["u"],
        9
      );
      const filled = Bookmarks.addBookmark(untitled, { title: "Page", url: "https://u.com", added: 50 })
        .model.bookmarks[0];
      expect(filled).toMatchObject({ title: "Page", added: 5, deleted: false });
    });

    test("an entry without an added time takes the new one", () => {
      const noTime = Bookmarks.softDeleteBookmarks(
        Bookmarks.normalizeModel({ bookmarks: [{ id: "n", url: "https://n.com", folder: "F" }] }),
        ["n"],
        9
      );
      const res = Bookmarks.addBookmark(noTime, { url: "https://n.com", added: 42 });
      expect(res.model.bookmarks[0]).toMatchObject({ added: 42, folder: "F" });
    });

    test("trashedByUrl finds the entry a re-save would revive (and only trashed ones)", () => {
      expect(Bookmarks.trashedByUrl(orig(), "https://example.com/a#x")).toMatchObject({ id: "x1" });
      expect(Bookmarks.trashedByUrl(base(), "https://a.com")).toBeNull();
      expect(Bookmarks.trashedByUrl(orig(), "https://other.com")).toBeNull();
      expect(Bookmarks.trashedByUrl(orig(), "not a url")).toBeNull();
      expect(Bookmarks.trashedByUrl(null, "https://example.com/a")).toBeNull();
    });

    test("restoreFromTrash and mergeModels are unaffected", () => {
      const back = Bookmarks.restoreFromTrash(orig(), ["x1"]).bookmarks[0];
      expect(back).toMatchObject({ folder: "Work", tags: ["t1"], note: "keepme", added: 1, deleted: false });
      const merged = Bookmarks.mergeModels(orig(), {
        bookmarks: [{ id: "imp", url: "https://example.com/a", title: "Imported", folder: "" }],
      });
      expect(merged.bookmarks).toHaveLength(1);
      expect(merged.bookmarks[0]).toMatchObject({ id: "x1", deleted: true, folder: "Work" });
    });
  });

  test("mergeModels never resurrects trashed base entries", () => {
    const trashed = Bookmarks.softDeleteBookmarks(base(), ["b1"], 1_000);
    const merged = Bookmarks.mergeModels(trashed, {
      bookmarks: [{ id: "new", url: "https://a.com/", title: "Incoming" }],
    });
    expect(merged.bookmarks).toHaveLength(2);
    expect(merged.bookmarks[0]).toMatchObject({ id: "b1", deleted: true });
  });

  test("adoptRichFields re-attaches deleted sidecar rows html cannot hold", () => {
    const htmlModel = Bookmarks.parseHtml(
      `<DL><p><DT><A HREF="https://b.com" ADD_DATE="1">B</A></DL><p>`
    );
    const jsonModel = Bookmarks.normalizeModel({
      bookmarks: [
        { id: "b2", url: "https://b.com", title: "B" },
        { id: "b1", url: "https://a.com", title: "A", deleted: true, deletedAt: 55 },
      ],
    });
    const merged = Bookmarks.adoptRichFields(htmlModel, jsonModel);
    expect(merged.bookmarks).toHaveLength(2);
    expect(merged.bookmarks[1]).toMatchObject({ id: "b1", deleted: true, deletedAt: 55 });
  });

  test("searchBookmarks and folderPaths ignore trashed rows", () => {
    const model = Bookmarks.normalizeModel({
      bookmarks: [
        { id: "b1", url: "https://a.com", title: "Needle", folder: "Gone" },
        { id: "b2", url: "https://b.com", title: "Hay", folder: "Kept" },
      ],
    });
    const trashed = Bookmarks.softDeleteBookmarks(model, ["b1"], 1_000);
    expect(Bookmarks.searchBookmarks(trashed, "needle")).toHaveLength(0);
    expect(Bookmarks.searchBookmarks(trashed, "hay")).toHaveLength(1);
    expect(Bookmarks.folderPaths(trashed)).toEqual(["Kept"]);
  });
});

describe("extension/bookmarks.js duplicateGroups", () => {
  test("groups by urlKey ignoring fragments and tracking params, oldest first", () => {
    const model = Bookmarks.normalizeModel({
      bookmarks: [
        { id: "b1", url: "https://a.com/x?utm_source=rss", title: "Newest", added: 30 },
        { id: "b2", url: "https://a.com/x", title: "Oldest", added: 10 },
        { id: "b3", url: "https://a.com/x#top", title: "Middle", added: 20 },
        { id: "b4", url: "https://unique.com", title: "Unique", added: 5 },
      ],
    });
    const groups = Bookmarks.duplicateGroups(model);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((b) => b.id)).toEqual(["b2", "b3", "b1"]);
  });

  test("returns an empty list when every URL is unique and skips trash", () => {
    const model = Bookmarks.normalizeModel({
      bookmarks: [
        { id: "b1", url: "https://a.com" },
        { id: "b2", url: "https://a.com/x", deleted: true },
      ],
    });
    expect(Bookmarks.duplicateGroups(model)).toEqual([]);
  });
});
