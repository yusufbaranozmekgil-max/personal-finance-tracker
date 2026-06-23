import { Component, HostListener, OnDestroy, inject, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { ToastComponent } from './shared/components/toast/toast.component';
import { ConfirmDialogComponent } from './shared/components/confirm-dialog/confirm-dialog.component';
import { BudgetBannerComponent } from './shared/components/budget-banner/budget-banner.component';
import { OfflineBannerComponent } from './shared/components/offline-banner/offline-banner.component';
import { BudgetAlertService } from './core/services/budget-alert.service';
import { AutoResetService } from './core/services/auto-reset.service';
import { ThemeService } from './core/services/theme.service';
import { LockScreenComponent } from './shared/components/lock-screen/lock-screen.component';
import { EncryptionService } from './core/services/encryption.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ToastComponent,
    ConfirmDialogComponent,
    BudgetBannerComponent,
    OfflineBannerComponent,
    LockScreenComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnDestroy, OnInit {
  private readonly autoLockDelayMs = 5 * 60 * 1000;
  private encryptionService = inject(EncryptionService);
  private inactivityTimerId: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(ThemeService);
    inject(BudgetAlertService);

    if (!this.encryptionService.locked()) {
      inject(AutoResetService).runIfNeeded();
    }

    this.resetInactivityTimer();
  }

  ngOnInit(): void {
    this.handleOAuthCallback();
  }

  private handleOAuthCallback(): void {
    if (typeof window !== 'undefined' && window.opener && window.location.hash) {
      const hash = window.location.hash;
      if (hash.includes('access_token') && hash.includes('state=gdrive_auth')) {
        window.opener.postMessage({ type: 'gdrive_auth_success', hash }, window.location.origin);
        window.close();
      }
    }
  }

  ngOnDestroy(): void {
    this.clearInactivityTimer();
  }

  @HostListener('window:beforeunload')
  onBeforeUnload(): void {
    this.lockSessionIfPossible();
  }

  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      this.lockSessionIfPossible();
      return;
    }

    this.resetInactivityTimer();
  }

  @HostListener('document:mousemove')
  @HostListener('document:keydown')
  @HostListener('document:click')
  @HostListener('document:scroll')
  @HostListener('document:touchstart')
  onUserActivity(): void {
    this.resetInactivityTimer();
  }

  private resetInactivityTimer(): void {
    this.clearInactivityTimer();
    if (!this.shouldAutoLock()) return;

    this.inactivityTimerId = setTimeout(() => {
      this.lockSessionIfPossible();
    }, this.autoLockDelayMs);
  }

  private clearInactivityTimer(): void {
    if (this.inactivityTimerId == null) return;
    clearTimeout(this.inactivityTimerId);
    this.inactivityTimerId = null;
  }

  private lockSessionIfPossible(): void {
    if (!this.shouldAutoLock()) return;
    this.encryptionService.lockSession();
    this.clearInactivityTimer();
  }

  private shouldAutoLock(): boolean {
    return this.encryptionService.hasVault() && !this.encryptionService.locked();
  }
}
