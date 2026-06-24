import { Directive, ElementRef, HostListener } from '@angular/core';

/**
 * Directive for input[type="date"] elements.
 * Actively prevents the year part from exceeding 4 digits.
 * If the user types or pastes a date with a year longer than 4 digits,
 * it is truncated instantly back to 4 digits.
 */
@Directive({
  selector: 'input[type="date"]',
  standalone: true
})
export class DateLimitDirective {
  constructor(private el: ElementRef<HTMLInputElement>) {}

  @HostListener('input', ['$event'])
  onInput(event: Event): void {
    const input = this.el.nativeElement;
    const val = input.value; // Always in YYYY-MM-DD format
    if (val) {
      const parts = val.split('-');
      if (parts[0] && parts[0].length > 4) {
        const cleanYear = parts[0].substring(0, 4);
        const month = parts[1] || '01';
        const day = parts[2] || '01';
        input.value = `${cleanYear}-${month}-${day}`;
        
        // Notify Angular's ngModel binding of the change
        input.dispatchEvent(new Event('input'));
      }
    }
  }
}
