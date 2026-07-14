// Third Eye Computer Solutions - POS System
// App shell: sidebar navigation + topbar, wraps every authenticated screen.

const Shell = {
  navItems: [
    { section: 'Operations' },
    { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { path: '/pos', label: 'Point of Sale', icon: 'pos' },
    { path: '/delivery', label: 'Delivery', icon: 'delivery' },
    { section: 'Inventory' },
    { path: '/inventory', label: 'Products', icon: 'inventory' },
    { path: '/purchases', label: 'Purchases', icon: 'purchases' },
    { path: '/expiry', label: 'Expiry &amp; Returns', icon: 'alert' },
    { path: '/vendors', label: 'Vendors &amp; Bills', icon: 'truck' },
    { section: 'Records' },
    { path: '/sales-history', label: 'Sales History', icon: 'sales' },
    { path: '/customers', label: 'Customers', icon: 'customers' },
    { path: '/accounting', label: 'Accounting', icon: 'accounting' },
    { path: '/daily-expenses', label: 'Daily Expenses', icon: 'expenses' },
    { path: '/employees', label: 'Employees', icon: 'users' },
    { path: '/reports', label: 'Reports', icon: 'reports' },
    { section: 'Administration' },
    { path: '/users', label: 'Staff Accounts', icon: 'users', adminOnly: true },
    { path: '/backup', label: 'Backup & Restore', icon: 'backup', adminOnly: true },
    { path: '/zatca-ksa', label: 'ZATCA (Saudi Arabia)', icon: 'settings', adminOnly: true },
    { path: '/settings', label: 'Settings', icon: 'settings' },
  ],

  render(activePath, contentHtml) {
    const settings = App.settings || {};
    const user = App.user || {};
    const shopName = settings.shopName || 'My Supermarket';
    const initials = (user.name || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();

    const logoHtml = settings.logoDataUrl
      ? `<img src="${settings.logoDataUrl}" class="shop-logo" alt="logo">`
      : `<div class="shop-logo-fallback">${(shopName[0] || 'S').toUpperCase()}</div>`;

    const navHtml = this.navItems.map(item => {
      if (item.section) {
        return `<div class="nav-section-label">${item.section}</div>`;
      }
      if (item.adminOnly && user.role !== 'admin') return '';
      const active = activePath === item.path ? 'active' : '';
      return `<a href="#${item.path}" class="nav-item ${active}">
        <span style="width:18px;height:18px;display:flex">${Icon[item.icon]}</span>
        <span>${item.label}</span>
      </a>`;
    }).join('');

    return `
      <div class="app-shell">
        <aside class="sidebar" id="sidebar">
          <div class="sidebar-brand">
            ${logoHtml}
            <div class="shop-name" title="${escapeHtml(shopName)}">${escapeHtml(shopName)}</div>
          </div>
          <nav class="sidebar-nav">${navHtml}</nav>
          <div class="sidebar-footer">Powered by Third Eye Computer Solutions</div>
        </aside>
        <div class="main-area">
          <header class="topbar">
            <div style="display:flex;align-items:center;gap:14px">
              <button class="btn-ghost mobile-menu-btn" id="mobile-menu-btn" style="padding:6px">
                <span style="width:20px;height:20px;display:flex">${Icon.menu}</span>
              </button>
              <div class="topbar-title">${this.navItems.find(i => i.path === activePath)?.label || ''}</div>
            </div>
            <div class="topbar-right">
              <div class="topbar-clock" id="topbar-clock"></div>
              <div class="topbar-user">
                <div class="avatar">${initials}</div>
                <div>
                  <div style="font-weight:600">${escapeHtml(user.name || '')}</div>
                  <div style="color:var(--text-muted);font-size:0.74rem">${user.role === 'admin' ? 'Administrator' : 'Cashier'}</div>
                </div>
              </div>
              <button class="btn btn-ghost btn-sm" id="logout-btn">
                <span style="width:16px;height:16px;display:flex">${Icon.logout}</span> Logout
              </button>
            </div>
          </header>
          <div class="content" id="content">${contentHtml}</div>
        </div>
      </div>
    `;
  },

  mount(activePath, contentHtml) {
    // Fix: re-rendering the whole shell on every navigation used to reset the
    // sidebar's scroll position back to the top, which is annoying on a long
    // nav list. Capture it before the re-render and restore it after.
    const prevSidebar = document.getElementById('sidebar');
    const prevScrollTop = prevSidebar ? prevSidebar.scrollTop : 0;

    document.getElementById('app').innerHTML = this.render(activePath, contentHtml);

    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.scrollTop = prevScrollTop;

    document.getElementById('logout-btn').addEventListener('click', async () => {
      await Api.post('/auth/logout');
      App.user = null;
      Router.navigate('/login');
      App.boot();
    });
    const mobileBtn = document.getElementById('mobile-menu-btn');
    if (mobileBtn) {
      mobileBtn.addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
      });
    }
    this.startClock();
    this.checkLicenseBanner();
    if (typeof OrderPad !== 'undefined') OrderPad.ensureMounted();
  },

  // Shows a persistent, escalating license-expiry banner on EVERY screen
  // (not just the dashboard) so expiry is never a surprise. Severity rises
  // as the deadline approaches: quiet notice at 14 days, urgent red banner
  // inside the final 3 days.
  async checkLicenseBanner() {
    try {
      const status = await Api.get('/license/status');
      const existing = document.getElementById('global-license-banner');
      if (existing) existing.remove();
      if (!status.activated || status.daysLeft === undefined || status.daysLeft > 14) return;

      const urgent = status.daysLeft <= 3;
      const banner = document.createElement('div');
      banner.id = 'global-license-banner';
      banner.className = `license-banner ${urgent ? 'urgent' : 'warning'}`;
      banner.innerHTML = `
        <span style="width:18px;height:18px;display:flex;flex-shrink:0">${Icon.alert}</span>
        <span><strong>License expires in ${status.daysLeft} day${status.daysLeft === 1 ? '' : 's'}</strong> (${new Date(status.expiresAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}). Contact Third Eye Computer Solutions to renew before the software locks.</span>
      `;
      const content = document.getElementById('content');
      if (content && content.parentElement) {
        content.parentElement.insertBefore(banner, content);
      }
    } catch (e) {
      // If this check itself fails with a license error, Api.js's global
      // interceptor will already be showing the lock screen - nothing to do.
    }
  },

  startClock() {
    const el = document.getElementById('topbar-clock');
    if (!el) return;
    const update = () => {
      const now = new Date();
      el.textContent = now.toLocaleString('en-GB', {
        weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    };
    update();
    if (this._clockInterval) clearInterval(this._clockInterval);
    this._clockInterval = setInterval(update, 30000);
  }
};


function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoney(amount, settings, opts = {}) {
  const decimals = settings?.currencyDecimals ?? 3;
  const currency = settings?.currency || 'BHD';
  const num = Number(amount || 0);
  const cls = opts.colorize ? (num < 0 ? 'negative' : num > 0 && opts.colorPositive ? 'positive' : '') : '';
  return `<span class="money ${opts.size || ''} ${cls}">${num.toFixed(decimals)}<span class="currency-tag">${currency}</span></span>`;
}

function formatMoneyPlain(amount, settings) {
  const decimals = settings?.currencyDecimals ?? 3;
  return Number(amount || 0).toFixed(decimals);
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
