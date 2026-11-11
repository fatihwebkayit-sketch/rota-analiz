import type { ActivityType } from '../core/types';

/** Etkinlik türüne göre sabit eşikler. Tür elle seçilir; eşikler için ayrı ayar ekranı yoktur. */
export interface ActivityProfile {
  stopSpeedKmh: number; // bunun altı "duruyor"
  gradeWindowM: number; // eğim hesap penceresi
  maxPlausibleKmh: number; // bunun üstü GPS sıçraması
  showPace: boolean;
  fuel: boolean;
}

export const PROFILES: Record<ActivityType, ActivityProfile> = {
  walk: { stopSpeedKmh: 1, gradeWindowM: 50, maxPlausibleKmh: 15, showPace: true, fuel: false },
  run: { stopSpeedKmh: 2, gradeWindowM: 50, maxPlausibleKmh: 30, showPace: true, fuel: false },
  bike: { stopSpeedKmh: 2, gradeWindowM: 100, maxPlausibleKmh: 90, showPace: false, fuel: false },
  car: { stopSpeedKmh: 3, gradeWindowM: 100, maxPlausibleKmh: 250, showPace: false, fuel: true },
};

/** Genel analiz ayarları (Bölüm 6). */
export const ANALYSIS = {
  stopRadiusM: 15,
  stopMinSec: 30,
  stopMinPointsNoTime: 10,
  gapSec: 60,
  ascentHysteresisM: 3,
  speedWindowSec: 5,
};
