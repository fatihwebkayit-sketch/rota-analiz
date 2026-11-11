// Rapor ve paylaşım kartı için harita görüntüsü: görünmez bir harita açılır, karolar yüklenince
// tuvalden PNG alınır. Karo sunucusu izin vermezse (CORS) altlıksız, yalnız rota çizimi döner.
import maplibregl from 'maplibre-gl';
import type { AnalysisResult } from '../workers/protocol';
import { baseStyle } from '../map/layers';
import type { MapStyleChoice } from './common';

export interface SnapshotResult {
  dataUrl: string;
  baseLoaded: boolean;
  attribution: string;
}

const ATTR: Record<MapStyleChoice, string> = {
  light: '© OpenStreetMap katkıda bulunanlar · OpenFreeMap',
  dark: '© OpenStreetMap katkıda bulunanlar · OpenFreeMap',
  satellite: 'Görüntü © Esri, Maxar, Earthstar Geographics',
  topo: '© OpenTopoMap (CC-BY-SA) · © OpenStreetMap katkıda bulunanlar',
};

export async function mapSnapshot(res: AnalysisResult, a: number, b: number, style: MapStyleChoice, width: number, height: number, showEnds: boolean, padding?: { top: number; bottom: number; left: number; right: number }): Promise<SnapshotResult> {
  const holder = document.createElement('div');
  holder.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:${height}px;`;
  document.body.appendChild(holder);
  const r = res.route;
  const coords: [number, number][] = [];
  const step = Math.max(1, Math.floor((b - a) / 6000));
  for (let i = a; i <= b; i += step) coords.push([r.lon[i], r.lat[i]]);
  coords.push([r.lon[b], r.lat[b]]);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of coords) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }

  let baseLoaded = true;
  const map = new maplibregl.Map({
    container: holder,
    style: baseStyle(style) as any,
    interactive: false,
    attributionControl: false,
    preserveDrawingBuffer: true,
    pixelRatio: 1,
    fadeDuration: 0,
    bounds: [[minX, minY], [maxX, maxY]],
    fitBoundsOptions: { padding: padding ?? Math.round(Math.min(width, height) * 0.08) },
  });

  const addRoute = () => {
    if (map.getSource('r')) return;
    map.addSource('r', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } } });
    map.addLayer({ id: 'rc', type: 'line', source: 'r', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#1a1206', 'line-width': 8, 'line-opacity': 0.7 } });
    map.addLayer({ id: 'rl', type: 'line', source: 'r', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#f0a03c', 'line-width': 4.5 } });
    if (showEnds) {
      map.addSource('e', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', properties: { c: '#5fb57f' }, geometry: { type: 'Point', coordinates: coords[0] } },
            { type: 'Feature', properties: { c: '#e2614f' }, geometry: { type: 'Point', coordinates: coords[coords.length - 1] } },
          ],
        },
      });
      map.addLayer({ id: 'e', type: 'circle', source: 'e', paint: { 'circle-radius': 8, 'circle-color': ['get', 'c'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 } });
    }
  };

  try {
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      map.on('style.load', () => {
        addRoute();
        map.once('idle', finish);
      });
      map.on('error', (e: any) => {
        if (!e?.sourceId && !map.getSource('r')) {
          // Stil yüklenemedi: boş zemin + rota
          baseLoaded = false;
          map.setStyle({ version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': style === 'dark' ? '#16171a' : '#f2f1ee' } }] }, { diff: false });
        } else if (e?.sourceId && e.sourceId !== 'r' && e.sourceId !== 'e') baseLoaded = false;
      });
      setTimeout(finish, 15000); // karolar çok yavaşsa yine de devam et
    });
    let dataUrl: string;
    try {
      dataUrl = map.getCanvas().toDataURL('image/png');
    } catch {
      // Tuval "kirli" (CORS): altlıksız yeniden çiz
      baseLoaded = false;
      map.setStyle({ version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#f2f1ee' } }] }, { diff: false });
      await new Promise<void>((res2) => map.once('style.load', () => { addRoute(); map.once('idle', () => res2()); }));
      dataUrl = map.getCanvas().toDataURL('image/png');
    }
    return { dataUrl, baseLoaded, attribution: baseLoaded ? ATTR[style] : '' };
  } finally {
    map.remove();
    holder.remove();
  }
}
