import { dictionary, setLang } from "../strings";
import {
  basename,
  encodeKey,
  formatEta,
  formatRelativeDateTime,
  humanReadableSize,
  isJunkFileName,
  uniqueName,
  uniquifyUploadFiles,
} from "../utils";

function minutesAgo(m: number) {
  return new Date(Date.now() - m * 60_000);
}

describe("utils / humanReadableSize", () => {
  test("字节与进位", () => {
    expect(humanReadableSize(0)).toBe("0.0 B");
    expect(humanReadableSize(512)).toBe("512.0 B");
    expect(humanReadableSize(1024)).toBe("1.0 KB");
    expect(humanReadableSize(1536)).toBe("1.5 KB");
    expect(humanReadableSize(1024 ** 3)).toBe("1.0 GB");
  });

  test("无效输入返回空串", () => {
    expect(humanReadableSize(-1)).toBe("");
    expect(humanReadableSize(NaN)).toBe("");
  });
});

describe("utils / formatEta", () => {
  afterEach(() => setLang("zh"));

  test("无效或零值返回空串", () => {
    expect(formatEta(0)).toBe("");
    expect(formatEta(-5)).toBe("");
    expect(formatEta(Infinity)).toBe("");
  });

  test("三种时长档位（中文）", () => {
    setLang("zh");
    expect(formatEta(45)).toBe("45 秒");
    expect(formatEta(130)).toBe("2 分 10 秒");
    expect(formatEta(3670)).toBe("1 时 1 分");
  });

  test("英文档位", () => {
    setLang("en");
    expect(formatEta(45)).toBe("45s");
    expect(formatEta(130)).toBe("2m 10s");
    expect(formatEta(3670)).toBe("1h 1m");
  });

  test("ETA 文案 key 在字典中双语齐全", () => {
    for (const key of ["etaSeconds", "etaMinSec", "etaHourMin"]) {
      expect(dictionary[key].zh).not.toBe("");
      expect(dictionary[key].en).not.toBe("");
    }
  });
});

describe("utils / formatRelativeDateTime", () => {
  afterEach(() => setLang("zh"));

  test("无效日期返回空串", () => {
    expect(formatRelativeDateTime("not-a-date")).toBe("");
  });

  test("刚刚 / 分钟前 / 小时前（中文）", () => {
    setLang("zh");
    expect(formatRelativeDateTime(new Date(Date.now() - 30_000))).toBe("刚刚");
    expect(formatRelativeDateTime(minutesAgo(5))).toBe("5 分钟前");
    expect(formatRelativeDateTime(minutesAgo(120))).toBe("2 小时前");
  });

  test("英文相对时间", () => {
    setLang("en");
    expect(formatRelativeDateTime(new Date(Date.now() - 30_000))).toBe(
      "Just now"
    );
    expect(formatRelativeDateTime(minutesAgo(5))).toBe("5 min ago");
    expect(formatRelativeDateTime(minutesAgo(120))).toBe("2h ago");
  });

  test("超过 24 小时或未来时间回退日期显示", () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    expect(formatRelativeDateTime(twoDaysAgo)).toBe(
      twoDaysAgo.toLocaleDateString()
    );
    const future = new Date(Date.now() + 60_000);
    expect(formatRelativeDateTime(future)).toBe(future.toLocaleDateString());
  });
});

describe("utils / key helpers", () => {
  test("encodeKey 逐段转义，保留斜杠", () => {
    expect(encodeKey("docs/my pics/笔记.txt")).toBe(
      "docs/my%20pics/%E7%AC%94%E8%AE%B0.txt"
    );
  });

  test("basename 去掉目录前缀与结尾斜杠", () => {
    expect(basename("a/b/c.txt")).toBe("c.txt");
    expect(basename("a/b/")).toBe("b");
  });

  test("uniqueName 生成不冲突的 (2) 后缀", () => {
    const taken = new Set(["a.txt", "a (2).txt"]);
    expect(uniqueName("a.txt", taken)).toBe("a (3).txt");
    expect(uniqueName("b.txt", taken)).toBe("b.txt");
    // 无扩展名时 ext 为空串，后缀直接拼在词干后
    expect(uniqueName("noext", new Set(["noext"]))).toBe("noext (2)");
  });
});

describe("utils / uniquifyUploadFiles", () => {
  test("同名文件去重且保留类型", () => {
    const first = new File(["a"], "doc.txt", { type: "text/plain" });
    const second = new File(["b"], "doc.txt", { type: "text/plain" });
    const out = uniquifyUploadFiles([first, second], []);
    expect(out[0].name).toBe("doc.txt");
    expect(out[1].name).toBe("doc (2).txt");
    expect(out[1].type).toBe("text/plain");
  });

  test("文件夹上传：同一顶层目录的文件统一改到新目录名（映射缓存）", () => {
    const f = new File(["x"], "inner.txt");
    Object.defineProperty(f, "webkitRelativePath", { value: "photos/inner.txt" });
    const g = new File(["y"], "second.txt");
    Object.defineProperty(g, "webkitRelativePath", { value: "photos/second.txt" });
    const taken = new Set(["photos"]);
    const out = uniquifyUploadFiles([f, g], taken);
    expect(out[0].webkitRelativePath).toBe("photos (2)/inner.txt");
    expect(out[1].webkitRelativePath).toBe("photos (2)/second.txt");
  });
});

describe("utils / isJunkFileName", () => {
  test("识别系统垃圾文件", () => {
    expect(isJunkFileName(".DS_Store")).toBe(true);
    expect(isJunkFileName("Thumbs.db")).toBe(true);
    expect(isJunkFileName("._photo.jpg")).toBe(true);
    expect(isJunkFileName("desktop.ini")).toBe(true);
    expect(isJunkFileName("notes.txt")).toBe(false);
  });
});
