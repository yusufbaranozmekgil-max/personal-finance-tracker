import { Injectable, inject, signal, effect } from '@angular/core';
import { StorageService } from './storage.service';
import { AccountService } from './account.service';
import { PortfolioService } from './portfolio.service';
import { TransactionService } from './transaction.service';
import { SettingsService } from './settings.service';

export interface NetWorthSnapshot {
  date: string; // YYYY-MM-DD
  cash: number;
  portfolio: number;
  total: number;
}

@Injectable({ providedIn: 'root' })
export class NetWorthHistoryService {
  private readonly STORAGE_KEY = 'finans_net_worth_history';
  private storage = inject(StorageService);
  private accountService = inject(AccountService);
  private portfolioService = inject(PortfolioService);
  private txService = inject(TransactionService);
  private settingsService = inject(SettingsService);

  snapshots = signal<NetWorthSnapshot[]>([]);
  private loaded = false;

  constructor() {
    this.storage.whenReady().then(() => {
      const stored = this.load();
      this.snapshots.set(stored);
      if (stored.length === 0) {
        this.reconstructHistoryRetrospectively();
      }
      this.loaded = true;
      // Record today's initial snapshot immediately
      this.recordTodaySnapshot(
        this.accountService.totalBalance(),
        this.portfolioService.totalValue()
      );
    });

    effect(() => {
      const cash = this.accountService.totalBalance();
      const portfolio = this.portfolioService.totalValue();
      if (this.loaded) {
        this.recordTodaySnapshot(cash, portfolio);
      }
    });
  }

  recordTodaySnapshot(cash: number, portfolio: number): void {
    const todayStr = new Date().toISOString().slice(0, 10);
    const total = cash + portfolio;

    this.snapshots.update(list => {
      const existingIdx = list.findIndex(s => s.date === todayStr);
      const newSnapshot: NetWorthSnapshot = {
        date: todayStr,
        cash: Math.round(cash * 100) / 100,
        portfolio: Math.round(portfolio * 100) / 100,
        total: Math.round(total * 100) / 100,
      };

      const nextList = [...list];
      if (existingIdx !== -1) {
        const existing = nextList[existingIdx];
        if (
          existing.cash === newSnapshot.cash &&
          existing.portfolio === newSnapshot.portfolio &&
          existing.total === newSnapshot.total
        ) {
          return list;
        }
        nextList[existingIdx] = newSnapshot;
      } else {
        nextList.push(newSnapshot);
      }

      nextList.sort((a, b) => a.date.localeCompare(b.date));
      return nextList;
    });

    this.save();
  }

  reconstructHistoryRetrospectively(): void {
    const today = new Date();
    const snapshotsList: NetWorthSnapshot[] = [];
    const dates: string[] = [];

    // End-of-month dates for previous 5 months
    for (let i = 5; i >= 1; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
      dates.push(d.toISOString().slice(0, 10));
    }
    // Today
    dates.push(today.toISOString().slice(0, 10));

    const currentCash = this.accountService.totalBalance();
    const assets = this.portfolioService.assets();

    for (const targetDate of dates) {
      // 1. Rollback cash
      const txsAfter = this.txService.transactions().filter(t => t.date > targetDate);
      const incomeAfter = txsAfter.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
      const expenseAfter = txsAfter.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
      const targetCash = Math.max(0, currentCash - incomeAfter + expenseAfter);

      // 2. Rollback portfolio
      let targetPortfolioValue = 0;
      for (const asset of assets) {
        const tradesAfter = this.portfolioService.tradesOf(asset).filter(t => t.date > targetDate);
        const buysAfter = tradesAfter.filter(t => t.type === 'buy').reduce((sum, t) => sum + t.quantity, 0);
        const sellsAfter = tradesAfter.filter(t => t.type === 'sell').reduce((sum, t) => sum + t.quantity, 0);
        const targetQuantity = Math.max(0, asset.quantity - buysAfter + sellsAfter);

        if (targetQuantity > 0) {
          const tradesBeforeOrAt = this.portfolioService.tradesOf(asset).filter(t => t.date <= targetDate);
          let targetPrice = asset.unitPrice;
          if (tradesBeforeOrAt.length > 0) {
            const sorted = [...tradesBeforeOrAt].sort((a, b) => b.date.localeCompare(a.date));
            targetPrice = sorted[0].price;
          }

          const valueTRY = this.toTRY(targetQuantity * targetPrice, asset.currency);
          targetPortfolioValue += valueTRY;
        }
      }

      const total = targetCash + targetPortfolioValue;
      snapshotsList.push({
        date: targetDate,
        cash: Math.round(targetCash * 100) / 100,
        portfolio: Math.round(targetPortfolioValue * 100) / 100,
        total: Math.round(total * 100) / 100,
      });
    }

    this.snapshots.set(snapshotsList);
    this.save();
  }

  getMonthlyTrend(monthsCount: number = 6): { labels: string[]; months: string[]; data: number[] } {
    const labels: string[] = [];
    const months: string[] = [];
    const data: number[] = [];
    const now = new Date();

    for (let i = monthsCount - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleString('en-US', { month: 'short' });
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      labels.push(label);
      months.push(monthKey);

      const monthSnapshots = this.snapshots().filter(s => s.date.startsWith(monthKey));
      if (monthSnapshots.length > 0) {
        data.push(monthSnapshots[monthSnapshots.length - 1].total);
      } else {
        const beforeSnapshots = this.snapshots().filter(s => s.date < monthKey);
        if (beforeSnapshots.length > 0) {
          data.push(beforeSnapshots[beforeSnapshots.length - 1].total);
        } else {
          data.push(0);
        }
      }
    }

    return { labels, months, data };
  }

  private toTRY(amount: number, currency: string): number {
    const s = this.settingsService.settings();
    if (currency === 'TRY') return amount;
    if (currency === 'USD') return amount * (s.usdRate || 1);
    if (currency === 'EUR') return amount * (s.eurRate || 1);
    return amount;
  }

  private save(): void {
    this.storage.setItemSync(this.STORAGE_KEY, JSON.stringify(this.snapshots()));
  }

  private load(): NetWorthSnapshot[] {
    try {
      return JSON.parse(this.storage.getItemSync(this.STORAGE_KEY) ?? '[]');
    } catch {
      return [];
    }
  }
}
