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
    // Round 4: toggle-edge-panel drives the in-page save panel.
    expect(manifest.commands).toEqual({
      "save-current-page": {
        suggested_key: { default: "Alt+Shift+S", mac: "Alt+Shift+S" },
        description: "Save the current page to Davflare",
      },
      "toggle-edge-panel": {
        suggested_key: { default: "Alt+Shift+P", mac: "Alt+Shift+P" },
        description: "Toggle the in-page Davflare save panel",
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

describe("Davflare Chrome extension / #109 PM hotfix", () => {
  const app = fs.readFileSync(path.join(extDir, "bookmarksApp.js"), "utf8");

  test("importChromeBookmarks uses ensureBookmarksPermission (same as write-back)", () => {
    // PM 验收 #108 FAIL：导入曾直调 chrome.permissions.request，跳过 confirm 预提示。
    expect(app).toMatch(
      /async function importChromeBookmarks\(\)[\s\S]*?ensureBookmarksPermission\(\)/
    );
    const importFn = app.match(
      /async function importChromeBookmarks\(\)[\s\S]*?(?=\nasync function |\nfunction )/
    );
    expect(importFn?.[0]).toBeTruthy();
    expect(importFn![0]).not.toMatch(
      /chrome\.permissions\.request\(\s*\{\s*permissions:\s*\[\"bookmarks\"\]/
    );
    expect(app).toMatch(
      /async function exportChromeWrite\(\)[\s\S]*?ensureBookmarksPermission\(\)/
    );
  });

  test("navButton omits count badge when count is null/undefined", () => {
    // renderFavoritesNav 传 null；String(null) 曾把字面量 "null" 画上侧栏。
    expect(app).toMatch(
      /function navButton\(label, count, active, onClick\)[\s\S]*?if \(count != null\)[\s\S]*?badge\.className = "count"/
    );
    expect(app).toContain("navButton(favLabel(entry), null, active,");
  });
});

describe("Davflare Chrome extension / #107 snapshot capture + bookmarks perm", () => {
  const app = fs.readFileSync(path.join(extDir, "bookmarksApp.js"), "utf8");
  const manifest = JSON.parse(
    fs.readFileSync(path.join(extDir, "manifest.json"), "utf8")
  ) as { version: string };

  test("manifest bumped for snapshot/perm hotfix", () => {
    expect(manifest.version).toBe("1.3.16");
  });

  test("capture requests page host permission before tabs.create / executeScript", () => {
    // Root cause of PM 404-noise + "Could not capture": executeScript needs
    // optional_host_permissions for the bookmark origin; activeTab alone is not enough.
    expect(app).toContain("function ensureCaptureHostPermission");
    expect(app).toContain("function isCapturableUrl");
    const captureFn = app.match(
      /async function captureSnapshotFor\(bookmark\)[\s\S]*?(?=\nasync function |\nfunction fetchSnapshotHtml)/
    );
    expect(captureFn?.[0]).toBeTruthy();
    const body = captureFn![0];
    expect(body.indexOf("ensureCaptureHostPermission")).toBeGreaterThan(-1);
    expect(body.indexOf("ensureCaptureHostPermission")).toBeLessThan(
      body.indexOf("chrome.tabs.create")
    );
    expect(body.indexOf("ensureCaptureHostPermission")).toBeLessThan(
      body.indexOf("chrome.scripting.executeScript")
    );
    // Distinguish load / inject / write failures.
    expect(app).toContain("snapHostDenied");
    expect(app).toContain("snapInjectFail");
    expect(app).toContain("snapLoadFail");
    expect(app).toContain("snapWriteFail");
    expect(app).toContain("snapRestricted");
  });

  test("loadSnapshots treats missing snapshots.json as empty index", () => {
    const loadFn = app.match(
      /async function loadSnapshots\(\)[\s\S]*?(?=\nasync function persistSnapshots)/
    );
    expect(loadFn?.[0]).toBeTruthy();
    expect(loadFn![0]).toMatch(/softEmpty/);
    expect(loadFn![0]).toMatch(/Snapshots\.normalize\(null\)/);
    expect(loadFn![0]).toMatch(/status === 404/);
  });

  test("ensureBookmarksPermission preserves user gesture (no contains before request)", () => {
    const ensureFn = app.match(
      /async function ensureBookmarksPermission\(\)[\s\S]*?(?=\nfunction collectSubtreeUrls)/
    );
    expect(ensureFn?.[0]).toBeTruthy();
    // Must not await contains() before request — that burns the click gesture.
    expect(ensureFn![0]).not.toMatch(
      /await chrome\.permissions\.contains[\s\S]*?permissions\.request/
    );
    expect(ensureFn![0]).toMatch(
      /chrome\.permissions\.request\(\s*\{\s*permissions:\s*\[\"bookmarks\"\]/
    );
    // Gate availability on permissions API, not chrome.bookmarks (undefined until granted).
    expect(app).toMatch(
      /function chromeBookmarksAvailable\(\)[\s\S]*?!!chrome\.permissions/
    );
    expect(app).toContain("exportChromeDeniedHint");
    expect(app).toContain("warmBookmarksPermissionCache");
  });
});

describe("Davflare Chrome extension / #112 snapshot index first-create 412", () => {
  const app = fs.readFileSync(path.join(extDir, "bookmarksApp.js"), "utf8");
  const dav = fs.readFileSync(path.join(extDir, "dav.js"), "utf8");
  const manifest = JSON.parse(
    fs.readFileSync(path.join(extDir, "manifest.json"), "utf8")
  ) as { version: string };

  test("manifest bumped for snapshot index create hotfix", () => {
    expect(manifest.version).toBe("1.3.16");
  });

  test("putFile refuses If-Match * / junk (would 412 on missing object)", () => {
    expect(dav).toContain("function etagForIfMatch");
    expect(dav).toMatch(/etagForIfMatch\([\s\S]*?s === "\*"/);
    expect(dav).toMatch(/var match = etagForIfMatch\(etag\)/);
    expect(dav).toMatch(/var match = etagForIfMatch\(payload\.etag\)/);
  });

  test("persistSnapshots retries 412 without wiping in-memory upserts", () => {
    const persistFn = app.match(
      /async function persistSnapshots\(\)[\s\S]*?(?=\nfunction renderSnapSection)/
    );
    expect(persistFn?.[0]).toBeTruthy();
    const body = persistFn![0];
    expect(body).toContain('var pending = appState.snapshots;');
    expect(body).toContain("writeOnce(null)");
    expect(body).toContain("rememberEtag");
    expect(body).not.toMatch(
      /kind === "conflict"[\s\S]*?await loadSnapshots\(\)/
    );
  });
});

describe("Davflare Chrome extension / round-2 library UX (undo, keyboard, menus)", () => {
  const appJs = fs.readFileSync(path.join(extDir, "bookmarksApp.js"), "utf8");
  const html = fs.readFileSync(path.join(extDir, "bookmarks.html"), "utf8");
  const css = fs.readFileSync(path.join(extDir, "bookmarks.css"), "utf8");
  const popupHtml = fs.readFileSync(path.join(extDir, "popup.html"), "utf8");
  const popupJs = fs.readFileSync(path.join(extDir, "popup.js"), "utf8");
  const popupCss = fs.readFileSync(path.join(extDir, "popup.css"), "utf8");

  test("every delete path funnels through the undo-capable helper", () => {
    expect(appJs).toContain("async function deleteBookmarksWithUndo(ids, doneMessage)");
    expect(appJs).toContain("deleteBookmarksWithUndo([item.id])");
    expect(appJs).toContain("await deleteBookmarksWithUndo(ids)");
    // Old direct-delete call sites are gone from the library app.
    expect(appJs).not.toContain("Bookmarks.removeBookmark(state.model, item.id)");
    // Round-3 soft-delete + #126 generalized undo toast (ids → restoreFromTrash).
    expect(appJs).toContain("Bookmarks.restoreFromTrash(state.model, action)");
  });

  test("undo toast ships markup, wiring, and styles", () => {
    expect(html).toContain('id="undoToast"');
    expect(html).toContain('id="undoBtn"');
    expect(appJs).toContain('$("undoBtn").addEventListener("click"');
    expect(css).toContain(".undoToast");
    expect(css).toContain("@keyframes toastIn");
    // Auto-dismiss timer + supersede semantics.
    expect(appJs).toContain("UNDO_MS = 6000");
    expect(appJs).toContain("cancelPendingUndo()");
  });

  test("keyboard: Esc closes menus, Delete removes the selection, arrows rove", () => {
    expect(appJs).toContain('event.key === "Escape"');
    expect(appJs).toContain('event.key === "Delete" || event.key === "Backspace"');
    expect(appJs).toContain("function focusAdjacentItem(");
    expect(appJs).toContain("function cyclePopMenuFocus(");
  });

  test("card menu gains move-to-folder + copy link, backed by a move dialog", () => {
    expect(html).toContain('id="moveDialog"');
    expect(html).toContain('id="moveFolderList"');
    expect(appJs).toContain("function openMoveDialog(item)");
    expect(appJs).toContain("t.cardMove");
    expect(appJs).toContain("t.copyLink");
    expect(appJs).toContain("navigator.clipboard.writeText");
  });

  test("edit dialog can retitle and re-URL with dedupe checks", () => {
    expect(html).toContain('id="tagTitleInput"');
    expect(html).toContain('id="tagUrlInput"');
    expect(html).toContain('id="tagError"');
    expect(appJs).toContain("Bookmarks.setBookmarkUrl(state.model, item.id, nextUrl)");
  });

  test("non-empty folders can be deleted with contents moving to Unfiled", () => {
    // #126 undoable helper still takes `name`; tree rows call it with node.path.
    expect(appJs).toContain("Bookmarks.deleteFolderTree(state.model, name)");
    expect(appJs).toContain("deleteFolderWithUndo(node.path)");
    expect(appJs).toContain("folderDeleteConfirmWithCount");
    expect(appJs).toContain("folderDeletedMoved");
  });

  test("accessibility: aria-current nav, live sync status, labelled ⋯ button", () => {
    expect(appJs).toContain("function setCurrentAttr(el, active)");
    expect(appJs).toContain('btn.setAttribute("aria-current", "true")');
    expect(html).toContain('id="syncInfo" role="status"');
    expect(appJs).toContain('more.setAttribute("aria-label", t.moreLabel)');
  });

  test("search-empty state offers the add-bookmark action", () => {
    expect(appJs).toContain("{ label: t.add, kind: \"primary\", onClick: openAddDialog }");
  });

  test("popup note field + view-in-library jump", () => {
    expect(popupHtml).toContain('id="saveNote"');
    expect(popupHtml).toContain('id="viewBtn"');
    expect(popupJs).toContain('$("saveNote").value.trim()');
    expect(popupJs).toContain("note: note,");
    expect(popupJs).toContain("function openInLibraryWithQuery()");
    expect(popupJs).toContain('base + "?q=" + encodeURIComponent(state.url)');
    expect(popupJs).toContain("updateViewBtn()");
    expect(popupCss).toContain("#saveForm textarea");
  });
});

describe("Davflare Chrome extension / #126 folder delete count + ⋯ menu arrows + 1.3.12", () => {
  const appJs = fs.readFileSync(path.join(extDir, "bookmarksApp.js"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(extDir, "manifest.json"), "utf8"));
  const Bookmarks = nodeRequire("../../../extension/bookmarks.js");

  /** Slice `start` … its matching close brace out of appJs (skips strings). */
  function sliceBlock(start: string): string {
    const at = appJs.indexOf(start);
    if (at < 0) throw new Error(`missing: ${start}`);
    let i = appJs.indexOf("{", at);
    let depth = 0;
    let quote = "";
    for (; i < appJs.length; i++) {
      const ch = appJs[i];
      if (quote) {
        if (ch === "\\") i++;
        else if (ch === quote) quote = "";
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) return appJs.slice(at, i + 1);
    }
    throw new Error(`unterminated: ${start}`);
  }

  /** EN / ZH copy for one key, read from the shipped string tables. */
  function copy(key: string): { en: string; zh: string } {
    const re = new RegExp(`\\b${key}:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "g");
    const hits = Array.from(appJs.matchAll(re)).map((m) => m[1]);
    expect(hits).toHaveLength(2);
    return { en: hits[0], zh: hits[1] };
  }

  function messageFn(lang: "en" | "zh") {
    const keys = ["folderDeleteConfirmWithCount", "folderDeleteConfirmEmptyTree", "folderDeleteConfirm"];
    const t: Record<string, string> = {};
    for (const k of keys) t[k] = copy(k)[lang];
    const src = `${sliceBlock("function fmt(")}\n${sliceBlock("function folderDeleteMessage(")}\nreturn folderDeleteMessage;`;
    return new Function("Bookmarks", "t", src)(Bookmarks, t) as (model: unknown, name: string) => string;
  }

  // #126 repro: QA125P has no direct bookmarks; QA125P/sub holds two.
  const model = Bookmarks.normalizeModel({
    version: Bookmarks.MODEL_VERSION,
    bookmarks: [
      { id: "a", url: "https://q.com/a", folder: "QA125P/sub" },
      { id: "b", url: "https://q.com/b", folder: "QA125P/sub" },
    ],
    folders: ["QA125P", "QA125P/sub", "Solo", "Tree", "Tree/leaf"],
  });

  test("confirm uses the recursive count — a folder with only nested bookmarks is not 'empty'", () => {
    const zh = messageFn("zh");
    const en = messageFn("en");
    expect(zh(model, "QA125P")).toBe("删除「QA125P」及其子文件夹？其中共 2 个书签（含子文件夹）将移入「未分类」。");
    expect(zh(model, "QA125P")).not.toContain("空文件夹");
    expect(en(model, "QA125P")).toContain("2 bookmark(s)");
    expect(en(model, "QA125P")).not.toContain("empty");
    // Truly empty folders keep the empty wording; empty trees say so.
    expect(zh(model, "Solo")).toBe("确定删除空文件夹「Solo」？");
    expect(zh(model, "Tree")).toBe("确定删除空文件夹「Tree」及其空的子文件夹？");
  });

  test("delete handler no longer trusts the direct-only node.count", () => {
    const handler = sliceBlock("function folderTreeItem(");
    expect(handler).not.toContain("node.count > 0");
    expect(handler).toContain("folderDeleteMessage(state.model, node.path)");
    expect(handler).toContain("deleteFolderWithUndo(node.path)");
  });

  test("folder delete is undoable and restores subfolder bookmarks + declarations", () => {
    const fn = sliceBlock("function deleteFolderWithUndo(");
    expect(fn).toContain("Bookmarks.deleteFolderTree(state.model, name)");
    expect(fn).toContain("showUndoToast({");
    expect(fn).toContain("fmt(t.folderDeletedMoved, { n: res.moved })");
    expect(fn).toContain("Bookmarks.restoreFolderTree(state.model, res.undo)");
    const undo = sliceBlock("async function undoDelete(");
    expect(undo).toContain("undo.restore()");
    // Toast count == moved count == what the dialog promised.
    const res = Bookmarks.deleteFolderTree(model, "QA125P");
    expect(res.moved).toBe(Bookmarks.folderTreeCount(model, "QA125P"));
    const back = Bookmarks.restoreFolderTree(res.model, res.undo).model;
    expect(back.bookmarks.map((b: { folder: string }) => b.folder)).toEqual(["QA125P/sub", "QA125P/sub"]);
    expect(back.folders).toEqual(expect.arrayContaining(["QA125P", "QA125P/sub"]));
  });

  test("ArrowDown/ArrowUp enter a mouse-opened ⋯ menu (focus still on the toggle)", () => {
    document.body.innerHTML = `
      <div class="card"><div class="wrap">
        <button class="menuToggle" id="tog">⋯</button>
        <div class="popMenu open"><button id="m1">A</button><button id="m2">B</button><button id="m3">C</button></div>
      </div></div>`;
    const listeners: ((e: KeyboardEvent) => void)[] = [];
    const fakeDoc = {
      addEventListener: (type: string, fn: (e: KeyboardEvent) => void) => {
        if (type === "keydown") listeners.push(fn);
      },
      querySelector: (s: string) => document.querySelector(s),
      get activeElement() {
        return document.activeElement;
      },
    };
    const moved: string[] = [];
    const src = `${sliceBlock("function cyclePopMenuFocus(")}\n${sliceBlock('document.addEventListener("keydown", function (event)')});`;
    new Function(
      "document",
      "$",
      "selectedExistingIds",
      "submitBatchDelete",
      "closePopMenus",
      "focusAdjacentItem",
      "HTMLElement",
      src
    )(
      fakeDoc,
      () => null,
      () => [],
      () => undefined,
      () => undefined,
      () => moved.push("card"),
      HTMLElement
    );
    expect(listeners).toHaveLength(1);
    const press = (key: string) => {
      const ev = new KeyboardEvent("keydown", { key, cancelable: true });
      Object.defineProperty(ev, "target", { value: document.activeElement });
      listeners[0](ev);
      return ev;
    };
    (document.getElementById("tog") as HTMLButtonElement).focus();
    const ev = press("ArrowDown");
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement && document.activeElement.id).toBe("m1");
    press("ArrowDown");
    expect(document.activeElement && document.activeElement.id).toBe("m2");
    (document.getElementById("tog") as HTMLButtonElement).focus();
    press("ArrowUp");
    expect(document.activeElement && document.activeElement.id).toBe("m3");
    // Focus on <body> (menu opened by mouse, nothing focused) works too.
    (document.activeElement as HTMLElement).blur();
    press("ArrowDown");
    expect(document.activeElement && document.activeElement.id).toBe("m1");
    expect(moved).toEqual([]); // never walked the card grid while the menu is open
    // Menu closed → arrows rove cards again.
    document.querySelector(".popMenu")!.classList.remove("open");
    (document.getElementById("tog") as HTMLButtonElement).focus();
    press("ArrowDown");
    expect(moved).toEqual(["card"]);
    document.body.innerHTML = "";
  });

  test("manifest version is current (1.3.15, bumped again by #134)", () => {
    expect(manifest.version).toBe("1.3.16");
  });
});

describe("Davflare Chrome extension / #130 re-saving a trashed URL keeps the original entry", () => {
  const appJs = fs.readFileSync(path.join(extDir, "bookmarksApp.js"), "utf8");
  const popupJs = fs.readFileSync(path.join(extDir, "popup.js"), "utf8");
  const quickJs = fs.readFileSync(path.join(extDir, "quickSave.js"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(extDir, "manifest.json"), "utf8"));

  test("library add dialog only overwrites the title when one was typed", () => {
    expect(appJs).toContain('var typedTitle = $("addTitleInput").value.trim();');
    expect(appJs).toContain("{ overwriteTitle: Boolean(typedTitle) }");
    expect(appJs).toContain("add.restored ? fmt(t.trashRestored, { n: 1 }) : t.added");
  });

  test("popup: trashed URL is not 'already saved', form is prefilled from the trashed entry", () => {
    expect(popupJs).toContain("var trashed = Bookmarks.trashedByUrl(model, state.url);");
    expect(popupJs).toContain("!trashed &&");
    expect(popupJs).toContain('$("saveFolder").value = trashed.folder || ""');
    expect(popupJs).toContain('$("saveTags").value = (trashed.tags || []).join(", ")');
    expect(popupJs).toContain('$("saveNote").value = trashed.note || ""');
    expect(popupJs).toContain("{ overwriteTitle: true }");
    expect(popupJs).toContain("state.trashed ? state.t.inTrash");
    expect(popupJs).toContain("add.restored ? state.t.restored : state.t.saved");
  });

  test("quick save (context menu / shortcut) never forces the page title over the original", () => {
    expect(quickJs).toContain("Bookmarks.addBookmark(");
    expect(quickJs).not.toContain("overwriteTitle");
  });

  test("manifest version is current (1.3.16 after round 4)", () => {
    expect(manifest.version).toBe("1.3.16");
  });
});

describe("Davflare Chrome extension / #134 + quick-save restored notification", () => {
  const bgJs = fs.readFileSync(path.join(extDir, "background.js"), "utf8");
  const quickJs = fs.readFileSync(path.join(extDir, "quickSave.js"), "utf8");

  test("quick save reports status restored and the notification says 已从回收站恢复", () => {
    expect(quickJs).toContain('status: early.restored ? "restored" : "saved"');
    expect(quickJs).toContain('status: add.restored ? "restored" : "saved"');
    expect(bgJs).toContain('saveRestored: "已从回收站恢复。"');
    expect(bgJs).toContain('result.status === "restored"');
    // Normal saves keep the old wording.
    expect(bgJs).toContain('saveOk: "已收藏到书签库。"');
  });
});

describe("Davflare Chrome extension / round 4: edge panel + save link + polish", () => {
  const bgJs = fs.readFileSync(path.join(extDir, "background.js"), "utf8");
  const popupHtml = fs.readFileSync(path.join(extDir, "popup.html"), "utf8");
  const popupJs = fs.readFileSync(path.join(extDir, "popup.js"), "utf8");
  const popupCss = fs.readFileSync(path.join(extDir, "popup.css"), "utf8");
  const appJs = fs.readFileSync(path.join(extDir, "bookmarksApp.js"), "utf8");
  const css = fs.readFileSync(path.join(extDir, "bookmarks.css"), "utf8");
  const edgePanelJs = fs.readFileSync(path.join(extDir, "edgePanel.js"), "utf8");

  test("background registers a link context menu wired to saveLink", () => {
    expect(bgJs).toContain('var MENU_SAVE_LINK = "davflare-save-link";');
    expect(bgJs).toContain('contexts: ["link"]');
    expect(bgJs).toContain("if (info.menuItemId === MENU_SAVE_LINK)");
    expect(bgJs).toContain("async function saveLink(info)");
    expect(bgJs).toContain("info.linkUrl");
    // Shared save core: one implementation, two feedback surfaces.
    expect(bgJs).toContain("async function performSave(title, url, extra)");
    expect(bgJs).toContain("async function saveToLibrary(title, url)");
  });

  test("background manages the dynamic edge-panel registration + message router", () => {
    expect(bgJs).toContain('var EDGE_SCRIPT_ID = "davflare-edge-panel";');
    expect(bgJs).toContain('var EDGE_ORIGINS_KEY = "edgePanelOrigins";');
    expect(bgJs).toContain("chrome.scripting.registerContentScripts");
    expect(bgJs).toContain("persistAcrossSessions: true");
    expect(bgJs).toContain("chrome.runtime.onMessage.addListener");
    expect(bgJs).toContain('"davflare-edge-save"');
    expect(bgJs).toContain('"davflare-edge-meta"');
    expect(bgJs).toContain('"davflare-edge-enable"');
    expect(bgJs).toContain('"davflare-edge-disable"');
    expect(bgJs).toContain('"davflare-edge-state"');
    expect(bgJs).toContain('if (command === "toggle-edge-panel") return toggleEdgePanel();');
    // Trash-revive prefill for the panel (#130 semantics).
    expect(bgJs).toContain("Bookmarks.trashedByUrl(model, pageUrl)");
    // onInstalled/onStartup re-sync the registration idempotently.
    expect(bgJs).toContain("ensureEdgeRegistration()");
  });

  test("edgePanel.js ships a shadow-DOM panel talking to the service worker", () => {
    expect(fs.existsSync(path.join(extDir, "edgePanel.js"))).toBe(true);
    expect(edgePanelJs).toContain("attachShadow({ mode: \"closed\" })");
    expect(edgePanelJs).toContain("z-index:2147483647");
    expect(edgePanelJs).toContain("type: \"davflare-edge-save\"");
    expect(edgePanelJs).toContain("type: \"davflare-edge-meta\"");
    expect(edgePanelJs).toContain('"davflare-edge-toggle"');
    expect(edgePanelJs).toContain("prefers-color-scheme:dark");
    expect(edgePanelJs).toContain("prefers-reduced-motion:reduce");
    expect(edgePanelJs).toContain("popupLastFolder");
    expect(edgePanelJs).toContain("edgePanelSide");
  });

  test("popup hosts the per-site enable/disable toggle", () => {
    expect(popupHtml).toContain('id="edgeSection"');
    expect(popupHtml).toContain('id="edgeToggleBtn"');
    expect(popupJs).toContain("chrome.permissions.request({ origins: [edge.pattern] })");
    expect(popupJs).toContain('"davflare-edge-state"');
    expect(popupJs).toContain('"davflare-edge-enable"');
    expect(popupJs).toContain('"davflare-edge-disable"');
    expect(popupJs).toContain("edgeTitle:");
  });

  test("appearance polish: sticky topbar, per-scene empty art, row hover, shortcut rows", () => {
    // Sticky frosted topbar (solid fallback declared before color-mix).
    expect(css).toMatch(/\.topbar \{[^}]*position: sticky/s);
    expect(css).toContain("backdrop-filter: blur(12px)");
    expect(css).toContain("color-mix(in srgb, var(--paper) 82%, transparent)");
    // Rows lift like cards (round 4).
    expect(css).toMatch(/\.row:hover \{[^}]*translateY\(-1px\)/s);
    // Per-scene empty-state art + plumbing.
    expect(appJs).toContain("function emptyArt(kind)");
    expect(appJs).toContain('art: "trash"');
    expect(appJs).toContain('art: "duplicates"');
    expect(appJs).toContain('art: "search"');
    expect(appJs).toContain('art: "library"');
    // Settings shortcuts row reads live chrome.commands values.
    expect(appJs).toContain("function renderShortcuts()");
    expect(popupHtml).toContain('id="shortcutHint"');
    expect(popupJs).toContain("chrome.commands.getAll");
    // Popup scrollbars mirror the library shell.
    expect(popupCss).toContain("::-webkit-scrollbar-thumb");
  });
});
