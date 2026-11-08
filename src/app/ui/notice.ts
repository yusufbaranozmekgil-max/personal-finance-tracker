import { Injectable, signal } from '@angular/core';

export interface Notice { text: string; tone: 'info' | 'error'; }

/** One line of feedback at the top of the page; replaces the previous one. */
@Injectable({ providedIn: 'root' })
export class Notices {
  readonly current = signal<Notice | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;

  say(text: string, tone: Notice['tone'] = 'info'): void {
    this.current.set({ text, tone });
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.current.set(null), tone === 'error' ? 9000 : 4500);
  }

  clear(): void {
    this.current.set(null);
  }
}
