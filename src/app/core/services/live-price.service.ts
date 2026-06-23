import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SettingsService } from './settings.service';
import { StockApiProvider } from '../models/asset.model';

// Crypto: Binance spot ticker symbols (USDT pairs)
const BINANCE_SYMBOLS: Record<string, string> = {
  BTC: 'BTCUSDT',
  ETH: 'ETHUSDT',
  BNB: 'BNBUSDT',
  SOL: 'SOLUSDT',
  XRP: 'XRPUSDT',
  ADA: 'ADAUSDT',
  DOGE: 'DOGEUSDT',
  AVAX: 'AVAXUSDT',
  DOT: 'DOTUSDT',
  LINK: 'LINKUSDT',
  LTC: 'LTCUSDT',
  TRX: 'TRXUSDT',
  TON: 'TONUSDT',
};

// Gram gold: PAX Gold (PAXG) ≈ 1 troy ounce (~31.1035 g) gold
const TROY_OUNCE_IN_GRAMS = 31.1034768;
const GOLD_SYMBOLS = ['GA', 'XAU', 'ALTIN', 'GRAMALTIN', 'GRAM ALTIN'];
const SILVER_SYMBOLS = ['XAG', 'GUMUS', 'GÜMÜŞ'];

// BIST stocks — no free CORS-compatible live data available, informing the user
const BIST_SUFFIXES = ['.IS', '.BIST'];
const BIST_KNOWN = [
  'THYAO', 'ASELS', 'GARAN', 'AKBNK', 'ISCTR', 'YKBNK', 'SISE', 'KCHOL',
  'TUPRS', 'EREGL', 'SAHOL', 'BIMAS', 'FROTO', 'TOASO', 'TCELL', 'ARCLK',
  'PETKM', 'PGSUS', 'KOZAL', 'KOZAA', 'SODA', 'MGROS', 'EKGYO', 'VAKBN',
];

@Injectable({ providedIn: 'root' })
export class LivePriceService {
  private http = inject(HttpClient);
  private settingsService = inject(SettingsService);

  loading = signal(false);
  lastUpdate = signal<string | null>(null);
  lastError = signal<string | null>(null);

  /** Can live price be fetched for the symbol? */
  supports(symbol: string): boolean {
    const s = this.normalize(symbol);
    if (BINANCE_SYMBOLS[s]) return true;
    if (this.isGold(s)) return true;
    if (this.isSilver(s)) return true;
    // BIST stock — only if the user has entered an API key
    if (this.isBist(s) && this.hasStockApiKey()) return true;
    return false;
  }

  hasStockApiKey(): boolean {
    return !!this.settingsService.settings().stockApiKey?.trim();
  }

  /** Type label for the symbol (for display in the UI) */
  category(symbol: string): 'crypto' | 'gold' | 'silver' | 'bist' | 'none' {
    const s = this.normalize(symbol);
    if (BINANCE_SYMBOLS[s]) return 'crypto';
    if (this.isGold(s)) return 'gold';
    if (this.isSilver(s)) return 'silver';
    if (this.isBist(s)) return 'bist';
    return 'none';
  }

  /**
   * Returns the current unit price in USD for the given symbol.
   * - Crypto: 1 coin = ? USD
   * - Gold (Gram Gold): 1 gram = ? USD (PAXG / 31.1035)
   * - Silver: 1 ounce = ? USD (XAGUSDT)
   */
  async fetchPriceUsd(symbol: string): Promise<number> {
    const s = this.normalize(symbol);
    this.loading.set(true);
    this.lastError.set(null);

    try {
      if (this.isBist(s)) {
        if (!this.hasStockApiKey()) {
          throw new Error(`API key not provided for ${symbol}. Add a key from Settings > Stock API or update the price manually.`);
        }
        return await this.fetchBistPrice(s);
      }

      if (this.isGold(s)) {
        const ouncePrice = await this.binancePrice('PAXGUSDT');
        return Math.round((ouncePrice / TROY_OUNCE_IN_GRAMS) * 100) / 100;
      }

      if (this.isSilver(s)) {
        return await this.binancePrice('XAGUSDT');
      }

      const binanceSymbol = BINANCE_SYMBOLS[s];
      if (!binanceSymbol) {
        throw new Error(`Live price not supported for ${symbol}. Supported: BTC, ETH, BNB, SOL, XRP, Gram Gold (GA)…`);
      }
      return await this.binancePrice(binanceSymbol);
    } catch (err: any) {
      const message = err?.status === 0
        ? 'Could not reach live price service (Binance access may be blocked).'
        : err?.message ?? 'Could not fetch live price.';
      this.lastError.set(message);
      throw new Error(message);
    } finally {
      this.loading.set(false);
    }
  }

  /** Backward compatibility — old method name */
  fetchCryptoPriceUsd(symbol: string): Promise<number> {
    return this.fetchPriceUsd(symbol);
  }

  // ---------- helpers ----------

  /** Fetch price from the selected provider for a BIST stock (in TRY). */
  private async fetchBistPrice(symbol: string): Promise<number> {
    const s = this.settingsService.settings();
    const key = s.stockApiKey.trim();
    const provider = s.stockApiProvider;

    try {
      let priceTry: number;
      if (provider === 'twelvedata') priceTry = await this.fetchTwelveData(symbol, key);
      else if (provider === 'alphavantage') priceTry = await this.fetchAlphaVantage(symbol, key);
      else priceTry = await this.fetchFinnhub(symbol, key);

      this.lastUpdate.set(new Date().toISOString());
      // BIST price is already in TRY — convert to USD (caller expects it)
      const usdRate = s.usdRate || 32;
      return Math.round((priceTry / usdRate) * 100) / 100;
    } catch (err: any) {
      const msg = err?.message ?? '';
      if (msg.toLowerCase().includes('limit') || err?.status === 429) {
        throw new Error(`API daily limit reached. Please try tomorrow or update manually.`);
      }
      if (err?.status === 401 || err?.status === 403 || msg.toLowerCase().includes('apikey')) {
        throw new Error(`Invalid API key. Please check it in Settings.`);
      }
      throw new Error(`Could not fetch price for ${symbol}: ${msg || 'Unknown error'}`);
    }
  }

  private async fetchTwelveData(symbol: string, key: string): Promise<number> {
    // Twelve Data: BIST symbols require .IST suffix
    const r: any = await firstValueFrom(
      this.http.get(`https://api.twelvedata.com/price?symbol=${symbol}.IST&apikey=${key}`)
    );
    if (r.status === 'error' || r.code) throw new Error(r.message ?? 'twelvedata error');
    const price = Number(r.price);
    if (!price || isNaN(price)) throw new Error(`Price not found for ${symbol}`);
    return price;
  }

  private async fetchAlphaVantage(symbol: string, key: string): Promise<number> {
    const r: any = await firstValueFrom(
      this.http.get(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}.IST&apikey=${key}`)
    );
    if (r.Note) throw new Error('API daily limit reached (Alpha Vantage)');
    if (r['Error Message']) throw new Error(r['Error Message']);
    const price = Number(r['Global Quote']?.['05. price']);
    if (!price || isNaN(price)) throw new Error(`Price not found for ${symbol}`);
    return price;
  }

  private async fetchFinnhub(symbol: string, key: string): Promise<number> {
    const r: any = await firstValueFrom(
      this.http.get(`https://finnhub.io/api/v1/quote?symbol=${symbol}.IS&token=${key}`)
    );
    const price = Number(r.c);  // c = current price
    if (!price || isNaN(price)) throw new Error(`Price not found for ${symbol} (Finnhub may require premium for BIST)`);
    return price;
  }

  /** Test the API key (is it valid?) — makes a test call with a real symbol */
  async testApiKey(provider: StockApiProvider, key: string): Promise<{ ok: boolean; message: string }> {
    const testSymbol = 'THYAO';
    try {
      if (provider === 'twelvedata') await this.fetchTwelveData(testSymbol, key);
      else if (provider === 'alphavantage') await this.fetchAlphaVantage(testSymbol, key);
      else await this.fetchFinnhub(testSymbol, key);
      return { ok: true, message: 'Key is valid and working.' };
    } catch (err: any) {
      return { ok: false, message: err?.message ?? 'Test failed.' };
    }
  }

  private async binancePrice(binanceSymbol: string): Promise<number> {
    const r = await firstValueFrom(
      this.http.get<{ symbol: string; price: string }>(
        `https://api.binance.com/api/v3/ticker/price?symbol=${binanceSymbol}`
      )
    );
    const price = Number(r.price);
    if (!price || isNaN(price)) {
      throw new Error(`Could not read price for ${binanceSymbol}.`);
    }
    this.lastUpdate.set(new Date().toISOString());
    return price;
  }

  private normalize(symbol: string): string {
    return symbol.trim().toUpperCase()
      .replace(/\s+/g, ' ')
      .replace(/\.IS$|\.BIST$/i, '');
  }

  private isGold(s: string): boolean {
    return GOLD_SYMBOLS.includes(s);
  }

  private isSilver(s: string): boolean {
    return SILVER_SYMBOLS.includes(s);
  }

  private isBist(s: string): boolean {
    if (BIST_KNOWN.includes(s)) return true;
    return BIST_SUFFIXES.some(suffix => s.endsWith(suffix));
  }
}
