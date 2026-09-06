# Bookmark portability: formats, field mapping, conflict strategy

> How the Davflare extension moves bookmarks in and out: Netscape HTML,
> Davflare JSON backups, the browser bookmark bar, and HamHome sync
> directories. Covers the features landed with issues #53, #65 and #64 (2026-09).

## Files at a glance

| File | Role | Authority |
|------|------|-----------|
| `bookmarks.html` (Netscape format) | Browser-importable export, stored on WebDAV | Membership, titles, folder paths |
| `bookmarks.json` (JSON sidecar) | Rich-field companion on WebDAV | Tags, notes, ids, pin state, declared (empty) folders |
| `davflare-bookmarks.json` (download) | Full backup file for manual migration | Same as the sidecar |
| `/HamHomeSync/bookmarks/meta.json` + `/HamHomeSync/categories.json` | HamHome interoperability | HamHome's own ids/updatedAt |

`bookmarks.html` stays the authoritative member list — it is what browsers
can re-import and what the library renders after a remote-only change. The
JSON sidecar donates everything Netscape cannot hold
(`adoptRichFields`): tags, notes, ids, pinned/pinnedAt and declared folders.

## Import

`Bookmarks.importBackup(text, HamHome)` sniffs the payload before parsing:

1. Text starting with `{` or `[` is JSON. `sniffJsonImport` decides the
   flavor from row keys: `categoryId` / `description` / `createdAt` →
   HamHome; `folder` / `note` / `added` / `id` → Davflare. Bare arrays are
   treated as HamHome's shape.
2. Everything else is parsed as Netscape HTML (DOMParser, or a built-in
   tokenizer inside the MV3 service worker, #75).

All imports merge by URL: existing library entries win on collision
("base wins"), so importing never duplicates or overwrites what you have.
URL identity strips the `#hash` of http(s) links (`urlKey`).

## Export

- **HTML** — plain Netscape file, folders rendered as `<H3>`/`<DL>` (declared
  empty folders included), re-importable by Chrome/Firefox.
- **JSON** — `davflare-bookmarks.json`, the full model: `{version, bookmarks,
  folders}`. Re-importing it restores folders, tags, notes and pin state.
- **Browser bookmarks bar** (#64) — writes the library back into Chrome via
  `chrome.bookmarks`. Options: target folder (picked from the browser tree),
  skip duplicates (URL keys already under the target are not re-created),
  optionally clear the target folder first (confirm, children removed with
  `removeTree`). Folders are created before their siblings' order matters —
  creation order matches the HTML export (links, then subfolders).
- **HamHome write-back** (#64) — merges into the existing HamHome remote
  (see below); `categories.json` is written first, `meta.json` last,
  mirroring HamHome's own safe write order.

## HamHome field mapping

Davflare model → HamHome remote:

| Davflare | HamHome `meta.json` row | Notes |
|----------|------------------------|-------|
| `url` | `url` | |
| `title` | `title` | |
| `note` | `description` | |
| `tags` | `tags` | |
| `added` | `createdAt` (0 → now) | |
| — | `updatedAt` | stamped `now` on every write-back |
| `folder` path | `categoryId` | `""` (unfiled) → `null`; path → category id |
| — | `id` | keeps HamHome's id on match; new rows get `dav-<urlhash>` |
| — | `hasSnapshot: false` | snapshots stay HamHome-local |
| `pinned` | — | Davflare-only; HamHome has no equivalent |

HamHome `categories.json` row → Davflare folder path: `name` segments joined
with `/` via the `parentId` chain (`categoryPath`). `isDeleted: true` rows are
skipped on import and never updated on export.

## Conflict strategy

- **Davflare library writes** are conditional (`If-Match` on the html ETag).
  A 412 means the remote moved on: the page reloads the remote copy and asks
  you to retry; nothing is silently overwritten.
- **HamHome write-back never deletes.** Rows that exist remotely but not in
  Davflare are left untouched, so HamHome's next id-based union sync only
  picks up additions/updates. Same-URL rows are updated in place (keeping
  HamHome's id, `createdAt` and `favicon`); `updatedAt` advances so HamHome
  treats the row as newer.
- **Categories merge by signature.** If a HamHome category with the same
  `name` + parent already exists, its id is reused; otherwise the folder
  path is declared as a new category (`id` = path, `parentId` = parent
  path/id). Re-running the write-back is idempotent.
- The Netscape file remains the *authority for membership*: after any remote
  change, html membership wins and rich fields are re-attached from the JSON
  sidecar. Deleting a row from Davflare therefore also removes it from the
  html/JSON pair on WebDAV — but never from HamHome's own tree.
