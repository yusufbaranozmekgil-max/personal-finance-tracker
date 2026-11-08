/** Minimal promise wrapper over one IndexedDB object store. */

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDb(name: string, store: string, create: boolean): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name);
    let created = false;
    req.onupgradeneeded = () => {
      created = true;
      if (create) req.result.createObjectStore(store);
    };
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(store)) {
        db.close();
        // Opening a name that never existed creates an empty database; remove it again.
        if (created && !create) indexedDB.deleteDatabase(name);
        resolve(null);
        return;
      }
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('The database is open in another tab with an older version.'));
  });
}

export class KvStore {
  private db: Promise<IDBDatabase | null>;

  constructor(private name: string, private store: string, create = true) {
    this.db = openDb(name, store, create);
  }

  async get<T>(key: string): Promise<T | undefined> {
    const db = await this.db;
    if (!db) return undefined;
    return request(db.transaction(this.store).objectStore(this.store).get(key));
  }

  async keys(): Promise<string[]> {
    const db = await this.db;
    if (!db) return [];
    return (await request(db.transaction(this.store).objectStore(this.store).getAllKeys())).map(String);
  }

  async set(key: string, value: unknown): Promise<void> {
    const db = await this.db;
    if (!db) throw new Error(`Store ${this.name} is not available.`);
    const tx = db.transaction(this.store, 'readwrite');
    tx.objectStore(this.store).put(value, key);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Write aborted (storage may be full).'));
    });
  }

  async delete(key: string): Promise<void> {
    const db = await this.db;
    if (!db) return;
    const tx = db.transaction(this.store, 'readwrite');
    tx.objectStore(this.store).delete(key);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
