import { useEffect, useRef, useState } from 'react';
import type { ExportContext, MapStyleChoice } from '../../export/common';
import { download, fileBase, tooShortToHide, visibleRange } from '../../export/common';
import { AnimationRenderer, type CameraMode } from '../../animation/renderer';
import { exportMp4, webCodecsSupported, type ExportProgress } from '../../animation/encoder';
import { useApp } from '../../state/store';
import { fmtDuration } from '../../core/format';

type Shape = '16:9' | '9:16' | '1:1';
const SIZES: Record<Shape, Record<1080 | 720, [number, number]>> = {
  '16:9': { 1080: [1920, 1080], 720: [1280, 720] },
  '9:16': { 1080: [1080, 1920], 720: [720, 1280] },
  '1:1': { 1080: [1080, 1080], 720: [720, 720] },
};
const FPS = 30;

export function AnimationStudio({ ctx, onClose }: { ctx: ExportContext; onClose(): void }) {
  const { prefs, toast } = useApp();
  const [shape, setShape] = useState<Shape>('16:9');
  const [res, setRes] = useState<1080 | 720>(1080);
  const [duration, setDuration] = useState(30);
  const [camera, setCamera] = useState<CameraMode>('follow');
  const [style, setStyle] = useState<MapStyleChoice>(ctx.activity === 'walk' || ctx.activity === 'run' || ctx.activity === 'bike' ? 'topo' : 'dark');
  const [hideEnds, setHideEnds] = useState(prefs.hideEndsInExports);
  const [compress, setCompress] = useState(true);
  const [zoomOffset, setZoomOffset] = useState(0);
  const [showClock, setShowClock] = useState(true);
  const [p, setP] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const abort = useRef<AbortController | null>(null);
  const renderer = useRef<AnimationRenderer | null>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [W, H] = SIZES[shape][res];
  const supported = webCodecsSupported();
  const short = tooShortToHide(ctx.result, 300);

  // Çiziciyi kur (format, çözünürlük, harita veya gizlilik değişince yeniden)
  useEffect(() => {
    setReady(false);
    setPlaying(false);
    const range = visibleRange(ctx.result, hideEnds, 300);
    const r = new AnimationRenderer({ rec: ctx.record, res: ctx.result, grade: ctx.grade, activity: ctx.activity, range, showEnds: !hideEnds || short, width: W, height: H, style, compressStops: compress });
    r.camera = camera;
    r.zoomOffset = zoomOffset;
    r.showClock = showClock;
    renderer.current = r;
    const c = r.canvas;
    c.style.cssText = 'max-width:100%;max-height:100%;width:auto;height:auto;display:block;border-radius:3px;background:#0e0f10';
    holder.current?.replaceChildren(c);
    r.whenReady().then(() => r.frame(p, false).then(() => setReady(true)));
    return () => r.destroy();
  }, [shape, res, style, hideEnds, compress]);

  // Canlı ayarlar
  useEffect(() => {
    const r = renderer.current;
    if (!r) return;
    r.camera = camera;
    r.zoomOffset = zoomOffset;
    r.showClock = showClock;
    if (!playing) r.frame(p, false, 1);
  }, [camera, zoomOffset, showClock]);

  // Kaydırma
  useEffect(() => {
    if (!playing && ready) renderer.current?.frame(p, false, 1);
  }, [p]);

  // Oynatma döngüsü (gerçek video hızında)
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now(), cur = p >= 1 ? 0 : p, busy = false, alive = true;
    const tick = async (now: number) => {
      if (!alive) return;
      const dt = (now - last) / 1000;
      last = now;
      cur = Math.min(1, cur + dt / duration);
      if (!busy) {
        busy = true;
        await renderer.current?.frame(cur, false);
        busy = false;
        setP(cur);
      }
      if (cur >= 1) { setPlaying(false); return; }
      raf = requestAnimationFrame(tick);
    };
    renderer.current?.resetBearing();
    raf = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [playing]);

  const doExport = async () => {
    const r = renderer.current;
    if (!r) return;
    setPlaying(false);
    abort.current = new AbortController();
    setProgress({ frame: 0, total: Math.round(duration * FPS), etaSec: null });
    try {
      const blob = await exportMp4(r, { width: W, height: H, fps: FPS, durationSec: duration }, setProgress, abort.current.signal);
      download(blob, `${fileBase(ctx.record)}_${shape.replace(':', 'x')}.mp4`);
      toast('Video indirildi (İndirilenler klasörü)');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast('Video oluşturulamadı: ' + (e as Error).message, 'error');
      else toast('Video oluşturma iptal edildi');
    } finally {
      setProgress(null);
      abort.current = null;
    }
  };

  const seg = <T extends string | number>(value: T, options: [T, string][], on: (v: T) => void, disabled = false) => (
    <div className={`inline-flex overflow-hidden rounded-[3px] border border-ink-600 ${disabled ? 'opacity-40' : ''}`}>
      {options.map(([v, l], i) => (
        <button key={String(v)} disabled={disabled} className={`ra-seg h-7 px-2.5 text-[11.5px] ${i ? 'border-l border-ink-600' : ''}`} aria-pressed={value === v} onClick={() => on(v)}>{l}</button>
      ))}
    </div>
  );
  const exporting = !!progress;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink-950">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-ink-700 px-4">
        <div className="text-[13px] font-semibold">Animasyon · {ctx.record.name}</div>
        <button className="ra-btn" onClick={() => { abort.current?.abort(); onClose(); }}>Kapat</button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={holder} className="flex min-h-0 flex-1 items-center justify-center p-4" />
          <div className="flex items-center gap-3 border-t border-ink-700 px-4 py-2.5">
            <button className="ra-btn-primary w-[86px] justify-center" disabled={!ready || exporting} onClick={() => setPlaying((v) => !v)}>
              {playing ? 'Duraklat' : p >= 1 ? 'Baştan' : 'Oynat'}
            </button>
            <input type="range" min={0} max={1000} value={Math.round(p * 1000)} disabled={exporting} onChange={(e) => { setPlaying(false); setP(+e.target.value / 1000); }} className="flex-1 accent-[#f0a03c]" />
            <span className="w-[92px] text-right text-[11.5px] text-fg-muted tnum">{fmtDuration(p * duration, true)} / {fmtDuration(duration, true)}</span>
          </div>
        </div>

        <aside className="w-[320px] shrink-0 space-y-4 overflow-y-auto border-l border-ink-700 bg-ink-850 p-4 text-[12px]">
          <div>
            <div className="ra-label mb-1.5">Format</div>
            {seg(shape, [['16:9', '16:9 yatay'], ['9:16', '9:16 dikey'], ['1:1', '1:1 kare']], setShape, exporting)}
            <p className="mt-1 text-[10.5px] text-fg-faint">{shape === '16:9' ? 'Bilgisayar, YouTube' : shape === '9:16' ? 'WhatsApp durum, Instagram Reels' : 'Instagram gönderi'}</p>
          </div>
          <div>
            <div className="ra-label mb-1.5">Çözünürlük</div>
            {seg(res, [[1080, '1080p'], [720, '720p']], setRes, exporting)}
            <span className="ml-2 text-[10.5px] text-fg-faint tnum">{W}×{H}</span>
          </div>
          <div>
            <div className="ra-label mb-1.5">Video süresi</div>
            <div className="flex items-center gap-2">
              {seg(duration, [[15, '15 sn'], [30, '30 sn'], [60, '60 sn']], setDuration, exporting)}
              <input type="number" min={5} max={300} className="ra-input w-[64px] tnum" value={duration} disabled={exporting} onChange={(e) => setDuration(Math.min(300, Math.max(5, +e.target.value || 30)))} />
            </div>
            <label className="mt-2 flex items-start gap-2">
              <input type="checkbox" className="mt-0.5 accent-[#f0a03c]" checked={compress} disabled={exporting} onChange={(e) => setCompress(e.target.checked)} />
              <span>Duraklamaları kısalt<span className="block text-[10.5px] text-fg-faint">Trafik ışığı, mola gibi beklemeler videoda yer kaplamaz</span></span>
            </label>
          </div>
          <div>
            <div className="ra-label mb-1.5">Kamera</div>
            {seg(camera, [['follow', 'Takip'], ['follow3d', '3B eğik'], ['overview', 'Tüm rota']], setCamera, exporting)}
            {camera !== 'overview' && (
              <label className="mt-2 flex items-center gap-2 text-fg-muted">
                Yakınlık
                <input type="range" min={-3} max={3} step={0.5} value={zoomOffset} disabled={exporting} onChange={(e) => setZoomOffset(+e.target.value)} className="flex-1 accent-[#f0a03c]" />
              </label>
            )}
          </div>
          <div>
            <div className="ra-label mb-1.5">Harita</div>
            <select className="ra-input w-full" value={style} disabled={exporting} onChange={(e) => setStyle(e.target.value as MapStyleChoice)}>
              <option value="dark">Standart (koyu)</option>
              <option value="light">Standart (açık)</option>
              <option value="satellite">Uydu</option>
              <option value="topo">Topografik</option>
            </select>
          </div>
          <div className="space-y-2">
            <div className="ra-label">Gösterge ve gizlilik</div>
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-[#f0a03c]" checked={showClock} disabled={exporting} onChange={(e) => setShowClock(e.target.checked)} /> Gerçek saati göster</label>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-0.5 accent-[#f0a03c]" checked={hideEnds} disabled={exporting || short} onChange={(e) => setHideEnds(e.target.checked)} />
              <span>Başlangıç ve bitişi gizle (300 m)<span className="block text-[10.5px] text-fg-faint">{short ? 'Rota çok kısa; gizleme uygulanamaz' : 'Ev/iş adresiniz videoda görünmez'}</span></span>
            </label>
          </div>

          <div className="border-t border-ink-700 pt-4">
            {!supported ? (
              <p className="text-[11.5px] text-amber">Bu tarayıcı video kodlamayı desteklemiyor. Edge veya Chrome'un güncel sürümünü kullanın.</p>
            ) : exporting ? (
              <div>
                <div className="mb-1 flex justify-between text-[11.5px] text-fg-muted tnum">
                  <span>Kare {progress!.frame} / {progress!.total}</span>
                  <span>{progress!.etaSec != null ? `~${fmtDuration(progress!.etaSec)} kaldı` : 'Başlıyor…'}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded bg-ink-700"><div className="h-full bg-amber" style={{ width: `${(progress!.frame / progress!.total) * 100}%` }} /></div>
                <button className="ra-btn mt-3 w-full justify-center" onClick={() => abort.current?.abort()}>İptal</button>
                <p className="mt-2 text-[10.5px] text-fg-faint">Her kare harita tamamen yüklendikten sonra çizilir; pencereyi küçültmeyin.</p>
              </div>
            ) : (
              <>
                <button className="ra-btn-primary w-full justify-center" disabled={!ready} onClick={doExport}>MP4 olarak dışa aktar</button>
                <p className="mt-2 text-[10.5px] leading-snug text-fg-faint">{Math.round(duration * FPS)} kare, 30 kare/sn. Video bilgisayarınızda oluşturulur, hiçbir yere yüklenmez. Ses içermez.</p>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
