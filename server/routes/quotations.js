// Third Eye Computer Solutions - POS System
// Quotation module routes.
//
// A quotation is a priced proposal sent to a customer BEFORE a sale exists.
// It does NOT touch stock. When the customer agrees (status -> 'accepted'),
// the quotation is automatically converted into a real sale in the same
// request - decrementing stock and appearing in Sales History/Reports,
// exactly like a POS checkout. This mirrors how server/routes/delivery.js
// turns a delivery order into a linked sale.
//
// Editing/deleting is only allowed while a quotation is still 'draft' or
// 'sent' - once it is accepted/converted (or rejected/expired) it becomes a
// read-only record, same way a completed sale can't be silently rewritten.

const express = require('express');
const db = require('../db');
const { requireLogin, requireAdmin, roundMoney } = require('../helpers');

const router = express.Router();

const EDITABLE_STATUSES = ['draft', 'sent'];
const SETTABLE_STATUSES = ['draft', 'sent', 'rejected', 'expired']; // 'accepted' goes through /accept

function getSettings() {
  return db.all('settings')[0] || { vatRate: 10, currencyDecimals: 3 };
}

// Prices a quote's line items. Unlike sales/deliveries, this does NOT
// require stock to be available right now - a quotation is a proposal, and
// stock may be replenished by the time the customer actually agrees.
function priceQuoteItems(items, settings) {
  const decimals = settings.currencyDecimals ?? 3;
  const vatRate = settings.vatRate ?? 10;
  let grandTotal = 0, vatTotal = 0;
  const lineItems = items.map(item => {
    const product = db.getById('products', item.productId);
    if (!product) throw new Error(`Product ${item.productId} not found.`);
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

function withItems(q) {
  return { ...q, items: db.filter('quotation_items', i => i.quotationId === q.id) };
}

// ---------- LIST / GET ----------

router.get('/quotations', requireLogin, (req, res) => {
  const { status } = req.query;
  let quotes = db.all('quotations');
  if (status) quotes = quotes.filter(q => q.status === status);
  quotes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(quotes);
});

router.get('/quotations/:id', requireLogin, (req, res) => {
  const quote = db.getById('quotations', req.params.id);
  if (!quote) return res.status(404).json({ error: 'Quotation not found.' });
  res.json(withItems(quote));
});

// ---------- CREATE ----------

router.post('/quotations', requireLogin, (req, res) => {
  const { customerId, customerName, customerPhone, items, validUntil, notes, terms, discount } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'Add at least one item to the quotation.' });

  const settings = getSettings();
  let result;
  try {
    result = priceQuoteItems(items, settings);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const decimals = settings.currencyDecimals ?? 3;
  const discountAmount = roundMoney(Number(discount) || 0, decimals);
  const total = Math.max(0, roundMoney(result.grandTotal - discountAmount, decimals));

  const quote = db.insert('quotations', {
    quoteNo: `QT-${Date.now()}`,
    customerId: customerId || null,
    customerName: customerName || '',
    customerPhone: customerPhone || '',
    subtotal: result.subtotal,
    vatTotal: result.vatTotal,
    discount: discountAmount,
    total,
    status: 'draft',
    validUntil: validUntil || null,
    notes: notes || '',
    terms: terms || '',
    convertedSaleId: null,
    cashierId: req.session.userId,
    cashierName: req.session.userName
  });

  result.lineItems.forEach(li => db.insert('quotation_items', { quotationId: quote.id, ...li }));

  res.json(withItems(quote));
});

// ---------- EDIT ----------

router.put('/quotations/:id', requireLogin, (req, res) => {
  const quote = db.getById('quotations', req.params.id);
  if (!quote) return res.status(404).json({ error: 'Quotation not found.' });
  if (!EDITABLE_STATUSES.includes(quote.status)) {
    return res.status(400).json({ error: `Cannot edit a quotation that is already "${quote.status}".` });
  }

  const { customerId, customerName, customerPhone, items, validUntil, notes, terms, discount } = req.body;
  const settings = getSettings();
  const decimals = settings.currencyDecimals ?? 3;

  const updates = {
    customerId: customerId !== undefined ? customerId : quote.customerId,
    customerName: customerName !== undefined ? customerName : quote.customerName,
    customerPhone: customerPhone !== undefined ? customerPhone : quote.customerPhone,
    validUntil: validUntil !== undefined ? validUntil : quote.validUntil,
    notes: notes !== undefined ? notes : quote.notes,
    terms: terms !== undefined ? terms : quote.terms
  };

  if (items && items.length) {
    let result;
    try {
      result = priceQuoteItems(items, settings);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    const discountAmount = roundMoney(Number(discount ?? quote.discount) || 0, decimals);
    updates.subtotal = result.subtotal;
    updates.vatTotal = result.vatTotal;
    updates.discount = discountAmount;
    updates.total = Math.max(0, roundMoney(result.grandTotal - discountAmount, decimals));

    // Replace line items wholesale - simplest way to keep them in sync with
    // an edited cart without diffing add/remove/qty-change individually.
    db.filter('quotation_items', i => i.quotationId === quote.id).forEach(i => db.delete('quotation_items', i.id));
    result.lineItems.forEach(li => db.insert('quotation_items', { quotationId: quote.id, ...li }));
  }

  const updated = db.update('quotations', quote.id, updates);
  res.json(withItems(updated));
});

// ---------- STATUS (draft / sent / rejected / expired) ----------

router.put('/quotations/:id/status', requireLogin, (req, res) => {
  const { status } = req.body;
  if (!SETTABLE_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${SETTABLE_STATUSES.join(', ')}. Use /accept to mark it accepted.` });
  }
  const quote = db.getById('quotations', req.params.id);
  if (!quote) return res.status(404).json({ error: 'Quotation not found.' });
  if (quote.status === 'converted') {
    return res.status(400).json({ error: 'This quotation has already been converted to a sale.' });
  }
  const updated = db.update('quotations', quote.id, { status });
  res.json(withItems(updated));
});

// ---------- ACCEPT -> AUTOMATICALLY CREATE THE SALE ----------
// This is the "customer agrees" step: it both marks the quotation accepted
// AND creates the real sale from it in one action, exactly like ringing up
// the same cart at the POS - stock is decremented and it shows up in Sales
// History / Reports / Accounting immediately.

router.post('/quotations/:id/accept', requireLogin, (req, res) => {
  const quote = db.getById('quotations', req.params.id);
  if (!quote) return res.status(404).json({ error: 'Quotation not found.' });
  if (quote.status === 'converted') {
    return res.status(400).json({ error: 'This quotation has already been converted to a sale.' });
  }

  const items = db.filter('quotation_items', i => i.quotationId === quote.id);
  if (!items.length) return res.status(400).json({ error: 'This quotation has no items.' });

  const settings = getSettings();
  const decimals = settings.currencyDecimals ?? 3;

  // Re-price against CURRENT stock/prices at the moment of acceptance (not
  // the numbers frozen when the quote was written) and confirm stock is
  // actually available now - this is the point where it becomes a real,
  // stock-affecting sale.
  let calc;
  try {
    calc = (function calculateCart(cartItems, s) {
      const dec = s.currencyDecimals ?? 3;
      const vatRate = s.vatRate ?? 10;
      let grandTotal = 0, vatTotal = 0;
      const lineItems = cartItems.map(item => {
        const product = db.getById('products', item.productId);
        if (!product) throw new Error(`Product ${item.productId} not found.`);
        if (product.stock < item.quantity) {
          throw new Error(`Insufficient stock for "${product.name}". Available: ${product.stock}, Requested: ${item.quantity}`);
        }
        const unitPrice = item.unitPrice;
        const vatApplicable = item.vatApplicable;
        const lineGross = roundMoney(unitPrice * item.quantity, dec);
        let lineVat = 0;
        if (vatApplicable) {
          const lineNet = lineGross / (1 + vatRate / 100);
          lineVat = roundMoney(lineGross - lineNet, dec);
        }
        grandTotal = roundMoney(grandTotal + lineGross, dec);
        vatTotal = roundMoney(vatTotal + lineVat, dec);
        return { productId: product.id, productName: product.name, barcode: product.barcode, quantity: item.quantity, unitPrice, vatApplicable, lineVat, lineTotal: lineGross };
      });
      const subtotal = roundMoney(grandTotal - vatTotal, dec);
      return { lineItems, subtotal, vatTotal, grandTotal };
    })(items.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, vatApplicable: i.vatApplicable })), settings);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const total = Math.max(0, roundMoney(calc.grandTotal - (quote.discount || 0), decimals));

  const sale = db.insert('sales', {
    invoiceNo: `INV-${Date.now()}`,
    customerId: quote.customerId || null,
    orderType: 'quotation',
    subtotal: calc.subtotal,
    vatTotal: calc.vatTotal,
    discount: quote.discount || 0,
    total,
    paymentMethod: req.body.paymentMethod || 'cash',
    amountPaid: total,
    changeDue: 0,
    notes: `Converted from quotation ${quote.quoteNo}`,
    cashierId: req.session.userId,
    cashierName: req.session.userName,
    status: 'completed'
  });

  calc.lineItems.forEach(li => {
    db.insert('sale_items', { saleId: sale.id, ...li });
    const product = db.getById('products', li.productId);
    db.update('products', product.id, { stock: product.stock - li.quantity });
    db.insert('stock_movements', {
      productId: product.id, type: 'sale', quantity: -li.quantity,
      note: `Quotation accepted (${quote.quoteNo} -> ${sale.invoiceNo})`, userId: req.session.userId
    });
  });

  const updated = db.update('quotations', quote.id, {
    status: 'converted', convertedSaleId: sale.id, acceptedAt: new Date().toISOString()
  });

  res.json({ ...withItems(updated), sale });
});

// ---------- DELETE ----------

router.delete('/quotations/:id', requireAdmin, (req, res) => {
  const quote = db.getById('quotations', req.params.id);
  if (!quote) return res.status(404).json({ error: 'Quotation not found.' });
  if (quote.status === 'converted') {
    return res.status(400).json({ error: 'Cannot delete a quotation that has already been converted to a sale. Refund/void the sale instead.' });
  }
  db.filter('quotation_items', i => i.quotationId === quote.id).forEach(i => db.delete('quotation_items', i.id));
  res.json({ success: db.delete('quotations', quote.id) });
});

router.post('/quotations/bulk-delete', requireAdmin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No quotations selected.' });
  let deleted = 0;
  ids.forEach(id => {
    const quote = db.getById('quotations', id);
    if (quote && quote.status !== 'converted') {
      db.filter('quotation_items', i => i.quotationId === quote.id).forEach(i => db.delete('quotation_items', i.id));
      if (db.delete('quotations', id)) deleted++;
    }
  });
  res.json({ success: true, deleted });
});

module.exports = router;
