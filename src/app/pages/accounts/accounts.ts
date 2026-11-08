import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { BookStore } from '../../data/book-store';
import { RateService, foreignCurrencies } from '../../data/rates';
import { ACCOUNT_KINDS, Account, AccountKind, Entry, newId } from '../../domain/model';
import { COMMON_CURRENCIES, convert, formatDate, isValidIsoDate, monthLabel, monthOf, parseAmount, todayIso } from '../../domain/money';
import { accountBalance, cashSeries, cashTotal, holdingsTotal, netWorth } from '../../domain/ledger';
import { MoneyPipe } from '../../ui/money.pipe';
import { Icon } from '../../ui/icon';
import { Notices } from '../../ui/notice';

interface AccountDraft { id: string | null; name: string; kind: AccountKind; currency: string; opening: string; }

@Component({
  selector: 'app-accounts',
  imports: [MoneyPipe, Icon, NgTemplateOutlet],
  templateUrl: './accounts.html',
  styleUrl: './accounts.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountsPage {
  private store = inject(BookStore);
  private notices = inject(Notices);
  protected readonly rates = inject(RateService);
  protected readonly kinds = ACCOUNT_KINDS;
  protected readonly currencies = COMMON_CURRENCIES;
  protected readonly book = computed(() => this.store.book()!);
  protected readonly base = computed(() => this.book().baseCurrency);
  protected readonly today = todayIso();

  protected readonly worth = computed(() => netWorth(this.book()));
  protected readonly cash = computed(() => cashTotal(this.book()));
  protected readonly invested = computed(() => holdingsTotal(this.book()));
  protected readonly multiCurrency = computed(() => foreignCurrencies(this.book()).length > 0);
  protected readonly ratesAge = computed(() => {
    const r = this.book().rates;
    return r ? `${r.source}, ${formatDate(r.fetchedAt.slice(0, 10))}` : null;
  });

  protected readonly rows = computed(() => {
    const book = this.book();
    return book.accounts.map(a => {
      const balance = accountBalance(book, a);
      return {
        account: a,
        balance,
        inBase: a.currency === book.baseCurrency ? null : convert(balance, a.currency, book.baseCurrency, book.rates),
        entries: book.entries.filter(e => e.accountId === a.id || e.toAccountId === a.id).length,
        kind: ACCOUNT_KINDS.find(k => k.value === a.kind)?.label ?? 'Other',
      };
    });
  });

  protected readonly series = computed(() => {
    const s = cashSeries(this.book(), monthOf(this.today), 12);
    const max = Math.max(1, ...s.map(p => Math.abs(p.total)));
    return s.map(p => ({ ...p, h: (Math.max(0, p.total) / max) * 100, label: monthLabel(p.month, 'short').split(' ')[0], long: monthLabel(p.month) }));
  });

  // ---------- account editor ----------
  protected readonly draft = signal<AccountDraft | null>(null);
  protected readonly draftError = signal<string | null>(null);
  protected readonly confirmDelete = signal<string | null>(null);

  protected newAccount(): void {
    this.draftError.set(null);
    this.draft.set({ id: null, name: '', kind: 'bank', currency: this.base(), opening: '0' });
  }

  protected editAccount(a: Account): void {
    this.draftError.set(null);
    this.confirmDelete.set(null);
    this.draft.set({ id: a.id, name: a.name, kind: a.kind, currency: a.currency, opening: String(a.openingBalance) });
  }

  protected patch(change: Partial<AccountDraft>): void {
    this.draft.update(d => (d ? { ...d, ...change } : d));
  }

  protected hasEntries(id: string | null): boolean {
    return !!id && this.book().entries.some(e => e.accountId === id || e.toAccountId === id);
  }

  protected saveAccount(event: Event): void {
    event.preventDefault();
    const d = this.draft();
    if (!d) return;
    const name = d.name.trim().slice(0, 60);
    const opening = parseAmount(d.opening || '0');
    if (!name) { this.draftError.set('Give the account a name.'); return; }
    if (opening === null) { this.draftError.set('The starting balance is not a number.'); return; }
    if (this.book().accounts.some(a => a.id !== d.id && a.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      this.draftError.set('Another account already has that name.');
      return;
    }
    if (d.id) {
      this.store.update(b => ({ ...b, accounts: b.accounts.map(a => (a.id === d.id ? { ...a, name, kind: d.kind, currency: d.currency, openingBalance: opening } : a)) }));
    } else {
      const account: Account = { id: newId(), name, kind: d.kind, currency: d.currency, openingBalance: opening, createdAt: new Date().toISOString() };
      this.store.update(b => ({ ...b, accounts: [...b.accounts, account] }));
    }
    this.draft.set(null);
  }

  protected deleteAccount(id: string): void {
    if (this.book().accounts.length <= 1) {
      this.notices.say('A book needs at least one account.', 'error');
      return;
    }
    const removed = this.book().entries.filter(e => e.accountId === id || e.toAccountId === id).length;
    this.store.update(b => ({
      ...b,
      accounts: b.accounts.filter(a => a.id !== id),
      entries: b.entries.filter(e => e.accountId !== id && e.toAccountId !== id),
    }));
    this.draft.set(null);
    this.confirmDelete.set(null);
    this.notices.say(removed ? `Account deleted with ${removed} entries.` : 'Account deleted.');
  }

  // ---------- transfer ----------
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly amount = signal('');
  protected readonly received = signal('');
  protected readonly when = signal(this.today);
  protected readonly note = signal('');
  protected readonly moveError = signal<string | null>(null);

  protected readonly fromAccount = computed(() => this.book().accounts.find(a => a.id === (this.from() || this.book().accounts[0]?.id)));
  protected readonly toAccount = computed(() => this.book().accounts.find(a => a.id === (this.to() || this.book().accounts.find(x => x.id !== this.fromAccount()?.id)?.id)));
  protected readonly crossCurrency = computed(() => !!this.fromAccount() && !!this.toAccount() && this.fromAccount()!.currency !== this.toAccount()!.currency);
  protected readonly suggestedReceived = computed(() => {
    const amt = parseAmount(this.amount());
    const f = this.fromAccount();
    const t = this.toAccount();
    if (!amt || !f || !t) return null;
    const c = convert(amt, f.currency, t.currency, this.book().rates);
    return c === null ? null : Math.round(c * 100) / 100;
  });

  protected move(event: Event): void {
    event.preventDefault();
    const f = this.fromAccount();
    const t = this.toAccount();
    const amount = parseAmount(this.amount());
    if (!f || !t || f.id === t.id) { this.moveError.set('Pick two different accounts.'); return; }
    if (!amount || amount <= 0) { this.moveError.set('Enter an amount above zero.'); return; }
    if (!isValidIsoDate(this.when())) { this.moveError.set('Pick a date between 1900 and 2100.'); return; }
    let toAmount: number | undefined;
    if (this.crossCurrency()) {
      const typed = this.received().trim() ? parseAmount(this.received()) : this.suggestedReceived();
      if (!typed || typed <= 0) { this.moveError.set(`Enter how much arrived in ${t.currency}.`); return; }
      toAmount = typed;
    }
    const entry: Entry = {
      id: newId(), kind: 'transfer', amount, date: this.when(), note: this.note().trim().slice(0, 200),
      accountId: f.id, toAccountId: t.id, ...(toAmount !== undefined ? { toAmount } : {}),
    };
    this.store.update(b => ({ ...b, entries: [...b.entries, entry] }));
    this.amount.set('');
    this.received.set('');
    this.note.set('');
    this.moveError.set(null);
    this.notices.say(`Moved to ${t.name}.`);
  }

  protected async refreshRates(): Promise<void> {
    const ok = await this.rates.refresh();
    if (!ok) this.notices.say(this.rates.error() ?? 'Rates could not be loaded.', 'error');
  }
}
