import { Pipe, PipeTransform, inject } from '@angular/core';
import { SettingsService } from '../../core/services/settings.service';

const SYMBOLS: Record<string, string> = {
  TRY: '₺',
  USD: '$',
  EUR: '€',
};

@Pipe({
  name: 'money',
  standalone: true,
  pure: false,
})
export class MoneyPipe implements PipeTransform {
  private settings = inject(SettingsService);

  transform(amountInTRY: number | null | undefined, decimals: number = 2): string {
    const s = this.settings.settings();
    const symbol = SYMBOLS[s.currency] ?? s.currency;
    if (amountInTRY == null || isNaN(amountInTRY)) {
      return `${symbol}0.${'0'.repeat(decimals)}`;
    }
    let value = amountInTRY;

    if (s.currency === 'USD' && s.usdRate > 0) {
      value = amountInTRY / s.usdRate;
    } else if (s.currency === 'EUR' && s.eurRate > 0) {
      value = amountInTRY / s.eurRate;
    }

    const formatted = value.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    return `${symbol}${formatted}`;
  }
}
