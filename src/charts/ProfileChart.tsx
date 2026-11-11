import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, BrushComponent, MarkLineComponent, MarkAreaComponent, DataZoomComponent, ToolboxComponent, GraphicComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ActivityType } from '../core/types';
import type { AnalysisResult } from '../workers/protocol';
import { indexAtDistance } from '../analysis/segment';
import { PROFILES } from '../analysis/activity';
import { fmtDuration, fmt1 } from '../core/format';
import type { Selection } from '../map/MapView';

echarts.use([LineChart, GridComponent, TooltipComponent, BrushComponent, MarkLineComponent, MarkAreaComponent, DataZoomComponent, ToolboxComponent, GraphicComponent, CanvasRenderer]);

export type ChartMetric = 'ele' | 'speed' | 'grade' | 'time' | 'climb';

interface Props {
  result: AnalysisResult;
  grade: Float64Array;
  climb: { up: Float64Array; down: Float64Array };
  activity: ActivityType;
  cursorIdx: number | null;
  cursorFromChart: boolean;
  onCursor(idx: number | null): void;
  selection: Selection | null;
  onSelectRange(a: number, b: number): void;
  /** Grafikte tıklanan nokta (haritada işaretlenir) */
  onPin(idx: number): void;
  pinnedIdx: number | null;
}

const C = { ele: '#f0a03c', eleFill: 'rgba(240,160,60,0.14)', ctx: 'rgba(154,156,161,0.18)', up: '#5fb57f', down: '#e2614f', axis: '#6b6e74', grid: '#25272b', text: '#9a9ca1' };

const TABS: { id: ChartMetric; label: string }[] = [
  { id: 'ele', label: 'Rakım' },
  { id: 'speed', label: 'Hız' },
  { id: 'grade', label: 'Eğim' },
  { id: 'time', label: 'Zaman' },
  { id: 'climb', label: 'Tırmanış / İniş' },
];

export function ProfileChart({ result, grade, climb, activity, cursorIdx, cursorFromChart, onCursor, selection, onSelectRange, onPin, pinnedIdx }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const [metric, setMetric] = useState<ChartMetric>('ele');
  const [zoomTick, setZoomTick] = useState(0);
  const live = useRef({ onCursor, onSelectRange, onPin, result });
  live.current = { onCursor, onSelectRange, onPin, result };
  const prof = PROFILES[activity];
  const { startIdx: a0, endIdx: b0 } = result.metrics.trim;
  const r = result.route;

  // Seriler (yalnızca analiz aralığı)
  const data = useMemo(() => {
    const x = (i: number) => +(result.cum[i] / 1000).toFixed(4);
    const ele: [number, number | null][] = [];
    const speed: [number, number | null][] = [];
    const gr: [number, number | null][] = [];
    const time: [number, number | null][] = [];
    const up: [number, number][] = [];
    const down: [number, number][] = [];
    const t0 = r.time[a0];
    for (let i = a0; i <= b0; i++) {
      const xi = x(i);
      ele.push([xi, isFinite(r.ele[i]) ? r.ele[i] : null]);
      speed.push([xi, isFinite(result.speedKmh[i]) ? +result.speedKmh[i].toFixed(2) : null]);
      gr.push([xi, isFinite(grade[i]) ? +grade[i].toFixed(2) : null]);
      time.push([xi, isFinite(r.time[i] - t0) ? (r.time[i] - t0) / 60000 : null]);
      up.push([xi, climb.up[i]]);
      down.push([xi, climb.down[i]]);
    }
    return { ele, speed, gr, time, up, down };
  }, [result, grade, climb]);

  const available: Record<ChartMetric, boolean> = {
    ele: r.hasEle, speed: r.hasTime, grade: r.hasEle, time: r.hasTime, climb: r.hasEle,
  };

  // Grafiği kur
  useEffect(() => {
    const c = echarts.init(el.current!, undefined, { renderer: 'canvas' });
    chart.current = c;
    let raf = 0;
    c.on('updateAxisPointer', (e: any) => {
      const v = e.axesInfo?.[0]?.value;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const res = live.current.result;
        if (v == null || !isFinite(v)) return;
        const { startIdx, endIdx } = res.metrics.trim;
        live.current.onCursor(indexAtDistance(res.cum, v * 1000, startIdx, endIdx));
      });
    });
    c.getZr().on('globalout', () => live.current.onCursor(null));
    c.on('dataZoom', () => setZoomTick((t) => t + 1));
    // Tıklama (sürüklemeden): noktayı haritada işaretle
    let downX = 0;
    c.getZr().on('mousedown', (e: any) => { downX = e.offsetX; });
    c.getZr().on('mouseup', (e: any) => {
      if (Math.abs(e.offsetX - downX) > 3) return;
      const res = live.current.result;
      if (!c.containPixel({ gridIndex: 0 }, [e.offsetX, e.offsetY])) return;
      const km = c.convertFromPixel({ xAxisIndex: 0 }, e.offsetX) as number;
      if (!isFinite(km)) return;
      const { startIdx, endIdx } = res.metrics.trim;
      live.current.onPin(indexAtDistance(res.cum, km * 1000, startIdx, endIdx));
    });
    c.on('brushEnd', (e: any) => {
      const range = e.areas?.[0]?.coordRange as [number, number] | undefined;
      if (!range) return;
      const res = live.current.result;
      const { startIdx, endIdx } = res.metrics.trim;
      const ia = indexAtDistance(res.cum, range[0] * 1000, startIdx, endIdx);
      const ib = indexAtDistance(res.cum, range[1] * 1000, startIdx, endIdx);
      c.dispatchAction({ type: 'brush', areas: [] });
      if (ib > ia) live.current.onSelectRange(ia, ib);
    });
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el.current!);
    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);

  // Seçenekler
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const m = available[metric] ? metric : 'ele';
    const selArea =
      selection && selection.b != null
        ? { silent: true, itemStyle: { color: 'rgba(255,210,138,0.12)' }, data: [[{ xAxis: result.cum[Math.min(selection.a, selection.b)] / 1000 }, { xAxis: result.cum[Math.max(selection.a, selection.b)] / 1000 }]] }
        : undefined;
    const base = { type: 'line', showSymbol: false, sampling: 'lttb', connectNulls: false, animation: false, emphasis: { disabled: true } } as const;
    const series: any[] = [];
    const yAxes: any[] = [];
    const axisCommon = {
      axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: C.grid } },
      axisLabel: { color: C.axis, fontSize: 10.5 }, nameTextStyle: { color: C.axis, fontSize: 10.5 },
    };
    const eleCtx = r.hasEle && m !== 'ele' && m !== 'climb';
    if (m === 'ele') {
      yAxes.push({ ...axisCommon, type: 'value', name: 'm', scale: true });
      series.push({ ...base, id: 'main', name: 'Rakım', data: data.ele, lineStyle: { color: C.ele, width: 1.6 }, areaStyle: { color: C.eleFill }, markArea: selArea });
    } else if (m === 'speed') {
      yAxes.push({ ...axisCommon, type: 'value', name: 'km/sa', min: 0 });
      series.push({ ...base, id: 'main', name: 'Hız', data: data.speed, lineStyle: { color: C.ele, width: 1.2 }, markArea: selArea,
        markLine: { silent: true, symbol: 'none', lineStyle: { color: C.axis, type: 'dashed' }, label: { color: C.axis, fontSize: 10, formatter: 'durma eşiği' }, data: [{ yAxis: prof.stopSpeedKmh }] } });
    } else if (m === 'grade') {
      yAxes.push({ ...axisCommon, type: 'value', name: '%' });
      // Yokuş (yeşil) ve iniş (kırmızı) ayrı alanlar olarak çizilir
      series.push({ ...base, id: 'main', name: 'Eğim', data: data.gr.map(([x, v]) => [x, v == null ? null : Math.max(v, 0)]), lineStyle: { color: C.up, width: 1 }, areaStyle: { color: C.up, opacity: 0.3, origin: 0 }, markArea: selArea });
      series.push({ ...base, id: 'down', name: 'İniş eğimi', data: data.gr.map(([x, v]) => [x, v == null ? null : Math.min(v, 0)]), lineStyle: { color: C.down, width: 1 }, areaStyle: { color: C.down, opacity: 0.3, origin: 0 }, tooltip: { show: false } });
    } else if (m === 'time') {
      yAxes.push({ ...axisCommon, type: 'value', name: 'dk', min: 0 });
      series.push({ ...base, id: 'main', name: 'Geçen süre', data: data.time, lineStyle: { color: C.ele, width: 1.6 }, markArea: selArea });
    } else {
      yAxes.push({ ...axisCommon, type: 'value', name: 'm', min: 0 });
      series.push({ ...base, id: 'main', name: 'Tırmanış', data: data.up, lineStyle: { color: C.up, width: 1.6 }, markArea: selArea });
      series.push({ ...base, id: 'down', name: 'İniş', data: data.down, lineStyle: { color: C.down, width: 1.6 } });
    }
    if (eleCtx) {
      yAxes.push({ ...axisCommon, type: 'value', scale: true, show: false });
      series.unshift({ ...base, id: 'ctx', name: 'Rakım', yAxisIndex: 1, data: data.ele, lineStyle: { width: 0 }, areaStyle: { color: C.ctx }, tooltip: { show: true }, z: 0 });
    }


    c.setOption(
      {
        backgroundColor: 'transparent',
        grid: { left: 52, right: eleCtx ? 16 : 16, top: 22, bottom: 26 },
        xAxis: { type: 'value', min: 'dataMin', max: 'dataMax', axisLabel: { color: C.axis, fontSize: 10.5, formatter: (v: number) => `${fmt1(v)} km` }, axisLine: { lineStyle: { color: C.grid } }, splitLine: { show: false }, axisPointer: { snap: false } },
        yAxis: yAxes,
        series,
        brush: { xAxisIndex: 0, brushType: 'lineX', brushMode: 'single', transformable: false, throttleType: 'debounce', brushStyle: { color: 'rgba(255,210,138,0.15)', borderColor: '#ffd28a' } },
        toolbox: { show: false, feature: { brush: { type: ['lineX'] } } },
        dataZoom: [{ type: 'inside', xAxisIndex: 0, zoomOnMouseWheel: true, moveOnMouseMove: false, moveOnMouseWheel: false }],
        tooltip: {
          trigger: 'axis', backgroundColor: 'rgba(19,20,21,0.95)', borderColor: '#33363b', textStyle: { color: '#e7e5e0', fontSize: 11.5 },
          axisPointer: { type: 'line', lineStyle: { color: '#e7e5e0', width: 1 } },
          formatter: (ps: any[]) => {
            const km = ps[0]?.value?.[0];
            const lines = ps
              .filter((p) => p.seriesId !== 'cursor' && p.seriesName !== 'İniş eğimi')
              .map((p) => {
                let v = p.value?.[1];
                if (p.seriesName === 'Eğim') { const gi = grade[indexAtDistance(result.cum, km * 1000, a0, b0)]; v = isFinite(gi) ? gi : null; }
                if (v == null) return `${p.seriesName}: —`;
                const txt = p.seriesName === 'Geçen süre' ? fmtDuration(v * 60, true) : p.seriesName === 'Hız' ? `${fmt1(v)} km/sa` : p.seriesName === 'Eğim' ? `%${fmt1(v)}` : `${Math.round(v).toLocaleString('tr-TR')} m`;
                return `<span style="color:#9a9ca1">${p.seriesName}</span> <b style="font-weight:500">${txt}</b>`;
              });
            return `<div style="font-variant-numeric:tabular-nums"><div style="color:#9a9ca1">${fmt1(km)} km</div>${lines.join('<br/>')}</div>`;
          },
        },
      },
      { notMerge: true },
    );
    c.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: 'lineX', brushMode: 'single' } });
  }, [metric, data, selection, result]);

  // Grafik üzerindeki değer (aktif sekmeye göre) — imleç noktasının yüksekliği için
  const valueAt = (i: number): number | null => {
    const m = available[metric] ? metric : 'ele';
    const v =
      m === 'ele' ? r.ele[i]
      : m === 'speed' ? result.speedKmh[i]
      : m === 'grade' ? Math.max(grade[i], 0) // yokuş serisi üstünde; inişte sıfır çizgisinde
      : m === 'time' ? (r.time[i] - r.time[a0]) / 60000
      : climb.up[i];
    if (m === 'grade' && grade[i] < 0) return grade[i];
    return isFinite(v) ? v : null;
  };

  // Haritadan gelen imleç → grafikte dikey çizgi + nokta; tıklanıp sabitlenen nokta → kalıcı işaret
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const h = c.getHeight();
    const px = (i: number | null): [number, number] | null => {
      if (i == null) return null;
      try {
        const km = result.cum[i] / 1000;
        const x = c.convertToPixel({ xAxisIndex: 0 }, km) as number;
        const v = valueAt(i);
        const y = v == null ? NaN : (c.convertToPixel({ yAxisIndex: 0 }, v) as number);
        return isFinite(x) ? [x, y] : null;
      } catch {
        return null;
      }
    };
    const cur = cursorFromChart ? null : px(cursorIdx);
    const pin = px(pinnedIdx);
    c.setOption(
      {
        graphic: [
          { id: 'cur', type: 'line', silent: true, invisible: !cur, shape: { x1: cur?.[0] ?? 0, y1: 22, x2: cur?.[0] ?? 0, y2: h - 26 }, style: { stroke: '#ffffff', opacity: 0.6, lineWidth: 1, lineDash: [3, 3] }, z: 100 },
          { id: 'curdot', type: 'circle', silent: true, invisible: !cur || !isFinite(cur[1]), shape: { cx: cur?.[0] ?? 0, cy: cur && isFinite(cur[1]) ? cur[1] : 0, r: 5 }, style: { fill: '#f0a03c', stroke: '#ffffff', lineWidth: 2 }, z: 101 },
          { id: 'pin', type: 'line', silent: true, invisible: !pin, shape: { x1: pin?.[0] ?? 0, y1: 22, x2: pin?.[0] ?? 0, y2: h - 26 }, style: { stroke: '#ffd28a', opacity: 0.9, lineWidth: 1.5 }, z: 99 },
          { id: 'pindot', type: 'circle', silent: true, invisible: !pin || !isFinite(pin[1]), shape: { cx: pin?.[0] ?? 0, cy: pin && isFinite(pin[1]) ? pin[1] : 0, r: 4.5 }, style: { fill: '#ffd28a', stroke: '#131415', lineWidth: 1.5 }, z: 99 },
        ],
      },
      { lazyUpdate: true },
    );
  }, [cursorIdx, cursorFromChart, pinnedIdx, result, metric, data, selection, zoomTick]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-ink-700 px-3">
        <div className="flex">
          {TABS.map((t) => (
            <button
              key={t.id}
              disabled={!available[t.id]}
              onClick={() => setMetric(t.id)}
              className={`relative px-2.5 py-1.5 text-[11.5px] disabled:opacity-30 ${metric === t.id ? 'text-fg' : 'text-fg-muted hover:text-fg'}`}
              title={!available[t.id] ? 'Dosyada bu grafik için veri yok' : undefined}
            >
              {t.label}
              {metric === t.id && <span className="absolute inset-x-2.5 bottom-0 h-[2px] bg-amber" />}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[10.5px] text-fg-faint">Tıkla: haritada göster · Sürükle: bölüm seç · Tekerlek: yakınlaş</span>
      </div>
      <div ref={el} className="min-h-0 flex-1" />
    </div>
  );
}
