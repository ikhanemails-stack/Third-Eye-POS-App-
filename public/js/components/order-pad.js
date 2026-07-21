// Third Eye Computer Solutions - POS System
// Order Pad: a persistent floating quick-order widget available on every
// screen (mounted once onto document.body, outside the router-controlled
// #app area so it survives navigation). Staff can keep several draft orders
// open at once and turn each into a Delivery, an Invoice (regular sale), or
// a WhatsApp message to the customer.

const OrderPad = {
  _mounted: false,
  open: false,
  orders: [],
  activeId: null,
  _searchTimer: null,
  _searchResults: [],
  customers: [],
  _customersLoaded: false,
  viewMode: 'order', // 'order' | 'history'
  _historySales: null,
  _historyLoading: false,

  async loadCustomersIfNeeded() {
    if (this._customersLoaded) return;
    try {
      this.customers = await Api.get('/customers');
      this._customersLoaded = true;
    } catch (e) { /* search just won't suggest anything if this fails */ }
  },

  ensureMounted() {
    if (!this._mounted) {
      if (this.orders.length === 0) this.addOrder();
      const host = document.createElement('div');
      host.id = 'order-pad-host';
      document.body.appendChild(host);
      this._mounted = true;
    }
    this.renderFab();
    if (this.open) this.renderPanel();
  },

  addOrder() {
    const n = (this._counter = (this._counter || 0) + 1);
    const order = { id: 'op' + Date.now() + n, tag: `Order #${n}`, customerId: null, customerName: '', phone: '', address: '', notes: '', items: [] };
    this.orders.push(order);
    this.activeId = order.id;
    return order;
  },

  removeOrder(id) {
    this.orders = this.orders.filter(o => o.id !== id);
    if (this.orders.length === 0) this.addOrder();
    if (this.activeId === id) this.activeId = this.orders[0].id;
    this.renderPanel();
    this.renderFab();
  },

  getActive() {
    return this.orders.find(o => o.id === this.activeId) || this.orders[0];
  },

  badgeCount() {
    return this.orders.filter(o => o.items.length > 0 || o.customerName || o.address).length;
  },

  toggle() {
    this.open = !this.open;
    if (this.open) { this.loadCustomersIfNeeded().then(() => this.renderPanel()); this.renderPanel(); } else this.closePanel();
    this.renderFab();
  },

  renderFab() {
    let fab = document.getElementById('order-pad-fab');
    const count = this.badgeCount();
    const html = `
      <span style="width:16px;height:16px;display:flex">${Icon.orderpad}</span> Quick Cart
      ${count > 0 ? `<span class="order-pad-badge">${count}</span>` : ''}
    `;
    if (!fab) {
      fab = document.createElement('button');
      fab.id = 'order-pad-fab';
      fab.className = 'order-pad-fab order-pad-fab-enter';
      document.getElementById('order-pad-host').appendChild(fab);
      this.restoreFabPosition(fab);
      this.makeDraggable(fab);
      fab.addEventListener('click', (e) => {
        if (fab.dataset.dragged === '1') { fab.dataset.dragged = '0'; return; }
        this.toggle();
      });
      setTimeout(() => fab.classList.remove('order-pad-fab-enter'), 500);
    }
    fab.innerHTML = html;
  },

  // Remember where the cashier last dragged the Quick Cart button so it
  // doesn't jump back to the default corner every time the screen changes.
  //
  // Bug fixed here: the saved position was raw pixels with no bounds check
  // against the CURRENT screen. Drag it somewhere in landscape, then
  // rotate to portrait (a much narrower viewport) and that saved X/Y could
  // land off-screen entirely, or on top of buttons it never used to cover
  // - "options hidden" without any obvious cause. Every restore (and every
  // resize/rotation) now clamps the position back into the visible area.
  restoreFabPosition(fab) {
    try {
      const saved = JSON.parse(localStorage.getItem('quickCartFabPos') || 'null');
      if (saved && typeof saved.top === 'number' && typeof saved.left === 'number') {
        fab.style.top = saved.top + 'px';
        fab.style.left = saved.left + 'px';
        fab.style.right = 'auto';
        this.clampFabToViewport(fab);
      }
    } catch (e) { /* ignore malformed saved position */ }
    if (!this._resizeListenerAdded) {
      window.addEventListener('resize', () => this.clampFabToViewport(fab));
      window.addEventListener('orientationchange', () => setTimeout(() => this.clampFabToViewport(fab), 200));
      this._resizeListenerAdded = true;
    }
  },

  clampFabToViewport(fab) {
    if (!fab || fab.style.left === '' || fab.style.top === '') return;
    const width = fab.offsetWidth || 56;
    const height = fab.offsetHeight || 56;
    const maxLeft = Math.max(4, window.innerWidth - width - 4);
    const maxTop = Math.max(4, window.innerHeight - height - 4);
    const left = Math.min(Math.max(4, parseInt(fab.style.left, 10) || 0), maxLeft);
    const top = Math.min(Math.max(4, parseInt(fab.style.top, 10) || 0), maxTop);
    fab.style.left = left + 'px';
    fab.style.top = top + 'px';
    try {
      localStorage.setItem('quickCartFabPos', JSON.stringify({ top, left }));
    } catch (e) { /* storage may be unavailable */ }
  },

  // Press-and-drag support (mouse + touch) so the cashier can move the
  // button out of the way of anything it's covering. A short drag (a real
  // tap, not a move) still opens/closes the panel as before.
  makeDraggable(fab) {
    let startX, startY, startTop, startLeft, dragging = false;

    const onMove = (clientX, clientY) => {
      const dx = clientX - startX;
      const dy = clientY - startY;
      if (!dragging && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) dragging = true;
      if (!dragging) return;
      fab.dataset.dragged = '1';
      const maxLeft = window.innerWidth - fab.offsetWidth - 4;
      const maxTop = window.innerHeight - fab.offsetHeight - 4;
      const newLeft = Math.min(Math.max(4, startLeft + dx), maxLeft);
      const newTop = Math.min(Math.max(4, startTop + dy), maxTop);
      fab.style.left = newLeft + 'px';
      fab.style.top = newTop + 'px';
      fab.style.right = 'auto';
    };

    const onEnd = () => {
      document.removeEventListener('mousemove', mouseMoveHandler);
      document.removeEventListener('mouseup', mouseUpHandler);
      document.removeEventListener('touchmove', touchMoveHandler);
      document.removeEventListener('touchend', touchUpHandler);
      if (dragging) {
        try {
          localStorage.setItem('quickCartFabPos', JSON.stringify({
            top: parseInt(fab.style.top, 10), left: parseInt(fab.style.left, 10)
          }));
        } catch (e) { /* storage may be unavailable */ }
      }
    };

    const mouseMoveHandler = (e) => onMove(e.clientX, e.clientY);
    const mouseUpHandler = () => onEnd();
    const touchMoveHandler = (e) => { if (e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY); };
    const touchUpHandler = () => onEnd();

    const start = (clientX, clientY) => {
      dragging = false;
      fab.dataset.dragged = '0';
      const rect = fab.getBoundingClientRect();
      startX = clientX; startY = clientY;
      startTop = rect.top; startLeft = rect.left;
    };

    fab.addEventListener('mousedown', (e) => {
      start(e.clientX, e.clientY);
      document.addEventListener('mousemove', mouseMoveHandler);
      document.addEventListener('mouseup', mouseUpHandler);
    });
    fab.addEventListener('touchstart', (e) => {
      if (!e.touches[0]) return;
      start(e.touches[0].clientX, e.touches[0].clientY);
      document.addEventListener('touchmove', touchMoveHandler, { passive: true });
      document.addEventListener('touchend', touchUpHandler);
    }, { passive: true });
  },

  closePanel() {
    const panel = document.getElementById('order-pad-panel');
    if (panel) panel.remove();
  },

  positionPanel(panel) {
    const fab = document.getElementById('order-pad-fab');
    if (!fab || window.innerWidth <= 900) return; // mobile CSS handles its own fixed position
    const rect = fab.getBoundingClientRect();
    const panelWidth = 340;
    let left = rect.left;
    if (left + panelWidth > window.innerWidth - 16) left = window.innerWidth - panelWidth - 16;
    if (left < 16) left = 16;
    let top = rect.bottom + 8;
    if (top + 400 > window.innerHeight) top = Math.max(16, rect.top - 8 - 400);
    panel.style.top = top + 'px';
    panel.style.left = left + 'px';
    panel.style.right = 'auto';
  },

  renderPanel() {
    this.closePanel();
    const host = document.getElementById('order-pad-host');
    if (!host) return;
    const order = this.getActive();
    const settings = (typeof App !== 'undefined' && App.settings) || {};
    const total = order.items.reduce((s, i) => s + i.price * i.qty, 0);

    const panel = document.createElement('div');
    panel.id = 'order-pad-panel';
    panel.className = 'order-pad-panel';
    this.positionPanel(panel);
    panel.innerHTML = `
      <div class="order-pad-header">
        <div class="order-pad-header-brand">
          ${settings.logoDataUrl
            ? `<img src="${settings.logoDataUrl}" class="order-pad-header-logo" alt="logo">`
            : `<span style="width:16px;height:16px;display:flex;flex-shrink:0">${Icon.orderpad}</span>`}
          <div class="order-pad-header-titles">
            <strong>Quick Cart</strong>
            ${settings.shopName ? `<span>${escapeHtml(settings.shopName)}</span>` : ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          <button class="order-pad-close" id="op-history-btn" title="Sales History">
            <span style="width:16px;height:16px;display:flex">${Icon.clock}</span>
          </button>
          <button class="order-pad-close" id="op-close-btn">
            <span style="width:16px;height:16px;display:flex">${Icon.x}</span>
          </button>
        </div>
      </div>
      <div class="order-pad-tabs" id="op-tabs">
        ${this.viewMode === 'history' ? `
          <div class="order-pad-tab active" id="op-back-to-order">${Icon.arrowLeft ? `<span style="width:13px;height:13px;display:inline-flex;vertical-align:-2px;margin-right:4px">${Icon.arrowLeft}</span>` : '←'} Back to Order</div>
        ` : this.orders.map(o => `
          <div class="order-pad-tab ${o.id === order.id ? 'active' : ''}" data-tab="${o.id}">
            ${escapeHtml(o.tag)}
            ${this.orders.length > 1 ? `<span class="order-pad-tab-x" data-close-tab="${o.id}">${Icon.x}</span>` : ''}
          </div>
        `).join('')}
        ${this.viewMode === 'history' ? '' : `<div class="order-pad-tab-add" id="op-add-tab">+</div>`}
      </div>
      <div class="order-pad-body">
        ${this.viewMode === 'history' ? this.renderHistoryBody() : `
        <div class="order-pad-title">${escapeHtml(order.tag)}</div>
        <div class="order-pad-field-group">
          <label class="order-pad-field-label">Customer</label>
          <div style="display:flex;gap:8px;align-items:flex-start">
            <div style="position:relative;flex:1">
              <input class="form-input" id="op-name" placeholder="Type a name to search saved customers..." value="${escapeHtml(order.customerName)}" autocomplete="off">
              <div id="op-customer-results" class="order-pad-search-results" style="display:none"></div>
            </div>
            ${!order.customerId ? `
            <button type="button" class="btn-quick-add" id="op-save-customer-btn" title="Save this as a new customer">
              <span style="width:16px;height:16px;display:flex">${Icon.plus}</span>
            </button>` : ''}
          </div>
          ${order.customerId ? `<div class="order-pad-linked-badge">${Icon.check} Linked to saved customer <button type="button" id="op-unlink-customer">Change</button></div>` : ''}
        </div>
        <input class="form-input" id="op-phone" placeholder="Phone number" value="${escapeHtml(order.phone)}" style="margin-bottom:8px">
        <input class="form-input" id="op-address" placeholder="Delivery address (optional)" value="${escapeHtml(order.address)}" style="margin-bottom:8px">
        <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px">
          <div style="position:relative;flex:1">
            <input class="form-input" id="op-search" placeholder="🔍 Search product to add..." autocomplete="off">
            <div id="op-search-results" class="order-pad-search-results"></div>
          </div>
          <button type="button" class="btn-quick-add" id="op-scan-btn" title="Scan a barcode or QR code with your camera">
            <span style="width:16px;height:16px;display:flex">${Icon.camera || Icon.plus}</span>
          </button>
        </div>
        ${order.items.length > 0 ? `
        <div class="order-pad-items">
          ${order.items.map((it, idx) => `
            <div class="order-pad-item-row">
              <span>${escapeHtml(it.name)} <span style="color:var(--text-muted)">×${it.qty}</span></span>
              <span style="display:flex;align-items:center;gap:8px">
                <span class="money">${(it.price * it.qty).toFixed(settings.currencyDecimals ?? 3)}</span>
                <span class="order-pad-item-x" data-remove-item="${idx}">${Icon.x}</span>
              </span>
            </div>
          `).join('')}
          <div class="order-pad-total">Total: <span class="money">${total.toFixed(settings.currencyDecimals ?? 3)} ${settings.currency || ''}</span></div>
        </div>` : ''}
        <textarea class="form-input" id="op-notes" placeholder="Notes..." rows="2" style="margin:8px 0;resize:vertical">${escapeHtml(order.notes)}</textarea>
        <div class="order-pad-actions">
          <button class="btn-icon-label" id="op-to-delivery" style="background:var(--gold-100);color:var(--gold-600)"><span style="width:15px;height:15px;display:flex">${Icon.delivery}</span> Delivery</button>
          <button class="btn-icon-label" id="op-to-invoice" style="background:var(--success-bg);color:var(--success)"><span style="width:15px;height:15px;display:flex">${Icon.printer}</span> Invoice</button>
          <button class="btn-icon-label" id="op-to-wa" style="background:#dcfce7;color:#16a34a"><span style="width:15px;height:15px;display:flex">${Icon.whatsapp}</span> WhatsApp</button>
        </div>
        `}
      </div>
    `;
    host.appendChild(panel);
    if (this.viewMode === 'history') {
      this.bindHistoryEvents();
      if (!this._historySales && !this._historyLoading) this.loadHistory();
    } else {
      this.bindPanelEvents(order);
    }
    document.getElementById('op-history-btn').addEventListener('click', () => {
      this.viewMode = this.viewMode === 'history' ? 'order' : 'history';
      this.renderPanel();
    });
  },

  // ── Sales history, right inside Quick Cart ──────────────────────────────
  // Lets the cashier double-check (and correct, via refund) recent sales
  // without leaving whatever screen they're on.
  async loadHistory() {
    this._historyLoading = true;
    try {
      const [sales] = await Promise.all([Api.get('/sales'), this.loadCustomersIfNeeded()]);
      this._historySales = (Array.isArray(sales) ? sales : [])
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 25);
    } catch (err) {
      this._historySales = [];
      Toast.error('Could not load sales history: ' + err.message);
    } finally {
      this._historyLoading = false;
      if (this.viewMode === 'history') this.renderPanel();
    }
  },

  renderHistoryBody() {
    const settings = (typeof App !== 'undefined' && App.settings) || {};
    if (this._historyLoading || this._historySales === null) {
      return `<div class="empty-state" style="padding:24px 8px">Loading recent sales...</div>`;
    }
    if (this._historySales.length === 0) {
      return `<div class="empty-state" style="padding:24px 8px">No sales recorded yet.</div>`;
    }
    return `
      <div class="order-pad-title">Recent Sales</div>
      <p style="font-size:0.76rem;color:var(--text-muted);margin:-6px 0 10px">
        Spot a mistake? Open a sale to reprint it, or refund it to correct the record.
      </p>
      <div class="order-pad-history-list">
        ${this._historySales.map(s => {
          const customer = s.customerId ? this.customers.find(c => c.id === s.customerId) : null;
          const customerLabel = customer ? customer.name : 'Walk-in';
          return `
          <div class="order-pad-history-row ${s.status === 'refunded' ? 'refunded' : ''}" data-view-sale="${s.id}">
            <div class="order-pad-history-main">
              <strong>${escapeHtml(s.invoiceNo || ('#' + s.id))}</strong>
              <span>${escapeHtml(customerLabel)}</span>
            </div>
            <div class="order-pad-history-side">
              <span class="money">${Number(s.total || 0).toFixed(settings.currencyDecimals ?? 3)}</span>
              <span class="order-pad-history-time">${new Date(s.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            ${s.status === 'refunded' ? '<span class="order-pad-history-badge">Refunded</span>' : `
              <button type="button" class="order-pad-history-refund" data-refund-sale="${s.id}" title="Refund this sale">${Icon.trash || '✕'}</button>
            `}
          </div>
        `;
        }).join('')}
      </div>
      <button type="button" class="btn btn-outline btn-sm" id="op-full-history-link" style="width:100%;margin-top:10px">Open full Sales History screen →</button>
    `;
  },

  bindHistoryEvents() {
    const backBtn = document.getElementById('op-back-to-order');
    if (backBtn) backBtn.addEventListener('click', () => { this.viewMode = 'order'; this.renderPanel(); });

    document.querySelectorAll('[data-view-sale]').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-refund-sale]')) return;
        const id = Number(row.dataset.viewSale);
        this.toggle(); // close the panel so the invoice modal isn't hidden behind it
        if (typeof SalesHistoryScreen !== 'undefined' && SalesHistoryScreen.viewSale) {
          SalesHistoryScreen.viewSale(id);
        }
      });
    });
    document.querySelectorAll('[data-refund-sale]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = Number(btn.dataset.refundSale);
        if (!confirm('Refund this sale? Stock will be restored and it will be marked refunded.')) return;
        try {
          await Api.post(`/sales/${id}/refund`);
          Toast.success('Sale refunded.');
          this._historySales = null;
          await this.loadHistory();
        } catch (err) { Toast.error(err.message); }
      });
    });
    const fullLinkBtn = document.getElementById('op-full-history-link');
    if (fullLinkBtn) {
      fullLinkBtn.addEventListener('click', () => {
        this.toggle();
        if (typeof Router !== 'undefined') Router.navigate('/sales-history');
      });
    }
  },

  // Type 2+ letters of a name or any digits of a phone number and matching
  // saved customers show up here - pick one to autofill phone/address so
  // there's no retyping details already on file.
  showCustomerSuggestions(term) {
    const box = document.getElementById('op-customer-results');
    if (!box) return;
    const q = (term || '').trim().toLowerCase();
    if (q.length < 2) { box.style.display = 'none'; return; }
    const matches = this.customers.filter(c =>
      c.id !== 1 && ((c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q))
    ).slice(0, 6);
    if (matches.length === 0) { box.style.display = 'none'; return; }
    box.innerHTML = matches.map(c => `
      <div class="order-pad-search-result" data-pick-customer="${c.id}">
        <strong>${escapeHtml(c.name)}</strong>
        ${c.phone ? `<span style="color:var(--text-muted);font-size:0.78rem"> ${escapeHtml(c.phone)}</span>` : ''}
      </div>
    `).join('');
    box.style.display = 'block';
    box.querySelectorAll('[data-pick-customer]').forEach(row => {
      row.addEventListener('click', () => {
        const customer = this.customers.find(c => c.id === Number(row.dataset.pickCustomer));
        if (!customer) return;
        const order = this.getActive();
        order.customerId = customer.id;
        order.customerName = customer.name || '';
        order.phone = customer.phone || '';
        if (customer.address && !order.address) order.address = customer.address;
        this.renderPanel();
      });
    });
  },

  bindPanelEvents(order) {
    document.getElementById('op-close-btn').addEventListener('click', () => this.toggle());
    document.getElementById('op-add-tab').addEventListener('click', () => { this.addOrder(); this.renderPanel(); this.renderFab(); });
    document.querySelectorAll('[data-tab]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-close-tab]')) return;
        this.activeId = el.dataset.tab;
        this.renderPanel();
      });
    });
    document.querySelectorAll('[data-close-tab]').forEach(el => {
      el.addEventListener('click', (e) => { e.stopPropagation(); this.removeOrder(el.dataset.closeTab); });
    });

    document.getElementById('op-name').addEventListener('input', (e) => {
      order.customerName = e.target.value;
      order.customerId = null; // typing again means they're no longer using the linked saved customer
      this.updateTabLabel(order);
      this.showCustomerSuggestions(e.target.value);
    });
    document.getElementById('op-name').addEventListener('focus', (e) => this.showCustomerSuggestions(e.target.value));
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#op-customer-results') && e.target.id !== 'op-name') {
        const box = document.getElementById('op-customer-results');
        if (box) box.style.display = 'none';
      }
    });
    const unlinkBtn = document.getElementById('op-unlink-customer');
    if (unlinkBtn) {
      unlinkBtn.addEventListener('click', () => {
        order.customerId = null;
        order.customerName = '';
        order.phone = '';
        this.renderPanel();
      });
    }
    const saveCustomerBtn = document.getElementById('op-save-customer-btn');
    if (saveCustomerBtn) {
      saveCustomerBtn.addEventListener('click', async () => {
        saveCustomerBtn.disabled = true;
        try {
          const record = await this.saveOrderCustomer(order);
          if (record) {
            order.customerId = record.id;
            this.renderPanel();
            Toast.success(`"${record.name}" saved to Customers.`);
          }
        } catch (err) {
          Toast.error(err.message || 'Could not save this customer.');
        } finally {
          if (saveCustomerBtn) saveCustomerBtn.disabled = false;
        }
      });
    }
    document.getElementById('op-phone').addEventListener('input', (e) => { order.phone = e.target.value; });
    document.getElementById('op-address').addEventListener('input', (e) => { order.address = e.target.value; });
    document.getElementById('op-notes').addEventListener('input', (e) => { order.notes = e.target.value; });

    document.querySelectorAll('[data-remove-item]').forEach(el => {
      el.addEventListener('click', () => {
        order.items.splice(Number(el.dataset.removeItem), 1);
        this.renderPanel();
        this.renderFab();
      });
    });

    const scanBtn = document.getElementById('op-scan-btn');
    if (scanBtn) {
      scanBtn.addEventListener('click', () => {
        BarcodeScanner.open({
          onDetect: async (code) => {
            try {
              const results = await Api.get(`/products?search=${encodeURIComponent(code)}`);
              const exact = Array.isArray(results) ? results.find(p => p.barcode === code) : null;
              if (exact) {
                const existing = order.items.find(i => i.productId === exact.id);
                if (existing) existing.qty += 1;
                else order.items.push({ productId: exact.id, name: exact.name, price: exact.sellPrice, qty: 1 });
                this.renderPanel();
                this.renderFab();
                Toast.success(`Added "${exact.name}".`);
              } else {
                Toast.error(`No product found for barcode "${code}".`);
                const input = document.getElementById('op-search');
                if (input) { input.value = code; input.dispatchEvent(new Event('input')); }
              }
            } catch (err) { Toast.error(err.message || 'Scan lookup failed.'); }
          }
        });
      });
    }

    const searchInput = document.getElementById('op-search');
    searchInput.addEventListener('input', (e) => {
      clearTimeout(this._searchTimer);
      const q = e.target.value.trim();
      const resultsBox = document.getElementById('op-search-results');
      if (!q) { resultsBox.innerHTML = ''; resultsBox.style.display = 'none'; return; }
      this._searchTimer = setTimeout(async () => {
        try {
          const products = await Api.get(`/products?search=${encodeURIComponent(q)}`);
          this.renderSearchResults(Array.isArray(products) ? products : [], order);
        } catch (err) { /* ignore search errors silently */ }
      }, 250);
    });

    document.getElementById('op-to-delivery').addEventListener('click', () => this.convertToDelivery(order));
    document.getElementById('op-to-invoice').addEventListener('click', () => this.convertToInvoice(order));
    document.getElementById('op-to-wa').addEventListener('click', () => this.sendWhatsApp(order));
  },

  renderSearchResults(products, order) {
    const box = document.getElementById('op-search-results');
    if (!box) return;
    if (products.length === 0) {
      box.innerHTML = `<div class="order-pad-search-empty">No products found.</div>`;
      box.style.display = 'block';
      return;
    }
    box.innerHTML = products.slice(0, 8).map(p => `
      <div class="order-pad-search-item" data-add-product='${JSON.stringify({ id: p.id, name: p.name, price: p.sellPrice }).replace(/'/g, '&#39;')}'>
        <span>${escapeHtml(p.name)}</span>
        <span class="money">${Number(p.sellPrice).toFixed(3)}</span>
      </div>
    `).join('');
    box.style.display = 'block';
    box.querySelectorAll('[data-add-product]').forEach(el => {
      el.addEventListener('click', () => {
        const data = JSON.parse(el.dataset.addProduct);
        const existing = order.items.find(i => i.productId === data.id);
        if (existing) existing.qty += 1;
        else order.items.push({ productId: data.id, name: data.name, price: data.price, qty: 1 });
        document.getElementById('op-search').value = '';
        box.innerHTML = ''; box.style.display = 'none';
        this.renderPanel();
        this.renderFab();
      });
    });
  },

  // Creates (or matches, if one already exists by that name/phone) a real
  // Customer record from whatever is currently typed in the Quick Cart
  // fields, so anyone entered here always ends up saved in the Customers
  // module - not just kept in this order's local memory. Returns the
  // customer record, or null if there's no name to save.
  async saveOrderCustomer(order) {
    const name = (order.customerName || '').trim();
    if (!name) return null;
    await this.loadCustomersIfNeeded();
    const existing = this.customers.find(c =>
      c.name.trim().toLowerCase() === name.toLowerCase() ||
      (order.phone && c.phone && c.phone.replace(/\D/g, '') === order.phone.replace(/\D/g, '') && order.phone.replace(/\D/g, ''))
    );
    if (existing) return existing;
    const created = await Api.post('/customers', {
      name, phone: order.phone || '', address: order.address || ''
    });
    this.customers.push(created);
    return created;
  },

  updateTabLabel(order) {
    const tabEl = document.querySelector(`[data-tab="${order.id}"]`);
    if (tabEl && order.customerName) {
      tabEl.childNodes[0].textContent = order.customerName;
    }
  },

  async convertToDelivery(order) {
    if (order.items.length === 0) { Toast.error('Add at least one product first.'); return; }
    if (!order.address.trim()) { Toast.error('Enter a delivery address to convert to a delivery order.'); return; }
    try {
      if (!order.customerId && order.customerName.trim()) {
        try { const rec = await this.saveOrderCustomer(order); if (rec) order.customerId = rec.id; }
        catch (e) { /* still create the delivery even if saving the customer record fails */ }
      }
      await Api.post('/deliveries', {
        customerId: order.customerId || null,
        customerName: order.customerName || 'Walk-in',
        customerPhone: order.phone || '',
        address: order.address,
        notes: order.notes || '',
        items: order.items.map(i => ({ productId: i.productId, quantity: i.qty, unitPrice: i.price })),
        paymentMethod: 'cash'
      });
      Toast.success('Delivery order created.');
      this.removeOrder(order.id);
      if (typeof Router !== 'undefined' && window.location.hash === '#/delivery') Router.reload?.();
      if (typeof DashboardScreen !== 'undefined' && window.location.hash === '#/dashboard') DashboardScreen.load();
    } catch (err) {
      Toast.error(err.message);
    }
  },

  async convertToInvoice(order) {
    if (order.items.length === 0) { Toast.error('Add at least one product first.'); return; }
    try {
      if (!order.customerId && order.customerName.trim()) {
        try { const rec = await this.saveOrderCustomer(order); if (rec) order.customerId = rec.id; }
        catch (e) { /* still create the invoice even if saving the customer record fails */ }
      }
      const notes = order.customerName ? `Quick Cart - ${order.customerName}${order.notes ? ' / ' + order.notes : ''}` : (order.notes || '');
      const sale = await Api.post('/sales', {
        items: order.items.map(i => ({ productId: i.productId, quantity: i.qty, unitPrice: i.price })),
        paymentMethod: 'cash',
        orderType: 'walk_in',
        customerId: order.customerId || null,
        notes
      });
      Toast.success(`Invoice ${sale.invoiceNo} created.`);
      if (typeof Receipt !== 'undefined' && Receipt.print) Receipt.print(sale, App.settings);
      this.removeOrder(order.id);
    } catch (err) {
      Toast.error(err.message);
    }
  },

  sendWhatsApp(order) {
    if (order.items.length === 0) { Toast.error('Add at least one product first.'); return; }
    const settings = (typeof App !== 'undefined' && App.settings) || {};
    const total = order.items.reduce((s, i) => s + i.price * i.qty, 0);
    const lines = [
      `*${settings.shopName || 'Order'}*`,
      order.customerName ? `Customer: ${order.customerName}` : '',
      '',
      ...order.items.map(i => `${i.name} x${i.qty} - ${(i.price * i.qty).toFixed(3)}`),
      '',
      `Total: ${total.toFixed(3)} ${settings.currency || ''}`,
      order.notes ? `\nNotes: ${order.notes}` : ''
    ].filter(Boolean);
    const text = encodeURIComponent(lines.join('\n'));
    const phoneDigits = (order.phone || '').replace(/\D/g, '');
    const url = phoneDigits ? `https://wa.me/${phoneDigits}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(url, '_blank');
  }
};
