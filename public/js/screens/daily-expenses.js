// Third Eye Computer Solutions - POS System
// Daily Expenses screen — matches GroceryPOS daily expenses style

const DailyExpensesScreen = {
  date: new Date().toISOString().slice(0, 10),
  data: null,

  async render() {
    Shell.mount('/daily-expenses', `<div class="empty-state">Loading daily expenses...</div>`);
    await this.load();
  },

  async load() {
    try {
      this.data = await Api.get(`/expenses/daily-summary?date=${this.date}`);
      this.renderScreen();
    } catch (e) {
      Toast.error('Could not load daily expenses.');
    }
  },

  renderScreen() {
    const s = App.settings;
    const d = this.data;
    const cur = s.currency || 'BHD';
    const dec = s.currencyDecimals ?? 3;
    const fmt = v => Number(v || 0).toFixed(dec);

    const TYPES = [
      { key: 'vendor_payment',  label: 'Vendor Payment',   icon: '🏪', color: '#f59e0b' },
      { key: 'employee_salary', label: 'Employee Salary',  icon: '👤', color: '#3b82f6' },
      { key: 'utilities',       label: 'Utilities',         icon: '⚡', color: '#8b5cf6' },
      { key: 'rent',            label: 'Rent',              icon: '🏠', color: '#10b981' },
      { key: 'other',           label: 'Other Expense',     icon: '📋', color: '#6b7280' }
    ];

    Shell.mount('/daily-expenses', `
      <div class="page-header">
        <div>
          <h1>💸 Daily Expenses</h1>
          <div class="page-subtitle">Track daily cash flow and expenses</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-outline" onclick="DailyExpensesScreen.generateReport()">📊 Expense Report</button>
          <button class="btn btn-gold" onclick="DailyExpensesScreen.openAddExpense()">+ Add Expense</button>
        </div>
      </div>

      <!-- Date & Balance Card -->
      <div class="card-flat" style="margin-bottom:20px">
        <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:20px">
          <div>
            <label class="form-label">DATE</label>
            <input class="form-input" type="date" id="de-date" value="${this.date}"
              style="width:180px" onchange="DailyExpensesScreen.changeDate(this.value)">
          </div>
          <div style="flex:1">
            <label class="form-label">PREVIOUS DAY BALANCE (${cur})</label>
            <input class="form-input" type="number" id="de-prev-balance"
              value="${fmt(d.prevDayBalance)}" step="0.001"
              placeholder="Auto from prev day: ${cur} 0"
              style="width:220px"
              onchange="DailyExpensesScreen.updatePrevBalance(this.value)">
          </div>
        </div>

        <!-- Expense Type Cards -->
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:20px">
          <div class="de-stat-card" style="border-left:3px solid #94a3b8">
            <div class="de-label">Prev Day Balance</div>
            <div class="de-value" style="color:#f59e0b">${cur} ${fmt(d.prevDayBalance)}</div>
          </div>
          ${TYPES.map(t => `
          <div class="de-stat-card" style="border-left:3px solid ${t.color}">
            <div class="de-label">${t.icon} ${t.label}</div>
            <div class="de-value" style="color:${t.color}">${cur} ${fmt(d.summary[t.key])}</div>
          </div>`).join('')}
        </div>

        <!-- Totals -->
        <div style="background:var(--surface-1);border-radius:12px;padding:16px">
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
            <span style="color:var(--text-secondary)">Previous Day Balance</span>
            <span style="font-weight:600;color:#f59e0b">${cur} ${fmt(d.prevDayBalance)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
            <span style="color:var(--text-secondary)">(–) Total Expenses Today</span>
            <span style="font-weight:600;color:#ef4444">${cur} ${fmt(d.totalExpenses)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:10px 0;margin-top:4px">
            <span style="font-size:16px;font-weight:700">Remaining Balance</span>
            <span style="font-size:18px;font-weight:800;color:${d.remainingBalance >= 0 ? '#10b981' : '#ef4444'}">${cur} ${fmt(d.remainingBalance)}</span>
          </div>
        </div>
      </div>

      <!-- Expense List -->
      <div class="card-flat">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:16px">Expenses for ${new Date(this.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })}</h3>
        ${d.expenses.length === 0
          ? `<div class="empty-state" style="padding:40px">
               <div style="font-size:40px;margin-bottom:12px">💸</div>
               <p>No expenses recorded for this date.</p>
               <button class="btn btn-gold" style="margin-top:12px" onclick="DailyExpensesScreen.openAddExpense()">+ Add Expense</button>
             </div>`
          : `<div class="table-wrap">
               <table>
                 <thead><tr><th>Type</th><th>Description</th><th>Amount</th><th>Time</th><th></th></tr></thead>
                 <tbody>
                   ${d.expenses.map(e => {
                     const t = TYPES.find(x => x.key === e.expenseType) || TYPES[4];
                     return `<tr>
                       <td><span style="background:${t.color}22;color:${t.color};padding:3px 8px;border-radius:20px;font-size:12px;font-weight:600">${t.icon} ${t.label}</span></td>
                       <td>${escapeHtml(e.description || '-')}</td>
                       <td style="font-weight:700;color:#ef4444">${cur} ${fmt(e.amount)}</td>
                       <td style="color:var(--text-muted);font-size:12px">${e.createdAt ? new Date(e.createdAt).toLocaleTimeString() : '-'}</td>
                       <td style="white-space:nowrap">
                         <button class="row-action row-action-edit" onclick="DailyExpensesScreen.openEditExpense(${e.id})">${Icon.edit}</button>
                         <button class="row-action row-action-delete" onclick="DailyExpensesScreen.deleteExpense(${e.id})">${Icon.trash}</button>
                       </td>
                     </tr>`;
                   }).join('')}
                 </tbody>
               </table>
             </div>`
        }
      </div>

      <style>
        .de-stat-card { background:var(--surface-2);border-radius:10px;padding:14px;border:0.5px solid var(--border) }
        .de-label { font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase }
        .de-value { font-size:18px;font-weight:800 }
      </style>

      <div id="de-modal-container"></div>
    `);
  },

  changeDate(val) {
    this.date = val;
    this.load();
  },

  async updatePrevBalance(val) {
    const balance = parseFloat(val) || 0;
    await Api.post('/expenses/daily-summary', { date: this.date, prevDayBalance: balance });
    await this.load();
    Toast.success('Previous day balance updated.');
  },

  EXPENSE_TYPES: [
    { key: 'vendor_payment',  label: '🏪 Vendor Payment' },
    { key: 'employee_salary', label: '👤 Employee Salary' },
    { key: 'utilities',       label: '⚡ Utilities' },
    { key: 'rent',            label: '🏠 Rent' },
    { key: 'other',           label: '📋 Other Expense' }
  ],

  openAddExpense() {
    this._openExpenseModal(null);
  },

  openEditExpense(id) {
    const expense = (this.data?.expenses || []).find(e => e.id === id);
    if (!expense) { Toast.error('Could not find that expense.'); return; }
    this._openExpenseModal(expense);
  },

  _openExpenseModal(existing) {
    const s = App.settings;
    const cur = s.currency || 'BHD';
    const TYPES = this.EXPENSE_TYPES;
    const isEdit = !!existing;
    const modal = document.getElementById('de-modal-container');
    modal.innerHTML = `
      <div class="modal-overlay active" id="de-modal">
        <div class="modal" style="max-width:420px">
          <div class="modal-header"><h2>${isEdit ? 'Edit' : 'Add'} Daily Expense</h2><button class="modal-close" onclick="document.getElementById('de-modal').remove()">×</button></div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Expense Type</label>
              <select class="form-select" id="de-type">
                ${TYPES.map(t => `<option value="${t.key}" ${existing && existing.expenseType === t.key ? 'selected' : ''}>${t.label}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Amount (${cur})</label>
              <input class="form-input" id="de-amount" type="number" step="0.001" min="0" placeholder="0.000" value="${existing ? existing.amount : ''}">
            </div>
            <div class="form-group">
              <label class="form-label">Description</label>
              <input class="form-input" id="de-desc" placeholder="Optional note" value="${existing ? escapeHtml(existing.description || '') : ''}">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" onclick="document.getElementById('de-modal').remove()">Cancel</button>
            <button class="btn btn-gold" onclick="DailyExpensesScreen.saveExpense(${isEdit ? existing.id : 'null'})">${isEdit ? 'Save Changes' : 'Save Expense'}</button>
          </div>
        </div>
      </div>`;
  },

  async saveExpense(id) {
    const amount = parseFloat(document.getElementById('de-amount').value);
    const expenseType = document.getElementById('de-type').value;
    const description = document.getElementById('de-desc').value;
    if (!amount || amount <= 0) { Toast.error('Please enter a valid amount.'); return; }
    try {
      if (id) {
        await Api.put(`/expenses/${id}`, { amount, expenseType, description });
        Toast.success('Expense updated.');
      } else {
        await Api.post('/expenses', { amount, expenseType, description, date: this.date, categoryId: null });
        Toast.success('Expense saved.');
      }
      document.getElementById('de-modal')?.remove();
      await this.load();
    } catch (err) { Toast.error(err.message); }
  },

  async deleteExpense(id) {
    if (!confirm('Delete this expense?')) return;
    await Api.delete(`/expenses/${id}`);
    await this.load();
    Toast.success('Expense deleted.');
  },

  generateReport() {
    if (!this.data) { Toast.error('No data loaded for this date yet.'); return; }
    const s = App.settings;
    const cur = s.currency || 'BHD';
    const dec = s.currencyDecimals ?? 3;
    const fmt = v => Number(v || 0).toFixed(dec);
    const typeLabel = (key) => {
      const t = this.EXPENSE_TYPES.find(x => x.key === key);
      return t ? t.label.replace(/^\S+\s/, '') : 'Other Expense';
    };
    const win = window.open('', '_blank', 'width=650,height=800');
    if (!win) { Toast.error('Please allow pop-ups to view the report.'); return; }
    const dateLabel = new Date(this.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    win.document.write(`<!DOCTYPE html><html><head><title>Daily Expense Report - ${escapeHtml(this.date)}</title>
    <style>
      body{font-family:Arial,Helvetica,sans-serif;padding:24px;font-size:13px;color:#0F2A3D}
      h1{color:#0F2A3D;margin-bottom:4px}
      .subtitle{color:#666;margin-bottom:20px}
      table{width:100%;border-collapse:collapse;margin-bottom:18px}
      th,td{padding:8px 10px;border:1px solid #ddd;text-align:left}
      th{background:#f5f5f5}
      td.amount{text-align:right;font-variant-numeric:tabular-nums}
      .totals td{font-weight:600}
      .totals tr:last-child td{font-size:16px;font-weight:800}
      .neg{color:#c0392b} .pos{color:#1e8449}
      @media print{ button{display:none} }
    </style></head><body>
    <h1>💸 Daily Expense Report</h1>
    <div class="subtitle">${escapeHtml(s.shopName || '')} &nbsp;•&nbsp; ${escapeHtml(dateLabel)}</div>
    <table>
      <thead><tr><th>Type</th><th>Description</th><th style="text-align:right">Amount (${cur})</th></tr></thead>
      <tbody>
        ${this.data.expenses.length === 0
          ? `<tr><td colspan="3" style="text-align:center;color:#888">No expenses recorded for this date.</td></tr>`
          : this.data.expenses.map(e => `<tr><td>${escapeHtml(typeLabel(e.expenseType))}</td><td>${escapeHtml(e.description || '-')}</td><td class="amount">${fmt(e.amount)}</td></tr>`).join('')}
      </tbody>
    </table>
    <table class="totals">
      <tr><td>Previous Day Balance</td><td class="amount">${cur} ${fmt(this.data.prevDayBalance)}</td></tr>
      <tr><td>(–) Total Expenses Today</td><td class="amount neg">${cur} ${fmt(this.data.totalExpenses)}</td></tr>
      <tr><td>Remaining Balance</td><td class="amount ${this.data.remainingBalance >= 0 ? 'pos' : 'neg'}">${cur} ${fmt(this.data.remainingBalance)}</td></tr>
    </table>
    <button onclick="window.print()">Print</button>
    </body></html>`);
    win.document.close();
    win.print();
  }
};
