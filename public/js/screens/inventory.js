// Third Eye Computer Solutions - POS System
// Inventory module screen - products, categories, stock management.
// Includes bulk delete, clear-all, and CSV import/export.

const InventoryScreen = {
  products: [],
  categories: [],
  suppliers: [],
  searchTerm: '',

  async render() {
    Shell.mount('/inventory', `<div class="empty-state">Loading inventory...</div>`);
    try {
      [this.products, this.categories, this.suppliers] = await Promise.all([
        Api.get('/products'),
        Api.get('/categories'),
        Api.get('/suppliers')
      ]);
    } catch (err) {
      Toast.error(err.message);
      return;
    }
    BulkSelect.reset();
    this.renderScreen();
  },

  renderScreen() {
    const settings = App.settings;
    const filtered = this.searchTerm
      ? this.products.filter(p => p.name.toLowerCase().includes(this.searchTerm.toLowerCase()) || (p.barcode || '').includes(this.searchTerm))
      : this.products;

    const content = `
      <div class="page-header">
        <div>
          <h1>Products &amp; Inventory</h1>
          <div class="page-subtitle">${this.products.length} products in catalog</div>
        </div>
        <button class="btn btn-gold" id="add-product-btn">
          <span style="width:16px;height:16px;display:flex">${Icon.plus}</span> Add Product
        </button>
      </div>

      <div class="toolbar-row">
        <input class="form-input" id="inv-search" placeholder="Search products or barcode..." value="${escapeHtml(this.searchTerm)}" style="max-width:280px">
        <button class="btn-icon-label" id="manage-categories-btn">${Icon.inventory} Categories</button>
        <button class="btn-icon-label" id="export-csv-btn">${Icon.copy} Export to Excel/CSV</button>
        <button class="btn-icon-label" id="import-csv-btn">${Icon.plus} Import from Excel/CSV</button>
        <button class="btn-icon-label danger" id="clear-all-btn" style="margin-left:auto">${Icon.trash} Clear All Products</button>
      </div>

      <div id="bulk-toolbar-container"></div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              ${BulkSelect.checkboxHeader()}
              <th>Product</th><th>Category</th><th>Barcode</th><th>Cost</th><th>Price</th><th>Stock</th><th>VAT</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length === 0 ? `<tr><td colspan="9"><div class="empty-state"><p>No products found.</p></div></td></tr>` : filtered.map(p => {
              const cat = this.categories.find(c => c.id === p.categoryId);
              const lowStock = p.stock <= (p.lowStockThreshold ?? settings.lowStockThreshold);
              return `
              <tr>
                ${BulkSelect.checkboxCell(p.id)}
                <td>
                  <div style="display:flex;align-items:center;gap:8px">
                    ${p.photo
                      ? `<img src="${escapeHtml(p.photo)}" class="inv-row-thumb" alt="">`
                      : `<span class="inv-row-thumb inv-row-thumb-empty">📦</span>`}
                    <strong>${escapeHtml(p.name)}</strong>
                  </div>
                </td>
                <td>${cat ? escapeHtml(cat.name) : '<span style="color:var(--text-muted)">-</span>'}</td>
                <td style="font-family:var(--font-mono);font-size:0.78rem">${escapeHtml(p.barcode || '-')}</td>
                <td>${formatMoney(p.costPrice, settings)}</td>
                <td>${formatMoney(p.sellPrice, settings)}</td>
                <td><span class="badge ${lowStock ? 'badge-danger' : 'badge-neutral'}">${p.stock} ${escapeHtml(p.unit)}</span></td>
                <td>${p.vatApplicable ? `<span class="badge badge-gold">${settings.vatRate}%</span>` : `<span class="badge badge-neutral">Exempt</span>`}</td>
                <td style="text-align:right;white-space:nowrap">
                  <div class="row-actions-group">
                    <button class="row-action row-action-adjust adjust-stock-btn" data-id="${p.id}" title="Adjust stock">${Icon.box}</button>
                    <button class="row-action row-action-edit edit-product-btn" data-id="${p.id}" title="Edit">${Icon.edit}</button>
                    <button class="row-action row-action-delete delete-product-btn" data-id="${p.id}" title="Delete">${Icon.trash}</button>
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
    document.getElementById('content').innerHTML = content;

    document.getElementById('inv-search').addEventListener('input', (e) => {
      this.searchTerm = e.target.value;
      this.renderScreen();
    });
    document.getElementById('add-product-btn').addEventListener('click', () => this.openProductModal());
    document.getElementById('manage-categories-btn').addEventListener('click', () => this.openCategoriesModal());
    document.getElementById('export-csv-btn').addEventListener('click', () => this.exportCsv());
    document.getElementById('import-csv-btn').addEventListener('click', () => this.openImportModal());
    document.getElementById('clear-all-btn').addEventListener('click', () => this.clearAllProducts());

    document.querySelectorAll('.edit-product-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openProductModal(this.products.find(p => p.id === Number(btn.dataset.id))));
    });
    document.querySelectorAll('.adjust-stock-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openAdjustStockModal(this.products.find(p => p.id === Number(btn.dataset.id))));
    });
    document.querySelectorAll('.delete-product-btn').forEach(btn => {
      btn.addEventListener('click', () => this.deleteProduct(Number(btn.dataset.id)));
    });

    BulkSelect.wire('bulk-toolbar-container', (ids) => this.bulkDelete(ids));
  },

  async bulkDelete(ids) {
    try {
      const result = await Api.post('/products/bulk-delete', { ids });
      Toast.success(`${result.deleted} product(s) deleted.`);
      BulkSelect.reset();
      this.products = await Api.get('/products');
      this.renderScreen();
    } catch (err) {
      Toast.error(err.message);
    }
  },

  async clearAllProducts() {
    if (this.products.length === 0) { Toast.error('There are no products to clear.'); return; }
    const confirmed = confirm(`This will permanently delete ALL ${this.products.length} products from your inventory. This cannot be undone. Are you sure?`);
    if (!confirmed) return;
    const typed = prompt('Type CLEAR to confirm you want to delete all products:');
    if (typed !== 'CLEAR') { Toast.error('Cancelled - confirmation text did not match.'); return; }
    try {
      const result = await Api.post('/products/clear-all', { confirm: 'CLEAR' });
      Toast.success(`${result.deleted} product(s) cleared.`);
      this.products = await Api.get('/products');
      BulkSelect.reset();
      this.renderScreen();
    } catch (err) {
      Toast.error(err.message);
    }
  },

  exportCsv() {
    window.open('/api/products/export/csv', '_blank');
  },

  openImportModal() {
    Modal.open('Import Products from Excel/CSV', `
      <p style="color:var(--text-secondary);font-size:0.86rem;margin-bottom:14px">
        Upload a CSV file (Excel can save as CSV: File &rarr; Save As &rarr; CSV).
        Products matched by barcode will be updated; new ones will be created.
        New categories typed in the file are created automatically.
      </p>
      <div style="margin-bottom:16px">
        <a href="/api/products/import/template" class="btn btn-outline btn-sm" target="_blank">
          Download Template File
        </a>
      </div>
      <div class="form-group">
        <label class="form-label">Choose CSV File</label>
        <input type="file" id="import-file-input" accept=".csv,text/csv">
      </div>
      <div id="import-result"></div>
      <button class="btn btn-gold" id="run-import-btn" style="width:100%;justify-content:center;padding:12px" disabled>
        Import File
      </button>
    `);
    const fileInput = document.getElementById('import-file-input');
    const runBtn = document.getElementById('run-import-btn');
    let fileText = null;
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => { fileText = reader.result; runBtn.disabled = false; };
      reader.readAsText(file);
    });
    runBtn.addEventListener('click', async () => {
      if (!fileText) return;
      runBtn.disabled = true;
      runBtn.textContent = 'Importing...';
      try {
        const result = await Api.post('/products/import/csv', { csvText: fileText });
        document.getElementById('import-result').innerHTML = `
          <div class="card" style="background:var(--success-bg);border-color:#bfe5cc;margin-bottom:14px;font-size:0.85rem">
            <strong>${result.created} created</strong>, <strong>${result.updated} updated</strong>, ${result.skipped} skipped.
            ${result.errors.length > 0 ? `<ul style="margin:8px 0 0;padding-left:18px">${result.errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>` : ''}
          </div>
        `;
        Toast.success('Import complete.');
        this.products = await Api.get('/products');
        this.categories = await Api.get('/categories');
      } catch (err) {
        Toast.error(err.message);
      }
      runBtn.disabled = false;
      runBtn.textContent = 'Import File';
    });
  },

  openProductModal(product) {
    const isEdit = !!product;
    Modal.open(isEdit ? 'Edit Product' : 'Add Product', `
      <form id="product-form">
        <div class="form-group">
          <label class="form-label">Product Name</label>
          <input class="form-input" id="p-name" value="${escapeHtml(product?.name || '')}" required>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Barcode</label>
            <div style="display:flex;gap:8px">
              <input class="form-input" id="p-barcode" value="${escapeHtml(product?.barcode || '')}" placeholder="Scan or type barcode">
              <button type="button" class="btn-quick-add" id="generate-barcode-btn" title="Generate a barcode number">${Icon.box}</button>
              <button type="button" class="btn-quick-add" id="lookup-barcode-btn" title="Auto-fill name/category/photo from this barcode using online product databases">🌐</button>
            </div>
            <div class="form-hint">Scan with a barcode scanner, type manually, generate one, or click 🌐 to auto-fill details online.</div>
          </div>
          ${QuickAddSelect.render({ id: 'p-category', label: 'Category', options: this.categories, selectedId: product?.categoryId, placeholder: 'No category' })}
        </div>
        <div id="lookup-result-box"></div>

        <div class="form-group product-photo-group">
          <label class="form-label">Product Photo (optional)</label>
          <input type="hidden" id="p-photo" value="${escapeHtml(product?.photo || '')}">
          <div class="product-photo-row">
            <div class="product-photo-preview" id="photo-preview">
              ${product?.photo
                ? `<img src="${escapeHtml(product.photo)}" alt="Product photo">`
                : `<span class="product-photo-placeholder">📦</span>`}
            </div>
            <div class="product-photo-actions">
              <button type="button" class="btn-icon-label" id="search-photo-btn">🔍 Search Photo Online</button>
              <label class="btn-icon-label" style="cursor:pointer">
                📤 Upload From Device
                <input type="file" id="photo-upload-input" accept="image/*" style="display:none">
              </label>
              <button type="button" class="btn-icon-label danger" id="remove-photo-btn" ${product?.photo ? '' : 'style="display:none"'}>🗑 Remove Photo</button>
            </div>
          </div>
          <div id="photo-search-box" style="display:none">
            <div style="display:flex;gap:8px;margin-top:10px">
              <input class="form-input" id="photo-search-input" placeholder="Search product name for photos (e.g. Basmati Rice)" value="${escapeHtml(product?.name || '')}">
              <button type="button" class="btn btn-outline btn-sm" id="run-photo-search-btn">Search</button>
            </div>
            <div id="photo-results-grid" class="photo-results-grid"></div>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Cost Price (BHD)</label>
            <input class="form-input" id="p-cost" type="number" step="0.001" value="${product?.costPrice ?? '0.000'}">
          </div>
          <div class="form-group">
            <label class="form-label">Sell Price (BHD)</label>
            <input class="form-input" id="p-price" type="number" step="0.001" value="${product?.sellPrice ?? ''}" required>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">${isEdit ? 'Current Stock' : 'Initial Stock'}</label>
            <input class="form-input" id="p-stock" type="number" value="${product?.stock ?? 0}" ${isEdit ? 'disabled' : ''}>
            ${isEdit ? '<div class="form-hint">Use "Adjust Stock" to change quantity.</div>' : ''}
          </div>
          <div class="form-group">
            <label class="form-label">Unit</label>
            <input class="form-input" id="p-unit" value="${escapeHtml(product?.unit || 'pcs')}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" id="p-vat" ${product?.vatApplicable !== false ? 'checked' : ''} style="width:auto">
            Subject to VAT (${App.settings.vatRate}%)
          </label>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Expiry Date (optional)</label>
            <input class="form-input" id="p-expiry" type="date" value="${product?.expiryDate ? product.expiryDate.slice(0, 10) : ''}">
            <div class="form-hint">Tracked automatically in Expiry &amp; Returns.</div>
          </div>
          ${QuickAddSelect.render({ id: 'p-supplier', label: 'Supplier (optional)', options: this.suppliers || [], selectedId: product?.supplierId, placeholder: 'No supplier' })}
        </div>
        <button type="submit" class="btn btn-gold" style="width:100%;justify-content:center;padding:12px">
          ${isEdit ? 'Save Changes' : 'Add Product'}
        </button>
      </form>
    `);

    QuickAddSelect.wire('p-category', (name) => Api.post('/categories', { name }), (created) => {
      this.categories.push(created);
    });
    QuickAddSelect.wire('p-supplier', (name) => Api.post('/suppliers', { name }), (created) => {
      this.suppliers.push(created);
    });

    document.getElementById('generate-barcode-btn').addEventListener('click', () => {
      const rand = () => Math.floor(Math.random() * 10);
      const code = '20' + Array.from({ length: 10 }, rand).join('');
      document.getElementById('p-barcode').value = code;
    });

    // ── Set the product photo (preview + hidden field + remove button) ──
    const setPhoto = (url) => {
      document.getElementById('p-photo').value = url || '';
      document.getElementById('photo-preview').innerHTML = url
        ? `<img src="${escapeHtml(url)}" alt="Product photo">`
        : `<span class="product-photo-placeholder">📦</span>`;
      document.getElementById('remove-photo-btn').style.display = url ? '' : 'none';
    };

    document.getElementById('remove-photo-btn').addEventListener('click', () => setPhoto(''));

    document.getElementById('photo-upload-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file || !file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (ev) => { setPhoto(ev.target.result); Toast.success('Photo uploaded.'); };
      reader.readAsDataURL(file);
    });

    // ── Search product photos online (server-side proxy, no CORS issues) ──
    const photoSearchBox = document.getElementById('photo-search-box');
    document.getElementById('search-photo-btn').addEventListener('click', () => {
      const showing = photoSearchBox.style.display !== 'none';
      photoSearchBox.style.display = showing ? 'none' : 'block';
    });
    const runPhotoSearch = async () => {
      const q = document.getElementById('photo-search-input').value.trim();
      if (!q) { Toast.error('Type a product name to search.'); return; }
      const grid = document.getElementById('photo-results-grid');
      grid.innerHTML = `<div class="empty-state" style="padding:16px;grid-column:1/-1">Searching online product databases...</div>`;
      try {
        const { results } = await Api.get(`/products/image-search?q=${encodeURIComponent(q)}`);
        if (!results || results.length === 0) {
          grid.innerHTML = `<div class="empty-state" style="padding:16px;grid-column:1/-1">No photos found. Try a different search term, or upload one.</div>`;
          return;
        }
        grid.innerHTML = results.map((r, i) => `
          <button type="button" class="photo-result-thumb" data-idx="${i}" title="${escapeHtml(r.name || 'Use this photo')}">
            <img src="${escapeHtml(r.photo)}" alt="${escapeHtml(r.name || '')}">
          </button>
        `).join('');
        grid.querySelectorAll('.photo-result-thumb').forEach(btn => {
          btn.addEventListener('click', () => {
            setPhoto(results[Number(btn.dataset.idx)].photo);
            photoSearchBox.style.display = 'none';
            Toast.success('Photo selected.');
          });
        });
      } catch (err) {
        grid.innerHTML = `<div class="empty-state" style="padding:16px;grid-column:1/-1">Image search failed: ${escapeHtml(err.message)}</div>`;
      }
    };
    document.getElementById('run-photo-search-btn').addEventListener('click', runPhotoSearch);
    document.getElementById('photo-search-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); runPhotoSearch(); }
    });

    // ── Auto-fill product details from an online barcode lookup ──
    document.getElementById('lookup-barcode-btn').addEventListener('click', async () => {
      const barcode = document.getElementById('p-barcode').value.trim();
      const box = document.getElementById('lookup-result-box');
      if (!barcode || barcode.length < 6) {
        Toast.error('Enter a barcode first (at least 6 digits).');
        return;
      }
      box.innerHTML = `<div class="empty-state" style="padding:12px">🌐 Looking up barcode ${escapeHtml(barcode)}...</div>`;
      try {
        const result = await Api.get(`/products/lookup/${encodeURIComponent(barcode)}`);
        if (!result.found) {
          box.innerHTML = `<div class="form-hint" style="color:var(--danger-600, #c0392b)">No product found online for this barcode. Fill in the details manually.</div>`;
          return;
        }
        box.innerHTML = `
          <div class="card" style="background:var(--gold-100);border-color:rgba(201,162,39,0.3);padding:12px;margin-bottom:14px">
            <div style="font-size:0.78rem;color:var(--gold-600);margin-bottom:6px">✅ Found via ${escapeHtml(result.source)}</div>
            <div style="display:flex;gap:10px;align-items:center">
              ${result.photo ? `<img src="${escapeHtml(result.photo)}" style="width:48px;height:48px;object-fit:cover;border-radius:8px">` : ''}
              <div>
                <strong>${escapeHtml(result.name || '')}</strong>
                ${result.category ? `<div style="font-size:0.78rem;color:var(--text-muted)">${escapeHtml(result.category)}</div>` : ''}
              </div>
            </div>
            <button type="button" class="btn btn-gold btn-sm" id="apply-lookup-btn" style="margin-top:10px">Fill In These Details</button>
          </div>
        `;
        document.getElementById('apply-lookup-btn').addEventListener('click', () => {
          const nameInput = document.getElementById('p-name');
          if (result.name && !nameInput.value.trim()) nameInput.value = result.name;
          if (result.photo) setPhoto(result.photo);
          box.innerHTML = '';
          Toast.success('Product details filled in from online lookup.');
        });
      } catch (err) {
        box.innerHTML = `<div class="form-hint" style="color:var(--danger-600, #c0392b)">Lookup failed: ${escapeHtml(err.message)}</div>`;
      }
    });

    document.getElementById('product-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('p-name').value.trim(),
        barcode: document.getElementById('p-barcode').value.trim(),
        categoryId: document.getElementById('p-category').value || null,
        supplierId: document.getElementById('p-supplier').value || null,
        costPrice: Number(document.getElementById('p-cost').value) || 0,
        sellPrice: Number(document.getElementById('p-price').value),
        unit: document.getElementById('p-unit').value.trim() || 'pcs',
        vatApplicable: document.getElementById('p-vat').checked,
        expiryDate: document.getElementById('p-expiry').value ? new Date(document.getElementById('p-expiry').value).toISOString() : null,
        photo: document.getElementById('p-photo').value || ''
      };
      if (!isEdit) payload.stock = Number(document.getElementById('p-stock').value) || 0;
      try {
        if (isEdit) {
          await Api.put(`/products/${product.id}`, payload);
          Toast.success('Product updated.');
        } else {
          await Api.post('/products', payload);
          Toast.success('Product added.');
        }
        Modal.close();
        this.products = await Api.get('/products');
        this.renderScreen();
      } catch (err) {
        Toast.error(err.message);
      }
    });
  },

  openAdjustStockModal(product) {
    Modal.open(`Adjust Stock - ${escapeHtml(product.name)}`, `
      <p style="color:var(--text-secondary);font-size:0.86rem;margin-bottom:16px">Current stock: <strong>${product.stock} ${escapeHtml(product.unit)}</strong></p>
      <form id="adjust-form">
        <div class="form-group">
          <label class="form-label">Adjustment Quantity</label>
          <input class="form-input" id="adj-qty" type="number" placeholder="e.g. 10 to add, -5 to remove" required>
          <div class="form-hint">Use a positive number to add stock, negative to remove.</div>
        </div>
        <div class="form-group">
          <label class="form-label">Reason / Note</label>
          <input class="form-input" id="adj-note" placeholder="e.g. Stock count correction">
        </div>
        <button type="submit" class="btn btn-gold" style="width:100%;justify-content:center;padding:12px">Apply Adjustment</button>
      </form>
    `);
    document.getElementById('adjust-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const qty = Number(document.getElementById('adj-qty').value);
      const note = document.getElementById('adj-note').value.trim();
      try {
        await Api.post(`/products/${product.id}/adjust-stock`, { quantity: qty, note });
        Toast.success('Stock adjusted.');
        Modal.close();
        this.products = await Api.get('/products');
        this.renderScreen();
      } catch (err) {
        Toast.error(err.message);
      }
    });
  },

  async deleteProduct(id) {
    if (!confirm('Delete this product? This cannot be undone.')) return;
    try {
      await Api.del(`/products/${id}`);
      Toast.success('Product deleted.');
      this.products = await Api.get('/products');
      this.renderScreen();
    } catch (err) {
      Toast.error(err.message);
    }
  },

  openCategoriesModal() {
    const renderList = () => `
      <div style="margin-bottom:16px">
        ${this.categories.map(c => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border)">
            <span>${escapeHtml(c.name)}</span>
            <div>
              <button class="row-action row-action-edit edit-cat-btn" data-id="${c.id}">${Icon.edit}</button>
              <button class="row-action row-action-delete del-cat-btn" data-id="${c.id}">${Icon.trash}</button>
            </div>
          </div>
        `).join('') || '<p style="color:var(--text-muted);font-size:0.85rem">No categories yet.</p>'}
      </div>
      <form id="cat-form" style="display:flex;gap:8px">
        <input class="form-input" id="new-cat-name" placeholder="New category name" required>
        <button type="submit" class="btn btn-primary btn-sm">Add</button>
      </form>
    `;
    Modal.open('Manage Categories', renderList());
    const wire = () => {
      document.getElementById('cat-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('new-cat-name').value.trim();
        if (!name) return;
        try {
          await Api.post('/categories', { name });
          this.categories = await Api.get('/categories');
          document.getElementById('modal-body').innerHTML = renderList();
          wire();
        } catch (err) { Toast.error(err.message); }
      });
      document.querySelectorAll('.edit-cat-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const category = this.categories.find(c => c.id === Number(btn.dataset.id));
          const newName = prompt('Rename category:', category.name);
          if (!newName || !newName.trim() || newName.trim() === category.name) return;
          Api.put(`/categories/${category.id}`, { name: newName.trim() })
            .then(async () => {
              Toast.success('Category renamed.');
              this.categories = await Api.get('/categories');
              document.getElementById('modal-body').innerHTML = renderList();
              wire();
            })
            .catch(err => Toast.error(err.message));
        });
      });
      document.querySelectorAll('.del-cat-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this category?')) return;
          try {
            await Api.del(`/categories/${btn.dataset.id}`);
            this.categories = await Api.get('/categories');
            document.getElementById('modal-body').innerHTML = renderList();
            wire();
          } catch (err) { Toast.error(err.message); }
        });
      });
    };
    wire();
  }
};
