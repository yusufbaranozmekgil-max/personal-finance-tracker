import { Account, Book, Entry, IsoDate, MonthKey, newId } from './model';
import { addMonths, convert, daysInMonth, monthOf, round2 } from './money';
import { holdingValue } from './fifo';

/** Balance of one account in its own currency, optionally as of a date (inclusive). */
export function accountBalance(book: Book, account: Account, asOf?: IsoDate): number {
  let total = account.openingBalance;
  for (const e of book.entries) {
    if (asOf && e.date > asOf) continue;
    if (e.accountId === account.id) {
      total += e.kind === 'income' ? e.amount : -e.amount;
    }
    if (e.kind === 'transfer' && e.toAccountId === account.id) {
      total += e.toAmount ?? e.amount;
    }
  }
  return round2(total);
}

export interface Converted {
  value: number;
  /** Currencies that had no rate and were left out of `value`. */
  missing: string[];
}

/** Sums amounts given in various currencies into the base currency. */
export function sumInBase(book: Book, items: { amount: number; currency: string }[]): Converted {
  let value = 0;
  const missing = new Set<string>();
  for (const { amount, currency } of items) {
    const c = convert(amount, currency, book.baseCurrency, book.rates);
    if (c === null) missing.add(currency);
    else value += c;
  }
  return { value: round2(value), missing: [...missing] };
}

export function cashTotal(book: Book, asOf?: IsoDate): Converted {
  return sumInBase(book, book.accounts.map(a => ({ amount: accountBalance(book, a, asOf), currency: a.currency })));
}

export function holdingsTotal(book: Book): Converted {
  return sumInBase(book, book.holdings.map(h => ({ amount: holdingValue(h), currency: h.currency })));
}

export function netWorth(book: Book): Converted {
  const cash = cashTotal(book);
  const inv = holdingsTotal(book);
  return { value: round2(cash.value + inv.value), missing: [...new Set([...cash.missing, ...inv.missing])] };
}

function currencyOf(book: Book, accountId: string): string {
  return book.accounts.find(a => a.id === accountId)?.currency ?? book.baseCurrency;
}

/** Amount of an income/expense entry in base currency (null when no rate). */
export function entryInBase(book: Book, e: Entry): number | null {
  return convert(e.amount, currencyOf(book, e.accountId), book.baseCurrency, book.rates);
}

export interface MonthSummary {
  month: MonthKey;
  income: number;
  expense: number;
  net: number;
  missing: string[];
}

export function monthSummary(book: Book, month: MonthKey): MonthSummary {
  let income = 0;
  let expense = 0;
  const missing = new Set<string>();
  for (const e of book.entries) {
    if (e.kind === 'transfer' || monthOf(e.date) !== month) continue;
    const v = entryInBase(book, e);
    if (v === null) { missing.add(currencyOf(book, e.accountId)); continue; }
    if (e.kind === 'income') income += v; else expense += v;
  }
  return { month, income: round2(income), expense: round2(expense), net: round2(income - expense), missing: [...missing] };
}

export function lastMonths(book: Book, endMonth: MonthKey, count: number): MonthSummary[] {
  return Array.from({ length: count }, (_, i) => monthSummary(book, addMonths(endMonth, i - count + 1)));
}

export interface CategoryShare {
  categoryId: string | undefined;
  name: string;
  total: number;
  share: number;
}

export function categoryBreakdown(book: Book, month: MonthKey, kind: 'income' | 'expense'): CategoryShare[] {
  const totals = new Map<string | undefined, number>();
  for (const e of book.entries) {
    if (e.kind !== kind || monthOf(e.date) !== month) continue;
    const v = entryInBase(book, e);
    if (v === null) continue;
    totals.set(e.categoryId, (totals.get(e.categoryId) ?? 0) + v);
  }
  const sum = [...totals.values()].reduce((a, b) => a + b, 0);
  return [...totals.entries()]
    .map(([categoryId, total]) => ({
      categoryId,
      name: book.categories.find(c => c.id === categoryId)?.name ?? 'Uncategorised',
      total: round2(total),
      share: sum > 0 ? total / sum : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Writes the monthly copies of recurring entries for every month up to `today`
 * whose day has come. Idempotent: a month that already has a copy is skipped.
 */
export function recurringCopies(book: Book, today: IsoDate): Entry[] {
  const copies: Entry[] = [];
  const thisMonth = monthOf(today);
  const roots = book.entries.filter(e => e.recurring && !e.recurringOf);
  const have = new Set(book.entries.filter(e => e.recurringOf).map(e => `${e.recurringOf}|${monthOf(e.date)}`));
  for (const root of roots) {
    const day = Number(root.date.slice(8, 10));
    for (let m = addMonths(monthOf(root.date), 1); m <= thisMonth; m = addMonths(m, 1)) {
      const date = `${m}-${String(Math.min(day, daysInMonth(m))).padStart(2, '0')}`;
      if (date > today || have.has(`${root.id}|${m}`)) continue;
      const { recurring: _r, ...rest } = root;
      copies.push({ ...rest, id: newId(), date, recurringOf: root.id });
      have.add(`${root.id}|${m}`);
    }
  }
  return copies;
}

/** Cash across all accounts at the end of each month, rebuilt from the entries. */
export function cashSeries(book: Book, endMonth: MonthKey, count: number): { month: MonthKey; total: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const month = addMonths(endMonth, i - count + 1);
    return { month, total: cashTotal(book, `${month}-${String(daysInMonth(month)).padStart(2, '0')}`).value };
  });
}
