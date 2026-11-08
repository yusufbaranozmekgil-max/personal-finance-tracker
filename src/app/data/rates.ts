import { Injectable, effect, inject, signal } from '@angular/core';
import { Book, Rates } from '../domain/model';
import { BookStore } from './book-store';

const MAX_AGE_MS = 12 * 3600_000;

/** Currencies the book uses besides its base. */
export function foreignCurrencies(book: Book): string[] {
  const all = new Set([...book.accounts.map(a => a.currency), ...book.holdings.map(h => h.currency)]);
  all.delete(book.baseCurrency);
  return [...all];
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

const SOURCES: { name: string; load: () => Promise<Record<string, number>> }[] = [
  {
    name: 'open.er-api.com',
    load: async () => {
      const r = await fetchJson('https://open.er-api.com/v6/latest/USD');
      if (r.result !== 'success') throw new Error('bad response');
      return r.rates;
    },
  },
  {
    name: 'frankfurter.app (ECB)',
    load: async () => ({ USD: 1, ...(await fetchJson('https://api.frankfurter.app/latest?from=USD')).rates }),
  },
];

/** Keeps exchange rates fresh when the book holds more than one currency. */
@Injectable({ providedIn: 'root' })
export class RateService {
  private store = inject(BookStore);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  private lastAttempt = 0;

  constructor() {
    effect(() => {
      const book = this.store.book();
      if (!book || !foreignCurrencies(book).length) return;
      const age = book.rates ? Date.now() - Date.parse(book.rates.fetchedAt) : Infinity;
      const missing = foreignCurrencies(book).concat(book.baseCurrency).some(c => !book.rates?.perUsd[c]);
      // One automatic attempt per 10 minutes, so a currency no feed carries cannot cause a retry loop.
      if ((age > MAX_AGE_MS || missing) && navigator.onLine && Date.now() - this.lastAttempt > 600_000) void this.refresh();
    });
  }

  async refresh(): Promise<boolean> {
    this.lastAttempt = Date.now();
    this.busy.set(true);
    this.error.set(null);
    try {
      for (const source of SOURCES) {
        try {
          const perUsd = await source.load();
          const rates: Rates = { perUsd: { ...perUsd, USD: 1 }, fetchedAt: new Date().toISOString(), source: source.name };
          this.store.update(b => ({ ...b, rates }));
          return true;
        } catch { /* try the next source */ }
      }
      this.error.set(navigator.onLine ? 'Rate services did not answer.' : 'You are offline.');
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
