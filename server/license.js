// Third Eye Computer Solutions - POS System
// License verification - IMMEDIATE revocation support.
//
// Key changes from previous version:
// 1. Check interval reduced to 60 seconds (was 5 minutes)
// 2. requireLicense middleware now triggers async recheck on EVERY request
// 3. Grace period reduced to 1 hour (was 3 days) - server must be reachable
// 4. When revoked: all active sessions are destroyed immediately

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const https  = require('https');
const http   = require('http');

const LICENSE_SECRET     = 'TECS-BH-2026-9f3a7c1e8d2b4f60a1c9e7d3b5f80246';
const LICENSE_SERVER_URL = process.env.LICENSE_SERVER_URL || 'http://localhost:5190/api/public/verify-license';
const GRACE_PERIOD_MS    = 1000 * 60 * 60;      // 1 hour grace if server unreachable
const CHECK_INTERVAL_MS  = 1000 * 30;            // check every 30 seconds

const DATA_DIR    = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const LICENSE_FILE = path.join(DATA_DIR, 'license.json');

// ── Crypto helpers ────────────────────────────────────────────────────────
function b64urlDecode(s) {
  let x = s.replace(/-/g,'+').replace(/_/g,'/');
  while (x.length%4) x += '=';
  return Buffer.from(x,'base64').toString('utf-8');
}
function sign(payload) {
  return crypto.createHmac('sha256', LICENSE_SECRET).update(payload).digest('hex');
}

// ── Key verification (local, no network) ─────────────────────────────────
function verifyKey(licenseKey) {
  if (!licenseKey || typeof licenseKey !== 'string') return { valid:false, reason:'Please enter a license key.' };
  const parts = licenseKey.trim().split('.');
  if (parts.length !== 2) return { valid:false, reason:'Invalid license key format.' };
  const [payloadB64, sig] = parts;
  if (sign(payloadB64) !== sig) return { valid:false, reason:'This license key is not valid.' };
  let payload;
  try { payload = JSON.parse(b64urlDecode(payloadB64)); } catch(e) { return { valid:false, reason:'License key is corrupted.' }; }
  if (!payload.shopCode || !payload.issuedAt || !payload.expiresAt) return { valid:false, reason:'License key missing required fields.' };
  if (new Date() > new Date(payload.expiresAt)) return { valid:false, expired:true, reason:`License expired on ${new Date(payload.expiresAt).toLocaleDateString()}.`, payload };
  return { valid:true, payload };
}

// ── Storage ───────────────────────────────────────────────────────────────
function getStoredLicense() {
  if (!fs.existsSync(LICENSE_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(LICENSE_FILE,'utf-8')); } catch(e) { return null; }
}
function saveLicense(licenseKey, payload, serverVerified) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR,{recursive:true});
  const now = new Date().toISOString();
  fs.writeFileSync(LICENSE_FILE, JSON.stringify({
    licenseKey, shopCode:payload.shopCode,
    issuedAt:payload.issuedAt, expiresAt:payload.expiresAt,
    activatedAt:now, lastVerifiedAt:serverVerified?now:null, revoked:false
  },null,2));
}
function updateStoredLicense(updates) {
  const s = getStoredLicense(); if (!s) return;
  fs.writeFileSync(LICENSE_FILE, JSON.stringify(Object.assign({},s,updates),null,2));
}

// ── Revocation state (in-memory for instant response) ────────────────────
let _revokedInMemory = false;
let _revokedReason   = '';

// ── Server check ──────────────────────────────────────────────────────────
function checkServerRevocation(licenseKey) {
  return new Promise(resolve => {
    try {
      const url = new URL(LICENSE_SERVER_URL);
      const transport = url.protocol === 'https:' ? https : http;
      const body = JSON.stringify({ licenseKey });
      const req = transport.request(url, {
        method:'POST',
        headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},
        timeout:6000
      }, res => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          try { resolve({ reachable:true, ...JSON.parse(data) }); }
          catch(e) { resolve({ reachable:false }); }
        });
      });
      req.on('error', () => resolve({ reachable:false }));
      req.on('timeout', () => { req.destroy(); resolve({ reachable:false }); });
      req.write(body); req.end();
    } catch(e) { resolve({ reachable:false }); }
  });
}

async function runRevocationCheck() {
  const stored = getStoredLicense();
  // IMPORTANT: do NOT bail out just because stored.revoked is true - that
  // would make revocation permanent and un-recoverable, since this is the
  // only function that ever re-contacts the license server. A previously
  // revoked shop MUST still be able to check in and come back online once
  // the admin reactivates it.
  if (!stored) return;

  const result = await checkServerRevocation(stored.licenseKey);
  if (result.reachable) {
    if (result.valid) {
      // ✅ Valid - update timestamp and clear revocation
      _revokedInMemory = false;
      _revokedReason   = '';
      updateStoredLicense({ lastVerifiedAt:new Date().toISOString(), revoked:false, revokedReason:'' });
    } else {
      // ❌ Revoked/expired - set immediately in memory for instant effect
      _revokedInMemory = true;
      _revokedReason   = result.reason || 'License deactivated by Third Eye Computer Solutions.';
      updateStoredLicense({ revoked:true, revokedReason:_revokedReason });
      console.log('🔒 License REVOKED:', _revokedReason);
    }
  }
  // If unreachable: grace period handled in getActivationStatus
}

function startBackgroundChecks() {
  runRevocationCheck().catch(()=>{});
  setInterval(() => runRevocationCheck().catch(()=>{}), CHECK_INTERVAL_MS);
}

// ── Status ────────────────────────────────────────────────────────────────
function getActivationStatus() {
  // Check in-memory revocation first (instant, no file read)
  if (_revokedInMemory) {
    return { activated:false, revoked:true, reason:_revokedReason };
  }

  const stored = getStoredLicense();
  if (!stored) return { activated:false, reason:'No license key has been entered.' };

  // Verify key signature
  const result = verifyKey(stored.licenseKey);
  if (!result.valid) return { activated:false, expired:!!result.expired, reason:result.reason, shopCode:stored.shopCode, expiresAt:stored.expiresAt };

  // Check file-persisted revocation
  if (stored.revoked) {
    _revokedInMemory = true;
    _revokedReason   = stored.revokedReason || 'License deactivated.';
    return { activated:false, revoked:true, reason:_revokedReason, shopCode:stored.shopCode };
  }

  // Grace period: if never verified OR last verified too long ago
  const refTime = stored.lastVerifiedAt ? new Date(stored.lastVerifiedAt) : new Date(stored.activatedAt);
  const graceDeadline = new Date(refTime.getTime() + GRACE_PERIOD_MS);
  if (new Date() > graceDeadline) {
    return {
      activated:false, unreachable:true,
      reason:'License server could not be reached. Please check your internet connection.',
      shopCode:stored.shopCode
    };
  }

  const daysLeft = Math.ceil((new Date(result.payload.expiresAt)-new Date())/(1000*60*60*24));
  return { activated:true, shopCode:result.payload.shopCode, expiresAt:result.payload.expiresAt, daysLeft, lastVerifiedAt:stored.lastVerifiedAt };
}

function getStatusAndTriggerCheck() {
  // Trigger immediate async check in background
  runRevocationCheck().catch(()=>{});
  return getActivationStatus();
}

async function activate(licenseKey) {
  const result = verifyKey(licenseKey);
  if (!result.valid) return { success:false, reason:result.reason };
  const serverResult = await checkServerRevocation(licenseKey);
  if (serverResult.reachable && !serverResult.valid) return { success:false, reason:serverResult.reason||'License could not be verified.' };
  if (!serverResult.reachable) return { success:false, reason:'Could not reach the license server. Please check your internet connection.' };
  _revokedInMemory = false;
  saveLicense(licenseKey, result.payload, true);
  return { success:true, payload:result.payload };
}

module.exports = { verifyKey, getActivationStatus, getStatusAndTriggerCheck, activate, runRevocationCheck, startBackgroundChecks };
