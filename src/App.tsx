import { useEffect, useState } from 'react';
import { useApp } from './state/store';
import { TopBar } from './features/TopBar';
import { ArchiveView } from './features/archive/ArchiveView';
import { AnalysisView } from './features/analysis/AnalysisView';
import { StatsView } from './features/stats/StatsView';
import { SettingsView } from './features/settings/SettingsView';
import { CompareView } from './features/compare/CompareView';
import { ImportDialog } from './features/importer/ImportDialog';
import { FolderSetup } from './features/settings/FolderSetup';
import { Toasts } from './ui/Toasts';
import { tr } from './i18n/tr';

export function App() {
  const { init, view, importFiles, startImport } = useApp();
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    init();
    // Masaüstü uygulaması olarak "Birlikte aç" ile gelen dosyalar
    const lq = (window as any).launchQueue;
    lq?.setConsumer?.(async (p: any) => {
      if (!p.files?.length) return;
      const files = await Promise.all(p.files.map((h: FileSystemFileHandle) => h.getFile()));
      startImport(files);
    });
  }, []);

  // Pencerenin herhangi bir yerine dosya bırakma
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
    const enter = (e: DragEvent) => { if (hasFiles(e)) { depth++; setDragging(true); } };
    const leave = (e: DragEvent) => { if (hasFiles(e) && --depth <= 0) { depth = 0; setDragging(false); } };
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length) startImport(files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [startImport]);

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <main className="relative min-h-0 flex-1">
        {view === 'archive' && <ArchiveView />}
        {view === 'analysis' && <AnalysisView />}
        {view === 'stats' && <StatsView />}
        {view === 'settings' && <SettingsView />}
        {view === 'compare' && <CompareView />}
      </main>
      {importFiles && <ImportDialog />}
      <FolderSetup />
      <Toasts />
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70">
          <div className="rounded-[4px] border border-dashed border-amber/70 bg-ink-900/90 px-10 py-8 text-center">
            <div className="text-[15px] text-fg">{tr.importer.drop}</div>
            <div className="mt-1 text-[12px] text-fg-muted">Bırakınca içe aktarma penceresi açılır</div>
          </div>
        </div>
      )}
    </div>
  );
}
