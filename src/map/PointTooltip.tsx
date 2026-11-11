import { useState } from 'react';
import type { ActivityType } from '../core/types';
import type { AnalysisResult } from '../workers/protocol';
import { fmtCoord, fmtDuration, fmtKm, fmtKmh, fmtM, fmtPace, fmtTime, fmt1 } from '../core/format';
import { PROFILES } from '../analysis/activity';
import { tr } from '../i18n/tr';

interface Props {
  result: AnalysisResult;
  grade: Float64Array | null;
  idx: number;
  x: number;
  y: number;
  pinned: boolean;
  activity: ActivityType;
  onClose(): void;
}

export function PointTooltip({ result, grade, idx, x, y, pinned, activity, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const r = result.route;
  const { startIdx, endIdx } = result.metrics.trim;
  const outside = idx < startIdx || idx > endIdx;
  const prof = PROFILES[activity];
  const lat = r.lat[idx], lon = r.lon[idx];
  const ele = r.ele[idx];
  const t0 = r.time[startIdx];
  const elapsed = isFinite(r.time[idx] - t0) ? (r.time[idx] - t0) / 1000 : null;
  const v = result.speedKmh[idx];
  const g = grade ? grade[idx] : NaN;
  const prevEle = idx > 0 ? r.ele[idx - 1] : NaN;
  const dEle = isFinite(ele) && isFinite(prevEle) ? ele - prevEle : null;
  const coord = fmtCoord(lat, lon);

  const copy = () =>
    navigator.clipboard?.writeText(coord).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });

  const rows: [string, string][] = [
    [tr.map.dist, fmtKm(result.cum[idx])],
    [tr.map.ele, isFinite(ele) ? fmtM(ele) : tr.metrics.noData],
  ];
  if (r.hasTime) {
    rows.push([tr.map.speed, isFinite(v) ? (prof.showPace ? `${fmtPace(v)} · ${fmtKmh(v)}` : fmtKmh(v)) : '—']);
    rows.push([tr.map.elapsed, fmtDuration(elapsed, true)]);
    rows.push([tr.map.clock, fmtTime(r.time[idx], true)]);
  }
  rows.push(['Eğim', isFinite(g) ? `%${fmt1(g)}` : '—']);
  rows.push(['Rakım değişimi', dEle == null ? '—' : `${dEle >= 0 ? '+' : ''}${fmt1(dEle)} m`]);

  // Konum MapView tarafından rotayla çakışmayacak şekilde hesaplanır (x, y = kutunun sol üst köşesi)
  const left = x;
  const top = y;

  return (
    <div className={`ra-tooltip absolute z-20 w-[230px] ${pinned ? '' : 'pointer-events-none'}`} style={{ left, top }}>
      <div className="flex items-center justify-between gap-2 border-b border-ink-600 px-2.5 py-1.5">
        <button onClick={copy} className="truncate font-mono text-[11px] text-fg hover:text-amber" title="Koordinatı kopyala">
          {copied ? tr.actions.copied : coord}
        </button>
        {pinned && (
          <button onClick={onClose} className="text-fg-faint hover:text-fg" aria-label="Kapat">×</button>
        )}
      </div>
      {outside && <div className="px-2.5 pt-1.5 text-2xs text-fg-faint">{tr.map.trimmed}</div>}
      {result.lowConf[idx] ? <div className="px-2.5 pt-1.5 text-2xs text-[#c792ea]">{tr.map.lowConfidence}</div> : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 px-2.5 py-1.5 text-[11.5px]">
        {rows.map(([k, val]) => (
          <div key={k} className="contents">
            <dt className="text-fg-muted">{k}</dt>
            <dd className="tnum text-right text-fg">{val}</dd>
          </div>
        ))}
      </dl>
      {pinned ? (
        <div className="flex gap-1.5 border-t border-ink-600 px-2.5 py-1.5">
          <button className="ra-chip" onClick={copy}>{copied ? tr.actions.copied : 'Kopyala'}</button>
          <a className="ra-chip" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${lat},${lon}`}>Haritalar</a>
          <a className="ra-chip" target="_blank" rel="noreferrer" href={`https://earth.google.com/web/search/${lat},${lon}`}>Earth</a>
        </div>
      ) : (
        <div className="border-t border-ink-600 px-2.5 py-1 text-[10.5px] text-fg-faint">
          <kbd className="rounded-[2px] border border-ink-500 px-1 text-fg-muted">C</kbd> kopyala · tıkla: sabitle
        </div>
      )}
    </div>
  );
}
