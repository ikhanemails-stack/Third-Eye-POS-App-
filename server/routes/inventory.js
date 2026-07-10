// Third Eye Computer Solutions - POS System
// Inventory module routes: products, categories, suppliers, stock movements, purchases.

const express = require('express');
const db = require('../db');
const { requireLogin, requireAdmin, roundMoney } = require('../helpers');
const { toCsv, parseCsv } = require('../csv-utils');

const router = express.Router();

// ---------- CATEGORIES ----------

router.get('/categories', requireLogin, (req, res) => {
  res.json(db.all('categories'));
});

router.post('/categories', requireLogin, (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'Category name is required.' });
  res.json(db.insert('categories', { name: req.body.name }));
});

router.put('/categories/:id', requireLogin, (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'Category name is required.' });
  const updated = db.update('categories', req.params.id, { name: req.body.name });
  if (!updated) return res.status(404).json({ error: 'Category not found.' });
  res.json(updated);
});

router.delete('/categories/:id', requireAdmin, (req, res) => {
  const inUse = db.find('products', p => p.categoryId === Number(req.params.id));
  if (inUse) return res.status(400).json({ error: 'Cannot delete a category that has products. Move or delete those products first.' });
  res.json({ success: db.delete('categories', req.params.id) });
});

// ---------- SUPPLIERS ----------

router.get('/suppliers', requireLogin, (req, res) => {
  res.json(db.all('suppliers'));
});

router.post('/suppliers', requireLogin, (req, res) => {
  const { name, phone, email, address } = req.body;
  if (!name) return res.status(400).json({ error: 'Supplier name is required.' });
  res.json(db.insert('suppliers', { name, phone: phone || '', email: email || '', address: address || '' }));
});

router.put('/suppliers/:id', requireLogin, (req, res) => {
  const updated = db.update('suppliers', req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Supplier not found.' });
  res.json(updated);
});

router.delete('/suppliers/:id', requireAdmin, (req, res) => {
  res.json({ success: db.delete('suppliers', req.params.id) });
});

router.post('/suppliers/bulk-delete', requireAdmin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No suppliers selected.' });
  let deleted = 0;
  ids.forEach(id => { if (db.delete('suppliers', id)) deleted++; });
  res.json({ success: true, deleted });
});

// ---------- PRODUCTS ----------

router.get('/products', requireLogin, (req, res) => {
  const { search, page, limit, categoryId } = req.query;
  let products = db.all('products');

  // Filter by category
  if (categoryId) {
    products = products.filter(p => p.categoryId === Number(categoryId));
  }

  // Fast search
  if (search) {
    const term = search.toLowerCase().trim();
    // Exact barcode match first
    const exact = products.find(p => p.barcode === term);
    if (exact) return res.json([exact]);
    products = products.filter(p =>
      p.name.toLowerCase().includes(term) ||
      (p.barcode && p.barcode.includes(term))
    );
  }

  // Pagination for large datasets
  if (page !== undefined && limit !== undefined) {
    const pg  = Math.max(1, parseInt(page) || 1);
    const lim = Math.min(100, parseInt(limit) || 50);
    const total = products.length;
    products = products.slice((pg-1)*lim, pg*lim);
    return res.json({ products, total, page: pg, limit: lim });
  }

  res.json(products);
});

router.get('/products/low-stock', requireLogin, (req, res) => {
  const settings = db.all('settings')[0];
  const threshold = settings ? settings.lowStockThreshold : 10;
  const products = db.all('products').filter(p => p.stock <= (p.lowStockThreshold ?? threshold));
  res.json(products);
});

router.get('/products/barcode/:code', requireLogin, (req, res) => {
  const product = db.find('products', p => p.barcode === req.params.code);
  if (!product) return res.status(404).json({ error: 'Product not found for this barcode.' });
  res.json(product);
});

// ---------- ONLINE PRODUCT LOOKUP & IMAGE SEARCH ----------
// These two routes proxy free, no-API-key product databases from the
// SERVER side (not the browser) so there are no CORS problems and no
// API keys are ever exposed to the frontend. Used by the "Add Product"
// form's barcode auto-fill and online photo search features.

// Looks up a barcode against Open Food Facts (great grocery/food coverage)
// and falls back to UPC Item DB (broader general-product coverage).
// Returns { found:false } rather than an error when nothing matches, so
// the frontend can just say "not found, fill in manually" instead of
// treating it as a failure.
router.get('/products/lookup/:barcode', requireLogin, async (req, res) => {
  const barcode = String(req.params.barcode || '').trim();
  if (!barcode || barcode.length < 6) {
    return res.json({ found: false, reason: 'Barcode too short.' });
  }
  try {
    const offRes = await fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`);
    const off = await offRes.json();
    if (off && off.status === 1 && off.product) {
      const p = off.product;
      const name = p.product_name || p.product_name_en || p.abbreviated_product_name || '';
      const brand = p.brands || '';
      const category = (p.categories_hierarchy && p.categories_hierarchy[0] || p.pnns_groups_1 || '').replace('en:', '');
      const photo = p.image_front_url || p.image_url || p.image_front_thumb_url || '';
      if (name) {
        return res.json({
          found: true, source: 'Open Food Facts',
          name: brand ? `${brand} ${name}` : name,
          category, brand, photo
        });
      }
    }
  } catch (e) { /* fall through to next source */ }

  try {
    const upcRes = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`);
    const upc = await upcRes.json();
    if (upc && upc.items && upc.items.length > 0) {
      const item = upc.items[0];
      return res.json({
        found: true, source: 'UPC Item DB',
        name: item.title || '', category: item.category || '',
        brand: item.brand || '', photo: (item.images && item.images[0]) || '',
        price: item.lowest_recorded_price || ''
      });
    }
  } catch (e) { /* fall through */ }

  res.json({ found: false });
});

// Searches for product photos by name (no barcode needed) - useful when
// adding a product manually and you just want a decent photo for it.
router.get('/products/image-search', requireLogin, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Search query is required.' });
  try {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=10`;
    const r = await fetch(url);
    const data = await r.json();
    const results = (data.products || [])
      .map(p => ({
        name: p.product_name || p.product_name_en || '',
        brand: p.brands || '',
        photo: p.image_front_url || p.image_url || p.image_front_thumb_url || ''
      }))
      .filter(x => x.photo)
      .slice(0, 8);
    res.json({ results });
  } catch (e) {
    res.status(502).json({ error: 'Image search is temporarily unavailable. Please try again.' });
  }
});

router.get('/products/:id', requireLogin, (req, res) => {
  const product = db.getById('products', req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  res.json(product);
});

router.post('/products', requireLogin, (req, res) => {
  const { name, barcode, categoryId, costPrice, sellPrice, stock, unit, vatApplicable, lowStockThreshold, expiryDate, supplierId, photo } = req.body;
  if (!name || sellPrice === undefined) {
    return res.status(400).json({ error: 'Product name and sell price are required.' });
  }
  if (barcode && db.find('products', p => p.barcode === barcode)) {
    return res.status(400).json({ error: 'A product with this barcode already exists.' });
  }
  const product = db.insert('products', {
    name,
    barcode: barcode || '',
    categoryId: categoryId ? Number(categoryId) : null,
    supplierId: supplierId ? Number(supplierId) : null,
    costPrice: Number(costPrice) || 0,
    sellPrice: Number(sellPrice),
    stock: Number(stock) || 0,
    unit: unit || 'pcs',
    vatApplicable: vatApplicable !== false,
    expiryDate: expiryDate || null,
    lowStockThreshold: lowStockThreshold !== undefined ? Number(lowStockThreshold) : undefined,
    photo: photo || ''
  });
  if (product.stock > 0) {
    db.insert('stock_movements', {
      productId: product.id, type: 'initial', quantity: product.stock,
      note: 'Initial stock on product creation', userId: req.session.userId
    });
  }
  res.json(product);
});

router.put('/products/:id', requireLogin, (req, res) => {
  const allowed = ['name', 'barcode', 'categoryId', 'supplierId', 'costPrice', 'sellPrice', 'unit', 'vatApplicable', 'lowStockThreshold', 'expiryDate', 'photo'];
  const updates = {};
  allowed.forEach(key => {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  });
  const updated = db.update('products', req.params.id, updates);
  if (!updated) return res.status(404).json({ error: 'Product not found.' });
  res.json(updated);
});

router.post('/products/:id/adjust-stock', requireLogin, (req, res) => {
  const { quantity, note } = req.body;
  const product = db.getById('products', req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  const qty = Number(quantity);
  if (!qty) return res.status(400).json({ error: 'Quantity must be a non-zero number.' });
  const newStock = product.stock + qty;
  if (newStock < 0) return res.status(400).json({ error: 'Adjustment would result in negative stock.' });
  db.update('products', product.id, { stock: newStock });
  db.insert('stock_movements', {
    productId: product.id, type: 'adjustment', quantity: qty,
    note: note || 'Manual adjustment', userId: req.session.userId
  });
  res.json(db.getById('products', product.id));
});

router.delete('/products/:id', requireAdmin, (req, res) => {
  res.json({ success: db.delete('products', req.params.id) });
});

// Bulk delete - lets the shop owner clear out mistakenly-added products in
// one action instead of deleting them one by one.
router.post('/products/bulk-delete', requireAdmin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'No products selected.' });
  }
  let deleted = 0;
  ids.forEach(id => { if (db.delete('products', id)) deleted++; });
  res.json({ success: true, deleted });
});

// Deletes ALL products - an explicit "clear inventory" action for starting
// fresh. Requires admin and a confirmation flag to avoid accidental wipes.
router.post('/products/clear-all', requireAdmin, (req, res) => {
  if (req.body.confirm !== 'CLEAR') {
    return res.status(400).json({ error: 'Confirmation required.' });
  }
  const count = db.all('products').length;
  db.replaceAll('products', []);
  res.json({ success: true, deleted: count });
});

// ---------- CSV EXPORT / IMPORT (opens directly in Excel) ----------

const PRODUCT_CSV_COLUMNS = [
  { key: 'name', header: 'Product Name' },
  { key: 'barcode', header: 'Barcode' },
  { key: 'categoryName', header: 'Category' },
  { key: 'costPrice', header: 'Cost Price' },
  { key: 'sellPrice', header: 'Sell Price' },
  { key: 'stock', header: 'Stock' },
  { key: 'unit', header: 'Unit' },
  { key: 'vatApplicable', header: 'VAT Applicable (yes/no)' }
];

router.get('/products/export/csv', requireLogin, (req, res) => {
  const products = db.all('products');
  const categories = db.all('categories');
  const rows = products.map(p => ({
    ...p,
    categoryName: categories.find(c => c.id === p.categoryId)?.name || '',
    vatApplicable: p.vatApplicable !== false ? 'yes' : 'no'
  }));
  const csv = toCsv(rows, PRODUCT_CSV_COLUMNS);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="products-export-${Date.now()}.csv"`);
  res.send('\uFEFF' + csv); // BOM so Excel opens UTF-8 correctly (Arabic names etc.)
});

router.get('/products/import/template', requireLogin, (req, res) => {
  const sampleRows = [
    { name: 'Example Product', barcode: '1234567890123', categoryName: 'Groceries', costPrice: 1.000, sellPrice: 1.500, stock: 10, unit: 'pcs', vatApplicable: 'yes' }
  ];
  const csv = toCsv(sampleRows, PRODUCT_CSV_COLUMNS);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="products-import-template.csv"');
  res.send('\uFEFF' + csv);
});

// Imports products from CSV text. Matches existing products by barcode (if
// provided) to UPDATE them; otherwise creates new products. Unknown
// categories are created automatically.
router.post('/products/import/csv', requireAdmin, (req, res) => {
  const { csvText } = req.body;
  if (!csvText) return res.status(400).json({ error: 'No CSV content received.' });

  let rows;
  try {
    rows = parseCsv(csvText);
  } catch (e) {
    return res.status(400).json({ error: 'Could not parse this file as CSV.' });
  }
  if (rows.length === 0) {
    return res.status(400).json({ error: 'The file appears to be empty.' });
  }

  const categories = db.all('categories');
  function findOrCreateCategory(name) {
    if (!name) return null;
    const trimmed = name.trim();
    if (!trimmed) return null;
    let cat = categories.find(c => c.name.toLowerCase() === trimmed.toLowerCase());
    if (!cat) {
      cat = db.insert('categories', { name: trimmed });
      categories.push(cat);
    }
    return cat.id;
  }

  let created = 0, updated = 0, skipped = 0;
  const errors = [];

  rows.forEach((row, idx) => {
    const name = row['Product Name'] || row['name'];
    const sellPriceRaw = row['Sell Price'] || row['sellPrice'];
    if (!name || sellPriceRaw === undefined || sellPriceRaw === '') {
      skipped++;
      errors.push(`Row ${idx + 2}: missing product name or sell price.`);
      return;
    }

    const barcode = (row['Barcode'] || row['barcode'] || '').trim();
    const categoryName = row['Category'] || row['categoryName'] || '';
    const costPrice = Number(row['Cost Price'] || row['costPrice'] || 0) || 0;
    const sellPrice = Number(sellPriceRaw);
    const stock = Number(row['Stock'] || row['stock'] || 0) || 0;
    const unit = (row['Unit'] || row['unit'] || 'pcs').trim() || 'pcs';
    const vatRaw = (row['VAT Applicable (yes/no)'] || row['vatApplicable'] || 'yes').toString().trim().toLowerCase();
    const vatApplicable = !['no', 'false', '0', 'n'].includes(vatRaw);
    const categoryId = findOrCreateCategory(categoryName);

    if (isNaN(sellPrice)) {
      skipped++;
      errors.push(`Row ${idx + 2}: invalid sell price.`);
      return;
    }

    const existing = barcode ? db.find('products', p => p.barcode === barcode) : null;
    if (existing) {
      db.update('products', existing.id, { name, categoryId, costPrice, sellPrice, unit, vatApplicable });
      updated++;
    } else {
      db.insert('products', { name, barcode, categoryId, costPrice, sellPrice, stock, unit, vatApplicable });
      created++;
    }
  });

  res.json({ success: true, created, updated, skipped, errors: errors.slice(0, 20) });
});

router.get('/stock-movements', requireLogin, (req, res) => {
  const { productId } = req.query;
  let moves = db.all('stock_movements');
  if (productId) moves = moves.filter(m => m.productId === Number(productId));
  moves.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(moves);
});

// ---------- PURCHASES (stock-in from suppliers) ----------

router.get('/purchases', requireLogin, (req, res) => {
  const purchases = db.all('purchases').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(purchases);
});

router.get('/purchases/:id', requireLogin, (req, res) => {
  const purchase = db.getById('purchases', req.params.id);
  if (!purchase) return res.status(404).json({ error: 'Purchase not found.' });
  const items = db.filter('purchase_items', i => i.purchaseId === purchase.id);
  res.json({ ...purchase, items });
});

router.post('/purchases', requireLogin, (req, res) => {
  const { supplierId, items, note } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'Purchase must include at least one item.' });

  let total = 0;
  const lineItems = [];
  for (const item of items) {
    const product = db.getById('products', item.productId);
    if (!product) return res.status(400).json({ error: `Product ${item.productId} not found.` });
    const lineTotal = roundMoney(item.quantity * item.costPrice, 3);
    total = roundMoney(total + lineTotal, 3);
    lineItems.push({ productId: product.id, productName: product.name, quantity: item.quantity, costPrice: item.costPrice, lineTotal });
  }

  const purchase = db.insert('purchases', {
    supplierId: supplierId || null, total, note: note || '', userId: req.session.userId, status: 'received'
  });

  lineItems.forEach(li => {
    db.insert('purchase_items', { purchaseId: purchase.id, ...li });
    const product = db.getById('products', li.productId);
    db.update('products', product.id, { stock: product.stock + li.quantity, costPrice: li.costPrice });
    db.insert('stock_movements', {
      productId: product.id, type: 'purchase', quantity: li.quantity,
      note: `Purchase #${purchase.id}`, userId: req.session.userId
    });
  });

  res.json({ ...purchase, items: lineItems });
});

module.exports = router;
