import { Injectable } from '@angular/core';
import localforage from 'localforage';
import * as CryptoJS from 'crypto-js';

const MIGRATION_KEY = '__migrated_to_indexeddb_v1';
const VAULT_KEY = 'finans_vault';
const VAULT_PROBE = 'OK_FINANS_VAULT_v1';
const SECURE_KEYS = [
  'finans_transactions',
  'finans_assets',
  'finans_goals',
  'finans_categories',
  'finans_accounts',
  'finans_settings',
  'finans_net_worth_history',
];

@Injectable({ providedIn: 'root' })
export class StorageService {
  private cache = new Map<string, string>();
  private ready: Promise<void>;
  private vaultPassword: string | null = null;
  private vaultUnlocked = false;

  constructor() {
    localforage.config({
      name: 'FinansTakip',
      storeName: 'data',
      description: 'Finance tracker application data',
    });

    this.ready = this.init();
  }

  private async init(): Promise<void> {
    if (!localStorage.getItem(MIGRATION_KEY)) {
      await this.migrateFromLocalStorage();
      localStorage.setItem(MIGRATION_KEY, '1');
    }

    const keys = await localforage.keys();
    for (const key of keys) {
      const value = await localforage.getItem<string>(key);
      if (value != null) this.cache.set(key, value);
    }

    if (this.hasVault()) {
      await this.purgePlainSecureKeys();
    }
  }

  whenReady(): Promise<void> {
    return this.ready;
  }

  async getItem(key: string): Promise<string | null> {
    await this.ready;
    if (this.isSecureKey(key) && this.hasVault() && !this.vaultUnlocked) return null;
    return this.cache.get(key) ?? ((await localforage.getItem<string>(key)) ?? null);
  }

  async setItem(key: string, value: string): Promise<void> {
    if (this.shouldWriteToVault(key)) {
      this.cache.set(key, value);
      await this.persistVault();
      return;
    }

    if (this.isLockedSecureKey(key)) {
      console.warn(`Secure key write blocked while vault is locked (${key}).`);
      return;
    }

    this.cache.set(key, value);
    await localforage.setItem(key, value);
  }

  async removeItem(key: string): Promise<void> {
    if (this.shouldWriteToVault(key)) {
      this.cache.delete(key);
      await this.persistVault();
      return;
    }

    if (this.isLockedSecureKey(key)) {
      console.warn(`Secure key delete blocked while vault is locked (${key}).`);
      return;
    }

    this.cache.delete(key);
    await localforage.removeItem(key);
  }

  getItemSync(key: string): string | null {
    if (this.isSecureKey(key) && this.hasVault() && !this.vaultUnlocked) return null;
    return this.cache.get(key) ?? null;
  }

  setItemSync(key: string, value: string): void {
    if (this.shouldWriteToVault(key)) {
      this.cache.set(key, value);
      this.persistVault().catch(err =>
        console.error(`Vault write error (${key}):`, err)
      );
      return;
    }

    if (this.isLockedSecureKey(key)) {
      console.warn(`Secure key write blocked while vault is locked (${key}).`);
      return;
    }

    this.cache.set(key, value);
    localforage.setItem(key, value).catch(err =>
      console.error(`IndexedDB write error (${key}):`, err)
    );
  }

  removeItemSync(key: string): void {
    if (this.shouldWriteToVault(key)) {
      this.cache.delete(key);
      this.persistVault().catch(err =>
        console.error(`Vault delete error (${key}):`, err)
      );
      return;
    }

    if (this.isLockedSecureKey(key)) {
      console.warn(`Secure key delete blocked while vault is locked (${key}).`);
      return;
    }

    this.cache.delete(key);
    localforage.removeItem(key).catch(err =>
      console.error(`IndexedDB delete error (${key}):`, err)
    );
  }

  hasVault(): boolean {
    return !!this.cache.get(VAULT_KEY);
  }

  isVaultUnlocked(): boolean {
    return this.vaultUnlocked;
  }

  getVaultPassword(): string | null {
    return this.vaultPassword;
  }

  createVault(password: string): { ok: boolean; message: string } {
    if (!password || password.length < 4) {
      return { ok: false, message: 'Password must be at least 4 characters.' };
    }

    const encrypted = this.buildVaultBlob(password);
    this.cache.set(VAULT_KEY, encrypted);
    localforage.setItem(VAULT_KEY, encrypted).catch(err =>
      console.error('Vault creation error:', err)
    );
    this.vaultUnlocked = true;
    this.purgePlainSecureKeys().catch(err =>
      console.error('Plain vault keys could not be purged:', err)
    );
    this.lockVaultSession();
    return { ok: true, message: 'Vault locked. Data will remain encrypted on disk.' };
  }

  unlockVault(password: string): { ok: boolean; message: string } {
    const blob = this.cache.get(VAULT_KEY);
    if (!blob) return { ok: false, message: 'Vault not found.' };

    try {
      const decrypted = CryptoJS.AES.decrypt(blob, password).toString(CryptoJS.enc.Utf8);
      if (!decrypted) return { ok: false, message: 'Incorrect password.' };

      const payload = JSON.parse(decrypted);
      if (payload.__probe !== VAULT_PROBE) {
        return { ok: false, message: 'Incorrect password.' };
      }

      for (const key of SECURE_KEYS) {
        if (typeof payload[key] === 'string') {
          this.cache.set(key, payload[key]);
        } else {
          this.cache.delete(key);
        }
      }

      this.vaultPassword = password;
      this.vaultUnlocked = true;
      this.purgePlainSecureKeys().catch(err =>
        console.error('Plain vault keys could not be purged:', err)
      );
      return { ok: true, message: 'Vault unlocked. Data remains encrypted on disk.' };
    } catch {
      return { ok: false, message: 'Incorrect password or corrupted vault.' };
    }
  }

  lockVaultSession(): void {
    this.clearSecureCache();
    this.vaultPassword = null;
    this.vaultUnlocked = false;
  }

  disableVault(password: string): { ok: boolean; message: string } {
    const result = this.unlockVault(password);
    if (!result.ok) return result;

    for (const key of SECURE_KEYS) {
      const value = this.cache.get(key);
      if (value != null) {
        localforage.setItem(key, value).catch(err =>
          console.error(`IndexedDB write error (${key}):`, err)
        );
      }
    }

    this.cache.delete(VAULT_KEY);
    localforage.removeItem(VAULT_KEY).catch(err =>
      console.error('Vault deletion error:', err)
    );
    this.vaultPassword = null;
    this.vaultUnlocked = false;
    return { ok: true, message: 'Vault disabled. Data is now unencrypted.' };
  }

  changePassword(oldPassword: string, newPassword: string): { ok: boolean; message: string } {
    if (!this.hasVault()) {
      return { ok: false, message: 'No active vault found.' };
    }
    if (oldPassword !== this.vaultPassword) {
      const blob = this.cache.get(VAULT_KEY);
      if (!blob) return { ok: false, message: 'Vault not found.' };
      try {
        const decrypted = CryptoJS.AES.decrypt(blob, oldPassword).toString(CryptoJS.enc.Utf8);
        if (!decrypted) return { ok: false, message: 'Current password is incorrect.' };
        const payload = JSON.parse(decrypted);
        if (payload.__probe !== VAULT_PROBE) return { ok: false, message: 'Current password is incorrect.' };
      } catch {
        return { ok: false, message: 'Current password is incorrect.' };
      }
    }
    if (!newPassword || newPassword.length < 4) {
      return { ok: false, message: 'New password must be at least 4 characters.' };
    }

    this.vaultPassword = newPassword;
    this.persistVault().catch(err => console.error('Password change error:', err));
    return { ok: true, message: 'Your password has been successfully changed.' };
  }

  destroyVault(): void {
    this.cache.delete(VAULT_KEY);
    this.clearSecureCache();
    this.vaultPassword = null;
    this.vaultUnlocked = false;
    localforage.removeItem(VAULT_KEY).catch(err =>
      console.error('Vault deletion error:', err)
    );
  }

  private async migrateFromLocalStorage(): Promise<void> {
    const keysToMigrate: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('finans_')) keysToMigrate.push(key);
    }

    if (keysToMigrate.length === 0) return;

    let migrated = 0;
    for (const key of keysToMigrate) {
      const value = localStorage.getItem(key);
      if (value != null) {
        await localforage.setItem(key, value);
        localStorage.removeItem(key);
        migrated++;
      }
    }

    if (migrated > 0) {
      console.log(`${migrated} key(s) migrated from localStorage -> IndexedDB`);
    }
  }

  private shouldWriteToVault(key: string): boolean {
    return this.isSecureKey(key) && this.hasVault() && this.vaultUnlocked && !!this.vaultPassword;
  }

  private isLockedSecureKey(key: string): boolean {
    return this.isSecureKey(key) && this.hasVault() && !this.vaultUnlocked;
  }

  private isSecureKey(key: string): boolean {
    return SECURE_KEYS.includes(key);
  }

  private buildVaultBlob(password: string): string {
    const payload: Record<string, string> = { __probe: VAULT_PROBE };
    for (const key of SECURE_KEYS) {
      const value = this.cache.get(key);
      if (value != null) payload[key] = value;
    }

    return CryptoJS.AES.encrypt(JSON.stringify(payload), password).toString();
  }

  private async persistVault(): Promise<void> {
    if (!this.vaultPassword) return;

    const encrypted = this.buildVaultBlob(this.vaultPassword);
    this.cache.set(VAULT_KEY, encrypted);
    await localforage.setItem(VAULT_KEY, encrypted);
    await this.purgePlainSecureKeys();
  }

  private async purgePlainSecureKeys(): Promise<void> {
    for (const key of SECURE_KEYS) {
      if (!this.vaultUnlocked) this.cache.delete(key);
      await localforage.removeItem(key);
    }
  }

  private clearSecureCache(): void {
    for (const key of SECURE_KEYS) {
      this.cache.delete(key);
    }
  }

  async getUsageEstimate(): Promise<{ usage: number; quota: number; usagePercent: number } | null> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage ?? 0;
      const quota = estimate.quota ?? 0;
      return {
        usage,
        quota,
        usagePercent: quota > 0 ? (usage / quota) * 100 : 0,
      };
    }
    return null;
  }
}
