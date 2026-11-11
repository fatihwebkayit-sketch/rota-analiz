import { useEffect, useState } from 'react';
import type { ActivityType, ParsedFile, RouteRecord } from '../../core/types';
import { useApp } from '../../state/store';
import { analyzeInWorker, parseInWorker } from '../../workers/client';
import { findDuplicate, newId } from '../../storage/repo';
import { fmtDateTime } from '../../core/format';
import { tr } from '../../i18n/tr';
import { ActivityPicker } from '../../ui/ActivityPicker';

interface Item {
  key: string;
  file: File;
  status: 'parsing' | 'ready' | 'error' | 'saving' | 'saved';
  error?: string;
  parsed?: ParsedFile;
  bytes?: ArrayBuffer;
  sha256?: string;
  name: string;
  activity: ActivityType | null;
  duplicateOf?: string;
  firstTime?: number | null;
  points?: number;
}

export function ImportDialog() {
  const { importFiles, endImport, records, saveRecord, openRecord, toast } = useApp();
  const [items, setItems] = useState<Item[]>(() =>
    (importFiles ?? []).map((f, i) => ({ key: `${i}-${f.name}`, file: f, status: 'parsing', name: f.name.replace(/\.[^.]+$/, ''), activity: null })),
  );
  const [busy, setBusy] = useState(false);
  const patch = (key: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  useEffect(() => {
    items.forEach(async (it) => {
      try {
        const bytes = await it.file.arrayBuffer();
        const { parsed, sha256 } = await parseInWorker(it.file.name, bytes);
        const dup = findDuplicate(records, sha256);
        let first: number | null = null, n = 0;
        for (const t of parsed.tracks)
          for (const s of t.segments) {
            n += s.lat.length;
            if (first == null) first = s.time.find((x) => x != null) ?? null;
          }
        patch(it.key, { status: 'ready', parsed, bytes, sha256, name: parsed.name || it.name, duplicateOf: dup?.name, firstTime: first, points: n });
      } catch (e) {
        patch(it.key, { status: 'error', error: (e as Error).message });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ready = items.filter((i) => i.status === 'ready');
  const missingType = ready.some((i) => !i.activity);
  const parsing = items.some((i) => i.status === 'parsing');

  async function saveAll() {
    setBusy(true);
    let lastId: string | null = null;
    for (const it of items) {
      if (it.status !== 'ready' || !it.parsed || !it.activity || !it.bytes) continue;
      patch(it.key, { status: 'saving' });
      try {
        const res = await analyzeInWorker(it.parsed, it.activity, true);
        const now = Date.now();
        const rec: RouteRecord = {
          id: newId(),
          schemaVersion: 1,
          name: it.name.trim() || it.file.name,
          activity: it.activity,
          createdAt: now,
          updatedAt: now,
          startPlace: '',
          endPlace: '',
          tags: [],
          notes: '',
          source: {
            fileName: it.file.name,
            format: it.parsed.format,
            sha256: it.sha256!,
            size: it.bytes.byteLength,
            creator: it.parsed.creator,
            stats: it.parsed.sourceStats,
          },
          autoTrim: true,
          metrics: res.metrics,
          preview: res.preview,
        };
        const saved = await saveRecord(rec, it.bytes);
        lastId = saved.id;
        patch(it.key, { status: 'saved' });
      } catch (e) {
        patch(it.key, { status: 'error', error: (e as Error).message });
      }
    }
    setBusy(false);
    const saved = items.filter((i) => i.status === 'ready').length;
    if (lastId) {
      toast(saved > 1 ? `${saved} rota kaydedildi` : 'Rota kaydedildi');
      endImport();
      openRecord(lastId);
    }
  }

  const setAll = (a: ActivityType) => setItems((xs) => xs.map((x) => (x.status === 'ready' ? { ...x, activity: a } : x)));

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-auto bg-ink-950/75 pt-[8vh]" onMouseDown={(e) => e.target === e.currentTarget && !busy && endImport()}>
      <div className="w-[min(760px,94vw)] rounded-[4px] border border-ink-600 bg-ink-850 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-700 px-4 py-2.5">
          <h2 className="text-[13px] font-semibold">{tr.importer.title}</h2>
          <span className="text-[11.5px] text-fg-muted">{items.length} dosya</span>
        </div>

        {ready.length > 1 && (
          <div className="flex items-center gap-2 border-b border-ink-700 px-4 py-2 text-[11.5px] text-fg-muted">
            Hepsine uygula:
            <ActivityPicker value={null} onChange={setAll} compact />
          </div>
        )}

        <ul className="max-h-[56vh] divide-y divide-ink-700 overflow-auto">
          {items.map((it) => (
            <li key={it.key} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate font-mono text-[11px] text-fg-faint">{it.file.name}</span>
                <span className="shrink-0 text-[11px] text-fg-faint tnum">
                  {it.status === 'parsing' && tr.importer.parsing}
                  {it.status === 'ready' && `${(it.points ?? 0).toLocaleString('tr-TR')} ${tr.importer.points} · ${fmtDateTime(it.firstTime)}`}
                  {it.status === 'saving' && 'Analiz ediliyor…'}
                  {it.status === 'saved' && 'Kaydedildi'}
                </span>
              </div>
              {it.status === 'error' && <p className="mt-1 text-[12px] text-down">{tr.importer.failed}: {it.error}</p>}
              {(it.status === 'ready' || it.status === 'saving') && (
                <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-3">
                  <input className="ra-input w-full" value={it.name} onChange={(e) => patch(it.key, { name: e.target.value })} aria-label={tr.importer.name} />
                  <ActivityPicker value={it.activity} onChange={(a) => patch(it.key, { activity: a })} />
                  {it.duplicateOf && (
                    <p className="col-span-2 text-[11.5px] text-amber">
                      {tr.importer.duplicate}: “{it.duplicateOf}”. Yine de kaydedebilirsiniz.
                    </p>
                  )}
                  {it.parsed?.warnings.map((w) => (
                    <p key={w} className="col-span-2 text-[11.5px] text-fg-muted">{w}</p>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between gap-3 border-t border-ink-700 px-4 py-2.5">
          <span className="text-[11.5px] text-fg-muted">{missingType && !parsing ? tr.importer.typeRequired : ''}</span>
          <div className="flex gap-2">
            <button className="ra-btn" onClick={endImport} disabled={busy}>{tr.actions.cancel}</button>
            <button className="ra-btn-primary" onClick={saveAll} disabled={busy || parsing || !ready.length || missingType}>
              {ready.length > 1 ? tr.actions.saveAll : tr.actions.save}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
