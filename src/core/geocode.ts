// İsteğe bağlı yer adı: OpenStreetMap Nominatim (yalnızca başlangıç/bitiş koordinatları gönderilir).
// Kullanım kuralı: saniyede en fazla 1 istek.
let last = 0;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  const gap = Date.now() - last;
  if (gap < 1100) await wait(1100 - gap);
  last = Date.now();
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}&zoom=12&addressdetails=1&accept-language=tr`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Adres servisi yanıt vermedi (${res.status})`);
  const j = await res.json();
  const a = j.address ?? {};
  const district = a.town || a.city_district || a.county || a.district || a.municipality || a.village || a.suburb;
  const province = a.province || a.state || a.city;
  const parts = [district, province].filter((x, i, arr) => x && arr.indexOf(x) === i);
  return parts.length ? parts.join(', ') : j.name || null;
}

/** Bir rotanın başlangıç ve bitiş adlarını getirir (aynı yerse tek istek). */
export async function placeNamesFor(start: [number, number], end: [number, number]) {
  const s = await reverseGeocode(start[1], start[0]);
  const close = Math.abs(start[0] - end[0]) < 0.002 && Math.abs(start[1] - end[1]) < 0.002;
  const e = close ? s : await reverseGeocode(end[1], end[0]);
  return { start: s ?? '', end: e ?? '' };
}
