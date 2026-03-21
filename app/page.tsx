'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, PageContainer } from '@/components/ui';
import { getDayExercises } from '@/lib/routine';
import { formatLocalDateTime, isSameLocalDay } from '@/lib/date';
import {
  appendWorkoutToHistory,
  loadHistory,
  loadRoutine,
  loadSelection,
  migrateIfNeeded,
  saveSelection,
  syncHistoryFromCloud
} from '@/lib/storage';
import { buildSkippedWorkoutPayload } from '@/lib/workout';
import type { RoutineDB, SelectedSlot, WorkoutRecord } from '@/lib/types';

function clampWeekDay(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(4, Math.max(1, Math.trunc(value)));
}

function getLatestPlanForProfile(routine: RoutineDB, profileId: string) {
  const profile = routine.profiles.find((p) => p.id === profileId) ?? routine.profiles[0];
  return profile?.plans.at(-1) ?? profile?.plans[0];
}

function defaultSlot(routine: RoutineDB): SelectedSlot {
  const profile = routine.profiles[0];
  const plan = profile?.plans.at(-1) ?? profile?.plans[0];
  return {
    profileId: profile?.id ?? '',
    planId: plan?.id ?? '',
    week: 1,
    day: 1
  };
}

function normalizeSlot(slot: SelectedSlot, routine: RoutineDB, fallback: SelectedSlot): SelectedSlot {
  const profile = routine.profiles.find((p) => p.id === slot.profileId) ?? routine.profiles.find((p) => p.id === fallback.profileId) ?? routine.profiles[0];
  const plan = profile?.plans.find((p) => p.id === slot.planId) ?? getLatestPlanForProfile(routine, profile?.id ?? fallback.profileId);

  return {
    profileId: profile?.id ?? fallback.profileId,
    planId: plan?.id ?? fallback.planId,
    week: clampWeekDay(slot.week),
    day: clampWeekDay(slot.day)
  };
}

function getWorkoutStatus(item: WorkoutRecord): 'done' | 'skipped' | 'ignore' {
  if (item.completed === false) return 'skipped';
  if (item.completed === true) return 'done';

  const hasWeights = Object.keys(item.weights ?? {}).length > 0;
  const hasWeightsByExercise = Object.values(item.weightsByExercise ?? {}).some((bySet) => Object.keys(bySet ?? {}).length > 0);
  const hasChecks = Object.values(item.checks ?? {}).some(Boolean);
  return hasWeights || hasWeightsByExercise || hasChecks ? 'done' : 'ignore';
}

function deriveDayFocus(exercises: Array<{ name: string; supersetGroup?: string }>): string {
  const primary = exercises[0];
  if (!primary) return 'Hoy puede ser un buen comienzo';
  if (primary.supersetGroup) return 'Vamos a entrenar con foco';
  const firstName = String(primary.name ?? '').toLowerCase();
  if (firstName.includes('peso muerto') || firstName.includes('sentadilla') || firstName.includes('prensa')) {
    return 'Hoy toca piernas';
  }
  if (firstName.includes('remo') || firstName.includes('dominadas') || firstName.includes('tirones')) {
    return 'Hoy toca espalda';
  }
  if (firstName.includes('press') || firstName.includes('apertura') || firstName.includes('empujes')) {
    return 'Hoy toca tren superior';
  }
  return 'Vamos a entrenar';
}

export default function HomePage() {
  const router = useRouter();
  const [routine, setRoutine] = useState<RoutineDB>(() => loadRoutine());
  const fallback = useMemo(() => defaultSlot(routine), [routine]);
  const [slot, setSlot] = useState<SelectedSlot>(fallback);
  const [isLoadedSelection, setIsLoadedSelection] = useState(false);
  const [todayWorkout, setTodayWorkout] = useState<WorkoutRecord | null>(null);
  const [latestWorkout, setLatestWorkout] = useState<WorkoutRecord | null>(null);
  const [weekStatuses, setWeekStatuses] = useState<Record<number, 'done' | 'skipped'>>({});
  const [showSlotPicker, setShowSlotPicker] = useState(false);

  useEffect(() => {
    migrateIfNeeded();
    const loadedRoutine = loadRoutine();
    setRoutine(loadedRoutine);
    const loadedFallback = defaultSlot(loadedRoutine);
    const selected = normalizeSlot(loadSelection(loadedFallback), loadedRoutine, loadedFallback);
    setSlot(selected);
    saveSelection(selected);
    setIsLoadedSelection(true);
  }, []);

  useEffect(() => {
    if (!isLoadedSelection) return;
    let cancelled = false;

    const run = async () => {
      saveSelection(slot);
      try {
        await syncHistoryFromCloud(slot.profileId, slot.planId);
      } catch {
        // local-first fallback
      }

      const list = loadHistory(slot.profileId, slot.planId);
      const latestByWeekDay: Record<string, 'done' | 'skipped'> = {};
      for (const item of list) {
        const key = `${item.week}-${item.day}`;
        if (!latestByWeekDay[key]) {
          const status = getWorkoutStatus(item);
          if (status !== 'ignore') latestByWeekDay[key] = status;
        }
      }
      if (cancelled) return;

      const thisWeekStatuses: Record<number, 'done' | 'skipped'> = {};
      for (let d = 1; d <= 4; d += 1) {
        const s = latestByWeekDay[`${slot.week}-${d}`];
        if (s) thisWeekStatuses[d] = s;
      }
      setWeekStatuses(thisWeekStatuses);
      setLatestWorkout(list[0] ?? null);

      const today = list.find((w) => w.week === slot.week && w.day === slot.day && isSameLocalDay(w.createdAt, new Date().toISOString()));
      setTodayWorkout(today ?? null);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [isLoadedSelection, slot]);

  const profile = routine.profiles.find((p) => p.id === slot.profileId) ?? routine.profiles[0];
  const plan = profile?.plans.find((p) => p.id === slot.planId) ?? getLatestPlanForProfile(routine, slot.profileId);
  const exercisesForSelectedDay = useMemo(
    () => getDayExercises(routine, slot.profileId, slot.planId, slot.week, slot.day),
    [routine, slot.day, slot.planId, slot.profileId, slot.week]
  );

  const completedDaysThisWeek = Object.values(weekStatuses).filter((status) => status === 'done').length;
  const progressPercent = (completedDaysThisWeek / 4) * 100;
  const heroTitle = `Hoy, ${profile?.name ?? 'vos'}`;
  const heroSubtitle = `${plan?.name ?? 'Rutina'} · Semana ${slot.week} · Día ${slot.day}`;
  const heroFocus = deriveDayFocus(exercisesForSelectedDay);
  const supportMessage =
    todayWorkout
      ? 'Ya existe un registro para hoy'
      : completedDaysThisWeek === 0
      ? 'Todavía no se registraron entrenamientos esta semana'
      : `Se completaron ${completedDaysThisWeek} entrenamientos esta semana`;

  const markSkipped = () => {
    const payload = buildSkippedWorkoutPayload({
      profileId: slot.profileId,
      planId: slot.planId,
      week: slot.week,
      day: slot.day,
      exercises: exercisesForSelectedDay
    });
    appendWorkoutToHistory(payload);
    setTodayWorkout(payload);
    setLatestWorkout(payload);
    setWeekStatuses((prev) => ({ ...prev, [slot.day]: 'skipped' }));
  };

  const weekToneClass = (week: number, active: boolean): string => {
    if (!active) return 'border-line bg-transparent text-muted hover:bg-[#F4F1EB]';
    const tones: Record<number, string> = {
      1: 'border-[#93BDB6] bg-[#E8F1EF] text-[#5C8E86]',
      2: 'border-[#A8C686] bg-[#EEF5E6] text-[#6F8A5A]',
      3: 'border-[#E5DDBB] bg-[#F7F4E7] text-[#988F63]',
      4: 'border-[#E6C0A5] bg-[#F8EDE5] text-[#B97855]'
    };
    return tones[week] ?? tones[1];
  };

  const dayToneClass = (day: number, active: boolean): string => {
    if (!active) return 'border border-transparent bg-[#F1EFEB] text-muted hover:bg-[#EAE5DD]';
    const tones: Record<number, string> = {
      1: 'border-transparent bg-[#7EB6AE] text-white',
      2: 'border-transparent bg-[#8DAE73] text-white',
      3: 'border-transparent bg-[#D8C278] text-[#4F4426]',
      4: 'border-transparent bg-[#D98D62] text-white'
    };
    return tones[day] ?? tones[1];
  };

  return (
    <PageContainer className="space-y-6">
      <section className="rounded-[30px] bg-[linear-gradient(180deg,#FFFEFC_0%,#F8F4EC_100%)] px-6 py-7 shadow-[0_18px_36px_rgba(0,0,0,0.06)]">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Hoy</p>
          <h1 className="font-display text-[36px] font-bold leading-[0.95] tracking-[-0.03em] text-ink">{heroTitle}</h1>
          <button
            type="button"
            onClick={() => setShowSlotPicker((open) => !open)}
            className="inline-flex items-center gap-2 rounded-full px-0 text-left font-warm text-[15px] font-medium text-muted transition-colors duration-200 ease-out hover:text-ink active:scale-[0.98]"
          >
            <span>{heroSubtitle}</span>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 transition-transform duration-200 ease-out ${showSlotPicker ? 'rotate-180' : ''}`}>
              <path d="m5 7.5 5 5 5-5" />
            </svg>
          </button>
        </div>

        {showSlotPicker ? (
          <div className="mt-4 space-y-4 rounded-[24px] border border-line bg-white/80 p-4 shadow-[0_10px_24px_rgba(0,0,0,0.04)]">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Rutina</p>
              <div className="space-y-2">
                {(profile?.plans ?? []).map((planOption) => (
                  <button
                    key={planOption.id}
                    type="button"
                    onClick={() => setSlot({ ...slot, planId: planOption.id, week: 1, day: 1 })}
                    className={`flex min-h-[48px] w-full items-center justify-between rounded-[16px] border px-4 py-3 text-left text-sm font-semibold transition-all duration-200 ease-out active:scale-[0.98] ${
                      slot.planId === planOption.id
                        ? 'border-transparent bg-[rgb(var(--profile-accent-rgb)/0.12)] text-[rgb(var(--profile-accent-rgb))] shadow-soft'
                        : 'border-line bg-surface text-ink hover:bg-[#F4F1EB]'
                    }`}
                  >
                    <span className="line-clamp-2 leading-snug">{planOption.name}</span>
                    {slot.planId === planOption.id ? <span className="shrink-0 text-xs">Activa</span> : null}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Semana</p>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((week) => (
                  <button
                    key={week}
                    type="button"
                    onClick={() => setSlot({ ...slot, week })}
                    className={`flex h-10 items-center justify-center rounded-[16px] border text-sm font-semibold transition-all duration-200 ease-out active:scale-[0.98] ${weekToneClass(week, slot.week === week)}`}
                  >
                    {`S${week}`}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Día</p>
              <div className="grid grid-cols-2 gap-2">
                {[1, 2, 3, 4].map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSlot({ ...slot, day })}
                    className={`flex h-11 items-center justify-center gap-1 rounded-[16px] text-sm font-semibold transition-all duration-200 ease-out active:scale-[0.98] ${dayToneClass(day, slot.day === day)}`}
                  >
                    <span>{`Día ${day}`}</span>
                    {weekStatuses[day] === 'done' ? <span className="text-[11px]">✓</span> : null}
                    {weekStatuses[day] === 'skipped' ? <span className="text-[11px]">⏸</span> : null}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-5 space-y-3">
          <p className="font-warm text-base font-semibold text-accent">{heroFocus}</p>
          <p className="text-sm text-muted">{completedDaysThisWeek} de 4 entrenamientos esta semana</p>
          <div className="h-2 overflow-hidden rounded-full bg-[#ECE7DF]">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-sm text-muted">
            {todayWorkout ? supportMessage : completedDaysThisWeek === 0 ? 'Hoy puede ser un buen comienzo' : supportMessage}
          </p>
        </div>

        <div className="mt-6 space-y-3 text-center">
          <div className="mx-auto w-full max-w-[280px]">
            <Button className="h-14 rounded-full bg-accent text-base font-semibold shadow-float hover:brightness-[0.98]" onClick={() => router.push('/workout')}>
              Entrenar hoy
            </Button>
          </div>
          <button
            type="button"
            onClick={markSkipped}
            className="text-sm font-medium text-muted transition-colors duration-200 ease-out hover:text-ink"
          >
            No se entrenó hoy
          </button>
        </div>
      </section>

      <Card className="space-y-4 border-none bg-white/80 shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Actividad reciente</p>
          <h2 className="font-warm text-lg font-semibold text-ink">Último registro</h2>
        </div>

        {latestWorkout ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-ink">{formatLocalDateTime(latestWorkout.createdAt)}</p>
              <p className="text-sm text-muted">
                Semana {latestWorkout.week} · Día {latestWorkout.day}
              </p>
            </div>
            {latestWorkout.exercises?.length ? (
              <div className="space-y-1">
                {latestWorkout.exercises.slice(0, 3).map((exercise) => (
                  <p key={exercise.name} className="text-sm text-ink">
                    {exercise.name}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No hay ejercicios registrados en este entrenamiento.</p>
            )}
            <button
              type="button"
              onClick={() => router.push(`/history${latestWorkout.id ? `?id=${latestWorkout.id}` : ''}`)}
              className="text-sm font-semibold text-accent transition-colors duration-200 ease-out hover:opacity-80"
            >
              Ver detalle
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted">Todavía no se registraron entrenamientos.</p>
        )}
      </Card>
    </PageContainer>
  );
}
