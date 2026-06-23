import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { StorageService } from './storage.service';

interface CachedRates {
  usd: number;
  eur: number;
  date: string;
  fetchedAt: string;   // ISO timestamp
  source: string;      // which API fetched it
}

const CACHE_KEY = 'finans_currency_cache';

@Injectable({ providedIn: 'root' })
export class CurrencyRateService {
  private http = inject(HttpClient);
  private storage = inject(StorageService);

  loading = signal(false);
  lastUpdate = signal<string | null>(this.loadCache()?.fetchedAt ?? null);
  lastError = signal<string | null>(null);
  cached = signal<CachedRates | null>(this.loadCache());

  async fetchRates(): Promise<{ usd: number; eur: number; date: string; cached?: boolean }> {
    this.loading.set(true);
    this.lastError.set(null);

    const apis: { name: string; fn: () => Promise<{ usd: number; eur: number; date: string }> }[] = [
      { name: 'frankfurter.app', fn: () => this.tryFrankfurter() },
      { name: 'open.er-api.com', fn: () => this.tryOpenER() },
      { name: 'exchangerate.host', fn: () => this.tryExchangeRateHost() },
    ];

    let lastErr: any;
    for (const api of apis) {
      try {
        const result = await api.fn();
        const cache: CachedRates = {
          ...result,
          fetchedAt: new Date().toISOString(),
          source: api.name,
        };
        this.saveCache(cache);
        this.loading.set(false);
        return result;
      } catch (err: any) {
        lastErr = err;
      }
    }

    this.loading.set(false);
    const msg = this.formatError(lastErr);
    this.lastError.set(msg);
    throw new Error(msg);
  }

  // Last successful rate from cache — for UI fallback and showing "last updated"
  getCached(): CachedRates | null {
    return this.cached();
  }

  // Human-readable relative time: "3 minutes ago", "2 hours ago"
  formatRelativeTime(iso: string | null): string {
    if (!iso) return 'not yet';
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
    const months = Math.floor(days / 30);
    return `${months} month${months > 1 ? 's' : ''} ago`;
  }

  private async tryFrankfurter() {
    const r: any = await firstValueFrom(
      this.http.get('https://api.frankfurter.app/latest?from=USD&to=TRY,EUR')
    );
    const usdToTRY = r.rates.TRY;
    const usdToEUR = r.rates.EUR;
    return {
      usd: Math.round(usdToTRY * 100) / 100,
      eur: Math.round((usdToTRY / usdToEUR) * 100) / 100,
      date: r.date,
    };
  }

  private async tryOpenER() {
    const r: any = await firstValueFrom(
      this.http.get('https://open.er-api.com/v6/latest/USD')
    );
    if (r.result !== 'success') throw new Error('open.er-api.com failed');
    const usdToTRY = r.rates.TRY;
    const usdToEUR = r.rates.EUR;
    return {
      usd: Math.round(usdToTRY * 100) / 100,
      eur: Math.round((usdToTRY / usdToEUR) * 100) / 100,
      date: r.time_last_update_utc?.slice(0, 16) ?? new Date().toISOString().slice(0, 10),
    };
  }

  private async tryExchangeRateHost() {
    const r: any = await firstValueFrom(
      this.http.get('https://api.exchangerate.host/latest?base=USD&symbols=TRY,EUR')
    );
    const usdToTRY = r.rates.TRY;
    const usdToEUR = r.rates.EUR;
    return {
      usd: Math.round(usdToTRY * 100) / 100,
      eur: Math.round((usdToTRY / usdToEUR) * 100) / 100,
      date: r.date,
    };
  }

  private formatError(err: any): string {
    if (err?.status === 0) return 'Could not reach APIs. Please check your internet connection.';
    if (err?.status >= 500) return 'Server error. Please try again later.';
    if (err?.status === 429) return 'Too many requests. Please try again in a few minutes.';
    return err?.message ?? 'Unknown error.';
  }

  private saveCache(c: CachedRates): void {
    this.storage.setItemSync(CACHE_KEY, JSON.stringify(c));
    this.cached.set(c);
    this.lastUpdate.set(c.fetchedAt);
  }

  private loadCache(): CachedRates | null {
    try {
      const raw = this.storage.getItemSync(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}
