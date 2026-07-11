// Third Eye Computer Solutions - POS System
// Customers module routes - includes loyalty points, tiers, and coupon discounts.

const express = require('express');
const db = require('../db');
const { requireLogin, requireAdmin, roundMoney } = require('../helpers');
const { toCsv, parseCsv } = require('../csv-utils');

const router = express.Router();

// Default tier thresholds (in points). Shop owners can override these via
// Settings; falls back to these values if not configured.
const DEFAULT_TIERS = [
  { name: 'Bronze', minPoints: 0 },
  { name: 'Silver', minPoints: 200 },
  { name: 'Gold', minPoints: 500 },
  { name: 'Diamond', minPoints: 1000 }
];

function getTiers() {
  const settings = db.all('settings')[0];
  if (settings && Array.isArray(settings.loyaltyTiers) && settings.loyaltyTiers.length > 0) {
    return settings.loyaltyTiers;
  }
  return DEFAULT_TIERS;
}

function computeTier(points) {
  const tiers = getTiers();
  const sorted = [...tiers].sort((a, b) => b.minPoints - a.minPoints);
  const match = sorted.find(t => points >= t.minPoints);
  return match ? match.name : sorted[sorted.length - 1].name;
}

router.get('/customers', requireLogin, (req, res) => {
  const customers = db.all('customers').map(c => ({ ...c, loyaltyTier: computeTier(c.loyaltyPoints || 0) }));
  res.json(customers);
});

router.get('/loyalty/tiers', requireLogin, (req, res) => {
  res.json(getTiers());
});

router.post('/customers', requireLogin, (req, res) => {
  const { name, phone, address, creditLimit } = req.body;
  if (!name) return res.status(400).json({ error: 'Customer name is required.' });
  res.json(db.insert('customers', {
    name, phone: phone || '', address: address || '',
    balance: 0, loyaltyPoints: 0, creditLimit: Number(creditLimit) || 0
  }));
});

router.put('/customers/:id', requireLogin, (req, res) => {
  const allowed = ['name', 'phone', 'address', 'creditLimit'];
  const updates = {};
  allowed.forEach(key => { if (req.body[key] !== undefined) updates[key] = key === 'creditLimit' ? (Number(req.body[key]) || 0) : req.body[key]; });
  const updated = db.update('customers', req.params.id, updates);
  if (!updated) return res.status(404).json({ error: 'Customer not found.' });
  res.json(updated);
});

// Record a payment that reduces a customer's outstanding credit balance
// (e.g. they come in and pay off part or all of what they owe).
router.post('/customers/:id/collect-payment', requireLogin, (req, res) => {
  const customer = db.getById('customers', req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found.' });
  const amount = roundMoney(Number(req.body.amount) || 0, 3);
  if (amount <= 0) return res.status(400).json({ error: 'Enter a payment amount greater than zero.' });
  const newBalance = roundMoney(Math.max(0, (customer.balance || 0) - amount), 3);
  const updated = db.update('customers', customer.id, { balance: newBalance });
  db.insert('customer_payments', {
    customerId: customer.id, customerName: customer.name, amount,
    collectedBy: req.session.userName, createdAt: new Date().toISOString()
  });
  res.json(updated);
});

// Credit customers overview - used by the Dashboard "Credit Customers" card.
router.get('/customers/credit-summary', requireLogin, (req, res) => {
  const customers = db.all('customers').filter(c => (c.balance || 0) > 0);
  customers.sort((a, b) => (b.balance || 0) - (a.balance || 0));
  const totalOwed = roundMoney(customers.reduce((sum, c) => sum + (c.balance || 0), 0), 3);
  res.json({
    count: customers.length,
    totalOwed,
    customers: customers.map(c => ({
      id: c.id, name: c.name, phone: c.phone, balance: c.balance || 0,
      creditLimit: c.creditLimit || 0,
      pctOfLimit: c.creditLimit ? Math.round(((c.balance || 0) / c.creditLimit) * 100) : null
    }))
  });
});

router.delete('/customers/:id', requireAdmin, (req, res) => {
  if (Number(req.params.id) === 1) return res.status(400).json({ error: 'Cannot delete the default Walk-in Customer.' });
  res.json({ success: db.delete('customers', req.params.id) });
});

router.post('/customers/bulk-delete', requireAdmin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No customers selected.' });
  let deleted = 0;
  ids.forEach(id => { if (Number(id) !== 1 && db.delete('customers', id)) deleted++; });
  res.json({ success: true, deleted });
});

router.get('/customers/:id/sales', requireLogin, (req, res) => {
  const sales = db.filter('sales', s => s.customerId === Number(req.params.id));
  res.json(sales);
});

// ---------- LOYALTY POINTS ----------
// Earn rate and redemption rate live in settings (loyaltyEarnRate = points
// per 1 BHD spent, loyaltyRedemptionRate = BHD value per point redeemed).

router.post('/customers/:id/adjust-points', requireLogin, (req, res) => {
  const customer = db.getById('customers', req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found.' });
  const delta = Number(req.body.points);
  if (!delta) return res.status(400).json({ error: 'Points adjustment must be a non-zero number.' });
  const newPoints = (customer.loyaltyPoints || 0) + delta;
  if (newPoints < 0) return res.status(400).json({ error: 'Customer does not have enough points for this adjustment.' });
  const updated = db.update('customers', customer.id, { loyaltyPoints: newPoints });
  res.json(updated);
});

// ---------- COUPONS ----------

router.get('/coupons', requireLogin, (req, res) => {
  res.json(db.all('coupons'));
});

router.post('/coupons', requireAdmin, (req, res) => {
  const { code, discountType, discountValue, expiresAt, maxUses } = req.body;
  if (!code) return res.status(400).json({ error: 'Coupon code is required.' });
  if (db.find('coupons', c => c.code.toUpperCase() === code.toUpperCase())) {
    return res.status(400).json({ error: 'A coupon with this code already exists.' });
  }
  if (!['percent', 'fixed'].includes(discountType)) {
    return res.status(400).json({ error: 'Discount type must be "percent" or "fixed".' });
  }
  const coupon = db.insert('coupons', {
    code: code.toUpperCase().trim(),
    discountType,
    discountValue: Number(discountValue),
    expiresAt: expiresAt || null,
    maxUses: maxUses ? Number(maxUses) : null,
    usedCount: 0,
    active: true
  });
  res.json(coupon);
});

router.delete('/coupons/:id', requireAdmin, (req, res) => {
  res.json({ success: db.delete('coupons', req.params.id) });
});

router.put('/coupons/:id', requireAdmin, (req, res) => {
  const { discountType, discountValue, expiresAt, maxUses, active } = req.body;
  const updates = {};
  if (discountType !== undefined) {
    if (!['percent', 'fixed'].includes(discountType)) {
      return res.status(400).json({ error: 'Discount type must be "percent" or "fixed".' });
    }
    updates.discountType = discountType;
  }
  if (discountValue !== undefined) updates.discountValue = Number(discountValue);
  if (expiresAt !== undefined) updates.expiresAt = expiresAt || null;
  if (maxUses !== undefined) updates.maxUses = maxUses ? Number(maxUses) : null;
  if (active !== undefined) updates.active = !!active;
  const updated = db.update('coupons', req.params.id, updates);
  if (!updated) return res.status(404).json({ error: 'Coupon not found.' });
  res.json(updated);
});

// Validates a coupon code against a cart subtotal, without consuming a use.
// Used by the POS checkout screen to preview the discount before payment.
router.post('/coupons/validate', requireLogin, (req, res) => {
  const { code } = req.body;
  const coupon = db.find('coupons', c => c.code === (code || '').toUpperCase().trim());
  if (!coupon || coupon.active === false) {
    return res.status(404).json({ error: 'Coupon code not found or inactive.' });
  }
  if (coupon.expiresAt && new Date() > new Date(coupon.expiresAt)) {
    return res.status(400).json({ error: 'This coupon has expired.' });
  }
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
    return res.status(400).json({ error: 'This coupon has reached its usage limit.' });
  }
  res.json(coupon);
});

// ---------- CSV EXPORT / IMPORT ----------

const CUSTOMER_CSV_COLUMNS = [
  { key: 'name', header: 'Customer Name' },
  { key: 'phone', header: 'Phone' },
  { key: 'address', header: 'Address' },
  { key: 'loyaltyPoints', header: 'Loyalty Points' }
];

router.get('/customers/export/csv', requireLogin, (req, res) => {
  const customers = db.all('customers').map(c => ({ ...c, loyaltyPoints: c.loyaltyPoints || 0 }));
  const csv = toCsv(customers, CUSTOMER_CSV_COLUMNS);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="customers-export-${Date.now()}.csv"`);
  res.send('\uFEFF' + csv);
});

router.get('/customers/import/template', requireLogin, (req, res) => {
  const sampleRows = [{ name: 'Example Customer', phone: '+97333334444', address: 'Manama, Bahrain', loyaltyPoints: 0 }];
  const csv = toCsv(sampleRows, CUSTOMER_CSV_COLUMNS);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="customers-import-template.csv"');
  res.send('\uFEFF' + csv);
});

router.post('/customers/import/csv', requireAdmin, (req, res) => {
  const { csvText } = req.body;
  if (!csvText) return res.status(400).json({ error: 'No CSV content received.' });

  let rows;
  try {
    rows = parseCsv(csvText);
  } catch (e) {
    return res.status(400).json({ error: 'Could not parse this file as CSV.' });
  }
  if (rows.length === 0) return res.status(400).json({ error: 'The file appears to be empty.' });

  let created = 0, updated = 0, skipped = 0;
  const errors = [];

  rows.forEach((row, idx) => {
    const name = row['Customer Name'] || row['name'];
    if (!name) {
      skipped++;
      errors.push(`Row ${idx + 2}: missing customer name.`);
      return;
    }
    const phone = (row['Phone'] || row['phone'] || '').trim();
    const address = (row['Address'] || row['address'] || '').trim();
    const loyaltyPoints = Number(row['Loyalty Points'] || row['loyaltyPoints'] || 0) || 0;

    const existing = phone ? db.find('customers', c => c.phone === phone) : null;
    if (existing) {
      db.update('customers', existing.id, { name, address, loyaltyPoints });
      updated++;
    } else {
      db.insert('customers', { name, phone, address, balance: 0, loyaltyPoints });
      created++;
    }
  });

  res.json({ success: true, created, updated, skipped, errors: errors.slice(0, 20) });
});

module.exports = router;
