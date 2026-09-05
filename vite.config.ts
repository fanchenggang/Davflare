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
      ],
      // 阈值 = v8 provider 实测值 - 0.5 棘轮（istanbul 与 v8 口径不同，
      // 不能沿用 jest 字段里的旧数字；分组聚合以 coverage-final.json 汇总为准，
      // 注意 text 报告的目录行只聚合该层直属文件，不是分组总量）。迁移实测（2026-09）：
      //   global      84.55 / 84.01 / 81.46 / 84.55
      //   src/**      96.81 / 88.96 / 85.83 / 96.81
      //   functions   65.77 / 76.10 / 72.72 / 65.77
      thresholds: {
        global: {
          statements: 84.05,
          branches: 83.51,
          functions: 80.96,
          lines: 84.05,
        },
        "src/**": {
          statements: 96.31,
          branches: 88.46,
          functions: 85.33,
          lines: 96.31,
        },
        "functions/**": {
          statements: 65.27,
          branches: 75.6,
          functions: 72.22,
          lines: 65.27,
        },
      },
    },
  },
});
