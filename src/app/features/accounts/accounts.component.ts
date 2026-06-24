import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccountService } from '../../core/services/account.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { ThousandSeparatorDirective } from '../../shared/directives/thousand-separator.directive';
import { Account, ACCOUNT_TYPES, ACCOUNT_PRESETS, AccountType } from '../../core/models/account.model';
import { SettingsService } from '../../core/services/settings.service';
import { maxMoneyInTRY } from '../../core/constants/validation.constants';

@Component({
  selector: 'app-accounts',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyPipe, RouterLink, ThousandSeparatorDirective],
  templateUrl: './accounts.component.html',
  styleUrl: './accounts.component.scss'
})
export class AccountsComponent {
  accountService = inject(AccountService);
  toast = inject(ToastService);
  confirmService = inject(ConfirmService);
  settingsService = inject(SettingsService);

  get maxMoneyAmount(): number {
    return maxMoneyInTRY(this.settingsService?.settings()?.usdRate ?? 32);
  }

  accountTypes = ACCOUNT_TYPES;
  presets = ACCOUNT_PRESETS;
  readonly maxAccountCount = 10;

  showForm = signal(false);
  editingId = signal<string | null>(null);
  form = this.emptyForm();

  private emptyForm(): Omit<Account, 'id' | 'createdAt'> {
    return {
      name: '',
      type: 'bank',
      initialBalance: 0,
      currency: 'TRY',
    };
  }

  applyPreset(p: typeof ACCOUNT_PRESETS[number]): void {
    this.form.name = p.name;
    this.form.type = p.type;
  }

  toggleForm(): void {
    if (this.showForm()) {
      this.cancel();
    } else {
      this.editingId.set(null);
      this.form = this.emptyForm();
      this.showForm.set(true);
    }
  }

  startEdit(account: Account): void {
    this.editingId.set(account.id);
    this.form = {
      name: account.name,
      type: account.type,
      initialBalance: account.initialBalance,
      currency: account.currency,
    };
    this.showForm.set(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async submit(): Promise<void> {
    const name = this.form.name.trim();
    if (!name) {
      this.toast.error('Account name cannot be empty.');
      return;
    }
    if (name.length > 30) {
      this.toast.error('Account name can be at most 30 characters.');
      return;
    }
    const isEdit = this.editingId() !== null;
    if (!isEdit && this.accountService.accounts().length >= this.maxAccountCount) {
      this.toast.error(`You can add up to ${this.maxAccountCount} accounts.`);
      return;
    }
    const balance = Number(this.form.initialBalance) || 0;
    if (Math.abs(balance) > this.maxMoneyAmount) {
      const usdRate = this.settingsService.settings().usdRate || 32;
      this.toast.error(`Opening balance cannot exceed 1 trillion USD (≈ ${this.maxMoneyAmount.toLocaleString('de-DE')} ₺ at rate 1 USD = ${usdRate} ₺).`);
      return;
    }

    const id = this.editingId();
    if (id) {
      this.accountService.update(id, { ...this.form, name });
      this.toast.success(`"${name}" updated.`);
    } else {
      this.accountService.add({ ...this.form, name });
      this.toast.success(`"${name}" account added.`);
    }
    this.resetForm();
  }

  async cancel(): Promise<void> {
    const hasData = this.form.name || this.form.initialBalance;
    if (hasData) {
      const ok = await this.confirmService.ask({
        title: 'Cancel?',
        message: 'The information you entered will be discarded. Continue?',
        confirmText: 'Yes, Cancel',
        cancelText: 'Go Back',
        kind: 'warning',
      });
      if (!ok) return;
    }
    this.resetForm();
    this.toast.info('Operation cancelled.');
  }

  private resetForm(): void {
    this.form = this.emptyForm();
    this.editingId.set(null);
    this.showForm.set(false);
  }

  async remove(account: Account): Promise<void> {
    const txCount = this.accountService.transactionCountOf(account.id);
    const remaining = this.accountService.accounts().length;
    if (remaining <= 1) {
      this.toast.warning('At least 1 account must remain. You cannot delete this account.');
      return;
    }
    const msg = txCount > 0
      ? `"${account.name}" account will be deleted. ${txCount} linked transaction(s) will be moved to another account. Continue?`
      : `"${account.name}" account will be deleted. Are you sure?`;
    const ok = await this.confirmService.ask({
      title: 'Delete Account',
      message: msg,
      confirmText: 'Delete',
      cancelText: 'Go Back',
      kind: 'danger',
    });
    if (ok) {
      this.accountService.remove(account.id);
      this.toast.success('Account deleted.');
    }
  }

  iconFor(type: AccountType): string {
    return this.accountService.iconFor(type);
  }

  labelFor(type: AccountType): string {
    return this.accountService.labelFor(type);
  }
}
