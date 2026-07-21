// Third Eye Computer Solutions - POS System
// Shows a persistent banner when the browser has no connection, so it's
// never a silent surprise that a screen is showing cached data or that a
// checkout/save is about to fail. Disappears automatically when the
// connection comes back.

const OfflineBanner = {
  init() {
    this.render(!navigator.onLine);
    window.addEventListener('online', () => this.render(false));
    window.addEventListener('offline', () => this.render(true));
  },

  render(isOffline) {
    let el = document.getElementById('offline-banner');
    if (!isOffline) {
      if (el) el.remove();
      document.body.classList.remove('is-offline');
      return;
    }
    if (el) return; // already showing
    el = document.createElement('div');
    el.id = 'offline-banner';
    el.innerHTML = `You're offline - showing the last data this device saved. New sales, edits and deletes will fail until the connection is back.`;
    document.body.appendChild(el);
    document.body.classList.add('is-offline');
  }
};

document.addEventListener('DOMContentLoaded', () => OfflineBanner.init());
