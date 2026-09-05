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
