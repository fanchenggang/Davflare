import { createRequire } from "module";

const nodeRequire = createRequire(import.meta.url);

type BookmarkRow = Record<string, unknown>;
type BookmarkModel = { version: number; bookmarks: BookmarkRow[]; folders?: string[] };

const Bookmarks = nodeRequire("../../../extension/bookmarks.js") as {
  addFolder: (model: unknown, path: string) => BookmarkModel;
  adjustTags: (model: unknown, ids: string[], add?: string[], remove?: string[]) => BookmarkModel;
  buildChromeWritePlan: (
    model: unknown,
    existingUrlKeys: string[],
    opts?: { skipDuplicates?: boolean }
  ) => Array<{ title: string; url?: string; children?: Array<Record<string, unknown>> }>;
  folderPaths: (model: unknown) => string[];
  mergeModels: (base: unknown, incoming: unknown) => BookmarkModel;
  modelFromJson: (text: string) => { ok: boolean; model: BookmarkModel };
  modelToJsonText: (model: unknown) => string;
  moveBookmarks: (model: unknown, ids: string[], folder: string) => BookmarkModel;
  normalizeModel: (raw: unknown) => BookmarkModel;
  parseHtml: (text: string) => BookmarkModel;
  removeBookmarks: (model: unknown, ids: string[]) => BookmarkModel;
  removeFolder: (model: unknown, path: string) => BookmarkModel;
  renameFolder: (model: unknown, fromPath: string, toPath: string) => BookmarkModel;
  serializeHtml: (model: unknown) => string;
  setPinned: (model: unknown, ids: string[], pinned: boolean) => BookmarkModel;
  updateBookmark: (
    model: unknown,
    id: string,
    patch: Record<string, unknown>
  ) => BookmarkModel;
};

function modelWith(bookmarks: Array<Record<string, unknown>>, folders?: string[]) {
  return folders ? { version: 1, bookmarks, folders } : { version: 1, bookmarks };
}

function item(id: string, url: string, extra: Record<string, unknown> = {}) {
  return { id, url, title: id, folder: "", tags: [], note: "", added: 1, ...extra };
}

describe("extension/bookmarks.js pinned field (#63)", () => {
  test("sanitize keeps pinned/pinnedAt and drops junk shapes", () => {
    const model = Bookmarks.normalizeModel(
      modelWith([
        item("a", "https://a.example", { pinned: true, pinnedAt: 123 }),
        item("b", "https://b.example", { pinned: "yes", pinnedAt: -5 }),
        item("c", "https://c.example"),
      ])
    );
    expect(model.bookmarks[0]).toMatchObject({ pinned: true, pinnedAt: 123 });
    expect(model.bookmarks[1]).toMatchObject({ pinned: false, pinnedAt: 0 });
    expect(model.bookmarks[2]).toMatchObject({ pinned: false, pinnedAt: 0 });
  });

  test("setPinned pins with a stamp, keeps the first stamp, unpins clears", () => {
    const base = modelWith([
      item("a", "https://a.example", { pinned: true, pinnedAt: 100 }),
      item("b", "https://b.example"),
      item("c", "https://c.example"),
    ]);
    const pinned = Bookmarks.setPinned(base, ["b", "c", "ghost"], true);
    expect(pinned.bookmarks[1]).toMatchObject({ pinned: true });
    expect(Number(pinned.bookmarks[1].pinnedAt)).toBeGreaterThan(0);
    expect(pinned.bookmarks[0].pinnedAt).toBe(100);

    const unpinned = Bookmarks.setPinned(pinned, ["a", "b"], false);
    expect(unpinned.bookmarks[0]).toMatchObject({ pinned: false, pinnedAt: 0 });
    expect(unpinned.bookmarks[1]).toMatchObject({ pinned: false, pinnedAt: 0 });
    expect(unpinned.bookmarks[2].pinned).toBe(true);
  });

  test("pin state survives an unrelated update and JSON round-trip", () => {
    const base = Bookmarks.setPinned(modelWith([item("a", "https://a.example")]), ["a"], true);
    const edited = Bookmarks.updateBookmark(base, "a", { note: "hello" });
    expect(edited.bookmarks[0]).toMatchObject({ pinned: true, note: "hello" });

    const restored = Bookmarks.modelFromJson(Bookmarks.modelToJsonText(edited));
    expect(restored.ok).toBe(true);
    expect(restored.model.bookmarks[0]).toMatchObject({ pinned: true });
  });
});

describe("extension/bookmarks.js batch ops (#63)", () => {
  const base = modelWith([
    item("a", "https://a.example", { folder: "Dev", tags: ["x"] }),
    item("b", "https://b.example", { folder: "Dev", tags: ["x", "y"] }),
    item("c", "https://c.example", { folder: "Docs" }),
  ]);

  test("moveBookmarks retargets only the given ids; empty path unfiles", () => {
    const moved = Bookmarks.moveBookmarks(base, ["a", "ghost"], "Archive");
    expect(moved.bookmarks[0].folder).toBe("Archive");
    expect(moved.bookmarks[1].folder).toBe("Dev");
    const unfiled = Bookmarks.moveBookmarks(base, ["c"], " / ");
    expect(unfiled.bookmarks[2].folder).toBe("");
  });

  test("adjustTags adds and removes without dupes", () => {
    const adjusted = Bookmarks.adjustTags(base, ["a", "b"], ["x", "z "], ["y"]);
    expect(adjusted.bookmarks[0].tags).toEqual(["x", "z"]);
    expect(adjusted.bookmarks[1].tags).toEqual(["x", "z"]);
    expect(adjusted.bookmarks[2].tags).toEqual([]);
  });

  test("removeBookmarks drops several rows in one call", () => {
    const removed = Bookmarks.removeBookmarks(base, ["a", "c"]);
    expect(removed.bookmarks.map((b) => b.id)).toEqual(["b"]);
  });
});

describe("extension/bookmarks.js declared folders (#63)", () => {
  test("normalize keeps folders, sanitizes junk paths, sorts", () => {
    const model = Bookmarks.normalizeModel(
      modelWith([item("a", "https://a.example")], [" B/A ", "A", "", "a/./b", "A"])
    );
    expect(model.folders).toEqual(["A", "B/A"]);
    expect(Bookmarks.normalizeModel(modelWith([])).folders).toEqual([]);
  });

  test("addFolder / removeFolder manage declared empty folders", () => {
    const added = Bookmarks.addFolder(modelWith([]), "Dev/Rust");
    expect(added.folders).toEqual(["Dev/Rust"]);
    expect(Bookmarks.folderPaths(added)).toEqual(["Dev", "Dev/Rust"]);
    const dedup = Bookmarks.addFolder(added, "Dev");
    expect(dedup.folders).toEqual(["Dev", "Dev/Rust"]);
    const removed = Bookmarks.removeFolder(dedup, "Dev/Rust");
    expect(removed.folders).toEqual(["Dev"]);
  });

  test("renameFolder rewrites exact and descendant paths everywhere", () => {
    const base = Bookmarks.addFolder(
      modelWith([
        item("a", "https://a.example", { folder: "Dev" }),
        item("b", "https://b.example", { folder: "Dev/Rust" }),
        item("c", "https://c.example", { folder: "Docs" }),
      ]),
      "Dev/Talks"
    );
    const renamed = Bookmarks.renameFolder(base, "Dev", "Development");
    expect(renamed.bookmarks.map((b) => b.folder)).toEqual([
      "Development",
      "Development/Rust",
      "Docs",
    ]);
    expect(renamed.folders).toEqual(["Development/Talks"]);
    // no-op renames return the model untouched
    expect(Bookmarks.renameFolder(base, "", "x").folders).toEqual(base.folders);
    expect(Bookmarks.renameFolder(base, "Dev", "Dev").bookmarks[0].folder).toBe("Dev");
  });

  test("serializeHtml renders declared empty folders; parse round-trips them", () => {
    const base = Bookmarks.addFolder(
      modelWith([item("a", "https://a.example", { folder: "Live" })]),
      "Empty/Nested"
    );
    const html = Bookmarks.serializeHtml(base);
    expect(html).toContain(">Empty</H3>");
    expect(html).toContain(">Nested</H3>");
    const parsed = Bookmarks.parseHtml(html);
    expect(parsed.folders).toEqual(["Empty", "Empty/Nested", "Live"]);
    expect(parsed.bookmarks).toHaveLength(1);
  });

  test("mergeModels unions declared folders", () => {
    const merged = Bookmarks.mergeModels(
      modelWith([item("a", "https://a.example")], ["A"]),
      modelWith([item("b", "https://b.example")], ["B", "A"])
    );
    expect(merged.folders).toEqual(["A", "B"]);
  });
});

describe("extension/bookmarks.js buildChromeWritePlan (#64)", () => {
  test("plans folders and links in tree order, including declared empty folders", () => {
    const base = Bookmarks.addFolder(
      modelWith([
        item("a", "https://a.example", { folder: "Dev", title: "A" }),
        item("b", "https://b.example", { folder: "Dev/Rust", title: "B" }),
      ]),
      "Empty"
    );
    const plan = Bookmarks.buildChromeWritePlan(base, [], { skipDuplicates: true });
    // insertion order (declared folders seeded first), same as serializeHtml
    expect(plan).toEqual([
      { title: "Empty", children: [] },
      {
        title: "Dev",
        children: [
          { title: "A", url: "https://a.example" },
          { title: "Rust", children: [{ title: "B", url: "https://b.example" }] },
        ],
      },
    ]);
  });

  test("skips URLs already present under the target when skipDuplicates", () => {
    const base = modelWith([
      item("a", "https://a.example/x#frag", { title: "A" }),
      item("b", "https://b.example", { title: "B" }),
    ]);
    const plan = Bookmarks.buildChromeWritePlan(base, ["https://a.example/x"], {
      skipDuplicates: true,
    });
    expect(plan).toEqual([{ title: "B", url: "https://b.example" }]);
    const keepAll = Bookmarks.buildChromeWritePlan(base, ["https://a.example/x"], {
      skipDuplicates: false,
    });
    expect(keepAll).toHaveLength(2);
  });
});
