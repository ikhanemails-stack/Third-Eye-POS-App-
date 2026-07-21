// Third Eye Computer Solutions - POS System
// DocShare: WhatsApp sending for Quotations / Invoices / Delivery Challans.
//
// Same honest mechanism as components/bill-share.js (there is no browser
// API that lets a website silently drop a file into WhatsApp) - this
// generates a real A4 PDF, then either hands it to the native Share Sheet
// (phones) with WhatsApp as a target, or downloads it and opens WhatsApp
// Web/App with the message pre-typed so you just attach the file that was
// downloaded and hit send.
//
// Adds what was asked for on top of bill-share.js: a small "choose number"
// step - your own shop number, the customer's number on file, or type a
// different one - before opening WhatsApp.

const DocShare = {
  normalizePhone(phone) {
    if (!phone) return '';
    let digits = String(phone).replace(/[^\d]/g, '');
    if (digits.length === 8) digits = '973' + digits; // local Bahrain number
    return digits;
  },

  buildMessageText(kind, doc, settings) {
    const cur = settings.currency || 'BHD';
    const dec = settings.currencyDecimals ?? 3;
    const label = kind === 'quotation' ? 'Quotation' : kind === 'challan' ? 'Delivery Challan' : 'Invoice';
    const docNo = kind === 'quotation' ? doc.quoteNo : kind === 'challan' ? doc.challanNo : doc.invoiceNo;
    const lines = [
      `*${settings.shopName || 'Document'}*`,
      `${label}: ${docNo}`,
      ''
    ];
    if (kind !== 'challan') {
      lines.push(`Total: *${Number(doc.total).toFixed(dec)} ${cur}*`);
    }
    if (kind === 'quotation' && doc.validUntil) {
      lines.push(`Valid until: ${new Date(doc.validUntil).toLocaleDateString()}`);
    }
    lines.push('');
    lines.push(`Your ${label.toLowerCase()} PDF is attached.`);
    return lines.join('\n');
  },

  buildPdf(kind, doc, settings) {
    if (typeof window.jspdf === 'undefined') throw new Error('PDF library not loaded.');
    const { jsPDF } = window.jspdf;
    const cur = settings.currency || 'BHD';
    const dec = settings.currencyDecimals ?? 3;
    const items = doc.items || [];
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = 210, marginX = 16;
    let y = 18;

    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16);
    pdf.text(settings.shopName || 'Shop', marginX, y);
    pdf.setFontSize(18);
    const titles = { quotation: 'QUOTATION', invoice: 'TAX INVOICE', challan: 'DELIVERY CHALLAN' };
    pdf.text(titles[kind] || 'DOCUMENT', pageW - marginX, y, { align: 'right' });
    y += 6;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
    if (settings.address) { pdf.text(settings.address, marginX, y); y += 4.5; }
    if (settings.phone) { pdf.text(`Tel: ${settings.phone}`, marginX, y); y += 4.5; }
    if (settings.vatNumber) { pdf.text(`${settings.vatLabel || 'VAT'} No: ${settings.vatNumber}`, marginX, y); }
    const docNo = kind === 'quotation' ? doc.quoteNo : kind === 'challan' ? doc.challanNo : doc.invoiceNo;
    pdf.text(`No: ${docNo}`, pageW - marginX, y - 4.5, { align: 'right' });
    pdf.text(`Date: ${doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : new Date().toLocaleDateString()}`, pageW - marginX, y, { align: 'right' });
    y += 8;
    pdf.setDrawColor(184, 134, 11); pdf.setLineWidth(0.6); pdf.line(marginX, y, pageW - marginX, y);
    y += 8;

    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10);
    pdf.text(kind === 'challan' ? 'Deliver To:' : 'Bill To:', marginX, y);
    y += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.text(doc.customerName || 'Walk-in Customer', marginX, y); y += 4.5;
    if (doc.customerPhone) { pdf.text(doc.customerPhone, marginX, y); y += 4.5; }
    if (doc.address) { pdf.text(String(doc.address), marginX, y, { maxWidth: 100 }); y += 4.5; }
    y += 4;

    // Table header
    const colX = { idx: marginX, name: marginX + 10, qty: 120, price: 145, total: 178 };
    pdf.setFillColor(26, 26, 26); pdf.rect(marginX, y, pageW - marginX * 2, 7, 'F');
    pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5);
    pdf.text('#', colX.idx + 2, y + 5);
    pdf.text('Item', colX.name, y + 5);
    pdf.text('Qty', colX.qty, y + 5);
    if (kind !== 'challan') { pdf.text('Price', colX.price, y + 5); pdf.text('Total', colX.total, y + 5); }
    y += 7;
    pdf.setTextColor(0, 0, 0); pdf.setFont('helvetica', 'normal');

    items.forEach((item, i) => {
      if (y > 265) { pdf.addPage(); y = 20; }
      pdf.setFontSize(8.5);
      pdf.text(String(i + 1), colX.idx + 2, y + 5);
      pdf.text(String(item.productName).slice(0, 40), colX.name, y + 5);
      pdf.text(String(item.quantity), colX.qty, y + 5);
      if (kind !== 'challan') {
        pdf.text(Number(item.unitPrice).toFixed(dec), colX.price, y + 5);
        pdf.text(Number(item.lineTotal).toFixed(dec), colX.total, y + 5);
      }
      pdf.setDrawColor(230, 230, 230); pdf.line(marginX, y + 7, pageW - marginX, y + 7);
      y += 7;
    });

    y += 6;
    if (kind !== 'challan') {
      pdf.setFontSize(9.5);
      const totX = pageW - marginX;
      pdf.text('Subtotal:', totX - 45, y); pdf.text(`${Number(doc.subtotal).toFixed(dec)} ${cur}`, totX, y, { align: 'right' }); y += 5;
      pdf.text(`${settings.vatLabel || 'VAT'}:`, totX - 45, y); pdf.text(`${Number(doc.vatTotal).toFixed(dec)} ${cur}`, totX, y, { align: 'right' }); y += 5;
      if (doc.discount > 0) { pdf.text('Discount:', totX - 45, y); pdf.text(`-${Number(doc.discount).toFixed(dec)} ${cur}`, totX, y, { align: 'right' }); y += 5; }
      pdf.setDrawColor(0, 0, 0); pdf.line(totX - 45, y, totX, y); y += 6;
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12);
      pdf.text('TOTAL:', totX - 45, y); pdf.text(`${Number(doc.total).toFixed(dec)} ${cur}`, totX, y, { align: 'right' });
      y += 10;
    }

    if (kind === 'quotation' && doc.terms) {
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.text('Terms & Conditions:', marginX, y); y += 5;
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5);
      pdf.text(String(doc.terms), marginX, y, { maxWidth: pageW - marginX * 2 });
    }

    return pdf;
  },

  buildPdfBlob(kind, doc, settings) {
    return this.buildPdf(kind, doc, settings).output('blob');
  },

  async shareToWhatsApp(kind, doc, settings, phone) {
    const cleanPhone = this.normalizePhone(phone);
    if (!cleanPhone) { Toast.error('Enter a valid WhatsApp number.'); return; }
    const text = this.buildMessageText(kind, doc, settings);
    let blob;
    try { blob = this.buildPdfBlob(kind, doc, settings); }
    catch (e) { Toast.error('Could not generate the PDF.'); return; }

    const docNo = kind === 'quotation' ? doc.quoteNo : kind === 'challan' ? doc.challanNo : doc.invoiceNo;
    const fileName = `${kind}-${docNo || Date.now()}.pdf`;
    const file = new File([blob], fileName, { type: 'application/pdf' });

    // Always jump straight into the WhatsApp chat, same reasoning as
    // bill-share.js: skip the generic OS share sheet, land directly in the
    // right chat. The PDF downloads first so it's ready to attach - no
    // website can attach a file into WhatsApp automatically, that part
    // still needs one manual tap.
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`, '_blank');
    Toast.success('WhatsApp chat opened - the PDF downloaded, attach it and send.');
  },

  downloadPdf(kind, doc, settings) {
    const docNo = kind === 'quotation' ? doc.quoteNo : kind === 'challan' ? doc.challanNo : doc.invoiceNo;
    try { this.buildPdf(kind, doc, settings).save(`${kind}-${docNo || Date.now()}.pdf`); }
    catch (e) { Toast.error('Could not generate the PDF.'); }
  },

  // The "choose which number" step: shop's own number / customer's number
  // on file / type a different one - matches how you described the flow.
  openShareModal(kind, doc, settings) {
    const customerPhone = doc.customerPhone || '';
    const shopPhone = settings.phone || '';
    const options = [];
    if (customerPhone) options.push({ label: `Customer - ${customerPhone}`, value: customerPhone });
    if (shopPhone) options.push({ label: `My shop number - ${shopPhone}`, value: shopPhone });

    Modal.open('Send via WhatsApp', `
      <div class="form-group">
        <label class="form-label">Send to</label>
        <div id="ds-options" style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px">
          ${options.map((o, i) => `
            <label style="display:flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid var(--border);border-radius:8px;cursor:pointer">
              <input type="radio" name="ds-phone-choice" value="${escapeHtml(o.value)}" ${i === 0 ? 'checked' : ''}>
              ${escapeHtml(o.label)}
            </label>
          `).join('')}
          <label style="display:flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid var(--border);border-radius:8px;cursor:pointer">
            <input type="radio" name="ds-phone-choice" value="__other" ${options.length === 0 ? 'checked' : ''}>
            Other number
          </label>
        </div>
        <input class="form-input" id="ds-other-phone" placeholder="e.g. +973 3345 1550" ${options.length > 0 ? 'disabled' : ''}>
      </div>
      <button type="button" class="btn btn-gold" id="ds-send-btn" style="width:100%;justify-content:center;padding:12px">
        Open WhatsApp
      </button>
    `);

    const otherInput = document.getElementById('ds-other-phone');
    document.querySelectorAll('input[name="ds-phone-choice"]').forEach(radio => {
      radio.addEventListener('change', () => {
        otherInput.disabled = radio.value !== '__other';
        if (radio.value === '__other') otherInput.focus();
      });
    });

    document.getElementById('ds-send-btn').addEventListener('click', () => {
      const checked = document.querySelector('input[name="ds-phone-choice"]:checked');
      const phone = checked && checked.value !== '__other' ? checked.value : otherInput.value.trim();
      if (!phone) { Toast.error('Enter a WhatsApp number.'); return; }
      Modal.close();
      this.shareToWhatsApp(kind, doc, settings, phone);
    });
  }
};
