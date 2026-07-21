// Third Eye Computer Solutions - License Manager
// Clients & Licenses screen - the core workflow: add a shop, generate keys, renew, track.

const ClientsScreen = {
  clients: [],

  async render() {
    Shell.mount('/clients', `<div class="empty-state">Loading clients...</div>`);
    try {
      this.clients = await Api.get('/clients');
    } catch (err) {
      Toast.error(err.message);
      return;
    }
    this.renderScreen();
  },

  statusBadge(c) {
    if (c.active === false) return '<span class="badge badge-danger">Deactivated</span>';
    if (c.status === 'no_license') return '<span class="badge badge-neutral">No license yet</span>';
    if (c.status === 'expired') return '<span class="badge badge-danger">Expired</span>';
    if (c.status === 'expiring_soon') return `<span class="badge badge-warning">${c.daysLeft} days left</span>`;
    return `<span class="badge badge-success">Active (${c.daysLeft} days)</span>`;
  },

  renderScreen() {
    const content = `
      <div class="page-header">
        <div>
          <h1>Clients &amp; Licenses</h1>
          <div class="page-subtitle">${this.clients.length} supermarket client${this.clients.length === 1 ? '' : 's'}</div>
        </div>
        <button class="btn btn-gold" id="add-client-btn">
          <span style="width:16px;height:16px;display:flex">${Icon.plus}</span> Add Client
        </button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Shop Name</th><th>Shop Code</th><th>Contact</th><th>License Status</th><th>Expires</th><th></th></tr></thead>
          <tbody>
            ${this.clients.length === 0 ? `<tr><td colspan="6"><div class="empty-state"><p>No clients yet. Add your first supermarket client to issue a license.</p></div></td></tr>` : this.clients.map(c => `
              <tr>
                <td><strong>${escapeHtml(c.shopName)}</strong></td>
                <td style="font-family:var(--font-mono);font-size:0.8rem">${escapeHtml(c.shopCode)}</td>
                <td>${escapeHtml(c.contactName || '-')}<br><span style="font-size:0.76rem;color:var(--text-muted)">${escapeHtml(c.phone || '')}</span></td>
                <td>${this.statusBadge(c)}</td>
                <td>${c.latestLicense ? formatDate(c.latestLicense.expiresAt) : '-'}</td>
                <td style="text-align:right;white-space:nowrap">
                  <button class="row-action row-action-view with-label view-client-btn" data-id="${c.id}">Manage</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    document.getElementById('content').innerHTML = content;
    document.getElementById('add-client-btn').addEventListener('click', () => this.openAddClientModal());
    document.querySelectorAll('.view-client-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openClientDetail(Number(btn.dataset.id)));
    });
  },

  openAddClientModal() {
    Modal.open('Add New Client', `
      <form id="add-client-form">
        <div class="form-group">
          <label class="form-label">Shop / Supermarket Name</label>
          <input class="form-input" id="c-shopName" placeholder="e.g. Al Osra Supermarket - Manama" required>
        </div>
        <div class="form-group">
          <label class="form-label">Shop Code (unique identifier)</label>
          <input class="form-input" id="c-shopCode" placeholder="e.g. ALOSRA-MANAMA-01" required>
          <div class="form-hint">A short unique code for this shop. Letters, numbers, and dashes only. This gets embedded in their license key.</div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Contact Person</label>
            <input class="form-input" id="c-contactName" placeholder="Owner / manager name">
          </div>
          <div class="form-group">
            <label class="form-label">Phone</label>
            <input class="form-input" id="c-phone" placeholder="+973 XXXX XXXX">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input class="form-input" id="c-email" type="email">
        </div>
        <div class="form-group">
          <label class="form-label">Address</label>
          <input class="form-input" id="c-address" placeholder="Shop location in Bahrain">
        </div>
        <button type="submit" class="btn btn-gold" style="width:100%;justify-content:center;padding:12px">Add Client</button>
      </form>
    `);
    document.getElementById('add-client-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        shopName: document.getElementById('c-shopName').value.trim(),
        shopCode: document.getElementById('c-shopCode').value.trim().toUpperCase().replace(/\s+/g, '-'),
        contactName: document.getElementById('c-contactName').value.trim(),
        phone: document.getElementById('c-phone').value.trim(),
        email: document.getElementById('c-email').value.trim(),
        address: document.getElementById('c-address').value.trim()
      };
      try {
        const client = await Api.post('/clients', payload);
        Toast.success('Client added. Now generate their first license key.');
        Modal.close();
        this.clients = await Api.get('/clients');
        this.renderScreen();
        this.openClientDetail(client.id);
      } catch (err) {
        Toast.error(err.message);
      }
    });
  },

  async openClientDetail(clientId) {
    let client;
    try {
      client = await Api.get(`/clients/${clientId}`);
    } catch (err) {
      Toast.error(err.message);
      return;
    }

    const render = () => `
      <div class="card" style="margin-bottom:18px;${client.active === false ? 'border-color:var(--danger);background:var(--danger-bg)' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div class="form-row" style="flex:1">
            <div>
              <div class="form-label">Shop Name</div>
              <div style="font-size:0.95rem">${escapeHtml(client.shopName)}</div>
            </div>
            <div>
              <div class="form-label">Shop Code</div>
              <div style="font-family:var(--font-mono);font-size:0.9rem">${escapeHtml(client.shopCode)}</div>
            </div>
          </div>
          <div>
            ${client.active === false
              ? '<span class="badge badge-danger">Deactivated</span>'
              : '<span class="badge badge-success">Active</span>'}
          </div>
        </div>
        <div class="form-row" style="margin-top:10px">
          <div>
            <div class="form-label">Contact</div>
            <div style="font-size:0.9rem">${escapeHtml(client.contactName || '-')} &middot; ${escapeHtml(client.phone || '-')}</div>
          </div>
          <div>
            <div class="form-label">Email</div>
            <div style="font-size:0.9rem">${escapeHtml(client.email || '-')}</div>
          </div>
        </div>
        ${client.active === false ? `
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid rgba(209,69,69,0.25);font-size:0.82rem;color:var(--danger)">
          This client's POS software will lock itself out the next time it checks in with this server (within ${'3'} days at most, or immediately if it has internet right now).
        </div>` : ''}
      </div>

      <div style="display:flex;gap:10px;margin-bottom:20px">
        <button class="btn btn-gold" id="gen-new-key-btn" style="flex:1;justify-content:center">
          <span style="width:16px;height:16px;display:flex">${Icon.key}</span> Generate New Key
        </button>
        ${client.licenses.length > 0 ? `
        <button class="btn btn-outline" id="renew-key-btn" style="flex:1;justify-content:center">
          <span style="width:16px;height:16px;display:flex">${Icon.refresh}</span> Renew License
        </button>` : ''}
        ${client.active === false ? `
        <button class="btn btn-primary" id="restore-client-btn" style="flex:1;justify-content:center">
          <span style="width:16px;height:16px;display:flex">${Icon.check}</span> Reactivate Client
        </button>` : `
        <button class="btn btn-danger" id="revoke-client-btn" style="flex:1;justify-content:center">
          <span style="width:16px;height:16px;display:flex">${Icon.x}</span> Deactivate / Revoke
        </button>`}
        <button class="btn btn-danger" id="delete-client-btn">
          <span style="width:16px;height:16px;display:flex">${Icon.trash}</span>
        </button>
      </div>

      <h3 style="font-size:0.95rem;margin-bottom:10px">License History</h3>
      <div class="table-wrap" style="box-shadow:none">
        <table>
          <thead><tr><th>Issued</th><th>Duration</th><th>Expires</th><th>Type</th><th></th></tr></thead>
          <tbody>
            ${client.licenses.length === 0 ? `<tr><td colspan="5"><div class="empty-state" style="padding:30px"><p>No license keys generated yet.</p></div></td></tr>` : client.licenses.map(l => `
              <tr>
                <td>${formatDate(l.issuedAt)}</td>
                <td>${l.durationDays} days</td>
                <td>${formatDate(l.expiresAt)}</td>
                <td><span class="badge ${l.type === 'renewal' ? 'badge-gold' : 'badge-neutral'}">${l.type === 'renewal' ? 'Renewal' : 'New'}</span></td>
                <td><button class="row-action row-action-view with-label show-key-btn" data-key="${escapeHtml(l.licenseKey)}">View Key</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    Modal.open(`Manage Client`, render(), { large: true });

    const wire = () => {
      document.getElementById('gen-new-key-btn').addEventListener('click', () => this.openGenerateKeyModal(client, 'new'));
      const renewBtn = document.getElementById('renew-key-btn');
      if (renewBtn) renewBtn.addEventListener('click', () => this.openGenerateKeyModal(client, 'renewal'));

      const revokeBtn = document.getElementById('revoke-client-btn');
      if (revokeBtn) {
        revokeBtn.addEventListener('click', async () => {
          if (!confirm(`Deactivate "${client.shopName}"? Their POS software will lock out the next time it checks in (within 3 days, or immediately if connected now).`)) return;
          try {
            client = await Api.post(`/clients/${client.id}/revoke`);
            client = await Api.get(`/clients/${client.id}`);
            Toast.success('Client deactivated. Their software will lock out shortly.');
            document.getElementById('modal-body').innerHTML = render();
            wire();
            this.clients = await Api.get('/clients');
          } catch (err) { Toast.error(err.message); }
        });
      }

      const restoreBtn = document.getElementById('restore-client-btn');
      if (restoreBtn) {
        restoreBtn.addEventListener('click', async () => {
          try {
            await Api.post(`/clients/${client.id}/restore`);
            client = await Api.get(`/clients/${client.id}`);
            Toast.success('Client reactivated. Their software will unlock on next check-in.');
            document.getElementById('modal-body').innerHTML = render();
            wire();
            this.clients = await Api.get('/clients');
          } catch (err) { Toast.error(err.message); }
        });
      }

      document.getElementById('delete-client-btn').addEventListener('click', async () => {
        if (!confirm(`Delete client "${client.shopName}"? This will remove their record permanently and their POS software will also lock out, since it can no longer be verified.`)) return;
        try {
          await Api.del(`/clients/${client.id}`);
          Toast.success('Client deleted.');
          Modal.close();
          this.clients = await Api.get('/clients');
          this.renderScreen();
        } catch (err) { Toast.error(err.message); }
      });
      document.querySelectorAll('.show-key-btn').forEach(btn => {
        btn.addEventListener('click', () => this.showKeyModal(btn.dataset.key));
      });
    };
    wire();
  },

  openGenerateKeyModal(client, mode) {
    const isRenewal = mode === 'renewal';
    Modal.open(isRenewal ? 'Renew License' : 'Generate New License Key', `
      <p style="color:var(--text-secondary);font-size:0.86rem;margin-bottom:16px">
        ${isRenewal
          ? `This will extend the license for <strong>${escapeHtml(client.shopName)}</strong> starting from their current expiry date (so they don't lose paid days).`
          : `This will create a brand new license for <strong>${escapeHtml(client.shopName)}</strong>, counted from today.`}
      </p>
      <form id="gen-key-form">
        <div class="form-group">
          <label class="form-label">Duration</label>
          <select class="form-select" id="key-duration">
            <option value="30">1 Month (30 days)</option>
            <option value="90">3 Months (90 days)</option>
            <option value="180">6 Months (180 days)</option>
            <option value="365" selected>1 Year (365 days)</option>
            <option value="730">2 Years (730 days)</option>
            <option value="custom">Custom...</option>
          </select>
        </div>
        <div class="form-group" id="custom-days-group" style="display:none">
          <label class="form-label">Custom Duration (days)</label>
          <input class="form-input" id="custom-days" type="number" min="1">
        </div>
        <button type="submit" class="btn btn-gold" style="width:100%;justify-content:center;padding:12px">
          Generate Key
        </button>
      </form>
    `);

    document.getElementById('key-duration').addEventListener('change', (e) => {
      document.getElementById('custom-days-group').style.display = e.target.value === 'custom' ? 'block' : 'none';
    });

    document.getElementById('gen-key-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const durationSelect = document.getElementById('key-duration').value;
      const durationDays = durationSelect === 'custom'
        ? Number(document.getElementById('custom-days').value)
        : Number(durationSelect);
      if (!durationDays || durationDays < 1) {
        Toast.error('Please enter a valid duration.');
        return;
      }
      try {
        const endpoint = isRenewal ? `/clients/${client.id}/renew-license` : `/clients/${client.id}/generate-license`;
        const license = await Api.post(endpoint, { durationDays });
        Toast.success('License key generated.');
        this.showKeyModal(license.licenseKey, client.shopName, license.expiresAt);
        this.clients = await Api.get('/clients');
      } catch (err) {
        Toast.error(err.message);
      }
    });
  },

  showKeyModal(licenseKey, shopName, expiresAt) {
    Modal.open('License Key', `
      ${shopName ? `<p style="font-size:0.86rem;color:var(--text-secondary)">For: <strong>${escapeHtml(shopName)}</strong>${expiresAt ? ` &middot; Expires: <strong>${formatDate(expiresAt)}</strong>` : ''}</p>` : ''}
      <div class="key-display-box" id="key-text">
        ${escapeHtml(licenseKey)}
        <button class="copy-key-btn" id="copy-key-btn">Copy</button>
      </div>
      <p style="color:var(--text-muted);font-size:0.78rem">Send this key to your customer. They will paste it into the activation screen on their POS software.</p>
    `);
    document.getElementById('copy-key-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(licenseKey).then(() => Toast.success('Key copied to clipboard.'));
    });
  }
};
