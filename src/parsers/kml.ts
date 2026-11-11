import { kml as kmlToGeoJson } from '@tmcw/togeojson';
import JSZip from 'jszip';
import type { ParsedFile, SegmentData, TrackData, Waypoint } from '../core/types';
import { child, descendants, parseXml, text } from './xml';

function segFromCoords(coords: number[][], times?: (string | number | null)[]): SegmentData {
  const seg: SegmentData = { lat: [], lon: [], ele: [], time: [], sat: [] };
  coords.forEach((c, i) => {
    if (!isFinite(c[0]) || !isFinite(c[1])) return;
    seg.lon.push(c[0]);
    seg.lat.push(c[1]);
    seg.ele.push(c.length > 2 && isFinite(c[2]) ? c[2] : null);
    const t = times?.[i];
    const ms = t == null ? NaN : typeof t === 'number' ? t : Date.parse(t);
    seg.time.push(isFinite(ms) ? ms : null);
    seg.sat.push(null);
  });
  return seg;
}

export function parseKml(xmlText: string, fileName: string, format: 'kml' | 'kmz' = 'kml'): ParsedFile {
  const doc = parseXml(xmlText);
  if (!descendants(doc, 'kml').length && doc.documentElement.localName?.toLowerCase() !== 'kml') {
    throw new Error('Geçerli bir KML dosyası değil.');
  }
  const fc = kmlToGeoJson(doc as any) as GeoJSON.FeatureCollection;
  const tracks: TrackData[] = [];
  const waypoints: Waypoint[] = [];

  for (const f of fc.features) {
    const g = f.geometry as GeoJSON.Geometry | null;
    if (!g) continue;
    const props = (f.properties ?? {}) as any;
    const name = props.name as string | undefined;
    const times = props.coordinateProperties?.times;
    if (g.type === 'LineString') {
      const seg = segFromCoords(g.coordinates as number[][], times);
      if (seg.lat.length > 1) tracks.push({ name, segments: [seg] });
    } else if (g.type === 'MultiLineString') {
      const segs = (g.coordinates as number[][][])
        .map((cs, i) => segFromCoords(cs, Array.isArray(times?.[0]) ? times[i] : undefined))
        .filter((s) => s.lat.length > 1);
      if (segs.length) tracks.push({ name, segments: segs });
    } else if (g.type === 'Point') {
      const c = g.coordinates as number[];
      waypoints.push({ lon: c[0], lat: c[1], ele: c.length > 2 ? c[2] : null, time: null, name, desc: props.description });
    } else if (g.type === 'GeometryCollection') {
      const segs = g.geometries
        .filter((x): x is GeoJSON.LineString => x.type === 'LineString')
        .map((x, i) => segFromCoords(x.coordinates as number[][], Array.isArray(times?.[0]) ? times[i] : undefined))
        .filter((s) => s.lat.length > 1);
      if (segs.length) tracks.push({ name, segments: segs });
    }
  }

  const docEl = descendants(doc, 'Document')[0];
  const docName = docEl ? text(child(docEl, 'name')) : '';
  return {
    fileName,
    format,
    name: docName || tracks[0]?.name || undefined,
    description: docEl ? text(child(docEl, 'description')) || undefined : undefined,
    tracks,
    waypoints,
    warnings: [],
  };
}

export async function parseKmz(buf: ArrayBuffer, fileName: string): Promise<ParsedFile> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    throw new Error('KMZ arşivi açılamadı (bozuk zip).');
  }
  const kmls = Object.values(zip.files).filter((f) => !f.dir && /\.kml$/i.test(f.name));
  const main = kmls.find((f) => /(^|\/)doc\.kml$/i.test(f.name)) ?? kmls[0];
  if (!main) throw new Error('KMZ içinde KML dosyası bulunamadı.');
  const xml = await main.async('string');
  return parseKml(xml, fileName, 'kmz');
}
