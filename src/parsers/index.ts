import type { ParsedFile, SourceFormat } from '../core/types';
import { parseGpx } from './gpx';
import { parseKml, parseKmz } from './kml';

export const SUPPORTED_NOW: SourceFormat[] = ['gpx', 'kml', 'kmz'];

export function detectFormat(fileName: string): SourceFormat | null {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if (ext === 'gpx' || ext === 'kml' || ext === 'kmz' || ext === 'tcx' || ext === 'fit') return ext;
  if (ext === 'geojson' || ext === 'json') return 'geojson';
  return null;
}

function decodeText(buf: ArrayBuffer): string {
  // BOM'u ve UTF-8 dışı kodlamaları tolere et
  const bytes = new Uint8Array(buf);
  const head = new TextDecoder('ascii').decode(bytes.slice(0, 200));
  const enc = /encoding=["']([\w-]+)["']/i.exec(head)?.[1]?.toLowerCase();
  try {
    return new TextDecoder(enc && enc !== 'utf-8' ? enc : 'utf-8').decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
  }
}

export async function parseFile(fileName: string, buf: ArrayBuffer): Promise<ParsedFile> {
  const fmt = detectFormat(fileName);
  if (!fmt) throw new Error('Tanınmayan dosya uzantısı. Desteklenen: GPX, KML, KMZ.');
  if (!SUPPORTED_NOW.includes(fmt)) throw new Error('Bu dosya türü henüz desteklenmiyor (Aşama 2: GeoJSON, TCX, FIT).');
  let parsed: ParsedFile;
  if (fmt === 'kmz') parsed = await parseKmz(buf, fileName);
  else if (fmt === 'kml') parsed = parseKml(decodeText(buf), fileName);
  else parsed = parseGpx(decodeText(buf), fileName);
  if (!parsed.tracks.length) throw new Error('Dosyada iz bulunamadı.');
  return parsed;
}
