import type { Metadata } from 'next';
import { AuthBar } from '@/components/auth-bar';
import { BottomNav } from '@/components/bottom-nav';
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
        <main className="mx-auto min-h-screen w-full max-w-md px-4 pb-24 pt-5">
          <AuthBar />
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  );
}
