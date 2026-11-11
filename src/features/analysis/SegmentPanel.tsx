import { useEffect, useState } from 'react';
import type { ActivityType, SavedSegment } from '../../core/types';
import type { SegmentMetrics } from '../../analysis/segment';
import { PROFILES } from '../../analysis/activity';
import { fmtDuration, fmtKm, fmtKmh, fmtM, fmtPace, fmtTime, fmt1 } from '../../core/format';

interface Props {
  activity: ActivityType;
  pickMode: boolean;
  hasSelection: boolean;
  seg: SegmentMetrics | null;
  saved: { s: SavedSegment; m: SegmentMetrics }[];
  activeSavedId: string | null;
  maxKm: number;
  onStartPick(): void;
  onCancelPick(): void;
  onClear(): void;
  onKmRange(a: number, b: number): void;
  onSave(name: string): void;
  onSelectSaved(s: SavedSegment): void;
  onDeleteSaved(id: string): void;
}

const pct = (v: number | null) => (v == null ? '—' : `%${fmt1(v)}`);

function Row({ k, v, tone }: { k: string; v: string; tone?: 'up' | 'down' }) {
  return (
    <div className="contents">
      <dt className="text-fg-muted">{k}</dt>
      <dd className={`tnum text-right ${tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-fg'}`}>{v}</dd>
    </div>
  );
}

export function SegmentPanel(p: Props) {
  const prof = PROFILES[p.activity];
  const s = p.seg;
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [name, setName] = useState('');
  // Seçim değişince km kutularını güncelle
  useEffect(() => {
    if (s) { setFrom((s.startM / 1000).toFixed(2).replace('.', ',')); setTo((s.endM / 1000).toFixed(2).replace('.', ',')); }
  }, [s?.a, s?.b]);

  const applyKm = () => {
    const num = (v: string) => parseFloat(v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v);
    const a = num(from.trim() || '0');
    const b = num(to.trim());
    if (isFinite(a) && isFinite(b) && b > a) p.onKmRange(a, b);
  };

  return (
    <section className="border-b border-ink-700 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="ra-label">Bölüm analizi</h3>
        {p.hasSelection && <button className="text-[11px] text-fg-faint hover:text-fg" onClick={p.onClear}>Temizle</button>}
      </div>

      {!p.hasSelection && !p.pickMode && (
        <div className="space-y-2">
          <button className="ra-btn w-full justify-center" onClick={p.onStartPick}>Haritada iki nokta seç</button>
          <p className="text-[11px] leading-snug text-fg-faint">Ya da alttaki grafikte sürükleyerek aralık seçin, veya km girin:</p>
        </div>
      )}
      {p.pickMode && (
        <div className="flex items-center justify-between rounded-[3px] border border-amber/40 bg-amber-soft px-2.5 py-2 text-[12px] text-amber">
          <span>{p.hasSelection ? 'Şimdi bitiş noktasına (B) tıklayın' : 'Rota üzerinde başlangıç noktasına (A) tıklayın'}</span>
          <button className="text-[11px] text-fg-muted hover:text-fg" onClick={p.onCancelPick}>Vazgeç</button>
        </div>
      )}

      <div className="mt-2 flex items-center gap-1.5 text-[11.5px] text-fg-muted">
        <input className="ra-input w-[72px] tnum" placeholder="0" value={from} onChange={(e) => setFrom(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyKm()} aria-label="Başlangıç km" />
        –
        <input className="ra-input w-[72px] tnum" placeholder={fmt1(p.maxKm)} value={to} onChange={(e) => setTo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyKm()} aria-label="Bitiş km" />
        km
        <button className="ra-chip ml-auto" onClick={applyKm}>Uygula</button>
      </div>

      {s && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
            <div><div className="text-[11px] text-fg-muted">Mesafe</div><div className="tnum text-[17px] font-medium">{fmtKm(s.distanceM)}</div></div>
            <div><div className="text-[11px] text-fg-muted">Geçen süre</div><div className="tnum text-[17px] font-medium">{fmtDuration(s.elapsedSec)}</div></div>
          </div>
          <dl className="mt-2.5 grid grid-cols-[1fr_auto] gap-y-1 text-[11.5px]">
            {s.startTime != null && <Row k="Saat" v={`${fmtTime(s.startTime)} – ${fmtTime(s.endTime)}`} />}
            <Row k="Hareket süresi" v={fmtDuration(s.movingSec)} />
            {prof.showPace ? <Row k="Ort. tempo" v={`${fmtPace(s.avgSpeedKmh)} · ${fmtKmh(s.avgSpeedKmh)}`} /> : <Row k="Ort. hız" v={fmtKmh(s.avgSpeedKmh)} />}
            <Row k="Maks. hız" v={fmtKmh(s.maxSpeedKmh)} />
            <Row k="Rakım A → B" v={`${fmtM(s.startEle)} → ${fmtM(s.endEle)}`} />
            <Row k="En düşük / en yüksek" v={`${fmtM(s.minEle)} / ${fmtM(s.maxEle)}`} />
            <Row k="Toplam tırmanış" v={s.ascentM == null ? '—' : `↑ ${fmtM(s.ascentM)}`} tone="up" />
            <Row k="Toplam iniş" v={s.descentM == null ? '—' : `↓ ${fmtM(s.descentM)}`} tone="down" />
            <Row k="Ortalama eğim" v={pct(s.avgGradePct)} />
            <Row k="Maks. yokuş" v={pct(s.maxUpGradePct)} tone="up" />
            <Row k="Maks. iniş eğimi" v={pct(s.maxDownGradePct)} tone="down" />
          </dl>
          {s.crossesGap && <p className="mt-2 text-[11px] text-amber">Seçim bir kayıt boşluğunu kapsıyor; boşluk mesafeye eklenmedi.</p>}
          <div className="mt-3 flex gap-1.5">
            <input className="ra-input min-w-0 flex-1" placeholder="Bölüm adı (ör. Zigana tırmanışı)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (p.onSave(name.trim() || `Bölüm ${p.saved.length + 1}`), setName(''))} />
            <button className="ra-btn" onClick={() => { p.onSave(name.trim() || `Bölüm ${p.saved.length + 1}`); setName(''); }}>Kaydet</button>
          </div>
        </>
      )}

      {p.saved.length > 0 && (
        <div className="mt-4">
          <div className="ra-label mb-1.5">Kayıtlı bölümler{p.saved.length > 1 ? ' · karşılaştırma' : ''}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] tnum">
              <thead className="text-fg-faint">
                <tr>
                  <th className="py-1 text-left font-normal">Ad</th>
                  <th className="text-right font-normal">km</th>
                  <th className="text-right font-normal">Süre</th>
                  <th className="text-right font-normal">{prof.showPace ? 'Tempo' : 'Ort.'}</th>
                  <th className="text-right font-normal">↑ m</th>
                  <th className="text-right font-normal">Eğim</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {p.saved.map(({ s: sv, m }) => (
                  <tr key={sv.id} onClick={() => p.onSelectSaved(sv)} className={`cursor-pointer border-t border-ink-700 hover:bg-ink-800 ${p.activeSavedId === sv.id ? 'text-amber' : 'text-fg'}`}>
                    <td className="max-w-[90px] truncate py-1 pr-1" title={sv.name}>{sv.name}</td>
                    <td className="text-right">{fmt1(m.distanceM / 1000)}</td>
                    <td className="text-right">{fmtDuration(m.elapsedSec, true)}</td>
                    <td className="text-right">{prof.showPace ? fmtPace(m.avgSpeedKmh).replace(' dk/km', '') : fmt1(m.avgSpeedKmh)}</td>
                    <td className="text-right text-up">{m.ascentM == null ? '—' : Math.round(m.ascentM)}</td>
                    <td className="text-right">{pct(m.avgGradePct)}</td>
                    <td className="pl-1 text-right">
                      <button className="text-fg-faint hover:text-down" onClick={(e) => { e.stopPropagation(); p.onDeleteSaved(sv.id); }} aria-label="Sil">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
