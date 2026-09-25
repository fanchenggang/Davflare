#!/usr/bin/env node
// Minimal mock of the Davflare Open API endpoints used by `davflare sites publish`
// (GET/POST /api/sites, POST /api/upload, GET /api/list, DELETE /api/delete). Test-only.
// Like the real server, uploads create folder-marker objects for every parent folder
// (functions/api/upload.ts ensureFolders), so leftover staging folders are observable.
// Test hooks (no auth): GET /__mock/objects → ["key", ...]; POST /__mock/seed?key=a/b&dir=1.
//   MOCK_KEY=secret MOCK_SITES_HOST=sites.mock.test node scripts/mock-davflare-api.mjs
// Prints "listening <port>" on stdout; set PORT to pin the port (default: random).
import http from "node:http";

const KEY = process.env.MOCK_KEY || "fd_mock_key";
const SITES_HOST = process.env.MOCK_SITES_HOST ?? "sites.mock.test";
const objects = new Map(); // key -> { dir: boolean, size: number }

function ensureFolders(folder) {
  let current = "";
  for (const part of folder.split("/").filter(Boolean)) {
    current = current ? `${current}/${part}` : part;
    if (!objects.has(current)) objects.set(current, { dir: true, size: 0 });
  }
}

function send(res, status, body, type = "text/plain") {
  res.writeHead(status, { "Content-Type": type });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  if (url.pathname === "/__mock/objects") return send(res, 200, [...objects.keys()].sort(), "application/json");
  if (url.pathname === "/__mock/seed" && req.method === "POST") {
    const key = (url.searchParams.get("key") || "").replace(/\/+$/, "");
    const dir = url.searchParams.get("dir") === "1";
    const slash = key.lastIndexOf("/");
    if (slash > 0) ensureFolders(key.slice(0, slash));
    objects.set(key, { dir, size: 0 });
    return send(res, 200, "OK");
  }

  if (!url.pathname.startsWith("/api/")) return send(res, 200, "<!doctype html><title>Davflare</title>", "text/html");
  if (req.headers.authorization !== `Bearer ${KEY}`) return send(res, 401, "无效的 API 密钥");

  if (url.pathname === "/api/sites" && req.method === "GET") {
    return send(res, 200, { sitesHost: SITES_HOST || null, sites: [] }, "application/json");
  }
  if (url.pathname === "/api/upload" && req.method === "POST") {
    const folder = url.searchParams.get("path") || "";
    ensureFolders(folder);
    const key = `${folder}${req.headers["x-file-name"] || ""}`;
    objects.set(key, { dir: false, size: body.length });
    return send(res, 200, { key }, "application/json");
  }
  if (url.pathname === "/api/list" && req.method === "GET") {
    const prefix = url.searchParams.get("path") || "";
    const base = prefix.replace(/\/+$/, "");
    const under = [...objects.keys()].filter((k) => k.startsWith(prefix) && k !== base);
    if (base && !objects.has(base) && under.length === 0) return send(res, 404, "目录不存在");
    const children = new Map();
    for (const k of under) {
      const rest = k.slice(prefix.length);
      const name = rest.split("/")[0];
      const isDir = rest.includes("/") || objects.get(k).dir;
      if (!children.has(name)) children.set(name, { key: `${prefix}${name}${isDir ? "/" : ""}`, name, isDir, size: isDir ? 0 : objects.get(k).size, uploaded: "" });
    }
    return send(res, 200, { items: [...children.values()], nextCursor: null }, "application/json");
  }
  if (url.pathname === "/api/sites" && req.method === "POST") {
    const { slug, source } = JSON.parse(body.toString("utf8") || "{}");
    const copied = [...objects.entries()].filter(([k, v]) => k.startsWith(`${source}/`) && !v.dir).length;
    if (!copied) return send(res, 404, "source folder not found");
    return send(res, 200, { slug, source, copied, sitesHost: SITES_HOST || null }, "application/json");
  }
  if (url.pathname === "/api/delete" && req.method === "DELETE") {
    const key = (url.searchParams.get("path") || "").replace(/\/+$/, "");
    const victims = [...objects.keys()].filter((k) => k === key || k.startsWith(`${key}/`));
    if (victims.length === 0) return send(res, 404, "文件不存在");
    for (const k of victims) objects.delete(k);
    return send(res, 200, "OK");
  }
  return send(res, 404, "Not Found");
});

server.listen(Number(process.env.PORT || 0), "127.0.0.1", () => {
  console.log(`listening ${server.address().port}`);
});
