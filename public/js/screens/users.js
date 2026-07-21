// Third Eye Computer Solutions - POS System
// Staff Accounts screen (admin only) - manage cashier and admin logins.

const UsersScreen = {
  users: [],

  async render() {
    Shell.mount('/users', `<div class="empty-state">Loading staff accounts...</div>`);
    if (App.user.role !== 'admin') {
      document.getElementById('content').innerHTML = `<div class="empty-state"><p>Only administrators can access this page.</p></div>`;
      return;
    }
    try {
      this.users = await Api.get('/users');
    } catch (err) {
      Toast.error(err.message);
      return;
    }
    this.renderScreen();
  },

  renderScreen() {
    const content = `
      <div class="page-header">
        <div>
          <h1>Staff Accounts</h1>
          <div class="page-subtitle">Manage cashier and administrator logins</div>
        </div>
        <button class="btn btn-gold" id="add-user-btn">
          <span style="width:16px;height:16px;display:flex">${Icon.plus}</span> Add Staff
        </button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${this.users.map(u => `
              <tr>
                <td><strong>${escapeHtml(u.name)}</strong></td>
                <td style="font-family:var(--font-mono);font-size:0.82rem">${escapeHtml(u.username)}</td>
                <td><span class="badge ${u.role === 'admin' ? 'badge-gold' : u.role === 'driver' ? 'badge-info' : 'badge-neutral'}">${u.role === 'admin' ? 'Administrator' : u.role === 'driver' ? 'Driver' : 'Cashier'}</span></td>
                <td><span class="badge ${u.active !== false ? 'badge-success' : 'badge-danger'}">${u.active !== false ? 'Active' : 'Disabled'}</span></td>
                <td style="text-align:right">
                  <button class="row-action row-action-edit edit-user-btn" data-id="${u.id}">${Icon.edit}</button>
                  ${u.id !== App.user.id ? `<button class="row-action row-action-delete del-user-btn" data-id="${u.id}">${Icon.trash}</button>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    document.getElementById('content').innerHTML = content;
    document.getElementById('add-user-btn').addEventListener('click', () => this.openModal());
    document.querySelectorAll('.edit-user-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openModal(this.users.find(u => u.id === Number(btn.dataset.id))));
    });
    document.querySelectorAll('.del-user-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this staff account?')) return;
        try {
          await Api.del(`/users/${btn.dataset.id}`);
          this.users = await Api.get('/users');
          this.renderScreen();
        } catch (err) { Toast.error(err.message); }
      });
    });
  },

  openModal(user) {
    const isEdit = !!user;
    Modal.open(isEdit ? 'Edit Staff Account' : 'Add Staff Account', `
      <form id="user-form">
        <div class="form-group">
          <label class="form-label">Full Name</label>
          <input class="form-input" id="u-name" value="${escapeHtml(user?.name || '')}" required>
        </div>
        <div class="form-group">
          <label class="form-label">Username</label>
          <input class="form-input" id="u-username" value="${escapeHtml(user?.username || '')}" ${isEdit ? 'disabled' : ''} required>
        </div>
        <div class="form-group">
          <label class="form-label">${isEdit ? 'New Password (leave blank to keep current)' : 'Password'}</label>
          <input class="form-input" id="u-password" type="password" ${!isEdit ? 'required' : ''}>
        </div>
        <div class="form-group">
          <label class="form-label">Role</label>
          <select class="form-select" id="u-role">
            <option value="cashier" ${!user || user?.role === 'cashier' ? 'selected' : ''}>Cashier</option>
            <option value="driver" ${user?.role === 'driver' ? 'selected' : ''}>Driver (Delivery only)</option>
            <option value="admin" ${user?.role === 'admin' ? 'selected' : ''}>Administrator</option>
          </select>
        </div>
        ${isEdit ? `
        <div class="form-group">
          <label class="form-label" style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" id="u-active" ${user.active !== false ? 'checked' : ''} style="width:auto"> Account Active
          </label>
        </div>` : ''}
        <button type="submit" class="btn btn-gold" style="width:100%;justify-content:center;padding:12px">
          ${isEdit ? 'Save Changes' : 'Create Account'}
        </button>
      </form>
    `);
    document.getElementById('user-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = document.getElementById('u-password').value;
      const payload = {
        name: document.getElementById('u-name').value.trim(),
        role: document.getElementById('u-role').value
      };
      if (password) payload.password = password;
      if (isEdit) {
        payload.active = document.getElementById('u-active').checked;
      } else {
        payload.username = document.getElementById('u-username').value.trim();
      }
      try {
        if (isEdit) await Api.put(`/users/${user.id}`, payload);
        else await Api.post('/users', payload);
        Toast.success(isEdit ? 'Account updated.' : 'Account created.');
        Modal.close();
        this.users = await Api.get('/users');
        this.renderScreen();
      } catch (err) { Toast.error(err.message); }
    });
  }
};
