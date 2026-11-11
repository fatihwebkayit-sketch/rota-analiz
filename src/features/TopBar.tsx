import { useRef } from 'react';
import { useApp } from '../state/store';
import { tr } from '../i18n/tr';

export function TopBar() {
  const { view, setView, openId, startImport, folderState, folderHandle, grantFolder, chooseFolder, syncFolder } = useApp();
  const input = useRef<HTMLInputElement>(null);

  return (
    <header className="flex h-10 shrink-0 items-center gap-4 border-b border-ink-700 bg-ink-950 px-3">
      <div className="flex items-center gap-2">
        <img src="./icon.svg" alt="" className="h-5 w-5" />
        <span className="text-[13px] font-semibold tracking-tight text-fg">{tr.app.name}</span>
      </div>
      <nav className="flex h-full items-stretch">
        {(['archive', 'analysis'] as const).map((v) => (
          <button
            key={v}
            disabled={v === 'analysis' && !openId}
            onClick={() => setView(v)}
            className={`relative px-3 text-[12px] transition-colors disabled:opacity-30 ${view === v ? 'text-fg' : 'text-fg-muted hover:text-fg'}`}
          >
            {tr.nav[v]}
            {view === v && <span className="absolute inset-x-3 bottom-0 h-[2px] bg-amber" />}
          </button>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <FolderBadge
          state={folderState}
          name={folderHandle?.name}
          onGrant={grantFolder}
          onChoose={chooseFolder}
          onRescan={() => syncFolder()}
        />
        <input
          ref={input}
          type="file"
          multiple
          accept=".gpx,.kml,.kmz,.geojson,.json,.tcx,.fit"
          className="hidden"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            if (files.length) startImport(files);
          }}
        />
        <button className="ra-btn-primary" onClick={() => input.current?.click()}>
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 11V2M4.5 5.5 8 2l3.5 3.5M2.5 10.5v3h11v-3" /></svg>
          {tr.actions.import}
        </button>
      </div>
    </header>
  );
}

function FolderBadge(props: { state: string; name?: string; onGrant(): void; onChoose(): void; onRescan(): void }) {
  const { state, name } = props;
  if (state === 'granted')
    return (
      <button onClick={props.onRescan} title={`${tr.actions.rescan}`} className="flex h-7 items-center gap-1.5 px-2 text-[11.5px] text-fg-muted hover:text-fg">
        <span className="h-1.5 w-1.5 rounded-full bg-up" />
        {tr.folder.connected}: <span className="max-w-[160px] truncate text-fg">{name}</span>
      </button>
    );
  if (state === 'prompt')
    return (
      <button onClick={props.onGrant} className="flex h-7 items-center gap-1.5 rounded-[3px] border border-amber/40 px-2 text-[11.5px] text-amber hover:bg-amber-soft">
        <span className="h-1.5 w-1.5 rounded-full bg-amber" />
        {tr.actions.grantAccess}
      </button>
    );
  if (state === 'none')
    return (
      <button onClick={props.onChoose} className="flex h-7 items-center gap-1.5 px-2 text-[11.5px] text-fg-muted hover:text-fg" title={tr.folder.notConnected}>
        <span className="h-1.5 w-1.5 rounded-full bg-fg-faint" />
        {tr.actions.chooseFolder}
      </button>
    );
  return (
    <span className="flex h-7 items-center gap-1.5 px-2 text-[11.5px] text-fg-faint" title={tr.folder.unsupported}>
      <span className="h-1.5 w-1.5 rounded-full bg-fg-faint" />
      Tarayıcıda saklanıyor
    </span>
  );
}
