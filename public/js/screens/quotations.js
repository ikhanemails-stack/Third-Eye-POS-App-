// Third Eye Computer Solutions - POS System
// Quotations screen - create priced proposals, edit/delete them while still
// draft, and convert them into a real sale the moment the customer agrees.

const QuotationsScreen = {
  quotes: [],
  products: [],
  customers: [],
  statusFilter: '',
  searchTerm: '',
  draftItems: [],
  editingId: null,

  statusLabels: {
    draft: 'Draft', sent: 'Sent', converted: 'Accepted & Sold',
    rejected: 'Rejected', expired: 'Expired'
  },
  statusColors: {
    draft: 'badge-neutral', sent: 'badge-gold', converted: 'badge-success',
    rejected: 'badge-danger', expired: 'badge-warning'
  },

  async render() {
    Shell.mount('/quotations', `<div class="empty-state">Loading quotations...</div>`);
    try {
      [this.quotes, this.products, this.customers] = await Promise.all([
        Api.get('/quotations'), Api.get('/products'), Api.get('/customers')
      ]);
    } catch (err) { Toast.error(err.message); return; }
    this.statusFilter = '';
    this.searchTerm = '';
    this.renderScreen();
  },

  renderScreen() {
    const term = this.searchTerm.trim().toLowerCase();
    let filtered = this.statusFilter ? this.quotes.filter(q => q.status === this.statusFilter) : this.quotes;
    if (term) {
      filtered = filtered.filter(q =>
        (q.quoteNo || '').toLowerCase().includes(term) ||
        (q.customerName || '').toLowerCase().includes(term) ||
        (q.customerPhone || '').includes(term)
      );
    }
    const settings = App.settings;
    const counts = {};
    Object.keys(this.statusLabels).forEach(key => { counts[key] = this.quotes.filter(q => q.status === key).length; });

    // Compute each row's action-menu items up front so the table only
    // needs to render each menu once (previously rendered an empty
    // placeholder first, then replaced it via outerHTML after the fact -
    // wasted work on every render, doubled on longer lists).
    const itemsByRow = {};
    filtered.forEach(q => {
      const editable = q.status === 'draft' || q.status === 'sent';
      const items = [
        { label: 'View / Print', icon: Icon.printer, onClick: () => this.viewQuote(q.id) },
        { label: 'Send via WhatsApp', icon: Icon.copy, onClick: () => this.shareQuote(q.id) }
      ];
      if (editable) items.push({ label: 'Edit', icon: Icon.edit, onClick: () => this.editQuote(q.id) });
      if (q.status === 'draft') items.push({ label: 'Mark as Sent', onClick: () => this.setStatus(q.id, 'sent') });
      if (editable) items.push({ label: 'Accept & Convert to Sale', onClick: () => this.acceptQuote(q.id) });
      if (editable) items.push({ label: 'Reject', danger: true, onClick: () => this.setStatus(q.id, 'rejected') });
      if (q.status !== 'converted') items.push({ label: 'Delete', icon: Icon.x, danger: true, onClick: () => this.deleteQuote(q.id) });
      itemsByRow[`q-${q.id}`] = items;
    });

    const content = `
      <div class="page-header">
        <div>
          <h1>Quotations</h1>
          <div class="page-subtitle">${this.quotes.length} quotations</div>
        </div>
        <button class="btn btn-gold" id="new-quote-btn">
          <span style="width:16px;height:16px;display:flex">${Icon.plus}</span> New Quotation
        </button>
      </div>

      <div class="toolbar-row">
        <input class="form-input" id="quote-search" placeholder="Search by quote #, customer or phone..." value="${escapeHtml(this.searchTerm)}" style="max-width:280px">
        <button class="btn-icon-label ${this.statusFilter === '' ? 'primary' : ''}" data-status="">All</button>
        ${Object.entries(this.statusLabels).map(([key, label]) => `
          <button class="btn-icon-label ${this.statusFilter === key ? 'primary' : ''}" data-status="${key}">${label} (${counts[key]})</button>
        `).join('')}
      </div>

      <div class="table-wrap" style="overflow:visible">
        <table>
          <thead><tr><th>Quote #</th><th>Customer</th><th>Total</th><th>Valid Until</th><th>Status</th><th>Date</th><th></th></tr></thead>
          <tbody>
            ${filtered.length === 0 ? `<tr><td colspan="7"><div class="empty-state"><p>No quotations found. Click "New Quotation" to create one.</p></div></td></tr>` : filtered.map(q => `
              <tr>
                <td style="font-family:var(--font-mono);font-size:0.8rem">${escapeHtml(q.quoteNo)}</td>
                <td><strong>${escapeHtml(q.customerName || 'Walk-in')}</strong><br><span style="font-size:0.76rem;color:var(--text-muted)">${escapeHtml(q.customerPhone || '')}</span></td>
                <td>${formatMoney(q.total, settings)}</td>
                <td>${q.validUntil ? formatDate(q.validUntil) : '-'}</td>
                <td><span class="badge ${this.statusColors[q.status]}">${this.statusLabels[q.status]}</span></td>
                <td>${formatDate(q.createdAt)}</td>
                <td style="text-align:right">${ActionMenu.render(`q-${q.id}`, itemsByRow[`q-${q.id}`])}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    document.getElementById('content').innerHTML = content;

    document.querySelectorAll('[data-status]').forEach(btn => {
      btn.addEventListener('click', () => { this.statusFilter = btn.dataset.status; this.renderScreen(); });
    });
    document.getElementById('quote-search').addEventListener('input', (e) => {
      this.searchTerm = e.target.value;
      clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(() => {
        const cursorPos = e.target.selectionStart;
        this.renderScreen();
        const newInput = document.getElementById('quote-search');
        if (newInput) { newInput.focus(); newInput.setSelectionRange(cursorPos, cursorPos); }
      }, 200);
    });
    document.getElementById('new-quote-btn').addEventListener('click', () => this.openQuoteModal());
    ActionMenu.wireAll(itemsByRow);
  },

  async setStatus(id, status) {
    try {
      await Api.put(`/quotations/${id}/status`, { status });
      Toast.success(`Quotation marked as ${status}.`);
      this.quotes = await Api.get('/quotations');
      this.renderScreen();
    } catch (err) { Toast.error(err.message); }
  },

  async acceptQuote(id) {
    if (!confirm('Customer has agreed to this quotation. Convert it into a real sale now? This will reduce stock.')) return;
    try {
      const result = await Api.post(`/quotations/${id}/accept`, {});
      Toast.success(`Converted to Sale ${result.sale.invoiceNo}.`);
      [this.quotes, this.products] = await Promise.all([Api.get('/quotations'), Api.get('/products')]);
      this.renderScreen();
    } catch (err) { Toast.error(err.message); }
  },

  async deleteQuote(id) {
    if (!confirm('Delete this quotation? This cannot be undone.')) return;
    try {
      await Api.del(`/quotations/${id}`);
      Toast.success('Quotation deleted.');
      this.quotes = await Api.get('/quotations');
      this.renderScreen();
    } catch (err) { Toast.error(err.message); }
  },

  async editQuote(id) {
    // The list (this.quotes) doesn't include line items - fetching the
    // single quote here is what was missing, and was the actual cause of
    // edits "not showing properly" / silently losing items on save.
    try {
      const quote = await Api.get(`/quotations/${id}`);
      this.openQuoteModal(quote);
    } catch (err) { Toast.error(err.message); }
  },

  async viewQuote(id) {
    try {
      const quote = await Api.get(`/quotations/${id}`);
      DocPrint.printQuotation(quote, App.settings);
    } catch (err) { Toast.error(err.message); }
  },

  async shareQuote(id) {
    try {
      const quote = await Api.get(`/quotations/${id}`);
      DocShare.openShareModal('quotation', quote, App.settings);
    } catch (err) { Toast.error(err.message); }
  },

  // ---------- CREATE / EDIT MODAL ----------

  openQuoteModal(existing) {
    this.editingId = existing ? existing.id : null;
    this.draftItems = existing ? (existing.items || []).map(i => ({ ...i })) : [];

    // formState holds the current values of the customer/meta fields so that
    // re-rendering the modal (which happens every time a product/qty/price
    // changes) doesn't wipe out whatever the user picked/typed. Previously
    // the modal always re-read from `existing` (which never changes for a
    // new quote), so any selected customer silently reverted to "Walk-in".
    this.formState = {
      customerId: existing?.customerId || '',
      customerName: existing?.customerName || '',
      customerPhone: existing?.customerPhone || '',
      validUntil: existing && existing.validUntil ? existing.validUntil.slice(0, 10) : '',
      discount: existing?.discount || 0,
      notes: existing?.notes || '',
      terms: existing?.terms || ''
    };

    const render = () => `
      <div class="form-row">
        <div class="form-group">
          ${QuickAddSelect.render({ id: 'q-customer', label: 'Customer (optional)', options: this.customers, selectedId: this.formState.customerId ? Number(this.formState.customerId) : null, placeholder: 'Walk-in customer (or type a name below)' })}
        </div>
        <div class="form-group">
          <label class="form-label">Valid Until</label>
          <input class="form-input" id="q-valid-until" type="date" value="${escapeHtml(this.formState.validUntil)}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Customer Name</label>
          <input class="form-input" id="q-name" value="${escapeHtml(this.formState.customerName)}" placeholder="Customer name">
        </div>
        <div class="form-group">
          <label class="form-label">Phone</label>
          <input class="form-input" id="q-phone" value="${escapeHtml(this.formState.customerPhone)}" placeholder="Phone number">
        </div>
      </div>
      <div class="form-hint" id="q-sync-hint" style="margin:-8px 0 12px">Picking a saved customer above fills in the name/phone automatically - edit them below only if this quote is for someone different.</div>

      <div class="form-group" style="border-top:1px solid var(--border);padding-top:14px;margin-top:6px">
        <label class="form-label">Add Products</label>
        <div style="display:flex;gap:8px;margin-bottom:10px">
          <input class="form-input" id="q-product-search" placeholder="Search by name or scan barcode..." style="flex:2">
          <input class="form-input" id="q-product-qty" type="number" min="1" value="1" placeholder="Qty" style="flex:0 0 80px">
        </div>
        <div id="q-product-results" style="max-height:160px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;display:none"></div>
      </div>

      <div id="q-draft-items" style="margin:14px 0">
        ${this.draftItems.length === 0 ? '<p style="color:var(--text-muted);font-size:0.85rem">No products added yet.</p>' : `
        <div class="table-wrap" style="box-shadow:none">
          <table>
            <thead><tr><th>Product</th><th style="width:90px">Qty</th><th style="width:110px">Price</th><th>Total</th><th></th></tr></thead>
            <tbody>
              ${this.draftItems.map((item, idx) => `
                <tr>
                  <td>${escapeHtml(item.productName)}</td>
                  <td><input type="number" min="1" step="1" class="form-input draft-qty-input" data-idx="${idx}" value="${item.quantity}" style="padding:6px 8px;font-size:0.85rem"></td>
                  <td><input type="number" min="0" step="0.001" class="form-input draft-price-input" data-idx="${idx}" value="${item.unitPrice}" style="padding:6px 8px;font-size:0.85rem"></td>
                  <td>${formatMoneyPlain(item.quantity * item.unitPrice, App.settings)}</td>
                  <td><button class="row-action row-action-delete remove-draft-item" data-idx="${idx}">${Icon.x}</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`}
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Discount (${(App.settings && App.settings.currency) || ''})</label>
          <input class="form-input" id="q-discount" type="number" step="0.001" value="${this.formState.discount}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <input class="form-input" id="q-notes" value="${escapeHtml(this.formState.notes)}" placeholder="Optional notes">
      </div>
      <div class="form-group">
        <label class="form-label">Terms &amp; Conditions</label>
        <textarea class="form-textarea" id="q-terms" rows="2" placeholder="e.g. Prices valid for 14 days. 50% advance required.">${escapeHtml(this.formState.terms)}</textarea>
      </div>
      <button type="button" class="btn btn-gold" id="save-quote-btn" style="width:100%;justify-content:center;padding:12px">
        ${existing ? 'Save Changes' : 'Create Quotation'}
      </button>
    `;

    Modal.open(existing ? `Edit Quotation ${existing.quoteNo}` : 'New Quotation', render(), { large: true });
    this.wireQuoteModal(render, existing);
  },

  // Reads the live values out of the modal fields into this.formState so a
  // subsequent re-render (triggered by adding/removing a product, or
  // changing a line qty/price) preserves what the user already entered.
  captureFormState() {
    const val = (id) => { const el = document.getElementById(id); return el ? el.value : undefined; };
    const customerSelect = document.getElementById('q-customer');
    if (customerSelect) this.formState.customerId = customerSelect.value || '';
    if (val('q-name') !== undefined) this.formState.customerName = val('q-name');
    if (val('q-phone') !== undefined) this.formState.customerPhone = val('q-phone');
    if (val('q-valid-until') !== undefined) this.formState.validUntil = val('q-valid-until');
    if (val('q-discount') !== undefined) this.formState.discount = val('q-discount');
    if (val('q-notes') !== undefined) this.formState.notes = val('q-notes');
    if (val('q-terms') !== undefined) this.formState.terms = val('q-terms');
  },

  // Re-renders the modal body while preserving the current form field
  // values (customer selection, notes, etc.) - use this instead of calling
  // render()/wireQuoteModal() directly whenever draftItems changes.
  rerenderQuoteModal(render, existing) {
    this.captureFormState();
    document.getElementById('modal-body').innerHTML = render();
    this.wireQuoteModal(render, existing);
  },

  wireQuoteModal(render, existing) {
    // Selecting a saved customer autofills Name/Phone below (fix for the
    // "why are there two customer fields" confusion) - and clearing the
    // dropdown back to "Walk-in" leaves the name/phone fields free to type
    // a one-off customer that isn't saved in your Customers list.
    QuickAddSelect.wire('q-customer', (name) => Api.post('/customers', { name }), (created) => {
      this.customers.push(created);
    });
    const customerSelect = document.getElementById('q-customer');
    const nameInput = document.getElementById('q-name');
    const phoneInput = document.getElementById('q-phone');
    // The select's value already reflects this.formState.customerId (baked
    // in via selectedId in render()), so we don't need to force it here -
    // doing so with a stale `existing` was part of what caused the
    // "resets to walk-in" bug for new quotations.
    if (customerSelect) {
      customerSelect.addEventListener('change', () => {
        this.formState.customerId = customerSelect.value || '';
        const cust = this.customers.find(c => c.id === Number(customerSelect.value));
        if (cust) {
          nameInput.value = cust.name || '';
          phoneInput.value = cust.phone || '';
        }
      });
    }

    const searchInput = document.getElementById('q-product-search');
    const resultsBox = document.getElementById('q-product-results');
    const qtyInput = document.getElementById('q-product-qty');

    const showResults = (term) => {
      if (!term.trim()) { resultsBox.style.display = 'none'; resultsBox.innerHTML = ''; return; }
      const matches = this.products.filter(p =>
        p.name.toLowerCase().includes(term.toLowerCase()) || (p.barcode && p.barcode.includes(term))
      ).slice(0, 8);
      if (matches.length === 0) {
        resultsBox.innerHTML = `<div style="padding:10px;color:var(--text-muted);font-size:0.82rem">No products found.</div>`;
        resultsBox.style.display = 'block';
        return;
      }
      resultsBox.innerHTML = matches.map(p => `
        <div class="q-product-result" data-id="${p.id}" style="padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;font-size:0.85rem">
          <span>${escapeHtml(p.name)} <span style="color:var(--text-muted);font-size:0.76rem">(${p.stock} ${escapeHtml(p.unit)})</span></span>
          <span style="font-family:var(--font-mono);font-weight:600">${formatMoneyPlain(p.sellPrice, App.settings)}</span>
        </div>
      `).join('');
      resultsBox.style.display = 'block';
      resultsBox.querySelectorAll('.q-product-result').forEach(row => {
        row.addEventListener('mouseenter', () => row.style.background = 'var(--surface-raised)');
        row.addEventListener('mouseleave', () => row.style.background = '');
        row.addEventListener('click', () => {
          const product = this.products.find(p => p.id === Number(row.dataset.id));
          const qty = Number(qtyInput.value) || 1;
          this.addDraftItem(product, qty, render, existing);
        });
      });
    };

    searchInput.addEventListener('input', (e) => showResults(e.target.value));
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const term = searchInput.value.trim();
        const exact = this.products.find(p => p.barcode === term);
        if (exact) this.addDraftItem(exact, Number(qtyInput.value) || 1, render, existing);
      }
    });

    document.querySelectorAll('.remove-draft-item').forEach(btn => {
      btn.addEventListener('click', () => {
        this.draftItems.splice(Number(btn.dataset.idx), 1);
        this.rerenderQuoteModal(render, existing);
      });
    });

    // Inline-editable quantity and unit price per line - this is what was
    // missing: you can now correct the qty or discount/increase the price
    // for this quote directly in the table instead of removing & re-adding.
    document.querySelectorAll('.draft-qty-input').forEach(input => {
      input.addEventListener('change', () => {
        const idx = Number(input.dataset.idx);
        const qty = Math.max(1, Number(input.value) || 1);
        this.draftItems[idx].quantity = qty;
        this.rerenderQuoteModal(render, existing);
      });
    });
    document.querySelectorAll('.draft-price-input').forEach(input => {
      input.addEventListener('change', () => {
        const idx = Number(input.dataset.idx);
        const price = Math.max(0, Number(input.value) || 0);
        this.draftItems[idx].unitPrice = price;
        this.rerenderQuoteModal(render, existing);
      });
    });

    const saveBtn = document.getElementById('save-quote-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        if (this.draftItems.length === 0) { Toast.error('Add at least one product to the quotation.'); return; }
        const payload = {
          customerId: Number(document.getElementById('q-customer').value) || null,
          customerName: document.getElementById('q-name').value.trim(),
          customerPhone: document.getElementById('q-phone').value.trim(),
          validUntil: document.getElementById('q-valid-until').value || null,
          discount: Number(document.getElementById('q-discount').value) || 0,
          notes: document.getElementById('q-notes').value.trim(),
          terms: document.getElementById('q-terms').value.trim(),
          items: this.draftItems.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice }))
        };
        try {
          if (existing) {
            await Api.put(`/quotations/${existing.id}`, payload);
            Toast.success('Quotation updated.');
          } else {
            await Api.post('/quotations', payload);
            Toast.success('Quotation created.');
          }
          Modal.close();
          this.quotes = await Api.get('/quotations');
          this.renderScreen();
        } catch (err) { Toast.error(err.message); }
      });
    }
  },

  addDraftItem(product, qty, render, existing) {
    if (!product) return;
    const item = this.draftItems.find(i => i.productId === product.id);
    if (item) {
      item.quantity += qty;
    } else {
      this.draftItems.push({ productId: product.id, productName: product.name, quantity: qty, unitPrice: product.sellPrice });
    }
    this.rerenderQuoteModal(render, existing);
    document.getElementById('q-product-search').focus();
  }
};
