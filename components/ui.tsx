import type { InputHTMLAttributes, ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-card p-4 shadow-soft ${className}`}>{children}</section>;
}

export function Button({
  children,
  className = '',
  type = 'button',
  onClick,
  disabled
}: {
  children: ReactNode;
  className?: string;
  type?: 'button' | 'submit';
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-xl px-4 py-3 text-sm font-semibold transition ${
        disabled ? 'bg-neutral-300 text-neutral-500' : 'bg-accent text-white active:scale-[0.99]'
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-base outline-none ring-accent/40 focus:ring ${
        props.className ?? ''
      }`}
    />
  );
}
