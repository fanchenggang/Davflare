/// <reference types="node" />
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

// vitest 以 ESM 方式运行测试文件：这里用 createRequire 加载 CJS 的
// extension/url.js，并用 import.meta 推导 __dirname 等价物。
const nodeRequire = createRequire(import.meta.url);
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const extDir = path.join(repoRoot, "extension");
const newtabOverlayDir = path.join(repoRoot, "extension-newtab");
const packageScript = path.join(repoRoot, "scripts/package-extension.sh");

const {
  DEFAULT_NTP,
  DEFAULT_SETTINGS,
  mergeSettings,
  normalizeInstanceUrl,
  resolveNewTabTarget,
  resolveToolbarTarget,
} = nodeRequire("../../../extension/url.js") as {
  DEFAULT_NTP: string;
  DEFAULT_SETTINGS: { instanceUrl: string };
  mergeSettings: (stored: unknown) => { instanceUrl: string };
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

function unzipManifest(zipPath: string): Record<string, unknown> {
  const raw = execFileSync("unzip", ["-p", zipPath, "manifest.json"], {
    encoding: "utf8",
  });
  return JSON.parse(raw) as Record<string, unknown>;
}

function unzipList(zipPath: string): string[] {
  return execFileSync("unzip", ["-Z", "-1", zipPath], { encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

describe("Davflare Chrome extension / default package", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(extDir, "manifest.json"), "utf8")
  ) as Record<string, unknown>;

  test("is Manifest V3 with action, options, and storage — no NTP override", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.action).toBeTruthy();
    expect((manifest.options_ui as { page: string }).page).toBe("options.html");
    expect(manifest.permissions).toEqual(["storage"]);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.optional_host_permissions).toBeUndefined();
    expect(manifest.chrome_url_overrides).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(manifest, "chrome_url_overrides")).toBe(
      false
    );
    expect(manifest.background).toEqual({ service_worker: "background.js" });
    expect(fs.existsSync(path.join(extDir, "newtab.html"))).toBe(false);
    expect(fs.existsSync(path.join(extDir, "newtab.js"))).toBe(false);
  });

  test("options do not offer a new-tab toggle", () => {
    const html = fs.readFileSync(path.join(extDir, "options.html"), "utf8");
    const js = fs.readFileSync(path.join(extDir, "options.js"), "utf8");
    expect(html).not.toMatch(/id=["']newTab["']/);
    expect(html).not.toMatch(/Use Davflare as new tab/i);
    expect(html).not.toMatch(/用 Davflare 作为新标签页/);
    expect(js).not.toMatch(/newTabLabel/);
    expect(js).not.toMatch(/newTabHint/);
  });

  test("does not embed a forced default host", () => {
    const banned = ["sites.freedrg.com", "flaredrive-bgb.pages.dev"];
    const dirs = [extDir, newtabOverlayDir];
    for (const dir of dirs) {
      const textFiles = walkFiles(dir).filter((file) =>
        /\.(js|html|css|json)$/.test(file)
      );
      for (const file of textFiles) {
        const text = fs.readFileSync(file, "utf8");
        for (const host of banned) {
          expect(`${path.relative(repoRoot, file)}:${text}`).not.toContain(host);
        }
      }
    }
  });
});

describe("Davflare Chrome extension / settings defaults", () => {
  test("instance URL is empty and leftover newTab flags are ignored", () => {
    expect(DEFAULT_SETTINGS).toEqual({ instanceUrl: "" });
    expect(mergeSettings(undefined)).toEqual({ instanceUrl: "" });
    expect(mergeSettings({})).toEqual({ instanceUrl: "" });
    expect(mergeSettings({ newTab: true, instanceUrl: 1 })).toEqual({
      instanceUrl: "",
    });
    expect(
      mergeSettings({ newTab: true, instanceUrl: "https://drive.example" })
    ).toEqual({
      instanceUrl: "https://drive.example",
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

describe("Davflare Chrome extension / new tab helper (newtab zip only)", () => {
  test("opens the saved instance; without a URL keeps Chrome NTP as fallback", () => {
    expect(resolveNewTabTarget({ instanceUrl: "https://drive.example" })).toEqual({
      action: "open",
      url: "https://drive.example",
    });
    expect(resolveNewTabTarget({ instanceUrl: "" })).toEqual({
      action: "default-ntp",
      url: DEFAULT_NTP,
    });
    expect(resolveNewTabTarget({})).toEqual({
      action: "default-ntp",
      url: DEFAULT_NTP,
    });
    expect(DEFAULT_NTP).toBe("chrome://new-tab-page/");
  });
});

describe("Davflare Chrome extension / release zips", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "davflare-ext-"));
  const defaultZip = path.join(tmp, "davflare-extension.zip");
  const newtabZip = path.join(tmp, "davflare-extension-newtab.zip");

  beforeAll(() => {
    execFileSync("bash", [packageScript, tmp], { cwd: repoRoot, stdio: "pipe" });
  });

  afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test("default zip has no chrome_url_overrides and no newtab files", () => {
    const manifest = unzipManifest(defaultZip);
    const names = unzipList(defaultZip);
    expect(manifest.chrome_url_overrides).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(manifest, "chrome_url_overrides")).toBe(
      false
    );
    expect(names).not.toContain("newtab.html");
    expect(names).not.toContain("newtab.js");
    expect(names).toContain("manifest.json");
    expect(names).toContain("options.html");
    expect(names).toContain("background.js");
  });

  test("newtab zip includes chrome_url_overrides and newtab files", () => {
    const manifest = unzipManifest(newtabZip);
    const names = unzipList(newtabZip);
    expect(manifest.chrome_url_overrides).toEqual({ newtab: "newtab.html" });
    expect(names).toContain("newtab.html");
    expect(names).toContain("newtab.js");
    expect(names).toContain("manifest.json");
    expect(names).toContain("options.html");
    expect(names).toContain("url.js");
  });
});
