// Third Eye Computer Solutions - POS System
// Purchases module screen - record stock-in from suppliers.

const PurchasesScreen = {
  purchases: [],
  suppliers: [],
  products: [],
  draftItems: [],

  async render() {
    Shell.mount('/purchases', `<div class="empty-state">Loading purchases...</div>`);
    try {
      [this.purchases, this.suppliers, this.products] = await Promise.all([
        Api.get('/purchases'),
        Api.get('/suppliers'),
        Api.get('/products')
      ]);
    } catch (err) {
      Toast.error(err.message);
      return;
    }
    this.renderScreen();
  },

  renderScreen() {
    const settings = App.settings;
    const content = `
      <div class="page-header">
        <div>
          <h1>Purchases</h1>
          <div class="page-subtitle">Record stock received from suppliers</div>
        </div>
        <div style="display:flex;gap:10px">
          <button class="btn btn-outline" id="manage-suppliers-btn">Suppliers</button>
          <button class="btn btn-gold" id="new-purchase-btn">
            <span style="width:16px;height:16px;display:flex">${Icon.plus}</span> New Purchase
          </button>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Supplier</th><th>Items</th><th>Total</th><th>Note</th></tr></thead>
          <tbody>
            ${this.purchases.length === 0 ? `<tr><td colspan="5"><div class="empty-state"><p>No purchases recorded yet.</p></div></td></tr>` : this.purchases.map(p => {
              const supplier = this.suppliers.find(s => s.id === p.supplierId);
              return `
              <tr>
                <td>${formatDateTime(p.createdAt)}</td>
                <td>${supplier ? escapeHtml(supplier.name) : '<span style="color:var(--text-muted)">-</span>'}</td>
                <td><a href="#" class="view-purchase-link" data-id="${p.id}" style="color:var(--navy-700);text-decoration:underline">View items</a></td>
                <td>${formatMoney(p.total, settings)}</td>
                <td>${escapeHtml(p.note || '-')}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
    document.getElementById('content').innerHTML = content;
    document.getElementById('new-purchase-btn').addEventListener('click', () => this.openNewPurchaseModal());
    document.getElementById('manage-suppliers-btn').addEventListener('click', () => this.openSuppliersModal());
    document.querySelectorAll('.view-purchase-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        this.viewPurchase(Number(link.dataset.id));
      });
    });
  },

  async viewPurchase(id) {
    try {
      const purchase = await Api.get(`/purchases/${id}`);
      Modal.open(`Purchase #${purchase.id}`, `
        <div class="table-wrap" style="box-shadow:none">
          <table>
            <thead><tr><th>Product</th><th>Qty</th><th>Cost</th><th>Total</th></tr></thead>
            <tbody>
              ${purchase.items.map(i => `
                <tr>
                  <td>${escapeHtml(i.productName)}</td>
                  <td>${i.quantity}</td>
                  <td>${formatMoney(i.costPrice, App.settings)}</td>
                  <td>${formatMoney(i.lineTotal, App.settings)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `);
    } catch (err) {
      Toast.error(err.message);
    }
  },

  openNewPurchaseModal() {
    this.draftItems = [];
    const render = () => `
      ${QuickAddSelect.render({ id: 'purchase-supplier', label: 'Supplier (optional)', options: this.suppliers, placeholder: 'No supplier' })}
      <div class="form-group">
        <label class="form-label">Add Item</label>
        <div style="display:flex;gap:8px;margin-bottom:6px">
          <input class="form-input" id="purchase-barcode" placeholder="Scan barcode or type to search product..." style="flex:3">
          <button class="btn btn-primary btn-sm" id="barcode-search-btn">Search</button>
        </div>
        <div id="barcode-results" style="margin-bottom:8px"></div>
        <div style="display:flex;gap:8px">
          <select class="form-select" id="purchase-product-select" style="flex:2">
            <option value="">Select product...</option>
            ${this.products.map(p => `<option value="${p.id}">${escapeHtml(p.name)}${p.barcode ? ` [${p.barcode}]` : ''}</option>`).join('')}
          </select>
          <input class="form-input" id="purchase-qty" type="number" placeholder="Qty" style="flex:1" min="1">
          <input class="form-input" id="purchase-cost" type="number" step="0.001" placeholder="Cost" style="flex:1">
          <button class="btn btn-primary btn-sm" id="add-item-btn">Add</button>
        </div>
      </div>
      <div id="draft-items-list" style="margin:14px 0">
        ${this.draftItems.length === 0 ? '<p style="color:var(--text-muted);font-size:0.85rem">No items added yet.</p>' : `
        <div class="table-wrap" style="box-shadow:none">
          <table>
            <thead><tr><th>Product</th><th>Qty</th><th>Cost</th><th>Total</th><th></th></tr></thead>
            <tbody>
              ${this.draftItems.map((item, idx) => `
                <tr>
                  <td>${escapeHtml(item.productName)}</td>
                  <td>${item.quantity}</td>
                  <td>${formatMoneyPlain(item.costPrice, App.settings)}</td>
                  <td>${formatMoneyPlain(item.quantity * item.costPrice, App.settings)}</td>
                  <td><button class="row-action row-action-delete remove-draft-item" data-idx="${idx}">${Icon.x}</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`}
      </div>
      <div class="form-group">
        <label class="form-label">Note</label>
        <input class="form-input" id="purchase-note" placeholder="Optional note">
      </div>
      <button class="btn btn-gold" id="save-purchase-btn" style="width:100%;justify-content:center;padding:12px" ${this.draftItems.length === 0 ? 'disabled' : ''}>
        Save Purchase
      </button>
    `;

    Modal.open('New Purchase', render(), { large: true });
    QuickAddSelect.wire('purchase-supplier', (name) => Api.post('/suppliers', { name }), (created) => {
      this.suppliers.push(created);
    });
    this.wirePurchaseModal(render);
  },

  wirePurchaseModal(render) {
    // Barcode / name search
    const barcodeInput = document.getElementById('purchase-barcode');
    const searchBtn = document.getElementById('barcode-search-btn');
    const doSearch = () => {
      const q = barcodeInput.value.trim().toLowerCase();
      if (!q) return;
      const matches = this.products.filter(p =>
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        p.name.toLowerCase().includes(q)
      );
      const resultsDiv = document.getElementById('barcode-results');
      if (matches.length === 0) {
        resultsDiv.innerHTML = `<div style="color:var(--text-danger);font-size:12px">No product found for "${q}"</div>`;
      } else if (matches.length === 1) {
        // Auto-select if only one match
        document.getElementById('purchase-product-select').value = matches[0].id;
        resultsDiv.innerHTML = `<div style="color:var(--text-success);font-size:12px">✓ Selected: ${escapeHtml(matches[0].name)}</div>`;
        barcodeInput.value = '';
      } else {
        resultsDiv.innerHTML = matches.slice(0,5).map(p =>
          `<button class="btn btn-sm" style="margin:2px;font-size:12px" onclick="document.getElementById('purchase-product-select').value='${p.id}';document.getElementById('barcode-results').innerHTML='<div style=color:var(--text-success);font-size:12px>✓ Selected: ${escapeHtml(p.name)}</div>'">${escapeHtml(p.name)}</button>`
        ).join('');
      }
    };
    if (searchBtn) searchBtn.addEventListener('click', doSearch);
    if (barcodeInput) barcodeInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });

    document.getElementById('add-item-btn').addEventListener('click', () => {
      const select = document.getElementById('purchase-product-select');
      const productId = Number(select.value);
      const qty = Number(document.getElementById('purchase-qty').value);
      const cost = Number(document.getElementById('purchase-cost').value);
      if (!productId || !qty || cost === undefined || isNaN(cost)) {
        Toast.error('Select a product, quantity, and cost.');
        return;
      }
      const product = this.products.find(p => p.id === productId);
      this.draftItems.push({ productId, productName: product.name, quantity: qty, costPrice: cost });
      document.getElementById('modal-body').innerHTML = render();
      QuickAddSelect.wire('purchase-supplier', (name) => Api.post('/suppliers', { name }), (created) => {
        this.suppliers.push(created);
      });
      this.wirePurchaseModal(render);
    });

    document.querySelectorAll('.remove-draft-item').forEach(btn => {
      btn.addEventListener('click', () => {
        this.draftItems.splice(Number(btn.dataset.idx), 1);
        document.getElementById('modal-body').innerHTML = render();
        QuickAddSelect.wire('purchase-supplier', (name) => Api.post('/suppliers', { name }), (created) => {
          this.suppliers.push(created);
        });
        this.wirePurchaseModal(render);
      });
    });

    const saveBtn = document.getElementById('save-purchase-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const supplierId = document.getElementById('purchase-supplier').value || null;
        const note = document.getElementById('purchase-note').value.trim();
        try {
          await Api.post('/purchases', { supplierId, items: this.draftItems, note });
          Toast.success('Purchase saved and stock updated.');
          Modal.close();
          [this.purchases, this.products] = await Promise.all([Api.get('/purchases'), Api.get('/products')]);
          this.renderScreen();
        } catch (err) {
          Toast.error(err.message);
        }
      });
    }
  },

  openSuppliersModal() {
    const render = () => `
      <div style="margin-bottom:16px">
        ${this.suppliers.map(s => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border)">
            <div>
              <div style="font-weight:600">${escapeHtml(s.name)}</div>
              <div style="font-size:0.78rem;color:var(--text-muted)">${escapeHtml(s.phone || '')}</div>
            </div>
            <div>
              <button class="row-action row-action-edit edit-supplier-btn" data-id="${s.id}">${Icon.edit}</button>
              <button class="row-action row-action-delete del-supplier-btn" data-id="${s.id}">${Icon.trash}</button>
            </div>
          </div>
        `).join('') || '<p style="color:var(--text-muted);font-size:0.85rem">No suppliers yet.</p>'}
      </div>
      <form id="supplier-form">
        <div class="form-row">
          <input class="form-input" id="new-sup-name" placeholder="Supplier name" required>
          <input class="form-input" id="new-sup-phone" placeholder="Phone">
        </div>
        <button type="submit" class="btn btn-primary" style="margin-top:10px;width:100%;justify-content:center">Add Supplier</button>
      </form>
    `;
    Modal.open('Manage Suppliers', render(), { large: true });
    const wire = () => {
      document.getElementById('supplier-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('new-sup-name').value.trim();
        const phone = document.getElementById('new-sup-phone').value.trim();
        if (!name) return;
        try {
          await Api.post('/suppliers', { name, phone });
          this.suppliers = await Api.get('/suppliers');
          document.getElementById('modal-body').innerHTML = render();
          wire();
        } catch (err) { Toast.error(err.message); }
      });
      document.querySelectorAll('.edit-supplier-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const supplier = this.suppliers.find(s => s.id === Number(btn.dataset.id));
          this.openEditSupplierModal(supplier, render);
        });
      });
      document.querySelectorAll('.del-supplier-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this supplier?')) return;
          try {
            await Api.del(`/suppliers/${btn.dataset.id}`);
            this.suppliers = await Api.get('/suppliers');
            document.getElementById('modal-body').innerHTML = render();
            wire();
          } catch (err) { Toast.error(err.message); }
        });
      });
    };
    wire();
  },

  openEditSupplierModal(supplier, parentRender) {
    Modal.open('Edit Supplier', `
      <form id="edit-supplier-form">
        <div class="form-group">
          <label class="form-label">Supplier Name</label>
          <input class="form-input" id="edit-sup-name" value="${escapeHtml(supplier.name)}" required>
        </div>
        <div class="form-group">
          <label class="form-label">Phone</label>
          <input class="form-input" id="edit-sup-phone" value="${escapeHtml(supplier.phone || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input class="form-input" id="edit-sup-email" value="${escapeHtml(supplier.email || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Address</label>
          <input class="form-input" id="edit-sup-address" value="${escapeHtml(supplier.address || '')}">
        </div>
        <button type="submit" class="btn btn-gold" style="width:100%;justify-content:center;padding:12px">Save Changes</button>
      </form>
    `);
    document.getElementById('edit-supplier-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await Api.put(`/suppliers/${supplier.id}`, {
          name: document.getElementById('edit-sup-name').value.trim(),
          phone: document.getElementById('edit-sup-phone').value.trim(),
          email: document.getElementById('edit-sup-email').value.trim(),
          address: document.getElementById('edit-sup-address').value.trim()
        });
        Toast.success('Supplier updated.');
        this.suppliers = await Api.get('/suppliers');
        this.openSuppliersModal();
      } catch (err) { Toast.error(err.message); }
    });
  }
};
