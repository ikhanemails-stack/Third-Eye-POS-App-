// Third Eye Computer Solutions - POS System
// Reports module routes: sales reports, inventory reports, top products, VAT reports.

const express = require('express');
const db = require('../db');
const { requireLogin, roundMoney } = require('../helpers');

const router = express.Router();

function dateRange(req) {
  const { from, to } = req.query;
  const fromDate = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
  const toDate = to ? new Date(to) : new Date();
  return { fromDate, toDate };
}

// ---------- SALES REPORT ----------

router.get('/reports/sales', requireLogin, (req, res) => {
  const { fromDate, toDate } = dateRange(req);
  const { categoryId, paymentMethod } = req.query;

  let sales = db.all('sales').filter(s =>
    new Date(s.createdAt) >= fromDate && new Date(s.createdAt) <= toDate
  );
  if (paymentMethod) sales = sales.filter(s => s.paymentMethod === paymentMethod);

  const completed = sales.filter(s => s.status === 'completed');
  const refunded = sales.filter(s => s.status === 'refunded');

  // If filtering by category, only count sales that include at least one
  // item from that category (and only that category's portion of the line
  // items toward revenue/VAT, for an accurate category-specific report).
  let relevantSaleIds = null;
  if (categoryId) {
    const productsInCategory = new Set(db.filter('products', p => p.categoryId === Number(categoryId)).map(p => p.id));
    const allItems = db.all('sale_items').filter(i => productsInCategory.has(i.productId));
    relevantSaleIds = new Set(allItems.map(i => i.saleId));
  }

  const completedFiltered = relevantSaleIds ? completed.filter(s => relevantSaleIds.has(s.id)) : completed;

  const totalRevenue = roundMoney(completedFiltered.reduce((sum, s) => sum + s.total, 0), 3);
  const totalVat = roundMoney(completedFiltered.reduce((sum, s) => sum + s.vatTotal, 0), 3);
  const totalDiscount = roundMoney(completedFiltered.reduce((sum, s) => sum + (s.discount || 0), 0), 3);

  const byPaymentMethod = {};
  completedFiltered.forEach(s => {
    byPaymentMethod[s.paymentMethod] = roundMoney((byPaymentMethod[s.paymentMethod] || 0) + s.total, 3);
  });

  // Group by day for trend chart
  const byDay = {};
  completedFiltered.forEach(s => {
    const day = s.createdAt.slice(0, 10);
    byDay[day] = roundMoney((byDay[day] || 0) + s.total, 3);
  });

  // Revenue by category (always computed across the full filtered date/payment
  // range, regardless of the categoryId filter, so the category chart shows
  // the full breakdown even when no specific category filter is applied).
  const categories = db.all('categories');
  const saleIdsInRange = new Set(completed.map(s => s.id));
  const itemsInRange = db.all('sale_items').filter(i => saleIdsInRange.has(i.saleId));
  const byCategory = {};
  itemsInRange.forEach(item => {
    const product = db.getById('products', item.productId);
    const catName = product && product.categoryId ? (categories.find(c => c.id === product.categoryId)?.name || 'Uncategorized') : 'Uncategorized';
    byCategory[catName] = roundMoney((byCategory[catName] || 0) + item.lineTotal, 3);
  });

  const refundedTotal = roundMoney(refunded.reduce((sum, s) => sum + s.total, 0), 3);

  res.json({
    period: { from: fromDate.toISOString(), to: toDate.toISOString() },
    salesCount: completedFiltered.length,
    refundsCount: refunded.length,
    refundedTotal,
    totalRevenue,
    totalVat,
    totalDiscount,
    byPaymentMethod,
    byDay,
    byCategory
  });
});

// ---------- TOP PRODUCTS ----------

router.get('/reports/top-products', requireLogin, (req, res) => {
  const { fromDate, toDate } = dateRange(req);
  const limit = Number(req.query.limit) || 10;

  const sales = db.all('sales').filter(s =>
    s.status === 'completed' && new Date(s.createdAt) >= fromDate && new Date(s.createdAt) <= toDate
  );
  const saleIds = new Set(sales.map(s => s.id));
  const items = db.all('sale_items').filter(i => saleIds.has(i.saleId));

  const grouped = {};
  items.forEach(item => {
    if (!grouped[item.productId]) {
      grouped[item.productId] = { productId: item.productId, productName: item.productName, quantitySold: 0, revenue: 0 };
    }
    grouped[item.productId].quantitySold += item.quantity;
    grouped[item.productId].revenue = roundMoney(grouped[item.productId].revenue + item.lineTotal, 3);
  });

  const result = Object.values(grouped).sort((a, b) => b.quantitySold - a.quantitySold).slice(0, limit);
  res.json(result);
});

// ---------- INVENTORY REPORT ----------

router.get('/reports/inventory', requireLogin, (req, res) => {
  const products = db.all('products');
  const settings = db.all('settings')[0];
  const threshold = settings ? settings.lowStockThreshold : 10;

  const totalStockValue = roundMoney(products.reduce((sum, p) => sum + p.costPrice * p.stock, 0), 3);
  const totalRetailValue = roundMoney(products.reduce((sum, p) => sum + p.sellPrice * p.stock, 0), 3);
  const lowStockItems = products.filter(p => p.stock <= (p.lowStockThreshold ?? threshold));
  const outOfStockItems = products.filter(p => p.stock === 0);

  res.json({
    totalProducts: products.length,
    totalStockValue,
    totalRetailValue,
    lowStockCount: lowStockItems.length,
    outOfStockCount: outOfStockItems.length,
    lowStockItems,
    outOfStockItems
  });
});

// ---------- VAT REPORT (for NBR filing reference) ----------

router.get('/reports/vat', requireLogin, (req, res) => {
  const { fromDate, toDate } = dateRange(req);
  const sales = db.all('sales').filter(s =>
    s.status === 'completed' && new Date(s.createdAt) >= fromDate && new Date(s.createdAt) <= toDate
  );

  const totalSalesNet = roundMoney(sales.reduce((sum, s) => sum + s.subtotal, 0), 3);
  const totalVatCollected = roundMoney(sales.reduce((sum, s) => sum + s.vatTotal, 0), 3);
  const totalSalesGross = roundMoney(sales.reduce((sum, s) => sum + s.total, 0), 3);

  const purchases = db.all('purchases').filter(p =>
    new Date(p.createdAt) >= fromDate && new Date(p.createdAt) <= toDate
  );
  const totalPurchases = roundMoney(purchases.reduce((sum, p) => sum + p.total, 0), 3);

  res.json({
    period: { from: fromDate.toISOString(), to: toDate.toISOString() },
    totalSalesNet,
    totalVatCollected,
    totalSalesGross,
    totalPurchases,
    invoiceCount: sales.length
  });
});

// ---------- DASHBOARD SUMMARY (defaults to today, accepts a custom range) ----------

router.get('/reports/dashboard', requireLogin, (req, res) => {
  const { from, to } = req.query;
  const rangeStart = from ? new Date(from) : (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
  const rangeEnd = to ? new Date(new Date(to).setHours(23, 59, 59, 999)) : new Date();

  const periodSales = db.all('sales').filter(s => s.status === 'completed' && new Date(s.createdAt) >= rangeStart && new Date(s.createdAt) <= rangeEnd);
  const periodRevenue = roundMoney(periodSales.reduce((sum, s) => sum + s.total, 0), 3);

  const products = db.all('products');
  const settings = db.all('settings')[0];
  const threshold = settings ? settings.lowStockThreshold : 10;
  const lowStockCount = products.filter(p => p.stock <= (p.lowStockThreshold ?? threshold)).length;

  const periodDeliveries = db.all('deliveries').filter(d => new Date(d.createdAt) >= rangeStart && new Date(d.createdAt) <= rangeEnd);
  const pendingDeliveries = periodDeliveries.filter(d => ['pending', 'preparing', 'out_for_delivery'].includes(d.status)).length;

  const periodExpenses = roundMoney(
    db.all('expenses').filter(e => new Date(e.date) >= rangeStart && new Date(e.date) <= rangeEnd).reduce((sum, e) => sum + e.amount, 0), 3
  );

  // Credit customers - not period-scoped, this is a live outstanding-balance
  // snapshot regardless of the dashboard's selected date range.
  const creditCustomers = db.all('customers').filter(c => (c.balance || 0) > 0);
  creditCustomers.sort((a, b) => (b.balance || 0) - (a.balance || 0));
  const creditTotalOwed = roundMoney(creditCustomers.reduce((sum, c) => sum + (c.balance || 0), 0), 3);

  // Unpaid deliveries - also a live snapshot (money still owed on delivery
  // orders that haven't been collected yet), joined to their sale for the
  // outstanding amount.
  const allDeliveries = db.all('deliveries');
  const unpaidDeliveries = allDeliveries.filter(d => d.paid === false);
  const unpaidWithAmount = unpaidDeliveries.map(d => {
    const sale = d.saleId ? db.getById('sales', d.saleId) : null;
    return { ...d, outstandingAmount: sale ? sale.total : (d.deliveryFee || 0) };
  });
  const unpaidTotalOutstanding = roundMoney(unpaidWithAmount.reduce((sum, d) => sum + d.outstandingAmount, 0), 3);

  res.json({
    period: { from: rangeStart.toISOString(), to: rangeEnd.toISOString() },
    todayRevenue: periodRevenue,
    todaySalesCount: periodSales.length,
    lowStockCount,
    pendingDeliveries,
    totalDeliveries: periodDeliveries.length,
    todayExpenses: periodExpenses,
    totalProducts: products.length,
    creditCustomers: {
      count: creditCustomers.length,
      totalOwed: creditTotalOwed,
      top: creditCustomers.slice(0, 5).map(c => ({
        id: c.id, name: c.name, phone: c.phone, balance: c.balance || 0,
        creditLimit: c.creditLimit || 0,
        pctOfLimit: c.creditLimit ? Math.round(((c.balance || 0) / c.creditLimit) * 100) : null
      }))
    },
    unpaidDeliveries: {
      count: unpaidWithAmount.length,
      totalOutstanding: unpaidTotalOutstanding,
      list: unpaidWithAmount.slice(0, 5).map(d => ({
        id: d.id, customerName: d.customerName, address: d.address,
        outstandingAmount: d.outstandingAmount, status: d.status
      }))
    }
  });
});

// ---------- REFUNDS DETAIL ----------

router.get('/reports/refunds', requireLogin, (req, res) => {
  const { fromDate, toDate } = dateRange(req);
  const refunds = db.all('sales').filter(s =>
    s.status === 'refunded' && new Date(s.createdAt) >= fromDate && new Date(s.createdAt) <= toDate
  );
  refunds.sort((a, b) => new Date(b.refundedAt || b.createdAt) - new Date(a.refundedAt || a.createdAt));
  res.json(refunds);
});

module.exports = router;
