// Third Eye Computer Solutions - POS System
// Minimal hash-based router.

const Router = {
  routes: {},
  current: null,

  register(path, handler) {
    this.routes[path] = handler;
  },

  navigate(path) {
    window.location.hash = path;
  },

  start() {
    window.addEventListener('hashchange', () => this.resolve());
    this.resolve();
  },

  resolve() {
    let path = window.location.hash.slice(1) || '/dashboard';
    this.current = path;
    const handler = this.routes[path] || this.routes['/dashboard'];
    if (handler) handler();

    // Every screen swap replaces #app's entire innerHTML, which can leave
    // the browser scrolled to wherever the PREVIOUS screen was scrolled to
    // (so the top of the new screen — including nav/buttons — renders off
    // -screen until the user manually scrolls up), and in some in-app
    // WebViews (WhatsApp/Instagram's built-in browser, etc.) can also leave
    // the page at a stale zoom level from before navigation. Reset both on
    // every route change so a tapped link always lands on a fully visible
    // page, not a partially-scrolled/zoomed one.
    window.scrollTo(0, 0);
    if (window.ViewportFix) {
      window.ViewportFix.recommit();
      // The new screen's content is injected synchronously above, but some
      // screens (POS, Dashboard, etc.) load their data with an async
      // Api.get() first and swap in the real content a beat later - a
      // second recommit after that settles catches the resulting reflow.
      setTimeout(window.ViewportFix.recommit, 250);
    }
  }
};
