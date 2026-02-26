'use client';

export function Segmented({
  value,
  onChange,
  options,
  label
}: {
  value: number;
  onChange: (n: number) => void;
  options: number[];
  label: string;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-neutral-600">{label}</p>
      <div className="grid grid-cols-4 gap-2 rounded-xl bg-neutral-100 p-1">
        {options.map((opt) => {
          const active = opt === value;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`rounded-lg py-2 text-sm font-semibold ${
                active ? 'bg-white text-ink shadow-soft' : 'text-neutral-500'
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
