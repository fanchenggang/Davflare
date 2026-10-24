# Workspace experience redesign

The Web drive and browser extension use neutral light/graphite surfaces with orange action accents. The Web drive uses a desktop sidebar at 1024px and above, a navigation drawer below that width, and the existing bottom actions below 600px. The extension keeps its own sidebar; the embedded drive uses compact section controls instead of adding another sidebar.

## Folder quick access

Pin the current directory from the path bar, or pin a folder from its action menu. Shortcuts appear in the Web navigation or the embedded drive's Quick access menu. Remove an entry using its close button or the original pin action.

Shortcuts are local to the browser and scoped by instance URL and signed-in username. They do not sync between the Web origin and the extension. Successful renames and moves update both the pinned directory and its descendants, including destinations renamed to avoid a collision. Copying does not change shortcuts. Deleted folders leave their shortcuts intact; opening an unavailable folder offers removal without navigating away.

## Transfers

The transfer dialog filters All, Active, Failed, and Completed tasks, with counts. Active includes queued, transferring, and paused tasks. Canceled tasks appear under All. The summary always represents the entire queue.

Retry all failed retries the failed tasks present at the click, once per failure. Existing pause, resume, cancel and cleanup controls remain available. Tasks continue to belong to the current session; reloading does not restore the queue.

## Extension appearance

Appearance supports System, Light and Dark. The canonical preference is `davflare.themeMode` in `chrome.storage.local`. Open library pages, popup windows, edge panels and the embedded drive respond to changes immediately. System mode follows OS appearance changes.

At first use, a valid legacy library preference (`davflare-theme`) wins over the embedded drive preference (`flaredrive.themeMode`); otherwise System is selected. Edge panels read extension storage only and never use the visited website's local storage. The independent Web drive keeps its existing appearance preference.

## Verification

Run `npm run typecheck`, `npm run test:coverage`, and `npm run build`. Build the extension with `npm run build:extension`, or package it with `bash scripts/package-extension.sh redesign-artifacts/package`.

Behavior tests cover shortcut storage/account isolation/path relocation, successful versus failed MOVE operations, transfer filters and repeated bulk retry, appearance migration/live updates, edge-panel cleanup, responsive navigation and the embedded appearance bridge. Existing coverage thresholds remain enforced.

Manual browser checks should cover 1440px, 820px and 390px widths, light/dark themes, grid/list views, long names, empty/error states, keyboard focus and menus near viewport edges. Native optional-permission prompts still need an interactive Chrome session; no additional permissions are introduced by this change.
