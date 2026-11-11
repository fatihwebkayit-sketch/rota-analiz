import { useEffect, useState, type ReactNode } from 'react';
import type { ActivityType, RouteFuel, RouteRecord } from '../../core/types';
import { FuelPanel } from './FuelPanel';
import { placeNamesFor } from '../../core/geocode';
import { useApp } from '../../state/store';
import type { AnalysisResult } from '../../workers/protocol';
import { fmtDateLong, fmtDuration, fmtInt, fmtKm, fmtKmh, fmtM, fmtPace, fmtTime, fmt1, fmtCoord } from '../../core/format';
import { PROFILES } from '../../analysis/activity';
import { ActivityPicker } from '../../ui/ActivityPicker';
import { tr } from '../../i18n/tr';

interface Props {
  record: RouteRecord;
  result: AnalysisResult | null;
  onRename(name: string): void;
  onActivity(a: ActivityType): void;
  onPlaces(start: string, end: string): void;
  onNotes(notes: string): void;
  onAutoTrim(v: boolean): void;
  top?: ReactNode;
  onTags(tags: string[]): void;
  onFuel(f: RouteFuel): void;
}

/** Odak kaybında kaydeden metin alanı */
function useDraft(value: string) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return [v, setV] as const;
}

const Section = ({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) => (
  <section className="border-b border-ink-700 px-4 py-3">
    <div className="mb-2 flex items-center justify-between">
      <h3 className="ra-label">{title}</h3>
      {right}
    </div>
    {children}
  </section>
);

const Stat = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'up' | 'down' }) => (
  <div className="min-w-0">
    <div className="text-[11px] text-fg-muted">{label}</div>
    <div className={`tnum text-[17px] font-medium leading-6 ${tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-fg'}`}>{value}</div>
    {sub && <div className="tnum text-[11px] text-fg-faint">{sub}</div>}
  </div>
);

export function MetricsPanel({ record, result, onRename, onActivity, onPlaces, onNotes, onAutoTrim, top, onTags, onFuel }: Props) {
  const toast = useApp((s) => s.toast);
  const [finding, setFinding] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const m = result?.metrics ?? record.metrics;
  const prof = PROFILES[record.activity];
  const [name, setName] = useDraft(record.name);
  const [sp, setSp] = useDraft(record.startPlace);
  const [ep, setEp] = useDraft(record.endPlace);
  const [notes, setNotes] = useDraft(record.notes);
  const q = m.quality;
  const src = record.source.stats;
  const noTime = m.elapsedSec == null;

  return (
    <aside className="flex w-[340px] shrink-0 flex-col overflow-y-auto border-l border-ink-700 bg-ink-850">
      <div className="border-b border-ink-700 px-4 pb-3 pt-3">
        <input
          className="w-full bg-transparent text-[15px] font-semibold text-fg outline-none focus:bg-ink-800"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== record.name && onRename(name.trim())}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-label="Kayıt adı"
        />
        <div className="mt-0.5 text-[11.5px] text-fg-muted">
          {fmtDateLong(m.startTime ?? record.createdAt)}
          {m.startTime != null && <span className="tnum"> · {fmtTime(m.startTime)}–{fmtTime(m.endTime)}</span>}
        </div>
        <div className="mt-2.5"><ActivityPicker value={record.activity} onChange={(a) => a !== record.activity && onActivity(a)} compact /></div>
        <button className="ra-btn mt-2.5 w-full justify-center" onClick={() => useApp.getState().setExportOpen(true)}>
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 2v9M4.5 7.5 8 11l3.5-3.5M2.5 10.5v3h11v-3" /></svg>
          Rapor oluştur / Dışa aktar (PDF, PNG, GPX…)
        </button>
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <input className="ra-input" placeholder="Başlangıç yeri" value={sp} onChange={(e) => setSp(e.target.value)} onBlur={() => (sp !== record.startPlace || ep !== record.endPlace) && onPlaces(sp.trim(), ep.trim())} />
          <input className="ra-input" placeholder="Bitiş yeri" value={ep} onChange={(e) => setEp(e.target.value)} onBlur={() => (sp !== record.startPlace || ep !== record.endPlace) && onPlaces(sp.trim(), ep.trim())} />
        </div>
        <button
          className="mt-1 text-[11px] text-fg-faint hover:text-fg disabled:opacity-50"
          disabled={finding || !m.start || !m.end}
          title="Yalnızca başlangıç ve bitiş koordinatları OpenStreetMap adres servisine gönderilir"
          onClick={async () => {
            setFinding(true);
            try {
              const n = await placeNamesFor(m.start!, m.end!);
              onPlaces(n.start, n.end);
            } catch (e) {
              toast('Yer adı bulunamadı: ' + (e as Error).message, 'error');
            } finally {
              setFinding(false);
            }
          }}
        >
          {finding ? 'Aranıyor…' : 'Yer adını bul (OpenStreetMap)'}
        </button>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {record.tags.map((t) => (
            <span key={t} className="inline-flex h-5 items-center gap-1 rounded-[2px] bg-ink-700 px-1.5 text-[11px] text-fg">
              {t}
              <button className="text-fg-faint hover:text-down" onClick={() => onTags(record.tags.filter((x) => x !== t))} aria-label="Etiketi kaldır">×</button>
            </span>
          ))}
          <input
            className="h-5 min-w-[90px] flex-1 bg-transparent text-[11px] text-fg outline-none placeholder:text-fg-faint"
            placeholder={record.tags.length ? '+ etiket' : '+ etiket ekle (Enter)'}
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ',') && tagDraft.trim()) {
                e.preventDefault();
                const t = tagDraft.trim().replace(/,$/, '');
                if (!record.tags.includes(t)) onTags([...record.tags, t]);
                setTagDraft('');
              }
            }}
          />
        </div>
      </div>

      {top}

      {PROFILES[record.activity].fuel && (
        <Section title="Yakıt ve masraf">
          <FuelPanel record={record} distanceM={m.distanceM} onChange={onFuel} />
        </Section>
      )}

      <Section title="Rota özeti">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Stat label={tr.metrics.distance} value={fmtKm(m.distanceM)} />
          <Stat label={tr.metrics.elapsed} value={fmtDuration(m.elapsedSec)} sub={noTime ? 'zaman bilgisi yok' : undefined} />
          <Stat label={tr.metrics.moving} value={fmtDuration(m.movingSec)} sub={m.movingSec != null ? `durma eşiği ${prof.stopSpeedKmh} km/sa` : undefined} />
          {prof.showPace ? (
            <Stat label={tr.metrics.pace} value={fmtPace(m.avgSpeedKmh)} sub={fmtKmh(m.avgSpeedKmh)} />
          ) : (
            <Stat label={tr.metrics.avgSpeed} value={fmtKmh(m.avgSpeedKmh)} sub="hareket süresine göre" />
          )}
          <Stat label={tr.metrics.maxSpeed} value={fmtKmh(m.maxSpeedKmh)} />
          <Stat label={tr.metrics.stops} value={fmtInt(m.stopCount)} sub="15 m içinde ≥30 sn" />
          <Stat label={tr.metrics.ascent} value={m.ascentM == null ? '—' : `↑ ${fmtM(m.ascentM)}`} tone="up" />
          <Stat label={tr.metrics.descent} value={m.descentM == null ? '—' : `↓ ${fmtM(m.descentM)}`} tone="down" />
          <Stat label={tr.metrics.minEle} value={fmtM(m.minEle)} />
          <Stat label={tr.metrics.maxEle} value={fmtM(m.maxEle)} />
        </div>
      </Section>

      <Section title="Başlangıç ve bitiş">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11.5px]">
          <dt className="flex items-center gap-1.5 text-fg-muted"><span className="h-2 w-2 rounded-full bg-up" />{tr.metrics.start}</dt>
          <dd className="text-right font-mono text-fg">{m.start ? fmtCoord(m.start[1], m.start[0]) : '—'}</dd>
          <dt className="flex items-center gap-1.5 text-fg-muted"><span className="h-2 w-2 rounded-full bg-down" />{tr.metrics.end}</dt>
          <dd className="text-right font-mono text-fg">{m.end ? fmtCoord(m.end[1], m.end[0]) : '—'}</dd>
          <dt className="text-fg-muted">Rakım</dt>
          <dd className="tnum text-right text-fg">{fmtM(m.startEle)} → {fmtM(m.endEle)}</dd>
        </dl>
        <label className="mt-3 flex cursor-pointer items-start gap-2 text-[12px] text-fg">
          <input type="checkbox" className="mt-0.5 accent-[#f0a03c]" checked={record.autoTrim} onChange={(e) => onAutoTrim(e.target.checked)} />
          <span>
            {tr.trim.auto}
            <span className="block text-[11px] text-fg-faint">
              {m.trim.trimmedStartPts || m.trim.trimmedEndPts
                ? `Baştan ${fmtDuration(m.trim.trimmedStartSec ?? 0)} · sondan ${fmtDuration(m.trim.trimmedEndSec ?? 0)} haritada gri kesik çizgi`
                : 'Kırpılacak bekleme bulunmadı'}
            </span>
          </span>
        </label>
      </Section>

      <Section title={tr.quality.title}>
        <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-[11.5px]">
          <dt className="text-fg-muted">{tr.quality.points}</dt><dd className="tnum text-fg">{fmtInt(q.pointCount)}</dd>
          <dt className="text-fg-muted">{tr.quality.segments}</dt><dd className="tnum text-fg">{q.segmentCount}</dd>
          <dt className="text-fg-muted">{tr.quality.interval}</dt><dd className="tnum text-fg">{q.medianIntervalSec == null ? '—' : `${fmt1(q.medianIntervalSec)} sn`}</dd>
          <dt className="text-fg-muted">{tr.quality.noTime}</dt><dd className="tnum text-fg">%{fmt1(q.noTimePct)}</dd>
          <dt className="text-fg-muted">{tr.quality.noEle}</dt><dd className="tnum text-fg">%{fmt1(q.noElePct)}</dd>
          <dt className="text-fg-muted">{tr.quality.spikes}</dt><dd className="tnum text-fg">{q.spikeCount}</dd>
          <dt className="text-fg-muted">{tr.quality.noSat}</dt><dd className="tnum text-fg">{q.noSatMovingCount}</dd>
          <dt className="text-fg-muted">{tr.quality.gaps}</dt><dd className="tnum text-fg">{q.gapCount}</dd>
        </dl>
        <ul className="mt-2 space-y-1 text-[11.5px] leading-snug text-fg-muted">
          {q.notes.map((n) => <li key={n} className="border-l-2 border-ink-600 pl-2">{n}</li>)}
        </ul>
        {src && (
          <div className="mt-3 rounded-[3px] border border-ink-700 bg-ink-900 p-2.5">
            <div className="mb-1.5 text-[11px] text-fg-muted">{tr.quality.source}{record.source.creator ? ` · ${record.source.creator}` : ''}</div>
            <table className="w-full text-[11.5px] tnum">
              <thead><tr className="text-fg-faint"><th className="text-left font-normal" /><th className="text-right font-normal">Kaynak</th><th className="text-right font-normal">Rota Analiz</th></tr></thead>
              <tbody>
                {src.distanceKm != null && <tr><td className="text-fg-muted">Mesafe</td><td className="text-right">{fmtKm(src.distanceKm * 1000)}</td><td className="text-right text-fg">{fmtKm(m.distanceM)}</td></tr>}
                {src.totalDuration && <tr><td className="text-fg-muted">Süre</td><td className="text-right">{src.totalDuration}</td><td className="text-right text-fg">{fmtDuration(m.elapsedSec, true)}</td></tr>}
                {src.movingDuration && <tr><td className="text-fg-muted">Hareket</td><td className="text-right">{src.movingDuration}</td><td className="text-right text-fg">{fmtDuration(m.movingSec, true)}</td></tr>}
                {src.maxSpeedKmh != null && <tr><td className="text-fg-muted">Maks. hız</td><td className="text-right">{fmtKmh(src.maxSpeedKmh)}</td><td className="text-right text-fg">{fmtKmh(m.maxSpeedKmh)}</td></tr>}
              </tbody>
            </table>
            <p className="mt-1.5 text-[10.5px] leading-snug text-fg-faint">Farklar; kırpma, durma eşiği ve yumuşatma kurallarından kaynaklanır.</p>
          </div>
        )}
      </Section>

      <Section title="Notlar">
        <textarea
          className="ra-input h-20 w-full resize-y py-1.5 leading-snug"
          placeholder="Bu rota hakkında notlar…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== record.notes && onNotes(notes)}
        />
        <div className="mt-2 text-[10.5px] text-fg-faint">Kaynak: {record.source.fileName} · {(record.source.size / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} KB</div>
      </Section>
    </aside>
  );
}
