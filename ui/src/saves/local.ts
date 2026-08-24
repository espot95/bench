/**
 * Backend LOCALE: IndexedDB (localStorage non basta — un salvataggio pesa ~2.7 MB).
 * Nessuna dipendenza: wrapper minimo a Promise sulle API native.
 */

import { type SaveFile, saveFromText, saveToText } from '../../../src/persistence/codec';
import type { SaveStore, SaveSummary } from './store';

const DB_NAME = 'bench-saves';
const STORE = 'saves';
const DB_VERSION = 1;

interface SaveRecord extends SaveSummary {
  text: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB non disponibile in questo browser'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Apertura IndexedDB fallita'));
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Operazione IndexedDB fallita'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, mode);
    const out = await request(fn(tx.objectStore(STORE)));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Transazione IndexedDB fallita'));
      tx.onabort = () => reject(tx.error ?? new Error('Transazione IndexedDB annullata'));
    });
    return out;
  } finally {
    db.close();
  }
}

export class LocalSaveStore implements SaveStore {
  readonly kind = 'local' as const;

  async list(): Promise<SaveSummary[]> {
    const rows = await withStore('readonly', (s) => s.getAll() as IDBRequest<SaveRecord[]>);
    return rows
      .map(({ id, meta, updatedAt, bytes }) => ({ id, meta, updatedAt, bytes }))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  async load(id: string): Promise<SaveFile> {
    const row = await withStore('readonly', (s) => s.get(id) as IDBRequest<SaveRecord | undefined>);
    if (!row) throw new Error('Salvataggio non trovato');
    return saveFromText(row.text);
  }

  async put(id: string, file: SaveFile): Promise<void> {
    const text = saveToText(file);
    const rec: SaveRecord = {
      id,
      meta: file.meta,
      updatedAt: file.meta.savedAt,
      bytes: text.length,
      text,
    };
    await withStore('readwrite', (s) => s.put(rec));
  }

  async remove(id: string): Promise<void> {
    await withStore('readwrite', (s) => s.delete(id));
  }
}

export const localStore = new LocalSaveStore();
