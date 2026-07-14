// Third Eye Computer Solutions - POS System
// ZATCA Phase 2 (Saudi Arabia) - onboarding wizard + settings API.
// Mirrors the official rollout steps: prepare EGS -> Compliance CSID ->
// compliance checks -> Production CSID -> go live.
const express = require('express');
const db = require('../db');
const { requireLogin, requireAdmin } = require('../helpers');
const { encrypt, decrypt } = require('./secret-store');
const { generateCsr, generateEgsSerial } = require('./csr');
const { requestComplianceCsid, runComplianceCheck, requestProductionCsid } = require('./onboarding');
const { buildSimplifiedInvoiceXml } = require('./ubl-invoice');
const { signInvoice } = require('./sign');
const { ZERO_HASH_BASE64 } = require('./report-sale');

const router = express.Router();

// ZATCA Phase 2 is Saudi-Arabia-specific. Block every route below for shops
// configured with any other country, even if someone calls the API directly.
router.use((req, res, next) => {
  db.ensureTable('settings', []);
  const shop = db.all('settings')[0];
  if (shop && shop.country && shop.country !== 'SA') {
    return res.status(403).json({ error: 'ZATCA (Saudi Arabia) is only available when the shop country is set to Saudi Arabia.' });
  }
  next();
});

function getCfg() {
  db.ensureTable('zatca_ksa', []);
  let cfg = db.all('zatca_ksa')[0];
  if (!cfg) cfg = db.insert('zatca_ksa', { ksaEnabled: false, environment: 'sandbox', lastIcv: 0, lastInvoiceHash: null });
  return cfg;
}

// Never send private keys or secrets to the browser - just enough to render
// the onboarding wizard's progress.
function publicView(cfg) {
  return {
    ksaEnabled: !!cfg.ksaEnabled,
    environment: cfg.environment,
    vatNumber: cfg.vatNumber || '',
    crNumber: cfg.crNumber || '',
    shopName: cfg.shopName || '',
    address: cfg.address || '',
    city: cfg.city || '',
    currency: cfg.currency || 'SAR',
    vatRate: cfg.vatRate ?? 15,
    egsSerial: cfg.egsSerial || null,
    hasCsr: !!cfg.csrBase64,
    hasComplianceCsid: !!cfg.complianceToken,
    complianceChecksPassed: cfg.complianceChecksPassed || [],
    hasProductionCsid: !!cfg.productionToken,
    lastIcv: cfg.lastIcv || 0,
  };
}

router.get('/zatca-ksa/status', requireLogin, requireAdmin, (req, res) => {
  res.json(publicView(getCfg()));
});

router.post('/zatca-ksa/settings', requireLogin, requireAdmin, (req, res) => {
  const cfg = getCfg();
  const { ksaEnabled, environment, vatNumber, crNumber, shopName, address, city, currency, vatRate } = req.body;
  const updated = db.update('zatca_ksa', cfg.id, {
    ksaEnabled: !!ksaEnabled,
    environment: environment || 'sandbox',
    vatNumber, crNumber, shopName, address, city,
    currency: currency || 'SAR',
    vatRate: vatRate !== undefined ? Number(vatRate) : 15,
  });
  res.json(publicView(updated));
});

// Step 1: prepare the EGS unit + generate the CSR/key pair.
router.post('/zatca-ksa/csr', requireLogin, requireAdmin, (req, res) => {
  const cfg = getCfg();
  if (!cfg.vatNumber || !cfg.crNumber || !cfg.shopName) {
    return res.status(400).json({ error: 'Fill in VAT number, CR number and shop name in Settings first.' });
  }
  try {
    const egsSerial = cfg.egsSerial || generateEgsSerial();
    const { privateKeyPem, csrBase64 } = generateCsr({
      commonName: cfg.shopName,
      serialNumber: egsSerial,
      organizationIdentifier: cfg.vatNumber,
      organizationUnitName: cfg.crNumber,
      organizationName: cfg.shopName,
      location: cfg.city || cfg.address,
      industry: 'Retail',
      environment: cfg.environment || 'sandbox',
    });
    const updated = db.update('zatca_ksa', cfg.id, {
      egsSerial,
      csrBase64,
      privateKeyEnc: encrypt(privateKeyPem),
    });
    res.json(publicView(updated));
  } catch (e) {
    res.status(500).json({ error: `CSR generation failed: ${e.message}. Make sure openssl is installed on the server.` });
  }
});

// Step 2: exchange CSR + the OTP you got from the Fatoora portal for a
// Compliance CSID.
router.post('/zatca-ksa/compliance', requireLogin, requireAdmin, async (req, res) => {
  const cfg = getCfg();
  const { otp } = req.body;
  if (!otp) return res.status(400).json({ error: 'Enter the OTP from the ZATCA Fatoora portal.' });
  if (!cfg.csrBase64) return res.status(400).json({ error: 'Generate the CSR first.' });
  try {
    const result = await requestComplianceCsid({ env: cfg.environment, csrBase64: cfg.csrBase64, otp });
    const updated = db.update('zatca_ksa', cfg.id, {
      complianceToken: result.binarySecurityToken,
      complianceSecretEnc: encrypt(result.secret),
      complianceRequestId: result.requestID,
      certPem: Buffer.from(result.binarySecurityToken, 'base64').toString('utf8'),
    });
    res.json(publicView(updated));
  } catch (e) {
    res.status(e.status || 500).json({ error: 'ZATCA rejected the Compliance CSID request.', details: e.response || e.message });
  }
});

// Step 3: submit a sample simplified invoice for compliance validation.
// (Standard/B2B sample invoices aren't built here - this app only issues
// simplified/B2C invoices at the POS. If your ZATCA wave also requires
// standard-invoice compliance checks, that needs a second XML builder.)
router.post('/zatca-ksa/compliance-check', requireLogin, requireAdmin, async (req, res) => {
  const cfg = getCfg();
  if (!cfg.complianceToken) return res.status(400).json({ error: 'Complete Step 2 (Compliance CSID) first.' });
  try {
    const sampleSale = {
      invoiceNo: `TEST-${Date.now()}`, total: 115, subtotal: 100, vatTotal: 15,
      paymentMethod: 'cash', customerName: 'Test Buyer',
      items: [{ productName: 'Sample Item', quantity: 1, unitPrice: 100, lineTotal: 115 }],
    };
    const invoiceSettings = {
      currency: cfg.currency || 'SAR', vatRate: cfg.vatRate ?? 15,
      vatNumber: cfg.vatNumber, crNumber: cfg.crNumber, shopName: cfg.shopName,
      address: cfg.address, city: cfg.city,
    };
    const now = new Date();
    const chain = {
      icv: (cfg.lastIcv || 0) + 1,
      previousInvoiceHash: cfg.lastInvoiceHash || ZERO_HASH_BASE64,
      uuid: require('crypto').randomUUID(),
      issueDate: now.toISOString().slice(0, 10),
      issueTime: now.toISOString().slice(11, 19),
    };
    const unsignedXml = buildSimplifiedInvoiceXml(sampleSale, invoiceSettings, chain);
    const privateKeyPem = decrypt(cfg.privateKeyEnc);
    const signed = await signInvoice(unsignedXml, {
      privateKeyPem, certPem: cfg.certPem,
      sellerName: cfg.shopName, vatNumber: cfg.vatNumber,
      timestamp: now.toISOString(), total: sampleSale.total, vatTotal: sampleSale.vatTotal,
    });
    const result = await runComplianceCheck({
      env: cfg.environment,
      complianceToken: cfg.complianceToken,
      complianceSecret: decrypt(cfg.complianceSecretEnc),
      invoiceHash: signed.invoiceHashBase64,
      uuid: chain.uuid,
      invoiceBase64: signed.signedXmlBase64,
    });
    const passed = [...(cfg.complianceChecksPassed || []), 'simplified'];
    const updated = db.update('zatca_ksa', cfg.id, {
      lastIcv: chain.icv,
      lastInvoiceHash: signed.invoiceHashBase64,
      complianceChecksPassed: [...new Set(passed)],
    });
    res.json({ ...publicView(updated), zatcaResponse: result });
  } catch (e) {
    res.status(e.status || 500).json({ error: 'ZATCA rejected the sample invoice.', details: e.response || e.message });
  }
});

// Step 4: exchange the Compliance CSID for a Production CSID.
router.post('/zatca-ksa/production', requireLogin, requireAdmin, async (req, res) => {
  const cfg = getCfg();
  if (!cfg.complianceChecksPassed || !cfg.complianceChecksPassed.includes('simplified')) {
    return res.status(400).json({ error: 'Pass the compliance checks (Step 3) before requesting a Production CSID.' });
  }
  try {
    const result = await requestProductionCsid({
      env: cfg.environment,
      complianceToken: cfg.complianceToken,
      complianceSecret: decrypt(cfg.complianceSecretEnc),
      complianceRequestId: cfg.complianceRequestId,
    });
    const updated = db.update('zatca_ksa', cfg.id, {
      productionToken: result.binarySecurityToken,
      productionSecretEnc: encrypt(result.secret),
    });
    res.json(publicView(updated));
  } catch (e) {
    res.status(e.status || 500).json({ error: 'ZATCA rejected the Production CSID request.', details: e.response || e.message });
  }
});

// Manual retry for invoices that failed to report (network blip, ZATCA
// downtime, etc.) - the invoice was already signed with a committed
// ICV/PIH, so this resubmits the SAME signed XML rather than re-signing.
router.post('/zatca-ksa/retry/:logId', requireLogin, requireAdmin, async (req, res) => {
  const entry = db.getById('zatca_invoice_log', req.params.logId);
  if (!entry || entry.status !== 'report_error') return res.status(400).json({ error: 'Nothing to retry for this entry.' });
  const cfg = getCfg();
  const { reportInvoice } = require('./report');
  try {
    const result = await reportInvoice({
      env: cfg.environment,
      productionToken: cfg.productionToken,
      productionSecret: decrypt(cfg.productionSecretEnc),
      invoiceHashBase64: entry.invoiceHash,
      uuid: entry.uuid,
      signedXmlBase64: entry.signedXmlBase64,
    });
    db.update('zatca_invoice_log', entry.id, { status: 'reported', response: result });
    res.json({ ok: true });
  } catch (e) {
    db.update('zatca_invoice_log', entry.id, { status: 'report_error', error: e.message, response: e.response || null });
    res.status(e.status || 500).json({ error: 'Retry failed.', details: e.response || e.message });
  }
});

router.get('/zatca-ksa/log', requireLogin, requireAdmin, (req, res) => {
  const rows = db.all('zatca_invoice_log').slice(-100).reverse()
    .map(r => ({ ...r, signedXmlBase64: undefined })); // large field, not needed by the UI list
  res.json(rows);
});

module.exports = router;
