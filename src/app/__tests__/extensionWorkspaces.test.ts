import { createRequire } from "module";

const nodeRequire = createRequire(import.meta.url);

const Workspaces = nodeRequire("../../../extension/workspaces.js") as {
  create: (name: string, pages: unknown[], now?: number) => Record<string, unknown>;
  isWebUrl: (url: unknown) => boolean;
  normalize: (raw: unknown) => { workspaces: Array<Record<string, unknown>> };
  remove: (list: unknown, id: string) => { workspaces: Array<Record<string, unknown>> };
  rename: (list: unknown, id: string, name: string) => { workspaces: Array<Record<string, unknown>> };
  restorablePages: (
    workspace: unknown,
    selectedIds?: number[] | null
  ) => Array<Record<string, unknown>>;
  upsert: (list: unknown, ws: Record<string, unknown>) => { workspaces: Array<Record<string, unknown>> };
  urlKeyOf: (url: unknown) => string;
};

describe("extension/workspaces.js model", () => {
  test("create sanitizes pages: keeps only web urls with pinned/group metadata", () => {
    const ws = Workspaces.create(
      "dev setup",
      [
        { url: "https://a.dev", title: "A", pinned: true, tabGroup: { title: "work", color: "blue" } },
        { url: "chrome://settings", title: "nope" },
        { url: "javascript:alert(1)" },
        { url: "https://b.dev", title: "" },
      ],
      1690000000000
    );
    expect(String(ws.id)).toMatch(/^ws-[0-9a-z]+-[0-9a-z]+$/);
    expect(ws.name).toBe("dev setup");
    expect(ws.createdAt).toBe(1690000000000);
    expect((ws.pages as unknown[]).length).toBe(2);
    expect((ws.pages as Array<Record<string, unknown>>)[0]).toEqual({
      url: "https://a.dev",
      title: "A",
      pinned: true,
      tabGroup: { title: "work", color: "blue" },
    });
    expect((ws.pages as Array<Record<string, unknown>>)[1].tabGroup).toBeNull();
  });

  test("upsert replaces by id and appends otherwise; rename and remove target ids", () => {
    const first = Workspaces.create("one", [{ url: "https://a.dev" }], 1);
    let list = Workspaces.upsert({ workspaces: [] }, first);
    expect(list.workspaces).toHaveLength(1);

    const renamed = { ...first, name: "uno" };
    list = Workspaces.upsert(list, renamed);
    expect(list.workspaces).toHaveLength(1);
    expect(list.workspaces[0].name).toBe("uno");

    list = Workspaces.upsert(list, Workspaces.create("two", [], 2));
    expect(list.workspaces).toHaveLength(2);

    expect(Workspaces.rename(list, String(first.id), "renamed").workspaces[0].name).toBe(
      "renamed"
    );
    // blank names are ignored, so the previous value stays
    expect(Workspaces.rename(list, String(first.id), "   ").workspaces[0].name).toBe("uno");
    expect(Workspaces.remove(list, String(first.id)).workspaces.map((w) => w.name)).toEqual([
      "two",
    ]);
  });

  test("restorablePages dedupes by url and honors the selected indexes", () => {
    const ws = Workspaces.create(
      "w",
      [
        { url: "https://a.dev/x" },
        { url: "https://a.dev/x#frag" },
        { url: "https://b.dev" },
        { url: "https://c.dev" },
      ],
      1
    );
    expect(Workspaces.restorablePages(ws)).toHaveLength(3);
    const selected = Workspaces.restorablePages(ws, [0, 2]);
    expect(selected.map((p) => p.url)).toEqual(["https://a.dev/x", "https://b.dev"]);
  });

  test("normalize rejects junk and keeps the model version", () => {
    expect(Workspaces.normalize(null)).toEqual({ version: 1, workspaces: [] });
    expect(Workspaces.normalize({ workspaces: [null, { name: "x" }] })).toEqual({
      version: 1,
      workspaces: [{ id: expect.any(String), name: "x", createdAt: 0, pages: [] }],
    });
    expect(Workspaces.isWebUrl("http://a.dev")).toBe(true);
    expect(Workspaces.isWebUrl("ftp://a.dev")).toBe(false);
    expect(Workspaces.urlKeyOf("https://a.dev/p#h")).toBe(Workspaces.urlKeyOf("https://a.dev/p"));
  });
});
