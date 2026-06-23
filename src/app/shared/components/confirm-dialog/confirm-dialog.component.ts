import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfirmService } from '../../../core/services/confirm.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss'
})
export class ConfirmDialogComponent {
  confirmService = inject(ConfirmService);

  get state() { return this.confirmService.state(); }

  get iconForKind(): string {
    switch (this.state.kind) {
      case 'danger': return '⚠';
      case 'warning': return '?';
      case 'info': return 'ℹ';
      default: return '?';
    }
  }
}
