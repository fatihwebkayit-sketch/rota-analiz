import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MLMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import KDBush from 'kdbush';
import type { ActivityType } from '../core/types';
import type { AnalysisResult } from '../workers/protocol';
import { useApp } from '../state/store';
import { baseStyle, COLORS, DEM_SOURCE } from './layers';
import { PointTooltip } from './PointTooltip';
import { fmtCoord } from '../core/format';

export interface Selection { a: number; b: number | null }

interface Props {
  result: AnalysisResult | null;
  activity: ActivityType;
  grade: Float64Array | null;
  /** Grafikten gelen imleç (haritada nokta olarak gösterilir) */
  externalCursor: number | null;
  onCursor(idx: number | null): void;
  selection: Selection | null;
  pickMode: boolean;
  onPick(idx: number): void;
  /** Grafikten gelen sabitleme isteği; n her istekte artar */
  pinRequest: { idx: number; n: number } | null;
  onPinChange(idx: number | null): void;
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
const pt = (r: AnalysisResult['route'], i: number, props: Record<string, unknown> = {}): GeoJSON.Feature => ({
  type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [r.lon[i], r.lat[i]] },
});

function routeData(res: AnalysisResult) {
  const r = res.route;
  const { startIdx, endIdx } = res.metrics.trim;
  const main = fc(lineFeatures(r, startIdx, endIdx));
  const trimmed = fc([...lineFeatures(r, 0, startIdx), ...lineFeatures(r, endIdx, r.lat.length - 1)]);
  const low: GeoJSON.Feature[] = [];
  for (let i = 0; i < r.lat.length; i++) if (res.lowConf[i]) low.push(pt(r, i));
  const stops = fc(res.stops.map((s) => ({ type: 'Feature', properties: { d: s.durationSec ?? 0 }, geometry: { type: 'Point', coordinates: [s.lon, s.lat] } })));
  return { main, trimmed, low: fc(low), stops };
}

export function MapView({ result, activity, grade, externalCursor, onCursor, selection, pickMode, onPick, pinRequest, onPinChange }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const styleReady = useRef(false);
  const lastTip = useRef(0);
  const markers = useRef<maplibregl.Marker[]>([]);
  const selMarkers = useRef<maplibregl.Marker[]>([]);
  const { baseLayer, hillshade, terrain3d, toast } = useApp();
  const [hover, setHover] = useState<Hover>(null);
  const [styleTick, setStyleTick] = useState(0);

  // Olay dinleyicileri en güncel değerleri ref üzerinden okur
  const live = useRef({ result, pickMode, onPick, onCursor });
  live.current = { result, pickMode, onPick, onCursor };

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
    // Not: isStyleLoaded() karolar yüklenirken de false döner; bu yüzden kendi bayrağımızı tutuyoruz.
    map.on('style.load', () => {
      styleReady.current = true;
      setStyleTick((t) => t + 1);
    });
    let fellBack = false;
    map.on('error', (e: any) => {
      if (fellBack || styleReady.current) return;
      fellBack = true;
      console.warn('Harita altlığı yüklenemedi', e?.error?.message);
      map.setStyle({ version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#16171a' } }] });
      useApp.getState().toast('Harita altlığı yüklenemedi (internet bağlantısını kontrol edin). Rota boş zemin üzerinde gösteriliyor.', 'error');
    });
    mapRef.current = map;

    let raf = 0;
    const pick = (p: { x: number; y: number }) => {
      const res = live.current.result, kd = indexRef.current;
      if (!res || !kd) return -1;
      const tol = 14;
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
        const i = pick(e.point);
        setHover((h) => (h?.pinned ? h : i >= 0 ? { idx: i, x: e.point.x, y: e.point.y, pinned: false } : null));
        if (i >= 0) live.current.onCursor(i);
        map.getCanvas().style.cursor = i >= 0 ? (live.current.pickMode ? 'copy' : 'crosshair') : live.current.pickMode ? 'crosshair' : '';
      });
    });
    map.on('mouseout', () => {
      setHover((h) => (h?.pinned ? h : null));
      live.current.onCursor(null);
    });
    map.on('click', (e) => {
      const i = pick(e.point);
      if (live.current.pickMode) {
        if (i >= 0) live.current.onPick(i);
        return;
      }
      setHover(i >= 0 ? { idx: i, x: e.point.x, y: e.point.y, pinned: true } : null);
    });
    map.on('move', () => {
      const res = live.current.result;
      setHover((h) => {
        if (!h || !res) return h;
        if (!h.pinned) return null;
        const q = map.project([res.route.lon[h.idx], res.route.lat[h.idx]]);
        return { ...h, x: q.x, y: q.y };
      });
    });
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el.current!);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      styleReady.current = false;
    };
  }, []);

  // Sabitlenen nokta grafiğe bildirilir
  const pinnedIdx = hover?.pinned ? hover.idx : null;
  useEffect(() => { onPinChange(pinnedIdx); }, [pinnedIdx]);

  // Grafikte tıklanan noktayı haritada göster (görünür alanda değilse oraya kaydır)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !result || !pinRequest) return;
    const i = pinRequest.idx;
    const ll: [number, number] = [result.route.lon[i], result.route.lat[i]];
    const pinAt = () => {
      const q = map.project(ll);
      setHover({ idx: i, x: q.x, y: q.y, pinned: true });
    };
    if (map.getBounds().contains(ll)) pinAt();
    else {
      setHover(null);
      map.once('moveend', pinAt);
      map.easeTo({ center: ll, duration: 600 });
    }
  }, [pinRequest]);

  // C tuşu: fare altındaki noktanın koordinatını kopyala
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey && hover && result) {
        const c = fmtCoord(result.route.lat[hover.idx], result.route.lon[hover.idx]);
        navigator.clipboard?.writeText(c).then(() => toast(`Koordinat kopyalandı: ${c}`));
      }
      if (e.key === 'Escape') setHover(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hover, result, toast]);

  // Altlık değişimi
  const firstStyle = useRef(true);
  useEffect(() => {
    if (firstStyle.current) { firstStyle.current = false; return; }
    styleReady.current = false;
    mapRef.current?.setStyle(baseStyle(baseLayer) as any);
  }, [baseLayer]);

  // Kabartma, 3B arazi ve rota katmanları (her stil yüklemesinde yeniden kurulur)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady.current) return;
    const firstSymbol = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id;

    if ((hillshade || terrain3d) && !map.getSource('dem')) map.addSource('dem', DEM_SOURCE as any);
    if (hillshade && !map.getLayer('hillshade')) {
      if (!map.getSource('dem-hs')) map.addSource('dem-hs', DEM_SOURCE as any);
      map.addLayer(
        {
          id: 'hillshade', type: 'hillshade', source: 'dem-hs',
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
    if (!map.getSource('r-sel')) map.addSource('r-sel', { type: 'geojson', data: empty });
    if (!map.getSource('r-hover')) map.addSource('r-hover', { type: 'geojson', data: empty });
    if (!map.getLayer('r-trim')) {
      map.addLayer({ id: 'r-trim', type: 'line', source: 'r-trim', layout: { 'line-cap': 'round' }, paint: { 'line-color': COLORS.trimmed, 'line-width': 2.5, 'line-dasharray': [1.5, 2], 'line-opacity': 0.8 } });
      map.addLayer({ id: 'r-casing', type: 'line', source: 'r-main', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': COLORS.casing, 'line-width': 7, 'line-opacity': 0.75 } });
      map.addLayer({ id: 'r-main', type: 'line', source: 'r-main', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': COLORS.route, 'line-width': 3.5 } });
      map.addLayer({ id: 'r-sel-casing', type: 'line', source: 'r-sel', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#000000', 'line-width': 9, 'line-opacity': 0.55 } });
      map.addLayer({ id: 'r-sel', type: 'line', source: 'r-sel', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffd28a', 'line-width': 5 } });
      map.addLayer({ id: 'r-low', type: 'circle', source: 'r-low', paint: { 'circle-radius': 3, 'circle-color': COLORS.lowConf, 'circle-stroke-color': '#1a1b1d', 'circle-stroke-width': 1 } });
      map.addLayer({ id: 'r-stops', type: 'circle', source: 'r-stops', paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'd'], 30, 3.5, 600, 7], 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': COLORS.stop, 'circle-stroke-width': 1.5, 'circle-stroke-opacity': 0.85 } });
      map.addLayer({ id: 'r-hover', type: 'circle', source: 'r-hover', paint: { 'circle-radius': 6, 'circle-color': COLORS.route, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
    }
  }, [result, hillshade, terrain3d, styleTick, baseLayer]);

  // Başlangıç/bitiş işaretleri ve rotaya yakınlaşma
  useEffect(() => {
    const map = mapRef.current;
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    if (!map || !result) return;
    const { start, end } = result.metrics;
    const mk = (cls: string, title: string) => {
      const d = document.createElement('div');
      d.className = `ra-marker ${cls}`;
      d.title = title;
      return d;
    };
    if (start) markers.current.push(new maplibregl.Marker({ element: mk('ra-start', 'Başlangıç') }).setLngLat(start).addTo(map));
    if (end) markers.current.push(new maplibregl.Marker({ element: mk('ra-end', 'Bitiş') }).setLngLat(end).addTo(map));
    const bb = result.metrics.bbox;
    if (bb) map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 70, duration: 0, maxZoom: 16 });
    setHover(null);
  }, [result]);

  // Seçilen bölüm: vurgulu çizgi + A/B işaretleri
  useEffect(() => {
    const map = mapRef.current;
    selMarkers.current.forEach((m) => m.remove());
    selMarkers.current = [];
    if (!map || !result) return;
    const r = result.route;
    const src = map.getSource('r-sel') as GeoJSONSource | undefined;
    const mk = (label: string) => {
      const d = document.createElement('div');
      d.className = 'ra-selmarker';
      d.textContent = label;
      return d;
    };
    if (selection) {
      selMarkers.current.push(new maplibregl.Marker({ element: mk('A') }).setLngLat([r.lon[selection.a], r.lat[selection.a]]).addTo(map));
      if (selection.b != null) selMarkers.current.push(new maplibregl.Marker({ element: mk('B') }).setLngLat([r.lon[selection.b], r.lat[selection.b]]).addTo(map));
    }
    src?.setData(selection && selection.b != null ? fc(lineFeatures(r, Math.min(selection.a, selection.b), Math.max(selection.a, selection.b))) : fc([]));
  }, [selection, result, styleTick]);

  // Vurgulanan nokta: haritadaki fare ya da grafikteki imleç
  const cursorIdx = hover?.idx ?? externalCursor;
  useEffect(() => {
    const src = mapRef.current?.getSource('r-hover') as GeoJSONSource | undefined;
    if (!src || !result) return;
    src.setData(fc(cursorIdx != null ? [pt(result.route, cursorIdx)] : []));
  }, [cursorIdx, result, styleTick]);

  /**
   * Bilgi kutusunu rotayla en az çakışacak yere yerleştirir: noktanın çevresindeki 8 aday konum
   * denenir, her adayın kapladığı alana düşen rota noktaları (mekânsal indeksle) sayılır.
   */
  const tooltipPos = (px: number, py: number) => {
    const map = mapRef.current, kd = indexRef.current;
    const W = 230, H = result?.route.hasTime ? 262 : 196, G = 18;
    const cw = el.current?.clientWidth ?? 800, ch = el.current?.clientHeight ?? 600;
    const cands: [number, number][] = [
      [px + G, py - H - G], [px - W - G, py - H - G], [px + G, py + G], [px - W - G, py + G],
      [px - W / 2, py - H - G * 1.5], [px - W / 2, py + G * 1.5], [px + G * 1.5, py - H / 2], [px - W - G * 1.5, py - H / 2],
    ];
    let best = cands[0], bestScore = Infinity, bestK = 0;
    const scores: number[] = [];
    cands.forEach(([l, t], k) => {
      const off = Math.max(0, -l) + Math.max(0, l + W - cw) + Math.max(0, -t) + Math.max(0, t + H - ch);
      let hits = 0;
      if (map && kd && off < W) {
        const a = map.unproject([l - 6, t + H + 6]);
        const b = map.unproject([l + W + 6, t - 6]);
        hits = kd.range(Math.min(a.lng, b.lng), Math.min(a.lat, b.lat), Math.max(a.lng, b.lng), Math.max(a.lat, b.lat)).length;
      }
      const score = off * 50 + hits + k * 0.01; // eşitlikte sağ-üst tercih
      scores[k] = score;
      if (score < bestScore) { bestScore = score; best = [l, t]; bestK = k; }
    });
    // Titremeyi önlemek için önceki konum belirgin biçimde kötüleşmedikçe korunur
    const prev = lastTip.current;
    if (prev !== bestK && scores[prev] !== undefined && scores[prev] <= bestScore + 3) { best = cands[prev]; bestK = prev; }
    lastTip.current = bestK;
    return { left: Math.min(Math.max(4, best[0]), cw - W - 4), top: Math.min(Math.max(4, best[1]), ch - H - 4) };
  };
  const tipPos = hover ? tooltipPos(hover.x, hover.y) : null;

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
        <PointTooltip result={result} grade={grade} idx={hover.idx} x={tipPos!.left} y={tipPos!.top} pinned={hover.pinned} activity={activity} onClose={() => setHover(null)} />
      )}
      {result && (
        <button onClick={fit} className="ra-mapbtn absolute bottom-[118px] right-[10px]" title="Rotanın tamamını göster">
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" /></svg>
        </button>
      )}
    </div>
  );
}
