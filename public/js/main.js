// Third Eye Computer Solutions - POS System
// Main application bootstrap and routing.

const App = {
  user: null,
  settings: null,

  async boot() {
    // 1. Check license status first - this gates everything else.
    let licenseStatus;
    try {
      licenseStatus = await Api.get('/license/status');
    } catch (err) {
      document.getElementById('app').innerHTML = `<div class="empty-state"><p>Could not reach the server. Please restart the application.</p></div>`;
      return;
    }

    if (!licenseStatus.activated) {
      ActivationScreen.render(licenseStatus);
      return;
    }

    // 2. Load shop settings (needed for branding on the login screen too).
    try {
      this.settings = await Api.get('/settings');
    } catch (err) {
      this.settings = { shopName: 'POS System', currency: 'BHD', currencyDecimals: 3, vatRate: 10 };
    }

    // 3. Check login status.
    try {
      this.user = await Api.get('/auth/me');
    } catch (err) {
      this.user = null;
    }

    if (!this.user) {
      LoginScreen.render();
      return;
    }

    // 4. Authenticated - set up routes and start the router.
    this.registerRoutes();
    Router.start();
  },

  registerRoutes() {
    Router.register('/dashboard', () => DashboardScreen.render());
    Router.register('/pos', () => PosScreen.render());
    Router.register('/inventory', () => InventoryScreen.render());
    Router.register('/purchases', () => PurchasesScreen.render());
    Router.register('/sales-history', () => SalesHistoryScreen.render());
    Router.register('/customers', () => CustomersScreen.render());
    Router.register('/delivery', () => DeliveryScreen.render());
    Router.register('/accounting', () => AccountingScreen.render());
    Router.register('/daily-expenses', () => DailyExpensesScreen.render());
    Router.register('/reports', () => ReportsScreen.render());
    Router.register('/vendors', () => VendorsScreen.render());
    Router.register('/employees', () => EmployeesScreen.render());
    Router.register('/expiry', () => ExpiryScreen.render());
    Router.register('/settings', () => SettingsScreen.render());
    Router.register('/users', () => UsersScreen.render());
    Router.register('/backup', () => BackupScreen.render());
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.boot();
});

// ── Global barcode scanner ─────────────────────────────────────────────────
// Scan a barcode from ANYWHERE in the app → goes to POS and adds the product.
(function startGlobalBarcodeScanner() {
  let buffer = '';
  let lastKeyTime = 0;
  const BARCODE_SPEED_MS = 50; // barcode scanners type very fast (<50ms between chars)
  const MIN_BARCODE_LENGTH = 4;

  document.addEventListener('keypress', (e) => {
    // Ignore if user is typing in an input/textarea/select
    const tag = document.activeElement.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    const now = Date.now();

    if (e.key === 'Enter') {
      // Enter = end of barcode scan
      if (buffer.length >= MIN_BARCODE_LENGTH && (now - lastKeyTime) < 300) {
        const code = buffer.trim();
        buffer = '';
        // Navigate to POS and trigger search
        if (window.location.hash !== '#/pos') {
          window.location.hash = '#/pos';
          // Wait for POS to load then search
          setTimeout(() => {
            const posSearch = document.getElementById('pos-search');
            if (posSearch) {
              posSearch.value = code;
              posSearch.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }, 400);
        } else {
          const posSearch = document.getElementById('pos-search');
          if (posSearch) {
            posSearch.value = code;
            posSearch.dispatchEvent(new Event('input', { bubbles: true }));
            posSearch.focus();
          }
        }
      } else {
        buffer = '';
      }
      return;
    }

    // Fast typing = barcode scanner (not human keyboard)
    if (now - lastKeyTime < BARCODE_SPEED_MS || buffer.length === 0) {
      buffer += e.key;
    } else {
      buffer = e.key;
    }
    lastKeyTime = now;
  });
})();
// Pings the server every 10 minutes while the browser tab is open.
(function startKeepAlive() {
  const ping = () => fetch('/ping').catch(() => {});
  ping(); // immediate ping on load
  setInterval(ping, 10 * 60 * 1000); // every 10 minutes
})();

// ── Expiry notification check ─────────────────────────────────────────────
async function checkExpiryNotifications() {
  try {
    const [tracked, manual] = await Promise.all([
      Api.get('/expiry/tracked').catch(() => []),
      Api.get('/expiry/items').catch(() => [])
    ]);
    const all = [...(tracked||[]), ...(manual||[])];
    const expired  = all.filter(i => i.status === 'expired').length;
    const critical = all.filter(i => i.status === 'critical').length;
    const warning  = all.filter(i => i.status === 'warning').length;

    if (expired > 0) {
      Toast.error(`⚠️ ${expired} product(s) have EXPIRED! Go to Expiry & Returns to remove them.`);
    } else if (critical > 0) {
      Toast.error(`🔴 ${critical} product(s) expire within 7 days! Check Expiry & Returns.`);
    } else if (warning > 0) {
      if (window.showToast) showToast(`🟡 ${warning} product(s) expire within 30 days.`, 'warning');
    }
  } catch(e) {}
}

// Check expiry on load and every hour
setTimeout(checkExpiryNotifications, 5000);
setInterval(checkExpiryNotifications, 60 * 60 * 1000);

// ── Theme system ────────────────────────────────────────────────────────────
function applyTheme(key) {
  const body = document.body;
  // Remove all theme classes
  body.removeAttribute('data-theme');
  if (key && key !== 'default') {
    body.setAttribute('data-theme', key);
  }
  localStorage.setItem('posTheme', key || 'default');
  // Reload settings screen to show updated selection
  if (window.SettingsScreen) SettingsScreen.render();
}

// Apply saved theme on page load
(function() {
  const saved = localStorage.getItem('posTheme');
  if (saved && saved !== 'default') {
    document.body.setAttribute('data-theme', saved);
  }
})();

// ── IMMEDIATE LICENSE REVOCATION POLLING ────────────────────────────────────
// Polls the server every 30 seconds. If license is revoked, shows lock screen
// immediately without waiting for the next API call.
(function startLicensePolling() {
  const POLL_INTERVAL = 30 * 1000; // 30 seconds

  async function checkLicense() {
    // Only check if user is logged in
    if (!App || !App.session) return;
    try {
      const status = await fetch('/api/license/status').then(r => r.json());
      if (!status.activated) {
        console.warn('🔒 License revoked - locking screen');
        Api._licenseLockTriggered = false; // reset so it triggers
        if (typeof ActivationScreen !== 'undefined') {
          App.session = null;
          ActivationScreen.render(status);
        }
      }
    } catch(e) {
      // Network error - ignore, grace period handles it server-side
    }
  }

  // Start polling after 5 seconds (give app time to load)
  setTimeout(() => {
    checkLicense();
    setInterval(checkLicense, POLL_INTERVAL);
  }, 5000);
})();
