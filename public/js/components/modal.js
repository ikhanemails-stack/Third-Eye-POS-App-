// Third Eye Computer Solutions - POS System
// Reusable modal dialog helper.

const Modal = {
  open(titleHtml, bodyHtml, opts = {}) {
    this.close();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'active-modal-overlay';
    overlay.innerHTML = `
      <div class="modal ${opts.large ? 'modal-lg' : ''}">
        <div class="modal-header">
          <h3>${titleHtml}</h3>
          <button class="modal-close" id="modal-close-btn">
            <span style="width:18px;height:18px;display:flex">${Icon.x}</span>
          </button>
        </div>
        <div id="modal-body">${bodyHtml}</div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('modal-close-btn').addEventListener('click', () => this.close());
    overlay.addEventListener('click', (e) => { if (e.target === overlay && !opts.persistent) this.close(); });
    // Large forms (e.g. New Purchase) can retrigger the same mobile-WebView
    // mis-scaled-viewport quirk that viewport-fix.js already handles on
    // page load, since a big chunk of new content just got laid out.
    if (window.ViewportFix) setTimeout(() => window.ViewportFix.recommit(), 50);
    return overlay;
  },
  close() {
    const existing = document.getElementById('active-modal-overlay');
    if (existing) existing.remove();
  }
};
