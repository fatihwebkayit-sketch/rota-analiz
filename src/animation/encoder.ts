// MP4 dışa aktarma: kareler tek tek, karolar yüklendikten sonra çizilir (takılma olmaz),
// WebCodecs ile H.264 kodlanır ve mp4-muxer ile paketlenir. Hiçbir şey sunucuya gitmez.
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import type { AnimationRenderer } from './renderer';

export const webCodecsSupported = () => typeof window !== 'undefined' && 'VideoEncoder' in window && 'VideoFrame' in window;

async function pickCodec(width: number, height: number, fps: number, bitrate: number) {
  const candidates = ['avc1.640028', 'avc1.4D4028', 'avc1.42E028', 'avc1.640033', 'avc1.42001f'];
  for (const codec of candidates) {
    try {
      const r = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate, framerate: fps });
      if (r.supported) return codec;
    } catch {
      /* sıradaki */
    }
  }
  return null;
}

export interface ExportProgress { frame: number; total: number; etaSec: number | null }

export async function exportMp4(
  renderer: AnimationRenderer,
  opts: { width: number; height: number; fps: number; durationSec: number },
  onProgress: (p: ExportProgress) => void,
  signal: AbortSignal,
): Promise<Blob> {
  const { width, height, fps, durationSec } = opts;
  const total = Math.round(durationSec * fps);
  const bitrate = Math.round(width * height * fps * 0.12); // 1080p30 ≈ 7,5 Mbit/sn
  const codec = await pickCodec(width, height, fps, bitrate);
  if (!codec) throw new Error('Bu tarayıcı H.264 video kodlamayı desteklemiyor.');

  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width, height, frameRate: fps }, fastStart: 'in-memory' });
  let encError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encError = e as Error; },
  });
  encoder.configure({ codec, width, height, bitrate, framerate: fps, avc: { format: 'avc' } } as any);

  await renderer.whenReady();
  renderer.resetBearing();
  const started = performance.now();
  try {
    for (let f = 0; f < total; f++) {
      if (signal.aborted) throw new DOMException('İptal edildi', 'AbortError');
      if (encError) throw encError;
      await renderer.frame(total > 1 ? f / (total - 1) : 1, true);
      const vf = new VideoFrame(renderer.canvas, { timestamp: Math.round((f * 1e6) / fps), duration: Math.round(1e6 / fps) });
      encoder.encode(vf, { keyFrame: f % (fps * 2) === 0 });
      vf.close();
      while (encoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 5));
      const el = (performance.now() - started) / 1000;
      onProgress({ frame: f + 1, total, etaSec: f > 5 ? (el / (f + 1)) * (total - f - 1) : null });
    }
    await encoder.flush();
    if (encError) throw encError;
    muxer.finalize();
    return new Blob([muxer.target.buffer], { type: 'video/mp4' });
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
}
