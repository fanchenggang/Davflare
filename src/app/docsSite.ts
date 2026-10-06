// 文档站：Markdown 只在浏览器里渲染（markdown-it，html:false，保留它默认的危险链接拦截），
// Pages Functions 只负责分批写入（functions/sitePublish.ts 的 kind:"docs"）。
//
// 流程：读 .md → 解析一次 token（顺便收集图片引用与标题）→ 在网盘里找被引用的栅格图片 →
// 服务端分配页面/图片文件名 → 用同一份 token 渲染成 html（渲染规则从 env 取解析结果）。
import type { MarkdownIt as MarkdownItType, StateInline, Token } from "markdown-it";

import { rasterExtension, renderDocsIndex, renderDocsPage, type DocsNavItem, type PageLang } from "../../functions/sitePages";
import { FileItem } from "./types";

export type DocsMarkdown = MarkdownItType;

/** 被引用的图片：md 是 ![](相对路径)，wiki 是 Obsidian 的 ![[x.png]]。 */
export type ImageRefKind = "md" | "wiki";

export interface ParsedDoc {
  key: string;
  name: string;
  size: number;
  dir: string;
  title: string;
  tokens: Token[];
  refs: Array<{ kind: ImageRefKind; target: string }>;
}

/** 渲染时从 env 读的解析结果。 */
export interface DocsRenderEnv {
  docKey: string;
  docDir: string;
  /** refId(kind, docDir, target) → assets/ 下的相对路径；没有映射就保留原文 */
  images: Map<string, string>;
  /** md key → 页面文件名 */
  pages: Map<string, string>;
  /** wikilink 目标（小写、不带 .md 的文件名）→ md key */
  wikiTargets: Map<string, string>;
}

export function isMarkdownName(name: string): boolean {
  return /\.(md|markdown)$/i.test(name);
}

export function dirOfKey(key: string): string {
  const index = key.lastIndexOf("/");
  return index < 0 ? "" : key.slice(0, index);
}

function stemOf(name: string): string {
  return name.replace(/\.(md|markdown)$/i, "");
}

export function refId(kind: ImageRefKind, docDir: string, target: string): string {
  return `${kind}\u0000${docDir}\u0000${target}`;
}

/** 外链或带协议的地址（http:、data:、//host）：不当作网盘相对路径。 */
export function isExternalUrl(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//");
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** 相对 base 目录解析路径；越过网盘根目录或为空时返回 null。以 / 开头的路径从网盘根算起。 */
export function resolveRelativeKey(baseDir: string, path: string): string | null {
  const clean = path.split(/[?#]/)[0];
  if (!clean || clean.includes("\\") || /[\u0000-\u001f]/.test(clean)) return null;
  const parts = clean.startsWith("/") ? [] : baseDir.split("/").filter(Boolean);
  for (const segment of clean.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  if (!parts.length) return null;
  const key = parts.join("/");
  return key.includes("_$flaredrive$") ? null : key;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function assetHref(rel: string): string {
  return rel.split("/").map(encodeURIComponent).join("/");
}

// ---------------------------------------------------------------- markdown-it 配置

function obsidianEmbedRule(state: StateInline, silent: boolean): boolean {
  const { src, pos } = state;
  if (src.charCodeAt(pos) !== 0x21 /* ! */ || !src.startsWith("[[", pos + 1)) return false;
  const end = src.indexOf("]]", pos + 3);
  if (end < 0) return false;
  const inner = src.slice(pos + 3, end);
  if (!inner.trim() || /[\n[\]]/.test(inner)) return false;
  if (!silent) {
    const [target, ...rest] = inner.split("|");
    const token = state.push("obsidian_embed", "img", 0);
    token.meta = { target: target.trim(), option: rest.join("|").trim(), raw: src.slice(pos, end + 2) };
  }
  state.pos = end + 2;
  return true;
}

function wikilinkRule(state: StateInline, silent: boolean): boolean {
  const { src, pos } = state;
  if (!src.startsWith("[[", pos)) return false;
  const end = src.indexOf("]]", pos + 2);
  if (end < 0) return false;
  const inner = src.slice(pos + 2, end);
  if (!inner.trim() || /[\n[\]]/.test(inner)) return false;
  if (!silent) {
    const [targetPart, ...aliasParts] = inner.split("|");
    const hashIndex = targetPart.indexOf("#");
    const target = (hashIndex >= 0 ? targetPart.slice(0, hashIndex) : targetPart).trim();
    const token = state.push("wikilink", "a", 0);
    token.meta = {
      target,
      alias: aliasParts.join("|").trim(),
      raw: src.slice(pos, end + 2),
    };
  }
  state.pos = end + 2;
  return true;
}

function wikiKey(name: string): string {
  return stemOf(name.split("/").pop() || name).trim().toLowerCase();
}

/** 用给定的 MarkdownIt 构造器建实例（测试可直接传入），html:false + 默认 validateLink。 */
export function createDocsMarkdown(MarkdownIt: new (options?: object) => MarkdownItType): DocsMarkdown {
  const md = new MarkdownIt({ html: false, linkify: false, typographer: false, breaks: false });
  md.inline.ruler.before("image", "obsidian_embed", obsidianEmbedRule);
  md.inline.ruler.before("link", "wikilink", wikilinkRule);

  const defaultImage = md.renderer.rules.image!;
  md.renderer.rules.image = (tokens, idx, options, env: DocsRenderEnv, self) => {
    const token = tokens[idx];
    const src = token.attrGet("src") || "";
    if (isExternalUrl(src)) return defaultImage(tokens, idx, options, env, self);
    const target = md.normalizeLinkText(src);
    const rel = env?.images?.get(refId("md", env.docDir, target));
    if (rel) {
      // 只在这次渲染里替换 src，渲染完还原：同一份 token 可以重复渲染（重试发布）
      token.attrSet("src", assetHref(rel));
      try {
        return defaultImage(tokens, idx, options, env, self);
      } finally {
        token.attrSet("src", src);
      }
    }
    // 找不到（或不是栅格图片）：保留原文
    return escapeHtml(`![${token.content}](${target})`);
  };

  md.renderer.rules.obsidian_embed = (tokens, idx, _options, env: DocsRenderEnv) => {
    const meta = tokens[idx].meta as { target: string; option: string; raw: string };
    const rel = env?.images?.get(refId("wiki", env.docDir, meta.target));
    if (!rel) return escapeHtml(meta.raw);
    const alt = (meta.target.split("/").pop() || meta.target).replace(/\.[^.]+$/, "");
    const width = /^(\d{1,4})(x\d{1,4})?$/.exec(meta.option)?.[1];
    const widthAttr = width ? ` width="${width}"` : "";
    return `<img src="${escapeHtml(assetHref(rel))}" alt="${escapeHtml(alt)}"${widthAttr}>`;
  };

  md.renderer.rules.wikilink = (tokens, idx, _options, env: DocsRenderEnv) => {
    const meta = tokens[idx].meta as { target: string; alias: string; raw: string };
    const docKey = env?.wikiTargets?.get(wikiKey(meta.target));
    const page = docKey ? env.pages.get(docKey) : undefined;
    if (!page) return escapeHtml(meta.raw);
    const label = meta.alias || meta.target;
    return `<a href="${escapeHtml(encodeURIComponent(page))}">${escapeHtml(label)}</a>`;
  };

  const defaultLinkOpen =
    md.renderer.rules.link_open ??
    ((tokens: Token[], idx: number, options: object, _env: unknown, self: { renderToken: (t: Token[], i: number, o: object) => string }) =>
      self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = (tokens, idx, options, env: DocsRenderEnv, self) => {
    const token = tokens[idx];
    const href = token.attrGet("href") || "";
    if (env?.pages && href && !isExternalUrl(href) && !href.startsWith("#")) {
      const hashIndex = href.indexOf("#");
      const pathPart = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
      const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
      const decoded = safeDecode(pathPart);
      if (isMarkdownName(decoded.split("?")[0])) {
        const key = resolveRelativeKey(env.docDir, decoded);
        const page = key ? env.pages.get(key) : undefined;
        if (page) {
          token.attrSet("href", `${encodeURIComponent(page)}${hash}`);
          try {
            return defaultLinkOpen(tokens, idx, options, env, self);
          } finally {
            token.attrSet("href", href);
          }
        }
      }
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
  };
  return md;
}

let markdownPromise: Promise<DocsMarkdown> | null = null;

/** 按需加载 markdown-it（单独分包，不进首屏）。 */
export function loadDocsMarkdown(): Promise<DocsMarkdown> {
  markdownPromise ??= import("markdown-it").then((module) => createDocsMarkdown(module.default));
  return markdownPromise;
}

// ---------------------------------------------------------------- 解析

function inlineText(token: Token): string {
  return (token.children ?? [])
    .map((child) => {
      if (child.type === "text" || child.type === "code_inline") return child.content;
      if (child.type === "softbreak" || child.type === "hardbreak") return " ";
      if (child.type === "image") return child.content;
      if (child.type === "wikilink") return (child.meta?.alias as string) || (child.meta?.target as string) || "";
      return "";
    })
    .join("")
    .trim();
}

export function parseDoc(md: DocsMarkdown, file: { key: string; name: string; size: number }, text: string): ParsedDoc {
  const dir = dirOfKey(file.key);
  const tokens = md.parse(text, {});
  let title = "";
  const refs: ParsedDoc["refs"] = [];
  const seen = new Set<string>();
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!title && token.type === "heading_open" && token.tag === "h1" && tokens[i + 1]?.type === "inline") {
      title = inlineText(tokens[i + 1]);
    }
    if (token.type !== "inline") continue;
    for (const child of token.children ?? []) {
      let ref: { kind: ImageRefKind; target: string } | null = null;
      if (child.type === "image") {
        const src = child.attrGet("src") || "";
        if (src && !isExternalUrl(src)) ref = { kind: "md", target: md.normalizeLinkText(src) };
      } else if (child.type === "obsidian_embed") {
        ref = { kind: "wiki", target: String(child.meta?.target ?? "") };
      }
      if (!ref || !ref.target) continue;
      const id = refId(ref.kind, dir, ref.target);
      if (seen.has(id)) continue;
      seen.add(id);
      refs.push(ref);
    }
  }
  return {
    key: file.key,
    name: file.name,
    size: file.size,
    dir,
    title: title.slice(0, 200) || stemOf(file.name),
    tokens,
    refs,
  };
}

export function sortDocs<T extends { name: string }>(docs: T[]): T[] {
  return [...docs].sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
}

// ---------------------------------------------------------------- 找图片

/** Obsidian 常见附件目录名（相对笔记所在目录或其上级）。 */
export const ATTACHMENT_DIRS = ["attachments", "Attachments", "assets", "images", "img", "附件", "_resources"];
/** 每次发布最多用搜索兜底找几个文件名（搜索会扫全盘，太多会很慢）。 */
export const DOCS_SEARCH_LOOKUPS = 20;

export interface DocsLookupIO {
  listDir: (dir: string) => Promise<FileItem[]>;
  search?: (name: string) => Promise<FileItem[]>;
}

export interface ResolvedImages {
  /** refId → 网盘图片 key */
  byRef: Map<string, string>;
  /** 去重后的图片（按首次出现顺序） */
  images: FileItem[];
  /** 没找到或不是栅格图片的引用数 */
  missing: number;
}

function ancestorsOf(dir: string): string[] {
  const parts = dir.split("/").filter(Boolean);
  const out: string[] = [];
  for (let i = parts.length; i >= 0; i -= 1) out.push(parts.slice(0, i).join("/"));
  return out;
}

export async function resolveDocImages(docs: ParsedDoc[], io: DocsLookupIO): Promise<ResolvedImages> {
  const listings = new Map<string, Promise<FileItem[]>>();
  const list = (dir: string) => {
    let pending = listings.get(dir);
    if (!pending) {
      pending = io.listDir(dir).catch(() => [] as FileItem[]);
      listings.set(dir, pending);
    }
    return pending;
  };
  const fileAt = async (key: string): Promise<FileItem | null> => {
    const listing = await list(dirOfKey(key));
    return listing.find((item) => !item.isDir && item.key === key) ?? null;
  };
  const hasSubdir = async (dir: string, name: string) =>
    (await list(dir)).some((item) => item.isDir && item.name === name);

  const searchCache = new Map<string, Promise<FileItem[]>>();
  let searches = 0;
  const searchByName = (name: string): Promise<FileItem[]> => {
    if (!io.search) return Promise.resolve([]);
    let pending = searchCache.get(name);
    if (!pending) {
      if (searches >= DOCS_SEARCH_LOOKUPS) return Promise.resolve([]);
      searches += 1;
      pending = io.search(name).catch(() => [] as FileItem[]);
      searchCache.set(name, pending);
    }
    return pending;
  };

  const byRef = new Map<string, string>();
  const images = new Map<string, FileItem>();
  let missing = 0;

  for (const doc of docs) {
    for (const ref of doc.refs) {
      const id = refId(ref.kind, doc.dir, ref.target);
      if (byRef.has(id)) continue;
      let found: FileItem | null = null;
      if (rasterExtension(ref.target)) {
        if (ref.kind === "md") {
          const key = resolveRelativeKey(doc.dir, ref.target);
          if (key) found = await fileAt(key);
        } else {
          const target = ref.target.replace(/^\/+/, "");
          const candidates: string[] = [];
          const relative = resolveRelativeKey(doc.dir, target);
          if (relative) candidates.push(relative);
          for (const ancestor of ancestorsOf(doc.dir)) {
            const key = resolveRelativeKey(ancestor, target);
            if (key && !candidates.includes(key)) candidates.push(key);
          }
          for (const key of candidates) {
            found = await fileAt(key);
            if (found) break;
          }
          if (!found && !target.includes("/")) {
            outer: for (const ancestor of ancestorsOf(doc.dir)) {
              for (const sub of ATTACHMENT_DIRS) {
                if (!(await hasSubdir(ancestor, sub))) continue;
                found = await fileAt(ancestor ? `${ancestor}/${sub}/${target}` : `${sub}/${target}`);
                if (found) break outer;
              }
            }
          }
          if (!found) {
            const base = target.split("/").pop() || target;
            const top = doc.dir.split("/")[0];
            const matches = (await searchByName(base)).filter(
              (item) =>
                !item.isDir &&
                item.name === base &&
                (target.includes("/") ? item.key.endsWith(`/${target}`) || item.key === target : true) &&
                (!top || item.key.startsWith(`${top}/`)) &&
                !item.key.startsWith("sites/") &&
                !item.key.includes("_$flaredrive$")
            );
            // 优先离笔记最近的（共同目录前缀最长），再按路径短
            const score = (key: string) => {
              const a = doc.dir.split("/");
              const b = key.split("/");
              let common = 0;
              while (common < a.length && common < b.length - 1 && a[common] === b[common]) common += 1;
              return common;
            };
            matches.sort((x, y) => score(y.key) - score(x.key) || x.key.length - y.key.length);
            found = matches[0] ?? null;
          }
        }
      }
      if (found && rasterExtension(found.name)) {
        byRef.set(id, found.key);
        if (!images.has(found.key)) images.set(found.key, found);
      } else {
        missing += 1;
      }
    }
  }
  return { byRef, images: [...images.values()], missing };
}

// ---------------------------------------------------------------- 渲染

export function desiredPageName(doc: { name: string }): string {
  const stem = stemOf(doc.name).trim() || "page";
  return `${stem}.html`;
}

export interface RenderedDocsSite {
  pages: Array<{ name: string; html: string }>;
  index: string;
}

/**
 * 用服务端分配好的文件名渲染整站。docs 需已按侧边栏顺序排好；
 * pageNames[i] 对应 docs[i]；imageRels 是 网盘图片 key → assets/ 相对路径。
 */
export function renderDocsSite(
  md: DocsMarkdown,
  options: {
    lang: PageLang;
    title: string;
    docs: ParsedDoc[];
    pageNames: string[];
    byRef: Map<string, string>;
    imageRels: Map<string, string>;
  }
): RenderedDocsSite {
  const pages = new Map<string, string>();
  const wikiTargets = new Map<string, string>();
  options.docs.forEach((doc, index) => {
    pages.set(doc.key, options.pageNames[index]);
    const wiki = wikiKey(doc.name);
    if (!wikiTargets.has(wiki)) wikiTargets.set(wiki, doc.key);
  });
  const nav: DocsNavItem[] = options.docs.map((doc, index) => ({
    href: options.pageNames[index],
    title: doc.title,
    file: doc.name,
  }));
  const out: RenderedDocsSite["pages"] = [];
  options.docs.forEach((doc, index) => {
    const images = new Map<string, string>();
    for (const ref of doc.refs) {
      const id = refId(ref.kind, doc.dir, ref.target);
      const imageKey = options.byRef.get(id);
      const rel = imageKey ? options.imageRels.get(imageKey) : undefined;
      if (rel) images.set(id, rel);
    }
    const env: DocsRenderEnv = { docKey: doc.key, docDir: doc.dir, images, pages, wikiTargets };
    const bodyHtml = md.renderer.render(doc.tokens, md.options, env);
    out.push({
      name: options.pageNames[index],
      html: renderDocsPage({
        lang: options.lang,
        siteTitle: options.title,
        pageTitle: doc.title,
        nav,
        current: options.pageNames[index],
        bodyHtml,
      }),
    });
  });
  return { pages: out, index: renderDocsIndex({ lang: options.lang, siteTitle: options.title, nav }) };
}
