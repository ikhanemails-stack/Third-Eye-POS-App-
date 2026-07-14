# ZATCA Phase 2 (Saudi Arabia) Integration

This folder implements ZATCA's "Fatoora Integration Phase" for shops that are
VAT-registered and trading in **Saudi Arabia**. It is completely separate
from `public/js/components/zatca.js`, which only builds the simplified
Phase-1-style QR code shown on Bahrain receipts (informal, no registration
needed, not a legal requirement in Bahrain).

## What this does NOT do for you

- **It cannot register you with ZATCA.** You must already be notified by
  ZATCA that you're in an active integration wave, and you must log into
  the Fatoora Portal yourself with your own CR/VAT credentials to generate
  the OTP each onboarding step needs. No code can do that step for you.
- **It cannot get your Production CSID without passing compliance checks
  first.** ZATCA validates real sample invoices before issuing it.
- **It only builds Simplified (B2C) Tax Invoices** - what a POS checkout
  issues. Standard/B2B invoices (which must be *cleared* before issuing,
  not just *reported* after) would need a second XML builder - not
  included, since this app's checkout flow is inherently B2C.

## One-time server setup

1. **Install dependencies** - already added to `package.json`
   (`node-forge` for certificate handling, `xml-c14n` for XML
   canonicalization). Just run `npm install` on deploy; Railway does this
   automatically on every push.
2. **`openssl` must be on the server** for CSR generation
   (`server/zatca/csr.js` shells out to it). It's present by default on
   Railway's Node buildpack image; if you ever move hosts, confirm it's
   installed.
3. **Set `ZATCA_ENCRYPTION_KEY`** in your environment (Railway → your
   service → Variables). This encrypts the ZATCA private key and API
   secrets before they're written to the database. Generate one with:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Store this value somewhere safe outside Railway too (password manager).
   If you lose it after go-live, you'll need to re-onboard with a new CSID.

## Onboarding (Settings → ZATCA (Saudi Arabia) in the app)

Follow the 5 numbered steps on that screen, in order:

1. Fill in seller information (VAT number, CR number, legal name, address).
2. Generate the CSR + key pair.
3. Paste the OTP from the Fatoora Portal → get a Compliance CSID.
4. Run the compliance check (submits a sample simplified invoice).
5. Once it passes, request the Production CSID.

Do all of this with **Environment = Sandbox** first. Only switch to
Production once you've genuinely verified invoices are being accepted -
Production submissions are real, legally-binding tax filings.

## Verify before going anywhere near Production

The single riskiest part of this integration is `server/zatca/sign.js` -
the exact `ext:UBLExtensions`/`ds:Signature` XML block and the XML
canonicalization ZATCA expects. This follows the structure of ZATCA's
published sample invoices and community reference implementations, but:

- ZATCA has changed this structure before, and may again.
- The CSR fields in `server/zatca/csr.js` (subject fields, certificate
  template OID) should be cross-checked against the current CSR
  Generation Tool template on the Fatoora developer portal.
- Run every sample invoice type your integration wave requires through
  Sandbox and fix any rejection ZATCA reports before requesting a
  Production CSID.

## Ongoing operation

- Every completed POS sale is reported to ZATCA automatically and
  asynchronously (`server/zatca/report-sale.js`, called from
  `server/routes/sales.js`) - it never blocks or fails a checkout.
- Failed reports are logged in the `zatca_invoice_log` collection with
  status `report_error` and can be retried from Settings → ZATCA (Saudi
  Arabia) → Recent Reporting Activity, without breaking the invoice chain
  (the invoice keeps its already-committed ICV/PIH; only the network
  submission is retried).
