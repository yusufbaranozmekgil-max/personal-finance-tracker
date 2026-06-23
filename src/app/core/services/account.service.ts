import { Injectable, inject, signal, computed } from '@angular/core';
import { Account, ACCOUNT_TYPES, DEFAULT_ACCOUNT_ID } from '../models/account.model';
import { StorageService } from './storage.service';
import { TransactionService } from './transaction.service';

@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly STORAGE_KEY = 'finans_accounts';
  private storage = inject(StorageService);
  private txService = inject(TransactionService);

  accounts = signal<Account[]>(this.load());

  constructor() {
    // Create a default account if none exists on first launch
    if (this.accounts().length === 0 && !this.storage.getItemSync('finans_vault')) {
      this.add({
        name: 'Cash Wallet',
        type: 'cash',
        initialBalance: 0,
        currency: 'TRY',
      });
    }
  }

  // Total balance of all accounts (initial + all transactions)
  totalBalance = computed(() =>
    this.accounts().reduce((sum, acc) => sum + this.balanceOf(acc.id), 0)
  );

  // Current balance of an account (initialBalance + related income - expenses - outgoing transfers + incoming transfers)
  balanceOf(accountId: string): number {
    const acc = this.accounts().find(a => a.id === accountId);
    if (!acc) return 0;
    const txs = this.txService.transactions();
    
    const income = txs
      .filter(t => (t.accountId ?? DEFAULT_ACCOUNT_ID) === accountId && t.type === 'income')
      .reduce((s, t) => s + t.amount, 0);
      
    const expense = txs
      .filter(t => (t.accountId ?? DEFAULT_ACCOUNT_ID) === accountId && t.type === 'expense')
      .reduce((s, t) => s + t.amount, 0);
      
    const transferOut = txs
      .filter(t => (t.accountId ?? DEFAULT_ACCOUNT_ID) === accountId && t.type === 'transfer')
      .reduce((s, t) => s + t.amount, 0);
      
    const transferIn = txs
      .filter(t => t.transferAccountId === accountId && t.type === 'transfer')
      .reduce((s, t) => s + t.amount, 0);
      
    return acc.initialBalance + income - expense - transferOut + transferIn;
  }

  // Transaction count of the account
  transactionCountOf(accountId: string): number {
    return this.txService.transactions()
      .filter(t => (t.accountId ?? DEFAULT_ACCOUNT_ID) === accountId)
      .length;
  }

  iconFor(type: string): string {
    return ACCOUNT_TYPES.find(t => t.value === type)?.icon ?? '📋';
  }

  labelFor(type: string): string {
    return ACCOUNT_TYPES.find(t => t.value === type)?.label ?? 'Other';
  }

  // ID → name resolver (for transaction lists)
  nameOf(accountId: string | undefined): string {
    if (!accountId) return 'Undefined';
    return this.accounts().find(a => a.id === accountId)?.name ?? 'Undefined';
  }

  add(account: Omit<Account, 'id' | 'createdAt'>): Account {
    const newItem: Account = {
      ...account,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.accounts.update(list => [...list, newItem]);
    this.save();
    return newItem;
  }

  update(id: string, changes: Partial<Omit<Account, 'id' | 'createdAt'>>): void {
    this.accounts.update(list =>
      list.map(a => a.id === id ? { ...a, ...changes } : a)
    );
    this.save();
  }

  remove(id: string): void {
    // Move transactions linked to this account to a fallback account
    if (this.transactionCountOf(id) > 0) {
      const fallback = this.accounts().find(a => a.id !== id);
      if (fallback) {
        this.txService.transactions.update(list =>
          list.map(t => t.accountId === id ? { ...t, accountId: fallback.id } : t)
        );
        this.txService.saveToStorage();
      }
    }
    this.accounts.update(list => list.filter(a => a.id !== id));
    this.save();
  }

  // First account's ID — default for new transaction form
  defaultAccountId(): string {
    return this.accounts()[0]?.id ?? '';
  }

  private save(): void {
    this.storage.setItemSync(this.STORAGE_KEY, JSON.stringify(this.accounts()));
  }

  private load(): Account[] {
    try {
      return JSON.parse(this.storage.getItemSync(this.STORAGE_KEY) ?? '[]');
    } catch {
      return [];
    }
  }
}
