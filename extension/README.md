# Davflare Chrome extension

[English](README.md) | [中文](README.zh-CN.md)

← [README](../README.md)

A Chrome Manifest V3 helper with two toolbar modes — open **your** Davflare drive, or a full bookmark library backed by your instance’s WebDAV. It is not on the Chrome Web Store.

- **Settings live in the main page** — there is no standalone options page. The first launch of the extension page opens the settings view directly: paste your instance URL (Pages / custom domain, starts empty — no built-in site), bookmark directory, and WebDAV credentials; after saving and granting access you land in the drive/bookmarks view (HamHome-style: configure first, then use). The sidebar "Settings" view is always available for changes.
- **Toolbar modes:** both click-actions open the extension's own page — *drive* (default) **mounts the same React components as the web UI** to render the file manager natively (no iframe involved, so the instance's `X-Frame-Options: DENY` no longer matters), *bookmarks* opens the bookmark library view. Pick the default in Settings; right-click the toolbar icon to switch anytime. With no instance configured, a toolbar click opens the settings view directly. The first visit to the drive view asks for host permission on the instance origin (the `/api/*` endpoints send no CORS headers, so search/trash/etc. need the grant; `/webdav` is CORS-open already); an "Open in new tab" button stays as a fallback.
- **Save this page** appears in the page context menu — it merges the current tab’s title + URL into your WebDAV bookmark file. A **Save link** item does the same for any link (title from the link text), and `Alt+Shift+S` opens the save popup from any page (both shortcuts configurable at chrome://extensions/shortcuts).
- WebDAV credentials (same values as your deployment’s `WEBDAV_USERNAME` / `WEBDAV_PASSWORD`) are stored **only** in `chrome.storage.local`; they never sync to a Google account. Saving an instance URL asks for per-site host permission (optional permissions — nothing is pre-granted).
- **Does not change Chrome's new tab.** An older release shipped a second zip with a new-tab override; because Chrome's `chrome_url_overrides` can only be declared statically in the manifest (it takes over permanently once loaded, with no runtime toggle), that variant has been removed — a single package ships now.

One zip on the GitHub Release: `davflare-extension.zip` (toolbar + in-shell settings + bookmark library + drive view).

**Load unpacked:** Chrome → `chrome://extensions` → Developer mode → Load unpacked → select the `extension/` folder in this repo. Note: the drive view is a vite build product — run `npm ci && npm run build:extension` once before loading the source folder (without it, bookmarks and everything else work while the drive view shows a build hint; the release zip already contains the bundle).

**Release zip:** download from [GitHub Releases](https://github.com/fanchenggang/Davflare/releases), unzip, then load unpacked. A tag (`v*` / `extension-*`) or **Actions → Release extension** attaches the zip.

## Library screenshots (round 3 redesign)

Round 3 of the library: ham_home-style compact masonry cards, a folder tree sidebar, and Trash / Duplicates views — sharing design tokens with the save popup.

![Library light](screenshots/library-light.png)

![Library dark](screenshots/library-dark.png)

## Bookmarks

The extension’s bookmark library keeps your bookmarks **on your own WebDAV** — no third-party service, no AI. Requires the WebDAV feature switch to be on for your instance.

- **Storage layout** (under your instance’s `/webdav/`, directory configurable in the in-shell Settings view — default `bookmarks/`; e.g. set `qa/bookmarks` to isolate test data): `bookmarks.html` is the authoritative Netscape bookmark file that Chrome/Edge can import directly; `bookmarks.json` is a sidecar carrying tags, notes, and trash marks that the HTML format cannot hold; `workspaces.json`, `tabGroups.json`, and `snapshots.json` hold the features below. Writes go through with `If-Match` (a 412 conflict is surfaced, never silently overwritten). Writing back to browser bookmarks also prompts on same-URL overlaps (skip / update titles / cancel) — never silent overwrite.
- **Library page:** sidebar folder **tree** (expand/collapse by `/` levels; parent filters include subfolders) and tag-cloud counts; keyword search over title/URL/tags/notes with **pinyin support** (full spelling and initials, thanks to a bundled compact dictionary); time-range filter; **masonry** grid/list views; relative card timestamps (just now / Nm ago / yesterday); light/dark theme with a circular reveal on switch (falls back to an instant swap under `prefers-reduced-motion`); import from Chrome bookmarks (optional `bookmarks` permission, merge by URL) and export to `bookmarks.html`. Import / write-back call `permissions.request` inside the user-gesture (confirm pre-prompt first). If Chrome never shows the system dialog (known limitation on some unpacked Chromium builds), grant Bookmarks under `chrome://extensions` → Davflare → Details and retry. Round 4 polish: the topbar stays **sticky** with a frosted blur, rows lift on hover like cards, empty states draw **per-scene art** (library / search / trash / duplicates), and Settings shows the configured keyboard shortcuts.
- **Trash (soft delete):** deletes land in a trash view first (`deletedAt` marks live only in the JSON sidecar, the authoritative HTML stays clean); entries auto-purge after 30 days on load. The trash view restores, deletes forever, or empties; re-saving a trashed URL revives it. The 6-second undo toast stays, but data safety no longer depends on it.
- **Duplicate detection:** duplicates are grouped by URL (tracking params stripped); keep a chosen copy per group (default: oldest) or "keep oldest everywhere" in one click. Losers go to the trash, so the cleanup stays reversible.
- **In-page save panel (edge panel):** a floating handle on the screen edge opens a small save dialog right on the web page — title, URL, folder, tags, note — routed through the same WebDAV pipeline as the popup (trash revives prefill the original entry, like the popup). Enable it **per site** from the popup: only that origin is granted as an optional host permission, the panel is injected as a *dynamic* content script, and disabling revokes the grant and unregisters it. `Alt+Shift+P` toggles the panel on an enabled site; the handle docks left or right (remembered per device); dark follows the system preference; Escape closes. Nothing is injected on sites you never enabled.
- **HamHome migration (read-only):** the library page imports from a [HamHome](https://github.com/bingoYB/ham_home) sync directory on the same instance — reads `/HamHomeSync/bookmarks/meta.json` + `categories.json` and merges by URL. Descriptions become notes, tags and category folders survive, deleted rows are skipped. Boundary: our own writes stay in our format; HamHome snapshots/workspaces/tab rules (stored in its IndexedDB or app-internal JSON) are not migrated.
- **Workspaces:** save the current window — page order, pinned state, native tab-group metadata — and restore all or selected pages into a new window (duplicate URLs skipped, pinned/group state restored).
- **Tab groups:** local rule engine (domain suffix / URL / title / regex, AND-combined) that groups the current window into native tab groups with custom title/color/collapse/priority; unmatched tabs can fall back to root-domain grouping. Rules sync via `tabGroups.json`.
- **Snapshots:** capture the current page as a single self-contained HTML file (images best-effort inlined where CORS allows; scripts/iframes stripped; 8 MB cap) onto `bookmarks/snapshots/`. View, download, update, or delete from the bookmark editor. Cross-origin assets without CORS headers cannot be inlined (browser security), and restricted pages such as `chrome://` cannot be captured. Capturing a normal `http(s)` page requests that origin’s **host permission** on the Capture click (`optional_host_permissions`). Failures distinguish page load/inject vs WebDAV write. A missing `snapshots.json` (GET 404) is treated as an empty index and created on first successful capture.
- **Sidebar favorites:** pin folders, tags, or the Pinned view at the top of the sidebar (★ to add/remove; stored in `chrome.storage.sync`, not on WebDAV).
- **Omnibox:** type `df` + space in the address bar to search the cached library; on miss (or “Search library”) opens the library with `?q=` applied.
- **Storage visibility:** Settings shows estimated sizes for bookmarks HTML/JSON, workspaces, tab rules, and snapshots under `/webdav/<bookmark dir>/`.
- **Errors never fail silently:** a disabled WebDAV switch (404), missing server credentials (403), wrong credentials (401), and edit conflicts (412) each get a distinct message with a shortcut to Options.

Format mapping, HamHome import/export, and conflict rules: [docs/bookmarks-portability.md](../docs/bookmarks-portability.md).

