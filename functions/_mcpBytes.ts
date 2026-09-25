// MCP 内容编码工具：base64 编解码与上传内容解码（utf8/base64）。
export function decodeBase64(value: string): Uint8Array {
  const cleaned = value.replace(/\s+/g, "");
  if (!cleaned) return new Uint8Array();
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x2000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk))
    );
  }
  return btoa(binary);
}

export function decodeUploadContent(
  content: string,
  encoding?: string
): { ok: true; bytes: Uint8Array } | { ok: false; error: string } {
  const enc = (encoding || "utf8").trim().toLowerCase();
  if (enc === "utf8" || enc === "utf-8") {
    return { ok: true, bytes: new TextEncoder().encode(content) };
  }
  if (enc === "base64") {
    try {
      return { ok: true, bytes: decodeBase64(content) };
    } catch {
      return { ok: false, error: "Invalid base64 content" };
    }
  }
  return { ok: false, error: "encoding must be utf8 or base64" };
}

export function isUtf8Text(bytes: Uint8Array): boolean {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return text.indexOf("\0") < 0;
  } catch {
    return false;
  }
}
