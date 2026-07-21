// Third Eye Computer Solutions - POS System
// SearchableSelect: turns a plain <select> with many options (e.g. every
// product in the catalog) into a fast type-to-filter dropdown. The
// original <select> is kept (just visually hidden) and stays perfectly in
// sync, so any existing code that reads `select.value` or listens for its
// 'change' event keeps working with zero changes elsewhere - only the
// screen that renders the <select> needs one extra call:
//
//   SearchableSelect.enhance('my-select-id', { placeholder: 'Search products...' });
//
// Call this AFTER the <select> (with its <option>s) is already in the DOM.

const SearchableSelect = {
  enhance(selectId, opts = {}) {
    const select = document.getElementById(selectId);
    if (!select || select.dataset.searchEnhanced) return;
    select.dataset.searchEnhanced = '1';

    const readOptions = () => Array.from(select.options)
      .filter(o => o.value !== '')
      .map(o => ({ value: o.value, label: o.textContent }));

    select.style.display = 'none';
    const wrap = document.createElement('div');
    wrap.className = 'searchable-select-wrap';
    wrap.style.position = 'relative';
    if (select.style.flex) wrap.style.flex = select.style.flex;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-input searchable-select-input';
    input.placeholder = opts.placeholder || 'Type to search...';
    input.autocomplete = 'off';
    const current = readOptions().find(o => o.value === select.value);
    input.value = current ? current.label : '';

    const list = document.createElement('div');
    list.className = 'searchable-select-list';
    list.style.display = 'none';

    wrap.appendChild(input);
    wrap.appendChild(list);
    select.insertAdjacentElement('afterend', wrap);

    const renderList = (filter) => {
      const term = (filter || '').toLowerCase();
      const options = readOptions();
      const matches = (term ? options.filter(o => o.label.toLowerCase().includes(term)) : options).slice(0, 60);
      if (matches.length === 0) {
        list.innerHTML = `<div class="searchable-select-empty">No matches.</div>`;
      } else {
        list.innerHTML = matches.map(o =>
          `<div class="searchable-select-item" data-value="${String(o.value).replace(/"/g, '&quot;')}">${escapeHtml(o.label)}</div>`
        ).join('');
        list.querySelectorAll('[data-value]').forEach(el => {
          // mousedown (not click) fires before the input's blur handler
          // hides the list, so the selection registers on both mouse and
          // touch without needing an extra tap.
          el.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const val = el.dataset.value;
            select.value = val;
            const match = options.find(o => String(o.value) === val);
            input.value = match ? match.label : '';
            list.style.display = 'none';
            select.dispatchEvent(new Event('change', { bubbles: true }));
          });
        });
      }
      list.style.display = 'block';
    };

    input.addEventListener('focus', () => renderList(input.value === (current ? current.label : '') ? '' : input.value));
    input.addEventListener('input', () => renderList(input.value));
    input.addEventListener('blur', () => setTimeout(() => { list.style.display = 'none'; }, 150));

    // If something else in the app sets select.value programmatically
    // (e.g. a barcode scan auto-selecting a product), keep the visible
    // text input in sync too.
    select.addEventListener('change', () => {
      const options = readOptions();
      const match = options.find(o => o.value === select.value);
      if (document.activeElement !== input) input.value = match ? match.label : '';
    });
  }
};
