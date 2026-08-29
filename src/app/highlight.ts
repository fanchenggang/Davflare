// 轻量语法高亮 tokenizer：不引第三方库，覆盖 json / clike(js,ts,css…) / hash 注释(py,sh,yaml…)。
// 输出全文偏移的 token 列表，由渲染层按行拆分上色。≤1MB 才启用（调用方控制）。

export type TokenKind = "plain" | "keyword" | "string" | "comment" | "number";

export interface Token {
  start: number;
  end: number;
  kind: TokenKind;
}

export type HighlightLang = "json" | "clike" | "hash";

export function highlightLangFor(extension: string): HighlightLang | null {
  const ext = extension.toLowerCase();
  if (["json", "jsonc", "json5"].includes(ext)) return "json";
  if (
    [
      "js", "jsx", "mjs", "cjs", "ts", "tsx", "java", "kt", "c", "h", "cpp",
      "hpp", "cs", "php", "go", "rs", "swift", "scala", "css", "scss", "less",
      "sql", "graphql", "gql", "proto", "vue", "svelte", "dart",
    ].includes(ext)
  ) {
    return "clike";
  }
  if (
    [
      "py", "rb", "sh", "bash", "zsh", "yml", "yaml", "toml", "ini", "conf",
      "cfg", "env", "properties", "gitignore", "dockerfile", "lock", "log",
      "txt", "md", "markdown", "csv", "tsv",
    ].includes(ext)
  ) {
    // 这些以 # 为注释；txt/md/csv 高亮收益低，交给调用方排除
    return "hash";
  }
  return null;
}

const KEYWORDS_CLIKE = new Set(
  ("function return if else for while do var let const class import export from default new async await try catch finally switch case break continue typeof instanceof in of this super extends yield throw delete void static get set null undefined true false def lambda pass raise with as not and or is None True False elif except print struct impl fn pub use mut match where type interface enum package interface".split(
    " "
  ) as string[])
);

const KEYWORDS_JSON = new Set(["true", "false", "null"]);

function isIdentifierStart(ch: string) {
  return /[A-Za-z_$]/.test(ch);
}

function isIdentifierPart(ch: string) {
  return /[A-Za-z0-9_$]/.test(ch);
}

export function tokenizeForHighlight(
  text: string,
  lang: HighlightLang
): Token[] {
  const tokens: Token[] = [];
  const n = text.length;
  let i = 0;

  const push = (start: number, end: number, kind: TokenKind) => {
    if (end > start) tokens.push({ start, end, kind });
  };

  while (i < n) {
    const ch = text[i];
    const next = i + 1 < n ? text[i + 1] : "";

    // 注释
    if (lang !== "json" && ch === "/" && next === "/") {
      let end = text.indexOf("\n", i);
      if (end === -1) end = n;
      push(i, end, "comment");
      i = end;
      continue;
    }
    if (lang === "hash" && ch === "#") {
      let end = text.indexOf("\n", i);
      if (end === -1) end = n;
      push(i, end, "comment");
      i = end;
      continue;
    }
    if (lang === "clike" && ch === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      push(i, stop, "comment");
      i = stop;
      continue;
    }

    // 字符串（' 和 " 不跨行，` 可跨行）
    if (ch === '"' || ch === "'" || (lang === "clike" && ch === "`")) {
      let j = i + 1;
      while (j < n) {
        if (text[j] === "\\") {
          j += 2;
          continue;
        }
        if (text[j] === ch) {
          j += 1;
          break;
        }
        if (text[j] === "\n" && ch !== "`") {
          break;
        }
        j += 1;
      }
      push(i, Math.min(j, n), "string");
      i = Math.min(j, n);
      continue;
    }

    // 数字（数字紧跟字母时视为普通单词的一部分，避免 `arg2` 之类误判）
    if (/[0-9]/.test(ch) && !(i > 0 && isIdentifierPart(text[i - 1]))) {
      let j = i;
      while (j < n && /[0-9a-fA-FxXoObB._]/.test(text[j])) j += 1;
      push(i, j, "number");
      i = j;
      continue;
    }

    // 标识符 / 关键字
    if (isIdentifierStart(ch)) {
      let j = i;
      while (j < n && isIdentifierPart(text[j])) j += 1;
      const word = text.slice(i, j);
      const isKeyword =
        lang === "json" ? KEYWORDS_JSON.has(word) : KEYWORDS_CLIKE.has(word);
      if (isKeyword) push(i, j, "keyword");
      i = j;
      continue;
    }

    i += 1;
  }

  return tokens;
}

export interface LineToken {
  text: string;
  kind: TokenKind;
}

// 把全文 token 拆到行，供逐行渲染（行号栏 + 上色）
export function tokensToLines(
  text: string,
  tokens: Token[]
): LineToken[][] {
  const lines: LineToken[][] = [];
  let current: LineToken[] = [];
  const append = (chunk: string, kind: TokenKind) => {
    const parts = chunk.split("\n");
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) {
        lines.push(current);
        current = [];
      }
      if (parts[i]) current.push({ text: parts[i], kind });
    }
  };

  let pos = 0;
  for (const token of tokens) {
    if (token.start > pos) append(text.slice(pos, token.start), "plain");
    append(text.slice(token.start, token.end), token.kind);
    pos = token.end;
  }
  if (pos < text.length) append(text.slice(pos), "plain");
  lines.push(current);
  return lines;
}
