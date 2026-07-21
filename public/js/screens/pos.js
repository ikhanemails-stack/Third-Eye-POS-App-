// Third Eye Computer Solutions - POS System
// Point of Sale checkout screen - the core sales workflow.
// Includes order type (walk-in / delivery / pickup), customer selection,
// coupon codes, and loyalty point redemption.

const PosScreen = {
  cart: [],
  products: [],
  categories: [],
  customers: [],
  drivers: [],
  activeCategory: null,
  searchTerm: '',
  orderType: 'walk_in',
  selectedCustomerId: null,
  appliedCoupon: null,
  redeemPoints: 0,

  async render() {
    Shell.mount('/pos', `<div class="empty-state">Loading products...</div>`);
    try {
      let productsRes;
      [productsRes, this.categories, this.customers, this.drivers] = await Promise.all([
        Api.get('/products?limit=200&page=1'),  // Load first 200 fast, search loads more
        Api.get('/categories'),
        Api.get('/customers'),
        Api.get('/drivers')
      ]);
      // /products with page+limit returns {products, total, page, limit} instead of
      // a plain array — unwrap it so the rest of this screen can treat it as a list.
      this.products = Array.isArray(productsRes) ? productsRes : (productsRes.products || []);
    } catch (err) {
      Toast.error(err.message);
      return;
    }
    this.activeCategory = null;
    this.searchTerm = '';
    this.orderType = 'walk_in';
    this.selectedCustomerId = null;
    this.appliedCoupon = null;
    this.redeemPoints = 0;
    this.renderScreen();
  },

  renderScreen() {
    const content = `
      <div class="pos-screen">
        <div class="pos-products-pane">
          <div class="pos-search-bar" style="position:relative">
            <input class="form-input" id="pos-search" placeholder="Search by name or scan barcode..." value="${escapeHtml(this.searchTerm)}" autocomplete="off" autofocus>
            <button type="button" class="btn btn-outline" id="camera-scan-btn" title="Scan a barcode using your camera">📷 Scan</button>
            <div class="search-dropdown" id="pos-search-dropdown"></div>
          </div>
          <div class="pos-category-chips" id="pos-chips">
            <button class="chip ${this.activeCategory === null ? 'active' : ''}" data-cat="">All</button>
            ${this.categories.map(c => `<button class="chip ${this.activeCategory === c.id ? 'active' : ''}" data-cat="${c.id}">${escapeHtml(c.name)}</button>`).join('')}
          </div>
          <div class="pos-product-grid" id="pos-product-grid"></div>
        </div>
        <div class="pos-cart-pane">
          <div class="pos-cart-header">
            <h3>Current Sale${this.cart.length > 0 ? `<span class="item-count-badge">${this.cart.reduce((s, l) => s + l.quantity, 0)} items</span>` : ''}</h3>
            <button class="btn btn-ghost btn-sm" id="clear-cart-btn">Clear</button>
          </div>

          <div class="pos-cart-scroll-area">
            <div class="pos-cart-controls">
              <div class="order-type-grid">
                <button class="order-type-btn ${this.orderType === 'walk_in' ? 'active' : ''}" data-type="walk_in">
                  ${Icon.customers} Walk-in
                </button>
                <button class="order-type-btn ${this.orderType === 'delivery' ? 'active' : ''}" data-type="delivery">
                  ${Icon.delivery} Delivery
                </button>
                <button class="order-type-btn ${this.orderType === 'pickup' ? 'active' : ''}" data-type="pickup">
                  ${Icon.box} Pickup
                </button>
              </div>
              <div style="display:flex;gap:8px;align-items:center">
                <div style="flex:1;position:relative">
                  <input type="text" class="form-input" id="pos-customer-search" list="pos-customer-list"
                    placeholder="Walk-in Customer (type name or phone to search)..." autocomplete="off"
                    value="${(() => { const sc = this.customers.find(c => c.id === this.selectedCustomerId); return sc ? escapeHtml(sc.name) : ''; })()}">
                  <datalist id="pos-customer-list">
                    ${this.customers.filter(c => c.id !== 1).map(c => `<option data-id="${c.id}" value="${escapeHtml(c.name)}">${c.phone ? escapeHtml(c.phone) : ''}</option>`).join('')}
                  </datalist>
                  <div class="search-dropdown" id="pos-customer-dropdown"></div>
                </div>
                <button type="button" class="btn-quick-add" id="pos-customer-add-btn" title="Add new customer">
                  <span style="width:16px;height:16px;display:flex">${Icon.plus}</span>
                </button>
              </div>
              <div id="delivery-fields"></div>
            </div>

            <div class="pos-cart-items" id="pos-cart-items"></div>
          </div>
          <div class="pos-cart-summary" id="pos-cart-summary"></div>
        </div>
      </div>
    `;
    document.getElementById('content').innerHTML = content;
    this.renderProductGrid();
    this.renderDeliveryFields();
    this.renderCart();

    const custInput = document.getElementById('pos-customer-search');
    this._cDropdownIdx = -1;
    custInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      // A datalist <option value="..."> that exactly matches what's typed
      // means the person picked (or typed exactly) that suggestion - this
      // is the standard way to detect a datalist "selection" since there's
      // no dedicated select event for it.
      const match = this.customers.find(c => c.name === val);
      this.selectedCustomerId = match ? match.id : null;
      this.renderDeliveryFields();
      this.renderCart();
      this.renderCustomerDropdown(val);
    });
    custInput.addEventListener('focus', () => this.renderCustomerDropdown(custInput.value.trim()));
    custInput.addEventListener('keydown', (e) => {
      const list = this._cDropdownMatches || [];
      if (e.key === 'ArrowDown' && list.length) {
        e.preventDefault();
        this._cDropdownIdx = Math.min(this._cDropdownIdx + 1, list.length - 1);
        this.highlightDropdown('pos-customer-dropdown', this._cDropdownIdx);
      } else if (e.key === 'ArrowUp' && list.length) {
        e.preventDefault();
        this._cDropdownIdx = Math.max(this._cDropdownIdx - 1, 0);
        this.highlightDropdown('pos-customer-dropdown', this._cDropdownIdx);
      } else if (e.key === 'Enter') {
        if (this._cDropdownIdx >= 0 && list[this._cDropdownIdx]) {
          e.preventDefault();
          this.selectCustomerFromDropdown(list[this._cDropdownIdx]);
        }
      } else if (e.key === 'Escape') {
        this.closeCustomerDropdown();
      }
    });
    // Delay the close so a tap/click on a dropdown row (below) registers
    // before the input's blur wipes the dropdown out from under it.
    custInput.addEventListener('blur', () => setTimeout(() => this.closeCustomerDropdown(), 180));
    document.getElementById('pos-customer-add-btn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const name = custInput.value.trim();
      if (!name) { Toast.error('Type the new customer\'s name first, then click +.'); return; }
      // Case-insensitive match so "khan" vs "Khan" doesn't silently create a
      // near-duplicate - and so the person always gets clear feedback about
      // what happened instead of the button appearing to do nothing.
      const existing = this.customers.find(c => c.name.trim().toLowerCase() === name.toLowerCase());
      if (existing) {
        this.selectedCustomerId = existing.id;
        this.renderDeliveryFields();
        this.renderCart();
        Toast.info(`"${existing.name}" already exists - selected it instead of creating a duplicate.`);
        return;
      }
      btn.disabled = true;
      try {
        const created = await Api.post('/customers', { name });
        this.customers.push(created);
        this.selectedCustomerId = created.id;
        Toast.success(`"${created.name}" added to Customers.`);
        this.renderScreen();
      } catch (err) {
        Toast.error(err.message || 'Could not add this customer.');
      } finally {
        btn.disabled = false;
      }
    });

    // Debounced search for performance with 3000+ products
    let searchTimer = null;
    this._pDropdownIdx = -1;
    document.getElementById('pos-search').addEventListener('input', async (e) => {
      this.searchTerm = e.target.value.trim();
      this._pDropdownIdx = -1;

      // Instant barcode match in loaded products
      const exact = this.products.find(p => p.barcode === this.searchTerm);
      if (exact && this.searchTerm.length > 3) {
        this.handleBarcodeEnter();
        return;
      }

      clearTimeout(searchTimer);
      if (!this.searchTerm) {
        this.renderProductGrid();
        this.closeProductDropdown();
        return;
      }
      this.renderProductDropdown(); // instant dropdown from what's already loaded, refined below

      // Search server-side for full 3000 product database
      searchTimer = setTimeout(async () => {
        try {
          const result = await Api.get(`/products?search=${encodeURIComponent(this.searchTerm)}&limit=50`);
          // Server returns array directly when not paginated
          this._searchResults = Array.isArray(result) ? result : (result.products || []);
          this._isSearchMode = true;
          this.renderProductGrid();
          this.renderProductDropdown();
        } catch(e) {
          this._isSearchMode = false;
          this.renderProductGrid();
        }
      }, 200);
    });
    document.getElementById('pos-search').addEventListener('focus', () => {
      if (this.searchTerm) this.renderProductDropdown();
    });
    document.getElementById('pos-search').addEventListener('keydown', (e) => {
      const list = this._pDropdownMatches || [];
      if (e.key === 'ArrowDown' && list.length) {
        e.preventDefault();
        this._pDropdownIdx = Math.min(this._pDropdownIdx + 1, list.length - 1);
        this.highlightDropdown('pos-search-dropdown', this._pDropdownIdx);
        return;
      }
      if (e.key === 'ArrowUp' && list.length) {
        e.preventDefault();
        this._pDropdownIdx = Math.max(this._pDropdownIdx - 1, 0);
        this.highlightDropdown('pos-search-dropdown', this._pDropdownIdx);
        return;
      }
      if (e.key === 'Enter') {
        if (this._pDropdownIdx >= 0 && list[this._pDropdownIdx]) {
          e.preventDefault();
          this.selectProductFromDropdown(list[this._pDropdownIdx]);
          return;
        }
        this.handleBarcodeEnter();
        return;
      }
      if (e.key === 'Escape') this.closeProductDropdown();
    });
    // Same delayed-close trick as the customer field above.
    document.getElementById('pos-search').addEventListener('blur', () => setTimeout(() => this.closeProductDropdown(), 180));
    document.getElementById('camera-scan-btn').addEventListener('click', () => this.openCameraScanModal());
    document.getElementById('pos-chips').addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      this.activeCategory = btn.dataset.cat ? Number(btn.dataset.cat) : null;
      this.renderScreen();
    });
    document.getElementById('clear-cart-btn').addEventListener('click', () => {
      this.cart = [];
      this.appliedCoupon = null;
      this.redeemPoints = 0;
      this.renderCart();
      this.focusSearch();
    });
    document.querySelectorAll('.order-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.orderType = btn.dataset.type;
        document.querySelectorAll('.order-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.renderDeliveryFields();
      });
    });
  },

  renderDeliveryFields() {
    const el = document.getElementById('delivery-fields');
    if (this.orderType !== 'delivery') { el.innerHTML = ''; return; }
    const selectedCustomer = this.customers.find(c => c.id === this.selectedCustomerId);
    el.innerHTML = `
      <div class="pos-delivery-fields">
        <div class="form-group">
          <label class="form-label">Delivery Address</label>
          <textarea class="form-textarea" id="delivery-address" rows="2" placeholder="Building, Road, Block, Manama...">${selectedCustomer?.address ? escapeHtml(selectedCustomer.address) : ''}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Phone</label>
            <input class="form-input" id="delivery-phone" value="${selectedCustomer?.phone ? escapeHtml(selectedCustomer.phone) : ''}">
          </div>
          <div class="form-group">
            ${QuickAddSelect.render({ id: 'delivery-driver', label: 'Driver', options: this.drivers, placeholder: 'Unassigned' })}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Delivery Fee (${escapeHtml(App.settings.currency || 'BHD')})</label>
          <input class="form-input" id="delivery-fee" type="number" step="0.001" value="0">
        </div>
      </div>
    `;
    QuickAddSelect.wire('delivery-driver', (name) => Api.post('/drivers', { name }), (created) => {
      this.drivers.push(created);
    });
  },

  // Puts the cursor back in the POS search box so the cashier can keep
  // scanning/typing without having to click back into it after every
  // action (adding an item, changing quantity, closing a modal, etc.)
  focusSearch() {
    const input = document.getElementById('pos-search');
    if (input) input.focus();
  },

  // ── Keyboard-navigable search dropdowns ────────────────────────────────
  // Both the product search and the customer search need the same thing: a
  // list that appears under the input as you type, that you can move
  // through with the arrow keys and pick with Enter (or tap on mobile).
  // Built custom rather than relying on <datalist> because datalist simply
  // does not render a dropdown UI at all in several in-app browsers
  // (WhatsApp's built-in browser, Instagram's, etc.) - so on a phone opened
  // via a WhatsApp-shared link, typing produced no visible suggestions at
  // all even though the underlying data was there.
  highlightDropdown(containerId, idx) {
    const box = document.getElementById(containerId);
    if (!box) return;
    box.querySelectorAll('.search-dropdown-item').forEach((el, i) => {
      el.classList.toggle('active', i === idx);
      if (i === idx) el.scrollIntoView({ block: 'nearest' });
    });
  },

  renderProductDropdown() {
    const box = document.getElementById('pos-search-dropdown');
    if (!box) return;
    if (!this.searchTerm) { this.closeProductDropdown(); return; }
    const matches = this.getFilteredProducts().slice(0, 8);
    this._pDropdownMatches = matches;
    if (matches.length === 0) {
      const isBarcodeLike = /^\d{6,}$/.test(this.searchTerm);
      box.innerHTML = `
        <div class="search-dropdown-empty">
          No product found for "${escapeHtml(this.searchTerm)}".
          <button type="button" class="btn btn-gold btn-sm" id="dropdown-create-product-btn" style="margin-top:8px;width:100%;justify-content:center">
            + Create "${escapeHtml(this.searchTerm)}" as a new product
          </button>
        </div>`;
      box.classList.add('open');
      const createBtn = document.getElementById('dropdown-create-product-btn');
      if (createBtn) {
        createBtn.addEventListener('mousedown', (e) => {
          e.preventDefault(); // keep focus so 'blur' doesn't close this first
          const term = this.searchTerm.trim();
          this.closeProductDropdown();
          this.openInlineProductCreate(isBarcodeLike ? { barcode: term } : { name: term });
        });
      }
      return;
    }
    box.innerHTML = matches.map((p, i) => `
      <div class="search-dropdown-item ${i === this._pDropdownIdx ? 'active' : ''}" data-idx="${i}">
        <span class="sdi-name">${escapeHtml(p.name)}</span>
        <span class="sdi-meta">${p.stock <= 0 ? '<span class="sdi-oos">Out of stock</span>' : `${p.stock} ${escapeHtml(p.unit || '')} left`} · ${formatMoneyPlain(p.sellPrice, App.settings)}</span>
      </div>
    `).join('');
    box.classList.add('open');
    box.querySelectorAll('.search-dropdown-item').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault(); // keeps focus in the input so 'blur' doesn't close this first
        const p = matches[Number(el.dataset.idx)];
        if (p) this.selectProductFromDropdown(p);
      });
    });
  },

  selectProductFromDropdown(product) {
    if (product.stock <= 0) { Toast.error(`"${product.name}" is out of stock.`); return; }
    this.addToCart(product);
    this.searchTerm = '';
    this._pDropdownIdx = -1;
    const input = document.getElementById('pos-search');
    if (input) input.value = '';
    this.closeProductDropdown();
    this.renderProductGrid();
    this.focusSearch();
  },

  closeProductDropdown() {
    const box = document.getElementById('pos-search-dropdown');
    if (box) { box.classList.remove('open'); box.innerHTML = ''; }
  },

  renderCustomerDropdown(term) {
    const box = document.getElementById('pos-customer-dropdown');
    if (!box) return;
    if (!term) { this.closeCustomerDropdown(); return; }
    const t = term.toLowerCase();
    const matches = this.customers
      .filter(c => c.id !== 1 && (c.name.toLowerCase().includes(t) || (c.phone && c.phone.includes(t))))
      .slice(0, 8);
    this._cDropdownMatches = matches;
    if (matches.length === 0) { this.closeCustomerDropdown(); return; }
    box.innerHTML = matches.map((c, i) => `
      <div class="search-dropdown-item ${i === this._cDropdownIdx ? 'active' : ''}" data-idx="${i}">
        <span class="sdi-name">${escapeHtml(c.name)}</span>
        <span class="sdi-meta">${c.phone ? escapeHtml(c.phone) : ''}</span>
      </div>
    `).join('');
    box.classList.add('open');
    box.querySelectorAll('.search-dropdown-item').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const c = matches[Number(el.dataset.idx)];
        if (c) this.selectCustomerFromDropdown(c);
      });
    });
  },

  selectCustomerFromDropdown(customer) {
    this.selectedCustomerId = customer.id;
    this._cDropdownIdx = -1;
    const input = document.getElementById('pos-customer-search');
    if (input) input.value = customer.name;
    this.closeCustomerDropdown();
    this.renderDeliveryFields();
    this.renderCart();
  },

  closeCustomerDropdown() {
    const box = document.getElementById('pos-customer-dropdown');
    if (box) { box.classList.remove('open'); box.innerHTML = ''; }
  },

  // Camera-based barcode scanning for devices without a hardware scanner
  // (phones, tablets, laptop webcams). Uses the shared BarcodeScanner
  // component (components/barcode-scanner.js) so this and Quick Cart run
  // the exact same scanning logic.
  openCameraScanModal() {
    BarcodeScanner.open({
      onDetect: (value) => {
        this.searchTerm = value;
        const input = document.getElementById('pos-search');
        if (input) input.value = value;
        this.handleBarcodeEnter();
      }
    });
  },

  handleBarcodeEnter() {
    const term = this.searchTerm.trim();
    if (!term) return;
    const exact = this.products.find(p => p.barcode === term);
    if (exact) {
      this.addToCart(exact);
      this.searchTerm = '';
      const input = document.getElementById('pos-search');
      if (input) input.value = '';
      this.renderProductGrid();
      return;
    }
    // No match for a barcode-shaped entry (typed manually or via a
    // USB/Bluetooth scanner, which just types the code + Enter - unlike
    // the camera scanner, this path used to silently do nothing here).
    // Auto-prompt to create it, same as handleExternalScan below.
    const isBarcodeLike = /^\d{6,}$/.test(term);
    if (isBarcodeLike) {
      Toast.error(`No product found for barcode "${term}". Create it?`);
      this.closeProductDropdown();
      this.openInlineProductCreate({ barcode: term });
    }
  },

  // Called by the global scanner (components/global-scanner.js) when a
  // barcode is scanned from ANY screen, not just while already on POS -
  // it routes here first, then hands off the code.
  handleExternalScan(code) {
    this.searchTerm = code;
    const input = document.getElementById('pos-search');
    if (input) input.value = code;
    const exact = this.products.find(p => p.barcode === code);
    if (exact) {
      this.addToCart(exact);
      this.searchTerm = '';
      if (input) input.value = '';
      this.renderProductGrid();
      Toast.success(`${exact.name} added to cart.`);
      return;
    }
    this.renderProductGrid();
    Toast.error(`No product found for barcode "${code}".`);
    this.openInlineProductCreate({ barcode: code });
  },

  // Opens the full Products "Add Product" modal (same fields, same online
  // photo/barcode lookup as the Products screen) right on top of POS,
  // instead of redirecting the cashier away from the sale in progress.
  // Whatever gets created is immediately added to the cart and to this
  // screen's product list, and it's already saved in the Products catalog
  // via the same API call the Products screen uses - so it shows up there
  // too without any extra step.
  openInlineProductCreate({ barcode, name } = {}) {
    // NOTE: `const InventoryScreen = {...}` at the top level of a plain
    // script does NOT attach to `window` (that's only true for `var` /
    // function declarations) - checking `window.InventoryScreen` was
    // always false and made this whole button say "Products module not
    // loaded" no matter what. `typeof InventoryScreen !== 'undefined'` is
    // the correct check (same pattern already used elsewhere for Router,
    // DashboardScreen, etc. in this file).
    if (typeof InventoryScreen === 'undefined') { Toast.error('Products module not loaded.'); return; }
    InventoryScreen.openProductModal(null, (created) => {
      if (created) {
        if (!this.products.find(p => p.id === created.id)) this.products.push(created);
        this.renderProductGrid();
        this.addToCart(created);
        Toast.success(`"${created.name}" created, saved to your Products catalog, and added to the cart.`);
        // New products start at 0 stock - immediately ask how that stock
        // actually arrived so it isn't left at 0 by accident.
        this.promptStockSource(created);
      }
      this.focusSearch();
    });
    setTimeout(() => {
      const barcodeInput = document.getElementById('p-barcode');
      const nameInput = document.getElementById('p-name');
      if (barcode && barcodeInput) { barcodeInput.value = barcode; if (nameInput) nameInput.focus(); }
      else if (name && nameInput) { nameInput.value = name; }
    }, 60);
  },

  // Right after a new product is created, ask whether the stock on hand
  // came from a fresh supplier purchase (which should go through Purchases
  // so there's a proper invoice/cost/supplier record) or whether it's just
  // stock you already physically have and need to record a starting count
  // for (no invoice involved).
  promptStockSource(product) {
    Modal.open(`Add stock for "${product.name}"?`, `
      <p style="color:var(--text-secondary);font-size:0.86rem;margin-bottom:16px">
        This product was just created with 0 in stock. How did this stock come in? You can always add more later from Purchases.
      </p>
      <div style="display:flex;flex-direction:column;gap:10px">
        <button type="button" class="btn btn-gold" id="stock-source-purchase" style="justify-content:flex-start;padding:14px 16px;text-align:left;line-height:1.4">
          🧾 <strong>New Purchase</strong><br><span style="font-weight:400;font-size:0.8rem;opacity:0.85">I have a supplier invoice/bill for this stock</span>
        </button>
        <button type="button" class="btn btn-outline" id="stock-source-onhand" style="justify-content:flex-start;padding:14px 16px;text-align:left;line-height:1.4">
          📦 <strong>Already On Hand</strong><br><span style="font-weight:400;font-size:0.8rem;color:var(--text-muted)">Just set the quantity I currently have - no invoice</span>
        </button>
        <button type="button" class="btn btn-outline" id="stock-source-skip" style="justify-content:center;padding:10px 16px;color:var(--text-muted)">
          Skip for now
        </button>
      </div>
    `);
    const purchaseBtn = document.getElementById('stock-source-purchase');
    const onHandBtn = document.getElementById('stock-source-onhand');
    const skipBtn = document.getElementById('stock-source-skip');
    if (purchaseBtn) purchaseBtn.addEventListener('click', () => { Modal.close(); this.sendToNewPurchase(product); });
    if (onHandBtn) onHandBtn.addEventListener('click', () => this.promptOnHandQuantity(product));
    if (skipBtn) skipBtn.addEventListener('click', () => Modal.close());
  },

  // "Already On Hand" path: just record a starting stock count directly on
  // the product, no purchase/invoice record created.
  promptOnHandQuantity(product) {
    Modal.open(`On-Hand Quantity - ${escapeHtml(product.name)}`, `
      <div class="form-group">
        <label class="form-label">How many ${escapeHtml(product.unit || 'units')} do you currently have?</label>
        <input class="form-input" id="onhand-qty" type="number" min="0" step="1" value="0">
      </div>
      <button type="button" class="btn btn-gold" id="onhand-save-btn" style="width:100%;justify-content:center;padding:12px;margin-top:8px">Save Stock Count</button>
    `);
    const qtyInput = document.getElementById('onhand-qty');
    if (qtyInput) { qtyInput.focus(); qtyInput.select(); }
    document.getElementById('onhand-save-btn').addEventListener('click', async () => {
      const qty = Number(qtyInput.value);
      if (isNaN(qty) || qty < 0) { Toast.error('Enter a valid quantity (0 or more).'); return; }
      const delta = qty - (product.stock || 0);
      if (delta === 0) { Toast.success('Stock already matches - nothing to change.'); Modal.close(); return; }
      try {
        // `stock` isn't a directly-settable field on PUT /products/:id -
        // stock changes go through /adjust-stock, which takes a relative
        // delta and also logs a stock_movements entry for the audit trail.
        const updated = await Api.post(`/products/${product.id}/adjust-stock`, {
          quantity: delta,
          note: 'Initial on-hand quantity set from POS'
        });
        const idx = this.products.findIndex(p => p.id === product.id);
        if (idx >= 0) this.products[idx] = updated;
        this.renderProductGrid();
        Toast.success(`Stock for "${product.name}" set to ${qty} ${product.unit || ''}.`);
        Modal.close();
      } catch (err) { Toast.error(err.message); }
    });
  },

  // "New Purchase" path: hand off to the full Purchases screen (supplier,
  // cost, invoice attachment) with this product pre-selected so the
  // cashier just has to enter qty/cost and hit Save.
  sendToNewPurchase(product) {
    if (typeof PurchasesScreen === 'undefined' || typeof Router === 'undefined') {
      Toast.error('Purchases module not loaded.');
      return;
    }
    Router.navigate('/purchases');
    setTimeout(() => {
      PurchasesScreen.openNewPurchaseModal();
      setTimeout(() => {
        const select = document.getElementById('purchase-product-select');
        if (select) {
          select.value = product.id;
          select.dispatchEvent(new Event('change'));
          const qtyInput = document.getElementById('purchase-qty');
          if (qtyInput) qtyInput.focus();
        }
      }, 150);
    }, 150);
  },

  getFilteredProducts() {
    // If we have server search results, use those
    if (this._isSearchMode && this.searchTerm && this._searchResults) {
      return this._searchResults;
    }
    let list = this.products || [];
    if (this.activeCategory !== null) list = list.filter(p => p.categoryId === this.activeCategory);
    if (this.searchTerm && this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(term) || (p.barcode && p.barcode.includes(term)));
    }
    return list;
  },

  renderProductGrid() {
    const grid = document.getElementById('pos-product-grid');
    const list = this.getFilteredProducts();
    const MAX_DISPLAY = 48; // Show max 48 for performance — search to narrow down
    const displayed = list.slice(0, MAX_DISPLAY);

    if (list.length === 0) {
      const term = this.searchTerm.trim();
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <p>${term ? `No product found for "${escapeHtml(term)}".` : 'No products found.'}</p>
          ${term ? `<button type="button" class="btn btn-gold" id="pos-create-product-btn" style="margin-top:10px">+ Create "${escapeHtml(term)}" as a new product</button>` : ''}
        </div>`;
      const createBtn = document.getElementById('pos-create-product-btn');
      if (createBtn) {
        createBtn.addEventListener('click', () => {
          const isBarcodeLike = /^\d{6,}$/.test(term);
          this.openInlineProductCreate(isBarcodeLike ? { barcode: term } : { name: term });
        });
      }
      return;
    }

    const moreCount = list.length - MAX_DISPLAY;
    grid.innerHTML = displayed.map(p => {
      const inCart = this.cart.find(c => c.productId === p.id);
      return `
      <button class="pos-product-card ${p.stock <= 0 ? 'out-of-stock' : ''} ${inCart ? 'in-cart' : ''}" data-id="${p.id}" ${p.stock <= 0 ? 'disabled' : ''}>
        ${inCart ? `<div class="in-cart-badge">${inCart.quantity}</div>` : ''}
        ${p.photo ? `<img class="pos-product-photo" src="${escapeHtml(p.photo)}" alt="">` : ''}
        <div class="pname">${escapeHtml(p.name)}</div>
        <div class="pstock">${p.stock} ${escapeHtml(p.unit)} in stock</div>
        <div class="pprice">${formatMoneyPlain(p.sellPrice, App.settings)}</div>
      </button>
    `;
    }).join('') + (moreCount > 0 ? `<div class="empty-state" style="grid-column:1/-1;padding:12px;font-size:13px;color:var(--text-muted)">🔍 ${moreCount} more products — type to search by name or scan barcode</div>` : '');

    grid.querySelectorAll('.pos-product-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const product = this.products.find(p => p.id === Number(btn.dataset.id));
        if (product) this.addToCart(product);
        this.focusSearch();
      });
    });
  },

  addToCart(product) {
    const existing = this.cart.find(c => c.productId === product.id);
    if (existing) {
      if (existing.quantity + 1 > product.stock) {
        Toast.error(`Only ${product.stock} ${product.unit} of "${product.name}" available.`);
        return;
      }
      existing.quantity += 1;
    } else {
      if (product.stock < 1) {
        Toast.error(`"${product.name}" is out of stock.`);
        return;
      }
      this.cart.push({
        productId: product.id,
        name: product.name,
        unitPrice: product.sellPrice,
        quantity: 1,
        vatApplicable: product.vatApplicable,
        stock: product.stock
      });
    }
    this.renderCart();
    this.renderProductGrid();
  },

  changeQty(productId, delta) {
    const line = this.cart.find(c => c.productId === productId);
    if (!line) return;
    const newQty = line.quantity + delta;
    if (newQty <= 0) {
      this.cart = this.cart.filter(c => c.productId !== productId);
    } else if (newQty > line.stock) {
      Toast.error(`Only ${line.stock} available.`);
      return;
    } else {
      line.quantity = newQty;
    }
    this.renderCart();
    this.renderProductGrid();
  },

  removeLine(productId) {
    this.cart = this.cart.filter(c => c.productId !== productId);
    this.renderCart();
    this.renderProductGrid();
  },

  // Lets the cashier override the selling price for this specific line, for
  // this sale only - does not change the product's catalog price in
  // Inventory. Click the price to turn it into an input; Enter or blur
  // commits it. The server (POST /sales) already accepts a per-line
  // unitPrice override, so this just needs to update the cart line.
  editLinePrice(productId, spanEl) {
    const line = this.cart.find(c => c.productId === productId);
    if (!line) return;
    const decimals = App.settings.currencyDecimals ?? 3;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '0.001';
    input.value = line.unitPrice;
    input.className = 'cl-price-input';
    spanEl.replaceWith(input);
    input.focus();
    input.select();

    const commit = () => {
      const newPrice = Math.max(0, Number(input.value) || 0);
      line.unitPrice = +newPrice.toFixed(decimals);
      line.priceOverridden = true;
      this.renderCart();
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { this.renderCart(); }
    });
  },

  // Lets the cashier override whether VAT applies to this specific line, for
  // this sale only - does not change the product's permanent VAT setting in
  // Inventory. Useful for one-off exceptions (e.g. a misconfigured item, or
  // a customer-specific exemption) without needing to edit the catalog.
  toggleLineVat(productId) {
    const line = this.cart.find(c => c.productId === productId);
    if (!line) return;
    line.vatApplicable = !line.vatApplicable;
    line.vatOverridden = true;
    this.renderCart();
  },

  calculateTotals() {
    const settings = App.settings;
    const vatRate = settings.vatRate ?? 10;
    const decimals = settings.currencyDecimals ?? 3;
    let grandTotal = 0, vatTotal = 0;
    this.cart.forEach(line => {
      const lineGross = +(line.unitPrice * line.quantity).toFixed(decimals);
      grandTotal += lineGross;
      if (line.vatApplicable) {
        const lineNet = lineGross / (1 + vatRate / 100);
        vatTotal += lineGross - lineNet;
      }
    });
    grandTotal = +grandTotal.toFixed(decimals);
    vatTotal = +vatTotal.toFixed(decimals);
    const subtotal = +(grandTotal - vatTotal).toFixed(decimals);

    let discount = 0;
    if (this.appliedCoupon) {
      discount += this.appliedCoupon.discountType === 'percent'
        ? +(grandTotal * (this.appliedCoupon.discountValue / 100)).toFixed(decimals)
        : this.appliedCoupon.discountValue;
    }
    if (this.redeemPoints > 0) {
      discount += +(this.redeemPoints * (settings.loyaltyRedemptionRate ?? 0.01)).toFixed(decimals);
    }
    discount = +discount.toFixed(decimals);
    const finalTotal = Math.max(0, +(grandTotal - discount).toFixed(decimals));

    return { subtotal, vatTotal, grandTotal, discount, finalTotal };
  },

  renderCart() {
    const itemsEl = document.getElementById('pos-cart-items');
    const summaryEl = document.getElementById('pos-cart-summary');
    const headerEl = document.querySelector('.pos-cart-header h3');
    if (!itemsEl) return;

    if (headerEl) {
      headerEl.innerHTML = `Current Sale${this.cart.length > 0 ? `<span class="item-count-badge">${this.cart.reduce((s, l) => s + l.quantity, 0)} items</span>` : ''}`;
    }

    if (this.cart.length === 0) {
      itemsEl.innerHTML = `
        <div class="pos-cart-empty">
          <span style="width:44px;height:44px">${Icon.cart}</span>
          <p>Cart is empty.<br>Tap a product on the left to add it here.</p>
        </div>`;
      summaryEl.innerHTML = '';
      return;
    }

    itemsEl.innerHTML = this.cart.map(line => `
      <div class="cart-line" data-id="${line.productId}">
        <div style="flex:1">
          <div class="cl-name">${escapeHtml(line.name)}</div>
          <div class="cl-unit-price">
            <span class="cl-price-edit" data-id="${line.productId}" title="Click to change the price for this sale">${formatMoneyPlain(line.unitPrice, App.settings)}</span> x ${line.quantity}
            <button class="vat-toggle-btn ${line.vatApplicable ? 'on' : 'off'}" data-id="${line.productId}" title="Click to override VAT for this sale only">
              VAT ${line.vatApplicable ? `${App.settings.vatRate}%` : 'Exempt'}
            </button>
          </div>
        </div>
        <div class="qty-stepper">
          <button class="qty-minus">-</button>
          <span>${line.quantity}</span>
          <button class="qty-plus">+</button>
        </div>
        <div class="cl-total">${formatMoneyPlain(line.unitPrice * line.quantity, App.settings)}</div>
        <button class="cl-remove"><span style="width:14px;height:14px;display:flex">${Icon.x}</span></button>
      </div>
    `).join('');

    itemsEl.querySelectorAll('.cart-line').forEach(row => {
      const id = Number(row.dataset.id);
      row.querySelector('.qty-plus').addEventListener('click', () => this.changeQty(id, 1));
      row.querySelector('.qty-minus').addEventListener('click', () => this.changeQty(id, -1));
      row.querySelector('.cl-remove').addEventListener('click', () => this.removeLine(id));
    });
    itemsEl.querySelectorAll('.cl-price-edit').forEach(span => {
      span.addEventListener('click', (e) => {
        e.stopPropagation();
        this.editLinePrice(Number(span.dataset.id), span);
      });
    });
    itemsEl.querySelectorAll('.vat-toggle-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleLineVat(Number(btn.dataset.id));
      });
    });

    const totals = this.calculateTotals();
    const settings = App.settings;
    const customer = this.customers.find(c => c.id === this.selectedCustomerId);

    summaryEl.innerHTML = `
      <div style="margin-bottom:10px">
        <div style="display:flex;gap:8px">
          <input class="form-input" id="coupon-input" placeholder="Coupon code" value="${this.appliedCoupon ? escapeHtml(this.appliedCoupon.code) : ''}" style="flex:1;font-size:0.82rem;padding:8px 10px" ${this.appliedCoupon ? 'disabled' : ''}>
          ${this.appliedCoupon
            ? `<button class="btn btn-outline btn-sm" id="remove-coupon-btn">Remove</button>`
            : `<button class="btn btn-outline btn-sm" id="apply-coupon-btn">Apply</button>`}
        </div>
      </div>
      ${customer && (customer.loyaltyPoints || 0) > 0 ? `
      <div style="margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;font-size:0.8rem">
        <span class="loyalty-badge">${Icon.check} ${customer.loyaltyPoints} pts available</span>
        <button class="btn btn-outline btn-sm" id="redeem-points-btn">${this.redeemPoints > 0 ? `${this.redeemPoints} redeemed` : 'Redeem'}</button>
      </div>` : ''}
      <div class="summary-row"><span>Subtotal</span><span>${formatMoneyPlain(totals.subtotal, settings)}</span></div>
      <div class="summary-row"><span>VAT (${settings.vatRate}%)</span><span>${formatMoneyPlain(totals.vatTotal, settings)}</span></div>
      ${totals.discount > 0 ? `<div class="summary-row" style="color:var(--success)"><span>Discount</span><span>-${formatMoneyPlain(totals.discount, settings)}</span></div>` : ''}
      <div class="summary-row total"><span>Total</span><span>${formatMoneyPlain(totals.finalTotal, settings)} ${settings.currency}</span></div>
      <button class="pos-checkout-btn" id="checkout-btn">
        <span style="width:18px;height:18px;display:flex">${Icon.check}</span> Checkout ${formatMoneyPlain(totals.finalTotal, settings)} ${settings.currency}
      </button>
    `;
    document.getElementById('checkout-btn').addEventListener('click', () => this.openPaymentModal());

    const applyCouponBtn = document.getElementById('apply-coupon-btn');
    if (applyCouponBtn) {
      applyCouponBtn.addEventListener('click', async () => {
        const code = document.getElementById('coupon-input').value.trim();
        if (!code) return;
        try {
          const coupon = await Api.post('/coupons/validate', { code });
          this.appliedCoupon = coupon;
          Toast.success(`Coupon "${coupon.code}" applied.`);
          this.renderCart();
        } catch (err) { Toast.error(err.message); }
      });
    }
    const removeCouponBtn = document.getElementById('remove-coupon-btn');
    if (removeCouponBtn) {
      removeCouponBtn.addEventListener('click', () => {
        this.appliedCoupon = null;
        this.renderCart();
      });
    }
    const redeemBtn = document.getElementById('redeem-points-btn');
    if (redeemBtn) {
      redeemBtn.addEventListener('click', () => this.openRedeemPointsModal(customer));
    }
  },

  // Renders a QR code encoding the invoice amount and shop name, for manual
  // reconciliation with a mobile payment app (e.g. customer's banking app).
  // This does NOT move money automatically - it's a convenience code the
  // cashier shows the customer to confirm/scan the correct amount, with
  // settlement confirmed manually. A live payment gateway integration would
  // need real merchant credentials from the payment provider.
  renderQrCode(amount, settings) {
    const box = document.getElementById('qr-code-box');
    if (!box || typeof qrcode === 'undefined') return;
    const payload = `${settings.shopName} | Amount: ${amount.toFixed(settings.currencyDecimals ?? 3)} ${settings.currency} | ${new Date().toISOString()}`;
    try {
      const qr = qrcode(0, 'M');
      qr.addData(payload);
      qr.make();
      box.innerHTML = `
        <div style="text-align:center;margin-bottom:14px">
          <div style="display:inline-block;padding:10px;background:#fff;border-radius:10px;border:1px solid var(--border)">
            ${qr.createSvgTag({ cellSize: 4, margin: 4 })}
          </div>
          <p style="font-size:0.78rem;color:var(--text-muted);margin-top:8px">Customer scans this to confirm the amount, then pays via their banking app. Confirm receipt before completing the sale.</p>
        </div>
      `;
    } catch (e) {
      box.innerHTML = `<p style="color:var(--text-muted);font-size:0.8rem">Could not generate QR code.</p>`;
    }
  },

  openRedeemPointsModal(customer) {
    Modal.open('Redeem Loyalty Points', `
      <p style="color:var(--text-secondary);font-size:0.86rem;margin-bottom:16px">
        <strong>${escapeHtml(customer.name)}</strong> has <strong>${customer.loyaltyPoints} points</strong> available
        (1 point = ${(App.settings.loyaltyRedemptionRate ?? 0.01).toFixed(3)} ${App.settings.currency}).
      </p>
      <form id="redeem-form">
        <div class="form-group">
          <label class="form-label">Points to Redeem</label>
          <input class="form-input" id="redeem-amount" type="number" min="0" max="${customer.loyaltyPoints}" value="${this.redeemPoints || 0}">
        </div>
        <button type="submit" class="btn btn-gold" style="width:100%;justify-content:center;padding:12px">Apply</button>
      </form>
    `);
    document.getElementById('redeem-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const points = Number(document.getElementById('redeem-amount').value) || 0;
      if (points > customer.loyaltyPoints) {
        Toast.error('Customer does not have that many points.');
        return;
      }
      this.redeemPoints = points;
      Modal.close();
      this.renderCart();
    });
  },

  openPaymentModal() {
    if (this.orderType === 'delivery') {
      const address = document.getElementById('delivery-address')?.value.trim();
      if (!address) {
        Toast.error('Please enter a delivery address before checkout.');
        return;
      }
    }

    const totals = this.calculateTotals();
    const settings = App.settings;
    Modal.open('Complete Payment', `
      <div class="payment-method-grid" id="payment-methods">
        <button class="payment-method-btn active" data-method="cash">${Icon.cash} Cash</button>
        <button class="payment-method-btn" data-method="card">${Icon.card} Card</button>
        <button class="payment-method-btn" data-method="benefitpay">${Icon.benefitpay} BenefitPay</button>
        <button class="payment-method-btn" data-method="qr">${Icon.qrcode} QR Code</button>
        <button class="payment-method-btn" data-method="credit" ${this.selectedCustomerId ? '' : 'disabled title="Select a customer first to sell on credit"'}>${Icon.credit} Credit</button>
      </div>
      ${this.selectedCustomerId ? '' : `<div class="card" style="background:var(--warning-bg);color:var(--warning);font-size:0.8rem;margin-bottom:12px">Select a customer above to enable Credit (pay later) sales.</div>`}
      <div class="form-group">
        <label class="form-label">Total Due</label>
        <div style="font-family:var(--font-mono);font-weight:700;font-size:1.6rem">${formatMoneyPlain(totals.finalTotal, settings)} ${settings.currency}</div>
      </div>
      <div class="form-group" id="amount-paid-group">
        <label class="form-label">Amount Received</label>
        <input class="form-input" id="amount-paid-input" type="number" step="0.001" value="${totals.finalTotal.toFixed(settings.currencyDecimals ?? 3)}">
      </div>
      <div id="qr-code-box"></div>
      <div id="benefitpay-note-box"></div>
      <div id="change-due-box"></div>
      <button class="btn btn-gold" id="confirm-payment-btn" style="width:100%;justify-content:center;padding:13px;margin-top:6px">
        Confirm &amp; Print Receipt
      </button>
    `);

    let method = 'cash';
    const methodsEl = document.getElementById('payment-methods');
    methodsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.payment-method-btn');
      if (!btn) return;
      methodsEl.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      method = btn.dataset.method;
      document.getElementById('amount-paid-group').style.display = method === 'cash' ? 'block' : 'none';
      document.getElementById('change-due-box').innerHTML = '';
      document.getElementById('benefitpay-note-box').innerHTML = '';
      document.getElementById('qr-code-box').innerHTML = '';
      if (method !== 'cash') {
        document.getElementById('amount-paid-input').value = totals.finalTotal.toFixed(settings.currencyDecimals ?? 3);
      }
      if (method === 'benefitpay') {
        document.getElementById('benefitpay-note-box').innerHTML = `
          <div class="card" style="background:var(--gold-100);border-color:rgba(201,162,39,0.3);font-size:0.82rem;color:var(--gold-600);margin-bottom:14px">
            Ask the customer to open BenefitPay and scan the shop's payment QR, or confirm payment manually if using a card terminal with BenefitPay enabled.
          </div>
        `;
      }
      if (method === 'qr') {
        this.renderQrCode(totals.finalTotal, settings);
      }
      if (method === 'credit') {
        document.getElementById('benefitpay-note-box').innerHTML = `
          <div class="card" style="background:var(--warning-bg);border-color:rgba(201,122,27,0.3);font-size:0.82rem;color:var(--warning);margin-bottom:14px">
            This adds ${formatMoneyPlain(totals.finalTotal, settings)} ${settings.currency} to the customer's outstanding balance. Nothing is collected now.
          </div>
        `;
      }
    });

    const updateChange = () => {
      const paid = Number(document.getElementById('amount-paid-input').value) || 0;
      const change = paid - totals.finalTotal;
      const box = document.getElementById('change-due-box');
      if (method === 'cash' && change >= 0) {
        box.innerHTML = `<div class="change-due-display"><div class="label">Change Due</div><div class="amount">${change.toFixed(settings.currencyDecimals ?? 3)} ${settings.currency}</div></div>`;
      } else {
        box.innerHTML = '';
      }
    };
    document.getElementById('amount-paid-input').addEventListener('input', updateChange);

    document.getElementById('confirm-payment-btn').addEventListener('click', async () => {
      const paid = Number(document.getElementById('amount-paid-input').value) || 0;
      if (method === 'cash' && paid < totals.finalTotal) {
        Toast.error('Amount received is less than the total due.');
        return;
      }
      if (method === 'credit' && !this.selectedCustomerId) {
        Toast.error('Select a customer before selling on credit.');
        return;
      }
      const payload = {
        items: this.cart.map(c => ({
          productId: c.productId, quantity: c.quantity, unitPrice: c.unitPrice,
          vatApplicable: c.vatOverridden ? c.vatApplicable : undefined
        })),
        paymentMethod: method,
        amountPaid: paid,
        customerId: this.selectedCustomerId,
        orderType: this.orderType,
        couponCode: this.appliedCoupon ? this.appliedCoupon.code : undefined,
        redeemPoints: this.redeemPoints || undefined
      };
      if (this.orderType === 'delivery') {
        payload.deliveryAddress = document.getElementById('delivery-address').value.trim();
        payload.deliveryPhone = document.getElementById('delivery-phone').value.trim();
        payload.deliveryFee = Number(document.getElementById('delivery-fee').value) || 0;
        payload.driverId = Number(document.getElementById('delivery-driver').value) || null;
      }
      try {
        const sale = await Api.post('/sales', payload);
        const soldToCustomer = this.customers.find(c => c.id === this.selectedCustomerId);
        Modal.close();
        this.cart = [];
        this.appliedCoupon = null;
        this.redeemPoints = 0;
        this.printReceipt(sale);
        [this.products, this.customers] = await Promise.all([Api.get('/products'), Api.get('/customers')]);
        this.renderScreen();
        this.focusSearch();
        Toast.success(`Sale completed: ${sale.invoiceNo}${sale.delivery ? ' - delivery order created' : ''}`);
        this.offerWhatsAppReceipt(sale, soldToCustomer);
      } catch (err) {
        Toast.error(err.message);
      }
    });
  },

  // After checkout, offer to send the customer their receipt as a PDF on
  // WhatsApp. Shown for every sale now - previously this silently skipped
  // whenever no customer account was selected (i.e. every "Walk-in" sale),
  // which is why it looked like the WhatsApp option never appeared. A
  // walk-in customer can still have a phone number worth sending to, so
  // the number field just starts blank for you to type instead of being
  // pre-filled from a saved account.
  offerWhatsAppReceipt(sale, customer) {
    const hasSavedNumber = customer && customer.id !== 1 && customer.phone;
    Modal.open('Send Receipt on WhatsApp?', `
      <p style="color:var(--text-secondary);font-size:0.86rem;margin-bottom:16px">
        Send a PDF copy of invoice <strong>${escapeHtml(sale.invoiceNo)}</strong> on WhatsApp${hasSavedNumber ? ` to <strong>${escapeHtml(customer.name)}</strong>` : ''}.
      </p>
      <div class="form-group">
        <label class="form-label">WhatsApp Number</label>
        <input class="form-input" id="wa-phone-input" value="${hasSavedNumber ? escapeHtml(customer.phone) : ''}" placeholder="e.g. 33334444">
        <div class="form-hint">8-digit Bahrain numbers are sent with the +973 code automatically.</div>
      </div>
      <button class="btn btn-gold" id="wa-send-btn" style="width:100%;justify-content:center;padding:12px;gap:8px">
        <span style="width:18px;height:18px;display:flex">${Icon.whatsapp}</span> Send on WhatsApp
      </button>
      <button class="btn-icon-label" id="wa-skip-btn" style="width:100%;justify-content:center;margin-top:8px">Skip</button>
    `);
    document.getElementById('wa-skip-btn').addEventListener('click', () => Modal.close());
    document.getElementById('wa-send-btn').addEventListener('click', async (e) => {
      const phone = document.getElementById('wa-phone-input').value.trim();
      if (!phone) { Toast.error('Enter a WhatsApp number.'); return; }
      e.target.disabled = true;
      await BillShare.shareToWhatsApp(sale, App.settings, phone);
      Modal.close();
    });
  },

  printReceipt(sale) {
    Receipt.print(sale, App.settings);
  }
};

// Exposed on window because components/global-scanner.js (a hardware
// USB/Bluetooth scanner listener that works from ANY screen, not just
// while already on POS) needs to hand scanned codes to this screen once
// it's mounted. A plain top-level `const` is NOT automatically a window
// property in the browser, so without this line the global scanner could
// never find PosScreen at all - this was the actual cause of "barcode
// scanner doesn't do anything in POS" (it wasn't a POS bug, it was a
// missing handoff).
window.PosScreen = PosScreen;
