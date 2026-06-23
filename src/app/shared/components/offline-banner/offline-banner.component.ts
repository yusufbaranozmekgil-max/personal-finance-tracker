import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConnectionService } from '../../../core/services/connection.service';
import { CurrencyRateService } from '../../../core/services/currency-rate.service';

@Component({
  selector: 'app-offline-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (connection.isOffline) {
      <div class="offline-banner">
        <span class="offline-banner__icon">⚠️</span>
        <div class="offline-banner__text">
          <strong>Offline Mode</strong>
          @if (rateService.getCached()) {
            <span>
              Prices belong to the last saved data from {{ rateService.formatRelativeTime(rateService.getCached()!.fetchedAt) }}.
            </span>
          } @else {
            <span>No live rates fetched yet. Using manually entered exchange rates.</span>
          }
        </div>
      </div>
    }
  `,
  styleUrl: './offline-banner.component.scss'
})
export class OfflineBannerComponent {
  connection = inject(ConnectionService);
  rateService = inject(CurrencyRateService);
}
