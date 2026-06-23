import { Injectable, inject, effect, computed } from '@angular/core';
import { TransactionService } from './transaction.service';
import { SettingsService } from './settings.service';
import { ToastService } from './toast.service';

@Injectable({ providedIn: 'root' })
export class BudgetAlertService {
  private txService = inject(TransactionService);
  private settingsService = inject(SettingsService);
  private toast = inject(ToastService);

  private lastNotifiedThreshold = -1;

  limit = computed(() => this.settingsService.settings().monthlyLimit);
  used = computed(() => this.txService.currentMonthExpense());
  percent = computed(() => {
    const l = this.limit();
    return l > 0 ? (this.used() / l) * 100 : 0;
  });

  status = computed<'safe' | 'warning' | 'critical' | 'over' | 'none'>(() => {
    if (this.limit() <= 0) return 'none';
    const p = this.percent();
    if (p > 100) return 'over';
    if (p >= 90) return 'critical';
    if (p >= 80) return 'warning';
    return 'safe';
  });

  constructor() {
    effect(() => {
      const status = this.status();
      const percent = Math.floor(this.percent());

      if (status === 'none' || status === 'safe') {
        this.lastNotifiedThreshold = -1;
        return;
      }

      let threshold = 0;
      if (status === 'over') threshold = 100;
      else if (status === 'critical') threshold = 90;
      else if (status === 'warning') threshold = 80;

      if (threshold > this.lastNotifiedThreshold) {
        if (status === 'over') {
          this.toast.error(`🚨 You have exceeded your monthly budget limit! (${percent}%)`);
        } else if (status === 'critical') {
          this.toast.warning(`⚠ You have used ${percent}% of your budget!`);
        } else if (status === 'warning') {
          this.toast.warning(`⚠ You have used 80% of your budget.`);
        }
        this.lastNotifiedThreshold = threshold;
      }
    });
  }
}
