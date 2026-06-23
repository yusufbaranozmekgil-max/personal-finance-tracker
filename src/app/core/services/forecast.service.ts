import { Injectable, inject } from '@angular/core';
import { TransactionService } from './transaction.service';
import { GoalService } from './goal.service';
import { SettingsService } from './settings.service';
import { Goal } from '../models/goal.model';

export interface GoalForecast {
  goal: Goal;
  reachable: boolean;
  estimatedDate: string | null;     // YYYY-MM-DD
  daysToReach: number;              // from today to estimated reach date
  deadlineDays: number;             // from today to deadline
  diffDays: number;                 // deadlineDays - daysToReach (+ = early, - = late)
  remaining: number;                // target - current savings
  requiredMonthly: number;          // monthly savings required to reach goal on time
  status: 'on-track' | 'early' | 'late' | 'unreachable' | 'completed';
  message: string;
}

export interface BudgetForecast {
  hasLimit: boolean;
  daysElapsed: number;              // days elapsed this month
  daysInMonth: number;
  daysRemaining: number;
  dailyAverage: number;             // daily average for this month
  projectedEndOfMonth: number;      // end-of-month projection
  limit: number;
  overrun: number;                  // positive = exceeded, negative = remaining
  status: 'safe' | 'warning' | 'over' | 'none';
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ForecastService {
  private txService = inject(TransactionService);
  private goalService = inject(GoalService);
  private settingsService = inject(SettingsService);

  /** Average monthly net savings over the last 3 months (TRY/month) */
  averageMonthlySavings(months = 3): number {
    const now = new Date();
    let totalNet = 0;
    let countedMonths = 0;

    for (let i = 1; i <= months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const txs = this.txService.transactions().filter(t => t.date.startsWith(monthKey));
      if (txs.length === 0) continue;
      const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      totalNet += (income - expense);
      countedMonths++;
    }

    return countedMonths > 0 ? totalNet / countedMonths : 0;
  }

  /** Forecast for a single goal */
  forecastGoal(goal: Goal): GoalForecast {
    const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
    const deadlineDate = new Date(goal.deadline);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadlineDays = Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // Completed
    if (remaining === 0) {
      return {
        goal,
        reachable: true,
        estimatedDate: today.toISOString().slice(0, 10),
        daysToReach: 0,
        deadlineDays,
        diffDays: deadlineDays,
        remaining: 0,
        requiredMonthly: 0,
        status: 'completed',
        message: '✓ Congratulations! This goal has been completed.',
      };
    }

    const monthlySavings = this.averageMonthlySavings();
    const dailySavings = monthlySavings / 30;

    // Cannot save at all
    if (dailySavings <= 0) {
      const requiredMonthly = deadlineDays > 0 ? (remaining / deadlineDays) * 30 : remaining;
      return {
        goal,
        reachable: false,
        estimatedDate: null,
        daysToReach: Infinity,
        deadlineDays,
        diffDays: -Infinity,
        remaining,
        requiredMonthly,
        status: 'unreachable',
        message: `⚠ No net savings in the last 3 months. To reach this goal, you need to save ${this.formatCurrency(requiredMonthly)} monthly.`,
      };
    }

    const daysToReach = Math.ceil(remaining / dailySavings);
    const estimated = new Date(today);
    estimated.setDate(estimated.getDate() + daysToReach);
    const diffDays = deadlineDays - daysToReach;

    let status: GoalForecast['status'];
    let message: string;
    const requiredMonthly = deadlineDays > 0 ? (remaining / deadlineDays) * 30 : remaining;

    if (diffDays > 30) {
      status = 'early';
      message = `🚀 With your current savings rate, you will reach it ${diffDays} days before the planned date.`;
    } else if (diffDays >= 0) {
      status = 'on-track';
      message = `✓ You will reach the goal ${diffDays === 0 ? 'on time' : `${diffDays} days early`}.`;
    } else if (deadlineDays > 0) {
      const boost = ((requiredMonthly - monthlySavings) / monthlySavings) * 100;
      status = 'late';
      message = `⚠ You will reach it ${Math.abs(diffDays)} days late. To catch up, you need to increase your savings rate by ${Math.round(boost)}%.`;
    } else {
      status = 'late';
      message = `⚠ The deadline has passed; ${Math.abs(diffDays)} extra days are required.`;
    }

    return {
      goal,
      reachable: true,
      estimatedDate: estimated.toISOString().slice(0, 10),
      daysToReach,
      deadlineDays,
      diffDays,
      remaining,
      requiredMonthly,
      status,
      message,
    };
  }

  /** Forecasts for all goals (most critical first) */
  forecastAllGoals(): GoalForecast[] {
    return this.goalService.goals()
      .map(g => this.forecastGoal(g))
      .sort((a, b) => {
        // Push completed ones to the end
        if (a.status === 'completed' && b.status !== 'completed') return 1;
        if (b.status === 'completed' && a.status !== 'completed') return -1;
        // Most delayed ones first
        return a.diffDays - b.diffDays;
      });
  }

  /** Budget forecast for this month */
  forecastMonthlyBudget(): BudgetForecast {
    const settings = this.settingsService.settings();
    const limit = settings.monthlyLimit;
    const now = new Date();
    const daysElapsed = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysRemaining = daysInMonth - daysElapsed;
    const monthExpense = this.txService.currentMonthExpense();
    const dailyAverage = daysElapsed > 0 ? monthExpense / daysElapsed : 0;
    const projectedEndOfMonth = dailyAverage * daysInMonth;

    if (!limit || limit <= 0) {
      return {
        hasLimit: false,
        daysElapsed, daysInMonth, daysRemaining,
        dailyAverage, projectedEndOfMonth,
        limit: 0, overrun: 0,
        status: 'none',
        message: 'Budget limit is not defined. Set a limit in Settings to enable projections.',
      };
    }

    const overrun = projectedEndOfMonth - limit;
    let status: BudgetForecast['status'];
    let message: string;

    if (overrun > 0) {
      status = 'over';
      message = `⚠ At your current spending rate, the limit will be exceeded by ${this.formatCurrency(overrun)}. To stay within budget, daily spending should be capped at ${this.formatCurrency((limit - monthExpense) / Math.max(daysRemaining, 1))}.`;
    } else if (overrun > -limit * 0.1) {
      status = 'warning';
      message = `⚡ Approaching the limit. Projected: ${this.formatCurrency(projectedEndOfMonth)} of ${this.formatCurrency(limit)}.`;
    } else {
      status = 'safe';
      message = `✓ Budget under control. Projected ${this.formatCurrency(projectedEndOfMonth)}, ${this.formatCurrency(-overrun)} below the limit.`;
    }

    return {
      hasLimit: true,
      daysElapsed, daysInMonth, daysRemaining,
      dailyAverage, projectedEndOfMonth,
      limit, overrun, status, message,
    };
  }

  private formatCurrency(n: number): string {
    const s = this.settingsService.settings();
    const currency = s.currency || 'TRY';
    const symbol = currency === 'TRY' ? '₺' : (currency === 'USD' ? '$' : (currency === 'EUR' ? '€' : currency));
    const formatted = Math.round(n).toLocaleString('en-US');
    return `${symbol}${formatted}`;
  }
}
