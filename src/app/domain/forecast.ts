import { Book, Goal, IsoDate } from './model';
import { addMonths, daysInMonth, monthOf } from './money';
import { monthSummary } from './ledger';

const DAY = 86_400_000;

function daysBetween(from: IsoDate, to: IsoDate): number {
  const [a, b] = [from, to].map(s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); });
  return Math.round((b - a) / DAY);
}

/**
 * Average net savings per month over the last `months` complete months,
 * counting only months that have entries, so a new user is not averaged with zeros.
 */
export function averageMonthlySavings(book: Book, today: IsoDate, months = 3): number | null {
  let total = 0;
  let counted = 0;
  for (let i = 1; i <= months; i++) {
    const m = addMonths(monthOf(today), -i);
    if (!book.entries.some(e => e.kind !== 'transfer' && monthOf(e.date) === m)) continue;
    total += monthSummary(book, m).net;
    counted++;
  }
  return counted ? total / counted : null;
}

export type GoalStatus = 'done' | 'ahead' | 'on-track' | 'behind' | 'no-savings' | 'no-deadline' | 'unknown';

export interface GoalForecast {
  status: GoalStatus;
  remaining: number;
  /** Estimated date the goal is reached at the current savings pace. */
  reachBy: IsoDate | null;
  /** Per month needed from today to make the deadline. */
  neededPerMonth: number | null;
  /** Deadline minus estimate, in days (+ means early). */
  slackDays: number | null;
}

export function forecastGoal(goal: Goal, monthlySavings: number | null, today: IsoDate): GoalForecast {
  const remaining = Math.max(0, goal.target - goal.saved);
  if (remaining === 0) return { status: 'done', remaining, reachBy: null, neededPerMonth: null, slackDays: null };
  const daysLeft = goal.deadline ? daysBetween(today, goal.deadline) : null;
  const neededPerMonth = daysLeft !== null ? (daysLeft > 0 ? remaining / (daysLeft / 30.44) : remaining) : null;
  if (monthlySavings === null) return { status: 'unknown', remaining, reachBy: null, neededPerMonth, slackDays: null };
  if (monthlySavings <= 0) return { status: 'no-savings', remaining, reachBy: null, neededPerMonth, slackDays: null };
  const daysToReach = Math.ceil((remaining / monthlySavings) * 30.44);
  const [y, m, d] = today.split('-').map(Number);
  const reach = new Date(y, m - 1, d + daysToReach);
  const reachBy = `${reach.getFullYear()}-${String(reach.getMonth() + 1).padStart(2, '0')}-${String(reach.getDate()).padStart(2, '0')}`;
  if (daysLeft === null) return { status: 'no-deadline', remaining, reachBy, neededPerMonth, slackDays: null };
  const slackDays = daysLeft - daysToReach;
  const status: GoalStatus = slackDays > 30 ? 'ahead' : slackDays >= 0 ? 'on-track' : 'behind';
  return { status, remaining, reachBy, neededPerMonth, slackDays };
}

export interface BudgetForecast {
  limit: number;
  spent: number;
  /** Straight-line projection of this month's spending to month end. */
  projected: number;
  /** What can still be spent per remaining day to stay within the limit. */
  perDayLeft: number;
  status: 'none' | 'fine' | 'close' | 'over-pace' | 'over';
}

export function forecastBudget(book: Book, today: IsoDate): BudgetForecast {
  const month = monthOf(today);
  const spent = monthSummary(book, month).expense;
  const day = Number(today.slice(8, 10));
  const total = daysInMonth(month);
  const projected = (spent / day) * total;
  const limit = book.budget;
  const perDayLeft = Math.max(0, (limit - spent) / Math.max(1, total - day + 1));
  let status: BudgetForecast['status'] = 'none';
  if (limit > 0) {
    if (spent > limit) status = 'over';
    else if (projected > limit) status = 'over-pace';
    else if (projected > limit * 0.9) status = 'close';
    else status = 'fine';
  }
  return { limit, spent, projected, perDayLeft, status };
}
