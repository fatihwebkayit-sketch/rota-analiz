// Detaylı PDF raporu (A4). Metinler gerçek metindir; Türkçe karakterleri içeren Roboto gömülüdür.
import type { ExportContext, ExportOptions } from './common';
import { gradeDistribution, tooShortToHide, visibleRange } from './common';
import { mapSnapshot } from './snapshot';
import { profileSVG } from './charts';
import { tr } from '../i18n/tr';
import { PROFILES } from '../analysis/activity';
import { computeFuel } from '../analysis/fuel';
import { CURRENCY_SYMBOL, FUEL_LABEL, unitOf } from '../storage/settings';
import { fmtCoord, fmtDateLong, fmtDateTime, fmtDuration, fmtKm, fmtKmh, fmtM, fmtPace, fmtTime, fmt1, fmt2 } from '../core/format';

const INK = '#1f2124', MUTED = '#6f7278', LINE = '#e3e1dc', AMBER = '#d9822b';

async function loadPdfMake() {
  const pm: any = (await import('pdfmake/build/pdfmake')).default ?? (await import('pdfmake/build/pdfmake'));
  const fonts: any = await import('pdfmake/build/vfs_fonts');
  const vfs = fonts.pdfMake?.vfs ?? fonts.default?.pdfMake?.vfs ?? fonts.default?.vfs ?? fonts.vfs ?? fonts.default;
  pm.vfs = vfs;
  return pm;
}

const kv = (rows: [string, string][]) => ({
  table: { widths: ['*', 'auto'], body: rows.map(([k, v]) => [{ text: k, color: MUTED }, { text: v, alignment: 'right' }]) },
  layout: { hLineColor: () => LINE, vLineWidth: () => 0, hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length ? 0 : 0.5), paddingTop: () => 3, paddingBottom: () => 3, paddingLeft: () => 0, paddingRight: () => 0 },
  fontSize: 9.5,
});

const h2 = (t: string) => ({ text: t.toLocaleUpperCase('tr-TR'), fontSize: 9, bold: true, color: MUTED, characterSpacing: 0.6, margin: [0, 14, 0, 6] });

const table = (head: string[], rows: string[][], widths?: any[], alignRightFrom = 1) => ({
  table: {
    headerRows: 1,
    widths: widths ?? head.map((_, i) => (i === 0 ? '*' : 'auto')),
    body: [
      head.map((h, i) => ({ text: h, color: MUTED, fontSize: 8.5, alignment: i >= alignRightFrom ? 'right' : 'left' })),
      ...rows.map((r) => r.map((c, i) => ({ text: c, alignment: i >= alignRightFrom ? 'right' : 'left' }))),
    ],
  },
  layout: { hLineColor: () => LINE, vLineWidth: () => 0, hLineWidth: (i: number) => (i === 0 ? 0 : 0.5), paddingTop: () => 3, paddingBottom: () => 3 },
  fontSize: 9,
});

export async function buildPdf(ctx: ExportContext, opt: ExportOptions, onProgress?: (s: string) => void): Promise<Blob> {
  const { record: rec, result: res, grade, activity, saved } = ctx;
  const m = res.metrics;
  const prof = PROFILES[activity];
  const hide = opt.hideEnds && !tooShortToHide(res, opt.hideMeters);
  const [va, vb] = visibleRange(res, opt.hideEnds, opt.hideMeters);
  const content: any[] = [];

  // Başlık
  content.push({ text: rec.name, fontSize: 20, bold: true, color: INK });
  const sub = [tr.activity[activity], fmtDateLong(m.startTime ?? rec.createdAt), m.startTime != null ? `${fmtTime(m.startTime)}–${fmtTime(m.endTime)}` : null].filter(Boolean).join(' · ');
  content.push({ text: sub, color: MUTED, fontSize: 10, margin: [0, 2, 0, 0] });
  if (!hide && (rec.startPlace || rec.endPlace)) content.push({ text: [rec.startPlace, rec.endPlace].filter(Boolean).join(' → '), fontSize: 10.5, margin: [0, 4, 0, 0] });

  // Harita
  if (opt.sections.map) {
    onProgress?.('Harita görüntüsü hazırlanıyor…');
    const snap = await mapSnapshot(res, va, vb, opt.mapStyle, 1500, 860, !hide);
    content.push({ image: snap.dataUrl, width: 515, margin: [0, 12, 0, 2] });
    const cap = [snap.attribution, hide ? `Gizlilik: başlangıç ve bitişteki ${opt.hideMeters} m gösterilmiyor.` : '', !snap.baseLoaded ? 'Harita altlığı yüklenemedi; yalnız rota çizildi.' : ''].filter(Boolean).join(' · ');
    if (cap) content.push({ text: cap, fontSize: 7.5, color: MUTED });
  }

  // Özet
  content.push(h2('Özet'));
  const left: [string, string][] = [
    ['Toplam mesafe', fmtKm(m.distanceM)],
    ['Geçen süre', fmtDuration(m.elapsedSec)],
    ['Hareket süresi', fmtDuration(m.movingSec)],
    [prof.showPace ? 'Ortalama tempo' : 'Ortalama hız', prof.showPace ? `${fmtPace(m.avgSpeedKmh)} (${fmtKmh(m.avgSpeedKmh)})` : fmtKmh(m.avgSpeedKmh)],
    ['Maksimum hız', fmtKmh(m.maxSpeedKmh)],
    ['Duraklama', `${m.stopCount}`],
  ];
  const right: [string, string][] = [
    ['Toplam tırmanış', fmtM(m.ascentM)],
    ['Toplam iniş', fmtM(m.descentM)],
    ['En düşük rakım', fmtM(m.minEle)],
    ['En yüksek rakım', fmtM(m.maxEle)],
    ['Başlangıç rakımı', fmtM(m.startEle)],
    ['Bitiş rakımı', fmtM(m.endEle)],
  ];
  content.push({ columns: [kv(left), kv(right)], columnGap: 24 });
  if (!hide && m.start && m.end) {
    content.push({ margin: [0, 8, 0, 0], columns: [kv([['Başlangıç koordinatı', fmtCoord(m.start[1], m.start[0])]]), kv([['Bitiş koordinatı', fmtCoord(m.end[1], m.end[0])]])], columnGap: 24 });
  }

  // Profiller
  if (opt.sections.profiles) {
    onProgress?.('Grafikler çiziliyor…');
    const items: [string, string | null][] = [
      ['Rakım profili', profileSVG('ele', res, grade)],
      [prof.showPace ? 'Hız profili' : 'Hız profili', profileSVG('speed', res, grade)],
      ['Eğim profili', profileSVG('grade', res, grade)],
    ];
    items.forEach(([t, svg], i) => {
      if (!svg) return;
      content.push({ ...h2(t), pageBreak: i === 0 ? 'before' : undefined });
      content.push({ svg, width: 515 });
    });
  }

  // Eğim dağılımı
  if (opt.sections.grade && res.route.hasEle) {
    const dist = gradeDistribution(res, grade);
    const tot = dist.reduce((s, x) => s + x.m, 0) || 1;
    content.push(h2('Eğim dağılımı'));
    content.push(table(['Eğim aralığı', 'Mesafe', 'Oran'], dist.map((x) => [x.label, fmtKm(x.m), `%${fmt1((x.m / tot) * 100)}`])));
  }

  // Bölümler
  if (opt.sections.segments && saved.length) {
    content.push(h2('Kayıtlı bölümler'));
    content.push(
      table(
        ['Bölüm', 'Mesafe', 'Süre', prof.showPace ? 'Tempo' : 'Ort. hız', 'Tırmanış', 'İniş', 'Ort. eğim', 'Maks. yokuş'],
        saved.map(({ name, m: s }) => [
          name, fmtKm(s.distanceM), fmtDuration(s.elapsedSec, true), prof.showPace ? fmtPace(s.avgSpeedKmh) : fmtKmh(s.avgSpeedKmh),
          fmtM(s.ascentM), fmtM(s.descentM), s.avgGradePct == null ? '—' : `%${fmt1(s.avgGradePct)}`, s.maxUpGradePct == null ? '—' : `%${fmt1(s.maxUpGradePct)}`,
        ]),
      ),
    );
  }

  // Duraklamalar (konum yazılmaz; yalnız km ve saat)
  if (opt.sections.stops && res.stops.length) {
    const top = [...res.stops].sort((x, y) => (y.durationSec ?? 0) - (x.durationSec ?? 0)).slice(0, 12).sort((x, y) => x.startIdx - y.startIdx);
    content.push(h2(`Duraklamalar (en uzun ${top.length})`));
    content.push(table(['Km', 'Saat', 'Süre'], top.map((s) => [fmt1(res.cum[s.startIdx] / 1000), fmtTime(res.route.time[s.startIdx]), fmtDuration(s.durationSec)])));
  }

  // Yakıt
  if (opt.sections.fuel && activity === 'car' && rec.fuel) {
    const f = rec.fuel;
    const r = computeFuel(m.distanceM, f);
    const u = unitOf(f.fuel);
    const money = (v: number) => `${CURRENCY_SYMBOL[f.currency]}${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`;
    content.push(h2('Yakıt ve tahmini masraf'));
    const rows: [string, string][] = [];
    if (!opt.hideVehicle && f.vehicleLabel) rows.push(['Araç', f.vehicleLabel]);
    rows.push(['Yakıt', FUEL_LABEL[f.fuel]], ['Ortalama tüketim', `${fmt2(f.consumption)} ${u}/100 km`], ['Birim fiyat', `${money(f.price)} / ${u}`], ['Hesaplanan mesafe', `${fmt1(r.distanceKm)} km${f.roundTrip ? ' (gidiş-dönüş)' : ''}`], ['Tahmini tüketim', `${fmt2(r.units)} ${u}`], ['Yakıt maliyeti', money(r.fuelCost)]);
    f.extras.filter((e) => e.amount).forEach((e) => rows.push([e.label || 'Ek masraf', money(e.amount)]));
    rows.push(['Toplam', money(r.total)], ['Km başı', money(r.perKm)]);
    if (f.persons > 1) rows.push([`Kişi başı (${f.persons} kişi)`, money(r.perPerson)]);
    content.push({ columns: [kv(rows), { text: '' }], columnGap: 24 });
    content.push({ text: 'Tahmin, GPS hızından bağımsız olarak mesafe ve girilen varsayımlarla hesaplanmıştır.', fontSize: 8, color: MUTED, margin: [0, 4, 0, 0] });
  }

  // Notlar
  if (opt.includeNotes && rec.notes.trim()) {
    content.push(h2('Notlar'));
    content.push({ text: rec.notes, fontSize: 9.5 });
  }

  // Veri kalitesi
  if (opt.sections.quality) {
    const q = m.quality;
    content.push(h2('Veri kalitesi'));
    content.push({
      columns: [
        kv([['Nokta sayısı', q.pointCount.toLocaleString('tr-TR')], ['İz parçası', `${q.segmentCount}`], ['Örnekleme aralığı', q.medianIntervalSec == null ? '—' : `${fmt1(q.medianIntervalSec)} sn`], ['Kaynak', rec.source.creator ?? rec.source.fileName.split('.').pop()!.toUpperCase()]]),
        kv([['Zamanı olmayan nokta', `%${fmt1(q.noTimePct)}`], ['Rakımı olmayan nokta', `%${fmt1(q.noElePct)}`], ['GPS sıçraması', `${q.spikeCount}`], ['Uydusuz hareketli nokta', `${q.noSatMovingCount}`]]),
      ],
      columnGap: 24,
    });
    content.push({ ul: q.notes.map((n) => String(n)), fontSize: 8.5, color: MUTED, margin: [0, 6, 0, 0] });
  }

  onProgress?.('PDF oluşturuluyor…');
  const pm = await loadPdfMake();
  const created = fmtDateTime(Date.now());
  const doc = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 44],
    defaultStyle: { font: 'Roboto', fontSize: 10, color: INK, lineHeight: 1.15 },
    info: { title: rec.name, creator: 'Rota Analiz', producer: 'Rota Analiz' },
    footer: (page: number, pages: number) => ({
      margin: [40, 12, 40, 0],
      columns: [
        { text: [{ text: 'Rota Analiz', color: AMBER, bold: true }, { text: `  ·  ${created}`, color: MUTED }], fontSize: 7.5 },
        { text: `${page} / ${pages}`, alignment: 'right', fontSize: 7.5, color: MUTED },
      ],
    }),
    content,
  };
  return new Promise<Blob>((resolve, reject) => {
    try {
      pm.createPdf(doc).getBlob((b: Blob) => resolve(b));
    } catch (e) {
      reject(e);
    }
  });
}
