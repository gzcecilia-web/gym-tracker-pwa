import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export function PageContainer({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={cx('mx-auto w-full max-w-md space-y-8 px-5 pb-32 pt-6', className)}>{children}</div>;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cx(
        'rounded-r-lg border border-line bg-surface p-5 shadow-card transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-float',
        className
      )}
    >
      {children}
    </section>
  );
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
    primary: 'bg-accent text-white shadow-float hover:-translate-y-0.5 hover:brightness-[0.98]',
    secondary: 'border border-line bg-[#F1EFEB] text-ink hover:-translate-y-0.5 hover:shadow-soft',
    ghost: 'border border-transparent bg-transparent text-muted hover:bg-[#F1EFEB]'
  };

  return (
    <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        className={cx(
        'inline-flex min-h-11 w-full items-center justify-center rounded-r-md px-4 py-3 text-sm font-semibold text-center transition-all duration-200 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25',
        disabled ? 'cursor-not-allowed bg-[#D9D4CD] text-[#8E8A84] shadow-none' : variants[variant],
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
        'h-11 w-full rounded-r-sm border border-line bg-surface px-3 text-sm text-ink outline-none ring-accent/25 placeholder:text-[#B8B6B1] focus:border-accent/20 focus:ring',
        props.className ?? ''
      )}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx(
        'h-11 w-full rounded-r-sm border border-line bg-surface px-3 text-sm text-ink outline-none ring-accent/25 focus:border-accent/20 focus:ring',
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
  className = '',
  variant = 'default'
}: {
  items: SegmentedItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  variant?: 'default' | 'compact' | 'day';
}) {
  const styleByVariant = {
    default: {
      base: 'min-h-10 rounded-r-sm text-sm',
      active: 'border-transparent bg-accent/14 text-accent shadow-soft',
      inactive: 'border-line bg-surface text-ink'
    },
    compact: {
      base: 'h-10 rounded-r-sm text-sm',
      active: 'border-transparent bg-accent/14 text-accent shadow-soft',
      inactive: 'border-line bg-transparent text-muted'
    },
    day: {
      base: 'h-11 rounded-r-sm text-sm',
      active: 'border-transparent bg-accent text-white shadow-soft',
      inactive: 'border-transparent bg-[#F1EFEB] text-ink'
    }
  } as const;

  const selectedStyle = styleByVariant[variant];
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
              'flex items-center justify-center gap-1 border px-3 py-2 font-semibold transition-all duration-200 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
              selectedStyle.base,
              active ? selectedStyle.active : selectedStyle.inactive
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
        'sticky bottom-[5rem] z-20 mt-5 rounded-r-md border border-line bg-surface/90 p-3 shadow-float backdrop-blur',
        className
      )}
    >
      {children}
    </div>
  );
}
