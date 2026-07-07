// Third Eye Computer Solutions - POS System
// Sales History screen - view past invoices, reprint, refund, filter, export.
// Includes "Transfer to Delivery" for converting a walk-in/pickup sale into
// a delivery order after the fact, and rich filtering + PDF/Excel export.

const SalesHistoryScreen = {
  sales: [],
  drivers: [],
  filters: { from: '', to: '', cashier: '', paymentMethod: '', vat: '', status: '' },

  async render() {
    Shell.mount('/sales-history', `<div class="empty-state">Loading sales...</div>`);
    try {
      [this.sales, this.drivers] = await Promise.all([
        Api.get('/sales'),
        Api.get('/drivers')
      ]);
    } catch (err) {
      Toast.error(err.message);
      return;
    }
    this.filters = { from: '', to: '', cashier: '', paymentMethod: '', vat: '', status: '' };
    this.renderScreen();
  },

  getCashierList() {
    const names = new Set(this.sales.map(s => s.cashierName).filter(Boolean));
    return Array.from(names);
  },

  getFilteredSales() {
    let list = this.sales;
    const f = this.filters;
    if (f.from) list = list.filter(s => new Date(s.createdAt) >= new Date(f.from));
    if (f.to) list = list.filter(s => new Date(s.createdAt) <= new Date(new Date(f.to).setHours(23, 59, 59, 999)));
    if (f.cashier) list = list.filter(s => s.cashierName === f.cashier);
    if (f.paymentMethod) list = list.filter(s => s.paymentMethod === f.paymentMethod);
    if (f.vat === 'with') list = list.filter(s => s.vatTotal > 0);
    if (f.vat === 'without') list = list.filter(s => s.vatTotal === 0);
    if (f.status) list = list.filter(s => s.status === f.status);
    return list;
  },

  renderScreen() {
    const settings = App.settings;
    const filtered = this.getFilteredSales();
    const cashiers = this.getCashierList();

    const content = `
      <div class="page-header">
        <div>
          <h1>Sales History</h1>
          <div class="page-subtitle">${filtered.length} of ${this.sales.length} invoices shown</div>
        </div>
        <div style="display:flex;gap:10px">
          <button class="btn-icon-label" id="export-excel-btn">${Icon.copy} Export Excel/CSV</button>
          <button class="btn-icon-label gold" id="print-report-btn">${Icon.printer} Print / PDF</button>
        </div>
      </div>

      <div class="card-flat" style="margin-bottom:18px">
        <div class="filter-grid">
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">From Date</label>
            <input class="form-input" id="f-from" type="date" value="${this.filters.from}">
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">To Date</label>
            <input class="form-input" id="f-to" type="date" value="${this.filters.to}">
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">Cashier</label>
            <select class="form-select" id="f-cashier">
              <option value="">All Cashiers</option>
              ${cashiers.map(c => `<option value="${escapeHtml(c)}" ${this.filters.cashier === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">Payment Method</label>
            <select class="form-select" id="f-payment">
              <option value="">All Methods</option>
              <option value="cash" ${this.filters.paymentMethod === 'cash' ? 'selected' : ''}>Cash</option>
              <option value="card" ${this.filters.paymentMethod === 'card' ? 'selected' : ''}>Card</option>
              <option value="benefitpay" ${this.filters.paymentMethod === 'benefitpay' ? 'selected' : ''}>BenefitPay</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">VAT</label>
            <select class="form-select" id="f-vat">
              <option value="">All</option>
              <option value="with" ${this.filters.vat === 'with' ? 'selected' : ''}>With VAT</option>
              <option value="without" ${this.filters.vat === 'without' ? 'selected' : ''}>VAT Exempt</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">Status</label>
            <select class="form-select" id="f-status">
              <option value="">All</option>
              <option value="completed" ${this.filters.status === 'completed' ? 'selected' : ''}>Completed</option>
              <option value="refunded" ${this.filters.status === 'refunded' ? 'selected' : ''}>Refunded</option>
            </select>
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:14px">
          <button class="btn-icon-label primary" id="apply-filters-btn">Apply Filters</button>
          <button class="btn-icon-label" id="clear-filters-btn">Clear Filters</button>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead><tr><th>Invoice</th><th>Date</th><th>Cashier</th><th>Type</th><th>Payment</th><th>VAT</th><th>Total</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${filtered.length === 0 ? `<tr><td colspan="9"><div class="empty-state"><p>No sales match these filters.</p></div></td></tr>` : filtered.map(s => `
              <tr>
                <td style="font-family:var(--font-mono);font-size:0.8rem">${escapeHtml(s.invoiceNo)}</td>
                <td>${formatDateTime(s.createdAt)}</td>
                <td>${escapeHtml(s.cashierName || '-')}</td>
                <td><span class="badge badge-neutral">${(s.orderType || 'walk_in').replace('_', '-')}</span></td>
                <td><span class="badge badge-neutral">${escapeHtml(s.paymentMethod)}</span></td>
                <td>${formatMoney(s.vatTotal, settings)}</td>
                <td>${formatMoney(s.total, settings)}</td>
                <td>${s.status === 'refunded' ? '<span class="badge badge-danger">Refunded</span>' : '<span class="badge badge-success">Completed</span>'}</td>
                <td style="text-align:right;white-space:nowrap">
                  <div class="row-actions-group">
                    <button class="row-action row-action-view view-sale-btn" data-id="${s.id}" title="View">${Icon.box}</button>
                    ${s.status !== 'refunded' && s.orderType !== 'delivery' ? `<button class="row-action row-action-adjust transfer-delivery-btn" data-id="${s.id}" title="Transfer to Delivery">${Icon.truck}</button>` : ''}
                    ${s.status !== 'refunded' ? `<button class="row-action row-action-delete refund-sale-btn" data-id="${s.id}" title="Refund">${Icon.x}</button>` : ''}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    document.getElementById('content').innerHTML = content;

    document.getElementById('apply-filters-btn').addEventListener('click', () => {
      this.filters.from = document.getElementById('f-from').value;
      this.filters.to = document.getElementById('f-to').value;
      this.filters.cashier = document.getElementById('f-cashier').value;
      this.filters.paymentMethod = document.getElementById('f-payment').value;
      this.filters.vat = document.getElementById('f-vat').value;
      this.filters.status = document.getElementById('f-status').value;
      this.renderScreen();
    });
    document.getElementById('clear-filters-btn').addEventListener('click', () => {
      this.filters = { from: '', to: '', cashier: '', paymentMethod: '', vat: '', status: '' };
      this.renderScreen();
    });
    document.getElementById('export-excel-btn').addEventListener('click', () => this.exportExcel());
    document.getElementById('print-report-btn').addEventListener('click', () => this.printReport());

    document.querySelectorAll('.view-sale-btn').forEach(btn => {
      btn.addEventListener('click', () => this.viewSale(Number(btn.dataset.id)));
    });
    document.querySelectorAll('.refund-sale-btn').forEach(btn => {
      btn.addEventListener('click', () => this.refundSale(Number(btn.dataset.id)));
    });
    document.querySelectorAll('.transfer-delivery-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openTransferModal(this.sales.find(s => s.id === Number(btn.dataset.id))));
    });
  },

  async viewSale(id) {
    try {
      const sale = await Api.get(`/sales/${id}`);
      const settings = App.settings;
      Modal.open(`Invoice ${sale.invoiceNo}`, `
        <div class="table-wrap" style="box-shadow:none;margin-bottom:14px">
          <table>
            <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>VAT</th><th>Total</th></tr></thead>
            <tbody>
              ${sale.items.map(i => `
                <tr>
                  <td>${escapeHtml(i.productName)}</td>
                  <td>${i.quantity}</td>
                  <td>${formatMoney(i.unitPrice, settings)}</td>
                  <td>${formatMoney(i.lineVat, settings)}</td>
                  <td>${formatMoney(i.lineTotal, settings)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="summary-row"><span>Subtotal</span><span>${formatMoney(sale.subtotal, settings)}</span></div>
        <div class="summary-row"><span>VAT</span><span>${formatMoney(sale.vatTotal, settings)}</span></div>
        ${sale.discount > 0 ? `<div class="summary-row"><span>Discount</span><span>-${formatMoney(sale.discount, settings)}</span></div>` : ''}
        <div class="summary-row total"><span>Total</span><span>${formatMoney(sale.total, settings)}</span></div>
      `, { large: true });
    } catch (err) {
      Toast.error(err.message);
    }
  },

  async refundSale(id) {
    if (!confirm('Refund this sale? Stock will be restored.')) return;
    try {
      await Api.post(`/sales/${id}/refund`);
      Toast.success('Sale refunded.');
      this.sales = await Api.get('/sales');
      this.renderScreen();
    } catch (err) {
      Toast.error(err.message);
    }
  },

  openTransferModal(sale) {
    Modal.open(`Transfer ${sale.invoiceNo} to Delivery`, `
      <p style="color:var(--text-secondary);font-size:0.86rem;margin-bottom:16px">
        This creates a delivery order for this already-completed sale. No new charge is made and stock is not touched again.
      </p>
      <form id="transfer-form">
        <div class="form-group">
          <label class="form-label">Customer Name</label>
          <input class="form-input" id="t-name" placeholder="Customer name">
        </div>
        <div class="form-group">
          <label class="form-label">Delivery Address</label>
          <textarea class="form-textarea" id="t-address" rows="2" required></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Phone</label>
            <input class="form-input" id="t-phone" placeholder="Phone number">
          </div>
          <div class="form-group">
            ${QuickAddSelect.render({ id: 't-driver', label: 'Driver', options: this.drivers, placeholder: 'Unassigned' })}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Delivery Fee (BHD)</label>
          <input class="form-input" id="t-fee" type="number" step="0.001" value="0">
        </div>
        <button type="submit" class="btn btn-gold" style="width:100%;justify-content:center;padding:12px">
          Transfer to Delivery
        </button>
      </form>
    `);
    QuickAddSelect.wire('t-driver', (name) => Api.post('/drivers', { name }), (created) => {
      this.drivers.push(created);
    });
    document.getElementById('transfer-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const address = document.getElementById('t-address').value.trim();
      if (!address) { Toast.error('Delivery address is required.'); return; }
      try {
        await Api.post(`/sales/${sale.id}/transfer-to-delivery`, {
          customerName: document.getElementById('t-name').value.trim(),
          customerPhone: document.getElementById('t-phone').value.trim(),
          address,
          driverId: document.getElementById('t-driver').value || null,
          deliveryFee: Number(document.getElementById('t-fee').value) || 0
        });
        Toast.success('Sale transferred to Delivery.');
        Modal.close();
        this.sales = await Api.get('/sales');
        this.renderScreen();
      } catch (err) { Toast.error(err.message); }
    });
  },

  exportExcel() {
    const filtered = this.getFilteredSales();
    const settings = App.settings;
    const rows = [
      ['Invoice', 'Date', 'Cashier', 'Order Type', 'Payment', 'Subtotal', 'VAT', 'Discount', 'Total', 'Status']
    ];
    filtered.forEach(s => {
      rows.push([
        s.invoiceNo, formatDateTime(s.createdAt), s.cashierName || '', s.orderType || 'walk_in',
        s.paymentMethod, s.subtotal.toFixed(3), s.vatTotal.toFixed(3), (s.discount || 0).toFixed(3),
        s.total.toFixed(3), s.status
      ]);
    });
    const csv = rows.map(r => r.map(cell => {
      const str = String(cell);
      return str.includes(',') ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  printReport() {
    const filtered = this.getFilteredSales();
    const settings = App.settings;
    const totalRevenue = filtered.reduce((sum, s) => sum + (s.status !== 'refunded' ? s.total : 0), 0);
    const totalVat = filtered.reduce((sum, s) => sum + (s.status !== 'refunded' ? s.vatTotal : 0), 0);

    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>Sales History Report</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 30px; color: #1C2530; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        .meta { color: #5B6675; font-size: 12px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #E2E5EA; font-size: 12px; }
        th { background: #F5F6F8; font-weight: 700; text-transform: uppercase; font-size: 10px; }
        .summary { display: flex; gap: 30px; margin: 16px 0; }
        .summary div { font-size: 13px; }
        .summary strong { display: block; font-size: 18px; margin-top: 2px; }
        @media print { body { padding: 10px; } }
      </style></head>
      <body>
        <h1>${escapeHtml(settings.shopName)} - Sales History Report</h1>
        <div class="meta">Generated ${formatDateTime(new Date().toISOString())} ${this.filters.from || this.filters.to ? `&middot; Period: ${this.filters.from || 'start'} to ${this.filters.to || 'today'}` : ''}</div>
        <div class="summary">
          <div>Total Invoices<strong>${filtered.length}</strong></div>
          <div>Total Revenue<strong>${totalRevenue.toFixed(settings.currencyDecimals ?? 3)} ${settings.currency}</strong></div>
          <div>Total VAT<strong>${totalVat.toFixed(settings.currencyDecimals ?? 3)} ${settings.currency}</strong></div>
        </div>
        <table>
          <thead><tr><th>Invoice</th><th>Date</th><th>Cashier</th><th>Type</th><th>Payment</th><th>VAT</th><th>Total</th><th>Status</th></tr></thead>
          <tbody>
            ${filtered.map(s => `
              <tr>
                <td>${escapeHtml(s.invoiceNo)}</td>
                <td>${formatDateTime(s.createdAt)}</td>
                <td>${escapeHtml(s.cashierName || '-')}</td>
                <td>${(s.orderType || 'walk_in').replace('_', '-')}</td>
                <td>${escapeHtml(s.paymentMethod)}</td>
                <td>${s.vatTotal.toFixed(settings.currencyDecimals ?? 3)}</td>
                <td>${s.total.toFixed(settings.currencyDecimals ?? 3)}</td>
                <td>${s.status}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body></html>
    `);
    win.document.close();
    setTimeout(() => win.print(), 300);
  }
};
