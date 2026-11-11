// Videodaki gösterge paneli: harita karesinin üstüne 2B tuvalde çizilir.
import type { ActivityType, RouteRecord } from '../core/types';
import type { AnalysisResult } from '../workers/protocol';
import type { FramePos, Timeline } from './timeline';
import { PROFILES } from '../analysis/activity';
import { tr } from '../i18n/tr';
import { fmtDateLong, fmtDuration, fmtPace, fmtTime, fmt1 } from '../core/format';

export interface HudInput {
  rec: RouteRecord;
  res: AnalysisResult;
  grade: Float64Array;
  activity: ActivityType;
  tl: Timeline;
  pos: FramePos;
  W: number;
  H: number;
  attribution: string;
  showClock: boolean;
}

const FG = '#f2f0eb', MUTED = 'rgba(242,240,235,0.62)', AMBER = '#f0a03c', UP = '#5fb57f', DOWN = '#e2614f';

let profileCache: { key: string; xs: Float32Array; ys: Float32Array; min: number; max: number } | null = null;

function profile(res: AnalysisResult, a: number, b: number) {
  const key = `${res.route.lat.length}-${a}-${b}`;
  if (profileCache?.key === key) return profileCache;
  const xs: number[] = [], ys: number[] = [];
  const step = Math.max(1, Math.floor((b - a) / 500));
  for (let i = a; i <= b; i += step) if (isFinite(res.route.ele[i])) { xs.push(res.cum[i]); ys.push(res.route.ele[i]); }
  profileCache = { key, xs: Float32Array.from(xs), ys: Float32Array.from(ys), min: Math.min(...ys), max: Math.max(...ys) };
  return profileCache;
}

export function drawHud(g: CanvasRenderingContext2D, h: HudInput) {
  const { res, pos, W, H, activity, tl, rec } = h;
  const r = res.route;
  const prof = PROFILES[activity];
  const s = Math.min(W, H) / 1080; // ölçek
  const font = (w: number, px: number) => `${w} ${Math.round(px * s)}px "Inter Variable", system-ui, sans-serif`;
  const pad = 44 * s;
  const portrait = H > W * 1.2;

  // Üst başlık
  const topGrad = g.createLinearGradient(0, 0, 0, 170 * s);
  topGrad.addColorStop(0, 'rgba(12,13,14,0.75)');
  topGrad.addColorStop(1, 'rgba(12,13,14,0)');
  g.fillStyle = topGrad;
  g.fillRect(0, 0, W, 170 * s);
  g.fillStyle = AMBER;
  g.font = font(600, 22);
  g.textBaseline = 'alphabetic';
  g.fillText(tr.activity[activity].toLocaleUpperCase('tr-TR'), pad, pad + 14 * s);
  g.fillStyle = FG;
  g.font = font(650, 40);
  g.fillText(rec.name.length > 34 ? rec.name.slice(0, 33) + '…' : rec.name, pad, pad + 60 * s);
  g.fillStyle = MUTED;
  g.font = font(400, 22);
  g.fillText(fmtDateLong(res.metrics.startTime ?? rec.createdAt), pad, pad + 92 * s);

  // Alt panel
  const panelH = (portrait ? 430 : 300) * s;
  const py = H - panelH;
  const botGrad = g.createLinearGradient(0, py - 60 * s, 0, H);
  botGrad.addColorStop(0, 'rgba(12,13,14,0)');
  botGrad.addColorStop(0.25, 'rgba(12,13,14,0.78)');
  botGrad.addColorStop(1, 'rgba(12,13,14,0.92)');
  g.fillStyle = botGrad;
  g.fillRect(0, py - 60 * s, W, panelH + 60 * s);

  const i = pos.i;
  const done = res.cum[i] + (res.cum[Math.min(i + 1, tl.b)] - res.cum[i]) * pos.f - res.cum[tl.a];
  const totalM = res.cum[tl.b] - res.cum[tl.a];
  const v = res.speedKmh[i];
  const gr = h.grade[i];
  const ele = r.ele[i];
  const t0 = r.time[tl.a];
  const tNow = r.time[i] + (r.time[Math.min(i + 1, tl.b)] - r.time[i]) * pos.f;
  const items: [string, string, string?][] = [];
  if (r.hasTime) items.push([prof.showPace ? 'Tempo' : 'Hız', isFinite(v) ? (prof.showPace ? fmtPace(v).replace(' dk/km', '') : `${Math.round(v)}`) : '—', prof.showPace ? 'dk/km' : 'km/sa']);
  items.push(['Yapılan', fmt1(done / 1000), 'km']);
  items.push(['Kalan', fmt1(Math.max(0, totalM - done) / 1000), 'km']);
  if (r.hasEle) items.push(['Rakım', isFinite(ele) ? `${Math.round(ele)}` : '—', 'm']);
  if (r.hasEle) items.push(['Eğim', isFinite(gr) ? `${gr >= 0 ? '+' : ''}${fmt1(gr)}` : '—', '%']);
  if (r.hasTime) items.push(['Geçen', fmtDuration(isFinite(tNow - t0) ? (tNow - t0) / 1000 : null, true), '']);
  if (r.hasTime && h.showClock) items.push(['Saat', fmtTime(tNow), '']);

  const cols = portrait ? 3 : Math.min(items.length, 7);
  const cellW = (W - pad * 2) / cols;
  items.forEach(([k, val, unit], n) => {
    const cx = pad + (n % cols) * cellW;
    const cy = py + 18 * s + Math.floor(n / cols) * 104 * s;
    g.fillStyle = MUTED;
    g.font = font(500, 20);
    g.fillText(k, cx, cy + 20 * s);
    const isGrade = k === 'Eğim' && isFinite(gr);
    g.fillStyle = isGrade ? (gr >= 0 ? UP : DOWN) : FG;
    g.font = font(650, 46);
    g.fillText(val, cx, cy + 72 * s);
    if (unit) {
      const w = g.measureText(val).width;
      g.fillStyle = MUTED;
      g.font = font(500, 20);
      g.fillText(unit, cx + w + 8 * s, cy + 72 * s);
    }
  });

  // Rakım profili + ilerleme
  const rows = Math.ceil(items.length / cols);
  const pTop = py + 18 * s + rows * 104 * s + 6 * s;
  const pH = H - pTop - 46 * s;
  const pW = W - pad * 2;
  const pr = r.hasEle ? profile(res, tl.a, tl.b) : null;
  const x0 = res.cum[tl.a], x1 = res.cum[tl.b];
  const px = (x: number) => pad + ((x - x0) / (x1 - x0 || 1)) * pW;
  const curX = px(res.cum[tl.a] + done);
  if (pr && pr.xs.length > 2 && pH > 20 * s) {
    const py2 = (y: number) => pTop + pH - ((y - pr.min) / (pr.max - pr.min || 1)) * pH;
    g.beginPath();
    g.moveTo(px(pr.xs[0]), pTop + pH);
    for (let k = 0; k < pr.xs.length; k++) g.lineTo(px(pr.xs[k]), py2(pr.ys[k]));
    g.lineTo(px(pr.xs[pr.xs.length - 1]), pTop + pH);
    g.closePath();
    g.fillStyle = 'rgba(242,240,235,0.10)';
    g.fill();
    g.save();
    g.beginPath();
    g.rect(pad, pTop - 4, curX - pad, pH + 8);
    g.clip();
    g.beginPath();
    g.moveTo(px(pr.xs[0]), pTop + pH);
    for (let k = 0; k < pr.xs.length; k++) g.lineTo(px(pr.xs[k]), py2(pr.ys[k]));
    g.lineTo(px(pr.xs[pr.xs.length - 1]), pTop + pH);
    g.closePath();
    g.fillStyle = 'rgba(240,160,60,0.45)';
    g.fill();
    g.restore();
    g.strokeStyle = FG;
    g.lineWidth = 2 * s;
    g.beginPath();
    g.moveTo(curX, pTop);
    g.lineTo(curX, pTop + pH);
    g.stroke();
  } else {
    // Rakım yoksa düz ilerleme çubuğu
    const by = H - 70 * s;
    g.fillStyle = 'rgba(242,240,235,0.15)';
    g.fillRect(pad, by, pW, 8 * s);
    g.fillStyle = AMBER;
    g.fillRect(pad, by, curX - pad, 8 * s);
  }

  // Alt satır
  g.fillStyle = MUTED;
  g.font = font(500, 17);
  g.fillText('Rota Analiz', pad, H - 18 * s);
  if (h.attribution) {
    g.textAlign = 'right';
    g.font = font(400, 15);
    g.fillText(h.attribution, W - pad, H - 18 * s);
    g.textAlign = 'left';
  }
}
