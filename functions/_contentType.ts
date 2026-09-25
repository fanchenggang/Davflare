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
