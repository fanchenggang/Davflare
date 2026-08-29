import { getLang, dictionary, setLang, subscribeLang, translate } from "../strings";

describe("strings / translate", () => {
  afterEach(() => {
    localStorage.clear();
    setLang("zh");
  });

  test("字典完整性：每个 key 的 zh 与 en 都非空", () => {
    const keys = Object.keys(dictionary);
    expect(keys.length).toBeGreaterThan(100);
    const missing: string[] = [];
    for (const key of keys) {
      const entry = dictionary[key];
      if (!entry?.zh?.trim() || !entry?.en?.trim()) missing.push(key);
    }
    expect(missing).toEqual([]);
  });

  test("translate 按当前语言取值", () => {
    setLang("zh");
    expect(translate("upload")).toBe("上传");
    setLang("en");
    expect(translate("upload")).toBe("Upload");
  });

  test("translate 支持 {param} 插值", () => {
    setLang("zh");
    expect(
      translate("listingStats", { folders: 2, files: 5, size: "1 KB" })
    ).toBe("2 个文件夹 · 5 个文件 · 共 1 KB");
    setLang("en");
    expect(
      translate("listingStats", { folders: 2, files: 5, size: "1 KB" })
    ).toBe("2 folder(s) · 5 file(s) · 1 KB");
  });

  test("translate 缺失参数时保留占位符", () => {
    expect(translate("minutesAgo")).toBe("{m} 分钟前");
  });

  test("translate 未知 key 原样返回（开发期暴露拼写错误）", () => {
    expect(translate("no.such.key")).toBe("no.such.key");
  });

  test("setLang 持久化到 localStorage", () => {
    setLang("en");
    expect(localStorage.getItem("flaredrive.lang")).toBe("en");
    expect(getLang()).toBe("en");
  });

  test("validForever 文案存在中英翻译", () => {
    setLang("zh");
    expect(translate("validForever")).toBe("永久有效");
    setLang("en");
    expect(translate("validForever")).toBe("Never expires");
  });

  test("setLang 通知订阅者", () => {
    const seen: string[] = [];
    const unsubscribe = subscribeLang(() => seen.push(getLang()));
    setLang("en");
    setLang("zh");
    unsubscribe();
    setLang("en");
    expect(seen).toEqual(["en", "zh"]);
  });
});
