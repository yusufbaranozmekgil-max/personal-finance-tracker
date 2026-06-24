import { Directive, ElementRef, HostListener, forwardRef } from '@angular/core';
import { NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';

/**
 * <input type="text" appThousandSeparator [(ngModel)]="amount">
 *
 * - Displays digits with dot thousand separators (1.234.567)
 * - Supports decimal comma (1.234,56)
 * - Returns a plain number to ngModel
 * - Preserves cursor position while typing
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
  private onChange: (value: number | null) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private el: ElementRef<HTMLInputElement>) {
    // Ensure input is text type for formatting
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
    // Collapse multiple commas into the first one
    const parts = cleaned.split(',');
    if (parts.length > 2) {
      cleaned = parts[0] + ',' + parts.slice(1).join('');
    }

    const [whole, dec] = cleaned.split(',');
    const grouped = whole ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '';
    const formatted = dec !== undefined ? `${grouped},${dec}` : grouped;

    // Restore cursor position relative to the right side
    const charsAfterCursorOld = oldValue.length - rawCursor;
    input.value = formatted;
    const newCursor = Math.max(0, formatted.length - charsAfterCursorOld);
    input.setSelectionRange(newCursor, newCursor);

    // Emit numeric value to ngModel
    this.onChange(this.parseToNumber(formatted));
  }

  @HostListener('blur')
  onBlur(): void {
    this.onTouched();
  }

  // ===== ControlValueAccessor =====
  writeValue(value: number | string | null): void {
    if (value == null || value === '' || (typeof value === 'number' && isNaN(value))) {
      this.el.nativeElement.value = '';
      return;
    }
    const num = typeof value === 'string' ? Number(value) : value;
    this.el.nativeElement.value = this.formatNumber(num);
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
    // Remove dots (thousand separator), replace comma with dot for decimal
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
