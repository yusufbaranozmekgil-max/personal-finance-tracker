import { Holding, Trade } from './model';
import { round2 } from './money';

export interface FifoState {
  quantity: number;
  /** Average cost of the lots still held. */
  averageCost: number;
  costBasis: number;
  realized: number;
  /** Realized profit per sell trade id. */
  realizedByTrade: Record<string, number>;
}

/** Trades in the order they happened; buys before sells on the same day. */
export function orderedTrades(trades: Trade[]): Trade[] {
  return [...trades].sort((a, b) => a.date.localeCompare(b.date) || (a.side === b.side ? 0 : a.side === 'buy' ? -1 : 1));
}

/**
 * First-in, first-out lot accounting. Each sell consumes the oldest open lots;
 * its profit is (sell price - lot price) x quantity consumed.
 * Throws when a sell exceeds what is held at that point.
 */
export function fifo(trades: Trade[]): FifoState {
  const lots: { quantity: number; price: number }[] = [];
  let realized = 0;
  const realizedByTrade: Record<string, number> = {};
  for (const t of orderedTrades(trades)) {
    if (t.side === 'buy') {
      lots.push({ quantity: t.quantity, price: t.price });
      continue;
    }
    let left = t.quantity;
    let profit = 0;
    for (const lot of lots) {
      if (left <= 1e-12) break;
      const used = Math.min(lot.quantity, left);
      profit += (t.price - lot.price) * used;
      lot.quantity -= used;
      left -= used;
    }
    if (left > 1e-9) throw new Error(`Sell on ${t.date} exceeds the quantity held.`);
    realizedByTrade[t.id] = round2(profit);
    realized += profit;
  }
  const open = lots.filter(l => l.quantity > 1e-12);
  const quantity = open.reduce((s, l) => s + l.quantity, 0);
  const costBasis = open.reduce((s, l) => s + l.quantity * l.price, 0);
  return {
    quantity: Math.round(quantity * 1e9) / 1e9,
    averageCost: quantity > 0 ? costBasis / quantity : 0,
    costBasis: round2(costBasis),
    realized: round2(realized),
    realizedByTrade,
  };
}

/** True when adding `trade` keeps every sell covered by earlier buys. */
export function canAddTrade(trades: Trade[], trade: Trade): boolean {
  try { fifo([...trades, trade]); return true; } catch { return false; }
}

export function holdingValue(h: Holding): number {
  return round2(fifo(h.trades).quantity * h.price);
}

export function unrealized(h: Holding): number {
  const s = fifo(h.trades);
  return round2(s.quantity * h.price - s.costBasis);
}
