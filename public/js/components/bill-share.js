// Third Eye Computer Solutions - POS System
// Bill sharing - lets the cashier send a customer's receipt to them on
// WhatsApp as a PDF, straight from checkout or Sales History.
//
// How it actually works (important, since WhatsApp has no public API for
// this kind of app to "just send a PDF" on its own):
//   1. We build a real PDF of the invoice with jsPDF (vendored, offline).
//   2. On phones (including iPhone Safari) we use the Web Share API
//      (navigator.share) with the PDF attached as a file. This opens the
//      native share sheet, where WhatsApp is one of the options - tapping
//      it drops the PDF straight into a chat with that contact.
//   3. On desktop browsers that don't support sharing files (most desktop
//      browsers), we download the PDF and open WhatsApp Web/App with the
//      message text pre-filled via a wa.me link, so the cashier just
//      attaches the already-downloaded PDF and hits send.
// This is the standard, store-safe way to do "send to WhatsApp" from a web
// app - there's no browser API that lets a website silently deliver a file
// into WhatsApp without the user seeing a share/send step.

const BillShare = {
  // Digits-only phone number formatted for wa.me (international format,
  // no +, no spaces/dashes). Assumes Bahrain (973) if an 8-digit local
  // number is given without a country code.
  normalizePhone(phone) {
    if (!phone) return '';
    let digits = String(phone).replace(/[^\d]/g, '');
    if (digits.length === 8) digits = '973' + digits; // local Bahrain number
    return digits;
  },

  buildMessageText(sale, settings) {
    const cur = settings.currency || 'BHD';
    const lines = [];
    lines.push(`*${settings.shopName || 'Receipt'}*`);
    lines.push(`Invoice: ${sale.invoiceNo}`);
    lines.push(`Date: ${new Date(sale.createdAt || Date.now()).toLocaleString('en-GB')}`);
    lines.push('');
    (sale.items || []).forEach(i => {
      const unitP = i.unitPrice !== undefined ? i.unitPrice : (i.lineTotal / i.quantity);
      lines.push(`${i.productName} x${i.quantity} - ${Number(i.lineTotal).toFixed(settings.currencyDecimals ?? 3)} ${cur}`);
    });
    lines.push('');
    lines.push(`Total: *${Number(sale.total).toFixed(settings.currencyDecimals ?? 3)} ${cur}*`);
    lines.push('');
    lines.push('Thank you for shopping with us! Your PDF receipt is attached.');
    return lines.join('\n');
  },

  buildPdf(sale, settings) {
    if (typeof window.jspdf === 'undefined') throw new Error('PDF library not loaded.');
    const { jsPDF } = window.jspdf;
    const cur = settings.currency || 'BHD';
    const dec = settings.currencyDecimals ?? 3;
    const items = sale.items || [];

    // Dynamic height so short and long carts both look right (receipt-style
    // narrow page, similar to an 80mm thermal receipt but as a proper PDF).
    const pageWidth = 80;
    const lineH = 5;
    const headerH = 42;
    const footerH = 24;
    const pageHeight = headerH + (items.length * (lineH * 2)) + footerH + 20;

    const doc = new jsPDF({ unit: 'mm', format: [pageWidth, pageHeight] });
    const cx = pageWidth / 2;
    let y = 10;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(settings.shopName || 'Receipt', cx, y, { align: 'center' });
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    if (settings.address) { doc.text(settings.address, cx, y, { align: 'center' }); y += 4; }
    if (settings.phone) { doc.text(`Tel: ${settings.phone}`, cx, y, { align: 'center' }); y += 4; }
    if (settings.vatNumber) { doc.text(`VAT No: ${settings.vatNumber}`, cx, y, { align: 'center' }); y += 4; }
    y += 2;
    doc.setLineDashPattern([1, 1], 0);
    doc.line(4, y, pageWidth - 4, y);
    y += 5;

    doc.setFontSize(8.5);
    doc.text(`Invoice: ${sale.invoiceNo || ''}`, 4, y); y += 4;
    doc.text(`Date: ${new Date(sale.createdAt || Date.now()).toLocaleString('en-GB')}`, 4, y); y += 4;
    doc.text(`Cashier: ${sale.cashierName || ''}`, 4, y); y += 4;
    doc.setLineDashPattern([1, 1], 0);
    doc.line(4, y, pageWidth - 4, y);
    y += 5;

    doc.setFont('helvetica', 'bold');
    items.forEach(i => {
      const unitP = i.unitPrice !== undefined ? i.unitPrice : (i.lineTotal / i.quantity);
      doc.setFontSize(8.5);
      doc.text(String(i.productName).slice(0, 30), 4, y);
      doc.text(Number(i.lineTotal).toFixed(dec), pageWidth - 4, y, { align: 'right' });
      y += 4;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(`x${i.quantity} @ ${Number(unitP).toFixed(dec)} each`, 5, y);
      y += 4.5;
      doc.setFont('helvetica', 'bold');
    });

    doc.setLineDashPattern([1, 1], 0);
    doc.line(4, y, pageWidth - 4, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('Subtotal:', 4, y); doc.text(Number(sale.subtotal || 0).toFixed(dec), pageWidth - 4, y, { align: 'right' }); y += 4;
    doc.text(`VAT (${settings.vatRate || 0}%):`, 4, y); doc.text(Number(sale.vatTotal || 0).toFixed(dec), pageWidth - 4, y, { align: 'right' }); y += 4;
    if (sale.discount > 0) {
      doc.text('Discount:', 4, y); doc.text('-' + Number(sale.discount).toFixed(dec), pageWidth - 4, y, { align: 'right' }); y += 4;
    }
    doc.line(4, y, pageWidth - 4, y);
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('TOTAL:', 4, y); doc.text(`${Number(sale.total || 0).toFixed(dec)} ${cur}`, pageWidth - 4, y, { align: 'right' });
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Payment (${(sale.paymentMethod || 'cash').toUpperCase()}):`, 4, y);
    doc.text(Number(sale.amountPaid || 0).toFixed(dec), pageWidth - 4, y, { align: 'right' });
    y += 6;
    doc.setFontSize(7.5);
    doc.text(settings.receiptFooter || 'Thank you for shopping with us!', cx, y, { align: 'center', maxWidth: pageWidth - 8 });

    return doc;
  },

  buildPdfBlob(sale, settings) {
    return this.buildPdf(sale, settings).output('blob');
  },

  // Main entry point: shares (or downloads + hands off to) a WhatsApp
  // message for the given sale + phone number.
  async shareToWhatsApp(sale, settings, phone) {
    const cleanPhone = this.normalizePhone(phone);
    if (!cleanPhone) {
      Toast.error('This customer has no phone number on file. Add one in the Customers screen first.');
      return;
    }
    const text = this.buildMessageText(sale, settings);
    let blob;
    try {
      blob = this.buildPdfBlob(sale, settings);
    } catch (e) {
      Toast.error('Could not generate the PDF receipt.');
      return;
    }
    const fileName = `Receipt-${sale.invoiceNo || Date.now()}.pdf`;
    const file = new File([blob], fileName, { type: 'application/pdf' });

    // Best path (works on iPhone Safari, Android Chrome): native share sheet
    // with the PDF attached, WhatsApp shows up as one of the share targets.
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: fileName, text });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return; // user cancelled the share sheet
        // fall through to the download + wa.me fallback below
      }
    }

    // Fallback (most desktop browsers): download the PDF, then open
    // WhatsApp with the message pre-filled so the cashier just attaches
    // the file that was downloaded and hits send.
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`, '_blank');
    Toast.success('PDF downloaded - attach it in the WhatsApp chat that just opened.');
  },

  downloadPdf(sale, settings) {
    try {
      this.buildPdf(sale, settings).save(`Receipt-${sale.invoiceNo || Date.now()}.pdf`);
    } catch (e) {
      Toast.error('Could not generate the PDF receipt.');
    }
  }
};
