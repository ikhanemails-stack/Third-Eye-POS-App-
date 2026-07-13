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
