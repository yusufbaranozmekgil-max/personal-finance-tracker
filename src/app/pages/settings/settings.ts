import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BookStore } from '../../data/book-store';
import { DriveBackup } from '../../data/drive';
import { download, exportCsv, exportXlsx, readSpreadsheet, stamp } from '../../data/files';
import { readBackup, serializeBook } from '../../domain/book-io';
import { Book, Category, StockProvider, newId } from '../../domain/model';
import { COMMON_CURRENCIES, currencyName, formatDate, parseAmount } from '../../domain/money';
import { StatementPreview, applyStatement, previewStatement } from '../../domain/statement';
import { Theme, ThemeChoice } from '../../ui/theme';
import { Notices } from '../../ui/notice';
import { MoneyPipe } from '../../ui/money.pipe';
import { Icon } from '../../ui/icon';

const LAST_BACKUP = 'rbf-last-backup';

@Component({
  selector: 'app-settings',
  imports: [MoneyPipe, Icon, RouterLink],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPage {
  protected readonly store = inject(BookStore);
  protected readonly drive = inject(DriveBackup);
  protected readonly theme = inject(Theme);
  private notices = inject(Notices);
  protected readonly book = computed(() => this.store.book()!);
  protected readonly base = computed(() => this.book().baseCurrency);
  protected readonly currencies = COMMON_CURRENCIES.map(code => ({ code, name: currencyName(code) }));

  // ---------- currency and budget ----------
  protected readonly budgetText = signal(String(this.store.book()?.budget || ''));
  protected readonly budgetError = signal<string | null>(null);

  protected setBase(code: string): void {
    this.store.update(b => ({ ...b, baseCurrency: code }));
    this.notices.say(`Totals now show in ${code}. Budget and goal figures kept their numbers.`);
  }

  protected saveBudget(event: Event): void {
    event.preventDefault();
    const raw = this.budgetText().trim();
    const v = raw ? parseAmount(raw) : 0;
    if (v === null || v < 0) { this.budgetError.set('Enter an amount, or leave it empty for no limit.'); return; }
    this.budgetError.set(null);
    this.store.update(b => ({ ...b, budget: v }));
    this.notices.say(v ? 'Monthly limit saved.' : 'Monthly limit removed.');
  }

  // ---------- categories ----------
  protected readonly income = computed(() => this.book().categories.filter(c => c.kind === 'income'));
  protected readonly expense = computed(() => this.book().categories.filter(c => c.kind === 'expense'));
  protected readonly usage = computed(() => {
    const m = new Map<string, number>();
    for (const e of this.book().entries) if (e.categoryId) m.set(e.categoryId, (m.get(e.categoryId) ?? 0) + 1);
    return m;
  });
  protected readonly renaming = signal<string | null>(null);

  protected addCategory(event: Event, kind: 'income' | 'expense', input: HTMLInputElement): void {
    event.preventDefault();
    const name = input.value.trim().slice(0, 40);
    if (!name) return;
    if (this.book().categories.some(c => c.kind === kind && c.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      this.notices.say(`“${name}” is already there.`, 'error');
      return;
    }
    this.store.update(b => ({ ...b, categories: [...b.categories, { id: newId(), name, kind }] }));
    input.value = '';
  }

  protected rename(c: Category, value: string): void {
    const name = value.trim().slice(0, 40);
    this.renaming.set(null);
    if (!name || name === c.name) return;
    this.store.update(b => ({ ...b, categories: b.categories.map(x => (x.id === c.id ? { ...x, name } : x)) }));
  }

  protected removeCategory(c: Category): void {
    const used = this.usage().get(c.id) ?? 0;
    this.store.update(b => ({
      ...b,
      categories: b.categories.filter(x => x.id !== c.id),
      entries: used ? b.entries.map(e => (e.categoryId === c.id ? (({ categoryId: _x, ...rest }) => rest)(e) : e)) : b.entries,
    }));
    this.notices.say(used ? `${c.name} removed; its ${used} entries are now uncategorised.` : `${c.name} removed.`);
  }

  // ---------- backup file ----------
  protected readonly lastBackup = signal(this.readLastBackup());
  protected readonly pendingRestore = signal<{ book: Book; note?: string; from: string } | null>(null);

  private readLastBackup(): string | null {
    try { return localStorage.getItem(LAST_BACKUP); } catch { return null; }
  }

  protected backupNow(): void {
    download(`ring-binder-backup-${stamp()}.json`, serializeBook(this.book()), 'application/json');
    const now = new Date().toISOString().slice(0, 10);
    try { localStorage.setItem(LAST_BACKUP, now); } catch { /* not critical */ }
    this.lastBackup.set(now);
  }

  protected lastBackupLabel(): string {
    const d = this.lastBackup();
    return d ? `Last downloaded on this device: ${formatDate(d)}.` : 'No backup downloaded from this device yet.';
  }

  protected async pickBackup(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { this.notices.say('That file is too large to be a backup.', 'error'); return; }
    const r = readBackup(await file.text());
    if (!r.ok) { this.notices.say(r.error, 'error'); return; }
    this.pendingRestore.set({ book: r.book, note: r.note, from: file.name });
  }

  protected confirmRestore(): void {
    const p = this.pendingRestore();
    if (!p) return;
    this.store.replace(p.book);
    this.pendingRestore.set(null);
    this.notices.say(`Restored ${p.book.entries.length} entries.${p.note ? ' ' + p.note : ''}`);
  }

  // ---------- Google Drive ----------
  protected readonly drivePw = signal('');
  protected readonly driveError = signal<string | null>(null);

  protected async driveBackup(): Promise<void> {
    if (this.drivePw().length < 8) { this.driveError.set('Use a backup password of at least 8 characters.'); return; }
    this.driveError.set(null);
    try {
      await this.drive.backup(this.drivePw());
      this.notices.say('Encrypted backup saved to your Google Drive.');
    } catch (e) {
      this.driveError.set((e as Error).message);
    }
  }

  protected async driveRestore(): Promise<void> {
    if (!this.drivePw()) { this.driveError.set('Enter the backup password you used.'); return; }
    this.driveError.set(null);
    try {
      const book = await this.drive.fetchBackup(this.drivePw());
      this.pendingRestore.set({ book, from: 'Google Drive' });
    } catch (e) {
      this.driveError.set((e as Error).message);
    }
  }

  // ---------- statement import ----------
  protected readonly importAccount = signal('');
  protected readonly dayFirst = signal(true);
  protected readonly preview = signal<StatementPreview | null>(null);
  protected readonly importRows = signal<Record<string, unknown>[] | null>(null);
  protected readonly importName = signal('');
  protected readonly importing = signal(false);

  protected readonly targetAccount = computed(() => this.importAccount() || this.book().accounts[0]?.id);

  protected async pickStatement(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.importing.set(true);
    try {
      const rows = await readSpreadsheet(file);
      if (!rows.length) { this.notices.say('That file has no rows.', 'error'); return; }
      this.importRows.set(rows);
      this.importName.set(file.name);
      this.reviewStatement();
    } catch (e) {
      this.notices.say(`Could not read that file: ${(e as Error).message}`, 'error');
    } finally {
      this.importing.set(false);
    }
  }

  protected reviewStatement(): void {
    const rows = this.importRows();
    if (rows) this.preview.set(previewStatement(this.book(), this.targetAccount()!, rows, this.dayFirst()));
  }

  protected columnsFound(p: StatementPreview): string {
    const found = Object.entries(p.columns).map(([k, v]) => `${k} ← “${v}”`);
    return found.length ? found.join(', ') : 'none';
  }

  protected applyImport(): void {
    const p = this.preview();
    if (!p) return;
    let added = 0;
    this.store.update(b => {
      const r = applyStatement(b, this.targetAccount()!, p);
      added = r.added;
      return r.book;
    });
    this.cancelImport();
    this.notices.say(`${added} entries added.`);
  }

  protected cancelImport(): void {
    this.preview.set(null);
    this.importRows.set(null);
  }

  protected accountName(id: string | undefined): string {
    return this.book().accounts.find(a => a.id === id)?.name ?? '';
  }

  protected accountCurrency(): string {
    return this.book().accounts.find(a => a.id === this.targetAccount())?.currency ?? this.base();
  }

  // ---------- export ----------
  protected csv(): void { exportCsv(this.book()); }
  protected async xlsx(): Promise<void> { await exportXlsx(this.book()); }

  // ---------- password ----------
  protected readonly pw1 = signal('');
  protected readonly pw2 = signal('');
  protected readonly pwError = signal<string | null>(null);
  protected readonly pwBusy = signal(false);
  protected readonly confirmRemovePw = signal(false);

  protected async setPassword(event: Event): Promise<void> {
    event.preventDefault();
    if (this.pw1().length < 8) { this.pwError.set('Use at least 8 characters. A short sentence works well.'); return; }
    if (this.pw1() !== this.pw2()) { this.pwError.set('The two passwords are not the same.'); return; }
    this.pwError.set(null);
    this.pwBusy.set(true);
    const had = this.store.hasPassword();
    await this.store.setPassword(this.pw1());
    this.pwBusy.set(false);
    this.pw1.set('');
    this.pw2.set('');
    this.notices.say(had ? 'Password changed.' : 'The book is now encrypted. It locks after 5 idle minutes.');
  }

  protected async removePassword(): Promise<void> {
    await this.store.removePassword();
    this.confirmRemovePw.set(false);
    this.notices.say('Password removed. The book is stored unencrypted on this device.');
  }

  // ---------- stock prices ----------
  protected readonly providers: { value: StockProvider; label: string; url: string }[] = [
    { value: 'twelvedata', label: 'Twelve Data', url: 'https://twelvedata.com' },
    { value: 'finnhub', label: 'Finnhub', url: 'https://finnhub.io' },
    { value: 'alphavantage', label: 'Alpha Vantage', url: 'https://www.alphavantage.co' },
  ];
  protected readonly provider = signal<StockProvider>(this.store.book()?.stockApi?.provider ?? 'twelvedata');
  protected readonly apiKey = signal(this.store.book()?.stockApi?.key ?? '');

  protected saveKey(event: Event): void {
    event.preventDefault();
    const key = this.apiKey().trim().slice(0, 200);
    this.store.update(b => {
      const { stockApi: _s, ...rest } = b;
      return key ? { ...rest, stockApi: { provider: this.provider(), key } } : rest;
    });
    this.notices.say(key ? 'Price key saved.' : 'Price key removed.');
  }

  // ---------- erase ----------
  protected readonly eraseText = signal('');

  protected async erase(): Promise<void> {
    if (this.eraseText().trim().toUpperCase() !== 'ERASE') return;
    await this.store.eraseAll();
  }

  protected setTheme(v: string): void {
    this.theme.set(v as ThemeChoice);
  }
}
