// Tüm arşivin tek .zip dosyası olarak yedeklenmesi ve geri yüklenmesi.
// Zip içi yapı veri klasörüyle aynıdır; istenirse elle de açılıp incelenebilir.
import JSZip from 'jszip';
import type { RouteRecord } from '../core/types';
import { db } from './db';
import { folderNameFor } from './folder';
import { getSourceBytes } from './repo';
import { loadLocal } from './settings';

const extOf = (name: string) => (name.split('.').pop() || 'dat').toLowerCase();

export async function exportBackup(root?: FileSystemDirectoryHandle): Promise<{ blob: Blob; count: number; missing: number }> {
  const zip = new JSZip();
  const all = (await (await db()).getAll('records')).filter((r) => !r.deletedAt);
  let missing = 0;
  for (const r of all) {
    const dir = zip.folder(r.folderName ?? folderNameFor(r))!;
    const { metrics, preview, ...meta } = r;
    dir.file('kayit.json', JSON.stringify(meta, null, 2));
    dir.file('metrikler.json', JSON.stringify({ metrics, preview }));
    const bytes = await getSourceBytes(r, root).catch(() => undefined);
    if (bytes) dir.file(`kaynak.${extOf(r.source.fileName)}`, bytes);
    else missing++;
  }
  const s = await loadLocal();
  const sd = zip.folder('_ayarlar')!;
  sd.file('araclar.json', JSON.stringify(s.vehicles, null, 2));
  sd.file('yakit-fiyatlari.json', JSON.stringify(s.fuelPrices, null, 2));
  sd.file('tercihler.json', JSON.stringify(s.prefs, null, 2));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { blob, count: all.length, missing };
}

export interface RestoreItem { record: RouteRecord; bytes?: ArrayBuffer }

export async function readBackup(file: File): Promise<{ items: RestoreItem[]; settings: Record<string, any> }> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const dirs = new Map<string, Record<string, JSZip.JSZipObject>>();
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    const parts = path.split('/').filter(Boolean);
    if (parts.length < 2) return;
    const d = parts[parts.length - 2];
    const name = parts[parts.length - 1];
    if (!dirs.has(d)) dirs.set(d, {});
    dirs.get(d)![name] = entry;
  });
  const items: RestoreItem[] = [];
  const settings: Record<string, any> = {};
  for (const [d, files] of dirs) {
    if (d === '_ayarlar') {
      for (const [n, e] of Object.entries(files)) {
        try { settings[n] = JSON.parse(await e.async('string')); } catch { /* bozuk */ }
      }
      continue;
    }
    if (!files['kayit.json'] || !files['metrikler.json']) continue;
    try {
      const meta = JSON.parse(await files['kayit.json'].async('string'));
      const mx = JSON.parse(await files['metrikler.json'].async('string'));
      if (meta?.schemaVersion !== 1 || !meta.id) continue;
      const src = Object.keys(files).find((n) => n.startsWith('kaynak.'));
      const bytes = src ? await files[src].async('arraybuffer') : undefined;
      items.push({ record: { ...meta, metrics: mx.metrics, preview: mx.preview ?? [], folderName: undefined }, bytes });
    } catch {
      /* atla */
    }
  }
  return { items, settings };
}

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
