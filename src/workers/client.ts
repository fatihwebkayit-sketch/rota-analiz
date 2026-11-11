import type { ActivityType, ParsedFile } from '../core/types';
import type { AnalysisResult, WorkerRequest, WorkerResponse } from './protocol';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./route.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const m = ev.data;
      const p = pending.get(m.reqId);
      if (!p) return;
      pending.delete(m.reqId);
      if (m.kind === 'error') p.reject(new Error(m.message));
      else p.resolve(m);
    };
  }
  return worker;
}

type DistOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;
function call<T>(req: DistOmit<WorkerRequest, 'reqId'>, transfer: Transferable[] = []): Promise<T> {
  const reqId = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(reqId, { resolve, reject });
    getWorker().postMessage({ ...req, reqId } as WorkerRequest, transfer);
  });
}

export async function parseInWorker(fileName: string, buf: ArrayBuffer) {
  const copy = buf.slice(0); // orijinal bayt dizisi kayıt için korunur
  const r = await call<Extract<WorkerResponse, { kind: 'parsed' }>>({ kind: 'parse', fileName, buf: copy }, [copy]);
  return { parsed: r.parsed, sha256: r.sha256, size: r.size };
}

export async function analyzeInWorker(parsed: ParsedFile, activity: ActivityType, autoTrim: boolean): Promise<AnalysisResult> {
  const r = await call<Extract<WorkerResponse, { kind: 'analyzed' }>>({ kind: 'analyze', parsed, activity, autoTrim });
  return r.result;
}
