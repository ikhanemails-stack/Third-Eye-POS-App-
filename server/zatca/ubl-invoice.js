// Third Eye Computer Solutions - POS System
// ZATCA Phase 2 - UBL 2.1 XML invoice builder.
//
// Builds a ZATCA-flavoured UBL 2.1 "Simplified Tax Invoice" (B2C - what a
// POS system issues at checkout) from a sale record. Standard/B2B invoices
// (cleared before issuance rather than reported after) would need a second
// builder with a populated cac:AccountingCustomerParty and InvoiceTypeCode
// name="0100000" instead of "0200000" - out of scope here since a POS
// checkout is inherently a B2C simplified invoice.
//
// This produces the UNSIGNED invoice XML. server/zatca/sign.js takes this,
// computes the invoice hash + PIH chain, signs it, and injects the
// ds:Signature + QR UBLExtensions block that ZATCA requires before this can
// be reported.
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function money(n, decimals = 2) {
  return Number(n || 0).toFixed(decimals);
}

/**
 * @param {object} sale - sale record from db (server/routes/sales.js shape)
 * @param {object} settings - shop settings (name, VAT number, CR, address)
 * @param {object} chain - { icv, previousInvoiceHash, uuid, issueDate, issueTime }
 *   icv: integer invoice counter value, strictly incrementing, never reused,
 *        never reset - ZATCA rejects gaps or repeats.
 *   previousInvoiceHash: SHA-256 hash (base64) of the previous invoice you
 *        reported, or the ZATCA-defined seed hash for your very first one.
 */
function buildSimplifiedInvoiceXml(sale, settings, chain) {
  const lines = (sale.items || []).map((item, idx) => {
    const qty = Number(item.quantity || 0);
    const lineTotal = Number(item.lineTotal || 0);
    const vatRate = Number(settings.vatRate || 0);
    const lineNet = +(lineTotal / (1 + vatRate / 100)).toFixed(2);
    const lineVat = +(lineTotal - lineNet).toFixed(2);
    return `
  <cac:InvoiceLine>
    <cbc:ID>${idx + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="PCE">${qty}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${settings.currency || 'SAR'}">${money(lineNet)}</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${settings.currency || 'SAR'}">${money(lineVat)}</cbc:TaxAmount>
      <cbc:RoundingAmount currencyID="${settings.currency || 'SAR'}">${money(lineTotal)}</cbc:RoundingAmount>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Name>${esc(item.productName)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${vatRate}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${settings.currency || 'SAR'}">${money(item.unitPrice ?? lineNet / (qty || 1))}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${esc(sale.invoiceNo)}</cbc:ID>
  <cbc:UUID>${esc(chain.uuid)}</cbc:UUID>
  <cbc:IssueDate>${esc(chain.issueDate)}</cbc:IssueDate>
  <cbc:IssueTime>${esc(chain.issueTime)}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="0200000">388</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${esc(settings.currency || 'SAR')}</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>${esc(settings.currency || 'SAR')}</cbc:TaxCurrencyCode>
  <cac:AdditionalDocumentReference>
    <cbc:ID>ICV</cbc:ID>
    <cbc:UUID>${chain.icv}</cbc:UUID>
  </cac:AdditionalDocumentReference>
  <cac:AdditionalDocumentReference>
    <cbc:ID>PIH</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${esc(chain.previousInvoiceHash)}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="CRN">${esc(settings.crNumber)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(settings.address)}</cbc:StreetName>
        <cbc:CityName>${esc(settings.city || '')}</cbc:CityName>
        <cbc:Country><cbc:IdentificationCode>SA</cbc:IdentificationCode></cbc:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(settings.vatNumber)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(settings.shopName)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(sale.customerName || 'Walk-in Customer')}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>${sale.paymentMethod === 'cash' ? '10' : '42'}</cbc:PaymentMeansCode>
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${settings.currency || 'SAR'}">${money(sale.vatTotal)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${settings.currency || 'SAR'}">${money(sale.subtotal)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${settings.currency || 'SAR'}">${money(sale.vatTotal)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${Number(settings.vatRate || 0)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${settings.currency || 'SAR'}">${money(sale.subtotal)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${settings.currency || 'SAR'}">${money(sale.subtotal)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${settings.currency || 'SAR'}">${money(sale.total)}</cbc:TaxInclusiveAmount>
    <cbc:PrepaidAmount currencyID="${settings.currency || 'SAR'}">0.00</cbc:PrepaidAmount>
    <cbc:PayableAmount currencyID="${settings.currency || 'SAR'}">${money(sale.total)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${lines}
</Invoice>`;
}

module.exports = { buildSimplifiedInvoiceXml };
