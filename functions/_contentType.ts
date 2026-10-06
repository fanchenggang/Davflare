/**
 * 存储的 Content-Type 来自上传方，可能缺少 charset 声明。
 * 浏览器把无 charset 的 text/* 按 Windows-1252 解码，UTF-8 中文会乱码
 * （分享预览 iframe、WebDAV 直链、api/download 响应均受影响）。
 * 仅对 text/* 且未声明 charset 的类型补 UTF-8，其余原样返回。
 */
export function withUtf8Charset(contentType: string): string {
  const ct = contentType || "";
  if (!/^text\//i.test(ct) || /charset=/i.test(ct)) return ct;
  return `${ct}; charset=utf-8`;
}

/**
 * 可以在网盘同源下直接内联展示、且不会执行脚本的媒体类型：位图、音视频、PDF。
 * SVG/HTML/XML/JS 等「活动」文档以及其它一切类型都不在此列。
 */
export function isInlineSafeMedia(contentType: string): boolean {
  const type = (contentType || "").split(";")[0].trim().toLowerCase();
  if (type === "image/svg+xml") return false;
  return (
    type.startsWith("image/") ||
    type.startsWith("video/") ||
    type.startsWith("audio/") ||
    type === "application/pdf"
  );
}

/**
 * 直接返回存储内容（WebDAV GET）时的同源防护：网盘源下 localStorage 存着登录凭据，
 * 存储的 Content-Type 来自上传方（文件收集链接的匿名上传、第三方 WebDAV 客户端）。
 * - nosniff：浏览器不嗅探改判类型；
 * - 非媒体类型加 CSP sandbox：即使是 text/html、image/svg+xml，直接打开时也在
 *   opaque origin 里渲染、禁脚本，读不到网盘凭据（与 /share 的处理一致）。
 *   媒体类型不加，避免 Chrome 拒绝在 sandbox 文档里渲染 PDF。
 */
export function applyStoredContentHardening(headers: Headers, contentType: string): void {
  headers.set("X-Content-Type-Options", "nosniff");
  if (!isInlineSafeMedia(contentType)) {
    headers.set("Content-Security-Policy", "sandbox");
  }
}
