// Third Eye Computer Solutions - POS System
// Initializes default data tables on FIRST RUN ONLY.
// Works with BOTH local JSON files AND MongoDB Atlas.

const db     = require('./db');
const bcrypt = require('bcryptjs');

async function seed() {
  // ── CRITICAL FIX: Check if database already has data ────────────────────
  // If ANY of these collections have data, skip ALL seeding
  const existingUsers = await Promise.resolve(db.all('users')).catch(() => []);
  const existingProducts = await Promise.resolve(db.all('products')).catch(() => []);
  
  if ((existingUsers && existingUsers.length > 0) || (existingProducts && existingProducts.length > 0)) {
    console.log('✅ Database already seeded. Skipping initialization to preserve existing data (including licenses).');
    return;
  }

  // ── Shop settings ───────────────────────────────────────────────────────
  db.ensureTable('settings', [{
    id: 1,
    shopName: 'My Supermarket',
    shopNameAr: '',
    logoDataUrl: '',
    address: '',
    phone: '',
    email: '',
    crNumber: '',
    vatNumber: '',
    vatRate: 10,
    currency: 'BHD',
    currencyDecimals: 3,
    language: 'en',
    receiptFooter: 'Thank you for shopping with us!',
    receiptHeader: '',
    receiptFontWeight: 'normal',
    lowStockThreshold: 10,
    receiptPaperWidth: '80mm',
    receiptFontSize: 'normal',
    receiptShowLogo: true,
    loyaltyEnabled: true,
    loyaltyEarnRate: 1,
    loyaltyRedemptionRate: 0.010
  }]);

  // ── Admin user ───────────────────────────────────────────────────────────
  db.ensureTable('users', []);
  const users = await Promise.resolve(db.all('users'));
  if (!users || users.length === 0) {
    await Promise.resolve(db.insert('users', {
      name: 'Admin',
      username: 'admin',
      passwordHash: bcrypt.hashSync('admin123', 10),
      role: 'admin',
      active: true
    }));
    console.log('✅ Default admin account created: username "admin", password "admin123"');
  }

  // ── Categories ───────────────────────────────────────────────────────────
  db.ensureTable('categories', []);
  const cats = await Promise.resolve(db.all('categories'));
  if (!cats || cats.length === 0) {
    for (const name of ['Groceries', 'Beverages', 'Dairy', 'Bakery', 'Household', 'Personal Care']) {
      await Promise.resolve(db.insert('categories', { name }));
    }
  }

  // ── Suppliers ────────────────────────────────────────────────────────────
  db.ensureTable('suppliers', []);

  // ── Products ─────────────────────────────────────────────────────────────
  db.ensureTable('products', []);
  const products = await Promise.resolve(db.all('products'));
  if (!products || products.length === 0) {
    const allCats = await Promise.resolve(db.all('categories'));
    const getCat = name => { const c = allCats.find(x => x.name === name); return c ? c.id : null; };
    const sample = [
      { name: 'Basmati Rice 5kg',    barcode: '6291003023310', categoryId: getCat('Groceries'),  costPrice: 3.500, sellPrice: 4.250, stock: 50, unit: 'bag',    vatApplicable: true  },
      { name: 'Cooking Oil 1.5L',    barcode: '6291003045304', categoryId: getCat('Groceries'),  costPrice: 1.800, sellPrice: 2.300, stock: 40, unit: 'bottle', vatApplicable: true  },
      { name: 'Mineral Water 1.5L',  barcode: '6291003067405', categoryId: getCat('Beverages'),  costPrice: 0.150, sellPrice: 0.250, stock: 200,unit: 'bottle', vatApplicable: true  },
      { name: 'Fresh Milk 1L',       barcode: '6291003089305', categoryId: getCat('Dairy'),      costPrice: 0.500, sellPrice: 0.650, stock: 8,  unit: 'carton', vatApplicable: true  },
      { name: 'White Bread',         barcode: '6291003012406', categoryId: getCat('Bakery'),     costPrice: 0.250, sellPrice: 0.400, stock: 30, unit: 'pack',   vatApplicable: true  },
      { name: 'Dish Soap 750ml',     barcode: '6291003034508', categoryId: getCat('Household'),  costPrice: 0.700, sellPrice: 0.950, stock: 5,  unit: 'bottle', vatApplicable: true  }
    ];
    for (const p of sample) {
      await Promise.resolve(db.insert('products', p));
    }
  }

  // ── Remaining tables ─────────────────────────────────────────────────────
  db.ensureTable('sales', []);
  db.ensureTable('sale_items', []);
  db.ensureTable('customers', []);
  db.ensureTable('coupons', []);
  db.ensureTable('deliveries', []);
  db.ensureTable('expenses', []);
  db.ensureTable('expense_categories', []);
  db.ensureTable('daily_balances', []);

  const existingExpCats = await Promise.resolve(db.all('expense_categories'));
  if (!existingExpCats || existingExpCats.length === 0) {
    for (const name of ['Rent', 'Salaries', 'Utilities', 'Maintenance', 'Transport', 'Miscellaneous']) {
      await Promise.resolve(db.insert('expense_categories', { name }));
    }
  }

  db.ensureTable('vendor_bills', []);
  db.ensureTable('vendor_payments', []);
  db.ensureTable('employees', []);
  db.ensureTable('expiry_items', []);
  db.ensureTable('returns', []);
  db.ensureTable('reminders', []);
  db.ensureTable('cash_sessions', []);
  db.ensureTable('backup_recipients', []);
  db.ensureTable('purchase_items', []);
  db.ensureTable('purchases', []);
  db.ensureTable('stock_movements', []);

  console.log('✅ Database initialized with default data (FIRST RUN ONLY).');
}

module.exports = { seed };