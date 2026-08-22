import { DOMParser } from "@xmldom/xmldom";

export interface WebDavEnv {
  WEBDAV_USERNAME: string;
  WEBDAV_PASSWORD: string;
  WEBDAV_PUBLIC_READ?: string;
  BUCKET: R2Bucket;
  [binding: string]: any;
}

type PagesContext = EventContext<WebDavEnv, string, any>;

const DAV_ENDPOINT = "/webdav";
const DAV_ENDPOINT_WITH_SLASH = "/webdav/";
const INTERNAL_PREFIX = "_$flaredrive$/";
const THUMBNAIL_PREFIX = "_$flaredrive$/thumbnails/";
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

type DavProperties = {
  creationdate: string | undefined;
  displayname: string | undefined;
  getcontentlanguage: string | undefined;
  getcontentlength: string | undefined;
  getcontenttype: string | undefined;
  getetag: string | undefined;
  getlastmodified: string | undefined;
  resourcetype: string;
  supportedlock: string;
  lockdiscovery: string;
  "fd:thumbnail": string | undefined;
};

type LockDetails = {
  token: string;
  owner: string | undefined;
  scope: "exclusive" | "shared";
  depth: "0" | "infinity";
  timeout: string;
  expiresAt: number;
  root: string;
};

type DeadProperty = {
  namespaceURI: string;
  localName: string;
  prefix: string | null;
  valueXml: string;
};

type PropfindRequest =
  | { mode: "allprop" }
  | { mode: "propname" }
  | { mode: "prop"; properties: DeadProperty[] };

type ProppatchOperation = {
  action: "set" | "remove";
  property: DeadProperty;
};

type DavObject = {
  key: string;
  size: number;
  uploaded: Date;
  etag: string;
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
  isCollection?: boolean;
};

const DEFAULT_LOCK_TIMEOUT = 3600;
const MAX_LOCK_TIMEOUT = 365 * 24 * 60 * 60;
const VALID_LOCK_DEPTHS = ["0", "infinity"] as const;
const LOCK_METADATA_KEYS = [
  "lock_token",
  "lock_owner",
  "lock_scope",
  "lock_depth",
  "lock_timeout",
  "lock_expires_at",
  "lock_root",
  "lock_records",
];
const INTERNAL_DELETE_FORWARD_HEADERS = ["If", "Lock-Token"] as const;
const RAW_XML_DAV_PROPERTIES = new Set([
  "resourcetype",
  "supportedlock",
  "lockdiscovery",
]);
const DAV_NAMESPACE = "DAV:";
const FLAREDRIVE_NAMESPACE = "flaredrive";
const DEAD_PROPERTY_PREFIX = "dead_property:";
const LOCK_RECORDS_METADATA_KEY = "lock_records";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function parseBucketPath(context: PagesContext): [R2Bucket, string] {
  const { request, env } = context;
  const url = new URL(request.url);

  let pathname = url.pathname;
  if (pathname === DAV_ENDPOINT) {
    pathname = DAV_ENDPOINT_WITH_SLASH;
  }
  let remainder = pathname.startsWith(DAV_ENDPOINT_WITH_SLASH)
    ? pathname.slice(DAV_ENDPOINT_WITH_SLASH.length)
    : "";
  remainder = remainder.endsWith("/") ? remainder.slice(0, -1) : remainder;
  const path = remainder
    .split("/")
    .map(decodePathSegment)
    .join("/");

  const driveId = url.hostname.replace(/\..*/, "");
  const bucket = env[driveId] || env.BUCKET;
  return [bucket, path];
}

function getResourceHref(key: string, isCollection: boolean): string {
  if (key === "") {
    return DAV_ENDPOINT_WITH_SLASH;
  }
  const encodedPath = key.split("/").map(encodeURIComponent).join("/");
  return `${DAV_ENDPOINT_WITH_SLASH}${encodedPath}${isCollection ? "/" : ""}`;
}

function decodeResourcePath(pathname: string): string {
  let resourcePath = pathname.slice(1);
  resourcePath = resourcePath.endsWith("/")
    ? resourcePath.slice(0, -1)
    : resourcePath;
  if (resourcePath === "") {
    return "";
  }
  return resourcePath.split("/").map(decodePathSegment).join("/");
}

function getParentPath(resourcePath: string): string {
  const normalizedPath = resourcePath.endsWith("/")
    ? resourcePath.slice(0, -1)
    : resourcePath;
  return normalizedPath.split("/").slice(0, -1).join("/");
}

function isCollectionObject(object: R2Object | DavObject | null | undefined): boolean {
  if (!object) {
    return false;
  }
  return (
    object.customMetadata?.resourcetype === "<collection />" ||
    object.httpMetadata?.contentType === "application/x-directory" ||
    (object as DavObject).isCollection === true
  );
}

async function hasCollectionResource(
  bucket: R2Bucket,
  resourcePath: string,
): Promise<boolean> {
  if (resourcePath === "") {
    return true;
  }

  const resource = await bucket.head(resourcePath);
  if (resource !== null) {
    if (isCollectionObject(resource)) {
      return true;
    }
  }

  // Folders created by other WebDAV clients may have no placeholder object.
  // Treat a path as a collection when it has descendants.
  const descendants = await bucket.list({
    prefix: `${resourcePath}/`,
    limit: 1,
  });
  return descendants.objects.length > 0 || descendants.delimitedPrefixes.length > 0;
}

async function isCollectionPath(
  bucket: R2Bucket,
  resourcePath: string,
): Promise<boolean> {
  if (resourcePath === "") {
    return true;
  }
  const resource = await bucket.head(resourcePath);
  if (resource !== null && isCollectionObject(resource)) {
    return true;
  }
  const descendants = await bucket.list({
    prefix: `${resourcePath}/`,
    limit: 1,
  });
  return descendants.objects.length > 0 || descendants.delimitedPrefixes.length > 0;
}

function parseDestinationPath(
  destinationHeader: string,
  requestUrl: string,
): string | null {
  try {
    const destinationUrl = new URL(destinationHeader, requestUrl);
    if (destinationUrl.origin !== new URL(requestUrl).origin) {
      return null;
    }

    let pathname = destinationUrl.pathname;
    if (!pathname.startsWith(DAV_ENDPOINT)) {
      return null;
    }
    return decodeResourcePath(pathname.slice(DAV_ENDPOINT.length) || "/");
  } catch {
    return null;
  }
}

function isSameOrDescendantPath(
  resourcePath: string,
  destinationPath: string,
): boolean {
  if (destinationPath === resourcePath) {
    return true;
  }
  if (resourcePath === "") {
    return destinationPath !== "";
  }
  return destinationPath.startsWith(`${resourcePath}/`);
}

function createdResponse(
  resourcePath: string,
  isCollection: boolean,
  body: BodyInit | null = "",
): Response {
  const headers = new Headers();
  headers.set("Location", getResourceHref(resourcePath, isCollection));
  return new Response(body, {
    status: 201,
    headers,
  });
}

function renderDavProperty(propName: string, value: string): string {
  const content = RAW_XML_DAV_PROPERTIES.has(propName)
    ? value
    : escapeXml(value);
  return `<${propName}>${content}</${propName}>`;
}

function serializeNodeChildren(node: Node): string {
  let xml = "";
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    xml += child.toString();
  }
  return xml;
}

function getDeadPropertyKey(namespaceURI: string, localName: string): string {
  return `${DEAD_PROPERTY_PREFIX}${encodeURIComponent(namespaceURI)}:${encodeURIComponent(localName)}`;
}

function getDeadProperty(
  metadata: Record<string, string> | undefined,
  namespaceURI: string,
  localName: string,
): DeadProperty | null {
  const value = metadata?.[getDeadPropertyKey(namespaceURI, localName)];
  if (value === undefined) {
    return null;
  }
  try {
    return JSON.parse(value) as DeadProperty;
  } catch {
    return null;
  }
}

function getDeadProperties(
  metadata: Record<string, string> | undefined,
): DeadProperty[] {
  if (metadata === undefined) {
    return [];
  }
  return Object.entries(metadata).flatMap(([key, value]) => {
    if (!key.startsWith(DEAD_PROPERTY_PREFIX)) {
      return [];
    }
    try {
      return [JSON.parse(value) as DeadProperty];
    } catch {
      return [];
    }
  });
}

function renderPropertyElement(property: DeadProperty): string {
  const qualifiedName = property.prefix
    ? `${property.prefix}:${property.localName}`
    : property.localName;
  const namespaceDeclaration =
    property.namespaceURI === ""
      ? ' xmlns=""'
      : property.prefix
        ? ` xmlns:${property.prefix}="${escapeXml(property.namespaceURI)}"`
        : ` xmlns="${escapeXml(property.namespaceURI)}"`;
  return `<${qualifiedName}${namespaceDeclaration}>${property.valueXml}</${qualifiedName}>`;
}

function renderEmptyPropertyElement(property: DeadProperty): string {
  const qualifiedName = property.prefix
    ? `${property.prefix}:${property.localName}`
    : property.localName;
  const namespaceDeclaration =
    property.namespaceURI === ""
      ? ' xmlns=""'
      : property.prefix
        ? ` xmlns:${property.prefix}="${escapeXml(property.namespaceURI)}"`
        : ` xmlns="${escapeXml(property.namespaceURI)}"`;
  return `<${qualifiedName}${namespaceDeclaration} />`;
}

function getElementProperty(element: Element): DeadProperty | null {
  if (element.prefix && (element.namespaceURI === null || element.namespaceURI === "")) {
    return null;
  }
  return {
    namespaceURI: element.namespaceURI ?? "",
    localName: element.localName,
    prefix: element.prefix,
    valueXml: serializeNodeChildren(element),
  };
}

function parseXmlDocument(body: string): Document | null {
  const errors: string[] = [];
  const document = new DOMParser({
    errorHandler: {
      warning: () => {},
      error: (message) => errors.push(message),
      fatalError: (message) => errors.push(message),
    },
  }).parseFromString(body, "application/xml");
  return errors.length > 0 ? null : document;
}

function getChildElements(element: Element): Element[] {
  const children: Element[] = [];
  for (let child = element.firstChild; child !== null; child = child.nextSibling) {
    if (child.nodeType === child.ELEMENT_NODE) {
      children.push(child as Element);
    }
  }
  return children;
}

function parsePropfindRequest(body: string): PropfindRequest | null {
  if (body.trim() === "") {
    return { mode: "allprop" };
  }
  const document = parseXmlDocument(body);
  if (document === null || document.documentElement.localName.toLowerCase() !== "propfind") {
    return null;
  }
  const propfindChildren = getChildElements(document.documentElement);
  if (propfindChildren.some((child) => child.localName.toLowerCase() === "propname")) {
    return { mode: "propname" };
  }
  const propElement = propfindChildren.find(
    (child) => child.localName.toLowerCase() === "prop",
  );
  if (propElement !== undefined) {
    const properties = getChildElements(propElement).map(getElementProperty);
    if (properties.some((property) => property === null)) {
      return null;
    }
    return {
      mode: "prop",
      properties: properties as DeadProperty[],
    };
  }
  if (propfindChildren.some((child) => child.localName.toLowerCase() === "allprop")) {
    return { mode: "allprop" };
  }
  return null;
}

function parseProppatchRequest(
  body: string,
): { operations: ProppatchOperation[] } | null {
  const document = parseXmlDocument(body);
  if (document === null || document.documentElement.localName.toLowerCase() !== "propertyupdate") {
    return null;
  }
  const operations: ProppatchOperation[] = [];
  for (const actionElement of getChildElements(document.documentElement)) {
    const action = actionElement.localName.toLowerCase();
    if (action !== "set" && action !== "remove") {
      continue;
    }
    const propElement = getChildElements(actionElement).find(
      (child) => child.localName.toLowerCase() === "prop",
    );
    if (propElement === undefined) {
      continue;
    }
    for (const propertyElement of getChildElements(propElement)) {
      const property = getElementProperty(propertyElement);
      if (property === null) {
        return null;
      }
      operations.push({ action, property });
    }
  }
  return { operations };
}

function getSupportedLock(): string {
  return [
    "<lockentry><lockscope><exclusive /></lockscope><locktype><write /></locktype></lockentry>",
    "<lockentry><lockscope><shared /></lockscope><locktype><write /></locktype></lockentry>",
  ].join("");
}

function determineLockDepth(
  resourceType: string | undefined,
  depthHeader: (typeof VALID_LOCK_DEPTHS)[number] | null,
): "0" | "infinity" {
  if (resourceType === "<collection />") {
    return depthHeader ?? "infinity";
  }
  return depthHeader === "infinity" ? "infinity" : "0";
}

function normalizeLockToken(lockToken: string): string {
  return lockToken
    .trim()
    .replace(/^<|>$/g, "")
    .replace(/^(?:urn:uuid:|opaquelocktoken:)/, "");
}

function normalizeLockDetails(
  lockDetails: Partial<LockDetails> & Pick<LockDetails, "token">,
): LockDetails | null {
  let expiresAt = Number(lockDetails.expiresAt ?? 0);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
    expiresAt = Date.now() + DEFAULT_LOCK_TIMEOUT * 1000;
  }
  if (expiresAt <= Date.now()) {
    return null;
  }

  return {
    token: lockDetails.token,
    owner: lockDetails.owner,
    scope: lockDetails.scope === "shared" ? "shared" : "exclusive",
    depth: lockDetails.depth === "infinity" ? "infinity" : "0",
    timeout: lockDetails.timeout ?? `Second-${DEFAULT_LOCK_TIMEOUT}`,
    expiresAt,
    root: lockDetails.root ?? "/",
  };
}

function getLockDetails(
  customMetadata: Record<string, string> | undefined,
): LockDetails[] {
  const records = customMetadata?.[LOCK_RECORDS_METADATA_KEY];
  if (records !== undefined) {
    try {
      const parsed = JSON.parse(records);
      if (Array.isArray(parsed)) {
        return parsed.flatMap((lockDetails) => {
          if (
            lockDetails &&
            typeof lockDetails === "object" &&
            typeof lockDetails.token === "string"
          ) {
            const normalized = normalizeLockDetails(
              lockDetails as Partial<LockDetails> & Pick<LockDetails, "token">,
            );
            return normalized === null ? [] : [normalized];
          }
          return [];
        });
      }
    } catch {
      // Ignore malformed lock metadata.
    }
  }

  const token = customMetadata?.lock_token;
  if (token === undefined) {
    return [];
  }

  const normalized = normalizeLockDetails({
    token,
    owner: customMetadata?.lock_owner,
    scope: customMetadata?.lock_scope === "shared" ? "shared" : "exclusive",
    depth: customMetadata?.lock_depth === "infinity" ? "infinity" : "0",
    timeout: customMetadata?.lock_timeout ?? `Second-${DEFAULT_LOCK_TIMEOUT}`,
    expiresAt: Number(customMetadata?.lock_expires_at ?? 0),
    root: customMetadata?.lock_root ?? "/",
  });
  return normalized === null ? [] : [normalized];
}

function getLockDiscovery(lockDetails: LockDetails | LockDetails[]): string {
  const lockDetailList = Array.isArray(lockDetails) ? lockDetails : [lockDetails];
  return lockDetailList
    .map(
      (lockDetail) =>
        `<activelock><locktype><write /></locktype><lockscope><${lockDetail.scope} /></lockscope><depth>${lockDetail.depth}</depth>${lockDetail.owner ? `<owner>${escapeXml(lockDetail.owner)}</owner>` : ""}<timeout>${escapeXml(lockDetail.timeout)}</timeout><locktoken><href>urn:uuid:${escapeXml(lockDetail.token)}</href></locktoken><lockroot><href>${escapeXml(lockDetail.root)}</href></lockroot></activelock>`,
    )
    .join("");
}

function stripLockMetadata(
  customMetadata: Record<string, string> | undefined,
): Record<string, string> {
  const metadata = customMetadata ? { ...customMetadata } : {};
  for (const key of LOCK_METADATA_KEYS) {
    delete metadata[key];
  }
  return metadata;
}

function withLockMetadata(
  customMetadata: Record<string, string> | undefined,
  lockDetails: LockDetails | LockDetails[],
): Record<string, string> {
  const lockDetailList = Array.isArray(lockDetails) ? lockDetails : [lockDetails];
  if (lockDetailList.length === 0) {
    return stripLockMetadata(customMetadata);
  }
  return {
    ...stripLockMetadata(customMetadata),
    [LOCK_RECORDS_METADATA_KEY]: JSON.stringify(lockDetailList),
  };
}

function getPreservedCustomMetadata(
  customMetadata: Record<string, string> | undefined,
): Record<string, string> {
  const lockDetails = getLockDetails(customMetadata);
  if (lockDetails.length === 0) {
    return stripLockMetadata(customMetadata);
  }
  return withLockMetadata(customMetadata, lockDetails);
}

function isProtectedProperty(propName: string | DeadProperty): boolean {
  const localPropName =
    typeof propName === "string"
      ? (propName.split(":").pop() ?? propName)
      : propName.localName;
  return (
    LOCK_METADATA_KEYS.includes(localPropName) ||
    localPropName === "supportedlock" ||
    localPropName === "lockdiscovery"
  );
}

function parseTimeout(timeoutHeader: string | null): {
  timeout: string;
  expiresAt: number;
} {
  if (timeoutHeader === null) {
    return {
      timeout: `Second-${DEFAULT_LOCK_TIMEOUT}`,
      expiresAt: Date.now() + DEFAULT_LOCK_TIMEOUT * 1000,
    };
  }

  for (const item of timeoutHeader.split(",").map((value) => value.trim())) {
    if (item.toLowerCase() === "infinite") {
      return {
        timeout: "Infinite",
        expiresAt: Date.now() + MAX_LOCK_TIMEOUT * 1000,
      };
    }

    let seconds = Number(item.match(/^Second-(\d+)$/i)?.[1] ?? NaN);
    if (Number.isFinite(seconds) && seconds > 0) {
      seconds = Math.min(seconds, MAX_LOCK_TIMEOUT);
      return {
        timeout: `Second-${seconds}`,
        expiresAt: Date.now() + seconds * 1000,
      };
    }
  }

  return {
    timeout: `Second-${DEFAULT_LOCK_TIMEOUT}`,
    expiresAt: Date.now() + DEFAULT_LOCK_TIMEOUT * 1000,
  };
}

function getRequestLockTokens(request: Request): string[] {
  const lockTokens: string[] = [];
  const directLockToken = request.headers.get("Lock-Token");
  if (directLockToken) {
    lockTokens.push(normalizeLockToken(directLockToken));
  }

  const ifHeader = request.headers.get("If");
  if (ifHeader) {
    for (const match of ifHeader.matchAll(/<([^>]+)>/g)) {
      const token = normalizeLockToken(match[1]);
      if (token !== "") {
        lockTokens.push(token);
      }
    }
  }

  return [...new Set(lockTokens)];
}

function hasAlwaysFalseIfCondition(request: Request): boolean {
  const ifHeader = request.headers.get("If") ?? "";
  return ifHeader.includes("<DAV:no-lock>") && !ifHeader.includes("Not <DAV:no-lock>");
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  let mismatch = 0;
  for (let index = 0; index < left.byteLength; index++) {
    mismatch |= left[index] ^ right[index];
  }
  return mismatch === 0;
}

function getConditionalHeaders(source: Headers): Headers {
  const headers = new Headers();
  for (const name of [
    "if-match",
    "if-none-match",
    "if-modified-since",
    "if-unmodified-since",
    "if-range",
  ]) {
    const value = source.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }
  return headers;
}

function extractLockOwner(body: string): string | undefined {
  const owner = body.match(
    /<(?:[A-Za-z_][\w.-]*:)?owner(?:\s[^>]*)?>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?owner>/i,
  )?.[1];
  if (owner === undefined) {
    return undefined;
  }
  const trimmed = owner.trim();
  return trimmed === "" ? undefined : trimmed;
}

function fromR2Object(object: R2Object | DavObject | null | undefined): DavProperties {
  if (object === null || object === undefined) {
    return {
      creationdate: new Date().toUTCString(),
      displayname: undefined,
      getcontentlanguage: undefined,
      getcontentlength: "0",
      getcontenttype: "application/x-directory",
      getetag: undefined,
      getlastmodified: new Date().toUTCString(),
      resourcetype: "<collection />",
      supportedlock: getSupportedLock(),
      lockdiscovery: "",
      "fd:thumbnail": undefined,
    };
  }

  const isCollection = isCollectionObject(object);
  const lockDetails = getLockDetails(object.customMetadata);
  return {
    creationdate: object.uploaded.toUTCString(),
    displayname: object.httpMetadata?.contentDisposition,
    getcontentlanguage: object.httpMetadata?.contentLanguage,
    getcontentlength: object.size.toString(),
    getcontenttype: isCollection
      ? "application/x-directory"
      : object.httpMetadata?.contentType,
    getetag: object.etag,
    getlastmodified: object.uploaded.toUTCString(),
    resourcetype: isCollection ? "<collection />" : "",
    supportedlock: getSupportedLock(),
    lockdiscovery:
      lockDetails.length === 0
        ? ""
        : getLockDiscovery(
            lockDetails.map((lockDetail) => ({
              ...lockDetail,
              root: getResourceHref(object.key, isCollection),
            })),
          ),
    "fd:thumbnail": object.customMetadata?.thumbnail,
  };
}

function getLivePropertyValue(
  object: R2Object | DavObject | null,
  property: DeadProperty,
): string | undefined {
  if (property.namespaceURI === DAV_NAMESPACE) {
    return fromR2Object(object)[property.localName as keyof DavProperties];
  }
  if (
    property.namespaceURI === FLAREDRIVE_NAMESPACE &&
    property.localName === "thumbnail"
  ) {
    return object?.customMetadata?.thumbnail;
  }
  return undefined;
}

function renderPropstat(status: string, properties: string[]): string {
  if (properties.length === 0) {
    return "";
  }
  return `
    <propstat>
      <prop>
        ${properties.join("\n        ")}
      </prop>
      <status>${status}</status>
    </propstat>`;
}

async function* listAll(
  bucket: R2Bucket,
  prefix?: string,
  isRecursive: boolean = false,
): AsyncGenerator<DavObject> {
  const seen = new Set<string>();
  let cursor: string | undefined = undefined;
  do {
    // The `include` option is intentionally typed loosely here because some
    // @cloudflare/workers-types versions lag behind the Workers runtime.
    const r2Objects: R2Objects = await (bucket as any).list({
      prefix,
      delimiter: isRecursive ? undefined : "/",
      cursor,
      include: ["httpMetadata", "customMetadata"],
    });

    const entries = new Map<string, DavObject>();

    for (const object of r2Objects.objects) {
      if (object.key.startsWith(INTERNAL_PREFIX)) {
        continue;
      }
      entries.set(object.key, {
        ...object,
        isCollection: isCollectionObject(object),
      });
    }

    if (isRecursive) {
      const effectivePrefix = prefix ?? "";
      for (const key of [...entries.keys()]) {
        if (!key || !key.startsWith(effectivePrefix)) {
          continue;
        }
        const relativePath = key.slice(effectivePrefix.length);
        const parts = relativePath.split("/");
        for (let index = 1; index < parts.length; index++) {
          const ancestor = effectivePrefix + parts.slice(0, index).join("/");
          const existing = entries.get(ancestor);
          if (existing) {
            existing.isCollection = true;
          } else {
            entries.set(ancestor, {
              key: ancestor,
              isCollection: true,
              uploaded: new Date(),
              size: 0,
              etag: "",
              httpMetadata: { contentType: "application/x-directory" },
            });
          }
        }
      }
    } else {
      for (const directory of r2Objects.delimitedPrefixes) {
        if (directory.startsWith(INTERNAL_PREFIX)) {
          continue;
        }
        const key = directory.endsWith("/") ? directory.slice(0, -1) : directory;
        const existing = entries.get(key);
        if (existing) {
          existing.isCollection = true;
        } else {
          entries.set(key, {
            key,
            isCollection: true,
            uploaded: new Date(),
            size: 0,
            etag: "",
            httpMetadata: { contentType: "application/x-directory" },
          });
        }
      }
    }

    for (const entry of entries.values()) {
      if (seen.has(entry.key)) {
        continue;
      }
      seen.add(entry.key);
      yield entry;
    }

    cursor = r2Objects.truncated ? r2Objects.cursor : undefined;
  } while (cursor);
}

async function assertLockPermission(
  request: Request,
  bucket: R2Bucket,
  resourcePath: string,
  options: { ignoreSharedLocksOnTarget?: boolean } = {},
): Promise<Response | null> {
  if (hasAlwaysFalseIfCondition(request)) {
    return new Response("Precondition Failed", { status: 412 });
  }

  const lockTokens = getRequestLockTokens(request);
  const candidates: string[] = [];
  for (
    let current = resourcePath;
    current !== "";
    current = current.split("/").slice(0, -1).join("/")
  ) {
    candidates.push(current);
  }

  for (const candidate of candidates) {
    const object = await bucket.head(candidate);
    const lockDetails = getLockDetails(object?.customMetadata).filter(
      (lockDetail) =>
        (candidate === resourcePath || lockDetail.depth === "infinity") &&
        !(
          options.ignoreSharedLocksOnTarget &&
          candidate === resourcePath &&
          lockDetail.scope === "shared"
        ),
    );
    if (lockDetails.length === 0) {
      continue;
    }
    if (!lockDetails.some((lockDetail) => lockTokens.includes(lockDetail.token))) {
      return new Response("Locked", { status: 423 });
    }
  }

  return null;
}

async function assertRecursiveDeletePermission(
  request: Request,
  bucket: R2Bucket,
  resourcePath: string,
): Promise<Response | null> {
  const lockResponse = await assertLockPermission(request, bucket, resourcePath);
  if (lockResponse !== null) {
    return lockResponse;
  }

  const lockTokens = getRequestLockTokens(request);
  const prefix = resourcePath === "" ? "" : `${resourcePath}/`;
  for await (const descendant of listAll(bucket, prefix, true)) {
    const lockDetails = getLockDetails(descendant.customMetadata);
    if (
      lockDetails.length > 0 &&
      !lockDetails.some((lockDetail) => lockTokens.includes(lockDetail.token))
    ) {
      return new Response("Locked", { status: 423 });
    }
  }

  return null;
}

async function findMatchingLock(
  request: Request,
  bucket: R2Bucket,
  resourcePath: string,
): Promise<{ resource: R2Object; lockDetails: LockDetails } | null> {
  const lockTokens = getRequestLockTokens(request);
  for (
    let current = resourcePath;
    ;
    current = current.split("/").slice(0, -1).join("/")
  ) {
    const resource = await bucket.head(current);
    const lockDetails = getLockDetails(resource?.customMetadata).find(
      (lockDetail) =>
        lockTokens.includes(lockDetail.token) &&
        (current === resourcePath || lockDetail.depth === "infinity"),
    );
    if (resource !== null && lockDetails !== undefined) {
      return { resource, lockDetails };
    }
    if (current === "") {
      break;
    }
  }
  return null;
}

async function deleteAll(
  bucket: R2Bucket,
  prefix?: string,
  excludeInternal: boolean = true,
): Promise<void> {
  let cursor: string | undefined = undefined;
  do {
    const objects = await bucket.list({ prefix, cursor });
    const keys = objects.objects
      .map((object) => object.key)
      .filter((key) => !excludeInternal || !key.startsWith(INTERNAL_PREFIX));
    if (keys.length > 0) {
      await bucket.delete(keys);
    }
    cursor = objects.truncated ? objects.cursor : undefined;
  } while (cursor);
}

function calcContentRange(object: R2ObjectBody) {
  let rangeOffset = 0;
  let rangeEnd = object.size - 1;
  if (object.range) {
    if ("suffix" in object.range) {
      rangeOffset = Math.max(object.size - object.range.suffix, 0);
    } else {
      rangeOffset = object.range.offset ?? 0;
      const length = object.range.length ?? object.size - rangeOffset;
      rangeEnd = Math.min(rangeOffset + length - 1, object.size - 1);
    }
  }
  return { rangeOffset, rangeEnd };
}

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

  const object = await bucket.get(path, {
    onlyIf: getConditionalHeaders(request.headers),
    range: request.headers,
  });
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
  const thumbnail = request.headers.get("fd-thumbnail");
  const preservedMetadata = getPreservedCustomMetadata(existing?.customMetadata);
  if (thumbnail) {
    preservedMetadata.thumbnail = thumbnail;
  }

  const result = await bucket.put(path, body, {
    onlyIf: getConditionalHeaders(request.headers),
    httpMetadata: request.headers,
    customMetadata: preservedMetadata,
  });
  if (!result) {
    return new Response("Preconditions failed", { status: 412 });
  }

  return existing === null
    ? createdResponse(path, false)
    : new Response(null, { status: 204 });
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
    await bucket.delete(path);
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

  const destinationExists = await bucket.head(destination);
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
  const putObject = async (sourceKey: string, targetKey: string) => {
    const source = await bucket.get(sourceKey);
    if (source === null) {
      await bucket.put(targetKey, new Uint8Array(), {
        httpMetadata: { contentType: "application/x-directory" },
        customMetadata: { resourcetype: "<collection />" },
      });
      return;
    }
    await bucket.put(targetKey, source.body, {
      httpMetadata: source.httpMetadata,
      customMetadata: stripLockMetadata(source.customMetadata),
    });
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

  const destinationExists = await bucket.head(destination);
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
      await bucket.put(target, source.body, {
        httpMetadata: source.httpMetadata,
        customMetadata: getPreservedCustomMetadata(source.customMetadata),
      });
    }
    await bucket.delete(object.key);
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
  const thumbnail = request.headers.get("fd-thumbnail");
  const customMetadata = thumbnail ? { thumbnail } : undefined;
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
  let completeBody: { parts: R2UploadedPart[] };
  try {
    completeBody = await request.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  try {
    const object = await multipartUpload.complete(completeBody.parts);
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
  const encoder = new TextEncoder();
  const header = encoder.encode(authorizationHeader);
  const expected = encoder.encode(`Basic ${btoa(`${username}:${password}`)}`);
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
    return Response.redirect(requestUrl.toString(), 307);
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
