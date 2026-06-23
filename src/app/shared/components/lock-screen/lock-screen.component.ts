import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EncryptionService } from '../../../core/services/encryption.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';

@Component({
  selector: 'app-lock-screen',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (encryption.locked()) {
      <div class="lock-overlay">
        <div class="lock-card">
          <div class="lock-icon">🔒</div>
          <h2>Vault Locked</h2>
          <p class="lock-desc">Enter your password to access your data.</p>

          <form (ngSubmit)="tryUnlock()">
            <input #pwd
                   type="password"
                   [(ngModel)]="password"
                   name="password"
                   placeholder="Password"
                   autofocus
                   class="lock-input"
                   [class.lock-input--error]="error()">
            @if (error()) {
              <p class="lock-error">{{ error() }}</p>
            }
            <button type="submit"
                    class="lock-btn"
                    [disabled]="!password().trim()">
              🔓 Unlock Vault
            </button>
          </form>

          <p class="lock-hint">
            Forgot your password?
            <button type="button" class="lock-link" (click)="confirmDestroy()">
              Reset Vault (data will be deleted)
            </button>
          </p>
        </div>
      </div>
    }
  `,
  styleUrl: './lock-screen.component.scss'
})
export class LockScreenComponent {
  encryption = inject(EncryptionService);
  toast = inject(ToastService);
  confirmService = inject(ConfirmService);

  password = signal('');
  error = signal<string | null>(null);

  tryUnlock(): void {
    const pwd = this.password().trim();
    if (!pwd) return;
    const result = this.encryption.unlock(pwd);
    if (result.ok) {
      this.toast.success('🔓 ' + result.message);
      this.password.set('');
      this.error.set(null);
    } else {
      this.error.set(result.message);
      this.password.set('');
    }
  }

  async confirmDestroy(): Promise<void> {
    const sure = await this.confirmService.ask({
      title: 'Reset Vault (Delete Data)',
      message: 'WARNING: Resetting the Vault will PERMANENTLY delete all your financial data. This action cannot be undone. Do you want to continue?',
      confirmText: 'Yes, Reset and Delete',
      cancelText: 'Cancel',
      kind: 'danger'
    });
    if (sure) {
      this.encryption.destroyVault();
      this.toast.warning('Vault reset. Reloading page...');
      setTimeout(() => location.reload(), 1500);
    }
  }
}
