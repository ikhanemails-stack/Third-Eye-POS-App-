# Fix pack v6 - Portrait zoom bug (priority), product creation flow, customer search, Quick Cart redesign, QR toggle

**Read #8 first - that's the priority bug you flagged.** One NEW file
this round (`public/js/viewport-fix.js`); everything else replaces a file
you already have. Same deployment note as always: the service worker
changed (bumped to v5), so have each device do one hard refresh the first
time this reaches them.

---

## 8. iPhone loads zoomed in until you pinch to fix it (fixed first, as asked)

Diagnosed from your screenshots: the "WA Business ◀" back button at the
top means that page was opened inside **WhatsApp's own built-in browser**
(tapping a link shared in a chat opens WhatsApp's embedded browser, not
real Safari) - not the installed app, not regular Safari. This is a
specific, well-documented bug in that class of embedded browser
(WKWebView-based in-app browsers - WhatsApp, Instagram, Facebook all have
it): they sometimes don't fully commit to the page's viewport setting on
the very first paint, so it renders pre-zoomed-in until something forces a
recalculation - which is exactly why pinching to zoom out "fixed" it for
you, that gesture is what forces the recalculation.

This is not something this app's layout/CSS caused, and I want to be
upfront that I can't test directly on an iPhone - but this is a known
issue with a known, standard fix, which I've applied:
- Strengthened the viewport meta tag (`maximum-scale=1.0`,
  `viewport-fit=cover` added).
- Added `public/js/viewport-fix.js`, which re-applies the viewport setting
  automatically right after the page loads (and after rotating the
  screen) - this is the automatic equivalent of the pinch gesture you were
  doing manually.

**Please test three ways after updating** and tell me which one still has
the problem, if any: (1) the link inside WhatsApp again, (2) opening the
same link directly in Safari, (3) opening the installed app icon from the
home screen. That'll tell us definitively whether this fixed it fully or
only partly.

---

## 1 & 6. POS: no "product not found" option + no photo/barcode when creating one there

Confirmed the bug from your screenshot: searching a barcode with no match
just left the grid blank with **no message and no way forward** - not
even a "not found" notice, let alone a way to create it. Fixed: POS now
shows "No product found for [code]" with a **"+ Create as a new product"**
button, which opens the same full Products-module creation form you
already know (photo search online / upload, barcode field, category,
supplier, expiry - everything), pre-filled with what you searched. This
reuses the real Products form rather than a stripped-down copy, so it has
every option Products has, automatically, always in sync.

## 2 & 4. Customer search + autofill

Investigated both together since they turned out to be one root cause.
**Item 4 (autofill) was actually already working** - picking a real
customer already filled in phone/address automatically. The reason it
looked broken: the customer field was a plain dropdown, and typing into it
only uses the browser's built-in "jump to an option starting with these
letters" behavior - if nothing starts with exactly what you typed, nothing
gets selected, so autofill never had anything to work with. That's item 2,
the actual gap.

Fixed on the **Point of Sale** customer field (the one in your
screenshots) with a real search-as-you-type box - type any part of a
name or phone number, matching customers show as suggestions, pick one
and it autofills exactly like you wanted.

**Quick Cart got the same treatment** (see #3 below) with an even richer
version - a proper dropdown list of matches, not just the browser's native
suggestion list.

**Honest scope note**: Delivery and Quotations' customer pickers still use
the older plain dropdown - they already have working autofill (confirmed
in earlier rounds), just not the search-as-you-type upgrade yet. I
prioritized POS and Quick Cart since those were what you screenshotted.
Say the word and I'll bring the same search box to Delivery and Quotations
next round.

## 3. Quick Cart redesign

- Header switched to the app's own navy gradient instead of a clashing
  purple, so it matches the rest of the app instead of looking like a
  separate product bolted on.
- Real icons on every action button (Delivery truck icon, invoice/printer
  icon, and a proper WhatsApp icon replacing the "💬 WA" emoji text).
- Tabs, item rows, and the total line all got more breathing room and
  clearer visual hierarchy (active tab now shows a gold underline instead
  of just a background swap).
- New: a green "Linked to saved customer" badge with a "Change" link once
  you've picked someone from search, so it's obvious the fields are tied
  to a real account instead of just typed text.

## 5. QR code enable/disable

Found that the Saudi ZATCA tax QR was **already** automatically tied to
country (only shows when your Settings country is Saudi Arabia) - that
part was working correctly already. The one that wasn't controllable: the
separate "Scan to View Receipt Online" QR block, which had no on/off
switch anywhere and was printing on every receipt regardless of country.
Added a toggle for it in Settings → Receipt & Printer Settings. Turning it
off (recommended for Bahrain, as you said) removes that whole block from
the printed receipt - shorter receipt, less paper, exactly what you asked
for.

## 7. Auto-fetch product info when selected, across modules

Audited every "pick a product" flow in the app:
- **POS**: already fills in name/price/VAT the moment you tap or scan a
  product - no gap.
- **Quotations & Delivery**: already fill in name/price the moment you
  pick a product from their search - no gap found.
- **Purchases**: cost price now auto-fills when you pick an existing
  product (fixed last round) - the one genuine gap, now closed.

If there's a specific screen/field where this still isn't happening,
point me at it directly (a screenshot like the others helps a lot) and
I'll fix that exact spot - I don't want to claim "fixed everywhere" without
being able to point to what was actually checked.

---

## Files in this package

```
public/js/screens/pos.js             → REPLACES
public/js/screens/purchases.js       → REPLACES
public/js/screens/settings.js        → REPLACES
public/js/components/order-pad.js    → REPLACES
public/js/viewport-fix.js            → NEW
public/css/styles.css                → REPLACES
public/sw.js                         → REPLACES
public/index.html                    → REPLACES
```

## About admin-app

Still pos-app only. Every issue across every round so far has been about
pos-app - nothing in this message was about admin-app either.
