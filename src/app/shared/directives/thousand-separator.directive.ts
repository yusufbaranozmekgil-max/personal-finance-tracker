import { Directive, ElementRef, HostListener, Input, forwardRef } from '@angular/core';
import { NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';

/**
 * <input type="text" appThousandSeparator [appMax]="1000000" [(ngModel)]="amount">
 *
 * - Displays digits with dot thousand separators (1.234.567)
 * - Supports decimal comma (1.234,56)
 * - Returns a plain number to ngModel
 * - Preserves cursor position while typing
 * - When [appMax] is provided, hard-blocks input that would exceed the cap
 *   (typed character is rejected; value stays at the last valid state)
 */
@Directive({
  selector: 'input[appThousandSeparator]',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ThousandSeparatorDirective),
      multi: true,
    },
  ],
})
export class ThousandSeparatorDirective implements ControlValueAccessor {
  /** Optional cap. If new typed value exceeds this, the input reverts. */
  @Input('appMax') maxValue: number | null = null;

  private onChange: (value: number | null) => void = () => {};
  private onTouched: () => void = () => {};
  private lastValidFormatted = '';
  private lastValidNumber: number | null = null;

  constructor(private el: ElementRef<HTMLInputElement>) {
    if (this.el.nativeElement.type !== 'text') {
      this.el.nativeElement.type = 'text';
      this.el.nativeElement.inputMode = 'decimal';
    }
  }

  @HostListener('input', ['$event'])
  onInput(event: InputEvent): void {
    const input = this.el.nativeElement;
    const rawCursor = input.selectionStart ?? 0;
    const oldValue = input.value;

    // Keep only digits and one decimal comma
    let cleaned = oldValue.replace(/[^\d,]/g, '');
    const parts = cleaned.split(',');
    if (parts.length > 2) {
      cleaned = parts[0] + ',' + parts.slice(1).join('');
    }

    const [whole, dec] = cleaned.split(',');
    const grouped = whole ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '';
    const formatted = dec !== undefined ? `${grouped},${dec}` : grouped;

    const numericValue = this.parseToNumber(formatted);

    // Hard-block if exceeds maxValue
    if (this.maxValue !== null && numericValue !== null && numericValue > this.maxValue) {
      // Revert to last valid state
      input.value = this.lastValidFormatted;
      input.setSelectionRange(this.lastValidFormatted.length, this.lastValidFormatted.length);
      this.onChange(this.lastValidNumber);
      return;
    }

    // Restore cursor position relative to right side
    const charsAfterCursorOld = oldValue.length - rawCursor;
    input.value = formatted;
    const newCursor = Math.max(0, formatted.length - charsAfterCursorOld);
    input.setSelectionRange(newCursor, newCursor);

    // Save valid state for potential rollback
    this.lastValidFormatted = formatted;
    this.lastValidNumber = numericValue;

    this.onChange(numericValue);
  }

  @HostListener('blur')
  onBlur(): void {
    this.onTouched();
  }

  // ===== ControlValueAccessor =====
  writeValue(value: number | string | null): void {
    if (value == null || value === '' || (typeof value === 'number' && isNaN(value))) {
      this.el.nativeElement.value = '';
      this.lastValidFormatted = '';
      this.lastValidNumber = null;
      return;
    }
    const num = typeof value === 'string' ? Number(value) : value;
    const formatted = this.formatNumber(num);
    this.el.nativeElement.value = formatted;
    this.lastValidFormatted = formatted;
    this.lastValidNumber = num;
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.el.nativeElement.disabled = isDisabled;
  }

  // ===== helpers =====
  private parseToNumber(formatted: string): number | null {
    if (!formatted) return null;
    const normalized = formatted.replace(/\./g, '').replace(',', '.');
    const n = Number(normalized);
    return isNaN(n) ? null : n;
  }

  private formatNumber(n: number): string {
    if (!isFinite(n)) return '';
    return n.toLocaleString('de-DE', {
      maximumFractionDigits: 20,
    });
  }
}
