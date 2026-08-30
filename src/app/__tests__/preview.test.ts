import {
  fileExtension,
  fileIconKind,
  isJsonFile,
  isMediaPreviewable,
  isPreviewable,
  isTextPreviewable,
  mimeType,
  prettyJsonOrRaw,
  readResponseTextCapped,
} from "../preview";

describe("preview / fileExtension", () => {
  test("basename 小写取扩展名", () => {
    expect(fileExtension("a/b/c.TXT")).toBe("txt");
    expect(fileExtension("dir/archive.tar.gz")).toBe("gz");
    expect(fileExtension("dir/name")).toBe("");
    expect(fileExtension("dir/name.")).toBe("");
    expect(fileExtension("")).toBe("");
    expect(fileExtension(".gitignore")).toBe("gitignore");
    expect(fileExtension("dir/.npmrc")).toBe("npmrc");
  });
});

describe("preview / mimeType", () => {
  test("小写并去掉参数", () => {
    expect(mimeType("Text/Plain; charset=utf-8")).toBe("text/plain");
    expect(mimeType(undefined)).toBe("");
  });
});

describe("preview / isTextPreviewable", () => {
  test("目录不可预览", () => {
    expect(isTextPreviewable({ name: "docs", isDir: true })).toBe(false);
  });
  test("扩展名 / basename / Content-Type 判定", () => {
    expect(isTextPreviewable({ name: "notes.md" })).toBe(true);
    expect(isTextPreviewable({ name: "Dockerfile" })).toBe(true);
    expect(isTextPreviewable({ name: "app.tsx" })).toBe(true);
    expect(isTextPreviewable({ name: "photo.png" })).toBe(false);
    expect(isTextPreviewable({ name: "data", contentType: "text/csv" })).toBe(true);
    expect(isTextPreviewable({ name: "data", contentType: "application/json" })).toBe(true);
    expect(isTextPreviewable({ name: "data", contentType: "application/x-yaml" })).toBe(true);
    expect(isTextPreviewable({ name: "data", contentType: "application/atom+xml" })).toBe(true);
    expect(isTextPreviewable({ name: "data", contentType: "application/vnd.api+json" })).toBe(true);
    expect(isTextPreviewable({ name: "data", contentType: "application/pdf" })).toBe(false);
    expect(isTextPreviewable({ name: "unknown" })).toBe(false);
  });
});

describe("preview / isMediaPreviewable", () => {
  test("图片/视频/音频/PDF 可预览，SVG 与目录除外", () => {
    expect(isMediaPreviewable({ contentType: "image/png" })).toBe(true);
    expect(isMediaPreviewable({ contentType: "image/svg+xml" })).toBe(false);
    expect(isMediaPreviewable({ contentType: "video/mp4" })).toBe(true);
    expect(isMediaPreviewable({ contentType: "audio/mpeg" })).toBe(true);
    expect(isMediaPreviewable({ contentType: "application/pdf" })).toBe(true);
    expect(isMediaPreviewable({ contentType: "text/plain" })).toBe(false);
    expect(isMediaPreviewable({ isDir: true, contentType: "image/png" })).toBe(false);
  });
});

describe("preview / isJsonFile & isPreviewable", () => {
  test("json 扩展名或类型", () => {
    expect(isJsonFile({ name: "a.json" })).toBe(true);
    expect(isJsonFile({ name: "a.jsonc" })).toBe(true);
    expect(isJsonFile({ name: "a", contentType: "application/json" })).toBe(true);
    expect(isJsonFile({ name: "a", contentType: "application/geo+json" })).toBe(true);
    expect(isJsonFile({ name: "a.txt" })).toBe(false);
  });
  test("isPreviewable 合并媒体与文本判定", () => {
    const f = { key: "a", size: 1, uploaded: "" };
    expect(isPreviewable({ ...f, name: "a.txt", contentType: "text/plain", isDir: false })).toBe(true);
    expect(isPreviewable({ ...f, name: "a.png", contentType: "image/png", isDir: false })).toBe(true);
    expect(isPreviewable({ ...f, name: "a.bin", contentType: "application/octet-stream", isDir: false })).toBe(false);
  });
});

describe("preview / fileIconKind", () => {
  test("各图标类别", () => {
    expect(fileIconKind({ isDir: true })).toBe("folder");
    expect(fileIconKind({ name: "a.png", contentType: "image/png" })).toBe("image");
    expect(fileIconKind({ name: "a.mp4", contentType: "video/mp4" })).toBe("video");
    expect(fileIconKind({ name: "a.mp3", contentType: "audio/mpeg" })).toBe("audio");
    expect(fileIconKind({ name: "a.pdf", contentType: "application/pdf" })).toBe("pdf");
    expect(fileIconKind({ name: "a.pptx" })).toBe("slides");
    expect(fileIconKind({ name: "a.epub" })).toBe("ebook");
    expect(fileIconKind({ name: "a.woff2" })).toBe("font");
    expect(fileIconKind({ name: "a.zip" })).toBe("zip");
    expect(fileIconKind({ name: "a.json" })).toBe("json");
    expect(fileIconKind({ name: "a.html" })).toBe("html");
    expect(fileIconKind({ name: "a.css" })).toBe("css");
    expect(fileIconKind({ name: "a.js" })).toBe("js");
    expect(fileIconKind({ name: "a.csv" })).toBe("csv");
    expect(fileIconKind({ name: "a.sh" })).toBe("shell");
    expect(fileIconKind({ name: "a.txt" })).toBe("text");
    expect(fileIconKind({ name: "a.py" })).toBe("code");
    expect(fileIconKind({ name: "a.bin" })).toBe("other");
  });
});

describe("preview / prettyJsonOrRaw", () => {
  test("合法 JSON 格式化，非法原样返回", () => {
    expect(prettyJsonOrRaw('{"b":1,"a":2}')).toEqual({
      text: '{\n  "b": 1,\n  "a": 2\n}',
      parseError: false,
    });
    expect(prettyJsonOrRaw("not json")).toEqual({ text: "not json", parseError: true });
  });
});

describe("preview / readResponseTextCapped", () => {
  test("Content-Length 超限直接拒绝", async () => {
    const cancel = jest.fn(() => Promise.resolve());
    const response = {
      headers: { get: (n: string) => (n === "content-length" ? "3000000" : null) },
      body: { cancel },
    } as unknown as Response;
    await expect(readResponseTextCapped(response, 1000)).resolves.toEqual({
      ok: false, tooLarge: true, size: 3000000,
    });
    expect(cancel).toHaveBeenCalled();
  });

  test("无 body 走 Blob 分支（含超限）", async () => {
    const small = { size: 5, text: async () => "hello" };
    const smallRes = { headers: { get: () => null }, body: null, blob: async () => small } as unknown as Response;
    await expect(readResponseTextCapped(smallRes, 100)).resolves.toEqual({ ok: true, text: "hello", size: 5 });

    const big = { size: 20, text: async () => "x".repeat(20) };
    const bigRes = { headers: { get: () => null }, body: null, blob: async () => big } as unknown as Response;
    await expect(readResponseTextCapped(bigRes, 10)).resolves.toEqual({ ok: false, tooLarge: true, size: 20 });
  });

  test("流式读取未超限", async () => {
    const enc = (s: string) => Uint8Array.from(s.split("").map((c) => c.charCodeAt(0)));
    const chunks = [enc("hello "), enc("world")];
    const response = {
      headers: { get: () => null },
      body: {
        getReader: () => {
          let i = 0;
          return {
            read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined }),
            cancel: jest.fn(() => Promise.resolve()),
          };
        },
      },
    } as unknown as Response;
    await expect(readResponseTextCapped(response, 100)).resolves.toEqual({ ok: true, text: "hello world", size: 11 });
  });

  test("流式读取超限后取消", async () => {
    const big = new Uint8Array(30).fill(97);
    const response = {
      headers: { get: () => null },
      body: {
        getReader: () => {
          let sent = false;
          return {
            read: async () => (sent ? { done: true, value: undefined } : ((sent = true), { done: false, value: big })),
            cancel: jest.fn(() => Promise.resolve()),
          };
        },
      },
    } as unknown as Response;
    await expect(readResponseTextCapped(response, 10)).resolves.toEqual({ ok: false, tooLarge: true, size: 30 });
  });
});
