import routineJson from '@/data/routine.json';
import type { RoutineDB, RoutineDay, RoutineExercise, RoutinePlan, RoutineProfile } from '@/lib/types';

const FALLBACK_SETS = 4;

function isDropRepString(reps: RoutineExercise['reps']): boolean {
  if (typeof reps !== 'string') return false;
  return /^\d+\+\d+\+\d+$/.test(reps.replace(/\s+/g, ''));
}

function cleanExerciseName(name: string): string {
  const noisyFragments = [
    'P R I M E R A S E M A N A',
    'S E G U N D A S E M A N A',
    'T E R C E R A S E M A N A',
    'C U A R T A S E M A N A',
    'EJERCICIO',
    'SERIES',
    'REPETICIONES'
  ];

  let cleaned = name;
  for (const fragment of noisyFragments) {
    cleaned = cleaned.replace(new RegExp(fragment, 'gi'), ' ');
  }
  return cleaned.replace(/\s+/g, ' ').trim();
}

function normalizeExercise(ex: RoutineExercise, defaultSetsIfMissing: number): RoutineExercise {
  const normalizedType = ex.type ?? (isDropRepString(ex.reps) ? 'dropset' : 'normal');
  const normalizedName = cleanExerciseName(String(ex.name ?? ''));

  if (ex.sets === undefined || ex.sets === null) {
    return {
      ...ex,
      name: normalizedName,
      sets: null,
      type: normalizedType,
      notes: ex.notes ?? ''
    };
  }

  return {
    ...ex,
    name: normalizedName,
    type: normalizedType,
    notes: ex.notes ?? '',
    sets: ex.sets || defaultSetsIfMissing
  };
}

function normalizeDay(day: RoutineDay, defaultSetsIfMissing: number): RoutineDay {
  return {
    ...day,
    exercises: day.exercises.map((ex) => normalizeExercise(ex, defaultSetsIfMissing)).filter((ex) => ex.name.length > 0)
  };
}

function normalizePlan(plan: RoutinePlan, defaultSetsIfMissing: number): RoutinePlan {
  return {
    ...plan,
    weeks: plan.weeks.map((week) => ({
      ...week,
      days: week.days.map((day) => normalizeDay(day, defaultSetsIfMissing))
    }))
  };
}

function normalizeProfile(profile: RoutineProfile, defaultSetsIfMissing: number): RoutineProfile {
  return {
    ...profile,
    plans: profile.plans.map((plan) => normalizePlan(plan, defaultSetsIfMissing))
  };
}

export function getRoutineFromBundle(): RoutineDB {
  const raw = routineJson as RoutineDB;
  const defaultSetsIfMissing = raw.defaultSetsIfMissing ?? FALLBACK_SETS;
  return {
    defaultSetsIfMissing,
    profiles: raw.profiles.map((profile) => normalizeProfile(profile, defaultSetsIfMissing))
  };
}

export function getDayExercises(
  db: RoutineDB,
  profileId: string,
  planId: string,
  week: number,
  day: number
): RoutineExercise[] {
  const profile = db.profiles.find((p) => p.id === profileId);
  const plan = profile?.plans.find((p) => p.id === planId);
  const weekData = plan?.weeks.find((w) => w.week === week);
  const dayData = weekData?.days.find((d) => d.day === day);
  return dayData?.exercises ?? [];
}

export function defaultSlot(db: RoutineDB) {
  const profile = db.profiles[0];
  const plan = profile?.plans[0];
  return {
    profileId: profile?.id ?? 'cecilia',
    planId: plan?.id ?? 'cecilia-rutina-6',
    week: 1,
    day: 1
  };
}
