// Third Eye Computer Solutions - POS System
// ActionMenu: a single "..." button per table row that opens a clean
// dropdown of actions, instead of cramming many small buttons into one
// table cell (which was overlapping/unreadable on Quotations & Delivery).

const ActionMenu = {
  _openId: null,

  // items: [{ label, icon(optional svg string), onClick, danger(optional bool) }, ...]
  render(rowId, items) {
    return `
      <div class="action-menu" data-row="${rowId}">
        <button type="button" class="action-menu-trigger" data-row="${rowId}" title="Actions">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
        </button>
        <div class="action-menu-list" id="action-menu-${rowId}" style="display:none">
          ${items.map((item, idx) => `
            <button type="button" class="action-menu-item ${item.danger ? 'danger' : ''}" data-row="${rowId}" data-idx="${idx}">
              ${item.icon ? `<span class="action-menu-icon">${item.icon}</span>` : ''}
              <span>${item.label}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  },

  // Call once after rendering a table full of menus. `itemsByRow` maps
  // rowId -> the same items array passed to render() (needed to wire clicks).
  wireAll(itemsByRow) {
    document.querySelectorAll('.action-menu-trigger').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rowId = btn.dataset.row;
        const isOpen = this._openId === rowId;
        this.closeAll();
        if (!isOpen) {
          const menu = document.getElementById(`action-menu-${rowId}`);
          if (menu) {
            menu.style.display = 'block';
            this._openId = rowId;
            this._positionMenu(btn, menu);
          }
        }
      });
    });
    document.querySelectorAll('.action-menu-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rowId = btn.dataset.row;
        const idx = Number(btn.dataset.idx);
        this.closeAll();
        const items = itemsByRow[rowId];
        if (items && items[idx] && items[idx].onClick) items[idx].onClick();
      });
    });
    if (!this._docListenerAdded) {
      document.addEventListener('click', () => this.closeAll());
      window.addEventListener('scroll', () => this.closeAll(), true);
      this._docListenerAdded = true;
    }
  },

  _positionMenu(btn, menu) {
    // Flip upward if there isn't room below, so the menu never runs off
    // the bottom of the viewport on the last rows of a long table.
    const rect = btn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    menu.classList.toggle('flip-up', spaceBelow < 220);
  },

  closeAll() {
    document.querySelectorAll('.action-menu-list').forEach(m => { m.style.display = 'none'; m.classList.remove('flip-up'); });
    this._openId = null;
  }
};
