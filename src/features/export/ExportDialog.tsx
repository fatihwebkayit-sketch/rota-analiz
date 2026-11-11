import { useState } from 'react';
import { useApp } from '../../state/store';
import type { ExportContext, ExportOptions, MapStyleChoice } from '../../export/common';
import { download, fileBase, tooShortToHide, visibleRange } from '../../export/common';
import { getSourceBytes } from '../../storage/repo';
import type { Selection } from '../../map/MapView';

type Format = 'pdf' | 'card-portrait' | 'card-square' | 'csv' | 'json' | 'gpx' | 'gpx-seg' | 'rota';

const FORMATS: { id: Format; title: string; sub: string }[] = [
  { id: 'pdf', title: 'Detaylı rapor (PDF)', sub: 'E-posta, arşiv, yazdırma · çok sayfa' },
  { id: 'card-portrait', title: 'Paylaşım kartı (PNG, dikey)', sub: 'WhatsApp, Instagram · 1080×1350' },
  { id: 'card-square', title: 'Paylaşım kartı (PNG, kare)', sub: '1080×1080' },
  { id: 'csv', title: 'Nokta verisi (CSV)', sub: 'Türkçe Excel uyumlu (; ayırıcı, ondalık virgül)' },
  { id: 'json', title: 'İşlenmiş veri (JSON)', sub: 'Tüm metrikler ve noktalar' },
  { id: 'gpx', title: 'Rota (GPX)', sub: 'Başka uygulamalarda açmak için · kırpılmış hali' },
  { id: 'gpx-seg', title: 'Seçili bölüm (GPX)', sub: 'Yalnızca seçtiğiniz A–B aralığı' },
  { id: 'rota', title: 'Paylaşım paketi (.rota)', sub: 'Arkadaşınız Rota Analiz’e içe aktarır' },
];

const STYLES: { id: MapStyleChoice; label: string }[] = [
  { id: 'light', label: 'Standart (açık)' },
  { id: 'dark', label: 'Standart (koyu)' },
  { id: 'satellite', label: 'Uydu' },
  { id: 'topo', label: 'Topografik' },
];

export function ExportDialog({ ctx, selection, onClose }: { ctx: ExportContext; selection: Selection | null; onClose(): void }) {
  const { prefs, setPrefs, toast, folderHandle, folderState } = useApp();
  const [format, setFormat] = useState<Format>('pdf');
  const [opt, setOpt] = useState<ExportOptions>({
    hideEnds: prefs.hideEndsInExports,
    hideMeters: 300,
    hideVehicle: false,
    includeNotes: false,
    mapStyle: 'light',
    sections: { map: true, profiles: true, grade: true, stops: true, segments: true, fuel: true, quality: true },
  });
  const [busy, setBusy] = useState<string | null>(null);
  const set = (p: Partial<ExportOptions>) => setOpt((o) => ({ ...o, ...p }));
  const sec = (k: keyof ExportOptions['sections'], v: boolean) => setOpt((o) => ({ ...o, sections: { ...o.sections, [k]: v } }));
  const hasSel = !!selection && selection.b != null;
  const isCard = format.startsWith('card');
  const usesMap = format === 'pdf' || isCard;
  const usesPrivacy = format !== 'gpx-seg';
  const short = tooShortToHide(ctx.result, opt.hideMeters);
  const base = fileBase(ctx.record);

  const run = async () => {
    setBusy('Hazırlanıyor…');
    try {
      if (opt.hideEnds !== prefs.hideEndsInExports) setPrefs({ hideEndsInExports: opt.hideEnds });
      if (format === 'pdf') {
        const { buildPdf } = await import('../../export/pdf');
        download(await buildPdf(ctx, opt, setBusy), `${base}_rapor.pdf`);
      } else if (isCard) {
        const { buildCard } = await import('../../export/card');
        download(await buildCard(ctx, opt, format === 'card-square' ? 'square' : 'portrait', setBusy), `${base}_kart.png`);
      } else {
        const d = await import('../../export/data');
        if (format === 'csv') download(d.buildCsv(ctx, opt), `${base}.csv`, 'text/csv;charset=utf-8');
        else if (format === 'json') download(d.buildJson(ctx, opt), `${base}.json`, 'application/json');
        else if (format === 'gpx') {
          const [a, b] = visibleRange(ctx.result, opt.hideEnds, opt.hideMeters);
          download(d.buildGpx(ctx, ctx.record.name, a, b), `${base}.gpx`, 'application/gpx+xml');
        } else if (format === 'gpx-seg' && selection?.b != null) {
          download(d.buildGpx(ctx, `${ctx.record.name} (bölüm)`, Math.min(selection.a, selection.b), Math.max(selection.a, selection.b)), `${base}_bolum.gpx`, 'application/gpx+xml');
        } else if (format === 'rota') {
          const bytes = await getSourceBytes(ctx.record, folderState === 'granted' ? folderHandle : undefined);
          download(await d.buildRotaPackage(ctx, opt, bytes), `${base}.rota`);
        }
      }
      toast('Dosya indirildi (İndirilenler klasörü)');
      onClose();
    } catch (e) {
      console.error(e);
      toast('Dışa aktarılamadı: ' + (e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const check = (label: string, v: boolean, on: (v: boolean) => void, hint?: string, disabled?: boolean) => (
    <label className={`flex items-start gap-2 text-[12px] ${disabled ? 'opacity-40' : ''}`}>
      <input type="checkbox" className="mt-0.5 accent-[#f0a03c]" checked={v} disabled={disabled} onChange={(e) => on(e.target.checked)} />
      <span>{label}{hint && <span className="block text-[10.5px] text-fg-faint">{hint}</span>}</span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-ink-950/75 pt-[6vh]" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="w-[min(820px,95vw)] rounded-[4px] border border-ink-600 bg-ink-850 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-700 px-4 py-2.5">
          <h2 className="text-[13px] font-semibold">Dışa aktar · {ctx.record.name}</h2>
          <button className="text-fg-faint hover:text-fg" onClick={onClose} disabled={!!busy}>×</button>
        </div>
        <div className="grid grid-cols-1 gap-0 md:grid-cols-[1fr_300px]">
          <div className="border-ink-700 p-3 md:border-r">
            <div className="ra-label mb-2">Biçim</div>
            <div className="space-y-1">
              {FORMATS.map((f) => {
                const disabled = f.id === 'gpx-seg' && !hasSel;
                return (
                  <label key={f.id} className={`flex cursor-pointer items-start gap-2.5 rounded-[3px] px-2.5 py-1.5 ${format === f.id ? 'bg-ink-700' : 'hover:bg-ink-800'} ${disabled ? 'pointer-events-none opacity-40' : ''}`}>
                    <input type="radio" name="fmt" className="mt-1 accent-[#f0a03c]" checked={format === f.id} onChange={() => setFormat(f.id)} disabled={disabled} />
                    <span>
                      <span className="block text-[12.5px] text-fg">{f.title}</span>
                      <span className="block text-[11px] text-fg-faint">{disabled ? 'Önce analiz ekranında bir bölüm seçin' : f.sub}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="space-y-4 p-3">
            {usesPrivacy && (
              <div>
                <div className="ra-label mb-2">Gizlilik</div>
                <div className="space-y-2">
                  {check('Başlangıç ve bitişi gizle', opt.hideEnds, (v) => set({ hideEnds: v }), short ? 'Rota çok kısa; gizleme uygulanamaz' : 'Ev/iş adresinizi korur. Koordinatlar ve yer adları da çıkarılır.')}
                  {opt.hideEnds && (
                    <label className="ml-6 flex items-center gap-2 text-[11.5px] text-fg-muted">
                      Gizlenecek mesafe
                      <select className="ra-input" value={opt.hideMeters} onChange={(e) => set({ hideMeters: +e.target.value })}>
                        {[200, 300, 500, 1000].map((m) => <option key={m} value={m}>{m} m</option>)}
                      </select>
                    </label>
                  )}
                  {ctx.activity === 'car' && check('Araç bilgisini gizle', opt.hideVehicle, (v) => set({ hideVehicle: v }))}
                  {check('Notları dahil et', opt.includeNotes, (v) => set({ includeNotes: v }), undefined, !ctx.record.notes.trim())}
                </div>
              </div>
            )}
            {usesMap && (
              <div>
                <div className="ra-label mb-2">Harita görünümü</div>
                <select className="ra-input w-full" value={opt.mapStyle} onChange={(e) => set({ mapStyle: e.target.value as MapStyleChoice })}>
                  {STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
            )}
            {format === 'pdf' && (
              <div>
                <div className="ra-label mb-2">Rapor bölümleri</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {check('Harita', opt.sections.map, (v) => sec('map', v))}
                  {check('Profiller', opt.sections.profiles, (v) => sec('profiles', v))}
                  {check('Eğim dağılımı', opt.sections.grade, (v) => sec('grade', v))}
                  {check('Duraklamalar', opt.sections.stops, (v) => sec('stops', v))}
                  {check('Bölümler', opt.sections.segments, (v) => sec('segments', v), undefined, !ctx.saved.length)}
                  {check('Yakıt', opt.sections.fuel, (v) => sec('fuel', v), undefined, ctx.activity !== 'car' || !ctx.record.fuel)}
                  {check('Veri kalitesi', opt.sections.quality, (v) => sec('quality', v))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-ink-700 px-4 py-2.5">
          <span className="text-[11.5px] text-fg-muted">{busy ?? 'Raporlarda kişisel ad yer almaz.'}</span>
          <div className="flex gap-2">
            <button className="ra-btn" onClick={onClose} disabled={!!busy}>Vazgeç</button>
            <button className="ra-btn-primary" onClick={run} disabled={!!busy || (format === 'gpx-seg' && !hasSel)}>{busy ? 'Hazırlanıyor…' : 'İndir'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
