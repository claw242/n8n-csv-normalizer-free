'use strict';

// Loupe & Lettres — créé avec l'aide de l'IA
// Synthetic demonstration profiles; actual bank exports have not been verified.
const PROFILES = Object.freeze({
  qonto: { delimiter: ',', date: 'Date', label: 'Label', amount: 'Amount', currency: 'Currency', locale: 'en', dateStyle: 'iso' },
  boursorama: { delimiter: ';', date: 'Date opération', label: 'Libellé', amount: 'Montant', currency: 'Devise', locale: 'fr', dateStyle: 'fr' },
  revolut_business: { delimiter: ',', date: 'Date', label: 'Description', amount: 'Amount', currency: 'Currency', locale: 'en', dateStyle: 'iso' },
  credit_agricole: { delimiter: ';', date: 'Date', label: 'Libellé', debit: 'Débit', credit: 'Crédit', currency: 'Devise', locale: 'fr', dateStyle: 'fr' },
});
const CURRENCIES = new Set(['EUR', 'USD', 'GBP', 'CHF']);

function parseCsv(source, delimiter) {
  if (typeof source !== 'string' || source.length > 1000000) throw new Error('CSV must be text of at most 1000000 characters');
  const text = source.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', quoted = false, closed = false;
  const pushField = () => { row.push(field); field = ''; closed = false; };
  const pushRow = () => {
    pushField();
    if (row.some(value => value.trim() !== '')) rows.push(row);
    row = [];
    if (rows.length > 10001) throw new Error('CSV exceeds 10000 data rows');
  };
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === delimiter) pushField();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      pushRow();
    } else if (char === '"') {
      if (field !== '' || closed) throw new Error('Unexpected quote in CSV');
      quoted = true;
    } else {
      if (closed) throw new Error('Unexpected text after closing CSV quote');
      field += char;
    }
  }
  if (quoted) throw new Error('Unclosed CSV quote');
  if (field !== '' || row.length || closed) pushRow();
  if (!rows.length) throw new Error('CSV is empty');
  return rows;
}

function parseDate(value, style) {
  const text = value.trim();
  const match = (style === 'fr' ? /^(\d{2})\/(\d{2})\/(\d{4})$/ : /^(\d{4})-(\d{2})-(\d{2})$/).exec(text);
  if (!match) throw new Error('Date must match the profile date format');
  const [year, month, day] = style === 'fr' ? [Number(match[3]), Number(match[2]), Number(match[1])] : match.slice(1).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1900 || year > 2199 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) throw new Error('Invalid calendar date');
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseAmount(value, locale) {
  const text = value.trim().replace(/[\u00A0\u202F]/g, ' ');
  const pattern = locale === 'fr'
    ? /^[+-]?(?:\d+|\d{1,3}(?: \d{3})+)(?:,\d{1,2})?$/
    : /^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/;
  if (!pattern.test(text)) throw new Error('Invalid amount or unsupported precision');
  const clean = locale === 'fr' ? text.replace(/ /g, '').replace(',', '.') : text.replace(/,/g, '');
  const negative = clean.startsWith('-');
  const [whole, fraction = ''] = clean.replace(/^[+-]/, '').split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) throw new Error('Amount exceeds safe integer range');
  return cents === 0 ? 0 : negative ? -cents : cents;
}

function normalizeStatement(input) {
  if (!input || typeof input !== 'object' || typeof input.profile !== 'string' || !Object.hasOwn(PROFILES, input.profile)) throw new Error('Unknown profile');
  const config = PROFILES[input.profile];
  const rows = parseCsv(input.csv, config.delimiter);
  const headers = rows[0].map(value => value.trim());
  if (headers.some(value => value === '') || new Set(headers).size !== headers.length) throw new Error('Empty or duplicate CSV header');
  const required = [config.date, config.label, config.currency, ...(config.amount ? [config.amount] : [config.debit, config.credit])];
  for (const name of required) if (!headers.includes(name)) throw new Error(`Missing column: ${name}`);
  const seen = new Map();
  const totals = {};
  const transactions = rows.slice(1).map((values, index) => {
    const rowNumber = index + 2;
    try {
      if (values.length !== headers.length) throw new Error('Column count does not match header');
      const get = name => values[headers.indexOf(name)].trim();
      const date = parseDate(get(config.date), config.dateStyle);
      const label = get(config.label);
      if (!label) throw new Error('Transaction label is empty');
      const currency = get(config.currency).toUpperCase();
      if (!CURRENCIES.has(currency)) throw new Error('Currency must be EUR, USD, GBP or CHF');
      let amountCents;
      if (config.amount) amountCents = parseAmount(get(config.amount), config.locale);
      else {
        const debitText = get(config.debit), creditText = get(config.credit);
        if (!debitText && !creditText) throw new Error('Both debit and credit are empty');
        const debit = debitText ? parseAmount(debitText, config.locale) : 0;
        const credit = creditText ? parseAmount(creditText, config.locale) : 0;
        if (debit < 0 || credit < 0 || (debit !== 0 && credit !== 0)) throw new Error('Debit/credit requires nonnegative values and at most one nonzero side');
        amountCents = credit - debit;
      }
      const key = JSON.stringify([date, label, amountCents, currency]);
      const duplicateOf = seen.get(key) ?? null;
      if (duplicateOf === null) seen.set(key, rowNumber);
      const total = (totals[currency] || 0) + amountCents;
      if (!Number.isSafeInteger(total)) throw new Error('Currency total exceeds safe integer range');
      totals[currency] = total;
      return { row: rowNumber, date, label, amountCents, currency, duplicateOf };
    } catch (error) { throw new Error(`Data row ${rowNumber}: ${error.message}`); }
  });
  return {
    profile: input.profile,
    transactions,
    summary: {
      count: transactions.length,
      possibleDuplicates: transactions.filter(item => item.duplicateOf !== null).length,
      totalsCentsByCurrency: totals,
    },
    limitations: 'Synthetic example profiles only. Real bank exports not verified. Possible duplicates are preserved; review them before reconciliation.',
  };
}

module.exports = { normalizeStatement, parseCsv, parseDate, parseAmount };
