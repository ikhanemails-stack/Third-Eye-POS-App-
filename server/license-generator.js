// Third Eye Computer Solutions - License Manager
// License key generation module.
//
// This SECRET must match the one in pos-app/server/license.js EXACTLY.
// Keep this file and the secret confidential - this is what lets you
// control who can activate the POS software.

const crypto = require('crypto');

const LICENSE_SECRET = 'TECS-BH-2026-9f3a7c1e8d2b4f60a1c9e7d3b5f80246';

function base64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(payload) {
  return crypto.createHmac('sha256', LICENSE_SECRET).update(payload).digest('hex');
}

// Generates a signed license key.
// shopCode: a unique code identifying the shop (e.g. "ALOSRA-MANAMA-01")
// durationDays: how many days from now until expiry
function generateKey(shopCode, durationDays) {
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
  const payload = { shopCode, issuedAt, expiresAt };
  const payloadB64 = base64url(JSON.stringify(payload));
  const signature = sign(payloadB64);
  const licenseKey = `${payloadB64}.${signature}`;
  return { licenseKey, issuedAt, expiresAt };
}

// Generates a renewal key that extends from a given expiry date (or now,
// whichever is later) rather than always starting from today. Useful if a
// shop renews a few days early or late and you don't want them to lose days.
function generateRenewalKey(shopCode, durationDays, currentExpiresAt) {
  const now = Date.now();
  const currentExpiry = currentExpiresAt ? new Date(currentExpiresAt).getTime() : now;
  const baseTime = Math.max(now, currentExpiry);
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(baseTime + durationDays * 24 * 60 * 60 * 1000).toISOString();
  const payload = { shopCode, issuedAt, expiresAt };
  const payloadB64 = base64url(JSON.stringify(payload));
  const signature = sign(payloadB64);
  const licenseKey = `${payloadB64}.${signature}`;
  return { licenseKey, issuedAt, expiresAt };
}

module.exports = {
  generateKey,
  generateRenewalKey
};
