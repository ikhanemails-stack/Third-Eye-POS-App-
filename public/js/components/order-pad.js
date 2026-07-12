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
    const order = { id: 'op' + Date.now() + n, tag: `Order #${n}`, customerName: '', phone: '', address: '', notes: '', items: [] };
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
    if (this.open) this.renderPanel(); else this.closePanel();
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
  restoreFabPosition(fab) {
    try {
      const saved = JSON.parse(localStorage.getItem('quickCartFabPos') || 'null');
      if (saved && typeof saved.top === 'number' && typeof saved.left === 'number') {
        fab.style.top = saved.top + 'px';
        fab.style.left = saved.left + 'px';
        fab.style.right = 'auto';
      }
    } catch (e) { /* ignore malformed saved position */ }
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
        <div style="display:flex;align-items:center;gap:8px">
          <span style="width:16px;height:16px;display:flex">${Icon.orderpad}</span>
          <strong>Quick Cart</strong>
        </div>
        <button class="order-pad-close" id="op-close-btn">
          <span style="width:16px;height:16px;display:flex">${Icon.x}</span>
        </button>
      </div>
      <div class="order-pad-tabs" id="op-tabs">
        ${this.orders.map(o => `
          <div class="order-pad-tab ${o.id === order.id ? 'active' : ''}" data-tab="${o.id}">
            ${escapeHtml(o.tag)}
            ${this.orders.length > 1 ? `<span class="order-pad-tab-x" data-close-tab="${o.id}">${Icon.x}</span>` : ''}
          </div>
        `).join('')}
        <div class="order-pad-tab-add" id="op-add-tab">+</div>
      </div>
      <div class="order-pad-body">
        <div class="order-pad-title">${escapeHtml(order.tag)}</div>
        <input class="form-input" id="op-name" placeholder="Customer name" value="${escapeHtml(order.customerName)}" style="margin-bottom:8px">
        <input class="form-input" id="op-phone" placeholder="Phone number" value="${escapeHtml(order.phone)}" style="margin-bottom:8px">
        <input class="form-input" id="op-address" placeholder="Delivery address (optional)" value="${escapeHtml(order.address)}" style="margin-bottom:8px">
        <div style="position:relative;margin-bottom:8px">
          <input class="form-input" id="op-search" placeholder="🔍 Search product to add..." autocomplete="off">
          <div id="op-search-results" class="order-pad-search-results"></div>
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
          <button class="btn-icon-label" id="op-to-delivery" style="background:var(--gold-100);color:var(--gold-600)"><span style="width:14px;height:14px;display:flex">${Icon.delivery}</span> → Delivery</button>
          <button class="btn-icon-label" id="op-to-invoice" style="background:var(--success-bg);color:var(--success)"><span style="width:14px;height:14px;display:flex">${Icon.printer}</span> → Invoice</button>
          <button class="btn-icon-label" id="op-to-wa">💬 WA</button>
        </div>
      </div>
    `;
    host.appendChild(panel);
    this.bindPanelEvents(order);
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

    document.getElementById('op-name').addEventListener('input', (e) => { order.customerName = e.target.value; this.updateTabLabel(order); });
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
      await Api.post('/deliveries', {
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
      const notes = order.customerName ? `Quick Cart - ${order.customerName}${order.notes ? ' / ' + order.notes : ''}` : (order.notes || '');
      const sale = await Api.post('/sales', {
        items: order.items.map(i => ({ productId: i.productId, quantity: i.qty, unitPrice: i.price })),
        paymentMethod: 'cash',
        orderType: 'walk_in',
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
