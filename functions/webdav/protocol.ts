// WebDAV 方法实现与请求分发；工具层在 davUtil/davXml/davLock，类型在 davTypes。
import { utf8ToBase64 } from "../api/_apikey";
import {
  DAV_ENDPOINT,
  DAV_ENDPOINT_WITH_SLASH,
  INTERNAL_PREFIX,
  THUMBNAIL_PREFIX,
  addThumbnailRef,
  calcContentRange,
  createdResponse,
  deleteAll,
  escapeXml,
  getConditionalHeaders,
  getParentPath,
  getResourceHref,
  hasCollectionResource,
  isCollectionObject,
  isCollectionPath,
  isSameOrDescendantPath,
  isValidThumbnailDigest,
  listAll,
  parseBucketPath,
  parseDestinationPath,
  releaseThumbnailRef,
  thumbnailObjectKey,
  thumbnailRefKey,
  timingSafeEqual,
} from "./davUtil";
import {
  DAV_NAMESPACE,
  FLAREDRIVE_NAMESPACE,
  fromR2Object,
  getDeadProperty,
  getDeadProperties,
  getDeadPropertyKey,
  getLivePropertyValue,
  parsePropfindRequest,
  parseProppatchRequest,
  renderDavProperty,
  renderEmptyPropertyElement,
  renderPropstat,
  renderPropertyElement,
} from "./davXml";
import {
  VALID_LOCK_DEPTHS,
  assertLockPermission,
  assertRecursiveDeletePermission,
  determineLockDepth,
  extractLockOwner,
  findMatchingLock,
  getLockDetails,
  getLockDiscovery,
  getPreservedCustomMetadata,
  getRequestLockTokens,
  isProtectedProperty,
  normalizeLockToken,
  parseTimeout,
  stripLockMetadata,
  withLockMetadata,
} from "./davLock";
import type {
  DavObject,
  DeadProperty,
  LockDetails,
  PagesContext,
  PropfindRequest,
  WebDavEnv,
} from "./davTypes";

export type { WebDavEnv };

const DAV_CLASS = "1, 2";
const SUPPORT_METHODS = [
  "OPTIONS",
  "PROPFIND",
  "PROPPATCH",
  "MKCOL",
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "DELETE",
  "COPY",
  "MOVE",
  "LOCK",
  "UNLOCK",
];

const INTERNAL_DELETE_FORWARD_HEADERS = ["If", "Lock-Token"] as const;

async function handleGet({
  bucket,
  path,
  request,
}: {
  bucket: R2Bucket;
  path: string;
  request: Request;
}): Promise<Response> {
  const collection = await isCollectionPath(bucket, path);

  if (new URL(request.url).pathname.endsWith("/")) {
    if (path !== "" && !collection) {
      return new Response("Not Found", { status: 404 });
    }

    let page = "";
    let prefix = path;
    if (path !== "") {
      page += `<a href="${escapeXml(getResourceHref(getParentPath(path), true))}">..</a><br>`;
      prefix = `${path}/`;
    }

    for await (const object of listAll(bucket, path === "" ? undefined : prefix)) {
      if (object.key === path) {
        continue;
      }
      const href = getResourceHref(object.key, object.isCollection === true);
      const name =
        object.httpMetadata?.contentDisposition ??
        object.key.slice(prefix.length);
      page += `<a href="${escapeXml(href)}">${escapeXml(name)}</a><br>`;
    }

    const pageSource = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>FlareDrive</title><style>*{box-sizing:border-box;}body{padding:10px;font-family:'Segoe UI','Circular','Roboto','Lato','Helvetica Neue','Arial Rounded MT Bold','sans-serif';}a{display:inline-block;width:100%;color:#000;text-decoration:none;padding:5px 10px;cursor:pointer;border-radius:5px;}a:hover{background-color:#60C590;color:white;}a[href="../"]{background-color:#cbd5e1;}</style></head><body><h1>FlareDrive</h1><div>${page}</div></body></html>`;
    return new Response(pageSource, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (collection) {
    const redirectUrl = new URL(request.url);
    redirectUrl.pathname = `${redirectUrl.pathname}/`;
    return Response.redirect(redirectUrl.toString(), 301);
  }

  // If-None-Match 是浏览器缓存再验证（同一文件第二次 GET 必带）：命中时按 RFC 7232
  // 返回 304，而不是交给 R2 onlyIf 变成 412（会导致网页预览重开失败）。
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch !== null) {
    const candidates = ifNoneMatch
      .split(",")
      .map((value) => value.trim().replace(/^W\//, ""))
      .filter(Boolean);
    const current = await bucket.head(path);
    if (current !== null) {
      const strongEtag = current.httpEtag ?? current.etag;
      const quoted = strongEtag.startsWith('"') ? strongEtag : `"${strongEtag}"`;
      if (
        candidates.includes("*") ||
        candidates.includes(quoted) ||
        candidates.includes(strongEtag)
      ) {
        const notModified = new Headers();
        notModified.set("ETag", quoted);
        notModified.set("Last-Modified", current.uploaded.toUTCString());
        return new Response(null, { status: 304, headers: notModified });
      }
    }
  }

  // R2 对非法/不可满足的 Range 头会抛 InvalidRange（HTTP 416 同类错误）。
  // 这里回退为全量读取，避免未捕获异常变成 500（与 /api/download 的处理一致）。
  let object: R2ObjectBody | R2Object | null;
  try {
    object = await bucket.get(path, {
      onlyIf: getConditionalHeaders(request.headers, true),
      range: request.headers,
    });
  } catch {
    object = await bucket.get(path, {
      onlyIf: getConditionalHeaders(request.headers, true),
    });
  }
  if (object === null) {
    return new Response("Not Found", { status: 404 });
  }
  if (!("body" in object)) {
    return new Response("Preconditions failed", { status: 412 });
  }

  const { rangeOffset, rangeEnd } = calcContentRange(object);
  const contentLength = rangeEnd - rangeOffset + 1;
  const rangeRequested = request.headers.has("Range") && object.range !== undefined;
  const headers = new Headers();
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Type", object.httpMetadata?.contentType ?? "application/octet-stream");
  headers.set("Content-Length", contentLength.toString());
  headers.set("ETag", object.httpEtag);
  headers.set("Last-Modified", object.uploaded.toUTCString());
  if (rangeRequested) {
    headers.set("Content-Range", `bytes ${rangeOffset}-${rangeEnd}/${object.size}`);
  }
  if (object.httpMetadata?.contentDisposition) {
    headers.set("Content-Disposition", object.httpMetadata.contentDisposition);
  }
  if (object.httpMetadata?.contentEncoding) {
    headers.set("Content-Encoding", object.httpMetadata.contentEncoding);
  }
  if (object.httpMetadata?.contentLanguage) {
    headers.set("Content-Language", object.httpMetadata.contentLanguage);
  }
  if (object.httpMetadata?.cacheControl) {
    headers.set("Cache-Control", object.httpMetadata.cacheControl);
  }
  if (path.startsWith(THUMBNAIL_PREFIX)) {
    headers.set("Cache-Control", "max-age=31536000");
  }

  return new Response(object.body, {
    status: rangeRequested ? 206 : 200,
    headers,
  });
}

async function handleHead(args: {
  bucket: R2Bucket;
  path: string;
  request: Request;
}): Promise<Response> {
  const response = await handleGet(args);
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function handlePutMultipart({
  bucket,
  path,
  request,
}: {
  bucket: R2Bucket;
  path: string;
  request: Request;
}): Promise<Response> {
  const url = new URL(request.url);
  const uploadId = url.searchParams.get("uploadId");
  const partNumberString = url.searchParams.get("partNumber");
  if (!uploadId || !partNumberString || !request.body) {
    return new Response("Bad Request", { status: 400 });
  }

  if (!/^\d+$/.test(partNumberString)) {
    return new Response("Bad Request", { status: 400 });
  }
  const partNumber = parseInt(partNumberString, 10);
  if (!Number.isInteger(partNumber) || partNumber <= 0) {
    return new Response("Bad Request", { status: 400 });
  }

  const multipartUpload = bucket.resumeMultipartUpload(path, uploadId);
  const uploadedPart = await multipartUpload.uploadPart(partNumber, request.body);
  return new Response(null, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      etag: uploadedPart.etag,
    },
  });
}

async function handlePut({
  bucket,
  path,
  request,
}: {
  bucket: R2Bucket;
  path: string;
  request: Request;
}): Promise<Response> {
  const url = new URL(request.url);
  if (url.searchParams.has("uploadId") && url.searchParams.has("partNumber")) {
    return handlePutMultipart({ bucket, path, request });
  }

  const contentLength = Number(request.headers.get("Content-Length") || "0");
  // Cloudflare Workers/Pages 单次请求体约 100–128MB。超过时给出明确中文说明，
  // 避免客户端只看到泛化的 413/网络错误。分块上传走 uploadId+partNumber，不受此限。
  if (Number.isFinite(contentLength) && contentLength >= 100 * 1024 * 1024) {
    return new Response(
      "单次上传超过 Cloudflare 约 128MB 的请求限制，无法通过 WebDAV 直传。请改用网页端分块上传（支持大文件与断点续传）。",
      { status: 413, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  if (path === "" || new URL(request.url).pathname.endsWith("/")) {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!path.startsWith(INTERNAL_PREFIX)) {
    const lockResponse = await assertLockPermission(request, bucket, path);
    if (lockResponse !== null) {
      return lockResponse;
    }
    if (await isCollectionPath(bucket, path)) {
      return new Response("Method Not Allowed", { status: 405 });
    }
    if (!(await hasCollectionResource(bucket, getParentPath(path)))) {
      return new Response("Conflict", { status: 409 });
    }
  }

  const existing = await bucket.head(path);
  const body = await request.arrayBuffer();
  const rawThumbnail = request.headers.get("fd-thumbnail");
  const thumbnail = isValidThumbnailDigest(rawThumbnail) ? rawThumbnail : undefined;
  // 覆盖写入会整体替换 customMetadata；previousThumbnail 是即将被替换掉/保留的旧引用。
  const previousThumbnail = existing?.customMetadata?.thumbnail;
  const preservedMetadata = getPreservedCustomMetadata(existing?.customMetadata);
  if (thumbnail) {
    preservedMetadata.thumbnail = thumbnail;
    // 引用先行：并发删除最后一个同缩略图文件时不会把图收走。
    await addThumbnailRef(bucket, thumbnail, path);
    // 客户端先传缩略图本体再传文件；若图在间隙中被并发回收，让客户端整体重试。
    if ((await bucket.head(thumbnailObjectKey(thumbnail))) === null) {
      if (thumbnail !== previousThumbnail) {
        await bucket.delete(thumbnailRefKey(thumbnail, path));
      }
      return new Response("Thumbnail is missing", { status: 409 });
    }
  }

  const conditionalHeaders = getConditionalHeaders(request.headers);
  // Headers.keys() is missing from the Workers/DOM Headers typings we use.
  const hasPreconditions =
    conditionalHeaders.has("if-match") ||
    conditionalHeaders.has("if-none-match") ||
    conditionalHeaders.has("if-modified-since") ||
    conditionalHeaders.has("if-unmodified-since") ||
    conditionalHeaders.has("if-range");
  const result = await bucket.put(path, body, {
    ...(hasPreconditions ? { onlyIf: conditionalHeaders } : {}),
    httpMetadata: request.headers,
    customMetadata: preservedMetadata,
  });
  if (!result) {
    if (thumbnail && thumbnail !== previousThumbnail) {
      await bucket.delete(thumbnailRefKey(thumbnail, path));
    }
    return new Response("Preconditions failed", { status: 412 });
  }

  if (thumbnail && previousThumbnail !== thumbnail) {
    await releaseThumbnailRef(bucket, previousThumbnail, path);
  }

  // Return ETag on create/update so clients can If-Match on the next write
  // (201 previously omitted it, leaving extension snapshotsEtag null — #112).
  const etagHeaders = new Headers();
  const etagValue = result.httpEtag || (result.etag ? `"${result.etag}"` : "");
  if (etagValue) etagHeaders.set("ETag", etagValue);

  return existing === null
    ? createdResponse(path, false, "", etagHeaders)
    : new Response(null, { status: 204, headers: etagHeaders });
}

async function handleMkcol({
  bucket,
  path,
  request,
}: {
  bucket: R2Bucket;
  path: string;
  request: Request;
}): Promise<Response> {
  if (path === "") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if ((await request.arrayBuffer()).byteLength > 0) {
    return new Response("Unsupported Media Type", { status: 415 });
  }

  const lockResponse = await assertLockPermission(request, bucket, path);
  if (lockResponse !== null) {
    return lockResponse;
  }

  const resource = await bucket.head(path);
  if (resource !== null) {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!(await hasCollectionResource(bucket, getParentPath(path)))) {
    return new Response("Conflict", { status: 409 });
  }

  await bucket.put(path, new Uint8Array(), {
    httpMetadata: {
      contentType: "application/x-directory",
    },
    customMetadata: { resourcetype: "<collection />" },
  });
  return createdResponse(path, true);
}

async function handleDelete({
  bucket,
  path,
  request,
}: {
  bucket: R2Bucket;
  path: string;
  request: Request;
}): Promise<Response> {
  const lockResponse = await assertRecursiveDeletePermission(request, bucket, path);
  if (lockResponse !== null) {
    return lockResponse;
  }

  if (path === "") {
    await deleteAll(bucket);
    // deleteAll 会跳过 internal 子树；全删时把共享缩略图和 marker 一并清掉。
    await deleteAll(bucket, THUMBNAIL_PREFIX, false);
    return new Response(null, { status: 204 });
  }

  const resource = await bucket.head(path);
  const isDirectory = await isCollectionPath(bucket, path);
  if (resource === null && !isDirectory) {
    return new Response("Not Found", { status: 404 });
  }

  if (isDirectory) {
    await deleteAll(bucket, `${path}/`);
    if (resource !== null) {
      await bucket.delete(path);
    }
  } else {
    const digest = resource?.customMetadata?.thumbnail;
    await bucket.delete(path);
    await releaseThumbnailRef(bucket, digest, path);
  }
  return new Response(null, { status: 204 });
}

function generatePropfindResponse(
  object: R2Object | DavObject | null,
  propfindRequest: PropfindRequest,
): string {
  const href =
    object === null
      ? DAV_ENDPOINT_WITH_SLASH
      : getResourceHref(object.key, isCollectionObject(object));
  const deadProperties = getDeadProperties(object?.customMetadata);
  const liveProperties = Object.entries(fromR2Object(object)).flatMap(([key, value]) =>
    value === undefined ? [] : [renderDavProperty(key, value)],
  );

  let okProperties: string[] = [];
  let missingProperties: string[] = [];

  switch (propfindRequest.mode) {
    case "allprop": {
      okProperties = [...liveProperties, ...deadProperties.map(renderPropertyElement)];
      break;
    }
    case "propname": {
      okProperties = [
        ...Object.entries(fromR2Object(object)).flatMap(([key, value]) =>
          value === undefined ? [] : [renderDavProperty(key, "")],
        ),
        ...deadProperties.map((property) =>
          renderEmptyPropertyElement({ ...property, valueXml: "" }),
        ),
      ];
      break;
    }
    case "prop": {
      for (const property of propfindRequest.properties) {
        const liveValue = getLivePropertyValue(object, property);
        if (liveValue !== undefined) {
          okProperties.push(
            property.namespaceURI === DAV_NAMESPACE
              ? renderDavProperty(property.localName, liveValue)
              : renderPropertyElement({
                  ...property,
                  valueXml: escapeXml(liveValue),
                }),
          );
          continue;
        }
        const deadProperty = getDeadProperty(
          object?.customMetadata,
          property.namespaceURI,
          property.localName,
        );
        if (deadProperty !== null) {
          okProperties.push(renderPropertyElement(deadProperty));
        } else {
          missingProperties.push(
            renderEmptyPropertyElement({ ...property, valueXml: "" }),
          );
        }
      }
      break;
    }
  }

  return `
  <response>
    <href>${escapeXml(href)}</href>${renderPropstat("HTTP/1.1 200 OK", okProperties)}${renderPropstat("HTTP/1.1 404 Not Found", missingProperties)}
  </response>`;
}

async function handlePropfind({
  bucket,
  path,
  request,
}: {
  bucket: R2Bucket;
  path: string;
  request: Request;
}): Promise<Response> {
  if (request.method !== "OPTIONS" && path.startsWith(INTERNAL_PREFIX)) {
    return new Response("Not Found", { status: 404 });
  }

  const propfindRequest = parsePropfindRequest(await request.text());
  if (propfindRequest === null) {
    return new Response("Bad Request", { status: 400 });
  }

  let isCollection = false;
  let page = `<?xml version="1.0" encoding="utf-8"?>
<multistatus xmlns="DAV:" xmlns:fd="${FLAREDRIVE_NAMESPACE}">`;

  if (path === "") {
    page += generatePropfindResponse(null, propfindRequest);
    isCollection = true;
  } else {
    let object: R2Object | DavObject | null = await bucket.head(path);
    isCollection = await isCollectionPath(bucket, path);
    if (object === null && !isCollection) {
      return new Response("Not Found", { status: 404 });
    }
    if (object === null) {
      object = {
        key: path,
        size: 0,
        uploaded: new Date(),
        etag: "",
        httpEtag: "",
        httpMetadata: { contentType: "application/x-directory" },
        customMetadata: { resourcetype: "<collection />" },
      };
    }
    page += generatePropfindResponse(
      { ...(object as R2Object | DavObject), isCollection },
      propfindRequest,
    );
  }

  if (isCollection) {
    const depth = request.headers.get("Depth") ?? "infinity";
    switch (depth) {
      case "0":
        break;
      case "1":
      case "infinity": {
        const prefix = path === "" ? undefined : `${path}/`;
        for await (const object of listAll(bucket, prefix, depth === "infinity")) {
          page += generatePropfindResponse(object, propfindRequest);
        }
        break;
      }
      default:
        return new Response("Bad Request", { status: 400 });
    }
  }

  page += "\n</multistatus>\n";
  return new Response(page, {
    status: 207,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Length": new TextEncoder().encode(page).byteLength.toString(),
    },
  });
}

async function handleProppatch({
  bucket,
  path,
  request,
}: {
  bucket: R2Bucket;
  path: string;
  request: Request;
}): Promise<Response> {
  const lockResponse = await assertLockPermission(request, bucket, path);
  if (lockResponse !== null) {
    return lockResponse;
  }

  const object = await bucket.head(path);
  if (object === null) {
    return new Response("Not Found", { status: 404 });
  }

  const parsedRequest = parseProppatchRequest(await request.text());
  if (parsedRequest === null) {
    return new Response("Bad Request", { status: 400 });
  }

  const customMetadata = getPreservedCustomMetadata(object.customMetadata);
  const successfulSetProperties: DeadProperty[] = [];
  const failedSetProperties: DeadProperty[] = [];
  const successfulRemoveProperties: DeadProperty[] = [];
  const failedRemoveProperties: DeadProperty[] = [];

  for (const operation of parsedRequest.operations) {
    if (isProtectedProperty(operation.property)) {
      if (operation.action === "set") {
        failedSetProperties.push(operation.property);
      } else {
        failedRemoveProperties.push(operation.property);
      }
      continue;
    }

    const key = getDeadPropertyKey(
      operation.property.namespaceURI,
      operation.property.localName,
    );
    if (operation.action === "set") {
      customMetadata[key] = JSON.stringify(operation.property);
      successfulSetProperties.push(operation.property);
    } else {
      delete customMetadata[key];
      successfulRemoveProperties.push(operation.property);
    }
  }

  const hasFailures =
    failedSetProperties.length > 0 || failedRemoveProperties.length > 0;
  if (!hasFailures) {
    const source = await bucket.get(object.key);
    if (source === null) {
      return new Response("Not Found", { status: 404 });
    }
    await bucket.put(object.key, source.body, {
      httpMetadata: object.httpMetadata,
      customMetadata,
    });
  }

  const propstats = new Map<string, string[]>();
  const appendPropstat = (property: DeadProperty, status: string) => {
    const props = propstats.get(status) ?? [];
    props.push(renderEmptyPropertyElement({ ...property, valueXml: "" }));
    propstats.set(status, props);
  };
  const successStatus = hasFailures
    ? "HTTP/1.1 424 Failed Dependency"
    : "HTTP/1.1 200 OK";

  for (const property of successfulSetProperties) {
    appendPropstat(property, successStatus);
  }
  for (const property of successfulRemoveProperties) {
    appendPropstat(property, successStatus);
  }
  for (const property of failedSetProperties) {
    appendPropstat(property, "HTTP/1.1 403 Forbidden");
  }
  for (const property of failedRemoveProperties) {
    appendPropstat(property, "HTTP/1.1 403 Forbidden");
  }

  const isCollection = isCollectionObject(object);
  let responseXML = `<?xml version="1.0" encoding="utf-8"?>
<multistatus xmlns="DAV:">
  <response>
    <href>${escapeXml(getResourceHref(object.key, isCollection))}</href>`;
  for (const [status, propNames] of propstats) {
    responseXML += `
    <propstat>
      <prop>
${propNames.map((propName) => `        ${propName}`).join("\n")}
      </prop>
      <status>${status}</status>
    </propstat>`;
  }
  responseXML += `
  </response>
</multistatus>`;

  return new Response(responseXML, {
    status: 207,
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}

async function handleCopy({
  bucket,
  path,
  request,
}: {
  bucket: R2Bucket;
  path: string;
  request: Request;
}): Promise<Response> {
  const dontOverwrite = request.headers.get("Overwrite") === "F";
  const destinationHeader = request.headers.get("Destination");
  if (destinationHeader === null) {
    return new Response("Bad Request", { status: 400 });
  }
  const destination = parseDestinationPath(destinationHeader, request.url);
  if (destination === null) {
    return new Response("Bad Request", { status: 400 });
  }
  if (destination.startsWith(INTERNAL_PREFIX)) {
    return new Response("Not Found", { status: 404 });
  }
  if (destination === "") {
    return new Response("Bad Request", { status: 400 });
  }
  if (isSameOrDescendantPath(path, destination)) {
    return new Response("Bad Request", { status: 400 });
  }

  const sourceLockResponse = await assertLockPermission(request, bucket, path);
  if (sourceLockResponse !== null) {
    return sourceLockResponse;
  }
  const destinationLockResponse = await assertLockPermission(request, bucket, destination);
  if (destinationLockResponse !== null) {
    return destinationLockResponse;
  }

  if (!(await hasCollectionResource(bucket, getParentPath(destination)))) {
    return new Response("Conflict", { status: 409 });
  }

  const destinationHead = await bucket.head(destination);
  // 既有目录可能只有前缀、没有 marker（虚拟目录）；不能用 head 判断存在性。
  const destinationIsCollection =
    destinationHead !== null
      ? isCollectionObject(destinationHead)
      : await isCollectionPath(bucket, destination);
  const destinationExists = destinationHead !== null || destinationIsCollection;
  if (dontOverwrite && destinationExists) {
    return new Response("Precondition Failed", { status: 412 });
  }

  let resource: R2Object | DavObject | null = await bucket.head(path);
  const isDirectory = await isCollectionPath(bucket, path);
  if (resource === null && !isDirectory) {
    return new Response("Not Found", { status: 404 });
  }
  if (resource === null) {
    resource = {
      key: path,
      size: 0,
      uploaded: new Date(),
      etag: "",
      httpEtag: "",
      httpMetadata: { contentType: "application/x-directory" },
      customMetadata: { resourcetype: "<collection />" },
    };
  }
  // COPY 默认覆盖（Overwrite:T）：若目标是目录（含虚拟目录），先清掉目标子树，
  // 避免“同名文件 + 子对象并存”的脏状态。源已确认存在后再删目标。
  if (!dontOverwrite && destinationIsCollection) {
    const deleteResponse = await deleteDestination(bucket, destination, request);
    if (!deleteResponse.ok) return deleteResponse;
  }
  const putObject = async (sourceKey: string, targetKey: string) => {
    const source = await bucket.get(sourceKey);
    if (source === null) {
      await bucket.put(targetKey, new Uint8Array(), {
        httpMetadata: { contentType: "application/x-directory" },
        customMetadata: { resourcetype: "<collection />" },
      });
      return;
    }
    // 覆盖同名文件时目标旧缩略图引用需要释放（目录目标已由 deleteDestination 清理，
    // 这里兜底处理文件对文件的直接覆盖）。
    const previous = await bucket.head(targetKey);
    const previousThumbnail = previous?.customMetadata?.thumbnail;
    const digest = source.customMetadata?.thumbnail;
    await addThumbnailRef(bucket, digest, targetKey);
    await bucket.put(targetKey, source.body, {
      httpMetadata: source.httpMetadata,
      customMetadata: stripLockMetadata(source.customMetadata),
    });
    if (previousThumbnail !== digest) {
      await releaseThumbnailRef(bucket, previousThumbnail, targetKey);
    }
  };

  if (isDirectory) {
    const depth = request.headers.get("Depth") ?? "infinity";
    switch (depth) {
      case "0": {
        await putObject(path, destination);
        break;
      }
      case "infinity": {
        const prefix = `${path}/`;
        const promises = [putObject(path, destination)];
        for await (const object of listAll(bucket, prefix, true)) {
          const target = `${destination}/${object.key.slice(prefix.length)}`;
          promises.push(putObject(object.key, target.replace(/\/$/, "")));
        }
        await Promise.all(promises);
        break;
      }
      default:
        return new Response("Bad Request", { status: 400 });
    }
  } else {
    await putObject(path, destination);
  }

  return destinationExists
    ? new Response(null, { status: 204 })
    : createdResponse(destination, isDirectory);
}

async function deleteDestination(
  bucket: R2Bucket,
  path: string,
  sourceRequest: Request,
): Promise<Response> {
  const headers = new Headers();
  for (const headerName of INTERNAL_DELETE_FORWARD_HEADERS) {
    const headerValue = sourceRequest.headers.get(headerName);
    if (headerValue !== null) {
      headers.set(headerName, headerValue);
    }
  }
  const destinationHeader = sourceRequest.headers.get("Destination");
  const destinationUrl = new URL(
    destinationHeader ?? sourceRequest.url,
    sourceRequest.url,
  ).toString();
  const request = new Request(destinationUrl, {
    method: "DELETE",
    headers,
  });
  return handleDelete({ bucket, path, request });
}

async function handleMove({
  bucket,
  path,
  request,
}: {
  bucket: R2Bucket;
  path: string;
  request: Request;
}): Promise<Response> {
  const overwrite = (request.headers.get("Overwrite") ?? "T") !== "F";
  const destinationHeader = request.headers.get("Destination");
  if (destinationHeader === null) {
    return new Response("Bad Request", { status: 400 });
  }
  const destination = parseDestinationPath(destinationHeader, request.url);
  if (destination === null) {
    return new Response("Bad Request", { status: 400 });
  }
  if (destination.startsWith(INTERNAL_PREFIX)) {
    return new Response("Not Found", { status: 404 });
  }
  if (destination === "") {
    return new Response("Bad Request", { status: 400 });
  }
  if (isSameOrDescendantPath(path, destination)) {
    return new Response("Bad Request", { status: 400 });
  }

  const sourceLockResponse = await assertLockPermission(request, bucket, path);
  if (sourceLockResponse !== null) {
    return sourceLockResponse;
  }
  const destinationLockResponse = await assertLockPermission(request, bucket, destination);
  if (destinationLockResponse !== null) {
    return destinationLockResponse;
  }

  if (!(await hasCollectionResource(bucket, getParentPath(destination)))) {
    return new Response("Conflict", { status: 409 });
  }

  const destinationHead = await bucket.head(destination);
  // 虚拟目录没有 marker，head 为 null 但仍应视为已存在的目标集合。
  const destinationExists =
    destinationHead !== null || (await isCollectionPath(bucket, destination));
  if (!overwrite && destinationExists) {
    return new Response("Precondition Failed", { status: 412 });
  }

  let resource: R2Object | DavObject | null = await bucket.head(path);
  const isDirectory = await isCollectionPath(bucket, path);
  if (resource === null && !isDirectory) {
    return new Response("Not Found", { status: 404 });
  }
  if (resource === null) {
    resource = {
      key: path,
      size: 0,
      uploaded: new Date(),
      etag: "",
      httpEtag: "",
      httpMetadata: { contentType: "application/x-directory" },
      customMetadata: { resourcetype: "<collection />" },
    };
  }
  if (path === destination) {
    return new Response("Bad Request", { status: 400 });
  }

  if (destinationExists) {
    const deleteResponse = await deleteDestination(bucket, destination, request);
    if (!deleteResponse.ok) {
      return deleteResponse;
    }
  }

  const moveObject = async (object: R2Object | DavObject) => {
    const target = object.key === path
      ? destination
      : `${destination}/${object.key.slice(`${path}/`.length)}`;
    const source = await bucket.get(object.key);
    if (source === null) {
      if (isCollectionObject(object)) {
        await bucket.put(target, new Uint8Array(), {
          httpMetadata: { contentType: "application/x-directory" },
          customMetadata: { resourcetype: "<collection />" },
        });
      }
    } else {
      const digest = source.customMetadata?.thumbnail;
      // 先给目标补引用，再释放源引用，缩略图在移动全程都有引用覆盖。
      await addThumbnailRef(bucket, digest, target);
      await bucket.put(target, source.body, {
        httpMetadata: source.httpMetadata,
        customMetadata: getPreservedCustomMetadata(source.customMetadata),
      });
      await bucket.delete(object.key);
      await releaseThumbnailRef(bucket, digest, object.key);
    }
  };

  if (isDirectory) {
    const depth = request.headers.get("Depth") ?? "infinity";
    if (depth !== "infinity") {
      return new Response("Bad Request", { status: 400 });
    }
    const promises = [moveObject({ ...resource, isCollection: true } as DavObject)];
    for await (const object of listAll(bucket, `${path}/`, true)) {
      promises.push(moveObject(object));
    }
    await Promise.all(promises);
  } else {
    await moveObject(resource as R2Object | DavObject);
  }

  return destinationExists
    ? new Response(null, { status: 204 })
    : createdResponse(destination, isDirectory);
}

async function handleLock({
  bucket,
  path,
  request,
}: {
  bucket: R2Bucket;
  path: string;
  request: Request;
}): Promise<Response> {
  if (path === "") {
    return new Response("Bad Request", { status: 400 });
  }

  const depthHeader = request.headers.get("Depth");
  if (
    depthHeader !== null &&
    !VALID_LOCK_DEPTHS.includes(depthHeader as (typeof VALID_LOCK_DEPTHS)[number])
  ) {
    return new Response("Bad Request", { status: 400 });
  }

  const { timeout, expiresAt } = parseTimeout(request.headers.get("Timeout"));
  const body = await request.text();
  const requestedScope: LockDetails["scope"] = /<(?:[A-Za-z_][\w.-]*:)?shared(?:\s[^>]*)?\/?>/i.test(body)
    ? "shared"
    : "exclusive";
  const requestLockTokens = getRequestLockTokens(request);
  if (
    body !== "" &&
    !/<(?:[A-Za-z_][\w.-]*:)?write(?:\s[^>]*)?\/?>/i.test(body)
  ) {
    return new Response("Bad Request", { status: 400 });
  }
  const owner = extractLockOwner(body);
  const lockResponse = await assertLockPermission(request, bucket, path, {
    ignoreSharedLocksOnTarget: body !== "" && requestedScope === "shared",
  });
  if (lockResponse !== null) {
    return lockResponse;
  }

  const refreshTarget = body === "" ? await findMatchingLock(request, bucket, path) : null;
  let resource = refreshTarget?.resource ?? (await bucket.head(path));
  let currentLocks = getLockDetails(resource?.customMetadata);
  const existingLock = refreshTarget?.lockDetails;
  if (
    refreshTarget === null &&
    body === "" &&
    resource !== null &&
    currentLocks.length > 0 &&
    !currentLocks.some((currentLock) => requestLockTokens.includes(currentLock.token))
  ) {
    return new Response("Locked", { status: 423 });
  }

  if (resource === null) {
    if (body === "") {
      return new Response("Bad Request", { status: 400 });
    }
    if (!(await hasCollectionResource(bucket, getParentPath(path)))) {
      return new Response("Conflict", { status: 409 });
    }
    if (new URL(request.url).pathname.endsWith("/")) {
      return new Response("Conflict", { status: 409 });
    }

    const isImpliedCollection = await isCollectionPath(bucket, path);
    await bucket.put(
      path,
      new Uint8Array(),
      isImpliedCollection
        ? {
            httpMetadata: { contentType: "application/x-directory" },
            customMetadata: { resourcetype: "<collection />" },
          }
        : { customMetadata: {} },
    );
    resource = await bucket.head(path);
    currentLocks = [];
  }

  if (resource === null) {
    return new Response("Not Found", { status: 404 });
  }
  const isCollection = isCollectionObject(resource);
  const resourceType = isCollection
    ? "<collection />"
    : resource.customMetadata?.resourcetype;
  if (existingLock === undefined) {
    if (requestedScope === "exclusive" && currentLocks.length > 0) {
      return new Response("Locked", { status: 423 });
    }
    if (
      requestedScope === "shared" &&
      currentLocks.some((lockDetail) => lockDetail.scope === "exclusive")
    ) {
      return new Response("Locked", { status: 423 });
    }
  }

  let depth: (typeof VALID_LOCK_DEPTHS)[number];
  if (existingLock !== undefined && depthHeader === null && body === "") {
    depth = existingLock.depth;
  } else {
    depth = determineLockDepth(
      resourceType,
      depthHeader as (typeof VALID_LOCK_DEPTHS)[number] | null,
    );
  }

  const lockDetails: LockDetails = {
    token: existingLock?.token ?? crypto.randomUUID(),
    owner: owner ?? existingLock?.owner,
    scope: existingLock?.scope ?? requestedScope,
    depth,
    timeout,
    expiresAt,
    root: getResourceHref(resource.key, isCollection),
  };
  const updatedLocks =
    existingLock === undefined
      ? [...currentLocks, lockDetails]
      : currentLocks.map((currentLock) =>
          currentLock.token === existingLock.token ? lockDetails : currentLock,
        );

  const source = await bucket.get(resource.key);
  if (source === null) {
    return new Response("Not Found", { status: 404 });
  }
  await bucket.put(resource.key, source.body, {
    httpMetadata: source.httpMetadata,
    customMetadata: withLockMetadata(resource.customMetadata, updatedLocks),
  });

  return new Response(
    `<?xml version="1.0" encoding="utf-8"?>
<prop xmlns="DAV:"><lockdiscovery>${getLockDiscovery(updatedLocks)}</lockdiscovery></prop>`,
    {
      status: existingLock ? 200 : 201,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Lock-Token": `<urn:uuid:${lockDetails.token}>`,
        ...(existingLock
          ? {}
          : { Location: getResourceHref(resource.key, isCollection) }),
      },
    },
  );
}

async function handleUnlock({
  bucket,
  path,
  request,
}: {
  bucket: R2Bucket;
  path: string;
  request: Request;
}): Promise<Response> {
  const resource = await bucket.head(path);
  if (resource === null) {
    return new Response("Not Found", { status: 404 });
  }

  const lockToken = request.headers.get("Lock-Token");
  if (lockToken === null) {
    return new Response("Bad Request", { status: 400 });
  }
  const lockResponse = await assertLockPermission(request, bucket, path);
  if (lockResponse !== null) {
    return lockResponse;
  }

  const lockDetails = getLockDetails(resource.customMetadata);
  const normalizedToken = normalizeLockToken(lockToken);
  if (!lockDetails.some((lockDetail) => lockDetail.token === normalizedToken)) {
    return new Response("Conflict", { status: 409 });
  }

  const source = await bucket.get(resource.key);
  if (source === null) {
    return new Response("Not Found", { status: 404 });
  }
  await bucket.put(resource.key, source.body, {
    httpMetadata: source.httpMetadata,
    customMetadata: withLockMetadata(
      resource.customMetadata,
      lockDetails.filter((lockDetail) => lockDetail.token !== normalizedToken),
    ),
  });

  return new Response(null, { status: 204 });
}

async function handlePostCreateMultipart({
  bucket,
  path,
  request,
}: {
  bucket: R2Bucket;
  path: string;
  request: Request;
}): Promise<Response> {
  const rawThumbnail = request.headers.get("fd-thumbnail");
  const thumbnail = isValidThumbnailDigest(rawThumbnail) ? rawThumbnail : undefined;
  const customMetadata = thumbnail ? { thumbnail } : undefined;
  // 引用先行：分片未完成期间，并发删除最后一个同缩略图文件不会把图收走。
  if (thumbnail) {
    await addThumbnailRef(bucket, thumbnail, path);
  }
  const multipartUpload = await bucket.createMultipartUpload(path, {
    httpMetadata: request.headers,
    customMetadata,
  });
  return new Response(JSON.stringify({ key: multipartUpload.key, uploadId: multipartUpload.uploadId }));
}

async function handlePostCompleteMultipart({
  bucket,
  path,
  request,
}: {
  bucket: R2Bucket;
  path: string;
  request: Request;
}): Promise<Response> {
  const uploadId = new URL(request.url).searchParams.get("uploadId");
  if (!uploadId) {
    return new Response("Not Found", { status: 404 });
  }
  const multipartUpload = bucket.resumeMultipartUpload(path, uploadId);
  let completeBody: unknown;
  try {
    completeBody = await request.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
  if (
    !completeBody ||
    typeof completeBody !== "object" ||
    !Array.isArray((completeBody as { parts?: unknown }).parts)
  ) {
    return new Response("Bad Request", { status: 400 });
  }

  try {
    const object = await multipartUpload.complete(
      (completeBody as { parts: R2UploadedPart[] }).parts
    );
    return new Response(null, {
      headers: { etag: object.httpEtag },
    });
  } catch (error: any) {
    return new Response(error?.message ?? "Bad Request", { status: 400 });
  }
}

async function handlePost({
  bucket,
  path,
  request,
}: {
  bucket: R2Bucket;
  path: string;
  request: Request;
}): Promise<Response> {
  const params = new URL(request.url).searchParams;
  if (params.has("uploads")) {
    return handlePostCreateMultipart({ bucket, path, request });
  }
  if (params.has("uploadId")) {
    return handlePostCompleteMultipart({ bucket, path, request });
  }
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: SUPPORT_METHODS.join(", "), DAV: DAV_CLASS },
  });
}

function handleOptions(): Response {
  return new Response(null, {
    status: 200,
    headers: {
      Allow: SUPPORT_METHODS.join(", "),
      DAV: DAV_CLASS,
    },
  });
}

function isAuthorized(authorizationHeader: string, username: string, password: string): boolean {
  // fail closed：凭据未配置或为空时一律拒绝（与 api/_apikey.ts 的 verifyBasicAuth 对齐），
  // 避免 btoa("undefined:undefined") / btoa(":") 这类固定值成为可被猜中的有效 Basic 头。
  if (!username || !password) return false;
  const encoder = new TextEncoder();
  const header = encoder.encode(authorizationHeader);
  const expected = encoder.encode(`Basic ${utf8ToBase64(`${username}:${password}`)}`);
  return timingSafeEqual(header, expected);
}

async function dispatchHandler(
  bucket: R2Bucket,
  path: string,
  request: Request,
): Promise<Response> {
  if (path.startsWith(INTERNAL_PREFIX)) {
    if (!path.startsWith(THUMBNAIL_PREFIX)) {
      return new Response("Not Found", { status: 404 });
    }
    if (!["GET", "HEAD", "PUT"].includes(request.method)) {
      return new Response("Not Found", { status: 404 });
    }
  }

  switch (request.method) {
    case "OPTIONS":
      return handleOptions();
    case "HEAD":
      return handleHead({ bucket, path, request });
    case "GET":
      return handleGet({ bucket, path, request });
    case "PUT":
      return handlePut({ bucket, path, request });
    case "DELETE":
      return handleDelete({ bucket, path, request });
    case "MKCOL":
      return handleMkcol({ bucket, path, request });
    case "PROPFIND":
      return handlePropfind({ bucket, path, request });
    case "PROPPATCH":
      return handleProppatch({ bucket, path, request });
    case "COPY":
      return handleCopy({ bucket, path, request });
    case "MOVE":
      return handleMove({ bucket, path, request });
    case "LOCK":
      return handleLock({ bucket, path, request });
    case "UNLOCK":
      return handleUnlock({ bucket, path, request });
    case "POST":
      return handlePost({ bucket, path, request });
    default:
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: SUPPORT_METHODS.join(", "), DAV: DAV_CLASS },
      });
  }
}

async function handleRequest(context: PagesContext): Promise<Response> {
  const request = context.request;
  const [bucket, path] = parseBucketPath(context);
  if (!bucket) {
    return new Response("Not Found", { status: 404 });
  }

  const requestUrl = new URL(request.url);
  if (path === "" && requestUrl.pathname === DAV_ENDPOINT) {
    requestUrl.pathname = DAV_ENDPOINT_WITH_SLASH;
    return new Response(null, {
      status: 307,
      headers: { Location: requestUrl.toString() },
    });
  }

  const env = context.env;
  const isThumbnail =
    request.method === "GET" && path.startsWith(THUMBNAIL_PREFIX);
  const skipAuth =
    request.method === "OPTIONS" ||
    isThumbnail ||
    (env.WEBDAV_PUBLIC_READ === "1" &&
      ["GET", "HEAD", "PROPFIND"].includes(request.method));

  if (!skipAuth) {
    if (!env.WEBDAV_USERNAME || !env.WEBDAV_PASSWORD) {
      return new Response("WebDAV protocol is not enabled", { status: 403 });
    }
    const authorization = request.headers.get("Authorization") ?? "";
    if (!isAuthorized(authorization, env.WEBDAV_USERNAME, env.WEBDAV_PASSWORD)) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": `Basic realm="WebDAV"` },
      });
    }
  }

  return dispatchHandler(bucket, path, request);
}

function addCorsHeaders(response: Response, request: Request): Response {
  response.headers.set(
    "Access-Control-Allow-Origin",
    request.headers.get("Origin") ?? "*",
  );
  response.headers.set("Access-Control-Allow-Methods", SUPPORT_METHODS.join(", "));
  response.headers.set(
    "Access-Control-Allow-Headers",
    [
      "authorization",
      "content-type",
      "depth",
      "overwrite",
      "destination",
      "range",
      "if",
      "if-match",
      "if-none-match",
      "lock-token",
      "timeout",
      "fd-thumbnail",
    ].join(", "),
  );
  response.headers.set(
    "Access-Control-Expose-Headers",
    [
      "content-type",
      "content-length",
      "dav",
      "etag",
      "last-modified",
      "location",
      "date",
      "content-range",
      "lock-token",
    ].join(", "),
  );
  response.headers.set("Access-Control-Allow-Credentials", "false");
  response.headers.set("Access-Control-Max-Age", "86400");
  return response;
}

export const onRequest: PagesFunction<WebDavEnv> = async function (context) {
  const response = await handleRequest(context);
  return addCorsHeaders(response, context.request);
};
