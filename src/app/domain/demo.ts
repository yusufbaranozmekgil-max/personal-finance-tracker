import { Book, Currency, Entry, emptyBook, newId } from './model';
import { addMonths, daysInMonth, monthOf, todayIso } from './money';

/** Rough size of one US dollar in other currencies, only to make demo amounts look plausible. */
const SCALE: Record<string, number> = {
  EUR: 1, GBP: 0.8, CHF: 0.9, JPY: 150, CNY: 7, HKD: 8, SGD: 1.3, INR: 85, KRW: 1400, TRY: 40, SEK: 10,
  NOK: 10, DKK: 7, PLN: 4, CZK: 23, HUF: 360, RON: 4.6, BGN: 1.8, ISK: 140, ILS: 3.7, AED: 3.7, SAR: 3.8,
  ZAR: 18, BRL: 5, MXN: 18, IDR: 16000, MYR: 4.5, THB: 35, PHP: 57, CAD: 1.4, AUD: 1.5, NZD: 1.7,
};

function nice(n: number): number {
  if (n >= 1000) return Math.round(n / 10) * 10;
  if (n >= 100) return Math.round(n);
  return Math.round(n * 100) / 100;
}

/** A plausible four-month household, clearly named as sample data. */
export function demoBook(base: Currency, today = todayIso()): Book {
  const k = SCALE[base] ?? 1;
  const book = emptyBook(base);
  const cat = (name: string) => book.categories.find(c => c.name === name)!.id;
  const wallet = book.accounts[0];
  const bank = { id: newId(), name: 'Current account', kind: 'bank' as const, currency: base, openingBalance: nice(1800 * k), createdAt: new Date().toISOString() };
  const savings = { id: newId(), name: 'Savings', kind: 'savings' as const, currency: base, openingBalance: nice(2500 * k), createdAt: new Date().toISOString() };
  wallet.openingBalance = nice(60 * k);
  book.accounts.push(bank, savings);

  const entries: Entry[] = [];
  const thisMonth = monthOf(today);
  const add = (monthsAgo: number, day: number, kind: Entry['kind'], amount: number, note: string, extra: Partial<Entry> = {}) => {
    const m = addMonths(thisMonth, -monthsAgo);
    const date = `${m}-${String(Math.min(day, daysInMonth(m))).padStart(2, '0')}`;
    const entry: Entry = { id: newId(), kind, amount: nice(amount * k), date, note, accountId: bank.id, ...extra };
    if (date <= today) entries.push(entry);
    return entry;
  };
  const salaryRoot = add(3, 1, 'income', 3200, 'Salary (sample)', { categoryId: cat('Salary'), recurring: true });
  const rent = add(3, 3, 'expense', 1100, 'Rent (sample)', { categoryId: cat('Rent'), recurring: true });
  for (let ago = 3; ago >= 0; ago--) {
    if (ago < 3) {
      add(ago, 1, 'income', 3200, 'Salary (sample)', { categoryId: cat('Salary'), recurringOf: salaryRoot.id });
      add(ago, 3, 'expense', 1100, 'Rent (sample)', { categoryId: cat('Rent'), recurringOf: rent.id });
    }
    add(ago, 6, 'expense', 92.4 + ago * 7, 'Supermarket', { categoryId: cat('Groceries') });
    add(ago, 13, 'expense', 71.15 + ago * 4, 'Supermarket', { categoryId: cat('Groceries') });
    add(ago, 21, 'expense', 88.6 - ago * 3, 'Market and bakery', { categoryId: cat('Groceries') });
    add(ago, 9, 'expense', 64.3, 'Electricity and internet', { categoryId: cat('Bills') });
    add(ago, 11, 'expense', 49, 'Transit pass', { categoryId: cat('Transport') });
    add(ago, 16, 'expense', 38.5 + ago * 6, 'Dinner with friends', { categoryId: cat('Eating out'), accountId: wallet.id });
    add(ago, 19, 'expense', 12.8, 'Coffee', { categoryId: cat('Eating out'), accountId: wallet.id });
    add(ago, 5, 'transfer', 120, 'Cash withdrawal', { toAccountId: wallet.id });
    add(ago, 25, 'transfer', 400, 'Monthly saving', { toAccountId: savings.id });
  }
  add(2, 18, 'expense', 140, 'Running shoes', { categoryId: cat('Shopping') });
  add(1, 8, 'income', 450, 'Design job for a neighbour', { categoryId: cat('Freelance') });
  add(1, 24, 'expense', 310, 'Train tickets for the holidays', { categoryId: cat('Travel') });
  add(0, 2, 'expense', 22, 'Dentist co-pay', { categoryId: cat('Health') });

  book.entries = entries;
  book.budget = nice(2000 * k);
  book.holdings = [
    {
      id: newId(), name: 'World index fund (sample)', symbol: 'WORLD', kind: 'fund', currency: base, price: nice(108 * k),
      trades: [
        { id: newId(), side: 'buy', quantity: 10, price: nice(96 * k), date: `${addMonths(thisMonth, -3)}-12` },
        { id: newId(), side: 'buy', quantity: 5, price: nice(103 * k), date: `${addMonths(thisMonth, -1)}-12` },
      ],
    },
    {
      id: newId(), name: 'Bitcoin', symbol: 'BTC', kind: 'crypto', currency: 'USD', price: 61000,
      trades: [{ id: newId(), side: 'buy', quantity: 0.01, price: 61000, date: `${addMonths(thisMonth, -2)}-20` }],
    },
  ];
  book.goals = [
    { id: newId(), name: 'Emergency fund', target: nice(6000 * k), saved: nice(2500 * k), note: 'Three months of rent and bills.', createdAt: new Date().toISOString(), deadline: `${addMonths(thisMonth, 10)}-01` },
    { id: newId(), name: 'New laptop', target: nice(1400 * k), saved: nice(350 * k), note: '', createdAt: new Date().toISOString(), deadline: `${addMonths(thisMonth, 4)}-15` },
  ];
  return book;
}
