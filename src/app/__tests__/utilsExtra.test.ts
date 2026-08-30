import {
  fileTypeCategory,
  formatDateTime,
  formatListingSize,
  humanReadableSpeed,
} from "../utils";

describe("utils / humanReadableSpeed", () => {
  test("有效速度带 /s，无效返回空串", () => {
    expect(humanReadableSpeed(1024)).toBe("1.0 KB/s");
    expect(humanReadableSpeed(0)).toBe("");
    expect(humanReadableSpeed(-1)).toBe("");
    expect(humanReadableSpeed(NaN)).toBe("");
  });
});

describe("utils / formatDateTime", () => {
  test("有效与无效日期", () => {
    expect(formatDateTime(new Date(2026, 0, 1, 12, 0))).toBe(new Date(2026, 0, 1, 12, 0).toLocaleString());
    expect(formatDateTime("bad")).toBe("");
  });
});

describe("utils / formatListingSize", () => {
  test("0 或负数显示 0 B，小文件取整", () => {
    expect(formatListingSize(0)).toBe("0 B");
    expect(formatListingSize(-5)).toBe("0 B");
    expect(formatListingSize(512)).toBe("512 B");
    expect(formatListingSize(1024)).toBe("1.0 KB");
  });
});

describe("utils / fileTypeCategory", () => {
  test("文件夹与视频/图片分类", () => {
    expect(fileTypeCategory({ isDir: true, name: "d", size: 0, uploaded: "", contentType: "", key: "d/" })).toBe("folder");
    expect(fileTypeCategory({ isDir: false, name: "v.mp4", size: 0, uploaded: "", contentType: "video/mp4", key: "v.mp4" })).toBe("video");
    expect(fileTypeCategory({ isDir: false, name: "p.png", size: 0, uploaded: "", contentType: "image/png", key: "p.png" })).toBe("image");
    expect(fileTypeCategory({ isDir: false, name: "s.svg", size: 0, uploaded: "", contentType: "image/svg+xml", key: "s.svg" })).toBe("doc");
  });

  test("文档分类：文本 / office / 扩展名 / 文本可预览", () => {
    expect(fileTypeCategory({ isDir: false, name: "n.txt", size: 0, uploaded: "", contentType: "text/plain", key: "n.txt" })).toBe("doc");
    expect(fileTypeCategory({ isDir: false, name: "n.docx", size: 0, uploaded: "", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", key: "n.docx" })).toBe("doc");
    expect(fileTypeCategory({ isDir: false, name: "n.pdf", size: 0, uploaded: "", contentType: "application/pdf", key: "n.pdf" })).toBe("doc");
    expect(fileTypeCategory({ isDir: false, name: "n.md", size: 0, uploaded: "", contentType: "", key: "n.md" })).toBe("doc");
    expect(fileTypeCategory({ isDir: false, name: "n.bin", size: 0, uploaded: "", contentType: "application/octet-stream", key: "n.bin" })).toBe("other");
  });
});
