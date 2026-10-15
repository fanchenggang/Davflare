import {
  checkPodcastLimits,
  isMediaFileName,
  mediaExtension,
  mediaMimeType,
  podcastNameCandidate,
  podcastPublicBase,
  renderPodcastFeed,
  renderPodcastPage,
  PODCAST_MAX_EPISODES,
} from "../../../functions/sitePages";
import { siteFileForcesDownload } from "../../../functions/siteManifest";

describe("podcast helpers", () => {
  test("mediaExtension / mime / isMediaFileName", () => {
    expect(mediaExtension("ep.mp3")).toBe("mp3");
    expect(mediaExtension("clip.MP4")).toBe("mp4");
    expect(mediaExtension("notes.txt")).toBeNull();
    expect(isMediaFileName("a.m4a")).toBe(true);
    expect(mediaMimeType("a.mp3")).toBe("audio/mpeg");
  });

  test("podcastNameCandidate reserves feed/index", () => {
    expect(podcastNameCandidate("show.mp3", 1)).toBe("show.mp3");
    expect(podcastNameCandidate("show.mp3", 2)).toBe("show-2.mp3");
    expect(podcastNameCandidate("readme.txt", 1)).toBeNull();
  });

  test("checkPodcastLimits", () => {
    expect(checkPodcastLimits(0, 0).ok).toBe(false);
    expect(checkPodcastLimits(1, 10).ok).toBe(true);
    expect(checkPodcastLimits(PODCAST_MAX_EPISODES + 1, 1).ok).toBe(false);
  });

  test("podcastPublicBase", () => {
    expect(podcastPublicBase("sites.example.com", "show")).toBe("https://sites.example.com/show");
    expect(podcastPublicBase("https://sites.example.com/", "show")).toBe(
      "https://sites.example.com/show"
    );
    expect(podcastPublicBase(null, "show")).toBeNull();
  });

  test("renderPodcastFeed has enclosure + channel", () => {
    const xml = renderPodcastFeed({
      lang: "zh",
      title: "Demo",
      slug: "demo",
      sitesHost: "sites.example.com",
      episodes: [
        {
          name: "ep1.mp3",
          size: 12,
          uploaded: "2026-01-02T00:00:00.000Z",
          contentType: "audio/mpeg",
          url: "https://sites.example.com/demo/ep1.mp3",
        },
      ],
    });
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain("<enclosure ");
    expect(xml).toContain('url="https://sites.example.com/demo/ep1.mp3"');
    expect(xml).toContain('type="audio/mpeg"');
    expect(xml).toContain("<title>Demo</title>");
  });

  test("renderPodcastPage lists player and feed link", () => {
    const html = renderPodcastPage({
      lang: "en",
      title: "Demo",
      feedHref: "https://sites.example.com/demo/feed.xml",
      episodes: [
        {
          name: "ep1.mp3",
          size: 12,
          uploaded: "2026-01-02T00:00:00.000Z",
          contentType: "audio/mpeg",
          url: "https://sites.example.com/demo/ep1.mp3",
        },
      ],
    });
    expect(html).toContain("<audio ");
    expect(html).toContain("feed.xml");
    expect(html).toContain("ep1.mp3");
  });

  test("siteFileForcesDownload allows podcast feed.xml", () => {
    expect(siteFileForcesDownload("podcast", "feed.xml")).toBe(false);
    expect(siteFileForcesDownload("podcast", "index.html")).toBe(false);
    expect(siteFileForcesDownload("dir", "feed.xml")).toBe(true);
  });
});
