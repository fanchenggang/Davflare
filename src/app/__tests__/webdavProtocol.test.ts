/**
 * functions/webdav/protocol.ts 分支级直测。
 *
 * 覆盖 e2e 打不到的条件分支：304/206/412/423/405/409/415、Range 边界、
 * If-Match / If-None-Match、Overwrite 头、LOCK token 校验、鉴权 fail-closed、
 * 内部前缀保护等。通过真实 Request/Response + InMemoryBucket 驱动 onRequest。
 */
import { onRequest, type WebDavEnv } from "../../../functions/webdav/protocol";
import {
  InMemoryBucket,
  basicAuthHeader,
  makeContext,
} from "../testInMemoryBucket";

const AUTH = basicAuthHeader("user", "pass");
const HOST = "http://drive.example.com";

function makeEnv(bucket: InMemoryBucket, extra: Record<string, unknown> = {}): WebDavEnv {
  return {
    BUCKET: bucket.asBucket(),
    WEBDAV_USERNAME: "user",
    WEBDAV_PASSWORD: "pass",
    ...extra,
  };
}

function req(
  path: string,
  method: string,
  headers?: Record<string, string>,
  body?: BodyInit
): Request {
  return new Request(`${HOST}${path}`, { method, headers, body });
}

function withRawBody(
  request: Request,
  bytes: Uint8Array
): Request {
  // whatwg-fetch 的 Request 没有 body getter，WebDAV/上传的分块 PUT 用到
  Object.defineProperty(request, "body", { value: bytes });
  return request;
}

async function call(request: Request, env: WebDavEnv) {
  return onRequest(makeContext(request, env));
}

const LOCK_BODY =
  '<?xml version="1.0" encoding="utf-8"?><D:lockinfo xmlns:D="DAV:"><D:lockscope><D:exclusive/></D:lockscope><D:locktype><D:write/></D:locktype><D:owner>tester</D:owner></D:lockinfo>';

const SHARED_LOCK_BODY =
  '<?xml version="1.0" encoding="utf-8"?><D:lockinfo xmlns:D="DAV:"><D:lockscope><D:shared/></D:lockscope><D:locktype><D:write/></D:locktype></D:lockinfo>';

async function seedLockedFile(
  bucket: InMemoryBucket,
  key = "locked.txt",
  depth: "0" | "infinity" = "0"
): Promise<string> {
  bucket.seed([{ key, body: "locked" }]);
  const response = await call(
    req(`/webdav/${key}`, "LOCK", {
      Authorization: AUTH,
      Depth: depth,
      "Content-Type": "application/xml",
    }),
    makeEnv(bucket)
  );
  expect(response.status).toBe(201);
  const tokenHeader = response.headers.get("Lock-Token") ?? "";
  const token = tokenHeader.replace(/^<urn:uuid:/, "").replace(/>$/, "");
  expect(token).not.toBe("");
  return token;
}

describe("webdav OPTIONS / redirect / auth", () => {
  test("OPTIONS returns DAV class and Allow without auth", async () => {
    const bucket = new InMemoryBucket();
    const response = await call(
      req("/webdav/", "OPTIONS"),
      makeEnv(bucket)
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("DAV")).toBe("1, 2");
    const allow = response.headers.get("Allow") ?? "";
    for (const method of [
      "OPTIONS",
      "PROPFIND",
      "MKCOL",
      "GET",
      "PUT",
      "DELETE",
      "COPY",
      "MOVE",
      "LOCK",
      "UNLOCK",
    ]) {
      expect(allow).toContain(method);
    }
  });

  test("/webdav without trailing slash is a 307 redirect (no auth needed)", async () => {
    const bucket = new InMemoryBucket();
    const response = await call(req("/webdav", "GET"), makeEnv(bucket));
    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe(`${HOST}/webdav/`);
  });

  test("missing Authorization is 401 with WWW-Authenticate", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "x" }]);
    const response = await call(req("/webdav/a.txt", "GET"), makeEnv(bucket));
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe('Basic realm="WebDAV"');
  });

  test("wrong credentials are 401", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "x" }]);
    const response = await call(
      req("/webdav/a.txt", "GET", { Authorization: basicAuthHeader("user", "nope") }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(401);
  });

  test("empty configured credentials fail closed with 403", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "x" }]);
    const response = await call(
      req("/webdav/a.txt", "GET", { Authorization: AUTH }),
      makeEnv(bucket, { WEBDAV_USERNAME: "", WEBDAV_PASSWORD: "" })
    );
    expect(response.status).toBe(403);
    expect(await response.text()).toBe("WebDAV protocol is not enabled");
  });

  test("WEBDAV_PUBLIC_READ=1 lets GET through but not PUT", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "x" }]);
    const env = makeEnv(bucket, { WEBDAV_PUBLIC_READ: "1" });
    const read = await call(req("/webdav/a.txt", "GET"), env);
    expect(read.status).toBe(200);
    const write = await call(req("/webdav/b.txt", "PUT", undefined, "y"), env);
    expect(write.status).toBe(401);
  });

  test("unknown method is 405 with Allow header", async () => {
    const bucket = new InMemoryBucket();
    const response = await call(
      req("/webdav/a.txt", "TRACE", { Authorization: AUTH }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toContain("PROPFIND");
    expect(response.headers.get("DAV")).toBe("1, 2");
  });
});

describe("webdav PROPFIND", () => {
  test("root collection with Depth 1 lists immediate children only", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("docs");
    bucket.seed([{ key: "docs/a.txt", body: "A", contentType: "text/plain" }, { key: "root.txt", body: "R" }]);
    const response = await call(
      req("/webdav/", "PROPFIND", { Authorization: AUTH, Depth: "1" }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(207);
    expect(response.headers.get("Content-Type")).toContain("application/xml");
    const xml = await response.text();
    expect(xml).toContain("<href>/webdav/</href>");
    expect(xml).toContain("<href>/webdav/docs/</href>");
    expect(xml).toContain("<href>/webdav/root.txt</href>");
    // Depth 1 只列直接子项：孙辈文件被 delimiter 语义折叠
    expect(xml).not.toContain("docs/a.txt");
  });

  test("Depth 1 on a subdirectory lists its files with metadata", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "docs/a.txt", body: "A", contentType: "text/plain" }]);
    const response = await call(
      req("/webdav/docs/", "PROPFIND", { Authorization: AUTH, Depth: "1" }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(207);
    const xml = await response.text();
    expect(xml).toContain("<href>/webdav/docs/</href>");
    expect(xml).toContain("<href>/webdav/docs/a.txt</href>");
    expect(xml).toContain("<getcontentlength>1</getcontentlength>");
    expect(xml).toContain("<getcontenttype>text/plain</getcontenttype>");
  });

  test("Depth infinity on root also lists grandchildren", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("docs");
    bucket.seed([{ key: "docs/a.txt", body: "A" }]);
    const response = await call(
      req("/webdav/", "PROPFIND", { Authorization: AUTH, Depth: "infinity" }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(207);
    const xml = await response.text();
    expect(xml).toContain("<href>/webdav/docs/a.txt</href>");
  });

  test("Depth 0 on a file returns only itself", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "A" }]);
    const response = await call(
      req("/webdav/a.txt", "PROPFIND", { Authorization: AUTH, Depth: "0" }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(207);
    const xml = await response.text();
    expect(xml).toContain("<href>/webdav/a.txt</href>");
    expect(xml).not.toContain("<response>\n    <href>/webdav/a.txt/</href>");
  });

  test("missing resource is 404", async () => {
    const bucket = new InMemoryBucket();
    const response = await call(
      req("/webdav/ghost.txt", "PROPFIND", { Authorization: AUTH }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(404);
  });

  test("virtual directory (prefix without marker) still propfinds", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "vdir/inner.txt", body: "i" }]);
    const response = await call(
      req("/webdav/vdir/", "PROPFIND", { Authorization: AUTH, Depth: "1" }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(207);
    const xml = await response.text();
    expect(xml).toContain("<href>/webdav/vdir/</href>");
    expect(xml).toContain("<href>/webdav/vdir/inner.txt</href>");
  });

  test("invalid Depth header is 400", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("docs");
    const response = await call(
      req("/webdav/docs/", "PROPFIND", { Authorization: AUTH, Depth: "2" }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(400);
  });

  test("malformed XML body is 400", async () => {
    const bucket = new InMemoryBucket();
    const response = await call(
      req("/webdav/", "PROPFIND", { Authorization: AUTH }, "<propfind><broken"),
      makeEnv(bucket)
    );
    expect(response.status).toBe(400);
  });

  test("prop mode returns 404 propstat for missing property", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "A" }]);
    const response = await call(
      req(
        "/webdav/a.txt",
        "PROPFIND",
        { Authorization: AUTH, "Content-Type": "application/xml" },
        '<?xml version="1.0"?><propfind xmlns="DAV:"><prop><getcontentlength/><quota-used/></prop></propfind>'
      ),
      makeEnv(bucket)
    );
    expect(response.status).toBe(207);
    const xml = await response.text();
    expect(xml).toContain("HTTP/1.1 200 OK");
    expect(xml).toContain("HTTP/1.1 404 Not Found");
    expect(xml).toContain("<getcontentlength>1</getcontentlength>");
  });

  test("internal prefix is 404 even with auth", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "_$flaredrive$/trash/x.json", body: "{}" }]);
    const response = await call(
      req("/webdav/_$flaredrive$/trash/x.json", "PROPFIND", { Authorization: AUTH }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(404);
  });
});

describe("webdav MKCOL", () => {
  test("creates a collection with 201 + Location", async () => {
    const bucket = new InMemoryBucket();
    const response = await call(
      req("/webdav/newdir", "MKCOL", { Authorization: AUTH }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("Location")).toBe("/webdav/newdir/");
    expect(bucket.rawText("newdir")).toBe("");
    expect(bucket.rawJson("newdir")).toBeUndefined();
    const head = await bucket.asBucket().head("newdir");
    expect(head?.httpMetadata?.contentType).toBe("application/x-directory");
  });

  test("existing resource is 405", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "taken.txt", body: "x" }]);
    const response = await call(
      req("/webdav/taken.txt", "MKCOL", { Authorization: AUTH }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(405);
  });

  test("request body is 415", async () => {
    const bucket = new InMemoryBucket();
    const response = await call(
      req("/webdav/d", "MKCOL", { Authorization: AUTH }, "unexpected"),
      makeEnv(bucket)
    );
    expect(response.status).toBe(415);
  });

  test("missing parent collection is 409", async () => {
    const bucket = new InMemoryBucket();
    const response = await call(
      req("/webdav/ghost/child", "MKCOL", { Authorization: AUTH }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(409);
  });
});

describe("webdav GET / HEAD", () => {
  test("GET returns content with metadata headers", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      { key: "a.txt", body: "Hello World", contentType: "text/plain" },
    ]);
    const response = await call(
      req("/webdav/a.txt", "GET", { Authorization: AUTH }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain");
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(response.headers.get("ETag")).toMatch(/^"/);
    expect(await response.text()).toBe("Hello World");
  });

  test("GET missing file is 404", async () => {
    const bucket = new InMemoryBucket();
    const response = await call(
      req("/webdav/ghost.txt", "GET", { Authorization: AUTH }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(404);
  });

  test("GET collection without trailing slash redirects 301", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("docs");
    const response = await call(
      req("/webdav/docs", "GET", { Authorization: AUTH }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe(`${HOST}/webdav/docs/`);
  });

  test("GET directory listing with trailing slash returns HTML", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("docs");
    bucket.seed([{ key: "docs/a.txt", body: "A" }]);
    const response = await call(
      req("/webdav/docs/", "GET", { Authorization: AUTH }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("FlareDrive");
    expect(html).toContain('href="/webdav/docs/a.txt"');
    expect(html).toContain('href="/webdav/"');
  });

  test("If-None-Match hit returns 304 with ETag", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "A" }]);
    const first = await call(
      req("/webdav/a.txt", "GET", { Authorization: AUTH }),
      makeEnv(bucket)
    );
    const etag = first.headers.get("ETag") ?? "";
    expect(etag).not.toBe("");
    const second = await call(
      req("/webdav/a.txt", "GET", { Authorization: AUTH, "If-None-Match": etag }),
      makeEnv(bucket)
    );
    expect(second.status).toBe(304);
    expect(second.headers.get("ETag")).toBe(etag);
    expect(await second.text()).toBe("");
  });

  test("If-None-Match list with weak prefix and star matches", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "A" }]);
    const head = await bucket.asBucket().head("a.txt");
    const etag = head!.etag;
    for (const header of [
      `W/"${etag}", "other"`,
      "*",
      `"nope", "${etag}"`,
    ]) {
      const response = await call(
        req("/webdav/a.txt", "GET", { Authorization: AUTH, "If-None-Match": header }),
        makeEnv(bucket)
      );
      expect(response.status).toBe(304);
    }
  });

  test("If-None-Match miss returns full 200", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "A" }]);
    const response = await call(
      req("/webdav/a.txt", "GET", {
        Authorization: AUTH,
        "If-None-Match": '"different"',
      }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("A");
  });

  test("Range bytes=0-4 returns 206 with Content-Range", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "Hello World" }]);
    const response = await call(
      req("/webdav/a.txt", "GET", {
        Authorization: AUTH,
        Range: "bytes=0-4",
      }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 0-4/11");
    expect(response.headers.get("Content-Length")).toBe("5");
    expect(await response.text()).toBe("Hello");
  });

  test("Range open-ended and suffix forms", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "Hello World" }]);
    const openEnded = await call(
      req("/webdav/a.txt", "GET", { Authorization: AUTH, Range: "bytes=6-" }),
      makeEnv(bucket)
    );
    expect(openEnded.status).toBe(206);
    expect(await openEnded.text()).toBe("World");
    const suffix = await call(
      req("/webdav/a.txt", "GET", { Authorization: AUTH, Range: "bytes=-3" }),
      makeEnv(bucket)
    );
    expect(suffix.status).toBe(206);
    expect(suffix.headers.get("Content-Range")).toBe("bytes 8-10/11");
    expect(await suffix.text()).toBe("rld");
  });

  test("invalid and unsatisfiable Range fall back to full 200", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "Hello World" }]);
    for (const range of ["bytes=abc", "bytes=0-1,3-4", "bytes=999-", "bytes=-0"]) {
      const response = await call(
        req("/webdav/a.txt", "GET", { Authorization: AUTH, Range: range }),
        makeEnv(bucket)
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("Hello World");
    }
  });

  test("failing If-Match on GET is 412", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "A" }]);
    const response = await call(
      req("/webdav/a.txt", "GET", {
        Authorization: AUTH,
        "If-Match": '"stale-etag"',
      }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(412);
  });

  test("HEAD mirrors GET status and headers with empty body", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      { key: "a.txt", body: "Hello", contentType: "text/plain" },
    ]);
    const response = await call(
      req("/webdav/a.txt", "HEAD", { Authorization: AUTH }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain");
    expect(response.headers.get("Content-Length")).toBe("5");
    expect(await response.text()).toBe("");
  });

  test("thumbnail GET skips auth and pins cache lifetime", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      {
        key: "_$flaredrive$/thumbnails/abc",
        body: "png-bytes",
        contentType: "image/png",
      },
    ]);
    const response = await call(
      req("/webdav/_$flaredrive$/thumbnails/abc", "GET"),
      makeEnv(bucket)
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("max-age=31536000");
    expect(await response.text()).toBe("png-bytes");
  });

  test("non-thumbnail internal prefix GET is 404", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "_$flaredrive$/trash/x.json", body: "{}" }]);
    const response = await call(
      req("/webdav/_$flaredrive$/trash/x.json", "GET", { Authorization: AUTH }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(404);
  });
});

describe("webdav PUT", () => {
  test("create new file is 201 with Location", async () => {
    const bucket = new InMemoryBucket();
    const response = await call(
      req("/webdav/new.txt", "PUT", { Authorization: AUTH }, "hi"),
      makeEnv(bucket)
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("Location")).toBe("/webdav/new.txt");
    expect(bucket.rawText("new.txt")).toBe("hi");
  });

  test("overwrite existing file is 204 and preserves custom metadata", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "old", customMetadata: { thumbnail: "t" } }]);
    const response = await call(
      req(
        "/webdav/a.txt",
        "PUT",
        { Authorization: AUTH, "Content-Type": "text/plain", "fd-thumbnail": "new-t" },
        "new"
      ),
      makeEnv(bucket)
    );
    expect(response.status).toBe(204);
    expect(bucket.rawText("a.txt")).toBe("new");
    const head = await bucket.asBucket().head("a.txt");
    expect(head?.customMetadata?.thumbnail).toBe("new-t");
    expect(head?.httpMetadata?.contentType).toBe("text/plain");
  });

  test("If-Match mismatch is 412, match succeeds", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "old" }]);
    const stale = await call(
      req("/webdav/a.txt", "PUT", {
        Authorization: AUTH,
        "If-Match": '"stale-etag"',
      }, "new"),
      makeEnv(bucket)
    );
    expect(stale.status).toBe(412);
    expect(bucket.rawText("a.txt")).toBe("old");

    const head = await bucket.asBucket().head("a.txt");
    const fresh = await call(
      req("/webdav/a.txt", "PUT", {
        Authorization: AUTH,
        "If-Match": `"${head!.etag}"`,
      }, "new"),
      makeEnv(bucket)
    );
    expect(fresh.status).toBe(204);
    expect(bucket.rawText("a.txt")).toBe("new");
  });

  test("If-None-Match * on existing is 412, on new is 201", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "old" }]);
    const existing = await call(
      req("/webdav/a.txt", "PUT", {
        Authorization: AUTH,
        "If-None-Match": "*",
      }, "new"),
      makeEnv(bucket)
    );
    expect(existing.status).toBe(412);
    expect(bucket.rawText("a.txt")).toBe("old");

    const fresh = await call(
      req("/webdav/b.txt", "PUT", {
        Authorization: AUTH,
        "If-None-Match": "*",
      }, "new"),
      makeEnv(bucket)
    );
    expect(fresh.status).toBe(201);
    expect(bucket.rawText("b.txt")).toBe("new");
  });

  test("PUT to a collection is 405", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("docs");
    const response = await call(
      req("/webdav/docs", "PUT", { Authorization: AUTH }, "x"),
      makeEnv(bucket)
    );
    expect(response.status).toBe(405);
  });

  test("PUT with missing parent is 409", async () => {
    const bucket = new InMemoryBucket();
    const response = await call(
      req("/webdav/ghost/child.txt", "PUT", { Authorization: AUTH }, "x"),
      makeEnv(bucket)
    );
    expect(response.status).toBe(409);
  });

  test("PUT into internal prefix (non-thumbnail) is 404", async () => {
    const bucket = new InMemoryBucket();
    const response = await call(
      req("/webdav/_$flaredrive$/trash/evil.json", "PUT", { Authorization: AUTH }, "{}"),
      makeEnv(bucket)
    );
    expect(response.status).toBe(404);
    expect(bucket.has("_$flaredrive$/trash/evil.json")).toBe(false);
  });

  test("PUT thumbnail prefix is allowed", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "_$flaredrive$/thumbnails/seed", body: "s" }]);
    const response = await call(
      req("/webdav/_$flaredrive$/thumbnails/abc", "PUT", { Authorization: AUTH }, "png"),
      makeEnv(bucket)
    );
    expect(response.status).toBe(201);
    expect(bucket.rawText("_$flaredrive$/thumbnails/abc")).toBe("png");
  });

  test("Content-Length over the single-request cap is 413", async () => {
    const bucket = new InMemoryBucket();
    const response = await call(
      req("/webdav/big.bin", "PUT", {
        Authorization: AUTH,
        "Content-Length": String(100 * 1024 * 1024),
      }, "x"),
      makeEnv(bucket)
    );
    expect(response.status).toBe(413);
  });
});

describe("webdav DELETE", () => {
  test("deletes a file", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "A" }]);
    const response = await call(
      req("/webdav/a.txt", "DELETE", { Authorization: AUTH }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(204);
    expect(bucket.has("a.txt")).toBe(false);
  });

  test("deletes a directory tree including marker", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("docs");
    bucket.seed([{ key: "docs/a.txt", body: "A" }, { key: "docs/sub/b.txt", body: "B" }]);
    const response = await call(
      req("/webdav/docs", "DELETE", { Authorization: AUTH }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(204);
    expect(bucket.has("docs")).toBe(false);
    expect(bucket.has("docs/a.txt")).toBe(false);
    expect(bucket.has("docs/sub/b.txt")).toBe(false);
  });

  test("missing resource is 404", async () => {
    const bucket = new InMemoryBucket();
    const response = await call(
      req("/webdav/ghost.txt", "DELETE", { Authorization: AUTH }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(404);
  });

  test("internal prefix is protected", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "_$flaredrive$/trash/x.json", body: "{}" }]);
    const response = await call(
      req("/webdav/_$flaredrive$/trash/x.json", "DELETE", { Authorization: AUTH }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(404);
    expect(bucket.has("_$flaredrive$/trash/x.json")).toBe(true);
  });

  test("locked descendant blocks DELETE with 423 unless token provided", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("docs");
    const token = await seedLockedFile(bucket, "docs/locked.txt");
    const withoutToken = await call(
      req("/webdav/docs", "DELETE", { Authorization: AUTH }),
      makeEnv(bucket)
    );
    expect(withoutToken.status).toBe(423);
    expect(bucket.has("docs/locked.txt")).toBe(true);

    const withToken = await call(
      req("/webdav/docs", "DELETE", {
        Authorization: AUTH,
        If: `<urn:uuid:${token}>`,
      }),
      makeEnv(bucket)
    );
    expect(withToken.status).toBe(204);
    expect(bucket.has("docs/locked.txt")).toBe(false);
  });
});

describe("webdav MOVE", () => {
  test("moves a file to a new key", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "A" }]);
    const response = await call(
      req("/webdav/a.txt", "MOVE", {
        Authorization: AUTH,
        Destination: `${HOST}/webdav/b.txt`,
      }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("Location")).toBe("/webdav/b.txt");
    expect(bucket.has("a.txt")).toBe(false);
    expect(bucket.rawText("b.txt")).toBe("A");
  });

  test("moves a directory with descendants", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("docs");
    bucket.seed([{ key: "docs/a.txt", body: "A" }, { key: "docs/sub/b.txt", body: "B" }]);
    const response = await call(
      req("/webdav/docs", "MOVE", {
        Authorization: AUTH,
        Destination: `${HOST}/webdav/archive`,
      }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(201);
    expect(bucket.has("docs")).toBe(false);
    expect(bucket.has("docs/a.txt")).toBe(false);
    expect(bucket.rawText("archive/a.txt")).toBe("A");
    expect(bucket.rawText("archive/sub/b.txt")).toBe("B");
    const marker = await bucket.asBucket().head("archive");
    expect(marker?.httpMetadata?.contentType).toBe("application/x-directory");
  });

  test("overwrite default replaces existing destination with 204", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "A" }, { key: "b.txt", body: "B" }]);
    const response = await call(
      req("/webdav/a.txt", "MOVE", {
        Authorization: AUTH,
        Destination: `${HOST}/webdav/b.txt`,
      }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(204);
    expect(bucket.rawText("b.txt")).toBe("A");
    expect(bucket.has("a.txt")).toBe(false);
  });

  test("Overwrite F with existing destination is 412", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "A" }, { key: "b.txt", body: "B" }]);
    const response = await call(
      req("/webdav/a.txt", "MOVE", {
        Authorization: AUTH,
        Destination: `${HOST}/webdav/b.txt`,
        Overwrite: "F",
      }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(412);
    expect(bucket.rawText("b.txt")).toBe("B");
    expect(bucket.rawText("a.txt")).toBe("A");
  });

  test("missing source is 404", async () => {
    const bucket = new InMemoryBucket();
    const response = await call(
      req("/webdav/ghost.txt", "MOVE", {
        Authorization: AUTH,
        Destination: `${HOST}/webdav/b.txt`,
      }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(404);
  });

  test("destination below source is 400", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("docs");
    const response = await call(
      req("/webdav/docs", "MOVE", {
        Authorization: AUTH,
        Destination: `${HOST}/webdav/docs/inner`,
      }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(400);
  });

  test("destination inside internal prefix is 404", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "A" }]);
    const response = await call(
      req("/webdav/a.txt", "MOVE", {
        Authorization: AUTH,
        Destination: `${HOST}/webdav/_$flaredrive$/trash/evil.json`,
      }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(404);
  });

  test("missing Destination header is 400", async () => {
    const bucket = new InMemoryBucket();
    const response = await call(
      req("/webdav/a.txt", "MOVE", { Authorization: AUTH }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(400);
  });

  test("destination parent missing is 409", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "A" }]);
    const response = await call(
      req("/webdav/a.txt", "MOVE", {
        Authorization: AUTH,
        Destination: `${HOST}/webdav/ghost/b.txt`,
      }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(409);
  });

  test("locked source requires token", async () => {
    const bucket = new InMemoryBucket();
    const token = await seedLockedFile(bucket, "locked.txt");
    const withoutToken = await call(
      req("/webdav/locked.txt", "MOVE", {
        Authorization: AUTH,
        Destination: `${HOST}/webdav/moved.txt`,
      }),
      makeEnv(bucket)
    );
    expect(withoutToken.status).toBe(423);
    const withToken = await call(
      req("/webdav/locked.txt", "MOVE", {
        Authorization: AUTH,
        Destination: `${HOST}/webdav/moved.txt`,
        If: `<urn:uuid:${token}>`,
      }),
      makeEnv(bucket)
    );
    expect(withToken.status).toBe(201);
    expect(bucket.rawText("moved.txt")).toBe("locked");
  });
});

describe("webdav COPY", () => {
  test("copies a file, keeping the source", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "A" }]);
    const response = await call(
      req("/webdav/a.txt", "COPY", {
        Authorization: AUTH,
        Destination: `${HOST}/webdav/copy.txt`,
      }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(201);
    expect(bucket.rawText("a.txt")).toBe("A");
    expect(bucket.rawText("copy.txt")).toBe("A");
  });

  test("copies a directory recursively (Depth infinity default)", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("docs");
    bucket.seed([{ key: "docs/a.txt", body: "A" }, { key: "docs/sub/b.txt", body: "B" }]);
    const response = await call(
      req("/webdav/docs", "COPY", {
        Authorization: AUTH,
        Destination: `${HOST}/webdav/docs-copy`,
      }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(201);
    expect(bucket.rawText("docs/a.txt")).toBe("A");
    expect(bucket.rawText("docs-copy/a.txt")).toBe("A");
    expect(bucket.rawText("docs-copy/sub/b.txt")).toBe("B");
  });

  test("Overwrite F with existing destination is 412", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "A" }, { key: "b.txt", body: "B" }]);
    const response = await call(
      req("/webdav/a.txt", "COPY", {
        Authorization: AUTH,
        Destination: `${HOST}/webdav/b.txt`,
        Overwrite: "F",
      }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(412);
    expect(bucket.rawText("b.txt")).toBe("B");
  });

  test("default overwrite replaces destination with 204", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "A" }, { key: "b.txt", body: "B" }]);
    const response = await call(
      req("/webdav/a.txt", "COPY", {
        Authorization: AUTH,
        Destination: `${HOST}/webdav/b.txt`,
      }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(204);
    expect(bucket.rawText("b.txt")).toBe("A");
    expect(bucket.rawText("a.txt")).toBe("A");
  });

  test("missing source is 404", async () => {
    const bucket = new InMemoryBucket();
    const response = await call(
      req("/webdav/ghost.txt", "COPY", {
        Authorization: AUTH,
        Destination: `${HOST}/webdav/b.txt`,
      }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(404);
  });

  test("destination inside internal prefix is 404", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "A" }]);
    const response = await call(
      req("/webdav/a.txt", "COPY", {
        Authorization: AUTH,
        Destination: `${HOST}/webdav/_$flaredrive$/shares/evil.json`,
      }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(404);
  });

  test("cross-origin Destination is 400", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "A" }]);
    const response = await call(
      req("/webdav/a.txt", "COPY", {
        Authorization: AUTH,
        Destination: "http://other.example.com/webdav/b.txt",
      }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(400);
  });
});

describe("webdav LOCK / UNLOCK", () => {
  test("new exclusive lock returns 201 with Lock-Token and lockdiscovery", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "A" }]);
    const response = await call(
      req("/webdav/a.txt", "LOCK", {
        Authorization: AUTH,
        "Content-Type": "application/xml",
        Timeout: "Second-120",
      }, LOCK_BODY),
      makeEnv(bucket)
    );
    expect(response.status).toBe(201);
    const tokenHeader = response.headers.get("Lock-Token") ?? "";
    expect(tokenHeader).toMatch(/^<urn:uuid:[0-9a-f-]+>$/);
    const xml = await response.text();
    expect(xml).toContain("<locktoken><href>urn:uuid:");
    expect(xml).toContain("<owner>tester</owner>");
    expect(xml).toContain("Second-120");
    // 内容不变，锁写进 customMetadata
    expect(bucket.rawText("a.txt")).toBe("A");
  });

  test("second exclusive lock without token is 423", async () => {
    const bucket = new InMemoryBucket();
    await seedLockedFile(bucket, "locked.txt");
    const response = await call(
      req("/webdav/locked.txt", "LOCK", {
        Authorization: AUTH,
        "Content-Type": "application/xml",
      }, LOCK_BODY),
      makeEnv(bucket)
    );
    expect(response.status).toBe(423);
  });

  test("shared lock while exclusive held is 423 and vice versa", async () => {
    const bucket = new InMemoryBucket();
    await seedLockedFile(bucket, "locked.txt");
    const shared = await call(
      req("/webdav/locked.txt", "LOCK", {
        Authorization: AUTH,
        "Content-Type": "application/xml",
      }, SHARED_LOCK_BODY),
      makeEnv(bucket)
    );
    expect(shared.status).toBe(423);

    const bucket2 = new InMemoryBucket();
    bucket2.seed([{ key: "s.txt", body: "S" }]);
    await call(
      req("/webdav/s.txt", "LOCK", {
        Authorization: AUTH,
        "Content-Type": "application/xml",
      }, SHARED_LOCK_BODY),
      makeEnv(bucket2)
    );
    const exclusive = await call(
      req("/webdav/s.txt", "LOCK", {
        Authorization: AUTH,
        "Content-Type": "application/xml",
      }, LOCK_BODY),
      makeEnv(bucket2)
    );
    expect(exclusive.status).toBe(423);
  });

  test("LOCK refresh with If token returns 200 and keeps the token", async () => {
    const bucket = new InMemoryBucket();
    const token = await seedLockedFile(bucket, "locked.txt");
    const response = await call(
      req("/webdav/locked.txt", "LOCK", {
        Authorization: AUTH,
        If: `<urn:uuid:${token}>`,
        Timeout: "Second-60",
      }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Lock-Token")).toBe(`<urn:uuid:${token}>`);
    const xml = await response.text();
    expect(xml).toContain(`urn:uuid:${token}`);
    expect(xml).toContain("Second-60");
  });

  test("LOCK on missing resource creates a lockable empty file", async () => {
    const bucket = new InMemoryBucket();
    const response = await call(
      req("/webdav/virgin.txt", "LOCK", {
        Authorization: AUTH,
        "Content-Type": "application/xml",
      }, LOCK_BODY),
      makeEnv(bucket)
    );
    expect(response.status).toBe(201);
    expect(bucket.has("virgin.txt")).toBe(true);
    expect(response.headers.get("Location")).toBe("/webdav/virgin.txt");
  });

  test("LOCK without existing parent is 409", async () => {
    const bucket = new InMemoryBucket();
    const response = await call(
      req("/webdav/ghost/child.txt", "LOCK", {
        Authorization: AUTH,
        "Content-Type": "application/xml",
      }, LOCK_BODY),
      makeEnv(bucket)
    );
    expect(response.status).toBe(409);
  });

  test("LOCK body without locktype is 400 and invalid Depth is 400", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "A" }]);
    const badBody = await call(
      req("/webdav/a.txt", "LOCK", {
        Authorization: AUTH,
        "Content-Type": "application/xml",
      }, '<?xml version="1.0"?><D:lockinfo xmlns:D="DAV:"><D:lockscope><D:exclusive/></D:lockscope></D:lockinfo>'),
      makeEnv(bucket)
    );
    expect(badBody.status).toBe(400);
    const badDepth = await call(
      req("/webdav/a.txt", "LOCK", {
        Authorization: AUTH,
        Depth: "1",
        "Content-Type": "application/xml",
      }, LOCK_BODY),
      makeEnv(bucket)
    );
    expect(badDepth.status).toBe(400);
  });

  test("If: <DAV:no-lock> precondition is 412", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "a.txt", body: "A" }]);
    const response = await call(
      req("/webdav/a.txt", "LOCK", {
        Authorization: AUTH,
        If: "<DAV:no-lock>",
      }, LOCK_BODY),
      makeEnv(bucket)
    );
    expect(response.status).toBe(412);
  });

  test("depth-infinity lock on a directory blocks child PUT without token", async () => {
    const bucket = new InMemoryBucket();
    bucket.seedDir("docs");
    const lockResponse = await call(
      req("/webdav/docs", "LOCK", {
        Authorization: AUTH,
        Depth: "infinity",
        "Content-Type": "application/xml",
      }, LOCK_BODY),
      makeEnv(bucket)
    );
    expect(lockResponse.status).toBe(201);
    const token = (lockResponse.headers.get("Lock-Token") ?? "")
      .replace(/^<urn:uuid:/, "")
      .replace(/>$/, "");
    const blocked = await call(
      req("/webdav/docs/child.txt", "PUT", { Authorization: AUTH }, "x"),
      makeEnv(bucket)
    );
    expect(blocked.status).toBe(423);
    const allowed = await call(
      req("/webdav/docs/child.txt", "PUT", {
        Authorization: AUTH,
        If: `<urn:uuid:${token}>`,
      }, "x"),
      makeEnv(bucket)
    );
    expect(allowed.status).toBe(201);
    expect(bucket.rawText("docs/child.txt")).toBe("x");
  });

  test("UNLOCK with the right token returns 204 and frees the resource", async () => {
    const bucket = new InMemoryBucket();
    const token = await seedLockedFile(bucket, "locked.txt");
    const response = await call(
      req("/webdav/locked.txt", "UNLOCK", {
        Authorization: AUTH,
        "Lock-Token": `<urn:uuid:${token}>`,
      }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(204);
    // 释放后可以再次加独占锁
    const again = await call(
      req("/webdav/locked.txt", "LOCK", {
        Authorization: AUTH,
        "Content-Type": "application/xml",
      }, LOCK_BODY),
      makeEnv(bucket)
    );
    expect(again.status).toBe(201);
  });

  test("UNLOCK mismatches: wrong token 409 (with valid If), wrong token alone 423", async () => {
    const bucket = new InMemoryBucket();
    const token = await seedLockedFile(bucket, "locked.txt");
    // Lock-Token 携带错误 token 且 If 携带有效 token：锁校验通过但
    // Lock-Token 解析出的 token 不在锁记录里 → 409 Conflict
    const wrongWithValidIf = await call(
      req("/webdav/locked.txt", "UNLOCK", {
        Authorization: AUTH,
        "Lock-Token": "<urn:uuid:not-the-token>",
        If: `<urn:uuid:${token}>`,
      }),
      makeEnv(bucket)
    );
    expect(wrongWithValidIf.status).toBe(409);
    // 只带错误 token：锁权限校验先失败 → 423 Locked
    const wrongOnly = await call(
      req("/webdav/locked.txt", "UNLOCK", {
        Authorization: AUTH,
        "Lock-Token": "<urn:uuid:not-the-token>",
      }),
      makeEnv(bucket)
    );
    expect(wrongOnly.status).toBe(423);
  });

  test("UNLOCK without header is 400 and on unlocked/missing resource is 409/404", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "plain.txt", body: "P" }]);
    const missingHeader = await call(
      req("/webdav/plain.txt", "UNLOCK", { Authorization: AUTH }),
      makeEnv(bucket)
    );
    expect(missingHeader.status).toBe(400);
    const unlocked = await call(
      req("/webdav/plain.txt", "UNLOCK", {
        Authorization: AUTH,
        "Lock-Token": "<urn:uuid:whatever>",
      }),
      makeEnv(bucket)
    );
    expect(unlocked.status).toBe(409);
    const absent = await call(
      req("/webdav/ghost.txt", "UNLOCK", {
        Authorization: AUTH,
        "Lock-Token": "<urn:uuid:whatever>",
      }),
      makeEnv(bucket)
    );
    expect(absent.status).toBe(404);
  });
});

describe("webdav POST multipart (uploads/complete)", () => {
  test("POST ?uploads creates a multipart upload", async () => {
    const bucket = new InMemoryBucket();
    const response = await call(
      req("/webdav/big.bin?uploads", "POST", { Authorization: AUTH }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(200);
    const body = JSON.parse(await response.text());
    expect(body.key).toBe("big.bin");
    expect(typeof body.uploadId).toBe("string");
  });

  test("three-step multipart upload assembles the object", async () => {
    const bucket = new InMemoryBucket();
    const create = await call(
      req("/webdav/big.bin?uploads", "POST", { Authorization: AUTH }),
      makeEnv(bucket)
    );
    const { uploadId } = JSON.parse(await create.text());

    const part1 = await call(
      withRawBody(
        req(`/webdav/big.bin?uploadId=${uploadId}&partNumber=1`, "PUT", { Authorization: AUTH }),
        new TextEncoder().encode("hello-")
      ),
      makeEnv(bucket)
    );
    expect(part1.status).toBe(200);
    const etag1 = part1.headers.get("etag") ?? "";
    expect(etag1).not.toBe("");

    const part2 = await call(
      withRawBody(
        req(`/webdav/big.bin?uploadId=${uploadId}&partNumber=2`, "PUT", { Authorization: AUTH }),
        new TextEncoder().encode("world")
      ),
      makeEnv(bucket)
    );
    expect(part2.status).toBe(200);
    const etag2 = part2.headers.get("etag") ?? "";

    const complete = await call(
      req(
        `/webdav/big.bin?uploadId=${uploadId}`,
        "POST",
        { Authorization: AUTH, "Content-Type": "application/json" },
        JSON.stringify({
          parts: [
            { partNumber: 1, etag: etag1 },
            { partNumber: 2, etag: etag2 },
          ],
        })
      ),
      makeEnv(bucket)
    );
    expect(complete.status).toBe(200);
    expect(complete.headers.get("etag")).toMatch(/^"/);
    expect(bucket.rawText("big.bin")).toBe("hello-world");
  });

  test("complete with fabricated part etag is 400", async () => {
    const bucket = new InMemoryBucket();
    const create = await call(
      req("/webdav/big.bin?uploads", "POST", { Authorization: AUTH }),
      makeEnv(bucket)
    );
    const { uploadId } = JSON.parse(await create.text());
    const response = await call(
      req(
        `/webdav/big.bin?uploadId=${uploadId}`,
        "POST",
        { Authorization: AUTH, "Content-Type": "application/json" },
        JSON.stringify({ parts: [{ partNumber: 1, etag: "fabricated" }] })
      ),
      makeEnv(bucket)
    );
    expect(response.status).toBe(400);
    expect(bucket.has("big.bin")).toBe(false);
  });

  test("multipart PUT validates partNumber and uploadId", async () => {
    const bucket = new InMemoryBucket();
    const badPart = await call(
      withRawBody(
        req("/webdav/a.bin?uploadId=abc&partNumber=0", "PUT", { Authorization: AUTH }),
        new TextEncoder().encode("x")
      ),
      makeEnv(bucket)
    );
    expect(badPart.status).toBe(400);
    const nanPart = await call(
      withRawBody(
        req("/webdav/a.bin?uploadId=abc&partNumber=xyz", "PUT", { Authorization: AUTH }),
        new TextEncoder().encode("x")
      ),
      makeEnv(bucket)
    );
    expect(nanPart.status).toBe(400);
    const noBody = await call(
      req("/webdav/a.bin?uploadId=abc&partNumber=1", "PUT", { Authorization: AUTH }),
      makeEnv(bucket)
    );
    expect(noBody.status).toBe(400);
  });

  test("POST complete with unknown uploadId / bad body is 400", async () => {
    const bucket = new InMemoryBucket();
    const unknownId = await call(
      req(
        "/webdav/big.bin?uploadId=missing",
        "POST",
        { Authorization: AUTH, "Content-Type": "application/json" },
        JSON.stringify({ parts: [{ partNumber: 1, etag: "e" }] })
      ),
      makeEnv(bucket)
    );
    expect(unknownId.status).toBe(400);
    const noUploadId = await call(
      req(
        "/webdav/big.bin",
        "POST",
        { Authorization: AUTH, "Content-Type": "application/json" },
        JSON.stringify({ parts: [] })
      ),
      makeEnv(bucket)
    );
    expect(noUploadId.status).toBe(405);
    const badJson = await call(
      req(
        "/webdav/big.bin?uploadId=missing",
        "POST",
        { Authorization: AUTH, "Content-Type": "application/json" },
        "{not json"
      ),
      makeEnv(bucket)
    );
    expect(badJson.status).toBe(400);
    const badParts = await call(
      req(
        "/webdav/big.bin?uploadId=missing",
        "POST",
        { Authorization: AUTH, "Content-Type": "application/json" },
        JSON.stringify({ parts: "nope" })
      ),
      makeEnv(bucket)
    );
    expect(badParts.status).toBe(400);
  });

  test("POST without uploads/uploadId params is 405", async () => {
    const bucket = new InMemoryBucket();
    const response = await call(
      req("/webdav/a.txt", "POST", { Authorization: AUTH }),
      makeEnv(bucket)
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toContain("PUT");
  });
});
