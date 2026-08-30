import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface DavflareConfig {
  server: string;
  key: string;
  keyId?: string;
  keyName?: string;
}

export class ConfigError extends Error {}

function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg ? path.join(xdg, "davflare") : path.join(os.homedir(), ".config", "davflare");
}

function configFile(): string {
  return path.join(configDir(), "config.json");
}

export function loadConfig(): DavflareConfig {
  const envServer = process.env.DAVFLARE_SERVER;
  const envKey = process.env.DAVFLARE_KEY;
  if (envServer && envKey) {
    return { server: normalizeServer(envServer), key: envKey };
  }
  let stored: DavflareConfig | null = null;
  try {
    stored = JSON.parse(fs.readFileSync(configFile(), "utf8")) as DavflareConfig;
  } catch {
    stored = null;
  }
  if (envKey && stored) {
    return { ...stored, key: envKey };
  }
  if (stored?.server && stored?.key) {
    return stored;
  }
  if (envServer && envKey) return { server: normalizeServer(envServer), key: envKey };
  throw new ConfigError(
    "未登录：先运行 `davflare login`，或设置 DAVFLARE_SERVER 与 DAVFLARE_KEY 环境变量"
  );
}

export function saveConfig(config: DavflareConfig): void {
  const dir = configDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = configFile();
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

export function clearConfig(): boolean {
  try {
    fs.unlinkSync(configFile());
    return true;
  } catch {
    return false;
  }
}

export function normalizeServer(raw: string): string {
  let server = raw.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(server)) server = `https://${server}`;
  return server;
}
