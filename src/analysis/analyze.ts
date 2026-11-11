import type { ActivityType, FlatRoute, ParsedFile, QualityReport, RouteMetrics, Stop, TrimInfo } from '../core/types';
import { ANALYSIS, PROFILES } from './activity';
import { fastDistance, geodesicDistance } from './geodesy';

/** Tüm iz ve parçaları, parça sınırlarını koruyarak düz dizilere çevirir (parçalar birleştirilmez). */
export function flatten(p: ParsedFile): FlatRoute {
  let n = 0;
  for (const t of p.tracks) for (const s of t.segments) n += s.lat.length;
  const lat = new Float64Array(n), lon = new Float64Array(n), ele = new Float64Array(n), time = new Float64Array(n);
  const sat = new Int16Array(n);
  const segStart: number[] = [];
  let i = 0, hasSat = false, hasTime = false, hasEle = false;
  for (const t of p.tracks)
    for (const s of t.segments) {
      segStart.push(i);
      for (let k = 0; k < s.lat.length; k++, i++) {
        lat[i] = s.lat[k];
        lon[i] = s.lon[k];
        const e = s.ele[k], tm = s.time[k], st = s.sat[k];
        ele[i] = e == null ? NaN : e;
        time[i] = tm == null ? NaN : tm;
        sat[i] = st == null ? -1 : st;
        if (e != null) hasEle = true;
        if (tm != null) hasTime = true;
        if (st != null) hasSat = true;
      }
    }
  return { lat, lon, ele, time, sat, segStart, hasSat, hasTime, hasEle };
}

export interface Derived {
  /** Ham kümülatif mesafe (m), parça boşlukları eklenmez. */
  cumRaw: Float64Array;
  /** Analiz mesafesi: duraklama titreşimi hariç, kırpılmış aralıkta 0'dan başlar. */
  cum: Float64Array;
  speedKmh: Float64Array; // NaN = hesaplanamaz
  spike: Uint8Array;
  lowConf: Uint8Array;
  inStop: Uint8Array;
  stops: Stop[];
  trim: TrimInfo;
  segOf: Int32Array;
}

function segIndexArray(r: FlatRoute): Int32Array {
  const n = r.lat.length;
  const out = new Int32Array(n);
  let s = 0;
  for (let i = 0; i < n; i++) {
    while (s + 1 < r.segStart.length && i >= r.segStart[s + 1]) s++;
    out[i] = s;
  }
  return out;
}

/** Baş ve sondaki durgun bekleme bölümünü bulur (ham veri değişmez). */
export function computeTrim(r: FlatRoute, enabled: boolean): TrimInfo {
  const n = r.lat.length;
  const none: TrimInfo = { startIdx: 0, endIdx: n - 1, trimmedStartPts: 0, trimmedEndPts: 0, trimmedStartSec: null, trimmedEndSec: null };
  if (!enabled || n < 3) return none;
  const R = ANALYSIS.stopRadiusM;
  const qualifies = (a: number, b: number) => {
    const dt = r.time[b] - r.time[a];
    if (isFinite(dt)) return dt >= ANALYSIS.stopMinSec;
    return b - a + 1 >= ANALYSIS.stopMinPointsNoTime;
  };
  let i = 0;
  while (i < n - 1 && fastDistance(r.lat[0], r.lon[0], r.lat[i + 1], r.lon[i + 1]) <= R) i++;
  let j = n - 1;
  while (j > i + 1 && fastDistance(r.lat[n - 1], r.lon[n - 1], r.lat[j - 1], r.lon[j - 1]) <= R) j--;
  const start = i > 0 && qualifies(0, i) ? i : 0;
  const end = j < n - 1 && qualifies(j, n - 1) ? j : n - 1;
  if (end - start < 2) return none;
  const secs = (a: number, b: number) => (isFinite(r.time[b] - r.time[a]) ? (r.time[b] - r.time[a]) / 1000 : null);
  return {
    startIdx: start,
    endIdx: end,
    trimmedStartPts: start,
    trimmedEndPts: n - 1 - end,
    trimmedStartSec: start > 0 ? secs(0, start) : null,
    trimmedEndSec: end < n - 1 ? secs(end, n - 1) : null,
  };
}

/** Yarıçap içinde en az stopMinSec kalınan yerleri duraklama olarak işaretler. */
function detectStops(r: FlatRoute, segOf: Int32Array, a: number, b: number): Stop[] {
  const stops: Stop[] = [];
  const R = ANALYSIS.stopRadiusM;
  let i = a;
  while (i < b) {
    let j = i;
    while (j + 1 <= b && segOf[j + 1] === segOf[i] && fastDistance(r.lat[i], r.lon[i], r.lat[j + 1], r.lon[j + 1]) <= R) j++;
    const dt = (r.time[j] - r.time[i]) / 1000;
    const ok = isFinite(dt) ? dt >= ANALYSIS.stopMinSec : j - i + 1 >= ANALYSIS.stopMinPointsNoTime;
    if (j > i && ok) {
      stops.push({ startIdx: i, endIdx: j, durationSec: isFinite(dt) ? dt : null, lat: r.lat[i], lon: r.lon[i] });
      i = j + 1;
    } else i++;
  }
  return stops;
}

export function derive(r: FlatRoute, activity: ActivityType, autoTrim: boolean): Derived {
  const n = r.lat.length;
  const prof = PROFILES[activity];
  const segOf = segIndexArray(r);
  const cumRaw = new Float64Array(n);
  const pair = new Float64Array(n); // i-1 -> i mesafesi
  for (let i = 1; i < n; i++) {
    const d = segOf[i] === segOf[i - 1] ? geodesicDistance(r.lat[i - 1], r.lon[i - 1], r.lat[i], r.lon[i]) : 0;
    pair[i] = d;
    cumRaw[i] = cumRaw[i - 1] + d;
  }

  // GPS sıçraması: komşu noktalar arası olanaksız hız
  const spike = new Uint8Array(n);
  if (r.hasTime)
    for (let i = 1; i < n; i++) {
      if (segOf[i] !== segOf[i - 1]) continue;
      const dt = (r.time[i] - r.time[i - 1]) / 1000;
      if (dt > 0 && (pair[i] / dt) * 3.6 > prof.maxPlausibleKmh) spike[i] = 1;
    }

  // Uydusuz ama hareket eden noktalar
  const lowConf = new Uint8Array(n);
  if (r.hasSat) for (let i = 1; i < n; i++) if (r.sat[i] < 0 && pair[i] > 0) lowConf[i] = 1;

  const trim = computeTrim(r, autoTrim);
  const stops = detectStops(r, segOf, trim.startIdx, trim.endIdx);
  const inStop = new Uint8Array(n);
  for (const s of stops) for (let k = s.startIdx; k <= s.endIdx; k++) inStop[k] = 1;

  // Analiz mesafesi: duraklama içi titreşim ve sıçramalar hariç
  // Duraklama içinde titreşim yerine giriş-çıkış arasındaki net yer değiştirme sayılır.
  const stopEndNet = new Map<number, number>();
  for (const s of stops) stopEndNet.set(s.endIdx, geodesicDistance(r.lat[s.startIdx], r.lon[s.startIdx], r.lat[s.endIdx], r.lon[s.endIdx]));
  const cum = new Float64Array(n);
  for (let i = trim.startIdx + 1; i <= trim.endIdx; i++) {
    const jitter = inStop[i] && inStop[i - 1];
    let add = jitter || spike[i] ? 0 : pair[i];
    if (jitter && stopEndNet.has(i)) add = stopEndNet.get(i)!;
    cum[i] = cum[i - 1] + add;
  }
  for (let i = trim.endIdx + 1; i < n; i++) cum[i] = cum[trim.endIdx];

  // Yumuşatılmış hız: ±speedWindowSec/2 zaman penceresi, parça içinde, sıçramalar dışlanır
  const speedKmh = new Float64Array(n).fill(NaN);
  if (r.hasTime) {
    const half = (ANALYSIS.speedWindowSec / 2) * 1000;
    let lo = 0, hi = 0;
    for (let i = 0; i < n; i++) {
      if (!isFinite(r.time[i])) continue;
      if (lo > i) lo = i;
      while (lo < i && (segOf[lo] !== segOf[i] || !isFinite(r.time[lo]) || r.time[i] - r.time[lo] > half)) lo++;
      if (hi < i) hi = i;
      while (hi + 1 < n && segOf[hi + 1] === segOf[i] && isFinite(r.time[hi + 1]) && r.time[hi + 1] - r.time[i] <= half) hi++;
      let bad = false;
      for (let k = lo + 1; k <= hi; k++) if (spike[k]) { bad = true; break; }
      const dt = (r.time[hi] - r.time[lo]) / 1000;
      if (!bad && dt > 0) speedKmh[i] = ((cumRaw[hi] - cumRaw[lo]) / dt) * 3.6;
    }
  }

  return { cumRaw, cum, speedKmh, spike, lowConf, inStop, stops, trim, segOf };
}

function hysteresis(ele: Float64Array, segOf: Int32Array, a: number, b: number, th: number) {
  let up = 0, down = 0, ref = NaN, seg = -1;
  for (let i = a; i <= b; i++) {
    const e = ele[i];
    if (!isFinite(e)) continue;
    if (segOf[i] !== seg) { seg = segOf[i]; ref = e; continue; }
    if (e - ref >= th) { up += e - ref; ref = e; }
    else if (ref - e >= th) { down += ref - e; ref = e; }
  }
  return { up, down };
}

export function computeMetrics(r: FlatRoute, d: Derived, activity: ActivityType, src?: ParsedFile['sourceStats']): RouteMetrics {
  const n = r.lat.length;
  const prof = PROFILES[activity];
  const { startIdx: a, endIdx: b } = d.trim;

  let minEle = Infinity, maxEle = -Infinity, startEle: number | null = null, endEle: number | null = null;
  for (let i = a; i <= b; i++) {
    const e = r.ele[i];
    if (!isFinite(e)) continue;
    if (startEle == null) startEle = e;
    endEle = e;
    if (e < minEle) minEle = e;
    if (e > maxEle) maxEle = e;
  }
  const hasEle = isFinite(minEle);
  const asc = hasEle ? hysteresis(r.ele, d.segOf, a, b, ANALYSIS.ascentHysteresisM) : null;

  // Zaman metrikleri
  let elapsedSec: number | null = null, movingSec: number | null = null, maxSpeed: number | null = null;
  let gapCount = 0, backward = 0;
  const intervals: number[] = [];
  for (let i = 1; i < n; i++) {
    if (d.segOf[i] !== d.segOf[i - 1]) continue;
    const dt = (r.time[i] - r.time[i - 1]) / 1000;
    if (!isFinite(dt)) continue;
    if (dt <= 0) backward += dt < 0 ? 1 : 0;
    else intervals.push(dt);
    if (dt > ANALYSIS.gapSec) gapCount++;
  }
  if (r.hasTime && isFinite(r.time[b] - r.time[a])) {
    elapsedSec = (r.time[b] - r.time[a]) / 1000;
    let mv = 0;
    for (let i = a + 1; i <= b; i++) {
      if (d.segOf[i] !== d.segOf[i - 1]) continue;
      const dt = (r.time[i] - r.time[i - 1]) / 1000;
      if (!(dt > 0) || dt > ANALYSIS.gapSec || d.spike[i]) continue;
      if (d.inStop[i] && d.inStop[i - 1]) continue;
      const v = d.speedKmh[i];
      if (isFinite(v) && v >= prof.stopSpeedKmh) mv += dt;
    }
    movingSec = mv;
    let mx = -Infinity;
    for (let i = a; i <= b; i++) if (isFinite(d.speedKmh[i]) && d.speedKmh[i] > mx) mx = d.speedKmh[i];
    maxSpeed = isFinite(mx) ? mx : null;
  }
  intervals.sort((x, y) => x - y);
  const distanceM = d.cum[b];

  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (let i = 0; i < n; i++) {
    if (r.lon[i] < minLon) minLon = r.lon[i];
    if (r.lon[i] > maxLon) maxLon = r.lon[i];
    if (r.lat[i] < minLat) minLat = r.lat[i];
    if (r.lat[i] > maxLat) maxLat = r.lat[i];
  }

  let noTime = 0, noEle = 0, spikes = 0, lowConf = 0;
  for (let i = 0; i < n; i++) {
    if (!isFinite(r.time[i])) noTime++;
    if (!isFinite(r.ele[i])) noEle++;
    spikes += d.spike[i];
    lowConf += d.lowConf[i];
  }
  const notes: string[] = [];
  const t = d.trim;
  if (t.trimmedStartPts) notes.push(`Baştaki ${t.trimmedStartPts} nokta${t.trimmedStartSec != null ? ` (${Math.round(t.trimmedStartSec)} sn)` : ''} durgun olduğu için analiz dışı bırakıldı.`);
  if (t.trimmedEndPts) notes.push(`Sondaki ${t.trimmedEndPts} nokta${t.trimmedEndSec != null ? ` (${Math.round(t.trimmedEndSec)} sn)` : ''} durgun olduğu için analiz dışı bırakıldı.`);
  if (lowConf) notes.push(`${lowConf} nokta uydu bağlantısı olmadan kaydedildi (düşük güvenilirlik).`);
  if (spikes) notes.push(`${spikes} GPS sıçraması tespit edildi; hız ve mesafeden dışlandı.`);
  if (!r.hasTime) notes.push('Dosyada zaman bilgisi yok; hız ve süre hesaplanmadı.');
  if (!r.hasEle) notes.push('Dosyada rakım bilgisi yok; rakım metrikleri hesaplanmadı.');
  if (r.segStart.length > 1) notes.push(`${r.segStart.length} ayrı iz parçası var; aralarındaki boşluk mesafeye eklenmedi.`);
  if (backward) notes.push(`${backward} noktada zaman geriye gidiyor.`);
  notes.push(`Toplam tırmanış ${ANALYSIS.ascentHysteresisM} m gürültü eşiğiyle hesaplandı.`);

  const quality: QualityReport = {
    pointCount: n,
    segmentCount: r.segStart.length,
    medianIntervalSec: intervals.length ? intervals[Math.floor(intervals.length / 2)] : null,
    noTimePct: (noTime / n) * 100,
    noElePct: (noEle / n) * 100,
    spikeCount: spikes,
    noSatMovingCount: lowConf,
    gapCount,
    backwardTimeCount: backward,
    notes,
  };
  void src;

  return {
    distanceM,
    elapsedSec,
    movingSec,
    avgSpeedKmh: movingSec && movingSec > 0 ? (distanceM / movingSec) * 3.6 : null,
    maxSpeedKmh: maxSpeed,
    minEle: hasEle ? minEle : null,
    maxEle: hasEle ? maxEle : null,
    startEle,
    endEle,
    ascentM: asc ? asc.up : null,
    descentM: asc ? asc.down : null,
    startTime: isFinite(r.time[a]) ? r.time[a] : null,
    endTime: isFinite(r.time[b]) ? r.time[b] : null,
    start: [r.lon[a], r.lat[a]],
    end: [r.lon[b], r.lat[b]],
    bbox: n ? [minLon, minLat, maxLon, maxLat] : null,
    stopCount: d.stops.length,
    trim: d.trim,
    quality,
  };
}

/** Liste önizlemesi için basit örnekleme (Douglas-Peucker'a gerek yok, ~120 nokta). */
export function previewLine(r: FlatRoute, a: number, b: number, max = 120): [number, number][] {
  const out: [number, number][] = [];
  const step = Math.max(1, Math.floor((b - a) / max));
  for (let i = a; i <= b; i += step) out.push([+r.lon[i].toFixed(5), +r.lat[i].toFixed(5)]);
  if (out.length && (b - a) % step !== 0) out.push([+r.lon[b].toFixed(5), +r.lat[b].toFixed(5)]);
  return out;
}

export function analyze(p: ParsedFile, activity: ActivityType, autoTrim = true) {
  const route = flatten(p);
  const derived = derive(route, activity, autoTrim);
  const metrics = computeMetrics(route, derived, activity, p.sourceStats);
  return { route, derived, metrics };
}
