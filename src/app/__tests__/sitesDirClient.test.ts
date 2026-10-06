import { vi } from "vitest";
import {
  DIR_MAX_BYTES,
  DIR_MAX_FILES,
  DIR_PUBLISH_BATCH,
  DirPublishProgress,
  SitePublishInterruptedError,
  dirPublishBlockReason,
  partitionDirListing,
  publishDirSite,
} from "../sites";
import { FileItem } from "../types";
import { setLang, translate } from "../strings";
import { authFetch } from "../auth";
import { asAuthFetchMock } from "../testUtils";
import { humanReadableSize } from "../utils";

vi.mock("../auth", () => ({
  authFetch: vi.fn(),
}));

const mockAuthFetch = asAuthFetchMock(authFetch);

function file(name: string, size = 10): FileItem {
  return { key: `f/${name}`, name, isDir: false, size, uploaded: "", contentType: "text/plain" };
}

function bodyOf(call: unknown[]): { slug: string; dir: Record<string, unknown> } {
  return JSON.parse((call[1] as RequestInit).body as string);
}

beforeEach(() => {
  mockAuthFetch.mockReset();
  setLang("zh");
});

describe("partitionDirListing / dirPublishBlockReason", () => {
  test("splits files and subfolders", () => {
    const result = partitionDirListing([
      file("a.txt"),
      { ...file("sub"), isDir: true },
      file("b.txt"),
    ]);
    expect(result.files.map((f) => f.name)).toEqual(["a.txt", "b.txt"]);
    expect(result.subdirs).toBe(1);
  });

  test("reports empty / too many / too large with specific numbers", () => {
    expect(dirPublishBlockReason([])).toBe(translate("publishDirEmpty"));
    const many = Array.from({ length: DIR_MAX_FILES + 1 }, (_, i) => file(`${i}.txt`, 1));
    expect(dirPublishBlockReason(many)).toBe(
      translate("publishDirTooMany", { count: DIR_MAX_FILES + 1, max: DIR_MAX_FILES })
    );
    const big = [file("a.bin", DIR_MAX_BYTES), file("b.bin", 1)];
    expect(dirPublishBlockReason(big)).toBe(
      translate("publishDirTooLarge", {
        size: humanReadableSize(DIR_MAX_BYTES + 1),
        max: humanReadableSize(DIR_MAX_BYTES),
      })
    );
    expect(dirPublishBlockReason([file("ok.txt", 5)])).toBeNull();
  });
});

describe("publishDirSite", () => {
  test("plans, then copies in serial batches of 50, then finishes", async () => {
    const names = Array.from({ length: 120 }, (_, i) => `f${i}.txt`);
    mockAuthFetch
      .mockOkOnce({ planId: "p1", files: names, total: 120 })
      .mockOkOnce({ copied: 50 })
      .mockOkOnce({ copied: 50 })
      .mockOkOnce({ copied: 20 })
      .mockOkOnce({ slug: "share", kind: "dir", copied: 120, bytes: 1, sitesHost: "s.example.com" });
    const progress: DirPublishProgress[] = [];
    const result = await publishDirSite(" Share ", "docs/share", {
      lang: "en",
      title: "share",
      onProgress: (p) => progress.push(p),
    });
    expect(result.copied).toBe(120);
    expect(DIR_PUBLISH_BATCH).toBe(50);
    const bodies = mockAuthFetch.mock.calls.map(bodyOf);
    expect(bodies[0]).toEqual({
      slug: "share",
      dir: { phase: "plan", source: "docs/share", lang: "en", title: "share" },
    });
    expect(bodies.slice(1, 4).map((b) => (b.dir.files as string[]).length)).toEqual([50, 50, 20]);
    expect(bodies[1].dir.planId).toBe("p1");
    expect((bodies[3].dir.files as string[])[19]).toBe("f119.txt");
    expect(bodies[4]).toEqual({ slug: "share", dir: { phase: "finish", planId: "p1" } });
    expect(progress).toEqual([
      { phase: "plan" },
      { phase: "copy", done: 0, total: 120 },
      { phase: "copy", done: 50, total: 120 },
      { phase: "copy", done: 100, total: 120 },
      { phase: "copy", done: 120, total: 120 },
      { phase: "finish", done: 120, total: 120 },
    ]);
  });

  test("bad slug never hits the network", async () => {
    await expect(publishDirSite("Bad Slug!", "f")).rejects.toThrow(translate("publishSiteBadSlug"));
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });

  test("plan failure is a plain error (nothing written yet)", async () => {
    mockAuthFetch.mockErrorOnce(400, "file limit exceeded: >500");
    const error = await publishDirSite("s", "f").catch((e) => e);
    expect(error).not.toBeInstanceOf(SitePublishInterruptedError);
    expect(error.message).toBe("file limit exceeded: >500");
  });

  test("mid-way failure says the site may be incomplete and stops sending", async () => {
    mockAuthFetch
      .mockOkOnce({ planId: "p", files: ["a", "b", "c"], total: 3 })
      .mockOkOnce({ copied: 1 })
      .mockErrorOnce(409, "source file missing: b");
    const error = await publishDirSite("s", "f", { batchSize: 1 }).catch((e) => e);
    expect(error).toBeInstanceOf(SitePublishInterruptedError);
    expect(error.reason).toBe("source file missing: b");
    expect(error.message).toBe(translate("publishDirInterrupted", { reason: "source file missing: b" }));
    expect(error.message).toMatch(/不完整/);
    expect(mockAuthFetch).toHaveBeenCalledTimes(3);
  });

  test("network error during finish is also reported as interrupted", async () => {
    mockAuthFetch.mockOkOnce({ planId: "p", files: ["a"], total: 1 }).mockOkOnce({ copied: 1 });
    mockAuthFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const error = await publishDirSite("s", "f").catch((e) => e);
    expect(error).toBeInstanceOf(SitePublishInterruptedError);
    expect(error.reason).toBe("Failed to fetch");
  });

  test("batch size is clamped to the server cap", async () => {
    const names = Array.from({ length: 61 }, (_, i) => `n${i}`);
    mockAuthFetch
      .mockOkOnce({ planId: "p", files: names, total: 61 })
      .mockOkOnce({})
      .mockOkOnce({})
      .mockOkOnce({ slug: "s", kind: "dir", copied: 61, bytes: 0, sitesHost: null });
    await publishDirSite("s", "f", { batchSize: 1000 });
    const sizes = mockAuthFetch.mock.calls.slice(1, 3).map((c) => (bodyOf(c).dir.files as string[]).length);
    expect(sizes).toEqual([60, 1]);
  });
});
