// Paylaşım kartı (PNG): telefon ekranına uygun, tek sayfa özet.
import type { ExportContext, ExportOptions } from './common';
import { tooShortToHide, visibleRange } from './common';
import { mapSnapshot } from './snapshot';
import { tr } from '../i18n/tr';
import { PROFILES } from '../analysis/activity';
import { computeFuel } from '../analysis/fuel';
import { CURRENCY_SYMBOL } from '../storage/settings';
import { fmtDateLong, fmtDuration, fmtKm, fmtKmh, fmtM, fmtPace } from '../core/format';

export type CardShape = 'portrait' | 'square';

const BG = '#131415', PANEL = '#1c1d20', FG = '#e7e5e0', MUTED = '#9a9ca1', AMBER = '#f0a03c', UP = '#5fb57f';

export async function buildCard(ctx: ExportContext, opt: ExportOptions, shape: CardShape, onProgress?: (s: string) => void): Promise<Blob> {
  const { record: rec, result: res, activity } = ctx;
  const m = res.metrics;
  const prof = PROFILES[activity];
  const W = 1080, H = shape === 'portrait' ? 1350 : 1080;
  const MAP_H = shape === 'portrait' ? 720 : 560;
  const hide = opt.hideEnds && !tooShortToHide(res, opt.hideMeters);
  const [va, vb] = visibleRange(res, opt.hideEnds, opt.hideMeters);

  onProgress?.('Harita görüntüsü hazırlanıyor…');
  // Alt kısımda başlık ve geçiş gölgesi olduğu için rota haritanın üst bölümüne sığdırılır
  const snap = await mapSnapshot(res, va, vb, opt.mapStyle, W, MAP_H, !hide, { top: 70, bottom: 230, left: 80, right: 80 });
  await document.fonts.load('600 40px "Inter Variable"').catch(() => undefined);

  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  const font = (w: number, s: number) => `${w} ${s}px "Inter Variable", system-ui, sans-serif`;
  g.fillStyle = BG;
  g.fillRect(0, 0, W, H);

  // Harita
  const img = new Image();
  img.src = snap.dataUrl;
  await img.decode();
  g.drawImage(img, 0, 0, W, MAP_H);
  const grad = g.createLinearGradient(0, MAP_H - 180, 0, MAP_H);
  grad.addColorStop(0, 'rgba(19,20,21,0)');
  grad.addColorStop(1, 'rgba(19,20,21,1)');
  g.fillStyle = grad;
  g.fillRect(0, MAP_H - 180, W, 180);
  if (snap.attribution) {
    g.font = font(400, 16);
    g.fillStyle = 'rgba(231,229,224,0.6)';
    g.textAlign = 'right';
    g.fillText(snap.attribution, W - 28, 34);
    g.textAlign = 'left';
  }

  // Başlık
  const P = 56;
  let y = MAP_H - 40;
  g.fillStyle = AMBER;
  g.font = font(600, 22);
  g.fillText(tr.activity[activity].toLocaleUpperCase('tr-TR'), P, y - 64);
  g.fillStyle = FG;
  g.font = font(650, 54);
  const title = rec.name.length > 30 ? rec.name.slice(0, 29) + '…' : rec.name;
  g.fillText(title, P, y - 10);
  g.fillStyle = MUTED;
  g.font = font(400, 26);
  const places = !hide && (rec.startPlace || rec.endPlace) ? ' · ' + [rec.startPlace, rec.endPlace].filter(Boolean).join(' → ') : '';
  g.fillText((fmtDateLong(m.startTime ?? rec.createdAt) + places).slice(0, 70), P, y + 30);

  // Değerler
  const stats: [string, string, string?][] = [
    ['Mesafe', fmtKm(m.distanceM)],
    ['Süre', fmtDuration(m.elapsedSec)],
  ];
  if (activity === 'walk' || activity === 'run') {
    stats.push(['Tempo', fmtPace(m.avgSpeedKmh)], ['Tırmanış', fmtM(m.ascentM), UP], ['En yüksek', fmtM(m.maxEle)], ['Hareket', fmtDuration(m.movingSec)]);
  } else if (activity === 'car') {
    stats.push(['Ort. hız', fmtKmh(m.avgSpeedKmh)], ['Maks. hız', fmtKmh(m.maxSpeedKmh)]);
    if (rec.fuel) {
      const r = computeFuel(m.distanceM, rec.fuel);
      stats.push(['Yakıt + masraf', `${CURRENCY_SYMBOL[rec.fuel.currency]}${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(r.total)}`, AMBER]);
    } else stats.push(['Tırmanış', fmtM(m.ascentM), UP]);
    stats.push(['Hareket', fmtDuration(m.movingSec)]);
  } else {
    stats.push(['Ort. hız', fmtKmh(m.avgSpeedKmh)], ['Tırmanış', fmtM(m.ascentM), UP], ['Maks. hız', fmtKmh(m.maxSpeedKmh)], ['En yüksek', fmtM(m.maxEle)]);
  }
  void prof;
  const cols = 3;
  const gridTop = MAP_H + 40;
  const cellW = (W - P * 2) / cols;
  const cellH = shape === 'portrait' ? 120 : 104;
  stats.slice(0, 6).forEach(([k, v, c], i) => {
    const cx = P + (i % cols) * cellW;
    const cy = gridTop + Math.floor(i / cols) * cellH;
    g.fillStyle = MUTED;
    g.font = font(500, 22);
    g.fillText(k, cx, cy + 26);
    g.fillStyle = c ?? FG;
    g.font = font(600, 46);
    g.fillText(v, cx, cy + 82);
  });

  // Rakım profili
  const profTop = gridTop + cellH * 2 + 20;
  const profH = H - profTop - 80;
  if (res.route.hasEle && profH > 60) {
    const { startIdx: a, endIdx: b } = m.trim;
    const xs: number[] = [], ys: number[] = [];
    const step = Math.max(1, Math.floor((b - a) / 600));
    for (let i = a; i <= b; i += step) if (isFinite(res.route.ele[i])) { xs.push(res.cum[i]); ys.push(res.route.ele[i]); }
    if (xs.length > 2) {
      const x0 = xs[0], x1 = xs[xs.length - 1], y0 = Math.min(...ys), y1 = Math.max(...ys);
      const px = (x: number) => P + ((x - x0) / (x1 - x0 || 1)) * (W - P * 2);
      const py = (v: number) => profTop + profH - ((v - y0) / (y1 - y0 || 1)) * (profH - 10);
      g.fillStyle = PANEL;
      g.beginPath();
      g.moveTo(px(xs[0]), profTop + profH);
      xs.forEach((x, i) => g.lineTo(px(x), py(ys[i])));
      g.lineTo(px(xs[xs.length - 1]), profTop + profH);
      g.closePath();
      const fg = g.createLinearGradient(0, profTop, 0, profTop + profH);
      fg.addColorStop(0, 'rgba(240,160,60,0.35)');
      fg.addColorStop(1, 'rgba(240,160,60,0.03)');
      g.fillStyle = fg;
      g.fill();
      g.strokeStyle = AMBER;
      g.lineWidth = 3;
      g.beginPath();
      xs.forEach((x, i) => (i ? g.lineTo(px(x), py(ys[i])) : g.moveTo(px(x), py(ys[i]))));
      g.stroke();
    }
  }

  // Alt bilgi
  g.fillStyle = MUTED;
  g.font = font(500, 20);
  g.fillText('Rota Analiz', P, H - 34);
  if (hide) {
    g.textAlign = 'right';
    g.fillText(`Başlangıç ve bitişteki ${opt.hideMeters} m gizlendi`, W - P, H - 34);
    g.textAlign = 'left';
  }
  g.fillStyle = AMBER;
  g.fillRect(P - 18, H - 50, 6, 20);

  return new Promise<Blob>((resolve) => cv.toBlob((b) => resolve(b!), 'image/png'));
}
