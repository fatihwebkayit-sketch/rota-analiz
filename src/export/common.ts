import type { ActivityType, RouteRecord, Vehicle } from '../core/types';
import type { AnalysisResult } from '../workers/protocol';
import type { SegmentMetrics } from '../analysis/segment';

export type MapStyleChoice = 'light' | 'satellite' | 'topo' | 'dark';

export interface ExportOptions {
  hideEnds: boolean;
  hideMeters: number;
  hideVehicle: boolean;
  includeNotes: boolean;
  mapStyle: MapStyleChoice;
  sections: { map: boolean; profiles: boolean; grade: boolean; stops: boolean; segments: boolean; fuel: boolean; quality: boolean };
}

export interface ExportContext {
  record: RouteRecord;
  result: AnalysisResult;
  grade: Float64Array;
  activity: ActivityType;
  saved: { name: string; m: SegmentMetrics }[];
  vehicle?: Vehicle;
}

/** Gizlilik: başlangıç ve bitişteki belirli mesafe çıkarılmış görünür aralık (ham indeksler). */
export function visibleRange(res: AnalysisResult, hideEnds: boolean, hideM: number): [number, number] {
  const { startIdx, endIdx } = res.metrics.trim;
  if (!hideEnds || hideM <= 0) return [startIdx, endIdx];
  const total = res.cum[endIdx];
  if (total < hideM * 2.5) return [startIdx, endIdx]; // çok kısa rotada gizlenecek bir şey kalmaz; aşağıda uyarı verilir
  let a = startIdx, b = endIdx;
  while (a < endIdx && res.cum[a] < hideM) a++;
  while (b > a && total - res.cum[b] < hideM) b--;
  return [a, b];
}

export const tooShortToHide = (res: AnalysisResult, hideM: number) => res.cum[res.metrics.trim.endIdx] < hideM * 2.5;

export function fileBase(r: RouteRecord) {
  const d = r.metrics.startTime ?? r.createdAt;
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(d);
  const name = r.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, '_').slice(0, 50) || 'rota';
  return `${date}_${name}`;
}

export function download(data: Blob | string, name: string, type = 'application/octet-stream') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** Eğim dağılımı: her eğim aralığında geçen mesafe (m). */
export function gradeDistribution(res: AnalysisResult, grade: Float64Array): { label: string; m: number }[] {
  const buckets = [
    { label: '%10 üzeri iniş', lo: -Infinity, hi: -10, m: 0 },
    { label: '%5–10 iniş', lo: -10, hi: -5, m: 0 },
    { label: '%0–5 iniş', lo: -5, hi: 0, m: 0 },
    { label: '%0–5 yokuş', lo: 0, hi: 5, m: 0 },
    { label: '%5–10 yokuş', lo: 5, hi: 10, m: 0 },
    { label: '%10 üzeri yokuş', lo: 10, hi: Infinity, m: 0 },
  ];
  const { startIdx, endIdx } = res.metrics.trim;
  for (let i = startIdx + 1; i <= endIdx; i++) {
    const g = grade[i];
    if (!isFinite(g)) continue;
    const d = res.cum[i] - res.cum[i - 1];
    const b = buckets.find((x) => g >= x.lo && g < x.hi);
    if (b) b.m += d;
  }
  return buckets.map(({ label, m }) => ({ label, m }));
}
