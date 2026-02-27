'use client';

import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';

export function AuthBar() {
  const supabase = getSupabaseClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [profileId, setProfileId] = useState('cecilia');
  const [showAuthForm, setShowAuthForm] = useState(false);

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

  useEffect(() => {
    const readSelection = () => {
      if (typeof window === 'undefined') return;
      try {
        const raw = window.localStorage.getItem('gym:selection');
        if (!raw) return;
        const parsed = JSON.parse(raw) as { profileId?: string };
        if (parsed.profileId) setProfileId(parsed.profileId);
      } catch {
        // ignore malformed local storage value
      }
    };

    readSelection();

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', readSelection);
      return () => window.removeEventListener('storage', readSelection);
    }

    return undefined;
  }, []);

  if (!supabase) {
    return (
      <div className="mb-5 rounded-2xl border border-neutral-200 bg-white p-4 text-xs text-neutral-500 shadow-soft">
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

    setIsLoading(false);

    if (result.error) {
      setStatus(`Error: ${result.error.message}`);
      return;
    }

    if (mode === 'signup') {
      setStatus('Cuenta creada. Si pide confirmacion por mail, revisa tu inbox.');
      return;
    }

    setStatus('Sesion iniciada.');
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
      setStatus('Ingresa tu email para recuperar contrasena.');
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

    setStatus('Te enviamos un email para restablecer tu contrasena.');
  };

  const onLogout = async () => {
    await supabase.auth.signOut();
    setStatus('Sesion cerrada.');
  };

  const modeButtonClass = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-semibold ${
      active ? 'border-transparent bg-accent/10 text-accent' : 'border-neutral-200 text-neutral-600'
    }`;

  return (
    <div className="mb-5 space-y-3">
      <div className="flex min-h-14 items-center justify-between rounded-2xl border border-neutral-200 bg-white px-4 shadow-soft">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Gym Tracker</p>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-accent/10 px-2 py-1 text-[11px] font-semibold uppercase text-accent">
              {profileId}
            </span>
            {userEmail ? (
              <p className="max-w-[150px] truncate text-xs text-neutral-500">{userEmail}</p>
            ) : (
              <p className="text-xs text-neutral-500">Sin sesion</p>
            )}
          </div>
        </div>

        {userEmail ? (
          <button
            type="button"
            onClick={onLogout}
            className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700"
          >
            Cerrar sesion
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowAuthForm((prev) => !prev)}
            className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700"
          >
            {showAuthForm ? 'Ocultar' : 'Ingresar'}
          </button>
        )}
      </div>

      {!userEmail && showAuthForm ? (
        <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-soft">
          <div className="flex gap-2">
            <button type="button" onClick={() => setMode('login')} className={modeButtonClass(mode === 'login')}>
              Entrar
            </button>
            <button type="button" onClick={() => setMode('signup')} className={modeButtonClass(mode === 'signup')}>
              Crear cuenta
            </button>
          </div>

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu-email@..."
            className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none ring-accent/30 focus:ring"
          />

          <div className="flex gap-2">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="contrasena"
              className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none ring-accent/30 focus:ring"
            />
            <button
              type="button"
              disabled={isLoading}
              onClick={onSubmitEmailPassword}
              className="rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {isLoading ? '...' : mode === 'signup' ? 'Crear' : 'Entrar'}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isLoading}
              onClick={onSendMagicLink}
              className="text-xs font-medium text-neutral-600 underline underline-offset-2 disabled:opacity-50"
            >
              Enviar link
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={onForgotPassword}
              className="text-xs font-medium text-neutral-600 underline underline-offset-2 disabled:opacity-50"
            >
              Olvide mi contrasena
            </button>
          </div>
        </div>
      ) : null}

      {status ? (
        <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-600 shadow-soft">
          {status}
        </div>
      ) : null}
    </div>
  );
}
