'use client';

import { cloudDeleteWorkout, cloudLoadHistory, cloudUpsertWorkout, isCloudEnabled } from '@/lib/cloud';
import { makeCreatedAtISO } from '@/lib/date';
import { applyProfileAccent } from '@/lib/profileTheme';
import { getRoutineFromBundle } from '@/lib/routine';
import type { RoutineDB, SelectedSlot, WorkoutDraft, WorkoutRecord } from '@/lib/types';

const KEY_ROUTINE = 'gym:routine';
const KEY_SELECTION = 'gym:selection';
const DATA_VERSION = 2;
const PLAN_ID_ALIASES: Record<string, string> = {
  'cecilia-2026-06': 'cecilia-rutina-6',
  'gabriel-2026-01': 'gabriel-rutina-1'
};

function normalizePlanId(planId: string): string {
  return PLAN_ID_ALIASES[planId] ?? planId;
}

function getLegacyPlanIds(planId: string): string[] {
  const normalized = normalizePlanId(planId);
  return Object.keys(PLAN_ID_ALIASES).filter((oldId) => PLAN_ID_ALIASES[oldId] === normalized);
}

export function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function loadRaw(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(key);
}

function saveRaw(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, value);
}

export function loadJSON<T>(key: string, fallback: T): T {
  return safeParse<T>(loadRaw(key), fallback);
}

export function saveJSON<T>(key: string, value: T): void {
  saveRaw(key, JSON.stringify(value));
}

export function getRoutineStorageKey(): string {
  return KEY_ROUTINE;
}

export function getDraftKey(profileId: string, planId: string, week: number, day: number): string {
  return `gym:draft:${profileId}:${planId}:${week}:${day}`;
}

export function getHistoryKey(profileId: string, planId: string): string {
  return `gym:history:${profileId}:${planId}`;
}

export function getWorkoutItemKey(id: string): string {
  return `gym:workout:${id}`;
}

export function loadRoutine(): RoutineDB {
  const fromLS = loadJSON<RoutineDB | null>(KEY_ROUTINE, null);
  if (fromLS && Array.isArray(fromLS.profiles)) {
    return fromLS;
  }

  const bundled = getRoutineFromBundle();
  saveJSON(KEY_ROUTINE, bundled);
  return bundled;
}

export function loadSelection(fallback: SelectedSlot): SelectedSlot {
  const selection = loadJSON<SelectedSlot>(KEY_SELECTION, fallback);
  return {
    ...selection,
    planId: normalizePlanId(selection.planId)
  };
}

export function saveSelection(slot: SelectedSlot): void {
  applyProfileAccent(slot.profileId);
  saveJSON(KEY_SELECTION, {
    ...slot,
    planId: normalizePlanId(slot.planId)
  });
}

export function saveDraft(draft: WorkoutDraft): void {
  const planId = normalizePlanId(draft.planId);
  const key = getDraftKey(draft.profileId, planId, draft.week, draft.day);
  saveJSON(key, { ...draft, planId, version: DATA_VERSION, updatedAt: makeCreatedAtISO() });
}

export function loadDraft(profileId: string, planId: string, week: number, day: number): WorkoutDraft | null {
  const normalizedPlanId = normalizePlanId(planId);
  const current = loadJSON<WorkoutDraft | null>(getDraftKey(profileId, normalizedPlanId, week, day), null);
  if (current) return { ...current, planId: normalizePlanId(current.planId) };

  for (const legacyPlanId of getLegacyPlanIds(normalizedPlanId)) {
    const legacy = loadJSON<WorkoutDraft | null>(getDraftKey(profileId, legacyPlanId, week, day), null);
    if (legacy) {
      return { ...legacy, planId: normalizedPlanId };
    }
  }
  return null;
}

export function clearDraft(profileId: string, planId: string, week: number, day: number): void {
  if (typeof window === 'undefined') return;
  const normalizedPlanId = normalizePlanId(planId);
  window.localStorage.removeItem(getDraftKey(profileId, normalizedPlanId, week, day));
  for (const legacyPlanId of getLegacyPlanIds(normalizedPlanId)) {
    window.localStorage.removeItem(getDraftKey(profileId, legacyPlanId, week, day));
  }
}

export function appendWorkoutToHistory(workout: WorkoutRecord, options?: { syncCloud?: boolean }): void {
  const normalizedPlanId = normalizePlanId(workout.planId);
  const normalizedWorkout: WorkoutRecord = {
    ...workout,
    planId: normalizedPlanId
  };
  const itemKey = getWorkoutItemKey(normalizedWorkout.id);
  saveJSON(itemKey, normalizedWorkout);

  const historyKey = getHistoryKey(workout.profileId, normalizedPlanId);
  const current = loadJSON<(string | WorkoutRecord)[]>(historyKey, []);

  const next = [
    normalizedWorkout.id,
    ...current.filter((entry) =>
      typeof entry === 'string' ? entry !== normalizedWorkout.id : entry.id !== normalizedWorkout.id
    )
  ];
  saveJSON(historyKey, next);

  if (options?.syncCloud !== false && isCloudEnabled()) {
    cloudUpsertWorkout(normalizedWorkout).catch(() => {
      // Keep local-first behavior if cloud is temporarily unavailable.
    });
  }
}

function normalizeWorkoutShape(item: WorkoutRecord): WorkoutRecord {
  const createdAt = item.createdAt || makeCreatedAtISO();
  const id = item.id || `legacy-${Date.now()}`;
  const exercises = Array.isArray(item.exercises) ? item.exercises : [];
  const exerciseNames = Array.isArray(item.exerciseNames)
    ? item.exerciseNames
    : exercises.map((ex) => String(ex?.name ?? ''));

  const weights = item.weights ?? {};
  const weightsByExercise = item.weightsByExercise ?? {};

  return {
    ...item,
    id,
    planId: normalizePlanId(item.planId),
    version: DATA_VERSION,
    createdAt,
    exercises,
    exerciseNames,
    weights,
    weightsByExercise,
    checks: item.checks ?? {}
  };
}

export function loadWorkoutById(id: string): WorkoutRecord | null {
  const raw = loadJSON<WorkoutRecord | null>(getWorkoutItemKey(id), null);
  if (!raw) return null;
  return normalizeWorkoutShape(raw);
}

export function removeWorkoutFromHistory(
  profileId: string,
  planId: string,
  workoutId: string,
  options?: { syncCloud?: boolean }
): void {
  if (typeof window === 'undefined') return;
  const normalizedPlanId = normalizePlanId(planId);
  const allPlanIds = [normalizedPlanId, ...getLegacyPlanIds(normalizedPlanId)];

  for (const pid of allPlanIds) {
    const historyKey = getHistoryKey(profileId, pid);
    const current = loadJSON<(string | WorkoutRecord)[]>(historyKey, []);
    const next = current.filter((entry) => (typeof entry === 'string' ? entry !== workoutId : entry?.id !== workoutId));
    saveJSON(historyKey, next);
  }

  window.localStorage.removeItem(getWorkoutItemKey(workoutId));

  if (options?.syncCloud !== false && isCloudEnabled()) {
    cloudDeleteWorkout(workoutId).catch(() => {
      // Keep local-first behavior if cloud deletion fails.
    });
  }
}

export function updateWorkoutCreatedAt(id: string, createdAt: string): WorkoutRecord | null {
  const current = loadWorkoutById(id);
  if (!current) return null;

  const updated: WorkoutRecord = {
    ...current,
    createdAt
  };
  saveJSON(getWorkoutItemKey(id), updated);
  if (isCloudEnabled()) {
    cloudUpsertWorkout(updated).catch(() => {});
  }
  return updated;
}

export function loadHistory(profileId: string, planId: string): WorkoutRecord[] {
  const normalizedPlanId = normalizePlanId(planId);
  const allIndexes: Array<string | WorkoutRecord> = [];
  allIndexes.push(...loadJSON<(string | WorkoutRecord)[]>(getHistoryKey(profileId, normalizedPlanId), []));
  for (const legacyPlanId of getLegacyPlanIds(normalizedPlanId)) {
    allIndexes.push(...loadJSON<(string | WorkoutRecord)[]>(getHistoryKey(profileId, legacyPlanId), []));
  }

  const workouts: WorkoutRecord[] = [];

  for (const entry of allIndexes) {
    if (typeof entry === 'string') {
      const byId = loadWorkoutById(entry);
      if (byId) workouts.push(byId);
      continue;
    }

    if (entry && typeof entry === 'object') {
      const normalized = normalizeWorkoutShape(entry);
      saveJSON(getWorkoutItemKey(normalized.id), normalized);
      workouts.push(normalized);
    }
  }

  const unique = new Map<string, WorkoutRecord>();
  for (const w of workouts) unique.set(w.id, w);
  return Array.from(unique.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function loadLatestForDay(
  profileId: string,
  planId: string,
  week: number,
  day: number
): WorkoutRecord | null {
  const list = loadHistory(profileId, planId);
  return list.find((w) => w.week === week && w.day === day) ?? null;
}

export function loadWeekStatuses(
  profileId: string,
  planId: string,
  week: number
): Record<number, 'done' | 'skipped'> {
  const list = loadHistory(profileId, planId);
  const map: Record<number, 'done' | 'skipped'> = {};

  for (const item of list) {
    if (item.week !== week) continue;
    if (map[item.day]) continue;
    map[item.day] = item.completed === false ? 'skipped' : 'done';
  }
  return map;
}

export function loadAllHistory(): WorkoutRecord[] {
  if (typeof window === 'undefined') return [];

  const allIds: string[] = [];
  const prefix = 'gym:history:';
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key || !key.startsWith(prefix)) continue;

    const entries = loadJSON<(string | WorkoutRecord)[]>(key, []);
    for (const entry of entries) {
      if (typeof entry === 'string') {
        allIds.push(entry);
      } else if (entry?.id) {
        saveJSON(getWorkoutItemKey(entry.id), normalizeWorkoutShape(entry));
        allIds.push(entry.id);
      }
    }
  }

  const seen = new Set<string>();
  const items: WorkoutRecord[] = [];
  for (const id of allIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const workout = loadWorkoutById(id);
    if (workout) items.push(workout);
  }

  return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function migrateIfNeeded(): void {
  if (typeof window === 'undefined') return;
  const marker = loadJSON<number>('gym:version', 1);
  if (marker >= DATA_VERSION) return;

  // Migration intentionally conservative: preserve existing keys and only stamp current version.
  saveJSON('gym:version', DATA_VERSION);
}

export async function syncHistoryFromCloud(profileId: string, planId: string): Promise<number> {
  if (!isCloudEnabled()) return 0;

  const normalizedPlanId = normalizePlanId(planId);
  const cloudItems = await cloudLoadHistory(profileId, normalizedPlanId);
  if (!cloudItems.length) return 0;

  let imported = 0;
  for (const item of cloudItems) {
    const normalized = normalizeWorkoutShape({
      ...item,
      profileId,
      planId: normalizedPlanId
    });

    const existed = loadWorkoutById(normalized.id);
    if (!existed) imported += 1;
    appendWorkoutToHistory(normalized, { syncCloud: false });
  }

  return imported;
}
