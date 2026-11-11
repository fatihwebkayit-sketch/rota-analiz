import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, HeatmapChart, LineChart } from 'echarts/charts';
import { CalendarComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapContinuousComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([BarChart, HeatmapChart, LineChart, CalendarComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapContinuousComponent, CanvasRenderer]);

/** Basit ECharts sarmalayıcı: seçenek değişince yeniden çizer, boyut değişince uyum sağlar. */
export function useEChart(option: any, onClick?: (p: any) => void) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;
  const ro = useRef<ResizeObserver | null>(null);
  // Kapsayıcı öğe sonradan da oluşabilir (koşullu çizim); grafik ilk uygun anda kurulur
  useEffect(() => {
    if (!el.current) return;
    if (!chart.current || chart.current.getDom() !== el.current) {
      chart.current?.dispose();
      ro.current?.disconnect();
      const c = echarts.init(el.current);
      chart.current = c;
      c.on('click', (p) => clickRef.current?.(p));
      ro.current = new ResizeObserver(() => c.resize());
      ro.current.observe(el.current);
    }
    chart.current.setOption(option, { notMerge: true });
  });
  useEffect(() => () => { ro.current?.disconnect(); chart.current?.dispose(); chart.current = null; }, []);
  return el;
}

export const CHART_TEXT = { color: '#9a9ca1', fontSize: 10.5 };
export const TOOLTIP = { backgroundColor: 'rgba(19,20,21,0.95)', borderColor: '#33363b', textStyle: { color: '#e7e5e0', fontSize: 11.5 } };
export const ACT_COLORS = { car: '#f0a03c', walk: '#5fb57f', run: '#c792ea', bike: '#5aa9e6' } as const;
