import { useMemo, useState } from 'react';
import type { ActivityType, RouteRecord } from '../../core/types';
import { useApp } from '../../state/store';
import { collator, fmtDate, fmtDuration, fmtKm, fmtM, fmtTime, searchKey } from '../../core/format';
import { tr } from '../../i18n/tr';
import { ActivityBadge, ACTIVITIES } from '../../ui/ActivityPicker';
import { RouteThumb } from '../../ui/RouteThumb';

type SortKey = 'date' | 'name' | 'distance' | 'duration' | 'ascent';

const startMs = (r: RouteRecord) => r.metrics.startTime ?? r.createdAt;
const dayStart = (iso: string) => new Date(iso + 'T00:00:00+03:00').getTime();

export function ArchiveView() {
  const { records, openRecord, deleteRecord, startCompare } = useApp();
  const [picked, setPicked] = useState<string[]>([]);
  const togglePick = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 4 ? p : [...p, id]));
  const [q, setQ] = useState('');
  const [type, setType] = useState<ActivityType | 'all'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 });

  const rows = useMemo(() => {
    const k = searchKey(q.trim());
    const f = from ? dayStart(from) : -Infinity;
    const t = to ? dayStart(to) + 864e5 : Infinity;
    const list = records.filter((r) => {
      if (type !== 'all' && r.activity !== type) return false;
      const s = startMs(r);
      if (s < f || s >= t) return false;
      if (!k) return true;
      return searchKey([r.name, r.startPlace, r.endPlace, r.notes, ...r.tags].join(' ')).includes(k);
    });
    const val = (r: RouteRecord): number | string => {
      switch (sort.key) {
        case 'date': return startMs(r);
        case 'name': return r.name;
        case 'distance': return r.metrics.distanceM;
        case 'duration': return r.metrics.elapsedSec ?? -1;
        case 'ascent': return r.metrics.ascentM ?? -1;
      }
    };
    return list.sort((a, b) => {
      const va = val(a), vb = val(b);
      return (typeof va === 'string' ? collator.compare(va, vb as string) : va - (vb as number)) * sort.dir;
    });
  }, [records, q, type, from, to, sort]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({ d: acc.d + r.metrics.distanceM, t: acc.t + (r.metrics.elapsedSec ?? 0), a: acc.a + (r.metrics.ascentM ?? 0) }),
        { d: 0, t: 0, a: 0 },
      ),
    [rows],
  );

  const th = (key: SortKey, label: string, cls = '') => (
    <th className={`px-3 py-2 font-medium ${cls}`}>
      <button
        className={`inline-flex items-center gap-1 hover:text-fg ${sort.key === key ? 'text-fg' : ''}`}
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : key === 'name' ? 1 : -1 }))}
      >
        {label}
        {sort.key === key && <span className="text-amber">{sort.dir === 1 ? '↑' : '↓'}</span>}
      </button>
    </th>
  );

  const quick = (days: number | 'month' | 'year') => {
    const now = new Date();
    const iso = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
    if (days === 'month') setFrom(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
    else if (days === 'year') setFrom(iso(new Date(now.getFullYear(), 0, 1)));
    else setFrom(iso(new Date(now.getTime() - days * 864e5)));
    setTo('');
  };

  if (!records.length)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <div className="text-[15px] text-fg">{tr.archive.empty}</div>
        <p className="max-w-md text-[12.5px] text-fg-muted">{tr.archive.emptySub}</p>
        <p className="text-[11.5px] text-fg-faint">Desteklenen biçimler: GPX, KML, KMZ</p>
      </div>
    );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-700 bg-ink-900 px-3 py-2">
        <input className="ra-input w-[280px]" placeholder={tr.archive.search} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="ra-input" value={type} onChange={(e) => setType(e.target.value as any)}>
          <option value="all">{tr.archive.allTypes}</option>
          {ACTIVITIES.map((a) => <option key={a} value={a}>{tr.activity[a]}</option>)}
        </select>
        <div className="flex items-center gap-1.5 text-[11.5px] text-fg-muted">
          <input type="date" className="ra-input" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={tr.archive.from} />
          –
          <input type="date" className="ra-input" value={to} onChange={(e) => setTo(e.target.value)} aria-label={tr.archive.to} />
        </div>
        <div className="flex gap-1">
          <button className="ra-chip" onClick={() => quick(30)}>Son 30 gün</button>
          <button className="ra-chip" onClick={() => quick('month')}>Bu ay</button>
          <button className="ra-chip" onClick={() => quick('year')}>Bu yıl</button>
          {(from || to || q || type !== 'all') && (
            <button className="ra-chip" onClick={() => { setQ(''); setFrom(''); setTo(''); setType('all'); }}>Temizle</button>
          )}
        </div>
        {picked.length > 0 && (
          <div className="ml-2 flex items-center gap-2 rounded-[3px] border border-amber/40 bg-amber-soft px-2 py-0.5 text-[11.5px] text-amber">
            {picked.length} seçili
            <button className="ra-btn-primary h-6 px-2 text-[11px]" disabled={picked.length < 2} onClick={() => startCompare(picked)}>Karşılaştır</button>
            <button className="text-fg-muted hover:text-fg" onClick={() => setPicked([])}>Temizle</button>
          </div>
        )}
        <span className="ml-auto text-[11.5px] text-fg-muted tnum">{tr.archive.count(rows.length)}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead className="sticky top-0 z-10 bg-ink-900 text-left text-[11px] uppercase tracking-[0.05em] text-fg-faint">
            <tr className="border-b border-ink-700">
              <th className="w-8" title="Karşılaştırmak için seçin (en fazla 4)" />
              <th className="w-[64px]" />
              {th('date', tr.archive.cols.date)}
              {th('name', tr.archive.cols.name)}
              <th className="px-3 py-2 font-medium">{tr.archive.cols.type}</th>
              {th('distance', tr.archive.cols.distance, 'text-right')}
              {th('duration', tr.archive.cols.duration, 'text-right')}
              {th('ascent', tr.archive.cols.ascent, 'text-right')}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} onClick={() => openRecord(r.id)} className="group cursor-pointer border-b border-ink-800 hover:bg-ink-850">
                <td className="pl-3" onClick={(e) => { e.stopPropagation(); togglePick(r.id); }}>
                  <input type="checkbox" className="accent-[#f0a03c]" checked={picked.includes(r.id)} onChange={() => togglePick(r.id)} onClick={(e) => e.stopPropagation()} aria-label="Karşılaştırma için seç" />
                </td>
                <td className="py-1.5"><RouteThumb pts={r.preview} /></td>
                <td className="whitespace-nowrap px-3 tnum">
                  <div className="text-fg">{fmtDate(startMs(r))}</div>
                  <div className="text-[11px] text-fg-faint">{fmtTime(r.metrics.startTime)}</div>
                </td>
                <td className="px-3">
                  <div className="text-fg">{r.name}</div>
                  {(r.startPlace || r.endPlace) && (
                    <div className="text-[11px] text-fg-faint">{[r.startPlace, r.endPlace].filter(Boolean).join(' → ')}</div>
                  )}
                </td>
                <td className="px-3"><ActivityBadge a={r.activity} /></td>
                <td className="px-3 text-right tnum">{fmtKm(r.metrics.distanceM)}</td>
                <td className="px-3 text-right tnum">{fmtDuration(r.metrics.elapsedSec)}</td>
                <td className="px-3 text-right tnum text-up">{r.metrics.ascentM == null ? '—' : fmtM(r.metrics.ascentM)}</td>
                <td className="pr-2 text-right">
                  <button
                    className="invisible rounded-[3px] px-1.5 py-0.5 text-[11px] text-fg-faint hover:bg-ink-700 hover:text-down group-hover:visible"
                    onClick={(e) => { e.stopPropagation(); if (confirm(tr.archive.confirmDelete(r.name))) deleteRecord(r); }}
                  >
                    {tr.actions.delete}
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={9} className="px-3 py-10 text-center text-fg-muted">{tr.archive.noMatch}</td></tr>
            )}
          </tbody>
          {rows.length > 1 && (
            <tfoot className="sticky bottom-0 bg-ink-900 text-[12px]">
              <tr className="border-t border-ink-600">
                <td colSpan={2} />
                <td className="px-3 py-2 text-fg-muted" colSpan={3}>{tr.archive.totals}</td>
                <td className="px-3 text-right tnum">{fmtKm(totals.d)}</td>
                <td className="px-3 text-right tnum">{fmtDuration(totals.t)}</td>
                <td className="px-3 text-right tnum text-up">{fmtM(totals.a)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
