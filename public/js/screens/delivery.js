// Third Eye Computer Solutions - POS System
// Delivery module screen - track and manage delivery orders.
// "New Delivery" includes its own product/barcode picker, independent of
// the POS screen - building a delivery order here creates a real linked
// sale (so stock and reports stay accurate).

const DeliveryScreen = {
  deliveries: [],
  drivers: [],
  products: [],
  customers: [],
  statusFilter: '',
  draftItems: [],

  statusLabels: {
    pending: 'Pending',
    preparing: 'Preparing',
    out_for_delivery: 'Out for Delivery',
    delivered: 'Delivered',
    cancelled: 'Cancelled'
  },
  statusColors: {
    pending: 'badge-neutral',
    preparing: 'badge-warning',
    out_for_delivery: 'badge-gold',
    delivered: 'badge-success',
    cancelled: 'badge-danger'
  },

  dateFrom: '',
  dateTo: '',
  searchTerm: '',

  async render() {
    Shell.mount('/delivery', `<div class="empty-state">Loading deliveries...</div>`);
    try {
      [this.deliveries, this.drivers, this.products, this.customers] = await Promise.all([
        Api.get('/deliveries'),
        Api.get('/drivers'),
        Api.get('/products'),
        Api.get('/customers')
      ]);
    } catch (err) {
      Toast.error(err.message);
      return;
    }
    BulkSelect.reset();
    this.statusFilter = '';
    this.dateFrom = '';
    this.dateTo = '';
    this.searchTerm = '';
    this.renderScreen();
  },

  getDateFiltered() {
    let list = this.deliveries;
    if (this.dateFrom) list = list.filter(d => new Date(d.createdAt) >= new Date(this.dateFrom));
    if (this.dateTo) list = list.filter(d => new Date(d.createdAt) <= new Date(new Date(this.dateTo).setHours(23, 59, 59, 999)));
    if (this.searchTerm.trim()) {
      const term = this.searchTerm.trim().toLowerCase();
      list = list.filter(d =>
        (d.customerName || '').toLowerCase().includes(term) ||
        (d.customerPhone || '').includes(term) ||
        (d.challanNo || '').toLowerCase().includes(term) ||
        (d.address || '').toLowerCase().includes(term)
      );
    }
    return list;
  },

  renderScreen() {
    const dateFiltered = this.getDateFiltered();
    const filtered = this.statusFilter ? dateFiltered.filter(d => d.status === this.statusFilter) : dateFiltered;
    const settings = App.settings;

    // Computed up front so each row's menu renders once (not rendered
    // empty, then replaced via outerHTML after the fact).
    const itemsByRow = {};
    filtered.forEach(d => {
      const items = [
        { label: 'Edit / Reassign Driver', icon: Icon.edit, onClick: () => this.openEditDeliveryModal(d) },
        { label: 'Print Challan', icon: Icon.printer, onClick: () => this.printChallan(d.id) },
        { label: 'Send Challan via WhatsApp', icon: Icon.copy, onClick: () => this.shareChallan(d.id) }
      ];
      if (d.status !== 'delivered' && d.status !== 'cancelled') {
        items.push({ label: 'Complete Delivery', onClick: () => this.openCompleteModal(d) });
      }
      items.push({ label: 'Delete', icon: Icon.x, danger: true, onClick: () => this.deleteDelivery(d.id) });
      itemsByRow[`d-${d.id}`] = items;
    });

    const counts = {};
    Object.keys(this.statusLabels).forEach(key => {
      counts[key] = dateFiltered.filter(d => d.status === key).length;
    });

    const totalOrderValue = dateFiltered.reduce((sum, d) => sum + (d.orderTotal || 0), 0);

    const content = `
      <div class="page-header">
        <div>
          <h1>Delivery</h1>
          <div class="page-subtitle">${this.deliveries.length} delivery orders</div>
        </div>
        <button class="btn btn-gold" id="new-delivery-btn">
          <span style="width:16px;height:16px;display:flex">${Icon.plus}</span> New Delivery
        </button>
      </div>

      <div class="stat-grid">
        <div class="stat-card"><div class="stat-label">Pending</div><div class="stat-value">${counts.pending}</div></div>
        <div class="stat-card"><div class="stat-label">Preparing</div><div class="stat-value">${counts.preparing}</div></div>
        <div class="stat-card accent"><div class="stat-label">Out for Delivery</div><div class="stat-value">${counts.out_for_delivery}</div></div>
        <div class="stat-card success-accent"><div class="stat-label">Delivered</div><div class="stat-value">${counts.delivered}</div></div>
        <div class="stat-card danger-accent"><div class="stat-label">Cancelled</div><div class="stat-value">${counts.cancelled}</div></div>
        <div class="stat-card accent"><div class="stat-label">Total Sales Value${this.dateFrom || this.dateTo ? ' (filtered)' : ''}</div><div class="stat-value">${totalOrderValue.toFixed(settings.currencyDecimals ?? 3)} <span style="font-size:0.6em;font-weight:600">${settings.currency}</span></div></div>
      </div>

      <div class="card-flat" style="margin-bottom:18px">
        <div class="filter-grid">
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">From Date</label>
            <input class="form-input" id="dlv-from" type="date" value="${this.dateFrom}">
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">To Date</label>
            <input class="form-input" id="dlv-to" type="date" value="${this.dateTo}">
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:14px">
          <button class="btn-icon-label primary" id="apply-date-btn">Apply</button>
          <button class="btn-icon-label" id="clear-date-btn">Clear</button>
          <button class="btn-icon-label gold" id="delivery-report-btn" style="margin-left:auto">${Icon.printer} Generate Report</button>
        </div>
      </div>

      <div class="toolbar-row">
        <input class="form-input" id="dlv-search" placeholder="Search customer, phone, challan # or address..." value="${escapeHtml(this.searchTerm)}" style="max-width:280px">
        <button class="btn-icon-label ${this.statusFilter === '' ? 'primary' : ''}" data-status="">All</button>
        ${Object.entries(this.statusLabels).map(([key, label]) => `
          <button class="btn-icon-label ${this.statusFilter === key ? 'primary' : ''}" data-status="${key}">${label} (${counts[key]})</button>
        `).join('')}
        <button class="btn-icon-label" id="manage-drivers-btn" style="margin-left:auto">${Icon.truck} Manage Drivers</button>
      </div>

      <div id="bulk-toolbar-container"></div>

      <div class="table-wrap">
        <table>
          <thead><tr>${BulkSelect.checkboxHeader()}<th>Customer</th><th>Address</th><th>Items / Total</th><th>Driver</th><th>Fee</th><th>Status</th><th>Date</th><th></th></tr></thead>
          <tbody>
            ${filtered.length === 0 ? `<tr><td colspan="9"><div class="empty-state"><p>No deliveries found. Click "New Delivery" to create one.</p></div></td></tr>` : filtered.map(d => {
              const driver = this.drivers.find(dr => dr.id === d.driverId);
              return `
              <tr>
                ${BulkSelect.checkboxCell(d.id)}
                <td><strong>${escapeHtml(d.customerName || 'Walk-in')}</strong><br><span style="font-size:0.76rem;color:var(--text-muted)">${escapeHtml(d.customerPhone || '')}</span></td>
                <td style="max-width:200px">${escapeHtml(d.address)}</td>
                <td>
                  ${d.saleId ? `<button class="row-action row-action-view with-label view-delivery-sale-btn" data-id="${d.id}">View Order</button><br><span class="money" style="font-size:0.82rem">${Number(d.orderTotal || 0).toFixed(settings.currencyDecimals ?? 3)} ${settings.currency}</span>` : '<span style="color:var(--text-muted);font-size:0.78rem">No items linked</span>'}
                </td>
                <td>${driver ? escapeHtml(driver.name) : '<span style="color:var(--text-muted)">Unassigned</span>'}</td>
                <td>${formatMoney(d.deliveryFee, settings)}</td>
                <td><span class="badge ${this.statusColors[d.status]}">${this.statusLabels[d.status]}</span></td>
                <td>${formatDate(d.createdAt)}</td>
                <td style="text-align:right;white-space:nowrap">
                  <select class="form-select status-select" data-id="${d.id}" style="font-size:0.78rem;padding:6px 8px;margin-bottom:6px">
                    ${Object.entries(this.statusLabels).map(([key, label]) => `<option value="${key}" ${d.status === key ? 'selected' : ''}>${label}</option>`).join('')}
                  </select>
                  ${ActionMenu.render(`d-${d.id}`, itemsByRow[`d-${d.id}`])}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
    document.getElementById('content').innerHTML = content;


    document.querySelectorAll('[data-status]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.statusFilter = btn.dataset.status;
        this.renderScreen();
      });
    });
    document.getElementById('new-delivery-btn').addEventListener('click', () => this.openNewDeliveryModal());
    document.getElementById('dlv-search').addEventListener('input', (e) => {
      this.searchTerm = e.target.value;
      clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(() => {
        const cursorPos = e.target.selectionStart;
        this.renderScreen();
        const newInput = document.getElementById('dlv-search');
        if (newInput) { newInput.focus(); newInput.setSelectionRange(cursorPos, cursorPos); }
      }, 200);
    });
    document.getElementById('apply-date-btn').addEventListener('click', () => {
      this.dateFrom = document.getElementById('dlv-from').value;
      this.dateTo = document.getElementById('dlv-to').value;
      this.renderScreen();
    });
    document.getElementById('clear-date-btn').addEventListener('click', () => {
      this.dateFrom = '';
      this.dateTo = '';
      this.renderScreen();
    });
    document.getElementById('delivery-report-btn').addEventListener('click', () => this.generateReport());
    document.getElementById('manage-drivers-btn').addEventListener('click', () => this.openDriversModal());
    document.querySelectorAll('.status-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        try {
          await Api.put(`/deliveries/${sel.dataset.id}/status`, { status: sel.value });
          Toast.success('Delivery status updated.');
          this.deliveries = await Api.get('/deliveries');
          this.renderScreen();
        } catch (err) { Toast.error(err.message); }
      });
    });
    document.querySelectorAll('.view-delivery-sale-btn').forEach(btn => {
      btn.addEventListener('click', () => this.viewDeliveryOrder(Number(btn.dataset.id)));
    });
    ActionMenu.wireAll(itemsByRow);

    BulkSelect.wire('bulk-toolbar-container', async (ids) => {
      try {
        let deleted = 0;
        for (const id of ids) { await Api.del(`/deliveries/${id}`); deleted++; }
        Toast.success(`${deleted} delivery order(s) deleted.`);
        BulkSelect.reset();
        this.deliveries = await Api.get('/deliveries');
        this.renderScreen();
      } catch (err) { Toast.error(err.message); }
    });
  },

  async printChallan(id) {
    try {
      const delivery = await Api.get(`/deliveries/${id}`);
      DocPrint.printChallan(delivery, App.settings);
    } catch (err) { Toast.error(err.message); }
  },

  async shareChallan(id) {
    try {
      const delivery = await Api.get(`/deliveries/${id}`);
      DocShare.openShareModal('challan', delivery, App.settings);
    } catch (err) { Toast.error(err.message); }
  },

  async deleteDelivery(id) {
    if (!confirm('Delete this delivery? This cannot be undone.')) return;
    try {
      await Api.del(`/deliveries/${id}`);
      Toast.success('Delivery deleted.');
      this.deliveries = await Api.get('/deliveries');
      this.renderScreen();
    } catch (err) { Toast.error(err.message); }
  },

  // The "delivery completed" workflow: capture who received the goods (and
  // optionally a drawn signature) and lock the challan as delivered. If the
  // sale was unpaid (e.g. cash-on-delivery / credit), the driver can also
  // collect payment right here in the same step.
  openCompleteModal(delivery) {
    if (!delivery) return;
    Modal.open('Complete Delivery', `
      <p style="color:var(--text-secondary);font-size:0.86rem;margin-bottom:14px">
        Capture the receiver's details to close out challan <strong>${escapeHtml(delivery.challanNo || '')}</strong>.
      </p>
      <div class="form-group">
        <label class="form-label">Received By (Name)</label>
        <input class="form-input" id="cd-name" placeholder="Name of person who received the goods" required>
      </div>
      <div class="form-group">
        <label class="form-label">Signature</label>
        <canvas id="cd-sig-canvas" width="460" height="140" style="border:1px solid var(--border);border-radius:8px;width:100%;touch-action:none;background:#fff"></canvas>
        <div style="display:flex;gap:8px;margin-top:6px">
          <button type="button" class="btn-icon-label" id="cd-sig-clear">Clear Signature</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <input class="form-input" id="cd-notes" placeholder="Optional delivery notes">
      </div>
      ${!delivery.paid ? `
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem">
          <input type="checkbox" id="cd-collect"> Collect payment now (mark this order as paid)
        </label>
      </div>` : ''}
      <button type="button" class="btn btn-gold" id="cd-save-btn" style="width:100%;justify-content:center;padding:12px">
        Mark as Delivered
      </button>
    `);

    const canvas = document.getElementById('cd-sig-canvas');
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#1a1a1a';
    let drawing = false, hasSignature = false;
    const pos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
      const p = e.touches ? e.touches[0] : e;
      return { x: (p.clientX - rect.left) * scaleX, y: (p.clientY - rect.top) * scaleY };
    };
    const start = (e) => { drawing = true; hasSignature = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); };
    const move = (e) => { if (!drawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); };
    const end = () => { drawing = false; };
    ['mousedown', 'touchstart'].forEach(evt => canvas.addEventListener(evt, start));
    ['mousemove', 'touchmove'].forEach(evt => canvas.addEventListener(evt, move));
    ['mouseup', 'mouseleave', 'touchend'].forEach(evt => canvas.addEventListener(evt, end));
    document.getElementById('cd-sig-clear').addEventListener('click', () => { ctx.clearRect(0, 0, canvas.width, canvas.height); hasSignature = false; });

    document.getElementById('cd-save-btn').addEventListener('click', async () => {
      const receivedByName = document.getElementById('cd-name').value.trim();
      if (!receivedByName) { Toast.error('Enter the receiver\'s name.'); return; }
      const collectEl = document.getElementById('cd-collect');
      try {
        await Api.put(`/deliveries/${delivery.id}/complete`, {
          receivedByName,
          signatureDataUrl: hasSignature ? canvas.toDataURL('image/png') : '',
          completionNotes: document.getElementById('cd-notes').value.trim(),
          collectPayment: collectEl ? collectEl.checked : false
        });
        Toast.success('Delivery marked as completed.');
        Modal.close();
        this.deliveries = await Api.get('/deliveries');
        this.renderScreen();
      } catch (err) { Toast.error(err.message); }
    });
  },

  async viewDeliveryOrder(deliveryId) {
    try {
      const delivery = await Api.get(`/deliveries/${deliveryId}`);
      const settings = App.settings;
      Modal.open('Delivery Order Details', `
        <div class="form-row" style="margin-bottom:16px">
          <div>
            <div class="form-label">Customer</div>
            <div>${escapeHtml(delivery.customerName || 'Walk-in')} &middot; ${escapeHtml(delivery.customerPhone || '')}</div>
          </div>
          <div>
            <div class="form-label">Address</div>
            <div>${escapeHtml(delivery.address)}</div>
          </div>
        </div>
        <div class="table-wrap" style="box-shadow:none;margin-bottom:14px">
          <table>
            <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
            <tbody>
              ${(delivery.items || []).map(i => `
                <tr><td>${escapeHtml(i.productName)}</td><td>${i.quantity}</td><td>${formatMoney(i.unitPrice, settings)}</td><td>${formatMoney(i.lineTotal, settings)}</td></tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ${delivery.sale ? `
        <div class="summary-row"><span>Subtotal</span><span>${formatMoney(delivery.sale.subtotal, settings)}</span></div>
        <div class="summary-row"><span>VAT</span><span>${formatMoney(delivery.sale.vatTotal, settings)}</span></div>
        <div class="summary-row"><span>Delivery Fee</span><span>${formatMoney(delivery.deliveryFee, settings)}</span></div>
        <div class="summary-row total"><span>Order Total</span><span>${formatMoney(delivery.sale.total, settings)}</span></div>
        ` : ''}
      `, { large: true });
    } catch (err) {
      Toast.error(err.message);
    }
  },

  openNewDeliveryModal() {
    this.draftItems = [];
    const render = () => `
      <div class="form-group">
        ${QuickAddSelect.render({ id: 'd-customer', label: 'Customer (optional)', options: this.customers, placeholder: 'Walk-in customer (or type a name below)' })}
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Customer Name</label>
          <input class="form-input" id="d-name" placeholder="Customer name">
        </div>
        <div class="form-group">
          <label class="form-label">Phone</label>
          <input class="form-input" id="d-phone" placeholder="Phone number">
        </div>
      </div>
      <div class="form-hint" style="margin:-8px 0 12px">Picking a saved customer above fills in the name/phone automatically.</div>
      <div class="form-group">
        <label class="form-label">Delivery Address</label>
        <textarea class="form-textarea" id="d-address" rows="2" required></textarea>
      </div>

      <div class="form-group" style="border-top:1px solid var(--border);padding-top:14px;margin-top:6px">
        <label class="form-label">Add Products (search by name or scan barcode)</label>
        <div style="display:flex;gap:8px;margin-bottom:10px">
          <input class="form-input" id="d-product-search" placeholder="Search by name or scan barcode..." style="flex:2">
          <input class="form-input" id="d-product-qty" type="number" min="1" value="1" placeholder="Qty" style="flex:0 0 80px">
        </div>
        <div id="d-product-results" style="max-height:160px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;display:none"></div>
      </div>

      <div id="d-draft-items" style="margin:14px 0">
        ${this.draftItems.length === 0 ? '<p style="color:var(--text-muted);font-size:0.85rem">No products added yet. Search above to add items to this delivery.</p>' : `
        <div class="table-wrap" style="box-shadow:none">
          <table>
            <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Total</th><th></th></tr></thead>
            <tbody>
              ${this.draftItems.map((item, idx) => `
                <tr>
                  <td>${escapeHtml(item.productName)}</td>
                  <td>${item.quantity}</td>
                  <td>${formatMoneyPlain(item.unitPrice, App.settings)}</td>
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
          ${QuickAddSelect.render({ id: 'd-driver', label: 'Assign Driver', options: this.drivers, placeholder: 'Unassigned' })}
        </div>
        <div class="form-group">
          <label class="form-label">Delivery Fee (${escapeHtml(App.settings.currency || 'BHD')})</label>
          <input class="form-input" id="d-fee" type="number" step="0.001" value="0">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <input class="form-input" id="d-notes" placeholder="Optional notes">
      </div>
      <button type="button" class="btn btn-gold" id="create-delivery-btn" style="width:100%;justify-content:center;padding:12px">
        Create Delivery Order
      </button>
    `;

    Modal.open('New Delivery Order', render(), { large: true });
    this.wireDeliveryModal(render);
  },

  wireDeliveryModal(render) {
    QuickAddSelect.wire('d-driver', (name) => Api.post('/drivers', { name }), (created) => {
      this.drivers.push(created);
    });
    QuickAddSelect.wire('d-customer', (name) => Api.post('/customers', { name }), (created) => {
      this.customers.push(created);
    });
    const customerSelect = document.getElementById('d-customer');
    if (customerSelect) {
      customerSelect.addEventListener('change', () => {
        const cust = this.customers.find(c => c.id === Number(customerSelect.value));
        if (cust) {
          document.getElementById('d-name').value = cust.name || '';
          document.getElementById('d-phone').value = cust.phone || '';
          if (cust.address && !document.getElementById('d-address').value) {
            document.getElementById('d-address').value = cust.address;
          }
        }
      });
    }

    const searchInput = document.getElementById('d-product-search');
    const resultsBox = document.getElementById('d-product-results');
    const qtyInput = document.getElementById('d-product-qty');

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
        <div class="d-product-result" data-id="${p.id}" style="padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;font-size:0.85rem">
          <span>${escapeHtml(p.name)} <span style="color:var(--text-muted);font-size:0.76rem">(${p.stock} ${escapeHtml(p.unit)})</span></span>
          <span style="font-family:var(--font-mono);font-weight:600">${formatMoneyPlain(p.sellPrice, App.settings)}</span>
        </div>
      `).join('');
      resultsBox.style.display = 'block';
      resultsBox.querySelectorAll('.d-product-result').forEach(row => {
        row.addEventListener('mouseenter', () => row.style.background = 'var(--surface-raised)');
        row.addEventListener('mouseleave', () => row.style.background = '');
        row.addEventListener('click', () => {
          const product = this.products.find(p => p.id === Number(row.dataset.id));
          const qty = Number(qtyInput.value) || 1;
          this.addDraftItem(product, qty, render);
        });
      });
    };

    searchInput.addEventListener('input', (e) => showResults(e.target.value));
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const term = searchInput.value.trim();
        const exact = this.products.find(p => p.barcode === term);
        if (exact) {
          this.addDraftItem(exact, Number(qtyInput.value) || 1, render);
        }
      }
    });

    document.querySelectorAll('.remove-draft-item').forEach(btn => {
      btn.addEventListener('click', () => {
        this.draftItems.splice(Number(btn.dataset.idx), 1);
        document.getElementById('modal-body').innerHTML = render();
        this.wireDeliveryModal(render);
      });
    });

    const createBtn = document.getElementById('create-delivery-btn');
    if (createBtn) {
      createBtn.addEventListener('click', async () => {
        const address = document.getElementById('d-address').value.trim();
        if (!address) { Toast.error('Delivery address is required.'); return; }
        const payload = {
          customerId: Number(document.getElementById('d-customer').value) || null,
          customerName: document.getElementById('d-name').value.trim(),
          customerPhone: document.getElementById('d-phone').value.trim(),
          address,
          driverId: Number(document.getElementById('d-driver').value) || null,
          deliveryFee: Number(document.getElementById('d-fee').value) || 0,
          notes: document.getElementById('d-notes').value.trim(),
          items: this.draftItems.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice }))
        };
        try {
          await Api.post('/deliveries', payload);
          Toast.success(this.draftItems.length > 0 ? 'Delivery order created with items.' : 'Delivery order created.');
          Modal.close();
          [this.deliveries, this.products] = await Promise.all([Api.get('/deliveries'), Api.get('/products')]);
          this.renderScreen();
        } catch (err) { Toast.error(err.message); }
      });
    }
  },

  addDraftItem(product, qty, render) {
    if (!product) return;
    if (qty > product.stock) {
      Toast.error(`Only ${product.stock} ${product.unit} of "${product.name}" available.`);
      return;
    }
    const existing = this.draftItems.find(i => i.productId === product.id);
    if (existing) {
      existing.quantity += qty;
    } else {
      this.draftItems.push({ productId: product.id, productName: product.name, quantity: qty, unitPrice: product.sellPrice });
    }
    document.getElementById('modal-body').innerHTML = render();
    this.wireDeliveryModal(render);
    document.getElementById('d-product-search').focus();
  },

  // Edit an existing delivery: reassign the driver, fix the address/phone,
  // adjust the delivery fee, or add notes - without having to delete and
  // recreate the whole delivery. The backend already supported this
  // (PUT /deliveries/:id), it just had no button in the UI.
  openEditDeliveryModal(delivery) {
    if (!delivery) return;
    Modal.open(`Edit Delivery`, `
      <form id="edit-delivery-form">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Customer Name</label>
            <input class="form-input" id="ed-customer-name" value="${escapeHtml(delivery.customerName || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Phone</label>
            <input class="form-input" id="ed-customer-phone" value="${escapeHtml(delivery.customerPhone || '')}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Address</label>
          <input class="form-input" id="ed-address" value="${escapeHtml(delivery.address || '')}" required>
        </div>
        ${QuickAddSelect.render({ id: 'ed-driver', label: 'Assign Driver', options: this.drivers, placeholder: 'Unassigned', selectedId: delivery.driverId })}
        <div class="form-group">
          <label class="form-label">Delivery Fee</label>
          <input class="form-input" id="ed-fee" type="number" step="0.001" value="${delivery.deliveryFee || 0}">
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <input class="form-input" id="ed-notes" value="${escapeHtml(delivery.notes || '')}">
        </div>
        <button type="submit" class="btn btn-gold" style="width:100%;justify-content:center;padding:12px">Save Changes</button>
      </form>
    `);
    QuickAddSelect.wire('ed-driver', (name) => Api.post('/drivers', { name }), (created) => {
      this.drivers.push(created);
    });
    document.getElementById('edit-delivery-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await Api.put(`/deliveries/${delivery.id}`, {
          customerName: document.getElementById('ed-customer-name').value.trim(),
          customerPhone: document.getElementById('ed-customer-phone').value.trim(),
          address: document.getElementById('ed-address').value.trim(),
          driverId: document.getElementById('ed-driver').value ? Number(document.getElementById('ed-driver').value) : null,
          deliveryFee: Number(document.getElementById('ed-fee').value) || 0,
          notes: document.getElementById('ed-notes').value.trim()
        });
        Toast.success('Delivery updated.');
        Modal.close();
        this.deliveries = await Api.get('/deliveries');
        this.renderScreen();
      } catch (err) { Toast.error(err.message); }
    });
  },

  openDriversModal() {
    const render = () => `
      <div style="margin-bottom:16px">
        ${this.drivers.map(d => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border)">
            <div>
              <div style="font-weight:600">${escapeHtml(d.name)}</div>
              <div style="font-size:0.78rem;color:var(--text-muted)">${escapeHtml(d.phone || '')}</div>
            </div>
            <div>
              <button class="row-action row-action-edit edit-driver-btn" data-id="${d.id}">${Icon.edit}</button>
              <button class="row-action row-action-delete del-driver-btn" data-id="${d.id}">${Icon.trash}</button>
            </div>
          </div>
        `).join('') || '<p style="color:var(--text-muted);font-size:0.85rem">No drivers yet.</p>'}
      </div>
      <form id="driver-form">
        <div class="form-row">
          <input class="form-input" id="new-driver-name" placeholder="Driver name" required>
          <input class="form-input" id="new-driver-phone" placeholder="Phone">
        </div>
        <button type="submit" class="btn btn-primary" style="margin-top:10px;width:100%;justify-content:center">Add Driver</button>
      </form>
    `;
    Modal.open('Manage Drivers', render(), { large: true });
    const wire = () => {
      document.getElementById('driver-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('new-driver-name').value.trim();
        const phone = document.getElementById('new-driver-phone').value.trim();
        if (!name) return;
        try {
          await Api.post('/drivers', { name, phone });
          this.drivers = await Api.get('/drivers');
          document.getElementById('modal-body').innerHTML = render();
          wire();
        } catch (err) { Toast.error(err.message); }
      });
      document.querySelectorAll('.edit-driver-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const driver = this.drivers.find(d => d.id === Number(btn.dataset.id));
          this.openEditDriverModal(driver, render);
        });
      });
      document.querySelectorAll('.del-driver-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this driver?')) return;
          try {
            await Api.del(`/drivers/${btn.dataset.id}`);
            this.drivers = await Api.get('/drivers');
            document.getElementById('modal-body').innerHTML = render();
            wire();
          } catch (err) { Toast.error(err.message); }
        });
      });
    };
    wire();
  },

  openEditDriverModal(driver, parentRender) {
    Modal.open('Edit Driver', `
      <form id="edit-driver-form">
        <div class="form-group">
          <label class="form-label">Driver Name</label>
          <input class="form-input" id="edit-driver-name" value="${escapeHtml(driver.name)}" required>
        </div>
        <div class="form-group">
          <label class="form-label">Phone</label>
          <input class="form-input" id="edit-driver-phone" value="${escapeHtml(driver.phone || '')}">
        </div>
        <button type="submit" class="btn btn-gold" style="width:100%;justify-content:center;padding:12px">Save Changes</button>
      </form>
    `);
    document.getElementById('edit-driver-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await Api.put(`/drivers/${driver.id}`, {
          name: document.getElementById('edit-driver-name').value.trim(),
          phone: document.getElementById('edit-driver-phone').value.trim()
        });
        Toast.success('Driver updated.');
        this.drivers = await Api.get('/drivers');
        this.openDriversModal();
      } catch (err) { Toast.error(err.message); }
    });
  },

  generateReport() {
    const dateFiltered = this.getDateFiltered();
    const settings = App.settings;
    const counts = {};
    Object.keys(this.statusLabels).forEach(key => {
      counts[key] = dateFiltered.filter(d => d.status === key).length;
    });
    const totalFee = dateFiltered.reduce((sum, d) => sum + (d.deliveryFee || 0), 0);
    const totalOrderValue = dateFiltered.reduce((sum, d) => sum + (d.orderTotal || 0), 0);
    const decimals = settings.currencyDecimals ?? 3;

    // Per-customer totals - how much each customer's delivery orders add
    // up to over this period, sorted highest first.
    const byCustomer = {};
    dateFiltered.forEach(d => {
      const key = d.customerName || 'Walk-in';
      if (!byCustomer[key]) byCustomer[key] = { orders: 0, total: 0 };
      byCustomer[key].orders += 1;
      byCustomer[key].total += (d.orderTotal || 0);
    });
    const customerRows = Object.entries(byCustomer).sort((a, b) => b[1].total - a[1].total);

    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>Delivery Report</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 30px; color: #1C2530; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        h2 { font-size: 14px; margin: 24px 0 4px; }
        .meta { color: #5B6675; font-size: 12px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #E2E5EA; font-size: 12px; }
        th { background: #F5F6F8; font-weight: 700; text-transform: uppercase; font-size: 10px; }
        .summary { display: flex; gap: 24px; margin: 16px 0; flex-wrap: wrap; }
        .summary div { font-size: 12px; }
        .summary strong { display: block; font-size: 17px; margin-top: 2px; }
        @media print { body { padding: 10px; } }
      </style></head>
      <body>
        <h1>${escapeHtml(settings.shopName)} - Delivery Report</h1>
        <div class="meta">Generated ${formatDateTime(new Date().toISOString())} ${this.dateFrom || this.dateTo ? `&middot; Period: ${this.dateFrom || 'start'} to ${this.dateTo || 'today'}` : '&middot; All time'}</div>
        <div class="summary">
          <div>Total Orders<strong>${dateFiltered.length}</strong></div>
          <div>Pending<strong>${counts.pending}</strong></div>
          <div>Preparing<strong>${counts.preparing}</strong></div>
          <div>Out for Delivery<strong>${counts.out_for_delivery}</strong></div>
          <div>Delivered<strong>${counts.delivered}</strong></div>
          <div>Cancelled<strong>${counts.cancelled}</strong></div>
          <div>Total Delivery Fees<strong>${totalFee.toFixed(decimals)} ${settings.currency}</strong></div>
          <div>Total Sales Value<strong>${totalOrderValue.toFixed(decimals)} ${settings.currency}</strong></div>
        </div>
        <table>
          <thead><tr><th>Customer</th><th>Address</th><th>Driver</th><th>Order Total</th><th>Fee</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>
            ${dateFiltered.map(d => {
              const driver = this.drivers.find(dr => dr.id === d.driverId);
              return `
              <tr>
                <td>${escapeHtml(d.customerName || 'Walk-in')}</td>
                <td>${escapeHtml(d.address)}</td>
                <td>${driver ? escapeHtml(driver.name) : 'Unassigned'}</td>
                <td>${Number(d.orderTotal || 0).toFixed(decimals)}</td>
                <td>${d.deliveryFee.toFixed(decimals)}</td>
                <td>${this.statusLabels[d.status]}</td>
                <td>${formatDate(d.createdAt)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        <h2>Total Sales by Customer</h2>
        <table>
          <thead><tr><th>Customer</th><th>Orders</th><th>Total Sales Value</th></tr></thead>
          <tbody>
            ${customerRows.map(([name, v]) => `
              <tr><td>${escapeHtml(name)}</td><td>${v.orders}</td><td>${v.total.toFixed(decimals)} ${settings.currency}</td></tr>
            `).join('')}
          </tbody>
        </table>
      </body></html>
    `);
    win.document.close();
    setTimeout(() => win.print(), 300);
  }
};
