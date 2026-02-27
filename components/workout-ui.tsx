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
  return (
    <section className={`rounded-2xl border bg-white p-5 shadow-soft ${complete ? 'border-accent/30' : 'border-neutral-200'}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <div>
          <h3 className="text-base font-semibold text-accent">{title}</h3>
          <p className="mt-1 text-sm text-neutral-600">{meta}</p>
        </div>
        <div className="flex items-center gap-2">
          {complete ? (
            <span className="rounded-full bg-accent/10 px-2 py-1 text-xs font-medium text-accent">Completo</span>
          ) : null}
          <span className="text-neutral-500">{open ? '▾' : '▸'}</span>
        </div>
      </button>
      {open ? <div className="mt-4">{children}</div> : null}
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
    <div className="grid grid-cols-[56px,64px,1fr,28px] items-center gap-2 rounded-xl border border-neutral-200 bg-white px-2 py-2">
      <span className="text-xs font-medium text-neutral-500">{label}</span>
      <span className="text-sm font-medium text-neutral-600">{reps}</span>
      <Input inputMode="decimal" placeholder="kg" value={value} onChange={(e) => onChange(e.target.value)} className="h-9" />
      <input
        aria-label={`${label} completada`}
        type="checkbox"
        checked={Boolean(checked)}
        onChange={onToggleCheck}
        className="h-4 w-4 rounded border-neutral-300 accent-[#B46A4E]"
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
    <div className="rounded-xl border-l-4 border-accent bg-neutral-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">
          {setLabel} · Reps: {reps}
        </p>
        <input
          aria-label={`${setLabel} completada`}
          type="checkbox"
          checked={Boolean(checked)}
          onChange={onToggleCheck}
          className="h-4 w-4 rounded border-neutral-300 accent-[#B46A4E]"
        />
      </div>
      <div className="space-y-2">
        {[1, 2, 3].map((drop) => (
          <div key={drop} className="grid grid-cols-[56px,1fr] items-center gap-2">
            <span className="text-xs font-medium text-neutral-500">{`Drop ${drop}`}</span>
            <Input
              inputMode="decimal"
              placeholder="kg"
              value={values[drop - 1]}
              onChange={(e) => onChangeDrop(drop as 1 | 2 | 3, e.target.value)}
              className="h-9"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
