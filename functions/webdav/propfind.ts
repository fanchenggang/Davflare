import {
  FsEntry,
  listAll,
  RequestHandlerParams,
  ROOT_OBJECT,
  toFsEntry,
  WEBDAV_ENDPOINT,
} from "./utils";

type DavProperties = {
  creationdate: string | undefined;
  displayname: string | undefined;
  getcontentlanguage: string | undefined;
  getcontentlength: string | undefined;
  getcontenttype: string | undefined;
  getetag: string | undefined;
  getlastmodified: string | undefined;
  resourcetype: string;
  "fd:thumbnail": string | undefined;
};

function fromR2Object(object: FsEntry): DavProperties {
  return {
    creationdate: object.uploaded.toUTCString(),
    displayname: object.httpMetadata?.contentDisposition,
    getcontentlanguage: object.httpMetadata?.contentLanguage,
    getcontentlength: object.size.toString(),
    getcontenttype: object.isDir
      ? "application/x-directory"
      : object.httpMetadata?.contentType,
    getetag: object.etag,
    getlastmodified: object.uploaded.toUTCString(),
    resourcetype: object.isDir ? "<collection />" : "",
    "fd:thumbnail": object.customMetadata?.thumbnail,
  };
}

async function findChildren({
  bucket,
  path,
  depth,
}: {
  bucket: R2Bucket;
  path: string;
  depth: string;
}) {
  if (!["1", "infinity"].includes(depth)) return [];

  const objects: FsEntry[] = [];

  const prefix = path === "" ? path : `${path}/`;
  for await (const object of listAll(bucket, prefix, depth === "infinity")) {
    objects.push(object);
  }

  return objects;
}

export async function handleRequestPropfind({
  bucket,
  path,
  request,
}: RequestHandlerParams) {
  const responseTemplate = `<?xml version="1.0" encoding="utf-8" ?>
<multistatus xmlns="DAV:" xmlns:fd="flaredrive">
{{items}}
</multistatus>`;

  const head = path === "" ? null : await bucket.head(path);
  if (path !== "") {
    if (head === null) return new Response("Not found", { status: 404 });
  }
  let isRootDir = path === "";
  if (!isRootDir) {
    // A path is also a folder when it has children, even if its placeholder
    // object has no directory content-type (e.g. folders created by other tools).
    isRootDir = head?.httpMetadata?.contentType === "application/x-directory";
    if (!isRootDir) {
      const list = await bucket.list({ prefix: `${path}/`, limit: 1 });
      isRootDir = list.objects.length > 0 || list.delimitedPrefixes.length > 0;
    }
  }
  const depth = request.headers.get("Depth") ?? "infinity";

  const children = !isRootDir
    ? []
    : await findChildren({
        bucket,
        path,
        depth,
      });

  const rootEntry: FsEntry =
    path === "" ? ROOT_OBJECT : toFsEntry(head as R2Object, isRootDir);

  const items = [rootEntry, ...children].map((child) => {
    const properties = fromR2Object(child);
    return `
  <response>
    <href>${encodeURI(`${WEBDAV_ENDPOINT}${child.key}`)}</href>
    <propstat>
      <prop>
        ${Object.entries(properties)
          .filter(([_, value]) => value !== undefined)
          .map(([key, value]) => `<${key}>${value}</${key}>`)
          .join("\n")}
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>`;
  });

  return new Response(responseTemplate.replace("{{items}}", items.join("")), {
    status: 207,
    headers: { "Content-Type": "application/xml" },
  });
}
