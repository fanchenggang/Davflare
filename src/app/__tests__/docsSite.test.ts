import MarkdownIt from "markdown-it";
import { vi } from "vitest";
import {
  ATTACHMENT_DIRS,
  DOCS_PAGE_NAME_MAX,
  DOCS_SEARCH_LOOKUPS,
  ParsedDoc,
  createDocsMarkdown,
  desiredPageName,
  docsScopeOf,
  isExternalUrl,
  isInDocsScope,
  isPageNameShortened,
  loadDocsMarkdown,
  parseDoc,
  refId,
  renderDocsSite,
  resolveDocImages,
  resolveRelativeKey,
  sortDocs,
} from "../docsSite";
import { FileItem } from "../types";

const md = createDocsMarkdown(MarkdownIt);

function doc(key: string, text: string): ParsedDoc {
  return parseDoc(md, { key, name: key.split("/").pop()!, size: text.length }, text);
}

function item(key: string, size = 100, isDir = false): FileItem {
  return { key, name: key.split("/").pop()!, isDir, size, uploaded: "", contentType: "" };
}

/** 渲染单篇正文（不含外壳），images: target → assets 相对路径。 */
function body(text: string, opts: { key?: string; images?: Record<string, string>; pages?: Record<string, string> } = {}) {
  const parsed = doc(opts.key ?? "notes/a.md", text);
  const byRef = new Map<string, string>();
  const imageRels = new Map<string, string>();
  for (const ref of parsed.refs) {
    const rel = opts.images?.[ref.target];
    if (rel) {
      byRef.set(refId(ref.kind, parsed.dir, ref.target), `drive/${ref.target}`);
      imageRels.set(`drive/${ref.target}`, rel);
    }
  }
  const extra = Object.entries(opts.pages ?? {}).map(([key]) => doc(key, "# x"));
  const docs = [parsed, ...extra];
  const site = renderDocsSite(md, {
    lang: "en",
    title: "Site",
    docs,
    pageNames: [desiredPageName(parsed), ...Object.values(opts.pages ?? {})],
    byRef,
    imageRels,
  });
  const html = site.pages[0].html;
  return html.slice(html.indexOf('<article class="md">') + 20, html.indexOf("</article>"));
}

describe("docs markdown: XSS", () => {
  test("raw HTML is escaped, not rendered", () => {
    const html = body('<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\nhi <b onclick="x()">b</b>');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img src=x/i);
    expect(html).not.toMatch(/<b onclick/i);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  test("javascript:/vbscript:/data: links are not turned into links", () => {
    const html = body(
      "[a](javascript:alert(1)) [b](JAVASCRIPT:alert(1)) [c](vbscript:msgbox) [d](data:text/html;base64,PHNjcmlwdD4=) <javascript:alert(1)>"
    );
    expect(html).not.toMatch(/href="\s*javascript:/i);
    expect(html).not.toMatch(/href="vbscript:/i);
    expect(html).not.toMatch(/href="data:/i);
    expect(html).not.toContain("<a");
    // 以原文显示
    expect(html).toContain("[a](javascript:alert(1))");
  });

  test("entity-obfuscated javascript: does not become an executable href", () => {
    const html = body("[x](java&#x09;script:alert(1)) [y](&#106;avascript:alert(1))");
    const doc2 = new DOMParser().parseFromString(html, "text/html");
    for (const a of Array.from(doc2.querySelectorAll("a"))) {
      const href = a.getAttribute("href") || "";
      expect(href.replace(/[\s\u0000-\u001f]/g, "").toLowerCase().startsWith("javascript:")).toBe(false);
    }
  });

  test("image alt/title and wiki targets are escaped", () => {
    const html = body('![x" onerror="alert(1)](pic.png "t\\" onload=\\"x") ![[<b>.png]] [[<i>note</i>]]', {
      images: { "pic.png": "assets/pic.png" },
    });
    const parsed = new DOMParser().parseFromString(html, "text/html");
    expect(parsed.querySelectorAll("script, b, i")).toHaveLength(0);
    for (const element of Array.from(parsed.querySelectorAll("*"))) {
      for (const attr of Array.from(element.attributes)) expect(attr.name.startsWith("on")).toBe(false);
    }
    expect(html).toContain("![[&lt;b&gt;.png]]");
  });

  test("the generated page shell has no script and escapes the site/page titles", () => {
    const parsed = doc("a.md", "# <img src=x onerror=alert(1)>\n\ntext");
    const site = renderDocsSite(md, {
      lang: "zh",
      title: "<script>x</script>",
      docs: [parsed],
      pageNames: ["a.html"],
      byRef: new Map(),
      imageRels: new Map(),
    });
    for (const html of [site.pages[0].html, site.index]) {
      expect(html).not.toMatch(/<script/i);
      expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
      expect(html).not.toContain("<img src=x");
    }
    expect(site.index).toContain("prefers-color-scheme");
  });
});

describe("docs markdown: images", () => {
  test("collects relative ![]() and Obsidian ![[ ]] refs, skips external", () => {
    const parsed = doc(
      "notes/a.md",
      "![a](img/one.png) ![b](../two%20x.jpg) ![[three.webp|300]] ![c](https://e.com/x.png) ![d](data:image/png;base64,AAAA) ![[Other note]]"
    );
    expect(parsed.refs).toEqual([
      { kind: "md", target: "img/one.png" },
      { kind: "md", target: "../two x.jpg" },
      { kind: "wiki", target: "three.webp" },
      { kind: "wiki", target: "Other note" },
    ]);
  });

  test("resolved images are rewritten to assets/, with Obsidian width", () => {
    const html = body("![one](img/one.png) ![[three.webp|300]] ![[sp ace.png]]", {
      images: { "img/one.png": "assets/one.png", "three.webp": "assets/three.webp", "sp ace.png": "assets/sp ace.png" },
    });
    expect(html).toContain('<img src="assets/one.png" alt="one">');
    expect(html).toContain('<img src="assets/three.webp" alt="three" width="300">');
    expect(html).toContain('src="assets/sp%20ace.png"');
  });

  test("missing images keep their original text", () => {
    const html = body("![lost](nope.png) ![[gone.png]] ![[doc.pdf]]");
    expect(html).toContain("![lost](nope.png)");
    expect(html).toContain("![[gone.png]]");
    expect(html).toContain("![[doc.pdf]]");
    expect(html).not.toContain("<img");
  });

  test("external images stay as plain markdown images", () => {
    expect(body("![x](https://example.com/a.png)")).toContain('<img src="https://example.com/a.png" alt="x">');
  });

  test("rendering the same tokens twice gives the same output (retry-safe)", () => {
    const parsed = doc("a.md", "![one](one.png) [b](b.md)");
    const b = doc("b.md", "b");
    const options = {
      lang: "en" as const,
      title: "S",
      docs: [parsed, b],
      pageNames: ["a.html", "b.html"],
      byRef: new Map([[refId("md", "", "one.png"), "one.png"]]),
      imageRels: new Map([["one.png", "assets/one.png"]]),
    };
    const first = renderDocsSite(md, options).pages[0].html;
    const second = renderDocsSite(md, options).pages[0].html;
    expect(second).toBe(first);
    expect(first).toContain('src="assets/one.png"');
    expect(first).toContain('href="b.html"');
  });
});

describe("docs markdown: links and titles", () => {
  test("relative md links to docs in this publish become .html (hash kept)", () => {
    const html = body("[b](b.md) [c](./sub/c.md#part) [x](missing.md) [ext](https://e.com/a.md) [h](#top)", {
      key: "n/a.md",
      pages: { "n/b.md": "b.html", "n/sub/c.md": "c-page.html" },
    });
    expect(html).toContain('<a href="b.html">b</a>');
    expect(html).toContain('<a href="c-page.html#part">c</a>');
    expect(html).toContain('<a href="missing.md">x</a>');
    expect(html).toContain('<a href="https://e.com/a.md">ext</a>');
    expect(html).toContain('<a href="#top">h</a>');
  });

  test("wikilinks link to published notes; others keep original text", () => {
    const html = body("[[B]] [[b|alias]] [[b#Heading]] [[nope]]", {
      key: "a.md",
      pages: { "b.md": "b.html" },
    });
    expect(html).toContain('<a href="b.html">B</a>');
    expect(html).toContain('<a href="b.html">alias</a>');
    expect(html).toContain('<a href="b.html">b</a>');
    expect(html).toContain("[[nope]]");
  });

  test("title is the first # heading, otherwise the file name", () => {
    expect(doc("x/Note 1.md", "intro\n\n## sub\n\n# Real *Title*\n\n# second").title).toBe("Real Title");
    expect(doc("x/Note 1.md", "## only h2").title).toBe("Note 1");
    expect(doc("x/Setext.md", "Big\n===\n").title).toBe("Big");
  });

  test("sidebar sorts by file name (numeric aware) and pages get stem.html", () => {
    const docs = sortDocs([doc("10.md", ""), doc("2.md", ""), doc("a.md", "")]);
    expect(docs.map((d) => d.name)).toEqual(["2.md", "10.md", "a.md"]);
    expect(desiredPageName({ name: "My Note.md" })).toBe("My Note.html");
    expect(desiredPageName({ name: ".md" })).toBe("page.html");
  });

  test("index lists docs with titles; pages mark the current entry", () => {
    const a = doc("a.md", "# Alpha");
    const b = doc("b.md", "plain");
    const site = renderDocsSite(md, {
      lang: "zh",
      title: "笔记",
      docs: [a, b],
      pageNames: ["a.html", "b.html"],
      byRef: new Map(),
      imageRels: new Map(),
    });
    expect(site.index).toContain("2 篇文档");
    expect(site.index).toContain('<a href="a.html">Alpha<small>a.md</small></a>');
    expect(site.pages[1].html).toContain('<a href="b.html" aria-current="page">b</a>');
    expect(site.pages[1].html).toContain("<title>b · 笔记 · Davflare</title>");
  });
});

describe("path helpers", () => {
  test("resolveRelativeKey", () => {
    expect(resolveRelativeKey("a/b", "c.png")).toBe("a/b/c.png");
    expect(resolveRelativeKey("a/b", "../c.png")).toBe("a/c.png");
    expect(resolveRelativeKey("a/b", "./x/../c.png?v=1#f")).toBe("a/b/c.png");
    expect(resolveRelativeKey("a", "../../c.png")).toBeNull();
    expect(resolveRelativeKey("a", "/root.png")).toBe("root.png");
    expect(resolveRelativeKey("a", "x\\y.png")).toBeNull();
    expect(resolveRelativeKey("a", "_$flaredrive$/x.png")).toBeNull();
    expect(resolveRelativeKey("", "")).toBeNull();
  });

  test("isExternalUrl", () => {
    expect(isExternalUrl("https://x")).toBe(true);
    expect(isExternalUrl("//cdn/x.png")).toBe(true);
    expect(isExternalUrl("mailto:a@b")).toBe(true);
    expect(isExternalUrl("img/x.png")).toBe(false);
  });

  test("loadDocsMarkdown lazily loads markdown-it once", async () => {
    const first = await loadDocsMarkdown();
    expect(await loadDocsMarkdown()).toBe(first);
    expect(first.render("<b>x</b>")).toContain("&lt;b&gt;");
  });
});

describe("resolveDocImages", () => {
  function fakeDrive(keys: string[]) {
    const all = keys.map((key) => (key.endsWith("/") ? item(key.slice(0, -1), 0, true) : item(key)));
    const listDir = vi.fn(async (dir: string) =>
      all.filter((entry) => entry.key.split("/").slice(0, -1).join("/") === dir)
    );
    return { listDir, all };
  }

  test("relative refs, ancestors, attachment folders; non-raster not counted, missing counted", async () => {
    const { listDir } = fakeDrive([
      "vault/",
      "vault/notes/",
      "vault/notes/img/",
      "vault/notes/img/one.png",
      "vault/root.png",
      "vault/attachments/",
      "vault/attachments/att.jpg",
      "vault/notes/pic.svg",
    ]);
    const a = doc("vault/notes/a.md", "![](img/one.png) ![[root.png]] ![[att.jpg]] ![](pic.svg) ![](nope.png) ![[img/one.png]] ![[Other note]]");
    const top = doc("vault/index.md", "hello");
    // 范围 = 所选笔记的公共目录 vault：上级目录、附件目录在范围内
    const result = await resolveDocImages([a, top], { listDir });
    expect(result.byRef.get(refId("md", "vault/notes", "img/one.png"))).toBe("vault/notes/img/one.png");
    expect(result.byRef.get(refId("wiki", "vault/notes", "root.png"))).toBe("vault/root.png");
    expect(result.byRef.get(refId("wiki", "vault/notes", "att.jpg"))).toBe("vault/attachments/att.jpg");
    expect(result.byRef.get(refId("wiki", "vault/notes", "img/one.png"))).toBe("vault/notes/img/one.png");
    expect(result.images.map((image) => image.key)).toEqual([
      "vault/notes/img/one.png",
      "vault/root.png",
      "vault/attachments/att.jpg",
    ]);
    // 只有 nope.png 算没找到：svg 与 ![[笔记]] 不是栅格图片，不计入（#153 计数虚高）
    expect(result.missing).toBe(1);
    expect(result.outOfScope).toBe(0);
    expect(ATTACHMENT_DIRS).toContain("attachments");
  });

  test("#153: ancestors and attachment folders never climb above the published folder", async () => {
    const { listDir } = fakeDrive(["vault/", "vault/notes/", "vault/root.png", "vault/attachments/", "vault/attachments/att.jpg"]);
    const a = doc("vault/notes/a.md", "![[root.png]] ![[att.jpg]]");
    const result = await resolveDocImages([a], { listDir });
    expect(result.images).toEqual([]);
    expect(result.missing).toBe(2);
    expect(listDir.mock.calls.map(([dir]) => dir)).not.toContain("vault");
  });

  test("#153: ../ and / paths outside the published folder are dropped, not read", async () => {
    const { listDir } = fakeDrive(["vault/", "vault/notes/", "vault/secret.png", "secret/", "secret/top.png", "vault/notes/ok.png"]);
    const a = doc(
      "vault/notes/a.md",
      "![](../secret.png) ![](/secret/top.png) ![](../../secret/top.png) ![](ok.png) ![](sub/../ok.png)"
    );
    const result = await resolveDocImages([a], { listDir });
    expect(result.images.map((image) => image.key)).toEqual(["vault/notes/ok.png"]);
    expect(result.outOfScope).toBe(3);
    expect(result.missing).toBe(0);
    for (const [dir] of listDir.mock.calls) expect(dir === "vault/notes" || dir.startsWith("vault/notes/")).toBe(true);
  });

  test("#153: wiki paths with ../ or a leading / stay inside the scope", async () => {
    const { listDir } = fakeDrive(["v/", "v/n/", "v/n/x.png", "x.png", "other/", "other/x.png"]);
    const a = doc("v/n/a.md", "![[../x.png]] ![[/other/x.png]]");
    const result = await resolveDocImages([a], { listDir });
    expect(result.images).toEqual([]);
    expect(result.missing).toBe(2);
  });

  test("#153: a root-level note never searches the drive", async () => {
    const { listDir } = fakeDrive(["Other/", "Other/pic.png"]);
    const search = vi.fn(async () => [item("Other/pic.png")]);
    const result = await resolveDocImages([doc("root.md", "![[pic.png]] ![](Other/pic.png)")], { listDir, search });
    expect(search).not.toHaveBeenCalled();
    expect(result.images).toEqual([]);
    expect(result.missing).toBe(1);
    expect(result.outOfScope).toBe(1);
  });

  test("#153: root-level scope still finds images next to the notes", async () => {
    const { listDir } = fakeDrive(["pic.png"]);
    const result = await resolveDocImages([doc("root.md", "![[pic.png]] ![](pic.png)")], { listDir });
    expect(result.images.map((image) => image.key)).toEqual(["pic.png"]);
  });

  test("search fallback is confined to the published folder subtree and prefers the closest match", async () => {
    const { listDir } = fakeDrive(["vault/", "vault/a/", "vault/a/b/"]);
    const search = vi.fn(async () => [
      item("other/x.png"),
      item("vault/far/away/x.png"),
      item("vault/a/x.png"),
      item("vault/a/b/c/x.png"),
      item("vault/a/xx.png"),
      item("sites/s/x.png"),
    ]);
    const a = doc("vault/a/b/n.md", "![[x.png]]");
    const result = await resolveDocImages([a], { listDir, search });
    expect(result.images.map((image) => image.key)).toEqual(["vault/a/b/c/x.png"]);
    expect(search).toHaveBeenCalledWith("x.png", "vault/a/b/");
  });

  test("search results outside the scope are ignored even if the server returns them", async () => {
    const { listDir } = fakeDrive(["vault/", "vault/a/"]);
    const search = vi.fn(async () => [item("vault/x.png"), item("other/vault/a/x.png")]);
    const result = await resolveDocImages([doc("vault/a/n.md", "![[x.png]]")], { listDir, search });
    expect(result.images).toEqual([]);
    expect(result.missing).toBe(1);
  });

  test("search lookups are capped and failures are treated as missing", async () => {
    const { listDir } = fakeDrive(["v/"]);
    const search = vi.fn(async () => {
      throw new Error("boom");
    });
    const text = Array.from({ length: DOCS_SEARCH_LOOKUPS + 5 }, (_, i) => `![[p${i}.png]]`).join(" ");
    const result = await resolveDocImages([doc("v/n.md", text)], { listDir, search });
    expect(search).toHaveBeenCalledTimes(DOCS_SEARCH_LOOKUPS);
    expect(result.missing).toBe(DOCS_SEARCH_LOOKUPS + 5);
  });

  test("listing failures do not throw", async () => {
    const listDir = vi.fn(async () => {
      throw new Error("net");
    });
    const result = await resolveDocImages([doc("v/n.md", "![](a.png)")], { listDir });
    expect(result.missing).toBe(1);
  });
});

describe("#153 scope helpers", () => {
  test("docsScopeOf is the common folder; mixed top folders collapse to the root", () => {
    expect(docsScopeOf(["v/a.md", "v/b.md"])).toBe("v");
    expect(docsScopeOf(["v/n/a.md", "v/b.md"])).toBe("v");
    expect(docsScopeOf(["v/a.md", "w/b.md"])).toBe("");
    expect(docsScopeOf(["a.md"])).toBe("");
  });

  test("isInDocsScope: subtree only; root scope means root level only", () => {
    expect(isInDocsScope("v/x.png", "v")).toBe(true);
    expect(isInDocsScope("v/a/b/x.png", "v")).toBe(true);
    expect(isInDocsScope("vv/x.png", "v")).toBe(false);
    expect(isInDocsScope("v/../x.png", "v")).toBe(false);
    expect(isInDocsScope("x.png", "")).toBe(true);
    expect(isInDocsScope("a/x.png", "")).toBe(false);
    expect(isInDocsScope("_$flaredrive$/x.png", "")).toBe(false);
  });

  test("desiredPageName shortens long names, keeps .html and surrogate pairs intact", () => {
    const name = desiredPageName({ name: `${"😀".repeat(150)}.md` });
    expect(name.endsWith(".html")).toBe(true);
    expect(name.length).toBeLessThanOrEqual(DOCS_PAGE_NAME_MAX);
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(name)).toBe(false);
    expect(isPageNameShortened({ name: `${"😀".repeat(150)}.md` })).toBe(true);
    expect(isPageNameShortened({ name: "short.md" })).toBe(false);
  });
});
