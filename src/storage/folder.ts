// Kullanıcının seçtiği veri klasörü (File System Access API). Her rota ayrı bir alt klasördür:
//   <klasör>/<YYYY-MM-DD>_<ad>_<kısa-id>/kaynak.<uzantı>  (orijinal, değiştirilmez)
//                                         kayit.json         (ad, tür, notlar, kırpma…)
//                                         metrikler.json     (hesaplanmış özet)
import type { RouteRecord } from '../core/types';
import { isoDateTR, safeName } from '../core/format';
import { kvGet, kvSet } from './db';

export type FolderState = 'unsupported' | 'none' | 'prompt' | 'granted';
const KEY = 'dirHandle';

export const fsSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window && window.self === window.top;

export async function loadHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  return kvGet<FileSystemDirectoryHandle>(KEY);
}

export async function folderState(h?: FileSystemDirectoryHandle): Promise<FolderState> {
  if (!fsSupported()) return 'unsupported';
  if (!h) return 'none';
  const p = await (h as any).queryPermission({ mode: 'readwrite' });
  return p === 'granted' ? 'granted' : 'prompt';
}

export async function pickFolder(): Promise<FileSystemDirectoryHandle> {
  const h: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({ id: 'rota-analiz', mode: 'readwrite', startIn: 'documents' });
  await kvSet(KEY, h);
  return h;
}

/** Kullanıcı hareketiyle çağrılmalı (düğme tıklaması). */
export async function requestAccess(h: FileSystemDirectoryHandle) {
  return (await (h as any).requestPermission({ mode: 'readwrite' })) === 'granted';
}

export function folderNameFor(r: RouteRecord) {
  const date = r.metrics.startTime ? isoDateTR(r.metrics.startTime) : isoDateTR(r.createdAt);
  return `${date}_${safeName(r.name)}_${r.id.slice(0, 6)}`;
}

const extOf = (name: string) => (name.split('.').pop() || 'dat').toLowerCase();

async function writeFile(dir: FileSystemDirectoryHandle, name: string, data: BlobPart) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await (fh as any).createWritable();
  await w.write(data);
  await w.close();
}

function splitRecord(r: RouteRecord) {
  const { metrics, preview, ...meta } = r;
  return { meta, metrics: { metrics, preview } };
}

export async function writeRecord(root: FileSystemDirectoryHandle, r: RouteRecord, bytes?: ArrayBuffer) {
  const name = r.folderName ?? folderNameFor(r);
  const dir = await root.getDirectoryHandle(name, { create: true });
  const { meta, metrics } = splitRecord({ ...r, folderName: name });
  if (bytes) await writeFile(dir, `kaynak.${extOf(r.source.fileName)}`, bytes);
  await writeFile(dir, 'kayit.json', JSON.stringify(meta, null, 2));
  await writeFile(dir, 'metrikler.json', JSON.stringify(metrics));
  return name;
}

export async function readSource(root: FileSystemDirectoryHandle, r: RouteRecord): Promise<ArrayBuffer | undefined> {
  if (!r.folderName) return undefined;
  try {
    const dir = await root.getDirectoryHandle(r.folderName);
    const fh = await dir.getFileHandle(`kaynak.${extOf(r.source.fileName)}`);
    return await (await fh.getFile()).arrayBuffer();
  } catch {
    return undefined;
  }
}

export async function removeRecordDir(root: FileSystemDirectoryHandle, folderName: string) {
  try {
    await root.removeEntry(folderName, { recursive: true });
  } catch {
    /* zaten yok */
  }
}

/** Klasördeki tüm kayıtları okur. Bozuk/eksik klasörler atlanır. */
export async function scanFolder(root: FileSystemDirectoryHandle): Promise<RouteRecord[]> {
  const out: RouteRecord[] = [];
  for await (const [name, handle] of (root as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
    if (handle.kind !== 'directory' || name.startsWith('.') || name.startsWith('_')) continue;
    try {
      const dir = handle as FileSystemDirectoryHandle;
      const meta = JSON.parse(await (await (await dir.getFileHandle('kayit.json')).getFile()).text());
      const mx = JSON.parse(await (await (await dir.getFileHandle('metrikler.json')).getFile()).text());
      if (meta?.schemaVersion !== 1 || !meta.id) continue;
      out.push({ ...meta, metrics: mx.metrics, preview: mx.preview ?? [], folderName: name });
    } catch {
      /* kayıt dışı klasör */
    }
  }
  return out;
}
