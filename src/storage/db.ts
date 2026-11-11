import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { RouteRecord } from '../core/types';

interface RotaDB extends DBSchema {
  records: { key: string; value: RouteRecord };
  files: { key: string; value: { id: string; fileName: string; bytes: ArrayBuffer } };
  kv: { key: string; value: any };
}

let dbp: Promise<IDBPDatabase<RotaDB>> | null = null;

export function db() {
  if (!dbp) {
    dbp = openDB<RotaDB>('rota-analiz', 1, {
      upgrade(d) {
        d.createObjectStore('records', { keyPath: 'id' });
        d.createObjectStore('files', { keyPath: 'id' });
        d.createObjectStore('kv');
      },
    });
  }
  return dbp;
}

export const kvGet = async <T>(k: string) => (await (await db()).get('kv', k)) as T | undefined;
export const kvSet = async (k: string, v: unknown) => (await db()).put('kv', v, k);
export const kvDel = async (k: string) => (await db()).delete('kv', k);

/** Tarayıcının veriyi kendiliğinden silmemesi için kalıcı depolama iste. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* desteklenmiyor */
  }
}
