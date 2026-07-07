// Third Eye Computer Solutions - POS System
// Accounting module screen - expenses, cash drawer, profit & loss.

const AccountingScreen = {
  activeTab: 'expenses',
  expenses: [],
  expenseCategories: [],
  cashSessions: [],
  currentSession: null,
  profitLoss: null,

  async render() {
    Shell.mount('/accounting', `<div class="empty-state">Loading accounting data...</div>`);
    await this.loadAll();
    this.renderScreen();
  },

  async loadAll() {
    try {
      [this.expenses, this.expenseCategories, this.cashSessions, this.currentSession] = await Promise.all([
        Api.get('/expenses'),
        Api.get('/expense-categories'),
        Api.get('/cash-sessions'),
        Api.get('/cash-sessions/current')
      ]);
      this.profitLoss = await Api.get('/accounting/profit-loss');
    } catch (err) {
      Toast.error(err.message);
    }
  },

  renderScreen() {
    const settings = App.settings;
    const content = `
      <div class="page-header">
        <div>
          <h1>Accounting</h1>
          <div class="page-subtitle">Expenses, cash drawer, and profit overview</div>
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat-card success-accent">
          <div class="stat-label">Today's Revenue (net)</div>
          <div class="stat-value">${formatMoney(this.profitLoss.revenue, settings)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Cost of Goods Sold</div>
          <div class="stat-value">${formatMoney(this.profitLoss.cogs, settings)}</div>
        </div>
        <div class="stat-card danger-accent">
          <div class="stat-label">Expenses</div>
          <div class="stat-value">${formatMoney(this.profitLoss.totalExpenses, settings)}</div>
        </div>
        <div class="stat-card accent">
          <div class="stat-label">Net Profit</div>
          <div class="stat-value" style="color:${this.profitLoss.netProfit >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatMoney(this.profitLoss.netProfit, settings)}</div>
        </div>
      </div>

      <div class="tabs">
        <div class="tab ${this.activeTab === 'expenses' ? 'active' : ''}" data-tab="expenses">Expenses</div>
        <div class="tab ${this.activeTab === 'cash' ? 'active' : ''}" data-tab="cash">Cash Drawer</div>
        <div class="tab ${this.activeTab === 'data' ? 'active' : ''}" data-tab="data">Data Management</div>
      </div>

      <div id="tab-content"></div>
    `;
    document.getElementById('content').innerHTML = content;
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.activeTab = tab.dataset.tab;
        this.renderScreen();
      });
    });
    this.renderTabContent();
  },

  renderTabContent() {
    const el = document.getElementById('tab-content');
    if (this.activeTab === 'expenses') {
      el.innerHTML = this.renderExpensesTab();
      this.wireExpensesTab();
    } else if (this.activeTab === 'cash') {
      el.innerHTML = this.renderCashTab();
      this.wireCashTab();
    } else {
      el.innerHTML = this.renderDataTab();
      this.wireDataTab();
    }
  },

  renderDataTab() {
    const isAdmin = App.user.role === 'admin';
    return `
      <div class="card-flat" style="max-width:560px;border:1px solid var(--danger-bg)">
        <h3 style="font-size:1rem;margin-bottom:8px;color:var(--danger)">Clear Test Sales Data</h3>
        <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:16px">
          If you've been testing the system with sample sales, use this to wipe ALL sales records
          and start fresh with a clean sales history. This does <strong>not</strong> touch your products,
          customers, or settings - only sales, receipts, and sale-related stock movements are cleared.
        </p>
        ${isAdmin ? `
        <button class="btn btn-danger" id="clear-sales-btn">
          <span style="width:16px;height:16px;display:flex">${Icon.trash}</span> Clear All Sales History
        </button>` : `<p style="color:var(--text-muted);font-size:0.82rem">Only administrators can clear sales data.</p>`}
      </div>
    `;
  },

  wireDataTab() {
    const btn = document.getElementById('clear-sales-btn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      if (!confirm('This will permanently delete ALL sales history. This cannot be undone. Continue?')) return;
      const typed = prompt('Type CLEAR to confirm:');
      if (typed !== 'CLEAR') { Toast.error('Cancelled.'); return; }
      try {
        const result = await Api.post('/sales/clear-all', { confirm: 'CLEAR' });
        Toast.success(`${result.deleted} sale(s) cleared.`);
        await this.loadAll();
        this.renderScreen();
      } catch (err) { Toast.error(err.message); }
    });
  },

  renderExpensesTab() {
    const settings = App.settings;
    return `
      <div class="toolbar-row">
        <button class="btn-icon-label" id="manage-expense-cats-btn">${Icon.accounting} Manage Categories</button>
        <button class="btn-icon-label gold" id="add-expense-btn" style="margin-left:auto">${Icon.plus} Record Expense</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th></th></tr></thead>
          <tbody>
            ${this.expenses.length === 0 ? `<tr><td colspan="5"><div class="empty-state"><p>No expenses recorded yet.</p></div></td></tr>` : this.expenses.map(e => {
              const cat = this.expenseCategories.find(c => c.id === e.categoryId);
              return `
              <tr>
                <td>${formatDate(e.date)}</td>
                <td>${cat ? escapeHtml(cat.name) : '<span style="color:var(--text-muted)">-</span>'}</td>
                <td>${escapeHtml(e.description || '-')}</td>
                <td>${formatMoney(e.amount, settings)}</td>
                <td style="text-align:right">
                  <button class="row-action row-action-edit edit-expense-btn" data-id="${e.id}">${Icon.edit}</button>
                  <button class="row-action row-action-delete del-expense-btn" data-id="${e.id}">${Icon.trash}</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  wireExpensesTab() {
    document.getElementById('add-expense-btn').addEventListener('click', () => this.openExpenseModal());
    document.getElementById('manage-expense-cats-btn').addEventListener('click', () => this.openExpenseCategoriesModal());
    document.querySelectorAll('.edit-expense-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openExpenseModal(this.expenses.find(e => e.id === Number(btn.dataset.id))));
    });
    document.querySelectorAll('.del-expense-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this expense?')) return;
        try {
          await Api.del(`/expenses/${btn.dataset.id}`);
          await this.loadAll();
          this.renderScreen();
        } catch (err) { Toast.error(err.message); }
      });
    });
  },

  openExpenseCategoriesModal() {
    const render = () => `
      <div style="margin-bottom:16px">
        ${this.expenseCategories.map(c => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border)">
            <span>${escapeHtml(c.name)}</span>
            <div>
              <button class="row-action row-action-edit edit-exp-cat-btn" data-id="${c.id}">${Icon.edit}</button>
              <button class="row-action row-action-delete del-exp-cat-btn" data-id="${c.id}">${Icon.trash}</button>
            </div>
          </div>
        `).join('') || '<p style="color:var(--text-muted);font-size:0.85rem">No categories yet.</p>'}
      </div>
      <form id="exp-cat-form" style="display:flex;gap:8px">
        <input class="form-input" id="new-exp-cat-name" placeholder="New category name" required>
        <button type="submit" class="btn btn-primary btn-sm">Add</button>
      </form>
    `;
    Modal.open('Manage Expense Categories', render());
    const wire = () => {
      document.getElementById('exp-cat-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('new-exp-cat-name').value.trim();
        if (!name) return;
        try {
          await Api.post('/expense-categories', { name });
          this.expenseCategories = await Api.get('/expense-categories');
          document.getElementById('modal-body').innerHTML = render();
          wire();
        } catch (err) { Toast.error(err.message); }
      });
      document.querySelectorAll('.edit-exp-cat-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const cat = this.expenseCategories.find(c => c.id === Number(btn.dataset.id));
          const newName = prompt('Rename category:', cat.name);
          if (!newName || !newName.trim() || newName.trim() === cat.name) return;
          Api.put(`/expense-categories/${cat.id}`, { name: newName.trim() })
            .then(async () => {
              Toast.success('Category renamed.');
              this.expenseCategories = await Api.get('/expense-categories');
              document.getElementById('modal-body').innerHTML = render();
              wire();
            })
            .catch(err => Toast.error(err.message));
        });
      });
      document.querySelectorAll('.del-exp-cat-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this category?')) return;
          try {
            await Api.del(`/expense-categories/${btn.dataset.id}`);
            this.expenseCategories = await Api.get('/expense-categories');
            document.getElementById('modal-body').innerHTML = render();
            wire();
          } catch (err) { Toast.error(err.message); }
        });
      });
    };
    wire();
  },

  openExpenseModal(expense) {
    const isEdit = !!expense;
    Modal.open(isEdit ? 'Edit Expense' : 'Record Expense', `
      <form id="expense-form">
        <div class="form-row">
          ${QuickAddSelect.render({ id: 'e-category', label: 'Category', options: this.expenseCategories, selectedId: expense?.categoryId, placeholder: 'No category' })}
          <div class="form-group">
            <label class="form-label">Amount (BHD)</label>
            <input class="form-input" id="e-amount" type="number" step="0.001" value="${expense?.amount ?? ''}" required>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <input class="form-input" id="e-desc" value="${escapeHtml(expense?.description || '')}" placeholder="e.g. Electricity bill - June">
        </div>
        <div class="form-group">
          <label class="form-label">Date</label>
          <input class="form-input" id="e-date" type="date" value="${expense ? expense.date.slice(0, 10) : new Date().toISOString().slice(0, 10)}">
        </div>
        <button type="submit" class="btn btn-gold" style="width:100%;justify-content:center;padding:12px">${isEdit ? 'Save Changes' : 'Save Expense'}</button>
      </form>
    `);
    QuickAddSelect.wire('e-category', (name) => Api.post('/expense-categories', { name }), (created) => {
      this.expenseCategories.push(created);
    });
    document.getElementById('expense-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        categoryId: document.getElementById('e-category').value || null,
        amount: Number(document.getElementById('e-amount').value),
        description: document.getElementById('e-desc').value.trim(),
        date: new Date(document.getElementById('e-date').value).toISOString()
      };
      try {
        if (isEdit) await Api.put(`/expenses/${expense.id}`, payload);
        else await Api.post('/expenses', payload);
        Toast.success(isEdit ? 'Expense updated.' : 'Expense recorded.');
        Modal.close();
        await this.loadAll();
        this.renderScreen();
      } catch (err) { Toast.error(err.message); }
    });
  },

  renderCashTab() {
    const settings = App.settings;
    return `
      <div class="card-flat" style="margin-bottom:20px">
        ${this.currentSession ? `
          <h3 style="font-size:1rem;margin-bottom:10px">Active Session</h3>
          <p style="color:var(--text-secondary);font-size:0.86rem;margin-bottom:14px">
            Opened ${formatDateTime(this.currentSession.openedAt)} with opening float of ${formatMoney(this.currentSession.openingFloat, settings)}.
          </p>
          <button class="btn btn-danger" id="close-session-btn">Close Cash Drawer</button>
        ` : `
          <h3 style="font-size:1rem;margin-bottom:10px">No Active Session</h3>
          <p style="color:var(--text-secondary);font-size:0.86rem;margin-bottom:14px">Open a cash drawer session to start tracking cash sales for reconciliation.</p>
          <form id="open-session-form" style="display:flex;gap:10px;align-items:flex-end">
            <div class="form-group" style="margin-bottom:0;flex:1">
              <label class="form-label">Opening Float (BHD)</label>
              <input class="form-input" id="opening-float" type="number" step="0.001" value="0">
            </div>
            <button type="submit" class="btn btn-gold">Open Session</button>
          </form>
        `}
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Opened</th><th>Closed</th><th>Cashier</th><th>Opening Float</th><th>Cash Sales</th><th>Expected</th><th>Counted</th><th>Difference</th></tr></thead>
          <tbody>
            ${this.cashSessions.length === 0 ? `<tr><td colspan="8"><div class="empty-state"><p>No sessions yet.</p></div></td></tr>` : this.cashSessions.map(s => `
              <tr>
                <td>${formatDateTime(s.openedAt)}</td>
                <td>${s.closedAt ? formatDateTime(s.closedAt) : '<span class="badge badge-success">Open</span>'}</td>
                <td>${escapeHtml(s.userName || '-')}</td>
                <td>${formatMoney(s.openingFloat, settings)}</td>
                <td>${s.cashSalesTotal !== undefined ? formatMoney(s.cashSalesTotal, settings) : '-'}</td>
                <td>${s.expectedCash !== undefined ? formatMoney(s.expectedCash, settings) : '-'}</td>
                <td>${s.closingFloat !== undefined ? formatMoney(s.closingFloat, settings) : '-'}</td>
                <td>${s.difference !== undefined ? `<span style="color:${s.difference === 0 ? 'inherit' : s.difference > 0 ? 'var(--success)' : 'var(--danger)'}">${formatMoney(s.difference, settings)}</span>` : '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  wireCashTab() {
    const openForm = document.getElementById('open-session-form');
    if (openForm) {
      openForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const openingFloat = Number(document.getElementById('opening-float').value) || 0;
        try {
          await Api.post('/cash-sessions/open', { openingFloat });
          Toast.success('Cash drawer session opened.');
          await this.loadAll();
          this.renderScreen();
        } catch (err) { Toast.error(err.message); }
      });
    }
    const closeBtn = document.getElementById('close-session-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.openCloseSessionModal());
    }
  },

  openCloseSessionModal() {
    Modal.open('Close Cash Drawer', `
      <form id="close-session-form">
        <div class="form-group">
          <label class="form-label">Counted Cash in Drawer (BHD)</label>
          <input class="form-input" id="closing-float" type="number" step="0.001" required>
          <div class="form-hint">Count all physical cash in the drawer now, including the opening float.</div>
        </div>
        <button type="submit" class="btn btn-gold" style="width:100%;justify-content:center;padding:12px">Close Session</button>
      </form>
    `);
    document.getElementById('close-session-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const closingFloat = Number(document.getElementById('closing-float').value);
      try {
        const result = await Api.post(`/cash-sessions/${this.currentSession.id}/close`, { closingFloat });
        Modal.close();
        Toast.success(`Session closed. Difference: ${formatMoneyPlain(result.difference, App.settings)} ${App.settings.currency}`);
        await this.loadAll();
        this.renderScreen();
      } catch (err) { Toast.error(err.message); }
    });
  }
};
