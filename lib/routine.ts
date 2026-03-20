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
      notes: ex.notes ?? '',
      supersetGroup: ex.supersetGroup?.trim() || undefined
    };
  }

  return {
    ...ex,
    name: normalizedName,
    type: normalizedType,
    notes: ex.notes ?? '',
    supersetGroup: ex.supersetGroup?.trim() || undefined,
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

export function normalizeRoutine(raw: RoutineDB): RoutineDB {
  const defaultSetsIfMissing = raw.defaultSetsIfMissing ?? FALLBACK_SETS;
  return {
    defaultSetsIfMissing,
    profiles: raw.profiles.map((profile) => normalizeProfile(profile, defaultSetsIfMissing))
  };
}

export function getRoutineFromBundle(): RoutineDB {
  const raw = routineJson as RoutineDB;
  return normalizeRoutine(raw);
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

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();
}

export function createEmptyProfile(name: string, existingIds: string[] = []): RoutineProfile {
  const baseId = slugify(name) || 'perfil';
  let profileId = baseId;
  let counter = 2;

  while (existingIds.includes(profileId)) {
    profileId = `${baseId}-${counter}`;
    counter += 1;
  }

  const planId = `${profileId}-plan-1`;

  return {
    id: profileId,
    name: name.trim(),
    plans: [
      {
        id: planId,
        name: `Plan inicial (${name.trim()})`,
        weeks: [1, 2, 3, 4].map((week) => ({
          week,
          days: [1, 2, 3, 4].map((day) => ({
            day,
            exercises: []
          }))
        }))
      }
    ]
  };
}

function uniqueId(baseId: string, existingIds: string[]): string {
  let nextId = baseId;
  let counter = 2;

  while (existingIds.includes(nextId)) {
    nextId = `${baseId}-${counter}`;
    counter += 1;
  }

  return nextId;
}

export function createEmptyPlan(name: string, existingIds: string[] = []): RoutinePlan {
  const baseId = slugify(name) || 'plan';
  const planId = uniqueId(baseId, existingIds);

  return {
    id: planId,
    name: name.trim(),
    weeks: [1, 2, 3, 4].map((week) => ({
      week,
      days: [1, 2, 3, 4].map((day) => ({
        day,
        exercises: []
      }))
    }))
  };
}

export function updateDayExercises(
  db: RoutineDB,
  profileId: string,
  planId: string,
  week: number,
  day: number,
  updater: (exercises: RoutineExercise[]) => RoutineExercise[]
): RoutineDB {
  return {
    ...db,
    profiles: db.profiles.map((profile) => {
      if (profile.id !== profileId) return profile;
      return {
        ...profile,
        plans: profile.plans.map((plan) => {
          if (plan.id !== planId) return plan;
          return {
            ...plan,
            weeks: plan.weeks.map((weekItem) => {
              if (weekItem.week !== week) return weekItem;
              return {
                ...weekItem,
                days: weekItem.days.map((dayItem) => {
                  if (dayItem.day !== day) return dayItem;
                  return {
                    ...dayItem,
                    exercises: updater(dayItem.exercises)
                  };
                })
              };
            })
          };
        })
      };
    })
  };
}

export function updatePlanName(
  db: RoutineDB,
  profileId: string,
  planId: string,
  nextName: string
): RoutineDB {
  return {
    ...db,
    profiles: db.profiles.map((profile) => {
      if (profile.id !== profileId) return profile;
      return {
        ...profile,
        plans: profile.plans.map((plan) => {
          if (plan.id !== planId) return plan;
          return {
            ...plan,
            name: nextName.trim()
          };
        })
      };
    })
  };
}

export function addPlanToProfile(
  db: RoutineDB,
  profileId: string,
  plan: RoutinePlan
): RoutineDB {
  return {
    ...db,
    profiles: db.profiles.map((profile) => {
      if (profile.id !== profileId) return profile;
      return {
        ...profile,
        plans: [...profile.plans, plan]
      };
    })
  };
}
