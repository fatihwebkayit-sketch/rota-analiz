import { useApp } from '../state/store';

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded-[3px] border px-3 py-2 text-[12px] shadow-lg ${t.tone === 'error' ? 'border-down/50 bg-[#2a1715] text-[#f2b8b0]' : 'border-ink-600 bg-ink-800 text-fg'}`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
