import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ActivityType, ParsedFile, RouteRecord, SavedSegment } from '../../core/types';
import { useApp } from '../../state/store';
import { analyzeInWorker, parseInWorker } from '../../workers/client';
import { getSourceBytes, newId } from '../../storage/repo';
import type { AnalysisResult } from '../../workers/protocol';
import { MapView, type Selection } from '../../map/MapView';
import { LayerControl } from '../../map/LayerControl';
import { ProfileChart } from '../../charts/ProfileChart';
import { MetricsPanel } from './MetricsPanel';
import { SegmentPanel } from './SegmentPanel';
import { ExportDialog } from '../export/ExportDialog';
import { lazy, Suspense } from 'react';
const AnimationStudio = lazy(() => import('../animation/AnimationStudio').then((m) => ({ default: m.AnimationStudio })));
import { PROFILES } from '../../analysis/activity';
import { computeSegment, cumulativeClimb, gradeSeries, indexAtDistance, segOfArray } from '../../analysis/segment';

export function AnalysisView() {
  const { records, openId, folderHandle, folderState, patchRecord, toast, exportOpen, setExportOpen, vehicles, animOpen, setAnimOpen } = useApp();
  const record = useMemo(() => records.find((r) => r.id === openId) ?? null, [records, openId]);
  const [parsed, setParsed] = useState<{ id: string; p: ParsedFile } | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ idx: number | null; fromChart: boolean }>({ idx: null, fromChart: false });
  const [selection, setSelection] = useState<Selection | null>(null);
  const [pickMode, setPickMode] = useState(false);
  const [activeSaved, setActiveSaved] = useState<string | null>(null);
  const [pinReq, setPinReq] = useState<{ idx: number; n: number } | null>(null);
  const [pinnedIdx, setPinnedIdx] = useState<number | null>(null);

  // Orijinal dosyayı oku ve ayrıştır
  useEffect(() => {
    if (!record) return;
    let alive = true;
    setResult(null);
    setError(null);
    setSelection(null);
    setPickMode(false);
    (async () => {
      const bytes = await getSourceBytes(record, folderState === 'granted' ? folderHandle : undefined);
      if (!bytes) throw new Error('Kaynak dosya bulunamadı. Veri klasörüne erişim izni gerekebilir (sağ üstteki düğme).');
      const { parsed: p } = await parseInWorker(record.source.fileName, bytes);
      if (alive) setParsed({ id: record.id, p });
    })().catch((e) => alive && setError((e as Error).message));
    return () => { alive = false; };
  }, [record?.id, folderState]);

  // Tür veya kırpma değişince yeniden analiz
  useEffect(() => {
    if (!record || !parsed || parsed.id !== record.id) return;
    let alive = true;
    analyzeInWorker(parsed.p, record.activity, record.autoTrim)
      .then((res) => {
        if (!alive) return;
        setResult(res);
        const m = record.metrics;
        if (Math.abs(res.metrics.distanceM - m.distanceM) > 0.5 || res.metrics.trim.startIdx !== m.trim.startIdx || res.metrics.trim.endIdx !== m.trim.endIdx || res.metrics.movingSec !== m.movingSec) {
          patchRecord(record.id, { metrics: res.metrics, preview: res.preview });
        }
      })
      .catch((e) => alive && setError((e as Error).message));
    return () => { alive = false; };
  }, [parsed, record?.activity, record?.autoTrim]);

  // Türetilmiş seriler
  const derived = useMemo(() => {
    if (!result || !record) return null;
    const segOf = segOfArray(result.route);
    const grade = gradeSeries(result.route, result.cum, PROFILES[record.activity].gradeWindowM);
    const climb = cumulativeClimb(result.route, segOf, result.metrics.trim.startIdx, result.metrics.trim.endIdx);
    return { segOf, grade, climb };
  }, [result, record?.activity]);

  const clamp = useCallback(
    (i: number) => (result ? Math.min(Math.max(i, result.metrics.trim.startIdx), result.metrics.trim.endIdx) : i),
    [result],
  );

  const segMetrics = useMemo(() => {
    if (!result || !derived || !record || !selection || selection.b == null || selection.a === selection.b) return null;
    return computeSegment(result, derived.grade, derived.segOf, record.activity, selection.a, selection.b);
  }, [result, derived, selection, record?.activity]);

  const savedMetrics = useMemo(() => {
    if (!result || !derived || !record) return [];
    const n = result.route.lat.length;
    return (record.segments ?? [])
      .filter((s) => s.a < n && s.b < n)
      .map((s) => ({ s, m: computeSegment(result, derived.grade, derived.segOf, record.activity, s.a, s.b) }));
  }, [result, derived, record?.segments, record?.activity]);

  const onCursorMap = useCallback((idx: number | null) => setCursor({ idx, fromChart: false }), []);
  const onCursorChart = useCallback((idx: number | null) => setCursor({ idx, fromChart: true }), []);

  const onPick = useCallback(
    (raw: number) => {
      const i = clamp(raw);
      setActiveSaved(null);
      setSelection((s) => {
        if (!s || s.b != null) return { a: i, b: null };
        setPickMode(false);
        return i === s.a ? s : { a: Math.min(s.a, i), b: Math.max(s.a, i) };
      });
    },
    [clamp],
  );

  // Esc: seçim modundan çık
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPickMode(false); setSelection((s) => (s && s.b == null ? null : s)); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  if (!record) return <div className="flex h-full items-center justify-center text-fg-muted">Arşivden bir kayıt seçin.</div>;

  const update = (p: Partial<RouteRecord>) => patchRecord(record.id, p).catch((e) => toast((e as Error).message, 'error'));

  const saveSegment = (name: string) => {
    if (!selection || selection.b == null) return;
    const s: SavedSegment = { id: newId(), name, a: selection.a, b: selection.b };
    update({ segments: [...(record.segments ?? []), s] });
    setActiveSaved(s.id);
    toast(`“${name}” bölümü kaydedildi`);
  };

  const totalKm = result ? result.cum[result.metrics.trim.endIdx] / 1000 : 0;

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1">
          <MapView
            result={result}
            activity={record.activity}
            grade={derived?.grade ?? null}
            externalCursor={cursor.fromChart ? cursor.idx : null}
            onCursor={onCursorMap}
            selection={selection}
            pickMode={pickMode}
            onPick={onPick}
            pinRequest={pinReq}
            onPinChange={setPinnedIdx}
          />
          <LayerControl />
          {pickMode && (
            <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-[3px] border border-amber/50 bg-ink-900/95 px-3 py-1.5 text-[12px] text-amber">
              {selection && selection.b == null ? 'Bitiş noktasına (B) tıklayın' : 'Başlangıç noktasına (A) tıklayın'} · Esc: vazgeç
            </div>
          )}
          {!result && !error && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="rounded-[3px] bg-ink-900/90 px-3 py-1.5 text-[12px] text-fg-muted">Rota hazırlanıyor…</span>
            </div>
          )}
          {error && (
            <div className="absolute inset-x-0 top-4 mx-auto w-fit rounded-[3px] border border-down/50 bg-[#2a1715] px-3 py-2 text-[12px] text-[#f2b8b0]">{error}</div>
          )}
        </div>
        {result && derived && (
          <div className="h-[230px] shrink-0 border-t border-ink-700 bg-ink-900">
            <ProfileChart
              result={result}
              grade={derived.grade}
              climb={derived.climb}
              activity={record.activity}
              cursorIdx={cursor.idx}
              cursorFromChart={cursor.fromChart}
              onCursor={onCursorChart}
              selection={selection}
              onPin={(idx) => setPinReq((p) => ({ idx, n: (p?.n ?? 0) + 1 }))}
              pinnedIdx={pinnedIdx}
              onSelectRange={(a, b) => { setActiveSaved(null); setPickMode(false); setSelection({ a, b }); }}
            />
          </div>
        )}
      </div>
      {animOpen && result && derived && (
        <Suspense fallback={null}>
          <AnimationStudio
            ctx={{ record, result, grade: derived.grade, activity: record.activity, saved: [] }}
            onClose={() => setAnimOpen(false)}
          />
        </Suspense>
      )}
      {exportOpen && result && derived && (
        <ExportDialog
          ctx={{ record, result, grade: derived.grade, activity: record.activity, saved: savedMetrics.map(({ s, m }) => ({ name: s.name, m })), vehicle: vehicles.find((v) => v.id === record.fuel?.vehicleId) }}
          selection={selection}
          onClose={() => setExportOpen(false)}
        />
      )}
      <MetricsPanel
        record={record}
        result={result}
        onRename={(name) => update({ name })}
        onActivity={(activity: ActivityType) => update({ activity })}
        onPlaces={(startPlace, endPlace) => update({ startPlace, endPlace })}
        onNotes={(notes) => update({ notes })}
        onAutoTrim={(autoTrim) => update({ autoTrim })}
        onTags={(tags) => update({ tags })}
        onFuel={(fuel) => update({ fuel })}
        top={
          result && (
            <SegmentPanel
              activity={record.activity}
              pickMode={pickMode}
              hasSelection={!!selection}
              seg={segMetrics}
              saved={savedMetrics}
              activeSavedId={activeSaved}
              maxKm={totalKm}
              onStartPick={() => { setSelection(null); setPickMode(true); }}
              onCancelPick={() => { setPickMode(false); setSelection(null); }}
              onClear={() => { setSelection(null); setActiveSaved(null); setPickMode(false); }}
              onKmRange={(ka, kb) => {
                const { startIdx, endIdx } = result.metrics.trim;
                const a = indexAtDistance(result.cum, ka * 1000, startIdx, endIdx);
                const b = indexAtDistance(result.cum, kb * 1000, startIdx, endIdx);
                if (b > a) { setActiveSaved(null); setSelection({ a, b }); }
              }}
              onSave={saveSegment}
              onSelectSaved={(s) => { setActiveSaved(s.id); setSelection({ a: s.a, b: s.b }); }}
              onDeleteSaved={(id) => { update({ segments: (record.segments ?? []).filter((x) => x.id !== id) }); if (activeSaved === id) setActiveSaved(null); }}
            />
          )
        }
      />
    </div>
  );
}
