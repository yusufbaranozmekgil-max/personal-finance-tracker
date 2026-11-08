import { Currency, IsoDate, MonthKey, Rates } from './model';

/** Largest amount accepted anywhere: keeps sums far from float trouble. */
export const MAX_AMOUNT = 1e12;

/**
 * Parses what people type: "1234.5", "1,234.50", "1.234,50", "1 234,5", "-12".
 * Money has at most two decimals, so the last separator is the decimal mark
 * when 1–2 digits follow it, and a thousands separator when exactly 3 follow.
 * Returns null for anything else.
 */
export function parseAmount(input: string): number | null {
  const s = input.trim().replace(/[\s  ']/g, '');
  if (!/^[+-]?\d[\d.,]*$/.test(s)) return null;
  const sign = s.startsWith('-') ? -1 : 1;
  const body = s.replace(/^[+-]/, '');
  const lastSep = Math.max(body.lastIndexOf('.'), body.lastIndexOf(','));
  let intPart = body;
  let fracPart = '';
  if (lastSep !== -1) {
    const tail = body.slice(lastSep + 1);
    if (tail.length === 1 || tail.length === 2) {
      intPart = body.slice(0, lastSep);
      fracPart = tail;
    } else if (tail.length !== 3) {
      return null;
    }
  }
  // Whatever separators remain in the integer part must group in threes.
  const groups = intPart.split(/[.,]/);
  if (groups.length > 1 && (groups[0].length > 3 || groups.slice(1).some(g => g.length !== 3))) return null;
  if (new Set(intPart.replace(/\d/g, '')).size > 1) return null;
  const value = sign * Number(`${groups.join('')}.${fracPart || '0'}`);
  if (!Number.isFinite(value) || Math.abs(value) > MAX_AMOUNT) return null;
  return Math.round(value * 100) / 100;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(amount: number, currency: Currency, opts: { sign?: boolean; compact?: boolean } = {}): string {
  const key = `${currency}|${opts.sign ? 1 : 0}|${opts.compact ? 1 : 0}`;
  let f = formatters.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(undefined, {
        style: 'currency', currency,
        signDisplay: opts.sign ? 'exceptZero' : 'auto',
        notation: opts.compact ? 'compact' : 'standard',
        maximumFractionDigits: opts.compact ? 1 : 2,
      });
    } catch {
      f = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    formatters.set(key, f);
  }
  return f.format(amount);
}

export function formatNumber(n: number, maxFraction = 2): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: maxFraction }).format(n);
}

/** Converts between currencies with USD-based rates. Returns null when a rate is missing. */
export function convert(amount: number, from: Currency, to: Currency, rates: Rates | null): number | null {
  if (from === to) return amount;
  const a = rates?.perUsd[from];
  const b = rates?.perUsd[to];
  if (!a || !b) return null;
  return (amount / a) * b;
}

export function todayIso(now = new Date()): IsoDate {
  return toIsoDate(now);
}

export function toIsoDate(d: Date): IsoDate {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthOf(date: IsoDate): MonthKey {
  return date.slice(0, 7);
}

export function addMonths(month: MonthKey, delta: number): MonthKey {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function daysInMonth(month: MonthKey): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function monthLabel(month: MonthKey, style: 'long' | 'short' = 'long'): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: style, year: 'numeric' });
}

/** True for a real calendar date between 1900 and 2100. */
export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (y < 1900 || y > 2100) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

const REGION_CURRENCY: Record<string, Currency> = {
  US: 'USD', GB: 'GBP', TR: 'TRY', JP: 'JPY', CN: 'CNY', IN: 'INR', CA: 'CAD', AU: 'AUD',
  NZ: 'NZD', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK', HU: 'HUF',
  RO: 'RON', BR: 'BRL', MX: 'MXN', ZA: 'ZAR', KR: 'KRW', SG: 'SGD', HK: 'HKD', IL: 'ILS',
  AE: 'AED', SA: 'SAR', ID: 'IDR', MY: 'MYR', TH: 'THB', PH: 'PHP', IS: 'ISK', BG: 'BGN',
};
const EURO_REGIONS = ['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK'];

/** Best guess of the user's currency from the browser locale; falls back to USD. */
export function guessCurrency(locales: readonly string[] = navigator.languages): Currency {
  for (const loc of locales) {
    let region: string | undefined;
    try { region = new Intl.Locale(loc).maximize().region; } catch { continue; }
    if (!region) continue;
    if (EURO_REGIONS.includes(region)) return 'EUR';
    if (REGION_CURRENCY[region]) return REGION_CURRENCY[region];
  }
  return 'USD';
}

/** Currencies offered in pickers: the ones the free rate feeds cover. */
export const COMMON_CURRENCIES: Currency[] = [
  'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'CNY', 'HKD', 'SGD', 'INR', 'KRW',
  'TRY', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'ISK', 'ILS', 'AED', 'SAR',
  'ZAR', 'BRL', 'MXN', 'IDR', 'MYR', 'THB', 'PHP',
];

export function currencyName(code: Currency): string {
  try {
    return new Intl.DisplayNames(undefined, { type: 'currency' }).of(code) ?? code;
  } catch {
    return code;
  }
}
