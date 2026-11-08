import { Injectable, inject, signal } from '@angular/core';
import { APP_CONFIG } from '../config/app-config';
import { readBackup, serializeBook } from '../domain/book-io';
import { Book } from '../domain/model';
import { BookStore } from './book-store';
import { isSealed, newVaultKey, open, seal } from './crypto';

const FILE_NAME = 'ring-binder-finance-backup.json';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';

declare const google: any;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Google sign-in.'));
    document.head.appendChild(s);
  });
}

/**
 * Encrypted backup to the user's own Google Drive. The app can see only the file it created
 * (drive.file scope); the file is sealed with a backup password before it leaves the device.
 * The access token lives in memory only.
 */
@Injectable({ providedIn: 'root' })
export class DriveBackup {
  private store = inject(BookStore);
  private token: { value: string; expires: number } | null = null;
  readonly available = !!APP_CONFIG.googleClientId;
  readonly busy = signal(false);

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expires - 60_000) return this.token.value;
    await loadScript('https://accounts.google.com/gsi/client');
    const value = await new Promise<string>((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: APP_CONFIG.googleClientId,
        scope: SCOPE,
        callback: (r: any) => (r.error ? reject(new Error('Google sign-in was cancelled or refused.')) : resolve(r.access_token)),
        error_callback: () => reject(new Error('Google sign-in was closed.')),
      });
      client.requestAccessToken();
    });
    this.token = { value, expires: Date.now() + 3500_000 };
    return value;
  }

  private async api(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(`https://www.googleapis.com${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${await this.accessToken()}` },
    });
    if (res.status === 401) this.token = null;
    if (!res.ok) throw new Error(`Google Drive answered ${res.status}.`);
    return res;
  }

  private async findFile(): Promise<string | null> {
    const known = this.store.book()?.drive?.fileId;
    if (known) return known;
    const q = encodeURIComponent(`name = '${FILE_NAME}' and trashed = false`);
    const r = await (await this.api(`/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`)).json();
    return r.files?.[0]?.id ?? null;
  }

  async backup(password: string): Promise<string> {
    const book = this.store.book();
    if (!book) throw new Error('Nothing to back up.');
    this.busy.set(true);
    try {
      const body = JSON.stringify(await seal(serializeBook(book), await newVaultKey(password)));
      let fileId = await this.findFile();
      if (fileId) {
        try {
          await this.api(`/upload/drive/v3/files/${fileId}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
        } catch {
          fileId = null; // The file was deleted in Drive; create a new one.
        }
      }
      if (!fileId) {
        const boundary = 'b' + crypto.randomUUID();
        const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: FILE_NAME, mimeType: 'application/json' })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
        const r = await (await this.api('/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart,
        })).json();
        fileId = r.id as string;
      }
      const lastSync = new Date().toISOString();
      this.store.update(b => ({ ...b, drive: { fileId: fileId!, lastSync } }));
      return lastSync;
    } finally {
      this.busy.set(false);
    }
  }

  /** Downloads and opens the Drive backup. Does not apply it; the caller confirms first. */
  async fetchBackup(password: string): Promise<Book> {
    this.busy.set(true);
    try {
      const fileId = await this.findFile();
      if (!fileId) throw new Error('No backup from this app was found in your Google Drive.');
      const sealed = await (await this.api(`/drive/v3/files/${fileId}?alt=media`)).json();
      if (!isSealed(sealed)) throw new Error('The Drive file is not a backup from this app.');
      const opened = await open(sealed, password);
      if (!opened) throw new Error('Wrong backup password.');
      const result = readBackup(opened.plain);
      if (!result.ok) throw new Error(result.error);
      return { ...result.book, drive: { fileId, lastSync: new Date().toISOString() } };
    } finally {
      this.busy.set(false);
    }
  }
}
