// Third Eye Computer Solutions - POS System
// Listens for barcode-scanner input from ANYWHERE in the app (not just
// while already on the POS screen). A USB/Bluetooth barcode scanner types
// characters far faster than a human (each character arrives within a few
// milliseconds of the last) and finishes with Enter - this tells that
// pattern apart from normal typing, then jumps straight to POS with the
// scanned code.
//
// Honest limit: if you're actively focused inside a text field on another
// screen (typing in a form) when you scan, the scanned characters go into
// that field instead of being captured globally - there's no reliable way
// to tell "fast typing" from "a scanner" while a field already has focus
// without risking breaking normal fast typists. Scanning while just
// browsing a list (nothing focused in a text input) is what gets captured
// and routed to POS.

const GlobalScanner = {
  buffer: '',
  lastKeyTime: 0,
  MAX_GAP_MS: 60,   // real scanners fire keys only a few ms apart
  MIN_LENGTH: 4,     // shortest barcode worth acting on

  init() {
    document.addEventListener('keydown', (e) => this.onKeyDown(e));
  },

  isEditableTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  },

  onKeyDown(e) {
    // Never intercept while the person is typing in a field, editing a
    // modal, or using a keyboard shortcut with a modifier key held.
    if (this.isEditableTarget(document.activeElement)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const now = Date.now();
    const gap = now - this.lastKeyTime;
    this.lastKeyTime = now;

    if (e.key === 'Enter') {
      if (this.buffer.length >= this.MIN_LENGTH) {
        const code = this.buffer;
        this.buffer = '';
        e.preventDefault();
        this.handleScan(code);
      } else {
        this.buffer = '';
      }
      return;
    }

    // A single printable character
    if (e.key.length === 1) {
      if (gap > this.MAX_GAP_MS) this.buffer = ''; // too slow - restart, likely human typing
      this.buffer += e.key;
    }
  },

  handleScan(code) {
    if (Router.current !== '/pos') {
      Router.navigate('/pos');
      // POS mounts asynchronously (fetches products first) - poll briefly
      // for it to be ready rather than guessing a fixed delay.
      let attempts = 0;
      const tryHandoff = () => {
        attempts++;
        if (window.PosScreen && document.getElementById('pos-search')) {
          PosScreen.handleExternalScan(code);
        } else if (attempts < 20) {
          setTimeout(tryHandoff, 100);
        }
      };
      setTimeout(tryHandoff, 100);
    } else if (window.PosScreen) {
      PosScreen.handleExternalScan(code);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => GlobalScanner.init());
