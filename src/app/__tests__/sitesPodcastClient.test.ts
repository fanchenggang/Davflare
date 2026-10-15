import { vi } from "vitest";

import { authFetch } from "../auth";
import {
  partitionMediaFiles,
  podcastFeedUrl,
  podcastPublishBlockReason,
  publishPodcastSite,
  PODCAST_MAX_EPISODES,
} from "../sites";
import { setLang } from "../strings";
import { asAuthFetchMock } from "../testUtils";
import { FileItem } from "../types";

vi.mock("../auth", () => ({
  authFetch: vi.fn(),
}));

const mockAuthFetch = asAuthFetchMock(authFetch);

function file(name: string, size = 10): FileItem {
  return {
    key: `shows/${name}`,
    name,
    isDir: false,
    size,
    uploaded: "2026-01-01T00:00:00.000Z",
    contentType: "application/octet-stream",
  };
}

describe("podcast client helpers", () => {
  beforeEach(() => {
    mockAuthFetch.mockReset();
    setLang("zh");
  });

  test("partitionMediaFiles / podcastFeedUrl", () => {
    const { media, ignored } = partitionMediaFiles([
      file("a.mp3"),
      file("b.txt"),
      { ...file("folder"), isDir: true, name: "folder", key: "shows/folder" },
    ]);
    expect(media.map((m) => m.name)).toEqual(["a.mp3"]);
    expect(ignored).toBe(2);
    expect(podcastFeedUrl("sites.example.com", "show")).toBe(
      "https://sites.example.com/show/feed.xml"
    );
    expect(podcastFeedUrl(null, "show")).toBeNull();
  });

  test("podcastPublishBlockReason", () => {
    expect(podcastPublishBlockReason([])).toMatch(/没有音视频|no top-level/);
    expect(podcastPublishBlockReason([file("a.mp3")])).toBeNull();
    const many = Array.from({ length: PODCAST_MAX_EPISODES + 1 }, (_, i) =>
      file(`ep${i}.mp3`)
    );
    expect(podcastPublishBlockReason(many)).toMatch(/超过上限|exceed/);
  });

  test("publishPodcastSite POSTs podcast payload", async () => {
    mockAuthFetch.mockOk({
      slug: "show",
      kind: "podcast",
      copied: 1,
      sitesHost: "sites.example.com",
      feed: "feed.xml",
    });
    const result = await publishPodcastSite("Show", ["shows/a.mp3"], {
      lang: "zh",
      title: "节目标题",
    });
    expect(result.kind).toBe("podcast");
    const [url, init] = mockAuthFetch.mock.calls[0];
    expect(url).toBe("/api/sites");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      slug: "show",
      podcast: { lang: "zh", title: "节目标题", description: undefined, files: ["shows/a.mp3"] },
    });
  });

  test("publishPodcastSite rejects bad slug / non-2xx", async () => {
    await expect(publishPodcastSite("BAD_SLUG", ["a.mp3"])).rejects.toThrow();
    mockAuthFetch.mockError(500, "boom");
    await expect(publishPodcastSite("ok", ["a.mp3"])).rejects.toThrow("boom");
  });
});
