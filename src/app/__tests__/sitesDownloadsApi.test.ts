import { onRequestPost } from "../../../functions/api/sites";
import { SITE_MANIFEST_NAME } from "../../../functions/siteManifest";
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

describe("sites API downloads publish", () => {
  test("copies assets, hashes SHA-256, renders README", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([
      { key: "rel/app.zip", body: "PKZIP", contentType: "application/octet-stream" },
      { key: "rel/Setup.exe", body: "MZexe", contentType: "application/octet-stream" },
      { key: "rel/README.md", body: "# v1.0\n\n- fix crash\n", contentType: "text/markdown" },
      { key: "rel/.hidden", body: "x", contentType: "text/plain" },
    ]);

    const response = await onRequestPost(
      makeContext(
        post({
          slug: "my-app",
          downloads: {
            lang: "zh",
            title: "我的应用",
            files: ["rel/app.zip", "rel/Setup.exe", "rel/README.md", "rel/.hidden"],
            readmeKey: "rel/README.md",
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
      sitesHost: string | null;
    };
    expect(body.slug).toBe("my-app");
    expect(body.kind).toBe("downloads");
    expect(body.copied).toBe(2);
    expect(body.sitesHost).toBe("sites.example.com");

    const index = await bucket.asBucket().get("sites/my-app/index.html");
    expect(index).not.toBeNull();
    const html = await index!.text();
    expect(html).toContain("app.zip");
    expect(html).toContain("Setup.exe");
    expect(html).toContain("SHA-256");
    expect(html).toContain("v1.0");
    expect(html).toMatch(/[a-f0-9]{64}/);

    const zip = await bucket.asBucket().head("sites/my-app/app.zip");
    expect(zip?.httpMetadata?.contentType).toBe("application/zip");

    const manifest = await bucket.asBucket().get(`sites/my-app/${SITE_MANIFEST_NAME}`);
    expect(manifest).not.toBeNull();
    expect(JSON.parse(await manifest!.text()).kind).toBe("downloads");
  });

  test("rejects empty selection", async () => {
    const bucket = new InMemoryBucket();
    bucket.seed([{ key: "rel/README.md", body: "# only" }]);
    const response = await onRequestPost(
      makeContext(
        post({
          slug: "empty",
          downloads: { files: ["rel/README.md"], readmeKey: "rel/README.md" },
        }),
        makeEnv(bucket)
      )
    );
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("no downloads assets");
  });
});
