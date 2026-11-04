import type { ID, Profile, ProfileState } from '../../domain/types';
import type { StorageAdapter } from './adapter';

const DB_NAME = 'debt-manager';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('profiles')) db.createObjectStore('profiles');
      if (!db.objectStoreNames.contains('backups')) db.createObjectStore('backups', { autoIncrement: true });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const promisify = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export class IndexedDBAdapter implements StorageAdapter {
  private db = openDb();

  private async store(name: string, mode: IDBTransactionMode = 'readonly') {
    return (await this.db).transaction(name, mode).objectStore(name);
  }

  async load(profileId: ID) {
    return (await promisify((await this.store('profiles')).get(profileId))) ?? null;
  }

  async save(state: ProfileState) {
    await promisify((await this.store('profiles', 'readwrite')).put(state, state.profile.id));
  }

  async listProfiles(): Promise<Profile[]> {
    const all = (await promisify((await this.store('profiles')).getAll())) as { profile?: Profile }[];
    return all.map((s) => s.profile).filter((p): p is Profile => !!p);
  }

  async deleteProfile(id: ID) {
    await promisify((await this.store('profiles', 'readwrite')).delete(id));
  }

  async backup(profileId: ID, raw: unknown, reason: string) {
    await promisify((await this.store('backups', 'readwrite')).add({ profileId, reason, at: new Date().toISOString(), raw }));
  }

  async getMeta<T>(key: string) {
    return (await promisify((await this.store('meta')).get(key))) as T | undefined;
  }

  async setMeta(key: string, value: unknown) {
    await promisify((await this.store('meta', 'readwrite')).put(value, key));
  }
}
