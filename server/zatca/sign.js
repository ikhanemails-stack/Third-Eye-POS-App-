// Third Eye Computer Solutions - POS System
// ZATCA Phase 2 - invoice hashing, ECDSA signing, and embedding the
// cryptographic stamp (ds:Signature + QR) back into the UBL XML.
//
// *** VALIDATE AGAINST ZATCA'S SANDBOX BEFORE PRODUCTION USE ***
// The ext:UBLExtensions / ds:Signature block below follows the structure
// used by ZATCA's published sample invoices and the community reference
// implementations. It is the single most error-prone part of a ZATCA
// integration - if ZATCA updates their XSD/sample structure, or if the
// canonicalization here doesn't byte-for-byte match what their validator
// expects, invoices will be rejected with a schema/signature error rather
// than a helpful message. Run every sample invoice ZATCA's Sandbox asks for
// and fix any mismatch reported before requesting a Production CSID.
const crypto = require('crypto');
const forge = require('node-forge');

let c14n;
try {
  // Proper W3C XML Canonicalization, if the optional dependency installed
  // cleanly. Falls back to a lightweight approximation otherwise (fine for
  // our own deterministically-generated XML, but not a general C14N impl).
  c14n = require('xml-c14n')().createCanonicaliser('http://www.w3.org/TR/2001/REC-xml-c14n-20010315');
} catch {
  c14n = null;
}

async function canonicalize(xml) {
  if (c14n) {
    try {
      return await c14n.canonicalise(xml);
    } catch {
      // fall through to the naive path below
    }
  }
  // Naive fallback: our generator never emits comments or insignificant
  // attribute-order variation, so collapsing inter-tag whitespace is a
  // reasonable approximation of C14N for a fixed, self-generated document.
  return xml.replace(/>\s+</g, '><').trim();
}

/** SHA-256 hash of the canonicalized invoice XML, base64-encoded. */
async function computeInvoiceHash(unsignedXml) {
  const canonical = await canonicalize(unsignedXml);
  const hash = crypto.createHash('sha256').update(canonical, 'utf8').digest();
  return hash.toString('base64');
}

/** ECDSA-sign a base64 hash with the seller's secp256k1 private key (PEM). */
function signHashBase64(hashBase64, privateKeyPem) {
  const sign = crypto.createSign('SHA256');
  sign.update(Buffer.from(hashBase64, 'base64'));
  sign.end();
  const der = sign.sign({ key: privateKeyPem, dsaEncoding: 'der' });
  return der.toString('base64');
}

/** Extracts the raw public key bytes (base64) from the signing certificate. */
function publicKeyFromCertPem(certPem) {
  const cert = forge.pki.certificateFromPem(certPem);
  const der = forge.asn1.toDer(forge.pki.publicKeyToAsn1(cert.publicKey)).getBytes();
  return Buffer.from(der, 'binary').toString('base64');
}

function tlv(tag, valueBuffer) {
  const header = Buffer.from([tag, valueBuffer.length]);
  return Buffer.concat([header, valueBuffer]);
}

/**
 * Phase 2 QR: same tags 1-5 as the simple Phase 1 QR (seller name, VAT
 * number, timestamp, invoice total, VAT total) PLUS tags 6-9 carrying the
 * cryptographic stamp, which is what actually makes it "Phase 2".
 */
function buildPhase2QrBase64({ sellerName, vatNumber, timestamp, total, vatTotal, invoiceHashBase64, signatureBase64, certPem, certSignatureBase64 }) {
  const parts = [
    tlv(1, Buffer.from(sellerName, 'utf8')),
    tlv(2, Buffer.from(vatNumber, 'utf8')),
    tlv(3, Buffer.from(timestamp, 'utf8')),
    tlv(4, Buffer.from(String(total), 'utf8')),
    tlv(5, Buffer.from(String(vatTotal), 'utf8')),
    tlv(6, Buffer.from(invoiceHashBase64, 'base64')),
    tlv(7, Buffer.from(signatureBase64, 'base64')),
    tlv(8, Buffer.from(publicKeyFromCertPem(certPem), 'base64')),
  ];
  if (certSignatureBase64) {
    parts.push(tlv(9, Buffer.from(certSignatureBase64, 'base64')));
  }
  return Buffer.concat(parts).toString('base64');
}

/**
 * Inserts the ext:UBLExtensions block (digital signature) as the first
 * child of the Invoice root, immediately before cbc:ProfileID - the
 * position ZATCA's validator expects.
 */
function injectUblExtensions(unsignedXml, { invoiceHashBase64, signatureBase64, certPem, qrBase64 }) {
  const certDer = forge.pki.certificateToPem(forge.pki.certificateFromPem(certPem))
    .replace(/-----BEGIN CERTIFICATE-----/, '')
    .replace(/-----END CERTIFICATE-----/, '')
    .replace(/\r?\n/g, '');

  const extensionsXml = `<ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI>
      <ext:ExtensionContent>
        <sig:UBLDocumentSignatures xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2"
            xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2"
            xmlns:sbc="urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2">
          <sac:SignatureInformation>
            <cbc:ID xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">urn:oasis:names:specification:ubl:signature:1</cbc:ID>
            <sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>
            <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="signature">
              <ds:SignedInfo>
                <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>
                <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>
                <ds:Reference Id="invoiceSignedData" URI="">
                  <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                  <ds:DigestValue>${invoiceHashBase64}</ds:DigestValue>
                </ds:Reference>
              </ds:SignedInfo>
              <ds:SignatureValue>${signatureBase64}</ds:SignatureValue>
              <ds:KeyInfo>
                <ds:X509Data>
                  <ds:X509Certificate>${certDer}</ds:X509Certificate>
                </ds:X509Data>
              </ds:KeyInfo>
            </ds:Signature>
          </sac:SignatureInformation>
        </sig:UBLDocumentSignatures>
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>`;

  // The QR itself lives as an AdditionalDocumentReference("QR") per ZATCA's
  // sample invoices, inserted right after the PIH reference.
  const qrRefXml = `<cac:AdditionalDocumentReference>
    <cbc:ID>QR</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${qrBase64}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>`;

  let xml = unsignedXml.replace(
    /(<cbc:ProfileID>)/,
    `${extensionsXml}\n  $1`
  );
  xml = xml.replace(
    /(<cac:AdditionalDocumentReference>\s*<cbc:ID>PIH<\/cbc:ID>[\s\S]*?<\/cac:AdditionalDocumentReference>)/,
    `$1\n  ${qrRefXml}`
  );
  return xml;
}

/**
 * Full pipeline: unsigned XML -> hash -> sign -> signed XML + QR.
 * Returns everything server/routes/zatca-ksa.js needs to report/clear
 * the invoice and print the receipt.
 */
async function signInvoice(unsignedXml, { privateKeyPem, certPem, sellerName, vatNumber, timestamp, total, vatTotal, certSignatureBase64 }) {
  const invoiceHashBase64 = await computeInvoiceHash(unsignedXml);
  const signatureBase64 = signHashBase64(invoiceHashBase64, privateKeyPem);
  const qrBase64 = buildPhase2QrBase64({
    sellerName, vatNumber, timestamp, total, vatTotal,
    invoiceHashBase64, signatureBase64, certPem, certSignatureBase64,
  });
  const signedXml = injectUblExtensions(unsignedXml, { invoiceHashBase64, signatureBase64, certPem, qrBase64 });
  return {
    invoiceHashBase64,
    signatureBase64,
    qrBase64,
    signedXml,
    signedXmlBase64: Buffer.from(signedXml, 'utf8').toString('base64'),
  };
}

module.exports = { computeInvoiceHash, signHashBase64, buildPhase2QrBase64, injectUblExtensions, signInvoice };
