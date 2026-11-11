import { useEffect, useMemo, useRef, useState } from 'react';
import type { Currency, ExtraCost, RouteFuel, RouteRecord } from '../../core/types';
import { useApp } from '../../state/store';
import { computeFuel } from '../../analysis/fuel';
import { CURRENCY_SYMBOL, FUEL_LABEL, latestPrice, unitOf } from '../../storage/settings';
import { fmt1, fmt2 } from '../../core/format';
import { upsertVehicle, VehicleForm, vehicleLabel } from '../settings/VehicleForm';

const money = (v: number, c: Currency) =>
  `${CURRENCY_SYMBOL[c]}${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`;
const parse = (v: string) => {
  const x = parseFloat(v.replace(/\s/g, '').replace(',', '.'));
  return isFinite(x) ? x : NaN;
};

export function FuelPanel({ record, distanceM, onChange }: { record: RouteRecord; distanceM: number; onChange(f: RouteFuel): void }) {
  const { vehicles, fuelPrices, saveVehicles, setView } = useApp();
  const active = vehicles.filter((v) => !v.archived);
  const [adding, setAdding] = useState(false);

  // Başlangıç değerleri: kayıttaki varsayımlar, yoksa varsayılan araç + son fiyat
  const initial = useMemo<RouteFuel | null>(() => {
    if (record.fuel) return record.fuel;
    const v = active.find((x) => x.isDefault) ?? active[0];
    if (!v) return null;
    const lp = latestPrice(fuelPrices, v.fuel);
    return { vehicleId: v.id, vehicleLabel: vehicleLabel(v), fuel: v.fuel, consumption: v.avg, price: lp?.price ?? 0, currency: lp?.currency ?? 'TRY', roundTrip: false, persons: 1, extras: [] };
  }, [record.id, record.fuel, vehicles.length, fuelPrices.length]);

  const [f, setF] = useState<RouteFuel | null>(initial);
  const [txt, setTxt] = useState({ consumption: '', price: '' });
  useEffect(() => {
    setF(initial);
    setTxt({ consumption: initial ? fmt2(initial.consumption) : '', price: initial ? fmt2(initial.price) : '' });
  }, [record.id, initial?.vehicleId, record.fuel === undefined]);

  // Kayıtta henüz varsayım yoksa ve fiyat biliniyorsa varsayılanlar bir kez kaydedilir (istatistikler için)
  useEffect(() => {
    if (!record.fuel && initial && initial.price > 0 && distanceM > 0) {
      const res = computeFuel(distanceM, initial);
      onChange({ ...initial, totalCost: res.total, computedAt: Date.now() });
    }
  }, [record.id, initial?.vehicleId, initial?.price, distanceM]);

  // Değişiklikleri kısa bir gecikmeyle kayda yaz (anında hesap, gecikmeli kayıt)
  const timer = useRef<number>();
  const commit = (next: RouteFuel) => {
    setF(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const res = computeFuel(distanceM, next);
      onChange({ ...next, totalCost: res.total, computedAt: Date.now() });
    }, 700);
  };

  if (!active.length && !f)
    return (
      <div className="space-y-2 text-[12px] text-fg-muted">
        <p>Yakıt hesabı için önce bir araç ekleyin.</p>
        <button className="ra-btn" onClick={() => setAdding(true)}>Araç ekle</button>
        {adding && <VehicleForm onClose={() => setAdding(false)} onSave={(v) => { saveVehicles(upsertVehicle(vehicles, { ...v, isDefault: true })); setAdding(false); }} />}
      </div>
    );
  if (!f) return null;

  const r = computeFuel(distanceM, f);
  const u = unitOf(f.fuel);
  const veh = vehicles.find((v) => v.id === f.vehicleId);
  const scenarios = [
    veh?.city ? { label: 'Şehir içi', c: veh.city } : null,
    veh?.highway ? { label: 'Şehir dışı', c: veh.highway } : null,
    { label: '%10 daha az', c: f.consumption * 0.9 },
    { label: '%10 daha fazla', c: f.consumption * 1.1 },
  ].filter(Boolean) as { label: string; c: number }[];

  const chooseVehicle = (id: string) => {
    const v = vehicles.find((x) => x.id === id);
    if (v) chooseVehicleObj(v);
  };
  function chooseVehicleObj(v: (typeof vehicles)[number]) {
    if (!f) return;
    const lp = latestPrice(fuelPrices, v.fuel);
    const next = { ...f, vehicleId: v.id, vehicleLabel: vehicleLabel(v), fuel: v.fuel, consumption: v.avg, price: lp?.price ?? f.price, currency: lp?.currency ?? f.currency };
    setTxt({ consumption: fmt2(next.consumption), price: fmt2(next.price) });
    commit(next);
  }
  const setExtra = (i: number, p: Partial<ExtraCost>) => commit({ ...f, extras: f.extras.map((e, k) => (k === i ? { ...e, ...p } : e)) });

  return (
    <div className="space-y-2.5 text-[12px]">
      <div className="flex gap-1.5">
        <select className="ra-input min-w-0 flex-1" value={f.vehicleId ?? ''} onChange={(e) => (e.target.value === '__new' ? setAdding(true) : chooseVehicle(e.target.value))}>
          {!veh && <option value="">{f.vehicleLabel ?? 'Araç seçin'}</option>}
          {active.map((v) => <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}
          <option value="__new">+ Yeni araç ekle…</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="mb-0.5 block text-[11px] text-fg-muted">Tüketim ({u}/100 km)</span>
          <input className="ra-input w-full tnum" inputMode="decimal" value={txt.consumption}
            onChange={(e) => { setTxt((t) => ({ ...t, consumption: e.target.value })); const v = parse(e.target.value); if (v > 0) commit({ ...f, consumption: v }); }} />
        </label>
        <label>
          <span className="mb-0.5 block text-[11px] text-fg-muted">{FUEL_LABEL[f.fuel]} fiyatı ({CURRENCY_SYMBOL[f.currency]}/{u})</span>
          <input className="ra-input w-full tnum" inputMode="decimal" value={txt.price}
            onChange={(e) => { setTxt((t) => ({ ...t, price: e.target.value })); const v = parse(e.target.value); if (v >= 0) commit({ ...f, price: v }); }} />
        </label>
      </div>
      {!f.price && (
        <p className="text-[11px] text-amber">
          Yakıt fiyatı girilmedi. Buraya yazabilir ya da <button className="underline" onClick={() => setView('settings')}>Ayarlar</button>'dan kaydedebilirsiniz.
        </p>
      )}
      <div className="flex items-center gap-3">
        <div className="inline-flex overflow-hidden rounded-[3px] border border-ink-600">
          <button className="ra-seg h-6 px-2 text-[11px]" aria-pressed={!f.roundTrip} onClick={() => commit({ ...f, roundTrip: false })}>Tek yön</button>
          <button className="ra-seg h-6 border-l border-ink-600 px-2 text-[11px]" aria-pressed={f.roundTrip} onClick={() => commit({ ...f, roundTrip: true })}>Gidiş-dönüş</button>
        </div>
        <label className="flex items-center gap-1.5 text-[11.5px] text-fg-muted">
          Kişi
          <input type="number" min={1} max={20} className="ra-input w-[52px] tnum" value={f.persons} onChange={(e) => commit({ ...f, persons: Math.max(1, Math.min(20, parseInt(e.target.value) || 1)) })} />
        </label>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] text-fg-muted">Ek masraflar</span>
          <button className="text-[11px] text-fg-faint hover:text-fg" onClick={() => commit({ ...f, extras: [...f.extras, { label: '', amount: 0 }] })}>+ Ekle</button>
        </div>
        {f.extras.map((e, i) => (
          <div key={i} className="mb-1 flex gap-1.5">
            <input className="ra-input min-w-0 flex-1" placeholder="Otoyol, köprü, otopark…" value={e.label} onChange={(ev) => setExtra(i, { label: ev.target.value })} />
            <input className="ra-input w-[80px] tnum" inputMode="decimal" placeholder="0" defaultValue={e.amount ? fmt2(e.amount) : ''} onChange={(ev) => setExtra(i, { amount: parse(ev.target.value) || 0 })} />
            <button className="px-1 text-fg-faint hover:text-down" onClick={() => commit({ ...f, extras: f.extras.filter((_, k) => k !== i) })} aria-label="Sil">×</button>
          </div>
        ))}
      </div>

      <div className="rounded-[3px] border border-ink-700 bg-ink-900 p-2.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] text-fg-muted">Tahmini toplam</span>
          <span className="tnum text-[18px] font-medium text-fg">{money(r.total, f.currency)}</span>
        </div>
        <dl className="mt-1.5 grid grid-cols-[1fr_auto] gap-y-0.5 text-[11.5px] tnum">
          <dt className="text-fg-muted">Hesaplanan mesafe</dt><dd className="text-right">{fmt1(r.distanceKm)} km{f.roundTrip ? ' (gidiş-dönüş)' : ''}</dd>
          <dt className="text-fg-muted">Tahmini tüketim</dt><dd className="text-right">{fmt2(r.units)} {u}</dd>
          <dt className="text-fg-muted">Yakıt maliyeti</dt><dd className="text-right">{money(r.fuelCost, f.currency)}</dd>
          {r.extrasTotal > 0 && (<><dt className="text-fg-muted">Ek masraflar</dt><dd className="text-right">{money(r.extrasTotal, f.currency)}</dd></>)}
          <dt className="text-fg-muted">Km başı</dt><dd className="text-right">{money(r.perKm, f.currency)}</dd>
          {f.persons > 1 && (<><dt className="text-fg-muted">Kişi başı ({f.persons} kişi)</dt><dd className="text-right">{money(r.perPerson, f.currency)}</dd></>)}
        </dl>
      </div>

      <details className="text-[11.5px]">
        <summary className="cursor-pointer text-fg-muted">Alternatif tüketim senaryoları</summary>
        <table className="mt-1 w-full tnum">
          <tbody>
            {scenarios.map((s) => {
              const sr = computeFuel(distanceM, f, s.c);
              return (
                <tr key={s.label} className="border-t border-ink-700">
                  <td className="py-1 text-fg-muted">{s.label}</td>
                  <td className="text-right text-fg-faint">{fmt1(s.c)} {u}/100</td>
                  <td className="text-right">{fmt1(sr.units)} {u}</td>
                  <td className="text-right text-fg">{money(sr.total, f.currency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
      <p className="text-[10.5px] leading-snug text-fg-faint">Hesap, GPS hızından bağımsız olarak yalnızca mesafe ve girdiğiniz değerlerle yapılır. Bu rotanın varsayımları kayıtla birlikte saklanır.</p>

      {adding && (
        <VehicleForm
          onClose={() => setAdding(false)}
          onSave={(v) => { const list = upsertVehicle(vehicles, v); saveVehicles(list); setAdding(false); chooseVehicleObj(v); }}
        />
      )}
    </div>
  );
}
