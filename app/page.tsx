'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input, PageContainer, SegmentedControl } from '@/components/ui';
import { addPlanToProfile, createEmptyPlan, formatPlanLabel, getDayExercises, removePlanFromProfile, updateDayExercises, updatePlanName } from '@/lib/routine';
import { formatLocalDateTime, isSameLocalDay } from '@/lib/date';
import {
  appendWorkoutToHistory,
  loadHistory,
  loadRoutine,
  loadSelection,
  migrateIfNeeded,
  saveRoutine,
  saveSelection,
  syncHistoryFromCloud
} from '@/lib/storage';
import { buildSkippedWorkoutPayload } from '@/lib/workout';
import type { RoutineDB, RoutineExercise, SelectedSlot, WorkoutRecord } from '@/lib/types';

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

function titleFromFocus(focus: string, hasExercises: boolean): string {
  if (!hasExercises) return 'Mover el cuerpo';
  const normalized = focus
    .replace(/^Hoy toca\s+/i, '')
    .replace(/^Vamos a entrenar con foco$/i, 'Entrenamiento del día')
    .replace(/^Vamos a entrenar$/i, 'Mover el cuerpo')
    .replace(/^Hoy puede ser un buen comienzo$/i, 'Entrenamiento del día')
    .trim();

  if (!normalized) return 'Entrenamiento del día';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function getRecommendedSlot(slot: SelectedSlot, latestByWeekDay: Record<string, 'done' | 'skipped'>): SelectedSlot {
  let targetWeek = slot.week;

  for (let week = 1; week <= 4; week += 1) {
    const resolvedDays = [1, 2, 3, 4].filter((day) => latestByWeekDay[`${week}-${day}`]).length;
    if (resolvedDays < 4) {
      targetWeek = week;
      break;
    }
  }

  const firstPendingDay = [1, 2, 3, 4].find((day) => !latestByWeekDay[`${targetWeek}-${day}`]);

  return {
    ...slot,
    week: targetWeek,
    day: firstPendingDay ?? slot.day
  };
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
  const [showEditor, setShowEditor] = useState(false);
  const [exerciseMode, setExerciseMode] = useState<'normal' | 'dropset' | 'superset'>('normal');
  const [exerciseName, setExerciseName] = useState('');
  const [exercisePairName, setExercisePairName] = useState('');
  const [exerciseReps, setExerciseReps] = useState('');
  const [exerciseSets, setExerciseSets] = useState('');
  const [showPlanList, setShowPlanList] = useState(false);
  const slotPickerRef = useRef<HTMLDivElement | null>(null);

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

      const recommendedSlot = getRecommendedSlot(slot, latestByWeekDay);
      if (recommendedSlot.week !== slot.week || recommendedSlot.day !== slot.day) {
        saveSelection(recommendedSlot);
        setSlot(recommendedSlot);
        setLatestWorkout(list[0] ?? null);
        return;
      }

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

  useEffect(() => {
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (slotPickerRef.current && target && !slotPickerRef.current.contains(target)) {
        setShowSlotPicker(false);
        setShowPlanList(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, []);

  const profile = routine.profiles.find((p) => p.id === slot.profileId) ?? routine.profiles[0];
  const plan = profile?.plans.find((p) => p.id === slot.planId) ?? getLatestPlanForProfile(routine, slot.profileId);
  const exercisesForSelectedDay = useMemo(
    () => getDayExercises(routine, slot.profileId, slot.planId, slot.week, slot.day),
    [routine, slot.day, slot.planId, slot.profileId, slot.week]
  );

  const completedDaysThisWeek = Object.values(weekStatuses).filter((status) => status === 'done').length;
  const progressPercent = (completedDaysThisWeek / 4) * 100;
  const heroFocus = deriveDayFocus(exercisesForSelectedDay);
  const heroTitle = titleFromFocus(heroFocus, exercisesForSelectedDay.length > 0);
  const heroSubtitle = `${formatPlanLabel(plan?.name ?? 'Rutina', profile?.name)} · Semana ${slot.week} · Día ${slot.day}`;
  const supportMessage =
    todayWorkout
      ? 'Ya existe un registro para hoy'
      : completedDaysThisWeek === 0
      ? 'Todavía no se registraron entrenamientos'
      : `Se completaron ${completedDaysThisWeek} entrenamientos`;

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

  const resetExerciseForm = () => {
    setExerciseMode('normal');
    setExerciseName('');
    setExercisePairName('');
    setExerciseReps('');
    setExerciseSets('');
  };

  const persistRoutine = (nextRoutine: RoutineDB) => {
    const saved = saveRoutine(nextRoutine);
    setRoutine(saved);
  };

  const addPlan = () => {
    if (typeof window === 'undefined' || !profile) return;
    const nextName = window.prompt('Nombre del nuevo plan');
    if (!nextName?.trim()) return;

    const nextPlan = createEmptyPlan(
      nextName,
      profile.plans.map((item) => item.id)
    );

    const nextRoutine = addPlanToProfile(routine, profile.id, nextPlan);
    persistRoutine(nextRoutine);
    const nextSlot = {
      ...slot,
      planId: nextPlan.id,
      week: 1,
      day: 1
    };
    setSlot(nextSlot);
    saveSelection(nextSlot);
    setShowSlotPicker(false);
    setShowPlanList(false);
  };

  const renamePlan = () => {
    if (typeof window === 'undefined' || !plan) return;
    const nextName = window.prompt('Nuevo nombre del plan', formatPlanLabel(plan.name, profile?.name));
    if (!nextName?.trim()) return;

    const nextRoutine = updatePlanName(routine, slot.profileId, plan.id, nextName);
    persistRoutine(nextRoutine);
    setShowPlanList(false);
  };

  const removePlan = () => {
    if (typeof window === 'undefined' || !profile || !plan) return;
    if (profile.plans.length <= 1) {
      window.alert('Este perfil necesita al menos una rutina.');
      return;
    }

    const confirmed = window.confirm(`Se va a borrar "${formatPlanLabel(plan.name, profile.name)}". Esta acción no se puede deshacer.`);
    if (!confirmed) return;

    const nextRoutine = removePlanFromProfile(routine, profile.id, plan.id);
    persistRoutine(nextRoutine);

    const nextProfile = nextRoutine.profiles.find((item) => item.id === profile.id) ?? nextRoutine.profiles[0];
    const nextPlan = nextProfile?.plans.at(-1) ?? nextProfile?.plans[0];
    const nextSlot = {
      profileId: nextProfile?.id ?? slot.profileId,
      planId: nextPlan?.id ?? '',
      week: 1,
      day: 1
    };

    setSlot(nextSlot);
    saveSelection(nextSlot);
    setShowSlotPicker(false);
    setShowPlanList(false);
  };

  const addExercise = () => {
    const name = exerciseName.trim();
    const reps = exerciseReps.trim();
    const setsValue = exerciseSets.trim();
    const parsedSets = setsValue ? Number(setsValue) : undefined;

    if (!name || !reps) return;
    if (setsValue && (parsedSets === undefined || !Number.isFinite(parsedSets) || parsedSets <= 0)) return;

    const baseExercise: RoutineExercise = {
      name,
      reps,
      sets: parsedSets ?? null,
      type: exerciseMode === 'dropset' ? 'dropset' : 'normal',
      notes: ''
    };

    const nextRoutine = updateDayExercises(routine, slot.profileId, slot.planId, slot.week, slot.day, (exercises) => {
      if (exerciseMode !== 'superset') {
        return [...exercises, baseExercise];
      }

      const pairName = exercisePairName.trim();
      if (!pairName) return exercises;
      const supersetGroup = `${name} + ${pairName}`;
      return [
        ...exercises,
        { ...baseExercise, supersetGroup },
        {
          ...baseExercise,
          name: pairName,
          supersetGroup
        }
      ];
    });

    persistRoutine(nextRoutine);
    resetExerciseForm();
  };

  const removeExercise = (target: RoutineExercise) => {
    const nextRoutine = updateDayExercises(routine, slot.profileId, slot.planId, slot.week, slot.day, (exercises) => {
      if (!target.supersetGroup) {
        const index = exercises.findIndex((exercise) => exercise.name === target.name && exercise.supersetGroup === target.supersetGroup);
        if (index < 0) return exercises;
        return exercises.filter((_, itemIndex) => itemIndex !== index);
      }

      return exercises.filter((exercise) => exercise.supersetGroup !== target.supersetGroup);
    });

    persistRoutine(nextRoutine);
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
      <section ref={slotPickerRef} className="rounded-[30px] bg-[linear-gradient(180deg,#FFFEFC_0%,#F8F4EC_100%)] px-6 py-7 shadow-[0_18px_36px_rgba(0,0,0,0.06)]">
        <div className="space-y-2">
          <h1 className="font-display text-[36px] font-bold leading-[0.95] tracking-[-0.03em] text-ink">{heroTitle}</h1>
          <button
            type="button"
            onClick={() => {
              setShowSlotPicker((open) => !open);
              setShowPlanList(false);
            }}
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
                <button
                  type="button"
                  onClick={() => setShowPlanList((open) => !open)}
                  className="flex min-h-[48px] w-full items-center justify-between rounded-[16px] border border-transparent bg-[rgb(var(--profile-accent-rgb)/0.12)] px-4 py-3 text-left text-sm font-semibold text-[rgb(var(--profile-accent-rgb))] shadow-soft transition-all duration-200 ease-out active:scale-[0.98]"
                >
                  <span className="line-clamp-2 leading-snug">{formatPlanLabel(plan?.name ?? 'Rutina', profile?.name)}</span>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 transition-transform duration-200 ease-out ${showPlanList ? 'rotate-180' : ''}`}>
                    <path d="m5 7.5 5 5 5-5" />
                  </svg>
                </button>

                {showPlanList ? (
                  <div className="space-y-2 rounded-[18px] bg-[#FBF8F2] p-3">
                    {(profile?.plans ?? []).map((planOption) => (
                      <button
                        key={planOption.id}
                        type="button"
                        onClick={() => {
                          setSlot({ ...slot, planId: planOption.id, week: 1, day: 1 });
                          setShowPlanList(false);
                        }}
                        className={`flex min-h-[46px] w-full items-center justify-between rounded-[14px] border px-4 py-3 text-left text-sm font-semibold transition-all duration-200 ease-out active:scale-[0.98] ${
                          slot.planId === planOption.id
                            ? 'border-transparent bg-[rgb(var(--profile-accent-rgb)/0.12)] text-[rgb(var(--profile-accent-rgb))]'
                            : 'border-line bg-surface text-ink hover:bg-[#F4F1EB]'
                        }`}
                      >
                        <span className="line-clamp-2 leading-snug">{formatPlanLabel(planOption.name, profile?.name)}</span>
                        {slot.planId === planOption.id ? <span className="shrink-0 text-xs">Activa</span> : null}
                      </button>
                    ))}

                    <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={addPlan}
                        className="flex min-h-10 items-center justify-center rounded-[14px] border border-dashed border-line px-3 py-2 text-sm font-semibold text-muted transition-all duration-200 ease-out hover:bg-[#F4F1EB] hover:text-ink active:scale-[0.98]"
                      >
                        Agregar plan
                      </button>
                      <button
                        type="button"
                        onClick={renamePlan}
                        className="flex min-h-10 items-center justify-center rounded-[14px] border border-line bg-surface px-3 py-2 text-sm font-semibold text-muted transition-all duration-200 ease-out hover:bg-[#F4F1EB] hover:text-ink active:scale-[0.98]"
                      >
                        Editar nombre
                      </button>
                      <button
                        type="button"
                        onClick={removePlan}
                        className="flex min-h-10 items-center justify-center rounded-[14px] border border-line bg-surface px-3 py-2 text-sm font-semibold text-muted transition-all duration-200 ease-out hover:bg-[#F4F1EB] hover:text-ink active:scale-[0.98]"
                      >
                        Borrar rutina
                      </button>
                    </div>
                  </div>
                ) : null}
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
          <p className="font-warm text-base font-semibold text-profile">{heroFocus}</p>
          <p className="text-sm text-muted">{completedDaysThisWeek} de 4 entrenamientos esta semana</p>
          <div className="h-2 overflow-hidden rounded-full bg-[#ECE7DF]">
            <div
              className="h-full rounded-full bg-profile transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-sm text-muted">
            {todayWorkout ? supportMessage : completedDaysThisWeek === 0 ? 'Hoy puede ser un buen comienzo' : supportMessage}
          </p>
        </div>

        <div className="mt-6 space-y-3 text-center">
          <div className="mx-auto w-full max-w-[280px]">
            <Button className="h-14 rounded-full text-base font-semibold shadow-float hover:brightness-[0.98]" onClick={() => router.push('/workout')}>
              Entrenar
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
              className="text-sm font-semibold text-profile transition-colors duration-200 ease-out hover:opacity-80"
            >
              Ver detalle
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted">Todavía no se registraron entrenamientos.</p>
        )}
      </Card>

      <Card className="space-y-4 border-none bg-white/80 shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Plan del día</p>
            <h2 className="font-warm text-lg font-semibold text-ink">Editar plan</h2>
          </div>
          <button
            type="button"
            onClick={() => setShowEditor((open) => !open)}
            className="rounded-full px-3 py-2 text-sm font-semibold text-muted transition-all duration-200 ease-out hover:bg-[#F1EFEB] hover:text-ink active:scale-[0.98]"
          >
            {showEditor ? 'Ocultar' : 'Abrir'}
          </button>
        </div>

        {showEditor ? (
          <div className="space-y-5">
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Ejercicios actuales</p>
              {exercisesForSelectedDay.length ? (
                <div className="space-y-2">
                  {exercisesForSelectedDay.map((exercise, index) => (
                    <div key={`${exercise.name}-${exercise.supersetGroup ?? 'single'}-${index}`} className="flex items-start justify-between gap-3 rounded-[18px] bg-surface px-4 py-3 shadow-soft">
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-semibold text-ink">{exercise.name}</p>
                        <p className="text-xs text-muted">
                          {exercise.supersetGroup ? 'Superserie' : exercise.type === 'dropset' ? 'Dropset' : 'Normal'} · {exercise.sets ?? '4'} series · {Array.isArray(exercise.reps) ? exercise.reps.join('-') : String(exercise.reps)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeExercise(exercise)}
                        className="shrink-0 rounded-full px-3 py-2 text-xs font-semibold text-muted transition-all duration-200 ease-out hover:bg-[#F1EFEB] hover:text-ink active:scale-[0.98]"
                      >
                        Eliminar
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">Todavía no hay ejercicios cargados para este día.</p>
              )}
            </div>

            <div className="space-y-4 rounded-[20px] bg-surface px-4 py-4 shadow-soft">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Agregar ejercicio</p>

              <SegmentedControl
                className="grid-cols-3"
                variant="compact"
                value={exerciseMode}
                onChange={(value) => setExerciseMode(value)}
                items={[
                  { value: 'normal', label: 'Normal' },
                  { value: 'dropset', label: 'Dropset' },
                  { value: 'superset', label: 'Superserie' }
                ]}
              />

              <div className="space-y-3">
                <Input
                  placeholder={exerciseMode === 'superset' ? 'Primer ejercicio' : 'Nombre del ejercicio'}
                  value={exerciseName}
                  onChange={(event) => setExerciseName(event.target.value)}
                />

                {exerciseMode === 'superset' ? (
                  <Input
                    placeholder="Segundo ejercicio"
                    value={exercisePairName}
                    onChange={(event) => setExercisePairName(event.target.value)}
                  />
                ) : null}

                <div className="grid grid-cols-2 gap-3">
                  <Input placeholder="Reps (ej: 15-12-10-8)" value={exerciseReps} onChange={(event) => setExerciseReps(event.target.value)} />
                  <Input placeholder="Series" value={exerciseSets} onChange={(event) => setExerciseSets(event.target.value)} />
                </div>
              </div>

              <Button variant="secondary" onClick={addExercise}>
                Agregar ejercicio
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </PageContainer>
  );
}
