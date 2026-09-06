/**
 * 缩略图引用计数（issue #16 移植修复）分支级直测。
 *
 * 缩略图按内容摘要寻址并被内容相同的文件共享；这里覆盖引用 marker 的完整
 * 生命周期：上传建引用、重复共享、删除最后一个引用才回收、覆盖/复制/移动
 * 的引用同步、目录删除与全删的批量回收、非法 fd-thumbnail 头防护。
 */
import { onRequest, type WebDavEnv } from "../../../functions/webdav/protocol";
import {
  InMemoryBucket,
  basicAuthHeader,
  makeContext,
} from "../testInMemoryBucket";

const AUTH = basicAuthHeader("user", "pass");
const HOST = "http://drive.example.com";

const D1 = "1".repeat(40);
const D2 = "2".repeat(40);
const thumbKey = (digest: string) => `_$flaredrive$/thumbnails/${digest}.png`;
const refKey = (digest: string, path: string) =>
  `_$flaredrive$/thumbnails/refs/${digest}/${path}`;

function makeEnv(bucket: InMemoryBucket): WebDavEnv {
  return {
    BUCKET: bucket.asBucket(),
    WEBDAV_USERNAME: "user",
    WEBDAV_PASSWORD: "pass",
  };
}

function req(
  path: string,
  method: string,
  headers?: Record<string, string>,
  body?: BodyInit
): Request {
  return new Request(`${HOST}${path}`, {
    method,
    headers: { Authorization: AUTH, ...headers },
    body,
  });
}

async function call(request: Request, env: WebDavEnv) {
  return onRequest(makeContext(request, env));
}

async function seedDir(bucket: InMemoryBucket, path: string) {
  await call(
    req(`/webdav/${path === "" ? "" : path + "/"}`, "MKCOL"),
    makeEnv(bucket)
  );
}

/** 模拟客户端上传流程：先传缩略图本体，再带 fd-thumbnail 传文件。 */
async function uploadWithThumbnail(
  bucket: InMemoryBucket,
  path: string,
  digest: string
) {
  await call(
    req(`/webdav/_$flaredrive$/thumbnails/${digest}.png`, "PUT", {}, "png-blob"),
    makeEnv(bucket)
  );
  const res = await call(
    req(`/webdav/${path}`, "PUT", { "fd-thumbnail": digest }, "file-body"),
    makeEnv(bucket)
  );
  expect([201, 204]).toContain(res.status);
}

describe("webdav thumbnail reference counting", () => {
  it("PUT with fd-thumbnail writes a marker and duplicate files share it", async () => {
    const bucket = new InMemoryBucket();
    await uploadWithThumbnail(bucket, "a.png", D1);
    await uploadWithThumbnail(bucket, "b.png", D1);

    expect(await bucket.asBucket().head(refKey(D1, "a.png"))).not.toBeNull();
    expect(await bucket.asBucket().head(refKey(D1, "b.png"))).not.toBeNull();
    expect(await bucket.asBucket().head(thumbKey(D1))).not.toBeNull();
    const head = await bucket.asBucket().head("a.png");
    expect(head?.customMetadata?.thumbnail).toBe(D1);
  });

  it("deleting one duplicate keeps the thumbnail; deleting the last one GCs it", async () => {
    const bucket = new InMemoryBucket();
    await uploadWithThumbnail(bucket, "a.png", D1);
    await uploadWithThumbnail(bucket, "b.png", D1);

    expect((await call(req("/webdav/a.png", "DELETE"), makeEnv(bucket))).status).toBe(204);
    expect(await bucket.asBucket().head(refKey(D1, "a.png"))).toBeNull();
    expect(await bucket.asBucket().head(thumbKey(D1))).not.toBeNull();

    expect((await call(req("/webdav/b.png", "DELETE"), makeEnv(bucket))).status).toBe(204);
    expect(await bucket.asBucket().head(refKey(D1, "b.png"))).toBeNull();
    expect(await bucket.asBucket().head(thumbKey(D1))).toBeNull();
  });

  it("overwriting with a different digest releases the old thumbnail", async () => {
    const bucket = new InMemoryBucket();
    await uploadWithThumbnail(bucket, "a.png", D1);
    await uploadWithThumbnail(bucket, "a.png", D2);

    expect(await bucket.asBucket().head(refKey(D1, "a.png"))).toBeNull();
    expect(await bucket.asBucket().head(refKey(D2, "a.png"))).not.toBeNull();
    expect(await bucket.asBucket().head(thumbKey(D1))).toBeNull();
    expect(await bucket.asBucket().head(thumbKey(D2))).not.toBeNull();
  });

  it("overwriting without fd-thumbnail preserves the old reference", async () => {
    const bucket = new InMemoryBucket();
    await uploadWithThumbnail(bucket, "a.png", D1);

    const res = await call(
      req("/webdav/a.png", "PUT", {}, "replaced-body"),
      makeEnv(bucket)
    );
    expect([201, 204]).toContain(res.status);
    // Davflare 语义：覆盖且未带 fd-thumbnail 时保留旧 customMetadata，
    // 引用关系保持一致（marker 不动、缩略图不回收）。
    expect((await bucket.asBucket().head("a.png"))?.customMetadata?.thumbnail).toBe(D1);
    expect(await bucket.asBucket().head(refKey(D1, "a.png"))).not.toBeNull();
    expect(await bucket.asBucket().head(thumbKey(D1))).not.toBeNull();
  });

  it("directory delete releases every child marker and GCs shared digests once", async () => {
    const bucket = new InMemoryBucket();
    await seedDir(bucket, "dir");
    await uploadWithThumbnail(bucket, "dir/x.png", D1);
    await uploadWithThumbnail(bucket, "dir/y.png", D1);
    await uploadWithThumbnail(bucket, "dir/z.png", D2);

    expect((await call(req("/webdav/dir/", "DELETE"), makeEnv(bucket))).status).toBe(204);
    expect(await bucket.asBucket().head(refKey(D1, "dir/x.png"))).toBeNull();
    expect(await bucket.asBucket().head(refKey(D1, "dir/y.png"))).toBeNull();
    expect(await bucket.asBucket().head(refKey(D2, "dir/z.png"))).toBeNull();
    expect(await bucket.asBucket().head(thumbKey(D1))).toBeNull();
    expect(await bucket.asBucket().head(thumbKey(D2))).toBeNull();
  });

  it("delete-all wipes the internal thumbnails subtree too", async () => {
    const bucket = new InMemoryBucket();
    await uploadWithThumbnail(bucket, "a.png", D1);
    await uploadWithThumbnail(bucket, "b.png", D1);

    expect((await call(req("/webdav/", "DELETE"), makeEnv(bucket))).status).toBe(204);
    const leftovers = await bucket
      .asBucket()
      .list({ prefix: "_$flaredrive$/thumbnails/" });
    expect(leftovers.objects).toHaveLength(0);
    expect(await bucket.asBucket().head("a.png")).toBeNull();
  });

  it("COPY adds a marker for the destination and survives source deletion", async () => {
    const bucket = new InMemoryBucket();
    await uploadWithThumbnail(bucket, "a.png", D1);

    const res = await call(
      req("/webdav/a.png", "COPY", { Destination: `${HOST}/webdav/c.png` }),
      makeEnv(bucket)
    );
    expect([201, 204]).toContain(res.status);
    expect(await bucket.asBucket().head(refKey(D1, "c.png"))).not.toBeNull();

    await call(req("/webdav/a.png", "DELETE"), makeEnv(bucket));
    expect(await bucket.asBucket().head(thumbKey(D1))).not.toBeNull();
    await call(req("/webdav/c.png", "DELETE"), makeEnv(bucket));
    expect(await bucket.asBucket().head(thumbKey(D1))).toBeNull();
  });

  it("COPY over a file with a different thumbnail releases the old one", async () => {
    const bucket = new InMemoryBucket();
    await uploadWithThumbnail(bucket, "a.png", D1);
    await uploadWithThumbnail(bucket, "c.png", D2);

    const res = await call(
      req("/webdav/a.png", "COPY", { Destination: `${HOST}/webdav/c.png` }),
      makeEnv(bucket)
    );
    expect(res.status).toBe(204);
    expect(await bucket.asBucket().head(refKey(D2, "c.png"))).toBeNull();
    expect(await bucket.asBucket().head(thumbKey(D2))).toBeNull();
    expect(await bucket.asBucket().head(refKey(D1, "c.png"))).not.toBeNull();
    expect((await bucket.asBucket().head("c.png"))?.customMetadata?.thumbnail).toBe(D1);
  });

  it("MOVE re-points the reference from source to destination", async () => {
    const bucket = new InMemoryBucket();
    await uploadWithThumbnail(bucket, "a.png", D1);

    const res = await call(
      req("/webdav/a.png", "MOVE", { Destination: `${HOST}/webdav/m.png` }),
      makeEnv(bucket)
    );
    expect([201, 204]).toContain(res.status);
    expect(await bucket.asBucket().head(refKey(D1, "a.png"))).toBeNull();
    expect(await bucket.asBucket().head(refKey(D1, "m.png"))).not.toBeNull();
    expect(await bucket.asBucket().head(thumbKey(D1))).not.toBeNull();
  });

  it("multipart create writes the marker before the object exists", async () => {
    const bucket = new InMemoryBucket();
    await call(
      req(`/webdav/_$flaredrive$/thumbnails/${D1}.png`, "PUT", {}, "png-blob"),
      makeEnv(bucket)
    );
    const res = await call(
      req("/webdav/big.png?uploads", "POST", { "fd-thumbnail": D1 }),
      makeEnv(bucket)
    );
    expect(res.status).toBe(200);
    expect(await bucket.asBucket().head(refKey(D1, "big.png"))).not.toBeNull();
  });

  it("malformed fd-thumbnail header is rejected and writes no marker", async () => {
    const bucket = new InMemoryBucket();
    const res = await call(
      req("/webdav/evil.png", "PUT", { "fd-thumbnail": "../../evil" }, "x"),
      makeEnv(bucket)
    );
    expect([201, 204]).toContain(res.status);
    const refs = await bucket.asBucket().list({ prefix: "_$flaredrive$/thumbnails/refs/" });
    expect(refs.objects).toHaveLength(0);
    expect(
      (await bucket.asBucket().head("evil.png"))?.customMetadata?.thumbnail
    ).toBeUndefined();
  });
});
