import { Geodesic } from 'geographiclib-geodesic';

const geod = Geodesic.WGS84;
const DIST = Geodesic.DISTANCE;

/** WGS84 elipsoidi üzerinde jeodezik mesafe (Karney), metre. */
export function geodesicDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  if (lat1 === lat2 && lon1 === lon2) return 0;
  return geod.Inverse(lat1, lon1, lat2, lon2, DIST).s12 as number;
}

/** Kısa mesafeler için hızlı yaklaşık (yarıçap kontrolleri gibi eşik testlerinde). */
export function fastDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371008.8;
  const toRad = Math.PI / 180;
  const x = (lon2 - lon1) * toRad * Math.cos(((lat1 + lat2) / 2) * toRad);
  const y = (lat2 - lat1) * toRad;
  return Math.sqrt(x * x + y * y) * R;
}
