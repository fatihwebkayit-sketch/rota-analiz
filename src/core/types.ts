// Rota Analiz — temel veri modeli

export type ActivityType = 'car' | 'moto' | 'walk' | 'run' | 'bike';
export type SourceFormat = 'gpx' | 'kml' | 'kmz' | 'geojson' | 'tcx' | 'fit';

/** Ayrıştırıcıdan çıkan tek bir iz parçası. Eksik değerler null kalır, asla uydurulmaz. */
export interface SegmentData {
  lat: number[];
  lon: number[];
  ele: (number | null)[];
  time: (number | null)[]; // epoch ms (UTC)
  sat: (number | null)[];
}

export interface TrackData {
  name?: string;
  segments: SegmentData[];
}

export interface Waypoint {
  lat: number;
  lon: number;
  ele: number | null;
  time: number | null;
  name?: string;
  desc?: string;
}

/** Kaynak uygulamanın dosyaya yazdığı kendi istatistikleri (ör. GPS Logger yorum satırları). */
export interface SourceAppStats {
  distanceKm?: number;
  totalDuration?: string;
  movingDuration?: string;
  maxSpeedKmh?: number;
  activity?: string;
}

export interface ParsedFile {
  fileName: string;
  format: SourceFormat;
  creator?: string;
  name?: string; // önerilen kayıt adı
  description?: string;
  keywords?: string;
  tracks: TrackData[];
  waypoints: Waypoint[];
  sourceStats?: SourceAppStats;
  warnings: string[];
}

/** Analiz için düzleştirilmiş rota. segStart: her iz parçasının başladığı indeks. */
export interface FlatRoute {
  lat: Float64Array;
  lon: Float64Array;
  ele: Float64Array; // NaN = rakım yok
  time: Float64Array; // NaN = zaman yok
  sat: Int16Array; // -1 = bilgi yok
  segStart: number[];
  hasSat: boolean;
  hasTime: boolean;
  hasEle: boolean;
}

export interface Stop {
  startIdx: number;
  endIdx: number;
  durationSec: number | null;
  lat: number;
  lon: number;
}

export interface TrimInfo {
  startIdx: number;
  endIdx: number;
  trimmedStartPts: number;
  trimmedEndPts: number;
  trimmedStartSec: number | null;
  trimmedEndSec: number | null;
}

export interface QualityReport {
  pointCount: number;
  segmentCount: number;
  medianIntervalSec: number | null;
  noTimePct: number;
  noElePct: number;
  spikeCount: number;
  noSatMovingCount: number;
  gapCount: number;
  backwardTimeCount: number;
  notes: string[];
}

export interface RouteMetrics {
  distanceM: number;
  elapsedSec: number | null;
  movingSec: number | null;
  avgSpeedKmh: number | null; // hareket süresine göre
  maxSpeedKmh: number | null;
  minEle: number | null;
  maxEle: number | null;
  startEle: number | null;
  endEle: number | null;
  ascentM: number | null;
  descentM: number | null;
  startTime: number | null;
  endTime: number | null;
  start: [number, number] | null; // [lon, lat]
  end: [number, number] | null;
  bbox: [number, number, number, number] | null; // minLon, minLat, maxLon, maxLat
  stopCount: number;
  trim: TrimInfo;
  quality: QualityReport;
}

export type FuelType = 'benzin' | 'motorin' | 'lpg' | 'hibrit' | 'elektrik';
export type Currency = 'TRY' | 'EUR' | 'USD';

export interface Vehicle {
  id: string;
  kind?: 'car' | 'moto'; // yoksa otomobil
  nickname: string;
  brand: string;
  model: string;
  year?: number;
  fuel: FuelType;
  avg: number; // L/100 km (elektrikte kWh/100 km)
  city?: number;
  highway?: number;
  tank?: number; // L veya kWh
  note?: string;
  isDefault?: boolean;
  archived?: boolean;
}

export interface FuelPrice {
  fuel: FuelType;
  price: number; // birim fiyat (L veya kWh)
  currency: Currency;
  date: number;
}

export interface ExtraCost { label: string; amount: number }

/** Bir araç rotasının yakıt/masraf varsayımları (hesap anındaki değerlerin anlık görüntüsü). */
export interface RouteFuel {
  vehicleId?: string;
  vehicleLabel?: string;
  fuel: FuelType;
  consumption: number; // L/100 km veya kWh/100 km
  price: number;
  currency: Currency;
  roundTrip: boolean;
  persons: number;
  extras: ExtraCost[];
  /** Fiyatın geçerli olduğu tarih (rota tarihiyle karşılaştırmak için) ve kaynağı */
  priceDate?: number;
  priceSource?: 'history' | 'manual';
  totalCost?: number; // istatistikler için hesaplanmış toplam
  computedAt?: number;
}

export interface SavedSegment {
  id: string;
  name: string;
  a: number; // ham nokta indeksi (ham veri değişmediği için kalıcıdır)
  b: number;
}

export interface RouteRecord {
  id: string;
  schemaVersion: 1;
  name: string;
  activity: ActivityType;
  createdAt: number;
  updatedAt: number;
  startPlace: string;
  endPlace: string;
  tags: string[];
  notes: string;
  vehicleId?: string;
  source: {
    fileName: string;
    format: SourceFormat;
    sha256: string;
    size: number;
    creator?: string;
    stats?: SourceAppStats;
  };
  autoTrim: boolean;
  segments?: SavedSegment[];
  fuel?: RouteFuel;
  metrics: RouteMetrics;
  preview: [number, number][]; // basitleştirilmiş [lon, lat] dizisi (liste küçük haritası)
  folderName?: string;
  deletedAt?: number; // çöp kutusu (30 gün)
}
