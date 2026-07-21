// Third Eye Computer Solutions - POS System
// QuickAddSelect: a dropdown + inline "+" button pattern used across the app.
// Type a new name, click "+", it's created via the API and immediately
// selected - no need to leave the form to manage a separate list first.
//
// Usage:
//   QuickAddSelect.render({
//     id: 'p-category',
//     label: 'Category',
//     options: categories,            // array of {id, name}
//     selectedId: product?.categoryId,
//     placeholder: 'No category',
//     createEndpoint: '/categories',  // POST {name} -> returns created record
//     createField: 'name'
//   })
// Then call QuickAddSelect.wire(containerEl, onCreated) after inserting into DOM.

const QuickAddSelect = {
  render({ id, label, options, selectedId, placeholder, required }) {
    return `
      <div class="form-group quick-add-group">
        ${label ? `<label class="form-label">${label}</label>` : ''}
        <div class="quick-add-row">
          <select class="form-select" id="${id}" ${required ? 'required' : ''}>
            ${placeholder ? `<option value="">${escapeHtml(placeholder)}</option>` : ''}
            ${options.map(o => `<option value="${o.id}" ${selectedId === o.id ? 'selected' : ''}>${escapeHtml(o.name)}</option>`).join('')}
          </select>
          <input class="form-input quick-add-input" id="${id}-new" placeholder="New..." style="display:none">
          <button type="button" class="btn-quick-add" id="${id}-toggle-btn" title="Add new">
            <span style="width:16px;height:16px;display:flex">${Icon.plus}</span>
          </button>
        </div>
      </div>
    `;
  },

  // Wires up the toggle/create behavior. createFn receives the typed name and
  // must return a Promise resolving to the created record ({id, name, ...}).
  // onCreated(record) runs after a successful create, to refresh local state.
  wire(id, createFn, onCreated) {
    const select = document.getElementById(id);
    const input = document.getElementById(`${id}-new`);
    const toggleBtn = document.getElementById(`${id}-toggle-btn`);
    if (!select || !input || !toggleBtn) return;

    let adding = false;
    toggleBtn.addEventListener('click', async () => {
      if (!adding) {
        adding = true;
        select.style.display = 'none';
        input.style.display = 'block';
        input.focus();
        toggleBtn.innerHTML = `<span style="width:16px;height:16px;display:flex">${Icon.check}</span>`;
      } else {
        const name = input.value.trim();
        if (!name) {
          // Cancel back to select mode if nothing typed.
          adding = false;
          select.style.display = 'block';
          input.style.display = 'none';
          toggleBtn.innerHTML = `<span style="width:16px;height:16px;display:flex">${Icon.plus}</span>`;
          return;
        }
        toggleBtn.disabled = true;
        try {
          const created = await createFn(name);
          const opt = document.createElement('option');
          opt.value = created.id;
          opt.textContent = created.name || name;
          opt.selected = true;
          select.appendChild(opt);
          select.value = created.id;
          adding = false;
          select.style.display = 'block';
          input.style.display = 'none';
          input.value = '';
          toggleBtn.innerHTML = `<span style="width:16px;height:16px;display:flex">${Icon.plus}</span>`;
          if (onCreated) onCreated(created);
          Toast.success(`"${created.name || name}" added.`);
        } catch (err) {
          Toast.error(err.message);
        }
        toggleBtn.disabled = false;
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); toggleBtn.click(); }
      if (e.key === 'Escape') {
        adding = false;
        select.style.display = 'block';
        input.style.display = 'none';
        input.value = '';
        toggleBtn.innerHTML = `<span style="width:16px;height:16px;display:flex">${Icon.plus}</span>`;
      }
    });
  }
};
