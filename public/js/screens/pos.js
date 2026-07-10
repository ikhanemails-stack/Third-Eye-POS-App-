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
          <div class="pos-search-bar">
            <input class="form-input" id="pos-search" placeholder="Search by name or scan barcode..." value="${escapeHtml(this.searchTerm)}" autofocus>
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
                <div style="flex:1">
                  ${QuickAddSelect.render({ id: 'pos-customer', options: this.customers.filter(c => c.id !== 1), selectedId: this.selectedCustomerId, placeholder: 'Walk-in Customer (no account)' })}
                </div>
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

    QuickAddSelect.wire('pos-customer', (name) => Api.post('/customers', { name }), (created) => {
      this.customers.push(created);
      this.selectedCustomerId = created.id;
    });
    document.getElementById('pos-customer').addEventListener('change', (e) => {
      this.selectedCustomerId = e.target.value ? Number(e.target.value) : null;
      this.renderDeliveryFields();
      this.renderCart();
    });

    // Debounced search for performance with 3000+ products
    let searchTimer = null;
    document.getElementById('pos-search').addEventListener('input', async (e) => {
      this.searchTerm = e.target.value.trim();

      // Instant barcode match in loaded products
      const exact = this.products.find(p => p.barcode === this.searchTerm);
      if (exact && this.searchTerm.length > 3) {
        this.handleBarcodeEnter();
        return;
      }

      clearTimeout(searchTimer);
      if (!this.searchTerm) {
        this.renderProductGrid();
        return;
      }

      // Search server-side for full 3000 product database
      searchTimer = setTimeout(async () => {
        try {
          const result = await Api.get(`/products?search=${encodeURIComponent(this.searchTerm)}&limit=50`);
          // Server returns array directly when not paginated
          this._searchResults = Array.isArray(result) ? result : (result.products || []);
          this._isSearchMode = true;
          this.renderProductGrid();
        } catch(e) {
          this._isSearchMode = false;
          this.renderProductGrid();
        }
      }, 200);
    });
    document.getElementById('pos-search').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleBarcodeEnter();
    });
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
          <label class="form-label">Delivery Fee (BHD)</label>
          <input class="form-input" id="delivery-fee" type="number" step="0.001" value="0">
        </div>
      </div>
    `;
    QuickAddSelect.wire('delivery-driver', (name) => Api.post('/drivers', { name }), (created) => {
      this.drivers.push(created);
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
    }
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
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>No products found.</p></div>`;
      return;
    }

    const moreCount = list.length - MAX_DISPLAY;
    grid.innerHTML = displayed.map(p => {
      const inCart = this.cart.find(c => c.productId === p.id);
      return `
      <button class="pos-product-card ${p.stock <= 0 ? 'out-of-stock' : ''} ${inCart ? 'in-cart' : ''}" data-id="${p.id}" ${p.stock <= 0 ? 'disabled' : ''}>
        ${inCart ? `<div class="in-cart-badge">${inCart.quantity}</div>` : ''}
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
            ${formatMoneyPlain(line.unitPrice, App.settings)} x ${line.quantity}
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
      </div>
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
        payload.driverId = document.getElementById('delivery-driver').value || null;
      }
      try {
        const sale = await Api.post('/sales', payload);
        Modal.close();
        this.cart = [];
        this.appliedCoupon = null;
        this.redeemPoints = 0;
        this.printReceipt(sale);
        [this.products, this.customers] = await Promise.all([Api.get('/products'), Api.get('/customers')]);
        this.renderScreen();
        Toast.success(`Sale completed: ${sale.invoiceNo}${sale.delivery ? ' - delivery order created' : ''}`);
      } catch (err) {
        Toast.error(err.message);
      }
    });
  },

  printReceipt(sale) {
    Receipt.print(sale, App.settings);
  }
};
