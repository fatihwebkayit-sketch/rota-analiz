import type { ParsedFile, SegmentData, SourceAppStats, TrackData, Waypoint } from '../core/types';
import { child, children, descendants, num, parseXml, text, timeMs } from './xml';

function emptySeg(): SegmentData {
  return { lat: [], lon: [], ele: [], time: [], sat: [] };
}

function readPoint(seg: SegmentData, p: Element) {
  const lat = parseFloat(p.getAttribute('lat') ?? '');
  const lon = parseFloat(p.getAttribute('lon') ?? '');
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return false;
  seg.lat.push(lat);
  seg.lon.push(lon);
  seg.ele.push(num(child(p, 'ele')));
  seg.time.push(timeMs(child(p, 'time')));
  // <sat> standart GPX alanıdır; bazı uygulamalar extensions içine yazar.
  let sat = num(child(p, 'sat'));
  if (sat == null) {
    const ext = child(p, 'extensions');
    if (ext) sat = num(descendants(ext, 'sat')[0]);
  }
  seg.sat.push(sat);
  return true;
}

/** BasicAirData GPS Logger gibi uygulamaların başa yazdığı yorum satırlarından istatistik okur. */
export function readCommentStats(xmlText: string): SourceAppStats | undefined {
  const head = xmlText.slice(0, 4000);
  const comments = [...head.matchAll(/<!--([\s\S]*?)-->/g)].map((m) => m[1].trim());
  if (!comments.length) return undefined;
  const get = (key: string) => {
    for (const c of comments) {
      const m = c.match(new RegExp('^' + key + '\\s*=\\s*(.+)$', 'i'));
      if (m) return m[1].trim();
    }
    return undefined;
  };
  const toNum = (s?: string) => {
    if (!s) return undefined;
    const m = s.match(/-?[\d.,]+/);
    if (!m) return undefined;
    const v = parseFloat(m[0].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
    return isFinite(v) ? v : undefined;
  };
  const dist = get('Distance');
  const dur = get('Duration');
  const stats: SourceAppStats = {
    distanceKm: dist && /km/i.test(dist) ? toNum(dist) : dist && /\bm\b/i.test(dist) ? (toNum(dist) ?? 0) / 1000 : undefined,
    totalDuration: dur?.split('|')[0]?.trim(),
    movingDuration: dur?.split('|')[1]?.trim(),
    maxSpeedKmh: toNum(get('Max Speed')),
    activity: get('Activity'),
  };
  return Object.values(stats).some((v) => v !== undefined) ? stats : undefined;
}

export function parseGpx(xmlText: string, fileName: string): ParsedFile {
  const doc = parseXml(xmlText);
  const root = doc.documentElement;
  if (!root || root.localName?.toLowerCase() !== 'gpx') throw new Error('Geçerli bir GPX dosyası değil (gpx kök öğesi yok).');
  const warnings: string[] = [];
  const meta = child(root, 'metadata');
  const tracks: TrackData[] = [];
  let skipped = 0;

  for (const trk of children(root, 'trk')) {
    const t: TrackData = { name: text(child(trk, 'name')) || undefined, segments: [] };
    for (const s of children(trk, 'trkseg')) {
      const seg = emptySeg();
      for (const p of children(s, 'trkpt')) if (!readPoint(seg, p)) skipped++;
      if (seg.lat.length) t.segments.push(seg);
    }
    if (t.segments.length) tracks.push(t);
  }
  // İz yoksa planlanmış rotaları (rte) iz olarak al.
  if (!tracks.length) {
    for (const rte of children(root, 'rte')) {
      const seg = emptySeg();
      for (const p of children(rte, 'rtept')) if (!readPoint(seg, p)) skipped++;
      if (seg.lat.length) tracks.push({ name: text(child(rte, 'name')) || undefined, segments: [seg] });
    }
    if (tracks.length) warnings.push('Dosyada kayıtlı iz yok; planlanmış rota (rte) kullanıldı.');
  }
  if (skipped) warnings.push(`${skipped} nokta geçersiz koordinat nedeniyle atlandı.`);

  const waypoints: Waypoint[] = children(root, 'wpt').flatMap((w) => {
    const lat = parseFloat(w.getAttribute('lat') ?? '');
    const lon = parseFloat(w.getAttribute('lon') ?? '');
    if (!isFinite(lat) || !isFinite(lon)) return [];
    return [{ lat, lon, ele: num(child(w, 'ele')), time: timeMs(child(w, 'time')), name: text(child(w, 'name')) || undefined, desc: text(child(w, 'desc')) || undefined }];
  });

  const desc = text(child(meta ?? root, 'desc')) || undefined;
  const metaName = text(child(meta ?? root, 'name')) || undefined;
  return {
    fileName,
    format: 'gpx',
    creator: root.getAttribute('creator') || undefined,
    // GPS Logger'da kullanıcının verdiği ad "desc" alanındadır.
    name: desc || tracks[0]?.name || metaName,
    description: desc,
    keywords: text(child(meta ?? root, 'keywords')) || undefined,
    tracks,
    waypoints,
    sourceStats: readCommentStats(xmlText),
    warnings,
  };
}
