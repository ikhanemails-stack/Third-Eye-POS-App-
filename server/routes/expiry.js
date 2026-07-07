// Third Eye Computer Solutions - POS System
// Expiry tracking & supplier returns module.
// Tracks product expiry status (computed live from products.expiryDate) and
// records items returned to suppliers (expired, damaged, overstocked, etc.)
// with automatic stock deduction.

const express = require('express');
const db = require('../db');
const { requireLogin, requireAdmin, roundMoney } = require('../helpers');

const router = express.Router();

const DAY_MS = 24 * 60 * 60 * 1000;

function expiryStatus(expiryDate) {
  if (!expiryDate) return null;
  const days = Math.ceil((new Date(expiryDate) - new Date()) / DAY_MS);
  if (days < 0) return { status: 'expired', daysLeft: days };
  if (days <= 7) return { status: 'critical', daysLeft: days };
  if (days <= 30) return { status: 'warning', daysLeft: days };
  return { status: 'ok', daysLeft: days };
}

// ---------- EXPIRY TRACKING (computed live from product.expiryDate) ----------

router.get('/expiry/tracked', requireLogin, (req, res) => {
  const products = db.all('products').filter(p => p.expiryDate);
  const suppliers = db.all('suppliers');
  const tracked = products.map(p => {
    const supplier = suppliers.find(s => s.id === p.supplierId);
    return {
      ...p,
      supplierName: supplier ? supplier.name : '',
      ...expiryStatus(p.expiryDate)
    };
  });
  tracked.sort((a, b) => a.daysLeft - b.daysLeft);
  res.json(tracked);
});

// ---------- MANUALLY-TRACKED EXPIRY ITEMS (not full products, e.g. quick entries) ----------

router.get('/expiry/items', requireLogin, (req, res) => {
  const items = db.all('expiry_items').map(i => ({ ...i, ...expiryStatus(i.expiryDate) }));
  items.sort((a, b) => a.daysLeft - b.daysLeft);
  res.json(items);
});

router.post('/expiry/items', requireLogin, (req, res) => {
  const { itemName, quantity, unit, cost, expiryDate, supplierId, supplierName } = req.body;
  if (!itemName || !expiryDate) return res.status(400).json({ error: 'Item name and expiry date are required.' });

  let finalSupplierId = supplierId ? Number(supplierId) : null;
  if (!finalSupplierId && supplierName) {
    const created = db.insert('suppliers', { name: supplierName, phone: '', email: '', address: '' });
    finalSupplierId = created.id;
  }

  const item = db.insert('expiry_items', {
    itemName,
    quantity: Number(quantity) || 1,
    unit: unit || 'pcs',
    cost: Number(cost) || 0,
    expiryDate,
    supplierId: finalSupplierId
  });
  res.json(item);
});

router.delete('/expiry/items/:id', requireAdmin, (req, res) => {
  res.json({ success: db.delete('expiry_items', req.params.id) });
});

// ---------- SUPPLIER RETURNS ----------

const RETURN_REASONS = ['expired', 'near_expiry', 'damaged', 'quality_issue', 'overstocked'];

router.get('/returns', requireLogin, (req, res) => {
  const { reason } = req.query;
  let returns = db.all('returns');
  if (reason) returns = returns.filter(r => r.reason === reason);
  returns.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(returns);
});

// Records a return to supplier. If productId is given, stock is
// automatically deducted from that product (mirrors a real stock-out).
router.post('/returns', requireLogin, (req, res) => {
  const { productId, itemName, supplierId, reason, quantity, unitCost, notes } = req.body;
  if (!RETURN_REASONS.includes(reason)) {
    return res.status(400).json({ error: `Reason must be one of: ${RETURN_REASONS.join(', ')}` });
  }
  const qty = Number(quantity);
  if (!qty || qty <= 0) return res.status(400).json({ error: 'A valid quantity is required.' });

  let resolvedItemName = itemName || '';
  let resolvedUnitCost = Number(unitCost) || 0;

  if (productId) {
    const product = db.getById('products', productId);
    if (!product) return res.status(400).json({ error: 'Product not found.' });
    if (product.stock < qty) return res.status(400).json({ error: `Insufficient stock. Available: ${product.stock}.` });
    resolvedItemName = resolvedItemName || product.name;
    resolvedUnitCost = resolvedUnitCost || product.costPrice;
    db.update('products', product.id, { stock: product.stock - qty });
    db.insert('stock_movements', {
      productId: product.id, type: 'return', quantity: -qty,
      note: `Returned to supplier (${reason})`, userId: req.session.userId
    });
  }

  const totalCost = roundMoney(resolvedUnitCost * qty, 3);
  const ret = db.insert('returns', {
    productId: productId || null,
    itemName: resolvedItemName,
    supplierId: supplierId ? Number(supplierId) : null,
    reason,
    quantity: qty,
    unitCost: resolvedUnitCost,
    totalCost,
    notes: notes || '',
    userId: req.session.userId
  });
  res.json(ret);
});

router.delete('/returns/:id', requireAdmin, (req, res) => {
  res.json({ success: db.delete('returns', req.params.id) });
});

module.exports = router;
