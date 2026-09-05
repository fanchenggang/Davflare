import { createRequire } from "module";

const nodeRequire = createRequire(import.meta.url);

const Snapshots = nodeRequire("../../../extension/snapshots.js") as {
  fileName: (id: string) => string;
  findByBookmarkId: (model: unknown, bookmarkId: string) => Record<string, unknown> | null;
  makeId: () => string;
  normalize: (raw: unknown) => { snapshots: Array<Record<string, unknown>> };
  remove: (list: unknown, id: string) => { snapshots: Array<Record<string, unknown>> };
  upsert: (list: unknown, entry: Record<string, unknown>) => { snapshots: Array<Record<string, unknown>> };
};

const entry = (over: Record<string, unknown>) => ({
  id: "snap-1",
  bookmarkId: "bm-1",
  url: "https://a.dev",
  title: "A",
  capturedAt: 1690000000000,
  size: 1234,
  ...over,
});

describe("extension/snapshots.js index", () => {
  test("normalizes junk rows and requires id + url", () => {
    expect(Snapshots.normalize(null)).toEqual({ version: 1, snapshots: [] });
    const model = Snapshots.normalize({
      snapshots: [
        entry({}),
        entry({ id: "", url: "https://a.dev" }),
        entry({ id: "snap-2", url: "" }),
        null,
        { id: "snap-3", url: "https://b.dev", size: -5, capturedAt: "x" },
      ],
    });
    expect(model.snapshots).toHaveLength(2);
    expect(model.snapshots[0]).toMatchObject({ id: "snap-1", size: 1234 });
    expect(model.snapshots[1]).toMatchObject({ id: "snap-3", size: 0, capturedAt: 0 });
  });

  test("upsert keeps at most one snapshot per bookmark and replaces by id", () => {
    let model = Snapshots.normalize({ snapshots: [entry({})] });
    model = Snapshots.upsert(model, entry({ id: "snap-9" }));
    expect(model.snapshots).toHaveLength(1);
    expect(model.snapshots[0].id).toBe("snap-9");

    model = Snapshots.upsert(
      model,
      entry({ id: "snap-10", bookmarkId: "bm-2", url: "https://b.dev" })
    );
    expect(model.snapshots).toHaveLength(2);

    // a fresh snapshot for bm-1 replaces the old entry entirely
    model = Snapshots.upsert(model, entry({}));
    expect(model.snapshots).toHaveLength(2);
    expect(model.snapshots.map((s) => s.bookmarkId)).toEqual(["bm-2", "bm-1"]);
  });

  test("findByBookmarkId / remove / fileName", () => {
    const model = Snapshots.normalize({ snapshots: [entry({})] });
    expect(Snapshots.findByBookmarkId(model, "bm-1")).toMatchObject({ id: "snap-1" });
    expect(Snapshots.findByBookmarkId(model, "bm-x")).toBeNull();
    expect(Snapshots.remove(model, "snap-1").snapshots).toHaveLength(0);
    expect(Snapshots.fileName("snap-1")).toBe("snapshots/snap-1.html");
    expect(typeof Snapshots.makeId()).toBe("string");
  });
});
