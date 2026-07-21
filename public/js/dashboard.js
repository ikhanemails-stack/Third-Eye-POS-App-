// Third Eye Computer Solutions - License Manager
// Dashboard screen - overview of all clients and license status.

const DashboardScreen = {
  async render() {
    Shell.mount('/dashboard', `<div class="empty-state">Loading dashboard...</div>`);
    let summary, clients;
    try {
      [summary, clients] = await Promise.all([
        Api.get('/dashboard-summary'),
        Api.get('/clients')
      ]);
    } catch (err) {
      Toast.error(err.message);
      return;
    }

    const expiringSoon = clients.filter(c => c.status === 'expiring_soon' || c.status === 'expired')
      .sort((a, b) => (a.daysLeft ?? -999) - (b.daysLeft ?? -999));

    const content = `
      <div class="page-header">
        <div>
          <h1>Overview</h1>
          <div class="page-subtitle">All your licensed supermarket clients at a glance</div>
        </div>
        <a href="#/clients" class="btn btn-gold">
          <span style="width:16px;height:16px;display:flex">${Icon.plus}</span> Add Client
        </a>
      </div>

      <div class="stat-grid">
        <div class="stat-card accent">
          <div class="stat-label">Total Clients</div>
          <div class="stat-value">${summary.totalClients}</div>
        </div>
        <div class="stat-card success-accent">
          <div class="stat-label">Active Licenses</div>
          <div class="stat-value">${summary.activeCount}</div>
        </div>
        <div class="stat-card warning-accent">
          <div class="stat-label">Expiring Soon (≤14 days)</div>
          <div class="stat-value">${summary.expiringSoonCount}</div>
        </div>
        <div class="stat-card danger-accent">
          <div class="stat-label">Expired</div>
          <div class="stat-value">${summary.expiredCount}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Keys Issued</div>
          <div class="stat-value">${summary.totalLicensesIssued}</div>
        </div>
      </div>

      <div class="card-flat">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 style="font-size:1rem;font-weight:600">Needs Attention</h3>
          <a href="#/clients" class="btn btn-ghost btn-sm">View All Clients</a>
        </div>
        ${expiringSoon.length === 0 ? `<div class="empty-state" style="padding:30px"><p>All clients are in good standing.</p></div>` : `
        <div class="table-wrap" style="box-shadow:none">
          <table>
            <thead><tr><th>Shop</th><th>Shop Code</th><th>Status</th><th>Expires</th><th></th></tr></thead>
            <tbody>
              ${expiringSoon.slice(0, 10).map(c => `
                <tr>
                  <td><strong>${escapeHtml(c.shopName)}</strong></td>
                  <td style="font-family:var(--font-mono);font-size:0.78rem">${escapeHtml(c.shopCode)}</td>
                  <td>${c.status === 'expired' ? '<span class="badge badge-danger">Expired</span>' : `<span class="badge badge-warning">${c.daysLeft} days left</span>`}</td>
                  <td>${c.latestLicense ? formatDate(c.latestLicense.expiresAt) : '-'}</td>
                  <td><a href="#/clients" class="btn btn-ghost btn-sm">Renew</a></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`}
      </div>
    `;
    document.getElementById('content').innerHTML = content;
  }
};
