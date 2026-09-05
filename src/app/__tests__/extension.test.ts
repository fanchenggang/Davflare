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
const packageScript = path.join(repoRoot, "scripts/package-extension.sh");

const {
  DEFAULT_BOOKMARK_PATH,
  DEFAULT_SETTINGS,
  TOOLBAR_MODES,
  mergeSettings,
  normalizeInstanceUrl,
  resolveToolbarTarget,
  sanitizeBookmarkPath,
} = nodeRequire("../../../extension/url.js") as {
  DEFAULT_BOOKMARK_PATH: string;
  DEFAULT_SETTINGS: { instanceUrl: string; toolbarMode: string; bookmarkPath: string };
  TOOLBAR_MODES: string[];
  mergeSettings: (stored: unknown) => {
    instanceUrl: string;
    toolbarMode: string;
    bookmarkPath: string;
  };
  normalizeInstanceUrl: (raw: unknown) => string;
  resolveToolbarTarget: (settings: unknown) => { action: string; url?: string };
  sanitizeBookmarkPath: (raw: unknown) => string;
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

  test("is Manifest V3 with action and bookmarks permissions — no NTP override, no options page", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.action).toBeTruthy();
    // 工具栏左键点击打开收藏弹窗（HamHome 式），主页入口在弹窗 footer。
    expect((manifest.action as Record<string, unknown>).default_popup).toBe("popup.html");
    expect(manifest.options_ui).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(manifest, "options_ui")).toBe(false);
    expect(manifest.permissions).toEqual([
      "storage",
      "activeTab",
      "contextMenus",
      "favicon",
      "notifications",
      "tabs",
      "tabGroups",
      "scripting",
    ]);
    expect(manifest.optional_permissions).toEqual(["bookmarks"]);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.optional_host_permissions).toEqual(["http://*/*", "https://*/*"]);
    expect(manifest.chrome_url_overrides).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(manifest, "chrome_url_overrides")).toBe(
      false
    );
    expect(manifest.background).toEqual({ service_worker: "background.js" });
    // #62 P1：快捷键快藏 + omnibox 检索已藏书签。
    expect(manifest.commands).toEqual({
      "save-current-page": {
        suggested_key: { default: "Alt+Shift+S", mac: "Alt+Shift+S" },
        description: "Save the current page to Davflare",
      },
    });
    expect(manifest.omnibox).toEqual({ keyword: "df" });
    expect(fs.existsSync(path.join(extDir, "newtab.html"))).toBe(false);
    expect(fs.existsSync(path.join(extDir, "newtab.js"))).toBe(false);
  });

  test("action popup reuses the shared codec/client and routes the home entry to the shell", () => {
    const popupHtml = fs.readFileSync(path.join(extDir, "popup.html"), "utf8");
    expect(popupHtml).toContain('src="url.js"');
    expect(popupHtml).toContain('src="bookmarks.js"');
    expect(popupHtml).toContain('src="dav.js"');
    expect(popupHtml).toContain('src="popup.js"');
    expect(popupHtml).toContain('id="homeBtn"');
    expect(popupHtml).toContain('id="settingsBtn"');
    const popupJs = fs.readFileSync(path.join(extDir, "popup.js"), "utf8");
    expect(popupJs).toContain("DavflareDav.createDavClient");
    expect(popupJs).toContain("Bookmarks.addBookmark");
    expect(popupJs).toContain("bookmarks.html");
    expect(popupJs).toContain("resolveToolbarTarget");
    // 弹窗接管点击后，background 不应再有工具栏点击监听
    const bg = fs.readFileSync(path.join(extDir, "background.js"), "utf8");
    expect(bg).not.toContain("chrome.action.onClicked");
    // #71: conflict retry lives in quickSave.js; SW must import it.
    expect(bg).toContain('importScripts("url.js", "bookmarks.js", "dav.js", "quickSave.js")');
    expect(bg).toContain("DavflareQuickSave.saveBookmark");
    expect(fs.existsSync(path.join(extDir, "quickSave.js"))).toBe(true);
        // #73: savePage try/catch + return Promise from onClicked so MV3 SW stays alive
    // and unexpected throws still reach failFeedback (badge + notification).
    // #75: catch surfaces err.message; parseRemote delegates to Bookmarks
    // (JSON-first, SW-safe — no DOMParser required).
    expect(bg).toMatch(/async function savePage\([\s\S]*?try\s*\{/);
    expect(bg).toMatch(/catch\s*\([^)]*\)\s*\{[\s\S]*?failFeedback\(/);
    expect(bg).toContain('errorText("unexpected"');
    expect(bg).toContain("Bookmarks.parseRemoteLibrary");
    expect(bg).toContain("return savePage(tab)");
    expect(bg).toContain("chrome.contextMenus.onClicked.addListener");
  });

  test("standalone options page is gone; settings live in the shell page", () => {
    expect(fs.existsSync(path.join(extDir, "options.html"))).toBe(false);
    expect(fs.existsSync(path.join(extDir, "options.js"))).toBe(false);
    expect(fs.existsSync(path.join(extDir, "options.css"))).toBe(false);
    const shell = fs.readFileSync(path.join(extDir, "bookmarks.html"), "utf8");
    expect(shell).toContain('id="viewSettings"');
    expect(shell).toContain('id="switchSettings"');
    expect(shell).toContain('id="settingsForm"');
    const app = fs.readFileSync(path.join(extDir, "bookmarksApp.js"), "utf8");
    expect(app).not.toContain("openOptionsPage");
  });

  test("does not embed a forced default host", () => {
    const banned = ["sites.freedrg.com", "flaredrive-bgb.pages.dev"];
    const dirs = [extDir];
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
  test("instance URL is empty, mode defaults to drive, and leftover flags are ignored", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      instanceUrl: "",
      toolbarMode: "drive",
      bookmarkPath: "bookmarks",
    });
    expect(TOOLBAR_MODES).toEqual(["drive", "bookmarks"]);
    expect(mergeSettings(undefined)).toEqual({
      instanceUrl: "",
      toolbarMode: "drive",
      bookmarkPath: "bookmarks",
    });
    expect(mergeSettings({})).toEqual({
      instanceUrl: "",
      toolbarMode: "drive",
      bookmarkPath: "bookmarks",
    });
    expect(mergeSettings({ newTab: true, instanceUrl: 1 })).toEqual({
      instanceUrl: "",
      toolbarMode: "drive",
      bookmarkPath: "bookmarks",
    });
    expect(
      mergeSettings({ newTab: true, instanceUrl: "https://drive.example" })
    ).toEqual({
      instanceUrl: "https://drive.example",
      toolbarMode: "drive",
      bookmarkPath: "bookmarks",
    });
  });

  test("only the two known toolbar modes are accepted", () => {
    expect(mergeSettings({ toolbarMode: "bookmarks" }).toolbarMode).toBe("bookmarks");
    expect(mergeSettings({ toolbarMode: "drive" }).toolbarMode).toBe("drive");
    expect(mergeSettings({ toolbarMode: "newtab" }).toolbarMode).toBe("drive");
    expect(mergeSettings({ toolbarMode: 42 }).toolbarMode).toBe("drive");
  });

  test("bookmark path is a sanitized relative WebDAV directory (issue #54)", () => {
    expect(DEFAULT_BOOKMARK_PATH).toBe("bookmarks");
    expect(sanitizeBookmarkPath("qa/bookmarks")).toBe("qa/bookmarks");
    expect(sanitizeBookmarkPath("/lib/")).toBe("lib");
    expect(sanitizeBookmarkPath("  ")).toBe("bookmarks");
    expect(sanitizeBookmarkPath("../etc")).toBe("bookmarks");
    expect(sanitizeBookmarkPath("a//b")).toBe("a/b");
    expect(sanitizeBookmarkPath(42)).toBe("bookmarks");
    expect(mergeSettings({ bookmarkPath: "private/dir" }).bookmarkPath).toBe(
      "private/dir"
    );
  });
});

describe("Davflare Chrome extension / toolbar URL helper", () => {
  test("empty or invalid URL opens the in-shell settings view instead of guessing a host", () => {
    expect(resolveToolbarTarget({})).toEqual({ action: "settings" });
    expect(resolveToolbarTarget({ instanceUrl: "   " })).toEqual({ action: "settings" });
    expect(resolveToolbarTarget({ instanceUrl: "javascript:alert(1)" })).toEqual({
      action: "settings",
    });
    expect(resolveToolbarTarget({ instanceUrl: "chrome://settings" })).toEqual({
      action: "settings",
    });
    expect(normalizeInstanceUrl("")).toBe("");
    expect(normalizeInstanceUrl(null)).toBe("");
  });

  test("accepts a user-supplied http(s) instance and adds https when needed", () => {
    expect(resolveToolbarTarget({ instanceUrl: "https://drive.example/app/" })).toEqual({
      action: "drive",
    });
    expect(resolveToolbarTarget({ instanceUrl: "http://localhost:8788" })).toEqual({
      action: "drive",
    });
    expect(normalizeInstanceUrl("drive.example")).toBe("https://drive.example");
  });

  test("bookmark mode routes to the library page even before a URL is configured", () => {
    expect(resolveToolbarTarget({ toolbarMode: "bookmarks" })).toEqual({
      action: "bookmarks",
    });
    expect(
      resolveToolbarTarget({ instanceUrl: "https://drive.example", toolbarMode: "bookmarks" })
    ).toEqual({ action: "bookmarks" });
    expect(resolveToolbarTarget({ toolbarMode: "drive" })).toEqual({ action: "settings" });
  });
});

describe("Davflare Chrome extension / release zip", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "davflare-ext-"));
  const defaultZip = path.join(tmp, "davflare-extension.zip");

  beforeAll(() => {
    execFileSync("bash", [packageScript, tmp], { cwd: repoRoot, stdio: "pipe" });
  });

  afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test("single zip ships the shell, drive bundle, and no overrides", () => {
    const manifest = unzipManifest(defaultZip);
    const names = unzipList(defaultZip);
    expect(manifest.chrome_url_overrides).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(manifest, "chrome_url_overrides")).toBe(
      false
    );
    expect(manifest.options_ui).toBeUndefined();
    expect(names).not.toContain("newtab.html");
    expect(names).not.toContain("newtab.js");
    expect(names).not.toContain("options.html");
    expect(names).not.toContain("options.js");
    expect(names).toContain("manifest.json");
    expect(names).toContain("background.js");
    expect(names).toContain("quickSave.js");
    expect(names).toContain("bookmarks.html");
    expect(names).toContain("bookmarks.css");
    expect(names).toContain("bookmarksApp.js");
    expect(names).toContain("bookmarksView.js");
    expect(names).toContain("bookmarks.js");
    expect(names).toContain("dav.js");
    expect(names).toContain("popup.html");
    expect(names).toContain("popup.css");
    expect(names).toContain("popup.js");
    expect(names).toContain("workspaces.js");
    expect(names).toContain("tabRules.js");
    expect(names).toContain("pinyin.js");
    expect(names).toContain("pinyinDict.js");
    expect(names).toContain("snapshots.js");
    expect(names).toContain("hamhome.js");
    expect(names).toContain("drive/drive.js");
  });
});

describe("Davflare Chrome extension / library live refresh (#77)", () => {
  const app = fs.readFileSync(path.join(extDir, "bookmarksApp.js"), "utf8");
  const shell = fs.readFileSync(path.join(extDir, "bookmarks.html"), "utf8");
  const css = fs.readFileSync(path.join(extDir, "bookmarks.css"), "utf8");

  test("open library page applies external bookmarkCache writes via storage.onChanged", () => {
    // popup / 右键快藏成功后只写 chrome.storage 的 bookmarksCache；已打开的
    // 库页面必须监听该变化，否则写入成功后列表/搜索仍落在旧 model 上。
    expect(app).toContain("chrome.storage.onChanged.addListener");
    expect(app).toMatch(/area !== "local"/);
    expect(app).toContain("applyExternalCache");
    // 自写回声（syncedAt 相同）不得重复渲染；refresh/persist 在途时不得
    // 中途替换内存 model/etag（会让 PUT 丢本地变更或条件请求失效）。
    expect(app).toMatch(
      /function applyExternalCache\(cache\)\s*\{[\s\S]*?syncedAt === state\.syncedAt[\s\S]*?inflightSync > 0[\s\S]*?renderAll\(\);/
    );
    expect(app).toMatch(
      /async function refresh\(\)[\s\S]*?inflightSync\+\+[\s\S]*?finally\s*\{[\s\S]*?inflightSync--/
    );
    expect(app).toMatch(
      /async function persist\(\)[\s\S]*?inflightSync\+\+[\s\S]*?finally\s*\{[\s\S]*?inflightSync--/
    );
  });

  test("library topbar has an explicit reload entry wired to refresh()", () => {
    expect(shell).toContain('id="libRefresh"');
    expect(app).toMatch(/libRefresh"\)\.addEventListener\("click"[\s\S]{0,120}refresh\(\)/);
    expect(app).toContain('$("libRefresh").textContent = t.libReload;');
    expect(css).toContain("#libRefresh");
  });
});
