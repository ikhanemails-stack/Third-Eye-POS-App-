// Third Eye Computer Solutions - POS System
// Reports module screen - professional layout with charts, filters, and
// PDF/Excel/Print export options.

const ReportsScreen = {
  activeTab: 'sales',
  fromDate: '',
  toDate: '',
  categoryId: '',
  paymentMethod: '',
  categories: [],
  suppliers: [],
  supplierId: '',
  quoteStatusFilter: '',
  quoteSearch: '',

  async render() {
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    this.fromDate = monthStart.toISOString().slice(0, 10);
    this.toDate = today.toISOString().slice(0, 10);
    this.categoryId = '';
    this.paymentMethod = '';
    this.supplierId = '';
    this.quoteStatusFilter = '';
    this.quoteSearch = '';
    Shell.mount('/reports', `<div class="empty-state">Loading reports...</div>`);
    try {
      [this.categories, this.suppliers] = await Promise.all([Api.get('/categories'), Api.get('/suppliers')]);
    } catch (err) {
      this.categories = [];
      this.suppliers = [];
    }
    await this.renderScreen();
  },

  async renderScreen() {
    const content = `
      <div class="page-header">
        <div>
          <h1>Reports</h1>
          <div class="page-subtitle">Business performance and compliance reports</div>
        </div>
        <div style="display:flex;gap:10px">
          <button class="btn-icon-label" id="export-excel-btn">${Icon.copy} Export Excel</button>
          <button class="btn-icon-label gold" id="print-pdf-btn">${Icon.printer} Generate PDF / Print</button>
        </div>
      </div>

      <div class="card-flat" style="margin-bottom:18px">
        <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
          <button class="btn btn-sm" onclick="ReportsScreen.setQuickDate('today')" style="font-size:12px">📅 Today</button>
          <button class="btn btn-sm" onclick="ReportsScreen.setQuickDate('yesterday')" style="font-size:12px">⬅ Yesterday</button>
          <button class="btn btn-sm" onclick="ReportsScreen.setQuickDate('week')" style="font-size:12px">📆 This Week</button>
          <button class="btn btn-sm" onclick="ReportsScreen.setQuickDate('month')" style="font-size:12px">🗓 This Month</button>
          <button class="btn btn-sm" onclick="ReportsScreen.setQuickDate('year')" style="font-size:12px">📊 This Year</button>
        </div>
        <div class="filter-grid">
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">From Date</label>
            <input class="form-input" id="report-from" type="date" value="${this.fromDate}">
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">To Date</label>
            <input class="form-input" id="report-to" type="date" value="${this.toDate}">
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">Category</label>
            <select class="form-select" id="report-category">
              <option value="">All Categories</option>
              ${this.categories.map(c => `<option value="${c.id}" ${this.categoryId === String(c.id) ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">Payment Method</label>
            <select class="form-select" id="report-payment">
              <option value="">All Methods</option>
              <option value="cash" ${this.paymentMethod === 'cash' ? 'selected' : ''}>Cash</option>
              <option value="card" ${this.paymentMethod === 'card' ? 'selected' : ''}>Card</option>
              <option value="benefitpay" ${this.paymentMethod === 'benefitpay' ? 'selected' : ''}>BenefitPay</option>
            </select>
          </div>
        </div>
        <button class="btn-icon-label primary" id="apply-range-btn" style="margin-top:14px">Apply Filters</button>
      </div>

      <div class="tabs">
        <div class="tab ${this.activeTab === 'sales' ? 'active' : ''}" data-tab="sales">Sales Overview</div>
        <div class="tab ${this.activeTab === 'top-products' ? 'active' : ''}" data-tab="top-products">Top Products</div>
        <div class="tab ${this.activeTab === 'inventory' ? 'active' : ''}" data-tab="inventory">Inventory</div>
        <div class="tab ${this.activeTab === 'refunds' ? 'active' : ''}" data-tab="refunds">Discounts &amp; Refunds</div>
        <div class="tab ${this.activeTab === 'vat' ? 'active' : ''}" data-tab="vat">VAT (NBR)</div>
        <div class="tab ${this.activeTab === 'quotations' ? 'active' : ''}" data-tab="quotations">Quotations</div>
        <div class="tab ${this.activeTab === 'purchases' ? 'active' : ''}" data-tab="purchases">Purchases</div>
      </div>
      <div id="report-tab-content"><div class="empty-state">Loading...</div></div>
    `;
    document.getElementById('content').innerHTML = content;

    document.getElementById('apply-range-btn').addEventListener('click', () => {
      this.fromDate = document.getElementById('report-from').value;
      this.toDate = document.getElementById('report-to').value;
      this.categoryId = document.getElementById('report-category').value;
      this.paymentMethod = document.getElementById('report-payment').value;
      this.loadTabContent();
    });
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.activeTab = tab.dataset.tab;
        this.renderScreen();
      });
    });
    document.getElementById('export-excel-btn').addEventListener('click', () => this.exportExcel());
    document.getElementById('print-pdf-btn').addEventListener('click', () => this.printReport());
    await this.loadTabContent();
  },

  setQuickDate(range) {
    const today = new Date();
    const fmt = d => d.toISOString().slice(0, 10);
    let from, to;
    if (range === 'today') {
      from = to = fmt(today);
    } else if (range === 'yesterday') {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      from = to = fmt(y);
    } else if (range === 'week') {
      const w = new Date(today); w.setDate(w.getDate() - 6);
      from = fmt(w); to = fmt(today);
    } else if (range === 'month') {
      from = fmt(new Date(today.getFullYear(), today.getMonth(), 1));
      to = fmt(today);
    } else if (range === 'year') {
      from = fmt(new Date(today.getFullYear(), 0, 1));
      to = fmt(today);
    }
    this.fromDate = from;
    this.toDate = to;
    const fromEl = document.getElementById('report-from');
    const toEl = document.getElementById('report-to');
    if (fromEl) fromEl.value = from;
    if (toEl) toEl.value = to;
    this.loadTabContent();
  },

  rangeQuery() {
    const from = this.fromDate ? new Date(this.fromDate + 'T00:00:00').toISOString() : '';
    const to   = this.toDate   ? new Date(this.toDate   + 'T23:59:59').toISOString() : '';
    let q = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    if (this.categoryId) q += `&categoryId=${this.categoryId}`;
    if (this.paymentMethod) q += `&paymentMethod=${this.paymentMethod}`;
    return q;
  },

  async loadTabContent() {
    const el = document.getElementById('report-tab-content');
    el.innerHTML = `<div class="empty-state">Loading...</div>`;
    const settings = App.settings;
    try {
      if (this.activeTab === 'sales') {
        this._lastSalesData = await Api.get('/reports/sales' + this.rangeQuery());
        const data = this._lastSalesData;
        const trendData = Object.entries(data.byDay).sort(([a], [b]) => a.localeCompare(b)).map(([day, amount]) => ({
          label: new Date(day).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }), value: amount
        }));
        const categoryData = Object.entries(data.byCategory || {}).map(([label, value]) => ({ label, value }));
        const paymentData = Object.entries(data.byPaymentMethod).map(([label, value]) => ({ label: label.charAt(0).toUpperCase() + label.slice(1), value }));

        el.innerHTML = `
          <div class="stat-grid">
            <div class="stat-card accent"><div class="stat-label">Total Revenue</div><div class="stat-value">${formatMoney(data.totalRevenue, settings)}</div></div>
            <div class="stat-card"><div class="stat-label">Transactions</div><div class="stat-value">${data.salesCount}</div></div>
            <div class="stat-card"><div class="stat-label">VAT Collected</div><div class="stat-value">${formatMoney(data.totalVat, settings)}</div></div>
            <div class="stat-card"><div class="stat-label">Discounts Given</div><div class="stat-value">${formatMoney(data.totalDiscount, settings)}</div></div>
            <div class="stat-card danger-accent"><div class="stat-label">Refunds</div><div class="stat-value">${data.refundsCount}</div></div>
          </div>
          <div class="card-flat" style="margin-bottom:18px">
            <h3 style="font-size:1rem;margin-bottom:14px">Revenue Trend</h3>
            ${Charts.lineChart(trendData, { formatValue: v => v.toFixed(2) })}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
            <div class="card-flat">
              <h3 style="font-size:1rem;margin-bottom:14px">Revenue by Category</h3>
              ${Charts.donutChart(categoryData)}
            </div>
            <div class="card-flat">
              <h3 style="font-size:1rem;margin-bottom:14px">Revenue by Payment Method</h3>
              ${Charts.donutChart(paymentData)}
            </div>
          </div>
        `;
      } else if (this.activeTab === 'top-products') {
        const data = await Api.get('/reports/top-products' + this.rangeQuery());
        this._lastTopProducts = data;
        const chartData = data.slice(0, 8).map(p => ({ label: p.productName.length > 12 ? p.productName.slice(0, 12) + '…' : p.productName, value: p.quantitySold }));
        el.innerHTML = `
          <div class="card-flat" style="margin-bottom:18px">
            <h3 style="font-size:1rem;margin-bottom:14px">Top Sellers by Quantity</h3>
            ${Charts.barChart(chartData)}
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Product</th><th>Qty Sold</th><th>Revenue</th></tr></thead>
              <tbody>
                ${data.length === 0 ? `<tr><td colspan="4"><div class="empty-state"><p>No sales in this period.</p></div></td></tr>` : data.map((p, i) => `
                  <tr><td>${i + 1}</td><td>${escapeHtml(p.productName)}</td><td>${p.quantitySold}</td><td>${formatMoney(p.revenue, settings)}</td></tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      } else if (this.activeTab === 'inventory') {
        const data = await Api.get('/reports/inventory');
        this._lastInventory = data;
        el.innerHTML = `
          <div class="stat-grid">
            <div class="stat-card"><div class="stat-label">Total Products</div><div class="stat-value">${data.totalProducts}</div></div>
            <div class="stat-card accent"><div class="stat-label">Stock Value (Cost)</div><div class="stat-value">${formatMoney(data.totalStockValue, settings)}</div></div>
            <div class="stat-card"><div class="stat-label">Stock Value (Retail)</div><div class="stat-value">${formatMoney(data.totalRetailValue, settings)}</div></div>
            <div class="stat-card danger-accent"><div class="stat-label">Low Stock</div><div class="stat-value">${data.lowStockCount}</div></div>
            <div class="stat-card danger-accent"><div class="stat-label">Out of Stock</div><div class="stat-value">${data.outOfStockCount}</div></div>
          </div>
          <div class="card-flat">
            <h3 style="font-size:1rem;margin-bottom:14px">Low Stock Items</h3>
            ${data.lowStockItems.length === 0 ? '<p style="color:var(--text-muted);font-size:0.85rem">All products are well stocked.</p>' : `
              <div class="table-wrap" style="box-shadow:none">
                <table>
                  <thead><tr><th>Product</th><th>Stock</th></tr></thead>
                  <tbody>${data.lowStockItems.map(p => `<tr><td>${escapeHtml(p.name)}</td><td><span class="badge badge-danger">${p.stock} ${escapeHtml(p.unit)}</span></td></tr>`).join('')}</tbody>
                </table>
              </div>`}
          </div>
        `;
      } else if (this.activeTab === 'refunds') {
        const refunds = await Api.get('/reports/refunds' + this.rangeQuery());
        this._lastRefunds = refunds;
        const totalRefunded = refunds.reduce((sum, s) => sum + s.total, 0);
        el.innerHTML = `
          <div class="stat-grid">
            <div class="stat-card danger-accent"><div class="stat-label">Total Refunds</div><div class="stat-value">${refunds.length}</div></div>
            <div class="stat-card danger-accent"><div class="stat-label">Refunded Amount</div><div class="stat-value">${formatMoney(totalRefunded, settings)}</div></div>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Invoice</th><th>Date</th><th>Refunded On</th><th>Cashier</th><th>Amount</th></tr></thead>
              <tbody>
                ${refunds.length === 0 ? `<tr><td colspan="5"><div class="empty-state"><p>No refunds in this period.</p></div></td></tr>` : refunds.map(s => `
                  <tr>
                    <td style="font-family:var(--font-mono);font-size:0.8rem">${escapeHtml(s.invoiceNo)}</td>
                    <td>${formatDateTime(s.createdAt)}</td>
                    <td>${s.refundedAt ? formatDateTime(s.refundedAt) : '-'}</td>
                    <td>${escapeHtml(s.cashierName || '-')}</td>
                    <td>${formatMoney(s.total, settings)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      } else if (this.activeTab === 'vat') {
        const data = await Api.get('/reports/vat' + this.rangeQuery());
        this._lastVat = data;
        el.innerHTML = `
          <div class="card-flat" style="max-width:480px">
            <h3 style="font-size:1rem;margin-bottom:16px">VAT Summary — for NBR Filing Reference</h3>
            <div class="summary-row" style="font-size:0.95rem"><span>Net Sales (excl. VAT)</span><span>${formatMoney(data.totalSalesNet, settings)}</span></div>
            <div class="summary-row" style="font-size:0.95rem"><span>VAT Collected (Output VAT)</span><span>${formatMoney(data.totalVatCollected, settings)}</span></div>
            <div class="summary-row" style="font-size:0.95rem"><span>Gross Sales (incl. VAT)</span><span>${formatMoney(data.totalSalesGross, settings)}</span></div>
            <div class="summary-row total"><span>Total Purchases (Period)</span><span>${formatMoney(data.totalPurchases, settings)}</span></div>
            <p style="color:var(--text-muted);font-size:0.78rem;margin-top:14px">This summary is provided for your reference when filing with the National Bureau for Revenue (NBR). Please verify figures with your accountant before submission.</p>
          </div>
        `;
      } else if (this.activeTab === 'quotations') {
        const data = await Api.get('/reports/quotations' + this.rangeQuery() + (this.quoteStatusFilter ? `&status=${this.quoteStatusFilter}` : ''));
        this._lastQuotations = data;
        const statusData = Object.entries(data.byStatus).map(([label, value]) => ({ label: label.charAt(0).toUpperCase() + label.slice(1), value }));
        const qTerm = (this.quoteSearch || '').trim().toLowerCase();
        const qList = qTerm ? data.list.filter(q =>
          (q.quoteNo || '').toLowerCase().includes(qTerm) || (q.customerName || '').toLowerCase().includes(qTerm)
        ) : data.list;
        el.innerHTML = `
          <div class="card-flat" style="margin-bottom:14px">
            <div class="form-row" style="align-items:end">
              <div class="form-group" style="margin-bottom:0;max-width:260px">
                <label class="form-label">Status</label>
                <select class="form-select" id="report-quote-status-filter">
                  <option value="">All Statuses</option>
                  ${Object.entries(QuotationsScreen.statusLabels).map(([key, label]) => `<option value="${key}" ${this.quoteStatusFilter === key ? 'selected' : ''}>${label}</option>`).join('')}
                </select>
              </div>
              <div class="form-group" style="margin-bottom:0;max-width:260px">
                <label class="form-label">Search Quote # / Customer</label>
                <input class="form-input" id="report-quote-search" placeholder="Search..." value="${escapeHtml(this.quoteSearch || '')}">
              </div>
              <button class="btn-icon-label primary" id="apply-quote-filter-btn">Filter</button>
            </div>
          </div>
          <div class="stat-grid">
            <div class="stat-card accent"><div class="stat-label">Quotations Created</div><div class="stat-value">${data.totalQuotations}</div></div>
            <div class="stat-card"><div class="stat-label">Total Quoted Value</div><div class="stat-value">${formatMoney(data.totalQuotedValue, settings)}</div></div>
            <div class="stat-card"><div class="stat-label">Accepted &amp; Sold</div><div class="stat-value">${data.convertedCount}</div></div>
            <div class="stat-card"><div class="stat-label">Converted Value</div><div class="stat-value">${formatMoney(data.convertedValue, settings)}</div></div>
            <div class="stat-card accent"><div class="stat-label">Conversion Rate</div><div class="stat-value">${data.conversionRate}%</div></div>
            <div class="stat-card"><div class="stat-label">Still Open</div><div class="stat-value">${data.openCount}</div></div>
            <div class="stat-card danger-accent"><div class="stat-label">Rejected</div><div class="stat-value">${data.rejectedCount}</div></div>
            <div class="stat-card danger-accent"><div class="stat-label">Expired</div><div class="stat-value">${data.expiredCount}</div></div>
          </div>
          <div class="card-flat" style="margin-bottom:18px">
            <h3 style="font-size:1rem;margin-bottom:14px">Quotations by Status</h3>
            ${Charts.donutChart(statusData)}
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Quote #</th><th>Customer</th><th>Total</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                ${qList.length === 0 ? `<tr><td colspan="5"><div class="empty-state"><p>No quotations match this filter.</p></div></td></tr>` : qList.map(q => `
                  <tr>
                    <td style="font-family:var(--font-mono);font-size:0.8rem">${escapeHtml(q.quoteNo)}</td>
                    <td>${escapeHtml(q.customerName || 'Walk-in')}</td>
                    <td>${formatMoney(q.total, settings)}</td>
                    <td><span class="badge ${QuotationsScreen.statusColors[q.status]}">${QuotationsScreen.statusLabels[q.status]}</span></td>
                    <td>${formatDate(q.createdAt)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
        document.getElementById('apply-quote-filter-btn').addEventListener('click', () => {
          this.quoteStatusFilter = document.getElementById('report-quote-status-filter').value;
          this.quoteSearch = document.getElementById('report-quote-search').value;
          this.loadTabContent();
        });
      } else if (this.activeTab === 'purchases') {
        const data = await Api.get('/reports/purchases' + this.rangeQuery() + (this.supplierId ? `&supplierId=${this.supplierId}` : ''));
        this._lastPurchases = data;
        const supplierData = Object.entries(data.bySupplier).map(([label, value]) => ({ label, value }));
        el.innerHTML = `
          <div class="card-flat" style="margin-bottom:14px">
            <div class="form-row" style="align-items:end">
              <div class="form-group" style="margin-bottom:0;max-width:280px">
                <label class="form-label">Supplier</label>
                <select class="form-select" id="report-supplier-filter">
                  <option value="">All Suppliers</option>
                  ${this.suppliers.map(s => `<option value="${s.id}" ${String(this.supplierId) === String(s.id) ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
                </select>
              </div>
              <button class="btn-icon-label primary" id="apply-supplier-filter-btn">Filter</button>
            </div>
          </div>
          <div class="stat-grid">
            <div class="stat-card accent"><div class="stat-label">Purchases Recorded</div><div class="stat-value">${data.totalPurchases}</div></div>
            <div class="stat-card"><div class="stat-label">Total Spend</div><div class="stat-value">${formatMoney(data.totalSpend, settings)}</div></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px">
            <div class="card-flat">
              <h3 style="font-size:1rem;margin-bottom:14px">Spend by Supplier</h3>
              ${Charts.donutChart(supplierData)}
            </div>
            <div class="card-flat">
              <h3 style="font-size:1rem;margin-bottom:14px">Top Products Purchased</h3>
              ${Charts.barChart(data.topProducts.slice(0, 8).map(p => ({ label: p.productName.length > 12 ? p.productName.slice(0, 12) + '…' : p.productName, value: p.quantity })))}
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Supplier</th><th>Total</th><th>Note</th></tr></thead>
              <tbody>
                ${data.list.length === 0 ? `<tr><td colspan="4"><div class="empty-state"><p>No purchases in this period.</p></div></td></tr>` : data.list.map(p => `
                  <tr>
                    <td>${formatDate(p.createdAt)}</td>
                    <td>${escapeHtml(p.supplierName)}</td>
                    <td>${formatMoney(p.total, settings)}</td>
                    <td>${escapeHtml(p.note || '-')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
        document.getElementById('apply-supplier-filter-btn').addEventListener('click', () => {
          this.supplierId = document.getElementById('report-supplier-filter').value;
          this.loadTabContent();
        });
      }
    } catch (err) {
      el.innerHTML = `<div class="empty-state"><p>Could not load report.</p></div>`;
      Toast.error(err.message);
    }
  },

  exportExcel() {
    const settings = App.settings;
    let rows = [];
    let filename = 'report';

    if (this.activeTab === 'sales' && this._lastSalesData) {
      const d = this._lastSalesData;
      rows = [['Metric', 'Value'],
        ['Total Revenue', d.totalRevenue], ['Transactions', d.salesCount],
        ['VAT Collected', d.totalVat], ['Discounts Given', d.totalDiscount], ['Refunds', d.refundsCount]];
      filename = 'sales-overview';
    } else if (this.activeTab === 'top-products' && this._lastTopProducts) {
      rows = [['Product', 'Qty Sold', 'Revenue'], ...this._lastTopProducts.map(p => [p.productName, p.quantitySold, p.revenue])];
      filename = 'top-products';
    } else if (this.activeTab === 'inventory' && this._lastInventory) {
      rows = [['Product', 'Stock'], ...this._lastInventory.lowStockItems.map(p => [p.name, p.stock])];
      filename = 'low-stock';
    } else if (this.activeTab === 'refunds' && this._lastRefunds) {
      rows = [['Invoice', 'Date', 'Cashier', 'Amount'], ...this._lastRefunds.map(s => [s.invoiceNo, formatDateTime(s.createdAt), s.cashierName || '', s.total])];
      filename = 'refunds';
    } else if (this.activeTab === 'quotations' && this._lastQuotations) {
      rows = [['Quote #', 'Customer', 'Total', 'Status', 'Date'],
        ...this._lastQuotations.list.map(q => [q.quoteNo, q.customerName || 'Walk-in', q.total, q.status, formatDate(q.createdAt)])];
      filename = 'quotations';
    } else if (this.activeTab === 'purchases' && this._lastPurchases) {
      rows = [['Date', 'Supplier', 'Total', 'Note'],
        ...this._lastPurchases.list.map(p => [formatDate(p.createdAt), p.supplierName, p.total, p.note || ''])];
      filename = 'purchases';
    } else {
      Toast.error('Switch to a report tab first.');
      return;
    }

    const csv = rows.map(r => r.map(cell => {
      const str = String(cell);
      return str.includes(',') ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  printReport() {
    const settings = App.settings;
    const content = document.getElementById('report-tab-content').innerHTML;
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>${escapeHtml(settings.shopName)} - Report</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 30px; color: #1C2530; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        h3 { font-size: 14px; }
        .meta { color: #5B6675; font-size: 12px; margin-bottom: 20px; }
        .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 16px; }
        .stat-card { border: 1px solid #E2E5EA; border-radius: 8px; padding: 10px 14px; }
        .stat-label { font-size: 10px; color: #5B6675; text-transform: uppercase; }
        .stat-value { font-size: 18px; font-weight: 700; margin-top: 4px; }
        .card-flat { margin-bottom: 18px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { padding: 7px 10px; text-align: left; border-bottom: 1px solid #E2E5EA; font-size: 12px; }
        th { background: #F5F6F8; font-weight: 700; text-transform: uppercase; font-size: 10px; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; }
        @media print { body { padding: 10px; } }
      </style></head>
      <body>
        <h1>${escapeHtml(settings.shopName)} - ${this.activeTab.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())} Report</h1>
        <div class="meta">Generated ${formatDateTime(new Date().toISOString())} &middot; Period: ${this.fromDate || 'start'} to ${this.toDate || 'today'}</div>
        ${content}
      </body></html>
    `);
    win.document.close();
    setTimeout(() => win.print(), 400);
  }
};
