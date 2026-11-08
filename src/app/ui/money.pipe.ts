import { Pipe, PipeTransform } from '@angular/core';
import { formatMoney } from '../domain/money';

@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(value: number | null | undefined, currency: string, sign = false): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    return formatMoney(value, currency, { sign });
  }
}
