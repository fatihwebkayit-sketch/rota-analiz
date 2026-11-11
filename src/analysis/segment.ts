import type { ActivityType, FlatRoute } from '../core/types';
import { ANALYSIS, PROFILES } from './activity';

export interface SegmentMetrics {
  a: number;
  b: number;
  startM: number;
  endM: number;
  distanceM: number;
  elapsedSec: number | null;
  movingSec: number | null;
  avgSpeedKmh: number | null;
  maxSpeedKmh: number | null;
  startEle: number | null;
  endEle: number | null;
  minEle: number | null;
  maxEle: number | null;
  ascentM: number | null;
  descentM: number | null;
  avgGradePct: number | null;
  maxUpGradePct: number | null;
  maxDownGradePct: number | null;
  crossesGap: boolean;
  startTime: number | null;
  endTime: number | null;
}

export interface SeriesInput {
  route: FlatRoute;
  cum: Float64Array;
  speedKmh: Float64Array;
  inStop: Uint8Array;
  spike: Uint8Array;
}

export function segOfArray(r: FlatRoute): Int32Array {
  const out = new Int32Array(r.lat.length);
  let s = 0;
  for (let i = 0; i < out.length; i++) {
    while (s + 1 < r.segStart.length && i >= r.segStart[s + 1]) s++;
    out[i] = s;
  }
  return out;
}

/** Mesafe penceresine göre yerel eğim (%) serisi. Rakım yoksa NaN. */
export function gradeSeries(r: FlatRoute, cum: Float64Array, windowM: number): Float64Array {
  const n = r.lat.length;
  const out = new Float64Array(n).fill(NaN);
  if (!r.hasEle) return out;
  const half = windowM / 2;
  let lo = 0, hi = 0;
  for (let i = 0; i < n; i++) {
    if (!isFinite(r.ele[i])) continue;
    while (lo < i && cum[i] - cum[lo] > half) lo++;
    if (hi < i) hi = i;
    while (hi + 1 < n && cum[hi + 1] - cum[i] <= half) hi++;
    let a = lo, b = hi;
    while (a < i && !isFinite(r.ele[a])) a++;
    while (b > i && !isFinite(r.ele[b])) b--;
    const d = cum[b] - cum[a];
    if (d >= half * 0.8) out[i] = ((r.ele[b] - r.ele[a]) / d) * 100;
  }
  return out;
}

/** Kümülatif tırmanış/iniş serisi (histerezis eşikli). */
export function cumulativeClimb(r: FlatRoute, segOf: Int32Array, from: number, to: number) {
  const n = r.lat.length;
  const up = new Float64Array(n), down = new Float64Array(n);
  let u = 0, d = 0, ref = NaN, seg = -1;
  for (let i = from; i <= to; i++) {
    const e = r.ele[i];
    if (isFinite(e)) {
      if (segOf[i] !== seg) { seg = segOf[i]; ref = e; }
      else if (e - ref >= ANALYSIS.ascentHysteresisM) { u += e - ref; ref = e; }
      else if (ref - e >= ANALYSIS.ascentHysteresisM) { d += ref - e; ref = e; }
    }
    up[i] = u;
    down[i] = d;
  }
  for (let i = to + 1; i < n; i++) { up[i] = u; down[i] = d; }
  return { up, down };
}

export function computeSegment(s: SeriesInput, grade: Float64Array, segOf: Int32Array, activity: ActivityType, a0: number, b0: number): SegmentMetrics {
  const a = Math.min(a0, b0), b = Math.max(a0, b0);
  const { route: r, cum, speedKmh, inStop, spike } = s;
  const prof = PROFILES[activity];
  let minEle = Infinity, maxEle = -Infinity, startEle: number | null = null, endEle: number | null = null;
  let up = 0, down = 0, ref = NaN, seg = -1;
  let maxUp = -Infinity, maxDown = Infinity, maxV = -Infinity, moving = 0;
  for (let i = a; i <= b; i++) {
    const e = r.ele[i];
    if (isFinite(e)) {
      if (startEle == null) startEle = e;
      endEle = e;
      if (e < minEle) minEle = e;
      if (e > maxEle) maxEle = e;
      if (segOf[i] !== seg) { seg = segOf[i]; ref = e; }
      else if (e - ref >= ANALYSIS.ascentHysteresisM) { up += e - ref; ref = e; }
      else if (ref - e >= ANALYSIS.ascentHysteresisM) { down += ref - e; ref = e; }
    }
    const g = grade[i];
    if (isFinite(g)) { if (g > maxUp) maxUp = g; if (g < maxDown) maxDown = g; }
    if (isFinite(speedKmh[i]) && speedKmh[i] > maxV) maxV = speedKmh[i];
    if (i > a && segOf[i] === segOf[i - 1] && r.hasTime) {
      const dt = (r.time[i] - r.time[i - 1]) / 1000;
      if (dt > 0 && dt <= ANALYSIS.gapSec && !spike[i] && !(inStop[i] && inStop[i - 1]) && speedKmh[i] >= prof.stopSpeedKmh) moving += dt;
    }
  }
  const distanceM = cum[b] - cum[a];
  const elapsed = isFinite(r.time[b] - r.time[a]) ? (r.time[b] - r.time[a]) / 1000 : null;
  const hasEle = isFinite(minEle);
  return {
    a, b,
    startM: cum[a],
    endM: cum[b],
    distanceM,
    elapsedSec: elapsed,
    movingSec: r.hasTime ? moving : null,
    avgSpeedKmh: r.hasTime && moving > 0 ? (distanceM / moving) * 3.6 : null,
    maxSpeedKmh: isFinite(maxV) ? maxV : null,
    startEle, endEle,
    minEle: hasEle ? minEle : null,
    maxEle: hasEle ? maxEle : null,
    ascentM: hasEle ? up : null,
    descentM: hasEle ? down : null,
    avgGradePct: hasEle && startEle != null && endEle != null && distanceM > 0 ? ((endEle - startEle) / distanceM) * 100 : null,
    maxUpGradePct: isFinite(maxUp) ? maxUp : null,
    maxDownGradePct: isFinite(maxDown) ? maxDown : null,
    crossesGap: segOf[a] !== segOf[b],
    startTime: isFinite(r.time[a]) ? r.time[a] : null,
    endTime: isFinite(r.time[b]) ? r.time[b] : null,
  };
}

/** Kümülatif mesafeye (m) göre en yakın indeks (ikili arama). */
export function indexAtDistance(cum: Float64Array, m: number, from = 0, to = cum.length - 1): number {
  let lo = from, hi = to;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < m) lo = mid + 1;
    else hi = mid;
  }
  if (lo > from && Math.abs(cum[lo - 1] - m) < Math.abs(cum[lo] - m)) return lo - 1;
  return lo;
}
