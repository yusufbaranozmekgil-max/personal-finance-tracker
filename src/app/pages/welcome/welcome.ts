import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BookStore } from '../../data/book-store';
import { COMMON_CURRENCIES, currencyName, guessCurrency } from '../../domain/money';
import { demoBook } from '../../domain/demo';
import { readBackup } from '../../domain/book-io';

@Component({
  selector: 'app-welcome',
  templateUrl: './welcome.html',
  styleUrl: './welcome.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Welcome {
  private store = inject(BookStore);
  private router = inject(Router);
  protected readonly currencies = COMMON_CURRENCIES.map(code => ({ code, name: currencyName(code) }));
  protected readonly currency = signal(guessCurrency());
  protected readonly error = signal<string | null>(null);

  protected startEmpty(): void {
    this.store.start(this.currency());
    void this.router.navigateByUrl('/');
  }

  protected startDemo(): void {
    this.store.start(this.currency(), demoBook(this.currency()));
    void this.router.navigateByUrl('/');
  }

  protected async restore(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { this.error.set('That file is larger than 20 MB; it is not a backup from this app.'); return; }
    const result = readBackup(await file.text());
    if (!result.ok) { this.error.set(result.error); return; }
    this.store.start(result.book.baseCurrency, result.book);
    void this.router.navigateByUrl('/');
    this.store.notice.set(`Backup restored: ${result.book.entries.length} entries.${result.note ? ' ' + result.note : ''}`);
  }
}
