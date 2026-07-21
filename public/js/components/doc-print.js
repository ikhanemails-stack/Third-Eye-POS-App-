// Third Eye Computer Solutions - POS System
// Professional A4 document builder for Quotations, Invoices, and Delivery
// Challans. Unlike components/receipt.js (thermal, 58/80mm), this always
// renders a full A4 letterhead-style document meant for emailing/printing/
// filing.
//
// Country-aware by design: every label (CR / VAT-vs-GST / currency /
// decimals) is read from `settings`, which is populated from
// server/tax-config.js when the shop's country is chosen in Settings. So
// the SAME template automatically prints correctly for a Bahrain VAT
// invoice, a Saudi ZATCA-labelled invoice, or an India GST invoice - no
// per-country template forking needed. Full legal e-invoicing integration
// (like ZATCA Phase 2 XML/CSID reporting) is a separate, country-specific
// backend integration - this component only handles the printed/PDF layout.

const DocPrint = {
  print(kind, doc, settings) {
    const win = window.open('', '_blank', 'width=900,height=1000');
    win.document.write(this.buildHtml(kind, doc, settings));
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 500);
  },

  printQuotation(quote, settings) { this.print('quotation', quote, settings); },
  printInvoice(sale, settings) { this.print('invoice', sale, settings); },
  printChallan(delivery, settings) { this.print('challan', delivery, settings); },

  buildHtml(kind, doc, settings) {
    const s = settings || {};
    const cur = s.currency || 'BHD';
    const decimals = s.currencyDecimals ?? 3;
    const fmt = (v) => `${(Number(v) || 0).toFixed(decimals)} ${cur}`;
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const titles = { quotation: 'QUOTATION', invoice: 'TAX INVOICE', challan: 'DELIVERY CHALLAN' };
    const title = titles[kind] || 'DOCUMENT';

    const docNo = kind === 'quotation' ? doc.quoteNo : kind === 'challan' ? doc.challanNo : doc.invoiceNo;
    const docDate = doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : new Date().toLocaleDateString();

    const items = doc.items || [];
    const showVatColumn = kind !== 'challan';

    const itemsRows = items.map((i, idx) => `
      <tr>
        <td style="text-align:center">${idx + 1}</td>
        <td>${esc(i.productName)}</td>
        <td style="text-align:center">${i.quantity}</td>
        ${kind === 'challan' ? '' : `<td style="text-align:right">${fmt(i.unitPrice)}</td>`}
        ${showVatColumn ? `<td style="text-align:right">${fmt(i.lineVat)}</td>` : ''}
        ${kind === 'challan' ? '' : `<td style="text-align:right">${fmt(i.lineTotal)}</td>`}
      </tr>
    `).join('');

    const colCount = kind === 'challan' ? 3 : 5;

    const totalsBlock = kind === 'challan' ? '' : `
      <div class="totals">
        <div class="totals-row"><span>Subtotal</span><span>${fmt(doc.subtotal)}</span></div>
        <div class="totals-row"><span>${esc(s.vatLabel || 'VAT')}</span><span>${fmt(doc.vatTotal)}</span></div>
        ${doc.discount > 0 ? `<div class="totals-row"><span>Discount</span><span>-${fmt(doc.discount)}</span></div>` : ''}
        <div class="totals-row grand"><span>Total ${kind === 'quotation' ? '(Quoted)' : 'Due'}</span><span>${fmt(doc.total)}</span></div>
      </div>
    `;

    const partyName = doc.customerName || (doc.customer && doc.customer.name) || 'Walk-in Customer';
    const partyPhone = doc.customerPhone || (doc.customer && doc.customer.phone) || '';
    const partyAddress = doc.address || '';

    const statusNote = kind === 'quotation'
      ? `<div class="note-box">Valid until: <strong>${doc.validUntil ? new Date(doc.validUntil).toLocaleDateString() : 'N/A'}</strong> &nbsp;•&nbsp; Status: <strong>${esc((doc.status || '').toUpperCase())}</strong></div>`
      : '';

    const termsBlock = (kind === 'quotation' && doc.terms) ? `
      <div class="terms">
        <div class="terms-title">Terms &amp; Conditions</div>
        <div>${esc(doc.terms).replace(/\n/g, '<br>')}</div>
      </div>` : '';

    const signatureBlock = kind === 'challan' ? `
      <div class="sign-grid">
        <div class="sign-box">
          <div class="sign-label">Received By</div>
          <div class="sign-value">${esc(doc.receivedByName || '_____________________')}</div>
          ${doc.signatureDataUrl ? `<img src="${doc.signatureDataUrl}" class="sig-img">` : '<div class="sig-line"></div>'}
        </div>
        <div class="sign-box">
          <div class="sign-label">Delivered On</div>
          <div class="sign-value">${doc.deliveredAt ? new Date(doc.deliveredAt).toLocaleString() : 'Pending'}</div>
        </div>
      </div>
    ` : `
      <div class="sign-grid">
        <div class="sign-box"><div class="sign-label">Authorized Signature</div><div class="sig-line"></div></div>
        <div class="sign-box"><div class="sign-label">Customer Acceptance</div><div class="sig-line"></div></div>
      </div>
    `;

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title} ${esc(docNo)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 24px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #b8860b; padding-bottom: 16px; margin-bottom: 20px; }
  .shop-block { display: flex; gap: 14px; align-items: center; }
  .shop-block img { width: 60px; height: 60px; object-fit: contain; border-radius: 6px; }
  .shop-name { font-size: 20px; font-weight: 800; margin: 0; }
  .shop-meta { font-size: 12px; color: #555; line-height: 1.5; margin-top: 4px; }
  .doc-title { text-align: right; }
  .doc-title h1 { font-size: 24px; letter-spacing: 1px; margin: 0; color: #b8860b; }
  .doc-title .doc-no { font-size: 13px; color: #444; margin-top: 4px; }
  .parties { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 18px; }
  .party { flex: 1; font-size: 13px; }
  .party-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 4px; }
  .note-box { background: #fdf6e3; border: 1px solid #e8d9a8; padding: 8px 12px; border-radius: 6px; font-size: 12.5px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 12.5px; }
  th { background: #1a1a1a; color: #fff; text-align: left; padding: 8px 10px; font-weight: 600; }
  td { padding: 8px 10px; border-bottom: 1px solid #e5e5e5; }
  .totals { width: 280px; margin-left: auto; font-size: 13px; }
  .totals-row { display: flex; justify-content: space-between; padding: 5px 0; }
  .totals-row.grand { border-top: 2px solid #1a1a1a; font-weight: 800; font-size: 15px; padding-top: 8px; margin-top: 4px; }
  .terms { margin-top: 20px; font-size: 12px; color: #444; }
  .terms-title { font-weight: 700; margin-bottom: 4px; }
  .sign-grid { display: flex; justify-content: space-between; gap: 40px; margin-top: 50px; }
  .sign-box { flex: 1; text-align: center; }
  .sign-label { font-size: 11px; color: #888; text-transform: uppercase; margin-bottom: 30px; }
  .sig-line { border-top: 1px solid #333; margin-top: 10px; }
  .sig-img { max-height: 50px; max-width: 100%; display: block; margin: 0 auto; }
  .sign-value { font-size: 13px; font-weight: 600; }
  .footer-note { text-align: center; font-size: 11px; color: #999; margin-top: 30px; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  <div class="header">
    <div class="shop-block">
      ${s.logoDataUrl ? `<img src="${s.logoDataUrl}">` : ''}
      <div>
        <p class="shop-name">${esc(s.shopName || 'Shop Name')}</p>
        <div class="shop-meta">
          ${esc(s.address || '')}<br>
          ${s.phone ? `Tel: ${esc(s.phone)}<br>` : ''}
          ${s.crNumber ? `${esc(s.crLabelShort || 'CR')}: ${esc(s.crNumber)} &nbsp; ` : ''}
          ${s.vatNumber ? `${esc(s.vatLabel || 'VAT')} No: ${esc(s.vatNumber)}` : ''}
        </div>
      </div>
    </div>
    <div class="doc-title">
      <h1>${title}</h1>
      <div class="doc-no">No: ${esc(docNo)}<br>Date: ${docDate}</div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <div class="party-title">${kind === 'challan' ? 'Deliver To' : 'Bill To'}</div>
      <strong>${esc(partyName)}</strong><br>
      ${partyPhone ? `${esc(partyPhone)}<br>` : ''}
      ${partyAddress ? esc(partyAddress) : ''}
    </div>
  </div>

  ${statusNote}

  <table>
    <thead><tr>
      <th style="width:36px;text-align:center">#</th>
      <th>Item</th>
      <th style="width:60px;text-align:center">Qty</th>
      ${kind === 'challan' ? '' : '<th style="width:90px;text-align:right">Unit Price</th>'}
      ${showVatColumn ? `<th style="width:80px;text-align:right">${esc(s.vatLabel || 'VAT')}</th>` : ''}
      ${kind === 'challan' ? '' : '<th style="width:100px;text-align:right">Total</th>'}
    </tr></thead>
    <tbody>
      ${itemsRows || `<tr><td colspan="${colCount}" style="text-align:center;color:#999;padding:20px">No items</td></tr>`}
    </tbody>
  </table>

  ${totalsBlock}
  ${termsBlock}
  ${signatureBlock}

  <div class="footer-note">Generated by ${esc(s.shopName || 'POS System')} — Thank you for your business.</div>
</body></html>`;
  }
};
