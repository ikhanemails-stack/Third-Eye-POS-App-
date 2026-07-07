// Third Eye POS - Service Worker
// Minimal SW: enables PWA install, but always fetches fresh from server
// (important for POS accuracy - we never want stale cached data)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
self.addEventListener('fetch', event => {
  // Only intercept same-origin requests
  if (event.request.url.startsWith(self.location.origin)) {
    event.respondWith(fetch(event.request).catch(() => {
      // If offline and navigation request, show offline message
      if (event.request.mode === 'navigate') {
        return new Response('<h1>Offline</h1><p>Please connect to the internet to use the POS system.</p>', 
          { headers: { 'Content-Type': 'text/html' } });
      }
    }));
  }
});
