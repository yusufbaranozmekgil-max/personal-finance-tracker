import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { BookStore } from '../../data/book-store';

@Component({
  selector: 'app-lock',
  templateUrl: './lock.html',
  styleUrl: '../welcome/welcome.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Lock {
  private store = inject(BookStore);
  readonly legacy = input(false);
  protected readonly busy = signal(false);
  protected readonly wrong = signal(false);
  protected readonly confirmErase = signal(false);

  protected async unlock(event: Event, password: string): Promise<void> {
    event.preventDefault();
    if (!password || this.busy()) return;
    this.busy.set(true);
    this.wrong.set(false);
    const ok = await this.store.unlock(password);
    this.busy.set(false);
    if (!ok) this.wrong.set(true);
  }

  protected async startOver(): Promise<void> {
    await this.store.eraseAll();
  }
}
