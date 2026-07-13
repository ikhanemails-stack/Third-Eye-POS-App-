# Third Eye POS — Fixes from the GCC Strategy Report

This round fixes the 4 issues flagged under "Stop the bleeding" in the
GCC POS Strategy Report, before anything else gets built or demoed.

## 1. Sidebar scroll-reset — FIXED
`public/js/components/shell.js`
Every screen navigation was rebuilding the entire app shell (sidebar +
topbar + content), which silently reset the sidebar's scroll position to
the top. On a long nav list this was jarring. `Shell.mount()` now
remembers the sidebar's scroll position before re-rendering and restores
it immediately after.

## 2. Product & inventory filtering — FIXED
`public/js/screens/inventory.js`
The search box re-rendered the whole product table on every keystroke,
which replaced the input element itself — so it lost focus and the
cursor jumped to the end after every character. In practice you could
only type one letter at a time. The search handler now saves the cursor
position, re-renders, then restores focus and cursor position on the new
input.

## 3. Driver edit action — FIXED (frontend was missing; backend already supported it)
`public/js/screens/delivery.js`
The delivery list let you change a delivery's *status* and view its
linked sale, but had no way to edit a delivery once created — most
importantly, no way to reassign the driver on an existing delivery. The
API (`PUT /api/deliveries/:id`) already accepted driver/address/fee/notes
changes; there was just no button for it. Added an **Edit** action on
every delivery row that opens a modal to reassign the driver, fix the
address/phone, adjust the delivery fee, or add notes.

## 4. Document attachments on purchase invoices — ADDED (new feature)
`server/routes/inventory.js`, `public/js/screens/purchases.js`
Purchases had no way to attach proof of what was actually received.
Added:
- A file picker (image or PDF, up to 6MB) in the New/Edit Purchase modal.
- Attached files are stored as part of the purchase record.
- An **Invoice** column in the Purchases list with a "📎 View" link.
- A preview button in the "View items" modal.
- The purchases *list* endpoint (`GET /api/purchases`) no longer ships the
  full file for every row (only a `hasAttachment` flag) so the list stays
  fast — the full file loads only when you actually open/preview it
  (`GET /api/purchases/:id/attachment`).

## Nothing else was touched
No other screens, the admin-app, deployment config, or your existing data
were modified. `node_modules` and the local `data/` folder are excluded
from this package on purpose (same as your existing `.gitignore`) — run
`npm install` after pulling this in, and Railway will keep using its own
persisted data volume.

---

# Round 2 — QR "Scan to View Receipt" + iPhone camera scanning + reprint

## 5. "Scan to View Receipt Online" QR didn't show anything — FIXED
The second QR code on every receipt encoded a URL like
`https://yourshop.up.railway.app/r/INV-12345`, but there was no server
route for `/r/...` at all — the app's catch-all just served the login
screen instead, which is why scanning it appeared to do nothing.

Added:
- `server/routes/public-receipt.js` — a public, no-login endpoint
  (`GET /api/public/receipt/:invoiceNo`) that returns just the sale + the
  receipt-relevant settings (shop name, VAT number, logo, etc.) — nothing
  sensitive like license or email/backup credentials.
- `public/receipt-view.html` — a clean, mobile-friendly page that fetches
  that data and renders the exact same receipt layout used at checkout,
  with a **🖨️ Print / Save as PDF** button at the bottom.
- `server/index.js` now serves that page for `GET /r/:invoiceNo`, before
  the app's catch-all.

This works on **both Android and iPhone** — it's a normal link, so any
phone's default camera app recognizes it and opens it in the browser, no
special app or scanner needed.

## 6. iPhone/Safari camera scanning failing — IMPROVED
`public/js/screens/pos.js` (📷 Scan button on the POS screen)
Android uses the browser's native `BarcodeDetector` API. iPhone Safari
doesn't support that, so it was already falling back to the bundled ZXing
library — but that fallback pre-enumerated cameras with
`listVideoInputDevices()` before ever asking for camera access, which is
unreliable on iOS (camera labels/order aren't guaranteed before permission
has been granted at least once), and added an extra async step between
your tap and the actual camera request that iOS Safari can be strict
about. It now requests the back camera directly first, and only falls
back to enumerating devices if that specific attempt fails. The error
message shown on failure is also more specific now and includes the
underlying browser error, plus a concrete "close Safari fully / clear
this site's data / reload" recovery step for the case where permission
was already granted but it's still failing.

**If it still won't work on a specific iPhone after this fix:** it's
almost always one of — (a) another app/tab already using the camera,
(b) an older iOS version with an OS-level camera bug (rare, but Apple has
shipped a few over the years), or (c) an MDM/managed-device profile
blocking camera access for Safari. A USB/Bluetooth barcode scanner or
typing the barcode into the search box always works as a reliable
backup regardless of phone/browser.

**On "give me an application for Android and iPhone":** building and
publishing to the App Store / Play Store needs developer accounts, code
signing, and app review — outside what a code package can do on its own.
What *is* already built into this app: it's a installable PWA
(`public/manifest.json` + `public/sw.js` already exist). On iPhone: open
the site in Safari → Share → **Add to Home Screen**. On Android: open in
Chrome → menu → **Install app** (or Chrome will offer to do this
automatically). Either way it gets its own home-screen icon and opens
full-screen like a native app, with no app store needed.

## 7. Reopen/reprint a past receipt (with the QR code) — FIXED
`public/js/screens/sales-history.js`
Once you closed the print/QR popup after checkout, there was no way to
get it back short of re-ringing the sale. Added a **🖨️ Reprint** button
directly on every row in Sales History, and a "Reprint Receipt / View QR
Code" button inside the invoice details modal — either one reopens the
exact same printable receipt (both QR codes included) for any past sale,
any time.

