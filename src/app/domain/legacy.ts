import { Account, AccountKind, Book, Category, Entry, Goal, Holding, HoldingKind, Trade, defaultCategories, newId } from './model';
import { isValidIsoDate, todayIso } from './money';

/** Data as the first version of the app stored or exported it. Everything is optional and untrusted. */
export interface LegacyData {
  transactions?: unknown;
  assets?: unknown;
  goals?: unknown;
  categories?: unknown;
  accounts?: unknown;
  settings?: unknown;
}

/** Storage keys the first version used, mapped to LegacyData fields. */
export const LEGACY_KEYS: Record<string, keyof LegacyData> = {
  finans_transactions: 'transactions',
  finans_assets: 'assets',
  finans_goals: 'goals',
  finans_categories: 'categories',
  finans_accounts: 'accounts',
  finans_settings: 'settings',
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const date = (v: unknown): string | null => {
  const s = str(v).slice(0, 10);
  return isValidIsoDate(s) ? s : null;
};
const CURRENCY = /^[A-Z]{3}$/;

const ACCOUNT_KIND: Record<string, AccountKind> = {
  cash: 'cash', bank: 'bank', credit: 'card', savings: 'savings', investment: 'investment',
};
const HOLDING_KIND: Record<string, HoldingKind> = {
  crypto: 'crypto', gold: 'metal', stock: 'stock', fund: 'fund', 'foreign currency': 'currency',
};

export function isLegacyBackup(v: unknown): v is LegacyData {
  return isObj(v) && v['version'] !== 2 && Array.isArray(v['transactions']);
}

/**
 * Converts first-version data into a Book. Never throws on bad records:
 * anything unusable is skipped and counted in `skipped`.
 */
export function fromLegacy(data: LegacyData): { book: Book; skipped: number } {
  let skipped = 0;
  const settings = isObj(data.settings) ? data.settings : {};
  const base = CURRENCY.test(str(settings['currency'])) ? str(settings['currency']) : 'TRY';

  // Categories: the old app referenced them by name.
  const categories: Category[] = [];
  const catByKey = new Map<string, string>();
  const addCategory = (name: string, kind: 'income' | 'expense'): string => {
    const key = `${kind}|${name.toLocaleLowerCase()}`;
    let id = catByKey.get(key);
    if (!id) {
      id = newId();
      categories.push({ id, name, kind });
      catByKey.set(key, id);
    }
    return id;
  };
  const oldCats = isObj(data.categories) ? data.categories : {};
  for (const kind of ['income', 'expense'] as const) {
    for (const c of (Array.isArray(oldCats[kind]) ? oldCats[kind] as unknown[] : [])) {
      const name = typeof c === 'string' ? c : isObj(c) ? str(c['name']) : '';
      if (name.trim()) addCategory(name.trim(), kind);
    }
  }
  if (!categories.length) for (const c of defaultCategories()) addCategory(c.name, c.kind);

  const accounts: Account[] = arr(data.accounts).map(a => ({
    id: str(a['id']) || newId(),
    name: str(a['name'], 'Account').slice(0, 60),
    kind: ACCOUNT_KIND[str(a['type'])] ?? 'other',
    currency: CURRENCY.test(str(a['currency'])) ? str(a['currency']) : base,
    openingBalance: num(a['initialBalance']),
    createdAt: str(a['createdAt']) || new Date().toISOString(),
  }));
  const accountIds = new Set(accounts.map(a => a.id));
  const fallbackAccount = (): string => {
    if (!accounts.length) {
      accounts.push({ id: newId(), name: 'Wallet', kind: 'cash', currency: base, openingBalance: 0, createdAt: new Date().toISOString() });
      accountIds.add(accounts[0].id);
    }
    return accounts[0].id;
  };

  const entries: Entry[] = [];
  for (const t of arr(data.transactions)) {
    const kind = str(t['type']);
    const amount = Math.abs(num(t['amount']));
    const when = date(t['date']);
    if (!['income', 'expense', 'transfer'].includes(kind) || amount <= 0 || !when) { skipped++; continue; }
    const accountId = accountIds.has(str(t['accountId'])) ? str(t['accountId']) : fallbackAccount();
    const description = str(t['description']).trim();
    const method = str(t['paymentMethod']).trim();
    const entry: Entry = {
      id: str(t['id']) || newId(),
      kind: kind as Entry['kind'],
      amount,
      date: when,
      note: description || (kind === 'transfer' ? '' : method),
      accountId,
    };
    if (kind === 'transfer') {
      const to = str(t['transferAccountId']);
      if (!accountIds.has(to) || to === accountId) { skipped++; continue; }
      entry.toAccountId = to;
    } else {
      entry.categoryId = addCategory(str(t['category']).trim() || 'Other', kind as 'income' | 'expense');
    }
    if (t['recurringParentId']) entry.recurringOf = str(t['recurringParentId']);
    else if (t['isRecurring'] === true) entry.recurring = true;
    entries.push(entry);
  }

  const holdings: Holding[] = [];
  for (const a of arr(data.assets)) {
    const id = str(a['id']) || newId();
    let trades: Trade[] = arr(a['trades'])
      .map(t => ({
        id: str(t['id']) || newId(),
        side: (str(t['type']) === 'sell' ? 'sell' : 'buy') as Trade['side'],
        quantity: Math.abs(num(t['quantity'])),
        price: Math.abs(num(t['price'])),
        date: date(t['date']) ?? todayIso(),
      }))
      .filter(t => t.quantity > 0);
    if (!trades.length && num(a['quantity']) > 0) {
      trades = [{ id: newId(), side: 'buy', quantity: num(a['quantity']), price: num(a['purchasePrice']) || num(a['unitPrice']), date: todayIso() }];
    }
    holdings.push({
      id,
      name: str(a['name'], 'Holding').slice(0, 60),
      symbol: str(a['symbol']).toUpperCase().slice(0, 20),
      kind: HOLDING_KIND[str(a['type']).toLowerCase()] ?? 'other',
      currency: CURRENCY.test(str(a['currency'])) ? str(a['currency']) : base,
      price: num(a['unitPrice']),
      trades,
    });
  }

  const goals: Goal[] = arr(data.goals).map(g => ({
    id: str(g['id']) || newId(),
    name: str(g['name'], 'Goal').slice(0, 60),
    target: Math.abs(num(g['targetAmount'])),
    saved: Math.abs(num(g['currentAmount'])),
    deadline: isValidIsoDate(str(g['deadline'])) ? str(g['deadline']) : undefined,
    note: str(g['description']).slice(0, 200),
    createdAt: str(g['createdAt']) || new Date().toISOString(),
  }));

  // The old app kept two manual rates: TRY per USD and TRY per EUR.
  const usdRate = num(settings['usdRate']);
  const eurRate = num(settings['eurRate']);
  const rates = usdRate > 0 && eurRate > 0
    ? { perUsd: { USD: 1, TRY: usdRate, EUR: usdRate / eurRate }, fetchedAt: new Date(0).toISOString(), source: 'carried over from the previous version' }
    : null;
  const provider = str(settings['stockApiProvider']);
  const key = str(settings['stockApiKey']).trim();

  if (!accounts.length) fallbackAccount();
  const book: Book = {
    version: 2,
    baseCurrency: base,
    accounts,
    entries,
    categories,
    holdings,
    goals,
    budget: Math.abs(num(settings['monthlyLimit'])),
    rates,
    ...(key && (provider === 'twelvedata' || provider === 'finnhub' || provider === 'alphavantage')
      ? { stockApi: { provider, key } } : {}),
    ...(str(settings['gdriveFileId']) ? { drive: { fileId: str(settings['gdriveFileId']) } } : {}),
  };
  return { book, skipped };
}
