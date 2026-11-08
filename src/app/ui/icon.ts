import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** One stroke family, 1.6px on a 24 grid, drawn for this app. */
const PATHS: Record<string, string> = {
  plus: 'M12 5v14M5 12h14',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  close: 'M6 6l12 12M18 6L6 18',
  lock: 'M7 11V8a5 5 0 0110 0v3M5.5 11h13v9h-13z',
  refresh: 'M19 12a7 7 0 11-2.05-4.95M19 4v4.5h-4.5',
  download: 'M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14',
  upload: 'M12 15V4M7.5 8.5L12 4l4.5 4.5M5 19.5h14',
  print: 'M7 9V4h10v5M7 17H5v-7h14v7h-2M8 14h8v6H8z',
  search: 'M10.5 17a6.5 6.5 0 110-13 6.5 6.5 0 010 13zM15.5 15.5L20 20',
  edit: 'M5 19h3.5L19 8.5 15.5 5 5 15.5zM13.5 7l3.5 3.5',
  undo: 'M9 7L4.5 11.5 9 16M5 11.5h9a5 5 0 010 10h-2',
  repeat: 'M17 3.5l3 3-3 3M4 11.5v-1a4 4 0 014-4h12M7 20.5l-3-3 3-3M20 12.5v1a4 4 0 01-4 4H4',
  transfer: 'M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4',
  cloud: 'M7 18.5a4.5 4.5 0 01-.6-8.96A6 6 0 0118 9a4.75 4.75 0 01-.75 9.5z',
};

@Component({
  selector: 'app-icon',
  template: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path [attr.d]="d()" /></svg>`,
  styles: `:host { display: inline-flex; } svg { width: 1.2em; height: 1.2em; }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Icon {
  readonly name = input.required<string>();
  protected readonly d = computed(() => PATHS[this.name()] ?? '');
}
