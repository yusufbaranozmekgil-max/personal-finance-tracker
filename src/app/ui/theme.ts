import { Injectable, signal } from '@angular/core';

export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'rbf-theme';

/** Display preference for this device only; not part of the book. */
@Injectable({ providedIn: 'root' })
export class Theme {
  readonly choice = signal<ThemeChoice>(this.read());

  constructor() {
    this.apply(this.choice());
  }

  set(choice: ThemeChoice): void {
    this.choice.set(choice);
    try { localStorage.setItem(KEY, choice); } catch { /* storage blocked: keep for this session */ }
    this.apply(choice);
  }

  private read(): ThemeChoice {
    try {
      const v = localStorage.getItem(KEY);
      return v === 'light' || v === 'dark' ? v : 'system';
    } catch {
      return 'system';
    }
  }

  private apply(choice: ThemeChoice): void {
    if (choice === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', choice);
  }
}
