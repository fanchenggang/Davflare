/**
 * Content-Disposition 统一构造（/api/download、/api/archive、/share/<token> 共用）。
 * - `filename="…"`：ASCII 回退名。Headers 只接受 ByteString，非 ASCII 会抛异常（#118 修过的 500），
 *   所以不可打印 ASCII 与 `"` `\` 统一替换为 `_`；老版 curl -OJ 等只认这个参数。
 * - `filename*=UTF-8''…`：RFC 5987/6266 编码的原始名（中文等），现代浏览器与新版 curl 优先使用。
 */
export function contentDisposition(
  filename: string,
  type: "attachment" | "inline" = "attachment",
  defaultName = "download"
): string {
  const name = filename || defaultName;
  const fallback = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || defaultName;
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
