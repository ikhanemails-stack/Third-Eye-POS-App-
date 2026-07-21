// Third Eye Computer Solutions - POS System
// Single source of truth for "what does a backup contain" - used by the
// manual download route, the restore route, the /backup/send-now route,
// and the midnight auto-backup scheduler, so all of them always agree on
// exactly the same set of data. This list used to be duplicated separately
// in server/routes/backup.js and had drifted out of sync with it - several
// tables (all the line-items tables, the whole Quotations module, drivers,
// suppliers, stock movements, and more) were silently missing from backups
// and restores as a result. Fixed by having routes/backup.js import this
// list instead of keeping its own copy.

const db = require('./db');

// Every real data table in the app, kept backed up and restorable together.
// Product photos are stored as inline base64 data URLs directly on the
// product record, not as separate files on disk - so backing up the
// `products` table already carries every product's image with it
// automatically, no separate image-export step needed.
const TABLES = [
  'settings', 'users',
  'products', 'categories', 'suppliers',
  'sales', 'sale_items',
  'customers', 'customer_payments', 'coupons',
  'purchases', 'purchase_items',
  'quotations', 'quotation_items',
  'deliveries', 'drivers',
  'expenses', 'expense_categories', 'daily_balances', 'cash_sessions',
  'employees',
  'vendor_bills', 'vendor_payments',
  'stock_movements', 'expiry_items', 'returns',
  'reminders', 'backup_recipients',
  'zatca_ksa', 'zatca_invoice_log'
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
