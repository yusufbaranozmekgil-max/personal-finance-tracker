import { Injectable, inject, signal } from '@angular/core';
import { Holding, StockProvider } from '../domain/model';
import { convert, round2 } from '../domain/money';
import { BookStore } from './book-store';

const TROY_OUNCE_GRAMS = 31.1034768;
const CRYPTO = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'AVAX', 'DOT', 'LINK', 'LTC', 'TRX', 'TON', 'POL', 'ATOM', 'XLM', 'BCH', 'NEAR', 'UNI'];
/** Gold priced per gram via PAX Gold (1 token = 1 troy ounce). */
const GOLD_GRAM = ['XAU-G', 'GOLD-G', 'GA', 'GAU'];
const GOLD_OUNCE = ['XAU', 'GOLD', 'PAXG'];

export type PriceSource = 'crypto' | 'gold' | 'stock' | null;

export function priceSource(symbol: string, kind: Holding['kind'], hasStockKey: boolean): PriceSource {
  const s = symbol.trim().toUpperCase();
  if (CRYPTO.includes(s)) return 'crypto';
  if (GOLD_GRAM.includes(s) || GOLD_OUNCE.includes(s)) return 'gold';
  if ((kind === 'stock' || kind === 'fund') && hasStockKey && s) return 'stock';
  return null;
}

async function json(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (res.status === 429) throw new Error('The price service says too many requests; try again later.');
  if (!res.ok) throw new Error(`The price service answered ${res.status}.`);
  return res.json();
}

async function binanceUsd(pair: string): Promise<number> {
  const r = await json(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(pair)}`);
  const p = Number(r.price);
  if (!(p > 0)) throw new Error('No price came back.');
  return p;
}

async function stockPrice(provider: StockProvider, key: string, symbol: string): Promise<number> {
  const s = encodeURIComponent(symbol);
  const k = encodeURIComponent(key);
  let p: number;
  if (provider === 'twelvedata') {
    const r = await json(`https://api.twelvedata.com/price?symbol=${s}&apikey=${k}`);
    if (r.status === 'error') throw new Error(r.message ?? 'Twelve Data refused the request.');
    p = Number(r.price);
  } else if (provider === 'finnhub') {
    p = Number((await json(`https://finnhub.io/api/v1/quote?symbol=${s}&token=${k}`)).c);
  } else {
    const r = await json(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${s}&apikey=${k}`);
    if (r.Note || r.Information) throw new Error('Alpha Vantage daily limit reached.');
    p = Number(r['Global Quote']?.['05. price']);
  }
  if (!(p > 0)) throw new Error(`No price for ${symbol}. Check the symbol is written the way your provider expects.`);
  return p;
}

/** Fetches current prices from free public feeds; the user's stock key is sent only to the provider they chose. */
@Injectable({ providedIn: 'root' })
export class PriceService {
  private store = inject(BookStore);
  readonly busy = signal(false);

  /** Updates one holding's price. Returns an error message, or null on success. */
  async refresh(holdingId: string): Promise<string | null> {
    const book = this.store.book();
    const h = book?.holdings.find(x => x.id === holdingId);
    if (!book || !h) return 'Holding not found.';
    const source = priceSource(h.symbol, h.kind, !!book.stockApi?.key);
    if (!source) return 'No live price for this symbol. Enter the price by hand.';
    this.busy.set(true);
    try {
      const s = h.symbol.trim().toUpperCase();
      let price: number;
      if (source === 'stock') {
        // Stock prices come in the listing's currency, which the user sets on the holding.
        price = await stockPrice(book.stockApi!.provider, book.stockApi!.key, h.symbol.trim());
      } else {
        const usd = source === 'crypto'
          ? await binanceUsd(`${s}USDT`)
          : (await binanceUsd('PAXGUSDT')) / (GOLD_GRAM.includes(s) ? TROY_OUNCE_GRAMS : 1);
        const local = convert(usd, 'USD', h.currency, book.rates);
        if (local === null) return `No exchange rate for ${h.currency} yet. Refresh rates first.`;
        price = local;
      }
      const priced = { price: round2(price) || price, priceAt: new Date().toISOString() };
      this.store.update(b => ({ ...b, holdings: b.holdings.map(x => (x.id === holdingId ? { ...x, ...priced } : x)) }));
      return null;
    } catch (err) {
      if (err instanceof TypeError || (err as Error)?.name === 'TimeoutError') {
        return navigator.onLine ? 'The price service could not be reached (it may be blocked in your region).' : 'You are offline.';
      }
      return (err as Error).message;
    } finally {
      this.busy.set(false);
    }
  }
}
