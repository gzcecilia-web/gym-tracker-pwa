import type { ReactNode } from 'react';
import { Input } from '@/components/ui';

export function ExerciseAccordion({
  title,
  meta,
  open,
  onToggle,
  complete,
  children
}: {
  title: string;
  meta: string;
  open: boolean;
  onToggle: () => void;
  complete?: boolean;
  children: ReactNode;
}) {
  const supersetParts = title.includes('+')
    ? title
        .split('+')
        .map((part) => part.trim())
        .filter(Boolean)
    : [];
  const isSuperset = supersetParts.length >= 2;

  return (
    <section className={`rounded-r-lg border bg-surface p-4 shadow-card transition-all duration-200 ease-out ${complete ? 'border-accent/30' : 'border-line'}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 rounded-r-sm text-left transition-all duration-200 ease-out hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 active:scale-[0.99]"
      >
        <div className="min-w-0">
          {isSuperset ? (
            <div className="rounded-r-sm border-l-4 border-accent bg-accent/8 px-3 py-2">
              <span className="mb-2 inline-flex rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
                Superserie
              </span>
              <div className="space-y-0.5">
                {supersetParts.map((part) => (
                  <h3 key={part} className="text-base font-semibold leading-tight text-accent">
                    {part}
                  </h3>
                ))}
              </div>
            </div>
          ) : (
            <h3 className="text-base font-semibold text-accent">{title}</h3>
          )}
          <p className="mt-2 text-sm text-muted">{meta}</p>
        </div>
        <div className="flex items-center gap-2">
          {complete ? (
            <span className="rounded-full bg-accent/10 px-2 py-1 text-xs font-medium text-accent">Completo</span>
          ) : null}
          <span className="text-neutral-500">{open ? '▾' : '▸'}</span>
        </div>
      </button>
      {open ? <div className="mt-4 border-t border-neutral-100 pt-4">{children}</div> : null}
    </section>
  );
}

export function SetTableRow({
  label,
  reps,
  value,
  onChange,
  checked,
  onToggleCheck
}: {
  label: string;
  reps: string;
  value: string;
  onChange: (v: string) => void;
  checked?: boolean;
  onToggleCheck?: () => void;
}) {
  return (
    <div className={`grid grid-cols-[56px,64px,1fr,34px] items-center gap-2 rounded-r-sm border px-2.5 py-2 ${checked ? 'border-neutral-200 bg-neutral-50' : 'border-line bg-surface'}`}>
      <span className="text-xs font-medium text-muted">{label}</span>
      <span className="text-sm font-medium text-neutral-700">{reps}</span>
      <Input inputMode="decimal" placeholder="kg" value={value} onChange={(e) => onChange(e.target.value)} className="h-11 rounded-[14px] placeholder:text-neutral-400" />
      <input
        aria-label={`${label} completada`}
        type="checkbox"
        checked={Boolean(checked)}
        onChange={onToggleCheck}
        className="h-5 w-5 rounded border-line accent-[rgb(var(--accent-rgb))] transition-all duration-200 ease-out"
      />
    </div>
  );
}

export function DropSetBlock({
  setLabel,
  reps,
  values,
  onChangeDrop,
  checked,
  onToggleCheck
}: {
  setLabel: string;
  reps: string;
  values: [string, string, string];
  onChangeDrop: (drop: 1 | 2 | 3, value: string) => void;
  checked?: boolean;
  onToggleCheck?: () => void;
}) {
  return (
    <div className="rounded-r-sm border border-line border-l-4 border-l-accent bg-accent/8 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">
          {setLabel} · Reps: {reps}
        </p>
        <input
          aria-label={`${setLabel} completada`}
          type="checkbox"
          checked={Boolean(checked)}
          onChange={onToggleCheck}
          className="h-5 w-5 rounded border-line accent-[rgb(var(--accent-rgb))] transition-all duration-200 ease-out"
        />
      </div>
      <div className="space-y-2">
        {[1, 2, 3].map((drop) => (
          <div key={drop} className="grid grid-cols-[56px,1fr] items-center gap-2 rounded-r-sm bg-surface/70 px-2 py-1">
            <span className="text-xs font-medium text-muted">{`Drop ${drop}`}</span>
            <Input
              inputMode="decimal"
              placeholder="kg"
              value={values[drop - 1]}
              onChange={(e) => onChangeDrop(drop as 1 | 2 | 3, e.target.value)}
              className="h-11 rounded-[14px] placeholder:text-neutral-400"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
