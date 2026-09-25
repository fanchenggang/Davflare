// DAV 属性（live/dead）渲染与 PROPFIND/PROPPATCH 请求解析。
import { DOMParser } from "@xmldom/xmldom";
import type { DavObject, DavProperties, DeadProperty, ProppatchOperation, PropfindRequest } from "./davTypes";
import {
  escapeXml,
  getResourceHref,
  isCollectionObject,
} from "./davUtil";
import { getLockDetails, getLockDiscovery, getSupportedLock } from "./davLock";

const RAW_XML_DAV_PROPERTIES = new Set([
  "resourcetype",
  "supportedlock",
  "lockdiscovery",
]);
const DAV_NAMESPACE = "DAV:";
const FLAREDRIVE_NAMESPACE = "flaredrive";
const DEAD_PROPERTY_PREFIX = "dead_property:";

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
      : object.httpMetadata?.contentType || "application/octet-stream",
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

export {
  RAW_XML_DAV_PROPERTIES,
  DAV_NAMESPACE,
  FLAREDRIVE_NAMESPACE,
  DEAD_PROPERTY_PREFIX,
  renderDavProperty,
  serializeNodeChildren,
  getDeadPropertyKey,
  getDeadProperty,
  getDeadProperties,
  renderPropertyElement,
  renderEmptyPropertyElement,
  getElementProperty,
  parseXmlDocument,
  getChildElements,
  parsePropfindRequest,
  parseProppatchRequest,
  fromR2Object,
  getLivePropertyValue,
  renderPropstat,
};
