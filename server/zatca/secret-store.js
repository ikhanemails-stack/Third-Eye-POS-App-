// Third Eye Computer Solutions - POS System
// Encrypts ZATCA private keys and API secrets before they're written to the
// database. These are not receipt data - a leaked private key lets someone
// forge signed tax invoices in your name, so they get AES-256-GCM'd with a
// key that only lives in your server's environment variables, never in the
// database itself.
//
// REQUIRED: set ZATCA_ENCRYPTION_KEY in your environment (Railway > your
// service > Variables) before using any ZATCA KSA feature. Generate one
// with:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// Losing this key after go-live means re-onboarding with a new CSID, so
// back it up somewhere safe (a password manager, not a chat message).
const crypto = require('crypto');

function getKey() {
  const hex = process.env.ZATCA_ENCRYPTION_KEY;
  if (!hex || hex.length < 64) {
    throw new Error(
      'ZATCA_ENCRYPTION_KEY is not set (or too short). Set a 32-byte hex ' +
      'key in your environment before using ZATCA KSA features. Generate ' +
      'one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(hex, 'hex');
}

function encrypt(plainText) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':');
}

function decrypt(payload) {
  if (!payload) return null;
  const key = getKey();
  const [ivB64, tagB64, dataB64] = payload.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
}

module.exports = { encrypt, decrypt };
