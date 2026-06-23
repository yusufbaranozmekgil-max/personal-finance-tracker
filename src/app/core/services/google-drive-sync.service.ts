import { Injectable, inject, signal, computed } from '@angular/core';
import { SettingsService } from './settings.service';
import { DataService } from './data.service';
import { StorageService } from './storage.service';
import * as CryptoJS from 'crypto-js';

@Injectable({ providedIn: 'root' })
export class GoogleDriveSyncService {
  private settingsService = inject(SettingsService);
  private dataService = inject(DataService);
  private storageService = inject(StorageService);

  accessToken = signal<string | null>(null);
  isSyncing = signal<boolean>(false);
  isConnected = computed(() => !!this.accessToken());

  constructor() {
    this.loadTokenFromSession();
    this.setupOAuthListener();
  }

  private loadTokenFromSession(): void {
    if (typeof window !== 'undefined') {
      const token = sessionStorage.getItem('gdrive_access_token');
      const expiry = sessionStorage.getItem('gdrive_token_expiry');
      if (token && expiry) {
        if (Date.now() < Number(expiry)) {
          this.accessToken.set(token);
        } else {
          this.disconnect();
        }
      }
    }
  }

  private setupOAuthListener(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('message', (event) => {
        if (event.origin !== window.location.origin) return;
        if (event.data && event.data.type === 'gdrive_auth_success') {
          const hash = event.data.hash;
          const token = this.parseHashParam(hash, 'access_token');
          const expiresIn = this.parseHashParam(hash, 'expires_in');
          if (token) {
            this.saveToken(token, Number(expiresIn || '3600'));
          }
        }
      });
    }
  }

  private parseHashParam(hash: string, param: string): string | null {
    const params = new URLSearchParams(hash.substring(1));
    return params.get(param);
  }

  private saveToken(token: string, expiresInSeconds: number): void {
    const expiryTime = Date.now() + expiresInSeconds * 1000;
    sessionStorage.setItem('gdrive_access_token', token);
    sessionStorage.setItem('gdrive_token_expiry', String(expiryTime));
    this.accessToken.set(token);
  }

  connect(clientId: string): void {
    if (!clientId) {
      throw new Error('Google Client ID must be specified.');
    }
    const redirectUri = encodeURIComponent(window.location.origin + window.location.pathname);
    const scope = encodeURIComponent('https://www.googleapis.com/auth/drive.file');
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=token&scope=${scope}&state=gdrive_auth`;
    
    // Open popup in the center of the screen
    const width = 600;
    const height = 600;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    window.open(url, 'gdrive_auth', `width=${width},height=${height},left=${left},top=${top}`);
  }

  disconnect(): void {
    sessionStorage.removeItem('gdrive_access_token');
    sessionStorage.removeItem('gdrive_token_expiry');
    this.accessToken.set(null);
  }

  async backup(password: string): Promise<void> {
    const token = this.accessToken();
    if (!token) throw new Error('No connection to Google Drive.');

    this.isSyncing.set(true);
    try {
      // 1. Get plain text payload and encrypt it
      const plainContent = this.dataService.exportJSON().content;
      const encryptedContent = CryptoJS.AES.encrypt(plainContent, password).toString();

      // 2. Find file ID on Google Drive
      let fileId = this.settingsService.settings().gdriveFileId;
      if (!fileId) {
        const found = await this.findBackupFile(token);
        fileId = found || undefined;
      }

      if (fileId) {
        // 3. Update existing file
        await this.updateBackup(token, fileId, encryptedContent);
      } else {
        // 4. Create new file
        const newFileId = await this.uploadNewBackup(token, encryptedContent);
        this.settingsService.save({
          ...this.settingsService.settings(),
          gdriveFileId: newFileId
        });
      }

      // 5. Update last sync time
      this.settingsService.save({
        ...this.settingsService.settings(),
        gdriveLastSync: new Date().toISOString()
      });
    } finally {
      this.isSyncing.set(false);
    }
  }

  async restore(password: string): Promise<{ ok: boolean; message: string }> {
    const token = this.accessToken();
    if (!token) throw new Error('No connection to Google Drive.');

    this.isSyncing.set(true);
    try {
      // 1. Find file ID on Google Drive
      let fileId = this.settingsService.settings().gdriveFileId;
      if (!fileId) {
        const found = await this.findBackupFile(token);
        fileId = found || undefined;
      }

      if (!fileId) {
        return { ok: false, message: 'Backup file not found in your Google Drive account.' };
      }

      // 2. Download encrypted backup
      const encryptedContent = await this.downloadBackup(token, fileId);

      // 3. Decrypt payload
      const decrypted = CryptoJS.AES.decrypt(encryptedContent, password).toString(CryptoJS.enc.Utf8);
      if (!decrypted) {
        return { ok: false, message: 'Could not decrypt. Password may be incorrect or data might be corrupted.' };
      }

      // 4. Import JSON data
      const result = this.dataService.importJSON(decrypted);
      if (result.ok) {
        // Save the restored settings along with Google Drive parameters so we don't lose the connection
        const currentSettings = this.settingsService.settings();
        this.settingsService.save({
          ...currentSettings,
          gdriveFileId: fileId,
          gdriveLastSync: new Date().toISOString()
        });
      }
      return result;
    } catch (err: any) {
      return { ok: false, message: err?.message ?? 'An error occurred while restoring the backup.' };
    } finally {
      this.isSyncing.set(false);
    }
  }

  // Google Drive REST API HTTP helper methods
  private async findBackupFile(token: string): Promise<string | null> {
    const query = encodeURIComponent("name = 'finans_takip_backup.enc' and trashed = false");
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Failed to search for Google Drive backup file.');
    const data = await response.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
    return null;
  }

  private async downloadBackup(token: string, fileId: string): Promise<string> {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Failed to download the backup file from Google Drive.');
    return await response.text();
  }

  private async uploadNewBackup(token: string, encryptedContent: string): Promise<string> {
    const metadata = {
      name: 'finans_takip_backup.enc',
      mimeType: 'text/plain'
    };
    
    const boundary = 'finans_backup_multipart_boundary';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;
    
    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: text/plain\r\n\r\n' +
      encryptedContent +
      closeDelimiter;

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartRequestBody
    });
    
    if (!response.ok) throw new Error('Failed to upload the backup file to Google Drive.');
    const data = await response.json();
    return data.id;
  }

  private async updateBackup(token: string, fileId: string, encryptedContent: string): Promise<void> {
    const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'text/plain'
      },
      body: encryptedContent
    });
    if (!response.ok) throw new Error('Failed to update the existing backup file.');
  }
}
