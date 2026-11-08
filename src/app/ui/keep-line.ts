import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BookStore } from '../data/book-store';
import { BackupFile } from '../data/backup-file';
import { formatDate } from '../domain/money';

/** Where the book lives and how to keep a copy, in one ruled line. */
@Component({
  selector: 'app-keep-line',
  imports: [RouterLink],
  template: `
    @if (sample()) {
      <span>This is sample data.</span>
      <a routerLink="/settings" fragment="erase">Erase it to start your own book</a>
    } @else {
      <span>Kept in this browser{{ store.hasPassword() ? ', encrypted' : '' }}.</span>
      @if (last(); as d) { <span>Last backup {{ d }}.</span> } @else { <span class="warn">No backup downloaded yet.</span> }
      <button class="link-btn" type="button" (click)="backup.download()">Download backup</button>
    }
  `,
  styles: `
    :host {
      display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.25rem 0.9rem;
      min-height: var(--pitch);
      padding: 0.7rem 0 0.55rem;
      border-bottom: 1px solid var(--rule);
      color: var(--ink-2);
      font-size: 0.92rem;
    }
    .warn { color: var(--alert); }
    a { color: var(--ink); }
    @media print { :host { display: none; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeepLine {
  protected readonly store = inject(BookStore);
  protected readonly backup = inject(BackupFile);
  protected readonly sample = computed(() => !!this.store.book()?.sample);
  protected readonly last = computed(() => {
    const d = this.backup.last();
    return d ? formatDate(d) : null;
  });
}
