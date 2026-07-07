// Third Eye Computer Solutions - POS System
// Receipt rendering - clear, bold, properly formatted for thermal printers.

const Receipt = {
  print(sale, settings) {
    const win = window.open('', '_blank', 'width=500,height=750');
    win.document.write(this.buildHtml(sale, settings));
    win.document.close();
    setTimeout(() => { win.print(); win.close(); }, 500);
  },

  buildHtml(sale, settings) {
    const width = settings.receiptPaperWidth || '80mm';
    const isA4 = width === 'a4';
    const paperPx = width === '58mm' ? 240 : width === '80mm' ? 320 : 700;

    // Font sizes - bigger and bolder
    const sizeKey = settings.receiptFontSize || 'normal';
    const base   = sizeKey === 'large' ? 16 : sizeKey === 'small' ? 12 : 14;
    const shop   = base + 6;   // shop name
    const meta   = base;       // invoice/date/cashier
    const item   = base + 1;   // product lines
    const totals = base + 4;   // TOTAL line

    const logoHtml = (settings.receiptShowLogo !== false && settings.logoDataUrl)
      ? `<img src="${settings.logoDataUrl}" class="r-logo" alt="logo">`
      : '';

    const itemsHtml = sale.items.map(i => `
      <div class="r-row">
        <span class="r-item-name">${escapeHtml(i.productName)}</span>
        <span class="r-item-price">${formatMoneyPlain(i.lineTotal, settings)}</span>
      </div>
      <div class="r-item-qty">  x${i.quantity} @ ${formatMoneyPlain(i.unitPrice !== undefined ? i.unitPrice : (i.lineTotal / i.quantity), settings)} each</div>
    `).join('');

    return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Receipt ${sale.invoiceNo}</title>
<style>
  @page {
    size: ${isA4 ? 'A4' : `${paperPx}px auto`};
    margin: ${isA4 ? '15mm' : '4mm'};
  }
  * { box-sizing: border-box; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: ${base}px;
    font-weight: 700;
    width: ${isA4 ? '100%' : paperPx + 'px'};
    max-width: ${isA4 ? '680px' : 'none'};
    margin: 0 auto;
    padding: 8px;
    color: #000;
    background: #fff;
  }
  .r-center   { text-align: center; }
  .r-logo     { width: 72px; height: 72px; border-radius: 8px; margin: 0 auto 8px; display: block; object-fit: contain; }
  .r-shop     { font-size: ${shop}px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; }
  .r-sub      { font-size: ${meta}px; font-weight: 700; margin: 2px 0; }
  .r-badge    { display: inline-block; border: 2px solid #000; padding: 3px 14px; border-radius: 20px; font-size: ${meta}px; font-weight: 900; margin: 6px 0 4px; letter-spacing: 1px; }
  .r-divider  { border: none; border-top: 2px dashed #000; margin: 8px 0; }
  .r-divider-solid { border: none; border-top: 2px solid #000; margin: 8px 0; }
  .r-row      { display: flex; justify-content: space-between; align-items: flex-start; margin: 4px 0; font-size: ${meta}px; font-weight: 700; }
  .r-item-name  { font-size: ${item}px; font-weight: 900; flex: 1; padding-right: 8px; }
  .r-item-price { font-size: ${item}px; font-weight: 900; white-space: nowrap; }
  .r-item-qty   { font-size: ${base - 1}px; font-weight: 700; color: #333; margin: 0 0 6px 4px; }
  .r-total-row  { display: flex; justify-content: space-between; font-size: ${totals}px; font-weight: 900; padding: 8px 0; margin: 4px 0; }
  .r-footer   { font-size: ${base}px; font-weight: 700; margin-top: 8px; }
  @media print {
    body { margin: 0 auto; padding: 0; }
  }
</style>
</head>
<body>
  <div class="r-center">
    ${logoHtml}
    <div class="r-shop">${escapeHtml(settings.shopName || 'My Supermarket')}</div>
    ${settings.address ? `<div class="r-sub">${escapeHtml(settings.address)}</div>` : ''}
    ${settings.phone   ? `<div class="r-sub"><strong>Tel:</strong> ${escapeHtml(settings.phone)}</div>` : ''}
    ${settings.crNumber  ? `<div class="r-sub"><strong>CR:</strong> ${escapeHtml(settings.crNumber)}</div>` : ''}
    ${settings.vatNumber ? `<div class="r-sub"><strong>VAT No:</strong> ${escapeHtml(settings.vatNumber)}</div>` : ''}
    <div class="r-badge">${(sale.orderType || 'walk_in').replace(/_/g,'-').toUpperCase()}</div>
  </div>

  <hr class="r-divider">

  <div class="r-row"><span>Invoice:</span><span>${escapeHtml(sale.invoiceNo)}</span></div>
  <div class="r-row"><span>Date:</span><span>${formatDateTime(sale.createdAt)}</span></div>
  <div class="r-row"><span>Cashier:</span><span>${escapeHtml(sale.cashierName || '')}</span></div>

  <hr class="r-divider">

  ${itemsHtml}

  <hr class="r-divider">

  <div class="r-row"><span>Subtotal:</span><span>${formatMoneyPlain(sale.subtotal, settings)}</span></div>
  <div class="r-row"><span>VAT (${settings.vatRate || 0}%):</span><span>${formatMoneyPlain(sale.vatTotal, settings)}</span></div>
  ${sale.discount > 0 ? `<div class="r-row"><span>Discount${sale.couponCode ? ` (${sale.couponCode})` : ''}:</span><span>-${formatMoneyPlain(sale.discount, settings)}</span></div>` : ''}

  <hr class="r-divider-solid">
  <div class="r-total-row"><span>TOTAL:</span><span>${formatMoneyPlain(sale.total, settings)} ${settings.currency || 'BHD'}</span></div>
  <hr class="r-divider-solid">

  <div class="r-row"><span>Payment (${(sale.paymentMethod || 'cash').toUpperCase()}):</span><span>${formatMoneyPlain(sale.amountPaid, settings)}</span></div>
  ${sale.changeDue > 0 ? `<div class="r-row"><span>Change:</span><span>${formatMoneyPlain(sale.changeDue, settings)}</span></div>` : ''}
  ${sale.pointsEarned ? `<div class="r-row"><span>Points Earned:</span><span>+${sale.pointsEarned} pts</span></div>` : ''}

  <hr class="r-divider">

  <div class="r-center r-footer">${escapeHtml(settings.receiptFooter || 'Thank you for shopping with us!')}</div>

</body>
</html>`;
  },

  sampleSale(settings) {
    const decimals = settings.currencyDecimals ?? 3;
    const vatRate  = settings.vatRate ?? 10;
    const item1Total = 4.250, item2Total = 0.750;
    const gross    = item1Total + item2Total;
    const subtotal = +(gross / (1 + vatRate / 100)).toFixed(decimals);
    const vatTotal = +(gross - subtotal).toFixed(decimals);
    return {
      invoiceNo: 'INV-SAMPLE-0001',
      createdAt: new Date().toISOString(),
      cashierName: 'Sample Cashier',
      orderType: 'walk_in',
      items: [
        { productName: 'Basmati Rice 5kg', quantity: 1, unitPrice: item1Total, lineTotal: item1Total },
        { productName: 'Mineral Water 1.5L', quantity: 3, unitPrice: +(item2Total/3).toFixed(decimals), lineTotal: item2Total }
      ],
      subtotal,
      vatTotal,
      vatRate,
      discount: 0,
      total: gross,
      amountPaid: 5.500,
      changeDue: +(5.500 - gross).toFixed(decimals),
      paymentMethod: 'cash',
      pointsEarned: 5
    };
  }
};
