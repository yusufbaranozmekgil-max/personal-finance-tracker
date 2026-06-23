import { Injectable, inject } from '@angular/core';
import { TransactionService } from './transaction.service';
import { SettingsService } from './settings.service';
import { ToastService } from './toast.service';
import { Transaction } from '../models/transaction.model';

@Injectable({ providedIn: 'root' })
export class AutoResetService {
  private txService = inject(TransactionService);
  private settingsService = inject(SettingsService);
  private toast = inject(ToastService);

  runIfNeeded(): void {
    const settings = this.settingsService.settings();
    const today = new Date();
    const currentMonth = this.toMonthKey(today);
    const resetDay = Math.max(1, Math.min(28, settings.resetDay || 1));

    if (settings.lastResetMonth === currentMonth) return;
    if (today.getDate() < resetDay) return;

    const months = this.monthsToProcess(settings.lastResetMonth, currentMonth);
    if (months.length === 0) return;

    const result = this.performReset(months);
    this.settingsService.save({ ...settings, lastResetMonth: currentMonth });

    if (result.renewed > 0) {
      this.toast.info(`Monthly transition: ${result.renewed} recurring transaction(s) renewed.`);
    }
  }

  runManual(): { deleted: number; renewed: number } {
    const today = new Date();
    const settings = this.settingsService.settings();
    const result = this.performReset([this.toMonthKey(today)]);
    this.settingsService.save({ ...settings, lastResetMonth: this.toMonthKey(today) });
    return result;
  }

  private performReset(months: string[]): { deleted: number; renewed: number } {
    const all = this.txService.transactions();
    const renewed = this.renewRecurring(all, months);

    if (renewed.length > 0) {
      this.txService.transactions.set([...all, ...renewed]);
      this.txService.saveToStorage();
    }

    return { deleted: 0, renewed: renewed.length };
  }

  private renewRecurring(all: Transaction[], months: string[]): Transaction[] {
    const renewals: Transaction[] = [];
    const recurringRoots = new Map<string, Transaction>();

    for (const transaction of all) {
      if (!transaction.isRecurring) continue;
      const rootId = transaction.recurringParentId ?? transaction.id;
      const existing = recurringRoots.get(rootId);

      if (!existing || transaction.date < existing.date) {
        recurringRoots.set(rootId, transaction);
      }
    }

    const existingByMonth = new Set<string>();
    for (const transaction of all) {
      if (!transaction.isRecurring) continue;
      const rootId = transaction.recurringParentId ?? transaction.id;
      existingByMonth.add(`${rootId}:${transaction.date.slice(0, 7)}`);
    }

    for (const month of months) {
      for (const [rootId, root] of recurringRoots.entries()) {
        const marker = `${rootId}:${month}`;
        if (existingByMonth.has(marker)) continue;

        renewals.push({
          ...root,
          id: crypto.randomUUID(),
          date: this.dateForMonth(month, root.date),
          recurringParentId: rootId,
        });
        existingByMonth.add(marker);
      }
    }

    return renewals;
  }

  private monthsToProcess(lastResetMonth: string, currentMonth: string): string[] {
    if (!this.isMonthKey(currentMonth)) return [];
    if (!this.isMonthKey(lastResetMonth)) return [currentMonth];
    if (lastResetMonth >= currentMonth) return [];

    const months: string[] = [];
    const cursor = this.monthKeyToDate(lastResetMonth);
    cursor.setMonth(cursor.getMonth() + 1);

    while (this.toMonthKey(cursor) <= currentMonth) {
      months.push(this.toMonthKey(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return months;
  }

  private dateForMonth(month: string, sourceDate: string): string {
    const [year, monthNumber] = month.split('-').map(Number);
    const sourceDay = Number(sourceDate.slice(8, 10)) || 1;
    const lastDay = new Date(year, monthNumber, 0).getDate();
    const day = Math.min(sourceDay, lastDay);
    return `${month}-${String(day).padStart(2, '0')}`;
  }

  private isMonthKey(value: string): boolean {
    return /^\d{4}-\d{2}$/.test(value);
  }

  private monthKeyToDate(month: string): Date {
    const [year, monthNumber] = month.split('-').map(Number);
    return new Date(year, monthNumber - 1, 1);
  }

  private toMonthKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
}
