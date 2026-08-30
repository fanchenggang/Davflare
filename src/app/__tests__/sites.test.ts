import {
  indexFallbackKey,
  isSitesHost,
  mimeForKey,
  parseSitesPath,
} from "../../../functions/_sites";

describe("static sites host routing", () => {
  test("feature off when SITES_HOST empty", () => {
    expect(isSitesHost("sites.example.com", "")).toBe(false);
    expect(isSitesHost("sites.example.com", undefined)).toBe(false);
  });

  test("only the bound sites host matches", () => {
    expect(isSitesHost("sites.example.com", "sites.example.com")).toBe(true);
    expect(isSitesHost("SITES.EXAMPLE.COM:443", "sites.example.com")).toBe(true);
    expect(isSitesHost("flaredrive-bgb.pages.dev", "sites.example.com")).toBe(false);
    expect(isSitesHost("example.com", "sites.example.com")).toBe(false);
  });

  test("parse slug and index.html", () => {
    expect(parseSitesPath("/blog")).toEqual({
      ok: true,
      slug: "blog",
      key: "sites/blog/index.html",
      tryIndex: false,
    });
    expect(parseSitesPath("/blog/")).toEqual({
      ok: true,
      slug: "blog",
      key: "sites/blog/index.html",
      tryIndex: false,
    });
    expect(parseSitesPath("/blog/style.css")).toEqual({
      ok: true,
      slug: "blog",
      key: "sites/blog/style.css",
      tryIndex: false,
    });
    expect(parseSitesPath("/blog/about")).toEqual({
      ok: true,
      slug: "blog",
      key: "sites/blog/about",
      tryIndex: true,
    });
    expect(indexFallbackKey("sites/blog/about")).toBe("sites/blog/about/index.html");
  });

  test("reject traversal and empty slug", () => {
    expect(parseSitesPath("/").ok).toBe(false);
    expect(parseSitesPath("/../etc/passwd").ok).toBe(false);
    expect(parseSitesPath("/bad_slug").ok).toBe(false);
    expect(parseSitesPath("/_$flaredrive$/x").ok).toBe(false);
  });

  test("dots inside filenames allowed; encoded traversal still rejected", () => {
    expect(parseSitesPath("/blog/a..b.html").ok).toBe(true);
    expect(parseSitesPath("/blog/%2e%2e/secret").ok).toBe(false);
    expect(parseSitesPath("/blog/a%2Fb").ok).toBe(false);
    expect(parseSitesPath("/blog/_%24flaredrive%24/x").ok).toBe(false);
  });

  test("encoded filenames decode to object keys", () => {
    expect(parseSitesPath("/blog/hello%20world.html")).toEqual({
      ok: true,
      slug: "blog",
      key: "sites/blog/hello world.html",
      tryIndex: false,
    });
    expect(parseSitesPath("/blog/%E4%B8%AD%E6%96%87.html")).toMatchObject({
      ok: true,
      key: "sites/blog/中文.html",
    });
  });

  test("mime by extension", () => {
    expect(mimeForKey("sites/a/index.html")).toMatch(/^text\/html/);
    expect(mimeForKey("sites/a/app.js")).toMatch(/javascript/);
    expect(mimeForKey("sites/a/noext")).toBe("application/octet-stream");
  });
});
