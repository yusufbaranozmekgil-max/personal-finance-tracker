import { Injectable, signal } from '@angular/core';

/**
 * Tarayıcının çevrimiçi/çevrimdışı durumunu izler.
 * `navigator.onLine` + window event listener'ları üzerinden.
 */
@Injectable({ providedIn: 'root' })
export class ConnectionService {
  online = signal<boolean>(navigator.onLine);

  constructor() {
    window.addEventListener('online', () => this.online.set(true));
    window.addEventListener('offline', () => this.online.set(false));
  }

  get isOffline(): boolean {
    return !this.online();
  }
}
