'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

function HomeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M10 21v-6h4v6" />
    </svg>
  );
}

function DumbbellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.95"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <rect x="2.5" y="8.5" width="2.5" height="7" rx="0.8" />
      <rect x="5.8" y="7.5" width="2.5" height="9" rx="0.8" />
      <rect x="15.7" y="7.5" width="2.5" height="9" rx="0.8" />
      <rect x="19" y="8.5" width="2.5" height="7" rx="0.8" />
      <path d="M8.8 12h6.4" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  );
}

function itemClass(active: boolean): string {
  if (active) {
    return 'bg-[rgb(var(--profile-accent-rgb)/0.12)] text-[rgb(var(--profile-accent-rgb))] shadow-soft';
  }

  return 'text-muted hover:bg-[#F3EFE8] hover:text-ink';
}

export function BottomNav() {
  const pathname = usePathname();

  const items: NavItem[] = [
    { href: '/', label: 'Hoy', icon: <HomeIcon /> },
    { href: '/workout', label: 'Entrenamiento', icon: <DumbbellIcon /> },
    { href: '/history', label: 'Historial', icon: <CalendarIcon /> },
    { href: '/progress', label: 'Progreso', icon: <ChartIcon /> }
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#E8E0D6]/80 bg-[#FAF9F6]/92 backdrop-blur-xl">
      <div className="mx-auto w-full max-w-md px-4 pb-3 pt-2">
        <div className="grid grid-cols-4 gap-2 rounded-[22px] bg-white/75 p-2 shadow-[0_10px_30px_rgba(120,110,90,0.08)]">
          {items.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl px-2 transition-all duration-200 ease-out active:scale-[0.98] ${itemClass(active)}`}
              >
                <span>{item.icon}</span>
                <span className="text-[11px] font-semibold tracking-[0.01em]">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
