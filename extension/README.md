# Davflare Chrome extension

[English](README.md) | [中文](README.zh-CN.md)

← [README](../README.md)

A Chrome Manifest V3 helper with two toolbar modes — open **your** Davflare drive, or a full bookmark library backed by your instance’s WebDAV. It is not on the Chrome Web Store.

- **Settings live in the main page** — there is no standalone options page. The first launch of the extension page opens the settings view directly: paste your instance URL (Pages / custom domain, starts empty — no built-in site), bookmark directory, and WebDAV credentials; after saving and granting access you land in the drive/bookmarks view (HamHome-style: configure first, then use). The sidebar "Settings" view is always available for changes.
- **Toolbar modes:** both click-actions open the extension's own page — *drive* (default) **mounts the same React components as the web UI** to render the file manager natively (no iframe involved, so the instance's `X-Frame-Options: DENY` no longer matters), *bookmarks* opens the bookmark library view. Pick the default in Settings; right-click the toolbar icon to switch anytime. With no instance configured, a toolbar click opens the settings view directly. The first visit to the drive view asks for host permission on the instance origin (the `/api/*` endpoints send no CORS headers, so search/trash/etc. need the grant; `/webdav` is CORS-open already); an "Open in new tab" button stays as a fallback.
- **Save this page** appears in the page context menu — it merges the current tab’s title + URL into your WebDAV bookmark file.
- WebDAV credentials (same values as your deployment’s `WEBDAV_USERNAME` / `WEBDAV_PASSWORD`) are stored **only** in `chrome.storage.local`; they never sync to a Google account. Saving an instance URL asks for per-site host permission (optional permissions — nothing is pre-granted).
- **Does not change Chrome's new tab.** An older release shipped a second zip with a new-tab override; because Chrome's `chrome_url_overrides` can only be declared statically in the manifest (it takes over permanently once loaded, with no runtime toggle), that variant has been removed — a single package ships now.

One zip on the GitHub Release: `davflare-extension.zip` (toolbar + in-shell settings + bookmark library + drive view).

**Load unpacked:** Chrome → `chrome://extensions` → Developer mode → Load unpacked → select the `extension/` folder in this repo. Note: the drive view is a vite build product — run `npm ci && npm run build:extension` once before loading the source folder (without it, bookmarks and everything else work while the drive view shows a build hint; the release zip already contains the bundle).

**Release zip:** download from [GitHub Releases](https://github.com/fanchenggang/Davflare/releases), unzip, then load unpacked. A tag (`v*` / `extension-*`) or **Actions → Release extension** attaches the zip.

## Bookmarks

The extension’s bookmark library keeps your bookmarks **on your own WebDAV** — no third-party service, no AI. Requires the WebDAV feature switch to be on for your instance.

- **Storage layout** (under your instance’s `/webdav/`, directory configurable in the in-shell Settings view — default `bookmarks/`; e.g. set `qa/bookmarks` to isolate test data): `bookmarks.html` is the authoritative Netscape bookmark file that Chrome/Edge can import directly; `bookmarks.json` is a sidecar carrying tags and notes that the HTML format cannot hold; `workspaces.json`, `tabGroups.json`, and `snapshots.json` hold the features below. Writes go through with `If-Match` (a 412 conflict is surfaced, never silently overwritten).
- **Library page:** sidebar with folder/tag counts, keyword search over title/URL/tags/notes with **pinyin support** (full spelling and initials, thanks to a bundled compact dictionary), time-range filter, grid/list views, light/dark theme, import from Chrome bookmarks (optional `bookmarks` permission, merge by URL) and export to `bookmarks.html`.
- **HamHome migration (read-only):** the library page imports from a [HamHome](https://github.com/bingoYB/ham_home) sync directory on the same instance — reads `/HamHomeSync/bookmarks/meta.json` + `categories.json` and merges by URL. Descriptions become notes, tags and category folders survive, deleted rows are skipped. Boundary: our own writes stay in our format; HamHome snapshots/workspaces/tab rules (stored in its IndexedDB or app-internal JSON) are not migrated.
- **Workspaces:** save the current window — page order, pinned state, native tab-group metadata — and restore all or selected pages into a new window (duplicate URLs skipped, pinned/group state restored).
- **Tab groups:** local rule engine (domain suffix / URL / title / regex, AND-combined) that groups the current window into native tab groups with custom title/color/collapse/priority; unmatched tabs can fall back to root-domain grouping. Rules sync via `tabGroups.json`.
- **Snapshots:** capture the current page as a single self-contained HTML file (images best-effort inlined where CORS allows; scripts/iframes stripped; 8 MB cap) onto `bookmarks/snapshots/`. View, download, update, or delete from the bookmark editor. Cross-origin assets without CORS headers cannot be inlined (browser security), and restricted pages such as `chrome://` cannot be captured.
- **Errors never fail silently:** a disabled WebDAV switch (404), missing server credentials (403), wrong credentials (401), and edit conflicts (412) each get a distinct message with a shortcut to Options.

Format mapping, HamHome import/export, and conflict rules: [docs/bookmarks-portability.md](../docs/bookmarks-portability.md).

