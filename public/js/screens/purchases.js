// Third Eye Computer Solutions - POS System
// Purchases module screen - record stock-in from suppliers.

const PurchasesScreen = {
  purchases: [],
  suppliers: [],
  products: [],
  draftItems: [],
  searchTerm: '',
  supplierFilter: '',

  async render() {
    Shell.mount('/purchases', `<div class="empty-state">Loading purchases...</div>`);
    try {
      [this.purchases, this.suppliers, this.products] = await Promise.all([
        Api.get('/purchases'),
        Api.get('/suppliers'),
        Api.get('/products')
      ]);
    } catch (err) {
      Toast.error(err.message);
      return;
    }
    this.searchTerm = '';
    this.supplierFilter = '';
    this.renderScreen();
  },

  renderScreen() {
    const settings = App.settings;
    const term = this.searchTerm.trim().toLowerCase();
    const filtered = this.purchases.filter(p => {
      const supplier = this.suppliers.find(s => s.id === p.supplierId);
      if (this.supplierFilter && p.supplierId !== Number(this.supplierFilter)) return false;
      if (!term) return true;
      return (supplier?.name || '').toLowerCase().includes(term) || (p.note || '').toLowerCase().includes(term);
    });
    const content = `
      <div class="page-header">
        <div>
          <h1>Purchases</h1>
          <div class="page-subtitle">Record stock received from suppliers</div>
        </div>
        <div style="display:flex;gap:10px">
          <button class="btn btn-outline" id="manage-suppliers-btn">Suppliers</button>
          <button class="btn btn-gold" id="new-purchase-btn">
            <span style="width:16px;height:16px;display:flex">${Icon.plus}</span> New Purchase
          </button>
        </div>
      </div>

      <div class="toolbar-row">
        <input class="form-input" id="purchase-search" placeholder="Search by supplier or note..." value="${escapeHtml(this.searchTerm)}" style="max-width:280px">
        <select class="form-select" id="purchase-supplier-filter" style="max-width:220px">
          <option value="">All Suppliers</option>
          ${this.suppliers.map(s => `<option value="${s.id}" ${String(this.supplierFilter) === String(s.id) ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
        </select>
        <span style="color:var(--text-muted);font-size:0.82rem">${filtered.length} of ${this.purchases.length} purchases</span>
      </div>

      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Supplier</th><th>Items</th><th>Total</th><th>Note</th><th>Invoice</th><th>Actions</th></tr></thead>
          <tbody>
            ${filtered.length === 0 ? `<tr><td colspan="7"><div class="empty-state"><p>${this.purchases.length === 0 ? 'No purchases recorded yet.' : 'No purchases match your search.'}</p></div></td></tr>` : filtered.map(p => {
              const supplier = this.suppliers.find(s => s.id === p.supplierId);
              return `
              <tr>
                <td>${formatDateTime(p.createdAt)}</td>
                <td>${supplier ? escapeHtml(supplier.name) : '<span style="color:var(--text-muted)">-</span>'}</td>
                <td><a href="#" class="view-purchase-link" data-id="${p.id}" style="color:var(--navy-700);text-decoration:underline">View items</a></td>
                <td>${formatMoney(p.total, settings)}</td>
                <td>${escapeHtml(p.note || '-')}</td>
                <td>${p.hasAttachment
                  ? `<a href="#" class="view-attachment-link" data-id="${p.id}" title="View attached invoice/receipt" style="display:inline-flex;align-items:center;gap:4px;color:var(--navy-700)">📎 View</a>`
                  : '<span style="color:var(--text-muted);font-size:0.78rem">-</span>'}</td>
                <td>
                  <button class="row-action row-action-edit edit-purchase-btn" data-id="${p.id}" title="Edit">${Icon.edit}</button>
                  <button class="row-action row-action-delete del-purchase-btn" data-id="${p.id}" title="Delete">${Icon.trash}</button>
                </td>

              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
    document.getElementById('content').innerHTML = content;
    document.getElementById('new-purchase-btn').addEventListener('click', () => this.openNewPurchaseModal());
    document.getElementById('manage-suppliers-btn').addEventListener('click', () => this.openSuppliersModal());
    document.getElementById('purchase-search').addEventListener('input', (e) => {
      this.searchTerm = e.target.value;
      clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(() => {
        const cursorPos = e.target.selectionStart;
        this.renderScreen();
        const newInput = document.getElementById('purchase-search');
        if (newInput) { newInput.focus(); newInput.setSelectionRange(cursorPos, cursorPos); }
      }, 200);
    });
    document.getElementById('purchase-supplier-filter').addEventListener('change', (e) => {
      this.supplierFilter = e.target.value;
      this.renderScreen();
    });
    document.querySelectorAll('.view-purchase-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        this.viewPurchase(Number(link.dataset.id));
      });
    });
    document.querySelectorAll('.edit-purchase-btn').forEach(btn => {
      btn.addEventListener('click', () => this.editPurchase(Number(btn.dataset.id)));
    });
    document.querySelectorAll('.view-attachment-link').forEach(link => {
      link.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          const attachment = await Api.get(`/purchases/${link.dataset.id}/attachment`);
          this.openAttachmentPreview(attachment);
        } catch (err) { Toast.error(err.message); }
      });
    });
    document.querySelectorAll('.del-purchase-btn').forEach(btn => {
      btn.addEventListener('click', () => this.deletePurchase(Number(btn.dataset.id)));
    });
  },

  async editPurchase(id) {
    try {
      const purchase = await Api.get(`/purchases/${id}`);
      this.openNewPurchaseModal(purchase);
    } catch (err) {
      Toast.error(err.message);
    }
  },

  async deletePurchase(id) {
    if (!confirm('Delete this purchase? The stock it added will be reversed. This cannot be undone.')) return;
    try {
      await Api.del(`/purchases/${id}`);
      Toast.success('Purchase deleted and stock reversed.');
      [this.purchases, this.products] = await Promise.all([Api.get('/purchases'), Api.get('/products')]);
      this.renderScreen();
    } catch (err) {
      Toast.error(err.message);
    }
  },

  async viewPurchase(id) {
    try {
      const purchase = await Api.get(`/purchases/${id}`);
      Modal.open(`Purchase #${purchase.id}`, `
        <div class="table-wrap" style="box-shadow:none">
          <table>
            <thead><tr><th>Product</th><th>Qty</th><th>Cost</th><th>Total</th></tr></thead>
            <tbody>
              ${purchase.items.map(i => `
                <tr>
                  <td>${escapeHtml(i.productName)}</td>
                  <td>${i.quantity}</td>
                  <td>${formatMoney(i.costPrice, App.settings)}</td>
                  <td>${formatMoney(i.lineTotal, App.settings)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ${purchase.attachment ? `
          <div style="margin-top:14px">
            <button type="button" class="btn-icon-label" id="view-attached-invoice-btn">📎 View attached invoice/receipt (${escapeHtml(purchase.attachment.name)})</button>
          </div>
        ` : ''}
      `);
      const viewBtn = document.getElementById('view-attached-invoice-btn');
      if (viewBtn) viewBtn.addEventListener('click', () => this.openAttachmentPreview(purchase.attachment));
    } catch (err) {
      Toast.error(err.message);
    }
  },

  // Shows an attached vendor-invoice file (image inline, PDF/other in a new
  // tab) - this is the "proof of goods received" the strategy report asked
  // for, so a purchase price can be double-checked against the real invoice.
  openAttachmentPreview(attachment) {
    if (!attachment) return;
    const isImage = /^data:image\//.test(attachment.dataUrl);
    if (isImage) {
      Modal.open(escapeHtml(attachment.name || 'Attachment'), `
        <div style="text-align:center">
          <img src="${attachment.dataUrl}" alt="${escapeHtml(attachment.name || '')}" style="max-width:100%;max-height:70vh;border-radius:6px">
          <div style="margin-top:12px">
            <a href="${attachment.dataUrl}" download="${escapeHtml(attachment.name || 'invoice')}" class="btn btn-outline btn-sm">Download</a>
          </div>
        </div>
      `, { large: true });
    } else {
      const win = window.open();
      if (win) {
        win.document.write(`<iframe src="${attachment.dataUrl}" style="border:0;width:100%;height:100vh"></iframe>`);
      } else {
        Toast.error('Please allow pop-ups to view the attachment, or use the Download link.');
      }
    }
  },

  openNewPurchaseModal(existingPurchase) {
    const editing = !!existingPurchase;
    // Attachment state for this modal session: the scanned/photographed
    // vendor invoice, kept as {name, dataUrl}. null = no attachment.
    this.draftAttachment = editing ? (existingPurchase.attachment || null) : null;
    this.draftRemoveAttachment = false;
    // Persisted across re-renders (e.g. whenever an item is added/removed)
    // so picking a supplier doesn't get thrown away the moment you add a
    // product to the purchase - previously render() always recomputed the
    // selected supplier from the original existingPurchase snapshot.
    this.draftSupplierId = editing ? (existingPurchase.supplierId || '') : '';
    this.draftNote = editing ? (existingPurchase.note || '') : '';
    const render = () => `
      ${QuickAddSelect.render({ id: 'purchase-supplier', label: 'Supplier (optional)', options: this.suppliers, placeholder: 'No supplier', selectedId: this.draftSupplierId ? Number(this.draftSupplierId) : null })}
      <div class="form-group">
        <label class="form-label">Add Item</label>
        <div style="position:relative;margin-bottom:6px">
          <input class="form-input" id="purchase-barcode" placeholder="Scan barcode or type to search product..." autocomplete="off">
          <div id="barcode-results" style="position:absolute;left:0;right:0;top:100%;z-index:5;max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;background:var(--surface,#fff);box-shadow:0 8px 20px rgba(10,24,35,0.12);display:none;margin-top:4px"></div>
        </div>
        <div style="display:flex;gap:8px">
          <select class="form-select" id="purchase-product-select" style="flex:2">
            <option value="">Select product...</option>
            ${this.products.map(p => `<option value="${p.id}">${escapeHtml(p.name)}${p.barcode ? ` [${p.barcode}]` : ''}</option>`).join('')}
          </select>
          <input class="form-input" id="purchase-qty" type="number" placeholder="Qty" style="flex:1" min="1">
          <input class="form-input" id="purchase-cost" type="number" step="0.001" placeholder="Cost" style="flex:1">
          <button class="btn btn-primary btn-sm" id="add-item-btn">Add</button>
        </div>
        <button type="button" class="btn-icon-label" id="new-product-toggle-btn" style="margin-top:8px">${Icon.plus} Product not in the list? Create it here</button>
        <div id="new-product-inline-form" style="display:none;margin-top:10px;padding:12px;border:1px solid var(--border);border-radius:8px;background:var(--bg-subtle,#f8f8f8)">
          <div class="form-row">
            <div class="form-group" style="margin-bottom:8px">
              <label class="form-label">Product Name</label>
              <input class="form-input" id="np-name" placeholder="Product name">
            </div>
            <div class="form-group" style="margin-bottom:8px">
              <label class="form-label">Barcode (optional)</label>
              <input class="form-input" id="np-barcode" placeholder="Scan or type">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="margin-bottom:8px">
              <label class="form-label">Sell Price (${escapeHtml(App.settings.currency || 'BHD')})</label>
              <input class="form-input" id="np-sell" type="number" step="0.001" placeholder="0.000">
            </div>
            <div class="form-group" style="margin-bottom:8px">
              <label class="form-label">Cost Price (${escapeHtml(App.settings.currency || 'BHD')})</label>
              <input class="form-input" id="np-cost" type="number" step="0.001" placeholder="0.000">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="margin-bottom:8px">
              <label class="form-label">Unit</label>
              <input class="form-input" id="np-unit" value="pcs">
            </div>
            <div class="form-group" style="margin-bottom:8px">
              <label class="form-label">Expiry Date (optional)</label>
              <input class="form-input" id="np-expiry" type="date">
            </div>
          </div>
          <div class="form-group product-photo-group" style="margin-bottom:8px">
            <label class="form-label">Product Photo (optional)</label>
            <input type="hidden" id="np-photo" value="">
            <div class="product-photo-row">
              <div class="product-photo-preview" id="np-photo-preview">
                <span class="product-photo-placeholder">📦</span>
              </div>
              <div class="product-photo-actions">
                <button type="button" class="btn-icon-label" id="np-search-photo-btn">🔍 Search Photo Online</button>
                <label class="btn-icon-label" style="cursor:pointer">
                  📤 Upload From Device
                  <input type="file" id="np-photo-upload-input" accept="image/*" style="display:none">
                </label>
                <button type="button" class="btn-icon-label danger" id="np-remove-photo-btn" style="display:none">🗑 Remove Photo</button>
              </div>
            </div>
            <div id="np-photo-search-box" style="display:none">
              <div style="display:flex;gap:8px;margin-top:10px">
                <input class="form-input" id="np-photo-search-input" placeholder="Search product name for photos...">
                <button type="button" class="btn btn-outline btn-sm" id="np-run-photo-search-btn">Search</button>
              </div>
              <div id="np-photo-results-grid" class="photo-results-grid"></div>
            </div>
          </div>
          <button type="button" class="btn btn-gold btn-sm" id="save-new-product-btn">Create &amp; Select Product</button>
        </div>
      </div>
      <div id="draft-items-list" style="margin:14px 0">
        ${this.draftItems.length === 0 ? '<p style="color:var(--text-muted);font-size:0.85rem">No items added yet.</p>' : `
        <div class="table-wrap" style="box-shadow:none">
          <table>
            <thead><tr><th>Product</th><th>Qty</th><th>Cost</th><th>Total</th><th></th></tr></thead>
            <tbody>
              ${this.draftItems.map((item, idx) => `
                <tr>
                  <td>${escapeHtml(item.productName)}</td>
                  <td>${item.quantity}</td>
                  <td>${formatMoneyPlain(item.costPrice, App.settings)}</td>
                  <td>${formatMoneyPlain(item.quantity * item.costPrice, App.settings)}</td>
                  <td><button class="row-action row-action-delete remove-draft-item" data-idx="${idx}">${Icon.x}</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`}
      </div>
      <div class="form-group">
        <label class="form-label">Note</label>
        <input class="form-input" id="purchase-note" placeholder="Optional note" value="${escapeHtml(this.draftNote || '')}">
      </div>
      <div class="form-group">
        <label class="form-label">Invoice / Receipt Attachment (optional)</label>
        <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:6px">
          Photo or PDF of the supplier's invoice - proof of what was actually received. Max 6MB.
        </div>
        ${this.draftAttachment ? `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg-subtle,#f5f5f5);border-radius:6px;margin-bottom:8px">
            <span style="flex:1;font-size:0.85rem">📎 ${escapeHtml(this.draftAttachment.name)}</span>
            <button type="button" class="btn btn-outline btn-sm" id="preview-attachment-btn">Preview</button>
            <button type="button" class="btn btn-outline btn-sm" id="remove-attachment-btn">Remove</button>
          </div>
        ` : ''}
        <input type="file" class="form-input" id="purchase-attachment-input" accept="image/*,.pdf">
      </div>
      <button class="btn btn-gold" id="save-purchase-btn" style="width:100%;justify-content:center;padding:12px" ${this.draftItems.length === 0 ? 'disabled' : ''}>
        ${editing ? 'Save Changes' : 'Save Purchase'}
      </button>
    `;

    Modal.open(editing ? `Edit Purchase #${existingPurchase.id}` : 'New Purchase', render(), { large: true });
    QuickAddSelect.wire('purchase-supplier', (name) => Api.post('/suppliers', { name }), (created) => {
      this.suppliers.push(created);
    });
    this.wirePurchaseModal(render, editing ? existingPurchase.id : null);

    // This is what makes newly-created products (from POS, Products, or
    // another tab) actually show up here: the modal opens instantly with
    // whatever was already in memory, then this quietly fetches the
    // latest products/suppliers in the background and re-renders the
    // dropdowns in place - without losing anything already typed/added -
    // the moment fresher data arrives.
    Promise.all([Api.get('/products'), Api.get('/suppliers')]).then(([products, suppliers]) => {
      this.products = products;
      this.suppliers = suppliers;
      if (document.getElementById('active-modal-overlay')) this.rerenderPurchaseModal(render, editing ? existingPurchase.id : null);
    }).catch(() => { /* modal still works fine with what it already had */ });
  },

  // Captures the live supplier/note field values before a re-render so
  // they aren't lost when the modal body is rebuilt (e.g. after adding an
  // item). This is the fix for supplier silently reverting to "No
  // supplier" whenever a product was added to the purchase.
  captureDraftFormState() {
    const supplierEl = document.getElementById('purchase-supplier');
    if (supplierEl) this.draftSupplierId = supplierEl.value || '';
    const noteEl = document.getElementById('purchase-note');
    if (noteEl) this.draftNote = noteEl.value;
  },

  rerenderPurchaseModal(render, editingId) {
    this.captureDraftFormState();
    document.getElementById('modal-body').innerHTML = render();
    QuickAddSelect.wire('purchase-supplier', (name) => Api.post('/suppliers', { name }), (created) => {
      this.suppliers.push(created);
    });
    this.wirePurchaseModal(render, editingId);
  },

  wirePurchaseModal(render, editingId) {
    // Live product search - matches as you type, no separate "Search"
    // click or waiting for Enter required. Scanning a barcode still works
    // the same way (the scanner just types fast + sends Enter), and Enter
    // on an exact barcode match still auto-selects it directly.
    const barcodeInput = document.getElementById('purchase-barcode');
    const resultsDiv = document.getElementById('barcode-results');
    const selectProduct = (product) => {
      const select = document.getElementById('purchase-product-select');
      select.value = product.id;
      select.dispatchEvent(new Event('change'));
      resultsDiv.style.display = 'none';
      resultsDiv.innerHTML = '';
      barcodeInput.value = '';
      const qtyInput = document.getElementById('purchase-qty');
      if (qtyInput) { if (!qtyInput.value) qtyInput.value = 1; qtyInput.focus(); qtyInput.select(); }
    };
    const showResults = () => {
      const raw = barcodeInput.value.trim();
      const q = raw.toLowerCase();
      if (!q) { resultsDiv.style.display = 'none'; resultsDiv.innerHTML = ''; return; }
      const matches = this.products.filter(p =>
        (p.barcode && p.barcode.toLowerCase().includes(q)) || p.name.toLowerCase().includes(q)
      ).slice(0, 8);
      if (matches.length === 0) {
        resultsDiv.innerHTML = `
          <div style="padding:10px 12px">
            <div style="color:var(--danger,#c0392b);font-size:0.82rem;margin-bottom:8px">No product found for "${escapeHtml(raw)}".</div>
            <button type="button" class="btn btn-gold btn-sm" id="create-from-noresult-btn" style="width:100%">+ Create "${escapeHtml(raw)}" as a new product</button>
          </div>
        `;
        resultsDiv.style.display = 'block';
        const createBtn = document.getElementById('create-from-noresult-btn');
        if (createBtn) {
          createBtn.addEventListener('click', () => {
            const inlineForm = document.getElementById('new-product-inline-form');
            inlineForm.style.display = 'block';
            resultsDiv.style.display = 'none';
            // If it's numeric-looking it's almost certainly a scanned barcode,
            // not a typed name - prefill the right field either way.
            if (/^\d{6,}$/.test(raw)) {
              document.getElementById('np-barcode').value = raw;
              document.getElementById('np-name').focus();
            } else {
              document.getElementById('np-name').value = raw;
              document.getElementById('np-sell').focus();
            }
          });
        }
        return;
      }
      resultsDiv.innerHTML = matches.map(p => `
        <div class="purchase-search-result" data-id="${p.id}" style="padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;font-size:0.85rem">
          <span>${escapeHtml(p.name)}${p.barcode ? ` <span style="color:var(--text-muted);font-size:0.76rem">[${escapeHtml(p.barcode)}]</span>` : ''}</span>
          <span style="font-family:var(--font-mono);font-weight:600;color:var(--text-muted);font-size:0.78rem">cost ${formatMoneyPlain(p.costPrice || 0, App.settings)}</span>
        </div>
      `).join('');
      resultsDiv.style.display = 'block';
      resultsDiv.querySelectorAll('.purchase-search-result').forEach(row => {
        row.addEventListener('mouseenter', () => row.style.background = 'var(--surface-raised, var(--gold-100))');
        row.addEventListener('mouseleave', () => row.style.background = '');
        row.addEventListener('click', () => {
          const product = this.products.find(p => p.id === Number(row.dataset.id));
          if (product) selectProduct(product);
        });
      });
    };
    if (barcodeInput) {
      barcodeInput.addEventListener('input', showResults);
      barcodeInput.addEventListener('focus', () => { if (barcodeInput.value.trim()) showResults(); });
      barcodeInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const raw = barcodeInput.value.trim();
        if (!raw) return;
        const exact = this.products.find(p => p.barcode === raw);
        if (exact) { selectProduct(exact); return; }
        const matches = this.products.filter(p =>
          (p.barcode && p.barcode.toLowerCase().includes(raw.toLowerCase())) || p.name.toLowerCase().includes(raw.toLowerCase())
        );
        if (matches.length === 1) selectProduct(matches[0]);
        else showResults();
      });
      document.addEventListener('click', (e) => {
        if (!e.target.closest('#barcode-results') && e.target.id !== 'purchase-barcode') {
          if (resultsDiv) resultsDiv.style.display = 'none';
        }
      });
    }

    // Selecting an existing product autofills its current cost price, so
    // you're not retyping a number that's already in the system - only
    // needed for genuinely new stock where the cost actually changed.
    const productSelect = document.getElementById('purchase-product-select');
    if (productSelect) {
      productSelect.addEventListener('change', () => {
        const product = this.products.find(p => p.id === Number(productSelect.value));
        const costInput = document.getElementById('purchase-cost');
        if (product && costInput) costInput.value = product.costPrice || 0;
      });
      SearchableSelect.enhance('purchase-product-select', { placeholder: 'Select product...' });
    }

    const toggleBtn = document.getElementById('new-product-toggle-btn');
    const inlineForm = document.getElementById('new-product-inline-form');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const showing = inlineForm.style.display !== 'none';
        inlineForm.style.display = showing ? 'none' : 'block';
        if (!showing) document.getElementById('np-name').focus();
      });
    }

    // Photo: search online or upload from device - same mechanism as the
    // Products module, just namespaced with np- so it can't collide if a
    // Products modal happened to be open at the same time.
    const npSetPhoto = (url) => {
      document.getElementById('np-photo').value = url || '';
      document.getElementById('np-photo-preview').innerHTML = url
        ? `<img src="${escapeHtml(url)}" alt="Product photo">`
        : `<span class="product-photo-placeholder">📦</span>`;
      document.getElementById('np-remove-photo-btn').style.display = url ? '' : 'none';
    };
    const npRemovePhotoBtn = document.getElementById('np-remove-photo-btn');
    if (npRemovePhotoBtn) npRemovePhotoBtn.addEventListener('click', () => npSetPhoto(''));
    const npPhotoUpload = document.getElementById('np-photo-upload-input');
    if (npPhotoUpload) {
      npPhotoUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (ev) => { npSetPhoto(ev.target.result); Toast.success('Photo uploaded.'); };
        reader.readAsDataURL(file);
      });
    }
    const npPhotoSearchBox = document.getElementById('np-photo-search-box');
    const npSearchPhotoBtn = document.getElementById('np-search-photo-btn');
    if (npSearchPhotoBtn) {
      npSearchPhotoBtn.addEventListener('click', () => {
        const showing = npPhotoSearchBox.style.display !== 'none';
        npPhotoSearchBox.style.display = showing ? 'none' : 'block';
        if (!showing) document.getElementById('np-photo-search-input').value = document.getElementById('np-name').value.trim();
      });
    }
    const npRunPhotoSearch = async () => {
      const q = document.getElementById('np-photo-search-input').value.trim();
      if (!q) { Toast.error('Type a product name to search.'); return; }
      const grid = document.getElementById('np-photo-results-grid');
      grid.innerHTML = `<div class="empty-state" style="padding:16px;grid-column:1/-1">Searching online product databases...</div>`;
      try {
        const { results } = await Api.get(`/products/image-search?q=${encodeURIComponent(q)}`);
        if (!results || results.length === 0) {
          grid.innerHTML = `<div class="empty-state" style="padding:16px;grid-column:1/-1">No photos found. Try a different search term, or upload one.</div>`;
          return;
        }
        grid.innerHTML = results.map((r, i) => `
          <button type="button" class="photo-result-thumb" data-idx="${i}" title="${escapeHtml(r.name || 'Use this photo')}">
            <img src="${escapeHtml(r.photo)}" alt="${escapeHtml(r.name || '')}">
          </button>
        `).join('');
        grid.querySelectorAll('.photo-result-thumb').forEach(btn => {
          btn.addEventListener('click', () => {
            npSetPhoto(results[Number(btn.dataset.idx)].photo);
            npPhotoSearchBox.style.display = 'none';
            Toast.success('Photo selected.');
          });
        });
      } catch (err) {
        grid.innerHTML = `<div class="empty-state" style="padding:16px;grid-column:1/-1">Image search failed: ${escapeHtml(err.message)}</div>`;
      }
    };
    const npRunPhotoSearchBtn = document.getElementById('np-run-photo-search-btn');
    if (npRunPhotoSearchBtn) npRunPhotoSearchBtn.addEventListener('click', npRunPhotoSearch);
    const npPhotoSearchInput = document.getElementById('np-photo-search-input');
    if (npPhotoSearchInput) npPhotoSearchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); npRunPhotoSearch(); } });

    const saveNewProductBtn = document.getElementById('save-new-product-btn');
    if (saveNewProductBtn) {
      saveNewProductBtn.addEventListener('click', async () => {
        const name = document.getElementById('np-name').value.trim();
        const sellPrice = Number(document.getElementById('np-sell').value);
        const costPrice = Number(document.getElementById('np-cost').value) || 0;
        if (!name) { Toast.error('Enter a product name.'); return; }
        if (!sellPrice || sellPrice <= 0) { Toast.error('Enter a sell price.'); return; }
        try {
          const created = await Api.post('/products', {
            name,
            barcode: document.getElementById('np-barcode').value.trim(),
            unit: document.getElementById('np-unit').value.trim() || 'pcs',
            sellPrice,
            costPrice,
            stock: 0,
            vatApplicable: true,
            expiryDate: document.getElementById('np-expiry').value ? new Date(document.getElementById('np-expiry').value).toISOString() : null,
            photo: document.getElementById('np-photo').value || ''
          });
          this.products.push(created);
          Toast.success(`"${created.name}" created and added to your Products catalog - now add it to this purchase below.`);
          this.rerenderPurchaseModal(render, editingId);
          const newSelect = document.getElementById('purchase-product-select');
          newSelect.value = created.id;
          newSelect.dispatchEvent(new Event('change'));
          const costInput = document.getElementById('purchase-cost');
          if (costInput) costInput.value = costPrice;
        } catch (err) { Toast.error(err.message); }
      });
    }

    document.getElementById('add-item-btn').addEventListener('click', () => {
      const select = document.getElementById('purchase-product-select');
      const productId = Number(select.value);
      const qty = Number(document.getElementById('purchase-qty').value);
      const cost = Number(document.getElementById('purchase-cost').value);
      if (!productId || !qty || cost === undefined || isNaN(cost)) {
        Toast.error('Select a product, quantity, and cost.');
        return;
      }
      const product = this.products.find(p => p.id === productId);
      this.draftItems.push({ productId, productName: product.name, quantity: qty, costPrice: cost });
      this.rerenderPurchaseModal(render, editingId);
    });

    document.querySelectorAll('.remove-draft-item').forEach(btn => {
      btn.addEventListener('click', () => {
        this.draftItems.splice(Number(btn.dataset.idx), 1);
        this.rerenderPurchaseModal(render, editingId);
      });
    });

    const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024;
    const attachmentInput = document.getElementById('purchase-attachment-input');
    if (attachmentInput) {
      attachmentInput.addEventListener('change', () => {
        const file = attachmentInput.files[0];
        if (!file) return;
        if (file.size > MAX_ATTACHMENT_BYTES) {
          Toast.error('File is too large. Please use a file under 6MB.');
          attachmentInput.value = '';
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          this.draftAttachment = { name: file.name, dataUrl: reader.result };
          this.draftRemoveAttachment = false;
          this.rerenderPurchaseModal(render, editingId);
        };
        reader.onerror = () => Toast.error('Could not read that file.');
        reader.readAsDataURL(file);
      });
    }
    const previewBtn = document.getElementById('preview-attachment-btn');
    if (previewBtn) {
      previewBtn.addEventListener('click', () => this.openAttachmentPreview(this.draftAttachment));
    }
    const removeBtn = document.getElementById('remove-attachment-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        this.draftAttachment = null;
        this.draftRemoveAttachment = true;
        this.rerenderPurchaseModal(render, editingId);
      });
    }

    const saveBtn = document.getElementById('save-purchase-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        this.captureDraftFormState();
        const supplierId = Number(this.draftSupplierId) || null;
        const note = (this.draftNote || '').trim();
        const payload = { supplierId, items: this.draftItems, note };
        if (this.draftAttachment) payload.attachment = this.draftAttachment;
        if (this.draftRemoveAttachment) payload.removeAttachment = true;
        try {
          if (editingId) {
            await Api.put(`/purchases/${editingId}`, payload);
            Toast.success('Purchase updated and stock adjusted.');
          } else {
            await Api.post('/purchases', payload);
            Toast.success('Purchase saved and stock updated.');
          }
          Modal.close();
          [this.purchases, this.products] = await Promise.all([Api.get('/purchases'), Api.get('/products')]);
          this.renderScreen();
        } catch (err) {
          Toast.error(err.message);
        }
      });
    }
  },

  openSuppliersModal() {
    const render = () => `
      <div style="margin-bottom:16px">
        ${this.suppliers.map(s => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border)">
            <div>
              <div style="font-weight:600">${escapeHtml(s.name)}</div>
              <div style="font-size:0.78rem;color:var(--text-muted)">${escapeHtml(s.phone || '')}</div>
            </div>
            <div>
              <button class="row-action row-action-edit edit-supplier-btn" data-id="${s.id}">${Icon.edit}</button>
              <button class="row-action row-action-delete del-supplier-btn" data-id="${s.id}">${Icon.trash}</button>
            </div>
          </div>
        `).join('') || '<p style="color:var(--text-muted);font-size:0.85rem">No suppliers yet.</p>'}
      </div>
      <form id="supplier-form">
        <div class="form-row">
          <input class="form-input" id="new-sup-name" placeholder="Supplier name" required>
          <input class="form-input" id="new-sup-phone" placeholder="Phone">
        </div>
        <button type="submit" class="btn btn-primary" style="margin-top:10px;width:100%;justify-content:center">Add Supplier</button>
      </form>
    `;
    Modal.open('Manage Suppliers', render(), { large: true });
    const wire = () => {
      document.getElementById('supplier-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('new-sup-name').value.trim();
        const phone = document.getElementById('new-sup-phone').value.trim();
        if (!name) return;
        try {
          await Api.post('/suppliers', { name, phone });
          this.suppliers = await Api.get('/suppliers');
          document.getElementById('modal-body').innerHTML = render();
          wire();
        } catch (err) { Toast.error(err.message); }
      });
      document.querySelectorAll('.edit-supplier-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const supplier = this.suppliers.find(s => s.id === Number(btn.dataset.id));
          this.openEditSupplierModal(supplier, render);
        });
      });
      document.querySelectorAll('.del-supplier-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this supplier?')) return;
          try {
            await Api.del(`/suppliers/${btn.dataset.id}`);
            this.suppliers = await Api.get('/suppliers');
            document.getElementById('modal-body').innerHTML = render();
            wire();
          } catch (err) { Toast.error(err.message); }
        });
      });
    };
    wire();
  },

  openEditSupplierModal(supplier, parentRender) {
    Modal.open('Edit Supplier', `
      <form id="edit-supplier-form">
        <div class="form-group">
          <label class="form-label">Supplier Name</label>
          <input class="form-input" id="edit-sup-name" value="${escapeHtml(supplier.name)}" required>
        </div>
        <div class="form-group">
          <label class="form-label">Phone</label>
          <input class="form-input" id="edit-sup-phone" value="${escapeHtml(supplier.phone || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input class="form-input" id="edit-sup-email" value="${escapeHtml(supplier.email || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Address</label>
          <input class="form-input" id="edit-sup-address" value="${escapeHtml(supplier.address || '')}">
        </div>
        <button type="submit" class="btn btn-gold" style="width:100%;justify-content:center;padding:12px">Save Changes</button>
      </form>
    `);
    document.getElementById('edit-supplier-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await Api.put(`/suppliers/${supplier.id}`, {
          name: document.getElementById('edit-sup-name').value.trim(),
          phone: document.getElementById('edit-sup-phone').value.trim(),
          email: document.getElementById('edit-sup-email').value.trim(),
          address: document.getElementById('edit-sup-address').value.trim()
        });
        Toast.success('Supplier updated.');
        this.suppliers = await Api.get('/suppliers');
        this.openSuppliersModal();
      } catch (err) { Toast.error(err.message); }
    });
  }
};
