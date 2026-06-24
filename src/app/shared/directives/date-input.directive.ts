import { Directive, ElementRef, HostListener } from '@angular/core';

/**
 * Automatically triggers the native browser date picker (.showPicker())
 * when the user clicks or focuses an <input type="date"> field.
 * This makes it easier for users to select dates from the calendar UI
 * without needing to click the small icon.
 */
@Directive({
  selector: 'input[type="date"]',
  standalone: true
})
export class DateInputDirective {
  constructor(private el: ElementRef<HTMLInputElement>) {}

  @HostListener('click')
  @HostListener('focus')
  onFocusOrClick(): void {
    try {
      this.el.nativeElement.showPicker();
    } catch (e) {
      // showPicker() may fail or not be supported in some older browsers/environments
    }
  }
}
