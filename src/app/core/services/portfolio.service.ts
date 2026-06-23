import { Injectable, inject, signal, computed } from '@angular/core';
import { Asset, AssetCurrency, Trade } from '../models/asset.model';
import { SettingsService } from './settings.service';
import { StorageService } from './storage.service';

@Injectable({ providedIn: 'root' })
export class PortfolioService {
  private settingsService = inject(SettingsService);
  private storage = inject(StorageService);
  private readonly STORAGE_KEY = 'finans_assets';

  assets = signal<Asset[]>(this.load());

  // Current total value of an asset (in TRY)
  currentValueTRY(a: Asset): number {
    return this.toTRY(a.quantity * a.unitPrice, a.currency);
  }

  // Total purchase cost of an asset (in TRY)
  purchaseCostTRY(a: Asset): number {
    return this.toTRY(a.quantity * a.purchasePrice, a.currency);
  }

  // Profit/loss (TRY)
  profitTRY(a: Asset): number {
    return this.currentValueTRY(a) - this.purchaseCostTRY(a);
  }

  // Profit/loss percentage
  profitPercent(a: Asset): number {
    const cost = this.purchaseCostTRY(a);
    if (cost === 0) return 0;
    return ((this.currentValueTRY(a) - cost) / cost) * 100;
  }

  totalValue = computed(() =>
    this.assets().reduce((sum, a) => sum + this.currentValueTRY(a), 0)
  );

  totalPurchase = computed(() =>
    this.assets().reduce((sum, a) => sum + this.purchaseCostTRY(a), 0)
  );

  totalProfit = computed(() => this.totalValue() - this.totalPurchase());

  // Total realized profit/loss of the entire portfolio
  totalRealizedProfit = computed(() =>
    this.assets().reduce((sum, asset) => sum + this.toTRY(asset.realizedProfit ?? 0, asset.currency), 0)
  );

  tradeHistory = computed(() =>
    this.assets()
      .flatMap(asset => this.tradesOf(asset))
      .sort((a, b) => b.date.localeCompare(a.date))
  );

  add(asset: Omit<Asset, 'id'>): void {
    const id = crypto.randomUUID();
    const item = this.recalculateAsset({
      ...asset,
      id,
      trades: asset.trades?.length ? asset.trades : this.createInitialTrades(id, asset),
      realizedProfit: asset.realizedProfit ?? 0,
    });
    this.assets.update(list => [...list, item]);
    this.save();
  }

  update(id: string, changes: Partial<Omit<Asset, 'id'>>): void {
    this.assets.update(list =>
      list.map(asset => asset.id === id ? this.recalculateAsset({ ...asset, ...changes }) : asset)
    );
    this.save();
  }

  remove(id: string): void {
    this.assets.update(list => list.filter(asset => asset.id !== id));
    this.save();
  }

  addTrade(
    assetId: string,
    input: Omit<Trade, 'id' | 'assetId' | 'assetSymbol' | 'assetName' | 'realizedProfit'>
  ): { ok: boolean; message: string } {
    const asset = this.assets().find(item => item.id === assetId);
    if (!asset) return { ok: false, message: 'Asset not found.' };
    if (input.quantity <= 0 || input.price <= 0) {
      return { ok: false, message: 'Quantity and price must be greater than 0.' };
    }
    if (input.type === 'sell' && input.quantity > this.calculateFIFO(asset).quantity) {
      return { ok: false, message: 'Sell quantity cannot exceed the held quantity.' };
    }

    const trade: Trade = {
      ...input,
      id: crypto.randomUUID(),
      assetId,
      assetSymbol: asset.symbol,
      assetName: asset.name,
    };
    const next = this.recalculateAsset({ ...asset, trades: [...this.tradesOf(asset), trade] });
    this.assets.update(list => list.map(item => item.id === assetId ? next : item));
    this.save();

    return {
      ok: true,
      message: input.type === 'buy' ? 'Buy trade added.' : 'Sell trade processed with FIFO.',
    };
  }

  removeTrade(assetId: string, tradeId: string): { ok: boolean; message: string } {
    const asset = this.assets().find(item => item.id === assetId);
    if (!asset) return { ok: false, message: 'Asset not found.' };

    const trades = this.tradesOf(asset);
    if (!trades.some(trade => trade.id === tradeId)) {
      return { ok: false, message: 'Trade not found.' };
    }

    const nextTrades = trades.filter(trade => trade.id !== tradeId);
    const next = this.recalculateAsset({ ...asset, trades: nextTrades });
    this.assets.update(list => list.map(item => item.id === assetId ? next : item));
    this.save();
    return { ok: true, message: 'Trade deleted and FIFO recalculated.' };
  }

  tradesOf(asset: Asset): Trade[] {
    return asset.trades?.length ? asset.trades : this.createInitialTrades(asset.id, asset);
  }

  calculateFIFO(asset: Asset): { quantity: number; averageCost: number; realizedProfit: number; unrealizedProfit: number } {
    const result = this.buildFifoState(asset);
    return {
      quantity: result.quantity,
      averageCost: result.averageCost,
      realizedProfit: result.realizedProfit,
      unrealizedProfit: result.unrealizedProfit,
    };
  }

  private toTRY(amount: number, currency: AssetCurrency): number {
    const settings = this.settingsService.settings();
    if (currency === 'TRY') return amount;
    if (currency === 'USD') return amount * (settings.usdRate || 1);
    if (currency === 'EUR') return amount * (settings.eurRate || 1);
    return amount;
  }

  private save(): void {
    this.storage.setItemSync(this.STORAGE_KEY, JSON.stringify(this.assets()));
  }

  private load(): Asset[] {
    try {
      const raw = JSON.parse(this.storage.getItemSync(this.STORAGE_KEY) ?? '[]');
      return raw.map((asset: any) => this.recalculateAsset({
        id: asset.id,
        name: asset.name ?? '',
        symbol: asset.symbol ?? '',
        type: asset.type ?? 'Other',
        quantity: asset.quantity ?? 0,
        purchasePrice: asset.purchasePrice ?? asset.unitPrice ?? 0,
        unitPrice: asset.unitPrice ?? 0,
        currency: asset.currency ?? 'TRY',
        trades: Array.isArray(asset.trades) ? asset.trades : undefined,
        realizedProfit: asset.realizedProfit ?? 0,
      }));
    } catch {
      return [];
    }
  }

  private createInitialTrades(assetId: string, asset: Omit<Asset, 'id'> | Asset): Trade[] {
    if (!asset.quantity || asset.quantity <= 0) return [];
    return [{
      id: `legacy-${assetId}`,
      assetId,
      assetSymbol: asset.symbol,
      assetName: asset.name,
      type: 'buy',
      quantity: asset.quantity,
      price: asset.purchasePrice || asset.unitPrice || 0,
      date: new Date().toISOString().slice(0, 10),
    }];
  }

  private recalculateAsset(asset: Asset): Asset {
    const result = this.buildFifoState(asset);
    return {
      ...asset,
      quantity: result.quantity,
      purchasePrice: result.averageCost,
      trades: result.trades,
      realizedProfit: result.realizedProfit,
    };
  }

  private buildFifoState(asset: Asset): {
    quantity: number;
    averageCost: number;
    realizedProfit: number;
    unrealizedProfit: number;
    trades: Trade[];
  } {
    const sortedTrades = [...(asset.trades ?? [])].sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      if (a.type === b.type) return 0;
      return a.type === 'buy' ? -1 : 1;
    });

    const lots: { quantity: number; price: number }[] = [];
    let realizedProfit = 0;
    const normalizedTrades = sortedTrades.map(trade => ({
      ...trade,
      assetId: asset.id,
      assetSymbol: asset.symbol,
      assetName: asset.name,
    }));

    for (const trade of normalizedTrades) {
      if (trade.type === 'buy') {
        lots.push({ quantity: trade.quantity, price: trade.price });
        trade.realizedProfit = undefined;
        continue;
      }

      let remainingToSell = trade.quantity;
      let tradeProfit = 0;
      for (const lot of lots) {
        if (remainingToSell <= 0) break;
        if (lot.quantity <= 0) continue;
        const consumed = Math.min(lot.quantity, remainingToSell);
        tradeProfit += (trade.price - lot.price) * consumed;
        lot.quantity -= consumed;
        remainingToSell -= consumed;
      }
      trade.realizedProfit = Math.round(tradeProfit * 100) / 100;
      realizedProfit += tradeProfit;
    }

    const remainingQuantity = lots.reduce((sum, lot) => sum + lot.quantity, 0);
    const remainingCost = lots.reduce((sum, lot) => sum + lot.quantity * lot.price, 0);
    const averageCost = remainingQuantity > 0 ? remainingCost / remainingQuantity : 0;
    const unrealizedProfit = (asset.unitPrice - averageCost) * remainingQuantity;

    return {
      quantity: Math.round(remainingQuantity * 1_000_000_000) / 1_000_000_000,
      averageCost: Math.round(averageCost * 100) / 100,
      trades: normalizedTrades,
      realizedProfit: Math.round(realizedProfit * 100) / 100,
      unrealizedProfit: Math.round(unrealizedProfit * 100) / 100,
    };
  }
}
