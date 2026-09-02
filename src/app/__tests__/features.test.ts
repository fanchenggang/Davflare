import { authFetch } from "../auth";
import {
  DEFAULT_FEATURE_FLAGS,
  fetchAppConfig,
  parseAppConfig,
  patchFeatureFlags,
} from "../features";

jest.mock("../auth", () => ({
  authFetch: jest.fn(),
}));

const mockAuthFetch = authFetch as unknown as jest.Mock;

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => (ok ? JSON.stringify(body) : ""),
  } as unknown as Response;
}

beforeEach(() => {
  mockAuthFetch.mockReset();
});

describe("parseAppConfig", () => {
  test("defaults flags to all on when omitted", () => {
    expect(parseAppConfig({ username: "a", publicRead: false }).flags).toEqual(
      DEFAULT_FEATURE_FLAGS
    );
  });

  test("reads the five flags and sitesHost", () => {
    const parsed = parseAppConfig({
      username: "a",
      publicRead: true,
      sitesHost: "sites.example.com",
      webdav: false,
      mcp: true,
      apiKey: false,
      sites: true,
      imageHost: false,
    });
    expect(parsed.publicRead).toBe(true);
    expect(parsed.sitesHost).toBe("sites.example.com");
    expect(parsed.flags).toEqual({
      webdav: false,
      mcp: true,
      apiKey: false,
      sites: true,
      imageHost: false,
    });
  });

  test("non-object payload and empty sitesHost fall back", () => {
    expect(parseAppConfig(null)).toEqual({
      username: "",
      publicRead: false,
      sitesHost: null,
      flags: DEFAULT_FEATURE_FLAGS,
    });
    expect(parseAppConfig({ sitesHost: "" }).sitesHost).toBeNull();
    expect(parseAppConfig({ publicRead: "yes" }).publicRead).toBe(false);
  });
});

describe("config client", () => {
  test("fetchAppConfig GETs /api/config", async () => {
    mockAuthFetch.mockResolvedValue(
      jsonResponse({ username: "a", publicRead: false, webdav: true })
    );
    const config = await fetchAppConfig();
    expect(mockAuthFetch).toHaveBeenCalledWith("/api/config");
    expect(config.flags.webdav).toBe(true);
  });

  test("fetchAppConfig throws on empty error body", async () => {
    mockAuthFetch.mockResolvedValue(jsonResponse({}, false, 500));
    await expect(fetchAppConfig()).rejects.toThrow();
  });

  test("fetchAppConfig uses response text when present", async () => {
    mockAuthFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => "config-down",
    } as unknown as Response);
    await expect(fetchAppConfig()).rejects.toThrow("config-down");
  });

  test("patchFeatureFlags PATCHes flags", async () => {
    mockAuthFetch.mockResolvedValue(
      jsonResponse({ username: "a", publicRead: false, webdav: false })
    );
    await patchFeatureFlags({ webdav: false });
    const [url, init] = mockAuthFetch.mock.calls[0];
    expect(url).toBe("/api/config");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ webdav: false });
  });

  test("patchFeatureFlags throws on failure", async () => {
    mockAuthFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({}),
      text: async () => "save-fail",
    } as unknown as Response);
    await expect(patchFeatureFlags({ mcp: false })).rejects.toThrow("save-fail");
  });
});
