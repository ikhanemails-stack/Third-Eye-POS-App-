// Third Eye Computer Solutions - POS System
// ZATCA (Saudi Arabia) Phase 2 "Fatoora Integration Phase" - configuration.
//
// This is SEPARATE from public/js/components/zatca.js, which only builds the
// Phase 1 simplified QR code shown on printed receipts (fine for shops that
// only need the informal, no-registration QR). This folder is for shops that
// are legally required to integrate with ZATCA's servers because they are
// VAT-registered and trading in Saudi Arabia specifically. Bahrain's own tax
// authority (NBR) is a different body with its own rules and does not use
// ZATCA at all - see server/zatca/README.md for the full explanation.
//
// ZATCA gives you three environments. Always finish onboarding + a full
// batch of test invoices in Sandbox, then Simulation, before ever touching
// Production - Production submissions are real, legally-binding tax filings.
const ENVIRONMENTS = {
  sandbox: {
    label: 'Developer Sandbox',
    baseUrl: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal',
  },
  simulation: {
    label: 'Simulation (pre-production)',
    baseUrl: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation',
  },
  production: {
    label: 'Production (LIVE - real tax filings)',
    baseUrl: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core',
  },
};

function getEnvironment(name) {
  return ENVIRONMENTS[name] || ENVIRONMENTS.sandbox;
}

module.exports = { ENVIRONMENTS, getEnvironment };
