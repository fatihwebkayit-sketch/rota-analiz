import { create } from 'zustand';
import type { RouteRecord } from '../core/types';
import type { FolderState } from '../storage/folder';
import * as folder from '../storage/folder';
import * as repo from '../storage/repo';
import { requestPersistence } from '../storage/db';

export type View = 'archive' | 'analysis';
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

  init(): Promise<void>;
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

  async init() {
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
    try {
      h = await folder.pickFolder();
    } catch (e) {
      const err = e as Error;
      console.warn('Klasör seçimi hatası', err?.name, err?.message);
      if (err?.name === 'AbortError') get().toast(`Klasör seçilmedi (Chrome: “${err.message}”).`, 'error');
      else get().toast(`Klasör seçilemedi (${err?.name ?? 'hata'}): ${err?.message ?? err}`, 'error');
      return;
    }
    const st = await folder.folderState(h);
    set({ folderHandle: h, folderState: st });
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
      } else get().toast(`Düzenleme izni verilmedi (Chrome yanıtı: ${res}).`, 'error');
    } catch (e) {
      const err = e as Error;
      get().toast(`Düzenleme izni istenemedi (${err?.name}: ${err?.message}).`, 'error');
    }
  },

  async syncFolder(silent = false) {
    const h = get().folderHandle;
    if (!h || get().folderState !== 'granted') return;
    try {
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

  async deleteRecord(r) {
    const root = get().folderState === 'granted' ? get().folderHandle : undefined;
    await repo.softDelete(r, root);
    if (get().openId === r.id) set({ openId: null, view: 'archive' });
    await get().refresh();
    get().toast(`“${r.name}” çöp kutusuna taşındı (30 gün saklanır)`);
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
