import { Injectable, inject, signal } from '@angular/core';
import { TransactionService } from './transaction.service';
import { PortfolioService } from './portfolio.service';
import { GoalService } from './goal.service';
import { CategoryService } from './category.service';
import { StorageService } from './storage.service';
import { AccountService } from './account.service';
import { SettingsService } from './settings.service';

@Injectable({ providedIn: 'root' })
export class EncryptionService {
  private txService = inject(TransactionService);
  private portfolioService = inject(PortfolioService);
  private goalService = inject(GoalService);
  private categoryService = inject(CategoryService);
  private accountService = inject(AccountService);
  private settingsService = inject(SettingsService);
  private storage = inject(StorageService);

  locked = signal<boolean>(this.hasVault() && !this.storage.isVaultUnlocked());

  hasVault(): boolean {
    return this.storage.hasVault();
  }

  getVaultPassword(): string | null {
    return this.storage.getVaultPassword();
  }

  lock(password: string): { ok: boolean; message: string } {
    const result = this.storage.createVault(password);
    if (result.ok) {
      this.clearServiceState();
      this.locked.set(true);
    }
    return result;
  }

  unlock(password: string): { ok: boolean; message: string } {
    const result = this.storage.unlockVault(password);
    if (result.ok) {
      this.reloadServices();
      this.locked.set(false);
    }
    return result;
  }

  removeVault(password: string): { ok: boolean; message: string } {
    const result = this.storage.disableVault(password);
    if (result.ok) {
      this.reloadServices();
      this.locked.set(false);
    }
    return result;
  }

  changeVaultPassword(oldPassword: string, newPassword: string): { ok: boolean; message: string } {
    return this.storage.changePassword(oldPassword, newPassword);
  }

  destroyVault(): void {
    this.storage.destroyVault();
    this.clearServiceState();
    this.locked.set(false);
  }

  lockSession(): void {
    if (!this.hasVault()) return;
    this.storage.lockVaultSession();
    this.clearServiceState();
    this.locked.set(true);
  }

  private clearServiceState(): void {
    this.txService.transactions.set([]);
    this.portfolioService.assets.set([]);
    this.goalService.goals.set([]);
    this.categoryService.categories.set({ income: [], expense: [], assetTypes: [] });
    this.accountService.accounts.set([]);
    this.settingsService.settings.set({
      monthlyLimit: 0,
      currency: 'TRY',
      usdRate: 32,
      eurRate: 35,
      resetDay: 1,
      lastResetMonth: '',
      stockApiProvider: 'twelvedata',
      stockApiKey: '',
    });
  }

  private reloadServices(): void {
    const tx = JSON.parse(this.storage.getItemSync('finans_transactions') ?? '[]');
    const assets = JSON.parse(this.storage.getItemSync('finans_assets') ?? '[]');
    const goals = JSON.parse(this.storage.getItemSync('finans_goals') ?? '[]');
    const accounts = JSON.parse(this.storage.getItemSync('finans_accounts') ?? '[]');
    const settings = JSON.parse(this.storage.getItemSync('finans_settings') ?? 'null');
    this.txService.transactions.set(tx);
    this.portfolioService.assets.set(assets);
    this.goalService.goals.set(goals);
    this.accountService.accounts.set(accounts);
    if (settings) this.settingsService.settings.set(settings);

    try {
      const cats = JSON.parse(this.storage.getItemSync('finans_categories') ?? 'null');
      if (cats) this.categoryService.categories.set(cats);
    } catch {}
  }
}
