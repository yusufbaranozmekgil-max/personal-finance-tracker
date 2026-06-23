import { TestBed } from '@angular/core/testing';
import * as XLSX from 'xlsx';
import { ImportService } from './import.service';
import { TransactionService } from './transaction.service';
import { CategoryService } from './category.service';
import { AccountService } from './account.service';
import { Transaction } from '../models/transaction.model';

function createExcelFile(rows: Record<string, any>[]): File {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'İşlemler');
  const content = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new File([content], 'mock-transactions.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

describe('ImportService', () => {
  let service: ImportService;
  let txService: jasmine.SpyObj<TransactionService>;
  let categoryService: jasmine.SpyObj<CategoryService>;
  let accountService: jasmine.SpyObj<AccountService>;

  beforeEach(() => {
    txService = jasmine.createSpyObj<TransactionService>('TransactionService', ['transactions', 'add']);
    categoryService = jasmine.createSpyObj<CategoryService>('CategoryService', [
      'categories',
      'addIncomeCategory',
      'addExpenseCategory',
    ]);
    accountService = jasmine.createSpyObj<AccountService>('AccountService', [
      'accounts',
      'add',
      'defaultAccountId',
    ]);

    txService.transactions.and.returnValue([]);
    categoryService.categories.and.returnValue({
      income: [{ id: 'income-1', name: 'Maaş', icon: '', color: '', type: 'income' }],
      expense: [{ id: 'expense-1', name: 'Gıda', icon: '', color: '', type: 'expense' }],
      assetTypes: [],
    });
    accountService.accounts.and.returnValue([
      {
        id: 'account-1',
        name: 'Maaş Hesabı',
        type: 'bank',
        initialBalance: 0,
        currency: 'TRY',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    accountService.defaultAccountId.and.returnValue('account-1');
    accountService.add.and.callFake((account: any) => ({
      ...account,
      id: 'new-account',
      createdAt: '2026-01-01T00:00:00.000Z',
    }));

    TestBed.configureTestingModule({
      providers: [
        ImportService,
        { provide: TransactionService, useValue: txService },
        { provide: CategoryService, useValue: categoryService },
        { provide: AccountService, useValue: accountService },
      ],
    });

    service = TestBed.inject(ImportService);
  });

  it('Türkçe kolon adlarını büyük-küçük harf karışık olsa da eşleştirir', async () => {
    const file = createExcelFile([
      {
        'İŞLEM TARİHİ': '01.06.2026',
        'TÜR': 'Gider',
        'Kategori Adı': 'Gıda',
        'TUTAR': 450,
        'Açıklama': 'Market alışverişi',
        'Ödeme Yöntemi': 'Kredi Kartı',
        'Hesap Adı': 'Maaş Hesabı',
        'Aylık Tekrar': 'Hayır',
      },
    ]);

    const preview = await service.parseFile(file);

    expect(preview.total).toBe(1);
    expect(preview.valid).toBe(1);
    expect(preview.invalid).toBe(0);
    expect(preview.rows[0]).toEqual(jasmine.objectContaining({
      ok: true,
      date: '2026-06-01',
      type: 'expense',
      category: 'Gıda',
      amount: 450,
      description: 'Market alışverişi',
      paymentMethod: 'Kredi Kartı',
      account: 'Maaş Hesabı',
      isRecurring: false,
    }));
  });

  it('İngilizce kolon adlarını ve recurring yes değerini eşleştirir', async () => {
    const file = createExcelFile([
      {
        'Transaction Date': '2026-06-05',
        'Type': 'income',
        'Category': 'Freelance',
        'Amount': 1200,
        'Description': 'Landing page',
        'Payment Method': 'EFT',
        'Account': 'Yeni Banka',
        'Recurring': 'YES',
      },
    ]);

    const preview = await service.parseFile(file);

    expect(preview.valid).toBe(1);
    expect(preview.newCategories.income).toEqual(['Freelance']);
    expect(preview.newAccounts).toEqual(['Yeni Banka']);
    expect(preview.rows[0]).toEqual(jasmine.objectContaining({
      ok: true,
      type: 'income',
      isRecurring: true,
    }));
  });

  it('banka ekstresi formatında borç ve alacak kolonlarından tür ve tutarı çıkarır', async () => {
    const file = createExcelFile([
      {
        'Tarih': '2026-06-10',
        'Açıklama': 'Kafe',
        'Borç': 250,
        'Alacak': '',
      },
      {
        'Tarih': '2026-06-11',
        'Açıklama': 'Maaş',
        'Borç': '',
        'Alacak': 25000,
      },
    ]);

    const preview = await service.parseFile(file);

    expect(preview.valid).toBe(2);
    expect(preview.rows[0]).toEqual(jasmine.objectContaining({
      type: 'expense',
      amount: 250,
      category: 'Diğer',
    }));
    expect(preview.rows[1]).toEqual(jasmine.objectContaining({
      type: 'income',
      amount: 25000,
      category: 'Diğer',
    }));
  });

  it('geçersiz satırları hata mesajıyla işaretler ve içe aktarmaya dahil etmez', async () => {
    const file = createExcelFile([
      {
        'Date': 'not-a-date',
        'Type': 'expense',
        'Amount': 100,
      },
      {
        'Date': '2026-06-01',
        'Type': 'expense',
        'Amount': 0,
      },
    ]);

    const preview = await service.parseFile(file);

    expect(preview.total).toBe(2);
    expect(preview.valid).toBe(0);
    expect(preview.invalid).toBe(2);
    expect(preview.rows[0].error).toBe('Geçersiz tarih');
    expect(preview.rows[1].error).toBe('Tutar geçersiz veya sıfır');
  });

  it('mevcut işlemle aynı tarih, tutar ve açıklamaya sahip satırı duplicate sayar', async () => {
    const existing: Transaction = {
      id: 'tx-1',
      type: 'expense',
      category: 'Gıda',
      amount: 450,
      date: '2026-06-01',
      description: 'Market',
      paymentMethod: 'Kredi Kartı',
    };
    txService.transactions.and.returnValue([existing]);

    const file = createExcelFile([
      {
        'Date': '2026-06-01',
        'Type': 'expense',
        'Category': 'Gıda',
        'Amount': 450,
        'Description': ' market ',
      },
    ]);

    const preview = await service.parseFile(file);

    expect(preview.valid).toBe(0);
    expect(preview.duplicates).toBe(1);
    expect(preview.rows[0].duplicate).toBeTrue();
  });

  it('commit sırasında yeni kategori ve hesabı oluşturup geçerli satırları kaydeder', async () => {
    const file = createExcelFile([
      {
        'Date': '2026-06-05',
        'Type': 'income',
        'Category': 'Freelance',
        'Amount': 1200,
        'Description': 'Landing page',
        'Account': 'Yeni Banka',
      },
    ]);
    const preview = await service.parseFile(file);

    const added = await service.commit(preview, true);

    expect(added).toBe(1);
    expect(categoryService.addIncomeCategory).toHaveBeenCalledWith('Freelance');
    expect(accountService.add).toHaveBeenCalledWith({
      name: 'Yeni Banka',
      type: 'bank',
      initialBalance: 0,
      currency: 'TRY',
    });
    expect(txService.add).toHaveBeenCalledWith(jasmine.objectContaining({
      type: 'income',
      category: 'Freelance',
      amount: 1200,
      date: '2026-06-05',
      accountId: 'new-account',
    }));
  });
});
