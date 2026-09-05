import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**"],
      reporter: ["text", "html"],
      // 阈值先不设，只出数字
    },
  },
});
