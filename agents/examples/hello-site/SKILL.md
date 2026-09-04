---
name: hello-site
description: Reproduce a Davflare static site with existing MCP tools only (publish_site / image_upload). Use when onboarding or demoing “chat → site”.
---

# Hello site (reproducible)

Goal: from Cursor chat, publish this folder so
`https://sites.<your-domain>/hello/` serves a real page.
No new APIs — only tools already on `/mcp`.

## Prerequisites

1. Davflare deployed; `#/settings` leaves **API Key**, **MCP**, **Sites** (and **Image host** if you want a hero image) on.
2. Pages env `SITES_HOST` = your sites hostname only (e.g. `sites.example.com`), then redeploy.
3. Cursor `mcp.json` points at `https://<drive-host>/mcp` with a Bearer API key (see README).

## Steps (copy into the agent)

1. Read `agents/examples/hello-site/index.html` from this repo (or paste its contents).
2. Upload it into a drive folder, e.g. `examples/hello-site/index.html` (`mkdir` + `upload`, encoding `utf8`).
3. Call **`publish_site`** with `slug: "hello"` and `source: "examples/hello-site"`.
4. Open `https://<SITES_HOST>/hello/` — you should see the hello page.
5. Optional: call **`image_upload`** with a small PNG (base64), then edit the HTML to use the returned Markdown / URL and `publish_site` again.

## Do not

- Do not invent new MCP tools.
- Do not put raw API keys in files under `agents/` (`${env:...}` only).
- Do not publish to a slug you do not own on a shared demo.

## Done when

`https://<SITES_HOST>/hello/` returns **200** with the hello markup.
