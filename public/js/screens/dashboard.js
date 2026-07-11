// Third Eye Computer Solutions - POS System
// Dashboard screen - at-a-glance summary with period filters and a
// Generate Report / Print option.

const DashboardScreen = {
  period: 'today',
  customFrom: '',
  customTo: '',
  visibleMetrics: { revenue: true, expenses: true, transactions: true, lowStock: true, deliveries: true, creditCustomers: true, unpaidDeliveries: true },

  async render() {
    this.period = 'today';
    Shell.mount('/dashboard', `<div class="empty-state">Loading dashboard...</div>`);
    await this.load();
  },

  getRange() {
    const now = new Date();
    if (this.period === 'today') {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      return { from: start.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
    }
    if (this.period === 'week') {
      const start = new Date(now); start.setDate(start.getDate() - 6);
      return { from: start.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
    }
    if (this.period === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: start.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
    }
    return { from: this.customFrom, to: this.customTo };
  },

  async load() {
    const range = this.getRange();
    let summary, lowStock, reminders;
    try {
      [summary, lowStock, reminders] = await Promise.all([
        Api.get(`/reports/dashboard?from=${range.from}&to=${range.to}`),
        Api.get('/products/low-stock'),
        Api.get('/reminders').catch(() => [])
      ]);
    } catch (err) {
      Toast.error(err.message);
      return;
    }
    this._lastSummary = summary;
    this._lastLowStock = lowStock;
    this._reminders = reminders || [];
    this.renderScreen(summary, lowStock);
  },

  renderScreen(summary, lowStock) {
    const settings = App.settings;
    const reminders = this._reminders || [];
    const periodLabel = {
      today: "Today's Overview",
      week: 'Last 7 Days',
      month: 'This Month',
      custom: 'Custom Period'
    }[this.period];

    const m = this.visibleMetrics;

    // Build reminders banner - show reminders due today
    const today = new Date(); today.setHours(0,0,0,0);
    const dueToday = reminders.filter(r => {
      if (!r.startDate) return false;
      const start = new Date(r.startDate); start.setHours(0,0,0,0);
      if (r.frequency === 'once') return start.getTime() === today.getTime();
      if (r.frequency === 'daily') return today >= start;
      if (r.frequency === 'weekly') {
        if (today < start) return false;
        const diff = Math.round((today - start) / 86400000);
        return diff % 7 === 0;
      }
      if (r.frequency === 'monthly') {
        if (today < start) return false;
        return today.getDate() === start.getDate();
      }
      if (r.frequency === 'range') {
        const end = r.endDate ? new Date(r.endDate) : null;
        if (end) end.setHours(23,59,59,999);
        return today >= start && (!end || today <= end);
      }
      return false;
    });

    const reminderBanner = dueToday.length > 0 ? `
      <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);border-radius:14px;padding:16px 20px;margin-bottom:20px;color:#fff">
        <div style="font-size:13px;font-weight:600;opacity:0.8;margin-bottom:8px">🔔 REMINDERS DUE TODAY (${dueToday.length})</div>
        ${dueToday.map(r => `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.15)">
            <span style="font-size:18px">📌</span>
            <div>
              <div style="font-size:14px;font-weight:700">${escapeHtml(r.description)}</div>
              ${r.notes ? `<div style="font-size:12px;opacity:0.8">${escapeHtml(r.notes)}</div>` : ''}
              <div style="font-size:11px;opacity:0.7;margin-top:2px">${r.frequency.charAt(0).toUpperCase()+r.frequency.slice(1)} reminder</div>
            </div>
          </div>`).join('')}
        <div style="font-size:12px;opacity:0.7;margin-top:8px">Go to Employees → General Reminders to manage</div>
      </div>` : '';

    const content = `
      <div class="page-header">
        <div>
          <h1>${periodLabel}</h1>
          <div class="page-subtitle">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</div>
        </div>
        <a href="#/pos" class="btn btn-gold">
          <span style="width:16px;height:16px;display:flex">${Icon.pos}</span> New Sale
        </a>
      </div>

      ${reminderBanner}

      <div class="card-flat" style="margin-bottom:20px">
        <div class="toolbar-row" style="margin-bottom:0">
          <button class="btn-icon-label ${this.period === 'today' ? 'primary' : ''}" data-period="today">Today</button>
          <button class="btn-icon-label ${this.period === 'week' ? 'primary' : ''}" data-period="week">Last 7 Days</button>
          <button class="btn-icon-label ${this.period === 'month' ? 'primary' : ''}" data-period="month">This Month</button>
          <button class="btn-icon-label ${this.period === 'custom' ? 'primary' : ''}" data-period="custom">Custom</button>
          ${this.period === 'custom' ? `
            <input class="form-input" id="dash-from" type="date" value="${this.customFrom}" style="width:140px">
            <span style="color:var(--text-muted)">to</span>
            <input class="form-input" id="dash-to" type="date" value="${this.customTo}" style="width:140px">
            <button class="btn-icon-label primary" id="apply-custom-btn">Apply</button>
          ` : ''}
          <div style="margin-left:auto;display:flex;gap:8px">
            <button class="btn-icon-label" id="metric-filter-btn">${Icon.settings} Customize Metrics</button>
            <button class="btn-icon-label gold" id="dash-report-btn">${Icon.printer} Generate Report</button>
          </div>
        </div>
      </div>

      <div class="stat-grid">
        ${m.revenue ? `
        <div class="stat-card accent">
          <div class="stat-label">Revenue</div>
          <div class="stat-value">${formatMoney(summary.todayRevenue, settings)}</div>
        </div>` : ''}
        ${m.transactions ? `
        <div class="stat-card">
          <div class="stat-label">Transactions</div>
          <div class="stat-value">${summary.todaySalesCount}</div>
        </div>` : ''}
        ${m.lowStock ? `
        <div class="stat-card ${summary.lowStockCount > 0 ? 'danger-accent' : ''}">
          <div class="stat-label">Low Stock Items</div>
          <div class="stat-value" style="${summary.lowStockCount > 0 ? 'color:var(--danger)' : ''}">${summary.lowStockCount}</div>
        </div>` : ''}
        ${m.deliveries ? `
        <div class="stat-card">
          <div class="stat-label">Deliveries (Pending)</div>
          <div class="stat-value">${summary.pendingDeliveries} <span style="font-size:0.9rem;color:var(--text-muted)">/ ${summary.totalDeliveries}</span></div>
        </div>` : ''}
        ${m.expenses ? `
        <div class="stat-card">
          <div class="stat-label">Expenses</div>
          <div class="stat-value">${formatMoney(summary.todayExpenses, settings)}</div>
        </div>` : ''}
        ${m.creditCustomers ? `
        <div class="stat-card ${summary.creditCustomers.count > 0 ? 'danger-accent' : ''}">
          <div class="stat-label">Credit Customers</div>
          <div class="stat-value">${summary.creditCustomers.count}</div>
          <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px">${formatMoneyPlain(summary.creditCustomers.totalOwed, settings)} ${settings.currency} owed</div>
        </div>` : ''}
        ${m.unpaidDeliveries ? `
        <div class="stat-card ${summary.unpaidDeliveries.count > 0 ? 'danger-accent' : 'success-accent'}">
          <div class="stat-label">Unpaid Deliveries</div>
          <div class="stat-value">${summary.unpaidDeliveries.count}</div>
          <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px">${summary.unpaidDeliveries.count > 0 ? formatMoneyPlain(summary.unpaidDeliveries.totalOutstanding, settings) + ' ' + settings.currency + ' outstanding' : 'All collected'}</div>
        </div>` : ''}
        <div class="stat-card">
          <div class="stat-label">Total Products</div>
          <div class="stat-value">${summary.totalProducts}</div>
        </div>
      </div>

      <h3 style="font-size:1rem;font-weight:600;margin-bottom:14px">Quick Actions</h3>
      <div class="action-grid">
        <a href="#/pos" class="action-card gold">
          <div class="action-icon">${Icon.pos}</div>
          <div class="action-title">New Sale</div>
          <div class="action-desc">Open the checkout screen</div>
        </a>
        <a href="#/inventory" class="action-card">
          <div class="action-icon">${Icon.inventory}</div>
          <div class="action-title">Products</div>
          <div class="action-desc">Manage inventory &amp; stock</div>
          ${summary.lowStockCount > 0 ? `<div class="action-count">${summary.lowStockCount} low</div>` : ''}
        </a>
        <a href="#/delivery" class="action-card">
          <div class="action-icon">${Icon.delivery}</div>
          <div class="action-title">Delivery</div>
          <div class="action-desc">Track delivery orders</div>
          ${summary.pendingDeliveries > 0 ? `<div class="action-count">${summary.pendingDeliveries}</div>` : ''}
        </a>
        <a href="#/customers" class="action-card">
          <div class="action-icon">${Icon.customers}</div>
          <div class="action-title">Customers</div>
          <div class="action-desc">Loyalty &amp; coupons</div>
        </a>
        <a href="#/purchases" class="action-card">
          <div class="action-icon">${Icon.purchases}</div>
          <div class="action-title">Purchases</div>
          <div class="action-desc">Receive stock from suppliers</div>
        </a>
        <a href="#/accounting" class="action-card">
          <div class="action-icon">${Icon.accounting}</div>
          <div class="action-title">Accounting</div>
          <div class="action-desc">Expenses &amp; cash drawer</div>
        </a>
        <a href="#/reports" class="action-card">
          <div class="action-icon">${Icon.reports}</div>
          <div class="action-title">Reports</div>
          <div class="action-desc">Sales, VAT &amp; performance</div>
        </a>
        <a href="#/settings" class="action-card">
          <div class="action-icon">${Icon.settings}</div>
          <div class="action-title">Settings</div>
          <div class="action-desc">Shop branding &amp; VAT</div>
        </a>
      </div>

      <div class="card-flat">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 style="font-size:1rem;font-weight:600">Low Stock Alert</h3>
          <a href="#/inventory" class="btn btn-ghost btn-sm">View Inventory</a>
        </div>
        ${lowStock.length === 0 ? `<div class="empty-state" style="padding:30px"><p>All products are well stocked.</p></div>` : `
        <div class="table-wrap" style="box-shadow:none">
          <table>
            <thead><tr><th>Product</th><th>Stock</th><th>Threshold</th><th></th></tr></thead>
            <tbody>
              ${lowStock.slice(0, 8).map(p => `
                <tr>
                  <td>${escapeHtml(p.name)}</td>
                  <td><span class="badge badge-danger">${p.stock} ${escapeHtml(p.unit)}</span></td>
                  <td>${p.lowStockThreshold ?? settings.lowStockThreshold}</td>
                  <td><a href="#/purchases" class="btn btn-ghost btn-sm">Restock</a></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px" class="dash-two-col">
        <div class="card-flat">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <h3 style="font-size:1rem;font-weight:600">💳 Credit Customers</h3>
            <a href="#/customers" class="btn btn-ghost btn-sm">View All</a>
          </div>
          ${summary.creditCustomers.top.length === 0 ? `<div class="empty-state" style="padding:30px"><p>No customers currently owe a balance.</p></div>` : `
          <div class="table-wrap" style="box-shadow:none">
            <table>
              <thead><tr><th>Customer</th><th>Balance</th><th>Limit %</th><th></th></tr></thead>
              <tbody>
                ${summary.creditCustomers.top.map(c => `
                  <tr>
                    <td>${escapeHtml(c.name)}${c.phone ? `<div style="font-size:0.72rem;color:var(--text-muted)">${escapeHtml(c.phone)}</div>` : ''}</td>
                    <td><span class="money" style="color:var(--danger);font-weight:700">${c.balance.toFixed(settings.currencyDecimals ?? 3)}</span></td>
                    <td>${c.pctOfLimit !== null ? `<span class="badge ${c.pctOfLimit >= 90 ? 'badge-danger' : 'badge-warning'}">${c.pctOfLimit}%</span>` : `<span style="color:var(--text-muted);font-size:0.78rem">no limit</span>`}</td>
                    <td><button class="btn btn-ghost btn-sm" data-collect-customer="${c.id}" data-customer-name="${escapeHtml(c.name)}" data-customer-balance="${c.balance}">Record Payment</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>`}
        </div>

        <div class="card-flat">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <h3 style="font-size:1rem;font-weight:600">🚚 Unpaid Deliveries</h3>
            <a href="#/delivery" class="btn btn-ghost btn-sm">View All</a>
          </div>
          ${summary.unpaidDeliveries.list.length === 0 ? `<div class="empty-state" style="padding:30px"><p>✅ All deliveries collected.</p></div>` : `
          <div class="table-wrap" style="box-shadow:none">
            <table>
              <thead><tr><th>Customer</th><th>Address</th><th>Amount</th><th></th></tr></thead>
              <tbody>
                ${summary.unpaidDeliveries.list.map(d => `
                  <tr>
                    <td>${escapeHtml(d.customerName || 'Walk-in')}</td>
                    <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(d.address || '')}</td>
                    <td><span class="money" style="color:var(--danger);font-weight:700">${d.outstandingAmount.toFixed(settings.currencyDecimals ?? 3)}</span></td>
                    <td><button class="btn btn-ghost btn-sm" data-collect-delivery="${d.id}">Mark Collected</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>`}
        </div>
      </div>
    `;
    document.getElementById('content').innerHTML = content;

    document.querySelectorAll('[data-period]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.period = btn.dataset.period;
        if (this.period === 'custom' && !this.customFrom) {
          const today = new Date().toISOString().slice(0, 10);
          this.customFrom = today;
          this.customTo = today;
        }
        if (this.period === 'custom') {
          this.renderScreen(summary, lowStock); // just re-render to show date inputs
        } else {
          this.load();
        }
      });
    });
    const applyCustomBtn = document.getElementById('apply-custom-btn');
    if (applyCustomBtn) {
      applyCustomBtn.addEventListener('click', () => {
        this.customFrom = document.getElementById('dash-from').value;
        this.customTo = document.getElementById('dash-to').value;
        this.load();
      });
    }
    document.getElementById('metric-filter-btn').addEventListener('click', () => this.openMetricFilterModal());
    document.getElementById('dash-report-btn').addEventListener('click', () => this.generateReport());

    document.querySelectorAll('[data-collect-customer]').forEach(btn => {
      btn.addEventListener('click', () => this.openRecordPaymentModal(
        btn.dataset.collectCustomer, btn.dataset.customerName, Number(btn.dataset.customerBalance)
      ));
    });
    document.querySelectorAll('[data-collect-delivery]').forEach(btn => {
      btn.addEventListener('click', () => this.collectDelivery(btn.dataset.collectDelivery));
    });
  },

  openRecordPaymentModal(customerId, name, balance) {
    const settings = App.settings;
    Modal.open(`Record Payment - ${name}`, `
      <div class="form-group">
        <label class="form-label">Current Balance Owed</label>
        <div style="font-family:var(--font-mono);font-weight:700;font-size:1.4rem;color:var(--danger)">${balance.toFixed(settings.currencyDecimals ?? 3)} ${settings.currency}</div>
      </div>
      <div class="form-group">
        <label class="form-label">Amount Received</label>
        <input class="form-input" id="credit-payment-amount" type="number" step="0.001" value="${balance.toFixed(settings.currencyDecimals ?? 3)}">
      </div>
      <button class="btn btn-gold" id="confirm-credit-payment-btn" style="width:100%;justify-content:center;padding:12px">Record Payment</button>
    `);
    document.getElementById('confirm-credit-payment-btn').addEventListener('click', async () => {
      const amount = Number(document.getElementById('credit-payment-amount').value) || 0;
      if (amount <= 0) { Toast.error('Enter an amount greater than zero.'); return; }
      try {
        await Api.post(`/customers/${customerId}/collect-payment`, { amount });
        Toast.success('Payment recorded.');
        Modal.close();
        this.load();
      } catch (err) {
        Toast.error(err.message);
      }
    });
  },

  async collectDelivery(deliveryId) {
    try {
      await Api.put(`/deliveries/${deliveryId}/collect`, {});
      Toast.success('Delivery marked as collected.');
      this.load();
    } catch (err) {
      Toast.error(err.message);
    }
  },

  openMetricFilterModal() {
    const m = this.visibleMetrics;
    Modal.open('Customize Visible Metrics', `
      <div class="form-group">
        <label class="form-label" style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="m-revenue" ${m.revenue ? 'checked' : ''} style="width:auto"> Revenue</label>
      </div>
      <div class="form-group">
        <label class="form-label" style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="m-expenses" ${m.expenses ? 'checked' : ''} style="width:auto"> Expenses</label>
      </div>
      <div class="form-group">
        <label class="form-label" style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="m-transactions" ${m.transactions ? 'checked' : ''} style="width:auto"> Transactions</label>
      </div>
      <div class="form-group">
        <label class="form-label" style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="m-lowStock" ${m.lowStock ? 'checked' : ''} style="width:auto"> Low Stock</label>
      </div>
      <div class="form-group">
        <label class="form-label" style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="m-deliveries" ${m.deliveries ? 'checked' : ''} style="width:auto"> Deliveries</label>
      </div>
      <div class="form-group">
        <label class="form-label" style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="m-creditCustomers" ${m.creditCustomers ? 'checked' : ''} style="width:auto"> Credit Customers</label>
      </div>
      <div class="form-group">
        <label class="form-label" style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="m-unpaidDeliveries" ${m.unpaidDeliveries ? 'checked' : ''} style="width:auto"> Unpaid Deliveries</label>
      </div>
      <button class="btn btn-gold" id="save-metrics-btn" style="width:100%;justify-content:center;padding:12px">Apply</button>
    `);
    document.getElementById('save-metrics-btn').addEventListener('click', () => {
      this.visibleMetrics = {
        revenue: document.getElementById('m-revenue').checked,
        expenses: document.getElementById('m-expenses').checked,
        transactions: document.getElementById('m-transactions').checked,
        lowStock: document.getElementById('m-lowStock').checked,
        deliveries: document.getElementById('m-deliveries').checked,
        creditCustomers: document.getElementById('m-creditCustomers').checked,
        unpaidDeliveries: document.getElementById('m-unpaidDeliveries').checked
      };
      Modal.close();
      this.renderScreen(this._lastSummary, this._lastLowStock);
    });
  },

  generateReport() {
    const settings = App.settings;
    const summary = this._lastSummary;
    const lowStock = this._lastLowStock;
    const range = this.getRange();

    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>Overview Report</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 30px; color: #1C2530; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        .meta { color: #5B6675; font-size: 12px; margin-bottom: 20px; }
        .summary { display: flex; gap: 24px; margin: 16px 0; flex-wrap: wrap; }
        .summary div { font-size: 12px; }
        .summary strong { display: block; font-size: 18px; margin-top: 2px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #E2E5EA; font-size: 12px; }
        th { background: #F5F6F8; font-weight: 700; text-transform: uppercase; font-size: 10px; }
        @media print { body { padding: 10px; } }
      </style></head>
      <body>
        <h1>${escapeHtml(settings.shopName)} - Overview Report</h1>
        <div class="meta">Generated ${formatDateTime(new Date().toISOString())} &middot; Period: ${range.from} to ${range.to}</div>
        <div class="summary">
          <div>Revenue<strong>${formatMoneyPlain(summary.todayRevenue, settings)} ${settings.currency}</strong></div>
          <div>Transactions<strong>${summary.todaySalesCount}</strong></div>
          <div>Expenses<strong>${formatMoneyPlain(summary.todayExpenses, settings)} ${settings.currency}</strong></div>
          <div>Low Stock Items<strong>${summary.lowStockCount}</strong></div>
          <div>Deliveries<strong>${summary.pendingDeliveries} pending / ${summary.totalDeliveries} total</strong></div>
          <div>Total Products<strong>${summary.totalProducts}</strong></div>
        </div>
        ${lowStock.length > 0 ? `
        <h3>Low Stock Items</h3>
        <table>
          <thead><tr><th>Product</th><th>Stock</th></tr></thead>
          <tbody>${lowStock.map(p => `<tr><td>${escapeHtml(p.name)}</td><td>${p.stock} ${escapeHtml(p.unit)}</td></tr>`).join('')}</tbody>
        </table>` : ''}
      </body></html>
    `);
    win.document.close();
    setTimeout(() => win.print(), 300);
  }
};
