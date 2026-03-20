import rawPlans from '@/plans.json';
import { loadRoutine } from '@/lib/storage';

type AnyObj = any;

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function getCombinedGroupsForDay(
  profileId: string,
  planId: string,
  week: number,
  day: number
): string[][] {
  if (typeof window !== 'undefined') {
    try {
      const routine = loadRoutine();
      const profile = routine.profiles.find((p) => p.id === profileId);
      const plan = (profile?.plans ?? []).find((p) => p.id === planId);
      const weekObj = (plan?.weeks ?? []).find((w) => Number(w.week) === week);
      const dayObj = (weekObj?.days ?? []).find((d) => Number(d.day) === day);
      const exercises = dayObj?.exercises ?? [];

      const localGroups = new Map<string, string[]>();
      for (const ex of exercises) {
        const group = String(ex?.supersetGroup ?? '').trim();
        if (!group) continue;
        const current = localGroups.get(group) ?? [];
        current.push(String(ex?.name ?? '').trim());
        localGroups.set(group, current);
      }

      const normalizedLocal = Array.from(localGroups.entries())
        .map(([group, members]) => {
          const uniqueMembers = Array.from(new Set(members.filter(Boolean)));
          return uniqueMembers.length > 1 ? uniqueMembers : group.split(' + ').map((s) => s.trim()).filter(Boolean);
        })
        .filter((group) => group.length > 1);

      if (normalizedLocal.length > 0) return normalizedLocal;
    } catch {
      // fall back to imported plans
    }
  }

  const data = rawPlans as AnyObj;
  const profiles: AnyObj[] = data?.profiles ?? [];
  const profile = profiles.find((p) => p.id === profileId);
  const plan = (profile?.plans ?? []).find((p: AnyObj) => p.id === planId);
  const weekObj = (plan?.weeks ?? []).find((w: AnyObj) => Number(w.week) === week);
  const dayObj = (weekObj?.days ?? []).find((d: AnyObj) => Number(d.day) === day);
  const exercises: AnyObj[] = dayObj?.exercises ?? [];

  const groups: string[][] = [];

  for (const ex of exercises) {
    const rawName = String(ex?.name ?? '');
    if (!rawName.includes(' + ')) continue;
    const parts = rawName
      .split(' + ')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length > 1) groups.push(parts);
  }

  return groups;
}

export function findCombinedGroupLabel(
  exerciseName: string,
  groups: string[][]
): string | null {
  const needle = normalizeName(exerciseName);

  for (const group of groups) {
    const normalized = group.map(normalizeName);
    if (!normalized.includes(needle)) continue;

    return group.join(' + ');
  }
  return null;
}
