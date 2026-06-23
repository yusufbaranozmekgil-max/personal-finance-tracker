import { Injectable, inject, signal, effect } from '@angular/core';
import { StorageService } from './storage.service';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'finans_theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private storage = inject(StorageService);
  theme = signal<ThemeMode>(this.load());

  constructor() {
    effect(() => {
      const mode = this.theme();
      document.documentElement.setAttribute('data-theme', mode);
      this.storage.setItemSync(STORAGE_KEY, mode);
    });
  }

  toggle(): void {
    this.theme.update(t => t === 'dark' ? 'light' : 'dark');
  }

  set(mode: ThemeMode): void {
    this.theme.set(mode);
  }

  private load(): ThemeMode {
    const saved = this.storage.getItemSync(STORAGE_KEY) as ThemeMode | null;
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
}
