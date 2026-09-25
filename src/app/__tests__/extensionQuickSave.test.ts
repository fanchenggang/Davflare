import { createRequire } from "module";

const nodeRequire = createRequire(import.meta.url);

const Bookmarks = nodeRequire("../../../extension/bookmarks.js") as {
  addBookmark: (model: unknown, input: Record<string, unknown>) => {
    added: boolean;
    model: unknown;
  };
  emptyModel: () => { bookmarks: unknown[] };
  modelToJsonText: (model: unknown) => string;
  normalizeModel: (model: unknown) => unknown;
  parseHtml: (html: string) => unknown;
  serializeHtml: (model: unknown) => string;
  adoptRichFields: (htmlModel: unknown, jsonModel: unknown) => unknown;
  modelFromJson: (text: string) => { ok: boolean; model?: unknown };
  parseRemoteLibrary: (res: { html?: string; jsonText?: string | null }) => unknown;
};

const DavflareQuickSave = nodeRequire("../../../extension/quickSave.js") as {
  saveBookmark: (
    deps: Record<string, unknown>,
    page: { title: string; url: string; added?: number }
  ) => Promise<{ ok: boolean; status?: string; kind?: string; message?: string }>;
};

type PutCall = { etag: string | null | undefined; html: string };
type GetCall = { ifNoneMatch?: string };

function htmlWith(url: string, title = "Remote") {
  return (
    `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n` +
    `<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n` +
    `<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n` +
    `    <DT><A HREF="${url}" ADD_DATE="1">${title}</A>\n` +
    `</DL><p>\n`
  );
}

function parseRemote(res: { html?: string; jsonText?: string | null }) {
  return Bookmarks.parseRemoteLibrary(res);
}

function makeDeps(options: {
  cache?: { model: unknown; etag: string | null } | null;
  getSequence: Array<{
    ok?: boolean;
    kind?: string;
    html?: string;
    etag?: string | null;
    jsonText?: string | null;
  }>;
  putSequence: Array<{
    ok?: boolean;
    kind?: string;
    etag?: string | null;
  }>;
}) {
  const cacheWrites: Array<{ model: unknown; etag: string | null }> = [];
  let cache = options.cache ?? null;
  const puts: PutCall[] = [];
  const gets: GetCall[] = [];
  let getIdx = 0;
  let putIdx = 0;

  const client = {
    getBookmarks: async (opts?: { ifNoneMatch?: string }) => {
      gets.push({ ifNoneMatch: opts?.ifNoneMatch });
      const next = options.getSequence[getIdx++] ?? {
        ok: false,
        kind: "network",
      };
      if (next.ok === false) {
        return { ok: false, kind: next.kind || "network" };
      }
      return {
        ok: true,
        html: next.html ?? "",
        etag: next.etag ?? null,
        jsonText: next.jsonText ?? null,
        missing: false,
      };
    },
    putBookmarks: async (payload: {
      html: string;
      json?: string;
      etag?: string | null;
    }) => {
      puts.push({ etag: payload.etag, html: payload.html });
      const next = options.putSequence[putIdx++] ?? {
        ok: false,
        kind: "network",
      };
      if (next.ok === false) {
        return { ok: false, kind: next.kind || "network" };
      }
      return { ok: true, etag: next.etag ?? '"written"', jsonSaved: true };
    },
  };

  return {
    deps: {
      client,
      Bookmarks,
      readCache: async () => cache,
      writeCache: async (model: unknown, etag: string | null) => {
        cache = { model, etag };
        cacheWrites.push({ model, etag });
      },
      parseRemote,
    },
    puts,
    gets,
    cacheWrites,
    getCache: () => cache,
  };
}

describe("extension/quickSave.js (#71 If-Match conflict retry / #73 cache harden / #75 SW parse)", () => {
  const page = {
    title: "New Page",
    url: "https://example.com/fresh",
    added: 1_700_000_000_000,
  };

  test("cached etag 412 → re-GET latest → merge → retry PUT succeeds", async () => {
    const staleModel = Bookmarks.normalizeModel(Bookmarks.emptyModel());
    const remoteHtml = htmlWith("https://example.com/other", "Other");
    const harness = makeDeps({
      cache: { model: staleModel, etag: '"stale"' },
      getSequence: [{ ok: true, html: remoteHtml, etag: '"fresh"' }],
      putSequence: [
        { ok: false, kind: "conflict" }, // fast-path If-Match miss
        { ok: true, etag: '"after"' }, // retry PUT
      ],
    });

    const result = await DavflareQuickSave.saveBookmark(harness.deps, page);
    expect(result).toEqual({ ok: true, status: "saved" });

    // Fast path used stale etag; retry PUT used the GET etag.
    expect(harness.puts.map((p) => p.etag)).toEqual(['"stale"', '"fresh"']);
    expect(harness.gets).toHaveLength(1);
    expect(harness.gets[0].ifNoneMatch).toBeUndefined();

    // Retry body must include both the remote bookmark and the new URL.
    expect(harness.puts[1].html).toContain("https://example.com/other");
    expect(harness.puts[1].html).toContain("https://example.com/fresh");

    // Cache ends on the successful write etag (not the stale one).
    expect(harness.getCache()?.etag).toBe('"after"');
    // After the initial 412 we cleared the stale etag before GET.
    expect(harness.cacheWrites.some((w) => w.etag === null)).toBe(true);
  });

  test("GET→PUT 412 then second GET→PUT still 412 surfaces conflict and keeps latest etag in cache", async () => {
    const harness = makeDeps({
      cache: null,
      getSequence: [
        {
          ok: true,
          html: htmlWith("https://example.com/a", "A"),
          etag: '"e1"',
        },
        {
          ok: true,
          html: htmlWith("https://example.com/b", "B"),
          etag: '"e2"',
        },
      ],
      putSequence: [
        { ok: false, kind: "conflict" },
        { ok: false, kind: "conflict" },
      ],
    });

    const result = await DavflareQuickSave.saveBookmark(harness.deps, page);
    expect(result).toEqual({ ok: false, kind: "conflict" });
    expect(harness.gets).toHaveLength(2);
    expect(harness.puts.map((p) => p.etag)).toEqual(['"e1"', '"e2"']);
    // Cache etag stays consistent with the last observed remote GET.
    expect(harness.getCache()?.etag).toBe('"e2"');
  });

  test("non-conflict PUT failure does not retry", async () => {
    const harness = makeDeps({
      cache: {
        model: Bookmarks.normalizeModel(Bookmarks.emptyModel()),
        etag: '"ok"',
      },
      getSequence: [],
      putSequence: [{ ok: false, kind: "unauthorized" }],
    });
    const result = await DavflareQuickSave.saveBookmark(harness.deps, page);
    expect(result).toEqual({ ok: false, kind: "unauthorized" });
    expect(harness.gets).toHaveLength(0);
    expect(harness.puts).toHaveLength(1);
  });

  test("url already in cached model reports exists without network", async () => {
    const model = Bookmarks.addBookmark(Bookmarks.emptyModel(), {
      title: "New Page",
      url: page.url,
      added: 1,
    }).model;
    const harness = makeDeps({
      cache: { model, etag: '"x"' },
      getSequence: [],
      putSequence: [],
    });
    const result = await DavflareQuickSave.saveBookmark(harness.deps, page);
    expect(result).toEqual({ ok: true, status: "exists" });
    expect(harness.puts).toHaveLength(0);
    expect(harness.gets).toHaveLength(0);
  });

  test("writeCache throw after GET does not abort PUT (#73 large-library quota)", async () => {
    let writes = 0;
    const harness = makeDeps({
      cache: null,
      getSequence: [
        {
          ok: true,
          html: htmlWith("https://example.com/a", "A"),
          etag: '"e1"',
        },
      ],
      putSequence: [{ ok: true, etag: '"after"' }],
    });
    const throwingWrite = async (model: unknown, etag: string | null) => {
      writes += 1;
      // First write (post-GET, pre-PUT) blows up — must not prevent PUT.
      if (writes === 1) {
        throw new Error("QuotaExceededError");
      }
      return harness.deps.writeCache(model, etag);
    };

    const result = await DavflareQuickSave.saveBookmark(
      { ...harness.deps, writeCache: throwingWrite },
      page
    );
    expect(result).toEqual({ ok: true, status: "saved" });
    expect(harness.puts).toHaveLength(1);
    expect(harness.puts[0].html).toContain("https://example.com/fresh");
    expect(harness.puts[0].html).toContain("https://example.com/a");
  });

  test("writeCache throw after successful PUT still reports saved (#73)", async () => {
    const harness = makeDeps({
      cache: {
        model: Bookmarks.normalizeModel(Bookmarks.emptyModel()),
        etag: '"ok"',
      },
      getSequence: [],
      putSequence: [{ ok: true, etag: '"written"' }],
    });
    const throwingWrite = async () => {
      throw new Error("QuotaExceededError");
    };
    const result = await DavflareQuickSave.saveBookmark(
      { ...harness.deps, writeCache: throwingWrite },
      page
    );
    expect(result).toEqual({ ok: true, status: "saved" });
    expect(harness.puts).toHaveLength(1);
  });

  test("GET with JSON-only body saves without calling parseHtml (#75 SW / no DOMParser)", async () => {
    const remoteModel = Bookmarks.addBookmark(Bookmarks.emptyModel(), {
      title: "Other",
      url: "https://example.com/other",
      added: 1,
    }).model;
    const jsonText = Bookmarks.modelToJsonText(remoteModel);
    // Simulate MV3 service worker: no DOMParser. JSON-first parseRemote must still work.
    const RealDOMParser = (globalThis as { DOMParser?: unknown }).DOMParser;
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as { DOMParser?: unknown }).DOMParser;
    try {
      const harness = makeDeps({
        cache: null,
        getSequence: [
          {
            ok: true,
            html: "<p>not parseable without DOM and unused when JSON present</p>",
            jsonText,
            etag: '"e1"',
          },
        ],
        putSequence: [{ ok: true, etag: '"after"' }],
      });
      const result = await DavflareQuickSave.saveBookmark(harness.deps, page);
      expect(result).toEqual({ ok: true, status: "saved" });
      expect(harness.puts).toHaveLength(1);
      expect(harness.puts[0].html).toContain("https://example.com/fresh");
      expect(harness.puts[0].html).toContain("https://example.com/other");
    } finally {
      if (RealDOMParser) {
        (globalThis as { DOMParser?: unknown }).DOMParser = RealDOMParser;
      }
    }
  });

  test("parseRemote throw is returned as unexpected with message (#75)", async () => {
    const harness = makeDeps({
      cache: null,
      getSequence: [{ ok: true, html: "<DL></DL>", etag: '"e1"' }],
      putSequence: [],
    });
    const result = await DavflareQuickSave.saveBookmark(
      {
        ...harness.deps,
        parseRemote: () => {
          throw new Error("parseHtml requires DOMParser");
        },
      },
      page
    );
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("unexpected");
    expect(result.message).toContain("DOMParser");
    expect(harness.puts).toHaveLength(0);
  });

});

describe("extension/quickSave.js revives trashed URLs without wiping fields (#130)", () => {
  const Bm = nodeRequire("../../../extension/bookmarks.js");
  const trashedModel = () =>
    Bm.softDeleteBookmarks(
      Bm.normalizeModel({
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
          },
        ],
      }),
      ["x1"],
      100
    );
  const page = { title: "Tab title", url: "https://example.com/a", added: 200 };
  const expected = {
    id: "x1",
    title: "Orig",
    folder: "Work",
    tags: ["t1"],
    note: "keepme",
    added: 1,
    pinned: true,
    deleted: false,
  };

  test("cached fast path (context menu / shortcut)", async () => {
    const harness = makeDeps({
      cache: { model: trashedModel(), etag: '"c"' },
      getSequence: [],
      putSequence: [{ ok: true, etag: '"after"' }],
    });
    const result = await DavflareQuickSave.saveBookmark(harness.deps, page);
    expect(result).toEqual({ ok: true, status: "restored" }); // notification: 已从回收站恢复
    const saved = (harness.getCache()!.model as { bookmarks: unknown[] }).bookmarks;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject(expected);
    // The revived row is back in the authoritative HTML.
    expect(harness.puts[0].html).toContain("https://example.com/a");
  });

  test("remote GET path (no cache)", async () => {
    const harness = makeDeps({
      cache: null,
      getSequence: [
        { ok: true, html: "", jsonText: Bm.modelToJsonText(trashedModel()), etag: '"e1"' },
      ],
      putSequence: [{ ok: true, etag: '"after"' }],
    });
    const result = await DavflareQuickSave.saveBookmark(harness.deps, page);
    expect(result).toEqual({ ok: true, status: "restored" }); // notification: 已从回收站恢复
    const saved = (harness.getCache()!.model as { bookmarks: unknown[] }).bookmarks;
    expect(saved[0]).toMatchObject(expected);
  });

  test("a normal (non-trashed) save still reports status saved", async () => {
    const harness = makeDeps({
      cache: { model: trashedModel(), etag: '"c"' },
      getSequence: [],
      putSequence: [{ ok: true, etag: '"after"' }],
    });
    const result = await DavflareQuickSave.saveBookmark(harness.deps, {
      title: "Fresh",
      url: "https://example.com/brand-new",
      added: 300,
    });
    expect(result).toEqual({ ok: true, status: "saved" });
  });
});
