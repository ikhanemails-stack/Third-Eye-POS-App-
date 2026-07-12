// Third Eye Computer Solutions - POS System
// GCC country tax configuration - single source of truth.
//
// This is used by:
//  - GET /api/tax-config  (server route, so the Settings screen can build
//    its country dropdown and auto-fill VAT rate/currency/label)
//  - The values chosen here get COPIED onto the shop's settings document
//    when the admin picks a country and saves, so the POS/receipt code
//    never has to look this table up again at checkout/print time - it
//    just reads settings.vatRate, settings.vatLabel, settings.requiresZatcaQr
//    directly. That keeps checkout fast and working offline.
//
// ACCURACY NOTES - please keep these current, tax law changes over time:
//
// - Bahrain (BH): 10% standard VAT. Regulator: National Bureau for Revenue
//   (NBR). Live and in force.
//
// - Saudi Arabia (SA): 15% standard VAT. Regulator: Zakat, Tax and Customs
//   Authority (ZATCA). Live and in force. ZATCA e-invoicing "Fatoora" has
//   two phases:
//     Phase 1 (Generation) - every simplified (B2C) tax invoice must show a
//       QR code containing 5 fields (seller name, VAT number, timestamp,
//       invoice total, VAT total) Base64/TLV-encoded. THIS IS IMPLEMENTED
//       in public/js/components/zatca.js and wired into the receipt below.
//     Phase 2 (Integration) - requires the business to be onboarded
//       directly with ZATCA, receive a cryptographic stamp identity (CSID),
//       digitally sign invoices (XML/UBL 2.1), and report/clear them in
//       real time through ZATCA's API. This is a legal/business onboarding
//       step done through ZATCA's own portal - no code can complete it on
//       your behalf. Once a client has real ZATCA API credentials, add the
//       submission call in server/routes/sales.js (see the TODO marker).
//
// - United Arab Emirates (AE): 5% standard VAT. Regulator: Federal Tax
//   Authority (FTA). Live and in force.
//
// - Oman (OM): 5% standard VAT. Regulator: Oman Tax Authority (OTA). Live
//   and in force.
//
// - Qatar (QA): VAT has NOT been implemented yet (checked July 2026).
//   Qatar signed the GCC VAT Framework Agreement but has no live VAT law.
//   Qatar's General Tax Authority (GTA) approved a draft e-invoicing law in
//   May 2026 as groundwork for a future VAT rollout, expected sometime in
//   late 2026 or 2027 at the GCC-standard 5% rate - but there is nothing to
//   collect today. Rate is deliberately set to 0 here so you never
//   overcharge a Qatari customer VAT that doesn't legally exist yet.
//   UPDATE THIS the day Qatar's VAT law is formally enacted.
//
// - Kuwait (KW): VAT has NOT been implemented yet. Rate set to 0 for the
//   same reason as Qatar.

const COUNTRY_TAX_CONFIG = {
  BH: {
    code: 'BH', name: 'Bahrain', currency: 'BHD', currencyDecimals: 3,
    vatRate: 10, vatLabel: 'VAT', vatLive: true, requiresZatcaQr: false,
    authority: 'National Bureau for Revenue (NBR)',
    note: 'Bahrain standard VAT rate is 10%.'
  },
  SA: {
    code: 'SA', name: 'Saudi Arabia', currency: 'SAR', currencyDecimals: 2,
    vatRate: 15, vatLabel: 'VAT (ZATCA)', vatLive: true, requiresZatcaQr: true,
    authority: 'Zakat, Tax and Customs Authority (ZATCA)',
    note: 'Saudi Arabia standard VAT is 15%. A ZATCA Phase 1 simplified tax invoice QR code will be added to every receipt automatically.'
  },
  AE: {
    code: 'AE', name: 'United Arab Emirates', currency: 'AED', currencyDecimals: 2,
    vatRate: 5, vatLabel: 'VAT', vatLive: true, requiresZatcaQr: false,
    authority: 'Federal Tax Authority (FTA)',
    note: 'UAE standard VAT rate is 5%.'
  },
  OM: {
    code: 'OM', name: 'Oman', currency: 'OMR', currencyDecimals: 3,
    vatRate: 5, vatLabel: 'VAT', vatLive: true, requiresZatcaQr: false,
    authority: 'Oman Tax Authority (OTA)',
    note: 'Oman standard VAT rate is 5%.'
  },
  QA: {
    code: 'QA', name: 'Qatar', currency: 'QAR', currencyDecimals: 2,
    vatRate: 0, vatLabel: 'VAT (not yet in force)', vatLive: false, requiresZatcaQr: false,
    authority: 'General Tax Authority (GTA)',
    note: 'Qatar has not implemented VAT yet as of 2026. Rate is set to 0% - update this once the GTA formally launches VAT (expected ~5%).'
  },
  KW: {
    code: 'KW', name: 'Kuwait', currency: 'KWD', currencyDecimals: 3,
    vatRate: 0, vatLabel: 'VAT (not yet in force)', vatLive: false, requiresZatcaQr: false,
    authority: 'Kuwait Tax Authority',
    note: 'Kuwait has not implemented VAT yet. Rate is set to 0% - update this once VAT is formally enacted.'
  }
};

module.exports = { COUNTRY_TAX_CONFIG };
