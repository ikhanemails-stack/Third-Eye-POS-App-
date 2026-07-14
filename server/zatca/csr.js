// Third Eye Computer Solutions - POS System
// ZATCA Phase 2 - CSR (Certificate Signing Request) + EC key generation.
//
// ZATCA requires a secp256k1 EC key pair and a CSR carrying specific subject
// fields and a custom certificate-template extension. This mirrors what
// ZATCA's own "Fatoora SDK" CSR tool does under the hood (it also just shells
// out to openssl with a generated config file) rather than reimplementing
// ASN.1 CSR encoding by hand, which is easy to get subtly wrong in a way
// that only shows up as a cryptic rejection from ZATCA's servers.
//
// IMPORTANT - VERIFY BEFORE SANDBOX USE:
// The exact subject fields and the certificate-template OID/value below are
// taken from ZATCA's published CSR generation template as of this writing.
// ZATCA has changed these before. Before running this against even the
// Sandbox environment, compare the config this generates against the
// current template on the Fatoora developer portal (Developers > CSR
// Generation Tool) and adjust `buildOpensslConfig()` if anything differs.
//
// Requires the `openssl` binary on PATH (present on virtually all Linux
// hosts, including Railway's default Node buildpack image).
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

function buildOpensslConfig({
  commonName,       // EGS unit common name, e.g. your solution name
  serialNumber,     // "1-<solution name>|2-<version>|3-<unique EGS UUID>"
  organizationIdentifier, // 15-digit VAT registration number (seller's)
  organizationUnitName,   // branch / CR number
  organizationName,       // legal registered business name
  countryCode = 'SA',
  invoiceType = '1100',   // 1100 = supports both standard (B2B) and simplified (B2C)
  location,          // branch address / city
  industry,          // business category, e.g. "Retail"
  environment = 'sandbox', // sandbox | simulation | production
}) {
  // ZATCA's sandbox/simulation CSRs use a different certificate-template
  // extension value than production - this trips people up constantly.
  const template = environment === 'production'
    ? 'ZATCA-Code-Signing'
    : 'PREZATCA-Code-Signing';

  return `
oid_section = OIDs
[ OIDs ]
certificateTemplateName = 1.3.6.1.4.1.311.20.2

[ req ]
default_bits = 256
distinguished_name = dn
req_extensions = v3_req
prompt = no

[ dn ]
CN = ${commonName}
serialNumber = ${serialNumber}
organizationIdentifier = ${organizationIdentifier}
OU = ${organizationUnitName}
O = ${organizationName}
C = ${countryCode}

[ v3_req ]
certificateTemplateName = ASN1:PRINTABLESTRING:${template}
subjectAltName = dirName:alt_names

[ alt_names ]
SN = ${serialNumber}
UID = ${organizationIdentifier}
title = ${invoiceType}
registeredAddress = ${location || ''}
businessCategory = ${industry || 'Retail'}
`.trim() + '\n';
}

/**
 * Generates a fresh secp256k1 EC key pair + a ZATCA-formatted CSR.
 * Returns PEM strings - the caller (server/routes/zatca-ksa.js) is
 * responsible for encrypting privateKeyPem before storing it in the DB.
 * Never send privateKeyPem to the browser.
 */
function generateCsr(sellerInfo) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zatca-csr-'));
  const keyPath = path.join(tmpDir, 'private.pem');
  const csrPath = path.join(tmpDir, 'csr.pem');
  const confPath = path.join(tmpDir, 'csr.cnf');

  try {
    execFileSync('openssl', ['ecparam', '-name', 'secp256k1', '-genkey', '-noout', '-out', keyPath]);

    fs.writeFileSync(confPath, buildOpensslConfig(sellerInfo));
    execFileSync('openssl', [
      'req', '-new',
      '-key', keyPath,
      '-config', confPath,
      '-out', csrPath,
      '-sha256',
    ]);

    const privateKeyPem = fs.readFileSync(keyPath, 'utf8');
    const csrPem = fs.readFileSync(csrPath, 'utf8');
    // ZATCA's onboarding API wants the CSR as base64 WITHOUT the
    // -----BEGIN/END CERTIFICATE REQUEST----- header/footer lines.
    const csrBase64 = csrPem
      .replace(/-----BEGIN CERTIFICATE REQUEST-----/, '')
      .replace(/-----END CERTIFICATE REQUEST-----/, '')
      .replace(/\r?\n/g, '');

    return { privateKeyPem, csrPem, csrBase64 };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** Random EGS unit serial number, e.g. "1-TECS-POS|2-1.0.0|3-<uuid>". */
function generateEgsSerial(solutionName = 'TECS-POS', version = '1.0.0') {
  return `1-${solutionName}|2-${version}|3-${crypto.randomUUID()}`;
}

module.exports = { generateCsr, generateEgsSerial };
