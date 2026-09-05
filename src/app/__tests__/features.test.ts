import { vi } from "vitest";
import { authFetch } from "../auth";
import {
  DEFAULT_FEATURE_FLAGS,
  fetchAppConfig,
  parseAppConfig,
  patchFeatureFlags,
} from "../features";
import { asAuthFetchMock } from "../testUtils";

vi.mock("../auth", () => ({
  authFetch: vi.fn(),
}));

const mockAuthFetch = asAuthFetchMock(authFetch);

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
    mockAuthFetch.mockOk({ username: "a", publicRead: false, webdav: true });
    const config = await fetchAppConfig();
    expect(mockAuthFetch).toHaveBeenCalledWith("/api/config");
    expect(config.flags.webdav).toBe(true);
  });

  test("fetchAppConfig throws on empty error body", async () => {
    mockAuthFetch.mockError(500);
    await expect(fetchAppConfig()).rejects.toThrow();
  });

  test("fetchAppConfig uses response text when present", async () => {
    mockAuthFetch.mockError(500, "config-down");
    await expect(fetchAppConfig()).rejects.toThrow("config-down");
  });

  test("patchFeatureFlags PATCHes flags", async () => {
    mockAuthFetch.mockOk({ username: "a", publicRead: false, webdav: false });
    await patchFeatureFlags({ webdav: false });
    const [url, init] = mockAuthFetch.mock.calls[0];
    expect(url).toBe("/api/config");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ webdav: false });
  });

  test("patchFeatureFlags throws on failure", async () => {
    mockAuthFetch.mockError(400, "save-fail");
    await expect(patchFeatureFlags({ mcp: false })).rejects.toThrow("save-fail");
  });
});
