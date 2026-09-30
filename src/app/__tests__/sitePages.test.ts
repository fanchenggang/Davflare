import {
  ALBUM_MANIFEST_NAME,
  ALBUM_MAX_BYTES,
  ALBUM_MAX_IMAGES,
  NAV_MAX_LINKS,
  albumNameCandidate,
  allocateAlbumNames,
  isRasterFileName,
  pageLang,
  safeJson,
  checkAlbumLimits,
  isSafeManifestRel,
  parseAlbumManifest,
  parseNavPayload,
  renderAlbumPage,
  renderNavPage,
} from "../../../functions/sitePages";

describe("site pages / nav html", () => {
  test("escapes titles, group names, and hrefs; opens http(s) in a new tab", () => {
    const html = renderNavPage({
      lang: "zh",
      title: "<script>alert(1)</script>",
      groups: [
        {
          name: "<b>分组</b>",
          links: [
            {
              title: `<img src=x onerror=alert(1)>`,
              href: `https://ex.test/a?q="><script>alert(1)</script>`,
            },
            { title: "bad", href: "javascript:alert(1)" },
            { title: "data", href: "data:text/html,<script>alert(1)</script>" },
          ],
        },
      ],
    });
    expect(html).toContain('lang="zh-CN"');
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).toContain("#f4f1ec");
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<b>分组</b>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text/html");
    expect(html).toContain("&lt;b&gt;分组&lt;/b&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("https://ex.test/a?q=&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain('<span class="dead">');
  });

  test("refuses to render more than 1000 links", () => {
    const links = Array.from({ length: NAV_MAX_LINKS + 1 }, (_, i) => ({
      title: `t${i}`,
      href: `https://ex.test/${i}`,
    }));
    expect(() =>
      renderNavPage({ lang: "en", title: "x", groups: [{ name: "g", links }] })
    ).toThrow(/bookmark limit exceeded/);
  });

  test("parseNavPayload rejects over-limit and empty payloads before any html", () => {
    const links = Array.from({ length: 1001 }, (_, i) => ({
      title: "t",
      href: `https://ex.test/${i}`,
    }));
    const over = parseNavPayload({ lang: "en", groups: [{ name: "g", links }] });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error).toMatch(/bookmark limit exceeded: 1001 > 1000/);

    const empty = parseNavPayload({ groups: [{ name: "g", links: [] }] });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error).toBe("no bookmarks");

    const bad = parseNavPayload({ groups: [{ name: 1, links: [] }] });
    expect(bad.ok).toBe(false);
  });
});

describe("site pages / album html and names", () => {
  test("escapes filenames in the gallery and the embedded json", () => {
    const html = renderAlbumPage({
      lang: "en",
      title: "<album>",
      images: [
        { name: `a.jpg`, src: "a.jpg" },
        { name: `</script><img src=x onerror=alert(1)>`, src: "b.jpg" },
      ],
    });
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).toContain("#f4f1ec");
    expect(html).toContain('lang="en"');
    expect(html).not.toContain("<album>");
    expect(html).toContain("&lt;album&gt;");
    expect(html).not.toContain("</script><img");
    expect(html).toContain("\\u003c/script\\u003e");
    expect(html).toContain('id="lb-prev"');
    expect(html).toContain("Previous");
    expect(html).toContain("Next");
    expect(html).not.toContain(ALBUM_MANIFEST_NAME);
    expect(html).toContain('src="a.jpg"');
  });

  test("does not render the album manifest as an image", () => {
    const html = renderAlbumPage({
      lang: "zh",
      title: "相册",
      images: [
        { name: ALBUM_MANIFEST_NAME, src: ALBUM_MANIFEST_NAME },
        { name: "pic.png", src: "pic.png" },
      ],
    });
    expect(html).not.toContain(`src="${ALBUM_MANIFEST_NAME}"`);
    expect(html).toContain('src="pic.png"');
    expect(html).toContain("上一张");
  });

  test("allocateAlbumNames blocks traversal, duplicates, and markup", () => {
    expect(allocateAlbumNames(["../secret.jpg", "..jpg", "<script>.png", "a.jpg", "a.jpg"])).toEqual([
      "secret.jpg",
      "image.jpg",
      "_script_.png",
      "a.jpg",
      "a-2.jpg",
    ]);
    const blocked = allocateAlbumNames(["photo.jpg", "photo.jpg"], new Set(["photo.jpg"]));
    expect(blocked).toEqual(["photo-2.jpg", "photo-3.jpg"]);
    expect(allocateAlbumNames(["notes.txt"])).toBeNull();
  });

  test("limits name the count and the byte ceiling", () => {
    expect(checkAlbumLimits(0, 0)).toEqual({ ok: false, error: "no album images" });
    expect(checkAlbumLimits(ALBUM_MAX_IMAGES, ALBUM_MAX_BYTES)).toEqual({ ok: true });
    expect(checkAlbumLimits(ALBUM_MAX_IMAGES + 1, 10).ok).toBe(false);
    const over = checkAlbumLimits(1, ALBUM_MAX_BYTES + 1);
    expect(over.ok).toBe(false);
    if (!over.ok) {
      expect(over.error).toBe(
        `album size limit exceeded: ${ALBUM_MAX_BYTES + 1} > ${ALBUM_MAX_BYTES}`
      );
    }
    expect(checkAlbumLimits(ALBUM_MAX_IMAGES + 1, 1).ok).toBe(false);
    const countOver = checkAlbumLimits(201, 1);
    expect(countOver.ok).toBe(false);
    if (!countOver.ok) expect(countOver.error).toMatch(/album image limit exceeded: 201 > 200/);
  });

  test("manifest parser keeps only safe relative paths", () => {
    const rels = parseAlbumManifest(
      JSON.stringify({
        version: 1,
        files: ["old.jpg", "index.html", "../secret", "/etc/passwd", "a/../../b.jpg", "sub/ok.webp", 1],
      })
    );
    expect(rels).toEqual(["old.jpg", "index.html", "sub/ok.webp"]);
    expect(isSafeManifestRel("..")).toBe(false);
    expect(isSafeManifestRel("ok.gif")).toBe(true);
  });

  test("album renderer refuses more than 200 images", () => {
    const images = Array.from({ length: ALBUM_MAX_IMAGES + 1 }, (_, i) => ({
      name: `${i}.jpg`,
      src: `${i}.jpg`,
    }));
    expect(() => renderAlbumPage({ lang: "en", title: "a", images })).toThrow(
      /album image limit exceeded/
    );
  });
});

describe("site pages / helpers edge cases", () => {
  test("albumNameCandidate rejects reserved names and traversal", () => {
    expect(albumNameCandidate("index.html", 1)).toBeNull();
    expect(albumNameCandidate(".davflare-album.json", 1)).toBeNull();
    expect(albumNameCandidate("notes.txt", 1)).toBeNull();
    expect(albumNameCandidate("ok.jpg", 0)).toBeNull();
    expect(albumNameCandidate("ok.jpg", 1)).toBe("ok.jpg");
    expect(albumNameCandidate("ok.jpg", 2)).toBe("ok-2.jpg");
    expect(isRasterFileName("x.avif")).toBe(true);
    expect(isRasterFileName("x.txt")).toBe(false);
    expect(pageLang("zh")).toBe("zh");
    expect(pageLang("en")).toBe("en");
    expect(pageLang("nope")).toBe("en");
    expect(safeJson({ a: "</script>" })).toContain("\\u003c");
  });

  test("parseNavPayload clips and skips empty hrefs", () => {
    const ok = parseNavPayload({
      lang: "zh",
      title: "x".repeat(300),
      groups: [
        {
          name: " ",
          links: [
            { title: " ", href: "   " },
            { title: "ok", href: "https://ex.test/a" },
          ],
        },
      ],
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.count).toBe(1);
      expect(ok.title.length).toBe(200);
      expect(ok.groups[0].name.length).toBeGreaterThan(0);
    }
  });

  test("renderAlbumPage empty gallery still has lightbox chrome", () => {
    const html = renderAlbumPage({ lang: "en", title: "empty", images: [] });
    expect(html).toContain("No images");
    expect(html).toContain("id=\"lightbox\"");
  });
});
