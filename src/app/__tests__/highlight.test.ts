import {
  highlightLangFor,
  LineToken,
  tokenizeForHighlight,
  tokensToLines,
  Token,
} from "../highlight";

function kinds(tokens: Token[]) {
  return tokens.map((t) => t.kind);
}

describe("highlight / highlightLangFor", () => {
  test("按扩展名分族", () => {
    expect(highlightLangFor("json")).toBe("json");
    expect(highlightLangFor("JSONC")).toBe("json");
    expect(highlightLangFor("ts")).toBe("clike");
    expect(highlightLangFor("py")).toBe("hash");
    expect(highlightLangFor("yaml")).toBe("hash");
    expect(highlightLangFor("exe")).toBeNull();
  });
});

describe("highlight / tokenizeForHighlight", () => {
  test("JSON：字符串 / 数字 / 关键字", () => {
    const tokens = tokenizeForHighlight('{"a": 1, "ok": true, "n": null}', "json");
    const k = kinds(tokens);
    expect(k).toContain("string");
    expect(k).toContain("number");
    expect(k).toContain("keyword");
    // "true"/"null" 命中 JSON 关键字
    const keywords = tokens
      .filter((t) => t.kind === "keyword")
      .map((t) => t.start)
      .map((start) => '{"a": 1, "ok": true, "n": null}'.slice(start));
    expect(keywords.some((w) => w.startsWith("true"))).toBe(true);
    expect(keywords.some((w) => w.startsWith("null"))).toBe(true);
  });

  test("clike：行注释 / 块注释 / 字符串 / 关键字", () => {
    const src = "const a = 1; // trailing\n/* block */ const b = `x`;";
    const tokens = tokenizeForHighlight(src, "clike");
    const comments = tokens.filter((t) => t.kind === "comment");
    expect(comments.map((t) => src.slice(t.start, t.end))).toEqual([
      "// trailing",
      "/* block */",
    ]);
    const strings = tokens.filter((t) => t.kind === "string");
    expect(strings.map((t) => src.slice(t.start, t.end))).toContain("`x`");
    expect(
      tokens.some(
        (t) =>
          t.kind === "keyword" && src.slice(t.start, t.end) === "const"
      )
    ).toBe(true);
  });

  test("hash：# 注释到行尾", () => {
    const src = "n = 1  # 计数\nprint(n)";
    const tokens = tokenizeForHighlight(src, "hash");
    const comments = tokens.filter((t) => t.kind === "comment");
    expect(comments.map((t) => src.slice(t.start, t.end))).toEqual(["# 计数"]);
  });

  test("转义引号不截断字符串；数字紧跟字母不误判", () => {
    const tokens = tokenizeForHighlight('"a\\"b" arg2', "clike");
    const strings = tokens.filter((t) => t.kind === "string");
    // `"a\"b"` 完整识别为一个字符串
    expect(strings.map((t) => t.end - t.start)).toContain(6);
    // arg2 中的 2 不单独成为 number token
    expect(
      tokens.some(
        (t) => t.kind === "number" && t.start === '"a\\"b" arg2'.indexOf("2")
      )
    ).toBe(false);
  });
});

describe("highlight / tokensToLines", () => {
  test("按行拆分并补 plain 片段", () => {
    const src = "let a = 1;\n// c\n";
    const lines: LineToken[][] = tokensToLines(
      src,
      tokenizeForHighlight(src, "clike")
    );
    expect(lines).toHaveLength(3);
    expect(lines[0].map((t) => t.text).join("")).toBe("let a = 1;");
    expect(lines[0].some((t) => t.kind === "keyword" && t.text === "let")).toBe(
      true
    );
    expect(lines[1]).toEqual([{ text: "// c", kind: "comment" }]);
    expect(lines[2]).toEqual([]);
  });

  test("token 偏移覆盖全文（拼接结果与原文一致）", () => {
    const src = 'const x = {"k": [1, 2, true]}; // done';
    const lines = tokensToLines(src, tokenizeForHighlight(src, "clike"));
    expect(lines.map((l) => l.map((t) => t.text).join("")).join("\n")).toBe(src);
  });
});
