// Third Eye Computer Solutions - License Manager
// PUBLIC endpoint - called directly by customer POS installations to check
// whether their license is still valid and has not been revoked.
//
// This route deliberately requires NO login, because it is called by the
// POS software running on a customer's computer, not by you.
//
// Security note: this endpoint only ever reveals active/revoked status for
// a shop code that already matches a cryptographically valid, signed license
// key. It never lists clients or leaks any other shop's data.

const express = require('express');
const db = require('../db');
const { verifyKey } = require('../license-verify');

const router = express.Router();

router.post('/public/verify-license', (req, res) => {
  const { licenseKey } = req.body;
  if (!licenseKey) {
    return res.status(400).json({ valid: false, reason: 'No license key provided.' });
  }

  const result = verifyKey(licenseKey);
  if (!result.valid) {
    return res.json({ valid: false, reason: result.reason || 'License key is not valid.' });
  }

  const client = db.find('clients', c => c.shopCode === result.payload.shopCode);
  if (!client) {
    // Signature is valid but no client record exists (e.g. test key, or the
    // client record was permanently deleted). Treat as revoked to be safe.
    return res.json({ valid: false, revoked: true, reason: 'This license is no longer recognized. Please contact Third Eye Computer Solutions.' });
  }

  if (client.active === false) {
    return res.json({ valid: false, revoked: true, reason: 'This license has been deactivated by Third Eye Computer Solutions. Please contact your provider.' });
  }

  // Also re-check expiry server-side, in case the key itself is still within
  // its signature but the admin issued a shorter renewal since.
  const now = new Date();
  const expiresAt = new Date(result.payload.expiresAt);
  if (now > expiresAt) {
    return res.json({ valid: false, expired: true, reason: 'This license has expired. Please contact Third Eye Computer Solutions to renew.' });
  }

  res.json({ valid: true, shopCode: client.shopCode, expiresAt: result.payload.expiresAt });
});

module.exports = router;
