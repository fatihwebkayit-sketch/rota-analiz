import { useEffect, useMemo, useState } from 'react';
import type { ActivityType, ParsedFile, RouteRecord } from '../../core/types';
import { useApp } from '../../state/store';
import { analyzeInWorker, parseInWorker } from '../../workers/client';
import { getSourceBytes } from '../../storage/repo';
import type { AnalysisResult } from '../../workers/protocol';
import { MapView } from '../../map/MapView';
import { LayerControl } from '../../map/LayerControl';
import { MetricsPanel } from './MetricsPanel';

export function AnalysisView() {
  const { records, openId, folderHandle, folderState, saveRecord, toast } = useApp();
  const record = useMemo(() => records.find((r) => r.id === openId) ?? null, [records, openId]);
  const [parsed, setParsed] = useState<{ id: string; p: ParsedFile } | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Orijinal dosyayı oku ve ayrıştır
  useEffect(() => {
    if (!record) return;
    let alive = true;
    setResult(null);
    setError(null);
    (async () => {
      const bytes = await getSourceBytes(record, folderState === 'granted' ? folderHandle : undefined);
      if (!bytes) throw new Error('Kaynak dosya bulunamadı. Veri klasörüne erişim izni gerekebilir.');
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
        // Hesaplama kuralları değiştiyse kayıtlı özet güncellenir
        if (Math.abs(res.metrics.distanceM - record.metrics.distanceM) > 0.5 || res.metrics.trim.startIdx !== record.metrics.trim.startIdx || res.metrics.trim.endIdx !== record.metrics.trim.endIdx || res.metrics.movingSec !== record.metrics.movingSec) {
          saveRecord({ ...record, metrics: res.metrics, preview: res.preview });
        }
      })
      .catch((e) => alive && setError((e as Error).message));
    return () => { alive = false; };
  }, [parsed, record?.activity, record?.autoTrim]);

  if (!record) return <div className="flex h-full items-center justify-center text-fg-muted">Arşivden bir kayıt seçin.</div>;

  const update = (p: Partial<RouteRecord>) => saveRecord({ ...record, ...p }).catch((e) => toast((e as Error).message, 'error'));

  return (
    <div className="flex h-full">
      <div className="relative min-w-0 flex-1">
        <MapView result={result} activity={record.activity} />
        <LayerControl />
        {!result && !error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-[3px] bg-ink-900/90 px-3 py-1.5 text-[12px] text-fg-muted">Rota hazırlanıyor…</span>
          </div>
        )}
        {error && (
          <div className="absolute inset-x-0 top-4 mx-auto w-fit rounded-[3px] border border-down/50 bg-[#2a1715] px-3 py-2 text-[12px] text-[#f2b8b0]">{error}</div>
        )}
      </div>
      <MetricsPanel
        record={record}
        result={result}
        onRename={(name) => update({ name })}
        onActivity={(activity: ActivityType) => update({ activity })}
        onPlaces={(startPlace, endPlace) => update({ startPlace, endPlace })}
        onNotes={(notes) => update({ notes })}
        onAutoTrim={(autoTrim) => update({ autoTrim })}
      />
    </div>
  );
}
