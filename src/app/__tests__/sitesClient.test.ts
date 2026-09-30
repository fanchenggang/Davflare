import { vi } from "vitest";
import {
  ALBUM_MAX_BYTES,
  ALBUM_MAX_IMAGES,
  albumPublishBlockReason,
  albumSelectionBytes,
  deleteSite,
  isValidSiteSlug,
  listSites,
  partitionRasterFiles,
  publishAlbumSite,
  publishNavSite,
  publishSite,
  siteHostnameUrl,
  siteUrl,
  suggestSiteSlug,
  updateSiteConfig,
} from "../sites";
import { FileItem } from "../types";
import { translate } from "../strings";
import { authFetch } from "../auth";
import { setLang } from "../strings";
import { asAuthFetchMock } from "../testUtils";

vi.mock("../auth", () => ({
  authFetch: vi.fn(),
}));

const mockAuthFetch = asAuthFetchMock(authFetch);

beforeEach(() => {
  mockAuthFetch.mockReset();
});

describe("sites / listSites", () => {
  test("不带 stats 时路径无查询参数", async () => {
    mockAuthFetch.mockOk({ sitesHost: null, sites: [] });
    await listSites();
    expect(mockAuthFetch).toHaveBeenCalledWith("/api/sites");
  });

  test("withStats=true 带 ?stats=1", async () => {
    mockAuthFetch.mockOk({ sitesHost: "s.example.com", sites: [] });
    await listSites(true);
    expect(mockAuthFetch).toHaveBeenCalledWith("/api/sites?stats=1");
  });

  test("失败抛出默认文案", async () => {
    mockAuthFetch.mockError(500);
    setLang("zh");
    await expect(listSites()).rejects.toThrow("获取站点列表失败");
  });
});

describe("sites / updateSiteConfig", () => {
  test("POST slug 与 spa", async () => {
    mockAuthFetch.mockOk({ slug: "blog", spa: true, passwordProtected: false });
    await updateSiteConfig("blog", { spa: true });
    const [url, init] = mockAuthFetch.mock.calls[0];
    expect(url).toBe("/api/sites");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ slug: "blog", spa: true });
  });

  test("POST password set / clear", async () => {
    mockAuthFetch.mockOk({ slug: "blog", spa: false, passwordProtected: true, hostname: null });
    await updateSiteConfig("blog", { password: "s3cret" });
    expect(JSON.parse(mockAuthFetch.mock.calls[0][1].body)).toEqual({
      slug: "blog",
      password: "s3cret",
    });

    mockAuthFetch.mockOk({ slug: "blog", spa: false, passwordProtected: false, hostname: null });
    await updateSiteConfig("blog", { password: null });
    expect(JSON.parse(mockAuthFetch.mock.calls[1][1].body)).toEqual({
      slug: "blog",
      password: null,
    });
  });

  test("POST hostname set / clear", async () => {
    mockAuthFetch.mockOk({
      slug: "blog",
      spa: false,
      passwordProtected: false,
      hostname: "blog.example.com",
    });
    await updateSiteConfig("blog", { hostname: "blog.example.com" });
    expect(JSON.parse(mockAuthFetch.mock.calls[0][1].body)).toEqual({
      slug: "blog",
      hostname: "blog.example.com",
    });

    mockAuthFetch.mockOk({
      slug: "blog",
      spa: false,
      passwordProtected: false,
      hostname: null,
    });
    await updateSiteConfig("blog", { hostname: null });
    expect(JSON.parse(mockAuthFetch.mock.calls[1][1].body)).toEqual({
      slug: "blog",
      hostname: null,
    });
  });

  test("失败抛出响应文本", async () => {
    mockAuthFetch.mockError(400, "bad spa");
    await expect(updateSiteConfig("blog", { spa: true })).rejects.toThrow("bad spa");
  });
});

describe("sites / deleteSite", () => {
  test("默认不带 purge", async () => {
    mockAuthFetch.mockOk({ deleted: 3 });
    await expect(deleteSite("blog")).resolves.toBe(3);
    const [url, init] = mockAuthFetch.mock.calls[0];
    expect(url).toBe("/api/sites?slug=blog");
    expect(init.method).toBe("DELETE");
  });

  test("purge=true 带 purge=1 且 deleted 缺省返回 0", async () => {
    mockAuthFetch.mockOk({});
    await expect(deleteSite("blog", { purge: true })).resolves.toBe(0);
    expect(mockAuthFetch.mock.calls[0][0]).toBe("/api/sites?slug=blog&purge=1");
  });
});

describe("sites / siteUrl", () => {
  test("未配置 sitesHost 返回 null", () => {
    expect(siteUrl(null, "blog")).toBeNull();
    expect(siteUrl("", "blog")).toBeNull();
  });

  test("使用当前协议拼接地址", () => {
    expect(siteUrl("sites.example.com", "blog")).toBe(`${window.location.protocol}//sites.example.com/blog/`);
  });

  test("siteHostnameUrl builds root URL", () => {
    expect(siteHostnameUrl(null)).toBeNull();
    expect(siteHostnameUrl("blog.example.com")).toBe(
      `${window.location.protocol}//blog.example.com/`
    );
  });
});


describe("sites / suggestSiteSlug + isValidSiteSlug", () => {
  test("normalizes folder names", () => {
    expect(suggestSiteSlug("My Blog!")).toBe("my-blog");
    expect(suggestSiteSlug("---")).toBe("site");
    expect(isValidSiteSlug("my-blog")).toBe(true);
    expect(isValidSiteSlug("Bad")).toBe(false);
  });
});

describe("sites / publishSite", () => {
  test("POST slug + source", async () => {
    mockAuthFetch.mockOk({
      slug: "blog",
      source: "src",
      copied: 2,
      sitesHost: "sites.example.com",
    });
    await expect(publishSite("src", "Blog")).resolves.toEqual({
      slug: "blog",
      source: "src",
      copied: 2,
      sitesHost: "sites.example.com",
    });
    const [url, init] = mockAuthFetch.mock.calls[0];
    expect(url).toBe("/api/sites");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ slug: "blog", source: "src" });
  });

  test("rejects bad slug before fetch", async () => {
    await expect(publishSite("src", "has_underscore")).rejects.toThrow(/slug|a-z0-9/i);
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });

  test("failure uses response text", async () => {
    mockAuthFetch.mockError(400, "source folder not found");
    await expect(publishSite("src", "blog")).rejects.toThrow("source folder not found");
  });
});

describe("sites / publishNavSite", () => {
  test("POST slug + nav payload", async () => {
    mockAuthFetch.mockOk({
      slug: "nav",
      kind: "nav",
      copied: 1,
      count: 2,
      sitesHost: "sites.example.com",
    });
    const nav = {
      lang: "zh" as const,
      title: "我的导航",
      groups: [{ name: "g", links: [{ title: "a", href: "https://ex.test" }] }],
    };
    await expect(publishNavSite("Nav", nav)).resolves.toMatchObject({
      slug: "nav",
      kind: "nav",
      count: 2,
    });
    const [url, init] = mockAuthFetch.mock.calls[0];
    expect(url).toBe("/api/sites");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ slug: "nav", nav });
  });

  test("rejects bad slug and surfaces response text", async () => {
    await expect(
      publishNavSite("Bad_Slug", { groups: [{ name: "g", links: [{ title: "a", href: "https://x" }] }] })
    ).rejects.toThrow(/slug|a-z0-9/i);
    expect(mockAuthFetch).not.toHaveBeenCalled();

    mockAuthFetch.mockError(400, "no bookmarks");
    await expect(
      publishNavSite("ok", { groups: [{ name: "g", links: [{ title: "a", href: "https://x" }] }] })
    ).rejects.toThrow("no bookmarks");
  });
});

describe("sites / album helpers + publishAlbumSite", () => {
  function file(name: string, size = 10, isDir = false): FileItem {
    return {
      key: `pics/${name}`,
      name,
      isDir,
      size,
      uploaded: "",
      contentType: "image/jpeg",
    };
  }

  test("partitionRasterFiles keeps only raster files", () => {
    const { images, ignored } = partitionRasterFiles([
      file("a.jpg"),
      file("notes.txt"),
      file("dir", 0, true),
      file("b.WEBP", 20),
      file("c.avif", 30),
    ]);
    expect(images.map((f) => f.name)).toEqual(["a.jpg", "b.WEBP", "c.avif"]);
    expect(ignored).toBe(2);
    expect(albumSelectionBytes(images)).toBe(10 + 20 + 30);
    expect(albumSelectionBytes([{ ...file("x.jpg"), size: Number.NaN }])).toBe(0);
  });

  test("albumPublishBlockReason covers empty / too many / too large / ok", () => {
    setLang("zh");
    expect(albumPublishBlockReason([])).toBe(translate("publishAlbumNoImages"));
    const many = Array.from({ length: ALBUM_MAX_IMAGES + 1 }, (_, i) => file(`${i}.jpg`, 1));
    expect(albumPublishBlockReason(many)).toBe(
      translate("publishAlbumTooMany", { count: many.length, max: ALBUM_MAX_IMAGES })
    );
    const huge = [file("big.jpg", ALBUM_MAX_BYTES + 1)];
    expect(albumPublishBlockReason(huge)).toContain("100");
    expect(albumPublishBlockReason([file("ok.jpg", 100)])).toBeNull();
  });

  test("publishAlbumSite POSTs album files and rejects bad slug / errors", async () => {
    mockAuthFetch.mockOk({
      slug: "album",
      kind: "album",
      copied: 1,
      bytes: 10,
      sitesHost: null,
    });
    await expect(
      publishAlbumSite("Album", ["pics/a.jpg"], { lang: "en", title: "Album" })
    ).resolves.toMatchObject({ slug: "album", kind: "album", copied: 1 });
    expect(JSON.parse(mockAuthFetch.mock.calls[0][1].body)).toEqual({
      slug: "album",
      album: { lang: "en", title: "Album", files: ["pics/a.jpg"] },
    });

    await expect(publishAlbumSite("Bad_Slug", ["pics/a.jpg"])).rejects.toThrow(/slug|a-z0-9/i);
    mockAuthFetch.mockError(400, "no album images");
    await expect(publishAlbumSite("ok", [])).rejects.toThrow("no album images");
  });
});
