// Third Eye Computer Solutions - POS System
// License verification module.
//
// HOW IT WORKS:
// 1. On first run: user enters a license key. We verify the key signature
//    locally (no internet needed for this). We then try to confirm with the
//    admin server. If admin server is reachable we save the result.
// 2. After activation: every 5 minutes we quietly check the admin server.
//    If the server says the license is revoked → lock the POS.
//    If the server is unreachable → grant a 3-day grace period.
// 3. Grace period: if we haven't reached the server for 3 days → lock.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const LICENSE_SECRET = 'TECS-BH-2026-9f3a7c1e8d2b4f60a1c9e7d3b5f80246';

// This points to your admin app.
// Locally: http://localhost:5190/api/public/verify-license
// Online:  https://third-eye-admin.onrender.com/api/public/verify-license
const LICENSE_SERVER_URL = process.env.LICENSE_SERVER_URL || 'http://localhost:5190/api/public/verify-license';

const GRACE_PERIOD_DAYS = 3;
const CHECK_INTERVAL_MS = 1000 * 60 * 5; // every 5 minutes

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const LICENSE_FILE = path.join(DATA_DIR, 'license.json');

// ─── Crypto helpers ────────────────────────────────────────────────────────

function base64urlDecode(input) {
  let s = input.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64').toString('utf-8');
}

function sign(payload) {
  return crypto.createHmac('sha256', LICENSE_SECRET).update(payload).digest('hex');
}

// ─── Key verification (fully local, no internet needed) ────────────────────

function verifyKey(licenseKey) {
  if (!licenseKey || typeof licenseKey !== 'string') {
    return { valid: false, reason: 'Please enter a license key.' };
  }

  const parts = licenseKey.trim().split('.');
  if (parts.length !== 2) {
    return { valid: false, reason: 'Invalid license key format. Please check the key and try again.' };
  }

  const [payloadB64, signature] = parts;

  if (sign(payloadB64) !== signature) {
    return { valid: false, reason: 'This license key is not valid. It was not issued by Third Eye Computer Solutions.' };
  }

  let payload;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64));
  } catch (e) {
    return { valid: false, reason: 'License key is corrupted. Please contact Third Eye Computer Solutions.' };
  }

  if (!payload.shopCode || !payload.issuedAt || !payload.expiresAt) {
    return { valid: false, reason: 'License key is missing required information.' };
  }

  if (new Date() > new Date(payload.expiresAt)) {
    return {
      valid: false,
      expired: true,
      reason: `This license expired on ${new Date(payload.expiresAt).toLocaleDateString()}. Please contact Third Eye Computer Solutions to renew.`,
      payload
    };
  }

  return { valid: true, payload };
}

// ─── License file storage ───────────────────────────────────────────────────

function getStoredLicense() {
  if (!fs.existsSync(LICENSE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf-8'));
  } catch (e) {
    return null;
  }
}

function saveLicense(licenseKey, payload, serverVerified) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const now = new Date().toISOString();
  fs.writeFileSync(LICENSE_FILE, JSON.stringify({
    licenseKey,
    shopCode: payload.shopCode,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    activatedAt: now,
    // If we verified with the server, record that. If not, leave null so
    // grace period starts from activation.
    lastVerifiedAt: serverVerified ? now : null,
    revoked: false
  }, null, 2));
}

function updateStoredLicense(updates) {
  const stored = getStoredLicense();
  if (!stored) return;
  fs.writeFileSync(LICENSE_FILE, JSON.stringify(Object.assign({}, stored, updates), null, 2));
}

// ─── Server check (background, non-blocking) ───────────────────────────────

function checkServerRevocation(licenseKey) {
  return new Promise((resolve) => {
    try {
      const url = new URL(LICENSE_SERVER_URL);
      const transport = url.protocol === 'https:' ? https : http;
      const body = JSON.stringify({ licenseKey });

      const req = transport.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 8000
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ reachable: true, ...JSON.parse(data) });
          } catch (e) {
            resolve({ reachable: false });
          }
        });
      });

      req.on('error', () => resolve({ reachable: false }));
      req.on('timeout', () => { req.destroy(); resolve({ reachable: false }); });
      req.write(body);
      req.end();
    } catch (e) {
      resolve({ reachable: false });
    }
  });
}

async function runRevocationCheck() {
  const stored = getStoredLicense();
  if (!stored || stored.revoked) return;

  const result = await checkServerRevocation(stored.licenseKey);

  if (result.reachable) {
    if (result.valid) {
      updateStoredLicense({ lastVerifiedAt: new Date().toISOString(), revoked: false });
    } else if (result.revoked || result.expired) {
      updateStoredLicense({
        revoked: true,
        revokedReason: result.reason || 'License deactivated by Third Eye Computer Solutions.'
      });
    }
  }
  // If not reachable: do nothing — grace period logic handles it in getActivationStatus
}

function startBackgroundChecks() {
  // Run immediately on startup, then every 5 minutes
  runRevocationCheck().catch(() => {});
  setInterval(() => runRevocationCheck().catch(() => {}), CHECK_INTERVAL_MS);
}

// ─── Main status function ───────────────────────────────────────────────────

function getActivationStatus() {
  const stored = getStoredLicense();

  if (!stored) {
    return {
      activated: false,
      reason: 'No license key has been entered. Please enter your license key to continue.'
    };
  }

  // Check local key validity first
  const result = verifyKey(stored.licenseKey);
  if (!result.valid) {
    return {
      activated: false,
      expired: !!result.expired,
      reason: result.reason,
      shopCode: stored.shopCode,
      expiresAt: stored.expiresAt
    };
  }

  // Check if admin revoked it
  if (stored.revoked) {
    return {
      activated: false,
      revoked: true,
      reason: stored.revokedReason || 'This license has been deactivated. Please contact Third Eye Computer Solutions.',
      shopCode: stored.shopCode
    };
  }

  // Grace period check: if we've never verified with the server yet,
  // allow 3 days from activation before requiring a server connection.
  const referenceTime = stored.lastVerifiedAt
    ? new Date(stored.lastVerifiedAt)
    : new Date(stored.activatedAt);

  const graceDeadline = new Date(referenceTime.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  if (new Date() > graceDeadline) {
    return {
      activated: false,
      unreachable: true,
      reason: `This POS has not been able to reach the Third Eye Computer Solutions license server for ${GRACE_PERIOD_DAYS} days. Please make sure your internet connection is working, or contact Third Eye Computer Solutions.`,
      shopCode: stored.shopCode
    };
  }

  const daysLeft = Math.ceil((new Date(result.payload.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));

  return {
    activated: true,
    shopCode: result.payload.shopCode,
    issuedAt: result.payload.issuedAt,
    expiresAt: result.payload.expiresAt,
    daysLeft,
    lastVerifiedAt: stored.lastVerifiedAt
  };
}

function getStatusAndTriggerCheck() {
  // Trigger a background check but return immediately
  runRevocationCheck().catch(() => {});
  return getActivationStatus();
}

// ─── Activation (called when user enters a key for the first time) ──────────

async function activate(licenseKey) {
  // Step 1: verify key signature locally
  const result = verifyKey(licenseKey);
  if (!result.valid) {
    return { success: false, reason: result.reason };
  }

  // Step 2: try to confirm with admin server
  const serverResult = await checkServerRevocation(licenseKey);

  if (serverResult.reachable) {
    if (!serverResult.valid) {
      return {
        success: false,
        reason: serverResult.reason || 'This license could not be verified. It may have been deactivated or expired.'
      };
    }
    // Server confirmed valid
    saveLicense(licenseKey, result.payload, true);
    return { success: true, payload: result.payload };
  } else {
    // Server not reachable during activation.
    // We allow activation anyway because the key signature is valid,
    // but we do NOT set lastVerifiedAt — so the 3-day grace period starts now.
    // If the admin server is still unreachable after 3 days, the POS will lock.
    saveLicense(licenseKey, result.payload, false);
    return {
      success: true,
      payload: result.payload,
      warning: 'License activated offline. Please ensure this computer has internet access within 3 days to complete verification with Third Eye Computer Solutions.'
    };
  }
}

module.exports = {
  verifyKey,
  getActivationStatus,
  getStatusAndTriggerCheck,
  activate,
  runRevocationCheck,
  startBackgroundChecks
};
