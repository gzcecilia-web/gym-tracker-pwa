'use client';

import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';

export function AuthBar() {
  const supabase = getSupabaseClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [status, setStatus] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  if (!supabase) {
    return (
      <div className="mb-3 rounded-xl border border-neutral-200 bg-white p-3 text-xs text-neutral-500">
        Supabase no configurado. La app usa guardado local.
      </div>
    );
  }

  const onSubmitEmailPassword = async () => {
    if (!email.trim() || !password.trim()) return;
    setIsLoading(true);
    setStatus('');
    const result =
      mode === 'signup'
        ? await supabase.auth.signUp({ email: email.trim(), password: password.trim() })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password: password.trim() });
    const { error } = result;
    setIsLoading(false);
    if (error) {
      setStatus(`Error: ${error.message}`);
      return;
    }
    if (mode === 'signup') {
      setStatus('Cuenta creada. Si te pide confirmación por mail, revisá tu inbox.');
      return;
    }
    setStatus('Sesión iniciada.');
  };

  const onSendMagicLink = async () => {
    if (!email.trim()) return;
    setIsLoading(true);
    setStatus('');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined
      }
    });
    setIsLoading(false);
    if (error) {
      setStatus(`Error link: ${error.message}`);
      return;
    }
    setStatus('Te enviamos un link al mail.');
  };

  const onForgotPassword = async () => {
    if (!email.trim()) {
      setStatus('Ingresá tu email para recuperar contraseña.');
      return;
    }
    setIsLoading(true);
    setStatus('');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined
    });
    setIsLoading(false);
    if (error) {
      setStatus(`Error recovery: ${error.message}`);
      return;
    }
    setStatus('Te enviamos un email para restablecer tu contraseña.');
  };

  const onLogout = async () => {
    await supabase.auth.signOut();
    setStatus('Sesión cerrada.');
  };

  return (
    <div className="mb-3 rounded-xl border border-neutral-200 bg-white p-3">
      {userEmail ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-neutral-600">Sesión: {userEmail}</p>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700"
          >
            Cerrar sesión
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-neutral-700">Iniciar sesión para sincronizar en la nube</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                mode === 'login' ? 'border-accent bg-accent/10 text-accent' : 'border-neutral-200 text-neutral-600'
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                mode === 'signup' ? 'border-accent bg-accent/10 text-accent' : 'border-neutral-200 text-neutral-600'
              }`}
            >
              Crear cuenta
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu-email@..."
              className="h-9 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none ring-accent/30 focus:ring"
            />
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="contraseña"
              className="h-9 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none ring-accent/30 focus:ring"
            />
            <button
              type="button"
              disabled={isLoading}
              onClick={onSubmitEmailPassword}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {isLoading ? '...' : mode === 'signup' ? 'Crear' : 'Entrar'}
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={onSendMagicLink}
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 disabled:opacity-50"
            >
              Link
            </button>
          </div>
          <div>
            <button
              type="button"
              disabled={isLoading}
              onClick={onForgotPassword}
              className="text-xs font-medium text-neutral-600 underline underline-offset-2 disabled:opacity-50"
            >
              Olvidé mi contraseña
            </button>
          </div>
        </div>
      )}
      {status ? <p className="mt-2 text-xs text-neutral-500">{status}</p> : null}
    </div>
  );
}
