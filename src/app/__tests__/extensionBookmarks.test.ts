import { createRequire } from "module";

const nodeRequire = createRequire(import.meta.url);

type BookmarkRow = Record<string, unknown>;
type BookmarkModel = { version: number; bookmarks: BookmarkRow[] };

const Bookmarks = nodeRequire("../../../extension/bookmarks.js") as {
  MODEL_VERSION: number;
  addBookmark: (
    model: unknown,
    item: { title?: string; url?: string; folder?: string; tags?: string[]; note?: string; added?: number }
  ) => { model: BookmarkModel; added: boolean };
  adoptRichFields: (htmlModel: unknown, jsonModel: unknown) => BookmarkModel;
  emptyModel: () => BookmarkModel;
  isWebUrl: (url: unknown) => boolean;
  isValidModel: (value: unknown) => boolean;
  mergeModels: (base: unknown, incoming: unknown) => BookmarkModel;
  modelFromJson: (text: string) => { ok: boolean; model: BookmarkModel };
  modelToJsonText: (model: unknown) => string;
  normalizeModel: (raw: unknown) => BookmarkModel;
  parseHtml: (text: string) => BookmarkModel;
  removeBookmark: (model: unknown, id: string) => BookmarkModel;
  serializeHtml: (model: unknown) => string;
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
    expect(Bookmarks.parseHtml("")).toEqual({ version: 1, bookmarks: [] });
    expect(Bookmarks.parseHtml("<p>not a bookmark file</p>")).toEqual({
      version: 1,
      bookmarks: [],
    });
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
