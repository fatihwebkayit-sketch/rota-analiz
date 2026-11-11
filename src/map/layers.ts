import type { StyleSpecification } from 'maplibre-gl';
import type { BaseLayer } from '../state/store';

const OSM = '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> katkıda bulunanlar';

function rasterStyle(tiles: string[], attribution: string, maxzoom: number, bg: string): StyleSpecification {
  return {
    version: 8,
    sources: { base: { type: 'raster', tiles, tileSize: 256, attribution, maxzoom } },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': bg } },
      { id: 'base', type: 'raster', source: 'base' },
    ],
  };
}

/** Tüm altlıklar anahtarsızdır (Bölüm 5). */
export function baseStyle(layer: BaseLayer): string | StyleSpecification {
  switch (layer) {
    case 'dark':
      return 'https://tiles.openfreemap.org/styles/dark';
    case 'light':
      return 'https://tiles.openfreemap.org/styles/liberty';
    case 'satellite':
      return rasterStyle(
        ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        'Görüntü © Esri, Maxar, Earthstar Geographics',
        19,
        '#0b0c0d',
      );
    case 'topo':
      return rasterStyle(
        ['a', 'b', 'c'].map((s) => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`),
        `Harita: © <a href="https://opentopomap.org" target="_blank">OpenTopoMap</a> (CC-BY-SA) · ${OSM}`,
        17,
        '#f2efe9',
      );
  }
}

export const DEM_SOURCE = {
  type: 'raster-dem' as const,
  tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  encoding: 'terrarium' as const,
  tileSize: 256,
  maxzoom: 15,
  attribution: 'Rakım: <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank">AWS Terrain Tiles</a> (Mapzen)',
};

export const COLORS = {
  route: '#f0a03c',
  casing: '#1a1206',
  trimmed: '#8a8d92',
  lowConf: '#c792ea',
  stop: '#e7e5e0',
  start: '#5fb57f',
  end: '#e2614f',
};
