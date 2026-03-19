'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input, PageContainer, SegmentedControl } from '@/components/ui';
import { createEmptyProfile, defaultSlot, getDayExercises, updateDayExercises } from '@/lib/routine';
import { isSameLocalDay, formatLocalDateTime } from '@/lib/date';
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

function normalizeSlot(slot: SelectedSlot, routine: RoutineDB, fallback: SelectedSlot): SelectedSlot {
  const profile = routine.profiles.find((p) => p.id === slot.profileId) ?? routine.profiles.find((p) => p.id === fallback.profileId);
  const safeProfile = profile ?? routine.profiles[0];
  const safePlan = safeProfile?.plans.find((p) => p.id === slot.planId) ?? safeProfile?.plans[0];

  return {
    profileId: safeProfile?.id ?? fallback.profileId,
    planId: safePlan?.id ?? fallback.planId,
    week: clampWeekDay(slot.week),
    day: clampWeekDay(slot.day)
  };
}

function getWorkoutStatus(item: WorkoutRecord): 'done' | 'skipped' | 'ignore' {
  if (item.completed === false) return 'skipped';
  if (item.completed === true) return 'done';

  const hasWeights = Object.keys(item.weights ?? {}).length > 0;
  const hasWeightsByExercise = Object.values(item.weightsByExercise ?? {}).some(
    (bySet) => Object.keys(bySet ?? {}).length > 0
  );
  const hasChecks = Object.values(item.checks ?? {}).some(Boolean);
  return hasWeights || hasWeightsByExercise || hasChecks ? 'done' : 'ignore';
}

export default function HomePage() {
  const router = useRouter();
  const [routine, setRoutine] = useState<RoutineDB>(() => loadRoutine());
  const fallback = useMemo(() => defaultSlot(routine), [routine]);

  const [slot, setSlot] = useState<SelectedSlot>(fallback);
  const [isLoadedSelection, setIsLoadedSelection] = useState(false);
  const [todayWorkout, setTodayWorkout] = useState<WorkoutRecord | null>(null);
  const [weekStatuses, setWeekStatuses] = useState<Record<number, 'done' | 'skipped'>>({});
  const [weekCompleted, setWeekCompleted] = useState<Record<number, boolean>>({});
  const [isAddingProfile, setIsAddingProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [exerciseName, setExerciseName] = useState('');
  const [exerciseReps, setExerciseReps] = useState('');
  const [exerciseSets, setExerciseSets] = useState('');
  const [exerciseType, setExerciseType] = useState<'normal' | 'dropset'>('normal');

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
    const normalized = normalizeSlot(slot, routine, fallback);
    if (
      normalized.profileId !== slot.profileId ||
      normalized.planId !== slot.planId ||
      normalized.week !== slot.week ||
      normalized.day !== slot.day
    ) {
      setSlot(normalized);
    }
  }, [fallback, isLoadedSelection, routine, slot]);

  useEffect(() => {
    if (!isLoadedSelection) return;
    let cancelled = false;

    const run = async () => {
      saveSelection(slot);
      try {
        await syncHistoryFromCloud(slot.profileId, slot.planId);
      } catch {
        // Local storage remains the source of truth if cloud sync fails.
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

      const completionMap: Record<number, boolean> = {};
      for (let w = 1; w <= 4; w += 1) {
        completionMap[w] = [1, 2, 3, 4].every((d) => Boolean(latestByWeekDay[`${w}-${d}`]));
      }
      setWeekCompleted(completionMap);

      const thisWeekStatuses: Record<number, 'done' | 'skipped'> = {};
      for (let d = 1; d <= 4; d += 1) {
        const s = latestByWeekDay[`${slot.week}-${d}`];
        if (s) thisWeekStatuses[d] = s;
      }
      setWeekStatuses(thisWeekStatuses);

      const today = list.find(
        (w) => w.week === slot.week && w.day === slot.day && isSameLocalDay(w.createdAt, new Date().toISOString())
      );
      setTodayWorkout(today ?? null);

      const selectedDoneToday = list.some(
        (item) =>
          item.week === slot.week &&
          item.day === slot.day &&
          isSameLocalDay(item.createdAt, new Date().toISOString())
      );

      if (selectedDoneToday) {
        const currentWeekDone = completionMap[slot.week];
        let nextWeek = slot.week;
        let nextDay = slot.day;

        if (currentWeekDone) {
          for (let w = slot.week + 1; w <= 4; w += 1) {
            const pendingDay = [1, 2, 3, 4].find((d) => !latestByWeekDay[`${w}-${d}`]);
            if (pendingDay) {
              nextWeek = w;
              nextDay = pendingDay;
              break;
            }
          }
        } else {
          const pendingNextDay = [slot.day + 1, slot.day + 2, slot.day + 3]
            .filter((d) => d >= 1 && d <= 4)
            .find((d) => !latestByWeekDay[`${slot.week}-${d}`]);
          if (pendingNextDay) nextDay = pendingNextDay;
        }

        if (nextWeek !== slot.week || nextDay !== slot.day) {
          const nextSlot = { ...slot, week: nextWeek, day: nextDay };
          saveSelection(nextSlot);
          setSlot(nextSlot);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [slot, isLoadedSelection]);

  const profile = routine.profiles.find((p) => p.id === slot.profileId) ?? routine.profiles[0];
  const plan = profile?.plans.find((p) => p.id === slot.planId) ?? profile?.plans[0];
  const profilePlans = profile?.plans ?? [];
  const exercisesForSelectedDay = useMemo(
    () => getDayExercises(routine, slot.profileId, slot.planId, slot.week, slot.day),
    [routine, slot.day, slot.planId, slot.profileId, slot.week]
  );

  const markSkipped = () => {
    const payload = buildSkippedWorkoutPayload({
      profileId: slot.profileId,
      planId: slot.planId,
      week: slot.week,
      day: slot.day,
      exercises: exercisesForSelectedDay
    });
    appendWorkoutToHistory(payload);

    const list = loadHistory(slot.profileId, slot.planId);
    const today = list.find(
      (w) => w.week === slot.week && w.day === slot.day && isSameLocalDay(w.createdAt, new Date().toISOString())
    );
    setTodayWorkout(today ?? payload);
    const thisWeekStatuses: Record<number, 'done' | 'skipped'> = {};
    for (let d = 1; d <= 4; d += 1) {
      const latest = list.find((r) => r.week === slot.week && r.day === d);
      if (!latest) continue;
      const status = getWorkoutStatus(latest);
      if (status !== 'ignore') thisWeekStatuses[d] = status;
    }
    setWeekStatuses(thisWeekStatuses);
  };

  const parseManualReps = (value: string): RoutineExercise['reps'] => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^\d+\+\d+\+\d+$/.test(trimmed.replace(/\s+/g, ''))) {
      return trimmed.replace(/\s+/g, '');
    }
    if (/^\d+(-\d+)+$/.test(trimmed.replace(/\s+/g, ''))) {
      return trimmed
        .replace(/\s+/g, '')
        .split('-')
        .map((part) => Number(part));
    }
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
    return trimmed;
  };

  const saveRoutineAndRefresh = (nextRoutine: RoutineDB) => {
    const normalized = saveRoutine(nextRoutine);
    setRoutine(normalized);
  };

  const onCreateProfile = () => {
    const name = newProfileName.trim();
    if (!name) return;

    const profile = createEmptyProfile(
      name,
      routine.profiles.map((item) => item.id)
    );

    const nextRoutine = saveRoutine({
      ...routine,
      profiles: [...routine.profiles, profile]
    });
    setRoutine(nextRoutine);

    const nextSlot = {
      profileId: profile.id,
      planId: profile.plans[0]?.id ?? slot.planId,
      week: 1,
      day: 1
    };
    setSlot(nextSlot);
    saveSelection(nextSlot);
    setNewProfileName('');
    setIsAddingProfile(false);
  };

  const onAddExercise = () => {
    const name = exerciseName.trim();
    const reps = exerciseReps.trim();
    if (!name || !reps) return;

    const nextExercise: RoutineExercise = {
      name,
      reps: parseManualReps(reps),
      type: exerciseType,
      notes: '',
      sets: exerciseSets.trim() ? Number(exerciseSets.trim()) : null
    };

    const nextRoutine = updateDayExercises(
      routine,
      slot.profileId,
      slot.planId,
      slot.week,
      slot.day,
      (exercises) => [...exercises, nextExercise]
    );

    saveRoutineAndRefresh(nextRoutine);
    setExerciseName('');
    setExerciseReps('');
    setExerciseSets('');
    setExerciseType('normal');
  };

  const onDeleteExercise = (index: number) => {
    const nextRoutine = updateDayExercises(
      routine,
      slot.profileId,
      slot.planId,
      slot.week,
      slot.day,
      (exercises) => exercises.filter((_, currentIndex) => currentIndex !== index)
    );
    saveRoutineAndRefresh(nextRoutine);
  };

  return (
    <PageContainer>
      <div>
        <h1 className="text-[34px] font-bold leading-[1.05] tracking-[-0.02em] text-ink">Hoy</h1>
        <p className="mt-2 text-base font-medium text-muted">
          {plan?.name ?? 'Rutina'} · Semana {slot.week} · Día {slot.day}
        </p>
      </div>

      <Card>
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Perfil</p>
            <SegmentedControl
              className="grid-cols-2"
              variant="compact"
              value={slot.profileId}
              onChange={(profileId) => {
                const nextProfile = routine.profiles.find((p) => p.id === profileId);
                const firstPlan = nextProfile?.plans[0];
                setSlot({
                  profileId,
                  planId: firstPlan?.id ?? slot.planId,
                  week: 1,
                  day: 1
                });
              }}
              items={routine.profiles.map((p) => ({ value: p.id, label: p.name }))}
            />
            <div className="mt-3">
              {isAddingProfile ? (
                <div className="space-y-2 rounded-r-sm border border-line bg-neutral-50 p-3">
                  <Input
                    placeholder="Nombre del perfil"
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button className="h-11" onClick={onCreateProfile}>
                      Guardar perfil
                    </Button>
                    <Button
                      className="h-11"
                      variant="secondary"
                      onClick={() => {
                        setIsAddingProfile(false);
                        setNewProfileName('');
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAddingProfile(true)}
                  className="rounded-r-sm border border-dashed border-line px-3 py-2 text-sm font-semibold text-neutral-600 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-soft active:scale-[0.98]"
                >
                  + Agregar perfil
                </button>
              )}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Plan mensual</p>
            <div className="flex flex-wrap gap-2">
              {profilePlans.map((pl) => {
                const active = pl.id === slot.planId;
                return (
                  <button
                    key={pl.id}
                    type="button"
                    onClick={() => setSlot({ ...slot, planId: pl.id, week: 1, day: 1 })}
                    className={`min-h-10 rounded-r-sm border px-3 py-2 text-sm font-semibold transition-all duration-200 ease-out active:scale-[0.98] ${
                      active
                        ? 'border-transparent bg-accent/12 text-accent shadow-soft'
                        : 'border-line bg-surface text-neutral-600 hover:-translate-y-0.5 hover:shadow-soft'
                    }`}
                  >
                    {pl.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Semana</p>
          <SegmentedControl
            className="grid-cols-4"
            variant="compact"
            value={slot.week}
            onChange={(week) => setSlot({ ...slot, week })}
            items={[1, 2, 3, 4].map((week) => ({
              value: week,
              label: `S${week}`,
              rightBadge: weekCompleted[week] ? <span className="text-[11px]">✓</span> : undefined
            }))}
          />
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Día</p>
          <SegmentedControl
            className="grid-cols-4"
            variant="day"
            value={slot.day}
            onChange={(day) => setSlot({ ...slot, day })}
            items={[1, 2, 3, 4].map((day) => ({
              value: day,
              label: `Día ${day}`,
              rightBadge:
                weekStatuses[day] === 'done' ? (
                  <span className="text-[11px]">✓</span>
                ) : weekStatuses[day] === 'skipped' ? (
                  <span className="text-[11px]">⏸</span>
                ) : undefined
            }))}
          />
        </div>
        <Button className="h-14 text-[16px] font-semibold" onClick={() => router.push('/workout')}>
          Entrenar hoy
        </Button>
        <button
          type="button"
          onClick={markSkipped}
          className="h-14 w-full rounded-r-md border border-line bg-surface px-4 py-3 text-sm font-semibold text-neutral-700 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-soft active:scale-[0.98]"
        >
          No entrené hoy
        </button>
      </Card>

      <Card className="space-y-4">
        <div>
          <p className="text-lg font-semibold text-ink">Editar plan del día</p>
          <p className="mt-1 text-sm text-muted">
            {profile?.name ?? 'Perfil'} · {plan?.name ?? 'Plan'} · Semana {slot.week} · Día {slot.day}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Ejercicios actuales</p>
          {exercisesForSelectedDay.length === 0 ? (
            <div className="rounded-r-sm border border-dashed border-line bg-neutral-50 p-3 text-sm text-muted">
              Este día todavía no tiene ejercicios.
            </div>
          ) : (
            <div className="space-y-2">
              {exercisesForSelectedDay.map((exercise, index) => (
                <div key={`${exercise.name}-${index}`} className="flex items-center justify-between gap-3 rounded-r-sm border border-line bg-surface px-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{exercise.name}</p>
                    <p className="text-xs text-muted">
                      Reps:{' '}
                      {Array.isArray(exercise.reps)
                        ? exercise.reps.join('-')
                        : String(exercise.reps)}
                      {' · '}
                      Series: {exercise.sets ?? routine.defaultSetsIfMissing}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteExercise(index)}
                    className="rounded-r-sm border border-line px-3 py-2 text-xs font-semibold text-neutral-600 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-soft active:scale-[0.98]"
                  >
                    Eliminar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-r-sm border border-line bg-neutral-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Agregar ejercicio</p>
          <Input
            placeholder="Nombre del ejercicio"
            value={exerciseName}
            onChange={(e) => setExerciseName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Reps (15 o 15-12-10-8)"
              value={exerciseReps}
              onChange={(e) => setExerciseReps(e.target.value)}
            />
            <Input
              inputMode="numeric"
              placeholder="Series (vacío = 4)"
              value={exerciseSets}
              onChange={(e) => setExerciseSets(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </div>
          <SegmentedControl
            className="grid-cols-2"
            variant="compact"
            value={exerciseType}
            onChange={(value) => setExerciseType(value)}
            items={[
              { value: 'normal', label: 'Normal' },
              { value: 'dropset', label: 'Dropset' }
            ]}
          />
          <Button className="h-11" onClick={onAddExercise}>
            Agregar al día
          </Button>
        </div>
      </Card>

      {todayWorkout ? (
        <Card className="space-y-3">
          <p className="text-sm font-semibold text-accent">Ya guardaste un entrenamiento hoy</p>
          <p className="text-sm text-neutral-600">{formatLocalDateTime(todayWorkout.createdAt)}</p>
          <Button onClick={() => router.push(`/history?id=${todayWorkout.id}`)}>
            Ver entrenamiento de hoy
          </Button>
        </Card>
      ) : null}
    </PageContainer>
  );
}
