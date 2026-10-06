import { vi } from "vitest";
import {
  DOCS_MAX_BYTES,
  DOCS_MAX_FILES,
  DocsPrepared,
  SitePublishInterruptedError,
  docsPublishBlockReason,
  docsSourceBlockReason,
  partitionMarkdownFiles,
  prepareDocsPublish,
  publishDocsSite,
} from "../sites";
import { FileItem } from "../types";
import { setLang, translate } from "../strings";
import { authFetch } from "../auth";
import { asAuthFetchMock } from "../testUtils";
import { humanReadableSize } from "../utils";

vi.mock("../auth", () => ({ authFetch: vi.fn() }));
const mockAuthFetch = asAuthFetchMock(authFetch);

function file(key: string, size = 10, isDir = false): FileItem {
  return { key, name: key.split("/").pop()!, isDir, size, uploaded: "", contentType: "" };
}

function bodyOf(call: unknown[]) {
  return JSON.parse((call[1] as RequestInit).body as string) as { slug: string; docs: Record<string, unknown> };
}

beforeEach(() => {
  mockAuthFetch.mockReset();
  setLang("zh");
});

const texts: Record<string, string> = {
  "v/b.md": "# Beta\n\n![](img/pic.png) [a](a.md) [[a]]",
  "v/a.md": "# Alpha\n\n<script>alert(1)</script> ![[missing.png]]",
};

const io = {
  readText: vi.fn(async (key: string) => texts[key]),
  listDir: vi.fn(async (dir: string) =>
    dir === "v" ? [file("v/img", 0, true), file("v/a.md"), file("v/b.md")] : dir === "v/img" ? [file("v/img/pic.png", 2048)] : []
  ),
};

describe("docs client helpers", () => {
  test("partitionMarkdownFiles", () => {
    const result = partitionMarkdownFiles([file("a.md"), file("b.MARKDOWN"), file("c.txt"), file("d", 0, true)]);
    expect(result.docs.map((d) => d.name)).toEqual(["a.md", "b.MARKDOWN"]);
    expect(result.ignored).toBe(2);
  });

  test("block reasons: empty / too many / too large with specifics", () => {
    expect(docsSourceBlockReason([])).toBe(translate("publishDocsEmpty"));
    const many = Array.from({ length: DOCS_MAX_FILES + 1 }, (_, i) => file(`${i}.md`, 1));
    expect(docsSourceBlockReason(many)).toBe(
      translate("publishDocsTooMany", { count: 201, docs: 201, images: 0, max: DOCS_MAX_FILES })
    );
    expect(
      docsPublishBlockReason({ docs: new Array(150).fill(null), images: new Array(60).fill(file("x.png")), bytes: 1 })
    ).toBe(translate("publishDocsTooMany", { count: 210, docs: 150, images: 60, max: DOCS_MAX_FILES }));
    expect(docsPublishBlockReason({ docs: [null as never], images: [], bytes: DOCS_MAX_BYTES + 1 })).toBe(
      translate("publishDocsTooLarge", {
        size: humanReadableSize(DOCS_MAX_BYTES + 1),
        max: humanReadableSize(DOCS_MAX_BYTES),
      })
    );
  });

  test("prepareDocsPublish reads, sorts, finds images and counts misses", async () => {
    const prepared = await prepareDocsPublish([file("v/b.md", 30), file("v/a.md", 20)], io);
    expect(prepared.docs.map((d) => d.name)).toEqual(["a.md", "b.md"]);
    expect(prepared.docs.map((d) => d.title)).toEqual(["Alpha", "Beta"]);
    expect(prepared.images.map((i) => i.key)).toEqual(["v/img/pic.png"]);
    expect(prepared.missing).toBe(1);
    expect(prepared.bytes).toBe(30 + 20 + 2048);
  });
});

describe("publishDocsSite", () => {
  async function prepared(): Promise<DocsPrepared> {
    return prepareDocsPublish([file("v/b.md"), file("v/a.md")], io);
  }

  test("plan → copy images → put pages → put index → finish, with rendered html", async () => {
    const ready = await prepared();
    mockAuthFetch
      .mockOkOnce({ planId: "p", pages: ["a.html", "b.html"], images: ["assets/pic.png"] })
      .mockOkOnce({})
      .mockOkOnce({})
      .mockOkOnce({})
      .mockOkOnce({ slug: "notes", kind: "docs", copied: 3, bytes: 1, sitesHost: "s.example.com" });
    const progress: unknown[] = [];
    const result = await publishDocsSite("Notes", ready, { lang: "en", title: "V", onProgress: (p) => progress.push(p) });
    expect(result.kind).toBe("docs");
    const bodies = mockAuthFetch.mock.calls.map(bodyOf);
    expect(bodies[0]).toEqual({
      slug: "notes",
      docs: { phase: "plan", pages: ["a.html", "b.html"], images: ["v/img/pic.png"], lang: "en", title: "V" },
    });
    expect(bodies[1].docs).toEqual({ planId: "p", phase: "copy", files: ["assets/pic.png"] });
    const pages = bodies[2].docs.pages as Array<{ name: string; html: string }>;
    expect(pages.map((p) => p.name)).toEqual(["a.html", "b.html"]);
    expect(pages[0].html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(pages[0].html).not.toMatch(/<script/i);
    expect(pages[0].html).toContain("![[missing.png]]");
    expect(pages[1].html).toContain('<img src="assets/pic.png" alt="">');
    expect(pages[1].html).toContain('<a href="a.html">a</a>');
    expect((bodies[3].docs.pages as Array<{ name: string }>)[0].name).toBe("index.html");
    expect(bodies[4].docs).toEqual({ planId: "p", phase: "finish" });
    expect(progress).toEqual([
      { phase: "plan" },
      { phase: "upload", done: 0, total: 4 },
      { phase: "upload", done: 1, total: 4 },
      { phase: "upload", done: 3, total: 4 },
      { phase: "upload", done: 4, total: 4 },
      { phase: "finish", done: 4, total: 4 },
    ]);
  });

  test("plan failure is a plain error; later failure is interrupted (docs wording)", async () => {
    const ready = await prepared();
    mockAuthFetch.mockErrorOnce(400, "file limit exceeded: 201 > 200");
    const first = await publishDocsSite("s", ready).catch((e) => e);
    expect(first).not.toBeInstanceOf(SitePublishInterruptedError);
    expect(first.message).toBe("file limit exceeded: 201 > 200");

    mockAuthFetch
      .mockOkOnce({ planId: "p", pages: ["a.html", "b.html"], images: ["assets/pic.png"] })
      .mockErrorOnce(409, "source file missing: v/img/pic.png");
    const second = await publishDocsSite("s", ready).catch((e) => e);
    expect(second).toBeInstanceOf(SitePublishInterruptedError);
    expect(second.message).toBe(
      translate("publishDocsInterrupted", { reason: "source file missing: v/img/pic.png" })
    );
  });

  test("bad slug / mismatched plan never upload", async () => {
    const ready = await prepared();
    await expect(publishDocsSite("Bad!", ready)).rejects.toThrow(translate("publishSiteBadSlug"));
    mockAuthFetch.mockOkOnce({ planId: "p", pages: ["a.html"], images: [] });
    await expect(publishDocsSite("s", ready)).rejects.toThrow(translate("publishDocsFailed"));
    expect(mockAuthFetch).toHaveBeenCalledTimes(1);
  });

  test("large pages are split into several put requests", async () => {
    const big = "x".repeat(3 * 1024 * 1024);
    const bigIo = {
      readText: async (key: string) => (key.endsWith("1.md") ? big : `${big}y`),
      listDir: async () => [],
    };
    const ready = await prepareDocsPublish([file("1.md"), file("2.md")], bigIo);
    mockAuthFetch
      .mockOkOnce({ planId: "p", pages: ["1.html", "2.html"], images: [] })
      .mockOkOnce({})
      .mockOkOnce({})
      .mockOkOnce({})
      .mockOkOnce({ slug: "s", kind: "docs", copied: 2, bytes: 1, sitesHost: null });
    await publishDocsSite("s", ready);
    const puts = mockAuthFetch.mock.calls.map(bodyOf).filter((b) => b.docs.phase === "put");
    expect(puts.map((b) => (b.docs.pages as unknown[]).length)).toEqual([1, 1, 1]);
  });
});
