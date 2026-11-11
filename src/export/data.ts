// Veri dışa aktarımları: CSV (Türkçe Excel uyumlu), JSON, GPX ve .rota paylaşım paketi.
import JSZip from 'jszip';
import type { ExportContext, ExportOptions } from './common';
import { visibleRange } from './common';
import { TZ } from '../core/format';

const dt = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const dec = (v: number, d: number) => (isFinite(v) ? v.toFixed(d).replace('.', ',') : '');

/** Nokta nokta CSV: ayırıcı ";", ondalık ",", UTF-8 BOM — Türkçe Excel'de doğrudan açılır. */
export function buildCsv(ctx: ExportContext, opt: ExportOptions, range?: [number, number]): string {
  const { result: res, grade } = ctx;
  const r = res.route;
  const [a, b] = range ?? visibleRange(res, opt.hideEnds, opt.hideMeters);
  const lines = ['Sıra;Tarih ve saat;Enlem;Boylam;Rakım (m);Mesafe (km);Hız (km/sa);Eğim (%);Uydu;Not'];
  for (let i = a; i <= b; i++) {
    const notes = [res.lowConf[i] ? 'uydusuz' : '', res.spike[i] ? 'sıçrama' : '', res.inStop[i] ? 'duraklama' : ''].filter(Boolean).join(', ');
    lines.push(
      [
        i - a + 1,
        isFinite(r.time[i]) ? dt.format(r.time[i]) : '',
        r.lat[i].toFixed(7).replace('.', ','),
        r.lon[i].toFixed(7).replace('.', ','),
        dec(r.ele[i], 1),
        dec(res.cum[i] / 1000, 3),
        dec(res.speedKmh[i], 1),
        dec(grade[i], 1),
        r.sat[i] >= 0 ? r.sat[i] : '',
        notes,
      ].join(';'),
    );
  }
  return '﻿' + lines.join('\r\n');
}

export function buildJson(ctx: ExportContext, opt: ExportOptions): string {
  const { record: rec, result: res, grade } = ctx;
  const [a, b] = visibleRange(res, opt.hideEnds, opt.hideMeters);
  const r = res.route;
  const points = [];
  for (let i = a; i <= b; i++) {
    points.push({
      lat: +r.lat[i].toFixed(7), lon: +r.lon[i].toFixed(7),
      ele: isFinite(r.ele[i]) ? +r.ele[i].toFixed(1) : null,
      time: isFinite(r.time[i]) ? new Date(r.time[i]).toISOString() : null,
      distKm: +(res.cum[i] / 1000).toFixed(4),
      speedKmh: isFinite(res.speedKmh[i]) ? +res.speedKmh[i].toFixed(2) : null,
      gradePct: isFinite(grade[i]) ? +grade[i].toFixed(2) : null,
    });
  }
  const { metrics, preview, folderName, ...meta } = rec;
  void preview; void folderName;
  const out: any = {
    uygulama: 'Rota Analiz',
    olusturma: new Date().toISOString(),
    kayit: { ...meta, notes: opt.includeNotes ? meta.notes : undefined, fuel: meta.fuel && opt.hideVehicle ? { ...meta.fuel, vehicleId: undefined, vehicleLabel: undefined } : meta.fuel },
    metrikler: opt.hideEnds ? { ...metrics, start: null, end: null, bbox: null } : metrics,
    gizlilik: opt.hideEnds ? `Başlangıç ve bitişteki ${opt.hideMeters} m çıkarıldı` : null,
    noktalar: points,
  };
  if (opt.hideEnds) { out.kayit.startPlace = ''; out.kayit.endPlace = ''; }
  return JSON.stringify(out, null, 2);
}

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));

/** GPX 1.1: kırpılmış rota ya da seçili bölüm; parça sınırları korunur. */
export function buildGpx(ctx: ExportContext, name: string, a: number, b: number): string {
  const r = ctx.result.route;
  const segs: string[] = [];
  let cur: string[] = [];
  const bounds = new Set(r.segStart);
  for (let i = a; i <= b; i++) {
    if (bounds.has(i) && i !== a && cur.length) { segs.push(cur.join('')); cur = []; }
    const ele = isFinite(r.ele[i]) ? `<ele>${r.ele[i].toFixed(1)}</ele>` : '';
    const t = isFinite(r.time[i]) ? `<time>${new Date(r.time[i]).toISOString()}</time>` : '';
    cur.push(`<trkpt lat="${r.lat[i].toFixed(7)}" lon="${r.lon[i].toFixed(7)}">${ele}${t}</trkpt>\n`);
  }
  if (cur.length) segs.push(cur.join(''));
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Rota Analiz" xmlns="http://www.topografix.com/GPX/1/1">
<metadata><name>${esc(name)}</name><time>${new Date().toISOString()}</time></metadata>
<trk><name>${esc(name)}</name>
${segs.map((s) => `<trkseg>\n${s}</trkseg>`).join('\n')}
</trk>
</gpx>
`;
}

/** .rota paketi: başka bir Rota Analiz kullanıcısının içe aktarabileceği zip (kayıt + kaynak). */
export async function buildRotaPackage(ctx: ExportContext, opt: ExportOptions, sourceBytes: ArrayBuffer | undefined): Promise<Blob> {
  const { record: rec, result: res } = ctx;
  const zip = new JSZip();
  const { metrics, preview, folderName, ...meta } = rec;
  void folderName;
  let source: { name: string; data: ArrayBuffer | string } | null = sourceBytes ? { name: rec.source.fileName, data: sourceBytes } : null;
  const outMeta: any = { ...meta, notes: opt.includeNotes ? meta.notes : '' };
  let outMetrics = metrics;
  if (opt.hideEnds) {
    // Gizlilikte orijinal dosya yerine başı ve sonu çıkarılmış GPX paketlenir
    const [a, b] = visibleRange(res, true, opt.hideMeters);
    source = { name: rec.source.fileName.replace(/\.[^.]+$/, '') + '_paylasim.gpx', data: buildGpx(ctx, rec.name, a, b) };
    outMeta.startPlace = '';
    outMeta.endPlace = '';
    outMeta.source = { ...meta.source, fileName: source.name, format: 'gpx' };
    outMetrics = { ...metrics, start: null, end: null };
  }
  if (opt.hideVehicle && outMeta.fuel) outMeta.fuel = { ...outMeta.fuel, vehicleId: undefined, vehicleLabel: undefined };
  zip.file('rota.json', JSON.stringify({ tur: 'rota-analiz-paketi', surum: 1, kayit: outMeta, metrikler: outMetrics, onizleme: opt.hideEnds ? [] : preview }, null, 2));
  if (source) zip.file('kaynak/' + source.name, source.data);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
