import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ensureLocalDir,
  humanSize,
  makeProgressBar,
  remoteKeyToLocal,
  walkLocal,
} from "../src/util.js";

describe("humanSize", () => {
  it("bytes 以下原样展示", () => {
    expect(humanSize(0)).toBe("0 B");
    expect(humanSize(512)).toBe("512 B");
    expect(humanSize(1023)).toBe("1023 B");
  });

  it("KB/MB/GB/TB 保留一位小数", () => {
    expect(humanSize(1024)).toBe("1.0 KB");
    expect(humanSize(1536)).toBe("1.5 KB");
    expect(humanSize(1024 * 1024)).toBe("1.0 MB");
    expect(humanSize(3.5 * 1024 * 1024)).toBe("3.5 MB");
    expect(humanSize(1024 ** 3)).toBe("1.0 GB");
    expect(humanSize(1024 ** 4)).toBe("1.0 TB");
  });

  it("超过最大单位时停在 TB", () => {
    expect(humanSize(1024 ** 5)).toBe("1024.0 TB");
  });

  it("非有限值返回 -", () => {
    expect(humanSize(Number.NaN)).toBe("-");
    expect(humanSize(Number.POSITIVE_INFINITY)).toBe("-");
  });
});

describe("walkLocal", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "davflare-walk-"));
    fs.writeFileSync(path.join(root, "a.txt"), "aaa");
    fs.mkdirSync(path.join(root, "sub", "deep"), { recursive: true });
    fs.writeFileSync(path.join(root, "sub", "b.txt"), "bb");
    fs.writeFileSync(path.join(root, "sub", "deep", "c.txt"), "c");
    fs.writeFileSync(path.join(root, ".DS_Store"), "skip me");
    fs.writeFileSync(path.join(root, ".davflare-sync"), "skip metadata");
    fs.mkdirSync(path.join(root, "empty-dir"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("递归收集文件并按路径排序，分隔符统一为 /", () => {
    const entries = walkLocal(root);
    expect(entries.map((e) => e.path)).toEqual([
      "a.txt",
      "sub/b.txt",
      "sub/deep/c.txt",
    ]);
    expect(entries[0].size).toBe(3);
    expect(entries[0].mtimeMs).toBeGreaterThan(0);
  });

  it("skipNames 排除 .DS_Store 与 .davflare-sync，自定义时整体替换默认值", () => {
    expect(walkLocal(root).some((e) => e.path.includes(".DS_Store"))).toBe(false);
    const onlyDeep = walkLocal(root, ["sub", ".DS_Store", ".davflare-sync"]);
    expect(onlyDeep.map((e) => e.path)).toEqual(["a.txt"]);
  });

  it("空目录产出空列表", () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "davflare-empty-"));
    try {
      expect(walkLocal(empty)).toEqual([]);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("makeProgressBar", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("按百分比渲染进度并在完成时换行", () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const progress = makeProgressBar("上传 a.txt");
    progress(50, 100);
    const first = String(write.mock.calls[0][0]);
    expect(first).toContain("上传 a.txt");
    expect(first).toContain("50%");
    expect(first).toContain("50 B/100 B");
    expect(first).toContain("/s");
    expect(first.endsWith("\n")).toBe(false);

    progress(100, 100);
    const last = String(write.mock.calls.at(-1)?.[0]);
    expect(last.endsWith("\n")).toBe(true);
  });

  it("total 为 0 时按 100% 处理", () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const progress = makeProgressBar("下载");
    progress(0, 0);
    expect(String(write.mock.calls[0][0])).toContain("100%");
  });
});

describe("remoteKeyToLocal", () => {
  it("按 / 拆分远端键拼接到本地根", () => {
    expect(remoteKeyToLocal("/tmp/root", "a/b/c.txt")).toBe(
      path.join("/tmp/root", "a", "b", "c.txt")
    );
    expect(remoteKeyToLocal("/tmp/root", "top.txt")).toBe(
      path.join("/tmp/root", "top.txt")
    );
  });
});

describe("ensureLocalDir", () => {
  it("递归创建目标文件的父目录", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "davflare-mkdir-"));
    try {
      const target = path.join(base, "x", "y", "file.txt");
      ensureLocalDir(target);
      expect(fs.statSync(path.join(base, "x", "y")).isDirectory()).toBe(true);
      expect(fs.existsSync(target)).toBe(false);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});
