import { makeCreatedAtISO } from '@/lib/date';
import type { RoutineExercise, WorkoutRecord } from '@/lib/types';

type SaveWorkoutInput = {
  profileId: string;
  planId: string;
  week: number;
  day: number;
  exercises: RoutineExercise[];
  weights: Record<string, string | number>;
  checks?: Record<string, boolean>;
  createdAt?: string;
};

type SkipWorkoutInput = {
  profileId: string;
  planId: string;
  week: number;
  day: number;
  exercises: RoutineExercise[];
  createdAt?: string;
};

export function buildWorkoutPayload(input: SaveWorkoutInput): WorkoutRecord {
  const { profileId, planId, week, day, exercises, weights, checks, createdAt: createdAtInput } = input;

  const createdAt = createdAtInput ?? makeCreatedAtISO();
  const id = `${profileId}-${planId}-${week}-${day}-${Date.now()}`;
  const exerciseNames = exercises.map((ex) => String(ex?.name ?? ''));

  const weightsByExercise: Record<string, Record<string, string | number>> = {};
  Object.keys(weights).forEach((key) => {
    const parts = key.split('-');
    const exIdx = Number(parts[0]);
    const exName = exerciseNames[exIdx] ?? `exercise_${parts[0]}`;

    if (!weightsByExercise[exName]) {
      weightsByExercise[exName] = {};
    }
    weightsByExercise[exName][key] = weights[key];
  });

  return {
    version: 2,
    id,
    profileId,
    planId,
    week,
    day,
    createdAt,
    exerciseNames,
    exercises: exercises.map((ex) => ({
      name: String(ex?.name ?? ''),
      reps: ex.reps,
      sets: ex.sets ?? null,
      type: ex.type ?? 'normal'
    })),
    weights,
    weightsByExercise,
    checks: checks ?? {}
  };
}

export function buildSkippedWorkoutPayload(input: SkipWorkoutInput): WorkoutRecord {
  const { profileId, planId, week, day, exercises, createdAt: createdAtInput } = input;
  const createdAt = createdAtInput ?? makeCreatedAtISO();
  const id = `${profileId}-${planId}-${week}-${day}-${Date.now()}`;
  const exerciseNames = exercises.map((ex) => String(ex?.name ?? ''));

  return {
    version: 2,
    id,
    profileId,
    planId,
    week,
    day,
    createdAt,
    exerciseNames,
    exercises: exercises.map((ex) => ({
      name: String(ex?.name ?? ''),
      reps: ex.reps,
      sets: ex.sets ?? null,
      type: ex.type ?? 'normal'
    })),
    weights: {},
    weightsByExercise: {},
    checks: {},
    completed: false
  };
}

export function detectDropCount(exercise: RoutineExercise): number {
  const raw = typeof exercise.reps === 'string' ? exercise.reps.replace(/\s+/g, '') : '';
  if (/^\d+\+\d+\+\d+$/.test(raw)) {
    return 3;
  }
  return 0;
}

export function resolveSetCount(exercise: RoutineExercise, defaultSetsIfMissing: number): number {
  if (typeof exercise.sets === 'number' && exercise.sets > 0) {
    return exercise.sets;
  }
  return defaultSetsIfMissing;
}

export function repsToArray(reps: RoutineExercise['reps'], sets: number): (number | string)[] {
  if (Array.isArray(reps)) return reps;
  if (typeof reps === 'string') return Array.from({ length: sets }, () => reps);
  if (typeof reps === 'number') return Array.from({ length: sets }, () => reps);
  return Array.from({ length: sets }, () => '?');
}
