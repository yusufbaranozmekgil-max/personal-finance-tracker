import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BudgetAlertService } from '../../../core/services/budget-alert.service';
import { MoneyPipe } from '../../pipes/money.pipe';

@Component({
  selector: 'app-budget-banner',
  standalone: true,
  imports: [CommonModule, RouterLink, MoneyPipe],
  templateUrl: './budget-banner.component.html',
  styleUrl: './budget-banner.component.scss'
})
export class BudgetBannerComponent {
  budget = inject(BudgetAlertService);
  dismissed = signal(false);

  dismiss(): void {
    this.dismissed.set(true);
  }

  get show(): boolean {
    const s = this.budget.status();
    return !this.dismissed() && (s === 'warning' || s === 'critical' || s === 'over');
  }
}
