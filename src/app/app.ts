import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { NavigationEnd, NavigationStart, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BookStore } from './data/book-store';
import { RateService } from './data/rates';
import { Notices } from './ui/notice';
import { Theme } from './ui/theme';
import { Icon } from './ui/icon';
import { KeepLine } from './ui/keep-line';
import { Welcome } from './pages/welcome/welcome';
import { Lock } from './pages/lock/lock';

export const TABS = [
  { path: '/', tab: 'month', label: 'Month', exact: true },
  { path: '/accounts', tab: 'accounts', label: 'Accounts', exact: false },
  { path: '/investments', tab: 'invest', label: 'Investments', exact: false },
  { path: '/goals', tab: 'goals', label: 'Goals', exact: false },
  { path: '/settings', tab: 'settings', label: 'Settings', exact: false },
] as const;

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, Welcome, Lock, KeepLine],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:pointerdown)': 'store.touch()',
    '(document:keydown)': 'store.touch()',
  },
})
export class App {
  protected readonly store = inject(BookStore);
  protected readonly notices = inject(Notices);
  protected readonly tabs = TABS;
  /** Month shows the line under its entry line; Settings has its own Backup section. */
  protected readonly showKeepLine = signal(false);

  constructor() {
    inject(Theme);
    // One-off store messages (migration, sample data) use the same timed slip as everything else.
    effect(() => {
      const text = this.store.notice();
      if (text) {
        this.notices.say(text);
        this.store.notice.set(null);
      }
    });
    inject(RateService);
    // Struck-through deletions stay restorable only until the page is left.
    inject(Router).events.subscribe(e => {
      if (e instanceof NavigationStart) this.store.voided.set([]);
      if (e instanceof NavigationEnd) {
        const path = e.urlAfterRedirects.split(/[?#]/)[0];
        this.showKeepLine.set(path !== '/' && path !== '/settings');
      }
    });
  }

  protected reload(): void {
    location.reload();
  }
}
