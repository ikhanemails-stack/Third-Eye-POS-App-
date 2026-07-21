// Third Eye Computer Solutions - License Manager
// License key verification logic - used ONLY by the public revocation-check
// endpoint, so the admin app can confirm a key's signature is genuinely one
// it issued. This mirrors pos-app/server/license.js exactly; the secret here
// MUST stay identical to the one in pos-app.

const crypto = require('crypto');

const LICENSE_SECRET = 'TECS-BH-2026-9f3a7c1e8d2b4f60a1c9e7d3b5f80246';

function base64urlDecode(input) {
  let s = input.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64').toString('utf-8');
}

function sign(payload) {
  return crypto.createHmac('sha256', LICENSE_SECRET).update(payload).digest('hex');
}

function verifyKey(licenseKey) {
  if (!licenseKey || typeof licenseKey !== 'string' || !licenseKey.includes('.')) {
    return { valid: false, reason: 'Invalid license key format.' };
  }
  const parts = licenseKey.trim().split('.');
  if (parts.length !== 2) {
    return { valid: false, reason: 'Invalid license key format.' };
  }
  const [payloadB64, signature] = parts;
  const expectedSignature = sign(payloadB64);

  if (signature !== expectedSignature) {
    return { valid: false, reason: 'License key signature is invalid.' };
  }

  let payload;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64));
  } catch (e) {
    return { valid: false, reason: 'License key is corrupted.' };
  }

  if (!payload.shopCode || !payload.expiresAt) {
    return { valid: false, reason: 'License key is missing required data.' };
  }

  return { valid: true, payload };
}

module.exports = { verifyKey };
