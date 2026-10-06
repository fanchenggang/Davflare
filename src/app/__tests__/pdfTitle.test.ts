/**
 * #149 附带问题：PDF 预览 / 新标签页标题显示 blob URL 的 UUID。
 * withPdfTitle 在副本末尾追加增量更新（Info.Title = 文件名），原字节不动。
 */
import { pdfTextString, withPdfTitle } from "../pdfTitle";

function text(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result as ArrayBuffer);
      let out = "";
      for (const byte of bytes) out += String.fromCharCode(byte);
      resolve(out);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/** 最小的传统 xref 表 PDF，offset 按实际位置算 */
function classicPdf(trailerExtra = ""): string {
  const objs = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] >>\nendobj\n",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const obj of objs) {
    offsets.push(body.length);
    body += obj;
  }
  const xrefAt = body.length;
  body += "xref\n0 4\n0000000000 65535 f\r\n";
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n\r\n`;
  body += `trailer\n<< /Size 4 /Root 1 0 R${trailerExtra} >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return body;
}

function parseAppendix(original: string, patched: string) {
  expect(patched.startsWith(original)).toBe(true);
  const appendix = patched.slice(original.length);
  const startxref = Number(appendix.match(/startxref\n(\d+)\n%%EOF\n$/)![1]);
  const objOffset = Number(appendix.match(/xref\n\d+ 1\n(\d{10}) 00000 n\r\n/)![1]);
  return { appendix, startxref, objOffset };
}

describe("withPdfTitle", () => {
  test("classic xref: appends Info with the file name; offsets point at the new objects", async () => {
    const original = classicPdf(" /ID [<AA><BB>]");
    const out = await withPdfTitle(new Blob([original], { type: "application/pdf" }), "报告 (v2).pdf");
    expect(out.type).toBe("application/pdf");
    const patched = await text(out);
    const { appendix, startxref, objOffset } = parseAppendix(original, patched);
    expect(patched.slice(objOffset).startsWith("4 0 obj\n<< /Title ")).toBe(true);
    expect(patched.slice(startxref).startsWith("xref\n4 1\n")).toBe(true);
    expect(appendix).toContain(`/Title ${pdfTextString("报告 (v2).pdf")}`);
    const xrefAt = original.indexOf("xref\n0 4");
    expect(appendix).toContain(`<< /Size 5 /Root 1 0 R /Info 4 0 R /Prev ${xrefAt} /ID [<AA><BB>] >>`);
  });

  test("xref stream: reads /Root and /Size from the stream dictionary", async () => {
    const head = "%PDF-1.5\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
    const xrefAt = head.length;
    const original =
      head +
      "9 0 obj\n<< /Type /XRef /Size 10 /Root 1 0 R /W [1 2 1] /Length 4 /Filter /FlateDecode >>\nstream\nxxxx\nendstream\nendobj\n" +
      `startxref\n${xrefAt}\n%%EOF\n`;
    const patched = await text(await withPdfTitle(new Blob([original]), "a.pdf"));
    const { appendix } = parseAppendix(original, patched);
    expect(appendix).toContain(`<< /Size 11 /Root 1 0 R /Info 10 0 R /Prev ${xrefAt} >>`);
  });

  test("linearized: final trailer has no /Root, so it is taken from the first-page section", async () => {
    const first = "%PDF-1.3\n";
    const xrefAt = first.length;
    const original =
      first +
      "xref\n3 1\n0000000015 00000 n\r\ntrailer << /Info 2 0 R /Root 4 0 R /Size 8 /Prev 300 >>\nstartxref\n0\n%%EOF\n" +
      "4 0 obj\n<< /Type /Catalog >>\nendobj\n" +
      "xref\n0 1\n0000000000 65535 f\r\ntrailer << /Size 3 >>\n" +
      `startxref\n${xrefAt}\n%%EOF\n`;
    const patched = await text(await withPdfTitle(new Blob([original]), "l.pdf"));
    const { appendix } = parseAppendix(original, patched);
    expect(appendix).toContain(`<< /Size 9 /Root 4 0 R /Info 8 0 R /Prev ${xrefAt} >>`);
  });

  test("left alone: encrypted, no trailer, bad startxref, empty title", async () => {
    const encrypted = new Blob([classicPdf(" /Encrypt 9 0 R")]);
    expect(await withPdfTitle(encrypted, "x.pdf")).toBe(encrypted);
    const garbage = new Blob(["not a pdf"]);
    expect(await withPdfTitle(garbage, "x.pdf")).toBe(garbage);
    const badOffset = new Blob(["%PDF-1.4\ntrailer << /Size 1 /Root 1 0 R >>\nstartxref\n999999\n%%EOF\n"]);
    expect(await withPdfTitle(badOffset, "x.pdf")).toBe(badOffset);
    const noRoot = new Blob(["%PDF-1.4\nxref\n0 1\n0000000000 65535 f\r\ntrailer << /Size 1 >>\nstartxref\n9\n%%EOF\n"]);
    expect(await withPdfTitle(noRoot, "x.pdf")).toBe(noRoot);
    const ok = new Blob([classicPdf()]);
    expect(await withPdfTitle(ok, "   ")).toBe(ok);
  });

  test("linearized flag is blanked so Chrome will not progressive-paint before Title (#190)", async () => {
    const head =
      "%PDF-1.5\n" +
      "999 0 obj\n<< /Linearized 1 /L 12345 /H [ 100 20 ] /O 5 /E 200 /N 1 /T 12000 >>\nendobj\n";
    const xrefAt = head.length;
    const original =
      head +
      "1 0 obj\n<< /Type /Catalog >>\nendobj\n" +
      `xref\n0 2\n0000000000 65535 f\r\n${String(head.length).padStart(10, "0")} 00000 n\r\n` +
      "trailer\n<< /Size 2 /Root 1 0 R >>\n" +
      `startxref\n${xrefAt}\n%%EOF\n`;
    expect(original).toContain("/Linearized 1");
    const out = await withPdfTitle(new Blob([original], { type: "application/pdf" }), "lin.pdf");
    const patched = await text(out);
    expect(patched).not.toContain("/Linearized");
    // 同长度空格替换：前缀体积不变，Title 附录紧接其后
    expect(out.size - original.length).toBeGreaterThan(50);
    expect(patched.slice(original.length)).toMatch(/^\n2 0 obj\n<< \/Title /);
    expect(patched).toContain(`/Title ${pdfTextString("lin.pdf")}`);
  });

  test("pdfTextString: UTF-16BE hex with BOM (no escaping needed)", () => {
    expect(pdfTextString("A(")).toBe("<FEFF00410028>");
    expect(pdfTextString("中")).toBe("<FEFF4E2D>");
  });
});
