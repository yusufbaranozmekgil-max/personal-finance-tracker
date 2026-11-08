import { describe, expect, it } from 'vitest';
import { Book, emptyBook } from './model';
import { addMonths, convert, isValidIsoDate, parseAmount } from './money';
import { parseQuickEntry } from './quick-entry';
import { canAddTrade, fifo } from './fifo';
import { accountBalance, categoryBreakdown, monthSummary, netWorth, recurringCopies } from './ledger';
import { fromLegacy } from './legacy';
import { checkBook, readBackup, serializeBook } from './book-io';
import { applyStatement, parseStatementDate, previewStatement } from './statement';
import { averageMonthlySavings, forecastBudget, forecastGoal } from './forecast';
import { demoBook } from './demo';

function book(): Book {
  const b = emptyBook('EUR');
  b.accounts[0].openingBalance = 100;
  return b;
}

describe('parseAmount', () => {
  it.each([
    ['42', 42], ['42.5', 42.5], ['42,5', 42.5], ['1,234.56', 1234.56], ['1.234,56', 1234.56],
    ['1 234,5', 1234.5], ['1,234', 1234], ['1.234', 1234], ['1.234.567', 1234567], ['-12.30', -12.3],
    ["1'000.25", 1000.25], ['0.01', 0.01],
  ])('%s -> %d', (input, out) => expect(parseAmount(input)).toBe(out));

  it.each(['', 'abc', '1.2345', '12,34,5', '1,2.3,4', '1e5', '.5', '1.234,567', '10000000000000'])('rejects %s', input =>
    expect(parseAmount(input)).toBeNull());
});

describe('dates', () => {
  it('validates real calendar dates only', () => {
    expect(isValidIsoDate('2024-02-29')).toBe(true);
    expect(isValidIsoDate('2023-02-29')).toBe(false);
    expect(isValidIsoDate('1805-01-01')).toBe(false);
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });
});

describe('quick entry', () => {
  const cats = book().categories;
  it('reads amount, note and category', () => {
    const q = parseQuickEntry('42,10 groceries at the market', cats)!;
    expect(q).toMatchObject({ kind: 'expense', amount: 42.1, note: 'groceries at the market' });
    expect(cats.find(c => c.id === q.categoryId)?.name).toBe('Groceries');
  });
  it('plus sign means income', () => {
    const q = parseQuickEntry('+3200 salary', cats)!;
    expect(q.kind).toBe('income');
    expect(cats.find(c => c.id === q.categoryId)?.name).toBe('Salary');
  });
  it('needs an amount', () => expect(parseQuickEntry('coffee', cats)).toBeNull());
});

describe('fifo', () => {
  const t = (side: 'buy' | 'sell', quantity: number, price: number, date: string) => ({ id: `${side}${date}${price}`, side, quantity, price, date });
  it('sells the oldest lot first', () => {
    const s = fifo([t('buy', 1, 40000, '2026-01-01'), t('buy', 1, 50000, '2026-02-01'), t('sell', 1, 60000, '2026-03-01')]);
    expect(s.realized).toBe(20000);
    expect(s.quantity).toBe(1);
    expect(s.averageCost).toBe(50000);
  });
  it('splits a sell across lots', () => {
    const s = fifo([t('buy', 2, 10, '2026-01-01'), t('buy', 2, 20, '2026-01-02'), t('sell', 3, 30, '2026-01-03')]);
    expect(s.realized).toBe(2 * 20 + 1 * 10);
    expect(s.costBasis).toBe(20);
  });
  it('refuses selling more than held at that date', () => {
    expect(canAddTrade([t('buy', 1, 10, '2026-02-01')], t('sell', 1, 10, '2026-01-01'))).toBe(false);
    expect(canAddTrade([t('buy', 1, 10, '2026-02-01')], t('sell', 1, 10, '2026-02-01'))).toBe(true);
  });
});

describe('ledger', () => {
  it('balances accounts across transfers and currencies', () => {
    const b = book();
    b.accounts.push({ id: 'usd', name: 'USD', kind: 'bank', currency: 'USD', openingBalance: 0, createdAt: '' });
    b.entries = [
      { id: '1', kind: 'income', amount: 50, date: '2026-01-02', note: '', accountId: b.accounts[0].id },
      { id: '2', kind: 'expense', amount: 30, date: '2026-01-03', note: '', accountId: b.accounts[0].id },
      { id: '3', kind: 'transfer', amount: 20, toAmount: 22, date: '2026-01-04', note: '', accountId: b.accounts[0].id, toAccountId: 'usd' },
    ];
    expect(accountBalance(b, b.accounts[0])).toBe(100);
    expect(accountBalance(b, b.accounts[1])).toBe(22);
    expect(accountBalance(b, b.accounts[0], '2026-01-02')).toBe(150);
    expect(netWorth(b).missing).toEqual(['USD']);
    b.rates = { perUsd: { USD: 1, EUR: 0.5 }, fetchedAt: '', source: '' };
    expect(netWorth(b)).toEqual({ value: 111, missing: [] });
    expect(convert(10, 'EUR', 'USD', b.rates)).toBe(20);
  });

  it('summarises a month without counting transfers', () => {
    const b = book();
    const food = b.categories.find(c => c.name === 'Groceries')!.id;
    b.entries = [
      { id: '1', kind: 'expense', amount: 30, date: '2026-01-03', note: '', accountId: b.accounts[0].id, categoryId: food },
      { id: '2', kind: 'expense', amount: 10, date: '2026-01-05', note: '', accountId: b.accounts[0].id },
      { id: '3', kind: 'transfer', amount: 99, date: '2026-01-05', note: '', accountId: b.accounts[0].id, toAccountId: 'x' },
      { id: '4', kind: 'income', amount: 100, date: '2026-02-01', note: '', accountId: b.accounts[0].id },
    ];
    expect(monthSummary(b, '2026-01')).toMatchObject({ income: 0, expense: 40, net: -40 });
    const shares = categoryBreakdown(b, '2026-01', 'expense');
    expect(shares.map(s => [s.name, s.share])).toEqual([['Groceries', 0.75], ['Uncategorised', 0.25]]);
  });

  it('writes recurring copies once per month, only when the day has come', () => {
    const b = book();
    b.entries = [{ id: 'rent', kind: 'expense', amount: 900, date: '2026-01-31', note: 'Rent', accountId: b.accounts[0].id, recurring: true }];
    const copies = recurringCopies(b, '2026-03-30');
    expect(copies.map(c => c.date)).toEqual(['2026-02-28']);
    expect(copies[0].recurring).toBeUndefined();
    b.entries.push(...copies);
    expect(recurringCopies(b, '2026-03-30')).toEqual([]);
    expect(recurringCopies(b, '2026-03-31').map(c => c.date)).toEqual(['2026-03-31']);
  });
});

describe('legacy data from the first version', () => {
  const legacy = {
    version: 1,
    transactions: [
      { id: 't1', type: 'expense', category: 'Food', amount: 450, date: '2026-06-01', description: 'Groceries', paymentMethod: 'Card', accountId: 'a1' },
      { id: 't2', type: 'income', category: 'Salary', amount: 25000, date: '2026-06-01', description: '', paymentMethod: 'Bank', accountId: 'a1', isRecurring: true },
      { id: 't3', type: 'transfer', category: '', amount: 100, date: '2026-06-02', description: '', paymentMethod: '', accountId: 'a1', transferAccountId: 'a2' },
      { id: 't4', type: 'expense', category: 'Food', amount: -1, date: 'bad' },
      { id: 't5', type: 'income', category: 'Salary', amount: 25000, date: '2026-07-01', accountId: 'a1', isRecurring: true, recurringParentId: 't2' },
    ],
    accounts: [
      { id: 'a1', name: 'Bank', type: 'bank', initialBalance: 1000, currency: 'TRY', createdAt: '2026-01-01' },
      { id: 'a2', name: 'Cash', type: 'cash', initialBalance: 0, currency: 'TRY', createdAt: '2026-01-01' },
    ],
    assets: [{ id: 'h1', name: 'Bitcoin', symbol: 'btc', type: 'Crypto', quantity: 1, purchasePrice: 40000, unitPrice: 50000, currency: 'USD', trades: [{ id: 'x', type: 'buy', quantity: 1, price: 40000, date: '2026-01-01' }] }],
    goals: [{ id: 'g1', name: 'Laptop', icon: '💻', targetAmount: 30000, currentAmount: 5000, deadline: '2026-12-01', description: '', createdAt: '' }],
    categories: { income: [{ id: 'c', name: 'Salary' }], expense: ['Food'], assetTypes: [] },
    settings: { monthlyLimit: 20000, currency: 'TRY', usdRate: 40, eurRate: 44, stockApiProvider: 'finnhub', stockApiKey: 'k' },
  };

  it('converts and keeps balances', () => {
    const { book: b, skipped } = fromLegacy(legacy);
    expect(skipped).toBe(1);
    expect(checkBook(b)).toBeNull();
    expect(b.baseCurrency).toBe('TRY');
    expect(b.entries).toHaveLength(4);
    expect(accountBalance(b, b.accounts[0])).toBe(1000 - 450 + 25000 - 100 + 25000);
    expect(b.entries.find(e => e.id === 't2')?.recurring).toBe(true);
    expect(b.entries.find(e => e.id === 't5')).toMatchObject({ recurringOf: 't2' });
    expect(b.holdings[0]).toMatchObject({ symbol: 'BTC', kind: 'crypto', price: 50000 });
    expect(b.budget).toBe(20000);
    expect(b.rates?.perUsd['EUR']).toBeCloseTo(40 / 44);
    expect(b.stockApi).toEqual({ provider: 'finnhub', key: 'k' });
  });

  it('is read as a backup file too', () => {
    const r = readBackup(JSON.stringify(legacy));
    expect(r.ok && r.book.entries.length).toBe(4);
  });
});

describe('backup files', () => {
  it('round-trips', () => {
    const b = demoBook('EUR', '2026-11-08');
    const r = readBackup(serializeBook(b));
    expect(r.ok && r.book.entries.length).toBe(b.entries.length);
  });
  it('rejects damaged files', () => {
    expect(readBackup('nope')).toMatchObject({ ok: false });
    const b = book();
    b.entries = [{ id: '1', kind: 'expense', amount: 1, date: '2026-01-01', note: '', accountId: 'missing' }];
    expect(readBackup(serializeBook(b))).toMatchObject({ ok: false, error: 'An entry is damaged.' });
  });
});

describe('bank statements', () => {
  it('reads debit/credit columns and flags duplicates', () => {
    const b = book();
    const acc = b.accounts[0].id;
    b.entries = [{ id: 'e', kind: 'expense', amount: 12.5, date: '2026-03-01', note: 'Coffee', accountId: acc }];
    const p = previewStatement(b, acc, [
      { 'Booking date': '01.03.2026', Description: 'Coffee', Debit: '12,50', Credit: '' },
      { 'Booking date': '02.03.2026', Description: 'Refund', Debit: '', Credit: '1.200,00' },
      { 'Booking date': 'soon', Description: 'x', Debit: '1', Credit: '' },
    ]);
    expect([p.ready, p.duplicates, p.errors]).toEqual([1, 1, 1]);
    expect(p.rows[1].entry).toMatchObject({ kind: 'income', amount: 1200, date: '2026-03-02' });
    const { book: after, added } = applyStatement(b, acc, p);
    expect(added).toBe(1);
    expect(after.entries).toHaveLength(2);
  });
  it('signed single amount column', () => {
    const p = previewStatement(book(), book().accounts[0].id, [{ Date: '2026-01-05', Amount: -40, Details: 'Shop' }]);
    expect(p.rows[0].entry).toMatchObject({ kind: 'expense', amount: 40 });
  });
  it('dates', () => {
    expect(parseStatementDate(45658)).toBe('2025-01-01');
    expect(parseStatementDate('3/4/2026', false)).toBe('2026-03-04');
    expect(parseStatementDate('31/02/2026')).toBeNull();
  });
});

describe('forecasts', () => {
  it('goal pace from average monthly savings', () => {
    const goal = { id: 'g', name: 'g', target: 1000, saved: 400, note: '', createdAt: '', deadline: '2027-01-15' };
    expect(forecastGoal(goal, 300, '2026-11-01')).toMatchObject({ status: 'on-track', remaining: 600 });
    expect(forecastGoal(goal, 50, '2026-11-01').status).toBe('behind');
    expect(forecastGoal(goal, -10, '2026-11-01').status).toBe('no-savings');
    expect(forecastGoal({ ...goal, saved: 1000 }, null, '2026-11-01').status).toBe('done');
  });
  it('averages only months with entries', () => {
    const b = book();
    b.entries = [{ id: '1', kind: 'income', amount: 300, date: '2026-10-10', note: '', accountId: b.accounts[0].id }];
    expect(averageMonthlySavings(b, '2026-11-08')).toBe(300);
    expect(averageMonthlySavings(book(), '2026-11-08')).toBeNull();
  });
  it('budget pace', () => {
    const b = book();
    b.budget = 300;
    b.entries = [{ id: '1', kind: 'expense', amount: 150, date: '2026-11-10', note: '', accountId: b.accounts[0].id }];
    expect(forecastBudget(b, '2026-11-10')).toMatchObject({ spent: 150, projected: 450, status: 'over-pace' });
  });
});

describe('demo', () => {
  it('is a valid book whose entries are all in the past', () => {
    const b = demoBook('JPY', '2026-11-08');
    expect(checkBook(b)).toBeNull();
    expect(b.entries.every(e => e.date <= '2026-11-08')).toBe(true);
    expect(recurringCopies(b, '2026-11-08')).toEqual([]);
  });
});
