import type { ActivityType } from '../core/types';
import { tr } from '../i18n/tr';

export const ACTIVITIES: ActivityType[] = ['car', 'moto', 'walk', 'run', 'bike'];

export function ActivityPicker({ value, onChange, compact }: { value: ActivityType | null; onChange(a: ActivityType): void; compact?: boolean }) {
  return (
    <div className={`inline-flex overflow-hidden rounded-[3px] border ${value == null && !compact ? 'border-amber/50' : 'border-ink-600'} bg-ink-850`} role="group" aria-label={tr.importer.chooseType}>
      {ACTIVITIES.map((a, i) => (
        <button
          key={a}
          type="button"
          aria-pressed={value === a}
          onClick={() => onChange(a)}
          className={`ra-seg ${i ? 'border-l border-ink-600' : ''} ${compact ? 'h-6 px-2 text-[11px]' : ''}`}
        >
          {tr.activity[a]}
        </button>
      ))}
    </div>
  );
}

export const ActivityBadge = ({ a }: { a: ActivityType }) => (
  <span className="inline-flex h-5 items-center rounded-[2px] border border-ink-600 px-1.5 text-[10.5px] uppercase tracking-[0.05em] text-fg-muted">
    {tr.activity[a]}
  </span>
);
