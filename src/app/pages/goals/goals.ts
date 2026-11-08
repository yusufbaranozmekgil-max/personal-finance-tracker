import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { BookStore } from '../../data/book-store';
import { Goal, newId } from '../../domain/model';
import { formatDate, formatMoney, isValidIsoDate, parseAmount, todayIso } from '../../domain/money';
import { GoalForecast, averageMonthlySavings, forecastGoal } from '../../domain/forecast';
import { MoneyPipe } from '../../ui/money.pipe';
import { Icon } from '../../ui/icon';
import { Notices } from '../../ui/notice';

interface GoalDraft { id: string | null; name: string; target: string; saved: string; deadline: string; note: string; }

@Component({
  selector: 'app-goals',
  imports: [MoneyPipe, Icon, NgTemplateOutlet],
  templateUrl: './goals.html',
  styleUrl: './goals.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoalsPage {
  private store = inject(BookStore);
  private notices = inject(Notices);
  protected readonly book = computed(() => this.store.book()!);
  protected readonly base = computed(() => this.book().baseCurrency);
  protected readonly today = todayIso();
  protected readonly Math = Math;
  protected readonly pace = computed(() => averageMonthlySavings(this.book(), this.today));

  protected readonly rows = computed(() =>
    this.book().goals.map(g => {
      const f = forecastGoal(g, this.pace(), this.today);
      return { g, f, progress: g.target > 0 ? Math.min(1, g.saved / g.target) : 0, line: this.describe(g, f) };
    }),
  );

  protected readonly totals = computed(() => {
    const goals = this.book().goals;
    return { saved: goals.reduce((s, g) => s + g.saved, 0), target: goals.reduce((s, g) => s + g.target, 0) };
  });

  private describe(g: Goal, f: GoalForecast): string {
    const m = (n: number) => formatMoney(n, this.base());
    const by = g.deadline ? ` by ${formatDate(g.deadline)}` : '';
    switch (f.status) {
      case 'done': return 'Reached. Well done.';
      case 'unknown': return f.neededPerMonth !== null ? `Needs ${m(f.neededPerMonth)} a month${by}. A few months of entries will show whether you are on pace.` : 'Add a deadline to see what it needs each month.';
      case 'no-savings': return `Your recent months spent more than came in, so at this pace it is not reached.${f.neededPerMonth !== null ? ` It needs ${m(f.neededPerMonth)} a month${by}.` : ''}`;
      case 'no-deadline': return `At your recent savings pace, reached around ${formatDate(f.reachBy!)}.`;
      case 'ahead': return `Ahead: at your recent pace, reached around ${formatDate(f.reachBy!)}, ${Math.round(f.slackDays! / 30)} months early.`;
      case 'on-track': return `On track: reached around ${formatDate(f.reachBy!)}.`;
      case 'behind': return `Behind: at your recent pace it lands around ${formatDate(f.reachBy!)}. It needs ${m(f.neededPerMonth!)} a month${by}.`;
    }
  }

  // ---------- deposits ----------
  protected readonly depositFor = signal<string | null>(null);
  protected readonly depositAmount = signal('');
  protected readonly depositError = signal<string | null>(null);

  protected openDeposit(id: string): void {
    this.depositFor.set(this.depositFor() === id ? null : id);
    this.depositAmount.set('');
    this.depositError.set(null);
  }

  protected deposit(event: Event, g: Goal): void {
    event.preventDefault();
    const amount = parseAmount(this.depositAmount());
    if (amount === null || amount === 0) { this.depositError.set('Enter an amount; use a minus sign to take money out.'); return; }
    const saved = Math.max(0, Math.round((g.saved + amount) * 100) / 100);
    this.store.update(b => ({ ...b, goals: b.goals.map(x => (x.id === g.id ? { ...x, saved } : x)) }));
    this.depositFor.set(null);
    if (saved >= g.target && g.saved < g.target) this.notices.say(`${g.name} is reached.`);
  }

  // ---------- editor ----------
  protected readonly draft = signal<GoalDraft | null>(null);
  protected readonly draftError = signal<string | null>(null);
  protected readonly confirmDelete = signal<string | null>(null);

  protected newGoal(): void {
    this.draftError.set(null);
    this.draft.set({ id: null, name: '', target: '', saved: '0', deadline: '', note: '' });
  }

  protected editGoal(g: Goal): void {
    this.draftError.set(null);
    this.confirmDelete.set(null);
    this.draft.set({ id: g.id, name: g.name, target: String(g.target), saved: String(g.saved), deadline: g.deadline ?? '', note: g.note });
  }

  protected patch(change: Partial<GoalDraft>): void {
    this.draft.update(d => (d ? { ...d, ...change } : d));
  }

  protected save(event: Event): void {
    event.preventDefault();
    const d = this.draft();
    if (!d) return;
    const name = d.name.trim().slice(0, 60);
    const target = parseAmount(d.target);
    const saved = parseAmount(d.saved || '0');
    if (!name) { this.draftError.set('Name the goal.'); return; }
    if (target === null || target <= 0) { this.draftError.set('Set a target above zero.'); return; }
    if (saved === null || saved < 0) { this.draftError.set('Saved so far must be zero or more.'); return; }
    if (d.deadline && !isValidIsoDate(d.deadline)) { this.draftError.set('Pick a deadline between 1900 and 2100, or leave it empty.'); return; }
    const fields = { name, target, saved, note: d.note.trim().slice(0, 200), ...(d.deadline ? { deadline: d.deadline } : {}) };
    if (d.id) {
      this.store.update(b => ({ ...b, goals: b.goals.map(g => (g.id === d.id ? { id: g.id, createdAt: g.createdAt, ...fields } : g)) }));
    } else {
      this.store.update(b => ({ ...b, goals: [...b.goals, { id: newId(), createdAt: new Date().toISOString(), ...fields }] }));
    }
    this.draft.set(null);
  }

  protected remove(id: string): void {
    this.store.update(b => ({ ...b, goals: b.goals.filter(g => g.id !== id) }));
    this.draft.set(null);
    this.confirmDelete.set(null);
  }
}
