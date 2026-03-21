import { makeCreatedAtISO } from '@/lib/date';
import type { RoutineExercise, WorkoutRecord } from '@/lib/types';

type SaveWorkoutInput = {
  profileId: string;
  planId: string;
  week: number;
  day: number;
  exercises: RoutineExercise[];
  weights: Record<string, string | number>;
  performedReps?: Record<string, string | number>;
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
  const { profileId, planId, week, day, exercises, weights, performedReps, checks, createdAt: createdAtInput } = input;

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
    performedReps: performedReps ?? {},
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

function toDisplayWeight(value: string | number): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '';
  return `${normalized} kg`;
}

export function summarizeExerciseWeights(
  weights: Record<string, string | number> | undefined
): string[] {
  if (!weights) return [];

  const entries = Object.entries(weights);
  const setEntries = entries
    .map(([key, value]) => {
      const match = key.match(/^\d+-(\d+)(?:-drop(\d+))?$/);
      if (!match) return null;
      return {
        key,
        setIdx: Number(match[1]),
        dropIdx: match[2] ? Number(match[2]) : null,
        value
      };
    })
    .filter(Boolean) as Array<{ key: string; setIdx: number; dropIdx: number | null; value: string | number }>;

  if (setEntries.length > 0) {
    const grouped = new Map<number, Array<{ dropIdx: number | null; value: string | number }>>();
    for (const entry of setEntries) {
      const current = grouped.get(entry.setIdx) ?? [];
      current.push({ dropIdx: entry.dropIdx, value: entry.value });
      grouped.set(entry.setIdx, current);
    }

    return Array.from(grouped.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([setIdx, values]) => {
        const ordered = values.sort((a, b) => {
          const left = a.dropIdx ?? 0;
          const right = b.dropIdx ?? 0;
          return left - right;
        });
        const rendered = ordered.map((entry) => toDisplayWeight(entry.value)).filter(Boolean).join(' / ');
        return `Serie ${setIdx + 1}: ${rendered}`;
      })
      .filter(Boolean);
  }

  const sameEntry = entries.find(([key]) => key.endsWith('-same'));
  if (!sameEntry) return [];
  return [`Mismo peso: ${toDisplayWeight(sameEntry[1])}`];
}

export function findLatestExerciseWeights(
  history: WorkoutRecord[],
  exerciseName: string
): Record<string, string | number> | null {
  for (const workout of history) {
    const weightMap = workout.weightsByExercise?.[exerciseName];
    if (weightMap && Object.keys(weightMap).length > 0) {
      return weightMap;
    }
  }
  return null;
}
