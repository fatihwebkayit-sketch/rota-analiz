// Rapor için vektörel (SVG) profil grafikleri — açık, yazıcı dostu tema.
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, MarkLineComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import type { AnalysisResult } from '../workers/protocol';
import { fmt1 } from '../core/format';

echarts.use([LineChart, GridComponent, MarkLineComponent, SVGRenderer]);

export type ProfileKind = 'ele' | 'speed' | 'grade';

const INK = '#2b2d31', MUTED = '#7a7d83', GRID = '#e3e1dc', AMBER = '#d9822b', UP = '#3f9a63', DOWN = '#c94a3a';

export function profileSVG(kind: ProfileKind, res: AnalysisResult, grade: Float64Array, width = 760, height = 210): string | null {
  const r = res.route;
  if ((kind === 'ele' || kind === 'grade') && !r.hasEle) return null;
  if (kind === 'speed' && !r.hasTime) return null;
  const { startIdx: a, endIdx: b } = res.metrics.trim;
  const step = Math.max(1, Math.floor((b - a) / 1400)); // rapor için yeterli çözünürlük, küçük dosya
  const pts: [number, number | null][] = [];
  for (let i = a; i <= b; i += step) {
    const v = kind === 'ele' ? r.ele[i] : kind === 'speed' ? res.speedKmh[i] : grade[i];
    pts.push([+(res.cum[i] / 1000).toFixed(3), isFinite(v) ? +v.toFixed(2) : null]);
  }
  const chart = echarts.init(null as any, undefined, { renderer: 'svg', ssr: true, width, height });
  const axis = { axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: MUTED, fontSize: 10 }, splitLine: { lineStyle: { color: GRID } } };
  const series: any[] =
    kind === 'grade'
      ? [
          { type: 'line', showSymbol: false, data: pts.map(([x, v]) => [x, v == null ? null : Math.max(v, 0)]), lineStyle: { color: UP, width: 1 }, areaStyle: { color: UP, opacity: 0.25 } },
          { type: 'line', showSymbol: false, data: pts.map(([x, v]) => [x, v == null ? null : Math.min(v, 0)]), lineStyle: { color: DOWN, width: 1 }, areaStyle: { color: DOWN, opacity: 0.25 } },
        ]
      : [{ type: 'line', showSymbol: false, data: pts, lineStyle: { color: kind === 'ele' ? AMBER : INK, width: 1.4 }, areaStyle: kind === 'ele' ? { color: AMBER, opacity: 0.15 } : undefined }];
  chart.setOption({
    animation: false,
    backgroundColor: '#ffffff',
    grid: { left: 46, right: 12, top: 18, bottom: 24 },
    xAxis: { type: 'value', min: 'dataMin', max: 'dataMax', ...axis, splitLine: { show: false }, axisLine: { show: true, lineStyle: { color: GRID } }, axisLabel: { color: MUTED, fontSize: 10, formatter: (v: number) => `${fmt1(v)} km` } },
    yAxis: { type: 'value', scale: kind === 'ele', name: kind === 'ele' ? 'm' : kind === 'speed' ? 'km/sa' : '%', nameTextStyle: { color: MUTED, fontSize: 10 }, ...axis },
    series,
  });
  const svg = chart.renderToSVGString();
  chart.dispose();
  return svg;
}
