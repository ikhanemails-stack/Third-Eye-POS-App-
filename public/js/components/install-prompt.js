// Third Eye Computer Solutions - POS System
// Shows a visible "Install App" banner so people actually notice they can
// install this as an app on their phone, instead of relying on a small
// icon buried in the browser's address bar that most people never spot.
//
// Two different platforms need two different approaches, handled here:
// - Chrome/Edge/Android: the browser fires `beforeinstallprompt`, which we
//   capture and can trigger on demand from our own button.
// - iOS Safari: Apple does not support `beforeinstallprompt` at all - there
//   is no programmatic install trigger. The only way to install there is
//   the manual Share -> "Add to Home Screen" menu, so for iOS this shows
//   instructions instead of a button that would do nothing.

const InstallPrompt = {
  deferredEvent: null,

  init() {
    if (this.isStandalone()) return; // already installed/running as an app

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredEvent = e;
      if (!this.wasDismissedRecently()) this.showBanner('android');
    });

    window.addEventListener('appinstalled', () => this.hideBanner());

    if (this.isIOS() && !this.wasDismissedRecently()) {
      // No install event on iOS - just show the manual instructions after
      // a short delay so it doesn't compete with the page's first paint.
      setTimeout(() => this.showBanner('ios'), 1500);
    }
  },

  isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  },

  isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  },

  wasDismissedRecently() {
    const dismissedAt = Number(localStorage.getItem('installPromptDismissedAt') || 0);
    return Date.now() - dismissedAt < 14 * 24 * 60 * 60 * 1000; // 14 days
  },

  showBanner(platform) {
    if (document.getElementById('install-banner')) return;
    const el = document.createElement('div');
    el.id = 'install-banner';
    el.className = 'install-banner';
    el.innerHTML = platform === 'ios'
      ? `
        <span class="install-banner-text">Install this app: tap <strong>Share</strong> ⬆️ then <strong>"Add to Home Screen"</strong>.</span>
        <button type="button" class="install-banner-dismiss" id="install-banner-dismiss">${Icon.x}</button>
      `
      : `
        <span class="install-banner-text">Install this app on your phone for a faster, full-screen experience.</span>
        <button type="button" class="btn-icon-label primary" id="install-banner-install">Install App</button>
        <button type="button" class="install-banner-dismiss" id="install-banner-dismiss">${Icon.x}</button>
      `;
    document.body.appendChild(el);

    const installBtn = document.getElementById('install-banner-install');
    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (!this.deferredEvent) return;
        this.deferredEvent.prompt();
        const { outcome } = await this.deferredEvent.userChoice;
        this.deferredEvent = null;
        if (outcome === 'accepted') this.hideBanner();
        else this.dismiss();
      });
    }
    document.getElementById('install-banner-dismiss').addEventListener('click', () => this.dismiss());
  },

  dismiss() {
    localStorage.setItem('installPromptDismissedAt', String(Date.now()));
    this.hideBanner();
  },

  hideBanner() {
    const el = document.getElementById('install-banner');
    if (el) el.remove();
  }
};

document.addEventListener('DOMContentLoaded', () => InstallPrompt.init());
