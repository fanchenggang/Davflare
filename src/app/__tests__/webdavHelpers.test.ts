/**
 * webdav 协议工具层直测：davXml（PROPFIND/PROPPATCH 解析、dead 属性存取、
 * 属性渲染、fromR2Object）、davLock（超时/令牌/锁记录/保护属性）、
 * davUtil（路径判定、Destination 解析、Content-Range）。
 */
import {
  DEAD_PROPERTY_PREFIX,
  DAV_NAMESPACE,
  FLAREDRIVE_NAMESPACE,
  fromR2Object,
  getDeadProperties,
  getDeadProperty,
  getDeadPropertyKey,
  getElementProperty,
  getLivePropertyValue,
  parseProppatchRequest,
  parsePropfindRequest,
  parseXmlDocument,
  renderDavProperty,
  renderEmptyPropertyElement,
  renderPropertyElement,
  renderPropstat,
  serializeNodeChildren,
  getChildElements,
} from "../../../functions/webdav/davXml";
import {
  determineLockDepth,
  getLockDetails,
  getLockDiscovery,
  getRequestLockTokens,
  hasAlwaysFalseIfCondition,
  isProtectedProperty,
  normalizeLockDetails,
  normalizeLockToken,
  parseTimeout,
  stripLockMetadata,
  withLockMetadata,
  getSupportedLock,
} from "../../../functions/webdav/davLock";
import {
  calcContentRange,
  decodeResourcePath,
  getResourceHref,
  getParentPath,
  isSameOrDescendantPath,
  parseDestinationPath,
  isCollectionObject,
} from "../../../functions/webdav/davUtil";

function dead(
  namespaceURI: string,
  localName: string,
  valueXml: string,
  prefix: string | null = null
) {
  return { namespaceURI, localName, prefix, valueXml };
}

describe("davXml: 请求解析", () => {
  test("空 body → allprop；propname → propname", () => {
    expect(parsePropfindRequest("")).toEqual({ mode: "allprop" });
    expect(parsePropfindRequest("   ")).toEqual({ mode: "allprop" });
    expect(
      parsePropfindRequest('<?xml version="1.0"?><propfind xmlns="DAV:"><propname/></propfind>')
    ).toEqual({ mode: "propname" });
  });

  test("prop 模式收集属性（带命名空间与值）", () => {
    const parsed = parsePropfindRequest(
      `<?xml version="1.0"?><D:propfind xmlns:D="DAV:"><D:prop><D:getetag/><D:getcontentlength/><Z:author xmlns:Z="urn:z">Alice</Z:author></D:prop></D:propfind>`
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.mode).toBe("prop");
    if (parsed!.mode !== "prop") return;
    expect(parsed!.properties).toHaveLength(3);
    expect(parsed!.properties[0]).toMatchObject({
      namespaceURI: "DAV:",
      localName: "getetag",
      valueXml: "",
    });
    expect(parsed!.properties[2]).toMatchObject({
      namespaceURI: "urn:z",
      localName: "author",
      prefix: "Z",
      valueXml: "Alice",
    });
  });

  test("allprop 显式声明 → allprop；非 propfind 根/坏 XML/无前缀无命名空间 → null", () => {
    expect(
      parsePropfindRequest('<propfind xmlns="DAV:"><allprop/></propfind>')
    ).toEqual({ mode: "allprop" });
    expect(parsePropfindRequest("<other/>")).toBeNull();
    expect(parsePropfindRequest("<not-xml")).toBeNull();
  });

  test("parseProppatchRequest：set/remove 操作；非法输入 → null", () => {
    const parsed = parseProppatchRequest(
      `<?xml version="1.0"?><D:propertyupdate xmlns:D="DAV:" xmlns:Z="urn:z">
        <D:set><D:prop><Z:color>red</Z:color></D:prop></D:set>
        <D:remove><D:prop><Z:color/></D:prop></D:remove>
      </D:propertyupdate>`
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.operations).toHaveLength(2);
    expect(parsed!.operations[0]).toMatchObject({ action: "set" });
    expect(parsed!.operations[0].property.localName).toBe("color");
    expect(parsed!.operations[0].property.valueXml).toBe("red");
    expect(parsed!.operations[1].action).toBe("remove");

    expect(parseProppatchRequest("<other/>")).toBeNull();
    expect(parseProppatchRequest("<not-xml")).toBeNull();
  });
});

describe("davXml: dead 属性存取与渲染", () => {
  const color = dead("urn:z", "color", "red", "Z");

  test("getDeadPropertyKey / getDeadProperty / getDeadProperties roundtrip", () => {
    const key = getDeadPropertyKey("urn:z", "color");
    expect(key.startsWith(DEAD_PROPERTY_PREFIX)).toBe(true);
    const metadata = { [key]: JSON.stringify(color) };
    expect(getDeadProperty(metadata, "urn:z", "color")).toEqual(color);
    expect(getDeadProperty(metadata, "urn:z", "missing")).toBeNull();
    expect(getDeadProperties(metadata)).toEqual([color]);
    expect(getDeadProperties(undefined)).toEqual([]);
    // 损坏的 JSON 被跳过
    expect(getDeadProperties({ [key]: "{oops" })).toEqual([]);
    expect(getDeadProperties({ unrelated: "1" })).toEqual([]);
  });

  test("renderPropertyElement / renderEmptyPropertyElement 带命名空间声明", () => {
    expect(renderPropertyElement(color)).toBe(
      '<Z:color xmlns:Z="urn:z">red</Z:color>'
    );
    expect(renderEmptyPropertyElement({ ...color, valueXml: "" })).toBe(
      '<Z:color xmlns:Z="urn:z" />'
    );
    const noNamespace = dead("", "local", "v");
    expect(renderPropertyElement(noNamespace)).toBe('<local xmlns="">v</local>');
    const defaultNs = dead("urn:plain", "tag", "v");
    expect(renderEmptyPropertyElement({ ...defaultNs, valueXml: "" })).toBe(
      '<tag xmlns="urn:plain" />'
    );
  });

  test("renderDavProperty：RAW 集合不转义，其余转义", () => {
    expect(renderDavProperty("resourcetype", "<collection />")).toBe(
      "<resourcetype><collection /></resourcetype>"
    );
    expect(renderDavProperty("displayname", '<b>&"')).toBe(
      "<displayname>&lt;b&gt;&amp;&quot;</displayname>"
    );
  });

  test("renderPropstat：空列表为空串，属性列表拼 propstat", () => {
    expect(renderPropstat("HTTP/1.1 200 OK", [])).toBe("");
    const xml = renderPropstat("HTTP/1.1 200 OK", ["<a/>", "<b/>"]);
    expect(xml).toContain("<prop>");
    expect(xml).toContain("HTTP/1.1 200 OK");
  });

  test("getElementProperty / serializeNodeChildren / getChildElements", () => {
    const doc = parseXmlDocument(
      '<root xmlns:Z="urn:z"><Z:a>1<b/></Z:a><plain/><text/></root>'
    );
    expect(doc).not.toBeNull();
    const children = getChildElements(doc!.documentElement);
    expect(children).toHaveLength(3);
    const prop = getElementProperty(children[0]);
    expect(prop).toMatchObject({ namespaceURI: "urn:z", localName: "a" });
    expect(serializeNodeChildren(children[0])).toContain("1");
    expect(getElementProperty(children[1])).toMatchObject({ namespaceURI: "" });
    expect(parseXmlDocument("<broken")).toBeNull();
  });
});

describe("davXml: fromR2Object 与 live 属性", () => {
  test("null → 根集合默认属性", () => {
    const props = fromR2Object(null);
    expect(props.resourcetype).toBe("<collection />");
    expect(props.getcontenttype).toBe("application/x-directory");
    expect(props.supportedlock).toBe(getSupportedLock());
  });

  test("文件对象：属性与缩略图；集合标记判定", () => {
    const uploaded = new Date("2026-06-01T00:00:00.000Z");
    const props = fromR2Object({
      key: "a.txt",
      size: 3,
      uploaded,
      etag: '"abc"',
      httpMetadata: { contentType: "text/plain", contentDisposition: "a.txt" },
      customMetadata: { thumbnail: "t1" },
    });
    expect(props).toMatchObject({
      getcontentlength: "3",
      getcontenttype: "text/plain",
      getetag: '"abc"',
      displayname: "a.txt",
      resourcetype: "",
      "fd:thumbnail": "t1",
    });
    expect(props.getlastmodified).toBe(uploaded.toUTCString());
    expect(
      isCollectionObject({ key: "d", size: 0, uploaded: new Date(), etag: "", customMetadata: { resourcetype: "<collection />" } })
    ).toBe(true);
    expect(
      isCollectionObject({ key: "d", size: 0, uploaded: new Date(), etag: "", httpMetadata: { contentType: "application/x-directory" } })
    ).toBe(true);
    expect(
      isCollectionObject({ key: "d", size: 0, uploaded: new Date(), etag: "", isCollection: true })
    ).toBe(true);
    expect(isCollectionObject(null)).toBe(false);
  });

  test("getLivePropertyValue：DAV live 属性 / flaredrive 缩略图 / 未知命名空间", () => {
    const object = {
      key: "a.txt",
      size: 3,
      uploaded: new Date("2026-06-01T00:00:00.000Z"),
      etag: '"abc"',
      customMetadata: { thumbnail: "t1" },
    };
    expect(
      getLivePropertyValue(object, dead(DAV_NAMESPACE, "getcontentlength", ""))
    ).toBe("3");
    expect(
      getLivePropertyValue(object, dead(FLAREDRIVE_NAMESPACE, "thumbnail", ""))
    ).toBe("t1");
    expect(
      getLivePropertyValue(object, dead("urn:unknown", "whatever", ""))
    ).toBeUndefined();
    expect(getLivePropertyValue(null, dead(FLAREDRIVE_NAMESPACE, "thumbnail", ""))).toBeUndefined();
  });
});

describe("davLock", () => {
  test("parseTimeout：缺省 / Infinite / Second-N / 非法", () => {
    const none = parseTimeout(null);
    expect(none.timeout).toBe("Second-3600");

    const infinite = parseTimeout("Infinite");
    expect(infinite.timeout).toBe("Infinite");

    const fixed = parseTimeout("Second-1200");
    expect(fixed.timeout).toBe("Second-1200");
    expect(fixed.expiresAt).toBeGreaterThan(Date.now());

    const clamped = parseTimeout("Second-99999999999");
    expect(clamped.timeout).not.toBe("Second-99999999999");

    const fallback = parseTimeout("garbage");
    expect(fallback.timeout).toBe("Second-3600");
  });

  test("normalizeLockToken 去包裹与 scheme；getRequestLockTokens 汇总 If/Lock-Token", () => {
    expect(normalizeLockToken("<urn:uuid:abc>")).toBe("abc");
    expect(normalizeLockToken("opaquelocktoken:xyz")).toBe("xyz");
    expect(normalizeLockToken("  plain  ")).toBe("plain");

    const request = new Request("http://x.test/", {
      headers: {
        "Lock-Token": "<urn:uuid:direct>",
        If: "(<urn:uuid:if1>) (<urn:uuid:direct>)",
      },
    });
    expect(getRequestLockTokens(request)).toEqual(["direct", "if1"]);
    expect(getRequestLockTokens(new Request("http://x.test/"))).toEqual([]);
  });

  test("getLockDetails：records 优先，legacy 字段回退，过期剔除", () => {
    const now = Date.now();
    const records = [
      { token: "t1", expiresAt: now + 60_000, depth: "infinity", scope: "shared" },
      { token: "t2", expiresAt: now - 60_000 },
      { token: 42 },
      "garbage",
    ];
    const fromRecords = getLockDetails({ lock_records: JSON.stringify(records) });
    expect(fromRecords.map((lock) => lock.token)).toEqual(["t1"]);
    expect(fromRecords[0]).toMatchObject({ depth: "infinity", scope: "shared" });

    const legacy = getLockDetails({
      lock_token: "legacy",
      lock_owner: "alice",
      lock_depth: "0",
      lock_timeout: "Second-600",
      lock_expires_at: String(now + 60_000),
      lock_root: "/a",
    });
    expect(legacy).toHaveLength(1);
    expect(legacy[0]).toMatchObject({
      token: "legacy",
      owner: "alice",
      depth: "0",
      root: "/a",
    });

    expect(getLockDetails(undefined)).toEqual([]);
    expect(getLockDetails({ lock_records: "{oops" })).toEqual([]);
  });

  test("normalizeLockDetails：无效/过期 → null；缺省补齐", () => {
    expect(normalizeLockDetails({ token: "t", expiresAt: Date.now() - 1 })).toBeNull();
    expect(normalizeLockDetails({ token: "t", expiresAt: Number.NaN })).not.toBeNull();
    const filled = normalizeLockDetails({ token: "t", expiresAt: Date.now() + 60_000 });
    expect(filled).toMatchObject({
      scope: "exclusive",
      depth: "0",
      root: "/",
    });
  });

  test("withLockMetadata / stripLockMetadata 往返", () => {
    const lock = normalizeLockDetails({ token: "t", expiresAt: Date.now() + 60_000 })!;
    const metadata = withLockMetadata({ keep: "1", lock_token: "old" }, [lock]);
    expect(metadata.keep).toBe("1");
    expect(metadata.lock_token).toBeUndefined();
    expect(JSON.parse(metadata.lock_records)).toHaveLength(1);

    const stripped = stripLockMetadata(metadata);
    expect(stripped.keep).toBe("1");
    expect(stripped.lock_records).toBeUndefined();
    expect(stripLockMetadata(undefined)).toEqual({});
    expect(withLockMetadata(undefined, [])).toEqual({});
  });

  test("getLockDiscovery 渲染 activelock；isProtectedProperty/determineLockDepth", () => {
    const lock = {
      token: "t1",
      owner: "alice",
      scope: "exclusive" as const,
      depth: "0" as const,
      timeout: "Second-600",
      expiresAt: Date.now() + 60_000,
      root: "/webdav/a",
    };
    const xml = getLockDiscovery([lock]);
    expect(xml).toContain("<activelock>");
    expect(xml).toContain("urn:uuid:t1");
    expect(xml).toContain("alice");
    expect(getLockDiscovery(lock)).toBe(xml);

    expect(isProtectedProperty("lock_token")).toBe(true);
    expect(isProtectedProperty("supportedlock")).toBe(true);
    expect(isProtectedProperty(dead("urn:z", "lockdiscovery", ""))).toBe(true);
    expect(isProtectedProperty(dead("urn:z", "color", ""))).toBe(false);
    expect(isProtectedProperty("displayname")).toBe(false);

    expect(determineLockDepth("<collection />", null)).toBe("infinity");
    expect(determineLockDepth(undefined, "0")).toBe("0");
    expect(determineLockDepth(undefined, "infinity")).toBe("infinity");
  });

  test("hasAlwaysFalseIfCondition 识别 DAV:no-lock", () => {
    expect(
      hasAlwaysFalseIfCondition(
        new Request("http://x.test/", { headers: { If: "<DAV:no-lock>" } })
      )
    ).toBe(true);
    expect(
      hasAlwaysFalseIfCondition(
        new Request("http://x.test/", { headers: { If: "Not <DAV:no-lock>" } })
      )
    ).toBe(false);
    expect(hasAlwaysFalseIfCondition(new Request("http://x.test/"))).toBe(false);
  });
});

describe("davUtil: 路径与 Range", () => {
  test("getResourceHref / decodeResourcePath / getParentPath", () => {
    expect(getResourceHref("", true)).toBe("/webdav/");
    expect(getResourceHref("a/b.txt", false)).toBe("/webdav/a/b.txt");
    expect(getResourceHref("a/dir", true)).toBe("/webdav/a/dir/");
    // 输入是已剥去 /webdav 前缀的 pathname（首段不特殊处理）
    expect(decodeResourcePath("/a%20b/c/")).toBe("a b/c");
    expect(decodeResourcePath("/")).toBe("");
    expect(getParentPath("a/b/c")).toBe("a/b");
    // 先剥尾斜杠再取父级
    expect(getParentPath("a")).toBe("");
  });

  test("parseDestinationPath：同源截取、跨源/非 webdav → null", () => {
    const base = "http://drive.example.com/webdav/src/";
    expect(
      parseDestinationPath("http://drive.example.com/webdav/a%20b/dst", base)
    ).toBe("a b/dst");
    expect(
      parseDestinationPath("/webdav/relative", base)
    ).toBe("relative");
    expect(
      parseDestinationPath("http://evil.example.com/webdav/x", base)
    ).toBeNull();
    expect(
      parseDestinationPath("http://drive.example.com/other/x", base)
    ).toBeNull();
    // 相对引用会先按 base 解析再校验前缀
    expect(parseDestinationPath(":::bad", base)).toBe("src/:::bad");
  });

  test("isSameOrDescendantPath", () => {
    expect(isSameOrDescendantPath("a", "a")).toBe(true);
    expect(isSameOrDescendantPath("a", "a/b")).toBe(true);
    expect(isSameOrDescendantPath("", "anything")).toBe(true);
    expect(isSameOrDescendantPath("a/b", "a")).toBe(false);
    // 前缀语义按字符串判断：ab/ 前缀即视为后代
    expect(isSameOrDescendantPath("ab", "ab/c")).toBe(true);
  });

  test("calcContentRange：无 range / offset+length / suffix", () => {
    const base = { size: 10 } as R2ObjectBody;
    expect(calcContentRange(base)).toEqual({ rangeOffset: 0, rangeEnd: 9 });
    expect(
      calcContentRange({ ...base, range: { offset: 2, length: 3 } } as R2ObjectBody)
    ).toEqual({ rangeOffset: 2, rangeEnd: 4 });
    expect(
      calcContentRange({ ...base, range: { offset: 8 } } as R2ObjectBody)
    ).toEqual({ rangeOffset: 8, rangeEnd: 9 });
    expect(
      calcContentRange({ ...base, range: { suffix: 3 } } as unknown as R2ObjectBody)
    ).toEqual({ rangeOffset: 7, rangeEnd: 9 });
  });
});
