// Third Eye Computer Solutions - POS System
// Vendors & Bills screen - tracks bills owed to suppliers and payments
// made against them, with running balances.

const VendorsScreen = {
  suppliers: [],
  bills: [],
  summary: [],
  activeTab: 'bills',
  filterSupplierId: '',
  filterStatus: '',

  async render() {
    Shell.mount('/vendors', `<div class="empty-state">Loading vendors...</div>`);
    await this.loadAll();
    this.renderScreen();
  },

  async loadAll() {
    try {
      [this.suppliers, this.bills, this.summary] = await Promise.all([
        Api.get('/suppliers'),
        Api.get('/vendor-bills'),
        Api.get('/vendors/summary')
      ]);
    } catch (err) {
      Toast.error(err.message);
    }
  },

  renderScreen() {
    const settings = App.settings;
    const totalOwed = this.summary.reduce((sum, s) => sum + s.balance, 0);

    const content = `
      <div class="page-header">
        <div>
          <h1>Vendors &amp; Bills</h1>
          <div class="page-subtitle">${this.suppliers.length} vendors &middot; ${formatMoneyPlain(totalOwed, settings)} ${settings.currency} outstanding</div>
        </div>
        <div style="display:flex;gap:10px">
          <button class="btn-icon-label" id="manage-vendors-btn">${Icon.truck} Manage Vendors</button>
          <button class="btn btn-gold" id="add-bill-btn">
            <span style="width:16px;height:16px;display:flex">${Icon.plus}</span> New Bill
          </button>
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat-card danger-accent">
          <div class="stat-label">Total Outstanding</div>
          <div class="stat-value">${formatMoney(totalOwed, settings)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Vendors with Balance</div>
          <div class="stat-value">${this.summary.filter(s => s.balance > 0).length}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Bills</div>
          <div class="stat-value">${this.bills.length}</div>
        </div>
      </div>

      <div class="tabs">
        <div class="tab ${this.activeTab === 'bills' ? 'active' : ''}" data-tab="bills">Bills</div>
        <div class="tab ${this.activeTab === 'summary' ? 'active' : ''}" data-tab="summary">Vendor Balances</div>
      </div>
      <div id="vendor-tab-content"></div>
    `;
    document.getElementById('content').innerHTML = content;

    document.getElementById('add-bill-btn').addEventListener('click', () => this.openBillModal());
    document.getElementById('manage-vendors-btn').addEventListener('click', () => this.openVendorsModal());
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => { this.activeTab = tab.dataset.tab; this.renderScreen(); });
    });

    if (this.activeTab === 'bills') this.renderBillsTab();
    else this.renderSummaryTab();
  },

  renderBillsTab() {
    const settings = App.settings;
    const el = document.getElementById('vendor-tab-content');
    const filtered = this.bills.filter(b =>
      (!this.filterSupplierId || b.supplierId === Number(this.filterSupplierId)) &&
      (!this.filterStatus || b.status === this.filterStatus)
    );
    el.innerHTML = `
      <div class="toolbar-row">
        <select class="form-select" id="bill-filter-supplier" style="max-width:220px">
          <option value="">All Vendors</option>
          ${this.suppliers.map(s => `<option value="${s.id}" ${this.filterSupplierId === String(s.id) ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
        </select>
        <select class="form-select" id="bill-filter-status" style="max-width:160px">
          <option value="">All Statuses</option>
          <option value="unpaid" ${this.filterStatus === 'unpaid' ? 'selected' : ''}>Unpaid</option>
          <option value="partial" ${this.filterStatus === 'partial' ? 'selected' : ''}>Partial</option>
          <option value="paid" ${this.filterStatus === 'paid' ? 'selected' : ''}>Paid</option>
        </select>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Vendor</th><th>Bill #</th><th>Date</th><th>Description</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${filtered.length === 0 ? `<tr><td colspan="9"><div class="empty-state"><p>No bills found.</p></div></td></tr>` : filtered.map(b => {
              const supplier = this.suppliers.find(s => s.id === b.supplierId);
              const balance = b.amount - b.amountPaid;
              const statusBadge = b.status === 'paid' ? 'badge-success' : b.status === 'partial' ? 'badge-warning' : 'badge-danger';
              return `
              <tr>
                <td><strong>${supplier ? escapeHtml(supplier.name) : '-'}</strong></td>
                <td style="font-family:var(--font-mono);font-size:0.8rem">${escapeHtml(b.billNumber || '-')}</td>
                <td>${formatDate(b.billDate)}</td>
                <td>${escapeHtml(b.description || '-')}</td>
                <td>${formatMoney(b.amount, settings)}</td>
                <td>${formatMoney(b.amountPaid, settings)}</td>
                <td>${formatMoney(balance, settings)}</td>
                <td><span class="badge ${statusBadge}">${b.status}</span></td>
                <td style="text-align:right;white-space:nowrap">
                  <div class="row-actions-group">
                    ${b.status !== 'paid' ? `<button class="row-action row-action-adjust pay-bill-btn" data-id="${b.id}" title="Pay">${Icon.cash}</button>` : ''}
                    <button class="row-action row-action-view view-bill-btn" data-id="${b.id}" title="View">${Icon.box}</button>
                    ${b.amountPaid === 0 ? `<button class="row-action row-action-delete delete-bill-btn" data-id="${b.id}" title="Delete">${Icon.trash}</button>` : ''}
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
    document.getElementById('bill-filter-supplier').addEventListener('change', (e) => { this.filterSupplierId = e.target.value; this.renderBillsTab(); });
    document.getElementById('bill-filter-status').addEventListener('change', (e) => { this.filterStatus = e.target.value; this.renderBillsTab(); });
    document.querySelectorAll('.pay-bill-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openPayModal(this.bills.find(b => b.id === Number(btn.dataset.id))));
    });
    document.querySelectorAll('.view-bill-btn').forEach(btn => {
      btn.addEventListener('click', () => this.viewBill(Number(btn.dataset.id)));
    });
    document.querySelectorAll('.delete-bill-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this bill?')) return;
        try {
          await Api.del(`/vendor-bills/${btn.dataset.id}`);
          Toast.success('Bill deleted.');
          await this.loadAll();
          this.renderScreen();
        } catch (err) { Toast.error(err.message); }
      });
    });
  },

  renderSummaryTab() {
    const settings = App.settings;
    const el = document.getElementById('vendor-tab-content');
    el.innerHTML = `
      <div class="toolbar-row">
        <div style="margin-left:auto"></div>
        <button class="btn-icon-label gold" id="vendor-summary-report-btn">${Icon.printer} Generate Report</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Vendor</th><th>Total Billed</th><th>Total Paid</th><th>Balance Owed</th><th>Bills</th><th></th></tr></thead>
          <tbody>
            ${this.summary.length === 0 ? `<tr><td colspan="6"><div class="empty-state"><p>No vendor activity yet.</p></div></td></tr>` : this.summary.map(s => `
              <tr>
                <td><strong>${escapeHtml(s.supplierName)}</strong></td>
                <td>${formatMoney(s.totalBilled, settings)}</td>
                <td>${formatMoney(s.totalPaid, settings)}</td>
                <td><span class="${s.balance > 0 ? 'badge badge-danger' : 'badge badge-success'}">${formatMoneyPlain(s.balance, settings)} ${settings.currency}</span></td>
                <td>${s.billCount} (${s.unpaidCount} unpaid)</td>
                <td style="text-align:right"><button class="row-action row-action-view with-label view-vendor-history-btn" data-id="${s.supplierId}">${Icon.box} Payment History</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    document.getElementById('vendor-summary-report-btn').addEventListener('click', () => this.generateSummaryReport());
    document.querySelectorAll('.view-vendor-history-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openVendorHistoryModal(Number(btn.dataset.id)));
    });
  },

  async openVendorHistoryModal(supplierId) {
    const settings = App.settings;
    const supplier = this.suppliers.find(s => s.id === supplierId);
    const s = this.summary.find(x => x.supplierId === supplierId);
    try {
      const payments = await Api.get(`/vendors/${supplierId}/payments`);
      Modal.open(`Payment History - ${escapeHtml(supplier ? supplier.name : '')}`, `
        <div class="summary-row"><span>Total Billed</span><span>${formatMoney(s ? s.totalBilled : 0, settings)}</span></div>
        <div class="summary-row"><span>Total Paid</span><span>${formatMoney(s ? s.totalPaid : 0, settings)}</span></div>
        <div class="summary-row total"><span>Balance Owed</span><span>${formatMoney(s ? s.balance : 0, settings)}</span></div>
        <h3 style="font-size:0.95rem;margin:16px 0 10px">All Payments</h3>
        ${payments.length === 0 ? '<p style="color:var(--text-muted);font-size:0.85rem">No payments recorded yet.</p>' : `
        <div class="table-wrap" style="box-shadow:none">
          <table>
            <thead><tr><th>Date</th><th>Bill #</th><th>Amount</th><th>Note</th></tr></thead>
            <tbody>${payments.map(p => `<tr><td>${formatDate(p.paymentDate)}</td><td>${escapeHtml(p.billNumber || '-')}</td><td>${formatMoney(p.amount, settings)}</td><td>${escapeHtml(p.note || '-')}</td></tr>`).join('')}</tbody>
          </table>
        </div>`}
      `, { large: true });
    } catch (err) { Toast.error(err.message); }
  },

  generateSummaryReport() {
    const settings = App.settings;
    const decimals = settings.currencyDecimals ?? 3;
    const totalOwed = this.summary.reduce((sum, s) => sum + s.balance, 0);
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>Vendor Balances Report</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 30px; color: #1C2530; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        .meta { color: #5B6675; font-size: 12px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #E2E5EA; font-size: 12px; }
        th { background: #F5F6F8; font-weight: 700; text-transform: uppercase; font-size: 10px; }
        .summary { display: flex; gap: 24px; margin: 16px 0; flex-wrap: wrap; }
        .summary div { font-size: 12px; }
        .summary strong { display: block; font-size: 17px; margin-top: 2px; }
        @media print { body { padding: 10px; } }
      </style></head>
      <body>
        <h1>${escapeHtml(settings.shopName || '')} - Vendor Balances Report</h1>
        <div class="meta">Generated ${formatDateTime(new Date().toISOString())}</div>
        <div class="summary">
          <div>Total Vendors<strong>${this.summary.length}</strong></div>
          <div>Total Outstanding<strong>${totalOwed.toFixed(decimals)} ${settings.currency}</strong></div>
        </div>
        <table>
          <thead><tr><th>Vendor</th><th>Total Billed</th><th>Total Paid</th><th>Balance Owed</th><th>Bills</th></tr></thead>
          <tbody>
            ${this.summary.map(s => `
              <tr>
                <td>${escapeHtml(s.supplierName)}</td>
                <td>${s.totalBilled.toFixed(decimals)}</td>
                <td>${s.totalPaid.toFixed(decimals)}</td>
                <td>${s.balance.toFixed(decimals)}</td>
                <td>${s.billCount} (${s.unpaidCount} unpaid)</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body></html>
    `);
    win.document.close();
    setTimeout(() => win.print(), 300);
  },

  openBillModal() {
    Modal.open('New Vendor Bill', `
      <form id="bill-form">
        <div class="form-group">
          ${QuickAddSelect.render({ id: 'b-supplier', label: 'Vendor', options: this.suppliers, placeholder: 'Select vendor' })}
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Bill Number</label>
            <input class="form-input" id="b-number" placeholder="Optional">
          </div>
          <div class="form-group">
            <label class="form-label">Bill Date</label>
            <input class="form-input" id="b-date" type="date" value="${new Date().toISOString().slice(0, 10)}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <input class="form-input" id="b-desc" placeholder="e.g. Monthly stock delivery">
        </div>
        <div class="form-group">
          <label class="form-label">Amount (${escapeHtml(App.settings.currency || 'BHD')})</label>
          <input class="form-input" id="b-amount" type="number" step="0.001" required>
        </div>
        <button type="submit" class="btn btn-gold" style="width:100%;justify-content:center;padding:12px">Save Bill</button>
      </form>
    `);
    QuickAddSelect.wire('b-supplier', (name) => Api.post('/suppliers', { name }), (created) => {
      this.suppliers.push(created);
    });
    document.getElementById('bill-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const supplierId = Number(document.getElementById('b-supplier').value) || null;
      if (!supplierId) { Toast.error('Select a vendor.'); return; }
      try {
        await Api.post('/vendor-bills', {
          supplierId,
          billNumber: document.getElementById('b-number').value.trim(),
          billDate: new Date(document.getElementById('b-date').value).toISOString(),
          description: document.getElementById('b-desc').value.trim(),
          amount: Number(document.getElementById('b-amount').value)
        });
        Toast.success('Bill recorded.');
        Modal.close();
        await this.loadAll();
        this.renderScreen();
      } catch (err) { Toast.error(err.message); }
    });
  },

  async viewBill(id) {
    try {
      const bill = await Api.get(`/vendor-bills/${id}`);
      const settings = App.settings;
      const supplier = this.suppliers.find(s => s.id === bill.supplierId);
      Modal.open(`Bill ${bill.billNumber || '#' + bill.id}`, `
        <div class="summary-row"><span>Vendor</span><span>${escapeHtml(supplier ? supplier.name : '-')}</span></div>
        <div class="summary-row"><span>Date</span><span>${formatDate(bill.billDate)}</span></div>
        <div class="summary-row"><span>Amount</span><span>${formatMoney(bill.amount, settings)}</span></div>
        <div class="summary-row total"><span>Balance</span><span>${formatMoney(bill.amount - bill.amountPaid, settings)}</span></div>
        <h3 style="font-size:0.95rem;margin:16px 0 10px">Payment History</h3>
        ${bill.payments.length === 0 ? '<p style="color:var(--text-muted);font-size:0.85rem">No payments recorded yet.</p>' : `
        <div class="table-wrap" style="box-shadow:none">
          <table>
            <thead><tr><th>Date</th><th>Amount</th><th>Note</th></tr></thead>
            <tbody>${bill.payments.map(p => `<tr><td>${formatDate(p.paymentDate)}</td><td>${formatMoney(p.amount, settings)}</td><td>${escapeHtml(p.note || '-')}</td></tr>`).join('')}</tbody>
          </table>
        </div>`}
      `, { large: true });
    } catch (err) {
      Toast.error(err.message);
    }
  },

  openPayModal(bill) {
    const settings = App.settings;
    const balance = bill.amount - bill.amountPaid;
    Modal.open('Pay Vendor Bill', `
      <p style="color:var(--text-secondary);font-size:0.86rem;margin-bottom:16px">Remaining balance: <strong>${formatMoneyPlain(balance, settings)} ${settings.currency}</strong></p>
      <form id="pay-form">
        <div class="form-group">
          <label class="form-label">Payment Amount (${escapeHtml(App.settings.currency || 'BHD')})</label>
          <input class="form-input" id="pay-amount" type="number" step="0.001" max="${balance}" value="${balance.toFixed(3)}" required>
        </div>
        <div class="form-group">
          <label class="form-label">Payment Date</label>
          <input class="form-input" id="pay-date" type="date" value="${new Date().toISOString().slice(0, 10)}">
        </div>
        <div class="form-group">
          <label class="form-label">Note</label>
          <input class="form-input" id="pay-note" placeholder="Optional">
        </div>
        <button type="submit" class="btn btn-gold" style="width:100%;justify-content:center;padding:12px">Record Payment</button>
      </form>
    `);
    document.getElementById('pay-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await Api.post(`/vendor-bills/${bill.id}/pay`, {
          amount: Number(document.getElementById('pay-amount').value),
          paymentDate: new Date(document.getElementById('pay-date').value).toISOString(),
          note: document.getElementById('pay-note').value.trim()
        });
        Toast.success('Payment recorded.');
        Modal.close();
        await this.loadAll();
        this.renderScreen();
      } catch (err) { Toast.error(err.message); }
    });
  },

  openVendorsModal() {
    const render = () => `
      <div style="margin-bottom:16px">
        ${this.suppliers.map(s => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border)">
            <div>
              <div style="font-weight:600">${escapeHtml(s.name)}</div>
              <div style="font-size:0.78rem;color:var(--text-muted)">${escapeHtml(s.phone || '')}</div>
            </div>
            <div class="row-actions-group">
              <button class="row-action row-action-edit edit-vendor-btn" data-id="${s.id}">${Icon.edit}</button>
              <button class="row-action row-action-delete del-vendor-btn" data-id="${s.id}">${Icon.trash}</button>
            </div>
          </div>
        `).join('') || '<p style="color:var(--text-muted);font-size:0.85rem">No vendors yet.</p>'}
      </div>
      <form id="vendor-form">
        <div class="form-row">
          <input class="form-input" id="new-vendor-name" placeholder="Vendor name" required>
          <input class="form-input" id="new-vendor-phone" placeholder="Phone">
        </div>
        <button type="submit" class="btn btn-primary" style="margin-top:10px;width:100%;justify-content:center">Add Vendor</button>
      </form>
    `;
    Modal.open('Manage Vendors', render(), { large: true });
    const wire = () => {
      document.getElementById('vendor-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('new-vendor-name').value.trim();
        const phone = document.getElementById('new-vendor-phone').value.trim();
        if (!name) return;
        try {
          await Api.post('/suppliers', { name, phone });
          this.suppliers = await Api.get('/suppliers');
          document.getElementById('modal-body').innerHTML = render();
          wire();
        } catch (err) { Toast.error(err.message); }
      });
      document.querySelectorAll('.edit-vendor-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const v = this.suppliers.find(s => s.id === Number(btn.dataset.id));
          const newName = prompt('Vendor name:', v.name);
          if (!newName || !newName.trim()) return;
          Api.put(`/suppliers/${v.id}`, { name: newName.trim() }).then(async () => {
            this.suppliers = await Api.get('/suppliers');
            document.getElementById('modal-body').innerHTML = render();
            wire();
          }).catch(err => Toast.error(err.message));
        });
      });
      document.querySelectorAll('.del-vendor-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this vendor?')) return;
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
  }
};
