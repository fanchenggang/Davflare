import { createRequire } from "module";

const nodeRequire = createRequire(import.meta.url);

const HamHome = nodeRequire("../../../extension/hamhome.js") as {
  categoryPath: (byId: Record<string, { name: string; parentId: string }>, id: unknown) => string;
  importFrom: (
    metaText: string,
    categoriesText: string | null
  ) => { ok: boolean; model: { version: number; bookmarks: Array<Record<string, unknown>> } | null };
  normalizeCategories: (raw: unknown) => Record<string, { name: string; parentId: string }>;
  normalizeMeta: (raw: unknown) => Array<Record<string, unknown>>;
  exportTo: (
    model: unknown,
    remoteMetaText: string | null,
    remoteCatsText: string | null,
    now: number
  ) => { ok: boolean; meta?: string; categories?: string; categoriesChanged?: boolean };
};

const META = JSON.stringify({
  bookmarks: [
    {
      id: "h1",
      url: "https://a.dev",
      title: "A",
      description: "note for a",
      categoryId: "c2",
      tags: ["dev", "docs"],
      favicon: "https://a.dev/f.png",
      hasSnapshot: true,
      createdAt: 1690000100000,
      updatedAt: 1690000200000,
    },
    { id: "h2", url: "https://b.dev", title: "B", categoryId: "gone", createdAt: 1690000300000 },
    { id: "h3", url: "https://c.dev", title: "deleted", isDeleted: true },
    { id: "h4", url: "javascript:alert(1)", title: "bad" },
  ],
});

const CATEGORIES = JSON.stringify({
  categories: [
    { id: "c1", name: "Work", parentId: null, order: 1 },
    { id: "c2", name: "Console", parentId: "c1", order: 2 },
  ],
});

describe("extension/hamhome.js normalizeCategories", () => {
  test("accepts wrapper objects and bare arrays; ignores junk rows", () => {
    const byId = HamHome.normalizeCategories(JSON.parse(CATEGORIES));
    expect(byId.c1).toEqual({ name: "Work", parentId: "" });
    expect(byId.c2).toEqual({ name: "Console", parentId: "c1" });
    expect(Object.keys(HamHome.normalizeCategories(null))).toHaveLength(0);
    expect(Object.keys(HamHome.normalizeCategories([{ name: "no id" }]))).toHaveLength(0);
  });
});

describe("extension/hamhome.js categoryPath", () => {
  test("resolves parent chains into slash paths with cycle safety", () => {
    const byId = HamHome.normalizeCategories(JSON.parse(CATEGORIES));
    expect(HamHome.categoryPath(byId, "c2")).toBe("Work/Console");
    expect(HamHome.categoryPath(byId, "c1")).toBe("Work");
    expect(HamHome.categoryPath(byId, "gone")).toBe("");
    expect(HamHome.categoryPath(byId, null)).toBe("");

    const cyclic = HamHome.normalizeCategories([
      { id: "x", name: "X", parentId: "y" },
      { id: "y", name: "Y", parentId: "x" },
    ]);
    // the cycle terminates safely; the resulting order is arbitrary
    expect(HamHome.categoryPath(cyclic, "x")).toBe("Y/X");
  });
});

describe("extension/hamhome.js importFrom", () => {
  test("maps meta+categories into our model: note/tags/added/folder", () => {
    const res = HamHome.importFrom(META, CATEGORIES);
    expect(res.ok).toBe(true);
    const bookmarks = res.model!.bookmarks;
    expect(bookmarks).toHaveLength(2);

    expect(bookmarks[0]).toEqual({
      title: "A",
      url: "https://a.dev",
      folder: "Work/Console",
      tags: ["dev", "docs"],
      note: "note for a",
      added: 1690000100000,
    });
    // unknown categoryId lands unfiled; deleted + non-http rows are skipped
    expect(bookmarks[1]).toMatchObject({ url: "https://b.dev", folder: "" });
  });

  test("missing categories file still imports with everything unfiled", () => {
    const res = HamHome.importFrom(META, null);
    expect(res.ok).toBe(true);
    expect(res.model!.bookmarks.every((b) => b.folder === "")).toBe(true);
  });

  test("invalid json is rejected; bare arrays and bare wrappers both parse", () => {
    expect(HamHome.importFrom("nope", null).ok).toBe(false);
    const bare = JSON.stringify([
      { url: "https://d.dev", title: "D", createdAt: 5 },
    ]);
    expect(HamHome.importFrom(bare, null).model!.bookmarks).toEqual([
      { title: "D", url: "https://d.dev", folder: "", tags: [], note: "", added: 5 },
    ]);
  });
});

describe("extension/hamhome.js exportTo round-trip (#64)", () => {
  const NOW = 1700000000000;

  test("exported meta+categories re-import into the same folders and notes", () => {
    const model = {
      version: 1,
      bookmarks: [
        { id: "a", url: "https://a.dev", title: "A2", folder: "Work/Console", tags: ["dev"], note: "rewritten", added: 1690000100000 },
        { id: "b", url: "https://fresh.example", title: "Fresh", folder: "", tags: [], note: "", added: 0 },
      ],
      folders: [],
    };
    const res = HamHome.exportTo(model, META, CATEGORIES, NOW);
    expect(res.ok).toBe(true);

    const metaFile = JSON.parse(res.meta!);
    expect(metaFile.bookmarks).toHaveLength(5); // 4 remote rows (incl. deleted/junk) + 1 fresh
    const fresh = metaFile.bookmarks.find((b: Record<string, unknown>) => b.url === "https://fresh.example");
    expect(fresh).toMatchObject({
      title: "Fresh",
      description: "",
      categoryId: null,
      hasSnapshot: false,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(String(fresh.id)).toMatch(/^dav-/);

    const updated = metaFile.bookmarks.find((b: Record<string, unknown>) => b.id === "h1");
    expect(updated).toMatchObject({
      title: "A2",
      description: "rewritten",
      categoryId: "c2",
      tags: ["dev"],
      updatedAt: NOW,
      createdAt: 1690000100000,
    });
    // deleted + non-http remote rows survive untouched
    expect(metaFile.bookmarks.some((b: Record<string, unknown>) => b.id === "h3")).toBe(true);
    expect(metaFile.bookmarks.some((b: Record<string, unknown>) => b.id === "h4")).toBe(true);

    // categories: ours merge by signature; fresh declares no category
    const cats = JSON.parse(res.categories!);
    expect(cats.some((c: Record<string, unknown>) => c.id === "c1")).toBe(true);
    expect(cats.some((c: Record<string, unknown>) => c.id === "c2")).toBe(true);

    // full round trip: import the exported files back
    const imported = HamHome.importFrom(res.meta!, res.categories ?? null);
    expect(imported.ok).toBe(true);
    const a = imported.model!.bookmarks.find((b) => b.url === "https://a.dev");
    expect(a).toMatchObject({ title: "A2", folder: "Work/Console", note: "rewritten", tags: ["dev"] });
  });

  test("new folder paths become categories with path ids and parent links", () => {
    const model = {
      version: 1,
      bookmarks: [
        { id: "a", url: "https://x.example", title: "X", folder: "Dev/Rust", tags: [], note: "", added: 1 },
      ],
      folders: [],
    };
    const res = HamHome.exportTo(model, null, null, NOW);
    const cats = JSON.parse(res.categories!);
    const byId = Object.fromEntries(cats.map((c: Record<string, unknown>) => [c.id, c]));
    expect(byId["Dev/Rust"]).toMatchObject({ name: "Rust", parentId: "Dev" });
    expect(byId["Dev"]).toMatchObject({ name: "Dev", parentId: null });
    const meta = JSON.parse(res.meta!);
    expect(meta.bookmarks[0].categoryId).toBe("Dev/Rust");
  });

  test("isDeleted remote rows never absorb our URL updates", () => {
    const remote = JSON.stringify({
      bookmarks: [{ id: "gone", url: "https://a.dev", title: "t", description: "", categoryId: null, tags: [], hasSnapshot: false, createdAt: 1, updatedAt: 1, isDeleted: true }],
    });
    const model = { version: 1, bookmarks: [{ id: "a", url: "https://a.dev", title: "Back", folder: "", tags: [], note: "", added: 2 }], folders: [] };
    const res = HamHome.exportTo(model, remote, null, NOW);
    const rows = JSON.parse(res.meta!).bookmarks;
    expect(rows.find((b: Record<string, unknown>) => b.id === "gone").isDeleted).toBe(true);
    expect(rows.find((b: Record<string, unknown>) => String(b.id).startsWith("dav-")).title).toBe("Back");
  });

  test("rejects non-model input; urlKey treats hash URLs as the same page", () => {
    expect(HamHome.exportTo(null, null, null, NOW).ok).toBe(false);
    const model = { version: 1, bookmarks: [{ id: "a", url: "https://h.example/#top", title: "H", folder: "", tags: [], note: "", added: 1 }], folders: [] };
    const remote = JSON.stringify({ bookmarks: [{ id: "r", url: "https://h.example/", title: "old", description: "", categoryId: null, tags: [], hasSnapshot: false, createdAt: 1, updatedAt: 1 }] });
    const res = HamHome.exportTo(model, remote, null, NOW);
    const rows = JSON.parse(res.meta!).bookmarks;
    expect(rows.find((b: Record<string, unknown>) => b.id === "r").title).toBe("H");
  });
});
