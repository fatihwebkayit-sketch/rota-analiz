import { useMemo, useState } from 'react';
import type { ActivityType, RouteRecord } from '../../core/types';
import { useApp } from '../../state/store';
import { fmtDate, fmtDuration, fmtInt, fmtKm, fmtKmh, fmtM, fmtPace, fmt1, isoDateTR } from '../../core/format';
import { tr } from '../../i18n/tr';
import { ACTIVITIES } from '../../ui/ActivityPicker';
import { ACT_COLORS, CHART_TEXT, TOOLTIP, useEChart } from '../../charts/useEChart';
import { CURRENCY_SYMBOL } from '../../storage/settings';

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const startMs = (r: RouteRecord) => r.metrics.startTime ?? r.createdAt;
const yearOf = (ms: number) => +isoDateTR(ms).slice(0, 4);
const monthOf = (ms: number) => +isoDateTR(ms).slice(5, 7) - 1;

export function StatsView() {
  const { records, openRecord } = useApp();
  const years = useMemo(() => [...new Set(records.map((r) => yearOf(startMs(r))))].sort((a, b) => b - a), [records]);
  const [year, setYear] = useState<number | 'all'>(() => years[0] ?? new Date().getFullYear());
  const [type, setType] = useState<ActivityType | 'all'>('all');

  const list = useMemo(
    () => records.filter((r) => (year === 'all' || yearOf(startMs(r)) === year) && (type === 'all' || r.activity === type)),
    [records, year, type],
  );

  const totals = useMemo(() => {
    const t = { n: list.length, d: 0, time: 0, moving: 0, up: 0, cost: {} as Record<string, number> };
    for (const r of list) {
      t.d += r.metrics.distanceM;
      t.time += r.metrics.elapsedSec ?? 0;
      t.moving += r.metrics.movingSec ?? 0;
      t.up += r.metrics.ascentM ?? 0;
      if (r.activity === 'car' && r.fuel?.totalCost) t.cost[r.fuel.currency] = (t.cost[r.fuel.currency] ?? 0) + r.fuel.totalCost;
    }
    return t;
  }, [list]);

  // Aylık mesafe (yıl seçiliyse 12 ay; tümü seçiliyse yıllar)
  const barOption = useMemo(() => {
    const cats = year === 'all' ? [...years].reverse().map(String) : MONTHS;
    const series = ACTIVITIES.filter((a) => type === 'all' || a === type).map((a) => {
      const vals = new Array(cats.length).fill(0);
      for (const r of list) {
        if (r.activity !== a) continue;
        const k = year === 'all' ? cats.indexOf(String(yearOf(startMs(r)))) : monthOf(startMs(r));
        if (k >= 0) vals[k] += r.metrics.distanceM / 1000;
      }
      return { name: tr.activity[a], type: 'bar', stack: 'd', data: vals.map((v) => +v.toFixed(1)), itemStyle: { color: ACT_COLORS[a] }, barMaxWidth: 26, emphasis: { disabled: true } };
    });
    return {
      grid: { left: 48, right: 12, top: 30, bottom: 24 },
      legend: { top: 0, right: 0, textStyle: CHART_TEXT, itemWidth: 10, itemHeight: 10 },
      tooltip: { ...TOOLTIP, trigger: 'axis', valueFormatter: (v: number) => `${fmt1(v)} km` },
      xAxis: { type: 'category', data: cats, axisLabel: CHART_TEXT, axisLine: { lineStyle: { color: '#25272b' } }, axisTick: { show: false } },
      yAxis: { type: 'value', name: 'km', nameTextStyle: CHART_TEXT, axisLabel: CHART_TEXT, splitLine: { lineStyle: { color: '#25272b' } } },
      series,
    };
  }, [list, year, years, type]);
  const barEl = useEChart(barOption);

  // Takvim ısı haritası (günlük mesafe)
  const calYear = year === 'all' ? years[0] ?? new Date().getFullYear() : year;
  const calOption = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const r of records) {
      if (type !== 'all' && r.activity !== type) continue;
      const d = isoDateTR(startMs(r));
      if (+d.slice(0, 4) !== calYear) continue;
      byDay.set(d, (byDay.get(d) ?? 0) + r.metrics.distanceM / 1000);
    }
    const data = [...byDay].map(([d, v]) => [d, +v.toFixed(1)]);
    const max = Math.max(10, ...data.map((x) => x[1] as number));
    return {
      tooltip: { ...TOOLTIP, formatter: (p: any) => `${fmtDate(new Date(p.value[0] + 'T12:00:00+03:00').getTime())}<br/><b>${fmt1(p.value[1])} km</b>` },
      visualMap: { show: false, min: 0, max, inRange: { color: ['#3a2a14', '#f0a03c'] } },
      calendar: {
        range: String(calYear), top: 22, left: 34, right: 8, cellSize: ['auto', 13],
        itemStyle: { color: '#17181a', borderColor: '#0e0f10', borderWidth: 2 },
        splitLine: { show: false },
        dayLabel: { ...CHART_TEXT, firstDay: 1, nameMap: ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'] },
        monthLabel: { ...CHART_TEXT, nameMap: MONTHS },
        yearLabel: { show: false },
      },
      series: [{ type: 'heatmap', coordinateSystem: 'calendar', data }],
    };
  }, [records, calYear, type]);
  const calEl = useEChart(calOption);

  const byType = useMemo(
    () =>
      ACTIVITIES.map((a) => {
        const rs = list.filter((r) => r.activity === a);
        return { a, n: rs.length, d: rs.reduce((s, r) => s + r.metrics.distanceM, 0), t: rs.reduce((s, r) => s + (r.metrics.elapsedSec ?? 0), 0), up: rs.reduce((s, r) => s + (r.metrics.ascentM ?? 0), 0) };
      }).filter((x) => x.n > 0),
    [list],
  );

  const records2 = useMemo(() => {
    const out: { label: string; value: string; r: RouteRecord }[] = [];
    const max = (f: (r: RouteRecord) => number | null | undefined, rs: RouteRecord[]) =>
      rs.reduce<RouteRecord | null>((best, r) => ((f(r) ?? -Infinity) > (best ? f(best) ?? -Infinity : -Infinity) ? r : best), null);
    for (const a of ACTIVITIES) {
      const rs = list.filter((r) => r.activity === a);
      if (!rs.length) continue;
      const L = tr.activity[a];
      const d = max((r) => r.metrics.distanceM, rs);
      if (d) out.push({ label: `${L} · en uzun mesafe`, value: fmtKm(d.metrics.distanceM), r: d });
      const t = max((r) => r.metrics.elapsedSec, rs);
      if (t?.metrics.elapsedSec) out.push({ label: `${L} · en uzun süre`, value: fmtDuration(t.metrics.elapsedSec), r: t });
      const u = max((r) => r.metrics.ascentM, rs);
      if (u?.metrics.ascentM) out.push({ label: `${L} · en çok tırmanış`, value: fmtM(u.metrics.ascentM), r: u });
      const h = max((r) => r.metrics.maxEle, rs);
      if (h?.metrics.maxEle != null) out.push({ label: `${L} · en yüksek nokta`, value: fmtM(h.metrics.maxEle), r: h });
      const v = max((r) => (r.metrics.distanceM > 1000 ? r.metrics.avgSpeedKmh : null), rs);
      if (v?.metrics.avgSpeedKmh) out.push({ label: `${L} · en hızlı ortalama`, value: a === 'walk' || a === 'run' ? fmtPace(v.metrics.avgSpeedKmh) : fmtKmh(v.metrics.avgSpeedKmh), r: v });
    }
    return out;
  }, [list]);

  if (!records.length) return <div className="flex h-full items-center justify-center text-fg-muted">İstatistik için önce rota ekleyin.</div>;

  const costText = Object.entries(totals.cost).map(([c, v]) => `${CURRENCY_SYMBOL[c as keyof typeof CURRENCY_SYMBOL]}${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(v)}`).join(' + ') || '—';

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1200px] px-5 py-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select className="ra-input" value={year} onChange={(e) => setYear(e.target.value === 'all' ? 'all' : +e.target.value)}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
            <option value="all">Tüm yıllar</option>
          </select>
          <select className="ra-input" value={type} onChange={(e) => setType(e.target.value as any)}>
            <option value="all">{tr.archive.allTypes}</option>
            {ACTIVITIES.map((a) => <option key={a} value={a}>{tr.activity[a]}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[4px] border border-ink-700 bg-ink-700 md:grid-cols-5">
          {[
            ['Kayıt', fmtInt(totals.n)],
            ['Toplam mesafe', fmtKm(totals.d)],
            ['Toplam süre', fmtDuration(totals.time)],
            ['Toplam tırmanış', fmtM(totals.up)],
            ['Yakıt ve masraf', costText],
          ].map(([k, v]) => (
            <div key={k} className="bg-ink-850 px-4 py-3">
              <div className="text-[11px] text-fg-muted">{k}</div>
              <div className="tnum text-[19px] font-medium">{v}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
          <section className="rounded-[4px] border border-ink-700 bg-ink-850 p-3">
            <h3 className="ra-label mb-1">{year === 'all' ? 'Yıllara göre mesafe' : `${year} · aylara göre mesafe`}</h3>
            <div ref={barEl} className="h-[240px]" />
          </section>
          <section className="rounded-[4px] border border-ink-700 bg-ink-850 p-3">
            <h3 className="ra-label mb-2">Türlere göre</h3>
            <table className="w-full text-[12.5px] tnum">
              <thead className="text-left text-[11px] text-fg-faint"><tr><th className="font-normal">Tür</th><th className="text-right font-normal">Kayıt</th><th className="text-right font-normal">Mesafe</th><th className="text-right font-normal">Süre</th><th className="text-right font-normal">Tırmanış</th></tr></thead>
              <tbody>
                {byType.map((x) => (
                  <tr key={x.a} className="border-t border-ink-700">
                    <td className="py-1.5"><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: ACT_COLORS[x.a] }} />{tr.activity[x.a]}</td>
                    <td className="text-right">{x.n}</td>
                    <td className="text-right">{fmtKm(x.d)}</td>
                    <td className="text-right">{fmtDuration(x.t)}</td>
                    <td className="text-right text-up">{fmtM(x.up)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <section className="mt-4 rounded-[4px] border border-ink-700 bg-ink-850 p-3">
          <h3 className="ra-label">{calYear} · günlük mesafe</h3>
          <div ref={calEl} className="h-[150px]" />
        </section>

        {records2.length > 0 && (
          <section className="mt-4 rounded-[4px] border border-ink-700 bg-ink-850 p-3">
            <h3 className="ra-label mb-2">Kişisel rekorlar</h3>
            <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
              {records2.map((x) => (
                <button key={x.label} onClick={() => openRecord(x.r.id)} className="flex items-baseline justify-between gap-3 border-t border-ink-700 py-1.5 text-left text-[12.5px] hover:text-amber">
                  <span className="text-fg-muted">{x.label}</span>
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-[11px] text-fg-faint">{x.r.name} · {fmtDate(startMs(x.r))}</span>
                    <span className="tnum font-medium text-fg">{x.value}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
