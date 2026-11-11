import { useState } from 'react';
import type { ActivityType } from '../core/types';
import type { AnalysisResult } from '../workers/protocol';
import { fmtCoord, fmtDuration, fmtKm, fmtKmh, fmtM, fmtPace, fmtTime, fmt1 } from '../core/format';
import { PROFILES } from '../analysis/activity';
import { tr } from '../i18n/tr';

interface Props {
  result: AnalysisResult;
  idx: number;
  x: number;
  y: number;
  pinned: boolean;
  activity: ActivityType;
  onClose(): void;
}

/** Yerel eğim: ±25 m mesafe penceresi (Aşama 2'de türe göre pencere ve grafiklerle genişleyecek). */
function localGrade(res: AnalysisResult, i: number, halfM: number) {
  const { route: r, cum } = res;
  if (!isFinite(r.ele[i])) return null;
  let a = i, b = i;
  while (a > 0 && cum[i] - cum[a - 1] <= halfM && isFinite(r.ele[a - 1])) a--;
  while (b < r.lat.length - 1 && cum[b + 1] - cum[i] <= halfM && isFinite(r.ele[b + 1])) b++;
  const dist = cum[b] - cum[a];
  if (dist < halfM * 0.6) return null;
  return ((r.ele[b] - r.ele[a]) / dist) * 100;
}

export function PointTooltip({ result, idx, x, y, pinned, activity, onClose }: Props) {
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
  const grade = localGrade(result, idx, prof.gradeWindowM / 2);
  const prevEle = idx > startIdx ? r.ele[idx - 1] : NaN;
  const dEle = isFinite(ele) && isFinite(prevEle) ? ele - prevEle : null;
  const coord = fmtCoord(lat, lon);

  const rows: [string, string][] = [
    [tr.map.dist, fmtKm(result.cum[idx])],
    [tr.map.ele, isFinite(ele) ? fmtM(ele) : tr.metrics.noData],
  ];
  if (r.hasTime) {
    rows.push([tr.map.speed, isFinite(v) ? (prof.showPace ? `${fmtPace(v)} · ${fmtKmh(v)}` : fmtKmh(v)) : '—']);
    rows.push([tr.map.elapsed, fmtDuration(elapsed, true)]);
    rows.push([tr.map.clock, fmtTime(r.time[idx], true)]);
  }
  rows.push(['Eğim', grade == null ? '—' : `%${fmt1(grade)}`]);
  rows.push(['Rakım değişimi', dEle == null ? '—' : `${dEle >= 0 ? '+' : ''}${fmt1(dEle)} m`]);

  // Ekran kenarına taşmasın
  const left = x > window.innerWidth - 520 ? x - 236 : x + 16;
  const top = Math.max(8, y - 20);

  return (
    <div
      className={`ra-tooltip absolute z-20 w-[220px] ${pinned ? '' : 'pointer-events-none'}`}
      style={{ left, top }}
    >
      <div className="flex items-center justify-between border-b border-ink-600 px-2.5 py-1.5">
        <span className="font-mono text-[11px] text-fg">{coord}</span>
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
      {pinned && (
        <div className="flex gap-1.5 border-t border-ink-600 px-2.5 py-1.5">
          <button
            className="ra-chip"
            onClick={() => {
              navigator.clipboard?.writeText(coord).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); });
            }}
          >
            {copied ? tr.actions.copied : tr.actions.copy}
          </button>
          <a className="ra-chip" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${lat},${lon}`}>{tr.map.openGoogle}</a>
          <a className="ra-chip" target="_blank" rel="noreferrer" href={`https://earth.google.com/web/search/${lat},${lon}`}>Earth</a>
        </div>
      )}
    </div>
  );
}
