import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MonthSummary } from '../../domain/ledger';
import { formatMoney, monthLabel } from '../../domain/money';

/** Six months of money in and out, as paired ruled bars. The table carries the figures for screen readers. */
@Component({
  selector: 'app-month-bars',
  template: `
    <div class="chart" aria-hidden="true">
      @for (m of bars(); track m.month) {
        <div class="col" [class.current]="m.month === current()">
          <div class="pair">
            <span class="bar in" [style.height.%]="m.inH" [title]="m.inLabel"></span>
            <span class="bar out" [style.height.%]="m.outH" [title]="m.outLabel"></span>
          </div>
          <span class="label">{{ m.short }}</span>
        </div>
      }
    </div>
    <p class="legend" aria-hidden="true"><span class="key in"></span> In <span class="key out"></span> Out</p>
    <table class="sr-only">
      <caption>Money in and out by month</caption>
      <tr><th scope="col">Month</th><th scope="col">In</th><th scope="col">Out</th></tr>
      @for (m of bars(); track m.month) {
        <tr><th scope="row">{{ m.long }}</th><td>{{ m.inLabel }}</td><td>{{ m.outLabel }}</td></tr>
      }
    </table>
  `,
  styles: `
    :host { display: block; }
    .chart {
      display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 0.5rem;
      height: 11rem; padding-top: 0.75rem;
      background: repeating-linear-gradient(to top, var(--rule) 0 1px, transparent 1px 2.2rem);
      border-bottom: 1.5px solid var(--ink);
    }
    .col { display: grid; grid-template-rows: 1fr auto; min-width: 0; }
    .pair { display: flex; align-items: flex-end; justify-content: center; gap: 3px; height: 100%; }
    .bar { width: min(1.25rem, 38%); min-height: 1px; border-radius: 2px 2px 0 0; }
    .bar.in { background: var(--plus); }
    .bar.out { background: var(--ink); }
    .label {
      transform: translateY(1.9rem); text-align: center;
      font-family: var(--font-cond); font-size: 0.85rem; letter-spacing: 0.04em; color: var(--ink-2);
    }
    .current .label { color: var(--ink); font-weight: 600; }
    .legend {
      display: flex; align-items: center; gap: 0.4rem; justify-content: flex-end;
      margin-top: 2.25rem; font-size: 0.88rem; color: var(--ink-2);
    }
    .key { display: inline-block; width: 0.75rem; height: 0.75rem; border-radius: 2px; margin-left: 0.6rem; }
    .key.in { background: var(--plus); }
    .key.out { background: var(--ink); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonthBars {
  readonly months = input.required<MonthSummary[]>();
  readonly currency = input.required<string>();
  readonly current = input<string>('');

  protected readonly bars = computed(() => {
    const ms = this.months();
    const max = Math.max(1, ...ms.flatMap(m => [m.income, m.expense]));
    return ms.map(m => ({
      month: m.month,
      short: monthLabel(m.month, 'short').split(' ')[0],
      long: monthLabel(m.month),
      inH: (m.income / max) * 100,
      outH: (m.expense / max) * 100,
      inLabel: formatMoney(m.income, this.currency()),
      outLabel: formatMoney(m.expense, this.currency()),
    }));
  });
}
