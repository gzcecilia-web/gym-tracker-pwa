import type { InputHTMLAttributes, ReactNode } from 'react';

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export function PageContainer({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={cx('mx-auto w-full max-w-md space-y-8 px-5 pb-28 pt-5', className)}>{children}</div>;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={cx('rounded-2xl border border-neutral-200 bg-white p-5 shadow-soft', className)}>{children}</section>;
}

type ButtonProps = {
  children: ReactNode;
  className?: string;
  type?: 'button' | 'submit';
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
};

export function Button({
  children,
  className = '',
  type = 'button',
  onClick,
  disabled,
  variant = 'primary'
}: ButtonProps) {
  const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
    primary: 'bg-accent text-white shadow-md hover:brightness-95',
    secondary: 'border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50',
    ghost: 'border border-transparent bg-transparent text-neutral-600 hover:bg-neutral-100'
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'inline-flex min-h-11 w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        disabled ? 'cursor-not-allowed bg-neutral-300 text-neutral-500 shadow-none' : variants[variant],
        className
      )}
    >
      {children}
    </button>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        'h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm text-ink outline-none ring-accent/40 placeholder:text-neutral-400 focus:ring',
        props.className ?? ''
      )}
    />
  );
}

type SegmentedItem<T extends string | number> = {
  value: T;
  label: string;
  rightBadge?: ReactNode;
};

export function SegmentedControl<T extends string | number>({
  items,
  value,
  onChange,
  className = ''
}: {
  items: SegmentedItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cx('grid gap-3', className)}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={String(item.value)}
            type="button"
            onClick={() => onChange(item.value)}
            className={cx(
              'flex min-h-10 items-center justify-center gap-1 rounded-xl border px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
              active ? 'border-transparent bg-accent/10 text-accent' : 'border-neutral-200 bg-white text-neutral-600'
            )}
          >
            <span>{item.label}</span>
            {item.rightBadge}
          </button>
        );
      })}
    </div>
  );
}

export function StickyFooterCTA({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        'sticky bottom-20 z-20 mt-5 rounded-2xl border border-neutral-200 bg-white/95 p-3 shadow-soft backdrop-blur',
        className
      )}
    >
      {children}
    </div>
  );
}
