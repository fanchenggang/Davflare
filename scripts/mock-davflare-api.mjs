#!/usr/bin/env node
// Minimal mock of the Davflare Open API endpoints used by `davflare sites publish`
// (GET/POST /api/sites, POST /api/upload, DELETE /api/delete). Test-only.
//   MOCK_KEY=secret MOCK_SITES_HOST=sites.mock.test node scripts/mock-davflare-api.mjs
// Prints "listening <port>" on stdout; set PORT to pin the port (default: random).
import http from "node:http";

const KEY = process.env.MOCK_KEY || "fd_mock_key";
const SITES_HOST = process.env.MOCK_SITES_HOST ?? "sites.mock.test";
const staged = new Map(); // key -> bytes

function send(res, status, body, type = "text/plain") {
  res.writeHead(status, { "Content-Type": type });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  if (!url.pathname.startsWith("/api/")) return send(res, 200, "<!doctype html><title>Davflare</title>", "text/html");
  if (req.headers.authorization !== `Bearer ${KEY}`) return send(res, 401, "无效的 API 密钥");

  if (url.pathname === "/api/sites" && req.method === "GET") {
    return send(res, 200, { sitesHost: SITES_HOST || null, sites: [] }, "application/json");
  }
  if (url.pathname === "/api/upload" && req.method === "POST") {
    const key = `${url.searchParams.get("path") || ""}${req.headers["x-file-name"] || ""}`;
    staged.set(key, body.length);
    return send(res, 200, { key }, "application/json");
  }
  if (url.pathname === "/api/sites" && req.method === "POST") {
    const { slug, source } = JSON.parse(body.toString("utf8") || "{}");
    const copied = [...staged.keys()].filter((k) => k.startsWith(`${source}/`)).length;
    if (!copied) return send(res, 404, "source folder not found");
    return send(res, 200, { slug, source, copied, sitesHost: SITES_HOST || null }, "application/json");
  }
  if (url.pathname === "/api/delete" && req.method === "DELETE") {
    const prefix = url.searchParams.get("path") || "";
    for (const k of [...staged.keys()]) if (k.startsWith(prefix)) staged.delete(k);
    return send(res, 200, "OK");
  }
  return send(res, 404, "Not Found");
});

server.listen(Number(process.env.PORT || 0), "127.0.0.1", () => {
  console.log(`listening ${server.address().port}`);
});
