// Third Eye Computer Solutions - POS System
// Single source of truth for "what does a backup contain" - used by the
// manual download route, the /backup/send-now route, and the midnight
// auto-backup scheduler, so all three always produce identical files.

const db = require('./db');

const TABLES = [
  'settings', 'users', 'products', 'categories',
  'sales', 'customers', 'vendors', 'expenses',
  'employees', 'deliveries', 'purchases'
];

async function buildBackupObjectForMailer() {
  const backup = {
    version: '1.0',
    createdAt: new Date().toISOString(),
    shopName: '',
    tables: {}
  };

  for (const table of TABLES) {
    try {
      backup.tables[table] = await db.all(table);
    } catch (e) {
      backup.tables[table] = [];
    }
  }

  const settings = await db.all('settings');
  if (settings && settings[0]) {
    backup.shopName = settings[0].shopName || 'MyShop';
  }

  const date = new Date();
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const filename = `TECS-Backup-${backup.shopName.replace(/[^a-zA-Z0-9]/g, '-')}-${dateStr}.json`;

  return { backup, filename };
}

module.exports = { buildBackupObjectForMailer, TABLES };
