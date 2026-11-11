import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MLMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import KDBush from 'kdbush';
import type { ActivityType } from '../core/types';
import type { AnalysisResult } from '../workers/protocol';
import { useApp } from '../state/store';
import { baseStyle, COLORS, DEM_SOURCE } from './layers';
import { PointTooltip } from './PointTooltip';

interface Props {
  result: AnalysisResult | null;
  activity: ActivityType;
}

type Hover = { idx: number; x: number; y: number; pinned: boolean } | null;

function lineFeatures(r: AnalysisResult['route'], from: number, to: number): GeoJSON.Feature[] {
  // Parça sınırlarında çizgi kesilir (parçalar birleştirilmez)
  const feats: GeoJSON.Feature[] = [];
  const bounds = [...r.segStart, r.lat.length];
  for (let s = 0; s < bounds.length - 1; s++) {
    const a = Math.max(from, bounds[s]);
    const b = Math.min(to, bounds[s + 1] - 1);
    if (b - a < 1) continue;
    const coords: [number, number][] = [];
    for (let i = a; i <= b; i++) coords.push([r.lon[i], r.lat[i]]);
    feats.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });
  }
  return feats;
}

const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features });

function routeData(res: AnalysisResult) {
  const r = res.route;
  const { startIdx, endIdx } = res.metrics.trim;
  const main = fc(lineFeatures(r, startIdx, endIdx));
  const trimmed = fc([...lineFeatures(r, 0, startIdx), ...lineFeatures(r, endIdx, r.lat.length - 1)]);
  const low: GeoJSON.Feature[] = [];
  for (let i = 0; i < r.lat.length; i++)
    if (res.lowConf[i]) low.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [r.lon[i], r.lat[i]] } });
  const stops = fc(
    res.stops.map((s) => ({ type: 'Feature', properties: { d: s.durationSec ?? 0 }, geometry: { type: 'Point', coordinates: [s.lon, s.lat] } })),
  );
  return { main, trimmed, low: fc(low), stops };
}

export function MapView({ result, activity }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const resultRef = useRef<AnalysisResult | null>(result);
  const { baseLayer, hillshade, terrain3d } = useApp();
  const [hover, setHover] = useState<Hover>(null);
  const [styleTick, setStyleTick] = useState(0);
  resultRef.current = result;

  const index = useMemo(() => {
    if (!result) return null;
    const r = result.route;
    const kd = new KDBush(r.lat.length);
    for (let i = 0; i < r.lat.length; i++) kd.add(r.lon[i], r.lat[i]);
    kd.finish();
    return kd;
  }, [result]);
  const indexRef = useRef(index);
  indexRef.current = index;

  // Harita oluşturma
  useEffect(() => {
    const map = new maplibregl.Map({
      container: el.current!,
      style: baseStyle(useApp.getState().baseLayer) as any,
      center: [35.2, 39.0],
      zoom: 5,
      attributionControl: { compact: true },
      maxPitch: 75,
      preserveDrawingBuffer: true,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    map.on('style.load', () => setStyleTick((t) => t + 1));
    // Altlık yüklenemezse (internet yok, sunucu kapalı) rota yine de boş zemin üzerinde gösterilir
    let fellBack = false;
    map.on('error', (e: any) => {
      if (fellBack || map.isStyleLoaded()) return;
      fellBack = true;
      console.warn('Harita altlığı yüklenemedi', e?.error?.message);
      map.setStyle({ version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#16171a' } }] });
      useApp.getState().toast('Harita altlığı yüklenemedi (internet bağlantısını kontrol edin). Rota boş zemin üzerinde gösteriliyor.', 'error');
    });
    map.on('styledata', () => { if (map.isStyleLoaded()) fellBack = false; });
    mapRef.current = map;

    let raf = 0;
    const pick = (e: maplibregl.MapMouseEvent) => {
      const res = resultRef.current, kd = indexRef.current;
      if (!res || !kd) return null;
      const tol = 14;
      const p = e.point;
      const a = map.unproject([p.x - tol, p.y + tol]);
      const b = map.unproject([p.x + tol, p.y - tol]);
      const ids = kd.range(Math.min(a.lng, b.lng), Math.min(a.lat, b.lat), Math.max(a.lng, b.lng), Math.max(a.lat, b.lat));
      let best = -1, bd = Infinity;
      for (const i of ids) {
        const q = map.project([res.route.lon[i], res.route.lat[i]]);
        const dd = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
        if (dd < bd) { bd = dd; best = i; }
      }
      return best;
    };
    map.on('mousemove', (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const i = pick(e);
        setHover((h) => (h?.pinned ? h : i != null && i >= 0 ? { idx: i, x: e.point.x, y: e.point.y, pinned: false } : null));
        map.getCanvas().style.cursor = i != null && i >= 0 ? 'crosshair' : '';
      });
    });
    map.on('mouseout', () => setHover((h) => (h?.pinned ? h : null)));
    map.on('click', (e) => {
      const i = pick(e);
      setHover(i != null && i >= 0 ? { idx: i, x: e.point.x, y: e.point.y, pinned: true } : null);
    });
    map.on('move', () => setHover((h) => (h?.pinned ? null : h)));
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el.current!);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Altlık değişimi
  const firstStyle = useRef(true);
  useEffect(() => {
    if (firstStyle.current) { firstStyle.current = false; return; }
    mapRef.current?.setStyle(baseStyle(baseLayer) as any);
  }, [baseLayer]);

  // Kabartma, 3B arazi ve rota katmanları (her stil yüklemesinde yeniden kurulur)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const firstSymbol = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id;

    if (hillshade || terrain3d) {
      if (!map.getSource('dem')) map.addSource('dem', DEM_SOURCE as any);
    }
    if (hillshade && !map.getLayer('hillshade')) {
      if (!map.getSource('dem-hs')) map.addSource('dem-hs', DEM_SOURCE as any);
      map.addLayer(
        {
          id: 'hillshade',
          type: 'hillshade',
          source: 'dem-hs',
          paint: {
            'hillshade-exaggeration': baseLayer === 'dark' ? 0.35 : 0.5,
            'hillshade-shadow-color': '#000000',
            'hillshade-highlight-color': baseLayer === 'dark' ? '#3a3d42' : '#ffffff',
          },
        },
        firstSymbol,
      );
    } else if (!hillshade && map.getLayer('hillshade')) map.removeLayer('hillshade');
    map.setTerrain(terrain3d ? { source: 'dem', exaggeration: 1.3 } : null);
    if (terrain3d && map.getPitch() < 30) map.easeTo({ pitch: 55, duration: 600 });
    if (!terrain3d && map.getPitch() > 0) map.easeTo({ pitch: 0, duration: 400 });

    const ensure = (id: string, data: GeoJSON.FeatureCollection) => {
      const src = map.getSource(id) as GeoJSONSource | undefined;
      if (src) src.setData(data);
      else map.addSource(id, { type: 'geojson', data });
    };
    const empty = fc([]);
    const d = result ? routeData(result) : { main: empty, trimmed: empty, low: empty, stops: empty };
    ensure('r-main', d.main);
    ensure('r-trim', d.trimmed);
    ensure('r-low', d.low);
    ensure('r-stops', d.stops);
    if (!map.getLayer('r-trim')) {
      map.addLayer({ id: 'r-trim', type: 'line', source: 'r-trim', layout: { 'line-cap': 'round' }, paint: { 'line-color': COLORS.trimmed, 'line-width': 2.5, 'line-dasharray': [1.5, 2], 'line-opacity': 0.8 } });
      map.addLayer({ id: 'r-casing', type: 'line', source: 'r-main', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': COLORS.casing, 'line-width': 7, 'line-opacity': 0.75 } });
      map.addLayer({ id: 'r-main', type: 'line', source: 'r-main', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': COLORS.route, 'line-width': 3.5 } });
      map.addLayer({ id: 'r-low', type: 'circle', source: 'r-low', paint: { 'circle-radius': 3, 'circle-color': COLORS.lowConf, 'circle-stroke-color': '#1a1b1d', 'circle-stroke-width': 1 } });
      map.addLayer({ id: 'r-stops', type: 'circle', source: 'r-stops', paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'd'], 30, 3.5, 600, 7], 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': COLORS.stop, 'circle-stroke-width': 1.5, 'circle-stroke-opacity': 0.85 } });
      map.addSource('r-hover', { type: 'geojson', data: empty });
      map.addLayer({ id: 'r-hover', type: 'circle', source: 'r-hover', paint: { 'circle-radius': 6, 'circle-color': COLORS.route, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
    }
  }, [result, hillshade, terrain3d, styleTick, baseLayer]);

  // Başlangıç/bitiş işaretleri ve rotaya yakınlaşma
  useEffect(() => {
    const map = mapRef.current;
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    if (!map || !result) return;
    const { start, end, trim } = result.metrics;
    const mk = (cls: string, title: string) => {
      const d = document.createElement('div');
      d.className = `ra-marker ${cls}`;
      d.title = title;
      return d;
    };
    if (start) markers.current.push(new maplibregl.Marker({ element: mk('ra-start', 'Başlangıç') }).setLngLat(start).addTo(map));
    if (end) markers.current.push(new maplibregl.Marker({ element: mk('ra-end', 'Bitiş') }).setLngLat(end).addTo(map));
    const r = result.route;
    let a = [Infinity, Infinity], b = [-Infinity, -Infinity];
    for (let i = trim.startIdx; i <= trim.endIdx; i++) {
      a = [Math.min(a[0], r.lon[i]), Math.min(a[1], r.lat[i])];
      b = [Math.max(b[0], r.lon[i]), Math.max(b[1], r.lat[i])];
    }
    if (isFinite(a[0])) map.fitBounds([a as [number, number], b as [number, number]], { padding: 70, duration: 0, maxZoom: 16 });
    setHover(null);
  }, [result]);

  // Vurgulanan nokta
  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource('r-hover') as GeoJSONSource | undefined;
    if (!src || !result) return;
    src.setData(
      fc(hover ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [result.route.lon[hover.idx], result.route.lat[hover.idx]] } }] : []),
    );
  }, [hover, result, styleTick]);

  const fit = () => {
    const map = mapRef.current;
    if (!map || !result?.metrics.bbox) return;
    const [x1, y1, x2, y2] = result.metrics.bbox;
    map.fitBounds([[x1, y1], [x2, y2]], { padding: 70, duration: 500, maxZoom: 16 });
  };

  return (
    <div className="relative h-full w-full">
      <div ref={el} className="h-full w-full" />
      {result && hover && (
        <PointTooltip result={result} idx={hover.idx} x={hover.x} y={hover.y} pinned={hover.pinned} activity={activity} onClose={() => setHover(null)} />
      )}
      {result && (
        <button onClick={fit} className="ra-mapbtn absolute bottom-[118px] right-[10px]" title="Rotaya yakınlaş">
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" /></svg>
        </button>
      )}
    </div>
  );
}
