// Animasyon zaman çizelgesi: video ilerlemesini (0–1) rotadaki konuma çevirir.
import type { AnalysisResult } from '../workers/protocol';

export interface Timeline {
  a: number;
  b: number;
  /** Her noktanın sanal zamanı (sn); duraklamalar sıkıştırılabilir. */
  vt: Float64Array;
  total: number;
  byDistance: boolean;
}

export interface FramePos {
  i: number; // önceki nokta
  f: number; // i ile i+1 arası oran
  lon: number;
  lat: number;
  bearing: number;
}

/**
 * compressStops: duraklamalar videoda 1 sn'ye indirilir (uzun beklemeler boş kare üretmesin).
 * Zaman bilgisi yoksa animasyon mesafeye göre ilerler.
 */
export function buildTimeline(res: AnalysisResult, a: number, b: number, compressStops: boolean): Timeline {
  const r = res.route;
  const n = r.lat.length;
  const vt = new Float64Array(n);
  const byDistance = !r.hasTime;
  for (let i = a + 1; i <= b; i++) {
    let dt: number;
    if (byDistance) dt = res.cum[i] - res.cum[i - 1];
    else {
      dt = (r.time[i] - r.time[i - 1]) / 1000;
      if (!isFinite(dt) || dt < 0) dt = 0;
      if (dt > 60) dt = 1; // kayıt boşlukları atlanır
      if (compressStops && res.inStop[i] && res.inStop[i - 1]) dt = Math.min(dt, 1 / 30);
    }
    vt[i] = vt[i - 1] + dt;
  }
  return { a, b, vt, total: vt[b] || 1, byDistance };
}

export function posAt(tl: Timeline, res: AnalysisResult, p: number): FramePos {
  const r = res.route;
  const target = Math.min(Math.max(p, 0), 1) * tl.total;
  let lo = tl.a, hi = tl.b;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tl.vt[mid] <= target) lo = mid;
    else hi = mid - 1;
  }
  const i = Math.min(lo, tl.b - 1);
  const span = tl.vt[i + 1] - tl.vt[i];
  const f = span > 0 ? Math.min(1, Math.max(0, (target - tl.vt[i]) / span)) : 0;
  const lon = r.lon[i] + (r.lon[i + 1] - r.lon[i]) * f;
  const lat = r.lat[i] + (r.lat[i + 1] - r.lat[i]) * f;
  // Yön: ~150 m ileriye bakarak yumuşak kamera dönüşü
  let j = i + 1;
  while (j < tl.b && res.cum[j] - res.cum[i] < 150) j++;
  const k = Math.cos((lat * Math.PI) / 180);
  const bearing = (Math.atan2((r.lon[j] - lon) * k, r.lat[j] - lat) * 180) / Math.PI;
  return { i, f, lon, lat, bearing };
}

/** Açı farkını -180..180 aralığında yumuşatır. */
export function smoothBearing(prev: number, next: number, alpha: number) {
  let d = ((next - prev + 540) % 360) - 180;
  return prev + d * alpha;
}
