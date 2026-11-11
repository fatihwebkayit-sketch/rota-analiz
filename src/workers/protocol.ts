import type { ActivityType, FlatRoute, ParsedFile, RouteMetrics, Stop } from '../core/types';

export type WorkerRequest =
  | { kind: 'parse'; reqId: number; fileName: string; buf: ArrayBuffer }
  | { kind: 'analyze'; reqId: number; parsed: ParsedFile; activity: ActivityType; autoTrim: boolean };

export interface AnalysisResult {
  route: FlatRoute;
  cum: Float64Array;
  speedKmh: Float64Array;
  lowConf: Uint8Array;
  spike: Uint8Array;
  stops: Stop[];
  metrics: RouteMetrics;
  preview: [number, number][];
}

export type WorkerResponse =
  | { kind: 'parsed'; reqId: number; parsed: ParsedFile; sha256: string; size: number }
  | { kind: 'analyzed'; reqId: number; result: AnalysisResult }
  | { kind: 'error'; reqId: number; message: string };
