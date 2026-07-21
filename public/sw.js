// Third Eye POS - Service Worker (v2)
//
// What this does and does NOT do, honestly:
// - App shell (HTML/CSS/JS/icons): cached on install, served from cache
//   first, refreshed in the background. This is what lets the app OPEN
//   at all with no internet.
// - Read-only API calls (GET /api/...): served from cache if offline,
//   otherwise always fetched fresh and the cache updated (stale-while-
//   revalidate). This lets screens still show last-known data (products,
//   customers, recent sales) while offline.
// - Writes (POST/PUT/DELETE - creating a sale, editing stock, etc.):
//   NEVER cached or queued. This app's data lives in the server's JSON
//   database, so a sale made offline cannot be safely invented client-side
//   and synced later without real risk of double-selling stock or
//   duplicate invoices. Those requests fail immediately with a clear
//   error when offline - the frontend (offline-banner.js) shows a banner
//   so this is never a silent failure.

const CACHE_VERSION = 'teps-v5';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const API_CACHE = `${CACHE_VERSION}-api`;

const SHELL_URLS = [
  '/',
  '/index.html',
  '/js/viewport-fix.js',
  '/manifest.json',
  '/img/icon-192.png',
  '/img/icon-512.png',
  '/css/styles.css',
  '/css/pos-screen.css',
  '/js/main.js',
  '/js/api.js',
  '/js/icons.js',
  '/js/router.js',
  '/js/components/shell.js',
  '/js/components/modal.js',
  '/js/toast.js',
  '/js/components/quick-add.js',
  '/js/components/action-menu.js',
  '/js/components/offline-banner.js',
  '/js/components/global-scanner.js',
  '/js/components/install-prompt.js',
  '/js/components/doc-share.js',
  '/js/components/receipt.js',
  '/js/components/doc-print.js',
  '/js/components/bill-share.js',
  '/js/components/zatca.js',
  '/js/components/charts.js',
  '/js/screens/activation.js',
  '/js/screens/login.js',
  '/js/screens/dashboard.js',
  '/js/screens/pos.js',
  '/js/screens/inventory.js',
  '/js/screens/purchases.js',
  '/js/screens/sales-history.js',
  '/js/screens/customers.js',
  '/js/screens/delivery.js',
  '/js/screens/quotations.js',
  '/js/screens/reports.js',
  '/js/screens/settings.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => Promise.all(
        SHELL_URLS.map(url => cache.add(url).catch(() => {
          // Don't let one missing/renamed file block the whole install -
          // log and move on, the rest of the shell still caches.
          console.warn('[SW] could not cache', url);
        }))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith('teps-') && key !== SHELL_CACHE && key !== API_CACHE)
        .map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (!req.url.startsWith(self.location.origin)) return;
  const url = new URL(req.url);

  // Never touch writes - they must go straight to the network and fail
  // loudly (visibly) if there's no connection. Caching/queuing a sale or
  // stock change offline risks corrupting inventory once back online.
  if (req.method !== 'GET') return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(req, API_CACHE));
    return;
  }

  event.respondWith(cacheFirstThenNetwork(req, SHELL_CACHE));
});

async function cacheFirstThenNetwork(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) {
    // Refresh in the background so the next load has the latest version,
    // without making this load wait for the network.
    fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); }).catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    // Navigating to a route we never cached (e.g. deep link) while
    // offline - fall back to the cached app shell so the router can still
    // take over client-side, instead of a blank error page.
    if (req.mode === 'navigate') {
      const shell = await cache.match('/index.html');
      if (shell) return shell;
    }
    return new Response('Offline and this file was not cached yet.', { status: 503 });
  }
}

// Network-first for API data: this app is a live POS - stock levels,
// prices, new sales/quotations/purchases must always reflect what's
// actually on the server the instant you're online. A previous version of
// this file used stale-while-revalidate here (serve the cache immediately,
// refresh in the background) which is wrong for this kind of data: it
// meant a newly added product or purchase would not show up until a
// second, unrelated fetch happened to land after the background refresh -
// in practice, "add something, don't see it until I manually refresh."
// Network-first fixes that: always try the live network first, and only
// fall back to the cached copy if there's genuinely no connection.
async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(req);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Offline - no cached data available for this yet.' }), {
      status: 503, headers: { 'Content-Type': 'application/json' }
    });
  }
}
