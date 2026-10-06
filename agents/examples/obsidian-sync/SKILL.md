---
name: obsidian-sync
description: Set up and verify free Obsidian sync (Remotely Save plugin → Davflare WebDAV). Use when a user asks to sync an Obsidian vault to their Davflare drive.
---

# Obsidian sync (reproducible)

Goal: an Obsidian vault on two devices syncs through `https://<drive-host>/webdav/`
with the **Remotely Save** community plugin. No new APIs — only the existing WebDAV endpoint.

## Prerequisites

1. Davflare deployed; `#/settings` keeps **WebDAV** on (default).
2. Pages env has `WEBDAV_USERNAME` / `WEBDAV_PASSWORD`. In a shell, export them as
   `DAV_USER` / `DAV_PASS` and the drive origin as `DRIVE` (never write them into files).

## Steps

### 1. Verify the server the way the plugin does (agent, shell)

Remotely Save sends `Cache-Control: no-cache` on every request, lists folders with
`PROPFIND Depth: 1`, uploads with `PUT`, and its "Check Connectivity" button runs
MKCOL → PUT → PUT → GET → DELETE → DELETE:

```bash
V="$DRIVE/webdav/rs-check-$(date +%s)"
H=(-u "$DAV_USER:$DAV_PASS" -H 'Cache-Control: no-cache')
curl -s -o /dev/null -w 'OPTIONS %{http_code}\n' -X OPTIONS -H 'Origin: app://obsidian.md' \
  -H 'Access-Control-Request-Method: PROPFIND' -H 'Access-Control-Request-Headers: authorization,cache-control,depth' "$DRIVE/webdav/"
curl -s -o /dev/null -w 'MKCOL %{http_code}\n'  "${H[@]}" -X MKCOL "$V/"
curl -s -o /dev/null -w 'PUT %{http_code}\n'    "${H[@]}" -T /dev/null "$V/%E6%B5%8B%E8%AF%95%20note.md"
curl -s -o /dev/null -w 'PROPFIND %{http_code}\n' "${H[@]}" -X PROPFIND -H 'Depth: 1' "$V/"
curl -s -o /dev/null -w 'DELETE %{http_code}\n' "${H[@]}" -X DELETE "$V/"
```

Expect `OPTIONS 200` (with `cache-control` in `Access-Control-Allow-Headers`), `MKCOL 201`,
`PUT 201`, `PROPFIND 207`, `DELETE 204`.

### 2. Configure Obsidian (user, on each device)

1. Drive → **WebDAV** → **Obsidian sync** card: copy the server address (`https://<drive-host>/webdav/`) and username.
2. Obsidian → Settings → Community plugins: in a new vault turn off Restricted mode first (otherwise
   there is no "Browse" button), then install and enable **Remotely Save**.
3. Choose A Remote Service **Webdav**; Server Address / Username / Password (`WEBDAV_PASSWORD`);
   Auth Type **basic**; Depth **only supports depth='1'** (default); Remote Base Directory empty
   (= vault name) or the same single-level name on every device — click "Confirm" after editing it.
4. "Check Connectivity" → "Check", then sync from the ribbon icon. On the first sync the plugin shows
   "HUGE updates on the sync algorithm": tick both boxes and click "Agree" ("Disagree" uninstalls it).
5. Second device: start from an empty vault with the same name, configure as above, then sync.

## Do not

- Do not print, paste or commit `WEBDAV_PASSWORD`; the in-app card never shows it either.
- Do not set a nested Remote Base Directory (the plugin rejects `/`).
- Do not push files ≥ 100MB through WebDAV (413); use the web chunked uploader.

## Done when

A note created on device A appears on device B after both sync, and a second sync on
either device reports nothing to do.
