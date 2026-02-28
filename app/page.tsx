'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, PageContainer, SegmentedControl } from '@/components/ui';
import { defaultSlot, getDayExercises, getRoutineFromBundle } from '@/lib/routine';
import { isSameLocalDay, formatLocalDateTime } from '@/lib/date';
import {
  appendWorkoutToHistory,
  loadHistory,
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
