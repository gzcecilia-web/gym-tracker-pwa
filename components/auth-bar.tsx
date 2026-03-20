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
      <div className="mb-5 rounded-r-lg border border-line bg-surface p-4 text-xs text-muted shadow-soft">
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
    `rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-200 ease-out active:scale-[0.98] ${
      active ? 'border-transparent bg-accent/12 text-accent shadow-soft' : 'border-line text-muted'
    }`;

  return (
    <div className="mb-5 space-y-3">
      <div className="flex min-h-14 items-center justify-between rounded-r-lg border border-line bg-surface px-4 shadow-card">
        <div className="space-y-1">
          <p className="font-warm text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Gym Tracker</p>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[color:rgb(var(--profile-accent-rgb)/0.12)] px-2.5 py-1 text-[11px] font-semibold uppercase text-[color:rgb(var(--profile-accent-rgb))]">
              {profileId}
            </span>
            {userEmail ? (
              <p className="max-w-[150px] truncate text-xs text-muted">{userEmail}</p>
            ) : (
              <p className="text-xs text-muted">Sin sesión</p>
            )}
          </div>
        </div>

        {userEmail ? (
          <button
            type="button"
            onClick={onLogout}
            className="rounded-r-sm border border-line px-3 py-2 text-xs font-semibold text-ink transition-all duration-200 ease-out hover:bg-[#F1EFEB] active:scale-[0.98]"
          >
            Cerrar sesión
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowAuthForm((prev) => !prev)}
            className="rounded-r-sm border border-line px-3 py-2 text-xs font-semibold text-ink transition-all duration-200 ease-out hover:bg-[#F1EFEB] active:scale-[0.98]"
          >
            {showAuthForm ? 'Ocultar' : 'Ingresar'}
          </button>
        )}
      </div>

      {!userEmail && showAuthForm ? (
        <div className="space-y-3 rounded-r-lg border border-line bg-surface p-4 shadow-card">
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
            className="h-11 w-full rounded-r-sm border border-line bg-surface px-3 text-sm text-ink outline-none ring-accent/25 placeholder:text-[#B8B6B1] focus:border-accent/20 focus:ring"
          />

          <div className="flex gap-2">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="contrasena"
              className="h-11 w-full rounded-r-sm border border-line bg-surface px-3 text-sm text-ink outline-none ring-accent/25 placeholder:text-[#B8B6B1] focus:border-accent/20 focus:ring"
            />
            <button
              type="button"
              disabled={isLoading}
              onClick={onSubmitEmailPassword}
              className="rounded-r-sm bg-accent px-3 py-2 text-xs font-semibold text-white shadow-soft transition-all duration-200 ease-out active:scale-[0.98] disabled:opacity-50"
            >
              {isLoading ? '...' : mode === 'signup' ? 'Crear' : 'Entrar'}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isLoading}
              onClick={onSendMagicLink}
              className="text-xs font-medium text-muted underline underline-offset-2 disabled:opacity-50"
            >
              Enviar link
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={onForgotPassword}
              className="text-xs font-medium text-muted underline underline-offset-2 disabled:opacity-50"
            >
              Olvidé mi contraseña
            </button>
          </div>
        </div>
      ) : null}

      {status ? (
        <div className="rounded-r-md border border-line bg-surface px-3 py-2 text-xs text-muted shadow-soft">
          {status}
        </div>
      ) : null}
    </div>
  );
}
