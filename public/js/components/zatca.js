// Third Eye Computer Solutions - POS System
// ZATCA (Saudi Arabia) Phase 1 "Simplified Tax Invoice" QR code helper.
//
// WHAT THIS COVERS:
// ZATCA's e-invoicing rules (Fatoora) require every simplified (B2C) tax
// invoice to carry a QR code that decodes to a Base64 TLV (Tag-Length-Value)
// string containing 5 fields: seller name, VAT registration number,
// invoice timestamp, invoice total (VAT-inclusive), and VAT total.
// That is exactly what buildTlvBase64() below builds, and renderQrSvg()
// turns it into a scannable QR using the qrcode.js library already bundled
// with this app (see public/js/vendor/qrcode.js - the same one used for the
// payment-confirmation QR on the POS checkout screen).
//
// WHAT THIS DOES NOT COVER (be upfront with clients about this):
// ZATCA's Phase 2 "Integration Phase" additionally requires:
//   - Onboarding the business directly with ZATCA to receive a
//     cryptographic stamp identity (CSID)
//   - Digitally signing every invoice (XML / UBL 2.1 format)
//   - Reporting/clearing invoices in real time through ZATCA's own API
// That onboarding happens through ZATCA's Fatoora portal and is a
// legal/business registration step - it cannot be completed by adding code
// alone. Once a client has real ZATCA API credentials from that onboarding,
// a submitToZatca() function can be added to server/routes/sales.js to POST
// each invoice to ZATCA's reporting endpoint using those credentials.

const Zatca = {
  // Builds the Base64 TLV payload that the ZATCA QR code must encode.
  buildTlvBase64({ sellerName, vatNumber, timestampIso, invoiceTotal, vatTotal }) {
    const fields = [
      [1, sellerName || ''],
      [2, vatNumber || ''],
      [3, timestampIso || new Date().toISOString()],
      [4, Number(invoiceTotal || 0).toFixed(2)],
      [5, Number(vatTotal || 0).toFixed(2)]
    ];
    const bytes = [];
    fields.forEach(([tag, value]) => {
      const valueBytes = new TextEncoder().encode(String(value));
      bytes.push(tag & 0xff, valueBytes.length & 0xff);
      for (let i = 0; i < valueBytes.length; i++) bytes.push(valueBytes[i]);
    });
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  },

  // Returns an inline SVG <svg> string for the given Base64 payload, or ''
  // if the QR library isn't available for some reason.
  renderQrSvg(base64Payload, { cellSize = 3, margin = 3 } = {}) {
    if (typeof qrcode === 'undefined' || !base64Payload) return '';
    try {
      const qr = qrcode(0, 'M');
      qr.addData(base64Payload);
      qr.make();
      return qr.createSvgTag({ cellSize, margin });
    } catch (e) {
      return '';
    }
  },

  // Convenience: build the QR SVG straight from a sale + settings pair, the
  // way Receipt.buildHtml() needs it.
  buildQrSvgForSale(sale, settings) {
    const base64Payload = this.buildTlvBase64({
      sellerName: settings.shopName || '',
      vatNumber: settings.vatNumber || '',
      timestampIso: sale.createdAt || new Date().toISOString(),
      invoiceTotal: sale.total,
      vatTotal: sale.vatTotal
    });
    return this.renderQrSvg(base64Payload);
  },

  // --- "Scan to view receipt online" QR ---
  // This is a SEPARATE, non-ZATCA QR. It just encodes a plain URL, so a
  // normal phone camera recognizes it as a link and opens the receipt page
  // straight in the browser - the human-readable view customers expect.
  // It does not replace the compliance QR above; both can print together.
  buildReceiptUrl(sale) {
    const origin = (typeof window !== 'undefined' && window.location) ? window.location.origin : '';
    return `${origin}/r/${encodeURIComponent(sale.invoiceNo || '')}`;
  },

  buildReceiptQrSvg(sale) {
    if (!sale || !sale.invoiceNo) return '';
    return this.renderQrSvg(this.buildReceiptUrl(sale));
  }
};
