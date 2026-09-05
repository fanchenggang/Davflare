import { createRequire } from "module";

const nodeRequire = createRequire(import.meta.url);

const PinyinIndex = nodeRequire("../../../extension/pinyin.js") as {
  defaultTools: { matchText: (text: unknown, query: string) => boolean; toInitials: (text: string) => string; toPinyin: (text: string) => string };
  makeTools: (dict: Record<string, string> | null) => {
    matchText: (text: unknown, query: string) => boolean;
    toInitials: (text: string) => string;
    toPinyin: (text: string) => string;
  };
  matchText: (text: unknown, query: string) => boolean;
};

const DICT = { 腾: "teng", 讯: "xun", 云: "yun", 书: "shu", 签: "qian" };
const tools = PinyinIndex.makeTools(DICT);

describe("extension/pinyin.js", () => {
  test("builds a full pinyin string, skipping punctuation and separators", () => {
    expect(tools.toPinyin("腾讯云")).toBe("tengxunyun");
    expect(tools.toPinyin("书签-dev")).toBe("shuqiandev");
  });

  test("builds initials from the first letter of each reading", () => {
    expect(tools.toInitials("腾讯云")).toBe("txy");
    expect(tools.toInitials("书签 Dev")).toBe("sqdev");
  });

  test("matches raw text, full pinyin, and initials for ascii queries", () => {
    expect(tools.matchText("腾讯云控制台", "控制台")).toBe(true);
    expect(tools.matchText("腾讯云控制台", "tengxun")).toBe(true);
    expect(tools.matchText("腾讯云控制台", "txy")).toBe(true);
    expect(tools.matchText("书签", "shuqian")).toBe(true);
    expect(tools.matchText("书签", "sq")).toBe(true);
    // 库 is not in the mini dict, so its reading is missing from the index
    expect(tools.matchText("书签", "qianku")).toBe(false);
    expect(tools.matchText("书签", "tengxun")).toBe(false);
  });

  test("non-ascii queries never use the pinyin path", () => {
    expect(tools.matchText("腾讯云", "腾讯")).toBe(true);
    expect(tools.matchText("腾讯云", "腾x")).toBe(false);
  });

  test("an empty dict still matches raw substrings but no pinyin", () => {
    const bare = PinyinIndex.makeTools(null);
    expect(bare.matchText("hello world", "hello")).toBe(true);
    expect(bare.matchText("腾讯云", "tengxun")).toBe(false);
  });

  test("the default tools work without a global dictionary loaded", () => {
    expect(typeof PinyinIndex.defaultTools.matchText).toBe("function");
    expect(PinyinIndex.defaultTools.matchText("plain text", "text")).toBe(true);
  });
});
