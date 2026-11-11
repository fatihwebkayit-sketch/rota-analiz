// Araçlar, yakıt fiyatları ve tercihler. Klasör bağlıysa <klasör>/_ayarlar/*.json dosyalarına da yazılır,
// böylece ev ve ofis bilgisayarında aynı araç listesi görünür. Her dosya ayrı tutulur; en yeni kazanır.
import type { FuelPrice, Vehicle } from '../core/types';
import { kvGet, kvSet } from './db';

export interface Prefs {
  autoPlaceNames: boolean;
  placeConsentShown: boolean;
  hideEndsInExports: boolean;
}

export interface SettingsData {
  vehicles: { updatedAt: number; items: Vehicle[] };
  fuelPrices: { updatedAt: number; items: FuelPrice[] };
  prefs: { updatedAt: number; value: Prefs };
}

export const DEFAULT_PREFS: Prefs = { autoPlaceNames: false, placeConsentShown: false, hideEndsInExports: true };

const FILES = { vehicles: 'araclar.json', fuelPrices: 'yakit-fiyatlari.json', prefs: 'tercihler.json' } as const;
type Key = keyof typeof FILES;

export async function loadLocal(): Promise<SettingsData> {
  return {
    vehicles: (await kvGet('s.vehicles')) ?? { updatedAt: 0, items: [] },
    fuelPrices: (await kvGet('s.fuelPrices')) ?? { updatedAt: 0, items: [] },
    prefs: (await kvGet('s.prefs')) ?? { updatedAt: 0, value: DEFAULT_PREFS },
  };
}

async function settingsDir(root: FileSystemDirectoryHandle) {
  return root.getDirectoryHandle('_ayarlar', { create: true });
}

export async function saveKey<K extends Key>(key: K, data: SettingsData[K], root?: FileSystemDirectoryHandle) {
  await kvSet('s.' + key, data);
  if (root) {
    try {
      const dir = await settingsDir(root);
      const fh = await dir.getFileHandle(FILES[key], { create: true });
      const w = await (fh as any).createWritable();
      await w.write(JSON.stringify(data, null, 2));
      await w.close();
    } catch (e) {
      console.warn('Ayar dosyası yazılamadı', key, e);
    }
  }
}

/** Klasördeki ayarları yerel kopyayla karşılaştırır; yeni olanı her iki tarafa da yazar. */
export async function syncSettings(root: FileSystemDirectoryHandle): Promise<SettingsData> {
  const local = await loadLocal();
  const out = { ...local } as SettingsData;
  let dir: FileSystemDirectoryHandle;
  try {
    dir = await settingsDir(root);
  } catch {
    return local;
  }
  for (const key of Object.keys(FILES) as Key[]) {
    let disk: any = null;
    try {
      disk = JSON.parse(await (await (await dir.getFileHandle(FILES[key])).getFile()).text());
    } catch {
      /* dosya yok */
    }
    const l = local[key] as any;
    if (disk && disk.updatedAt > l.updatedAt) {
      (out as any)[key] = disk;
      await kvSet('s.' + key, disk);
    } else if (!disk || l.updatedAt > disk.updatedAt) {
      if (l.updatedAt > 0) await saveKey(key, l, root);
    }
  }
  return out;
}

export const FUEL_LABEL: Record<Vehicle['fuel'], string> = {
  benzin: 'Benzin',
  motorin: 'Motorin',
  lpg: 'LPG',
  hibrit: 'Hibrit (benzin)',
  elektrik: 'Elektrik',
};
export const unitOf = (f: Vehicle['fuel']) => (f === 'elektrik' ? 'kWh' : 'L');
export const CURRENCY_SYMBOL = { TRY: '₺', EUR: '€', USD: '$' } as const;

/** Bir yakıt türü için en son girilen fiyat. */
export function latestPrice(prices: FuelPrice[], fuel: Vehicle['fuel']): FuelPrice | undefined {
  const key = fuel === 'hibrit' ? 'benzin' : fuel;
  return prices.filter((p) => p.fuel === key).sort((a, b) => b.date - a.date)[0];
}
