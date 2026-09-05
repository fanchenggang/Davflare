import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/client.js";

// index.ts 在模块加载时立即 program.parseAsync(process.argv)，
// 因此每个用例先改写 process.argv 再动态 import（配合 vi.resetModules 重复加载）。
// client/config 模块整体 mock，命令分发只验证参数与输出。

const mocks = vi.hoisted(() => {
  const api = {
    listPage: vi.fn(),
    mkdir: vi.fn(),
    remove: vi.fn(),
    move: vi.fn(),
    uploadFile: vi.fn(),
    downloadFile: vi.fn(),
    walk: vi.fn(),
    backup: vi.fn(),
    stat: vi.fn(),
    search: vi.fn(),
    createKeyWithSession: vi.fn(),
    revokeKey: vi.fn(),
  };
  return {
    api,
    clientCtor: vi.fn(() => api),
    loadConfig: vi.fn(),
    saveConfig: vi.fn(),
    clearConfig: vi.fn(),
  };
});

vi.mock("../src/client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/client.js")>();
  return { ...actual, DavflareClient: mocks.clientCtor };
});

vi.mock("../src/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/config.js")>();
  return {
    ...actual,
    loadConfig: mocks.loadConfig,
    saveConfig: mocks.saveConfig,
    clearConfig: mocks.clearConfig,
  };
});

const SERVER = "https://example.com";
let originalArgv: string[];

beforeEach(() => {
  vi.clearAllMocks();
  originalArgv = process.argv;
  mocks.loadConfig.mockReturnValue({ server: SERVER, key: "fd_k", keyId: "kid1" });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.argv = originalArgv;
  vi.restoreAllMocks();
});

async function runCli(...args: string[]): Promise<void> {
  process.argv = ["node", "davflare", ...args];
  vi.resetModules();
  await import("../src/index.js");
}

describe("index 命令分发", () => {
  it("ls 默认逐行输出，目录带斜杠后缀", async () => {
    mocks.api.listPage.mockResolvedValue({
      items: [
        { key: "docs/", name: "docs", isDir: true, size: 0, uploaded: "" },
        { key: "a.txt", name: "a.txt", isDir: false, size: 12, uploaded: "" },
      ],
      nextCursor: undefined,
    });

    await runCli("ls", "docs");
    await vi.waitFor(() => expect(mocks.api.listPage).toHaveBeenCalled());

    expect(mocks.clientCtor).toHaveBeenCalledWith(SERVER, "fd_k");
    expect(mocks.api.listPage).toHaveBeenCalledWith("docs/", undefined);
    const log = vi.mocked(console.log);
    expect(log.mock.calls.map((c) => c[0])).toEqual(["docs/", "a.txt"]);
  });

  it("ls --json 输出原始 JSON", async () => {
    const items = [{ key: "a.txt", name: "a.txt", isDir: false, size: 1, uploaded: "" }];
    mocks.api.listPage.mockResolvedValue({ items, nextCursor: undefined });

    await runCli("ls", "--json");
    await vi.waitFor(() => expect(console.log).toHaveBeenCalled());

    const output = vi.mocked(console.log).mock.calls[0][0] as string;
    expect(JSON.parse(output)).toEqual(items);
  });

  it("mkdir 去掉尾部斜杠后调用远端并提示", async () => {
    mocks.api.mkdir.mockResolvedValue(undefined);

    await runCli("mkdir", "docs/new/");
    await vi.waitFor(() => expect(mocks.api.mkdir).toHaveBeenCalled());

    expect(mocks.api.mkdir).toHaveBeenCalledWith("docs/new");
    expect(console.error).toHaveBeenCalledWith("已创建 docs/new/");
  });

  it("rm 默认软删除，目录需要 -r", async () => {
    mocks.api.remove.mockResolvedValue(undefined);

    await runCli("rm", "a.txt", "b/");
    await vi.waitFor(() => expect(mocks.api.remove).toHaveBeenCalled());

    expect(mocks.api.remove).toHaveBeenCalledWith("a.txt", false);
    expect(mocks.api.remove).toHaveBeenCalledTimes(1); // b/ 被跳过
    expect(console.error).toHaveBeenCalledWith("跳过 b/（目录需要 -r）");
  });

  it("rm -r 允许目录、--hard 彻底删除", async () => {
    mocks.api.remove.mockResolvedValue(undefined);

    await runCli("rm", "-r", "--hard", "b/");
    await vi.waitFor(() => expect(mocks.api.remove).toHaveBeenCalled());

    expect(mocks.api.remove).toHaveBeenCalledWith("b/", true);
  });

  it("mv 传递 from/to 与 --overwrite", async () => {
    mocks.api.move.mockResolvedValue(undefined);

    await runCli("mv", "a.txt", "b.txt", "--overwrite");
    await vi.waitFor(() => expect(mocks.api.move).toHaveBeenCalled());

    expect(mocks.api.move).toHaveBeenCalledWith("a.txt", "b.txt", true);
    expect(console.error).toHaveBeenCalledWith("已移动 a.txt → b.txt");
  });

  it("cp 源是本地文件时走上传", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "davflare-cli-"));
    const local = path.join(dir, "local.txt");
    fs.writeFileSync(local, "data");
    mocks.api.uploadFile.mockResolvedValue(undefined);

    await runCli("cp", local, "remote/name.txt");
    await vi.waitFor(() => expect(mocks.api.uploadFile).toHaveBeenCalled());

    expect(mocks.api.uploadFile).toHaveBeenCalledWith(local, "remote/name.txt", expect.any(Function));
    expect(console.error).toHaveBeenCalledWith("已上传 → remote/name.txt");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("cp 源不在本地时走下载（目录目标保留远端文件名）", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "davflare-cli-"));
    mocks.api.downloadFile.mockResolvedValue(true);

    await runCli("cp", "remote/a.txt", `${dir}/`);
    await vi.waitFor(() => expect(mocks.api.downloadFile).toHaveBeenCalled());

    expect(mocks.api.downloadFile).toHaveBeenCalledWith(
      "remote/a.txt",
      path.join(dir, "a.txt"),
      expect.any(Function)
    );
    expect(console.error).toHaveBeenCalledWith(
      `已下载 → ${path.join(dir, "a.txt")}（断点续传）`
    );
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("sync --dry-run push 只输出计划不传输", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "davflare-sync-"));
    fs.writeFileSync(path.join(dir, "file.txt"), "abc");
    mocks.api.walk.mockImplementation(() =>
      (async function* () {
        yield {
          key: "remote/other.txt",
          name: "other.txt",
          isDir: false,
          size: 5,
          uploaded: "2026-01-01T00:00:00.000Z",
        };
      })()
    );

    await runCli("sync", "--dry-run", "push", dir, "remote");
    await vi.waitFor(() => expect(mocks.api.walk).toHaveBeenCalled());

    expect(mocks.api.uploadFile).not.toHaveBeenCalled();
    expect(mocks.api.downloadFile).not.toHaveBeenCalled();
    const errText = vi.mocked(console.error).mock.calls.map((c) => String(c[0])).join("\n");
    expect(errText).toContain("同步计划 (push)：传输 1");
    expect(errText).toContain("传输  file.txt");
    expect(errText).toContain("可清理(远端) other.txt");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("index 错误处理", () => {
  it("ApiError 打印「错误: <message>」并 exit(1)", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    mocks.api.listPage.mockRejectedValue(new ApiError(500, "boom"));

    await runCli("ls");
    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalled());

    expect(console.error).toHaveBeenCalledWith("错误: boom");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("sync 非法 direction 直接报错退出", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await runCli("sync", "sideways", os.tmpdir(), "remote");
    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalled());

    expect(console.error).toHaveBeenCalledWith("错误: direction 必须是 push 或 pull");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
