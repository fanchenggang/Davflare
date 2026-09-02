/// <reference types="node" />
import * as fs from "fs";
import * as path from "path";

const extDir = path.join(__dirname, "../../../extension");

const {
  DEFAULT_NTP,
  DEFAULT_SETTINGS,
  mergeSettings,
  normalizeInstanceUrl,
  resolveNewTabTarget,
  resolveToolbarTarget,
} = require("../../../extension/url.js") as {
  DEFAULT_NTP: string;
  DEFAULT_SETTINGS: { instanceUrl: string; newTab: boolean };
  mergeSettings: (stored: unknown) => { instanceUrl: string; newTab: boolean };
  normalizeInstanceUrl: (raw: unknown) => string;
  resolveNewTabTarget: (settings: unknown) => { action: string; url?: string };
  resolveToolbarTarget: (settings: unknown) => { action: string; url?: string };
};

function walkFiles(dir: string): string[] {
  return fs.readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return fs.statSync(full).isDirectory() ? walkFiles(full) : [full];
  });
}

describe("Davflare Chrome extension / manifest", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(extDir, "manifest.json"), "utf8")
  ) as Record<string, unknown>;

  test("is Manifest V3 with action, options, storage, and NTP override", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.action).toBeTruthy();
    expect((manifest.options_ui as { page: string }).page).toBe("options.html");
    expect(manifest.permissions).toEqual(["storage"]);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.optional_host_permissions).toBeUndefined();
    expect(
      (manifest.chrome_url_overrides as { newtab: string }).newtab
    ).toBe("newtab.html");
    expect(manifest.background).toEqual({ service_worker: "background.js" });
  });

  test("does not embed a forced default host", () => {
    const banned = ["sites.freedrg.com", "flaredrive-bgb.pages.dev"];
    const textFiles = walkFiles(extDir).filter((file) =>
      /\.(js|html|css|json)$/.test(file)
    );
    for (const file of textFiles) {
      const text = fs.readFileSync(file, "utf8");
      for (const host of banned) {
        expect(`${path.relative(extDir, file)}:${text}`).not.toContain(host);
      }
    }
  });
});

describe("Davflare Chrome extension / settings defaults", () => {
  test("newTab defaults to false and instance URL is empty", () => {
    expect(DEFAULT_SETTINGS).toEqual({ instanceUrl: "", newTab: false });
    expect(mergeSettings(undefined)).toEqual({ instanceUrl: "", newTab: false });
    expect(mergeSettings({})).toEqual({ instanceUrl: "", newTab: false });
    expect(mergeSettings({ newTab: "true", instanceUrl: 1 })).toEqual({
      instanceUrl: "",
      newTab: false,
    });
    expect(mergeSettings({ newTab: true, instanceUrl: "https://drive.example" })).toEqual({
      instanceUrl: "https://drive.example",
      newTab: true,
    });
  });
});

describe("Davflare Chrome extension / toolbar URL helper", () => {
  test("empty or invalid URL opens options instead of guessing a host", () => {
    expect(resolveToolbarTarget({})).toEqual({ action: "options" });
    expect(resolveToolbarTarget({ instanceUrl: "   " })).toEqual({ action: "options" });
    expect(resolveToolbarTarget({ instanceUrl: "javascript:alert(1)" })).toEqual({
      action: "options",
    });
    expect(resolveToolbarTarget({ instanceUrl: "chrome://settings" })).toEqual({
      action: "options",
    });
    expect(normalizeInstanceUrl("")).toBe("");
    expect(normalizeInstanceUrl(null)).toBe("");
  });

  test("accepts a user-supplied http(s) instance and adds https when needed", () => {
    expect(resolveToolbarTarget({ instanceUrl: "https://drive.example/app/" })).toEqual({
      action: "open",
      url: "https://drive.example/app",
    });
    expect(resolveToolbarTarget({ instanceUrl: "http://localhost:8788" })).toEqual({
      action: "open",
      url: "http://localhost:8788",
    });
    expect(normalizeInstanceUrl("drive.example")).toBe("https://drive.example");
  });
});

describe("Davflare Chrome extension / new tab helper", () => {
  test("off by default: Chrome NTP, even when a URL is saved", () => {
    expect(resolveNewTabTarget({ instanceUrl: "https://drive.example" })).toEqual({
      action: "default-ntp",
      url: DEFAULT_NTP,
    });
    expect(DEFAULT_NTP).toBe("chrome://new-tab-page/");
  });

  test("on + URL opens the drive; on without URL keeps the default NTP", () => {
    expect(
      resolveNewTabTarget({ newTab: true, instanceUrl: "https://drive.example" })
    ).toEqual({ action: "open", url: "https://drive.example" });
    expect(resolveNewTabTarget({ newTab: true, instanceUrl: "" })).toEqual({
      action: "default-ntp",
      url: DEFAULT_NTP,
    });
  });
});
