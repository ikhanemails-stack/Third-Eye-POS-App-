// Third Eye Computer Solutions - POS System
// Auth + Settings routes.
// ALL db calls use await so this works with both local JSON and MongoDB.

const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../db');
const { requireLogin, requireAdmin } = require('../helpers');

const router = express.Router();

// ── AUTH ──────────────────────────────────────────────────────────────────

router.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Check license before allowing login
    const license = require('../license');
    await license.runRevocationCheck();
    const status = license.getActivationStatus();
    if (!status.activated) {
      return res.status(402).json({ error: 'LICENSE_INVALID', details: status });
    }

    // IMPORTANT: await db.find() — works with both MongoDB and local JSON
    const user = await Promise.resolve(db.find('users', u => u.username === username && u.active !== false));
    if (!user || !bcrypt.compareSync(password || '', user.passwordHash || '')) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }
    req.session.userId   = user.id;
    req.session.role     = user.role;
    req.session.userName = user.name;
    res.json({ id: user.id, name: user.name, role: user.role });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

router.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

router.get('/auth/me', (req, res) => {
  if (!req.session || !req.session.userId) return res.json(null);
  res.json({ id: req.session.userId, name: req.session.userName, role: req.session.role });
});

// ── USERS (staff management) ──────────────────────────────────────────────

router.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await Promise.resolve(db.all('users'));
    res.json(users.map(u => ({ id: u.id, name: u.name, username: u.username, role: u.role, active: u.active })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/users', requireAdmin, async (req, res) => {
  try {
    const { name, username, password, role } = req.body;
    if (!name || !username || !password) return res.status(400).json({ error: 'Name, username and password are required.' });
    const existing = await Promise.resolve(db.find('users', u => u.username === username));
    if (existing) return res.status(400).json({ error: 'Username already exists.' });
    const user = await Promise.resolve(db.insert('users', {
      name, username,
      passwordHash: bcrypt.hashSync(password, 10),
      role: role || 'cashier',
      active: true
    }));
    res.json({ id: user.id, name: user.name, username: user.username, role: user.role, active: user.active });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/users/:id', requireAdmin, async (req, res) => {
  try {
    const { name, password, role, active } = req.body;
    const updates = { name, role, active };
    if (password) updates.passwordHash = bcrypt.hashSync(password, 10);
    const user = await Promise.resolve(db.update('users', req.params.id, updates));
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ id: user.id, name: user.name, username: user.username, role: user.role, active: user.active });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    const me = await Promise.resolve(db.getById('users', req.session.userId));
    if (me && me.id === Number(req.params.id)) return res.status(400).json({ error: 'You cannot delete your own account.' });
    await Promise.resolve(db.delete('users', req.params.id));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/auth/change-password', requireLogin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both current and new passwords are required.' });
    const user = await Promise.resolve(db.getById('users', req.session.userId));
    if (!user || !bcrypt.compareSync(currentPassword, user.passwordHash || '')) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
    await Promise.resolve(db.update('users', user.id, { passwordHash: bcrypt.hashSync(newPassword, 10) }));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SETTINGS ──────────────────────────────────────────────────────────────

// ── COUNTRY / VAT CONFIG (for the Settings screen's country dropdown) ─────
// Read-only reference data - lets the frontend auto-fill VAT rate, currency,
// VAT label and whether a ZATCA QR is required, whenever the admin picks a
// different country. See server/tax-config.js for the full explanation and
// accuracy notes (e.g. Qatar/Kuwait VAT not yet in force).
router.get('/tax-config', requireLogin, (req, res) => {
  const { COUNTRY_TAX_CONFIG } = require('../tax-config');
  res.json(COUNTRY_TAX_CONFIG);
});

router.get('/settings', requireLogin, async (req, res) => {
  try {
    const all = await Promise.resolve(db.all('settings'));
    res.json((all && all[0]) || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/settings', requireAdmin, async (req, res) => {
  try {
    const all = await Promise.resolve(db.all('settings'));
    const current = all && all[0];
    let updated;
    if (current) {
      updated = await Promise.resolve(db.update('settings', current.id, req.body));
      // Guard against duplicate settings documents (an earlier bug could
      // leave more than one behind) - clean up any extras so a later
      // reload can't randomly pick a stale duplicate that looks like the
      // save "didn't stick".
      if (all.length > 1) {
        for (const extra of all.slice(1)) await Promise.resolve(db.delete('settings', extra.id));
      }
    } else {
      updated = await Promise.resolve(db.insert('settings', { id: 1, ...req.body }));
    }
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
