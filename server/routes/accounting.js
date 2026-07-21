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
  if (to) expenses = expenses.filter(e => new Date(e.date) <= new Date(to + 'T23:59:59.999'));
  expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(expenses);
});

router.post('/expenses', requireLogin, (req, res) => {
  const { categoryId, amount, description, date, expenseType } = req.body;
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'A valid expense amount is required.' });
  const expense = db.insert('expenses', {
    categoryId: categoryId || null,
    // This was previously being dropped on the floor, which is why every
    // expense showed up bucketed as "Other Expense" on the Daily Expenses
    // screen no matter which type (Rent, Utilities, etc.) was picked.
    expenseType: expenseType || 'other',
    amount: Number(amount),
    description: description || '',
    date: date || new Date().toISOString(),
    userId: req.session.userId
  });
  res.json(expense);
});

router.put('/expenses/:id', requireLogin, (req, res) => {
  const allowed = ['categoryId', 'amount', 'description', 'date', 'expenseType'];
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

  // Credit balance payments collected in cash by this cashier during the
  // session also sit in the physical drawer, so they count toward the
  // expected cash total too.
  const creditCollections = db.filter('customer_payments', p =>
    p.collectedBy === session.userId &&
    (p.method || 'cash') === 'cash' &&
    new Date(p.createdAt) >= new Date(session.openedAt)
  );
  const creditCollectionsTotal = roundMoney(creditCollections.reduce((sum, p) => sum + p.amount, 0), 3);

  const expectedCash = roundMoney(session.openingFloat + cashSalesTotal + creditCollectionsTotal, 3);
  const closingFloat = Number(req.body.closingFloat) || 0;
  const difference = roundMoney(closingFloat - expectedCash, 3);

  const updated = db.update('cash_sessions', session.id, {
    status: 'closed',
    closedAt: new Date().toISOString(),
    cashSalesTotal,
    creditCollectionsTotal,
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
  // See server/routes/reports.js dateRange() for why this needs to be the
  // end of the day, not the start of it.
  const toDate = to ? new Date(to + 'T23:59:59.999') : new Date();

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

  // Credit collected in this period - informational only. It is NOT added
  // to revenue: the sale already counted as revenue on the day it happened
  // (even if sold on credit). This just shows how much of that outstanding
  // credit was actually paid off in the period.
  const creditCollected = roundMoney(
    db.all('customer_payments')
      .filter(p => new Date(p.createdAt) >= fromDate && new Date(p.createdAt) <= toDate)
      .reduce((sum, p) => sum + p.amount, 0), 3
  );

  res.json({
    period: { from: fromDate.toISOString(), to: toDate.toISOString() },
    revenue, cogs, grossProfit, totalExpenses, netProfit, vatCollected, creditCollected,
    salesCount: sales.length
  });
});

module.exports = router;

// ── DAILY EXPENSES SUMMARY ──────────────────────────────────────────────────
// Balance model: `daily_balances` holds manual OVERRIDES of the previous-day
// (opening) balance for a specific date - i.e. what the user explicitly
// typed into the "Previous Day Balance" field while viewing that date. Any
// date without an override auto-carries-forward from the prior day's
// closing balance (prevDayBalance - that day's expenses), all the way back
// through expense history, instead of silently resetting to 0 the way it
// did before. This is what "previous day balance is not tracked" was about.
function expensesTotalForDate(all, dateStr) {
  return all
    .filter(e => (e.date || '').slice(0, 10) === dateStr || (e.createdAt || '').slice(0, 10) === dateStr)
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
}

function computePrevDayBalance(date) {
  const all = db.all('expenses');
  const balances = db.all('daily_balances') || [];
  const overrideMap = new Map(balances.map(r => [r.date, r]));

  // If the day being viewed itself has a manual override, that IS its
  // previous-day (opening) balance - nothing to carry forward.
  const ownOverride = overrideMap.get(date);
  if (ownOverride) return Number(ownOverride.prevDayBalance || 0);

  // Otherwise walk forward day-by-day from the earliest known date (an
  // override or an expense) up to (but not including) `date`, carrying the
  // running closing balance forward.
  const allDates = new Set([
    ...all.map(e => (e.date || e.createdAt || '').slice(0, 10)).filter(Boolean),
    ...balances.map(r => r.date)
  ]);
  const candidateDates = [...allDates].filter(d => d < date).sort();
  if (candidateDates.length === 0) return 0;

  let running = 0;
  let cursor = candidateDates[0];
  const endDate = new Date(date + 'T12:00:00');
  const cursorDate = new Date(cursor + 'T12:00:00');
  // Walk one calendar day at a time so gaps (days with no activity) still
  // correctly carry the balance forward unchanged.
  for (let d = cursorDate; d < endDate; d.setDate(d.getDate() + 1)) {
    const dStr = d.toISOString().slice(0, 10);
    const override = overrideMap.get(dStr);
    if (override) {
      running = Number(override.prevDayBalance || 0) - expensesTotalForDate(all, dStr);
    } else {
      running = running - expensesTotalForDate(all, dStr);
    }
  }
  return running;
}

router.get('/expenses/daily-summary', requireLogin, (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0,10);
    const all  = db.all('expenses');
    const dayExpenses = all.filter(e => (e.date||'').slice(0,10) === date || (e.createdAt||'').slice(0,10) === date);

    const TYPES = ['vendor_payment','employee_salary','utilities','rent','other'];
    const summary = {};
    TYPES.forEach(t => { summary[t] = 0; });
    dayExpenses.forEach(e => {
      const t = TYPES.includes(e.expenseType) ? e.expenseType : 'other';
      summary[t] += Number(e.amount)||0;
    });

    const totalExpenses = Object.values(summary).reduce((a,b)=>a+b,0);
    const prevDayBalance = computePrevDayBalance(date);
    const remainingBalance = prevDayBalance - totalExpenses;

    res.json({ date, prevDayBalance, summary, totalExpenses, remainingBalance, expenses: dayExpenses });
  } catch(err) {
    console.error('Daily summary error:', err);
    res.status(500).json({ error: 'Could not load daily expenses: ' + err.message });
  }
});

// Sets/overrides the previous-day (opening) balance for the date being
// viewed - e.g. correcting the running total after a manual cash count.
router.post('/expenses/daily-summary', requireLogin, (req, res) => {
  try {
    const { date, prevDayBalance } = req.body;
    if (!date) return res.status(400).json({ error: 'Date required.' });
    db.ensureTable('daily_balances', []);
    const records = db.all('daily_balances') || [];
    const existing = records.find(r => r.date === date);
    if (existing) {
      db.update('daily_balances', existing.id, { prevDayBalance });
    } else {
      db.insert('daily_balances', { date, prevDayBalance });
    }
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});
