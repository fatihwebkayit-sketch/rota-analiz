import { useEffect, useMemo, useRef, useState } from 'react';
import type { Currency, ExtraCost, RouteFuel, RouteRecord } from '../../core/types';
import { useApp } from '../../state/store';
import { computeFuel } from '../../analysis/fuel';
import { CURRENCY_SYMBOL, FUEL_LABEL, priceAt, unitOf } from '../../storage/settings';
import { fmt1, fmt2, fmtDate } from '../../core/format';
import { kindOf, upsertVehicle, VehicleForm, vehicleLabel } from '../settings/VehicleForm';

const money = (v: number, c: Currency) =>
  `${CURRENCY_SYMBOL[c]}${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`;
const parse = (v: string) => {
  const x = parseFloat(v.replace(/\s/g, '').replace(',', '.'));
  return isFinite(x) ? x : NaN;
};

export function FuelPanel({ record, distanceM, onChange }: { record: RouteRecord; distanceM: number; onChange(f: RouteFuel): void }) {
  const { vehicles, fuelPrices, saveVehicles, addFuelPrice, toast } = useApp();
  const wantKind = record.activity === 'moto' ? 'moto' : 'car';
  // Rotanın türüne uyan araçlar önce gelir
  const active = vehicles.filter((v) => !v.archived).sort((a, b) => Number(kindOf(b) === wantKind) - Number(kindOf(a) === wantKind));
  const routeDate = record.metrics.startTime ?? record.createdAt;
  const [adding, setAdding] = useState(false);

  // Başlangıç değerleri: kayıttaki varsayımlar, yoksa varsayılan araç + son fiyat
  const initial = useMemo<RouteFuel | null>(() => {
    if (record.fuel) return record.fuel;
    const v = active.find((x) => x.isDefault && kindOf(x) === wantKind) ?? active.find((x) => kindOf(x) === wantKind) ?? active[0];
    if (!v) return null;
    // Yalnızca rota tarihinde geçerli olan fiyat kullanılır; yoksa kullanıcıya sorulur
    const p = priceAt(fuelPrices, v.fuel, routeDate);
    return { vehicleId: v.id, vehicleLabel: vehicleLabel(v), fuel: v.fuel, consumption: v.avg, price: p?.price ?? 0, currency: p?.currency ?? 'TRY', priceDate: p?.date, priceSource: p ? 'history' : undefined, roundTrip: false, persons: 1, extras: [] };
  }, [record.id, record.fuel, vehicles.length, fuelPrices.length]);

  const [f, setF] = useState<RouteFuel | null>(initial);
  const [txt, setTxt] = useState({ consumption: '', price: '' });
  useEffect(() => {
    setF(initial);
    setTxt({ consumption: initial ? fmt2(initial.consumption) : '', price: initial?.price ? fmt2(initial.price) : '' });
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
    const p = priceAt(fuelPrices, v.fuel, routeDate);
    const sameFuel = v.fuel === f.fuel;
    const next: RouteFuel = p
      ? { ...f, vehicleId: v.id, vehicleLabel: vehicleLabel(v), fuel: v.fuel, consumption: v.avg, price: p.price, currency: p.currency, priceDate: p.date, priceSource: 'history' }
      : { ...f, vehicleId: v.id, vehicleLabel: vehicleLabel(v), fuel: v.fuel, consumption: v.avg, price: sameFuel ? f.price : 0, priceDate: sameFuel ? f.priceDate : undefined, priceSource: sameFuel ? f.priceSource : undefined };
    setTxt({ consumption: fmt2(next.consumption), price: next.price ? fmt2(next.price) : '' });
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
          <span className="mb-0.5 block text-[11px] text-fg-muted">{FUEL_LABEL[f.fuel]} fiyatı ({CURRENCY_SYMBOL[f.currency]}/{u}) · {fmtDate(routeDate)}</span>
          <input className="ra-input w-full tnum" inputMode="decimal" value={txt.price}
            onChange={(e) => { setTxt((t) => ({ ...t, price: e.target.value })); const v = parse(e.target.value); if (v >= 0) commit({ ...f, price: v, priceDate: routeDate, priceSource: 'manual' }); }} />
        </label>
      </div>
      {(() => {
        const dayEnd = routeDate + 864e5;
        if (!f.price)
          return (
            <div className="rounded-[3px] border border-amber/40 bg-amber-soft px-2.5 py-2 text-[11.5px] leading-snug text-amber">
              Bu rota <b>{fmtDate(routeDate)}</b> tarihli. Fiyat geçmişinde bu tarihe ait {FUEL_LABEL[f.fuel].toLocaleLowerCase('tr-TR')} fiyatı yok. Rota tarihindeki fiyatı yukarıya yazın; doğru bir maliyet için güncel fiyat kullanılmaz.
            </div>
          );
        if (f.priceDate != null && f.priceDate > dayEnd)
          return (
            <div className="rounded-[3px] border border-amber/40 bg-amber-soft px-2.5 py-2 text-[11.5px] leading-snug text-amber">
              Kullanılan fiyat {fmtDate(f.priceDate)} tarihli, rota ise {fmtDate(routeDate)} tarihli. Rota tarihindeki fiyatı girin.
            </div>
          );
        if (f.priceDate == null)
          return (
            <div className="rounded-[3px] border border-amber/40 bg-amber-soft px-2.5 py-2 text-[11.5px] leading-snug text-amber">
              Bu fiyatın hangi tarihe ait olduğu bilinmiyor (rota: {fmtDate(routeDate)}). Rota tarihindeki fiyatsa onaylayın, değilse düzeltin.
              <button className="ml-1 underline" onClick={() => commit({ ...f, priceDate: routeDate, priceSource: 'manual' })}>Fiyat doğru</button>
            </div>
          );
        if (f.priceSource === 'manual' && !fuelPrices.some((p) => p.fuel === (f.fuel === 'hibrit' ? 'benzin' : f.fuel) && Math.abs(p.date - routeDate) < 864e5 && Math.abs(p.price - f.price) < 0.005))
          return (
            <button
              className="text-left text-[11px] text-fg-faint hover:text-fg"
              onClick={() => { addFuelPrice({ fuel: f.fuel === 'hibrit' ? 'benzin' : f.fuel, price: f.price, currency: f.currency, date: routeDate }); toast(`Fiyat ${fmtDate(routeDate)} tarihiyle geçmişe eklendi`); }}
            >
              + Bu fiyatı {fmtDate(routeDate)} tarihiyle fiyat geçmişine ekle (o dönemin diğer rotalarında da kullanılır)
            </button>
          );
        return <p className="text-[10.5px] text-fg-faint">Fiyat: {fmtDate(f.priceDate)} tarihli kayıttan.</p>;
      })()}
      <div className="flex items-center gap-3">
        <div className="inline-flex overflow-hidden rounded-[3px] border border-ink-600">
          <button className="ra-seg h-6 px-2 text-[11px]" aria-pressed={!f.roundTrip} onClick={() => commit({ ...f, roundTrip: false })}>Tek yön</button>
          <button className="ra-seg h-6 border-l border-ink-600 px-2 text-[11px]" aria-pressed={f.roundTrip} onClick={() => commit({ ...f, roundTrip: true })}>Gidiş-dönüş</button>
        </div>
        <label className="flex items-center gap-1.5 text-[11.5px] text-fg-muted">
          Kişi
          <input type="text" inputMode="numeric" className="ra-input w-[52px] tnum" defaultValue={f.persons} key={`p-${record.id}-${f.persons}`}
            onBlur={(e) => commit({ ...f, persons: Math.max(1, Math.min(50, parseInt(e.target.value) || 1)) })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
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
