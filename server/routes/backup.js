// Third Eye Computer Solutions - POS System
// Backup and Restore routes.

const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { requireLogin, requireAdmin } = require('../helpers');

const router = express.Router();

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');

const { buildBackupObjectForMailer, TABLES } = require('../backup-shared');

// ── MANUAL BACKUP DOWNLOAD ─────────────────────────────────────────────────
router.get('/backup/download', requireLogin, requireAdmin, async (req, res) => {
  try {
    const { backup, filename } = await buildBackupObjectForMailer();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(backup, null, 2));
  } catch (err) {
    console.error('Backup error:', err);
    res.status(500).json({ error: 'Backup failed. Please try again.' });
  }
});

// ── EMAIL RECIPIENTS (add / edit / delete) ─────────────────────────────────
// Stored via the normal db abstraction, so this works identically whether
// the shop is on local JSON storage or MongoDB.
router.get('/backup/recipients', requireLogin, requireAdmin, async (req, res) => {
  res.json(await db.all('backup_recipients'));
});

router.post('/backup/recipients', requireLogin, requireAdmin, async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  const existing = await db.all('backup_recipients');
  if (existing.find(r => r.email === email)) {
    return res.status(400).json({ error: 'That email is already on the list.' });
  }
  const rec = db.insert('backup_recipients', { email });
  res.json(rec);
});

router.put('/backup/recipients/:id', requireLogin, requireAdmin, async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  const updated = db.update('backup_recipients', req.params.id, { email });
  if (!updated) return res.status(404).json({ error: 'Recipient not found.' });
  res.json(updated);
});

router.delete('/backup/recipients/:id', requireLogin, requireAdmin, async (req, res) => {
  res.json({ success: db.delete('backup_recipients', req.params.id) });
});

// ── MANUAL "SEND NOW" (send today's backup to all recipients immediately,
// useful for testing SMTP setup without waiting for midnight) ──────────────
router.post('/backup/send-now', requireLogin, requireAdmin, async (req, res) => {
  try {
    const { runBackupAndEmail } = require('../backup-mailer');
    const result = await runBackupAndEmail();
    res.json(result);
  } catch (err) {
    console.error('Send-now backup error:', err);
    res.status(500).json({ error: err.message || 'Failed to send backup email.' });
  }
});

// ── BACKUP STATUS (for auto-backup scheduling) ─────────────────────────────
router.get('/backup/status', requireLogin, async (req, res) => {
  const lastBackupFile = path.join(DATA_DIR, 'last-backup.json');
  let lastBackup = null;
  try {
    if (fs.existsSync(lastBackupFile)) {
      lastBackup = JSON.parse(fs.readFileSync(lastBackupFile, 'utf-8'));
    }
  } catch (e) {}
  res.json({ lastBackup });
});

// ── RESTORE FROM BACKUP ────────────────────────────────────────────────────
router.post('/backup/restore', requireLogin, requireAdmin, async (req, res) => {
  try {
    const backup = req.body;

    if (!backup || !backup.version || !backup.tables) {
      return res.status(400).json({ error: 'Invalid backup file. Please upload a valid TECS backup file.' });
    }

    const restored = [];
    const failed = [];

    for (const table of TABLES) {
      if (backup.tables[table] && Array.isArray(backup.tables[table])) {
        try {
          await db.replaceAll(table, backup.tables[table]);
          restored.push(table);
        } catch (e) {
          failed.push(table);
        }
      }
    }

    // Save restore record
    const lastBackupFile = path.join(DATA_DIR, 'last-backup.json');
    fs.writeFileSync(lastBackupFile, JSON.stringify({
      restoredAt: new Date().toISOString(),
      originalBackupDate: backup.createdAt,
      tablesRestored: restored.length
    }, null, 2));

    res.json({
      success: true,
      message: `Restore complete! ${restored.length} data tables restored successfully.`,
      restored,
      failed
    });

  } catch (err) {
    console.error('Restore error:', err);
    res.status(500).json({ error: 'Restore failed. Please make sure you uploaded a valid backup file.' });
  }
});

module.exports = router;
