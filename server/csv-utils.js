// Third Eye Computer Solutions - POS System
// Minimal CSV parser/writer. Excel opens CSV files natively, so this gives
// "Import/Export to Excel" functionality without needing any extra library.

function escapeCsvField(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// rows: array of objects. columns: array of { key, header }.
function toCsv(rows, columns) {
  const headerLine = columns.map(c => escapeCsvField(c.header)).join(',');
  const lines = rows.map(row =>
    columns.map(c => escapeCsvField(row[c.key])).join(',')
  );
  return [headerLine, ...lines].join('\r\n');
}

// Parses CSV text into an array of objects keyed by the header row.
// Handles quoted fields, embedded commas, and embedded newlines.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  function pushField() {
    row.push(field);
    field = '';
  }
  function pushRow() {
    pushField();
    rows.push(row);
    row = [];
  }

  while (i < len) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += char; i++; continue;
    } else {
      if (char === '"') { inQuotes = true; i++; continue; }
      if (char === ',') { pushField(); i++; continue; }
      if (char === '\r') { i++; continue; }
      if (char === '\n') { pushRow(); i++; continue; }
      field += char; i++; continue;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();

  if (rows.length === 0) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1)
    .filter(r => r.some(cell => cell.trim() !== ''))
    .map(r => {
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = (r[idx] !== undefined ? r[idx] : '').trim(); });
      return obj;
    });
}

module.exports = { toCsv, parseCsv };
