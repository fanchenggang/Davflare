import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ConfigError,
  clearConfig,
  loadConfig,
  normalizeServer,
  saveConfig,
} from "../src/config.js";

// 通过 XDG_CONFIG_HOME 把配置目录注入到临时目录，避免碰真实 ~/.config。
let configRoot: string;

beforeEach(() => {
  configRoot = fs.mkdtempSync(path.join(os.tmpdir(), "davflare-config-"));
  vi.stubEnv("XDG_CONFIG_HOME", configRoot);
  vi.stubEnv("DAVFLARE_SERVER", "");
  vi.stubEnv("DAVFLARE_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(configRoot, { recursive: true, force: true });
});

function configFile(): string {
  return path.join(configRoot, "davflare", "config.json");
}

describe("normalizeServer", () => {
  it("裸域名补 https://，多余斜杠去除", () => {
    expect(normalizeServer("drive.example.com")).toBe("https://drive.example.com");
    expect(normalizeServer("https://x.io/")).toBe("https://x.io");
    expect(normalizeServer("http://a.io///")).toBe("http://a.io");
  });

  it("trim 空白且保留已带协议的地址", () => {
    expect(normalizeServer("  https://s.example.com/path/  ")).toBe(
      "https://s.example.com/path"
    );
  });
});

describe("saveConfig / loadConfig", () => {
  it("保存后可读回完整配置，文件权限 0600", () => {
    saveConfig({ server: "https://d.example", key: "fd_k", keyId: "id1", keyName: "cli-x" });
    expect(loadConfig()).toEqual({
      server: "https://d.example",
      key: "fd_k",
      keyId: "id1",
      keyName: "cli-x",
    });
    const mode = fs.statSync(configFile()).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("重复保存覆盖旧内容且保持 0600", () => {
    saveConfig({ server: "https://a.example", key: "old" });
    saveConfig({ server: "https://b.example", key: "new" });
    expect(loadConfig()).toEqual({ server: "https://b.example", key: "new" });
    expect((fs.statSync(configFile()).mode & 0o777) === 0o600).toBe(true);
  });
});

describe("loadConfig 环境变量", () => {
  it("DAVFLARE_SERVER + DAVFLARE_KEY 同时设置时优先于文件", () => {
    saveConfig({ server: "https://file.example", key: "file-key" });
    vi.stubEnv("DAVFLARE_SERVER", "env.example.com/");
    vi.stubEnv("DAVFLARE_KEY", "env-key");
    expect(loadConfig()).toEqual({ server: "https://env.example.com", key: "env-key" });
  });

  it("仅 DAVFLARE_KEY 时与文件配置合并（server 来自文件）", () => {
    saveConfig({ server: "https://file.example", key: "file-key" });
    vi.stubEnv("DAVFLARE_KEY", "env-key");
    expect(loadConfig()).toEqual({ server: "https://file.example", key: "env-key" });
  });

  it("无文件无环境变量抛 ConfigError", () => {
    expect(() => loadConfig()).toThrow(ConfigError);
    expect(() => loadConfig()).toThrow(/davflare login/);
  });

  it("文件损坏视为未登录", () => {
    fs.mkdirSync(path.join(configRoot, "davflare"), { recursive: true });
    fs.writeFileSync(configFile(), "{not json");
    expect(() => loadConfig()).toThrow(ConfigError);
  });
});

describe("clearConfig", () => {
  it("删除已存在的配置文件返回 true", () => {
    saveConfig({ server: "https://d.example", key: "k" });
    expect(clearConfig()).toBe(true);
    expect(fs.existsSync(configFile())).toBe(false);
  });

  it("无配置文件返回 false", () => {
    expect(clearConfig()).toBe(false);
  });
});
