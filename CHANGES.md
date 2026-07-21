# Third Eye POS — Feature Update

This package contains **only the 6 files that changed**. Nothing else in your
project was touched — your existing data, other screens, admin app, and
deployment config are all untouched.

## How to apply
Copy these 6 files into your `pos-app` folder, overwriting the existing ones
at the same paths:

```
pos-app/server/routes/inventory.js
pos-app/public/js/api.js
pos-app/public/js/screens/inventory.js
pos-app/public/js/screens/pos.js
pos-app/public/css/styles.css
pos-app/public/css/pos-screen.css
```

Then commit and push to your `Third-Eye-POS-App-` GitHub repo — Railway will
auto-redeploy. No new npm packages are required (everything uses your
existing Express server and the browser's built-in `fetch`/camera APIs).

---

## What was added

### 1. Cloud product photo search (Inventory → Add/Edit Product)
- New **"🔍 Search Photo Online"** button opens a search box — type a product
  name and it pulls real product photos from Open Food Facts (free, no API
  key needed) for you to pick from.
- New **"📤 Upload From Device"** lets you pick a photo from your phone/PC
  instead.
- The chosen photo now shows as a thumbnail in the Inventory table and on
  the POS product tiles.

### 2. Barcode auto-fill (Inventory → Add/Edit Product)
- New **🌐 button** next to the Barcode field. Scan or type a barcode, click
  it, and the app looks the barcode up online (Open Food Facts, then UPC
  Item DB as a fallback) and offers to auto-fill the product name and photo.

### 3. Camera barcode scanning (POS screen)
- New **"📷 Scan"** button next to the POS search bar opens your device
  camera and scans a barcode automatically (using the browser's built-in
  `BarcodeDetector` — no extra library, works on Chrome/Edge/Android).
- On browsers that don't support it yet (e.g. Safari/iOS), it shows a clear
  message instead of a broken camera view — your existing USB/Bluetooth
  scanner and manual typing still work everywhere as before.

### 4. Cursor stays on the POS search box
- After adding an item to the cart, clearing the cart, or completing a sale,
  the cursor automatically returns to the search box so you can keep
  scanning/typing without clicking back into it each time.

### 5. Small bug fix (additive only)
- `public/js/api.js` was missing an `Api.del()` method — every screen in
  your app (Inventory, Customers, Employees, Vendors, Users, etc.) calls
  `Api.del(...)` for delete buttons, but only `Api.delete(...)` existed.
  I added one line (`del(url) { return this.request('DELETE', url); }`)
  so those delete buttons actually work. Nothing existing was changed or
  removed.

---

## Notes
- No product schema migration is needed — `photo` is just a new optional
  field; existing products without a photo show a 📦 placeholder as before.
- The image search/lookup endpoints run on your **server**, not the browser,
  so there are no CORS issues and no API keys are exposed to customers.
- Nothing in `admin-app` needed changes — it only manages licenses/clients,
  not products.

## GCC Country / VAT / ZATCA update

- Settings screen now has a **Country** dropdown (Bahrain, Saudi Arabia, UAE, Oman, Qatar, Kuwait).
  Picking a country auto-fills VAT rate, currency, currency decimals, and the VAT label shown on receipts.
  The admin can still edit the VAT rate manually afterwards if a special case applies.
- New `server/tax-config.js` is the single source of truth for each country's VAT rate/label/authority.
  Exposed at `GET /api/tax-config`.
- Saudi Arabia: every receipt automatically prints a **ZATCA Phase 1 "Simplified Tax Invoice" QR code**
  (Base64 TLV: seller name, VAT number, timestamp, invoice total, VAT total), using the QR library already
  bundled in this app (`public/js/vendor/qrcode.js`). See `public/js/components/zatca.js` for full details
  and honest limitations (ZATCA Phase 2 real-time reporting requires the business to onboard directly with
  ZATCA and is outside what any code package can complete on its own).
- Qatar and Kuwait: VAT rate is deliberately set to 0% because neither country has implemented VAT yet
  (checked July 2026). Update `server/tax-config.js` the day either country's tax authority formally
  launches VAT.
- Known follow-up (not yet done): several screens still hard-code "(BHD)" in field labels
  (Delivery Fee, Salary, Cost Price, Credit Limit, etc.) instead of reading `settings.currency`
  dynamically - fine for a Bahrain-only shop, but should be generalized before selling this same
  build into Saudi/UAE/Oman shops. Ask for this as a next update if needed.
