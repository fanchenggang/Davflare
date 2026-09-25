/// <reference types="node" />
/**
 * #137 edge panel permission flow + link-save title. Pure helpers are unit
 * tested; the flows run the REAL extension/background.js inside a vm with a
 * fake `chrome` (storage / permissions / scripting / tabs / events).
 */
import * as fs from "fs";
import * as path from "path";
import * as vm from "vm";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const nodeRequire = createRequire(import.meta.url);
const extDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../extension");
const edgePermsPath = path.join(extDir, "edgePerms.js");
const EdgePerms = fs.existsSync(edgePermsPath) ? nodeRequire(edgePermsPath) : null;

type Listener = (...args: unknown[]) => unknown;
function event() {
  const listeners: Listener[] = [];
  return {
    listeners,
    addListener: (fn: Listener) => listeners.push(fn),
    fire: (...args: unknown[]) => Promise.all(listeners.map((fn) => fn(...args))),
  };
}

type Script = { id: string; matches: string[]; js: string[] };

function loadBackground(opts: { instanceUrl?: string; granted?: string[] } = {}) {
  const local: Record<string, unknown> = { davUsername: "u", davPassword: "p" };
  const sync: Record<string, unknown> = { instanceUrl: opts.instanceUrl || "https://drive.example.net" };
  const granted = new Set(opts.granted || []);
  let registered: Script[] = [];
  const calls = {
    remove: [] as string[][],
    execFiles: [] as { tabId: number }[],
    execFunc: [] as { target: { tabId: number; frameIds?: number[] }; args: unknown[]; func: unknown }[],
    sent: [] as { tabId: number; msg: unknown }[],
    saved: [] as { title: string; url: string }[],
  };
  let execFuncImpl: (arg: unknown) => Promise<unknown> = async () => [{ result: "" }];
  const get = (store: Record<string, unknown>) => async (keys: string[] | string) => {
    const out: Record<string, unknown> = {};
    for (const k of Array.isArray(keys) ? keys : [keys]) if (k in store) out[k] = store[k];
    return out;
  };
  const permissions = {
    onAdded: event(),
    onRemoved: event(),
    contains: async (p: { origins: string[] }) => p.origins.every((o) => granted.has(o)),
    request: async (p: { origins: string[] }) => {
      p.origins.forEach((o) => granted.add(o));
      return true;
    },
    remove: async (p: { origins: string[] }) => {
      calls.remove.push(p.origins);
      p.origins.forEach((o) => granted.delete(o));
      // Chrome dispatches onRemoved as a separate event; remove() doesn't wait for listeners.
      setTimeout(() => void permissions.onRemoved.fire({ origins: p.origins, permissions: [] }), 0);
      return true;
    },
  };
  const runtime = {
    onMessage: event(),
    onInstalled: event(),
    onStartup: event(),
    lastError: undefined,
    getURL: (p: string) => "chrome-extension://id/" + p,
    getManifest: () => ({ version: "test" }),
  };
  const chrome = {
    storage: {
      local: {
        get: get(local),
        set: async (v: Record<string, unknown>) => void Object.assign(local, v),
        remove: async (k: string | string[]) => {
          for (const key of Array.isArray(k) ? k : [k]) delete local[key];
        },
      },
      sync: { get: get(sync), set: async (v: Record<string, unknown>) => void Object.assign(sync, v) },
      onChanged: event(),
    },
    permissions,
    runtime,
    scripting: {
      getRegisteredContentScripts: async (f: { ids: string[] }) =>
        registered.filter((s) => f.ids.includes(s.id)),
      unregisterContentScripts: async (f: { ids: string[] }) => {
        registered = registered.filter((s) => !f.ids.includes(s.id));
      },
      registerContentScripts: async (list: Script[]) => {
        for (const s of list) {
          if (registered.some((r) => r.id === s.id)) throw new Error("Duplicate script ID");
          registered.push(s);
        }
      },
      executeScript: async (arg: { target: { tabId: number; frameIds?: number[] }; files?: string[]; func?: unknown; args?: unknown[] }) => {
        if (arg.files) {
          calls.execFiles.push({ tabId: arg.target.tabId });
          return [{ result: undefined }];
        }
        calls.execFunc.push({ target: arg.target, args: arg.args || [], func: arg.func });
        return execFuncImpl(arg);
      },
    },
    tabs: {
      sendMessage: async (tabId: number, msg: unknown) => void calls.sent.push({ tabId, msg }),
      query: async () => [],
      create: async () => ({}),
    },
    contextMenus: { onClicked: event(), create: () => undefined, removeAll: (cb?: () => void) => cb && cb() },
    commands: { onCommand: event(), getAll: (cb: (c: unknown[]) => void) => cb([]) },
    omnibox: {
      onInputStarted: event(),
      onInputChanged: event(),
      onInputEntered: event(),
      setDefaultSuggestion: () => undefined,
    },
    notifications: { create: () => undefined },
    action: { setBadgeText: () => undefined, setBadgeBackgroundColor: () => undefined, openPopup: async () => undefined },
    i18n: { getUILanguage: () => "zh-CN" },
  };
  const ctx: Record<string, unknown> = {
    chrome,
    console,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    navigator: { language: "zh-CN" },
    fetch: async () => {
      throw new Error("no network in tests");
    },
  };
  ctx.self = ctx;
  ctx.importScripts = (...files: string[]) => {
    for (const f of files) vm.runInContext(fs.readFileSync(path.join(extDir, f), "utf8"), ctx, { filename: f });
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(extDir, "background.js"), "utf8"), ctx, {
    filename: "background.js",
  });
  // Don't touch WebDAV: capture what would be saved.
  ctx.performSave = async (title: string, url: string) => {
    calls.saved.push({ title, url });
    return { ok: true, status: "saved" };
  };
  const message = (msg: unknown) =>
    new Promise((resolve) => {
      const keep = runtime.onMessage.listeners[0](msg, {}, resolve);
      if (keep !== true) resolve(undefined);
    });
  return {
    chrome,
    local,
    granted,
    calls,
    registered: () => registered,
    message,
    setExecFunc: (fn: (arg: unknown) => Promise<unknown>) => (execFuncImpl = fn),
    settle: () => new Promise((r) => setTimeout(r, 20)),
  };
}

const PAGE = "https://example.org/some/page?x=1";
const PATTERN = "https://example.org/*";

describe("edgePerms.js pure helpers (#137)", () => {
  test("module exists and derives origin patterns", () => {
    expect(EdgePerms).toBeTruthy();
    expect(EdgePerms.originPatternOf(PAGE)).toBe(PATTERN);
    expect(EdgePerms.originPatternOf("chrome://extensions")).toBe("");
    expect(EdgePerms.originPatternOf("nope")).toBe("");
  });

  test("the configured Davflare server origin is protected", () => {
    expect(EdgePerms.isProtectedPattern("https://drive.example.net/*", "https://drive.example.net/sub/")).toBe(true);
    expect(EdgePerms.isProtectedPattern(PATTERN, "https://drive.example.net")).toBe(false);
    expect(EdgePerms.isProtectedPattern(PATTERN, "")).toBe(false);
  });

  test("pendingMatch accepts only a fresh pending enable for an added origin", () => {
    const now = 1_000_000_000;
    const pending = { pattern: PATTERN, pageUrl: PAGE, tabId: 7, at: now - 5000 };
    expect(EdgePerms.pendingMatch(pending, [PATTERN], now)).toBe(PATTERN);
    expect(EdgePerms.pendingMatch(pending, ["https://other.test/*"], now)).toBe("");
    expect(EdgePerms.pendingMatch({ ...pending, at: now - 11 * 60 * 1000 }, [PATTERN], now)).toBe("");
    expect(EdgePerms.pendingMatch({ ...pending, pattern: "https://evil.test/*" }, ["https://evil.test/*"], now)).toBe("");
    expect(EdgePerms.pendingMatch(null, [PATTERN], now)).toBe("");
  });

  test("linkTitle falls back scraped → linkText → selection → URL", () => {
    const url = "https://iana.org/domains/example";
    expect(EdgePerms.linkTitle({ scraped: "  Learn   more ", linkUrl: url })).toBe("Learn more");
    expect(EdgePerms.linkTitle({ scraped: "", linkText: "FF text", linkUrl: url })).toBe("FF text");
    expect(EdgePerms.linkTitle({ scraped: "", selectionText: "picked", linkUrl: url })).toBe("picked");
    expect(EdgePerms.linkTitle({ linkUrl: url })).toBe(url);
  });

  test("findLinkText reads the anchor text / aria-label / img alt for the clicked href", () => {
    document.body.innerHTML = `
      <a href="https://iana.org/domains/example">Learn
         more</a>
      <a href="/rel/path" aria-label="Relative label"><svg></svg></a>
      <a href="https://img.test/"><img alt="Logo alt"></a>
      <a href="https://dup.test/">First</a><a href="https://dup.test/">Second pick</a>`;
    expect(EdgePerms.findLinkText("https://iana.org/domains/example", "")).toBe("Learn more");
    expect(EdgePerms.findLinkText(new URL("/rel/path", document.baseURI).href, "")).toBe("Relative label");
    expect(EdgePerms.findLinkText("https://img.test/", "")).toBe("Logo alt");
    expect(EdgePerms.findLinkText("https://dup.test/", "")).toBe("First");
    expect(EdgePerms.findLinkText("https://dup.test/", "pick")).toBe("Second pick");
    expect(EdgePerms.findLinkText("https://missing.test/", "")).toBe("");
    // Self-contained: survives Chrome's source serialisation.
    const clone = new Function(`return (${EdgePerms.findLinkText.toString()})`)();
    expect(clone("https://iana.org/domains/example", "")).toBe("Learn more");
    document.body.innerHTML = "";
  });
});

describe("background.js edge panel flows (#137, real service-worker code)", () => {
  test("1. one click + Allow: onAdded finishes enabling after the popup closed", async () => {
    const bg = loadBackground();
    // What the popup does right before permissions.request (then it dies).
    bg.local.edgePanelPending = { pattern: PATTERN, pageUrl: PAGE, tabId: 42, at: Date.now() };
    bg.granted.add(PATTERN); // user clicked Allow
    await bg.chrome.permissions.onAdded.fire({ origins: [PATTERN], permissions: [] });
    await bg.settle();
    expect(bg.local.edgePanelOrigins).toEqual([PATTERN]);
    expect(bg.registered()).toHaveLength(1);
    expect(bg.registered()[0].matches).toEqual([PATTERN]);
    expect(bg.calls.execFiles).toEqual([{ tabId: 42 }]); // handle appears without reload
    expect(bg.local.edgePanelPending).toBeUndefined();
    // Reopened popup reflects it.
    const state = (await bg.message({ type: "davflare-edge-state", pageUrl: PAGE })) as Record<string, unknown>;
    expect(state).toMatchObject({ enabled: true, granted: true, pattern: PATTERN, serverSite: false });
  });

  test("popup surviving the prompt + onAdded both enabling → one registration, one inject", async () => {
    const bg = loadBackground();
    bg.local.edgePanelPending = { pattern: PATTERN, pageUrl: PAGE, tabId: 42, at: Date.now() };
    bg.granted.add(PATTERN);
    await Promise.all([
      bg.chrome.permissions.onAdded.fire({ origins: [PATTERN], permissions: [] }),
      bg.message({ type: "davflare-edge-enable", pageUrl: PAGE, tabId: 42 }),
    ]);
    await bg.settle();
    expect(bg.registered()).toHaveLength(1);
    expect(bg.calls.execFiles).toHaveLength(1);
  });

  test("unrelated or stale grants do not enable anything", async () => {
    const bg = loadBackground();
    bg.local.edgePanelPending = { pattern: PATTERN, pageUrl: PAGE, tabId: 1, at: Date.now() - 60 * 60 * 1000 };
    bg.granted.add(PATTERN);
    await bg.chrome.permissions.onAdded.fire({ origins: [PATTERN], permissions: [] });
    await bg.chrome.permissions.onAdded.fire({ origins: ["https://snapshot.test/*"], permissions: [] });
    await bg.settle();
    expect(bg.registered()).toHaveLength(0);
    expect(bg.local.edgePanelOrigins).toBeUndefined();
  });

  test("state self-heals when granted with a fresh pending but onAdded never ran", async () => {
    const bg = loadBackground();
    bg.local.edgePanelPending = { pattern: PATTERN, pageUrl: PAGE, tabId: 9, at: Date.now() };
    bg.granted.add(PATTERN);
    const state = (await bg.message({ type: "davflare-edge-state", pageUrl: PAGE })) as Record<string, unknown>;
    expect(state.enabled).toBe(true);
    expect(bg.registered()[0].matches).toEqual([PATTERN]);
  });

  test("3. disable revokes the site permission, unregisters and removes the panel", async () => {
    const bg = loadBackground({ granted: [PATTERN] });
    bg.local.edgePanelOrigins = [PATTERN];
    await bg.message({ type: "davflare-edge-enable", pageUrl: PAGE, tabId: 3 }); // sync registration
    const reply = (await bg.message({ type: "davflare-edge-disable", pageUrl: PAGE, tabId: 3 })) as Record<string, unknown>;
    expect(reply).toMatchObject({ ok: true, revoked: true, keptForServer: false });
    await bg.settle(); // the async onRemoved event must be harmless afterwards
    expect(bg.calls.remove).toEqual([[PATTERN]]);
    expect(bg.granted.has(PATTERN)).toBe(false);
    expect(bg.registered()).toHaveLength(0);
    expect(bg.local.edgePanelOrigins).toEqual([]);
    expect(bg.calls.sent).toContainEqual({ tabId: 3, msg: { type: "davflare-edge-remove" } });
  });

  test("3. disabling on the Davflare server origin never revokes it (sync needs it)", async () => {
    const server = "https://drive.example.net/*";
    const bg = loadBackground({ instanceUrl: "https://drive.example.net", granted: [server] });
    bg.local.edgePanelOrigins = [server];
    const state = (await bg.message({ type: "davflare-edge-state", pageUrl: "https://drive.example.net/bookmarks" })) as Record<string, unknown>;
    expect(state.serverSite).toBe(true);
    const reply = (await bg.message({ type: "davflare-edge-disable", pageUrl: "https://drive.example.net/x" })) as Record<string, unknown>;
    expect(reply).toMatchObject({ ok: true, revoked: false, keptForServer: true });
    expect(bg.calls.remove).toEqual([]);
    expect(bg.granted.has(server)).toBe(true);
    expect(bg.local.edgePanelOrigins).toEqual([]);
  });

  test("revoked elsewhere (chrome://extensions) → origin dropped from the panel list", async () => {
    const bg = loadBackground({ granted: [PATTERN, "https://b.test/*"] });
    bg.local.edgePanelOrigins = [PATTERN, "https://b.test/*"];
    await bg.chrome.permissions.onRemoved.fire({ origins: [PATTERN], permissions: [] });
    await bg.settle();
    expect(bg.local.edgePanelOrigins).toEqual(["https://b.test/*"]);
    expect(bg.registered()[0].matches).toEqual(["https://b.test/*"]);
  });

  test("2. Save link reads the real anchor text in the clicked frame", async () => {
    const bg = loadBackground();
    bg.setExecFunc(async () => [{ result: "Learn more" }]);
    await bg.chrome.contextMenus.onClicked.fire(
      { menuItemId: "davflare-save-link", linkUrl: "https://iana.org/domains/example", frameId: 2 },
      { id: 11, url: "https://example.com/" }
    );
    expect(bg.calls.saved).toEqual([{ title: "Learn more", url: "https://iana.org/domains/example" }]);
    const call = bg.calls.execFunc[0];
    expect(call.target).toEqual({ tabId: 11, frameIds: [2] });
    expect(call.args).toEqual(["https://iana.org/domains/example", ""]);
    expect(String(call.func)).toContain("function findLinkText");
  });

  test("2. Save link falls back to the selection, then the URL, when the frame is off-limits", async () => {
    const bg = loadBackground();
    bg.setExecFunc(async () => {
      throw new Error("Cannot access contents of the page");
    });
    await bg.chrome.contextMenus.onClicked.fire(
      { menuItemId: "davflare-save-link", linkUrl: "https://a.test/x", selectionText: "Selected words", frameId: 0 },
      { id: 1 }
    );
    await bg.chrome.contextMenus.onClicked.fire(
      { menuItemId: "davflare-save-link", linkUrl: "https://a.test/y", frameId: 0 },
      { id: 1 }
    );
    expect(bg.calls.saved).toEqual([
      { title: "Selected words", url: "https://a.test/x" },
      { title: "https://a.test/y", url: "https://a.test/y" },
    ]);
  });
});

describe("#137 UI wiring (popup / edgePanel / settings)", () => {
  const read = (f: string) => fs.readFileSync(path.join(extDir, f), "utf8");

  test("popup records the pending enable BEFORE permissions.request and clears it on denial", () => {
    const src = read("popup.js");
    const body = src.slice(src.indexOf("async function onEdgeToggle"));
    const setAt = body.indexOf("chrome.storage.local.set(pending)");
    const requestAt = body.indexOf("chrome.permissions.request");
    expect(src).toContain('var EDGE_PENDING_KEY = "edgePanelPending"');
    expect(setAt).toBeGreaterThan(-1);
    expect(requestAt).toBeGreaterThan(setAt);
    // Not awaited: the user gesture must still reach permissions.request.
    expect(body.slice(setAt - 10, setAt)).not.toContain("await");
    expect(body).toContain("chrome.storage.local.remove(EDGE_PENDING_KEY)");
  });

  test("disable text is truthful: revoked / kept for the server / Chrome refused", () => {
    const src = read("popup.js");
    for (const key of ["edgeRevoked", "edgeKeptServer", "edgeRevokeFailed", "edgeDescServer"]) {
      expect(src.match(new RegExp(`\\b${key}:`, "g"))?.length).toBe(2); // EN + ZH
    }
    expect(src).toContain("if (reply.keptForServer) return state.t.edgeKeptServer;");
    expect(src).toContain("if (reply.revoked) return state.t.edgeRevoked;");
  });

  test("edge panel removes itself when the site is disabled", () => {
    const src = read("edgePanel.js");
    expect(src).toContain('msg.type === "davflare-edge-remove"');
  });

  test("shortcut shows 未设置 with a way to open chrome://extensions/shortcuts", () => {
    const popup = read("popup.js");
    expect(read("popup.html")).toContain('id="edgeShortcutSet"');
    expect(popup).toContain('shortcutNone: "未设置"');
    expect(popup).toMatch(/\$\("edgeShortcutSet"\)\.addEventListener\("click"[\s\S]{0,120}chrome:\/\/extensions\/shortcuts/);
    expect(read("bookmarks.html")).toContain('id="shortcutsOpen"');
    expect(read("bookmarks.html")).toContain('id="shortcutsUpgradeHint"');
    expect(read("bookmarksApp.js")).toMatch(/\$\("shortcutsOpen"\)[\s\S]{0,200}chrome:\/\/extensions\/shortcuts/);
  });

  test("link text scraping needs no new persistent host permissions", () => {
    const manifest = JSON.parse(read("manifest.json"));
    expect(manifest.permissions).toEqual(expect.arrayContaining(["activeTab", "scripting", "contextMenus"]));
    expect(manifest.host_permissions || []).toEqual([]);
  });
});
