// Third Eye Computer Solutions - POS System
// Expiry & Returns screen - tracks product expiry status and records
// returns to suppliers (expired, damaged, overstocked, etc.) with
// automatic stock deduction.

const ExpiryScreen = {
  tracked: [],
  manualItems: [],
  returns: [],
  products: [],
  suppliers: [],
  activeTab: 'expired',

  statusBadge: { expired: 'badge-danger', critical: 'badge-danger', warning: 'badge-warning', ok: 'badge-success' },
  reasonLabels: {
    expired: 'Expired', near_expiry: 'Near Expiry', damaged: 'Damaged',
    quality_issue: 'Quality Issue', overstocked: 'Overstocked'
  },

  async render() {
    Shell.mount('/expiry', `<div class="empty-state">Loading...</div>`);
    await this.loadAll();
    this.renderScreen();
  },

  async loadAll() {
    try {
      [this.tracked, this.manualItems, this.returns, this.products, this.suppliers] = await Promise.all([
        Api.get('/expiry/tracked'),
        Api.get('/expiry/items'),
        Api.get('/returns'),
        Api.get('/products'),
        Api.get('/suppliers')
      ]);
    } catch (err) {
      Toast.error(err.message);
    }
  },

  getAllExpiryRows() {
    return [...this.tracked, ...this.manualItems];
  },

  renderScreen() {
    const all = this.getAllExpiryRows();
    const expiredCount = all.filter(i => i.status === 'expired').length;
    const criticalCount = all.filter(i => i.status === 'critical').length;
    const warningCount = all.filter(i => i.status === 'warning').length;
    const damagedCount = this.returns.filter(r => r.reason === 'damaged' || r.reason === 'quality_issue').length;

    const content = `
      <div class="page-header">
        <div>
          <h1>Expiry &amp; Returns</h1>
          <div class="page-subtitle">Track expiring stock and supplier returns</div>
        </div>
        <div style="display:flex;gap:10px">
          <button class="btn-icon-label" id="add-expiry-item-btn">${Icon.plus} Track Item for Expiry</button>
          <button class="btn btn-gold" id="new-return-btn">${Icon.truck} Return to Supplier</button>
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat-card danger-accent"><div class="stat-label">Expired</div><div class="stat-value">${expiredCount}</div></div>
        <div class="stat-card danger-accent"><div class="stat-label">Critical (&le;7 days)</div><div class="stat-value">${criticalCount}</div></div>
        <div class="stat-card"><div class="stat-label">Warning (&le;30 days)</div><div class="stat-value">${warningCount}</div></div>
        <div class="stat-card"><div class="stat-label">Damaged/Quality Returns</div><div class="stat-value">${damagedCount}</div></div>
      </div>

      <div class="tabs">
        <div class="tab ${this.activeTab === 'expired' ? 'active' : ''}" data-tab="expired">Expiring Items</div>
        <div class="tab ${this.activeTab === 'damaged' ? 'active' : ''}" data-tab="damaged">Damaged Returns</div>
        <div class="tab ${this.activeTab === 'history' ? 'active' : ''}" data-tab="history">Return History</div>
      </div>
      <div id="expiry-tab-content"></div>
    `;
    document.getElementById('content').innerHTML = content;

    document.getElementById('add-expiry-item-btn').addEventListener('click', () => this.openAddExpiryItemModal());
    document.getElementById('new-return-btn').addEventListener('click', () => this.openReturnModal());
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => { this.activeTab = tab.dataset.tab; this.renderScreen(); });
    });

    if (this.activeTab === 'expired') this.renderExpiringTab();
    else if (this.activeTab === 'damaged') this.renderDamagedTab();
    else this.renderHistoryTab();
  },

  renderExpiringTab() {
    const all = this.getAllExpiryRows().sort((a, b) => a.daysLeft - b.daysLeft);
    const el = document.getElementById('expiry-tab-content');
    el.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Item</th><th>Source</th><th>Qty</th><th>Expiry Date</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${all.length === 0 ? `<tr><td colspan="6"><div class="empty-state"><p>No items being tracked for expiry. Set an Expiry Date on a product, or add a manual item above.</p></div></td></tr>` : all.map(i => `
              <tr>
                <td><strong>${escapeHtml(i.name || i.itemName)}</strong></td>
                <td>${i.name ? '<span class="badge badge-neutral">Product</span>' : '<span class="badge badge-neutral">Manual Entry</span>'}</td>
                <td>${i.stock !== undefined ? i.stock : i.quantity} ${escapeHtml(i.unit || 'pcs')}</td>
                <td>${formatDate(i.expiryDate)}</td>
                <td><span class="badge ${this.statusBadge[i.status]}">${i.status === 'expired' ? `Expired ${Math.abs(i.daysLeft)}d ago` : `${i.daysLeft} days left`}</span></td>
                <td style="text-align:right">
                  ${i.id !== undefined && i.name ? `<button class="row-action row-action-adjust quick-return-btn" data-product-id="${i.id}" title="Return to supplier">${Icon.truck}</button>` : ''}
                  ${!i.name ? `<button class="row-action row-action-delete del-expiry-item-btn" data-id="${i.id}" title="Remove">${Icon.trash}</button>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    document.querySelectorAll('.quick-return-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openReturnModal(Number(btn.dataset.productId)));
    });
    document.querySelectorAll('.del-expiry-item-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remove this tracked item?')) return;
        try {
          await Api.del(`/expiry/items/${btn.dataset.id}`);
          await this.loadAll();
          this.renderScreen();
        } catch (err) { Toast.error(err.message); }
      });
    });
  },

  renderDamagedTab() {
    const settings = App.settings;
    const damaged = this.returns.filter(r => r.reason === 'damaged' || r.reason === 'quality_issue');
    const el = document.getElementById('expiry-tab-content');
    el.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Item</th><th>Reason</th><th>Qty</th><th>Cost</th><th>Date</th><th>Notes</th></tr></thead>
          <tbody>
            ${damaged.length === 0 ? `<tr><td colspan="6"><div class="empty-state"><p>No damaged or quality-issue returns recorded.</p></div></td></tr>` : damaged.map(r => `
              <tr>
                <td><strong>${escapeHtml(r.itemName)}</strong></td>
                <td><span class="badge badge-danger">${this.reasonLabels[r.reason]}</span></td>
                <td>${r.quantity}</td>
                <td>${formatMoney(r.totalCost, settings)}</td>
                <td>${formatDate(r.createdAt)}</td>
                <td>${escapeHtml(r.notes || '-')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  renderHistoryTab() {
    const settings = App.settings;
    const el = document.getElementById('expiry-tab-content');
    const totalCost = this.returns.reduce((sum, r) => sum + r.totalCost, 0);
    el.innerHTML = `
      <div class="toolbar-row">
        <button class="btn-icon-label" id="export-returns-btn">${Icon.copy} Export to Excel/CSV</button>
        <div style="margin-left:auto;font-size:0.85rem;color:var(--text-secondary)">Total returned value: <strong>${formatMoneyPlain(totalCost, settings)} ${settings.currency}</strong></div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Item</th><th>Supplier</th><th>Reason</th><th>Qty</th><th>Unit Cost</th><th>Total Cost</th><th>Date</th><th></th></tr></thead>
          <tbody>
            ${this.returns.length === 0 ? `<tr><td colspan="8"><div class="empty-state"><p>No returns recorded yet.</p></div></td></tr>` : this.returns.map(r => {
              const supplier = this.suppliers.find(s => s.id === r.supplierId);
              return `
              <tr>
                <td><strong>${escapeHtml(r.itemName)}</strong></td>
                <td>${supplier ? escapeHtml(supplier.name) : '-'}</td>
                <td><span class="badge badge-neutral">${this.reasonLabels[r.reason]}</span></td>
                <td>${r.quantity}</td>
                <td>${formatMoney(r.unitCost, settings)}</td>
                <td>${formatMoney(r.totalCost, settings)}</td>
                <td>${formatDate(r.createdAt)}</td>
                <td><button class="row-action row-action-delete del-return-btn" data-id="${r.id}" title="Delete">${Icon.trash}</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
    document.getElementById('export-returns-btn').addEventListener('click', () => {
      const rows = [['Item', 'Supplier', 'Reason', 'Qty', 'Unit Cost', 'Total Cost', 'Date']];
      this.returns.forEach(r => {
        const supplier = this.suppliers.find(s => s.id === r.supplierId);
        rows.push([r.itemName, supplier ? supplier.name : '', this.reasonLabels[r.reason], r.quantity, r.unitCost.toFixed(3), r.totalCost.toFixed(3), formatDate(r.createdAt)]);
      });
      const csv = rows.map(row => row.map(c => { const s = String(c); return s.includes(',') ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\r\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `supplier-returns-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      URL.revokeObjectURL(url);
    });

    // Delete return record
    el.querySelectorAll('.del-return-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this return record?')) return;
        const id = btn.dataset.id;
        await Api.delete(`/returns/${id}`);
        await this.load();
      });
    });
  },

  openAddExpiryItemModal() {
    Modal.open('Track Item for Expiry', `
      <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:16px">For tracking items that aren't in your product catalog (e.g. a quick batch entry). To track a catalog product's expiry, edit it directly in Products.</p>
      <form id="expiry-item-form">
        <div class="form-group">
          <label class="form-label">Item Name</label>
          <input class="form-input" id="ei-name" required>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Quantity</label>
            <input class="form-input" id="ei-qty" type="number" value="1" min="1">
          </div>
          <div class="form-group">
            <label class="form-label">Unit</label>
            <input class="form-input" id="ei-unit" value="pcs">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Cost (BHD)</label>
            <input class="form-input" id="ei-cost" type="number" step="0.001" value="0">
          </div>
          <div class="form-group">
            <label class="form-label">Expiry Date</label>
            <input class="form-input" id="ei-expiry" type="date" required>
          </div>
        </div>
        <div class="form-group">
          ${QuickAddSelect.render({ id: 'ei-supplier', label: 'Supplier (optional)', options: this.suppliers, placeholder: 'No supplier' })}
        </div>
        <button type="submit" class="btn btn-gold" style="width:100%;justify-content:center;padding:12px">Add Item</button>
      </form>
    `);
    QuickAddSelect.wire('ei-supplier', (name) => Api.post('/suppliers', { name }), (created) => {
      this.suppliers.push(created);
    });
    document.getElementById('expiry-item-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await Api.post('/expiry/items', {
          itemName: document.getElementById('ei-name').value.trim(),
          quantity: Number(document.getElementById('ei-qty').value) || 1,
          unit: document.getElementById('ei-unit').value.trim() || 'pcs',
          cost: Number(document.getElementById('ei-cost').value) || 0,
          expiryDate: new Date(document.getElementById('ei-expiry').value).toISOString(),
          supplierId: document.getElementById('ei-supplier').value || null
        });
        Toast.success('Item added to expiry tracking.');
        Modal.close();
        await this.loadAll();
        this.renderScreen();
      } catch (err) { Toast.error(err.message); }
    });
  },

  openReturnModal(preselectedProductId) {
    Modal.open('Return to Supplier', `
      <form id="return-form">
        <div class="form-group">
          <label class="form-label">Product (optional - leave blank for a non-catalog item)</label>
          <select class="form-select" id="ret-product">
            <option value="">Not in catalog</option>
            ${this.products.map(p => `<option value="${p.id}" ${preselectedProductId === p.id ? 'selected' : ''}>${escapeHtml(p.name)} (${p.stock} in stock)</option>`).join('')}
          </select>
        </div>
        <div class="form-group" id="ret-name-group" style="${preselectedProductId ? 'display:none' : ''}">
          <label class="form-label">Item Name</label>
          <input class="form-input" id="ret-name">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Reason</label>
            <select class="form-select" id="ret-reason">
              <option value="expired">Expired</option>
              <option value="near_expiry">Near Expiry</option>
              <option value="damaged">Damaged</option>
              <option value="quality_issue">Quality Issue</option>
              <option value="overstocked">Overstocked</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Quantity</label>
            <input class="form-input" id="ret-qty" type="number" min="1" value="1" required>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Unit Cost (BHD, optional - uses product cost if blank)</label>
          <input class="form-input" id="ret-cost" type="number" step="0.001">
        </div>
        <div class="form-group">
          ${QuickAddSelect.render({ id: 'ret-supplier', label: 'Supplier', options: this.suppliers, placeholder: 'No supplier' })}
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <input class="form-input" id="ret-notes" placeholder="Optional">
        </div>
        <button type="submit" class="btn btn-gold" style="width:100%;justify-content:center;padding:12px">Record Return</button>
      </form>
    `, { large: true });

    QuickAddSelect.wire('ret-supplier', (name) => Api.post('/suppliers', { name }), (created) => {
      this.suppliers.push(created);
    });
    document.getElementById('ret-product').addEventListener('change', (e) => {
      document.getElementById('ret-name-group').style.display = e.target.value ? 'none' : 'block';
    });
    document.getElementById('return-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const productId = document.getElementById('ret-product').value || null;
      const itemName = document.getElementById('ret-name').value.trim();
      if (!productId && !itemName) { Toast.error('Select a product or enter an item name.'); return; }
      try {
        await Api.post('/returns', {
          productId,
          itemName,
          reason: document.getElementById('ret-reason').value,
          quantity: Number(document.getElementById('ret-qty').value),
          unitCost: document.getElementById('ret-cost').value ? Number(document.getElementById('ret-cost').value) : undefined,
          supplierId: document.getElementById('ret-supplier').value || null,
          notes: document.getElementById('ret-notes').value.trim()
        });
        Toast.success('Return recorded.');
        Modal.close();
        await this.loadAll();
        this.renderScreen();
      } catch (err) { Toast.error(err.message); }
    });
  }
};
