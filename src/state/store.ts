import { create } from 'zustand';
import type { FuelPrice, RouteRecord, Vehicle } from '../core/types';
import * as settings from '../storage/settings';
import type { Prefs } from '../storage/settings';
import type { FolderState } from '../storage/folder';
import * as folder from '../storage/folder';
import * as repo from '../storage/repo';
import { requestPersistence } from '../storage/db';

export type View = 'archive' | 'analysis' | 'stats' | 'compare' | 'settings';
export type BaseLayer = 'dark' | 'light' | 'satellite' | 'topo';

interface Toast { id: number; text: string; tone?: 'info' | 'error' }

interface AppState {
  view: View;
  records: RouteRecord[];
  openId: string | null;
  folderState: FolderState;
  folderHandle?: FileSystemDirectoryHandle;
  folderSetupSeen: boolean;
  importFiles: File[] | null;
  baseLayer: BaseLayer;
  hillshade: boolean;
  terrain3d: boolean;
  toasts: Toast[];
  vehicles: Vehicle[];
  fuelPrices: FuelPrice[];
  prefs: Prefs;
  compareIds: string[];
  exportOpen: boolean;
  setExportOpen(v: boolean): void;

  init(): Promise<void>;
  saveVehicles(items: Vehicle[]): Promise<void>;
  addFuelPrice(p: FuelPrice): Promise<void>;
  setPrefs(p: Partial<Prefs>): Promise<void>;
  startCompare(ids: string[]): void;
  refresh(): Promise<void>;
  openRecord(id: string): void;
  setView(v: View): void;
  chooseFolder(): Promise<void>;
  grantFolder(): Promise<void>;
  syncFolder(silent?: boolean): Promise<void>;
  dismissFolderSetup(): void;
  startImport(files: File[]): void;
  endImport(): void;
  saveRecord(r: RouteRecord, bytes?: ArrayBuffer): Promise<RouteRecord>;
  deleteRecord(r: RouteRecord): Promise<void>;
  /** Kaydın en güncel halini okuyup yalnızca verilen alanları değiştirir */
  patchRecord(id: string, p: Partial<RouteRecord>): Promise<void>;
  setBaseLayer(l: BaseLayer): void;
  toggleHillshade(): void;
  toggleTerrain(): void;
  toast(text: string, tone?: Toast['tone']): void;
}

const pref = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem('ra.' + k);
    return v == null ? d : (JSON.parse(v) as T);
  } catch {
    return d;
  }
};
const savePref = (k: string, v: unknown) => {
  try {
    localStorage.setItem('ra.' + k, JSON.stringify(v));
  } catch {
    /* yok say */
  }
};

let toastSeq = 0;

export const useApp = create<AppState>((set, get) => ({
  view: 'archive',
  records: [],
  openId: null,
  folderState: 'none',
  folderSetupSeen: pref('folderSetupSeen', false),
  importFiles: null,
  baseLayer: pref<BaseLayer>('baseLayer', 'dark'),
  hillshade: pref('hillshade', false),
  terrain3d: false,
  toasts: [],
  vehicles: [],
  fuelPrices: [],
  prefs: settings.DEFAULT_PREFS,
  compareIds: [],
  exportOpen: false,
  setExportOpen(v) { set({ exportOpen: v }); },

  async init() {
    const local = await settings.loadLocal();
    set({ vehicles: local.vehicles.items, fuelPrices: local.fuelPrices.items, prefs: { ...settings.DEFAULT_PREFS, ...local.prefs.value } });
    requestPersistence();
    const h = await folder.loadHandle().catch(() => undefined);
    const st = await folder.folderState(h).catch(() => 'none' as FolderState);
    set({ folderHandle: h, folderState: st });
    await get().refresh();
    if (st === 'granted') await get().syncFolder(true);
    repo.purgeTrash(st === 'granted' ? h : undefined).catch(() => {});
    // Pencere odaklanınca başka bilgisayardan gelen değişiklikleri al
    window.addEventListener('focus', () => {
      if (get().folderState === 'granted') get().syncFolder(true);
    });
  },

  async refresh() {
    const all = await repo.listRecords();
    set({ records: all.filter((r) => !r.deletedAt) });
  },

  openRecord(id) {
    set({ openId: id, view: 'analysis' });
  },
  setView(v) {
    set({ view: v });
  },

  async chooseFolder() {
    let h: FileSystemDirectoryHandle;
    const old = get().folderHandle;
    const oldGranted = get().folderState === 'granted';
    try {
      h = await folder.pickFolder();
    } catch (e) {
      const err = e as Error;
      console.warn('Klasör seçimi hatası', err?.name, err?.message);
      if (err?.name === 'AbortError') get().toast(`Klasör seçilmedi (tarayıcı yanıtı: “${err.message}”).`, 'error');
      else get().toast(`Klasör seçilemedi (${err?.name ?? 'hata'}): ${err?.message ?? err}`, 'error');
      return;
    }
    // Klasör değişiyorsa mevcut kayıtlar yeni klasöre kopyalanır (eski klasör olduğu gibi kalır)
    if (old && !(await (old as any).isSameEntry?.(h).catch(() => false))) {
      await repo.prepareFolderChange(oldGranted ? old : undefined);
    }
    const st = await folder.folderState(h);
    set({ folderHandle: h, folderState: st });
    if (st === 'prompt' && get().folderSetupSeen) get().toast('Yeni klasör seçildi. Kaydetme izni için sağ üstteki turuncu “Klasör erişimini yenile” düğmesine basın.');
    if (st === 'granted') {
      set({ folderSetupSeen: true });
      savePref('folderSetupSeen', true);
      await get().syncFolder();
    }
    // 'prompt' ise FolderSetup ikinci adımı (düzenleme izni) gösterir
  },

  async grantFolder() {
    const h = get().folderHandle;
    if (!h) return;
    try {
      const res = await folder.requestAccess(h);
      if (res === 'granted') {
        set({ folderState: 'granted', folderSetupSeen: true });
        savePref('folderSetupSeen', true);
        await get().syncFolder();
        get().toast(`Veri klasörü bağlandı: ${h.name}`);
      } else get().toast(`Düzenleme izni verilmedi (tarayıcı yanıtı: ${res}).`, 'error');
    } catch (e) {
      const err = e as Error;
      get().toast(`Düzenleme izni istenemedi (${err?.name}: ${err?.message}).`, 'error');
    }
  },

  async syncFolder(silent = false) {
    const h = get().folderHandle;
    if (!h || get().folderState !== 'granted') return;
    try {
      const st = await settings.syncSettings(h);
      set({ vehicles: st.vehicles.items, fuelPrices: st.fuelPrices.items, prefs: { ...settings.DEFAULT_PREFS, ...st.prefs.value } });
      const { added } = await repo.syncWithFolder(h);
      await get().refresh();
      if (added && !silent) get().toast(`Klasörden ${added} yeni kayıt alındı`);
      else if (added) get().toast(`Diğer bilgisayardan ${added} yeni kayıt geldi`);
    } catch (e) {
      get().toast('Klasör okunamadı: ' + (e as Error).message, 'error');
    }
  },

  dismissFolderSetup() {
    set({ folderSetupSeen: true });
    savePref('folderSetupSeen', true);
  },

  startImport(files) {
    set({ importFiles: files });
  },
  endImport() {
    set({ importFiles: null });
  },

  async saveRecord(r, bytes) {
    const root = get().folderState === 'granted' ? get().folderHandle : undefined;
    const rec = bytes ? await repo.putRecord(r, bytes, root) : await repo.updateRecord(r, root);
    await get().refresh();
    return rec;
  },

  async patchRecord(id, p) {
    const r = get().records.find((x) => x.id === id);
    if (!r) return;
    await get().saveRecord({ ...r, ...p });
  },

  async deleteRecord(r) {
    const root = get().folderState === 'granted' ? get().folderHandle : undefined;
    await repo.softDelete(r, root);
    if (get().openId === r.id) set({ openId: null, view: 'archive' });
    await get().refresh();
    get().toast(`“${r.name}” çöp kutusuna taşındı (30 gün saklanır)`);
  },

  async saveVehicles(items) {
    // Tek varsayılan araç
    set({ vehicles: items });
    await settings.saveKey('vehicles', { updatedAt: Date.now(), items }, get().folderState === 'granted' ? get().folderHandle : undefined);
  },
  async addFuelPrice(p) {
    const items = [...get().fuelPrices, p].sort((a, b) => b.date - a.date).slice(0, 200);
    set({ fuelPrices: items });
    await settings.saveKey('fuelPrices', { updatedAt: Date.now(), items }, get().folderState === 'granted' ? get().folderHandle : undefined);
  },
  async setPrefs(p) {
    const value = { ...get().prefs, ...p };
    set({ prefs: value });
    await settings.saveKey('prefs', { updatedAt: Date.now(), value }, get().folderState === 'granted' ? get().folderHandle : undefined);
  },
  startCompare(ids) {
    set({ compareIds: ids, view: 'compare' });
  },

  setBaseLayer(l) {
    set({ baseLayer: l });
    savePref('baseLayer', l);
  },
  toggleHillshade() {
    const v = !get().hillshade;
    set({ hillshade: v });
    savePref('hillshade', v);
  },
  toggleTerrain() {
    set({ terrain3d: !get().terrain3d });
  },

  toast(text, tone = 'info') {
    const id = ++toastSeq;
    set({ toasts: [...get().toasts, { id, text, tone }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), tone === 'error' ? 12000 : 4500);
  },
}));
