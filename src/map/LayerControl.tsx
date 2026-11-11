import { useState } from 'react';
import { useApp, type BaseLayer } from '../state/store';
import { tr } from '../i18n/tr';

const BASES: { id: BaseLayer; label: string }[] = [
  { id: 'dark', label: tr.layers.dark },
  { id: 'light', label: tr.layers.light },
  { id: 'satellite', label: tr.layers.satellite },
  { id: 'topo', label: tr.layers.topo },
];

export function LayerControl() {
  const { baseLayer, setBaseLayer, hillshade, toggleHillshade, terrain3d, toggleTerrain } = useApp();
  const [open, setOpen] = useState(false);
  const current = BASES.find((b) => b.id === baseLayer)?.label;
  return (
    <div className="absolute left-3 top-3 z-10 w-[230px] rounded-[3px] border border-ink-600 bg-ink-900/95 text-[12px] shadow-lg backdrop-blur-sm">
      <button className="flex w-full items-center justify-between px-2.5 py-1.5" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="ra-label">{tr.layers.title}</span>
        <span className="flex items-center gap-1 whitespace-nowrap text-fg">{current}<span className="text-fg-faint">{open ? '▴' : '▾'}</span></span>
      </button>
      {open && (
        <div className="border-t border-ink-700 py-1">
          {BASES.map((b) => (
            <button key={b.id} onClick={() => setBaseLayer(b.id)} className={`flex w-full items-center gap-2 px-2.5 py-1 text-left hover:bg-ink-800 ${baseLayer === b.id ? 'text-fg' : 'text-fg-muted'}`}>
              <span className={`h-2 w-2 rounded-full border ${baseLayer === b.id ? 'border-amber bg-amber' : 'border-ink-500'}`} />
              {b.label}
            </button>
          ))}
          <div className="mx-2.5 my-1 border-t border-ink-700" />
          <label className="flex cursor-pointer items-center gap-2 px-2.5 py-1 text-fg-muted hover:text-fg">
            <input type="checkbox" checked={hillshade} onChange={toggleHillshade} className="accent-[#f0a03c]" />
            {tr.layers.hillshade}
          </label>
          <label className="flex cursor-pointer items-center gap-2 px-2.5 py-1 text-fg-muted hover:text-fg">
            <input type="checkbox" checked={terrain3d} onChange={toggleTerrain} className="accent-[#f0a03c]" />
            3B arazi
          </label>
        </div>
      )}
    </div>
  );
}
