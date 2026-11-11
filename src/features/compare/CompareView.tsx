import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { RouteRecord } from '../../core/types';
import { useApp } from '../../state/store';
import { getSourceBytes } from '../../storage/repo';
import { analyzeInWorker, parseInWorker } from '../../workers/client';
import type { AnalysisResult } from '../../workers/protocol';
import { baseStyle } from '../../map/layers';
import { CHART_TEXT, TOOLTIP, useEChart } from '../../charts/useEChart';
import { fmtDate, fmtDuration, fmtKm, fmtKmh, fmtM, fmtPace, fmt1 } from '../../core/format';
import { tr } from '../../i18n/tr';
import { PROFILES } from '../../analysis/activity';

const PALETTE = ['#f0a03c', '#5aa9e6', '#5fb57f', '#c792ea'];

interface Item { rec: RouteRecord; res: AnalysisResult; color: string }

export function CompareView() {
  const { compareIds, records, folderHandle, folderState, baseLayer, setView, openRecord } = useApp();
  const recs = useMemo(() => compareIds.map((id) => records.find((r) => r.id === id)).filter(Boolean) as RouteRecord[], [compareIds, records]);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Item[] = [];
      for (const [i, rec] of recs.entries()) {
        const bytes = await getSourceBytes(rec, folderState === 'granted' ? folderHandle : undefined);
        if (!bytes) throw new Error(`“${rec.name}” için kaynak dosya bulunamadı.`);
        const { parsed } = await parseInWorker(rec.source.fileName, bytes);
        const res = await analyzeInWorker(parsed, rec.activity, rec.autoTrim);
        out.push({ rec, res, color: PALETTE[i % PALETTE.length] });
      }
      if (alive) setItems(out);
    })().catch((e) => alive && setError((e as Error).message));
    return () => { alive = false; };
  }, [recs.map((r) => r.id).join()]);

  // Harita
  const mapEl = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!items.length) return;
    const map = new maplibregl.Map({ container: mapEl.current!, style: baseStyle(baseLayer) as any, center: [35, 39], zoom: 5, attributionControl: { compact: true } });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    let bb = [Infinity, Infinity, -Infinity, -Infinity];
    const draw = () => {
      items.forEach((it, k) => {
        const r = it.res.route;
        const { startIdx, endIdx } = it.res.metrics.trim;
        const coords: [number, number][] = [];
        const step = Math.max(1, Math.floor((endIdx - startIdx) / 5000));
        for (let i = startIdx; i <= endIdx; i += step) coords.push([r.lon[i], r.lat[i]]);
        const id = `c${k}`;
        if (!map.getSource(id)) {
          map.addSource(id, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } } });
          map.addLayer({ id: id + 'c', type: 'line', source: id, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#000', 'line-width': 6, 'line-opacity': 0.5 } });
          map.addLayer({ id, type: 'line', source: id, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': it.color, 'line-width': 3 } });
        }
        const b = it.res.metrics.bbox;
        if (b) bb = [Math.min(bb[0], b[0]), Math.min(bb[1], b[1]), Math.max(bb[2], b[2]), Math.max(bb[3], b[3])];
      });
      if (isFinite(bb[0])) map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 50, duration: 0 });
    };
    let drawn = false;
    map.on('style.load', () => { drawn = true; draw(); });
    map.on('error', () => {
      if (drawn) return;
      drawn = true;
      map.setStyle({ version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#16171a' } }] });
    });
    return () => map.remove();
  }, [items, baseLayer]);

  // Üst üste rakım profilleri
  const option = useMemo(() => {
    const series = items.map((it) => {
      const { startIdx, endIdx } = it.res.metrics.trim;
      const r = it.res.route;
      const step = Math.max(1, Math.floor((endIdx - startIdx) / 1500));
      const data: [number, number | null][] = [];
      for (let i = startIdx; i <= endIdx; i += step) data.push([+(it.res.cum[i] / 1000).toFixed(3), isFinite(r.ele[i]) ? Math.round(r.ele[i]) : null]);
      return { name: it.rec.name, type: 'line', showSymbol: false, data, lineStyle: { color: it.color, width: 1.6 }, itemStyle: { color: it.color }, emphasis: { disabled: true } };
    });
    return {
      grid: { left: 50, right: 14, top: 30, bottom: 26 },
      legend: { top: 0, right: 0, textStyle: CHART_TEXT, itemWidth: 14, itemHeight: 3, icon: 'rect' },
      tooltip: { ...TOOLTIP, trigger: 'axis', valueFormatter: (v: number) => (v == null ? '—' : `${v.toLocaleString('tr-TR')} m`) },
      xAxis: { type: 'value', min: 0, axisLabel: { ...CHART_TEXT, formatter: (v: number) => `${fmt1(v)} km` }, splitLine: { show: false }, axisLine: { lineStyle: { color: '#25272b' } } },
      yAxis: { type: 'value', name: 'm', scale: true, nameTextStyle: CHART_TEXT, axisLabel: CHART_TEXT, splitLine: { lineStyle: { color: '#25272b' } } },
      series,
    };
  }, [items]);
  const chartEl = useEChart(option);

  if (recs.length < 2) return <div className="flex h-full items-center justify-center text-fg-muted">Karşılaştırmak için arşivde en az iki kayıt seçin.</div>;

  type Row = [string, (it: Item) => string, ((it: Item) => number | null)?, ('max' | 'min')?];
  const rows: Row[] = [
    ['Tarih', (it) => fmtDate(it.res.metrics.startTime ?? it.rec.createdAt)],
    ['Tür', (it) => tr.activity[it.rec.activity]],
    ['Mesafe', (it) => fmtKm(it.res.metrics.distanceM), (it) => it.res.metrics.distanceM, 'max'],
    ['Geçen süre', (it) => fmtDuration(it.res.metrics.elapsedSec), (it) => it.res.metrics.elapsedSec, 'min'],
    ['Hareket süresi', (it) => fmtDuration(it.res.metrics.movingSec), (it) => it.res.metrics.movingSec, 'min'],
    ['Ort. hız / tempo', (it) => (PROFILES[it.rec.activity].showPace ? fmtPace(it.res.metrics.avgSpeedKmh) : fmtKmh(it.res.metrics.avgSpeedKmh)), (it) => it.res.metrics.avgSpeedKmh, 'max'],
    ['Maks. hız', (it) => fmtKmh(it.res.metrics.maxSpeedKmh), (it) => it.res.metrics.maxSpeedKmh, 'max'],
    ['Toplam tırmanış', (it) => fmtM(it.res.metrics.ascentM), (it) => it.res.metrics.ascentM, 'max'],
    ['Toplam iniş', (it) => fmtM(it.res.metrics.descentM)],
    ['En yüksek rakım', (it) => fmtM(it.res.metrics.maxEle), (it) => it.res.metrics.maxEle, 'max'],
    ['Duraklama', (it) => String(it.res.metrics.stopCount)],
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-ink-700 bg-ink-900 px-3 py-2">
        <button className="ra-btn" onClick={() => setView('archive')}>← Arşive dön</button>
        <span className="text-[12.5px] text-fg-muted">{recs.length} rota karşılaştırılıyor</span>
      </div>
      {error && <div className="m-3 rounded-[3px] border border-down/50 bg-[#2a1715] px-3 py-2 text-[12px] text-[#f2b8b0]">{error}</div>}
      {!items.length && !error && <div className="flex flex-1 items-center justify-center text-fg-muted">Rotalar hazırlanıyor…</div>}
      {items.length > 0 && (
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_440px]">
          <div className="flex min-h-0 flex-col">
            <div ref={mapEl} className="min-h-[300px] flex-1" />
            <div className="h-[220px] shrink-0 border-t border-ink-700 bg-ink-900 p-2">
              <div ref={chartEl} className="h-full" />
            </div>
          </div>
          <div className="overflow-y-auto border-l border-ink-700 bg-ink-850 p-3">
            <table className="w-full text-[12px] tnum">
              <thead>
                <tr>
                  <th />
                  {items.map((it) => (
                    <th key={it.rec.id} className="pb-2 text-right font-medium">
                      <button onClick={() => openRecord(it.rec.id)} className="inline-flex items-center gap-1.5 hover:text-amber" title="Analizde aç">
                        <span className="inline-block h-[3px] w-3" style={{ background: it.color }} />
                        <span className="max-w-[110px] truncate">{it.rec.name}</span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, fmt, val, best]) => {
                  const vals = val ? items.map((it) => val(it)) : [];
                  const finite = vals.filter((v): v is number => v != null && isFinite(v));
                  const target = best === 'max' ? Math.max(...finite) : best === 'min' ? Math.min(...finite) : null;
                  return (
                    <tr key={label} className="border-t border-ink-700">
                      <td className="py-1.5 text-fg-muted">{label}</td>
                      {items.map((it, k) => (
                        <td key={it.rec.id} className={`text-right ${target != null && finite.length > 1 && vals[k] === target ? 'text-amber' : 'text-fg'}`}>{fmt(it)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-[10.5px] text-fg-faint">Turuncu: o satırdaki en iyi değer (en uzun, en hızlı, en kısa süre vb.).</p>
          </div>
        </div>
      )}
    </div>
  );
}
