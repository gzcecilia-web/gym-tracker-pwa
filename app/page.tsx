'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input, PageContainer, SegmentedControl, Select } from '@/components/ui';
import { addPlanToProfile, createEmptyPlan, createEmptyProfile, defaultSlot, duplicatePlanInProfile, getDayExercises, getLatestPlanForProfile, updateDayExercises, updatePlanName } from '@/lib/routine';
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
  const safePlan = safeProfile?.plans.find((p) => p.id === slot.planId) ?? getLatestPlanForProfile(safeProfile);

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

function weekToneClass(week: number, active: boolean): string {
  if (!active) {
    return 'border-line bg-transparent text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50';
  }

  const tones: Record<number, string> = {
    1: 'border-amber-200 bg-amber-50 text-amber-700 shadow-soft',
    2: 'border-rose-200 bg-rose-50 text-rose-700 shadow-soft',
    3: 'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-soft',
    4: 'border-sky-200 bg-sky-50 text-sky-700 shadow-soft'
  };

  return tones[week] ?? tones[1];
}

function dayToneClass(day: number, active: boolean): string {
  if (!active) {
    return 'border border-transparent bg-neutral-100 text-neutral-700 hover:bg-neutral-200';
  }

  const tones: Record<number, string> = {
    1: 'border-transparent bg-rose-500 text-white shadow-soft',
    2: 'border-transparent bg-amber-500 text-white shadow-soft',
    3: 'border-transparent bg-emerald-500 text-white shadow-soft',
    4: 'border-transparent bg-sky-500 text-white shadow-soft'
  };

  return tones[day] ?? tones[1];
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
  const [exerciseNameB, setExerciseNameB] = useState('');
  const [exerciseReps, setExerciseReps] = useState('');
  const [exerciseSets, setExerciseSets] = useState('');
  const [exerciseType, setExerciseType] = useState<'normal' | 'dropset' | 'superset'>('normal');
  const [editingIndexes, setEditingIndexes] = useState<number[] | null>(null);
  const [isEditingPlanName, setIsEditingPlanName] = useState(false);
  const [planNameDraft, setPlanNameDraft] = useState('');
  const [isAddingPlan, setIsAddingPlan] = useState(false);
  const [newPlanName, setNewPlanName] = useState('');

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

  const groupedExerciseKeys = useMemo(() => {
    const seen = new Set<string>();
    const out = new Set<number>();

    exercisesForSelectedDay.forEach((exercise, index) => {
      const group = exercise.supersetGroup?.trim();
      if (!group) {
        out.add(index);
        return;
      }
      if (seen.has(group)) return;
      seen.add(group);
      out.add(index);
    });

    return out;
  }, [exercisesForSelectedDay]);

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

  const resetExerciseForm = () => {
    setExerciseName('');
    setExerciseNameB('');
    setExerciseReps('');
    setExerciseSets('');
    setExerciseType('normal');
    setEditingIndexes(null);
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

  const buildExercisesFromForm = (): RoutineExercise[] | null => {
    const name = exerciseName.trim();
    const nameB = exerciseNameB.trim();
    const reps = exerciseReps.trim();
    if (!name || !reps) return null;
    if (exerciseType === 'superset' && !nameB) return null;

    const parsedReps = parseManualReps(reps);
    const parsedSets = exerciseSets.trim() ? Number(exerciseSets.trim()) : null;
    return (
      exerciseType === 'superset'
        ? [
            {
              name,
              reps: parsedReps,
              type: 'normal',
              notes: '',
              sets: parsedSets,
              supersetGroup: `${name} + ${nameB}`
            },
            {
              name: nameB,
              reps: parsedReps,
              type: 'normal',
              notes: '',
              sets: parsedSets,
              supersetGroup: `${name} + ${nameB}`
            }
          ]
        : [
            {
              name,
              reps: parsedReps,
              type: exerciseType,
              notes: '',
              sets: parsedSets
            }
          ]
    );
  };

  const onAddExercise = () => {
    const nextExercises = buildExercisesFromForm();
    if (!nextExercises) return;

    const nextRoutine = updateDayExercises(
      routine,
      slot.profileId,
      slot.planId,
      slot.week,
      slot.day,
      (exercises) => [...exercises, ...nextExercises]
    );

    saveRoutineAndRefresh(nextRoutine);
    resetExerciseForm();
  };

  const onStartEditExercise = (index: number) => {
    const exercise = exercisesForSelectedDay[index];
    if (!exercise) return;

    const group = exercise.supersetGroup?.trim();
    if (group) {
      const pairIndexes = exercisesForSelectedDay
        .map((item, currentIndex) => ({ item, currentIndex }))
        .filter(({ item }) => item.supersetGroup?.trim() === group)
        .map(({ currentIndex }) => currentIndex);

      const first = exercisesForSelectedDay[pairIndexes[0]];
      const second = exercisesForSelectedDay[pairIndexes[1]];

      setExerciseType('superset');
      setExerciseName(first?.name ?? '');
      setExerciseNameB(second?.name ?? '');
      setExerciseReps(
        Array.isArray(first?.reps) ? first.reps.join('-') : String(first?.reps ?? '')
      );
      setExerciseSets(first?.sets ? String(first.sets) : '');
      setEditingIndexes(pairIndexes);
      return;
    }

    setExerciseType(exercise.type === 'dropset' ? 'dropset' : 'normal');
    setExerciseName(exercise.name ?? '');
    setExerciseNameB('');
    setExerciseReps(Array.isArray(exercise.reps) ? exercise.reps.join('-') : String(exercise.reps ?? ''));
    setExerciseSets(exercise.sets ? String(exercise.sets) : '');
    setEditingIndexes([index]);
  };

  const onSaveExerciseEdits = () => {
    if (!editingIndexes?.length) return;
    const nextExercises = buildExercisesFromForm();
    if (!nextExercises) return;

    const sortedIndexes = [...editingIndexes].sort((a, b) => a - b);
    const startIndex = sortedIndexes[0];

    const nextRoutine = updateDayExercises(
      routine,
      slot.profileId,
      slot.planId,
      slot.week,
      slot.day,
      (exercises) => {
        const remaining = exercises.filter((_, index) => !sortedIndexes.includes(index));
        return [
          ...remaining.slice(0, startIndex),
          ...nextExercises,
          ...remaining.slice(startIndex)
        ];
      }
    );

    saveRoutineAndRefresh(nextRoutine);
    resetExerciseForm();
  };

  const onDeleteExercise = (index: number) => {
    const exercise = exercisesForSelectedDay[index];
    const group = exercise?.supersetGroup?.trim();

    const nextRoutine = updateDayExercises(
      routine,
      slot.profileId,
      slot.planId,
      slot.week,
      slot.day,
      (exercises) =>
        exercises.filter((item, currentIndex) => {
          if (currentIndex === index) return false;
          if (group && item.supersetGroup?.trim() === group) return false;
          return true;
        })
    );
    saveRoutineAndRefresh(nextRoutine);
  };

  const onSavePlanName = () => {
    const nextName = planNameDraft.trim();
    if (!nextName) return;
    const nextRoutine = updatePlanName(routine, slot.profileId, slot.planId, nextName);
    saveRoutineAndRefresh(nextRoutine);
    setIsEditingPlanName(false);
  };

  const onCreatePlan = () => {
    const name = newPlanName.trim();
    if (!name || !profile) return;

    const plan = createEmptyPlan(
      name,
      profile.plans.map((item) => item.id)
    );
    const nextRoutine = addPlanToProfile(routine, slot.profileId, plan);
    saveRoutineAndRefresh(nextRoutine);

    const nextSlot = {
      ...slot,
      planId: plan.id,
      week: 1,
      day: 1
    };
    setSlot(nextSlot);
    saveSelection(nextSlot);
    setNewPlanName('');
    setIsAddingPlan(false);
  };

  const onDuplicatePlan = () => {
    const result = duplicatePlanInProfile(
      routine,
      slot.profileId,
      slot.planId,
      `${plan?.name ?? 'Plan'} copia`
    );

    if (!result.duplicatedPlanId) return;

    saveRoutineAndRefresh(result.routine);
    const nextSlot = {
      ...slot,
      planId: result.duplicatedPlanId,
      week: 1,
      day: 1
    };
    setSlot(nextSlot);
    saveSelection(nextSlot);
  };

  return (
    <PageContainer>
      <div>
        <h1 className="font-display text-[36px] font-bold leading-[1.02] tracking-[-0.03em] text-ink">Hoy</h1>
        <p className="font-warm mt-2 text-base font-medium text-muted">
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
                const latestPlan = getLatestPlanForProfile(nextProfile);
                setSlot({
                  profileId,
                  planId: latestPlan?.id ?? slot.planId,
                  week: 1,
                  day: 1
                });
              }}
              items={routine.profiles.map((p) => ({ value: p.id, label: p.name }))}
            />
            <div className="mt-3">
              {isAddingProfile ? (
                <div className="space-y-2 rounded-r-md border border-line bg-surfaceSoft p-3">
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
                  className="rounded-r-md border border-dashed border-line px-3 py-2 text-sm font-semibold text-muted transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#F1EFEB] hover:shadow-soft active:scale-[0.98]"
                >
                  + Agregar perfil
                </button>
              )}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Plan mensual</p>
            <div className="space-y-3">
              <Select
                value={slot.planId}
                onChange={(e) => {
                  setSlot({ ...slot, planId: e.target.value, week: 1, day: 1 });
                  setIsEditingPlanName(false);
                }}
              >
                {profilePlans.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {pl.name}
                  </option>
                ))}
              </Select>
              {isAddingPlan ? (
                <div className="space-y-2 rounded-r-md border border-line bg-surfaceSoft p-3">
                  <Input
                    placeholder="Nombre del plan"
                    value={newPlanName}
                    onChange={(e) => setNewPlanName(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button className="h-11" onClick={onCreatePlan}>
                      Guardar plan
                    </Button>
                    <Button
                      className="h-11"
                      variant="secondary"
                      onClick={() => {
                        setIsAddingPlan(false);
                        setNewPlanName('');
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAddingPlan(true)}
                  className="rounded-r-md border border-dashed border-line px-3 py-2 text-sm font-semibold text-muted transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#F1EFEB] hover:shadow-soft active:scale-[0.98]"
                >
                  + Agregar plan
                </button>
              )}
              <button
                type="button"
                onClick={onDuplicatePlan}
                className="rounded-r-md border border-dashed border-line px-3 py-2 text-sm font-semibold text-muted transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#F1EFEB] hover:shadow-soft active:scale-[0.98]"
              >
                Duplicar plan actual
              </button>
              {isEditingPlanName ? (
                <div className="space-y-2 rounded-r-md border border-line bg-surfaceSoft p-3">
                  <Input
                    placeholder="Nombre del plan"
                    value={planNameDraft}
                    onChange={(e) => setPlanNameDraft(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button className="h-11" onClick={onSavePlanName}>
                      Guardar nombre
                    </Button>
                    <Button
                      className="h-11"
                      variant="secondary"
                      onClick={() => {
                        setIsEditingPlanName(false);
                        setPlanNameDraft(plan?.name ?? '');
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setPlanNameDraft(plan?.name ?? '');
                    setIsEditingPlanName(true);
                  }}
                  className="rounded-r-md border border-dashed border-line px-3 py-2 text-sm font-semibold text-muted transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#F1EFEB] hover:shadow-soft active:scale-[0.98]"
                >
                  Editar nombre del plan
                </button>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Semana</p>
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((week) => {
              const active = slot.week === week;
              return (
                <button
                  key={week}
                  type="button"
                  onClick={() => setSlot({ ...slot, week })}
                  className={`flex h-10 items-center justify-center gap-1 rounded-r-sm border px-3 text-sm font-semibold transition-all duration-200 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${weekToneClass(week, active)}`}
                >
                  <span>{`S${week}`}</span>
                  {weekCompleted[week] ? <span className="text-[11px]">✓</span> : null}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Día</p>
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((day) => {
              const active = slot.day === day;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSlot({ ...slot, day })}
                  className={`flex h-11 items-center justify-center gap-1 rounded-r-sm px-3 text-sm font-semibold transition-all duration-200 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${dayToneClass(day, active)}`}
                >
                  <span>{`Día ${day}`}</span>
                  {weekStatuses[day] === 'done' ? (
                    <span className="text-[11px]">✓</span>
                  ) : weekStatuses[day] === 'skipped' ? (
                    <span className="text-[11px]">⏸</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
        <Button className="h-14 text-[16px] font-semibold shadow-float" onClick={() => router.push('/workout')}>
          Entrenar hoy
        </Button>
        <button
          type="button"
          onClick={markSkipped}
          className="h-14 w-full rounded-r-md border border-line bg-surface px-4 py-3 text-sm font-semibold text-ink transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#F1EFEB] hover:shadow-soft active:scale-[0.98]"
        >
          No entrené hoy
        </button>
      </Card>

      <Card className="space-y-4">
        <div>
          <p className="font-warm text-lg font-semibold text-ink">Editar plan del día</p>
          <p className="mt-1 text-sm text-muted">
            {profile?.name ?? 'Perfil'} · {plan?.name ?? 'Plan'} · Semana {slot.week} · Día {slot.day}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Ejercicios actuales</p>
          {exercisesForSelectedDay.length === 0 ? (
            <div className="rounded-r-md border border-dashed border-line bg-surfaceSoft p-3 text-sm text-muted">
              Este día todavía no tiene ejercicios.
            </div>
          ) : (
            <div className="space-y-2">
              {exercisesForSelectedDay.map((exercise, index) => (
                groupedExerciseKeys.has(index) ? (
                <div key={`${exercise.name}-${index}`} className="flex items-center justify-between gap-3 rounded-r-md border border-line bg-surface px-3 py-3 shadow-soft">
                  <div className="min-w-0">
                    <p className="font-warm text-sm font-semibold text-ink">{exercise.name}</p>
                    <p className="text-xs text-muted">
                      Reps:{' '}
                      {Array.isArray(exercise.reps)
                        ? exercise.reps.join('-')
                        : String(exercise.reps)}
                      {' · '}
                      Series: {exercise.sets ?? routine.defaultSetsIfMissing}
                      {exercise.supersetGroup ? ' · Superserie' : ''}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onStartEditExercise(index)}
                      className="rounded-r-md border border-line px-3 py-2 text-xs font-semibold text-muted transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#F1EFEB] hover:shadow-soft active:scale-[0.98]"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteExercise(index)}
                      className="rounded-r-md border border-line px-3 py-2 text-xs font-semibold text-muted transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#F1EFEB] hover:shadow-soft active:scale-[0.98]"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
                ) : null
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-r-md border border-line bg-surfaceSoft p-3">
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
            className="grid-cols-3"
            variant="compact"
            value={exerciseType}
            onChange={(value) => setExerciseType(value)}
            items={[
              { value: 'normal', label: 'Normal' },
              { value: 'dropset', label: 'Dropset' },
              { value: 'superset', label: 'Superserie' }
            ]}
          />
          {exerciseType === 'superset' ? (
            <Input
              placeholder="Segundo ejercicio de la superserie"
              value={exerciseNameB}
              onChange={(e) => setExerciseNameB(e.target.value)}
            />
          ) : null}
          <div className="flex gap-2">
            <Button className="h-11" onClick={editingIndexes ? onSaveExerciseEdits : onAddExercise}>
              {editingIndexes ? 'Guardar cambios' : 'Agregar al día'}
            </Button>
            {editingIndexes ? (
              <Button className="h-11" variant="secondary" onClick={resetExerciseForm}>
                Cancelar edición
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      {todayWorkout ? (
        <Card className="space-y-3">
          <p className="font-warm text-sm font-semibold text-brown">Ya registraste un entrenamiento hoy</p>
          <p className="text-sm text-muted">{formatLocalDateTime(todayWorkout.createdAt)}</p>
          <Button onClick={() => router.push(`/history?id=${todayWorkout.id}`)}>
            Ver entrenamiento de hoy
          </Button>
        </Card>
      ) : null}
    </PageContainer>
  );
}
