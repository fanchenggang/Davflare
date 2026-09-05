import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";
import { webcrypto } from "crypto";
import { TextDecoder, TextEncoder } from "util";

// RTL waitFor/find* 默认 1s 超时；coverage 全量插桩 + 并行 worker 时偶发超时。
// 只放宽等待上限，不改任何断言语义。
configure({ asyncUtilTimeout: 3000 });

// jsdom 不提供 TextEncoder/TextDecoder（Node 20+ 有，这里兜底旧环境）。
if (typeof global.TextEncoder === "undefined") {
  (global as any).TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === "undefined") {
  (global as any).TextDecoder = TextDecoder;
}
// jsdom 自带的 crypto 只有 getRandomValues，没有 subtle（transfer 的
// blobDigest、uploadApi/shareToken 的摘要测试依赖 crypto.subtle），
// 因此在缺 subtle 的环境下用 Node 的 webcrypto 整体替换。
if (typeof (global.crypto as any)?.subtle === "undefined") {
  try {
    (global as any).crypto = webcrypto;
  } catch {
    // 某些环境下 global.crypto 是只读访问器，忽略（Node 20+ 的 jsdom env 通常已可用）
  }
}
