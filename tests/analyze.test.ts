import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { parseGpx } from '../src/parsers/gpx';
import { analyze } from '../src/analysis/analyze';
import { fmtTime } from '../src/core/format';

const sample = 'tests/private/rota1.gpx';
// Örnek dosya kişisel veridir; depoya girmez. Yoksa bu testler atlanır.
describe.skipIf(!existsSync(sample))('Rota 1 kabul kontrolleri', () => {
  // Dosya yoksa describe gövdesi yine toplanır; bu yüzden okuma koşullu
  const p = existsSync(sample) ? parseGpx(readFileSync(sample, 'utf8'), 'rota1.gpx') : (null as any);
  const { metrics: m, route } = p ? analyze(p, 'car') : ({} as any);
  it('yapı ve üst veri', () => {
    expect(route.lat.length).toBe(2253);
    expect(p.tracks.length).toBe(1);
    expect(p.tracks[0].segments.length).toBe(1);
    expect(p.name).toBe('Rota 1');
    expect(p.sourceStats?.distanceKm).toBeCloseTo(5.28, 2);
    expect(route.hasSat).toBe(true);
  });
  it('saat Türkiye saatine çevrilir', () => {
    expect(fmtTime(route.time[0])).toBe('08:21');
  });
  it('mesafe kaynak uygulamaya ±%2', () => {
    expect(Math.abs(m.distanceM / 5280 - 1)).toBeLessThan(0.02);
  });
  it('baş/son kırpma', () => {
    expect(m.trim.trimmedStartSec).toBeGreaterThanOrEqual(30);
    expect(m.trim.trimmedEndSec).toBeGreaterThanOrEqual(30);
    expect(Math.abs((m.elapsedSec ?? 0) - (36 * 60 + 20))).toBeLessThan(30);
  });
  it('tırmanış gürültü eşiğiyle', () => {
    expect(m.ascentM!).toBeLessThan(100);
    expect(m.ascentM!).toBeGreaterThan(50);
  });
  it('maksimum hız', () => {
    expect(Math.abs(m.maxSpeedKmh! - 62)).toBeLessThan(4);
  });
  it('uydusuz noktalar işaretli', () => {
    expect(m.quality.noSatMovingCount).toBeGreaterThan(0);
  });
});

describe('sentetik', () => {
  const gpx = (pts: string) => `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>${pts}</trkseg><trkseg><trkpt lat="41.1" lon="29.1"/><trkpt lat="41.101" lon="29.1"/></trkseg></trk></gpx>`;
  it('eksik zaman ve rakım uydurulmaz, parçalar birleştirilmez', () => {
    const p = parseGpx(gpx('<trkpt lat="41" lon="29"/><trkpt lat="41.001" lon="29"/>'), 'x.gpx');
    const { metrics: m } = analyze(p, 'walk');
    expect(m.elapsedSec).toBeNull();
    expect(m.ascentM).toBeNull();
    expect(m.quality.segmentCount).toBe(2);
    // iki parça ~111 m + ~111 m; aradaki ~14 km boşluk eklenmez
    expect(m.distanceM).toBeGreaterThan(200);
    expect(m.distanceM).toBeLessThan(260);
  });
});

import { computeSegment, gradeSeries, indexAtDistance, segOfArray } from '../src/analysis/segment';
describe('bölüm analizi', () => {
  // Kuzeye doğru 1 km, 10 m aralıklı, sabit %5 yokuş, 1 sn aralık (36 km/sa)
  const pts = Array.from({ length: 101 }, (_, i) => {
    const lat = 40 + (i * 10) / 111320;
    const t = new Date(Date.UTC(2026, 0, 1, 8, 0, i)).toISOString();
    return `<trkpt lat="${lat}" lon="30"><ele>${100 + i * 0.5}</ele><time>${t}</time></trkpt>`;
  }).join('');
  const p = parseGpx(`<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>${pts}</trkseg></trk></gpx>`, 's.gpx');
  const { route, derived } = analyze(p, 'bike', false);
  const segOf = segOfArray(route);
  const grade = gradeSeries(route, derived.cum, 100);
  it('mesafe, süre, eğim ve tırmanış', () => {
    const a = indexAtDistance(derived.cum, 200), b = indexAtDistance(derived.cum, 700);
    const s = computeSegment({ route, cum: derived.cum, speedKmh: derived.speedKmh, inStop: derived.inStop, spike: derived.spike }, grade, segOf, 'bike', a, b);
    expect(s.distanceM).toBeGreaterThan(495);
    expect(s.distanceM).toBeLessThan(505);
    expect(s.elapsedSec).toBe(50);
    expect(s.avgGradePct!).toBeCloseTo(5, 0);
    expect(s.ascentM!).toBeGreaterThan(20);
    expect(s.avgSpeedKmh!).toBeCloseTo(36, 0);
  });
});
