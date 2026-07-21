// Third Eye Computer Solutions - POS System
// FormDraft: autosaves a form's field values to localStorage as the person
// types, and can restore them the next time that same form is opened - so
// an accidental page refresh, browser back, or closed tab doesn't wipe out
// a half-filled form. Restored drafts are cleared automatically once the
// form is actually submitted successfully.
//
// Usage inside a screen's "open modal" function, right after the form HTML
// has been inserted into the DOM:
//
//   const draft = FormDraft.watch('product-add', 'product-form');
//   // ...bind your submit handler, and on success:
//   FormDraft.clear('product-add');
//
// `watch` both restores any existing draft immediately AND wires up
// autosave going forward, so one call covers both directions.

const FormDraft = {
  _prefix: 'formDraft:',
  _timers: {},

  _key(name) { return this._prefix + name; },

  // Reads every input/select/textarea with an id inside formEl and returns
  // a plain {id: value} map. Checkboxes use their checked state.
  _snapshot(formEl) {
    const data = {};
    formEl.querySelectorAll('[id]').forEach(el => {
      if (!el.id) return;
      if (el.type === 'file') return; // can't be restored from localStorage
      if (el.type === 'checkbox' || el.type === 'radio') data[el.id] = el.checked;
      else data[el.id] = el.value;
    });
    return data;
  },

  _apply(formEl, data) {
    Object.keys(data).forEach(id => {
      const el = formEl.querySelector(`#${CSS.escape(id)}`);
      if (!el) return;
      if (el.type === 'checkbox' || el.type === 'radio') el.checked = !!data[id];
      else el.value = data[id];
      // Let anything listening for input/change (photo previews, dropdown
      // sync, etc.) know the field changed so the UI reflects the restore.
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  },

  // Restores any saved draft for `name` into the given form element (by id
  // or the element itself), then starts autosaving future changes. Returns
  // true if a draft was found and restored.
  watch(name, formEl, opts = {}) {
    const form = typeof formEl === 'string' ? document.getElementById(formEl) : formEl;
    if (!form) return false;
    let restored = false;
    try {
      const raw = localStorage.getItem(this._key(name));
      if (raw) {
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          this._apply(form, data);
          restored = true;
          if (!opts.silent && typeof Toast !== 'undefined') {
            Toast.info('Restored your unsaved changes from before.');
          }
        }
      }
    } catch (e) { /* corrupted draft - ignore and start fresh */ }

    const save = () => {
      clearTimeout(this._timers[name]);
      this._timers[name] = setTimeout(() => {
        try { localStorage.setItem(this._key(name), JSON.stringify(this._snapshot(form))); }
        catch (e) { /* storage may be full/unavailable - not fatal */ }
      }, 250);
    };
    form.addEventListener('input', save);
    form.addEventListener('change', save);
    return restored;
  },

  clear(name) {
    clearTimeout(this._timers[name]);
    try { localStorage.removeItem(this._key(name)); } catch (e) { /* ignore */ }
  }
};
