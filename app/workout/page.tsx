'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DropSetBlock, ExerciseAccordion, SetTableRow } from '@/components/workout-ui';
import { Button, Card, Input, PageContainer, SegmentedControl, StickyFooterCTA } from '@/components/ui';
import { findCombinedGroupLabel, getCombinedGroupsForDay } from '@/lib/combined';
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

type RenderBlock =
  | { id: string; type: 'single'; item: IndexedExercise }
  | { id: string; type: 'combined'; label: string; members: IndexedExercise[] };

function statusByExercise(
  exercise: RoutineExercise,
  exIdx: number,
  weights: Record<string, string>,
  checks: Record<string, boolean>,
  defaultSets: number
) {
  const sets = resolveSetCount(exercise, defaultSets);
  const dropCount = detectDropCount(exercise);
  const prefix = `${exIdx}-`;

  const hasWeight = Object.keys(weights).some((key) => key === `${exIdx}-same` || key.startsWith(prefix));
  const hasCheck = Object.keys(checks).some((key) => key.startsWith(prefix) && checks[key]);

  const completeByCheck = Array.from({ length: sets }).every((_, setIdx) => checks[`${exIdx}-${setIdx}-done`]);
  const completeByWeight =
    dropCount > 0
      ? Array.from({ length: sets }).every((_, setIdx) => [1, 2, 3].every((drop) => Boolean(weights[`${exIdx}-${setIdx}-drop${drop}`])))
      : Array.from({ length: sets }).every((_, setIdx) => Boolean(weights[`${exIdx}-${setIdx}`] || weights[`${exIdx}-same`]));

  return {
    touched: hasWeight || hasCheck,
    complete: completeByCheck || completeByWeight
  };
}

export default function WorkoutPage() {
  const router = useRouter();
  const routine = useMemo<RoutineDB>(() => getRoutineFromBundle(), []);
  const defaultSets = routine.defaultSetsIfMissing || 4;

  const [slot, setSlot] = useState<SelectedSlot>(() => defaultSlot(routine));
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [dateMode, setDateMode] = useState<'today' | 'yesterday' | 'manual'>('today');
  const [manualDate, setManualDate] = useState('');
  const [openBlockId, setOpenBlockId] = useState<string>('');

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
      setWeights(Object.fromEntries(Object.entries(draft.weights ?? {}).map(([k, v]) => [k, String(v ?? '')])));
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

  const combinedGroups = useMemo(
    () => getCombinedGroupsForDay(slot.profileId, slot.planId, slot.week, slot.day),
    [slot.profileId, slot.planId, slot.week, slot.day]
  );

  const renderBlocks = useMemo<RenderBlock[]>(() => {
    const indexed: IndexedExercise[] = exercises.map((exercise, exIdx) => ({ exIdx, exercise }));
    const used = new Set<number>();
    const blocks: RenderBlock[] = [];

    for (const item of indexed) {
      if (used.has(item.exIdx)) continue;
      const label = findCombinedGroupLabel(String(item.exercise.name ?? ''), combinedGroups);
      if (!label) {
        used.add(item.exIdx);
        blocks.push({ id: `single-${item.exIdx}`, type: 'single', item });
        continue;
      }

      const members = indexed.filter((candidate) => {
        if (used.has(candidate.exIdx)) return false;
        return findCombinedGroupLabel(String(candidate.exercise.name ?? ''), combinedGroups) === label;
      });

      if (members.length <= 1) {
        used.add(item.exIdx);
        blocks.push({ id: `single-${item.exIdx}`, type: 'single', item });
        continue;
      }

      members.forEach((m) => used.add(m.exIdx));
      blocks.push({ id: `combined-${members.map((m) => m.exIdx).join('-')}`, type: 'combined', label, members });
    }

    return blocks;
  }, [combinedGroups, exercises]);

  useEffect(() => {
    if (!renderBlocks.length) {
      setOpenBlockId('');
      return;
    }
    if (!openBlockId || !renderBlocks.find((b) => b.id === openBlockId)) {
      setOpenBlockId(renderBlocks[0].id);
    }
  }, [renderBlocks, openBlockId]);

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

  const exerciseStats = useMemo(() => {
    return exercises.map((exercise, exIdx) => statusByExercise(exercise, exIdx, weights, checks, defaultSets));
  }, [checks, defaultSets, exercises, weights]);

  const completedCount = exerciseStats.filter((x) => x.complete).length;
  const progressPercent = exercises.length ? Math.round((completedCount / exercises.length) * 100) : 0;

  const setWeight = (key: string, value: string) => {
    const cleaned = value.replace(/[^0-9.,]/g, '');
    setWeights((prev) => ({ ...prev, [key]: cleaned }));
  };

  const setCheck = (key: string, checked: boolean) => {
    setChecks((prev) => ({ ...prev, [key]: checked }));
  };

  const applySameWeightAllSets = (exIdx: number, sets: number, value: string) => {
    const cleaned = value.replace(/[^0-9.,]/g, '');
    setWeights((prev) => {
      const next = { ...prev, [`${exIdx}-same`]: cleaned };
      for (let s = 0; s < sets; s += 1) next[`${exIdx}-${s}`] = cleaned;
      return next;
    });
  };

  const makeCreatedAtISO = () => {
    const base = new Date();
    if (dateMode === 'yesterday') base.setDate(base.getDate() - 1);
    if (dateMode === 'manual' && /^\d{2}-\d{2}-\d{4}$/.test(manualDate.trim())) {
      const [d, m, y] = manualDate.trim().split('-').map(Number);
      return new Date(y, m - 1, d, 12, 0, 0).toISOString();
    }
    return base.toISOString();
  };

  const onSaveWorkout = () => {
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

  return (
    <PageContainer>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-[34px] font-bold leading-[1.05] tracking-[-0.02em] text-ink">Entrenamiento</h1>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-r-sm border border-line bg-surface px-4 py-2 text-sm font-semibold text-neutral-700 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-soft active:scale-[0.98]"
          >
            Volver
          </button>
        </div>
        <p className="text-sm font-medium text-muted">
          {profile?.name ?? '—'} · {plan?.name ?? '—'} · Semana {slot.week} · Día {slot.day}
        </p>
      </div>

      <Card className="space-y-3">
        <div className="h-2 w-full rounded-full bg-neutral-200">
          <div className="h-2 rounded-full bg-accent transition-all duration-200 ease-out" style={{ width: `${progressPercent}%` }} />
        </div>
        <p className="text-xs font-medium text-muted">
          Ejercicio {Math.min(completedCount + 1, Math.max(exercises.length, 1))} de {exercises.length || 1}
        </p>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold text-ink">Fecha del entrenamiento</h2>
        <SegmentedControl
          className="grid-cols-3"
          variant="compact"
          value={dateMode}
          onChange={(value) => setDateMode(value)}
          items={[
            { value: 'today', label: 'Hoy' },
            { value: 'yesterday', label: 'Ayer' },
            { value: 'manual', label: 'Elegir fecha' }
          ]}
        />
        {dateMode === 'manual' ? (
          <Input placeholder="DD-MM-AAAA" value={manualDate} onChange={(e) => setManualDate(e.target.value)} />
        ) : null}
      </Card>

      <div className="space-y-5">
        {renderBlocks.map((block) => {
          if (block.type === 'combined') {
            const first = block.members[0];
            const sets = resolveSetCount(first.exercise, defaultSets);
            const reps = Array.isArray(first.exercise.reps) ? first.exercise.reps.join('-') : String(first.exercise.reps);
            const complete = block.members.every((m) => exerciseStats[m.exIdx]?.complete);

            return (
              <ExerciseAccordion
                key={block.id}
                title={block.label}
                meta={`Series: ${sets} · Reps: ${reps}`}
                open={openBlockId === block.id}
                onToggle={() => setOpenBlockId(block.id)}
                complete={complete}
              >
                <p className="mb-3 text-sm font-medium text-muted">Pesos (mismo en todas las series)</p>
                <div className="space-y-2">
                  {block.members.map((member) => {
                    const memberSets = resolveSetCount(member.exercise, defaultSets);
                    return (
                      <div key={`combined-${member.exIdx}`} className="grid grid-cols-[1fr,128px] items-center gap-2 rounded-r-sm border border-line bg-surface px-3 py-2">
                        <p className="text-sm font-medium text-ink">{member.exercise.name}</p>
                        <Input
                          inputMode="decimal"
                          placeholder="kg"
                          value={weights[`${member.exIdx}-same`] ?? ''}
                          onChange={(e) => applySameWeightAllSets(member.exIdx, memberSets, e.target.value)}
                          className="h-9"
                        />
                      </div>
                    );
                  })}
                </div>
              </ExerciseAccordion>
            );
          }

          const { exercise, exIdx } = block.item;
          const sets = resolveSetCount(exercise, defaultSets);
          const repsArr = repsToArray(exercise.reps, sets);
          const isDropSet = detectDropCount(exercise) > 0;
          const isSameWeightExercise = typeof exercise.reps === 'number' && !isDropSet;
          const complete = exerciseStats[exIdx]?.complete;

          return (
            <ExerciseAccordion
              key={block.id}
              title={exercise.name}
              meta={`Series: ${sets} · Reps: ${Array.isArray(exercise.reps) ? exercise.reps.join('-') : String(exercise.reps)}`}
              open={openBlockId === block.id}
              onToggle={() => setOpenBlockId(block.id)}
              complete={complete}
            >
              {isSameWeightExercise ? (
                <div className="mb-4 space-y-2 rounded-r-sm border border-line bg-neutral-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">Peso (mismo para todas las series)</p>
                  <Input
                    inputMode="decimal"
                    placeholder="kg"
                    value={weights[`${exIdx}-same`] ?? ''}
                    onChange={(e) => applySameWeightAllSets(exIdx, sets, e.target.value)}
                    className="h-9"
                  />
                </div>
              ) : null}

              {isDropSet ? (
                <div className="space-y-3">
                  {Array.from({ length: sets }).map((_, setIdx) => (
                    <DropSetBlock
                      key={`${exIdx}-${setIdx}-drops`}
                      setLabel={`Serie ${setIdx + 1}`}
                      reps={String(repsArr[setIdx] ?? '?')}
                      values={[
                        weights[`${exIdx}-${setIdx}-drop1`] ?? '',
                        weights[`${exIdx}-${setIdx}-drop2`] ?? '',
                        weights[`${exIdx}-${setIdx}-drop3`] ?? ''
                      ]}
                      onChangeDrop={(drop, value) => setWeight(`${exIdx}-${setIdx}-drop${drop}`, value)}
                      checked={checks[`${exIdx}-${setIdx}-done`] ?? false}
                      onToggleCheck={() => setCheck(`${exIdx}-${setIdx}-done`, !checks[`${exIdx}-${setIdx}-done`])}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-[56px,64px,1fr,34px] gap-2 px-2 text-xs font-medium uppercase tracking-[0.08em] text-muted">
                    <span>Serie</span>
                    <span>Reps</span>
                    <span>Peso</span>
                    <span>Ok</span>
                  </div>
                  {Array.from({ length: sets }).map((_, setIdx) => (
                    <SetTableRow
                      key={`${exIdx}-${setIdx}`}
                      label={`${setIdx + 1}`}
                      reps={String(repsArr[setIdx] ?? '?')}
                      value={weights[`${exIdx}-${setIdx}`] ?? ''}
                      onChange={(value) => setWeight(`${exIdx}-${setIdx}`, value)}
                      checked={checks[`${exIdx}-${setIdx}-done`] ?? false}
                      onToggleCheck={() => setCheck(`${exIdx}-${setIdx}-done`, !checks[`${exIdx}-${setIdx}-done`])}
                    />
                  ))}
                </div>
              )}
            </ExerciseAccordion>
          );
        })}
      </div>

      <StickyFooterCTA>
        <Button className="h-14 text-base font-semibold" onClick={onSaveWorkout}>
          Guardar entrenamiento
        </Button>
      </StickyFooterCTA>
    </PageContainer>
  );
}
