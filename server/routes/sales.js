// Third Eye Computer Solutions - POS System
// Sales / Point of Sale module routes.
// Handles checkout, VAT calculation (Bahrain 10% standard), receipts, and refunds.

const express = require('express');
const db = require('../db');
const { requireLogin, requireAdmin, roundMoney } = require('../helpers');

const router = express.Router();

function getSettings() {
  return db.all('settings')[0] || { vatRate: 10, currencyDecimals: 3 };
}

// Calculates totals for a cart. Prices are stored VAT-inclusive (common retail
// practice in Bahrain) - VAT is extracted from the sell price for reporting.
// `item.vatApplicable`, if explicitly provided, overrides the product's
// stored VAT setting for this sale only (e.g. cashier toggled VAT off for a
// one-time exception at checkout) - the product's own record is untouched.
function calculateCart(items, settings) {
  const decimals = settings.currencyDecimals ?? 3;
  const vatRate = settings.vatRate ?? 10;
  let vatTotal = 0;
  let grandTotal = 0;
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
      // Price is VAT-inclusive: VAT = gross - (gross / (1 + rate))
      const lineNet = lineGross / (1 + vatRate / 100);
      lineVat = roundMoney(lineGross - lineNet, decimals);
    }
    grandTotal = roundMoney(grandTotal + lineGross, decimals);
    vatTotal = roundMoney(vatTotal + lineVat, decimals);
    return {
      productId: product.id,
      productName: product.name,
      barcode: product.barcode,
      quantity: item.quantity,
      unitPrice,
      vatApplicable,
      lineVat,
      lineTotal: lineGross
    };
  });
  const subtotal = roundMoney(grandTotal - vatTotal, decimals);
  return { lineItems, subtotal, vatTotal, grandTotal };
}

// Preview cart totals without committing a sale (used for live cart display).
router.post('/sales/preview', requireLogin, (req, res) => {
  try {
    const settings = getSettings();
    const result = calculateCart(req.body.items || [], settings);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/sales', requireLogin, (req, res) => {
  const { from, to } = req.query;
  let sales = db.all('sales');
  if (from) sales = sales.filter(s => new Date(s.createdAt) >= new Date(from));
  if (to) sales = sales.filter(s => new Date(s.createdAt) <= new Date(to));
  sales.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(sales);
});

router.get('/sales/:id', requireLogin, (req, res) => {
  const sale = db.getById('sales', req.params.id);
  if (!sale) return res.status(404).json({ error: 'Sale not found.' });
  const items = db.filter('sale_items', i => i.saleId === sale.id);
  res.json({ ...sale, items });
});

router.post('/sales', requireLogin, (req, res) => {
  const { items, customerId, paymentMethod, amountPaid, discount, notes,
          orderType, couponCode, redeemPoints, deliveryAddress, deliveryPhone, deliveryFee, driverId } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'Cart is empty.' });

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

  // Apply coupon, if provided.
  if (couponCode) {
    appliedCoupon = db.find('coupons', c => c.code === couponCode.toUpperCase().trim());
    if (!appliedCoupon || appliedCoupon.active === false) {
      return res.status(400).json({ error: 'Coupon code not found or inactive.' });
    }
    if (appliedCoupon.expiresAt && new Date() > new Date(appliedCoupon.expiresAt)) {
      return res.status(400).json({ error: 'This coupon has expired.' });
    }
    if (appliedCoupon.maxUses && appliedCoupon.usedCount >= appliedCoupon.maxUses) {
      return res.status(400).json({ error: 'This coupon has reached its usage limit.' });
    }
    const couponDiscount = appliedCoupon.discountType === 'percent'
      ? roundMoney(result.grandTotal * (appliedCoupon.discountValue / 100), decimals)
      : roundMoney(appliedCoupon.discountValue, decimals);
    discountAmount = roundMoney(discountAmount + couponDiscount, decimals);
  }

  // Redeem loyalty points, if requested and the customer has enough.
  let pointsRedeemed = 0;
  let customer = customerId ? db.getById('customers', customerId) : null;
  if (redeemPoints && Number(redeemPoints) > 0) {
    if (!customer) return res.status(400).json({ error: 'Select a customer to redeem loyalty points.' });
    pointsRedeemed = Math.min(Number(redeemPoints), customer.loyaltyPoints || 0);
    const redemptionValue = roundMoney(pointsRedeemed * (settings.loyaltyRedemptionRate ?? 0.01), decimals);
    discountAmount = roundMoney(discountAmount + redemptionValue, decimals);
  }

  const finalTotal = Math.max(0, roundMoney(result.grandTotal - discountAmount, decimals));

  // "Credit" sales go on the customer's account instead of being paid now -
  // they must be tied to a real customer, and (if the customer has a credit
  // limit set) can't push the customer past that limit.
  if (paymentMethod === 'credit') {
    if (!customer) return res.status(400).json({ error: 'Select a customer to sell on credit.' });
    const currentBalance = customer.balance || 0;
    if (customer.creditLimit && (currentBalance + finalTotal) > customer.creditLimit) {
      return res.status(400).json({ error: `This sale would exceed ${customer.name}'s credit limit (${customer.creditLimit.toFixed(decimals)}). Current balance: ${currentBalance.toFixed(decimals)}.` });
    }
  }

  const paid = paymentMethod === 'credit'
    ? 0
    : (amountPaid !== undefined ? roundMoney(Number(amountPaid), decimals) : finalTotal);
  const changeDue = roundMoney(paid - finalTotal, decimals);

  if (paymentMethod === 'cash' && paid < finalTotal) {
    return res.status(400).json({ error: 'Amount paid is less than the total due.' });
  }

  const sale = db.insert('sales', {
    invoiceNo: `INV-${Date.now()}`,
    customerId: customerId || null,
    orderType: orderType || 'walk_in',
    subtotal: result.subtotal,
    vatTotal: result.vatTotal,
    discount: discountAmount,
    couponCode: appliedCoupon ? appliedCoupon.code : null,
    pointsRedeemed,
    total: finalTotal,
    paymentMethod: paymentMethod || 'cash',
    amountPaid: paid,
    changeDue: changeDue > 0 ? changeDue : 0,
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
      note: `Sale ${sale.invoiceNo}`, userId: req.session.userId
    });
  });

  // Consume the coupon use.
  if (appliedCoupon) {
    db.update('coupons', appliedCoupon.id, { usedCount: (appliedCoupon.usedCount || 0) + 1 });
  }

  // Update customer loyalty points: redeem, then earn on the final amount paid.
  if (customer) {
    let newPoints = customer.loyaltyPoints || 0;
    if (pointsRedeemed > 0) newPoints -= pointsRedeemed;
    if (settings.loyaltyEnabled !== false) {
      const earned = Math.floor(finalTotal * (settings.loyaltyEarnRate ?? 1));
      newPoints += earned;
      sale.pointsEarned = earned;
    }
    db.update('customers', customer.id, { loyaltyPoints: Math.max(0, newPoints) });
  }

  // Credit sales add the full amount to the customer's outstanding balance
  // (it will be reduced later when they pay it off from the Customers screen
  // or when an unpaid delivery tied to this sale is collected).
  if (paymentMethod === 'credit' && customer) {
    db.update('customers', customer.id, { balance: roundMoney((customer.balance || 0) + finalTotal, decimals) });
  }

  // Auto-create a delivery order if this sale is a delivery.
  let delivery = null;
  if (orderType === 'delivery') {
    delivery = db.insert('deliveries', {
      saleId: sale.id,
      customerId: customerId || null,
      customerName: customer ? customer.name : (req.body.customerName || ''),
      customerPhone: deliveryPhone || (customer ? customer.phone : ''),
      address: deliveryAddress || '',
      driverId: driverId || null,
      deliveryFee: Number(deliveryFee) || 0,
      notes: notes || '',
      status: 'pending',
      paid: paymentMethod !== 'credit'
    });
  }

  res.json({ ...sale, items: result.lineItems, delivery });
});

// Refund a sale (full refund) - restocks items and records a negative sale entry.
router.post('/sales/:id/refund', requireLogin, (req, res) => {
  const sale = db.getById('sales', req.params.id);
  if (!sale) return res.status(404).json({ error: 'Sale not found.' });
  if (sale.status === 'refunded') return res.status(400).json({ error: 'This sale was already refunded.' });

  const items = db.filter('sale_items', i => i.saleId === sale.id);
  items.forEach(li => {
    const product = db.getById('products', li.productId);
    if (product) {
      db.update('products', product.id, { stock: product.stock + li.quantity });
      db.insert('stock_movements', {
        productId: product.id, type: 'refund', quantity: li.quantity,
        note: `Refund of ${sale.invoiceNo}`, userId: req.session.userId
      });
    }
  });

  // Reverse loyalty points: take back anything earned, return anything redeemed.
  if (sale.customerId) {
    const customer = db.getById('customers', sale.customerId);
    if (customer) {
      let points = customer.loyaltyPoints || 0;
      if (sale.pointsEarned) points -= sale.pointsEarned;
      if (sale.pointsRedeemed) points += sale.pointsRedeemed;
      db.update('customers', customer.id, { loyaltyPoints: Math.max(0, points) });
    }
  }

  // Release the coupon use, if one was applied.
  if (sale.couponCode) {
    const coupon = db.find('coupons', c => c.code === sale.couponCode);
    if (coupon && coupon.usedCount > 0) {
      db.update('coupons', coupon.id, { usedCount: coupon.usedCount - 1 });
    }
  }

  db.update('sales', sale.id, { status: 'refunded', refundedAt: new Date().toISOString(), refundedBy: req.session.userId });
  res.json({ success: true });
});

// Clears ALL sales, sale items, and stock movements - an explicit "reset to
// start fresh" action for after testing the system, before going live.
// Does NOT touch products or customers. Requires admin + confirmation flag.
router.post('/sales/clear-all', requireAdmin, (req, res) => {
  if (req.body.confirm !== 'CLEAR') {
    return res.status(400).json({ error: 'Confirmation required.' });
  }
  const count = db.all('sales').length;
  db.replaceAll('sales', []);
  db.replaceAll('sale_items', []);
  res.json({ success: true, deleted: count });
});

// Transfers an existing completed sale to the Delivery module - creates a
// delivery order LINKED to this sale (no new sale, no double stock
// deduction - the sale already happened). Used by the "Transfer to
// Delivery" button in Sales History, for sales originally rung up as
// walk-in/pickup that the customer now wants delivered after the fact.
router.post('/sales/:id/transfer-to-delivery', requireLogin, (req, res) => {
  const sale = db.getById('sales', req.params.id);
  if (!sale) return res.status(404).json({ error: 'Sale not found.' });
  if (sale.status === 'refunded') return res.status(400).json({ error: 'Cannot create a delivery for a refunded sale.' });

  const existingDelivery = db.find('deliveries', d => d.saleId === sale.id);
  if (existingDelivery) {
    return res.status(400).json({ error: 'This sale has already been transferred to delivery.' });
  }

  const { address, customerPhone, driverId, deliveryFee, notes } = req.body;
  if (!address) return res.status(400).json({ error: 'Delivery address is required.' });

  let customerName = req.body.customerName || '';
  if (sale.customerId) {
    const customer = db.getById('customers', sale.customerId);
    if (customer) customerName = customerName || customer.name;
  }

  const delivery = db.insert('deliveries', {
    saleId: sale.id,
    customerId: sale.customerId || null,
    customerName,
    customerPhone: customerPhone || '',
    address,
    driverId: driverId || null,
    deliveryFee: Number(deliveryFee) || 0,
    notes: notes || `Transferred from sale ${sale.invoiceNo}`,
    status: 'pending'
  });

  // Mark the original sale's order type so it's visible everywhere this was
  // converted to a delivery.
  db.update('sales', sale.id, { orderType: 'delivery', transferredToDelivery: true });

  res.json(delivery);
});

module.exports = router;
