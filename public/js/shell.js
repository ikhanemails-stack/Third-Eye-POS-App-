// Third Eye Computer Solutions - License Manager
// App shell: sidebar navigation + topbar.

const Shell = {
  navItems: [
    { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { path: '/clients', label: 'Clients & Licenses', icon: 'clients' },
    { path: '/account', label: 'My Account', icon: 'settings' },
  ],

  render(activePath, contentHtml) {
    const admin = App.admin || {};
    const initials = (admin.name || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();

    const navHtml = this.navItems.map(item => {
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
            <div class="brand-mark">TE</div>
            <div class="brand-text">
              <div class="company">THIRD EYE<br>COMPUTER SOLUTIONS</div>
              <div class="product">License Manager</div>
            </div>
          </div>
          <nav class="sidebar-nav">${navHtml}</nav>
          <div class="sidebar-footer">v1.0 &middot; POS Licensing Platform</div>
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
              <div style="display:flex;align-items:center;gap:10px;font-size:0.85rem">
                <div style="width:32px;height:32px;border-radius:50%;background:var(--navy-800);color:#fff;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-weight:600;font-size:0.82rem">${initials}</div>
                <div style="font-weight:600">${escapeHtml(admin.name || '')}</div>
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
    document.getElementById('app').innerHTML = this.render(activePath, contentHtml);
    document.getElementById('logout-btn').addEventListener('click', async () => {
      await Api.post('/auth/logout');
      App.admin = null;
      Router.navigate('/login');
      App.boot();
    });
    const mobileBtn = document.getElementById('mobile-menu-btn');
    if (mobileBtn) {
      mobileBtn.addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
    }
  }
};

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
