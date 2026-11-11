import { useRef, useState, type ReactNode } from 'react';
import type { Currency, FuelType, Vehicle } from '../../core/types';
import { useApp } from '../../state/store';
import { CURRENCY_SYMBOL, FUEL_LABEL, latestPrice, saveKey, unitOf } from '../../storage/settings';
import { fmt2, fmtDate, isoDateTR } from '../../core/format';
import { upsertVehicle, VehicleForm, vehicleLabel } from './VehicleForm';
import { downloadBlob, exportBackup, readBackup } from '../../storage/backup';
import { putRecord } from '../../storage/repo';
import { db } from '../../storage/db';

const PRICE_FUELS: FuelType[] = ['benzin', 'motorin', 'lpg', 'elektrik'];

const Card = ({ title, sub, children, right }: { title: string; sub?: string; children: ReactNode; right?: ReactNode }) => (
  <section className="rounded-[4px] border border-ink-700 bg-ink-850">
    <div className="flex items-start justify-between gap-3 border-b border-ink-700 px-4 py-2.5">
      <div>
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {sub && <p className="mt-0.5 text-[11.5px] text-fg-muted">{sub}</p>}
      </div>
      {right}
    </div>
    <div className="px-4 py-3">{children}</div>
  </section>
);

export function SettingsView() {
  const { vehicles, saveVehicles, fuelPrices, addFuelPrice, prefs, setPrefs, folderState, folderHandle, chooseFolder, toast, refresh } = useApp();
  const [editing, setEditing] = useState<Vehicle | 'new' | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [priceDraft, setPriceDraft] = useState<Record<string, string>>({});
  const [currency, setCurrency] = useState<Currency>('TRY');
  const [priceDay, setPriceDay] = useState(() => isoDateTR(Date.now()));
  const [busy, setBusy] = useState(false);
  const restoreInput = useRef<HTMLInputElement>(null);
  const root = folderState === 'granted' ? folderHandle : undefined;

  const list = vehicles.filter((v) => showArchived || !v.archived);

  const savePrice = (f: FuelType) => {
    const v = parseFloat((priceDraft[f] ?? '').replace(',', '.'));
    if (!isFinite(v) || v <= 0) return toast('Geçerli bir fiyat girin', 'error');
    const d = new Date(priceDay + 'T12:00:00+03:00').getTime();
    addFuelPrice({ fuel: f, price: v, currency, date: isFinite(d) ? d : Date.now() });
    setPriceDraft((d) => ({ ...d, [f]: '' }));
    toast(`${FUEL_LABEL[f]} fiyatı kaydedildi`);
  };

  const togglePlaces = async (on: boolean) => {
    if (on && !prefs.placeConsentShown) {
      const ok = confirm(
        'Otomatik yer adı için yalnızca rotanın başlangıç ve bitiş koordinatları OpenStreetMap adres servisine (Nominatim) gönderilir. Rotanın geri kalanı gönderilmez.\n\nAçılsın mı?',
      );
      if (!ok) return;
    }
    setPrefs({ autoPlaceNames: on, placeConsentShown: true });
  };

  const doBackup = async () => {
    setBusy(true);
    try {
      const { blob, count, missing } = await exportBackup(root);
      downloadBlob(blob, `rota-analiz-yedek-${isoDateTR(Date.now())}.zip`);
      toast(`${count} kayıt yedeklendi${missing ? ` (${missing} kaydın kaynak dosyası bulunamadı)` : ''}`);
    } catch (e) {
      toast('Yedek alınamadı: ' + (e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const doRestore = async (file: File) => {
    setBusy(true);
    try {
      const { items, settings } = await readBackup(file);
      const existing = new Set((await (await db()).getAllKeys('records')) as string[]);
      let added = 0;
      for (const it of items) {
        if (existing.has(it.record.id)) continue;
        await putRecord(it.record, it.bytes, root);
        added++;
      }
      if (settings['araclar.json']?.items) {
        const merged = [...vehicles];
        for (const v of settings['araclar.json'].items as Vehicle[]) if (!merged.some((x) => x.id === v.id)) merged.push(v);
        await saveVehicles(merged);
      }
      if (settings['yakit-fiyatlari.json']?.items) {
        const known = new Set(fuelPrices.map((p) => `${p.fuel}-${p.date}`));
        const items2 = [...fuelPrices, ...settings['yakit-fiyatlari.json'].items.filter((p: any) => !known.has(`${p.fuel}-${p.date}`))];
        await saveKey('fuelPrices', { updatedAt: Date.now(), items: items2 }, root);
        useApp.setState({ fuelPrices: items2 });
      }
      await refresh();
      toast(`Yedekten ${added} yeni kayıt geri yüklendi${items.length - added ? `, ${items.length - added} kayıt zaten vardı` : ''}`);
    } catch (e) {
      toast('Yedek okunamadı: ' + (e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-4 px-5 py-5 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <Card
            title="Araçlarım"
            sub="Yakıt hesabında kullanılır. Araç değişince eskisini silmek yerine arşivleyin; geçmiş rotaların hesabı bozulmaz."
            right={<button className="ra-btn-primary shrink-0" onClick={() => setEditing('new')}>Araç ekle</button>}
          >
            {list.length === 0 ? (
              <p className="py-4 text-center text-[12.5px] text-fg-muted">Henüz araç eklenmedi.</p>
            ) : (
              <table className="w-full text-[12.5px]">
                <thead className="text-left text-[11px] uppercase tracking-[0.05em] text-fg-faint">
                  <tr>
                    <th className="py-1.5 font-medium">Araç</th>
                    <th className="font-medium">Yakıt</th>
                    <th className="text-right font-medium">Ortalama</th>
                    <th className="text-right font-medium">Şehir içi / dışı</th>
                    <th className="text-right font-medium">Depo</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.map((v) => {
                    const u = unitOf(v.fuel);
                    return (
                      <tr key={v.id} className={`border-t border-ink-700 ${v.archived ? 'opacity-50' : ''}`}>
                        <td className="py-2">
                          <div className="text-fg">
                            {v.nickname}
                            {v.isDefault && !v.archived && <span className="ml-2 rounded-[2px] border border-amber/50 px-1 text-[10px] uppercase text-amber">Varsayılan</span>}
                            {v.archived && <span className="ml-2 text-[10.5px] text-fg-faint">arşivde</span>}
                          </div>
                          <div className="text-[11px] text-fg-faint">{[v.kind === 'moto' ? 'Motosiklet' : 'Otomobil', v.brand, v.model, v.year].filter(Boolean).join(' · ')}</div>
                        </td>
                        <td>{FUEL_LABEL[v.fuel]}</td>
                        <td className="text-right tnum">{fmt2(v.avg)} {u}/100 km</td>
                        <td className="text-right tnum text-fg-muted">{v.city ? fmt2(v.city) : '—'} / {v.highway ? fmt2(v.highway) : '—'}</td>
                        <td className="text-right tnum text-fg-muted">{v.tank ? `${v.tank} ${u}` : '—'}</td>
                        <td className="whitespace-nowrap pl-3 text-right">
                          <button className="ra-chip" onClick={() => setEditing(v)}>Düzenle</button>{' '}
                          <button className="ra-chip" onClick={() => saveVehicles(vehicles.map((x) => (x.id === v.id ? { ...x, archived: !x.archived, isDefault: x.archived ? x.isDefault : false } : x)))}>
                            {v.archived ? 'Geri al' : 'Arşivle'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {vehicles.some((v) => v.archived) && (
              <label className="mt-2 flex items-center gap-2 text-[11.5px] text-fg-muted">
                <input type="checkbox" className="accent-[#f0a03c]" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Arşivlenmiş araçları göster
              </label>
            )}
          </Card>
        </div>

        <Card title="Yakıt fiyatları" sub="Her rotada, rota tarihinde geçerli olan fiyat kullanılır. Eski rotalar için geçmiş tarihli fiyat da girebilirsiniz.">
          <div className="mb-2 flex items-center gap-2 text-[11.5px] text-fg-muted">
            Para birimi
            <select className="ra-input" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
              <option value="TRY">₺ TL</option><option value="EUR">€ Euro</option><option value="USD">$ Dolar</option>
            </select>
            <span className="ml-3">Fiyat tarihi</span>
            <input type="date" className="ra-input" value={priceDay} max={isoDateTR(Date.now())} onChange={(e) => setPriceDay(e.target.value)} />
          </div>
          <table className="w-full text-[12.5px]">
            <tbody>
              {PRICE_FUELS.map((f) => {
                const lp = latestPrice(fuelPrices, f);
                return (
                  <tr key={f} className="border-t border-ink-700">
                    <td className="py-2">{FUEL_LABEL[f]}</td>
                    <td className="tnum text-fg-muted">
                      {lp ? <>{CURRENCY_SYMBOL[lp.currency]}{fmt2(lp.price)} / {unitOf(f)} <span className="text-[11px] text-fg-faint">· {fmtDate(lp.date)}</span></> : '—'}
                    </td>
                    <td className="text-right">
                      <input className="ra-input w-[86px] tnum" inputMode="decimal" placeholder="yeni fiyat" value={priceDraft[f] ?? ''} onChange={(e) => setPriceDraft((d) => ({ ...d, [f]: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && savePrice(f)} />{' '}
                      <button className="ra-chip" onClick={() => savePrice(f)}>Kaydet</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {fuelPrices.length > 0 && (
            <details className="mt-2 text-[11.5px] text-fg-muted">
              <summary className="cursor-pointer">Fiyat geçmişi ({fuelPrices.length})</summary>
              <ul className="mt-1 max-h-40 overflow-auto tnum">
                {fuelPrices.map((p) => <li key={`${p.fuel}-${p.date}`}>{fmtDate(p.date)} · {FUEL_LABEL[p.fuel]} · {CURRENCY_SYMBOL[p.currency]}{fmt2(p.price)}</li>)}
              </ul>
            </details>
          )}
        </Card>

        <Card title="Yer adları" sub="Başlangıç ve bitiş yerinin adı (ör. “Zeytinburnu, İstanbul”).">
          <label className="flex items-start gap-2 text-[12.5px]">
            <input type="checkbox" className="mt-0.5 accent-[#f0a03c]" checked={prefs.autoPlaceNames} onChange={(e) => togglePlaces(e.target.checked)} />
            <span>
              Yeni rotalarda yer adını otomatik doldur
              <span className="block text-[11px] text-fg-faint">Açıkken yalnızca başlangıç ve bitiş koordinatları OpenStreetMap adres servisine gönderilir. Kapalıyken hiçbir koordinat dışarı gönderilmez; adları elle yazarsınız.</span>
            </span>
          </label>
        </Card>

        <Card title="Veri klasörü" sub="Rotalarınız bu klasörde ayrı dosyalar olarak saklanır.">
          <div className="flex items-center justify-between gap-3 text-[12.5px]">
            <span className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${folderState === 'granted' ? 'bg-up' : folderState === 'prompt' ? 'bg-amber' : 'bg-fg-faint'}`} />
              {folderHandle ? <span className="font-mono">{folderHandle.name}</span> : 'Klasör bağlı değil · veriler yalnızca bu tarayıcıda'}
            </span>
            {folderState !== 'unsupported' && <button className="ra-btn" onClick={chooseFolder}>{folderHandle ? 'Klasörü değiştir' : 'Klasör seç'}</button>}
          </div>
        </Card>

        <Card title="Yedekleme" sub="Tüm kayıtlar, kaynak dosyalar, araçlar ve fiyatlar tek bir .zip dosyasına.">
          <div className="flex flex-wrap gap-2">
            <button className="ra-btn" disabled={busy} onClick={doBackup}>Yedek indir</button>
            <button className="ra-btn" disabled={busy} onClick={() => restoreInput.current?.click()}>Yedekten geri yükle</button>
            <input ref={restoreInput} type="file" accept=".zip" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) doRestore(f); }} />
          </div>
          <p className="mt-2 text-[11px] text-fg-faint">Geri yüklemede mevcut kayıtlar değiştirilmez; yalnızca eksik olanlar eklenir.</p>
        </Card>
      </div>

      <p className="pb-6 text-center text-[11px] text-fg-faint">Rota Analiz · sürüm {__APP_VERSION__}</p>

      {editing && (
        <VehicleForm
          initial={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={(v) => { saveVehicles(upsertVehicle(vehicles, v)); setEditing(null); toast(`“${vehicleLabel(v)}” kaydedildi`); }}
        />
      )}
    </div>
  );
}
