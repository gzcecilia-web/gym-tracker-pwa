'use client';

import type { WorkoutRecord } from '@/lib/types';

type CloudWorkoutRow = {
  id: string;
  profile_id: string;
  plan_id: string;
  week: number;
  day: number;
  created_at: string;
  payload: WorkoutRecord;
};

function getCloudConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url, key };
}

function getHeaders() {
  const cfg = getCloudConfig();
  if (!cfg) return null;
  return {
    apikey: cfg.key,
    Authorization: `Bearer ${cfg.key}`,
    'Content-Type': 'application/json'
  };
}

export function isCloudEnabled(): boolean {
  return Boolean(getCloudConfig());
}

export async function cloudUpsertWorkout(workout: WorkoutRecord): Promise<void> {
  const cfg = getCloudConfig();
  const headers = getHeaders();
  if (!cfg || !headers) return;

  const row: CloudWorkoutRow = {
    id: workout.id,
    profile_id: workout.profileId,
    plan_id: workout.planId,
    week: workout.week,
    day: workout.day,
    created_at: workout.createdAt,
    payload: workout
  };

  const res = await fetch(`${cfg.url}/rest/v1/workouts`, {
    method: 'POST',
    headers: {
      ...headers,
      Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify([row])
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`cloudUpsertWorkout failed: ${res.status} ${txt}`);
  }
}

export async function cloudLoadHistory(profileId: string, planId: string): Promise<WorkoutRecord[]> {
  const cfg = getCloudConfig();
  const headers = getHeaders();
  if (!cfg || !headers) return [];

  const url = new URL(`${cfg.url}/rest/v1/workouts`);
  url.searchParams.set('select', 'payload');
  url.searchParams.set('profile_id', `eq.${profileId}`);
  url.searchParams.set('plan_id', `eq.${planId}`);
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('limit', '500');

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`cloudLoadHistory failed: ${res.status} ${txt}`);
  }

  const rows = (await res.json()) as Array<{ payload?: WorkoutRecord }>;
  return rows.map((r) => r.payload).filter(Boolean) as WorkoutRecord[];
}
