import { Injectable, inject, signal } from '@angular/core';
import { serializeBook } from '../domain/book-io';
import { BookStore } from './book-store';
import { download, stamp } from './files';

const LAST_BACKUP = 'rbf-last-backup';

/** The plain backup file: one click from every page, remembered per device. */
@Injectable({ providedIn: 'root' })
export class BackupFile {
  private store = inject(BookStore);
  readonly last = signal<string | null>(this.read());

  private read(): string | null {
    try { return localStorage.getItem(LAST_BACKUP); } catch { return null; }
  }

  download(): void {
    const book = this.store.book();
    if (!book) return;
    download(`ring-binder-backup-${stamp()}.json`, serializeBook(book), 'application/json');
    const today = stamp();
    try { localStorage.setItem(LAST_BACKUP, today); } catch { /* not critical */ }
    this.last.set(today);
  }
}
