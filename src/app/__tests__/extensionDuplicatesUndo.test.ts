/// <reference types="node" />
/**
 * #132: duplicates panel must refresh after Undo. Runs the *real* library
 * functions sliced out of extension/bookmarksApp.js (undo toast, duplicates
 * and trash panels, renderAll) in jsdom, with the network/nav bits stubbed.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const nodeRequire = createRequire(import.meta.url);
const extDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../extension");
const appJs = fs.readFileSync(path.join(extDir, "bookmarksApp.js"), "utf8");
const Bookmarks = nodeRequire("../../../extension/bookmarks.js");
const BookmarksView = nodeRequire("../../../extension/bookmarksView.js");

/** `start` … its matching close brace (string/comment-aware), or "" when absent. */
function sliceBlock(start: string): string {
  const at = appJs.indexOf(start);
  if (at < 0) return "";
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
    if (ch === "/" && appJs[i + 1] === "/") {
      i = appJs.indexOf("\n", i); // line comment
      continue;
    }
    if (ch === "/" && appJs[i + 1] === "*") {
      i = appJs.indexOf("*/", i + 2) + 1; // block comment
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return appJs.slice(at, i + 1);
  }
  throw new Error(`unterminated: ${start}`);
}

const FUNCS = [
  "function fmt(",
  "function renderAll(",
  "function renderActiveLibraryPanel(", // new in #132 (absent on old code)
  "function hideUndoToast(",
  "function cancelPendingUndo(",
  "function showUndoToast(",
  "async function undoDelete(",
  "async function deleteBookmarksWithUndo(",
  "function deletedBookmarks(",
  "function trashRows(",
  "function loadTrash(",
  "function trashRow(",
  "function updateTrashActions(",
  "async function restoreFromTrashIds(",
  "function loadDuplicates(",
  "function duplicateGroupCard(",
  "async function keepOldestAllDuplicates(",
];

type Harness = {
  state: { model: { bookmarks: Array<Record<string, unknown>> } };
  appState: { view: string; dupKeep: Record<string, string>; trashSel: Record<string, boolean> };
  undoDelete: () => Promise<void>;
  keepOldestAllDuplicates: () => Promise<void>;
  restoreFromTrashIds: (ids: string[]) => Promise<void>;
  loadDuplicates: () => void;
  loadTrash: () => void;
  flashes: string[];
  flush: () => Promise<void>;
};

function makeHarness(view: string): Harness {
  document.body.innerHTML = `
    <span id="trashHint"></span><button id="trashRestoreSel" hidden></button><button id="trashEmpty"></button>
    <section id="trashList"></section><div id="trashEmptyState" class="hidden"></div>
    <span id="dupHint"></span><button id="dupKeepOldestAll"></button>
    <section id="dupList"></section><div id="dupEmptyState" class="hidden"></div>
    <div id="undoToast" class="hidden"><span id="undoToastMsg"></span><button id="undoBtn"></button></div>`;
  const src = [
    `var COPY = ${sliceBlock("var COPY =").replace(/^var COPY =\s*/, "")};`,
    `var t = COPY.zh; var lang = "zh"; var UNDO_MS = 6000; var pendingUndo = null;`,
    ...FUNCS.map(sliceBlock),
    `return { undoDelete: undoDelete, keepOldestAllDuplicates: keepOldestAllDuplicates,
              restoreFromTrashIds: restoreFromTrashIds, loadDuplicates: loadDuplicates,
              loadTrash: loadTrash };`,
  ].join("\n");
  const state = {
    model: Bookmarks.normalizeModel({
      bookmarks: [
        { id: "a1", url: "https://dup.com/x", title: "A old", added: 1 },
        { id: "a2", url: "https://dup.com/x#2", title: "A new", added: 2 },
        { id: "b1", url: "https://two.com/", title: "B old", added: 3 },
        { id: "b2", url: "https://two.com", title: "B new", added: 4 },
        { id: "c", url: "https://solo.com", title: "C", added: 5 },
      ],
    }),
  };
  const appState = { view, dupKeep: {} as Record<string, string>, trashSel: {} };
  const flashes: string[] = [];
  const noop = () => undefined;
  const fns = new Function(
    "$", "state", "appState", "Bookmarks", "BookmarksView", "document",
    "renderNav", "renderFolderSelect", "renderItems", "renderSyncInfo", "renderPresetSelect",
    "clearSelection", "persist", "flashStatus", "faviconNode", "folderLabel",
    "renderEmptyState", "iconButton", "confirmThen", "hardDeleteIds",
    src
  )(
    (id: string) => document.getElementById(id),
    state, appState, Bookmarks, BookmarksView, document,
    noop, noop, noop, noop, noop,
    noop,
    async () => true,
    (msg: string) => flashes.push(msg),
    () => document.createElement("span"),
    (name: string) => name,
    (el: HTMLElement, opts: { title: string }) => {
      el.textContent = opts.title;
      el.classList.remove("hidden");
    },
    (cls: string, label: string, fn: () => void) => {
      const b = document.createElement("button");
      b.className = cls;
      b.textContent = label;
      b.addEventListener("click", fn);
      return b;
    },
    noop, noop
  );
  return {
    state, appState, flashes, ...fns,
    flush: () => new Promise((r) => setTimeout(r, 0)),
  };
}

const groupCount = () => document.querySelectorAll("#dupList .dupGroup").length;
const hint = () => document.getElementById("dupHint")!.textContent;

describe("#132 duplicates panel refreshes after Undo (real bookmarksApp.js functions)", () => {
  test("single-group keep → group disappears → Undo brings it back in the open panel", async () => {
    const h = makeHarness("duplicates");
    h.loadDuplicates(); // opened the way switchView does
    expect(groupCount()).toBe(2);
    expect(hint()).toBe("2 组书签共用同一 URL。");

    const firstKeep = document.querySelector("#dupList .dupGroup .dupActions button") as HTMLButtonElement;
    firstKeep.click();
    await h.flush();
    expect(groupCount()).toBe(1);
    expect(hint()).toBe("1 组书签共用同一 URL。");

    await h.undoDelete();
    expect(groupCount()).toBe(2);
    expect(hint()).toBe("2 组书签共用同一 URL。");
    expect(h.state.model.bookmarks.every((b) => !b.deleted)).toBe(true);
  });

  test("toast + status use the cleanup wording; undo flashes 已恢复", async () => {
    const h = makeHarness("duplicates");
    h.loadDuplicates();
    (document.querySelector("#dupList .dupGroup .dupActions button") as HTMLButtonElement).click();
    await h.flush();
    // Toast says what the cleanup did (not the generic "已删除 n 个书签").
    expect(document.getElementById("undoToastMsg")!.textContent).toBe("已保留 1 条，1 条重复进入回收站。");
    expect(h.flashes).toContain("已保留 1 条，1 条重复进入回收站。");
    await h.undoDelete();
    expect(h.flashes[h.flashes.length - 1]).toBe("已恢复 1 个书签。");
  });

  test("「全部保留最早」 → 0 groups → Undo restores both groups", async () => {
    const h = makeHarness("duplicates");
    h.loadDuplicates();
    expect(groupCount()).toBe(2);
    await h.keepOldestAllDuplicates();
    expect(groupCount()).toBe(0);
    expect(hint()).toBe("0 组书签共用同一 URL。");
    expect(document.getElementById("undoToastMsg")!.textContent).toBe(
      "已在 2 组中各保留最早 1 条，2 条重复进入回收站。"
    );
    // Kept the oldest copy of each group.
    const trashed = h.state.model.bookmarks.filter((b) => b.deleted).map((b) => b.id);
    expect(trashed.sort()).toEqual(["a2", "b2"]);
    await h.undoDelete();
    expect(groupCount()).toBe(2);
    expect(hint()).toBe("2 组书签共用同一 URL。");
  });

  test("undo while the trash panel is open refreshes the trash list", async () => {
    const h = makeHarness("duplicates");
    h.loadDuplicates();
    await h.keepOldestAllDuplicates();
    h.appState.view = "trash";
    h.loadTrash(); // switched to the trash panel
    expect(document.querySelectorAll("#trashList .trashRow").length).toBe(2);
    await h.undoDelete();
    expect(document.querySelectorAll("#trashList .trashRow").length).toBe(0);
  });

  test("no stale 'moved to trash' flash when Undo beats the persist", async () => {
    const h = makeHarness("duplicates");
    h.loadDuplicates();
    const pending = h.keepOldestAllDuplicates();
    await h.undoDelete(); // user hits 撤销 before the PUT resolves
    await pending;
    expect(h.flashes).not.toContain("已在 2 组中各保留最早 1 条，2 条重复进入回收站。");
    expect(groupCount()).toBe(2);
  });
});
