// Third Eye Computer Solutions - POS System
// Employees screen - HR records with visa/passport expiry alerts, plus
// general reminders management.

const EmployeesScreen = {
  employees: [],
  alerts: [],
  reminders: [],
  activeTab: 'employees',

  async render() {
    Shell.mount('/employees', `<div class="empty-state">Loading employees...</div>`);
    await this.loadAll();
    BulkSelect.reset();
    this.renderScreen();
  },

  async loadAll() {
    try {
      [this.employees, this.alerts, this.reminders] = await Promise.all([
        Api.get('/employees'),
        Api.get('/employees/alerts'),
        Api.get('/reminders')
      ]);
    } catch (err) {
      Toast.error(err.message);
    }
  },

  renderScreen() {
    const isAdmin = App.user.role === 'admin';
    const content = `
      <div class="page-header">
        <div>
          <h1>Employees</h1>
          <div class="page-subtitle">${this.employees.length} staff records</div>
        </div>
        ${isAdmin ? `<button class="btn btn-gold" id="add-employee-btn"><span style="width:16px;height:16px;display:flex">${Icon.plus}</span> Add Employee</button>` : ''}
      </div>

      ${this.alerts.length > 0 ? `
      <div class="card" style="background:var(--danger-bg);border-color:rgba(209,69,69,0.25);margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <span style="width:18px;height:18px;display:flex;color:var(--danger)">${Icon.alert}</span>
          <strong style="color:var(--danger-600)">${this.alerts.length} document(s) expiring within 14 days</strong>
        </div>
        ${this.alerts.map(a => `
          <div style="font-size:0.85rem;color:var(--text-secondary);padding:4px 0">
            <strong>${escapeHtml(a.employeeName)}</strong> - ${a.type === 'visa' ? 'Visa' : 'Passport'} expires
            ${a.daysLeft < 0 ? `<span style="color:var(--danger)">${Math.abs(a.daysLeft)} days ago</span>` : `in <span style="color:var(--danger)">${a.daysLeft} days</span>`}
            (${formatDate(a.expiryDate)})
          </div>
        `).join('')}
      </div>` : ''}

      <div class="tabs">
        <div class="tab ${this.activeTab === 'employees' ? 'active' : ''}" data-tab="employees">Employees</div>
        <div class="tab ${this.activeTab === 'reminders' ? 'active' : ''}" data-tab="reminders">General Reminders</div>
      </div>
      <div id="emp-tab-content"></div>
    `;
    document.getElementById('content').innerHTML = content;

    const addBtn = document.getElementById('add-employee-btn');
    if (addBtn) addBtn.addEventListener('click', () => this.openEmployeeModal());
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => { this.activeTab = tab.dataset.tab; this.renderScreen(); });
    });

    if (this.activeTab === 'employees') this.renderEmployeesTab();
    else this.renderRemindersTab();
  },

  renderEmployeesTab() {
    const isAdmin = App.user.role === 'admin';
    const el = document.getElementById('emp-tab-content');
    el.innerHTML = `
      <div id="bulk-toolbar-container"></div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              ${BulkSelect.checkboxHeader()}
              <th>Name</th><th>Position</th><th>Nationality</th><th>Phone</th><th>Visa Expiry</th><th>Passport Expiry</th><th>Salary</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${this.employees.length === 0 ? `<tr><td colspan="9"><div class="empty-state"><p>No employees added yet.</p></div></td></tr>` : this.employees.map(e => `
              <tr>
                ${BulkSelect.checkboxCell(e.id)}
                <td><strong>${escapeHtml(e.name)}</strong></td>
                <td>${escapeHtml(e.position || '-')}</td>
                <td>${escapeHtml(e.nationality || '-')}</td>
                <td>${escapeHtml(e.phone || '-')}</td>
                <td>${e.visaExpiry ? `<span class="${e.visaDaysLeft <= 14 ? 'badge badge-danger' : 'badge badge-neutral'}">${formatDate(e.visaExpiry)}</span>` : '-'}</td>
                <td>${e.passportExpiry ? `<span class="${e.passportDaysLeft <= 14 ? 'badge badge-danger' : 'badge badge-neutral'}">${formatDate(e.passportExpiry)}</span>` : '-'}</td>
                <td>${formatMoney(e.salary, App.settings)}</td>
                <td style="text-align:right">
                  <div class="row-actions-group">
                    ${isAdmin ? `<button class="row-action row-action-edit edit-emp-btn" data-id="${e.id}">${Icon.edit}</button>` : ''}
                    ${isAdmin ? `<button class="row-action row-action-delete del-emp-btn" data-id="${e.id}">${Icon.trash}</button>` : ''}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    document.querySelectorAll('.edit-emp-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openEmployeeModal(this.employees.find(e => e.id === Number(btn.dataset.id))));
    });
    document.querySelectorAll('.del-emp-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this employee record?')) return;
        try {
          await Api.del(`/employees/${btn.dataset.id}`);
          await this.loadAll();
          this.renderScreen();
        } catch (err) { Toast.error(err.message); }
      });
    });
    BulkSelect.wire('bulk-toolbar-container', async (ids) => {
      try {
        const result = await Api.post('/employees/bulk-delete', { ids });
        Toast.success(`${result.deleted} employee(s) deleted.`);
        BulkSelect.reset();
        await this.loadAll();
        this.renderScreen();
      } catch (err) { Toast.error(err.message); }
    });
  },

  openEmployeeModal(employee) {
    const isEdit = !!employee;
    Modal.open(isEdit ? 'Edit Employee' : 'Add Employee', `
      <form id="emp-form">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Full Name</label>
            <input class="form-input" id="e-name" value="${escapeHtml(employee?.name || '')}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Position / Role</label>
            <input class="form-input" id="e-position" value="${escapeHtml(employee?.position || '')}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">CPR Number</label>
            <input class="form-input" id="e-cpr" value="${escapeHtml(employee?.cprNumber || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Nationality</label>
            <input class="form-input" id="e-nationality" value="${escapeHtml(employee?.nationality || '')}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Phone</label>
          <input class="form-input" id="e-phone" value="${escapeHtml(employee?.phone || '')}">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Visa Expiry</label>
            <input class="form-input" id="e-visa" type="date" value="${employee?.visaExpiry ? employee.visaExpiry.slice(0, 10) : ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Passport Expiry</label>
            <input class="form-input" id="e-passport" type="date" value="${employee?.passportExpiry ? employee.passportExpiry.slice(0, 10) : ''}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Salary (BHD)</label>
          <input class="form-input" id="e-salary" type="number" step="0.001" value="${employee?.salary ?? ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea class="form-textarea" id="e-notes" rows="2">${escapeHtml(employee?.notes || '')}</textarea>
        </div>
        <button type="submit" class="btn btn-gold" style="width:100%;justify-content:center;padding:12px">${isEdit ? 'Save Changes' : 'Add Employee'}</button>
      </form>
    `, { large: true });
    document.getElementById('emp-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('e-name').value.trim(),
        position: document.getElementById('e-position').value.trim(),
        cprNumber: document.getElementById('e-cpr').value.trim(),
        nationality: document.getElementById('e-nationality').value.trim(),
        phone: document.getElementById('e-phone').value.trim(),
        visaExpiry: document.getElementById('e-visa').value ? new Date(document.getElementById('e-visa').value).toISOString() : null,
        passportExpiry: document.getElementById('e-passport').value ? new Date(document.getElementById('e-passport').value).toISOString() : null,
        salary: Number(document.getElementById('e-salary').value) || 0,
        notes: document.getElementById('e-notes').value.trim()
      };
      try {
        if (isEdit) await Api.put(`/employees/${employee.id}`, payload);
        else await Api.post('/employees', payload);
        Toast.success(isEdit ? 'Employee updated.' : 'Employee added.');
        Modal.close();
        await this.loadAll();
        this.renderScreen();
      } catch (err) { Toast.error(err.message); }
    });
  },

  renderRemindersTab() {
    const el = document.getElementById('emp-tab-content');
    const freqLabels = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', once: 'Once', range: 'Date Range' };
    el.innerHTML = `
      <div class="toolbar-row">
        <button class="btn-icon-label gold" id="add-reminder-btn">${Icon.plus} New Reminder</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Description</th><th>Frequency</th><th>Start</th><th>End</th><th>Notes</th><th></th></tr></thead>
          <tbody>
            ${this.reminders.length === 0 ? `<tr><td colspan="6"><div class="empty-state"><p>No reminders set up yet.</p></div></td></tr>` : this.reminders.map(r => `
              <tr>
                <td><strong>${escapeHtml(r.description)}</strong></td>
                <td><span class="badge badge-neutral">${freqLabels[r.frequency]}</span></td>
                <td>${formatDate(r.startDate)}</td>
                <td>${r.endDate ? formatDate(r.endDate) : '-'}</td>
                <td>${escapeHtml(r.notes || '-')}</td>
                <td style="text-align:right">
                  <div class="row-actions-group">
                    <button class="row-action row-action-edit edit-reminder-btn" data-id="${r.id}">${Icon.edit}</button>
                    <button class="row-action row-action-delete del-reminder-btn" data-id="${r.id}">${Icon.trash}</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    document.getElementById('add-reminder-btn').addEventListener('click', () => this.openReminderModal());
    document.querySelectorAll('.edit-reminder-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openReminderModal(this.reminders.find(r => r.id === Number(btn.dataset.id))));
    });
    document.querySelectorAll('.del-reminder-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this reminder?')) return;
        try {
          await Api.del(`/reminders/${btn.dataset.id}`);
          await this.loadAll();
          this.renderScreen();
        } catch (err) { Toast.error(err.message); }
      });
    });
  },

  openReminderModal(reminder) {
    const isEdit = !!reminder;
    Modal.open(isEdit ? 'Edit Reminder' : 'New Reminder', `
      <form id="reminder-form">
        <div class="form-group">
          <label class="form-label">Description</label>
          <input class="form-input" id="r-desc" value="${escapeHtml(reminder?.description || '')}" required>
        </div>
        <div class="form-group">
          <label class="form-label">Frequency</label>
          <select class="form-select" id="r-freq">
            <option value="daily" ${reminder?.frequency === 'daily' ? 'selected' : ''}>Daily</option>
            <option value="weekly" ${reminder?.frequency === 'weekly' ? 'selected' : ''}>Weekly (same day of week)</option>
            <option value="monthly" ${reminder?.frequency === 'monthly' ? 'selected' : ''}>Monthly (same day of month)</option>
            <option value="once" ${reminder?.frequency === 'once' ? 'selected' : ''}>Once only</option>
            <option value="range" ${reminder?.frequency === 'range' ? 'selected' : ''}>Date Range (every day between)</option>
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Start Date</label>
            <input class="form-input" id="r-start" type="date" value="${reminder?.startDate ? reminder.startDate.slice(0, 10) : new Date().toISOString().slice(0, 10)}" required>
          </div>
          <div class="form-group">
            <label class="form-label">End Date (optional)</label>
            <input class="form-input" id="r-end" type="date" value="${reminder?.endDate ? reminder.endDate.slice(0, 10) : ''}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea class="form-textarea" id="r-notes" rows="2">${escapeHtml(reminder?.notes || '')}</textarea>
        </div>
        <button type="submit" class="btn btn-gold" style="width:100%;justify-content:center;padding:12px">${isEdit ? 'Save Changes' : 'Create Reminder'}</button>
      </form>
    `);
    document.getElementById('reminder-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        description: document.getElementById('r-desc').value.trim(),
        frequency: document.getElementById('r-freq').value,
        startDate: new Date(document.getElementById('r-start').value).toISOString(),
        endDate: document.getElementById('r-end').value ? new Date(document.getElementById('r-end').value).toISOString() : null,
        notes: document.getElementById('r-notes').value.trim()
      };
      try {
        if (isEdit) await Api.put(`/reminders/${reminder.id}`, payload);
        else await Api.post('/reminders', payload);
        Toast.success(isEdit ? 'Reminder updated.' : 'Reminder created.');
        Modal.close();
        await this.loadAll();
        this.renderScreen();
      } catch (err) { Toast.error(err.message); }
    });
  }
};
