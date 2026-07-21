// Third Eye Computer Solutions - License Manager
// Auth routes.

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');

const router = express.Router();

router.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  const admin = db.find('admin_users', u => u.username === username);
  if (!admin || !bcrypt.compareSync(password || '', admin.passwordHash)) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  req.session.adminId = admin.id;
  req.session.adminName = admin.name;
  res.json({ id: admin.id, name: admin.name });
});

router.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

router.get('/auth/me', (req, res) => {
  if (!req.session || !req.session.adminId) return res.json(null);
  res.json({ id: req.session.adminId, name: req.session.adminName });
});

router.put('/auth/password', (req, res) => {
  if (!req.session || !req.session.adminId) return res.status(401).json({ error: 'Not logged in.' });
  const { currentPassword, newPassword } = req.body;
  const admin = db.getById('admin_users', req.session.adminId);
  if (!bcrypt.compareSync(currentPassword || '', admin.passwordHash)) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }
  db.update('admin_users', admin.id, { passwordHash: bcrypt.hashSync(newPassword, 10) });
  res.json({ success: true });
});

module.exports = router;
