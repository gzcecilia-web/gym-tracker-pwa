import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthBar } from '@/components/auth-bar';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gym Tracker',
  description: 'Seguimiento de entrenamiento',
  manifest: '/manifest.json'
};

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M10 21v-6h4v6" />
    </svg>
  );
}

function DumbbellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <path d="M6 9v6" />
      <path d="M18 9v6" />
      <path d="M9 8v8" />
      <path d="M15 8v8" />
      <path d="M4 11h16" />
      <path d="M4 13h16" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <main className="mx-auto min-h-screen w-full max-w-md px-4 pb-24 pt-5">
          <AuthBar />
          {children}
        </main>
        <nav className="fixed bottom-0 left-0 right-0 border-t border-neutral-200 bg-white/95 backdrop-blur">
          <div className="mx-auto grid w-full max-w-md grid-cols-4 gap-2 px-4 py-3">
            <Link
              href="/"
              aria-label="Hoy"
              className="flex h-10 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100"
            >
              <HomeIcon />
            </Link>
            <Link
              href="/workout"
              aria-label="Entrenamiento"
              className="flex h-10 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100"
            >
              <DumbbellIcon />
            </Link>
            <Link
              href="/history"
              aria-label="Historial"
              className="flex h-10 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100"
            >
              <CalendarIcon />
            </Link>
            <Link
              href="/progress"
              aria-label="Progreso"
              className="flex h-10 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100"
            >
              <ChartIcon />
            </Link>
          </div>
        </nav>
      </body>
    </html>
  );
}
