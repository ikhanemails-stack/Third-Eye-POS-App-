// Third Eye Computer Solutions - POS System
// ZATCA Phase 2 - takes a completed sale and reports it, if this shop is
// onboarded for Saudi ZATCA integration. Called AFTER the sale is already
// saved and the receipt is already printing - a slow or failed ZATCA call
// must never block or fail a checkout. Simplified invoices have a 24-hour
// reporting window precisely so POS systems can behave this way.
const db = require('../db');
const { decrypt } = require('./secret-store');
const { buildSimplifiedInvoiceXml } = require('./ubl-invoice');
const { signInvoice } = require('./sign');
const { reportInvoice } = require('./report');

// ZATCA's defined seed hash used as the "previous invoice hash" for the
// very first invoice in a chain - a fixed, published constant, not
// something you generate.
const ZERO_HASH_BASE64 = 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==';

function getKsaSettings() {
  return db.all('zatca_ksa')[0] || null;
}

async function reportSaleToZatcaKsa(sale, customer, shopSettings) {
  const cfg = getKsaSettings();
  if (!cfg || !cfg.ksaEnabled) return; // this shop isn't onboarded for KSA - skip silently
  if (!cfg.productionToken || !cfg.productionSecret || !cfg.certPem || !cfg.privateKeyEnc) {
    console.warn('[zatca-ksa] Sale', sale.invoiceNo, 'not reported: onboarding is incomplete (no Production CSID yet).');
    return;
  }

  const icv = (cfg.lastIcv || 0) + 1;
  const uuid = require('crypto').randomUUID();
  const now = new Date();
  const chain = {
    icv,
    previousInvoiceHash: cfg.lastInvoiceHash || ZERO_HASH_BASE64,
    uuid,
    issueDate: now.toISOString().slice(0, 10),
    issueTime: now.toISOString().slice(11, 19),
  };

  const invoiceSettings = {
    currency: cfg.currency || 'SAR',
    vatRate: cfg.vatRate ?? shopSettings.vatRate ?? 15,
    vatNumber: cfg.vatNumber,
    crNumber: cfg.crNumber,
    shopName: cfg.shopName || shopSettings.shopName,
    address: cfg.address,
    city: cfg.city,
  };

  let unsignedXml, signed;
  try {
    unsignedXml = buildSimplifiedInvoiceXml(sale, invoiceSettings, chain);
    const privateKeyPem = decrypt(cfg.privateKeyEnc);
    signed = await signInvoice(unsignedXml, {
      privateKeyPem,
      certPem: cfg.certPem,
      sellerName: invoiceSettings.shopName,
      vatNumber: invoiceSettings.vatNumber,
      timestamp: now.toISOString(),
      total: sale.total,
      vatTotal: sale.vatTotal,
    });
  } catch (e) {
    console.error('[zatca-ksa] Failed to build/sign invoice for', sale.invoiceNo, e.message);
    db.insert('zatca_invoice_log', {
      saleId: sale.id, invoiceNo: sale.invoiceNo, uuid, icv,
      status: 'sign_error', error: e.message,
    });
    return;
  }

  // The invoice chain (ICV/PIH) has now been committed for this invoice -
  // do NOT reuse this ICV even if the reporting call below fails. Advance
  // the chain first, retry the network call separately.
  db.update('zatca_ksa', cfg.id, { lastIcv: icv, lastInvoiceHash: signed.invoiceHashBase64 });

  const logEntry = db.insert('zatca_invoice_log', {
    saleId: sale.id, invoiceNo: sale.invoiceNo, uuid, icv,
    invoiceHash: signed.invoiceHashBase64,
    status: 'pending',
  });

  try {
    const result = await reportInvoice({
      env: cfg.environment || 'sandbox',
      productionToken: cfg.productionToken,
      productionSecret: decrypt(cfg.productionSecretEnc),
      invoiceHashBase64: signed.invoiceHashBase64,
      uuid,
      signedXmlBase64: signed.signedXmlBase64,
    });
    db.update('zatca_invoice_log', logEntry.id, { status: 'reported', response: result });
    db.update('sales', sale.id, { zatcaStatus: 'reported', zatcaQrBase64: signed.qrBase64 });
  } catch (e) {
    console.error('[zatca-ksa] Reporting failed for', sale.invoiceNo, e.message);
    db.update('zatca_invoice_log', logEntry.id, {
      status: 'report_error',
      error: e.message,
      response: e.response || null,
      // signedXmlBase64 kept so a retry job can resubmit without re-signing
      // (re-signing would need a NEW icv/PIH, which would break the chain).
      signedXmlBase64: signed.signedXmlBase64,
    });
    db.update('sales', sale.id, { zatcaStatus: 'pending_retry', zatcaQrBase64: signed.qrBase64 });
  }
}

module.exports = { reportSaleToZatcaKsa, getKsaSettings, ZERO_HASH_BASE64 };
