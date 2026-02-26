import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gym Tracker',
  description: 'Seguimiento de entrenamiento',
  manifest: '/manifest.json'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <main className="mx-auto min-h-screen w-full max-w-md px-4 pb-24 pt-5">{children}</main>
        <nav className="fixed bottom-0 left-0 right-0 border-t border-neutral-200 bg-white/95 backdrop-blur">
          <div className="mx-auto grid w-full max-w-md grid-cols-4 gap-2 px-4 py-3 text-sm font-medium">
            <Link href="/" className="rounded-lg px-3 py-2 text-center text-neutral-600 hover:bg-neutral-100">
              Hoy
            </Link>
            <Link href="/workout" className="rounded-lg px-3 py-2 text-center text-neutral-600 hover:bg-neutral-100">
              Entrenamiento
            </Link>
            <Link href="/history" className="rounded-lg px-3 py-2 text-center text-neutral-600 hover:bg-neutral-100">
              Historial
            </Link>
            <Link href="/progress" className="rounded-lg px-3 py-2 text-center text-neutral-600 hover:bg-neutral-100">
              Progreso
            </Link>
          </div>
        </nav>
      </body>
    </html>
  );
}
