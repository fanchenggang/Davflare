import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

// 回归仓库根 action.yml 背后的 scripts/deploy-site-action.sh（"Deploy to Davflare Site" GitHub Action）：
// 由 scripts/test-deploy-site-action.sh 对 mock API 验证成功打印 URL、密钥错误非零退出且报错明确、
// 密钥不出现在日志、缺输入/空目录报错。放在 CLI 测试里，现有 CI「CLI (vitest)」即可覆盖。
const cliDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(cliDir, "..");

describe("Deploy to Davflare Site action script", () => {
  beforeAll(() => {
    // 预先 tsc 出 cli/dist，action 脚本检测到已构建即跳过 npm ci（避免测试中重装 node_modules）
    execFileSync(process.execPath, [path.join(cliDir, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json"], {
      cwd: cliDir,
      stdio: "inherit",
    });
  }, 120_000);

  it("mock API 全套回归通过", () => {
    const result = spawnSync("bash", [path.join(repoRoot, "scripts", "test-deploy-site-action.sh")], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, GITHUB_ACTIONS: "false" },
    });
    const output = `${result.stdout}\n${result.stderr}`;
    if (result.status !== 0) console.error(output);
    expect(output).toContain("0 failed");
    expect(result.status).toBe(0);
  }, 120_000);
});
