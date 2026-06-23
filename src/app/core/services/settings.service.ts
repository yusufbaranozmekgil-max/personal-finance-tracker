import { Injectable, inject, signal } from '@angular/core';
import { BudgetSettings } from '../models/asset.model';
import { StorageService } from './storage.service';

const DEFAULTS: BudgetSettings = {
  monthlyLimit: 0,
  currency: 'TRY',
  usdRate: 32,
  eurRate: 35,
  resetDay: 1,
  lastResetMonth: '',
  stockApiProvider: 'twelvedata',
  stockApiKey: '',
  gdriveClientId: '',
  gdriveFileId: '',
  gdriveLastSync: '',
};

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly STORAGE_KEY = 'finans_settings';
  private storage = inject(StorageService);

  settings = signal<BudgetSettings>(this.load());

  save(s: BudgetSettings): void {
    this.settings.set(s);
    this.storage.setItemSync(this.STORAGE_KEY, JSON.stringify(s));
  }

  private load(): BudgetSettings {
    try {
      return { ...DEFAULTS, ...JSON.parse(this.storage.getItemSync(this.STORAGE_KEY) ?? '{}') };
    } catch {
      return DEFAULTS;
    }
  }
}
