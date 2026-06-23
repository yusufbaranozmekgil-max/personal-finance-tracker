import { Injectable, signal } from '@angular/core';

export type ConfirmKind = 'danger' | 'warning' | 'info';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  kind?: ConfirmKind;
}

export interface ConfirmState extends ConfirmOptions {
  open: boolean;
  resolve?: (result: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  state = signal<ConfirmState>({
    open: false,
    title: '',
    message: '',
  });

  ask(options: ConfirmOptions): Promise<boolean> {
    return new Promise(resolve => {
      this.state.set({
        open: true,
        confirmText: 'Confirm',
        cancelText: 'Cancel',
        kind: 'warning',
        ...options,
        resolve,
      });
    });
  }

  confirm(): void {
    const s = this.state();
    s.resolve?.(true);
    this.close();
  }

  cancel(): void {
    const s = this.state();
    s.resolve?.(false);
    this.close();
  }

  private close(): void {
    this.state.update(s => ({ ...s, open: false, resolve: undefined }));
  }
}
