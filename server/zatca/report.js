// Third Eye Computer Solutions - POS System
// ZATCA Phase 2 - Step 5 "Go Live": report simplified (B2C/POS) invoices
// after issuing them to the customer. Standard/B2B invoices would use the
// clearance endpoint (must be cleared BEFORE issuing) - not implemented
// here since a POS checkout is always a simplified invoice; add
// clearInvoice() alongside this if you later add a B2B counter-sale flow.
const { getEnvironment } = require('./config');
const { basicAuthHeader } = require('./onboarding');

/**
 * Simplified invoices: issue to the customer first (print the receipt
 * immediately, don't block on this call), then report to ZATCA within 24
 * hours. Safe to retry - ZATCA de-dupes on invoiceHash/uuid.
 */
async function reportInvoice({ env, productionToken, productionSecret, invoiceHashBase64, uuid, signedXmlBase64 }) {
  const { baseUrl } = getEnvironment(env);
  const res = await fetch(`${baseUrl}/invoices/reporting/single`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept-Version': 'V2',
      'Clearance-Status': '0',
      Authorization: basicAuthHeader(productionToken, productionSecret),
    },
    body: JSON.stringify({
      invoiceHash: invoiceHashBase64,
      uuid,
      invoice: signedXmlBase64,
    }),
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`ZATCA reporting failed (${res.status})`);
    err.status = res.status;
    err.response = json;
    throw err;
  }
  return json; // { reportingStatus, warnings?, ... }
}

module.exports = { reportInvoice };
