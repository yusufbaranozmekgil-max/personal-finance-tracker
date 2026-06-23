import { Injectable, inject } from '@angular/core';
import * as XLSX from 'xlsx';
import { TransactionService } from './transaction.service';
import { CategoryService } from './category.service';
import { AccountService } from './account.service';
import { Transaction } from '../models/transaction.model';

export interface PreviewRow {
  row: number;            // Row number in Excel (1-based)
  ok: boolean;
  date?: string;
  type?: 'income' | 'expense';
  category?: string;
  amount?: number;
  description?: string;
  paymentMethod?: string;
  account?: string;
  isRecurring?: boolean;
  duplicate?: boolean;
  error?: string;
}

export interface ImportPreview {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  rows: PreviewRow[];
  newCategories: { income: string[]; expense: string[] };
  newAccounts: string[];
}

// Flexible column mapping — bank statements may use different column names
const COLUMN_MAP: Record<string, string[]> = {
  date:        ['date', 'transaction date', 'tarih', 'islem tarihi', 'vade tarihi'],
  type:        ['type', 'tur', 'tür', 'tip', 'islem turu', 'işlem türü'],
  category:    ['category', 'kategori', 'kategori adi', 'kategori adı'],
  amount:      ['amount', 'tutar', 'miktar', 'tutar (try)', 'tutar (usd)', 'tutar (eur)'],
  debit:       ['debit', 'borc', 'borç', 'cikis', 'çıkış'],
  credit:      ['credit', 'alacak', 'giris', 'giriş'],
  description: ['description', 'aciklama', 'açıklama', 'islem aciklamasi', 'işlem açıklaması'],
  paymentMethod: ['payment method', 'odeme yontemi', 'ödeme yöntemi', 'odeme tipi', 'ödeme tipi'],
  account:     ['account', 'hesap', 'hesap adi', 'hesap adı'],
  isRecurring: ['recurring', 'monthly recurring', 'aylik tekrar', 'aylık tekrar', 'tekrarlanan'],
};

@Injectable({ providedIn: 'root' })
export class ImportService {
  private txService = inject(TransactionService);
  private categoryService = inject(CategoryService);
  private accountService = inject(AccountService);

  // Generate template Excel and trigger download
  downloadTemplate(): void {
    const template = [
      {
        'Date': '2026-06-01',
        'Type': 'expense',
        'Category': 'Food',
        'Amount': 450,
        'Description': 'Grocery shopping',
        'Payment Method': 'Credit Card',
        'Account': 'Salary Account',
        'Monthly Recurring': 'No',
      },
      {
        'Date': '2026-06-01',
        'Type': 'income',
        'Category': 'Salary',
        'Amount': 25000,
        'Description': 'Monthly salary',
        'Payment Method': 'Bank Transfer',
        'Account': 'Salary Account',
        'Monthly Recurring': 'Yes',
      },
      {
        'Date': '2026-06-05',
        'Type': 'expense',
        'Category': 'Transportation',
        'Amount': 900,
        'Description': 'Monthly transit pass',
        'Payment Method': 'Cash',
        'Account': 'Cash Wallet',
        'Monthly Recurring': 'No',
      },
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(template);

    // Help / description sheet
    const help = [
      { 'Field': 'Date', 'Format': 'YYYY-MM-DD or DD.MM.YYYY' },
      { 'Field': 'Type', 'Format': 'income / expense' },
      { 'Field': 'Category', 'Format': 'Food, Transportation, Salary etc. (created automatically if missing)' },
      { 'Field': 'Amount', 'Format': 'Positive number' },
      { 'Field': 'Description', 'Format': 'Optional, maximum 50 characters' },
      { 'Field': 'Payment Method', 'Format': 'Cash, Credit Card, Bank Transfer etc.' },
      { 'Field': 'Account', 'Format': 'Account name (created automatically if missing)' },
      { 'Field': 'Monthly Recurring', 'Format': 'Yes / No' },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(help), 'Description');
    XLSX.writeFile(wb, `transaction-template-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  // Read the file and return a preview
  async parseFile(file: File): Promise<ImportPreview> {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });

    const colKeys = raw.length > 0 ? Object.keys(raw[0]) : [];
    const map = this.detectColumns(colKeys);

    const existingTxs = this.txService.transactions();
    const existingHash = new Set(
      existingTxs.map(t => `${t.date}_${t.amount}_${(t.description ?? '').trim().toLowerCase()}`)
    );
    const expenseCats = new Set(this.categoryService.categories().expense.map(c => c.name.toLowerCase()));
    const incomeCats = new Set(this.categoryService.categories().income.map(c => c.name.toLowerCase()));
    const accountNames = new Set(this.accountService.accounts().map(a => a.name.toLowerCase()));

    const newIncomeCats = new Set<string>();
    const newExpenseCats = new Set<string>();
    const newAccounts = new Set<string>();

    const rows: PreviewRow[] = raw.map((r, i) => {
      const row: PreviewRow = { row: i + 2, ok: false };

      try {
        const dateVal = this.getField(r, map['date']);
        const date = this.parseDate(dateVal);
        if (!date) { row.error = 'Invalid date'; return row; }

        let type: 'income' | 'expense' | null = null;
        const typeVal = this.getField(r, map['type'])?.toString().toLowerCase().trim();
        if (typeVal === 'gelir' || typeVal === 'income') type = 'income';
        else if (typeVal === 'gider' || typeVal === 'expense') type = 'expense';

        // In bank statements: 'debit' = expense, 'credit' = income
        const debit = Number(this.getField(r, map['debit']) || 0);
        const credit = Number(this.getField(r, map['credit']) || 0);

        let amount = Number(this.getField(r, map['amount']) || 0);
        if (!amount && debit) { amount = Math.abs(debit); type = type ?? 'expense'; }
        if (!amount && credit) { amount = Math.abs(credit); type = type ?? 'income'; }

        if (!amount || amount <= 0) { row.error = 'Amount invalid or zero'; return row; }
        if (!type) { row.error = 'Type not specified (income/expense)'; return row; }

        const category = (this.getField(r, map['category']) ?? '').toString().trim() || 'Other';
        const description = (this.getField(r, map['description']) ?? '').toString().trim();
        const paymentMethod = (this.getField(r, map['paymentMethod']) ?? '').toString().trim() || 'Bank Transfer';
        const accountName = (this.getField(r, map['account']) ?? '').toString().trim();
        const recurringVal = (this.getField(r, map['isRecurring']) ?? '').toString().toLowerCase().trim();
        const isRecurring = recurringVal === 'evet' || recurringVal === 'yes' || recurringVal === 'true' || recurringVal === '1';

        // Detect new categories / accounts
        if (type === 'income' && !incomeCats.has(category.toLowerCase())) newIncomeCats.add(category);
        if (type === 'expense' && !expenseCats.has(category.toLowerCase())) newExpenseCats.add(category);
        if (accountName && !accountNames.has(accountName.toLowerCase())) newAccounts.add(accountName);

        // Duplicate check
        const hash = `${date}_${amount}_${description.toLowerCase()}`;
        const duplicate = existingHash.has(hash);

        Object.assign(row, {
          ok: true,
          date,
          type,
          category,
          amount,
          description,
          paymentMethod,
          account: accountName,
          isRecurring,
          duplicate,
        });
      } catch (err: any) {
        row.error = err?.message ?? 'Unknown error';
      }
      return row;
    });

    return {
      total: rows.length,
      valid: rows.filter(r => r.ok && !r.duplicate).length,
      invalid: rows.filter(r => !r.ok).length,
      duplicates: rows.filter(r => r.duplicate).length,
      rows,
      newCategories: { income: [...newIncomeCats], expense: [...newExpenseCats] },
      newAccounts: [...newAccounts],
    };
  }

  // Confirm preview and save in bulk
  async commit(preview: ImportPreview, skipDuplicates: boolean): Promise<number> {
    // Add missing categories
    for (const c of preview.newCategories.income) this.categoryService.addIncomeCategory(c);
    for (const c of preview.newCategories.expense) this.categoryService.addExpenseCategory(c);

    // Add missing accounts (defaults to bank type)
    const accountIdByName = new Map<string, string>();
    for (const a of this.accountService.accounts()) {
      accountIdByName.set(a.name.toLowerCase(), a.id);
    }
    for (const name of preview.newAccounts) {
      if (!accountIdByName.has(name.toLowerCase())) {
        const acc = this.accountService.add({ name, type: 'bank', initialBalance: 0, currency: 'TRY' });
        accountIdByName.set(name.toLowerCase(), acc.id);
      }
    }

    let added = 0;
    for (const r of preview.rows) {
      if (!r.ok) continue;
      if (skipDuplicates && r.duplicate) continue;

      const accountId = r.account
        ? accountIdByName.get(r.account.toLowerCase()) ?? this.accountService.defaultAccountId()
        : this.accountService.defaultAccountId();

      this.txService.add({
        type: r.type!,
        category: r.category!,
        amount: r.amount!,
        date: r.date!,
        description: r.description ?? '',
        paymentMethod: r.paymentMethod ?? '',
        accountId,
        isRecurring: r.isRecurring ?? false,
      });
      added++;
    }
    return added;
  }

  // ====== helpers ======
  private detectColumns(keys: string[]): Record<string, string | undefined> {
    const map: Record<string, string | undefined> = {};
    for (const [field, aliases] of Object.entries(COLUMN_MAP)) {
      const found = keys.find(k =>
        aliases.includes(this.normalize(k))
      );
      map[field] = found;
    }
    return map;
  }

  private getField(row: Record<string, any>, key: string | undefined): any {
    if (!key) return '';
    return row[key];
  }

  private normalize(s: string): string {
    return s
      .toLocaleLowerCase('tr-TR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ı/g, 'i')
      .replace(/ş/g, 's')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private parseDate(value: any): string | null {
    if (!value) return null;
    // Excel serial number?
    if (typeof value === 'number') {
      // XLSX number to date — simple conversion
      const d = new Date(Math.round((value - 25569) * 86400 * 1000));
      return d.toISOString().slice(0, 10);
    }
    const s = value.toString().trim();
    // 2026-06-01
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    // 01.06.2026 or 1/6/2026
    const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
    if (m) {
      const [, d, mo, y] = m;
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    // Date constructor as last resort
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return null;
  }
}
