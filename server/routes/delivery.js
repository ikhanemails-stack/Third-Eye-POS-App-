// Third Eye Computer Solutions - POS System
// Delivery module routes: drivers and delivery orders.
//
// A delivery order can now be created directly from this module with its own
// product picker (barcode-aware), independent of the POS screen. Creating a
// delivery order with items also creates a linked sale behind the scenes, so
// stock correctly decrements and the order appears in sales reports - the
// delivery is just a different "front door" into the same sales pipeline.

const express = require('express');
const db = require('../db');
const { requireLogin, requireAdmin, roundMoney } = require('../helpers');

const router = express.Router();

const VALID_STATUSES = ['pending', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];

function getSettings() {
  return db.all('settings')[0] || { vatRate: 10, currencyDecimals: 3 };
}

// Same cart-calculation logic used by the POS sales route, duplicated here in
// a small form to avoid a circular require between routes/sales.js and
// routes/delivery.js. Keep in sync if the VAT calculation ever changes.
function calculateCart(items, settings) {
  const decimals = settings.currencyDecimals ?? 3;
  const vatRate = settings.vatRate ?? 10;
  let grandTotal = 0, vatTotal = 0;
  const lineItems = items.map(item => {
    const product = db.getById('products', item.productId);
    if (!product) throw new Error(`Product ${item.productId} not found.`);
    if (product.stock < item.quantity) {
      throw new Error(`Insufficient stock for "${product.name}". Available: ${product.stock}, Requested: ${item.quantity}`);
    }
    const unitPrice = item.unitPrice !== undefined ? Number(item.unitPrice) : product.sellPrice;
    const vatApplicable = item.vatApplicable !== undefined ? !!item.vatApplicable : product.vatApplicable;
    const lineGross = roundMoney(unitPrice * item.quantity, decimals);
    let lineVat = 0;
    if (vatApplicable) {
      const lineNet = lineGross / (1 + vatRate / 100);
      lineVat = roundMoney(lineGross - lineNet, decimals);
    }
    grandTotal = roundMoney(grandTotal + lineGross, decimals);
    vatTotal = roundMoney(vatTotal + lineVat, decimals);
    return {
      productId: product.id, productName: product.name, barcode: product.barcode,
      quantity: item.quantity, unitPrice, vatApplicable, lineVat, lineTotal: lineGross
    };
  });
  const subtotal = roundMoney(grandTotal - vatTotal, decimals);
  return { lineItems, subtotal, vatTotal, grandTotal };
}

// ---------- DRIVERS ----------

router.get('/drivers', requireLogin, (req, res) => {
  res.json(db.all('drivers'));
});

router.post('/drivers', requireLogin, (req, res) => {
  const { name, phone } = req.body;
  if (!name) return res.status(400).json({ error: 'Driver name is required.' });
  res.json(db.insert('drivers', { name, phone: phone || '', active: true }));
});

router.put('/drivers/:id', requireLogin, (req, res) => {
  const updated = db.update('drivers', req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Driver not found.' });
  res.json(updated);
});

router.delete('/drivers/:id', requireAdmin, (req, res) => {
  res.json({ success: db.delete('drivers', req.params.id) });
});

router.post('/drivers/bulk-delete', requireAdmin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No drivers selected.' });
  let deleted = 0;
  ids.forEach(id => { if (db.delete('drivers', id)) deleted++; });
  res.json({ success: true, deleted });
});

// ---------- DELIVERIES ----------

router.get('/deliveries', requireLogin, (req, res) => {
  const { status } = req.query;
  let deliveries = db.all('deliveries');
  if (status) deliveries = deliveries.filter(d => d.status === status);
  deliveries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(deliveries);
});

router.get('/deliveries/:id', requireLogin, (req, res) => {
  const delivery = db.getById('deliveries', req.params.id);
  if (!delivery) return res.status(404).json({ error: 'Delivery not found.' });
  const sale = delivery.saleId ? db.getById('sales', delivery.saleId) : null;
  const items = sale ? db.filter('sale_items', i => i.saleId === sale.id) : [];
  res.json({ ...delivery, sale, items });
});

// Creates a delivery order. If `items` is provided (from the new product
// picker), this also creates a real sale with those items - decrementing
// stock and recording revenue/VAT, exactly like a POS checkout would.
// If `items` is omitted, this creates a bare delivery record only (legacy
// behavior, still used when a delivery is auto-created from the POS screen
// where the sale already exists separately).
router.post('/deliveries', requireLogin, (req, res) => {
  const { saleId, customerId, customerName, customerPhone, address, driverId,
          deliveryFee, notes, items, paymentMethod, discount, couponCode } = req.body;
  if (!address) return res.status(400).json({ error: 'Delivery address is required.' });

  let linkedSaleId = saleId || null;
  let saleSummary = null;

  if (items && items.length > 0) {
    const settings = getSettings();
    let result;
    try {
      result = calculateCart(items, settings);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    const decimals = settings.currencyDecimals ?? 3;
    let discountAmount = roundMoney(Number(discount) || 0, decimals);
    let appliedCoupon = null;
    if (couponCode) {
      appliedCoupon = db.find('coupons', c => c.code === couponCode.toUpperCase().trim());
      if (!appliedCoupon || appliedCoupon.active === false) {
        return res.status(400).json({ error: 'Coupon code not found or inactive.' });
      }
      const couponDiscount = appliedCoupon.discountType === 'percent'
        ? roundMoney(result.grandTotal * (appliedCoupon.discountValue / 100), decimals)
        : roundMoney(appliedCoupon.discountValue, decimals);
      discountAmount = roundMoney(discountAmount + couponDiscount, decimals);
    }

    const finalTotal = Math.max(0, roundMoney(result.grandTotal - discountAmount, decimals));

    const sale = db.insert('sales', {
      invoiceNo: `INV-${Date.now()}`,
      customerId: customerId || null,
      orderType: 'delivery',
      subtotal: result.subtotal,
      vatTotal: result.vatTotal,
      discount: discountAmount,
      couponCode: appliedCoupon ? appliedCoupon.code : null,
      total: finalTotal,
      paymentMethod: paymentMethod || 'cash',
      amountPaid: finalTotal,
      changeDue: 0,
      notes: notes || '',
      cashierId: req.session.userId,
      cashierName: req.session.userName,
      status: 'completed'
    });

    result.lineItems.forEach(li => {
      db.insert('sale_items', { saleId: sale.id, ...li });
      const product = db.getById('products', li.productId);
      db.update('products', product.id, { stock: product.stock - li.quantity });
      db.insert('stock_movements', {
        productId: product.id, type: 'sale', quantity: -li.quantity,
        note: `Delivery order (${sale.invoiceNo})`, userId: req.session.userId
      });
    });

    if (appliedCoupon) {
      db.update('coupons', appliedCoupon.id, { usedCount: (appliedCoupon.usedCount || 0) + 1 });
    }

    // Award loyalty points the same way a POS sale would.
    if (customerId) {
      const customer = db.getById('customers', customerId);
      if (customer && settings.loyaltyEnabled !== false) {
        const earned = Math.floor(finalTotal * (settings.loyaltyEarnRate ?? 1));
        db.update('customers', customer.id, { loyaltyPoints: (customer.loyaltyPoints || 0) + earned });
        db.update('sales', sale.id, { pointsEarned: earned });
      }
    }

    linkedSaleId = sale.id;
    saleSummary = { ...sale, items: result.lineItems };
  }

  const delivery = db.insert('deliveries', {
    saleId: linkedSaleId,
    customerId: customerId || null,
    customerName: customerName || '',
    customerPhone: customerPhone || '',
    address,
    driverId: driverId || null,
    deliveryFee: Number(deliveryFee) || 0,
    notes: notes || '',
    status: 'pending'
  });

  res.json({ ...delivery, sale: saleSummary });
});

router.put('/deliveries/:id', requireLogin, (req, res) => {
  const allowed = ['customerName', 'customerPhone', 'address', 'driverId', 'deliveryFee', 'notes'];
  const updates = {};
  allowed.forEach(key => { if (req.body[key] !== undefined) updates[key] = req.body[key]; });
  const updated = db.update('deliveries', req.params.id, updates);
  if (!updated) return res.status(404).json({ error: 'Delivery not found.' });
  res.json(updated);
});

router.put('/deliveries/:id/status', requireLogin, (req, res) => {
  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(', ')}` });
  }
  const updates = { status };
  if (status === 'delivered') updates.deliveredAt = new Date().toISOString();
  const updated = db.update('deliveries', req.params.id, updates);
  if (!updated) return res.status(404).json({ error: 'Delivery not found.' });
  res.json(updated);
});

router.delete('/deliveries/:id', requireAdmin, (req, res) => {
  res.json({ success: db.delete('deliveries', req.params.id) });
});

router.post('/deliveries/bulk-delete', requireAdmin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No deliveries selected.' });
  let deleted = 0;
  ids.forEach(id => { if (db.delete('deliveries', id)) deleted++; });
  res.json({ success: true, deleted });
});

module.exports = router;
