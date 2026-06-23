import { Injectable, inject } from '@angular/core';
import { TransactionService } from './transaction.service';
import { PortfolioService } from './portfolio.service';
import { GoalService } from './goal.service';
import { SettingsService } from './settings.service';
import { CategoryService } from './category.service';
import { AccountService } from './account.service';
import { StorageService } from './storage.service';
import { NetWorthHistoryService } from './net-worth-history.service';

@Injectable({ providedIn: 'root' })
export class DataService {
  private txService = inject(TransactionService);
  private portfolioService = inject(PortfolioService);
  private goalService = inject(GoalService);
  private settingsService = inject(SettingsService);
  private categoryService = inject(CategoryService);
  private accountService = inject(AccountService);
  private storage = inject(StorageService);
  private netWorthHistoryService = inject(NetWorthHistoryService);

  // ====== JSON BACKUP (Export / Import) ======
  exportJSON(): { content: string; filename: string } {
    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      transactions: this.txService.transactions(),
      assets: this.portfolioService.assets(),
      goals: this.goalService.goals(),
      categories: this.categoryService.categories(),
      accounts: this.accountService.accounts(),
      settings: this.settingsService.settings(),
      netWorthHistory: this.netWorthHistoryService.snapshots(),
    };
    const stamp = new Date().toISOString().slice(0, 10);
    return {
      content: JSON.stringify(backup, null, 2),
      filename: `finance-backup-${stamp}.json`,
    };
  }

  importJSON(jsonText: string): { ok: boolean; message: string } {
    try {
      const data = JSON.parse(jsonText);
      if (typeof data !== 'object' || data === null) {
        return { ok: false, message: 'Invalid JSON file.' };
      }
      if (!Array.isArray(data.transactions) || !Array.isArray(data.assets) || !Array.isArray(data.goals)) {
        return { ok: false, message: 'Incompatible file format. (transactions/assets/goals fields missing)' };
      }

      // Set all state
      this.txService.transactions.set(data.transactions);
      this.portfolioService.assets.set(data.assets);
      this.goalService.goals.set(data.goals);
      if (data.categories) this.categoryService.categories.set(data.categories);
      if (data.accounts) this.accountService.accounts.set(data.accounts);
      if (data.settings) this.settingsService.save(data.settings);

      // Write to IndexedDB
      this.storage.setItemSync('finans_transactions', JSON.stringify(data.transactions));
      this.storage.setItemSync('finans_assets', JSON.stringify(data.assets));
      this.storage.setItemSync('finans_goals', JSON.stringify(data.goals));
      if (data.categories) this.storage.setItemSync('finans_categories', JSON.stringify(data.categories));
      if (data.accounts) this.storage.setItemSync('finans_accounts', JSON.stringify(data.accounts));
      if (Array.isArray(data.netWorthHistory)) {
        this.netWorthHistoryService.snapshots.set(data.netWorthHistory);
        this.storage.setItemSync('finans_net_worth_history', JSON.stringify(data.netWorthHistory));
      }

      const counts = `${data.transactions.length} transactions, ${data.assets.length} assets, ${data.goals.length} goals`;
      return { ok: true, message: `Backup restored: ${counts}.` };
    } catch (err: any) {
      return { ok: false, message: `Import error: ${err?.message ?? 'Corrupted file.'}` };
    }
  }

  resetAll(): void {
    this.storage.removeItemSync('finans_transactions');
    this.storage.removeItemSync('finans_assets');
    this.storage.removeItemSync('finans_goals');
    this.storage.removeItemSync('finans_categories');
    this.storage.removeItemSync('finans_accounts');
    this.storage.removeItemSync('finans_net_worth_history');
    this.txService.transactions.set([]);
    this.portfolioService.assets.set([]);
    this.goalService.goals.set([]);
    this.categoryService.reset();
    this.accountService.accounts.set([]);
    this.netWorthHistoryService.snapshots.set([]);
  }

  loadDemo(): void {
    const today = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    
    // Helper to generate dates relative to current year/month
    const getRelativeDate = (monthsAgo: number, day: number) => {
      const d = new Date(today.getFullYear(), today.getMonth() - monthsAgo, day);
      return iso(d);
    };

    // 4-month Military Officer income and expense simulation
    const demoTransactions = [
      // === INCOME ===
      // Current Month
      { type: 'income' as const, category: 'Salary', amount: 65000, date: getRelativeDate(0, 15), description: 'June Military Salary Payment', paymentMethod: 'Bank Transfer', isRecurring: true },
      // Last Month
      { type: 'income' as const, category: 'Salary', amount: 65000, date: getRelativeDate(1, 15), description: 'May Military Salary Payment', paymentMethod: 'Bank Transfer' },
      { type: 'income' as const, category: 'Bonus', amount: 12000, date: getRelativeDate(1, 28), description: 'Field Exercise Duty Allowance', paymentMethod: 'Bank Transfer' },
      // 2 Months Ago
      { type: 'income' as const, category: 'Salary', amount: 65000, date: getRelativeDate(2, 15), description: 'April Military Salary Payment', paymentMethod: 'Bank Transfer' },
      // 3 Months Ago
      { type: 'income' as const, category: 'Salary', amount: 65000, date: getRelativeDate(3, 15), description: 'March Military Salary Payment', paymentMethod: 'Bank Transfer' },
      { type: 'income' as const, category: 'Bonus', amount: 12000, date: getRelativeDate(3, 28), description: 'Cross-Border Operation Allowance', paymentMethod: 'Bank Transfer' },

      // === EXPENSES ===
      // Current Month
      { type: 'expense' as const, category: 'Rent', amount: 10000, date: getRelativeDate(0, 15), description: 'Military Housing Rent & Utilities', paymentMethod: 'Bank Transfer', isRecurring: true },
      { type: 'expense' as const, category: 'Bills', amount: 480, date: getRelativeDate(0, 8), description: 'Housing Electricity Bill', paymentMethod: 'Debit Card', isRecurring: true },
      { type: 'expense' as const, category: 'Bills', amount: 450, date: getRelativeDate(0, 12), description: 'Mobile Phone Bill', paymentMethod: 'Credit Card', isRecurring: true },
      { type: 'expense' as const, category: 'Food', amount: 1950, date: getRelativeDate(0, 3), description: 'Officers Club Canteen Shopping', paymentMethod: 'Debit Card' },
      { type: 'expense' as const, category: 'Shopping', amount: 2200, date: getRelativeDate(0, 18), description: 'Military Gear & Camping Equipment', paymentMethod: 'Credit Card' },
      { type: 'expense' as const, category: 'Transportation', amount: 2600, date: getRelativeDate(0, 20), description: 'Gas Station Fuel Purchase', paymentMethod: 'Credit Card' },

      // Last Month
      { type: 'expense' as const, category: 'Rent', amount: 10000, date: getRelativeDate(1, 15), description: 'Military Housing Rent & Utilities', paymentMethod: 'Bank Transfer' },
      { type: 'expense' as const, category: 'Bills', amount: 450, date: getRelativeDate(1, 8), description: 'Housing Water & Fuel Bill', paymentMethod: 'Debit Card' },
      { type: 'expense' as const, category: 'Bills', amount: 450, date: getRelativeDate(1, 12), description: 'Mobile Phone Bill', paymentMethod: 'Credit Card' },
      { type: 'expense' as const, category: 'Food', amount: 1800, date: getRelativeDate(1, 3), description: 'Officers Club Canteen Shopping', paymentMethod: 'Debit Card' },
      { type: 'expense' as const, category: 'Health', amount: 550, date: getRelativeDate(1, 18), description: 'Prescription Medication & Vitamins', paymentMethod: 'Credit Card' },
      { type: 'expense' as const, category: 'Food', amount: 1400, date: getRelativeDate(1, 22), description: 'Officers Lounge Dinner', paymentMethod: 'Cash' },
      { type: 'expense' as const, category: 'Transportation', amount: 2400, date: getRelativeDate(1, 25), description: 'Gas Station Fuel Purchase', paymentMethod: 'Credit Card' },

      // 2 Months Ago
      { type: 'expense' as const, category: 'Rent', amount: 10000, date: getRelativeDate(2, 15), description: 'Military Housing Rent & Utilities', paymentMethod: 'Bank Transfer' },
      { type: 'expense' as const, category: 'Bills', amount: 650, date: getRelativeDate(2, 8), description: 'Housing Natural Gas Bill', paymentMethod: 'Debit Card' },
      { type: 'expense' as const, category: 'Bills', amount: 450, date: getRelativeDate(2, 12), description: 'Mobile Phone Bill', paymentMethod: 'Credit Card' },
      { type: 'expense' as const, category: 'Food', amount: 1500, date: getRelativeDate(2, 3), description: 'Officers Club Canteen Shopping', paymentMethod: 'Debit Card' },
      { type: 'expense' as const, category: 'Education', amount: 950, date: getRelativeDate(2, 18), description: 'Military History & Strategy Books', paymentMethod: 'Credit Card' },
      { type: 'expense' as const, category: 'Transportation', amount: 2500, date: getRelativeDate(2, 20), description: 'Vehicle Periodic Maintenance', paymentMethod: 'Credit Card' },
      { type: 'expense' as const, category: 'Food', amount: 1300, date: getRelativeDate(2, 22), description: 'Officers Club Social Dinner', paymentMethod: 'Cash' },
      { type: 'expense' as const, category: 'Transportation', amount: 2200, date: getRelativeDate(2, 25), description: 'Gas Station Fuel Purchase', paymentMethod: 'Credit Card' },

      // 3 Months Ago
      { type: 'expense' as const, category: 'Rent', amount: 10000, date: getRelativeDate(3, 15), description: 'Military Housing Rent & Utilities', paymentMethod: 'Bank Transfer' },
      { type: 'expense' as const, category: 'Bills', amount: 850, date: getRelativeDate(3, 8), description: 'Housing Heating Bill', paymentMethod: 'Debit Card' },
      { type: 'expense' as const, category: 'Bills', amount: 450, date: getRelativeDate(3, 12), description: 'Mobile Phone Bill', paymentMethod: 'Credit Card' },
      { type: 'expense' as const, category: 'Food', amount: 1200, date: getRelativeDate(3, 3), description: 'Officers Club Canteen Shopping', paymentMethod: 'Debit Card' },
      { type: 'expense' as const, category: 'Shopping', amount: 2800, date: getRelativeDate(3, 18), description: 'Tactical Boots & Operational Clothing', paymentMethod: 'Credit Card' },
      { type: 'expense' as const, category: 'Food', amount: 1100, date: getRelativeDate(3, 22), description: 'Weekly Social Activity / Dining', paymentMethod: 'Cash' },
      { type: 'expense' as const, category: 'Transportation', amount: 2200, date: getRelativeDate(3, 25), description: 'Gas Station Fuel Purchase', paymentMethod: 'Credit Card' },
    ];

    // Military officer portfolio: Gold, defense industry stock (ASELSAN), and foreign currency
    const demoAssets = [
      { name: 'Aselsan', symbol: 'ASELS', type: 'Stock' as const, quantity: 400, purchasePrice: 72, unitPrice: 92, currency: 'TRY' as const, trades: [
        { id: 't-asels-1', type: 'buy' as const, quantity: 150, price: 72, date: getRelativeDate(3, 16), assetId: '', assetSymbol: '', assetName: '' },
        { id: 't-asels-2', type: 'buy' as const, quantity: 150, price: 72, date: getRelativeDate(2, 16), assetId: '', assetSymbol: '', assetName: '' },
        { id: 't-asels-3', type: 'buy' as const, quantity: 150, price: 72, date: getRelativeDate(1, 16), assetId: '', assetSymbol: '', assetName: '' },
        { id: 't-asels-4', type: 'sell' as const, quantity: 50, price: 88, date: getRelativeDate(1, 25), assetId: '', assetSymbol: '', assetName: '' }
      ]},
      { name: 'Gram Gold', symbol: 'GA', type: 'Gold' as const, quantity: 37, purchasePrice: 2450, unitPrice: 2750, currency: 'TRY' as const, trades: [
        { id: 't-ga-1', type: 'buy' as const, quantity: 10, price: 2400, date: getRelativeDate(3, 15), assetId: '', assetSymbol: '', assetName: '' },
        { id: 't-ga-2', type: 'buy' as const, quantity: 10, price: 2450, date: getRelativeDate(2, 15), assetId: '', assetSymbol: '', assetName: '' },
        { id: 't-ga-3', type: 'buy' as const, quantity: 10, price: 2480, date: getRelativeDate(1, 15), assetId: '', assetSymbol: '', assetName: '' },
        { id: 't-ga-4', type: 'buy' as const, quantity: 12, price: 2470, date: getRelativeDate(0, 15), assetId: '', assetSymbol: '', assetName: '' },
        { id: 't-ga-5', type: 'sell' as const, quantity: 5, price: 2720, date: getRelativeDate(0, 20), assetId: '', assetSymbol: '', assetName: '' }
      ]},
      { name: 'US Dollar', symbol: 'USD', type: 'Foreign Currency' as const, quantity: 1200, purchasePrice: 32.10, unitPrice: 32.80, currency: 'TRY' as const, trades: [
        { id: 't-usd-1', type: 'buy' as const, quantity: 300, price: 32.00, date: getRelativeDate(3, 10), assetId: '', assetSymbol: '', assetName: '' },
        { id: 't-usd-2', type: 'buy' as const, quantity: 300, price: 32.10, date: getRelativeDate(2, 10), assetId: '', assetSymbol: '', assetName: '' },
        { id: 't-usd-3', type: 'buy' as const, quantity: 300, price: 32.15, date: getRelativeDate(1, 10), assetId: '', assetSymbol: '', assetName: '' },
        { id: 't-usd-4', type: 'buy' as const, quantity: 300, price: 32.25, date: getRelativeDate(0, 10), assetId: '', assetSymbol: '', assetName: '' }
      ]}
    ];

    // Military goals
    const goals = [
      { name: 'Tactical & Camping Equipment', icon: '🏕️', targetAmount: 15000, currentAmount: 8500, deadline: getRelativeDate(-3, 15), description: 'Savings for outdoor and exercise gear' },
      { name: 'New Car Down Payment', icon: '🚗', targetAmount: 150000, currentAmount: 65000, deadline: getRelativeDate(-8, 1), description: 'Savings with pension fund support for vehicle down payment' },
      { name: 'Private Pension Plan (PPP)', icon: '🛡️', targetAmount: 50000, currentAmount: 28000, deadline: getRelativeDate(-12, 1), description: 'Additional retirement security outside military pension' }
    ];

    this.resetAll();

    // Create demo accounts
    const cashAcc = this.accountService.add({ name: 'Cash Wallet', type: 'cash', initialBalance: 15000, currency: 'TRY' });
    const bankAcc = this.accountService.add({ name: 'Vakifbank Military Salary Account', type: 'bank', initialBalance: 25000, currency: 'TRY' });
    const creditAcc = this.accountService.add({ name: 'Ziraat Bank Credit Card', type: 'credit', initialBalance: 0, currency: 'TRY' });
    const oyakAcc = this.accountService.add({ name: 'OYAK Savings Account', type: 'bank', initialBalance: 60000, currency: 'TRY' });

    // Add transactions and link to relevant accounts
    demoTransactions.forEach(t => {
      let accountId = bankAcc.id;
      if (t.paymentMethod === 'Cash') accountId = cashAcc.id;
      else if (t.paymentMethod === 'Credit Card') accountId = creditAcc.id;
      this.txService.add({ ...t, accountId });
    });

    // Add monthly OYAK savings transfers
    this.txService.add({ type: 'transfer' as const, category: 'Transfer', amount: 15000, date: getRelativeDate(3, 16), description: 'Monthly OYAK Investment Contribution', accountId: bankAcc.id, transferAccountId: oyakAcc.id, paymentMethod: 'EFT' });
    this.txService.add({ type: 'transfer' as const, category: 'Transfer', amount: 15000, date: getRelativeDate(2, 16), description: 'Monthly OYAK Investment Contribution', accountId: bankAcc.id, transferAccountId: oyakAcc.id, paymentMethod: 'EFT' });
    this.txService.add({ type: 'transfer' as const, category: 'Transfer', amount: 15000, date: getRelativeDate(1, 16), description: 'Monthly OYAK Investment Contribution', accountId: bankAcc.id, transferAccountId: oyakAcc.id, paymentMethod: 'EFT' });
    this.txService.add({ type: 'transfer' as const, category: 'Transfer', amount: 15000, date: getRelativeDate(0, 16), description: 'Monthly OYAK Investment Contribution', accountId: bankAcc.id, transferAccountId: oyakAcc.id, paymentMethod: 'EFT' });

    // Add credit card statement payments
    this.txService.add({ type: 'transfer' as const, category: 'Transfer', amount: 5450, date: getRelativeDate(3, 30), description: 'Credit Card Debt Payment', accountId: bankAcc.id, transferAccountId: creditAcc.id, paymentMethod: 'EFT' });
    this.txService.add({ type: 'transfer' as const, category: 'Transfer', amount: 8400, date: getRelativeDate(2, 30), description: 'Credit Card Debt Payment', accountId: bankAcc.id, transferAccountId: creditAcc.id, paymentMethod: 'EFT' });
    this.txService.add({ type: 'transfer' as const, category: 'Transfer', amount: 5250, date: getRelativeDate(1, 30), description: 'Credit Card Debt Payment', accountId: bankAcc.id, transferAccountId: creditAcc.id, paymentMethod: 'EFT' });

    demoAssets.forEach(a => this.portfolioService.add(a));
    goals.forEach(g => this.goalService.add(g));

    // Set budget limit to 30,000 TRY
    const current = this.settingsService.settings();
    this.settingsService.save({ ...current, monthlyLimit: 30000 });

    // Historical Net Worth History (Last 5 Months)
    const demoSnapshots = [];
    for (let i = 5; i >= 1; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
      const dateStr = d.toISOString().slice(0, 10);
      const index = 5 - i;
      
      const cashVal = 70000 + index * 20000;
      const portfolioVal = 100000 + index * 22000;
      demoSnapshots.push({
        date: dateStr,
        cash: cashVal,
        portfolio: portfolioVal,
        total: cashVal + portfolioVal
      });
    }
    
    const liveCash = this.accountService.totalBalance();
    const livePortfolio = this.portfolioService.totalValue();
    demoSnapshots.push({
      date: today.toISOString().slice(0, 10),
      cash: liveCash,
      portfolio: livePortfolio,
      total: liveCash + livePortfolio
    });

    this.netWorthHistoryService.snapshots.set(demoSnapshots);
    this.storage.setItemSync('finans_net_worth_history', JSON.stringify(demoSnapshots));
  }
}
