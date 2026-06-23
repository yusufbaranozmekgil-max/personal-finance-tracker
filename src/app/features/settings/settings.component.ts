import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { CurrencyRateService } from '../../core/services/currency-rate.service';
import { DataService } from '../../core/services/data.service';
import { AutoResetService } from '../../core/services/auto-reset.service';
import { ConnectionService } from '../../core/services/connection.service';
import { LivePriceService } from '../../core/services/live-price.service';
import { ReportService } from '../../core/services/report.service';
import { ImportService, ImportPreview } from '../../core/services/import.service';
import { ThemeService } from '../../core/services/theme.service';
import { EncryptionService } from '../../core/services/encryption.service';
import { StorageService } from '../../core/services/storage.service';
import { GoogleDriveSyncService } from '../../core/services/google-drive-sync.service';
import { ViewChild, ElementRef, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { BudgetSettings } from '../../core/models/asset.model';
import { MAX_MONEY_AMOUNT } from '../../core/constants/validation.constants';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent {
  settingsService = inject(SettingsService);
  toast = inject(ToastService);
  confirmService = inject(ConfirmService);
  rateService = inject(CurrencyRateService);
  dataService = inject(DataService);
  autoResetService = inject(AutoResetService);
  connection = inject(ConnectionService);
  livePriceService = inject(LivePriceService);
  reportService = inject(ReportService);
  importService = inject(ImportService);

  importPreview: ImportPreview | null = null;
  skipDuplicates = true;
  showImportPreview = false;
  themeService = inject(ThemeService);
  encryption = inject(EncryptionService);
  storage = inject(StorageService);
  router = inject(Router);
  gdriveSync = inject(GoogleDriveSyncService);

  syncPassword = '';
  useVaultPassword = true;
  windowOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  storageUsage: { usage: number; quota: number; usagePercent: number } | null = null;

  async ngOnInit(): Promise<void> {
    this.storageUsage = await this.storage.getUsageEstimate();
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  @ViewChild('importInput') importInput!: ElementRef<HTMLInputElement>;

  vaultPassword = '';
  vaultPasswordConfirm = '';

  showChangePasswordForm = false;
  showDisableVaultForm = false;
  changePwdForm = { oldPassword: '', newPassword: '', newPasswordConfirm: '' };
  disableVaultPassword = '';

  activeTab = 'general';
  expandedCards: Record<string, boolean> = {
    theme: true, // Theme settings expanded on load
  };

  // ====== JSON Backup ======
  exportBackup(): void {
    const { content, filename } = this.dataService.exportJSON();
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.toast.success('Backup file downloaded.');
  }

  triggerImport(): void {
    this.importInput.nativeElement.click();
  }

  // ====== Statement / Transaction Import ======
  @ViewChild('txImportInput') txImportInput!: ElementRef<HTMLInputElement>;

  downloadTemplate(): void {
    this.importService.downloadTemplate();
    this.toast.success('Template Excel downloaded.');
  }

  triggerTxImport(): void {
    this.txImportInput.nativeElement.click();
  }

  async onTxImportFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    try {
      const preview = await this.importService.parseFile(file);
      if (preview.total === 0) {
        this.toast.warning('No readable rows in file.');
        return;
      }
      this.importPreview = preview;
      this.showImportPreview = true;
    } catch (err: any) {
      this.toast.error(`File could not be read: ${err?.message ?? 'Unknown error'}`);
    }
  }

  closeImportPreview(): void {
    this.importPreview = null;
    this.showImportPreview = false;
  }

  async confirmImport(): Promise<void> {
    if (!this.importPreview) return;
    const ok = await this.confirmService.ask({
      title: 'Import Transactions',
      message: `${this.importPreview.valid} transactions will be added` +
        (this.importPreview.newCategories.income.length + this.importPreview.newCategories.expense.length > 0
          ? `, ${this.importPreview.newCategories.income.length + this.importPreview.newCategories.expense.length} new categories`
          : '') +
        (this.importPreview.newAccounts.length > 0
          ? `, ${this.importPreview.newAccounts.length} new accounts`
          : '') + ' will be created. Continue?',
      confirmText: 'Load',
      cancelText: 'Cancel',
      kind: 'info',
    });
    if (!ok) return;
    const added = await this.importService.commit(this.importPreview, this.skipDuplicates);
    this.toast.success(`✓ ${added} transactions imported successfully.`);
    this.closeImportPreview();
  }

  async onImportFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const ok = await this.confirmService.ask({
      title: 'Restore Backup',
      message: `"${file.name}" will be loaded and EXISTING DATA WILL BE OVERWRITTEN. Continue?`,
      confirmText: 'Load',
      cancelText: 'Cancel',
      kind: 'warning',
    });
    input.value = '';  // allow re-selection
    if (!ok) return;

    const text = await file.text();
    const result = this.dataService.importJSON(text);
    if (result.ok) this.toast.success(`✓ ${result.message}`);
    else this.toast.error(`✕ ${result.message}`);
  }

  // ====== Vault (Encryption) ======
  async enableVault(): Promise<void> {
    const strength = this.validatePasswordStrength(this.vaultPassword);
    if (!strength.ok) {
      this.toast.error(strength.message);
      return;
    }
    if (this.vaultPassword !== this.vaultPasswordConfirm) {
      this.toast.error('Passwords do not match.');
      return;
    }
    const ok = await this.confirmService.ask({
      title: 'Activate Vault',
      message: 'All your data will be encrypted. If you forget your password, you will LOSE ACCESS to your data. Continue?',
      confirmText: 'Encrypt',
      cancelText: 'Cancel',
      kind: 'warning',
    });
    if (!ok) return;

    const result = this.encryption.lock(this.vaultPassword);
    if (result.ok) {
      this.toast.success('🔒 ' + result.message);
      this.vaultPassword = '';
      this.vaultPasswordConfirm = '';
      setTimeout(() => location.reload(), 1500);
    } else {
      this.toast.error(result.message);
    }
  }

  lockNow(): void {
    this.encryption.lockSession();
    this.toast.success('🔒 Vault locked.');
    setTimeout(() => location.reload(), 1200);
  }

  toggleChangePasswordForm(): void {
    this.showChangePasswordForm = !this.showChangePasswordForm;
    this.showDisableVaultForm = false;
    this.changePwdForm = { oldPassword: '', newPassword: '', newPasswordConfirm: '' };
  }

  toggleDisableVaultForm(): void {
    this.showDisableVaultForm = !this.showDisableVaultForm;
    this.showChangePasswordForm = false;
    this.disableVaultPassword = '';
  }

  submitChangePassword(): void {
    const { oldPassword, newPassword, newPasswordConfirm } = this.changePwdForm;
    if (!oldPassword.trim() || !newPassword.trim() || !newPasswordConfirm.trim()) {
      this.toast.error('Please fill in all password fields.');
      return;
    }
    const strength = this.validatePasswordStrength(newPassword);
    if (!strength.ok) {
      this.toast.error(strength.message);
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      this.toast.error('New passwords do not match.');
      return;
    }
    const result = this.encryption.changeVaultPassword(oldPassword, newPassword);
    if (result.ok) {
      this.toast.success('🔑 ' + result.message);
      this.showChangePasswordForm = false;
      this.changePwdForm = { oldPassword: '', newPassword: '', newPasswordConfirm: '' };
    } else {
      this.toast.error(result.message);
    }
  }

  validatePasswordStrength(password: string): { ok: boolean; message: string } {
    if (!password) {
      return { ok: false, message: 'Password cannot be empty.' };
    }
    if (password.length < 4) {
      return { ok: false, message: 'Password must be at least 4 characters.' };
    }
    if (password.length > 20) {
      return { ok: false, message: 'Password must be at most 20 characters.' };
    }
    if (!/[A-ZÇĞİÖŞÜ]/.test(password)) {
      return { ok: false, message: 'Password must contain at least one uppercase letter.' };
    }
    if (!/[a-zçğıöşü]/.test(password)) {
      return { ok: false, message: 'Password must contain at least one lowercase letter.' };
    }
    const hasPunctuation = /[.,;:\-_\/\\!?@#$%^&*()_+={}[\]|<>`~'"]/.test(password);
    if (!hasPunctuation) {
      return { ok: false, message: 'Password must contain at least one punctuation or symbol (e.g. .,!@#).' };
    }
    return { ok: true, message: '' };
  }

  setActiveTab(tab: string): void {
    this.activeTab = tab;
    this.showChangePasswordForm = false;
    this.showDisableVaultForm = false;
  }

  toggleCard(cardKey: string): void {
    this.expandedCards[cardKey] = !this.expandedCards[cardKey];
  }

  isCardExpanded(cardKey: string): boolean {
    return !!this.expandedCards[cardKey];
  }

  async submitDisableVault(): Promise<void> {
    const pwd = this.disableVaultPassword.trim();
    if (!pwd) {
      this.toast.error('Please enter your current password.');
      return;
    }
    const ok = await this.confirmService.ask({
      title: 'Disable Security',
      message: 'Your data will be decrypted. Do you want to continue?',
      confirmText: 'Yes, Disable Encryption',
      cancelText: 'Cancel',
      kind: 'warning',
    });
    if (!ok) return;

    const result = this.encryption.removeVault(pwd);
    if (result.ok) {
      this.toast.success('🔓 ' + result.message);
      this.showDisableVaultForm = false;
      this.disableVaultPassword = '';
      setTimeout(() => location.reload(), 1500);
    } else {
      this.toast.error(result.message);
    }
  }

  exportingPdf = false;

  exportCSV(): void {
    this.reportService.exportTransactionsCSV();
  }

  exportExcel(): void {
    this.reportService.exportFullExcel();
  }

  async exportPDF(): Promise<void> {
    // Redirect to Dashboard if not already there
    if (!document.querySelector('.dashboard')) {
      this.toast.info('Redirecting to Dashboard...');
      await this.router.navigate(['/dashboard']);
      await new Promise(r => setTimeout(r, 400));
    }
    this.exportingPdf = true;
    try {
      await this.reportService.exportDashboardPDF();
    } finally {
      this.exportingPdf = false;
    }
  }

  testingApi = false;

  providerInfo: Record<string, { name: string; url: string; quota: string }> = {
    twelvedata:   { name: 'Twelve Data',   url: 'https://twelvedata.com/register',          quota: '800 requests/day' },
    alphavantage: { name: 'Alpha Vantage', url: 'https://www.alphavantage.co/support/#api-key', quota: '25 requests/day' },
    finnhub:      { name: 'Finnhub',       url: 'https://finnhub.io/register',              quota: '60 istek/dk (BIST premium)' },
  };

  async testApiKey(): Promise<void> {
    const key = this.form.stockApiKey?.trim();
    if (!key) {
      this.toast.error('Enter the API key first.');
      return;
    }
    // Save key first (test call reads it from settings)
    this.settingsService.save({ ...this.form });

    this.testingApi = true;
    try {
      const result = await this.livePriceService.testApiKey(this.form.stockApiProvider, key);
      if (result.ok) this.toast.success(`✓ ${result.message}`);
      else this.toast.error(`✕ ${result.message}`);
    } catch (err: any) {
      this.toast.error(`Test failed: ${err?.message ?? 'Unknown error'}`);
    } finally {
      this.testingApi = false;
    }
  }
  maxMoneyAmount = MAX_MONEY_AMOUNT;

  form: BudgetSettings = { ...this.settingsService.settings() };

  async submit(): Promise<void> {
    if (this.form.monthlyLimit < 0 || this.form.usdRate < 0 || this.form.eurRate < 0) {
      this.toast.error('Negative values are not allowed.');
      return;
    }
    if (this.form.monthlyLimit > this.maxMoneyAmount || this.form.usdRate > this.maxMoneyAmount || this.form.eurRate > this.maxMoneyAmount) {
      this.toast.error('Numeric values cannot exceed 1 trillion.');
      return;
    }
    const ok = await this.confirmService.ask({
      title: 'Save Settings',
      message: 'Are you sure you want to save the changes?',
      confirmText: 'Save',
      cancelText: 'Cancel',
      kind: 'info',
    });
    if (!ok) {
      this.toast.info('Save cancelled.');
      return;
    }
    this.settingsService.save({ ...this.form });
    this.toast.success('Settings saved successfully.');
  }

  async reset(): Promise<void> {
    const ok = await this.confirmService.ask({
      title: 'Discard Changes',
      message: 'Your changes will be reverted. Do you want to continue?',
      confirmText: 'Yes, Revert',
      cancelText: 'Cancel',
      kind: 'warning',
    });
    if (ok) {
      this.form = { ...this.settingsService.settings() };
      this.toast.info('Changes reverted.');
    }
  }

  async fetchLiveRates(): Promise<void> {
    if (this.connection.isOffline) {
      const cached = this.rateService.getCached();
      if (cached) {
        this.toast.warning(`You are offline. Using last cached rate (${this.rateService.formatRelativeTime(cached.fetchedAt)}).`);
      } else {
        this.toast.error('You are offline and no live rate has been cached yet. Please enter manually.');
      }
      return;
    }
    try {
      const rates = await this.rateService.fetchRates();
      this.form.usdRate = rates.usd;
      this.form.eurRate = rates.eur;
      this.settingsService.save({ ...this.form });
      this.toast.success(`✓ Rates updated. 1 USD = ${rates.usd} ₺, 1 EUR = ${rates.eur} ₺`);
    } catch (err: any) {
      const cached = this.rateService.getCached();
      if (cached) {
        this.form.usdRate = cached.usd;
        this.form.eurRate = cached.eur;
        this.settingsService.save({ ...this.form });
        this.toast.warning(`API error. Using last cached rate (${this.rateService.formatRelativeTime(cached.fetchedAt)}).`);
      } else {
        const msg = err?.message ?? 'Unknown error';
        this.toast.error(`Could not fetch rate: ${msg}`);
      }
    }
  }

  async resetAllData(): Promise<void> {
    const ok = await this.confirmService.ask({
      title: 'Reset All Data',
      message: 'All transactions, assets, and goals will be permanently deleted. This action cannot be undone! Are you sure?',
      confirmText: 'Yes, Reset',
      cancelText: 'Cancel',
      kind: 'danger',
    });
    if (ok) {
      this.dataService.resetAll();
      this.toast.success('All data deleted.');
    }
  }

  async runManualReset(): Promise<void> {
    const ok = await this.confirmService.ask({
      title: 'Renew Period & Recurring Transactions',
      message: 'A new budget period will be triggered for the selected day. Recurring transactions for this month will be auto-copied. No existing one-time or past records will be DELETED. Continue?',
      confirmText: 'Renew & Transition',
      cancelText: 'Cancel',
      kind: 'info',
    });
    if (!ok) return;
    const result = this.autoResetService.runManual();
    if (result.renewed > 0) {
      this.toast.success(`✓ Period transition complete: ${result.renewed} recurring transactions copied for this month.`);
    } else {
      this.toast.info('Period transition checked: This month\'s recurring transactions are already up-to-date or no recurring entries (rent, bills, etc.) are defined.');
    }
  }

  validateResetDay(event: Event): void {
    const input = event.target as HTMLInputElement;
    let valStr = input.value.replace(/\D/g, '');

    if (valStr.length > 2) {
      valStr = valStr.slice(0, 2);
    }

    if (!valStr) {
      this.form.resetDay = null as any;
      input.value = '';
      return;
    }

    let num = parseInt(valStr, 10);
    if (num < 1) num = 1;
    if (num > 28) num = 28;

    this.form.resetDay = num;
    input.value = num.toString();
  }

  onResetDayBlur(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!this.form.resetDay) {
      this.form.resetDay = 1;
      input.value = '1';
    }
  }

  async loadDemoData(): Promise<void> {
    const ok = await this.confirmService.ask({
      title: 'Load Demo Data',
      message: 'Your existing data will be deleted and a military officer budget simulation will be loaded. Continue?',
      confirmText: 'Load',
      cancelText: 'Cancel',
      kind: 'warning',
    });
    if (ok) {
      this.dataService.loadDemo();
      this.toast.success('Demo data loaded successfully. Redirecting...');
      setTimeout(() => {
        this.router.navigate(['/dashboard']).then(() => {
          setTimeout(() => location.reload(), 100);
        });
      }, 1200);
    }
  }

  get canUseVaultPassword(): boolean {
    return this.storage.hasVault() && this.storage.isVaultUnlocked();
  }

  async connectGDrive(): Promise<void> {
    const clientId = this.form.gdriveClientId?.trim();
    if (!clientId) {
      this.toast.error('You must enter a Client ID and save settings before connecting to Google Drive.');
      return;
    }
    // Save current settings first to persist Client ID
    this.settingsService.save({ ...this.form });
    try {
      this.gdriveSync.connect(clientId);
    } catch (err: any) {
      this.toast.error(err.message || 'Could not start connection.');
    }
  }

  disconnectGDrive(): void {
    this.gdriveSync.disconnect();
    this.toast.info('Google Drive connection closed.');
  }

  async backupToGDrive(): Promise<void> {
    let password = this.syncPassword.trim();
    if (this.useVaultPassword && this.canUseVaultPassword) {
      password = this.encryption.getVaultPassword() || '';
    }

    if (!password || password.length < 4) {
      this.toast.error('Password must be at least 4 characters (for Zero-Knowledge encryption).');
      return;
    }

    try {
      await this.gdriveSync.backup(password);
      this.toast.success('🔒 Data encrypted and successfully backed up to Google Drive.');
      // Refresh form settings to get latest sync date
      this.form = { ...this.settingsService.settings() };
      this.syncPassword = '';
    } catch (err: any) {
      this.toast.error(`Backup failed: ${err.message}`);
    }
  }

  async restoreFromGDrive(): Promise<void> {
    let password = this.syncPassword.trim();
    if (this.useVaultPassword && this.canUseVaultPassword) {
      password = this.encryption.getVaultPassword() || '';
    }

    if (!password) {
      this.toast.error('Password is required to decrypt the cloud backup.');
      return;
    }

    const ok = await this.confirmService.ask({
      title: 'Restore from Cloud',
      message: 'The encrypted cloud backup will be downloaded and overwrite all current data. Continue?',
      confirmText: 'Restore',
      cancelText: 'Cancel',
      kind: 'warning',
    });
    if (!ok) return;

    try {
      const result = await this.gdriveSync.restore(password);
      if (result.ok) {
        this.toast.success(`✓ ${result.message}`);
        // Refresh settings form
        this.form = { ...this.settingsService.settings() };
        this.syncPassword = '';
        // Reload page to reflect restored data
        setTimeout(() => location.reload(), 1500);
      } else {
        this.toast.error(result.message);
      }
    } catch (err: any) {
      this.toast.error(`Restore error: ${err.message}`);
    }
  }
}
