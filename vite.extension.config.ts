import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 扩展网盘视图:把 Web 端 React App(src/extensionDrive/main.tsx 挂载 <App/>)
// 打成单文件 extension/drive/drive.js,由 extension/bookmarks.html 静态引用。
// 产物不入库(.gitignore 的 extension/drive/),发布 zip 前由
// scripts/package-extension.sh 统一构建。
export default defineConfig({
  plugins: [react()],
  // 不拷贝 public/:里面的 _headers/manifest.json 是 Web 端资产,不能混进扩展包
  publicDir: false,
  build: {
    outDir: "extension/drive",
    emptyOutDir: true,
    target: "chrome110",
    rollupOptions: {
      // 必须显式指定 TS 入口,否则 vite 会回退到根 index.html(Web 端入口),
      // 打出来的就不是扩展桥接层了。
      input: fileURLToPath(
        new URL("./src/extensionDrive/main.tsx", import.meta.url)
      ),
      output: {
        // 固定文件名供 bookmarks.html 引用;React.lazy 的重组件随主包一起
        // 加载——扩展页不做异步 chunk,避免运行时拼接模块路径。
        inlineDynamicImports: true,
        entryFileNames: "drive.js",
        chunkFileNames: "drive.js",
        assetFileNames: "drive.[ext]",
      },
    },
  },
});
