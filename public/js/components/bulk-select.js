// Third Eye Computer Solutions - POS System
// BulkSelect: adds checkboxes to a table and a floating toolbar with bulk
// actions (e.g. "Delete Selected") that appears once rows are checked.

const BulkSelect = {
  selected: new Set(),

  reset() {
    this.selected = new Set();
  },

  checkboxHeader() {
    return `<th style="width:36px"><input type="checkbox" class="row-checkbox" id="select-all-checkbox"></th>`;
  },

  checkboxCell(id) {
    return `<td><input type="checkbox" class="row-checkbox row-select" data-id="${id}" ${this.selected.has(id) ? 'checked' : ''}></td>`;
  },

  // toolbarContainerId: element to render the floating bulk toolbar into.
  // onDeleteSelected(ids): called when "Delete Selected" is clicked.
  wire(toolbarContainerId, onDeleteSelected, extraActions = []) {
    const selectAll = document.getElementById('select-all-checkbox');
    const rowCheckboxes = () => Array.from(document.querySelectorAll('.row-select'));

    const renderToolbar = () => {
      const el = document.getElementById(toolbarContainerId);
      if (!el) return;
      if (this.selected.size === 0) {
        el.innerHTML = '';
        return;
      }
      el.innerHTML = `
        <div class="bulk-toolbar">
          <span class="bulk-count">${this.selected.size} selected</span>
          ${extraActions.map(a => `<button class="btn-icon-label" data-bulk-action="${a.key}">${a.icon || ''} ${a.label}</button>`).join('')}
          <button class="btn-icon-label danger" id="bulk-delete-btn">
            <span style="width:16px;height:16px;display:flex">${Icon.trash}</span> Delete Selected
          </button>
          <button class="btn-icon-label" id="bulk-clear-btn" style="margin-left:auto">Clear Selection</button>
        </div>
      `;
      document.getElementById('bulk-delete-btn').addEventListener('click', () => {
        if (confirm(`Delete ${this.selected.size} selected item(s)? This cannot be undone.`)) {
          onDeleteSelected(Array.from(this.selected));
        }
      });
      document.getElementById('bulk-clear-btn').addEventListener('click', () => {
        this.selected.clear();
        rowCheckboxes().forEach(cb => cb.checked = false);
        if (selectAll) selectAll.checked = false;
        renderToolbar();
      });
      extraActions.forEach(a => {
        const btn = el.querySelector(`[data-bulk-action="${a.key}"]`);
        if (btn) btn.addEventListener('click', () => a.onClick(Array.from(this.selected)));
      });
    };

    if (selectAll) {
      selectAll.addEventListener('change', () => {
        rowCheckboxes().forEach(cb => {
          cb.checked = selectAll.checked;
          const id = Number(cb.dataset.id);
          if (selectAll.checked) this.selected.add(id); else this.selected.delete(id);
        });
        renderToolbar();
      });
    }

    rowCheckboxes().forEach(cb => {
      cb.addEventListener('change', () => {
        const id = Number(cb.dataset.id);
        if (cb.checked) this.selected.add(id); else this.selected.delete(id);
        renderToolbar();
      });
    });

    renderToolbar();
  }
};
