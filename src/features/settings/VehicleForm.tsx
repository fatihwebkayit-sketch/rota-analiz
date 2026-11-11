import { useState } from 'react';
import type { FuelType, Vehicle } from '../../core/types';
import { FUEL_LABEL, unitOf } from '../../storage/settings';
import { newId } from '../../storage/repo';

const FUELS: FuelType[] = ['benzin', 'motorin', 'lpg', 'hibrit', 'elektrik'];
const num = (v: string) => {
  const x = parseFloat(v.replace(',', '.'));
  return isFinite(x) ? x : undefined;
};
const str = (v?: number) => (v == null ? '' : String(v).replace('.', ','));

export function VehicleForm({ initial, onSave, onClose }: { initial?: Vehicle; onSave(v: Vehicle): void; onClose(): void }) {
  const [f, setF] = useState({
    nickname: initial?.nickname ?? '',
    kind: initial?.kind ?? ('car' as 'car' | 'moto'),
    brand: initial?.brand ?? '',
    model: initial?.model ?? '',
    year: str(initial?.year),
    fuel: initial?.fuel ?? ('benzin' as FuelType),
    avg: str(initial?.avg),
    city: str(initial?.city),
    highway: str(initial?.highway),
    tank: str(initial?.tank),
    note: initial?.note ?? '',
    isDefault: initial?.isDefault ?? false,
  });
  const set = (k: keyof typeof f, v: any) => setF((x) => ({ ...x, [k]: v }));
  const u = unitOf(f.fuel);
  const avg = num(f.avg);
  const valid = f.nickname.trim().length > 0 && avg != null && avg > 0 && avg < 100;

  const save = () => {
    if (!valid) return;
    onSave({
      id: initial?.id ?? newId(),
      kind: f.kind,
      nickname: f.nickname.trim(),
      brand: f.brand.trim(),
      model: f.model.trim(),
      year: num(f.year),
      fuel: f.fuel,
      avg: avg!,
      city: num(f.city),
      highway: num(f.highway),
      tank: num(f.tank),
      note: f.note.trim() || undefined,
      isDefault: f.isDefault,
      archived: initial?.archived,
    });
  };

  const field = (label: string, el: React.ReactNode, hint?: string) => (
    <label className="block">
      <span className="mb-1 block text-[11px] text-fg-muted">{label}</span>
      {el}
      {hint && <span className="mt-0.5 block text-[10.5px] text-fg-faint">{hint}</span>}
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-ink-950/75 pt-[8vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-[min(560px,94vw)] rounded-[4px] border border-ink-600 bg-ink-850 shadow-2xl">
        <div className="border-b border-ink-700 px-4 py-2.5 text-[13px] font-semibold">{initial ? 'Aracı düzenle' : 'Araç ekle'}</div>
        <div className="grid grid-cols-2 gap-3 px-4 py-4">
          <div className="col-span-2 grid grid-cols-[1fr_auto] gap-3">
            {field('Takma ad *', <input autoFocus className="ra-input w-full" placeholder="ör. Beyaz Egea" value={f.nickname} onChange={(e) => set('nickname', e.target.value)} />)}
            {field('Tip', (
              <div className="inline-flex overflow-hidden rounded-[3px] border border-ink-600">
                <button type="button" className="ra-seg" aria-pressed={f.kind === 'car'} onClick={() => set('kind', 'car')}>Otomobil</button>
                <button type="button" className="ra-seg border-l border-ink-600" aria-pressed={f.kind === 'moto'} onClick={() => set('kind', 'moto')}>Motosiklet</button>
              </div>
            ))}
          </div>
          {field('Marka', <input className="ra-input w-full" value={f.brand} onChange={(e) => set('brand', e.target.value)} />)}
          {field('Model', <input className="ra-input w-full" value={f.model} onChange={(e) => set('model', e.target.value)} />)}
          {field('Model yılı', <input className="ra-input w-full tnum" inputMode="numeric" value={f.year} onChange={(e) => set('year', e.target.value)} />)}
          {field('Yakıt türü *', (
            <select className="ra-input w-full" value={f.fuel} onChange={(e) => set('fuel', e.target.value)}>
              {FUELS.map((x) => <option key={x} value={x}>{FUEL_LABEL[x]}</option>)}
            </select>
          ))}
          {field(`Ortalama tüketim * (${u}/100 km)`, <input className="ra-input w-full tnum" inputMode="decimal" placeholder={u === 'L' ? '6,5' : '16'} value={f.avg} onChange={(e) => set('avg', e.target.value)} />)}
          {field(`Depo / batarya (${u})`, <input className="ra-input w-full tnum" inputMode="decimal" value={f.tank} onChange={(e) => set('tank', e.target.value)} />)}
          {field(`Şehir içi (${u}/100 km)`, <input className="ra-input w-full tnum" inputMode="decimal" value={f.city} onChange={(e) => set('city', e.target.value)} />, 'İsteğe bağlı · senaryolarda kullanılır')}
          {field(`Şehir dışı (${u}/100 km)`, <input className="ra-input w-full tnum" inputMode="decimal" value={f.highway} onChange={(e) => set('highway', e.target.value)} />, 'İsteğe bağlı')}
          <div className="col-span-2">{field('Not', <input className="ra-input w-full" value={f.note} onChange={(e) => set('note', e.target.value)} />)}</div>
          <label className="col-span-2 flex items-center gap-2 text-[12px]">
            <input type="checkbox" className="accent-[#f0a03c]" checked={f.isDefault} onChange={(e) => set('isDefault', e.target.checked)} />
            Varsayılan araç olarak kullan
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-700 px-4 py-2.5">
          <button className="ra-btn" onClick={onClose}>Vazgeç</button>
          <button className="ra-btn-primary" disabled={!valid} onClick={save}>Kaydet</button>
        </div>
      </div>
    </div>
  );
}

/** Varsayılan bayrağı tek araçta kalacak şekilde listeyi günceller. */
export function upsertVehicle(list: Vehicle[], v: Vehicle): Vehicle[] {
  let out = list.some((x) => x.id === v.id) ? list.map((x) => (x.id === v.id ? v : x)) : [...list, v];
  if (v.isDefault) out = out.map((x) => (x.id === v.id || (x.kind ?? 'car') !== (v.kind ?? 'car') ? x : { ...x, isDefault: false }));
  else if (!out.some((x) => x.isDefault && !x.archived) && out.filter((x) => !x.archived).length === 1) out = out.map((x) => ({ ...x, isDefault: !x.archived }));
  return out;
}

export const vehicleLabel = (v: Vehicle) => [v.nickname, [v.brand, v.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ');

/** Varsayılan bayrağı tipe göre (otomobil/motosiklet) ayrı tutulur. */
export const kindOf = (v: Vehicle) => v.kind ?? 'car';
