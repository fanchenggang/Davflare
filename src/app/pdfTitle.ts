// PDF 预览标题（#149 附带问题）：PDF 用 blob: URL 打开时，Chrome 内置阅读器的标题栏和标签页
// 显示的是 URL 末段（一串 UUID）——除非 PDF 自己的文档信息里有 Title。
// 这里给预览用的副本追加一次「增量更新」：新的 Info 对象（Title = 文件名）+ 一小段 xref + trailer，
// 原文件字节一个不动，只在末尾追加。下载仍用原文件。
// 加密的 PDF（Info 里的字符串也得加密）、找不到 trailer 的、读失败的一律原样返回。

const TAIL_BYTES = 4096;
/** 读 xref 段开头这么多字节找 trailer：第一页 xref 很短，主 xref 的 trailer 在末尾 TAIL_BYTES 里 */
const XREF_SECTION_BYTES = 64 * 1024;

async function readBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") return new Uint8Array(await blob.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/** 字节按 latin1 一一映射成字符：PDF 结构关键字都是 ASCII，偏移量与字符下标一致 */
function latin1(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return out;
}

/** PDF 文本字符串：UTF-16BE + BOM 的十六进制形式，任何字符（含括号、反斜杠）都不用转义 */
export function pdfTextString(text: string): string {
  let hex = "FEFF";
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
  return `<${hex}>`;
}

interface TrailerInfo {
  prev: number;
  root: string;
  size: number;
  id: string | null;
}

/** offset 处的 xref 段（传统表或 xref 流）对应的 trailer 字典文本 */
async function dictAt(blob: Blob, offset: number): Promise<string | null> {
  const head = latin1(await readBytes(blob.slice(offset, offset + XREF_SECTION_BYTES)));
  if (/^\s*xref\b/.test(head)) {
    const at = head.indexOf("trailer");
    if (at < 0) return null;
    const end = head.indexOf("startxref", at);
    return head.slice(at, end >= 0 ? end : undefined);
  }
  if (/^\s*\d+\s+\d+\s+obj\b/.test(head) && /\/Type\s*\/XRef\b/.test(head)) {
    const end = head.indexOf("stream");
    return end >= 0 ? head.slice(0, end) : null;
  }
  return null;
}

/**
 * 找最后一个 startxref 指向的 xref 段的 trailer 字段。
 * 线性化文件的末尾 trailer 没有 /Root（在文件开头第一页的 trailer 里），所以两处都看：
 * /Root 取能找到的，/Size 取较大的，任何一处有 /Encrypt 就放弃。
 */
async function readTrailer(blob: Blob): Promise<TrailerInfo | null> {
  const tailStart = Math.max(0, blob.size - TAIL_BYTES);
  const tail = latin1(await readBytes(blob.slice(tailStart)));
  const starts = [...tail.matchAll(/startxref\s+(\d+)\s+%%EOF/g)];
  const last = starts[starts.length - 1];
  if (!last) return null;
  const prev = Number(last[1]);
  if (!Number.isSafeInteger(prev) || prev <= 0 || prev >= blob.size) return null;

  const dicts: string[] = [];
  const trailerAt = tail.lastIndexOf("trailer", last.index);
  if (trailerAt >= 0) dicts.push(tail.slice(trailerAt, last.index));
  const atPrev = await dictAt(blob, prev);
  if (atPrev) dicts.push(atPrev);
  if (dicts.length === 0 || dicts.some((dict) => /\/Encrypt\b/.test(dict))) return null;

  let root: string | null = null;
  let size = 0;
  let id: string | null = null;
  for (const dict of dicts) {
    const rootMatch = dict.match(/\/Root\s+(\d+\s+\d+)\s+R/);
    if (!root && rootMatch) root = rootMatch[1].replace(/\s+/g, " ");
    const sizeMatch = dict.match(/\/Size\s+(\d+)/);
    if (sizeMatch) size = Math.max(size, Number(sizeMatch[1]));
    const idMatch = dict.match(/\/ID\s*\[[^\]]*\]/);
    if (!id && idMatch) id = idMatch[0];
  }
  if (!root || !(size > 0)) return null;
  return { prev, root, size, id };
}

/**
 * 线性化 PDF 会先按文件头的 hint 渐进显示，此时还读不到我们追加在末尾的 Title，
 * 工具栏会先闪一下 blob UUID（#190）。抹掉 /Linearized，长度不变、后面 xref 偏移不变，
 * Chrome 会改走从 EOF 读 trailer 的完整解析，一开始就能拿到 Title。
 */
async function withoutLinearization(blob: Blob): Promise<Blob> {
  const headSize = Math.min(blob.size, 8192);
  if (headSize <= 0) return blob;
  const head = await readBytes(blob.slice(0, headSize));
  const asText = latin1(head);
  const match = asText.match(/\/Linearized\s+\d+/);
  if (!match || match.index == null) return blob;
  const patched = new Uint8Array(head);
  patched.fill(0x20, match.index, match.index + match[0].length);
  return new Blob([patched, blob.slice(headSize)], { type: blob.type || "application/pdf" });
}

/** 返回带 Title 的 PDF 副本；无法安全处理时原样返回 */
export async function withPdfTitle(blob: Blob, title: string): Promise<Blob> {
  const name = title.trim();
  if (!name) return blob;
  try {
    const trailer = await readTrailer(blob);
    if (!trailer || !Number.isSafeInteger(trailer.size) || trailer.size <= 0) return blob;
    const base = await withoutLinearization(blob);
    const obj = trailer.size;
    const objOffset = base.size + 1; // 前面补一个换行
    const objText = `${obj} 0 obj\n<< /Title ${pdfTextString(name.slice(0, 500))} >>\nendobj\n`;
    const xrefOffset = objOffset + objText.length;
    const appendix =
      "\n" +
      objText +
      "xref\n" +
      `${obj} 1\n` +
      `${String(objOffset).padStart(10, "0")} 00000 n\r\n` +
      "trailer\n" +
      `<< /Size ${obj + 1} /Root ${trailer.root} R /Info ${obj} 0 R /Prev ${trailer.prev}${trailer.id ? ` ${trailer.id}` : ""} >>\n` +
      "startxref\n" +
      `${xrefOffset}\n` +
      "%%EOF\n";
    // appendix 只含 ASCII（标题已转成十六进制），字符数 = 字节数
    return new Blob([base, appendix], { type: "application/pdf" });
  } catch {
    return blob;
  }
}
