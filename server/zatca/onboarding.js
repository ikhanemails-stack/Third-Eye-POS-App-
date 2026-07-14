// Third Eye Computer Solutions - POS System
// ZATCA Phase 2 - onboarding calls (Compliance CSID -> compliance checks ->
// Production CSID). This is the "Step-by-Step Rollout Process" from ZATCA's
// docs, translated into actual HTTP calls.
//
// This module ONLY talks to ZATCA once you (the shop) have:
//   1. Been notified by ZATCA that you're in an active integration wave, and
//   2. Logged into the Fatoora portal yourself and generated a one-time OTP.
// Neither of those can be done by this code - they require your own ZATCA
// account. server/routes/zatca-ksa.js exposes an endpoint that takes the OTP
// you paste in from Settings and does the rest.
const { getEnvironment } = require('./config');

function basicAuthHeader(username, password) {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

async function zatcaFetch(env, pathSuffix, { method = 'POST', body, otp, auth } = {}) {
  const { baseUrl } = getEnvironment(env);
  const headers = {
    'Content-Type': 'application/json',
    'Accept-Version': 'V2',
  };
  if (otp) headers.OTP = otp;
  if (auth) headers.Authorization = basicAuthHeader(auth.username, auth.password);

  const res = await fetch(`${baseUrl}${pathSuffix}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }

  if (!res.ok) {
    const err = new Error(`ZATCA ${pathSuffix} failed (${res.status})`);
    err.status = res.status;
    err.response = json;
    throw err;
  }
  return json;
}

/**
 * Step 2 of ZATCA's rollout: exchange the CSR + OTP for a Compliance CSID.
 * Returns { binarySecurityToken, secret, requestID } - binarySecurityToken
 * is the compliance certificate (base64), secret is the matching password
 * used as Basic Auth for every call made with this certificate.
 */
async function requestComplianceCsid({ env, csrBase64, otp }) {
  return zatcaFetch(env, '/compliance', {
    otp,
    body: { csr: csrBase64 },
  });
}

/**
 * Step 3: submit a sample signed invoice (standard or simplified) so ZATCA
 * can validate your integration before issuing a Production CSID. Call this
 * once per required sample type ZATCA lists in the portal for your wave
 * (typically: standard invoice, standard credit note, standard debit note,
 * simplified invoice, simplified credit note, simplified debit note).
 */
async function runComplianceCheck({ env, complianceToken, complianceSecret, invoiceHash, uuid, invoiceBase64 }) {
  return zatcaFetch(env, '/compliance/invoices', {
    auth: { username: complianceToken, password: complianceSecret },
    body: { invoiceHash, uuid, invoice: invoiceBase64 },
  });
}

/**
 * Step 4: once all required compliance checks pass, exchange the Compliance
 * CSID for a Production CSID. This is the certificate actually used to sign
 * and report/clear real invoices going forward.
 */
async function requestProductionCsid({ env, complianceToken, complianceSecret, complianceRequestId }) {
  return zatcaFetch(env, '/production/csids', {
    auth: { username: complianceToken, password: complianceSecret },
    body: { compliance_request_id: String(complianceRequestId) },
  });
}

module.exports = { requestComplianceCsid, runComplianceCheck, requestProductionCsid, basicAuthHeader };
