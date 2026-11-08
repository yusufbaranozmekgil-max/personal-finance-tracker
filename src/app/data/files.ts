import { Book } from '../domain/model';
import { accountBalance } from '../domain/ledger';
import { fifo, unrealized } from '../domain/fifo';
import { toIsoDate } from '../domain/money';

export function download(name: string, content: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const stamp = () => toIsoDate(new Date());

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Reads the first sheet of a CSV or Excel file into header->cell rows. SheetJS loads only when needed. */
export async function readSpreadsheet(file: File): Promise<Record<string, unknown>[]> {
  if (file.size > MAX_FILE_BYTES) throw new Error('The file is larger than 10 MB.');
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false, dense: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('The file has no sheet.');
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true }).slice(0, 20_000);
}

function entryRows(book: Book) {
  const acc = new Map(book.accounts.map(a => [a.id, a]));
  const cat = new Map(book.categories.map(c => [c.id, c.name]));
  return [...book.entries]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(e => ({
      Date: e.date,
      Type: e.kind,
      Amount: e.kind === 'expense' ? -e.amount : e.amount,
      Currency: acc.get(e.accountId)?.currency ?? '',
      Account: acc.get(e.accountId)?.name ?? '',
      'To account': e.toAccountId ? acc.get(e.toAccountId)?.name ?? '' : '',
      Category: e.categoryId ? cat.get(e.categoryId) ?? '' : '',
      Note: e.note,
      Monthly: e.recurring || e.recurringOf ? 'yes' : '',
    }));
}

const csvCell = (v: unknown) => {
  let s = String(v ?? '');
  // Keep spreadsheet apps from running a note as a formula.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportCsv(book: Book): void {
  const rows = entryRows(book);
  const header = Object.keys(rows[0] ?? { Date: '', Type: '', Amount: '', Currency: '', Account: '', 'To account': '', Category: '', Note: '', Monthly: '' });
  const body = rows.map(r => header.map(h => csvCell((r as Record<string, unknown>)[h])).join(','));
  download(`entries-${stamp()}.csv`, '﻿' + [header.join(','), ...body].join('\r\n'), 'text/csv;charset=utf-8');
}

export async function exportXlsx(book: Book): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(entryRows(book)), 'Entries');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(book.accounts.map(a => ({
    Account: a.name, Kind: a.kind, Currency: a.currency, Opening: a.openingBalance, Balance: accountBalance(book, a),
  }))), 'Accounts');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(book.holdings.map(h => {
    const s = fifo(h.trades);
    return { Name: h.name, Symbol: h.symbol, Currency: h.currency, Quantity: s.quantity, 'Average cost': s.averageCost, Price: h.price, Value: s.quantity * h.price, Unrealized: unrealized(h), Realized: s.realized };
  })), 'Investments');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(book.goals.map(g => ({
    Goal: g.name, Target: g.target, Saved: g.saved, Deadline: g.deadline ?? '', Note: g.note,
  }))), 'Goals');
  XLSX.writeFile(wb, `finance-${stamp()}.xlsx`, { compression: true });
}
