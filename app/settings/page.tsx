'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input, PageContainer } from '@/components/ui';
import { applyProfileAccent, getProfileColorOptions, removeProfileColor, resolveProfileColorId, saveProfileColor } from '@/lib/profileTheme';
import { defaultSlot, getLatestPlanForProfile, removeProfile, updateProfileName } from '@/lib/routine';
import { loadRoutine, loadSelection, saveRoutine, saveSelection } from '@/lib/storage';
import type { RoutineDB, SelectedSlot } from '@/lib/types';

export default function SettingsPage() {
  const router = useRouter();
  const [routine, setRoutine] = useState<RoutineDB>(() => loadRoutine());
  const [slot, setSlot] = useState<SelectedSlot>(() => loadSelection(defaultSlot(loadRoutine())));
  const [profileName, setProfileName] = useState('');
  const [currentColor, setCurrentColor] = useState<string>('orange');

  useEffect(() => {
    const loadedRoutine = loadRoutine();
    setRoutine(loadedRoutine);
    const selected = loadSelection(defaultSlot(loadedRoutine));
    setSlot(selected);
  }, []);

  const options = useMemo(() => getProfileColorOptions(), []);
  const activeProfile = useMemo(
    () => routine.profiles.find((profile) => profile.id === slot.profileId) ?? routine.profiles[0],
    [routine, slot.profileId]
  );

  useEffect(() => {
    if (!activeProfile) return;
    setProfileName(activeProfile.name);
    setCurrentColor(resolveProfileColorId(activeProfile.id));
  }, [activeProfile]);

  const onSelectColor = (colorId: string) => {
    if (!activeProfile) return;
    saveProfileColor(activeProfile.id, colorId as never);
    setCurrentColor(colorId);
    applyProfileAccent(activeProfile.id);
    router.refresh();
  };

  const onRenameProfile = () => {
    if (!activeProfile || !profileName.trim()) return;
    const nextRoutine = saveRoutine(updateProfileName(routine, activeProfile.id, profileName));
    setRoutine(nextRoutine);
  };

  const onDeleteProfile = () => {
    if (!activeProfile) return;
    if (routine.profiles.length <= 1) {
      window.alert('Tiene que quedar al menos un perfil activo.');
      return;
    }

    const confirmed = window.confirm(`¿Querés eliminar el perfil ${activeProfile.name}?`);
    if (!confirmed) return;

    const nextRoutine = saveRoutine(removeProfile(routine, activeProfile.id));
    removeProfileColor(activeProfile.id);
    const nextProfile = nextRoutine.profiles[0];
    const nextPlan = getLatestPlanForProfile(nextProfile) ?? nextProfile.plans[0];
    const nextSlot: SelectedSlot = {
      profileId: nextProfile.id,
      planId: nextPlan?.id ?? '',
      week: 1,
      day: 1
    };

    setRoutine(nextRoutine);
    setSlot(nextSlot);
    saveSelection(nextSlot);
    applyProfileAccent(nextSlot.profileId);
    router.push('/');
    router.refresh();
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <PageContainer>
      <section className="space-y-2 rounded-[28px] bg-[linear-gradient(180deg,#FFFDF9_0%,#F8F4EC_100%)] px-6 py-7 shadow-[0_18px_42px_rgba(140,120,90,0.10)]">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Perfil</p>
        <h1 className="font-display text-[34px] font-bold leading-[0.98] tracking-[-0.03em] text-ink">Configuración</h1>
        <p className="font-warm text-[15px] font-medium text-muted">Ajustá el perfil activo sin afectar el resto de la rutina.</p>
      </section>

      {activeProfile ? (
        <Card className="space-y-5 border-none bg-white/80 shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Perfil activo</p>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-warm text-lg font-semibold text-ink">{activeProfile.name}</h2>
              <span className="rounded-full bg-profile/12 px-2.5 py-1 text-[11px] font-semibold text-profile">Activo</span>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Nombre</p>
            <div className="flex gap-3">
              <Input value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="Nombre del perfil" />
              <div className="w-[120px]">
                <Button variant="secondary" onClick={onRenameProfile}>
                  Guardar
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Color</p>
            <div className="grid grid-cols-2 gap-3">
              {options.map((option) => {
                const selected = currentColor === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onSelectColor(option.id)}
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
          </div>

          <div className="space-y-2 border-t border-line pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Acciones</p>
            <Button variant="secondary" className="border-[#E8C7BC] bg-[#FFF7F4] text-[#B75A3D] hover:bg-[#FDF0EA]" onClick={onDeleteProfile}>
              Borrar perfil
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="pb-4">
        <Button variant="secondary" onClick={() => router.push('/')}>
          Volver
        </Button>
      </div>
    </PageContainer>
  );
}
