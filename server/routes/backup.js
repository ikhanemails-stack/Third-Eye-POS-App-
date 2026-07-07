// Third Eye Computer Solutions - POS System
// Backup and Restore routes.

const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { requireLogin, requireAdmin } = require('../helpers');

const router = express.Router();

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');

// All tables to backup
const TABLES = [
  'settings', 'users', 'products', 'categories',
  'sales', 'customers', 'vendors', 'expenses',
  'employees', 'deliveries', 'purchases'
];

// ── MANUAL BACKUP DOWNLOAD ─────────────────────────────────────────────────
router.get('/backup/download', requireLogin, requireAdmin, async (req, res) => {
  try {
    const backup = {
      version: '1.0',
      createdAt: new Date().toISOString(),
      shopName: '',
      tables: {}
    };

    // Read all tables
    for (const table of TABLES) {
      try {
        backup.tables[table] = await db.all(table);
      } catch (e) {
        backup.tables[table] = [];
      }
    }

    // Get shop name for filename
    const settings = await db.all('settings');
    if (settings && settings[0]) {
      backup.shopName = settings[0].shopName || 'MyShop';
    }

    const date = new Date();
    const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    const filename = `TECS-Backup-${backup.shopName.replace(/[^a-zA-Z0-9]/g,'-')}-${dateStr}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(backup, null, 2));

  } catch (err) {
    console.error('Backup error:', err);
    res.status(500).json({ error: 'Backup failed. Please try again.' });
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
