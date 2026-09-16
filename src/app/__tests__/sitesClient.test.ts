import { vi } from "vitest";
import {
  deleteSite,
  isValidSiteSlug,
  listSites,
  publishSite,
  siteUrl,
  suggestSiteSlug,
  updateSiteConfig,
} from "../sites";
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
    mockAuthFetch.mockOk({});
    await updateSiteConfig("blog", true);
    const [url, init] = mockAuthFetch.mock.calls[0];
    expect(url).toBe("/api/sites");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ slug: "blog", spa: true });
  });

  test("失败抛出响应文本", async () => {
    mockAuthFetch.mockError(400, "bad spa");
    await expect(updateSiteConfig("blog", true)).rejects.toThrow("bad spa");
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
