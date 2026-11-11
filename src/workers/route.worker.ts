/// <reference lib="webworker" />
// Büyük dosyaların ayrıştırılması ve analizi arayüzü dondurmadan burada yapılır.
import { parseFile } from '../parsers';
import { analyze, previewLine } from '../analysis/analyze';
import type { WorkerRequest, WorkerResponse } from './protocol';

const post = (m: WorkerResponse, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

async function sha256(buf: ArrayBuffer) {
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  try {
    if (msg.kind === 'parse') {
      const [parsed, hash] = await Promise.all([parseFile(msg.fileName, msg.buf), sha256(msg.buf)]);
      post({ kind: 'parsed', reqId: msg.reqId, parsed, sha256: hash, size: msg.buf.byteLength });
    } else {
      const { route, derived, metrics } = analyze(msg.parsed, msg.activity, msg.autoTrim);
      const result = {
        route,
        cum: derived.cum,
        speedKmh: derived.speedKmh,
        lowConf: derived.lowConf,
        spike: derived.spike,
        inStop: derived.inStop,
        stops: derived.stops,
        metrics,
        preview: previewLine(route, metrics.trim.startIdx, metrics.trim.endIdx),
      };
      post({ kind: 'analyzed', reqId: msg.reqId, result }, [
        route.lat.buffer, route.lon.buffer, route.ele.buffer, route.time.buffer, route.sat.buffer,
        derived.cum.buffer, derived.speedKmh.buffer, derived.lowConf.buffer, derived.spike.buffer, derived.inStop.buffer,
      ]);
    }
  } catch (e) {
    post({ kind: 'error', reqId: msg.reqId, message: e instanceof Error ? e.message : String(e) });
  }
};
