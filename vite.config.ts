import { coverageConfigDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Cloudflare Pages 部署约定：产物目录必须是 build/（见 wrangler.toml 的
// pages_build_output_dir），因此构建 outDir 保持为 "build"。
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "build",
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/setupTests.ts"],
    // 与 CRA jest-environment-jsdom 的默认 URL 保持一致（直链拼接断言依赖 origin）。
    environmentOptions: {
      jsdom: { url: "http://localhost/" },
    },
    // 测试全部位于 src/app/__tests__/（与原 CRA testMatch 范围一致），
    // cli/ 是独立的 vitest 包，不要被根配置扫描到。
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // 与原 jest collectCoverageFrom 对齐：src + functions 全量，
      // 排除测试基建（index.js 已随 CRA 迁移删除）。
      include: ["src/**/*.{js,jsx,ts,tsx}", "functions/**/*.ts"],
      exclude: [
        ...coverageConfigDefaults.exclude,
        "src/index.jsx",
        "src/app/testUtils.ts",
        "src/app/testInMemoryBucket.ts",
        // 纯类型文件（无可执行语句），v8 无法产生覆盖数据
        "src/app/types.ts",
        "src/app/notify.ts",
        "functions/webdav/davTypes.ts",
      ],
      // 阈值 = v8 provider 实测值 - 0.5 棘轮（istanbul 与 v8 口径不同，
      // 不能沿用 jest 字段里的旧数字；分组聚合以 coverage-final.json 汇总为准，
      // 注意 text 报告的目录行只聚合该层直属文件，不是分组总量）。迁移实测（2026-09）：
      //   global      84.55 / 84.01 / 81.46 / 84.55
      //   src/**      96.81 / 88.96 / 85.83 / 96.81
      //   functions   65.77 / 76.10 / 72.72 / 65.77
      // 2026-09 补 functions/api 端点直测（apiListStat/apiMutations/
      // apiDownloadSearchCounts/apiKeysConfig/apiImagesSites/mcpEndpoint）：
      //   global      93.8060 / 84.7413 / 89.6016 / 93.8060
      //   src/**      96.6025 / 88.5115 / 85.8220 / 96.6025
      //   functions   89.5880 / 80.6063 / 96.4481 / 89.5880
      // 2026-09 二轮：大文件拆分（_mcp/webdav 协议层/Main/transfer/strings）
      // + _setup/webdav 工具层/mcp pull-push 直测（apiSetup/webdavHelpers 等）：
      //   global      94.8433 / 86.2098 / 90.3382 / 94.8433
      //   src/**      96.7529 / 88.7599 / 85.9492 / 96.7529
      //   functions   91.9428 / 83.5253 / 98.3607 / 91.9428
      thresholds: {
        global: {
          statements: 94.34,
          branches: 85.7,
          functions: 89.83,
          lines: 94.34,
        },
        "src/**": {
          statements: 96.25,
          branches: 88.25,
          functions: 85.44,
          lines: 96.25,
        },
        "functions/**": {
          statements: 91.44,
          branches: 83.02,
          functions: 97.86,
          lines: 91.44,
        },
      },
    },
  },
});
