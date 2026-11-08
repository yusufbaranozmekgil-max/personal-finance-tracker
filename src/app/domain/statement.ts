import { Book, Entry, newId } from './model';
import { isValidIsoDate, parseAmount, round2, toIsoDate } from './money';

/** Header names banks use, normalised (lower case, no accents). */
const COLUMNS: Record<string, string[]> = {
  date: ['date', 'transaction date', 'booking date', 'value date', 'posted date', 'tarih', 'islem tarihi', 'datum', 'buchungstag', 'date operation', 'fecha', 'data'],
  type: ['type', 'transaction type', 'tur', 'tip', 'islem turu'],
  category: ['category', 'kategori', 'kategorie', 'categorie', 'categoria'],
  amount: ['amount', 'value', 'tutar', 'miktar', 'betrag', 'montant', 'importe', 'importo', 'bedrag'],
  debit: ['debit', 'withdrawal', 'withdrawals', 'money out', 'paid out', 'borc', 'cikis', 'soll', 'debit amount'],
  credit: ['credit', 'deposit', 'deposits', 'money in', 'paid in', 'alacak', 'giris', 'haben', 'credit amount'],
  note: ['description', 'details', 'memo', 'narrative', 'payee', 'reference', 'aciklama', 'islem aciklamasi', 'verwendungszweck', 'buchungstext', 'libelle', 'concepto', 'descrizione', 'omschrijving', 'note'],
};

export function normaliseHeader(s: string): string {
  return s.toLocaleLowerCase('en').replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function detectColumns(headers: string[]): Partial<Record<keyof typeof COLUMNS, string>> {
  const out: Partial<Record<keyof typeof COLUMNS, string>> = {};
  for (const [field, names] of Object.entries(COLUMNS)) {
    const hit = headers.find(h => names.includes(normaliseHeader(h)));
    if (hit !== undefined) out[field] = hit;
  }
  return out;
}

/** Accepts ISO dates, D.M.YYYY / D/M/YYYY (day first), and spreadsheet serial numbers. */
export function parseStatementDate(v: unknown, dayFirst = true): string | null {
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400_000));
    return toIsoDate(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  if (v instanceof Date && !isNaN(v.getTime())) return toIsoDate(v);
  const s = String(v ?? '').trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const out = `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
    return isValidIsoDate(out) ? out : null;
  }
  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmy) {
    const [a, b] = dayFirst ? [dmy[1], dmy[2]] : [dmy[2], dmy[1]];
    const out = `${dmy[3]}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
    return isValidIsoDate(out) ? out : null;
  }
  return null;
}

function amountOf(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? round2(v) : null;
  const s = String(v ?? '').replace(/[^\d.,+\-\s']/g, '').trim();
  return s ? parseAmount(s) : null;
}

export interface StatementRow {
  line: number;
  entry?: Omit<Entry, 'id' | 'accountId'>;
  categoryName?: string;
  duplicate?: boolean;
  error?: string;
}

export interface StatementPreview {
  rows: StatementRow[];
  columns: Partial<Record<keyof typeof COLUMNS, string>>;
  ready: number;
  duplicates: number;
  errors: number;
}

const key = (date: string, amount: number, note: string) => `${date}|${amount.toFixed(2)}|${note.trim().toLocaleLowerCase()}`;

/** Turns spreadsheet rows (header -> cell) into entries for one account, flagging duplicates already in it. */
export function previewStatement(book: Book, accountId: string, raw: Record<string, unknown>[], dayFirst = true): StatementPreview {
  const columns = detectColumns(raw.length ? Object.keys(raw[0]) : []);
  const existing = new Set(book.entries.filter(e => e.accountId === accountId && e.kind !== 'transfer').map(e => key(e.date, e.amount, e.note)));
  const seen = new Set<string>();
  const rows: StatementRow[] = raw.map((r, i) => {
    const line = i + 2;
    const cell = (f: keyof typeof COLUMNS) => (columns[f] !== undefined ? r[columns[f]!] : undefined);
    const date = parseStatementDate(cell('date'), dayFirst);
    if (!date) return { line, error: 'No readable date' };
    let amount = amountOf(cell('amount'));
    let kind: 'income' | 'expense' | null = null;
    const type = normaliseHeader(String(cell('type') ?? ''));
    if (['income', 'credit', 'gelir', 'in'].includes(type)) kind = 'income';
    if (['expense', 'debit', 'gider', 'out'].includes(type)) kind = 'expense';
    if (amount === null || amount === 0) {
      const debit = amountOf(cell('debit'));
      const credit = amountOf(cell('credit'));
      if (debit) { amount = Math.abs(debit); kind ??= 'expense'; }
      else if (credit) { amount = Math.abs(credit); kind ??= 'income'; }
    } else {
      kind ??= amount < 0 ? 'expense' : 'income';
      amount = Math.abs(amount);
    }
    if (!amount) return { line, error: 'No amount' };
    const note = String(cell('note') ?? '').trim().slice(0, 200);
    const k = key(date, amount, note);
    const duplicate = existing.has(k) || seen.has(k);
    seen.add(k);
    const categoryName = String(cell('category') ?? '').trim().slice(0, 60) || undefined;
    return { line, entry: { kind: kind!, amount, date, note }, categoryName, duplicate };
  });
  return {
    rows,
    columns,
    ready: rows.filter(r => r.entry && !r.duplicate).length,
    duplicates: rows.filter(r => r.duplicate).length,
    errors: rows.filter(r => r.error).length,
  };
}

/** Adds the preview's new rows to the book, creating categories named in the file. */
export function applyStatement(book: Book, accountId: string, preview: StatementPreview): { book: Book; added: number } {
  const categories = [...book.categories];
  const findOrAdd = (name: string | undefined, kind: 'income' | 'expense'): string | undefined => {
    if (!name) return undefined;
    let c = categories.find(x => x.kind === kind && x.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (!c) { c = { id: newId(), name, kind }; categories.push(c); }
    return c.id;
  };
  const added: Entry[] = [];
  for (const r of preview.rows) {
    if (!r.entry || r.duplicate) continue;
    added.push({ ...r.entry, id: newId(), accountId, categoryId: findOrAdd(r.categoryName, r.entry.kind as 'income' | 'expense') });
  }
  return { book: { ...book, categories, entries: [...book.entries, ...added] }, added: added.length };
}
