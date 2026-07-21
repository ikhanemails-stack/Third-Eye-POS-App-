# Phase 1 — Bug Fixes (replace these 8 files)

Copy each file below into the SAME path inside your `pos-app` folder,
overwriting the existing one. One new file (`form-draft.js`) gets added.
Nothing else in your project needs to change for Phase 1.

```
pos-app/public/index.html                         (updated - added 1 script tag)
pos-app/public/css/styles.css                      (updated - mobile zoom fix)
pos-app/public/js/toast.js                         (updated - added Toast.info)
pos-app/public/js/screens/pos.js                   (updated - add-customer fix)
pos-app/public/js/screens/inventory.js             (updated - draft autosave)
pos-app/public/js/components/order-pad.js          (updated - Quick Cart save-customer)
pos-app/public/js/components/form-draft.js          (NEW file)
pos-app/server/helpers.js                          (updated - driver role fix)
```

After replacing, **restart the pos-app server** (driver-role fix is server-side)
and hard-refresh the browser / clear site cache on mobile (CSS fix won't show
with a stale cached stylesheet).

## What each fix does

1. **POS "+" add-customer button (issue #2)** — `screens/pos.js`
   It used to silently do nothing if the typed name already existed as a
   customer, which looked like a broken button. It now tells you clearly
   ("X already exists — selected it instead") or creates and selects the
   new customer with a success toast. `toast.js` got a small `Toast.info()`
   addition to support this.

2. **Quick Cart didn't save new customers into the Customers module
   (issues #2 & #3)** — `components/order-pad.js`
   Quick Cart let you type a name/phone/address for an order, but that data
   only ever lived inside the order draft — it was never turned into a real
   Customer record. Now:
   - There's a working **+** button next to the Customer field in Quick Cart
     that saves the typed name/phone/address as a real customer immediately.
   - Even if you don't click it, converting the order to a **Delivery**,
     **Invoice**, or **WhatsApp** message now auto-saves the typed customer
     first (matching by name/phone if one already exists, so you don't get
     duplicates), so anyone entered through Quick Cart always ends up in
     Customers going forward.

3. **Driver login stuck on "Loading deliveries..." forever, product/customer
   search not working for drivers (issue #12)** — `server/helpers.js`
   Found the actual cause: the server-side permission filter for driver
   accounts was checking for a route prefix (`/inventory`) that the app
   doesn't actually use anywhere — the real routes are `/products`,
   `/categories`, and `/drivers`. Every request a driver made for products,
   categories, or the drivers list was silently rejected with a 403, which
   is exactly why the Delivery screen (which loads all four of those at
   once) hung forever, and why product/customer search did nothing.
   Fixed the allow-list to match the app's real routes, and also allowed
   drivers to add new customers (needed for Quick Cart / delivery forms).

4. **Mobile Safari zoom-in bug that won't zoom back out** — `public/css/styles.css`
   Root cause found: several form input styles (including the base style
   used almost everywhere) had font sizes under 16px. iOS Safari
   force-zooms the whole page in when you focus any input smaller than
   that — and since the app's viewport tag disables pinch-to-zoom
   (`user-scalable=no`), there was no way to zoom back out once it
   happened. This is why it happened in real Safari too, not just in-app
   browsers, and on basically any screen with a form field. Fixed by
   bumping those font sizes to 16px on mobile widths — no visible size
   change on desktop.

5. **"Resume where I stopped" after an accidental refresh/back (issue #8)**
   — new file `components/form-draft.js`, wired into the **Add/Edit Product**
   form in `screens/inventory.js` as the first module.
   The form now autosaves as you type. If the page gets refreshed, the tab
   closed, or you hit back before saving, reopening "Add Product" (or
   editing that same product) restores exactly what you had typed, with a
   "Restored your unsaved changes" notice. The draft clears itself
   automatically once you actually save.
   This is built as a reusable tool (`FormDraft.watch(...)` /
   `FormDraft.clear(...)`) — I'll wire it into the other forms (Delivery,
   Expiry/Returns, Vendors, etc.) as part of Phase 2, since those forms are
   being reworked there anyway and doing it twice would waste effort.

## Already working — no fix needed

**Issue #7 (auto-fetch product images online)** is already fully built in
your app: the Add/Edit Product form searches Open Food Facts automatically
by product name or barcode (no API key required, no cost). If it's not
showing results for a particular product, that specific item likely isn't
in Open Food Facts' database (it's grocery/food-focused) — nothing to
change here, this will carry over as-is into later phases.

## Not yet done

Everything else on your list (#1, #3 partial, #4–#6, #9–#11, #13, #14) is
Phase 2/3/4, coming next in the order you asked for.
