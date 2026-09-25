// WebDAV 锁（LOCK/UNLOCK/If 头）与锁元数据读写。
import { escapeXml, listAll } from "./davUtil";
import type { DeadProperty, LockDetails } from "./davTypes";

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

const LOCK_RECORDS_METADATA_KEY = "lock_records";

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

export {
  DEFAULT_LOCK_TIMEOUT,
  MAX_LOCK_TIMEOUT,
  VALID_LOCK_DEPTHS,
  LOCK_METADATA_KEYS,
  LOCK_RECORDS_METADATA_KEY,
  getSupportedLock,
  determineLockDepth,
  normalizeLockToken,
  normalizeLockDetails,
  getLockDetails,
  getLockDiscovery,
  stripLockMetadata,
  withLockMetadata,
  getPreservedCustomMetadata,
  isProtectedProperty,
  parseTimeout,
  getRequestLockTokens,
  hasAlwaysFalseIfCondition,
  extractLockOwner,
  assertLockPermission,
  assertRecursiveDeletePermission,
  findMatchingLock,
};
