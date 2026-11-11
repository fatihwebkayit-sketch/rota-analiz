import type { RouteFuel } from '../core/types';

export interface FuelResult {
  distanceKm: number;
  units: number; // L veya kWh
  fuelCost: number;
  extrasTotal: number;
  total: number;
  perKm: number;
  perPerson: number;
}

/** Yakıt hesabı GPS hız verisinden bağımsızdır: yalnızca mesafe ve kullanıcının varsayımları. */
export function computeFuel(distanceM: number, f: Pick<RouteFuel, 'consumption' | 'price' | 'roundTrip' | 'persons' | 'extras'>, consumption = f.consumption): FuelResult {
  const distanceKm = (distanceM / 1000) * (f.roundTrip ? 2 : 1);
  const units = (distanceKm * consumption) / 100;
  const fuelCost = units * f.price;
  const extrasTotal = f.extras.reduce((s, e) => s + (isFinite(e.amount) ? e.amount : 0), 0);
  const total = fuelCost + extrasTotal;
  return {
    distanceKm,
    units,
    fuelCost,
    extrasTotal,
    total,
    perKm: distanceKm > 0 ? total / distanceKm : 0,
    perPerson: total / Math.max(1, f.persons),
  };
}
