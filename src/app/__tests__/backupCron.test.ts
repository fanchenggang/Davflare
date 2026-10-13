import { describe, expect, test } from "vitest";

import {
  BACKUP_KEY_ENV,
  BACKUP_SERVER_ENV,
  backupCronContainsRawKey,
  buildBackupCronBlock,
  buildConfigFileCrontab,
  buildEnvCrontab,
  buildSyncCommand,
} from "../backupCron";

describe("backupCron", () => {
  test("sync command has no credentials", () => {
    const cmd = buildSyncCommand("push", {
      localDir: "/data/docs",
      remoteDir: "backups/docs",
    });
    expect(cmd).toBe("davflare sync push /data/docs backups/docs");
    expect(backupCronContainsRawKey(cmd)).toBe(false);
  });

  test("config-file crontab has schedule + redirect, no key", () => {
    const line = buildConfigFileCrontab("push");
    expect(line).toMatch(/^0 3 \* \* \* davflare sync push ~/);
    expect(line).toContain(">>~/logs/davflare-sync.log");
    expect(line).not.toContain(BACKUP_KEY_ENV);
    expect(line).not.toContain("fd_");
    expect(backupCronContainsRawKey(line)).toBe(false);
  });

  test("env crontab sources ~/.config/davflare/env without embedding values", () => {
    const line = buildEnvCrontab("pull", {
      schedule: "15 4 * * *",
      localDir: "~/Photos",
      remoteDir: "photos",
      logFile: "",
    });
    expect(line).toBe(
      '15 4 * * * . "$HOME/.config/davflare/env" && davflare sync pull ~/Photos photos'
    );
    expect(line).not.toMatch(/DAVFLARE_KEY=\S+/);
    expect(backupCronContainsRawKey(line)).toBe(false);
  });

  test("full block mentions origin and both directions, never a live key", () => {
    const block = buildBackupCronBlock("https://drive.example.com/");
    expect(block).toContain("https://drive.example.com");
    expect(block).toContain("davflare login");
    expect(block).toContain(BACKUP_SERVER_ENV);
    expect(block).toContain(BACKUP_KEY_ENV);
    expect(block).toContain("sync push");
    expect(block).toContain("sync pull");
    expect(block).toContain(".config/davflare/env");
    expect(backupCronContainsRawKey(block)).toBe(false);
    expect(block).not.toMatch(/\bfd_[A-Za-z0-9]/);
  });

  test("backupCronContainsRawKey detects fd_ tokens", () => {
    expect(backupCronContainsRawKey("export DAVFLARE_KEY=<API_KEY>")).toBe(false);
    expect(backupCronContainsRawKey("export DAVFLARE_KEY=fd_abcdefghijklmnop")).toBe(
      true
    );
  });
});
