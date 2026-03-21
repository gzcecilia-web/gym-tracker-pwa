'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input, PageContainer, SegmentedControl } from '@/components/ui';
import { getProfileTheme } from '@/lib/profileTheme';
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
    return 'border-line bg-transparent text-muted hover:border-lineStrong hover:bg-[#F6F3EE]';
  }

  const tones: Record<number, string> = {
    1: 'border-[#93BDB6] bg-[#E8F1EF] text-[#5C8E86] shadow-soft',
    2: 'border-[#A8C686] bg-[#EEF5E6] text-[#6F8A5A] shadow-soft',
    3: 'border-[#E5DDBB] bg-[#F7F4E7] text-[#988F63] shadow-soft',
    4: 'border-[#E6C0A5] bg-[#F8EDE5] text-[#B97855] shadow-soft'
  };

  return tones[week] ?? tones[1];
}

function dayToneClass(day: number, active: boolean): string {
  if (!active) {
    return 'border border-transparent bg-[#F1EFEB] text-muted hover:bg-[#EAE5DD]';
  }

  const tones: Record<number, string> = {
    1: 'border-transparent bg-[#7EB6AE] text-white shadow-soft',
    2: 'border-transparent bg-[#8DAE73] text-white shadow-soft',
    3: 'border-transparent bg-[#D8C278] text-[#4F4426] shadow-soft',
    4: 'border-transparent bg-[#D98D62] text-white shadow-soft'
  };

  return tones[day] ?? tones[1];
}

function profileToneClass(profileId: string, active: boolean): string {
  const theme = getProfileTheme(profileId);
  if (active) return `${theme.chip} shadow-soft`;
  return 'border-line bg-surface text-muted hover:bg-[#F1EFEB]';
}

function ChevronIcon({ open = false }: { open?: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-4 w-4 transition-transform duration-200 ease-out ${open ? 'rotate-180' : ''}`}
    >
      <path d="m5 7.5 5 5 5-5" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <circle cx="4" cy="10" r="1.5" />
      <circle cx="10" cy="10" r="1.5" />
      <circle cx="16" cy="10" r="1.5" />
    </svg>
  );
}

function deriveDayFocus(exercises: RoutineExercise[]): string {
  const primary = exercises[0];
  if (!primary) return 'One step at a time';
  if (primary.supersetGroup) return 'Hoy toca moverte con foco';
  const firstName = String(primary.name ?? '').toLowerCase();
  if (firstName.includes('peso muerto') || firstName.includes('sentadilla') || firstName.includes('prensa')) {
    return 'Hoy toca piernas';
  }
  if (firstName.includes('remo') || firstName.includes('dominadas') || firstName.includes('tirones')) {
    return 'Hoy toca espalda';
  }
  if (firstName.includes('press') || firstName.includes('apertura') || firstName.includes('empujes')) {
    return 'Lista para entrenar';
  }
  return 'Let’s move your body';
}

export default function HomePage() {
  const router = useRouter();
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const planMenuRef = useRef<HTMLDivElement | null>(null);
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
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isPlanMenuOpen, setIsPlanMenuOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

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

  useEffect(() => {
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (profileMenuRef.current && target && !profileMenuRef.current.contains(target)) {
        setIsProfileMenuOpen(false);
      }
      if (planMenuRef.current && target && !planMenuRef.current.contains(target)) {
        setIsPlanMenuOpen(false);
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
  const plan = profile?.plans.find((p) => p.id === slot.planId) ?? profile?.plans[0];
  const profilePlans = profile?.plans ?? [];
  const profileTheme = getProfileTheme(slot.profileId);
  const exercisesForSelectedDay = useMemo(
    () => getDayExercises(routine, slot.profileId, slot.planId, slot.week, slot.day),
    [routine, slot.day, slot.planId, slot.profileId, slot.week]
  );
  const trackedDaysThisWeek = Object.keys(weekStatuses).length;
  const completedDaysThisWeek = Object.values(weekStatuses).filter((status) => status === 'done').length;
  const heroTitle = `Hoy, ${profile?.name ?? 'vos'}`;
  const heroSubtitle = `${plan?.name ?? 'Rutina'} · Semana ${slot.week} · Día ${slot.day}`;
  const heroMicrocopy = todayWorkout
    ? 'You showed up today'
    : trackedDaysThisWeek >= 3
      ? 'Vas muy bien esta semana'
      : deriveDayFocus(exercisesForSelectedDay);

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
    setIsProfileMenuOpen(false);
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
    setIsPlanMenuOpen(false);
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
    setIsPlanMenuOpen(false);
  };

  return (
    <PageContainer>
      <section className="space-y-4 rounded-[28px] bg-[linear-gradient(180deg,#FFFDF9_0%,#F8F4EC_100%)] px-6 py-7 shadow-[0_18px_42px_rgba(140,120,90,0.10)]">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Today</p>
            <h1 className="font-display text-[34px] font-bold leading-[0.98] tracking-[-0.03em] text-ink">{heroTitle}</h1>
            <p className="font-warm text-[15px] font-medium text-muted">{heroSubtitle}</p>
            <p className="font-warm text-sm font-medium text-[rgb(var(--profile-accent-rgb))]">{heroMicrocopy}</p>
          </div>
          <div className={`min-w-[74px] rounded-[22px] px-4 py-3 text-center ${profileTheme.softSurface}`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Semana</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{completedDaysThisWeek}/4</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="h-2 overflow-hidden rounded-full bg-[#ECE7DF]">
            <div
              className="h-full rounded-full bg-[rgb(var(--profile-accent-rgb))] transition-all duration-300 ease-out"
              style={{ width: `${(trackedDaysThisWeek / 4) * 100}%` }}
            />
          </div>
          <p className="text-sm text-muted">
            {trackedDaysThisWeek === 0
              ? 'Todavía no registraste esta semana'
              : `${trackedDaysThisWeek} de 4 días ya tienen registro`}
          </p>
        </div>

        <div className="space-y-3">
          <Button className="h-14 text-[16px] font-semibold shadow-float" onClick={() => router.push('/workout')}>
            Entrenar hoy
          </Button>
          <button
            type="button"
            onClick={markSkipped}
            className="w-full text-sm font-medium text-muted transition-colors duration-200 ease-out hover:text-ink"
          >
            No entrené hoy
          </button>
        </div>
      </section>

      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div ref={profileMenuRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setIsProfileMenuOpen((open) => !open);
                setIsPlanMenuOpen(false);
              }}
              className="flex min-h-[56px] w-full items-center justify-between rounded-r-md bg-surface px-4 text-left shadow-card transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-float active:scale-[0.98]"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Perfil</p>
                <p className={`truncate text-sm font-semibold ${profileTheme.text}`}>{profile?.name ?? 'Perfil'}</p>
              </div>
              <span className={profileTheme.softText}>
                <ChevronIcon open={isProfileMenuOpen} />
              </span>
            </button>

            {isProfileMenuOpen ? (
              <Card className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 space-y-3 p-3">
                <div className="space-y-2">
                  {routine.profiles.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        const nextProfile = routine.profiles.find((item) => item.id === p.id);
                        const latestPlan = getLatestPlanForProfile(nextProfile);
                        setSlot({
                          profileId: p.id,
                          planId: latestPlan?.id ?? slot.planId,
                          week: 1,
                          day: 1
                        });
                        setIsProfileMenuOpen(false);
                      }}
                      className={`flex min-h-11 w-full items-center justify-between rounded-r-sm border px-3 py-2 text-sm font-semibold transition-all duration-200 ease-out active:scale-[0.98] ${profileToneClass(
                        p.id,
                        slot.profileId === p.id
                      )}`}
                    >
                      <span className="truncate">{p.name}</span>
                      {slot.profileId === p.id ? <span className="shrink-0 text-xs">Activo</span> : null}
                    </button>
                  ))}
                </div>

                <details className="group rounded-r-sm bg-[#F8F4EC] px-3 py-2">
                  <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-muted">
                    Gestionar perfiles
                    <ChevronIcon />
                  </summary>
                  <div className="mt-3 space-y-2">
                    {isAddingProfile ? (
                      <>
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
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsAddingProfile(true)}
                        className="text-sm font-semibold text-[rgb(var(--profile-accent-rgb))]"
                      >
                        + Agregar perfil
                      </button>
                    )}
                  </div>
                </details>
              </Card>
            ) : null}
          </div>

          <div ref={planMenuRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setIsPlanMenuOpen((open) => !open);
                setIsProfileMenuOpen(false);
              }}
              className="flex min-h-[64px] w-full items-center justify-between rounded-r-md bg-surface px-4 text-left shadow-card transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-float active:scale-[0.98]"
            >
              <div className="min-w-0 flex-1 pr-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Plan</p>
                <p className="mt-0.5 line-clamp-2 text-sm font-semibold leading-tight text-ink">
                  {plan?.name ?? 'Plan'}
                </p>
              </div>
              <span className="shrink-0 text-muted">
                <ChevronIcon open={isPlanMenuOpen} />
              </span>
            </button>

            {isPlanMenuOpen ? (
              <Card className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 space-y-3 p-3">
                <div className="rounded-r-sm bg-[#F8F4EC] px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Plan actual</p>
                  <p className="mt-1 text-sm font-semibold leading-snug text-ink">{plan?.name ?? 'Plan'}</p>
                </div>
                <div className="space-y-2">
                  {profilePlans.map((pl) => (
                    <button
                      key={pl.id}
                      type="button"
                      onClick={() => {
                        setSlot({ ...slot, planId: pl.id, week: 1, day: 1 });
                        setIsEditingPlanName(false);
                        setIsPlanMenuOpen(false);
                      }}
                      className={`flex min-h-[52px] w-full items-start justify-between gap-3 rounded-r-sm border px-3 py-3 text-left text-sm font-semibold transition-all duration-200 ease-out active:scale-[0.98] ${
                        slot.planId === pl.id ? `${profileTheme.chip} shadow-soft` : 'border-line bg-surface text-muted'
                      }`}
                    >
                      <span className="line-clamp-2 leading-snug">{pl.name}</span>
                      {slot.planId === pl.id ? <span className="shrink-0 text-xs">Activo</span> : null}
                    </button>
                  ))}
                </div>

                <details className="group rounded-r-sm bg-[#F8F4EC] px-3 py-2">
                  <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-muted">
                    Acciones del plan
                    <ChevronIcon />
                  </summary>
                  <div className="mt-3 space-y-3">
                    {isAddingPlan ? (
                      <div className="space-y-2">
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
                      <button type="button" onClick={() => setIsAddingPlan(true)} className="text-sm font-semibold text-[rgb(var(--profile-accent-rgb))]">
                        + Nuevo plan
                      </button>
                    )}

                    <button type="button" onClick={onDuplicatePlan} className="flex items-center gap-2 text-sm font-medium text-muted">
                      <DotsIcon />
                      Duplicar plan actual
                    </button>

                    {isEditingPlanName ? (
                      <div className="space-y-2">
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
                        className="text-sm font-medium text-muted"
                      >
                        Editar nombre
                      </button>
                    )}
                  </div>
                </details>
              </Card>
            ) : null}
          </div>
        </div>
      </div>

      <Card className="space-y-5 border-none bg-surface/70 shadow-[0_10px_30px_rgba(120,110,90,0.05)]">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Ritmo de la semana</p>
          <h2 className="font-warm text-xl font-semibold text-ink">Elegí dónde estás hoy</h2>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Semana</p>
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((week) => {
              const active = slot.week === week;
              return (
                <button
                  key={week}
                  type="button"
                  onClick={() => setSlot({ ...slot, week })}
                  className={`flex h-11 items-center justify-center gap-1 rounded-r-md border px-3 text-sm font-semibold transition-all duration-200 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-profile/25 ${weekToneClass(week, active)}`}
                >
                  <span>{`S${week}`}</span>
                  {weekCompleted[week] ? <span className="text-[11px]">✓</span> : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Día</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[1, 2, 3, 4].map((day) => {
              const active = slot.day === day;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSlot({ ...slot, day })}
                  className={`flex h-12 items-center justify-center gap-1 rounded-r-md px-3 text-sm font-semibold transition-all duration-200 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-profile/25 ${dayToneClass(day, active)}`}
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
      </Card>

      <Card className="space-y-4 border-none bg-transparent p-0 shadow-none">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Plan del día</p>
            <h3 className="font-warm mt-1 text-lg font-semibold text-ink">
              {exercisesForSelectedDay.length > 0 ? `${exercisesForSelectedDay.length} ejercicios cargados` : 'Día todavía vacío'}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setIsEditorOpen((open) => !open)}
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-surface px-4 text-sm font-semibold text-ink shadow-card transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-float active:scale-[0.98]"
          >
            {isEditorOpen ? 'Ocultar edición' : 'Editar plan'}
            <ChevronIcon open={isEditorOpen} />
          </button>
        </div>

        {isEditorOpen ? (
          <Card className="space-y-5 bg-surfaceSoft p-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Ejercicios actuales</p>
              {exercisesForSelectedDay.length === 0 ? (
                <div className="rounded-r-md bg-surface px-4 py-4 text-sm text-muted shadow-soft">
                  Este día todavía no tiene ejercicios.
                </div>
              ) : (
                <div className="space-y-2">
                  {exercisesForSelectedDay.map((exercise, index) =>
                    groupedExerciseKeys.has(index) ? (
                      <div
                        key={`${exercise.name}-${index}`}
                        className="flex items-start justify-between gap-3 rounded-r-md bg-surface px-4 py-3 shadow-soft"
                      >
                        <div className="min-w-0">
                          <p className="font-warm text-base font-semibold text-ink">{exercise.name}</p>
                          <p className="mt-1 text-xs text-muted">
                            {Array.isArray(exercise.reps) ? exercise.reps.join('-') : String(exercise.reps)} · {exercise.sets ?? routine.defaultSetsIfMissing} series
                            {exercise.supersetGroup ? ' · Superserie' : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <button
                            type="button"
                            onClick={() => onStartEditExercise(index)}
                            className="text-xs font-semibold text-muted transition-colors duration-200 ease-out hover:text-ink"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteExercise(index)}
                            className="text-xs font-semibold text-muted transition-colors duration-200 ease-out hover:text-[rgb(var(--profile-accent-rgb))]"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    ) : null
                  )}
                </div>
              )}
            </div>

            <div className="space-y-4 rounded-r-md bg-surface px-4 py-4 shadow-soft">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                  {editingIndexes ? 'Editar ejercicio' : 'Agregar ejercicio'}
                </p>
                <p className="text-sm text-muted">Mantené el día ordenado y sumá solo lo necesario.</p>
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

              <div className="space-y-3">
                <Input
                  placeholder="Nombre del ejercicio"
                  value={exerciseName}
                  onChange={(e) => setExerciseName(e.target.value)}
                />
                {exerciseType === 'superset' ? (
                  <Input
                    placeholder="Segundo ejercicio de la superserie"
                    value={exerciseNameB}
                    onChange={(e) => setExerciseNameB(e.target.value)}
                  />
                ) : null}
                <div className="grid grid-cols-2 gap-3">
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
              </div>

              <div className="flex gap-2">
                <Button className="h-11" onClick={editingIndexes ? onSaveExerciseEdits : onAddExercise}>
                  {editingIndexes ? 'Guardar cambios' : 'Agregar al día'}
                </Button>
                {editingIndexes ? (
                  <Button className="h-11" variant="secondary" onClick={resetExerciseForm}>
                    Cancelar
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>
        ) : null}
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
