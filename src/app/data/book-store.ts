import { Injectable, computed, signal } from '@angular/core';
import { Book, Currency, Entry, emptyBook } from '../domain/model';
import { LEGACY_KEYS, LegacyData, fromLegacy } from '../domain/legacy';
import { checkBook } from '../domain/book-io';
import { recurringCopies } from '../domain/ledger';
import { todayIso } from '../domain/money';
import { KvStore } from './idb';
import { Sealed, VaultKey, isSealed, newVaultKey, open, openLegacyVault, openWithKey, seal } from './crypto';

export type StoreStatus = 'loading' | 'welcome' | 'locked' | 'locked-legacy' | 'ready' | 'failed';

const BOOK = 'book';
const SEALED = 'sealed';
/** Set once data from the first version has been moved (or the user erased everything). */
const LEGACY_DONE = 'legacyDone';
const IDLE_LOCK_MS = 5 * 60_000;

/**
 * The single source of truth: one Book document in IndexedDB, plain or sealed
 * with the user's password. Every change goes through `update`, which saves.
 */
@Injectable({ providedIn: 'root' })
export class BookStore {
  private kv = new KvStore('ring-binder-finance', 'kv');
  private vaultKey: VaultKey | null = null;
  private saving: Promise<void> = Promise.resolve();
  private channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ring-binder-finance') : null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  readonly status = signal<StoreStatus>('loading');
  private readonly _book = signal<Book | null>(null);
  readonly book = this._book.asReadonly();
  readonly hasPassword = signal(false);
  readonly saveError = signal<string | null>(null);
  /** A one-off message for the user after loading (migration report). */
  readonly notice = signal<string | null>(null);
  /** Entries deleted in this session, shown struck through until the page is left. */
  readonly voided = signal<Entry[]>([]);
  readonly base = computed(() => this._book()?.baseCurrency ?? 'USD');

  constructor() {
    this.init().catch(err => {
      console.error(err);
      this.status.set('failed');
    });
    this.channel?.addEventListener('message', () => this.reloadFromOtherTab());
  }

  private async init(): Promise<void> {
    const sealed = await this.kv.get<Sealed>(SEALED);
    if (isSealed(sealed)) {
      this.hasPassword.set(true);
      this.status.set('locked');
      return;
    }
    const plain = await this.kv.get<Book>(BOOK);
    if (plain && !checkBook(plain)) {
      this.open(plain);
      return;
    }
    if (!(await this.kv.get(LEGACY_DONE))) {
      const legacy = new KvStore('FinansTakip', 'data', false);
      const keys = await legacy.keys();
      if (keys.includes('finans_vault')) {
        this.status.set('locked-legacy');
        return;
      }
      if (keys.some(k => k in LEGACY_KEYS)) {
        const data: LegacyData = {};
        for (const [key, field] of Object.entries(LEGACY_KEYS)) {
          const raw = await legacy.get<string>(key);
          if (typeof raw === 'string') try { data[field] = JSON.parse(raw); } catch { /* skipped below */ }
        }
        await this.adoptLegacy(data);
        return;
      }
    }
    this.status.set('welcome');
  }

  private async adoptLegacy(data: LegacyData, password?: string): Promise<void> {
    const { book, skipped } = fromLegacy(data);
    if (password) {
      this.vaultKey = await newVaultKey(password);
      this.hasPassword.set(true);
    }
    this.open(book);
    await this.persist(book);
    await this.kv.set(LEGACY_DONE, true);
    this.notice.set(`Your data from the previous version was moved over${skipped ? ` (${skipped} damaged record(s) skipped)` : ''}. The old copy is still kept in this browser.`);
  }

  private open(book: Book): void {
    const copies = recurringCopies(book, todayIso());
    const next = copies.length ? { ...book, entries: [...book.entries, ...copies] } : book;
    this._book.set(next);
    this.status.set('ready');
    if (copies.length) {
      void this.persist(next);
      this.notice.set(`${copies.length} monthly ${copies.length === 1 ? 'entry was' : 'entries were'} added.`);
    }
    this.armIdleLock();
    // Ask the browser not to evict our data under storage pressure.
    void navigator.storage?.persist?.().catch(() => undefined);
  }

  /** Applies a change and saves it. */
  update(change: (book: Book) => Book): void {
    const current = this._book();
    if (!current) return;
    const next = change(current);
    if (next === current) return;
    this._book.set(next);
    void this.persist(next);
  }

  private persist(book: Book): Promise<void> {
    const vk = this.vaultKey;
    this.saving = this.saving
      .then(async () => {
        if (vk) {
          await this.kv.set(SEALED, await seal(JSON.stringify(book), vk));
          await this.kv.delete(BOOK);
        } else {
          await this.kv.set(BOOK, book);
          await this.kv.delete(SEALED);
        }
        this.saveError.set(null);
        this.channel?.postMessage('changed');
      })
      .catch(err => {
        console.error(err);
        this.saveError.set('Could not save to this browser. Your last change may be lost if you close the page. Export a backup now.');
      });
    return this.saving;
  }

  /** Resolves when every queued save has been written. */
  flush(): Promise<void> {
    return this.saving;
  }

  private async reloadFromOtherTab(): Promise<void> {
    if (this.status() !== 'ready') return;
    const sealed = await this.kv.get<Sealed>(SEALED);
    if (isSealed(sealed)) {
      const plain = this.vaultKey ? await openWithKey(sealed, this.vaultKey) : null;
      if (plain === null) { this.lock(); return; }
      this._book.set(JSON.parse(plain));
      return;
    }
    const book = await this.kv.get<Book>(BOOK);
    if (book && !checkBook(book)) {
      this.vaultKey = null;
      this.hasPassword.set(false);
      this._book.set(book);
    } else {
      this._book.set(null);
      this.status.set('welcome');
    }
  }

  start(baseCurrency: Currency, book?: Book): void {
    const b = book ?? emptyBook(baseCurrency);
    this.open(b);
    void this.persist(b);
    void this.kv.set(LEGACY_DONE, true);
  }

  /** Replaces everything with a restored backup. */
  replace(book: Book): void {
    this.voided.set([]);
    this.open(book);
    void this.persist(book);
  }

  async unlock(password: string): Promise<boolean> {
    if (this.status() === 'locked-legacy') return this.unlockLegacy(password);
    const sealed = await this.kv.get<Sealed>(SEALED);
    if (!isSealed(sealed)) return false;
    const result = await open(sealed, password);
    if (!result) return false;
    const book = JSON.parse(result.plain) as Book;
    if (checkBook(book)) {
      this.status.set('failed');
      return false;
    }
    this.vaultKey = result.vk;
    this.open(book);
    return true;
  }

  private async unlockLegacy(password: string): Promise<boolean> {
    const legacy = new KvStore('FinansTakip', 'data', false);
    const blob = await legacy.get<string>('finans_vault');
    if (typeof blob !== 'string') return false;
    const plain = await openLegacyVault(blob, password);
    if (!plain) return false;
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(plain); } catch { return false; }
    if (payload['__probe'] !== 'OK_FINANS_VAULT_v1') return false;
    const data: LegacyData = {};
    for (const [key, field] of Object.entries(LEGACY_KEYS)) {
      const raw = payload[key];
      if (typeof raw === 'string') try { data[field] = JSON.parse(raw); } catch { /* skipped */ }
    }
    await this.adoptLegacy(data, password);
    return true;
  }

  /** Forgets the decrypted data and key; the user must enter the password again. */
  lock(): void {
    if (!this.vaultKey) return;
    this.vaultKey = null;
    this._book.set(null);
    this.voided.set([]);
    this.status.set('locked');
    this.clearIdle();
  }

  async setPassword(password: string): Promise<void> {
    const book = this._book();
    if (!book) return;
    this.vaultKey = await newVaultKey(password);
    this.hasPassword.set(true);
    await this.persist(book);
  }

  async removePassword(): Promise<void> {
    const book = this._book();
    if (!book) return;
    this.vaultKey = null;
    this.hasPassword.set(false);
    await this.persist(book);
  }

  /** Deletes everything this app stored, including the moved first-version copy marker. */
  async eraseAll(): Promise<void> {
    await this.saving;
    await this.kv.delete(BOOK);
    await this.kv.delete(SEALED);
    await this.kv.set(LEGACY_DONE, true);
    this.vaultKey = null;
    this.hasPassword.set(false);
    this._book.set(null);
    this.voided.set([]);
    this.status.set('welcome');
    this.channel?.postMessage('changed');
  }

  /** Called on user activity; locks a password-protected book after 5 idle minutes. */
  touch(): void {
    if (this.vaultKey) this.armIdleLock();
  }

  private armIdleLock(): void {
    this.clearIdle();
    if (this.vaultKey) this.idleTimer = setTimeout(() => this.lock(), IDLE_LOCK_MS);
  }

  private clearIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }
}
