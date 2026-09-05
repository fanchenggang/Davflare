import { createRequire } from "module";

const nodeRequire = createRequire(import.meta.url);

const DavflareDav = nodeRequire("../../../extension/dav.js") as {
  createDavClient: (options: Record<string, unknown>) => {
    deleteFile: (fileName: string) => Promise<Resolved>;
    ensureDir: () => Promise<Resolved>;
    getBookmarks: () => Promise<Resolved>;
    getFile: (fileName: string) => Promise<Resolved>;
    paths: { root: string; dir: string; html: string; json: string };
    probe: () => Promise<Resolved>;
    putBookmarks: (payload: Record<string, unknown>) => Promise<Resolved>;
    putFile: (fileName: string, body: string, contentType: string, etag?: string) => Promise<Resolved>;
  };
};

type Resolved = { ok: boolean; kind?: string; [key: string]: unknown };

type MockReply = {
  status: number;
  body?: string;
  etag?: string;
};

type MockCall = { url: string; init: RequestInit };

function fetchMock(
  handler: (url: string, init: RequestInit) => MockReply | Promise<MockReply>
): { fetch: typeof fetch; calls: MockCall[] } {
  const calls: MockCall[] = [];
  const fn = async (url: unknown, init?: RequestInit): Promise<unknown> => {
    calls.push({ url: String(url), init: init || {} });
    const reply = await handler(String(url), init || {});
    return {
      status: reply.status,
      ok: reply.status >= 200 && reply.status < 300,
      text: async () => reply.body ?? "",
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "etag" ? reply.etag ?? null : null,
      },
    };
  };
  return { fetch: fn as unknown as typeof fetch, calls };
}

function clientWith(
  overrides: Record<string, unknown>,
  handler: (url: string, init: RequestInit) => MockReply | Promise<MockReply>
) {
  const mock = fetchMock(handler);
  const client = DavflareDav.createDavClient({
    instanceUrl: "https://drive.example",
    username: "walter",
    password: "s3cret",
    fetchImpl: mock.fetch,
    ...overrides,
  });
  return { client, calls: mock.calls };
}

const ROOT = "https://drive.example/webdav";
const DIR = ROOT + "/bookmarks/";

describe("extension/dav.js request basics", () => {
  test("sends Basic auth to the /webdav endpoints", async () => {
    const { client, calls } = clientWith({}, () => ({ status: 207 }));
    await client.probe();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(ROOT + "/");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Basic " + btoa("walter:s3cret"));
    expect(headers.Depth).toBe("0");
    expect(calls[0].init.method).toBe("PROPFIND");
    expect(client.paths.dir).toBe(DIR);
  });

  test("non-ASCII credentials are utf-8 encoded into the auth header", async () => {
    const { client, calls } = clientWith(
      { username: "秋日", password: "密码" },
      () => ({ status: 207 })
    );
    await client.probe();
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      "Basic " + btoa(unescape(encodeURIComponent("秋日:密码")))
    );
  });

  test("a missing instance URL or fetch means network kind, never a throw", async () => {
    const noUrl = DavflareDav.createDavClient({
      username: "u",
      password: "p",
      fetchImpl: fetchMock(() => ({ status: 207 })).fetch,
    });
    expect(await noUrl.probe()).toEqual({ ok: false, kind: "network" });

    const { client } = clientWith(
      {
        fetchImpl: (() => {
          throw new Error("boom");
        }) as unknown as typeof fetch,
      },
      () => ({ status: 200 })
    );
    expect(await client.getBookmarks()).toEqual({ ok: false, kind: "network" });
  });
});

describe("extension/dav.js basePath (issue #54)", () => {
  test("defaults to bookmarks/ and honors a custom relative directory", async () => {
    const def = clientWith({}, () => ({ status: 207 }));
    expect(def.client.paths.dir).toBe(DIR);

    const custom = clientWith({ basePath: "qa/bookmarks" }, () => ({ status: 207 }));
    expect(custom.client.paths.dir).toBe(ROOT + "/qa/bookmarks/");
    expect(custom.client.paths.html).toBe(ROOT + "/qa/bookmarks/bookmarks.html");
    await custom.client.probe();
    // the probe always targets the webdav root, independent of basePath
    expect(custom.calls[0].url).toBe(ROOT + "/");
  });

  test("slashes around the basePath are trimmed; empty falls back to bookmarks", () => {
    const slashed = clientWith({ basePath: "/HamHomeSync/" }, () => ({ status: 207 }));
    expect(slashed.client.paths.dir).toBe(ROOT + "/HamHomeSync/");
    const empty = clientWith({ basePath: "" }, () => ({ status: 207 }));
    expect(empty.client.paths.dir).toBe(DIR);
  });

  test("HamHome layout reads bookmarks/meta.json under /HamHomeSync (issue #53)", async () => {
    const hh = clientWith({ basePath: "HamHomeSync" }, () => ({
      status: 200,
      text: "{}",
      headers: { get: () => null },
    }));
    await hh.client.getFile("bookmarks/meta.json");
    expect(hh.calls[0].url).toBe(ROOT + "/HamHomeSync/bookmarks/meta.json");
    await hh.client.getFile("categories.json");
    expect(hh.calls[1].url).toBe(ROOT + "/HamHomeSync/categories.json");
  });
});

describe("extension/dav.js ensureDir nested basePath (issue #60)", () => {
  test("MKCOLs each basePath segment in order (a/ then a/b/)", async () => {
    const { client, calls } = clientWith({ basePath: "a/b" }, (_url, init) => {
      if ((init.method as string) === "MKCOL") return { status: 201 };
      return { status: 204 };
    });
    expect(await client.ensureDir()).toEqual({ ok: true });
    expect(calls.map((c) => (c.init.method as string) + " " + c.url)).toEqual([
      "MKCOL " + ROOT + "/a/",
      "MKCOL " + ROOT + "/a/b/",
    ]);
  });

  test("treats 405 on an intermediate segment as already-exists and continues", async () => {
    const { client, calls } = clientWith({ basePath: "qa/bookmarks" }, (url, init) => {
      if ((init.method as string) === "MKCOL") {
        // parent already there; create the leaf
        if (url.endsWith("/qa/")) return { status: 405 };
        return { status: 201 };
      }
      return { status: 204 };
    });
    expect(await client.ensureDir()).toEqual({ ok: true });
    expect(calls.map((c) => (c.init.method as string) + " " + c.url)).toEqual([
      "MKCOL " + ROOT + "/qa/",
      "MKCOL " + ROOT + "/qa/bookmarks/",
    ]);
  });

  test("putBookmarks MKCOLs nested basePath before PUT", async () => {
    const nestedDir = ROOT + "/_pm_qa/bookmarks/";
    const { client, calls } = clientWith({ basePath: "_pm_qa/bookmarks" }, (_url, init) => {
      if ((init.method as string) === "MKCOL") return { status: 201 };
      return { status: 204 };
    });
    expect(
      await client.putBookmarks({ html: "<DL><p></DL><p>", json: '{"bookmarks":[]}' })
    ).toEqual({ ok: true, jsonSaved: true });
    expect(calls.map((c) => (c.init.method as string) + " " + c.url)).toEqual([
      "MKCOL " + ROOT + "/_pm_qa/",
      "MKCOL " + nestedDir,
      "PUT " + nestedDir + "bookmarks.html",
      "PUT " + nestedDir + "bookmarks.json",
    ]);
  });

  test("putFile under nested basePath MKCOLs basePath segments then file parents", async () => {
    const nestedDir = ROOT + "/a/b/";
    const { client, calls } = clientWith({ basePath: "a/b" }, (_url, init) => {
      if ((init.method as string) === "MKCOL") return { status: 201 };
      return { status: 201 };
    });
    expect(
      await client.putFile("snapshots/s1.html", "<html></html>", "text/html; charset=utf-8")
    ).toEqual({ ok: true });
    expect(calls.map((c) => (c.init.method as string) + " " + c.url)).toEqual([
      "MKCOL " + ROOT + "/a/",
      "MKCOL " + nestedDir,
      "MKCOL " + nestedDir + "snapshots/",
      "PUT " + nestedDir + "snapshots/s1.html",
    ]);
  });

  test("a single MKCOL of a nested leaf would 409 — segmented create avoids it", async () => {
    // Simulate a strict server: MKCOL fails with 409 when any parent is missing.
    const created = new Set<string>();
    const { client, calls } = clientWith({ basePath: "a/b/c" }, (url, init) => {
      if ((init.method as string) !== "MKCOL") return { status: 204 };
      const path = url.slice(ROOT.length); // e.g. /a/ or /a/b/
      const parent = path.replace(/[^/]+\/$/, "");
      if (parent !== "/" && !created.has(parent)) return { status: 409 };
      created.add(path);
      return { status: 201 };
    });
    expect(await client.ensureDir()).toEqual({ ok: true });
    expect(calls.filter((c) => c.init.method === "MKCOL").map((c) => c.url)).toEqual([
      ROOT + "/a/",
      ROOT + "/a/b/",
      ROOT + "/a/b/c/",
    ]);
  });
});

describe("extension/dav.js probe", () => {
  test("maps 207/404/401/403 to ok, disabled, unauthorized, notConfigured", async () => {
    const ok = clientWith({}, () => ({ status: 207 }));
    expect((await ok.client.probe()).ok).toBe(true);

    const disabled = clientWith({}, () => ({ status: 404, body: "Not Found" }));
    expect(await disabled.client.probe()).toEqual({ ok: false, kind: "disabled" });

    const unauthorized = clientWith({}, () => ({ status: 401 }));
    expect(await unauthorized.client.probe()).toEqual({ ok: false, kind: "unauthorized" });

    const notConfigured = clientWith({}, () => ({ status: 403 }));
    expect(await notConfigured.client.probe()).toEqual({
      ok: false,
      kind: "notConfigured",
    });
  });
});

describe("extension/dav.js getBookmarks", () => {
  test("fetches html then json and returns both with the etag", async () => {
    const { client, calls } = clientWith({}, (url) =>
      url.endsWith("bookmarks.html")
        ? { status: 200, body: "<DL><p></DL><p>", etag: '"abc123"' }
        : { status: 200, body: '{"bookmarks":[]}' }
    );
    const res = await client.getBookmarks();
    expect(res.ok).toBe(true);
    expect(res).toMatchObject({
      missing: false,
      html: "<DL><p></DL><p>",
      etag: '"abc123"',
      jsonText: '{"bookmarks":[]}',
    });
    expect(calls.map((c) => c.url)).toEqual([DIR + "bookmarks.html", DIR + "bookmarks.json"]);
  });

  test("a 404 on the file with a healthy probe means first run, not a disabled flag", async () => {
    const { client, calls } = clientWith({}, (_url, init) => {
      const method = (init.method as string) || "GET";
      if (method === "PROPFIND") return { status: 207 };
      return { status: 404, body: "Not Found" };
    });
    const res = await client.getBookmarks();
    expect(res).toMatchObject({ ok: true, missing: true, html: "" });
    expect(calls[1].init.method).toBe("PROPFIND");
  });

  test("a 404 everywhere means the webdav flag is off", async () => {
    const { client } = clientWith({}, () => ({ status: 404, body: "Not Found" }));
    expect(await client.getBookmarks()).toEqual({ ok: false, kind: "disabled" });
  });

  test("auth failures surface as unauthorized / notConfigured", async () => {
    const unauthorized = clientWith({}, () => ({ status: 401 }));
    expect(await unauthorized.client.getBookmarks()).toEqual({
      ok: false,
      kind: "unauthorized",
    });
    const notConfigured = clientWith({}, () => ({ status: 403 }));
    expect(await notConfigured.client.getBookmarks()).toEqual({
      ok: false,
      kind: "notConfigured",
    });
  });
});

describe("extension/dav.js putBookmarks", () => {
  test("creates the folder (tolerating 405), puts html with If-Match, then json", async () => {
    const { client, calls } = clientWith({}, (url: string, init) => {
      const method = (init.method as string) || "";
      if (method === "MKCOL") return { status: 405 };
      if (url.endsWith("bookmarks.json")) return { status: 204 };
      return { status: 204 };
    });
    const res = await client.putBookmarks({
      html: "<DL><p></DL><p>",
      json: '{"bookmarks":[]}',
      etag: '"etag-1"',
    });
    expect(res).toEqual({ ok: true, jsonSaved: true });

    const methods = calls.map((c) => (c.init.method as string) + " " + c.url);
    expect(methods).toEqual([
      "MKCOL " + DIR,
      "PUT " + DIR + "bookmarks.html",
      "PUT " + DIR + "bookmarks.json",
    ]);
    const htmlPut = calls[1].init.headers as Record<string, string>;
    expect(htmlPut["If-Match"]).toBe('"etag-1"');
    expect(htmlPut["Content-Type"]).toContain("text/html");
    expect(calls[1].init.body).toBe("<DL><p></DL><p>");
  });

  test("no etag means no If-Match precondition", async () => {
    const { client, calls } = clientWith({}, () => ({ status: 201 }));
    await client.putBookmarks({ html: "x" });
    const headers = calls[1].init.headers as Record<string, string>;
    expect(headers["If-Match"]).toBeUndefined();
  });

  test("a 412 precondition failure maps to conflict without touching json", async () => {
    const { client, calls } = clientWith({}, (_url, init) => {
      if ((init.method as string) === "MKCOL") return { status: 405 };
      return { status: 412 };
    });
    expect(await client.putBookmarks({ html: "x", json: "{}" })).toEqual({
      ok: false,
      kind: "conflict",
    });
    expect(calls).toHaveLength(2);
  });

  test("a failing json write is best-effort and still reports success", async () => {
    const { client } = clientWith({}, (url) =>
      url.endsWith("bookmarks.json") ? { status: 500 } : { status: 204 }
    );
    expect(await client.putBookmarks({ html: "x", json: "{}" })).toEqual({
      ok: true,
      jsonSaved: false,
    });
  });

  test("a disabled webdav flag blocks the write before any PUT", async () => {
    const { client, calls } = clientWith({}, (_url, init) => {
      if ((init.method as string) === "MKCOL") return { status: 404 };
      return { status: 204 };
    });
    expect(await client.putBookmarks({ html: "x" })).toEqual({
      ok: false,
      kind: "disabled",
    });
    expect(calls).toHaveLength(1);
  });
});

describe("extension/dav.js generic getFile / putFile", () => {
  test("getFile returns json sidecars and disambiguates a 404 via probe", async () => {
    const firstRun = clientWith({}, (_url, init) => {
      if ((init.method as string) === "PROPFIND") return { status: 207 };
      return { status: 404, body: "Not Found" };
    });
    expect(await firstRun.client.getFile("workspaces.json")).toEqual({
      ok: true,
      missing: true,
      text: null,
      etag: null,
    });

    const present = clientWith({}, (url) =>
      url.endsWith("workspaces.json")
        ? { status: 200, body: "{}", etag: '"w1"' }
        : { status: 404, body: "Not Found" }
    );
    expect(await present.client.getFile("workspaces.json")).toEqual({
      ok: true,
      missing: false,
      text: "{}",
      etag: '"w1"',
    });
  });

  test("putFile sends If-Match with the etag and maps 412 to conflict", async () => {
    const { client, calls } = clientWith({}, (url: string, init) => {
      if ((init.method as string) === "MKCOL") return { status: 201 };
      if (url.endsWith("tabGroups.json") && (init.headers as Record<string, string>)["If-Match"]) {
        return { status: 412 };
      }
      return { status: 204 };
    });
    expect(
      await client.putFile("tabGroups.json", "{}", "application/json; charset=utf-8", '"t1"')
    ).toEqual({ ok: false, kind: "conflict" });

    const headers = calls[1].init.headers as Record<string, string>;
    expect(headers["If-Match"]).toBe('"t1"');
    expect(headers["Content-Type"]).toContain("application/json");
    expect(calls[1].init.body).toBe("{}");
  });

  test("putFile succeeds without an etag and without sending If-Match", async () => {
    const { client, calls } = clientWith({}, () => ({ status: 204 }));
    expect(await client.putFile("workspaces.json", "[]", "application/json")).toEqual({
      ok: true,
    });
    expect((calls[1].init.headers as Record<string, string>)["If-Match"]).toBeUndefined();
  });

  test("putFile MKCOLs nested parent folders before PUT", async () => {
    const { client, calls } = clientWith({}, (_url, init) => {
      if ((init.method as string) === "MKCOL") return { status: 201 };
      return { status: 201 };
    });
    expect(
      await client.putFile("snapshots/snap-1.html", "<html></html>", "text/html; charset=utf-8")
    ).toEqual({ ok: true });
    expect(calls.map((c) => c.init.method + " " + c.url)).toEqual([
      "MKCOL " + DIR,
      "MKCOL " + DIR + "snapshots/",
      "PUT " + DIR + "snapshots/snap-1.html",
    ]);
  });
});

describe("extension/dav.js deleteFile", () => {
  test("maps 204/404 to ok and other statuses to kinds", async () => {
    const gone = clientWith({}, () => ({ status: 204 }));
    expect(await gone.client.deleteFile("snapshots/snap-1.html")).toEqual({ ok: true });

    const missing = clientWith({}, () => ({ status: 404 }));
    expect(await missing.client.deleteFile("snapshots/snap-1.html")).toEqual({ ok: true });

    const denied = clientWith({}, () => ({ status: 401 }));
    expect(await denied.client.deleteFile("snapshots/snap-1.html")).toEqual({
      ok: false,
      kind: "unauthorized",
    });

    const offline = clientWith({}, () => ({ status: 0 }));
    expect(await offline.client.deleteFile("snapshots/snap-1.html")).toEqual({
      ok: false,
      kind: "network",
    });
  });
});
