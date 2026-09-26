/// <reference types="node" />
/**
 * 卡片 ⋯ 菜单的开关行为（真实 wirePopMenus/closePopMenus 切片 + jsdom）：
 * 打开时同步 aria-expanded，点击外部/窗口 resize 收起并清理 .flip。
 * wirePopMenus 绑定的是 document 级监听，测试共享一次绑定的 harness；
 * 翻转方向判定（popMenuFlipNeeded）是纯函数，数值组合见
 * extensionBookmarksView.test.ts，jsdom 无布局不在此断言。
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const nodeRequire = createRequire(import.meta.url);
const extDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../extension"
);
const appJs = fs.readFileSync(path.join(extDir, "bookmarksApp.js"), "utf8");
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

const fns = (() => {
  document.body.innerHTML = `
    <div class="card">
      <div class="cardMenuWrap">
        <button class="cardMore menuToggle" type="button" aria-haspopup="true" aria-expanded="false">⋯</button>
        <div class="popMenu"><button class="menuItem" type="button">编辑</button></div>
      </div>
    </div>
    <div id="outside"></div>`;
  const src = [
    ...["function closePopMenus(", "function wirePopMenus("].map(sliceBlock),
    "return { closePopMenus: closePopMenus, wirePopMenus: wirePopMenus };",
  ].join("\n");
  const out = new Function("document", "BookmarksView", src)(
    document,
    BookmarksView
  ) as { closePopMenus: () => void; wirePopMenus: () => void };
  // document/window 级监听只绑一次（与真实初始化一致），避免跨用例累积
  out.wirePopMenus();
  return out;
})();

const menu = () => document.querySelector(".popMenu") as HTMLElement;
const toggle = () => document.querySelector(".menuToggle") as HTMLButtonElement;

beforeEach(() => {
  fns.closePopMenus();
});

describe("card ⋯ menu open/close (real wirePopMenus)", () => {
  test("toggle click opens the menu and expands aria state", () => {
    toggle().click();
    expect(menu().classList.contains("open")).toBe(true);
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    fns.closePopMenus();
    expect(menu().classList.contains("open")).toBe(false);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
  });

  test("closePopMenus clears the downward flip alongside the open state", () => {
    menu().classList.add("open", "flip");
    toggle().setAttribute("aria-expanded", "true");
    fns.closePopMenus();
    expect(menu().classList.contains("open")).toBe(false);
    expect(menu().classList.contains("flip")).toBe(false);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
  });

  test("outside click closes the open menu", () => {
    toggle().click();
    expect(menu().classList.contains("open")).toBe(true);
    (document.getElementById("outside") as HTMLElement).click();
    expect(menu().classList.contains("open")).toBe(false);
    expect(menu().classList.contains("flip")).toBe(false);
  });

  test("window resize collapses the open menu", () => {
    toggle().click();
    expect(menu().classList.contains("open")).toBe(true);
    window.dispatchEvent(new window.Event("resize"));
    expect(menu().classList.contains("open")).toBe(false);
  });
});
