// Animasyon kare çizici: görünmez bir harita (video çözünürlüğünde) + gösterge paneli → tek tuval.
// Önizleme ve MP4 dışa aktarma aynı çiziciyi kullanır; böylece önizleme = çıktı.
import maplibregl, { type GeoJSONSource } from 'maplibre-gl';
import type { ActivityType, RouteRecord } from '../core/types';
import type { AnalysisResult } from '../workers/protocol';
import { baseStyle, DEM_SOURCE } from '../map/layers';
import type { MapStyleChoice } from '../export/common';
import { buildTimeline, posAt, smoothBearing, type Timeline } from './timeline';
import { drawHud } from './hud';

export type CameraMode = 'follow' | 'follow3d' | 'overview';

export interface RenderSetup {
  rec: RouteRecord;
  res: AnalysisResult;
  grade: Float64Array;
  activity: ActivityType;
  range: [number, number];
  showEnds: boolean;
  width: number;
  height: number;
  style: MapStyleChoice;
  compressStops: boolean;
}

const ATTR: Record<MapStyleChoice, string> = {
  light: '© OpenStreetMap · OpenFreeMap',
  dark: '© OpenStreetMap · OpenFreeMap',
  satellite: 'Görüntü © Esri, Maxar, Earthstar Geographics',
  topo: '© OpenTopoMap · © OpenStreetMap',
};

export class AnimationRenderer {
  readonly canvas: HTMLCanvasElement;
  private holder: HTMLDivElement;
  private map: maplibregl.Map;
  private ctx: CanvasRenderingContext2D;
  private tl: Timeline;
  private simple: number[]; // animasyonda kullanılan seyreltilmiş nokta indeksleri
  private ready: Promise<void>;
  private bearing = 0;
  private baseOk = true;
  camera: CameraMode = 'follow';
  zoomOffset = 0;
  showClock = true;

  constructor(private s: RenderSetup) {
    const { width: W, height: H } = s;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d')!;
    this.holder = document.createElement('div');
    this.holder.style.cssText = `position:fixed;left:-30000px;top:0;width:${W}px;height:${H}px;pointer-events:none;`;
    document.body.appendChild(this.holder);
    this.tl = buildTimeline(s.res, s.range[0], s.range[1], s.compressStops);

    // ~5000 noktaya seyreltme (mesafeye göre), uzun rotalarda kare başı veri yükünü sınırlar
    const [a, b] = s.range;
    const total = s.res.cum[b] - s.res.cum[a];
    const stepM = Math.max(1, total / 5000);
    this.simple = [a];
    for (let i = a + 1; i < b; i++) if (s.res.cum[i] - s.res.cum[this.simple[this.simple.length - 1]] >= stepM) this.simple.push(i);
    this.simple.push(b);

    const r = s.res.route;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const i of this.simple) { minX = Math.min(minX, r.lon[i]); maxX = Math.max(maxX, r.lon[i]); minY = Math.min(minY, r.lat[i]); maxY = Math.max(maxY, r.lat[i]); }
    this.bbox = [minX, minY, maxX, maxY];

    this.map = new maplibregl.Map({
      container: this.holder,
      style: baseStyle(s.style) as any,
      interactive: false,
      attributionControl: false,
      preserveDrawingBuffer: true,
      pixelRatio: 1,
      fadeDuration: 0,
      maxPitch: 70,
      bounds: [[minX, minY], [maxX, maxY]],
    });
    this.ready = new Promise<void>((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      this.map.on('style.load', () => { this.addLayers(); finish(); });
      this.map.on('error', (e: any) => {
        if (!e?.sourceId && !this.map.getSource('full')) {
          this.baseOk = false;
          this.map.setStyle({ version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': s.style === 'light' || s.style === 'topo' ? '#eceae5' : '#16171a' } }] }, { diff: false });
        }
      });
      setTimeout(finish, 12000);
    });
  }

  private bbox: [number, number, number, number];
  private lastPos: ReturnType<typeof posAt> | null = null;

  private addLayers() {
    const m = this.map, r = this.s.res.route;
    const full = this.simple.map((i) => [r.lon[i], r.lat[i]]);
    m.addSource('dem', DEM_SOURCE as any);
    m.addSource('full', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: full } } });
    m.addSource('trail', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [full[0], full[0]] } } });
    m.addSource('head', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: full[0] } } });
    m.addLayer({ id: 'full', type: 'line', source: 'full', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-opacity': 0.35, 'line-width': 3 } });
    m.addLayer({ id: 'trail-c', type: 'line', source: 'trail', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#1a1206', 'line-width': 9, 'line-opacity': 0.6 } });
    m.addLayer({ id: 'trail', type: 'line', source: 'trail', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#f0a03c', 'line-width': 5 } });
    if (this.s.showEnds) {
      m.addSource('start', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: full[0] } } });
      m.addLayer({ id: 'start', type: 'circle', source: 'start', paint: { 'circle-radius': 8, 'circle-color': '#5fb57f', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
    }
    m.addLayer({ id: 'head-halo', type: 'circle', source: 'head', paint: { 'circle-radius': 18, 'circle-color': '#f0a03c', 'circle-opacity': 0.25 } });
    m.addLayer({ id: 'head', type: 'circle', source: 'head', paint: { 'circle-radius': 9, 'circle-color': '#f0a03c', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 } });
  }

  get attribution() { return this.baseOk ? ATTR[this.s.style] : ''; }
  get timeline() { return this.tl; }
  whenReady() { return this.ready; }

  /** Takip kamerası için otomatik yakınlık: görüntü genişliği ≈ rota uzunluğunun 1/6'sı (1–60 km). */
  private autoZoom(lat: number) {
    const total = this.s.res.cum[this.s.range[1]] - this.s.res.cum[this.s.range[0]];
    const span = Math.min(60000, Math.max(1000, total / 6));
    const z = Math.log2((156543.03 * Math.cos((lat * Math.PI) / 180) * this.s.width) / span);
    return Math.min(17, Math.max(3, z)) + this.zoomOffset;
  }

  /** p: 0–1 ilerleme. waitTiles: dışa aktarmada karolar yüklenene kadar bekle. */
  async frame(p: number, waitTiles: boolean, smooth = 0.12) {
    await this.ready;
    const { res } = this.s;
    const r = res.route;
    const pos = posAt(this.tl, res, p);
    // İz: seyreltilmiş noktalar + anlık (ara değerli) konum
    let k = 0, hi = this.simple.length - 1;
    while (k < hi) { const mid = (k + hi + 1) >> 1; if (this.simple[mid] <= pos.i) k = mid; else hi = mid - 1; }
    const coords: number[][] = new Array(k + 2);
    for (let n = 0; n <= k; n++) { const i = this.simple[n]; coords[n] = [r.lon[i], r.lat[i]]; }
    coords[k + 1] = [pos.lon, pos.lat];
    (this.map.getSource('trail') as GeoJSONSource | undefined)?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords.length > 1 ? coords : [coords[0], coords[0]] } });
    (this.map.getSource('head') as GeoJSONSource | undefined)?.setData({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [pos.lon, pos.lat] } });

    if (this.camera === 'overview') {
      if (this.map.getTerrain()) this.map.setTerrain(null);
      const b = this.bbox;
      const cam = this.map.cameraForBounds([[b[0], b[1]], [b[2], b[3]]], { padding: { top: this.s.height * 0.16, bottom: this.s.height * 0.34, left: 60, right: 60 } });
      if (cam) this.map.jumpTo({ ...cam, bearing: 0, pitch: 0 });
    } else {
      const is3d = this.camera === 'follow3d';
      if (is3d && !this.map.getTerrain() && this.map.getSource('dem')) this.map.setTerrain({ source: 'dem', exaggeration: 1.4 });
      if (!is3d && this.map.getTerrain()) this.map.setTerrain(null);
      this.bearing = is3d ? smoothBearing(this.bearing, pos.bearing, smooth) : 0;
      this.map.jumpTo({
        center: [pos.lon, pos.lat],
        zoom: this.autoZoom(pos.lat) + (is3d ? 0.6 : 0),
        bearing: this.bearing,
        pitch: is3d ? 58 : 0,
        padding: { top: 0, bottom: this.s.height * 0.22, left: 0, right: 0 },
      });
    }

    if (waitTiles) {
      this.map.triggerRepaint();
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 5000);
        this.map.once('idle', () => { clearTimeout(t); resolve(); });
      });
    } else {
      await new Promise<void>((resolve) => this.map.once('render', () => resolve()));
      // GeoJSON güncellemesi ve karolar biraz sonra çizilir: harita durulunca kare yeniden oluşturulur
      this.lastPos = pos;
      this.map.once('idle', () => { if (this.lastPos === pos) this.compose(pos); });
    }
    this.compose(pos);
  }

  private compose(pos: ReturnType<typeof posAt>) {
    const g = this.ctx, { width: W, height: H } = this.s;
    g.clearRect(0, 0, W, H);
    g.drawImage(this.map.getCanvas(), 0, 0, W, H);
    drawHud(g, { rec: this.s.rec, res: this.s.res, grade: this.s.grade, activity: this.s.activity, tl: this.tl, pos, W, H, attribution: this.attribution, showClock: this.showClock });
  }

  /** Başlangıç yönünü ayarla (videonun ilk karesi sarsıntısız başlasın). */
  resetBearing() {
    this.bearing = posAt(this.tl, this.s.res, 0).bearing;
  }

  destroy() {
    this.map.remove();
    this.holder.remove();
  }
}
