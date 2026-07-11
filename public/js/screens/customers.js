// Third Eye Computer Solutions - POS System
// Customers module screen - includes loyalty points and coupon management.

const CustomersScreen = {
  customers: [],
  activeTab: 'customers',
  coupons: [],

  tierColors: { Bronze: '#8a5a2e', Silver: '#6b7280', Gold: '#b08a1c', Diamond: '#1D5FA8' },

  tierBadge(tier) {
    if (!tier) return '<span style="color:var(--text-muted)">-</span>';
    const color = this.tierColors[tier] || '#6b7280';
    return `<span class="badge" style="background:${color}1a;color:${color};border-color:${color}33">${escapeHtml(tier)}</span>`;
  },

  async render() {
    Shell.mount('/customers', `<div class="empty-state">Loading customers...</div>`);
    try {
      this.customers = await Api.get('/customers');
    } catch (err) {
      Toast.error(err.message);
      return;
    }
    BulkSelect.reset();
    this.renderScreen();
  },

  renderScreen() {
    const content = `
      <div class="page-header">
        <div>
          <h1>Customers</h1>
          <div class="page-subtitle">${this.customers.length} customers &middot; loyalty &amp; coupons</div>
        </div>
        <button class="btn btn-gold" id="add-customer-btn">
          <span style="width:16px;height:16px;display:flex">${Icon.plus}</span> Add Customer
        </button>
      </div>

      <div class="tabs">
        <div class="tab ${this.activeTab === 'customers' ? 'active' : ''}" data-tab="customers">Customers</div>
        <div class="tab ${this.activeTab === 'credit' ? 'active' : ''}" data-tab="credit">Credit &amp; Payments</div>
        <div class="tab ${this.activeTab === 'coupons' ? 'active' : ''}" data-tab="coupons">Coupons &amp; Discounts</div>
      </div>

      <div id="customers-tab-content"></div>
    `;
    document.getElementById('content').innerHTML = content;
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => { this.activeTab = tab.dataset.tab; this.renderScreen(); });
    });
    document.getElementById('add-customer-btn').addEventListener('click', () => this.openModal());

    if (this.activeTab === 'customers') this.renderCustomersTab();
    else if (this.activeTab === 'credit') this.renderCreditTab();
    else this.renderCouponsTab();
  },

  renderCustomersTab() {
    const el = document.getElementById('customers-tab-content');
    el.innerHTML = `
      <div class="toolbar-row">
        <button class="btn-icon-label" id="export-cust-csv-btn">${Icon.copy} Export to Excel/CSV</button>
        <button class="btn-icon-label" id="import-cust-csv-btn">${Icon.plus} Import from Excel/CSV</button>
      </div>
      <div id="bulk-toolbar-container"></div>
      <div class="table-wrap">
        <table>
          <thead><tr>${BulkSelect.checkboxHeader()}<th>Name</th><th>Phone</th><th>Address</th><th>Loyalty Points</th><th>Tier</th><th>Credit Balance</th><th></th></tr></thead>
          <tbody>
            ${this.customers.map(c => `
              <tr>
                ${BulkSelect.checkboxCell(c.id)}
                <td><strong>${escapeHtml(c.name)}</strong></td>
                <td>${escapeHtml(c.phone || '-')}</td>
                <td>${escapeHtml(c.address || '-')}</td>
                <td>${(c.loyaltyPoints || 0) > 0 ? `<span class="loyalty-badge">${Icon.check} ${c.loyaltyPoints} pts</span>` : '<span style="color:var(--text-muted)">0 pts</span>'}</td>
                <td>${this.tierBadge(c.loyaltyTier)}</td>
                <td>${(c.balance || 0) > 0 ? `<span class="money" style="color:var(--danger);font-weight:700">${(c.balance).toFixed(3)}</span>` : '<span style="color:var(--text-muted)">-</span>'}</td>
                <td style="text-align:right;white-space:nowrap">
                  <button class="row-action row-action-adjust points-cust-btn" data-id="${c.id}" title="Adjust loyalty points">${Icon.key}</button>
                  <button class="row-action row-action-edit edit-cust-btn" data-id="${c.id}">${Icon.edit}</button>
                  ${c.id !== 1 ? `<button class="row-action row-action-delete del-cust-btn" data-id="${c.id}">${Icon.trash}</button>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    document.getElementById('export-cust-csv-btn').addEventListener('click', () => window.open('/api/customers/export/csv', '_blank'));
    document.getElementById('import-cust-csv-btn').addEventListener('click', () => this.openImportModal());
    document.querySelectorAll('.edit-cust-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openModal(this.customers.find(c => c.id === Number(btn.dataset.id))));
    });
    document.querySelectorAll('.points-cust-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openPointsModal(this.customers.find(c => c.id === Number(btn.dataset.id))));
    });
    document.querySelectorAll('.del-cust-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this customer?')) return;
        try {
          await Api.del(`/customers/${btn.dataset.id}`);
          this.customers = await Api.get('/customers');
          this.renderScreen();
        } catch (err) { Toast.error(err.message); }
      });
    });
    BulkSelect.wire('bulk-toolbar-container', async (ids) => {
      try {
        const result = await Api.post('/customers/bulk-delete', { ids });
        Toast.success(`${result.deleted} customer(s) deleted.`);
        BulkSelect.reset();
        this.customers = await Api.get('/customers');
        this.renderScreen();
      } catch (err) { Toast.error(err.message); }
    });
  },

  // ---------- CREDIT & PAYMENTS ----------
  // "Credit" here means a customer bought on Pay Later (POS payment method
  // = Credit). This tab is where the shop tracks who owes what, and records
  // payments as customers pay off their balance. Recording a payment here
  // immediately: (1) reduces the customer's balance, (2) logs a dated entry
  // in the customer's ledger, and (3) is picked up by Accounting's cash
  // drawer reconciliation and Credit Collected stat - it never needs to be
  // entered twice.
  async renderCreditTab() {
    const el = document.getElementById('customers-tab-content');
    el.innerHTML = `<div class="empty-state">Loading credit accounts...</div>`;
    let summary;
    try {
      summary = await Api.get('/customers/credit-summary');
    } catch (err) {
      Toast.error(err.message);
      return;
    }
    const settings = App.settings;
    el.innerHTML = `
      <div class="stat-grid" style="margin-bottom:20px">
        <div class="stat-card danger-accent">
          <div class="stat-label">Customers With Balance Due</div>
          <div class="stat-value">${summary.count}</div>
        </div>
        <div class="stat-card danger-accent">
          <div class="stat-label">Total Outstanding</div>
          <div class="stat-value">${formatMoney(summary.totalOwed, settings)}</div>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Customer</th><th>Phone</th><th>Balance Due</th><th>Credit Limit</th><th>% of Limit Used</th><th></th></tr></thead>
          <tbody>
            ${summary.customers.length === 0 ? `<tr><td colspan="6"><div class="empty-state"><p>No customers currently owe a balance.</p></div></td></tr>` : summary.customers.map(c => `
              <tr>
                <td><strong>${escapeHtml(c.name)}</strong></td>
                <td>${escapeHtml(c.phone || '-')}</td>
                <td><span class="money" style="color:var(--danger);font-weight:700">${c.balance.toFixed(settings.currencyDecimals ?? 3)}</span></td>
                <td>${c.creditLimit ? c.creditLimit.toFixed(settings.currencyDecimals ?? 3) : '<span style="color:var(--text-muted)">No limit</span>'}</td>
                <td>${c.pctOfLimit !== null ? `<span style="color:${c.pctOfLimit >= 90 ? 'var(--danger)' : c.pctOfLimit >= 60 ? 'var(--warning)' : 'inherit'}">${c.pctOfLimit}%</span>` : '-'}</td>
                <td style="text-align:right;white-space:nowrap">
                  <button class="btn btn-outline btn-sm" data-history="${c.id}">History</button>
                  <button class="btn btn-gold btn-sm" data-collect="${c.id}" data-name="${escapeHtml(c.name)}" data-balance="${c.balance}">Record Payment</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    el.querySelectorAll('[data-collect]').forEach(btn => {
      btn.addEventListener('click', () => this.openCollectPaymentModal(
        Number(btn.dataset.collect), btn.dataset.name, Number(btn.dataset.balance)
      ));
    });
    el.querySelectorAll('[data-history]').forEach(btn => {
      btn.addEventListener('click', () => this.openLedgerModal(Number(btn.dataset.history)));
    });
  },

  openCollectPaymentModal(customerId, name, balance) {
    const settings = App.settings;
    Modal.open(`Record Payment - ${escapeHtml(name)}`, `
      <p style="color:var(--text-secondary);font-size:0.86rem;margin-bottom:16px">
        Outstanding balance: <strong>${balance.toFixed(settings.currencyDecimals ?? 3)} ${escapeHtml(settings.currency || 'BHD')}</strong>
      </p>
      <form id="collect-form">
        <div class="form-group">
          <label class="form-label">Amount Received</label>
          <input class="form-input" id="collect-amount" type="number" step="0.001" min="0.001" max="${balance}" value="${balance.toFixed(settings.currencyDecimals ?? 3)}" required>
        </div>
        <div class="form-group">
          <label class="form-label">Payment Method</label>
          <select class="form-select" id="collect-method">
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="benefitpay">BenefitPay</option>
          </select>
        </div>
        <button type="submit" class="btn btn-gold" style="width:100%;justify-content:center;padding:12px">Record Payment</button>
      </form>
    `);
    document.getElementById('collect-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = Number(document.getElementById('collect-amount').value);
      const method = document.getElementById('collect-method').value;
      try {
        await Api.post(`/customers/${customerId}/collect-payment`, { amount, method });
        Toast.success('Payment recorded - balance and accounting updated.');
        Modal.close();
        this.customers = await Api.get('/customers');
        this.renderScreen();
      } catch (err) { Toast.error(err.message); }
    });
  },

  async openLedgerModal(customerId) {
    const settings = App.settings;
    let payments;
    try {
      payments = await Api.get(`/customers/${customerId}/payments`);
    } catch (err) { Toast.error(err.message); return; }
    const customer = this.customers.find(c => c.id === customerId);
    Modal.open(`Payment History - ${escapeHtml(customer ? customer.name : '')}`, `
      <div class="table-wrap" style="box-shadow:none">
        <table>
          <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Collected By</th></tr></thead>
          <tbody>
            ${payments.length === 0 ? `<tr><td colspan="4"><div class="empty-state"><p>No payments recorded yet.</p></div></td></tr>` : payments.map(p => `
              <tr>
                <td>${formatDateTime(p.createdAt)}</td>
                <td>${Number(p.amount).toFixed(settings.currencyDecimals ?? 3)}</td>
                <td style="text-transform:capitalize">${escapeHtml(p.method || 'cash')}</td>
                <td>${escapeHtml(p.collectedByName || '-')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `, { large: true });
  },

  openImportModal() {
    Modal.open('Import Customers from Excel/CSV', `
      <p style="color:var(--text-secondary);font-size:0.86rem;margin-bottom:14px">
        Upload a CSV file. Customers matched by phone number will be updated; new ones will be created.
      </p>
      <div style="margin-bottom:16px">
        <a href="/api/customers/import/template" class="btn btn-outline btn-sm" target="_blank">Download Template File</a>
      </div>
      <div class="form-group">
        <label class="form-label">Choose CSV File</label>
        <input type="file" id="cust-import-file-input" accept=".csv,text/csv">
      </div>
      <div id="cust-import-result"></div>
      <button class="btn btn-gold" id="run-cust-import-btn" style="width:100%;justify-content:center;padding:12px" disabled>Import File</button>
    `);
    const fileInput = document.getElementById('cust-import-file-input');
    const runBtn = document.getElementById('run-cust-import-btn');
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
      try {
        const result = await Api.post('/customers/import/csv', { csvText: fileText });
        document.getElementById('cust-import-result').innerHTML = `
          <div class="card" style="background:var(--success-bg);border-color:#bfe5cc;margin-bottom:14px;font-size:0.85rem">
            <strong>${result.created} created</strong>, <strong>${result.updated} updated</strong>, ${result.skipped} skipped.
          </div>`;
        Toast.success('Import complete.');
        this.customers = await Api.get('/customers');
      } catch (err) { Toast.error(err.message); }
      runBtn.disabled = false;
    });
  },

  openModal(customer) {
    const isEdit = !!customer;
    Modal.open(isEdit ? 'Edit Customer' : 'Add Customer', `
      <form id="cust-form">
        <div class="form-group">
          <label class="form-label">Name</label>
          <input class="form-input" id="c-name" value="${escapeHtml(customer?.name || '')}" required>
        </div>
        <div class="form-group">
          <label class="form-label">Phone</label>
          <input class="form-input" id="c-phone" value="${escapeHtml(customer?.phone || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Address</label>
          <input class="form-input" id="c-address" value="${escapeHtml(customer?.address || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Credit Limit (${escapeHtml(App.settings.currency || 'BHD')})</label>
          <input class="form-input" id="c-creditLimit" type="number" step="0.001" min="0" value="${customer?.creditLimit ?? 0}">
          <div class="form-hint">Maximum outstanding balance this customer can carry on credit sales. Leave at 0 for no credit sales allowed.</div>
        </div>
        ${isEdit && customer.id !== 1 ? `
        <div class="form-group" style="background:var(--bg);border-radius:8px;padding:10px 12px">
          <div class="summary-row" style="margin:0"><span>Current Credit Balance</span><span style="font-weight:700;color:${(customer.balance||0)>0?'var(--danger)':'inherit'}">${(customer.balance||0).toFixed(3)} ${escapeHtml(App.settings.currency||'BHD')}</span></div>
        </div>` : ''}
        <button type="submit" class="btn btn-gold" style="width:100%;justify-content:center;padding:12px">
          ${isEdit ? 'Save Changes' : 'Add Customer'}
        </button>
      </form>
    `);
    document.getElementById('cust-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('c-name').value.trim(),
        phone: document.getElementById('c-phone').value.trim(),
        address: document.getElementById('c-address').value.trim(),
        creditLimit: Number(document.getElementById('c-creditLimit').value) || 0
      };
      try {
        if (isEdit) await Api.put(`/customers/${customer.id}`, payload);
        else await Api.post('/customers', payload);
        Toast.success(isEdit ? 'Customer updated.' : 'Customer added.');
        Modal.close();
        this.customers = await Api.get('/customers');
        this.renderScreen();
      } catch (err) { Toast.error(err.message); }
    });
  },

  openPointsModal(customer) {
    Modal.open(`Loyalty Points - ${escapeHtml(customer.name)}`, `
      <p style="color:var(--text-secondary);font-size:0.86rem;margin-bottom:16px">Current balance: <strong>${customer.loyaltyPoints || 0} points</strong></p>
      <form id="points-form">
        <div class="form-group">
          <label class="form-label">Adjustment</label>
          <input class="form-input" id="points-delta" type="number" placeholder="e.g. 50 to add, -20 to remove" required>
          <div class="form-hint">Use a positive number to award points, negative to deduct.</div>
        </div>
        <button type="submit" class="btn btn-gold" style="width:100%;justify-content:center;padding:12px">Apply</button>
      </form>
    `);
    document.getElementById('points-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const points = Number(document.getElementById('points-delta').value);
      try {
        await Api.post(`/customers/${customer.id}/adjust-points`, { points });
        Toast.success('Loyalty points updated.');
        Modal.close();
        this.customers = await Api.get('/customers');
        this.renderScreen();
      } catch (err) { Toast.error(err.message); }
    });
  },

  async renderCouponsTab() {
    const el = document.getElementById('customers-tab-content');
    el.innerHTML = `<div class="empty-state">Loading coupons...</div>`;
    try {
      this.coupons = await Api.get('/coupons');
    } catch (err) {
      Toast.error(err.message);
      return;
    }
    el.innerHTML = `
      <div class="toolbar-row">
        <button class="btn-icon-label gold" id="add-coupon-btn">${Icon.plus} New Coupon</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Code</th><th>Discount</th><th>Expires</th><th>Usage</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${this.coupons.length === 0 ? `<tr><td colspan="6"><div class="empty-state"><p>No coupons created yet.</p></div></td></tr>` : this.coupons.map(c => `
              <tr>
                <td style="font-family:var(--font-mono);font-weight:700">${escapeHtml(c.code)}</td>
                <td>${c.discountType === 'percent' ? `${c.discountValue}% off` : `${c.discountValue.toFixed(3)} BHD off`}</td>
                <td>${c.expiresAt ? formatDate(c.expiresAt) : 'Never'}</td>
                <td>${c.usedCount}${c.maxUses ? ` / ${c.maxUses}` : ''}</td>
                <td>${c.active !== false ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-neutral">Inactive</span>'}</td>
                <td style="text-align:right">
                  <button class="row-action row-action-edit edit-coupon-btn" data-id="${c.id}">${Icon.edit}</button>
                  <button class="row-action row-action-delete del-coupon-btn" data-id="${c.id}">${Icon.trash}</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    document.getElementById('add-coupon-btn').addEventListener('click', () => this.openCouponModal());
    document.querySelectorAll('.edit-coupon-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openCouponModal(this.coupons.find(c => c.id === Number(btn.dataset.id))));
    });
    document.querySelectorAll('.del-coupon-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this coupon?')) return;
        try {
          await Api.del(`/coupons/${btn.dataset.id}`);
          this.renderCouponsTab();
        } catch (err) { Toast.error(err.message); }
      });
    });
  },

  openCouponModal(coupon) {
    const isEdit = !!coupon;
    Modal.open(isEdit ? 'Edit Coupon' : 'Create Coupon', `
      <form id="coupon-form">
        <div class="form-group">
          <label class="form-label">Coupon Code</label>
          <input class="form-input" id="coupon-code" value="${isEdit ? escapeHtml(coupon.code) : ''}" placeholder="e.g. WELCOME10" required style="text-transform:uppercase" ${isEdit ? 'disabled' : ''}>
          ${isEdit ? '<div class="form-hint">Code cannot be changed after creation - delete and recreate if needed.</div>' : ''}
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Discount Type</label>
            <select class="form-select" id="coupon-type">
              <option value="percent" ${coupon?.discountType === 'percent' ? 'selected' : ''}>Percentage (%)</option>
              <option value="fixed" ${coupon?.discountType === 'fixed' ? 'selected' : ''}>Fixed Amount (BHD)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Discount Value</label>
            <input class="form-input" id="coupon-value" type="number" step="0.001" value="${coupon?.discountValue ?? ''}" required>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Expires On (optional)</label>
            <input class="form-input" id="coupon-expires" type="date" value="${coupon?.expiresAt ? coupon.expiresAt.slice(0, 10) : ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Max Uses (optional)</label>
            <input class="form-input" id="coupon-max-uses" type="number" min="1" value="${coupon?.maxUses ?? ''}" placeholder="Unlimited">
          </div>
        </div>
        ${isEdit ? `
        <div class="form-group">
          <label class="form-label" style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" id="coupon-active" ${coupon.active !== false ? 'checked' : ''} style="width:auto"> Coupon Active
          </label>
        </div>` : ''}
        <button type="submit" class="btn btn-gold" style="width:100%;justify-content:center;padding:12px">${isEdit ? 'Save Changes' : 'Create Coupon'}</button>
      </form>
    `);
    document.getElementById('coupon-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        discountType: document.getElementById('coupon-type').value,
        discountValue: Number(document.getElementById('coupon-value').value),
        expiresAt: document.getElementById('coupon-expires').value ? new Date(document.getElementById('coupon-expires').value).toISOString() : null,
        maxUses: document.getElementById('coupon-max-uses').value || null
      };
      if (isEdit) {
        payload.active = document.getElementById('coupon-active').checked;
      } else {
        payload.code = document.getElementById('coupon-code').value.trim().toUpperCase();
      }
      try {
        if (isEdit) await Api.put(`/coupons/${coupon.id}`, payload);
        else await Api.post('/coupons', payload);
        Toast.success(isEdit ? 'Coupon updated.' : 'Coupon created.');
        Modal.close();
        this.renderCouponsTab();
      } catch (err) { Toast.error(err.message); }
    });
  }
};
