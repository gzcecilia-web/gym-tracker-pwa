'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, PageContainer } from '@/components/ui';
import { applyProfileAccent, getProfileColorOptions, resolveProfileColorId, saveProfileColor } from '@/lib/profileTheme';
import { defaultSlot } from '@/lib/routine';
import { loadRoutine, loadSelection } from '@/lib/storage';
import type { RoutineDB, SelectedSlot } from '@/lib/types';

export default function SettingsPage() {
  const router = useRouter();
  const [routine, setRoutine] = useState<RoutineDB>(() => loadRoutine());
  const [slot, setSlot] = useState<SelectedSlot>(() => loadSelection(defaultSlot(loadRoutine())));
  const [colorMap, setColorMap] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadedRoutine = loadRoutine();
    setRoutine(loadedRoutine);
    const selected = loadSelection(defaultSlot(loadedRoutine));
    setSlot(selected);

    const map: Record<string, string> = {};
    for (const profile of loadedRoutine.profiles) {
      map[profile.id] = resolveProfileColorId(profile.id);
    }
    setColorMap(map);
  }, []);

  const options = useMemo(() => getProfileColorOptions(), []);

  const onSelectColor = (profileId: string, colorId: string) => {
    saveProfileColor(profileId, colorId as never);
    setColorMap((prev) => ({ ...prev, [profileId]: colorId }));
    if (slot.profileId === profileId) {
      applyProfileAccent(profileId);
    }
  };

  return (
    <PageContainer>
      <section className="space-y-2 rounded-[28px] bg-[linear-gradient(180deg,#FFFDF9_0%,#F8F4EC_100%)] px-6 py-7 shadow-[0_18px_42px_rgba(140,120,90,0.10)]">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Perfil</p>
        <h1 className="font-display text-[34px] font-bold leading-[0.98] tracking-[-0.03em] text-ink">Configuración</h1>
        <p className="font-warm text-[15px] font-medium text-muted">Elegí un color para cada perfil y mantené una lectura más clara en toda la app.</p>
      </section>

      <div className="space-y-4">
        {routine.profiles.map((profile) => {
          const currentColor = colorMap[profile.id] ?? resolveProfileColorId(profile.id);
          return (
            <Card key={profile.id} className="space-y-4 border-none bg-white/80 shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Perfil</p>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-warm text-lg font-semibold text-ink">{profile.name}</h2>
                  {slot.profileId === profile.id ? (
                    <span className="rounded-full bg-profile/12 px-2.5 py-1 text-[11px] font-semibold text-profile">Activo</span>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {options.map((option) => {
                  const selected = currentColor === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => onSelectColor(profile.id, option.id)}
                      className={`rounded-[18px] border px-4 py-3 text-left transition-all duration-200 ease-out active:scale-[0.98] ${
                        selected ? 'border-transparent bg-[rgb(var(--profile-accent-rgb)/0.12)] shadow-soft' : 'border-line bg-surface'
                      }`}
                    >
                      <div className="mb-2 h-8 rounded-full" style={{ backgroundColor: option.hex }} />
                      <p className="text-sm font-semibold text-ink">{option.label}</p>
                      <p className="text-xs text-muted">{option.hex}</p>
                    </button>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="pb-4">
        <Button variant="secondary" onClick={() => router.push('/')}>
          Volver
        </Button>
      </div>
    </PageContainer>
  );
}
