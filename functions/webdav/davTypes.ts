// WebDAV 共享类型（无运行时代码）：协议环境、DAV 属性、锁、死属性与 PROPFIND 请求。
export interface WebDavEnv {
  WEBDAV_USERNAME: string;
  WEBDAV_PASSWORD: string;
  WEBDAV_PUBLIC_READ?: string;
  BUCKET: R2Bucket;
  [binding: string]: any;
}

type PagesContext = EventContext<WebDavEnv, string, any>;

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

export type {
  PagesContext,
  DavProperties,
  LockDetails,
  DeadProperty,
  PropfindRequest,
  ProppatchOperation,
  DavObject,
};
