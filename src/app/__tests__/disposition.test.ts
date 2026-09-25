/** functions/api/_disposition.ts：/api/download、/api/archive、/share 共用的 Content-Disposition。 */
import { contentDisposition } from "../../../functions/api/_disposition";

describe("contentDisposition", () => {
  test("ASCII name: fallback equals name", () => {
    expect(contentDisposition("report.txt")).toBe(
      "attachment; filename=\"report.txt\"; filename*=UTF-8''report.txt"
    );
  });

  test("non-ASCII / quotes / backslash / CRLF are safe in fallback; filename* is RFC 5987", () => {
    const value = contentDisposition('资料 "a"\\b*\r\n.zip', "inline");
    expect(value.startsWith('inline; filename="__ _a__b*__.zip"; filename*=UTF-8\'\'')).toBe(true);
    expect(value).not.toMatch(/[\r\n]/);
    expect(value).toContain("%E8%B5%84%E6%96%99%20%22a%22%5Cb%2A%0D%0A.zip");
    // Headers 只接受 ByteString：不应抛异常（#118 的 500 回归）
    expect(() => new Headers({ "Content-Disposition": value })).not.toThrow();
  });

  test("empty name uses the default", () => {
    expect(contentDisposition("", "attachment", "archive.zip")).toBe(
      "attachment; filename=\"archive.zip\"; filename*=UTF-8''archive.zip"
    );
  });
});
