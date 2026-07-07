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
  }
};
