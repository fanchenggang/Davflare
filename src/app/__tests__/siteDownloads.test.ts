import {
  checkDownloadsLimits,
  downloadsMimeType,
  downloadsNameCandidate,
  downloadsPublicBase,
  isDownloadsAssetName,
  isDownloadsReadmeName,
  renderDownloadsPage,
  renderReleaseNotesMarkdown,
  DOWNLOADS_MAX_FILES,
} from "../../../functions/sitePages";
import { sha256Bytes } from "../../../functions/api/_apikey";

describe("downloads helpers", () => {
  test("readme / asset name filters", () => {
    expect(isDownloadsReadmeName("README.md")).toBe(true);
    expect(isDownloadsReadmeName("readme.markdown")).toBe(true);
    expect(isDownloadsReadmeName("app.zip")).toBe(false);
    expect(isDownloadsAssetName("app.zip")).toBe(true);
    expect(isDownloadsAssetName("README.md")).toBe(false);
    expect(isDownloadsAssetName(".hidden")).toBe(false);
  });

  test("mime + name candidate", () => {
    expect(downloadsMimeType("App.zip")).toBe("application/zip");
    expect(downloadsMimeType("Setup.exe")).toContain("portable-executable");
    expect(downloadsNameCandidate("app.zip", 1)).toBe("app.zip");
    expect(downloadsNameCandidate("app.zip", 2)).toBe("app-2.zip");
    expect(downloadsNameCandidate("README.md", 1)).toBeNull();
  });

  test("checkDownloadsLimits", () => {
    expect(checkDownloadsLimits(0, 0).ok).toBe(false);
    expect(checkDownloadsLimits(1, 10).ok).toBe(true);
    expect(checkDownloadsLimits(DOWNLOADS_MAX_FILES + 1, 1).ok).toBe(false);
  });

  test("downloadsPublicBase", () => {
    expect(downloadsPublicBase("sites.example.com", "rel")).toBe("https://sites.example.com/rel");
    expect(downloadsPublicBase(null, "rel")).toBeNull();
  });

  test("renderReleaseNotesMarkdown escapes and formats", () => {
    const html = renderReleaseNotesMarkdown("# Hi\n\n- **bold**\n- `code`\n\n[link](https://example.com)\n");
    expect(html).toContain("<h1>Hi</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain('href="https://example.com"');
    expect(renderReleaseNotesMarkdown("<script>x</script>")).toContain("&lt;script&gt;");
  });

  test("renderDownloadsPage lists sha256", () => {
    const html = renderDownloadsPage({
      lang: "en",
      title: "Rel",
      files: [
        {
          name: "app.zip",
          size: 12,
          sha256: "abc123",
          uploaded: "2026-01-02T00:00:00.000Z",
          contentType: "application/zip",
          url: "https://sites.example.com/rel/app.zip",
        },
      ],
      readmeHtml: "<p>notes</p>",
    });
    expect(html).toContain("app.zip");
    expect(html).toContain("abc123");
    expect(html).toContain("SHA-256");
    expect(html).toContain("<p>notes</p>");
  });

  test("sha256Bytes", async () => {
    const hash = await sha256Bytes(new TextEncoder().encode("hello").buffer);
    expect(hash).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });
});
