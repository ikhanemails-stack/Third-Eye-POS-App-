// Third Eye Computer Solutions - POS System
// Vendor Bills module - tracks bills owed to suppliers/vendors and payments
// made against them, with running balance per vendor. Builds on the
// existing "suppliers" entity (Inventory module) rather than creating a
// separate, confusing duplicate "vendor" record.

const express = require('express');
const db = require('../db');
const { requireLogin, requireAdmin, roundMoney } = require('../helpers');

const router = express.Router();

// ---------- VENDOR BILLS ----------

router.get('/vendor-bills', requireLogin, (req, res) => {
  const { supplierId, status } = req.query;
  let bills = db.all('vendor_bills');
  if (supplierId) bills = bills.filter(b => b.supplierId === Number(supplierId));
  if (status) bills = bills.filter(b => b.status === status);
  bills.sort((a, b) => new Date(b.billDate) - new Date(a.billDate));
  res.json(bills);
});

router.get('/vendor-bills/:id', requireLogin, (req, res) => {
  const bill = db.getById('vendor_bills', req.params.id);
  if (!bill) return res.status(404).json({ error: 'Bill not found.' });
  const payments = db.filter('vendor_payments', p => p.billId === bill.id).sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));
  res.json({ ...bill, payments });
});

router.post('/vendor-bills', requireLogin, (req, res) => {
  const { supplierId, billNumber, billDate, description, amount } = req.body;
  if (!supplierId) return res.status(400).json({ error: 'Supplier is required.' });
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'A valid bill amount is required.' });
  const supplier = db.getById('suppliers', supplierId);
  if (!supplier) return res.status(400).json({ error: 'Supplier not found.' });

  const bill = db.insert('vendor_bills', {
    supplierId: Number(supplierId),
    billNumber: billNumber || '',
    billDate: billDate || new Date().toISOString(),
    description: description || '',
    amount: Number(amount),
    amountPaid: 0,
    status: 'unpaid'
  });
  res.json(bill);
});

router.put('/vendor-bills/:id', requireLogin, (req, res) => {
  const allowed = ['billNumber', 'billDate', 'description', 'amount'];
  const updates = {};
  allowed.forEach(key => { if (req.body[key] !== undefined) updates[key] = req.body[key]; });
  const updated = db.update('vendor_bills', req.params.id, updates);
  if (!updated) return res.status(404).json({ error: 'Bill not found.' });
  res.json(updated);
});

router.delete('/vendor-bills/:id', requireAdmin, (req, res) => {
  const bill = db.getById('vendor_bills', req.params.id);
  if (bill && bill.amountPaid > 0) {
    return res.status(400).json({ error: 'Cannot delete a bill that has payments recorded against it.' });
  }
  res.json({ success: db.delete('vendor_bills', req.params.id) });
});

// Records a payment against a bill, updating amountPaid and status
// (unpaid / partial / paid) automatically. Also logs a matching entry in
// the shared `expenses` ledger (expenseType: 'vendor_payment') so this
// payment is visible in Daily Expenses' "Vendor Payment" total and counts
// toward Accounting's Profit & Loss totalExpenses - previously this only
// updated the bill itself, so Daily Expenses' Vendor Payment bucket always
// showed 0 no matter how much had actually been paid to vendors.
router.post('/vendor-bills/:id/pay', requireLogin, (req, res) => {
  const bill = db.getById('vendor_bills', req.params.id);
  if (!bill) return res.status(404).json({ error: 'Bill not found.' });
  const { amount, paymentDate, note } = req.body;
  const payAmount = Number(amount);
  if (!payAmount || payAmount <= 0) return res.status(400).json({ error: 'A valid payment amount is required.' });

  const remaining = roundMoney(bill.amount - bill.amountPaid, 3);
  if (payAmount > remaining + 0.001) {
    return res.status(400).json({ error: `Payment exceeds remaining balance of ${remaining.toFixed(3)}.` });
  }

  const supplier = db.getById('suppliers', bill.supplierId);
  const effectiveDate = paymentDate || new Date().toISOString();

  const payment = db.insert('vendor_payments', {
    billId: bill.id,
    supplierId: bill.supplierId,
    amount: payAmount,
    paymentDate: effectiveDate,
    note: note || '',
    userId: req.session.userId
  });

  const expense = db.insert('expenses', {
    categoryId: null,
    expenseType: 'vendor_payment',
    amount: payAmount,
    description: `Vendor payment - ${supplier ? supplier.name : 'Vendor'}${bill.billNumber ? ` (Bill ${bill.billNumber})` : ''}${note ? ' - ' + note : ''}`,
    date: effectiveDate,
    userId: req.session.userId,
    vendorBillId: bill.id,
    vendorPaymentId: payment.id
  });

  const newAmountPaid = roundMoney(bill.amountPaid + payAmount, 3);
  const status = newAmountPaid >= bill.amount - 0.001 ? 'paid' : (newAmountPaid > 0 ? 'partial' : 'unpaid');
  db.update('vendor_bills', bill.id, { amountPaid: newAmountPaid, status });

  res.json({ payment, expense, bill: db.getById('vendor_bills', bill.id) });
});

// All payments made to a vendor across every bill, most recent first -
// used by the "Payment History" view on the Vendor Balances tab so you can
// see a vendor's full payment trail in one place instead of opening each
// bill individually.
router.get('/vendors/:supplierId/payments', requireLogin, (req, res) => {
  const supplierId = Number(req.params.supplierId);
  const payments = db.filter('vendor_payments', p => p.supplierId === supplierId)
    .sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));
  const withBillInfo = payments.map(p => {
    const bill = db.getById('vendor_bills', p.billId);
    return { ...p, billNumber: bill ? bill.billNumber : '', billDescription: bill ? bill.description : '' };
  });
  res.json(withBillInfo);
});

// ---------- VENDOR SUMMARY (balances owed per supplier) ----------

router.get('/vendors/summary', requireLogin, (req, res) => {
  const suppliers = db.all('suppliers');
  const bills = db.all('vendor_bills');
  const summary = suppliers.map(s => {
    const supplierBills = bills.filter(b => b.supplierId === s.id);
    const totalBilled = roundMoney(supplierBills.reduce((sum, b) => sum + b.amount, 0), 3);
    const totalPaid = roundMoney(supplierBills.reduce((sum, b) => sum + b.amountPaid, 0), 3);
    const balance = roundMoney(totalBilled - totalPaid, 3);
    return {
      supplierId: s.id,
      supplierName: s.name,
      totalBilled,
      totalPaid,
      balance,
      billCount: supplierBills.length,
      unpaidCount: supplierBills.filter(b => b.status !== 'paid').length
    };
  });
  res.json(summary.filter(s => s.billCount > 0));
});

module.exports = router;
