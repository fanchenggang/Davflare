import { onRequestPost } from "../../../functions/api/sites";
import { SITE_MANIFEST_NAME } from "../../../functions/siteManifest";
import { PODCAST_FEED_NAME } from "../../../functions/sitePages";
import {
  InMemoryBucket,
  basicAuthHeader,
  makeContext,
} from "../testInMemoryBucket";

const AUTH = basicAuthHeader("user", "pass");

function makeEnv(bucket: InMemoryBucket, extra: Record<string, unknown> = {}) {
  return {
    BUCKET: bucket.asBucket(),
    WEBDAV_USERNAME: "user",
    WEBDAV_PASSWORD: "pass",
    SITES_HOST: "sites.example.com",
    ...extra,
  };
}

function post(body: unknown): Request {
  return new Request("http://drive.example.com/api/sites", {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("sites API podcast publish", () => {
  test("copies media, writes feed.xml + index, returns sitesHost", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      {
        key: "shows/ep1.mp3",
        body: "ID3audio",
        contentType: "audio/mpeg",
      },
      {
        key: "shows/ep2.mp4",
        body: "ftypmp4",
        contentType: "video/mp4",
      },
      { key: "shows/readme.txt", body: "ignore me", contentType: "text/plain" },
    ]);

    const response = await onRequestPost(
      makeContext(
        post({
          slug: "my-show",
          podcast: {
            lang: "zh",
            title: "我的节目",
            files: ["shows/ep1.mp3", "shows/ep2.mp4", "shows/readme.txt"],
          },
        }),
        makeEnv(bucket)
      )
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      slug: string;
      kind: string;
      copied: number;
      feed: string;
      sitesHost: string | null;
    };
    expect(body.slug).toBe("my-show");
    expect(body.kind).toBe("podcast");
    expect(body.copied).toBe(2);
    expect(body.feed).toBe(PODCAST_FEED_NAME);
    expect(body.sitesHost).toBe("sites.example.com");

    const feed = await bucket.asBucket().get(`sites/my-show/${PODCAST_FEED_NAME}`);
    expect(feed).not.toBeNull();
    const feedText = await feed!.text();
    expect(feedText).toContain("<rss version=\"2.0\">");
    expect(feedText).toContain("https://sites.example.com/my-show/ep1.mp3");
    expect(feed!.httpMetadata?.contentType).toContain("rss+xml");

    const index = await bucket.asBucket().get("sites/my-show/index.html");
    expect(index).not.toBeNull();
    expect(await index!.text()).toContain("<audio ");

    const manifest = await bucket.asBucket().get(`sites/my-show/${SITE_MANIFEST_NAME}`);
    expect(manifest).not.toBeNull();
    expect(JSON.parse(await manifest!.text()).kind).toBe("podcast");
  });

  test("rejects empty / non-media selection", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "shows/notes.txt", body: "x" }]);
    const response = await onRequestPost(
      makeContext(
        post({ slug: "empty", podcast: { files: ["shows/notes.txt"] } }),
        makeEnv(bucket)
      )
    );
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("no podcast media");
  });
});
