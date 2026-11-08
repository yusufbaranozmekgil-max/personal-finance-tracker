import { Book, Entry, HOLDING_KINDS, ACCOUNT_KINDS } from './model';
import { isValidIsoDate } from './money';
import { fromLegacy, isLegacyBackup } from './legacy';

export const BACKUP_APP = 'ring-binder-finance';

export function serializeBook(book: Book): string {
  return JSON.stringify({ app: BACKUP_APP, exportedAt: new Date().toISOString(), book }, null, 1);
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const CURRENCY = /^[A-Z]{3}$/;
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const text = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
const id = (v: unknown) => text(v, 100) && (v as string).length > 0;

/** Checks an untrusted object is a well-formed Book; returns the reason when it is not. */
export function checkBook(v: unknown): string | null {
  if (!isObj(v) || v['version'] !== 2) return 'Not a backup from this app.';
  if (!CURRENCY.test(String(v['baseCurrency']))) return 'Base currency is missing.';
  const lists = ['accounts', 'entries', 'categories', 'holdings', 'goals'] as const;
  for (const k of lists) if (!Array.isArray(v[k])) return `The backup has no ${k} list.`;
  const accounts = v['accounts'] as unknown[];
  const accountIds = new Set<string>();
  for (const a of accounts) {
    if (!isObj(a) || !id(a['id']) || !text(a['name'], 200) || !CURRENCY.test(String(a['currency'])) || !finite(a['openingBalance'])
      || !ACCOUNT_KINDS.some(k => k.value === a['kind'])) return 'An account record is damaged.';
    accountIds.add(a['id'] as string);
  }
  if (!accountIds.size) return 'The backup has no accounts.';
  for (const e of v['entries'] as unknown[]) {
    if (!isObj(e) || !id(e['id']) || !['income', 'expense', 'transfer'].includes(e['kind'] as string)
      || !finite(e['amount']) || (e['amount'] as number) <= 0 || !isValidIsoDate(String(e['date']))
      || !text(e['note'] ?? '', 500) || !accountIds.has(e['accountId'] as string)) return 'An entry is damaged.';
    if (e['kind'] === 'transfer' && !accountIds.has(e['toAccountId'] as string)) return 'A transfer points to a missing account.';
  }
  for (const c of v['categories'] as unknown[]) {
    if (!isObj(c) || !id(c['id']) || !text(c['name'], 200) || !['income', 'expense'].includes(c['kind'] as string)) return 'A category is damaged.';
  }
  for (const h of v['holdings'] as unknown[]) {
    if (!isObj(h) || !id(h['id']) || !text(h['name'], 200) || !CURRENCY.test(String(h['currency'])) || !finite(h['price'])
      || !HOLDING_KINDS.some(k => k.value === h['kind']) || !Array.isArray(h['trades'])) return 'A holding is damaged.';
    for (const t of h['trades'] as unknown[]) {
      if (!isObj(t) || !id(t['id']) || !['buy', 'sell'].includes(t['side'] as string) || !finite(t['quantity'])
        || !finite(t['price']) || !isValidIsoDate(String(t['date']))) return 'A trade is damaged.';
    }
  }
  for (const g of v['goals'] as unknown[]) {
    if (!isObj(g) || !id(g['id']) || !text(g['name'], 200) || !finite(g['target']) || !finite(g['saved'])) return 'A goal is damaged.';
  }
  if (!finite(v['budget'])) return 'Budget is damaged.';
  return null;
}

export type ReadResult = { ok: true; book: Book; note?: string } | { ok: false; error: string };

/** Reads a backup file's text: this app's format, or a backup from the first version. */
export function readBackup(textContent: string): ReadResult {
  let parsed: unknown;
  try { parsed = JSON.parse(textContent); } catch { return { ok: false, error: 'This file is not valid JSON.' }; }
  if (isObj(parsed) && parsed['app'] === BACKUP_APP) {
    const problem = checkBook(parsed['book']);
    if (problem) return { ok: false, error: problem };
    const book = parsed['book'] as Book;
    return { ok: true, book: { ...book, entries: book.entries.map(stripUnknown) } };
  }
  if (isLegacyBackup(parsed)) {
    const { book, skipped } = fromLegacy(parsed);
    return { ok: true, book, note: skipped ? `${skipped} damaged record(s) were skipped.` : undefined };
  }
  return { ok: false, error: 'Not a backup from this app.' };
}

function stripUnknown(e: Entry): Entry {
  const { id, kind, amount, date, note, categoryId, accountId, toAccountId, toAmount, recurring, recurringOf } = e;
  return Object.fromEntries(
    Object.entries({ id, kind, amount, date, note: note ?? '', categoryId, accountId, toAccountId, toAmount, recurring, recurringOf })
      .filter(([, v]) => v !== undefined),
  ) as unknown as Entry;
}
