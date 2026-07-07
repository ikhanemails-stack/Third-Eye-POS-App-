// Third Eye Computer Solutions - POS System
// Accounting module routes: expenses, expense categories, cash drawer sessions, P&L.

const express = require('express');
const db = require('../db');
const { requireLogin, requireAdmin, roundMoney } = require('../helpers');

const router = express.Router();

// ---------- EXPENSE CATEGORIES ----------

router.get('/expense-categories', requireLogin, (req, res) => {
  res.json(db.all('expense_categories'));
});

router.post('/expense-categories', requireLogin, (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'Category name is required.' });
  res.json(db.insert('expense_categories', { name: req.body.name }));
});

router.put('/expense-categories/:id', requireLogin, (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'Category name is required.' });
  const updated = db.update('expense_categories', req.params.id, { name: req.body.name });
  if (!updated) return res.status(404).json({ error: 'Category not found.' });
  res.json(updated);
});

router.delete('/expense-categories/:id', requireAdmin, (req, res) => {
  res.json({ success: db.delete('expense_categories', req.params.id) });
});

router.post('/expense-categories/bulk-delete', requireAdmin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No categories selected.' });
  let deleted = 0;
  ids.forEach(id => { if (db.delete('expense_categories', id)) deleted++; });
  res.json({ success: true, deleted });
});

// ---------- EXPENSES ----------

router.get('/expenses', requireLogin, (req, res) => {
  const { from, to } = req.query;
  let expenses = db.all('expenses');
  if (from) expenses = expenses.filter(e => new Date(e.date) >= new Date(from));
  if (to) expenses = expenses.filter(e => new Date(e.date) <= new Date(to));
  expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(expenses);
});

router.post('/expenses', requireLogin, (req, res) => {
  const { categoryId, amount, description, date } = req.body;
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'A valid expense amount is required.' });
  const expense = db.insert('expenses', {
    categoryId: categoryId || null,
    amount: Number(amount),
    description: description || '',
    date: date || new Date().toISOString(),
    userId: req.session.userId
  });
  res.json(expense);
});

router.put('/expenses/:id', requireLogin, (req, res) => {
  const allowed = ['categoryId', 'amount', 'description', 'date'];
  const updates = {};
  allowed.forEach(key => { if (req.body[key] !== undefined) updates[key] = req.body[key]; });
  const updated = db.update('expenses', req.params.id, updates);
  if (!updated) return res.status(404).json({ error: 'Expense not found.' });
  res.json(updated);
});

router.delete('/expenses/:id', requireAdmin, (req, res) => {
  res.json({ success: db.delete('expenses', req.params.id) });
});

// ---------- CASH DRAWER SESSIONS ----------

router.get('/cash-sessions', requireLogin, (req, res) => {
  const sessions = db.all('cash_sessions').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(sessions);
});

router.get('/cash-sessions/current', requireLogin, (req, res) => {
  const open = db.find('cash_sessions', s => s.status === 'open' && s.userId === req.session.userId);
  res.json(open || null);
});

router.post('/cash-sessions/open', requireLogin, (req, res) => {
  const existing = db.find('cash_sessions', s => s.status === 'open' && s.userId === req.session.userId);
  if (existing) return res.status(400).json({ error: 'You already have an open cash drawer session.' });
  const session = db.insert('cash_sessions', {
    userId: req.session.userId,
    userName: req.session.userName,
    openingFloat: Number(req.body.openingFloat) || 0,
    status: 'open',
    openedAt: new Date().toISOString()
  });
  res.json(session);
});

router.post('/cash-sessions/:id/close', requireLogin, (req, res) => {
  const session = db.getById('cash_sessions', req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  if (session.status === 'closed') return res.status(400).json({ error: 'Session already closed.' });

  const sales = db.filter('sales', s =>
    s.cashierId === session.userId &&
    s.status === 'completed' &&
    s.paymentMethod === 'cash' &&
    new Date(s.createdAt) >= new Date(session.openedAt)
  );
  const cashSalesTotal = roundMoney(sales.reduce((sum, s) => sum + s.total, 0), 3);
  const expectedCash = roundMoney(session.openingFloat + cashSalesTotal, 3);
  const closingFloat = Number(req.body.closingFloat) || 0;
  const difference = roundMoney(closingFloat - expectedCash, 3);

  const updated = db.update('cash_sessions', session.id, {
    status: 'closed',
    closedAt: new Date().toISOString(),
    cashSalesTotal,
    expectedCash,
    closingFloat,
    difference
  });
  res.json(updated);
});

// ---------- PROFIT & LOSS SUMMARY ----------

router.get('/accounting/profit-loss', requireLogin, (req, res) => {
  const { from, to } = req.query;
  const fromDate = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
  const toDate = to ? new Date(to) : new Date();

  const sales = db.all('sales').filter(s =>
    s.status === 'completed' && new Date(s.createdAt) >= fromDate && new Date(s.createdAt) <= toDate
  );
  const revenue = roundMoney(sales.reduce((sum, s) => sum + s.subtotal, 0), 3);
  const vatCollected = roundMoney(sales.reduce((sum, s) => sum + s.vatTotal, 0), 3);

  // Cost of goods sold from sale_items joined with product cost prices
  let cogs = 0;
  sales.forEach(sale => {
    const items = db.filter('sale_items', i => i.saleId === sale.id);
    items.forEach(item => {
      const product = db.getById('products', item.productId);
      if (product) cogs = roundMoney(cogs + product.costPrice * item.quantity, 3);
    });
  });

  const expenses = db.all('expenses').filter(e => new Date(e.date) >= fromDate && new Date(e.date) <= toDate);
  const totalExpenses = roundMoney(expenses.reduce((sum, e) => sum + e.amount, 0), 3);

  const grossProfit = roundMoney(revenue - cogs, 3);
  const netProfit = roundMoney(grossProfit - totalExpenses, 3);

  res.json({
    period: { from: fromDate.toISOString(), to: toDate.toISOString() },
    revenue, cogs, grossProfit, totalExpenses, netProfit, vatCollected,
    salesCount: sales.length
  });
});

module.exports = router;
