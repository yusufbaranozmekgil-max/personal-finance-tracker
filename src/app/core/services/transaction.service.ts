import { Injectable, inject, signal, computed } from '@angular/core';
import { Transaction } from '../models/transaction.model';
import { StorageService } from './storage.service';

@Injectable({ providedIn: 'root' })
export class TransactionService {
  private readonly STORAGE_KEY = 'finans_transactions';
  private storage = inject(StorageService);

  transactions = signal<Transaction[]>(this.load());

  totalIncome = computed(() =>
    this.transactions()
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0)
  );

  totalExpense = computed(() =>
    this.transactions()
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0)
  );

  balance = computed(() => this.totalIncome() - this.totalExpense());

  add(transaction: Omit<Transaction, 'id'>): void {
    const newItem: Transaction = { ...transaction, id: crypto.randomUUID() };
    this.transactions.update(list => [newItem, ...list]);
    this.save();
  }

  update(id: string, changes: Partial<Omit<Transaction, 'id'>>): void {
    this.transactions.update(list =>
      list.map(t => t.id === id ? { ...t, ...changes } : t)
    );
    this.save();
  }

  remove(id: string): void {
    this.transactions.update(list => list.filter(t => t.id !== id));
    this.save();
  }

  currentMonthExpense = computed(() => {
    const now = new Date();
    return this.transactions()
      .filter(t => {
        const d = new Date(t.date);
        return t.type === 'expense' && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((sum, t) => sum + t.amount, 0);
  });

  saveToStorage(): void {
    this.save();
  }

  private save(): void {
    this.storage.setItemSync(this.STORAGE_KEY, JSON.stringify(this.transactions()));
  }

  private load(): Transaction[] {
    try {
      return JSON.parse(this.storage.getItemSync(this.STORAGE_KEY) ?? '[]');
    } catch {
      return [];
    }
  }
}
