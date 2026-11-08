import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { BookStore } from '../../data/book-store';
import { PriceService, priceSource } from '../../data/prices';
import { HOLDING_KINDS, Holding, HoldingKind, Trade, newId } from '../../domain/model';
import { COMMON_CURRENCIES, convert, formatDate, formatNumber, formatPercent, isValidIsoDate, parseAmount, todayIso } from '../../domain/money';
import { canAddTrade, fifo, orderedTrades } from '../../domain/fifo';
import { holdingsTotal, sumInBase } from '../../domain/ledger';
import { MoneyPipe } from '../../ui/money.pipe';
import { Icon } from '../../ui/icon';
import { Notices } from '../../ui/notice';

interface HoldingDraft {
  id: string | null; name: string; symbol: string; kind: HoldingKind; currency: string;
  quantity: string; price: string; date: string;
}

/** Positive decimals with up to 8 places (crypto), dot or comma decimal mark. */
export function parseQuantity(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,8})?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && n < 1e12 ? n : null;
}

/** Unit prices may be tiny (crypto); accept up to 8 decimals, otherwise use the money parser. */
export function parseUnitPrice(s: string): number | null {
  const t = s.trim();
  if (/^\d+[.,]\d{3,8}$/.test(t) && !/^\d{1,3}[.,]\d{3}$/.test(t)) return Number(t.replace(',', '.'));
  return parseAmount(t);
}

@Component({
  selector: 'app-investments',
  imports: [MoneyPipe, Icon],
  templateUrl: './investments.html',
  styleUrl: './investments.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvestmentsPage {
  private store = inject(BookStore);
  private notices = inject(Notices);
  protected readonly prices = inject(PriceService);
  protected readonly kinds = HOLDING_KINDS;
  protected readonly currencies = COMMON_CURRENCIES;
  protected readonly book = computed(() => this.store.book()!);
  protected readonly base = computed(() => this.book().baseCurrency);
  protected readonly today = todayIso();
  protected readonly fmtQty = (n: number) => formatNumber(n, 8);
  protected readonly pct = (share: number) => formatPercent(share, 1);

  protected readonly rows = computed(() => {
    const book = this.book();
    return book.holdings.map(h => {
      const s = fifo(h.trades);
      const value = s.quantity * h.price;
      const unrealized = value - s.costBasis;
      return {
        h, s, value, unrealized,
        pct: s.costBasis > 0 ? unrealized / s.costBasis : null,
        valueInBase: h.currency === book.baseCurrency ? null : convert(value, h.currency, book.baseCurrency, book.rates),
        live: !!priceSource(h.symbol, h.kind, !!book.stockApi?.key),
        priced: h.priceAt ? formatDate(h.priceAt.slice(0, 10)) : null,
        kind: HOLDING_KINDS.find(k => k.value === h.kind)?.label ?? 'Other',
      };
    });
  });

  protected readonly totals = computed(() => {
    const book = this.book();
    const rows = this.rows();
    return {
      value: holdingsTotal(book),
      unrealized: sumInBase(book, rows.map(r => ({ amount: r.unrealized, currency: r.h.currency }))),
      realized: sumInBase(book, rows.map(r => ({ amount: r.s.realized, currency: r.h.currency }))),
    };
  });

  protected readonly open = signal<string | null>(null);

  protected toggle(id: string): void {
    this.open.update(o => (o === id ? null : id));
    this.tradeError.set(null);
    this.draft.set(null);
  }

  // ---------- new / edit holding ----------
  protected readonly draft = signal<HoldingDraft | null>(null);
  protected readonly draftError = signal<string | null>(null);

  protected newHolding(): void {
    this.open.set(null);
    this.draftError.set(null);
    this.draft.set({ id: null, name: '', symbol: '', kind: 'crypto', currency: 'USD', quantity: '', price: '', date: this.today });
  }

  protected editHolding(h: Holding): void {
    this.draftError.set(null);
    this.draft.set({ id: h.id, name: h.name, symbol: h.symbol, kind: h.kind, currency: h.currency, quantity: '', price: String(h.price), date: this.today });
  }

  protected patch(change: Partial<HoldingDraft>): void {
    this.draft.update(d => (d ? { ...d, ...change } : d));
  }

  protected saveHolding(event: Event): void {
    event.preventDefault();
    const d = this.draft();
    if (!d) return;
    const name = d.name.trim().slice(0, 60);
    const symbol = d.symbol.trim().toUpperCase().slice(0, 20);
    if (!name) { this.draftError.set('Give it a name, like "Bitcoin" or "World index fund".'); return; }
    if (d.id) {
      const price = parseUnitPrice(d.price);
      if (price === null || price < 0) { this.draftError.set('The price is not a number.'); return; }
      this.store.update(b => ({ ...b, holdings: b.holdings.map(h => (h.id === d.id ? { ...h, name, symbol, kind: d.kind, currency: d.currency, price } : h)) }));
      this.draft.set(null);
      return;
    }
    const quantity = parseQuantity(d.quantity);
    const price = parseUnitPrice(d.price);
    if (quantity === null) { this.draftError.set('Enter how many units you bought, like 0.05 or 10.'); return; }
    if (price === null || price <= 0) { this.draftError.set('Enter the price you paid per unit.'); return; }
    if (!isValidIsoDate(d.date)) { this.draftError.set('Pick a date between 1900 and 2100.'); return; }
    const holding: Holding = {
      id: newId(), name, symbol, kind: d.kind, currency: d.currency, price,
      trades: [{ id: newId(), side: 'buy', quantity, price, date: d.date }],
    };
    this.store.update(b => ({ ...b, holdings: [...b.holdings, holding] }));
    this.draft.set(null);
    this.open.set(holding.id);
    if (priceSource(symbol, d.kind, !!this.book().stockApi?.key)) void this.refresh(holding.id);
  }

  protected deleteHolding(id: string): void {
    this.store.update(b => ({ ...b, holdings: b.holdings.filter(h => h.id !== id) }));
    this.open.set(null);
    this.draft.set(null);
    this.notices.say('Holding deleted.');
  }

  protected readonly confirmDelete = signal<string | null>(null);

  // ---------- trades ----------
  protected readonly side = signal<'buy' | 'sell'>('buy');
  protected readonly qty = signal('');
  protected readonly tradePrice = signal('');
  protected readonly tradeDate = signal(this.today);
  protected readonly tradeError = signal<string | null>(null);

  protected tradesOf(h: Holding): Trade[] {
    return orderedTrades(h.trades).reverse();
  }

  protected addTrade(event: Event, h: Holding): void {
    event.preventDefault();
    const quantity = parseQuantity(this.qty());
    const price = parseUnitPrice(this.tradePrice());
    if (quantity === null) { this.tradeError.set('Enter a quantity above zero.'); return; }
    if (price === null || price <= 0) { this.tradeError.set('Enter the price per unit.'); return; }
    if (!isValidIsoDate(this.tradeDate())) { this.tradeError.set('Pick a date between 1900 and 2100.'); return; }
    const trade: Trade = { id: newId(), side: this.side(), quantity, price, date: this.tradeDate() };
    if (!canAddTrade(h.trades, trade)) {
      this.tradeError.set(`On ${formatDate(trade.date)} you held less than ${this.fmtQty(quantity)}. A sale cannot exceed what you owned that day.`);
      return;
    }
    this.store.update(b => ({ ...b, holdings: b.holdings.map(x => (x.id === h.id ? { ...x, trades: [...x.trades, trade] } : x)) }));
    this.qty.set('');
    this.tradePrice.set('');
    this.tradeError.set(null);
  }

  protected removeTrade(h: Holding, tradeId: string): void {
    const trades = h.trades.filter(t => t.id !== tradeId);
    try {
      fifo(trades);
    } catch {
      this.notices.say('Removing that buy would leave a later sale uncovered. Remove the sale first.', 'error');
      return;
    }
    this.store.update(b => ({ ...b, holdings: b.holdings.map(x => (x.id === h.id ? { ...x, trades } : x)) }));
  }

  protected async refresh(id: string): Promise<void> {
    const err = await this.prices.refresh(id);
    if (err) this.notices.say(err, 'error');
  }

  protected async refreshAll(): Promise<void> {
    const live = this.rows().filter(r => r.live);
    let failed = 0;
    for (const r of live) if (await this.prices.refresh(r.h.id)) failed++;
    this.notices.say(failed ? `${live.length - failed} of ${live.length} prices updated.` : `${live.length} ${live.length === 1 ? 'price' : 'prices'} updated.`, failed ? 'error' : 'info');
  }

  protected readonly anyLive = computed(() => this.rows().some(r => r.live));
}
