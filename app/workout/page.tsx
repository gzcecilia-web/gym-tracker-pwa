'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui';
import { findCombinedGroupLabel, getCombinedGroupsForDay } from '@/lib/combined';
import { getProfileTheme } from '@/lib/profileTheme';
import { defaultSlot, getDayExercises, getRoutineFromBundle } from '@/lib/routine';
import {
  appendWorkoutToHistory,
  clearDraft,
  loadDraft,
  loadSelection,
  migrateIfNeeded,
  saveDraft,
  saveSelection
} from '@/lib/storage';
import { buildWorkoutPayload, detectDropCount, repsToArray, resolveSetCount } from '@/lib/workout';
import type { RoutineDB, RoutineExercise, SelectedSlot } from '@/lib/types';

type IndexedExercise = {
  exIdx: number;
  exercise: RoutineExercise;
};

export default function WorkoutPage() {
  const router = useRouter();
  const routine = useMemo<RoutineDB>(() => getRoutineFromBundle(), []);

  const [slot, setSlot] = useState<SelectedSlot>(() => defaultSlot(routine));
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [dateMode, setDateMode] = useState<'today' | 'yesterday' | 'manual'>('today');
  const [manualDate, setManualDate] = useState('');

  useEffect(() => {
    migrateIfNeeded();
    const fallback = defaultSlot(routine);
    const selected = loadSelection(fallback);
    const params = new URLSearchParams(window.location.search);

    const weekParam = Number(params.get('week'));
    const dayParam = Number(params.get('day'));
    const merged = {
      ...selected,
      week: Number.isFinite(weekParam) && weekParam >= 1 && weekParam <= 4 ? weekParam : selected.week,
      day: Number.isFinite(dayParam) && dayParam >= 1 && dayParam <= 4 ? dayParam : selected.day
    };

    setSlot(merged);
    saveSelection(merged);

    const draft = loadDraft(merged.profileId, merged.planId, merged.week, merged.day);
    if (draft) {
      setWeights(
        Object.fromEntries(Object.entries(draft.weights ?? {}).map(([k, v]) => [k, String(v ?? '')]))
      );
      setChecks(draft.checks ?? {});
    }
  }, [routine]);

  const exercises = useMemo(
    () => getDayExercises(routine, slot.profileId, slot.planId, slot.week, slot.day),
    [routine, slot]
  );

  const profile = useMemo(
    () => routine.profiles.find((p) => p.id === slot.profileId) ?? routine.profiles[0],
    [routine, slot.profileId]
  );
  const plan = useMemo(
    () => profile?.plans.find((p) => p.id === slot.planId) ?? profile?.plans[0],
    [profile, slot.planId]
  );
  const theme = getProfileTheme(slot.profileId);
  const combinedGroups = useMemo(
    () => getCombinedGroupsForDay(slot.profileId, slot.planId, slot.week, slot.day),
    [slot.profileId, slot.planId, slot.week, slot.day]
  );
  const renderBlocks = useMemo(() => {
    const indexed: IndexedExercise[] = exercises.map((exercise, exIdx) => ({ exIdx, exercise }));
    const used = new Set<number>();
    const blocks: Array<
      | { type: 'single'; item: IndexedExercise }
      | { type: 'combined'; label: string; members: IndexedExercise[] }
    > = [];

    for (const item of indexed) {
      if (used.has(item.exIdx)) continue;
      const label = findCombinedGroupLabel(String(item.exercise.name ?? ''), combinedGroups);
      if (!label) {
        used.add(item.exIdx);
        blocks.push({ type: 'single', item });
        continue;
      }

      const members = indexed.filter((candidate) => {
        if (used.has(candidate.exIdx)) return false;
        return findCombinedGroupLabel(String(candidate.exercise.name ?? ''), combinedGroups) === label;
      });

      if (members.length <= 1) {
        used.add(item.exIdx);
        blocks.push({ type: 'single', item });
        continue;
      }

      members.forEach((m) => used.add(m.exIdx));
      blocks.push({ type: 'combined', label, members });
    }

    return blocks;
  }, [combinedGroups, exercises]);

  useEffect(() => {
    saveDraft({
      profileId: slot.profileId,
      planId: slot.planId,
      week: slot.week,
      day: slot.day,
      updatedAt: new Date().toISOString(),
      weights,
      checks
    });
  }, [checks, slot, weights]);

  const onSaveWorkout = () => {
    const makeCreatedAtISO = () => {
      const base = new Date();
      if (dateMode === 'yesterday') {
        base.setDate(base.getDate() - 1);
      }
      if (dateMode === 'manual' && /^\d{2}-\d{2}-\d{4}$/.test(manualDate.trim())) {
        const [d, m, y] = manualDate.trim().split('-').map(Number);
        return new Date(y, m - 1, d, 12, 0, 0).toISOString();
      }
      return base.toISOString();
    };

    const payload = buildWorkoutPayload({
      profileId: slot.profileId,
      planId: slot.planId,
      week: slot.week,
      day: slot.day,
      exercises,
      weights,
      checks,
      createdAt: makeCreatedAtISO()
    });

    appendWorkoutToHistory(payload);
    clearDraft(slot.profileId, slot.planId, slot.week, slot.day);
    router.push(`/history?id=${payload.id}`);
  };

  const setWeight = (key: string, value: string) => {
    const cleaned = value.replace(/[^0-9.,]/g, '');
    setWeights((prev) => ({ ...prev, [key]: cleaned }));
  };

  const applySameWeightAllSets = (exIdx: number, sets: number, value: string) => {
    const cleaned = value.replace(/[^0-9.,]/g, '');
    setWeights((prev) => {
      const next = { ...prev, [`${exIdx}-same`]: cleaned };
      for (let s = 0; s < sets; s += 1) {
        next[`${exIdx}-${s}`] = cleaned;
      }
      return next;
    });
  };

  return (
    <div className="space-y-4 pb-6">
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-ink">Entrenamiento</h1>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-2xl border border-neutral-200 bg-white px-5 py-2.5 text-base font-bold text-ink"
          >
            Volver
          </button>
        </div>

        <p className="text-base text-neutral-600">
          {profile?.name ?? '—'} · {plan?.name ?? '—'} · Semana {slot.week} · Día {slot.day}
        </p>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-soft">
          <p className="text-xl font-semibold text-ink">Fecha del entrenamiento</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {[
              { id: 'today', label: 'Hoy' },
              { id: 'yesterday', label: 'Ayer' },
              { id: 'manual', label: 'Elegir fecha' }
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setDateMode(item.id as 'today' | 'yesterday' | 'manual')}
                className={`rounded-full border px-5 py-2.5 text-sm font-semibold ${
                  dateMode === item.id
                    ? theme.chip
                    : 'border-neutral-200 bg-white text-neutral-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {dateMode === 'manual' ? (
            <Input
              placeholder="DD-MM-AAAA"
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
              className="mt-3 h-12 rounded-xl border-neutral-200 bg-white text-base text-ink placeholder:text-neutral-400"
            />
          ) : null}
          <p className="mt-4 text-sm text-neutral-500">
            Se guardará como:{' '}
            {new Date(
              dateMode === 'manual' && /^\d{2}-\d{2}-\d{4}$/.test(manualDate.trim())
                ? new Date(
                    Number(manualDate.trim().slice(6, 10)),
                    Number(manualDate.trim().slice(3, 5)) - 1,
                    Number(manualDate.trim().slice(0, 2)),
                    12,
                    0,
                    0
                  ).toISOString()
                : new Date().toISOString()
            ).toLocaleString('es-AR')}
          </p>
        </section>

        {renderBlocks.map((block) => {
          if (block.type === 'combined') {
            const first = block.members[0];
            const firstSets = resolveSetCount(first.exercise, routine.defaultSetsIfMissing || 4);
            const firstReps = Array.isArray(first.exercise.reps)
              ? first.exercise.reps.join('-')
              : String(first.exercise.reps);

            return (
              <section
                key={`combined-${block.label}`}
                className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-soft"
              >
                <div className="flex items-start justify-between gap-3">
                <h2 className={`text-2xl font-semibold leading-tight ${theme.text}`}>{block.label}</h2>
                  <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[11px] font-medium text-neutral-500">
                    Superset
                  </span>
                </div>
                <p className="mt-2 text-lg text-neutral-600">
                  Series: {firstSets} · Reps: {firstReps}
                </p>

                <div className="mt-6 space-y-3">
                  <p className="text-xl font-medium text-neutral-600">Pesos (mismo en todas las series)</p>
                  {block.members.map((member) => {
                    const memberSets = resolveSetCount(member.exercise, routine.defaultSetsIfMissing || 4);
                    return (
                      <div
                        key={`combined-member-${member.exIdx}`}
                        className="grid grid-cols-[1fr,150px,32px] items-center gap-3"
                      >
                        <p className="text-base font-medium text-neutral-700">{member.exercise.name}</p>
                        <Input
                          inputMode="decimal"
                          placeholder="kg"
                          value={weights[`${member.exIdx}-same`] ?? ''}
                          onChange={(e) => applySameWeightAllSets(member.exIdx, memberSets, e.target.value)}
                          className="h-12 rounded-xl border-neutral-200 bg-white text-base text-ink placeholder:text-neutral-400"
                        />
                        <span className="text-base text-neutral-500">kg</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          }

          const { exercise, exIdx } = block.item;
          const sets = resolveSetCount(exercise, routine.defaultSetsIfMissing || 4);
          const repsArr = repsToArray(exercise.reps, sets);
          const isDropSet = detectDropCount(exercise) > 0;
          const isSameWeightExercise = typeof exercise.reps === 'number' && !isDropSet;

          return (
            <section
              key={`${exercise.name}-${exIdx}`}
              className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-soft"
            >
              <h2 className={`text-2xl font-bold leading-tight ${theme.text}`}>{exercise.name}</h2>
              <p className="mt-2 text-lg text-neutral-600">
                Series: {sets} · Reps:{' '}
                {Array.isArray(exercise.reps) ? exercise.reps.join('-') : String(exercise.reps)}
              </p>

              {isSameWeightExercise ? (
                <div className="mt-6 space-y-3">
                  <p className="text-xl font-medium text-neutral-600">Peso (mismo para todas las series)</p>
                  <div className="grid grid-cols-[1fr,44px] items-center gap-3">
                    <Input
                      inputMode="decimal"
                      placeholder="kg"
                      value={weights[`${exIdx}-same`] ?? ''}
                      onChange={(e) => applySameWeightAllSets(exIdx, sets, e.target.value)}
                      className="h-12 rounded-xl border-neutral-200 bg-white text-base text-ink placeholder:text-neutral-400"
                    />
                    <span className="text-base text-neutral-500">kg</span>
                  </div>
                </div>
              ) : null}

              <div className="mt-6 space-y-4">
                {Array.from({ length: sets }).map((_, setIdx) => {
                  const repValue = repsArr[setIdx] ?? '?';
                  return (
                    <div
                      key={`${exIdx}-${setIdx}`}
                      className={`space-y-3 ${setIdx === 0 ? '' : 'border-t border-neutral-100 pt-4'}`}
                    >
                      <p className="text-lg font-medium text-ink">
                        Serie {setIdx + 1} · Reps: {String(repValue)}
                      </p>

                      {isDropSet ? (
                        <div className="space-y-3">
                          {[1, 2, 3].map((drop) => {
                            const key = `${exIdx}-${setIdx}-drop${drop}`;
                            return (
                              <div key={key} className="grid grid-cols-[88px,1fr,44px] items-center gap-3">
                                <span className="text-base text-neutral-600">Drop {drop}</span>
                                <Input
                                  inputMode="decimal"
                                  placeholder="kg"
                                  value={weights[key] ?? ''}
                                  onChange={(e) => setWeight(key, e.target.value)}
                                  className="h-12 rounded-xl border-neutral-200 bg-white text-base text-ink placeholder:text-neutral-400"
                                />
                                <span className="text-base text-neutral-500">kg</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="grid grid-cols-[88px,1fr,44px] items-center gap-3">
                          <span className="text-base text-neutral-600">Peso</span>
                          <Input
                            inputMode="decimal"
                            placeholder="kg"
                            value={weights[`${exIdx}-${setIdx}`] ?? ''}
                            onChange={(e) => setWeight(`${exIdx}-${setIdx}`, e.target.value)}
                            className="h-12 rounded-xl border-neutral-200 bg-white text-base text-ink placeholder:text-neutral-400"
                          />
                          <span className="text-base text-neutral-500">kg</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        <button
          type="button"
          onClick={onSaveWorkout}
          className={`mt-2 w-full rounded-2xl px-4 py-4 text-lg font-semibold ${theme.button}`}
        >
          Guardar entrenamiento
        </button>
      </div>
    </div>
  );
}
