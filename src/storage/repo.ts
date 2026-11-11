// Kayıt deposu: klasör bağlıysa gerçek kaynak klasördür; IndexedDB hızlı önbellek ve klasörsüz kullanım içindir.
import type { RouteRecord } from '../core/types';
import { db } from './db';
import * as folder from './folder';

const TRASH_DAYS = 30;

export async function listRecords(): Promise<RouteRecord[]> {
  return (await db()).getAll('records');
}

export async function putRecord(r: RouteRecord, bytes: ArrayBuffer | undefined, root?: FileSystemDirectoryHandle) {
  const d = await db();
  let rec = r;
  if (root) {
    const folderName = await folder.writeRecord(root, r, bytes);
    rec = { ...r, folderName };
  }
  await d.put('records', rec);
  if (bytes) await d.put('files', { id: r.id, fileName: r.source.fileName, bytes });
  return rec;
}

export async function updateRecord(r: RouteRecord, root?: FileSystemDirectoryHandle) {
  const rec = { ...r, updatedAt: Date.now() };
  return putRecord(rec, undefined, root);
}

export async function getSourceBytes(r: RouteRecord, root?: FileSystemDirectoryHandle): Promise<ArrayBuffer | undefined> {
  const d = await db();
  const cached = await d.get('files', r.id);
  if (cached) return cached.bytes;
  if (root) {
    const bytes = await folder.readSource(root, r);
    if (bytes) await d.put('files', { id: r.id, fileName: r.source.fileName, bytes });
    return bytes;
  }
  return undefined;
}

export async function softDelete(r: RouteRecord, root?: FileSystemDirectoryHandle) {
  return updateRecord({ ...r, deletedAt: Date.now() }, root);
}

/** 30 günü geçen çöp kutusu kayıtlarını kalıcı siler. */
export async function purgeTrash(root?: FileSystemDirectoryHandle) {
  const d = await db();
  const limit = Date.now() - TRASH_DAYS * 864e5;
  for (const r of await d.getAll('records')) {
    if (r.deletedAt && r.deletedAt < limit) {
      if (root && r.folderName) await folder.removeRecordDir(root, r.folderName);
      await d.delete('records', r.id);
      await d.delete('files', r.id);
    }
  }
}

/**
 * Klasörü tarar; başka bilgisayarda eklenen/değişen kayıtları önbelleğe alır.
 * Klasörde olmayan ama önbellekte olan (yalnız bu tarayıcıda kaydedilmiş) kayıtları klasöre yazar.
 * Aynı kayıt iki yerde değiştiyse son değişiklik kazanır.
 */
export async function syncWithFolder(root: FileSystemDirectoryHandle): Promise<{ added: number; conflicts: number }> {
  const d = await db();
  const onDisk = await folder.scanFolder(root);
  const local = new Map((await d.getAll('records')).map((r) => [r.id, r]));
  let added = 0, conflicts = 0;
  for (const r of onDisk) {
    const l = local.get(r.id);
    if (!l) {
      await d.put('records', r);
      added++;
    } else if (r.updatedAt > l.updatedAt) {
      await d.put('records', r);
      conflicts++;
    } else if (l.updatedAt > r.updatedAt) {
      await folder.writeRecord(root, l);
    }
    local.delete(r.id);
  }
  // Yalnızca bu tarayıcıda olan kayıtları klasöre taşı
  for (const l of local.values()) {
    if (l.folderName) continue; // klasörde vardı ama silinmiş: başka bilgisayar kalıcı silmiş olabilir
    const f = await d.get('files', l.id);
    const folderName = await folder.writeRecord(root, l, f?.bytes);
    await d.put('records', { ...l, folderName });
  }
  return { added, conflicts };
}

export function findDuplicate(records: RouteRecord[], sha256: string) {
  return records.find((r) => r.source.sha256 === sha256 && !r.deletedAt);
}

export const newId = () =>
  (crypto as any).randomUUID?.() ?? 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
