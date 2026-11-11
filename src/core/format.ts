// Türkçe biçimlendirme yardımcıları (tr-TR, Europe/Istanbul)

export const TZ = 'Europe/Istanbul';
const nf = (min: number, max = min) =>
  new Intl.NumberFormat('tr-TR', { minimumFractionDigits: min, maximumFractionDigits: max });
const nf0 = nf(0);
const nf1 = nf(1);
const nf2 = nf(2);
const dash = '—';

export const fmtInt = (v: number | null | undefined) => (v == null || !isFinite(v) ? dash : nf0.format(Math.round(v)));
export const fmt1 = (v: number | null | undefined) => (v == null || !isFinite(v) ? dash : nf1.format(v));
export const fmt2 = (v: number | null | undefined) => (v == null || !isFinite(v) ? dash : nf2.format(v));

export const fmtKm = (m: number | null | undefined) =>
  m == null || !isFinite(m) ? dash : m < 10000 ? `${nf2.format(m / 1000)} km` : `${nf1.format(m / 1000)} km`;
export const fmtM = (m: number | null | undefined) => (m == null || !isFinite(m) ? dash : `${nf0.format(Math.round(m))} m`);
export const fmtKmh = (v: number | null | undefined) => (v == null || !isFinite(v) ? dash : `${nf1.format(v)} km/sa`);

/** Tempo: dk/km */
export const fmtPace = (kmh: number | null | undefined) => {
  if (kmh == null || !isFinite(kmh) || kmh <= 0.5) return dash;
  const secPerKm = 3600 / kmh;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s === 60 ? 0 : s).padStart(2, '0')} dk/km`;
};

export const fmtDuration = (sec: number | null | undefined, compact = false): string => {
  if (sec == null || !isFinite(sec)) return dash;
  if (sec < 0) return '−' + fmtDuration(-sec, compact);
  const t = Math.round(sec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (compact) return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  if (h > 0) return `${h} sa ${String(m).padStart(2, '0')} dk`;
  if (m > 0) return `${m} dk ${String(s).padStart(2, '0')} sn`;
  return `${s} sn`;
};

const dtf = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const dtfTime = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const dtfTimeS = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' });
const dtfLong = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });

export const fmtDate = (ms: number | null | undefined) => (ms == null || !isFinite(ms) ? dash : dtf.format(ms));
export const fmtTime = (ms: number | null | undefined, seconds = false) =>
  ms == null || !isFinite(ms) ? dash : (seconds ? dtfTimeS : dtfTime).format(ms);
export const fmtDateTime = (ms: number | null | undefined) => (ms == null || !isFinite(ms) ? dash : `${dtf.format(ms)} ${dtfTime.format(ms)}`);
export const fmtDateLong = (ms: number | null | undefined) => (ms == null || !isFinite(ms) ? dash : dtfLong.format(ms));

/** İstanbul saatine göre YYYY-MM-DD (klasör adları ve filtreler için). */
export const isoDateTR = (ms: number) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
  return parts; // en-CA => YYYY-MM-DD
};

export const fmtCoord = (lat: number, lon: number) => `${lat.toFixed(6)}, ${lon.toFixed(6)}`;

/** Türkçe duyarlı, aksan duyarsız arama anahtarı. */
export const searchKey = (s: string) =>
  s
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export const collator = new Intl.Collator('tr-TR', { sensitivity: 'base', numeric: true });

/** Dosya/klasör adı için güvenli parça; Türkçe karakterler korunur. */
export const safeName = (s: string) =>
  s
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60) || 'rota';
