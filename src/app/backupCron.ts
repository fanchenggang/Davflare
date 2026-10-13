/** Build safe crontab / CI snippets for davflare-cli sync. Never embeds a live API key. */

/** CLI env vars (see cli/src/config.ts). Prefer these in CI; locally `davflare login` is enough. */
export const BACKUP_SERVER_ENV = "DAVFLARE_SERVER";
export const BACKUP_KEY_ENV = "DAVFLARE_KEY";

export type BackupSyncDirection = "push" | "pull";

export type BackupCronOptions = {
  /** Local directory path in the crontab command (default ~/Documents). */
  localDir?: string;
  /** Remote Davflare path (default backups/daily). */
  remoteDir?: string;
  /** Five-field cron schedule (default 0 3 * * * = 03:00 daily). */
  schedule?: string;
  /** Absolute or bare davflare binary (default davflare on PATH). */
  binary?: string;
  /** Optional log redirect path; empty string skips logging. */
  logFile?: string;
};

const DEFAULTS = {
  localDir: "~/Documents",
  remoteDir: "backups/daily",
  schedule: "0 3 * * *",
  binary: "davflare",
  logFile: "~/logs/davflare-sync.log",
} as const;

function resolveOpts(opts: BackupCronOptions = {}) {
  return {
    localDir: opts.localDir ?? DEFAULTS.localDir,
    remoteDir: opts.remoteDir ?? DEFAULTS.remoteDir,
    schedule: opts.schedule ?? DEFAULTS.schedule,
    binary: opts.binary ?? DEFAULTS.binary,
    logFile: opts.logFile === undefined ? DEFAULTS.logFile : opts.logFile,
  };
}

/** Sync argv fragment shared by crontab and shell one-liners. */
export function buildSyncCommand(
  direction: BackupSyncDirection,
  opts: BackupCronOptions = {}
): string {
  const { localDir, remoteDir, binary } = resolveOpts(opts);
  return `${binary} sync ${direction} ${localDir} ${remoteDir}`;
}

/**
 * Crontab line that relies on `~/.config/davflare/config.json`
 * (created by `davflare login`). No key in the line.
 */
export function buildConfigFileCrontab(
  direction: BackupSyncDirection,
  opts: BackupCronOptions = {}
): string {
  const { schedule, logFile } = resolveOpts(opts);
  const cmd = buildSyncCommand(direction, opts);
  const redirect = logFile ? ` >>${logFile} 2>&1` : "";
  return `${schedule} ${cmd}${redirect}`;
}

/**
 * Crontab line that sources `~/.config/davflare/env` for
 * DAVFLARE_SERVER / DAVFLARE_KEY. Values stay in that file, not here.
 */
export function buildEnvCrontab(
  direction: BackupSyncDirection,
  opts: BackupCronOptions = {}
): string {
  const { schedule, logFile } = resolveOpts(opts);
  const cmd = buildSyncCommand(direction, opts);
  const redirect = logFile ? ` >>${logFile} 2>&1` : "";
  return `${schedule} . "$HOME/.config/davflare/env" && ${cmd}${redirect}`;
}

/** Multi-line block shown / copied from Settings (comments + push + pull). */
export function buildBackupCronBlock(
  origin: string,
  opts: BackupCronOptions = {}
): string {
  const serverHint = origin.replace(/\/+$/, "") || "https://drive.example.com";
  const push = buildConfigFileCrontab("push", opts);
  const pull = buildConfigFileCrontab("pull", {
    ...opts,
    schedule: "30 3 * * *",
    logFile:
      opts.logFile === undefined ? "~/logs/davflare-pull.log" : opts.logFile,
  });
  const pushEnv = buildEnvCrontab("push", opts);

  return [
    `# Davflare scheduled backup (davflare-cli sync)`,
    `# 1) npm i -g davflare-cli   OR   use node path/to/cli/dist/index.js`,
    `# 2) Prefer: davflare login --server ${serverHint}`,
    `#    credentials → ~/.config/davflare/config.json (mode 0600). No key in crontab.`,
    `# 3) Or put exports in ~/.config/davflare/env (chmod 600):`,
    `#      export ${BACKUP_SERVER_ENV}=${serverHint}`,
    `#      export ${BACKUP_KEY_ENV}=<API_KEY>   # never paste the real key into crontab`,
    `# 4) crontab -e  → paste a line below. Adjust local/remote paths.`,
    `#`,
    `# --- using config file (after login) ---`,
    push,
    pull,
    `#`,
    `# --- using ~/.config/davflare/env ---`,
    pushEnv,
    "",
  ].join("\n");
}

/** True if text embeds a live-looking API key (fd_…). */
export function backupCronContainsRawKey(text: string): boolean {
  return /\bfd_[A-Za-z0-9_-]{8,}\b/.test(text);
}
