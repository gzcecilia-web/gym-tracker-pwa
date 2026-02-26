'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card } from '@/components/ui';
import { defaultSlot, getDayExercises, getRoutineFromBundle } from '@/lib/routine';
import { isSameLocalDay, formatLocalDateTime } from '@/lib/date';
import { getProfileTheme } from '@/lib/profileTheme';
import {
  appendWorkoutToHistory,
  loadHistory,
  loadSelection,
  migrateIfNeeded,
  saveSelection
} from '@/lib/storage';
import { buildSkippedWorkoutPayload } from '@/lib/workout';
import type { RoutineDB, SelectedSlot, WorkoutRecord } from '@/lib/types';

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
  const routine = useMemo<RoutineDB>(() => getRoutineFromBundle(), []);
  const fallback = useMemo(() => defaultSlot(routine), [routine]);

  const [slot, setSlot] = useState<SelectedSlot>(fallback);
  const [isLoadedSelection, setIsLoadedSelection] = useState(false);
  const [todayWorkout, setTodayWorkout] = useState<WorkoutRecord | null>(null);
  const [weekStatuses, setWeekStatuses] = useState<Record<number, 'done' | 'skipped'>>({});
  const [allStatuses, setAllStatuses] = useState<Record<string, 'done' | 'skipped'>>({});
  const [weekCompleted, setWeekCompleted] = useState<Record<number, boolean>>({});

  useEffect(() => {
    migrateIfNeeded();
    const selected = normalizeSlot(loadSelection(fallback), routine, fallback);
    setSlot(selected);
    saveSelection(selected);
    setIsLoadedSelection(true);
  }, [fallback, routine]);

  useEffect(() => {
    if (!isLoadedSelection) return;
    saveSelection(slot);
    const list = loadHistory(slot.profileId, slot.planId);
    const latestByWeekDay: Record<string, 'done' | 'skipped'> = {};
    for (const item of list) {
      const key = `${item.week}-${item.day}`;
      if (!latestByWeekDay[key]) {
        const status = getWorkoutStatus(item);
        if (status !== 'ignore') latestByWeekDay[key] = status;
      }
    }
    setAllStatuses(latestByWeekDay);

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

    const today = list.find((w) => w.week === slot.week && w.day === slot.day && isSameLocalDay(w.createdAt, new Date().toISOString()));
    setTodayWorkout(today ?? null);

    // Auto-avance solo cuando el día seleccionado se guardó HOY.
    // Evita bloquear selección manual en semanas/días históricos.
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
  }, [slot, isLoadedSelection]);

  const profile = routine.profiles.find((p) => p.id === slot.profileId) ?? routine.profiles[0];
  const plan = profile?.plans.find((p) => p.id === slot.planId) ?? profile?.plans[0];
  const profilePlans = profile?.plans ?? [];
  const theme = getProfileTheme(slot.profileId);
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

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-xs uppercase tracking-wider text-neutral-500">Gym Tracker</p>
        <h1 className="mt-1 text-2xl font-bold">Hoy</h1>
        <div className="mt-3 space-y-3">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Perfil</p>
            <div className="flex flex-wrap gap-2">
              {routine.profiles.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    const firstPlan = p.plans[0];
                    setSlot({
                      profileId: p.id,
                      planId: firstPlan?.id ?? slot.planId,
                      week: 1,
                      day: 1
                    });
                  }}
                  className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
                    p.id === slot.profileId
                      ? theme.chip
                      : 'border-neutral-200 text-neutral-600'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Plan mensual</p>
            <div className="flex flex-wrap gap-2">
              {profilePlans.map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => setSlot({ ...slot, planId: pl.id, week: 1, day: 1 })}
                  className={`rounded-xl border px-3 py-1.5 text-sm font-semibold ${
                    pl.id === slot.planId
                      ? theme.chip
                      : 'border-neutral-200 text-neutral-600'
                  }`}
                >
                  {pl.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-semibold text-neutral-600">Semana</p>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((w) => {
              const active = w === slot.week;
              const complete = weekCompleted[w];
              return (
                <button
                  key={w}
                  type="button"
                  onClick={() => setSlot({ ...slot, week: w })}
                  className={`rounded-lg border px-3 py-2 text-center text-sm font-semibold ${
                    active
                      ? theme.chip
                      : complete
                      ? 'border-olive/50 bg-olive/10 text-olive'
                      : 'border-neutral-200 text-neutral-600'
                  }`}
                >
                  S{w} {complete ? '✓' : ''}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-neutral-600">Día</p>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((d) => {
              const status = weekStatuses[d];
              const active = d === slot.day;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSlot({ ...slot, day: d })}
                  className={`rounded-lg border px-3 py-2 text-center text-xs font-semibold ${
                    active
                      ? theme.chip
                      : status === 'done'
                      ? 'border-olive/50 bg-olive/10 text-olive'
                      : status === 'skipped'
                      ? 'border-amber-300 bg-amber-50 text-amber-700'
                      : 'border-neutral-200 text-neutral-500'
                  }`}
                >
                  Día {d} {status === 'done' ? '✓' : status === 'skipped' ? '⏸' : ''}
                </button>
              );
            })}
          </div>
        </div>
        <Button className={theme.trainButton} onClick={() => router.push('/workout')}>
          Entrenar hoy
        </Button>
        <button
          type="button"
          onClick={markSkipped}
          className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-700"
        >
          No entrené hoy
        </button>
      </Card>

      {todayWorkout ? (
        <Card className="space-y-3 border border-olive/20">
          <p className={`text-sm font-semibold ${theme.softText}`}>Ya guardaste un entrenamiento hoy</p>
          <p className="text-sm text-neutral-600">{formatLocalDateTime(todayWorkout.createdAt)}</p>
          <Button className={theme.button} onClick={() => router.push(`/history?id=${todayWorkout.id}`)}>
            Ver entrenamiento de hoy
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
