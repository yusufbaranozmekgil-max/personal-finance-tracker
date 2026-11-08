import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BookStore } from '../../data/book-store';
import { Book, Entry, newId } from '../../domain/model';
import { addMonths, daysInMonth, formatDate, isValidIsoDate, monthLabel, monthOf, parseAmount, todayIso } from '../../domain/money';
import { cashTotal, categoryBreakdown, lastMonths, monthSummary } from '../../domain/ledger';
import { forecastBudget } from '../../domain/forecast';
import { parseQuickEntry } from '../../domain/quick-entry';
import { MoneyPipe } from '../../ui/money.pipe';
import { Icon } from '../../ui/icon';
import { Notices } from '../../ui/notice';
import { MonthBars } from './month-bars';

interface Row {
  entry: Entry;
  voided: boolean;
  day: string;
  title: string;
  detail: string;
  currency: string;
  sign: 1 | -1 | 0;
}

interface Draft {
  id: string | null;
  kind: 'income' | 'expense' | 'transfer';
  amount: string;
  note: string;
  categoryId: string;
  accountId: string;
  date: string;
  recurring: boolean;
}

@Component({
  selector: 'app-month',
  imports: [MoneyPipe, Icon, MonthBars, DecimalPipe, RouterLink],
  templateUrl: './month.html',
  styleUrl: './month.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonthPage {
  protected readonly store = inject(BookStore);
  private notices = inject(Notices);
  protected readonly book = computed(() => this.store.book()!);
  protected readonly base = computed(() => this.book().baseCurrency);
  protected readonly today = todayIso();
  protected readonly month = signal(monthOf(this.today));
  protected readonly isThisMonth = computed(() => this.month() === monthOf(this.today));
  protected readonly title = computed(() => monthLabel(this.month()));
  protected readonly query = signal('');

  /** Quick entry line. */
  protected readonly line = signal('');
  protected readonly lineKind = signal<'expense' | 'income'>('expense');
  protected readonly lineCategory = signal('');
  protected readonly lineAccount = signal('');
  protected readonly lineDate = signal(this.today);
  protected readonly lineRecurring = signal(false);
  protected readonly lineError = signal<string | null>(null);
  private categoryTouched = false;

  /** Inline editor for one row. */
  protected readonly draft = signal<Draft | null>(null);
  protected readonly draftError = signal<string | null>(null);

  protected readonly accounts = computed(() => this.book().accounts);
  protected readonly categoriesFor = (kind: 'income' | 'expense') => this.book().categories.filter(c => c.kind === kind);
  protected readonly lineCategories = computed(() => this.categoriesFor(this.lineKind()));
  protected readonly defaultAccount = computed(() => this.lineAccount() || this.accounts()[0]?.id || '');

  protected readonly summary = computed(() => monthSummary(this.book(), this.month()));
  protected readonly carried = computed(() => {
    const m = this.month();
    return cashTotal(this.book(), `${m}-${String(daysInMonth(m)).padStart(2, '0')}`);
  });
  protected readonly budget = computed(() => (this.isThisMonth() ? forecastBudget(this.book(), this.today) : null));
  protected readonly breakdown = computed(() => categoryBreakdown(this.book(), this.month(), 'expense'));
  protected readonly history = computed(() => lastMonths(this.book(), this.month(), 6));

  protected readonly rows = computed<Row[]>(() => {
    const book = this.book();
    const q = this.query().trim().toLocaleLowerCase();
    const month = this.month();
    const live = book.entries.map(entry => ({ entry, voided: false }));
    const voided = this.store.voided().map(entry => ({ entry, voided: true }));
    return [...live, ...voided]
      .filter(({ entry }) => (q ? this.matches(book, entry, q) : monthOf(entry.date) === month))
      .sort((a, b) => b.entry.date.localeCompare(a.entry.date) || a.entry.id.localeCompare(b.entry.id))
      .map(r => this.toRow(book, r.entry, r.voided, !!q));
  });

  private matches(book: Book, e: Entry, q: string): boolean {
    const cat = book.categories.find(c => c.id === e.categoryId)?.name ?? '';
    return e.note.toLocaleLowerCase().includes(q) || cat.toLocaleLowerCase().includes(q) || String(e.amount).includes(q);
  }

  private toRow(book: Book, entry: Entry, voided: boolean, withYear: boolean): Row {
    const acc = book.accounts.find(a => a.id === entry.accountId);
    const cat = book.categories.find(c => c.id === entry.categoryId);
    const day = withYear ? formatDate(entry.date, { day: 'numeric', month: 'short', year: '2-digit' }) : entry.date.slice(8, 10);
    if (entry.kind === 'transfer') {
      const to = book.accounts.find(a => a.id === entry.toAccountId);
      return { entry, voided, day, title: entry.note || 'Transfer', detail: `${acc?.name ?? '?'} → ${to?.name ?? '?'}`, currency: acc?.currency ?? book.baseCurrency, sign: 0 };
    }
    return {
      entry, voided, day,
      title: entry.note || cat?.name || (entry.kind === 'income' ? 'Income' : 'Expense'),
      detail: [entry.note ? cat?.name : null, book.accounts.length > 1 ? acc?.name : null].filter(Boolean).join(' · '),
      currency: acc?.currency ?? book.baseCurrency,
      sign: entry.kind === 'income' ? 1 : -1,
    };
  }

  protected shiftMonth(delta: number): void {
    this.month.update(m => addMonths(m, delta));
    this.draft.set(null);
    const m = this.month();
    this.lineDate.set(m === monthOf(this.today) ? this.today : `${m}-01`);
  }

  protected goToday(): void {
    this.month.set(monthOf(this.today));
    this.lineDate.set(this.today);
  }

  // ---------- quick entry ----------

  protected onLine(value: string): void {
    this.line.set(value);
    this.lineError.set(null);
    const q = parseQuickEntry(value, this.book().categories);
    if (!q) return;
    if (value.trim().startsWith('+') || /\s\+/.test(value)) this.lineKind.set('income');
    if (!this.categoryTouched && q.categoryId) {
      const cat = this.book().categories.find(c => c.id === q.categoryId);
      if (cat) { this.lineKind.set(cat.kind); this.lineCategory.set(cat.id); }
    }
  }

  protected setKind(kind: 'income' | 'expense'): void {
    this.lineKind.set(kind);
    if (!this.lineCategories().some(c => c.id === this.lineCategory())) this.lineCategory.set('');
  }

  protected pickCategory(id: string): void {
    this.categoryTouched = true;
    this.lineCategory.set(id);
  }

  protected add(event: Event): void {
    event.preventDefault();
    const q = parseQuickEntry(this.line(), this.book().categories);
    if (!q) {
      this.lineError.set('Start with an amount, like "12.50 lunch".');
      return;
    }
    if (!isValidIsoDate(this.lineDate())) {
      this.lineError.set('Pick a date between 1900 and 2100.');
      return;
    }
    const kind = this.lineKind();
    const categoryId = this.lineCategory() || (q.kind === kind ? q.categoryId : undefined);
    const entry: Entry = {
      id: newId(), kind, amount: q.amount, date: this.lineDate(), note: q.note.slice(0, 200),
      accountId: this.defaultAccount(),
      ...(categoryId ? { categoryId } : {}),
      ...(this.lineRecurring() ? { recurring: true } : {}),
    };
    this.store.update(b => ({ ...b, entries: [...b.entries, entry] }));
    if (monthOf(entry.date) !== this.month()) this.month.set(monthOf(entry.date));
    this.line.set('');
    this.lineCategory.set('');
    this.lineRecurring.set(false);
    this.lineKind.set('expense');
    this.categoryTouched = false;
  }

  // ---------- editing ----------

  protected edit(row: Row): void {
    if (row.voided) return;
    const e = row.entry;
    this.draftError.set(null);
    this.draft.set({
      id: e.id, kind: e.kind, amount: String(e.amount), note: e.note,
      categoryId: e.categoryId ?? '', accountId: e.accountId, date: e.date, recurring: !!e.recurring,
    });
  }

  protected patch(change: Partial<Draft>): void {
    this.draft.update(d => (d ? { ...d, ...change } : d));
  }

  protected save(event: Event): void {
    event.preventDefault();
    const d = this.draft();
    if (!d?.id || d.kind === 'transfer') return;
    const kind = d.kind;
    const amount = parseAmount(d.amount);
    if (amount === null || amount <= 0) { this.draftError.set('Enter an amount above zero.'); return; }
    if (!isValidIsoDate(d.date)) { this.draftError.set('Pick a date between 1900 and 2100.'); return; }
    this.store.update(b => ({
      ...b,
      entries: b.entries.map(e => {
        if (e.id !== d.id) return e;
        const { categoryId: _c, recurring: _r, ...rest } = e;
        return {
          ...rest, kind, amount, note: d.note.trim().slice(0, 200), accountId: d.accountId, date: d.date,
          ...(d.categoryId ? { categoryId: d.categoryId } : {}),
          ...(d.recurring && !e.recurringOf ? { recurring: true } : {}),
        };
      }),
    }));
    this.draft.set(null);
  }

  protected remove(entry: Entry): void {
    this.store.update(b => ({ ...b, entries: b.entries.filter(e => e.id !== entry.id) }));
    this.store.voided.update(v => [...v, entry]);
    this.draft.set(null);
  }

  protected restore(entry: Entry): void {
    this.store.voided.update(v => v.filter(e => e.id !== entry.id));
    if (!this.book().accounts.some(a => a.id === entry.accountId)) {
      this.notices.say('Its account no longer exists, so the entry cannot come back.', 'error');
      return;
    }
    this.store.update(b => ({ ...b, entries: [...b.entries, entry] }));
  }

  protected isRepeating(e: Entry): boolean {
    return !!(e.recurring || e.recurringOf);
  }

  protected barWidth(share: number): string {
    return `${Math.max(1.5, share * 100)}%`;
  }
}
