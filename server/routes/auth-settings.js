// Third Eye Computer Solutions - POS System
// Auth + Settings routes.

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireLogin, requireAdmin } = require('../helpers');

const router = express.Router();

// ---------- AUTH ----------

router.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;

  // Force a fresh revocation/expiry check against the license server before
  // allowing login, rather than relying on the background timer alone. This
  // is what makes "I just revoked this client" take effect immediately the
  // next time someone tries to use the till, instead of waiting for the
  // next scheduled background check.
  const license = require('../license');
  await license.runRevocationCheck();
  const status = license.getActivationStatus();
  if (!status.activated) {
    return res.status(402).json({ error: 'LICENSE_INVALID', details: status });
  }

  const user = db.find('users', u => u.username === username && u.active !== false);
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.userName = user.name;
  res.json({ id: user.id, name: user.name, role: user.role });
});

router.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

router.get('/auth/me', (req, res) => {
  if (!req.session || !req.session.userId) return res.json(null);
  res.json({ id: req.session.userId, name: req.session.userName, role: req.session.role });
});

// ---------- USERS (staff management - admin only) ----------

router.get('/users', requireAdmin, (req, res) => {
  const users = db.all('users').map(u => ({ id: u.id, name: u.name, username: u.username, role: u.role, active: u.active }));
  res.json(users);
});

router.post('/users', requireAdmin, (req, res) => {
  const { name, username, password, role } = req.body;
  if (!name || !username || !password) return res.status(400).json({ error: 'Name, username and password are required.' });
  if (db.find('users', u => u.username === username)) {
    return res.status(400).json({ error: 'Username already exists.' });
  }
  const user = db.insert('users', {
    name, username,
    passwordHash: bcrypt.hashSync(password, 10),
    role: role === 'admin' ? 'admin' : 'cashier',
    active: true
  });
  res.json({ id: user.id, name: user.name, username: user.username, role: user.role });
});

router.put('/users/:id', requireAdmin, (req, res) => {
  const updates = {};
  if (req.body.name) updates.name = req.body.name;
  if (req.body.role) updates.role = req.body.role === 'admin' ? 'admin' : 'cashier';
  if (typeof req.body.active === 'boolean') updates.active = req.body.active;
  if (req.body.password) updates.passwordHash = bcrypt.hashSync(req.body.password, 10);
  const user = db.update('users', req.params.id, updates);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ id: user.id, name: user.name, username: user.username, role: user.role, active: user.active });
});

router.delete('/users/:id', requireAdmin, (req, res) => {
  if (Number(req.params.id) === req.session.userId) {
    return res.status(400).json({ error: 'You cannot delete your own account while logged in.' });
  }
  const ok = db.delete('users', req.params.id);
  res.json({ success: ok });
});

// ---------- SETTINGS (shop branding / configuration) ----------

router.get('/settings', (req, res) => {
  const settings = db.all('settings')[0] || {};
  res.json(settings);
});

router.put('/settings', requireAdmin, (req, res) => {
  const current = db.all('settings')[0];
  const allowed = ['shopName', 'shopNameAr', 'logoDataUrl', 'address', 'phone', 'email',
    'crNumber', 'vatNumber', 'vatRate', 'currency', 'currencyDecimals', 'language',
    'receiptFooter', 'lowStockThreshold', 'loyaltyEnabled', 'loyaltyEarnRate', 'loyaltyRedemptionRate', 'loyaltyTiers',
    'receiptPaperWidth', 'receiptShowLogo', 'receiptFontSize'];
  const updates = {};
  allowed.forEach(key => {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  });
  const updated = db.update('settings', current.id, updates);
  res.json(updated);
});

module.exports = router;
