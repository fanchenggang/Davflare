import { createRequire } from "module";

const nodeRequire = createRequire(import.meta.url);

type TreeNodeView = {
  path: string;
  label: string;
  count: number;
  total: number;
  children: TreeNodeView[];
};

const BookmarksView = nodeRequire("../../../extension/bookmarksView.js") as {
  domainOf: (url: unknown) => string;
  fallbackLetter: (item: unknown) => string;
  filterBookmarks: (
    model: unknown,
    opts?: {
      query?: string;
      folder?: string | null;
      folderPrefix?: string | null;
      tag?: string | null;
      since?: number;
      pinned?: boolean | null;
      includeDeleted?: boolean;
    },
    pinyinTools?: { matchText: (text: unknown, query: string) => boolean } | null
  ) => Array<Record<string, unknown>>;
  formatDate: (ms: number, lang?: string) => string;
  formatBytes: (n: number) => string;
  formatRelative: (ms: number, now: number, lang?: string) => string;
  formatWhen: (ms: number, now: number, lang?: string) => string;
  folderList: (model: unknown) => Array<{ name: string; count: number }>;
  folderTree: (model: unknown) => {
    path: string;
    label: string;
    count: number;
    total: number;
    children: TreeNodeView[];
  };
  tagList: (model: unknown) => Array<{ name: string; count: number }>;
  orderPinnedFirst: (
    items: Array<Record<string, unknown>>
  ) => Array<Record<string, unknown>>;
  SORT_KEYS: string[];
  sortItems: (
    items: Array<Record<string, unknown>> | null,
    key?: string,
    locale?: string
  ) => Array<Record<string, unknown>>;
  dragSelectionIds: (
    item: { id?: string } | null | undefined,
    sel: unknown,
    orderedIds?: string[]
  ) => string[];
  tagTiers: (
    list: Array<{ name: string; count?: number } | null> | unknown
  ) => Record<string, number>;
  presetFilterLabel: (
    preset: unknown,
    copy?: { pinned?: string; unfiled?: string }
  ) => string;
  normalizePresets: (
    raw: unknown,
    limit?: number
  ) => Array<{ name: string; tag: string; since: string }>;
  findActivePreset: (
    presets: unknown,
    filterKind: unknown,
    filterValue: unknown,
    since: unknown
  ) => { name: string; tag: string; since: string } | null;
  normalizeFavorites: (
    raw: unknown,
    limit?: number
  ) => Array<{ kind: string; value: string }>;
  favoriteKey: (entry: unknown) => string;
  isFavorite: (list: unknown, entry: unknown) => boolean;
  toggleFavorite: (
    list: unknown,
    entry: unknown
  ) => Array<{ kind: string; value: string }>;
  summarizeStorage: (parts: unknown) => {
    path: string;
    bookmarks: number;
    workspaces: number;
    tabRules: number;
    snapshotsIndex: number;
    snapshotsHtml: number;
    total: number;
  };
  sumSnapshotSizes: (model: unknown) => number;
  popMenuFlipNeeded: (
    anchorTop: number,
    menuHeight: number,
    viewportHeight: number,
    gap?: number
  ) => boolean;
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

  test("the since filter bounds the added time", () => {
    const recent = Date.now() - 1000;
    const old = Date.now() - 30 * 86400000;
    const timed = {
      version: 1,
      bookmarks: [
        { id: "new", title: "New", url: "https://new.example", added: recent },
        { id: "old", title: "Old", url: "https://old.example", added: old },
      ],
    };
    const week = Date.now() - 7 * 86400000;
    expect(
      BookmarksView.filterBookmarks(timed, { since: week }).map((b) => b.id)
    ).toEqual(["new"]);
    expect(BookmarksView.filterBookmarks(timed, { since: 0 })).toHaveLength(2);
  });

  test("ascii queries also hit the injected pinyin matcher", () => {
    const pinyinTools = {
      matchText: (text: unknown, query: string) =>
        String(text).indexOf("云") !== -1 && query === "txy",
    };
    expect(
      BookmarksView.filterBookmarks(model, { query: "txy" }, pinyinTools).map((b) => b.id)
    ).toEqual(["2"]);
    expect(
      BookmarksView.filterBookmarks(model, { query: "txy" }).map((b) => b.id)
    ).toEqual([]);
  });
});

describe("extension/bookmarksView.js pinned & declared folders (#63)", () => {
  test("folderList includes declared empty folders with count 0", () => {
    const model = {
      version: 1,
      bookmarks: [
        { folder: "Dev", tags: [] },
        { folder: "", tags: [] },
      ],
      folders: ["Empty/Nested", "Dev"],
    };
    expect(BookmarksView.folderList(model)).toEqual([
      { name: "", count: 1 },
      { name: "Dev", count: 1 },
      { name: "Empty/Nested", count: 0 },
    ]);
  });

  test("filterBookmarks honors the pinned filter", () => {
    const model = modelWith([
      { url: "https://a.example", pinned: true },
      { url: "https://b.example" },
    ]);
    expect(
      BookmarksView.filterBookmarks(model, { pinned: true }).map((b) => b.url)
    ).toEqual(["https://a.example"]);
    expect(BookmarksView.filterBookmarks(model, {}).length).toBe(2);
  });

  test("orderPinnedFirst leads with pins (newest first) and keeps the rest", () => {
    const ordered = BookmarksView.orderPinnedFirst([
      { id: "a" },
      { id: "b", pinned: true, pinnedAt: 100 },
      { id: "c", pinned: true, pinnedAt: 300 },
      { id: "d", pinned: true, pinnedAt: 200 },
      { id: "e" },
    ]);
    expect(ordered.map((b) => b.id)).toEqual(["c", "d", "b", "a", "e"]);
    expect(BookmarksView.orderPinnedFirst([])).toEqual([]);
  });
});

describe("extension/bookmarksView.js normalizePresets (#63 P2)", () => {
  test("keeps named tag+since rows, defaults since, drops junk and dup names", () => {
    const presets = BookmarksView.normalizePresets([
      { name: "docs 长期", tag: "docs", since: "year" },
      { name: "dev 周", tag: "dev", since: "nonsense" },
      { name: "dev 周", tag: "dev", since: "week" },
      { name: "", tag: "x" },
      { name: "no-tag" },
      null,
      "junk",
    ]);
    expect(presets).toEqual([
      { name: "docs 长期", kind: "tag", value: "docs", tag: "docs", since: "year" },
      { name: "dev 周", kind: "tag", value: "dev", tag: "dev", since: "all" },
    ]);
    expect(BookmarksView.normalizePresets(null)).toEqual([]);
  });

  test("caps the list at 12 by default or the given limit", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      name: "p" + i,
      tag: "t" + i,
      since: "week",
    }));
    expect(BookmarksView.normalizePresets(many)).toHaveLength(12);
    expect(BookmarksView.normalizePresets(many, 3)).toHaveLength(3);
  });
});

describe("extension/bookmarksView.js findActivePreset (#84 select→✕)", () => {
  const presets = [
    { name: "_pm_qa_137_preset", tag: "docs", since: "week" },
    { name: "dev 长期", tag: "dev", since: "year" },
  ];

  test("after applying a preset (tag+since), match returns it — drives ✕ visible", () => {
    // Mirrors applyPreset → state.filter/since → renderPresetSelect / activePreset.
    const active = BookmarksView.findActivePreset(presets, "tag", "docs", "week");
    expect(active).toEqual(presets[0]);
    expect(!!active).toBe(true); // $("presetDelete").hidden = !active
  });

  test("cleared filters (kind all) yield null — ✕ stays hidden until a match", () => {
    expect(BookmarksView.findActivePreset(presets, "all", "", "all")).toBeNull();
    expect(BookmarksView.findActivePreset(presets, "folder", "Work", "week")).toBeNull();
    expect(BookmarksView.findActivePreset(presets, "tag", "docs", "all")).toBeNull();
    expect(BookmarksView.findActivePreset(presets, "tag", "docs", "month")).toBeNull();
  });

  test("select→apply path: empty name / junk presets / wrong since do not match", () => {
    expect(BookmarksView.findActivePreset([], "tag", "docs", "week")).toBeNull();
    expect(BookmarksView.findActivePreset(null, "tag", "docs", "week")).toBeNull();
    expect(BookmarksView.findActivePreset(presets, "tag", "dev", "year")?.name).toBe(
      "dev 长期"
    );
  });
});

describe("extension/bookmarksView.js presets folder/pinned (phase 2)", () => {
  test("normalizePresets accepts folder + pinned kinds and keeps legacy tag rows", () => {
    const presets = BookmarksView.normalizePresets([
      { name: "work", kind: "folder", value: "Work", since: "week" },
      { name: "pins", kind: "pinned", since: "all" },
      { name: "legacy", tag: "docs", since: "month" },
      { name: "bad-folder", kind: "folder" }, // empty folder value OK
    ]);
    expect(presets).toEqual([
      { name: "work", kind: "folder", value: "Work", since: "week" },
      { name: "pins", kind: "pinned", value: "", since: "all" },
      { name: "legacy", kind: "tag", value: "docs", tag: "docs", since: "month" },
      { name: "bad-folder", kind: "folder", value: "", since: "all" },
    ]);
  });

  test("findActivePreset matches folder and pinned filters", () => {
    const presets = BookmarksView.normalizePresets([
      { name: "work", kind: "folder", value: "Work", since: "week" },
      { name: "pins", kind: "pinned", since: "all" },
    ]);
    expect(BookmarksView.findActivePreset(presets, "folder", "Work", "week")?.name).toBe(
      "work"
    );
    expect(BookmarksView.findActivePreset(presets, "folder", "Work", "all")).toBeNull();
    expect(BookmarksView.findActivePreset(presets, "pinned", "", "all")?.name).toBe("pins");
    expect(BookmarksView.findActivePreset(presets, "tag", "Work", "week")).toBeNull();
  });

  test("presetFilterLabel renders kind-aware short labels", () => {
    expect(
      BookmarksView.presetFilterLabel(
        { kind: "pinned", value: "" },
        { pinned: "置顶", unfiled: "未分类" }
      )
    ).toBe("置顶");
    expect(
      BookmarksView.presetFilterLabel(
        { kind: "folder", value: "" },
        { pinned: "Pinned", unfiled: "Unfiled" }
      )
    ).toBe("Unfiled");
    expect(BookmarksView.presetFilterLabel({ kind: "tag", value: "docs", tag: "docs" })).toBe(
      "docs"
    );
  });
});


describe("extension/bookmarksView.js favorites (phase 3)", () => {
  test("normalizeFavorites keeps folder/tag/pinned and drops junk/dupes", () => {
    const list = BookmarksView.normalizeFavorites([
      { kind: "folder", value: "Work" },
      { kind: "tag", value: "docs" },
      { kind: "pinned", value: "ignored" },
      { kind: "folder", value: "Work" },
      { kind: "tag", value: "" },
      { kind: "nope", value: "x" },
      null,
      "junk",
    ]);
    expect(list).toEqual([
      { kind: "folder", value: "Work" },
      { kind: "tag", value: "docs" },
      { kind: "pinned", value: "" },
    ]);
    expect(BookmarksView.normalizeFavorites(null)).toEqual([]);
  });

  test("toggleFavorite / isFavorite round-trip", () => {
    let list = BookmarksView.normalizeFavorites([]);
    expect(BookmarksView.isFavorite(list, { kind: "folder", value: "A" })).toBe(false);
    list = BookmarksView.toggleFavorite(list, { kind: "folder", value: "A" });
    expect(BookmarksView.isFavorite(list, { kind: "folder", value: "A" })).toBe(true);
    list = BookmarksView.toggleFavorite(list, { kind: "folder", value: "A" });
    expect(BookmarksView.isFavorite(list, { kind: "folder", value: "A" })).toBe(false);
    list = BookmarksView.toggleFavorite(list, { kind: "pinned", value: "" });
    expect(BookmarksView.favoriteKey({ kind: "pinned", value: "x" })).toBe(
      BookmarksView.favoriteKey({ kind: "pinned", value: "" })
    );
    expect(list).toEqual([{ kind: "pinned", value: "" }]);
  });
});

describe("extension/bookmarksView.js storage summary (phase 3)", () => {
  test("summarizeStorage sums known parts and ignores junk", () => {
    const summary = BookmarksView.summarizeStorage({
      path: "/webdav/bookmarks/",
      bookmarks: 100.9,
      workspaces: 20,
      tabRules: -5,
      snapshotsIndex: 10,
      snapshotsHtml: 40,
      extra: 999,
    });
    expect(summary).toEqual({
      path: "/webdav/bookmarks/",
      bookmarks: 100,
      workspaces: 20,
      tabRules: 0,
      snapshotsIndex: 10,
      snapshotsHtml: 40,
      total: 170,
    });
    expect(BookmarksView.summarizeStorage(null).total).toBe(0);
  });

  test("sumSnapshotSizes totals entry.size from the snapshots index", () => {
    expect(
      BookmarksView.sumSnapshotSizes({
        snapshots: [{ size: 100 }, { size: 250 }, { size: "nope" }, null],
      })
    ).toBe(350);
    expect(BookmarksView.sumSnapshotSizes([{ size: 10 }, { size: 5 }])).toBe(15);
    expect(BookmarksView.sumSnapshotSizes(null)).toBe(0);
  });
});

describe("extension/bookmarksView.js sortItems (HamHome-style sorting)", () => {
  const items = [
    { id: "a", title: "banana", url: "https://zoo.example", added: 100 },
    { id: "b", title: "Apple", url: "https://ant.example", added: 300 },
    { id: "c", title: "cherry", url: "https://mango.example", added: 200 },
  ];

  test("default key preserves the current pinned-first insertion order", () => {
    const pinned = { id: "p", pinned: true, pinnedAt: 5 };
    const ordered = BookmarksView.sortItems([...items, pinned]);
    expect(ordered.map((b) => b.id)).toEqual(["p", "a", "b", "c"]);
    // default equals orderPinnedFirst exactly
    expect(BookmarksView.sortItems(items, "default")).toEqual(
      BookmarksView.orderPinnedFirst(items)
    );
  });

  test("latest / oldest sort by added within the pinned group", () => {
    expect(BookmarksView.sortItems(items, "latest").map((b) => b.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
    expect(BookmarksView.sortItems(items, "oldest").map((b) => b.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  test("title sort is case-insensitive; domain sorts by hostname", () => {
    expect(BookmarksView.sortItems(items, "title", "en").map((b) => b.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(BookmarksView.sortItems(items, "domain").map((b) => b.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  test("pinned bookmarks still lead under every explicit sort", () => {
    const pins = { id: "p2", pinned: true, pinnedAt: 900, title: "aaa", added: 1 };
    const mixed = BookmarksView.sortItems([...items, pins], "title", "en");
    expect(mixed[0].id).toBe("p2");
    expect(mixed.slice(1).map((b) => b.id)).toEqual(["b", "a", "c"]);
  });

  test("junk keys and non-array input fall back safely", () => {
    expect(BookmarksView.sortItems(items, "nonsense")).toEqual(
      BookmarksView.sortItems(items, "default")
    );
    expect(BookmarksView.sortItems(null, "latest")).toEqual([]);
  });

  test("SORT_KEYS gates the persisted sort preference", () => {
    expect(BookmarksView.SORT_KEYS).toEqual([
      "default",
      "latest",
      "oldest",
      "title",
      "domain",
    ]);
  });
});

describe("extension/bookmarksView.js dragSelectionIds (drag to folder)", () => {
  test("unselected bookmark drags alone", () => {
    expect(BookmarksView.dragSelectionIds({ id: "a" }, {}, ["a", "b"])).toEqual(["a"]);
    expect(BookmarksView.dragSelectionIds({ id: "a" }, { b: true }, ["a", "b"])).toEqual([
      "a",
    ]);
  });

  test("dragging a selected bookmark carries the whole selection in display order", () => {
    const sel = { a: true, c: true };
    expect(
      BookmarksView.dragSelectionIds({ id: "c" }, sel, ["a", "b", "c"])
    ).toEqual(["a", "c"]);
    expect(
      BookmarksView.dragSelectionIds({ id: "a" }, sel, ["c", "b", "a"])
    ).toEqual(["c", "a"]);
  });

  test("junk input and empty selections fall back to the dragged item", () => {
    expect(BookmarksView.dragSelectionIds(null, {}, ["a"])).toEqual([]);
    expect(BookmarksView.dragSelectionIds({ id: "a" }, null)).toEqual(["a"]);
    expect(BookmarksView.dragSelectionIds({ id: "a" }, { a: true }, [])).toEqual(["a"]);
  });
});

describe("extension/bookmarksView.js tagTiers (tag cloud)", () => {
  test("rank-based thirds spread sizes across the sorted tag list", () => {
    const tags = [
      { name: "dev", count: 9 },
      { name: "docs", count: 6 },
      { name: "ui", count: 4 },
      { name: "api", count: 2 },
      { name: "rust", count: 1 },
      { name: "aigc", count: 1 },
    ];
    const tiers = BookmarksView.tagTiers(tags);
    expect(tiers.dev).toBe(2);
    expect(tiers.docs).toBe(2);
    expect(tiers.ui).toBe(1);
    expect(tiers.api).toBe(1);
    expect(tiers.rust).toBe(0);
    expect(tiers.aigc).toBe(0);
  });

  test("tiny lists still get a visible largest tier", () => {
    const tiers = BookmarksView.tagTiers([{ name: "solo", count: 3 }]);
    expect(tiers.solo).toBe(2);
    const pair = BookmarksView.tagTiers([
      { name: "x", count: 2 },
      { name: "y", count: 1 },
    ]);
    expect(pair.x).toBe(2);
    expect(pair.y).toBe(1);
  });

  test("junk input yields an empty tier map", () => {
    expect(BookmarksView.tagTiers(null)).toEqual({});
    expect(BookmarksView.tagTiers([])).toEqual({});
  });
});

describe("extension/bookmarksView.js trash-aware filtering", () => {
  const model = modelWith([
    { id: "1", title: "Live", url: "https://live.com", folder: "Dev", tags: ["a"] },
    { id: "2", title: "Gone", url: "https://gone.com", folder: "Dev", tags: ["a"], deleted: true, deletedAt: 5 },
  ]);

  test("filterBookmarks excludes deleted rows unless includeDeleted", () => {
    expect(BookmarksView.filterBookmarks(model, {}).map((b) => b.id)).toEqual(["1"]);
    expect(
      BookmarksView.filterBookmarks(model, { includeDeleted: true }).map((b) => b.id)
    ).toEqual(["1", "2"]);
  });

  test("folderList and tagList skip deleted rows", () => {
    expect(BookmarksView.folderList(model)).toEqual([{ name: "Dev", count: 1 }]);
    expect(BookmarksView.tagList(model)).toEqual([{ name: "a", count: 1 }]);
  });

  test("folderPrefix matches the path and every descendant", () => {
    const nested = modelWith([
      { id: "1", folder: "Dev" },
      { id: "2", folder: "Dev/Rust" },
      { id: "3", folder: "Dev/Rust/Tools" },
      { id: "4", folder: "DevOps" },
      { id: "5", folder: "" },
    ]);
    const ids = (prefix: string) =>
      BookmarksView.filterBookmarks(nested, { folderPrefix: prefix }).map((b) => b.id);
    expect(ids("Dev")).toEqual(["1", "2", "3"]);
    expect(ids("Dev/Rust")).toEqual(["2", "3"]);
    // "DevOps" shares a string prefix but not a path segment.
    expect(ids("DevOps")).toEqual(["4"]);
    expect(ids("Nope")).toEqual([]);
  });
});

describe("extension/bookmarksView.js folderTree", () => {
  test("builds nested nodes with own and recursive counts, implying ancestors", () => {
    const tree = BookmarksView.folderTree(
      modelWith([
        { folder: "" },
        { folder: "Dev" },
        { folder: "Dev/Rust" },
        { folder: "Dev/Rust" },
        { folder: "Art/Ink" },
      ])
    );
    // Root = unfiled bucket with its own count only.
    expect(tree.path).toBe("");
    expect(tree.count).toBe(1);
    expect(tree.children.map((c) => c.label)).toEqual(["Art", "Dev"]);
    const dev = tree.children[1];
    expect(dev).toMatchObject({ path: "Dev", count: 1, total: 3 });
    const rust = dev.children[0];
    expect(rust).toMatchObject({ path: "Dev/Rust", count: 2, total: 2 });
    // Art itself is implied by Art/Ink with zero own bookmarks.
    const art = tree.children[0];
    expect(art).toMatchObject({ path: "Art", count: 0, total: 1 });
    expect(art.children[0]).toMatchObject({ path: "Art/Ink", count: 1, total: 1 });
  });

  test("declared empty folders appear with zero counts and sort case-insensitively", () => {
    const tree = BookmarksView.folderTree({
      version: 1,
      bookmarks: [{ folder: "apple" }],
      folders: ["Zebra", "Zebra/nested"],
    });
    // Byte order would put "Zebra" first; base-sensitivity sorts it last.
    expect(tree.children.map((c) => c.label)).toEqual(["apple", "Zebra"]);
    expect(tree.children[1]).toMatchObject({ path: "Zebra", count: 0, total: 0 });
    expect(tree.children[1].children[0].path).toBe("Zebra/nested");
  });
});

describe("extension/bookmarksView.js formatWhen", () => {
  const now = new Date(2026, 8, 25, 15, 0, 0).getTime(); // local Tue 2026-09-25 15:00

  test("renders the relative ladder inside the same day", () => {
    expect(BookmarksView.formatWhen(now - 30_000, now, "zh")).toBe("刚刚");
    expect(BookmarksView.formatWhen(now - 5 * 60_000, now, "en")).toBe("5m ago");
    expect(BookmarksView.formatWhen(now - 3 * 3_600_000, now, "zh")).toBe("3 小时前");
    expect(BookmarksView.formatWhen(now - 90 * 60_000, now, "en")).toBe("1h ago");
  });

  test("calendar yesterday wins over the raw hour count, then the day ladder", () => {
    expect(BookmarksView.formatWhen(now - 20 * 3_600_000, now, "zh")).toBe("昨天");
    expect(BookmarksView.formatWhen(now - 20 * 3_600_000, now, "en")).toBe("yesterday");
    expect(BookmarksView.formatWhen(now - 3 * 86_400_000, now, "zh")).toBe("3 天前");
    expect(BookmarksView.formatWhen(now - 40 * 86_400_000, now, "en")).toBe("2026/08/16");
  });

  test("degenerate inputs fall back to a placeholder", () => {
    expect(BookmarksView.formatWhen(0, now, "zh")).toBe("未知");
  });
});

describe("extension/bookmarksView.js popMenuFlipNeeded", () => {
  test("keeps upward pop when there is enough room above the anchor", () => {
    // 锚点在 y=400，菜单 220px + 12px 间距 = 232 需求，上方空间充足
    expect(BookmarksView.popMenuFlipNeeded(400, 220, 800)).toBe(false);
  });

  test("flips downward for first-row anchors that cannot fit the menu above", () => {
    // 首行卡片锚点 y=120，上方 120 < 232 → 向下翻转
    expect(BookmarksView.popMenuFlipNeeded(120, 220, 800)).toBe(true);
  });

  test("keeps upward when neither side fits (flipping would not help)", () => {
    // 视口只有 300 高、锚点 y=120：下方 180 也不够 232，翻转无意义
    expect(BookmarksView.popMenuFlipNeeded(120, 220, 300)).toBe(false);
  });

  test("zero-height menu never flips", () => {
    expect(BookmarksView.popMenuFlipNeeded(0, 0, 800)).toBe(false);
  });
});
