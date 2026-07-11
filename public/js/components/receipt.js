// Third Eye Computer Solutions - POS System
// Receipt rendering - thermal printer optimized, bold, clear, fast.

const Receipt = {
  print(sale, settings) {
    const win = window.open('', '_blank', 'width=520,height=780');
    win.document.write(this.buildHtml(sale, settings));
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 600);
  },

  buildHtml(sale, settings) {
    const width   = settings.receiptPaperWidth || '80mm';
    const isA4    = width === 'a4';
    const paperPx = width === '58mm' ? 220 : width === '80mm' ? 302 : 680;

    // Font size
    const sizeKey  = settings.receiptFontSize || 'normal';
    const base     = sizeKey === 'large' ? 15 : sizeKey === 'small' ? 11 : 13;
    const shopSize = base + 5;
    const itemSize = base + 1;
    const totSize  = base + 4;

    // Font weight — slim=500, normal=700, bold=900. Raised from the previous
    // 400/600/900 scale: thin strokes (400-600) print faded/grey on many
    // thermal printers, especially at lower head-darkness settings, so even
    // "Slim" now prints solidly.
    const fwKey = (settings.receiptFontWeight || 'normal').toLowerCase().trim();
    const fw    = fwKey === 'bold' ? 900 : fwKey === 'slim' ? 500 : 700;
    const fwShop = Math.min(fw + 200, 900);

    // Logo
    const logoHtml = (settings.receiptShowLogo !== false && settings.logoDataUrl)
      ? `<img src="${settings.logoDataUrl}" style="width:64px;height:64px;border-radius:6px;object-fit:contain;display:block;margin:0 auto 6px" alt="logo">`
      : '';

    // Header text (shown below shop name)
    const headerText = (settings.receiptHeader || '').trim();
    const headerHtml = headerText
      ? headerText.split('\n').map(l => `<div style="font-size:${base}px;text-align:center;margin:1px 0">${escapeHtmlR(l)}</div>`).join('')
      : '';

    // Items
    const itemsHtml = (sale.items || []).map(i => {
      const unitP = i.unitPrice !== undefined ? i.unitPrice : (i.lineTotal / i.quantity);
      return `
        <div style="display:flex;justify-content:space-between;font-size:${itemSize}px;font-weight:${fw};margin:4px 0">
          <span style="flex:1;padding-right:6px">${escapeHtmlR(i.productName)}</span>
          <span style="white-space:nowrap">${fmtMoney(i.lineTotal, settings)}</span>
        </div>
        <div style="font-size:${base-1}px;font-weight:${Math.max(fw-100,400)};color:#444;margin:0 0 5px 0">
          &nbsp;x${i.quantity} @ ${fmtMoney(unitP, settings)} each
        </div>`;
    }).join('');

    const cur = settings.currency || 'BHD';

    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Receipt</title>
<style>
  @page { size:${isA4?'A4':`${paperPx}px auto`}; margin:${isA4?'12mm':'3mm'}; }
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:#fff}
  body{font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;font-size:${base}px;font-weight:${fw};
       width:${isA4?'100%':paperPx+'px'};max-width:${isA4?'680px':'none'};
       margin:0 auto;padding:6px;color:#000;background:#fff;
       -webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;
       -webkit-font-smoothing:none;-moz-osx-font-smoothing:grayscale;
       text-rendering:optimizeLegibility}
  .divider{border:none;border-top:1.5px dashed #000;margin:7px 0}
  .solid{border:none;border-top:2.5px solid #000;margin:7px 0}
  .center{text-align:center}
  @media print{
    body{padding:0;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    * {-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color:#000}
  }
</style></head><body>

<div class="center">
  ${logoHtml}
  <div style="font-size:${shopSize}px;font-weight:${fwShop};letter-spacing:1px;text-transform:uppercase;margin-bottom:3px">${escapeHtmlR(settings.shopName||'My Supermarket')}</div>
  ${settings.address?`<div style="font-size:${base}px">${escapeHtmlR(settings.address)}</div>`:''}
  ${settings.phone?`<div style="font-size:${base}px">Tel: ${escapeHtmlR(settings.phone)}</div>`:''}
  ${settings.crNumber?`<div style="font-size:${base}px">CR: ${escapeHtmlR(settings.crNumber)}</div>`:''}
  ${settings.vatNumber?`<div style="font-size:${base}px">VAT No: ${escapeHtmlR(settings.vatNumber)}</div>`:''}
  ${headerHtml}
  <div style="display:inline-block;border:2px solid #000;border-radius:20px;padding:3px 16px;font-size:${base}px;font-weight:${fwShop};margin:6px 0 4px;letter-spacing:1px">${((sale.orderType||'walk_in').replace(/_/g,'-')).toUpperCase()}</div>
</div>

<hr class="divider">
<div style="display:flex;justify-content:space-between;font-size:${base}px;margin:3px 0"><span>Invoice:</span><span>${escapeHtmlR(sale.invoiceNo||'')}</span></div>
<div style="display:flex;justify-content:space-between;font-size:${base}px;margin:3px 0"><span>Date:</span><span>${fmtDateTime(sale.createdAt)}</span></div>
<div style="display:flex;justify-content:space-between;font-size:${base}px;margin:3px 0"><span>Cashier:</span><span>${escapeHtmlR(sale.cashierName||'')}</span></div>
<hr class="divider">

${itemsHtml}

<hr class="divider">
<div style="display:flex;justify-content:space-between;font-size:${base}px;margin:3px 0"><span>Subtotal:</span><span>${fmtMoney(sale.subtotal,settings)}</span></div>
<div style="display:flex;justify-content:space-between;font-size:${base}px;margin:3px 0"><span>VAT (${settings.vatRate||0}%):</span><span>${fmtMoney(sale.vatTotal,settings)}</span></div>
${(sale.discount||0)>0?`<div style="display:flex;justify-content:space-between;font-size:${base}px;margin:3px 0"><span>Discount${sale.couponCode?' ('+sale.couponCode+')':''}:</span><span>-${fmtMoney(sale.discount,settings)}</span></div>`:''}
<hr class="solid">
<div style="display:flex;justify-content:space-between;font-size:${totSize}px;font-weight:${fwShop};padding:6px 0">
  <span>TOTAL:</span><span>${fmtMoney(sale.total,settings)} ${cur}</span>
</div>
<hr class="solid">
<div style="display:flex;justify-content:space-between;font-size:${base}px;margin:3px 0"><span>Payment (${(sale.paymentMethod||'cash').toUpperCase()}):</span><span>${fmtMoney(sale.amountPaid,settings)}</span></div>
${(sale.changeDue||0)>0?`<div style="display:flex;justify-content:space-between;font-size:${base}px;margin:3px 0"><span>Change:</span><span>${fmtMoney(sale.changeDue,settings)}</span></div>`:''}
${sale.pointsEarned?`<div style="display:flex;justify-content:space-between;font-size:${base}px;margin:3px 0"><span>Points Earned:</span><span>+${sale.pointsEarned} pts</span></div>`:''}
<hr class="divider">
<div class="center" style="font-size:${base}px;font-weight:${fw};margin-top:6px;white-space:pre-line">${escapeHtmlR(settings.receiptFooter||'Thank you for shopping with us!')}</div>
</body></html>`;
  },

  sampleSale(settings) {
    const dec = settings.currencyDecimals ?? 3;
    const vat = settings.vatRate ?? 10;
    const i1 = 4.250, i2 = 0.750;
    const gross = i1 + i2;
    const sub   = +(gross/(1+vat/100)).toFixed(dec);
    const vatT  = +(gross-sub).toFixed(dec);
    return {
      invoiceNo:'INV-SAMPLE-0001', createdAt:new Date().toISOString(),
      cashierName:'Sample Cashier', orderType:'walk_in',
      items:[
        {productName:'Basmati Rice 5kg',   quantity:1, unitPrice:i1, lineTotal:i1},
        {productName:'Mineral Water 1.5L', quantity:3, unitPrice:+(i2/3).toFixed(dec), lineTotal:i2}
      ],
      subtotal:sub, vatTotal:vatT, discount:0,
      total:gross, amountPaid:5.500, changeDue:+(5.500-gross).toFixed(dec),
      paymentMethod:'cash', pointsEarned:5
    };
  }
};

function escapeHtmlR(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function fmtMoney(v, s) {
  return Number(v||0).toFixed(s?.currencyDecimals??3);
}
function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})+', '+
         d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
}
