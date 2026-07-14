// Third Eye Computer Solutions - POS System
// Public, read-only receipt lookup by invoice number.
//
// This is what the "Scan to View Receipt Online" QR code on every printed
// receipt points to (see public/js/components/zatca.js -> buildReceiptUrl).
// Deliberately NOT behind requireLogin/requireLicense: a customer scanning
// their own receipt with their phone has no session and shouldn't need one,
// and the receipt should still be viewable even if the shop's software
// license has lapsed - that's the shop's business problem, not the
// customer's. Only the fields needed to render a receipt are exposed here;
// no other store settings (email/backup credentials, license info, etc.)
// are ever included in this response.
const express = require('express');
const db = require('../db');

const router = express.Router();

function getPublicSettings() {
  const s = db.all('settings')[0] || {};
  return {
    shopName: s.shopName, address: s.address, phone: s.phone,
    crNumber: s.crNumber, crLabelShort: s.crLabelShort, vatNumber: s.vatNumber, vatLabel: s.vatLabel,
    vatRate: s.vatRate, currency: s.currency, currencyDecimals: s.currencyDecimals,
    logoDataUrl: s.logoDataUrl, receiptHeader: s.receiptHeader, receiptFooter: s.receiptFooter,
    receiptShowLogo: s.receiptShowLogo, receiptPaperWidth: s.receiptPaperWidth,
    receiptFontSize: s.receiptFontSize, receiptFontWeight: s.receiptFontWeight,
    requiresZatcaQr: s.requiresZatcaQr, enableDigitalReceipt: s.enableDigitalReceipt
  };
}

router.get('/public/receipt/:invoiceNo', (req, res) => {
  const sale = db.find('sales', s => s.invoiceNo === req.params.invoiceNo);
  if (!sale) return res.status(404).json({ error: 'Receipt not found.' });
  const items = db.filter('sale_items', i => i.saleId === sale.id);
  res.json({ sale: { ...sale, items }, settings: getPublicSettings() });
});

module.exports = router;
