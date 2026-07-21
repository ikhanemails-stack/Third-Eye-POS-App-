// Third Eye Computer Solutions - License Manager
// Clients (your supermarket customers) and license key generation routes.

const express = require('express');
const db = require('../db');
const { requireLogin } = require('../helpers');
const { generateKey, generateRenewalKey } = require('../license-generator');

const router = express.Router();

// ---------- CLIENTS ----------

router.get('/clients', requireLogin, (req, res) => {
  const clients = db.all('clients');
  const licenses = db.all('licenses');
  // Attach the most recent license to each client for quick status display.
  const enriched = clients.map(c => {
    const clientLicenses = licenses.filter(l => l.clientId === c.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const latest = clientLicenses[0] || null;
    let status = 'no_license';
    if (latest) {
      const expiresAt = new Date(latest.expiresAt);
      const now = new Date();
      const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
      if (daysLeft < 0) status = 'expired';
      else if (daysLeft <= 14) status = 'expiring_soon';
      else status = 'active';
      return { ...c, latestLicense: latest, status, daysLeft };
    }
    return { ...c, latestLicense: null, status };
  });
  enriched.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(enriched);
});

router.get('/clients/:id', requireLogin, (req, res) => {
  const client = db.getById('clients', req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found.' });
  const licenses = db.filter('licenses', l => l.clientId === client.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ ...client, licenses });
});

router.post('/clients', requireLogin, (req, res) => {
  const { shopName, contactName, phone, email, address, shopCode } = req.body;
  if (!shopName) return res.status(400).json({ error: 'Shop name is required.' });
  if (!shopCode) return res.status(400).json({ error: 'Shop code is required.' });

  if (db.find('clients', c => c.shopCode === shopCode)) {
    return res.status(400).json({ error: `Shop code "${shopCode}" is already in use. Choose a unique code.` });
  }

  const client = db.insert('clients', {
    shopName, contactName: contactName || '', phone: phone || '', email: email || '',
    address: address || '', shopCode, notes: '', active: true
  });
  res.json(client);
});

router.put('/clients/:id', requireLogin, (req, res) => {
  const allowed = ['shopName', 'contactName', 'phone', 'email', 'address', 'notes'];
  const updates = {};
  allowed.forEach(key => { if (req.body[key] !== undefined) updates[key] = req.body[key]; });
  const updated = db.update('clients', req.params.id, updates);
  if (!updated) return res.status(404).json({ error: 'Client not found.' });
  res.json(updated);
});

router.delete('/clients/:id', requireLogin, (req, res) => {
  res.json({ success: db.delete('clients', req.params.id) });
});

// Revoke / restore a client's access. Revoking instantly blocks their POS
// software the next time it phones home for a license check (see the public
// verify endpoint below) - it does NOT require deleting the client record,
// so their history (licenses, contact info) is preserved.
router.post('/clients/:id/revoke', requireLogin, (req, res) => {
  const client = db.update('clients', req.params.id, { active: false });
  if (!client) return res.status(404).json({ error: 'Client not found.' });
  res.json(client);
});

router.post('/clients/:id/restore', requireLogin, (req, res) => {
  const client = db.update('clients', req.params.id, { active: true });
  if (!client) return res.status(404).json({ error: 'Client not found.' });
  res.json(client);
});

// ---------- LICENSE GENERATION ----------

router.get('/licenses', requireLogin, (req, res) => {
  const licenses = db.all('licenses').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(licenses);
});

// Generate a brand new license key for a client (e.g. first activation, or a fresh
// full-duration key). Always starts counting from today.
router.post('/clients/:id/generate-license', requireLogin, (req, res) => {
  const client = db.getById('clients', req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found.' });
  const durationDays = Number(req.body.durationDays) || 365;

  const { licenseKey, issuedAt, expiresAt } = generateKey(client.shopCode, durationDays);

  const license = db.insert('licenses', {
    clientId: client.id,
    shopCode: client.shopCode,
    licenseKey,
    durationDays,
    issuedAt,
    expiresAt,
    type: 'new'
  });
  res.json(license);
});

// Generate a renewal key - extends from the current expiry date (or today if
// already expired) so the shop doesn't lose days by renewing early or late.
router.post('/clients/:id/renew-license', requireLogin, (req, res) => {
  const client = db.getById('clients', req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found.' });
  const durationDays = Number(req.body.durationDays) || 365;

  const existingLicenses = db.filter('licenses', l => l.clientId === client.id).sort((a, b) => new Date(b.expiresAt) - new Date(a.expiresAt));
  const currentExpiresAt = existingLicenses[0] ? existingLicenses[0].expiresAt : null;

  const { licenseKey, issuedAt, expiresAt } = generateRenewalKey(client.shopCode, durationDays, currentExpiresAt);

  const license = db.insert('licenses', {
    clientId: client.id,
    shopCode: client.shopCode,
    licenseKey,
    durationDays,
    issuedAt,
    expiresAt,
    type: 'renewal'
  });
  res.json(license);
});

// ---------- DASHBOARD SUMMARY ----------

router.get('/dashboard-summary', requireLogin, (req, res) => {
  const clients = db.all('clients');
  const licenses = db.all('licenses');
  const now = new Date();

  let activeCount = 0, expiredCount = 0, expiringSoonCount = 0;
  clients.forEach(c => {
    const clientLicenses = licenses.filter(l => l.clientId === c.id).sort((a, b) => new Date(b.expiresAt) - new Date(a.expiresAt));
    const latest = clientLicenses[0];
    if (!latest) return;
    const daysLeft = Math.ceil((new Date(latest.expiresAt) - now) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) expiredCount++;
    else if (daysLeft <= 14) expiringSoonCount++;
    else activeCount++;
  });

  res.json({
    totalClients: clients.length,
    activeCount,
    expiringSoonCount,
    expiredCount,
    totalLicensesIssued: licenses.length
  });
});

module.exports = router;
