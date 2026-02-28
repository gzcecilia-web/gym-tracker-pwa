'use client';

import { getSupabaseClient } from '@/lib/supabase';
import type { WorkoutRecord } from '@/lib/types';

type CloudWorkoutRow = {
  id: string;
  user_id: string;
  profile_id: string;
  plan_id: string;
  week: number;
  day: number;
  created_at: string;
  payload: WorkoutRecord;
};

export function isCloudEnabled(): boolean {
  return Boolean(getSupabaseClient());
}

async function getCloudUserId(): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function cloudUpsertWorkout(workout: WorkoutRecord): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const userId = await getCloudUserId();
  if (!userId) return;

  const row: CloudWorkoutRow = {
    id: workout.id,
    user_id: userId,
    profile_id: workout.profileId,
    plan_id: workout.planId,
    week: workout.week,
    day: workout.day,
    created_at: workout.createdAt,
    payload: workout
  };

  const { error } = await supabase.from('workouts').upsert(row as never, {
    onConflict: 'id'
  });
  if (error) {
    throw new Error(`cloudUpsertWorkout failed: ${error.message}`);
  }
}

export async function cloudLoadHistory(profileId: string, planId: string): Promise<WorkoutRecord[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const userId = await getCloudUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('workouts')
    .select('payload')
    .eq('user_id', userId)
    .eq('profile_id', profileId)
    .eq('plan_id', planId)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    throw new Error(`cloudLoadHistory failed: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{ payload?: WorkoutRecord }>;
  return rows.map((r) => r.payload).filter(Boolean) as WorkoutRecord[];
}

export async function cloudDeleteWorkout(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const userId = await getCloudUserId();
  if (!userId) return;

  const { error } = await supabase.from('workouts').delete().eq('id', id).eq('user_id', userId);
  if (error) {
    throw new Error(`cloudDeleteWorkout failed: ${error.message}`);
  }
}
