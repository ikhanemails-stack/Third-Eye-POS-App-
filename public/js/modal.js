// Third Eye Computer Solutions - License Manager
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
    return overlay;
  },
  close() {
    const existing = document.getElementById('active-modal-overlay');
    if (existing) existing.remove();
  }
};
