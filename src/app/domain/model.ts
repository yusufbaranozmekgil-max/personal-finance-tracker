/** ISO 4217 code, e.g. "EUR". */
export type Currency = string;
/** YYYY-MM-DD in the user's local calendar. */
export type IsoDate = string;
/** YYYY-MM */
export type MonthKey = string;

export type AccountKind = 'cash' | 'bank' | 'card' | 'savings' | 'investment' | 'other';

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  currency: Currency;
  openingBalance: number;
  createdAt: string;
}

export type EntryKind = 'income' | 'expense' | 'transfer';

export interface Entry {
  id: string;
  kind: EntryKind;
  /** Always positive, in the currency of `accountId`. */
  amount: number;
  date: IsoDate;
  note: string;
  /** Income and expense only. */
  categoryId?: string;
  accountId: string;
  /** Transfers only. */
  toAccountId?: string;
  /** Transfers between currencies: amount received, in the target account's currency. */
  toAmount?: number;
  /** A root entry that repeats every month on the same day. */
  recurring?: boolean;
  /** Set on copies made from a recurring root. */
  recurringOf?: string;
}

export interface Category {
  id: string;
  name: string;
  kind: 'income' | 'expense';
}

export type HoldingKind = 'crypto' | 'metal' | 'stock' | 'fund' | 'currency' | 'other';

export interface Trade {
  id: string;
  side: 'buy' | 'sell';
  quantity: number;
  /** Unit price in the holding's currency. */
  price: number;
  date: IsoDate;
}

export interface Holding {
  id: string;
  name: string;
  symbol: string;
  kind: HoldingKind;
  currency: Currency;
  /** Latest known unit price in the holding's currency. */
  price: number;
  priceAt?: string;
  trades: Trade[];
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  saved: number;
  deadline?: IsoDate;
  note: string;
  createdAt: string;
}

export interface Rates {
  /** Units of each currency per 1 USD. */
  perUsd: Record<Currency, number>;
  fetchedAt: string;
  source: string;
}

export type StockProvider = 'twelvedata' | 'finnhub' | 'alphavantage';

export interface Book {
  version: 2;
  baseCurrency: Currency;
  accounts: Account[];
  entries: Entry[];
  categories: Category[];
  holdings: Holding[];
  goals: Goal[];
  /** Monthly spending limit in base currency; 0 = none. */
  budget: number;
  rates: Rates | null;
  /** Last month whose recurring entries were written. */
  recurringThrough?: MonthKey;
  stockApi?: { provider: StockProvider; key: string };
  drive?: { fileId?: string; lastSync?: string };
}

export const ACCOUNT_KINDS: { value: AccountKind; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank account' },
  { value: 'card', label: 'Credit card' },
  { value: 'savings', label: 'Savings' },
  { value: 'investment', label: 'Investment account' },
  { value: 'other', label: 'Other' },
];

export const HOLDING_KINDS: { value: HoldingKind; label: string }[] = [
  { value: 'crypto', label: 'Crypto' },
  { value: 'metal', label: 'Precious metal' },
  { value: 'stock', label: 'Stock' },
  { value: 'fund', label: 'Fund' },
  { value: 'currency', label: 'Foreign currency' },
  { value: 'other', label: 'Other' },
];

const DEFAULT_INCOME = ['Salary', 'Freelance', 'Bonus', 'Gifts', 'Other income'];
const DEFAULT_EXPENSE = [
  'Groceries', 'Eating out', 'Rent', 'Bills', 'Transport', 'Health',
  'Shopping', 'Education', 'Entertainment', 'Travel', 'Savings', 'Other',
];

export function newId(): string {
  return crypto.randomUUID();
}

export function defaultCategories(): Category[] {
  return [
    ...DEFAULT_INCOME.map(name => ({ id: newId(), name, kind: 'income' as const })),
    ...DEFAULT_EXPENSE.map(name => ({ id: newId(), name, kind: 'expense' as const })),
  ];
}

export function emptyBook(baseCurrency: Currency): Book {
  return {
    version: 2,
    baseCurrency,
    accounts: [{
      id: newId(), name: 'Wallet', kind: 'cash', currency: baseCurrency,
      openingBalance: 0, createdAt: new Date().toISOString(),
    }],
    entries: [],
    categories: defaultCategories(),
    holdings: [],
    goals: [],
    budget: 0,
    rates: null,
  };
}
