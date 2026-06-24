import { Component, inject, OnInit, ElementRef, ViewChild, effect, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { TransactionService } from '../../core/services/transaction.service';
import { PortfolioService } from '../../core/services/portfolio.service';
import { SettingsService } from '../../core/services/settings.service';
import { AccountService } from '../../core/services/account.service';
import { CategoryService } from '../../core/services/category.service';
import { ForecastService } from '../../core/services/forecast.service';
import { NetWorthHistoryService } from '../../core/services/net-worth-history.service';
import { FormsModule } from '@angular/forms';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { Chart, registerables } from 'chart.js';
import { ToastService } from '../../core/services/toast.service';
import { isValidDate } from '../../core/constants/validation.constants';
import { DateLimitDirective } from '../../shared/directives/date-limit.directive';

import { ThemeService } from '../../core/services/theme.service';

Chart.register(...registerables);

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, MoneyPipe, FormsModule, DateLimitDirective],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  txService = inject(TransactionService);
  portfolioService = inject(PortfolioService);
  settingsService = inject(SettingsService);
  accountService = inject(AccountService);
  categoryService = inject(CategoryService);
  forecastService = inject(ForecastService);
  netWorthHistoryService = inject(NetWorthHistoryService);
  themeService = inject(ThemeService);
  toast = inject(ToastService);
  readonly Math = Math;  // to use in template

  // Template helper getters (@let not available in Angular 17)
  get forecastSavings(): number { return this.forecastService.averageMonthlySavings(); }
  get forecastBudget() { return this.forecastService.forecastMonthlyBudget(); }
  get forecastGoals() { return this.forecastService.forecastAllGoals(); }
  router = inject(Router);

  @ViewChild('donutChart') donutChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('barChart') barChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('portfolioChart') portfolioChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('trendChart') trendChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('monthlyDonutChart') monthlyDonutChartRef!: ElementRef<HTMLCanvasElement>;

  private donutChart?: Chart;
  private barChart?: Chart;
  private portfolioChart?: Chart;
  private trendChart?: Chart;
  private monthlyDonutChart?: Chart;

  activeTab = signal<'finance' | 'portfolio' | 'budget'>('finance');

  // Date Filter
  dashboardPreset = signal<'all' | 'thisMonth' | 'lastMonth' | 'last30' | 'last90' | 'custom'>('all');
  filterDateStart = signal('');
  filterDateEnd = signal('');

  filteredTransactions = computed(() => {
    const start = this.filterDateStart();
    const end = this.filterDateEnd();
    return this.txService.transactions().filter(t => {
      if (start && t.date < start) return false;
      if (end && t.date > end) return false;
      return true;
    });
  });

  get dashboardTotalIncome(): number {
    return this.filteredTransactions()
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
  }

  get dashboardTotalExpense(): number {
    return this.filteredTransactions()
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
  }

  get dashboardBalance(): number {
    return this.dashboardTotalIncome - this.dashboardTotalExpense;
  }

  // Accordion: which sections are open? (Some open by default)
  expandedSections = signal<Set<string>>(new Set(['expenseSummary', 'donutChart', 'accounts', 'portfolioChart', 'monthlyDonutChart']));

  setActiveTab(tab: 'finance' | 'portfolio' | 'budget'): void {
    this.activeTab.set(tab);
    setTimeout(() => this.renderCharts(), 80);
  }

  toggleSection(name: string): void {
    this.expandedSections.update(set => {
      const next = new Set(set);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
    // Short delay for charts to enter the DOM, then re-render
    setTimeout(() => this.renderCharts(), 50);
  }

  isSectionOpen(name: string): boolean {
    return this.expandedSections().has(name);
  }

  get netWorth(): number {
    return this.accountService.totalBalance() + this.portfolioService.totalValue();
  }

  get budgetLimit(): number {
    return this.settingsService.settings().monthlyLimit;
  }

  get budgetUsed(): number {
    return this.txService.currentMonthExpense();
  }

  get budgetPercent(): number {
    if (!this.budgetLimit) return 0;
    return Math.min((this.budgetUsed / this.budgetLimit) * 100, 100);
  }

  get budgetExceeded(): boolean {
    return this.budgetLimit > 0 && this.budgetUsed > this.budgetLimit;
  }

  get budgetRemaining(): number {
    return this.budgetLimit - this.budgetUsed;
  }

  get budgetStatus(): 'safe' | 'warning' | 'over' {
    if (this.budgetExceeded) return 'over';
    if (this.budgetPercent >= 80) return 'warning';
    return 'safe';
  }

  get currentMonthName(): string {
    return new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }

  // 24. Last 5 transactions (filtered)
  get last5Transactions() {
    return [...this.filteredTransactions()]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
  }

  // 25. Top expense category in the selected date range
  get topExpenseCategory(): { category: string; total: number } | null {
    const map = new Map<string, number>();
    this.filteredTransactions()
      .filter(t => t.type === 'expense')
      .forEach(t => map.set(t.category, (map.get(t.category) ?? 0) + t.amount));

    if (map.size === 0) return null;
    let top = { category: '', total: 0 };
    map.forEach((total, category) => {
      if (total > top.total) top = { category, total };
    });
    return top;
  }

  // 26. Daily average spending this month
  get dailyAverageExpense(): number {
    const now = new Date();
    const dayOfMonth = now.getDate();
    if (dayOfMonth === 0) return 0;
    return this.budgetUsed / dayOfMonth;
  }

  get projectedMonthlyExpense(): number {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return this.dailyAverageExpense * daysInMonth;
  }

  // 27. Highest amount transactions (filtered)
  get highestExpense() {
    const expenses = this.filteredTransactions().filter(t => t.type === 'expense');
    if (expenses.length === 0) return null;
    return expenses.reduce((max, t) => t.amount > max.amount ? t : max);
  }

  get highestIncome() {
    const incomes = this.filteredTransactions().filter(t => t.type === 'income');
    if (incomes.length === 0) return null;
    return incomes.reduce((max, t) => t.amount > max.amount ? t : max);
  }

  // Portfolio type distribution
  get portfolioByType(): { type: string; total: number }[] {
    const map = new Map<string, number>();
    this.portfolioService.assets().forEach(a => {
      const value = this.portfolioService.currentValueTRY(a);
      map.set(a.type, (map.get(a.type) ?? 0) + value);
    });
    return Array.from(map.entries())
      .map(([type, total]) => ({ type, total }))
      .sort((a, b) => b.total - a.total);
  }

  readonly portfolioColors = ['#f59e0b', '#3b82f6', '#22c55e', '#a855f7', '#ec4899', '#06b6d4'];

  get portfolioByTypeWithPercent(): { type: string; total: number; percent: number }[] {
    const data = this.portfolioByType;
    const total = this.portfolioService.totalValue() || 1;
    return data.map(d => ({
      ...d,
      percent: (d.total / total) * 100
    }));
  }

  goToCategoryTransactions(category: string): void {
    this.router.navigate(['/transactions'], {
      queryParams: { type: 'expense', category }
    });
  }

  goToPortfolioType(type: string): void {
    this.router.navigate(['/portfolio'], { queryParams: { type } });
  }

  goToAccountTransactions(accountId: string): void {
    this.router.navigate(['/transactions'], { queryParams: { accountId } });
  }


  // Last 6 months net worth trend
  get netWorthTrend(): { labels: string[]; months: string[]; data: number[] } {
    return this.netWorthHistoryService.getMonthlyTrend(6);
  }

  get categoryExpenses(): { category: string; total: number }[] {
    const map = new Map<string, number>();
    this.filteredTransactions()
      .filter(t => t.type === 'expense')
      .forEach(t => map.set(t.category, (map.get(t.category) ?? 0) + t.amount));
    return Array.from(map.entries())
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  }

  get categoryExpensesWithPercent(): { category: string; total: number; percent: number; share: number }[] {
    const list = this.categoryExpenses;
    const max = list[0]?.total ?? 1;
    const grandTotal = list.reduce((s, c) => s + c.total, 0) || 1;
    return list.map(c => ({
      ...c,
      percent: (c.total / max) * 100,
      share: (c.total / grandTotal) * 100,
    })) as any;
  }

  get totalCategoryExpense(): number {
    return this.categoryExpenses.reduce((sum, c) => sum + c.total, 0);
  }

  get currentMonthCategoryExpenses(): { category: string; total: number }[] {
    const now = new Date();
    const map = new Map<string, number>();
    this.txService.transactions()
      .filter(t => {
        const d = new Date(t.date);
        return t.type === 'expense'
          && d.getMonth() === now.getMonth()
          && d.getFullYear() === now.getFullYear();
      })
      .forEach(t => map.set(t.category, (map.get(t.category) ?? 0) + t.amount));
    return Array.from(map.entries())
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  }

  get currentMonthCategoryExpensesWithPercent(): { category: string; total: number; percent: number; share: number }[] {
    const list = this.currentMonthCategoryExpenses;
    const max = list[0]?.total ?? 1;
    const grandTotal = list.reduce((s, c) => s + c.total, 0) || 1;
    return list.map(c => ({
      ...c,
      percent: (c.total / max) * 100,
      share: (c.total / grandTotal) * 100,
    })) as any;
  }

  get totalCurrentMonthCategoryExpense(): number {
    return this.currentMonthCategoryExpenses.reduce((sum, c) => sum + c.total, 0);
  }

  get last6MonthsData(): { labels: string[]; months: string[]; income: number[]; expense: number[] } {
    const labels: string[] = [];
    const months: string[] = [];
    const income: number[] = [];
    const expense: number[] = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(d.toLocaleString('en-US', { month: 'short' }));
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      const txs = this.txService.transactions().filter(t => {
        const td = new Date(t.date);
        return td.getMonth() === d.getMonth() && td.getFullYear() === d.getFullYear();
      });
      income.push(txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0));
      expense.push(txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0));
    }
    return { labels, months, income, expense };
  }

  // Start and end dates for a month (YYYY-MM → 2026-06-01 / 2026-06-30)
  private monthRange(monthKey: string): { start: string; end: string } {
    const [y, m] = monthKey.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const last = new Date(y, m, 0);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    return { start: iso(first), end: iso(last) };
  }

  applyPreset(preset: 'all' | 'thisMonth' | 'lastMonth' | 'last30' | 'last90' | 'custom'): void {
    this.dashboardPreset.set(preset);
    const today = new Date();
    const toISO = (d: Date) => d.toISOString().slice(0, 10);

    if (preset === 'all') {
      this.filterDateStart.set('');
      this.filterDateEnd.set('');
    } else if (preset === 'thisMonth') {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      this.filterDateStart.set(toISO(first));
      this.filterDateEnd.set(toISO(last));
    } else if (preset === 'lastMonth') {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      this.filterDateStart.set(toISO(first));
      this.filterDateEnd.set(toISO(last));
    } else if (preset === 'last30') {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      this.filterDateStart.set(toISO(start));
      this.filterDateEnd.set(toISO(today));
    } else if (preset === 'last90') {
      const start = new Date(today);
      start.setDate(start.getDate() - 89);
      this.filterDateStart.set(toISO(start));
      this.filterDateEnd.set(toISO(today));
    }
  }

  onDateStartChange(val: string, el?: HTMLInputElement): void {
    this.dashboardPreset.set('custom');
    if (el && el.validity.badInput) {
      this.toast.error('Please enter a valid date. The entered date does not exist in the calendar.');
      return;
    }
    if (val && !isValidDate(val)) {
      this.toast.error('Please enter a valid date (year 1000-9999).');
      return;
    }
    this.filterDateStart.set(val);
  }

  onDateEndChange(val: string, el?: HTMLInputElement): void {
    this.dashboardPreset.set('custom');
    if (el && el.validity.badInput) {
      this.toast.error('Please enter a valid date. The entered date does not exist in the calendar.');
      return;
    }
    if (val && !isValidDate(val)) {
      this.toast.error('Please enter a valid date (year 1000-9999).');
      return;
    }
    this.filterDateEnd.set(val);
  }

  ngOnInit(): void {
    effect(() => {
      this.filteredTransactions();
      this.txService.transactions();
      this.portfolioService.assets();
      this.settingsService.settings();
      this.categoryService.categories();
      this.netWorthHistoryService.snapshots();
      this.themeService.theme();
      setTimeout(() => this.renderCharts(), 0);
    });
  }

  ngAfterViewInit(): void {
    this.renderCharts();
  }

  private renderCharts(): void {
    this.renderDonut();
    this.renderBar();
    this.renderPortfolio();
    this.renderTrend();
    this.renderMonthlyDonut();
  }

  private renderMonthlyDonut(): void {
    if (!this.monthlyDonutChartRef) return;
    this.monthlyDonutChart?.destroy();
    const cats = this.currentMonthCategoryExpenses.slice(0, 6);
    if (!cats.length) return;
    this.monthlyDonutChart = new Chart(this.monthlyDonutChartRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels: cats.map(c => `${this.categoryService.iconOf(c.category, 'expense')} ${c.category}`),
        datasets: [{
          data: cats.map(c => this.convertFromTRY(c.total)),
          backgroundColor: cats.map(c => this.categoryService.colorOf(c.category, 'expense')),
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { afterLabel: () => '👆 Click for details' } }
        },
        cutout: '65%',
        onHover: (event, els) => {
          (event.native?.target as HTMLElement).style.cursor = els.length ? 'pointer' : 'default';
        },
        onClick: (_evt, els) => {
          if (!els.length) return;
          const category = cats[els[0].index].category;
          this.router.navigate(['/transactions'], {
            queryParams: { type: 'expense', category }
          });
        }
      }
    });
  }

  private renderDonut(): void {
    if (!this.donutChartRef) return;
    this.donutChart?.destroy();
    const cats = this.categoryExpenses.slice(0, 6);
    if (!cats.length) return;
    this.donutChart = new Chart(this.donutChartRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels: cats.map(c => `${this.categoryService.iconOf(c.category, 'expense')} ${c.category}`),
        datasets: [{
          data: cats.map(c => this.convertFromTRY(c.total)),
          backgroundColor: cats.map(c => this.categoryService.colorOf(c.category, 'expense')),
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { afterLabel: () => '👆 Click for details' } }
        },
        cutout: '65%',
        onHover: (event, els) => {
          (event.native?.target as HTMLElement).style.cursor = els.length ? 'pointer' : 'default';
        },
        onClick: (_evt, els) => {
          if (!els.length) return;
          const category = cats[els[0].index].category;
          this.router.navigate(['/transactions'], {
            queryParams: { type: 'expense', category }
          });
        }
      }
    });
  }

  private renderBar(): void {
    if (!this.barChartRef) return;
    this.barChart?.destroy();
    const { labels, income, expense, months } = this.last6MonthsData;
    const convertedIncome = income.map(value => this.convertFromTRY(value));
    const convertedExpense = expense.map(value => this.convertFromTRY(value));
    const themeColors = this.getThemeColors();
    this.barChart = new Chart(this.barChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Income', data: convertedIncome, backgroundColor: '#22c55e', borderRadius: 4 },
          { label: 'Expense', data: convertedExpense, backgroundColor: '#ef4444', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: themeColors.text } },
          tooltip: { callbacks: { afterLabel: () => '👆 Click for details' } }
        },
        scales: {
          x: { ticks: { color: themeColors.muted }, grid: { color: themeColors.grid } },
          y: {
            ticks: {
              color: themeColors.muted,
              callback: value => this.formatChartMoney(Number(value)),
            },
            grid: { color: themeColors.grid }
          }
        },
        onHover: (event, els) => {
          (event.native?.target as HTMLElement).style.cursor = els.length ? 'pointer' : 'default';
        },
        onClick: (_evt, els) => {
          if (!els.length) return;
          const idx = els[0].index;
          const datasetIdx = els[0].datasetIndex;
          const monthKey = months[idx];
          const type = datasetIdx === 0 ? 'income' : 'expense';
          const { start, end } = this.monthRange(monthKey);
          this.router.navigate(['/transactions'], {
            queryParams: { type, startDate: start, endDate: end }
          });
        }
      }
    });
  }

  private renderPortfolio(): void {
    if (!this.portfolioChartRef) return;
    this.portfolioChart?.destroy();
    const data = this.portfolioByType;
    if (!data.length) return;
    const colors = ['#f59e0b', '#3b82f6', '#22c55e', '#a855f7', '#ec4899', '#06b6d4'];
    this.portfolioChart = new Chart(this.portfolioChartRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels: data.map(d => d.type),
        datasets: [{
          data: data.map(d => this.convertFromTRY(d.total)),
          backgroundColor: colors.slice(0, data.length),
          borderWidth: 0,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { afterLabel: () => '👆 Click for details' } }
        },
        cutout: '65%',
        onHover: (event, els) => {
          (event.native?.target as HTMLElement).style.cursor = els.length ? 'pointer' : 'default';
        },
        onClick: (_evt, els) => {
          if (!els.length) return;
          const type = data[els[0].index].type;
          this.router.navigate(['/portfolio'], { queryParams: { type } });
        }
      }
    });
  }

  private renderTrend(): void {
    if (!this.trendChartRef) return;
    this.trendChart?.destroy();
    const { labels, months, data } = this.netWorthTrend;
    const convertedData = data.map(value => this.convertFromTRY(value));
    const themeColors = this.getThemeColors();
    this.trendChart = new Chart(this.trendChartRef.nativeElement, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Net Worth',
          data: convertedData,
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139, 92, 246, 0.15)',
          fill: true,
          tension: 0.35,
          pointRadius: 5,
          pointHoverRadius: 8,
          pointBackgroundColor: '#8b5cf6',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: themeColors.text } },
          tooltip: { callbacks: { afterLabel: () => '👆 View transactions for this month' } }
        },
        scales: {
          x: { ticks: { color: themeColors.muted }, grid: { color: themeColors.grid } },
          y: {
            ticks: {
              color: themeColors.muted,
              callback: value => this.formatChartMoney(Number(value)),
            },
            grid: { color: themeColors.grid }
          },
        },
        onHover: (event, els) => {
          (event.native?.target as HTMLElement).style.cursor = els.length ? 'pointer' : 'default';
        },
        onClick: (_evt, els) => {
          if (!els.length) return;
          const monthKey = months[els[0].index];
          const { start, end } = this.monthRange(monthKey);
          this.router.navigate(['/transactions'], {
            queryParams: { startDate: start, endDate: end }
          });
        }
      }
    });
  }

  private getThemeColors() {
    const isDark = this.themeService.theme() === 'dark';
    return {
      text: isDark ? '#f1f5f9' : '#0f172a',
      muted: isDark ? '#94a3b8' : '#64748b',
      border: isDark ? '#334155' : '#e2e8f0',
      grid: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
    };
  }

  private convertFromTRY(amountInTRY: number): number {
    const settings = this.settingsService.settings();
    if (settings.currency === 'USD' && settings.usdRate > 0) {
      return amountInTRY / settings.usdRate;
    }
    if (settings.currency === 'EUR' && settings.eurRate > 0) {
      return amountInTRY / settings.eurRate;
    }
    return amountInTRY;
  }

  private formatChartMoney(amount: number): string {
    const settings = this.settingsService.settings();
    const symbol = settings.currency === 'USD'
      ? '$'
      : settings.currency === 'EUR'
        ? '€'
        : '₺';

    const formatted = amount.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });

    return `${formatted} ${symbol}`;
  }
}
