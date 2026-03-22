'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, PageContainer } from '@/components/ui';
import { getProfileTheme } from '@/lib/profileTheme';
import { defaultSlot, formatPlanLabel } from '@/lib/routine';
import { loadHistory, loadRoutine, loadSelection, migrateIfNeeded, syncHistoryFromCloud } from '@/lib/storage';
import type { SelectedSlot, WorkoutRecord } from '@/lib/types';

type Point = {
  id: string;
  createdAt: string;
  maxWeight: number;
  planId: string;
};

type ExerciseMeta = {
  name: string;
  count: number;
  lastAt: string;
};

export default function ProgressPage() {
  const [sessions, setSessions] = useState<WorkoutRecord[]>([]);
  const [slot, setSlot] = useState<SelectedSlot | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<string>('');
  const [showAllExercises, setShowAllExercises] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      migrateIfNeeded();
      const routine = loadRoutine();
      const fallback = defaultSlot(routine);
      const selected = loadSelection(fallback);
      const profile = routine.profiles.find((item) => item.id === selected.profileId) ?? routine.profiles[0];

      setSlot(selected);

      const planIds = profile?.plans.map((plan) => plan.id) ?? [];
      for (const planId of planIds) {
        try {
          await syncHistoryFromCloud(selected.profileId, planId);
        } catch {
          // local-first fallback
        }
      }

      if (cancelled) return;

      const merged = planIds.flatMap((planId) => loadHistory(selected.profileId, planId));
      const unique = new Map<string, WorkoutRecord>();
      for (const session of merged) unique.set(session.id, session);
      setSessions(Array.from(unique.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const theme = getProfileTheme(slot?.profileId ?? '');

  const exerciseMeta = useMemo<ExerciseMeta[]>(() => {
    const map = new Map<string, ExerciseMeta>();
    for (const session of sessions) {
      for (const name of Object.keys(session.weightsByExercise ?? {})) {
        const current = map.get(name);
        if (!current) {
          map.set(name, { name, count: 1, lastAt: session.createdAt });
          continue;
        }
        current.count += 1;
        if (new Date(session.createdAt).getTime() > new Date(current.lastAt).getTime()) {
          current.lastAt = session.createdAt;
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      const countDiff = b.count - a.count;
      if (countDiff !== 0) return countDiff;
      return a.name.localeCompare(b.name);
    });
  }, [sessions]);

  const exerciseList = useMemo(() => exerciseMeta.map((item) => item.name), [exerciseMeta]);
  const visibleExercises = useMemo(() => (showAllExercises ? exerciseMeta : exerciseMeta.slice(0, 8)), [exerciseMeta, showAllExercises]);

  useEffect(() => {
    if (!selectedExercise && exerciseList.length > 0) {
      setSelectedExercise(exerciseList[0]);
      return;
    }
    if (selectedExercise && !exerciseList.includes(selectedExercise)) {
      setSelectedExercise(exerciseList[0] ?? '');
    }
  }, [exerciseList, selectedExercise]);

  const history = useMemo<Point[]>(() => {
    if (!selectedExercise) return [];

    const out: Point[] = [];
    for (const session of sessions) {
      const exMap = session.weightsByExercise?.[selectedExercise];
      if (!exMap) continue;

      const numbers = Object.values(exMap)
        .map((value) => Number(String(value).replace(',', '.')))
        .filter((value) => Number.isFinite(value));
      if (!numbers.length) continue;

      out.push({
        id: session.id,
        createdAt: session.createdAt,
        maxWeight: Math.max(...numbers),
        planId: session.planId
      });
    }

    return out.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [selectedExercise, sessions]);

  const bestWeight = useMemo(() => {
    if (!history.length) return 0;
    return Math.max(...history.map((item) => item.maxWeight));
  }, [history]);

  const lastWeight = history.length ? history[history.length - 1].maxWeight : 0;
  const deltaVsLast = bestWeight > 0 && lastWeight > 0 ? bestWeight - lastWeight : null;
  const selectedMeta = exerciseMeta.find((item) => item.name === selectedExercise) ?? null;

  return (
    <PageContainer>
      <section className="space-y-4 rounded-[28px] bg-[linear-gradient(180deg,#FFFDF9_0%,#F8F4EC_100%)] px-6 py-7 shadow-[0_18px_42px_rgba(140,120,90,0.10)]">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Progress</p>
          <h1 className="font-display text-[34px] font-bold leading-[0.98] tracking-[-0.03em] text-ink">Progreso</h1>
          <p className="font-warm text-[15px] font-medium text-muted">Una lectura simple de tu fuerza en todas las rutinas del perfil actual</p>
        </div>
        {slot ? (
          <div className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] ${theme.chip}`}>
            {slot.profileId}
          </div>
        ) : null}
      </section>

      <Card className="space-y-4 border-none bg-surface/70 shadow-[0_10px_30px_rgba(120,110,90,0.05)]">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Explorar</p>
          <p className="font-warm text-lg font-semibold text-ink">Ejercicios del perfil</p>
          <p className="text-sm text-muted">
            {exerciseList.length === 0 ? 'Todavía no hay ejercicios con pesos guardados.' : `${exerciseList.length} ejercicios registrados entre todas las rutinas.`}
          </p>
        </div>

        {exerciseList.length > 0 ? (
          <>
            <div className="flex flex-wrap gap-2">
              {visibleExercises.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => setSelectedExercise(item.name)}
                  className={`rounded-r-sm border px-3 py-2 text-left text-sm font-semibold transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-soft active:scale-[0.98] ${
                    selectedExercise === item.name ? theme.chip : 'border-line bg-surface text-muted'
                  }`}
                >
                  <span className="block leading-snug">{item.name}</span>
                  <span className="mt-0.5 block text-[11px] font-medium opacity-80">{item.count} registros</span>
                </button>
              ))}
            </div>
            {exerciseMeta.length > 8 ? (
              <button
                type="button"
                onClick={() => setShowAllExercises((open) => !open)}
                className="text-sm font-semibold text-profile transition-colors duration-200 ease-out hover:opacity-80"
              >
                {showAllExercises ? 'Ver menos' : `Ver todos (${exerciseMeta.length})`}
              </button>
            ) : null}
          </>
        ) : null}
      </Card>

      {selectedExercise ? (
        <Card className="space-y-2 border-none bg-surface/70 shadow-[0_10px_30px_rgba(120,110,90,0.05)]">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">Mejor marca</p>
          <p className="font-warm text-base font-semibold text-ink">{selectedExercise}</p>
          <div className="flex items-end gap-2">
            <p className="font-warm text-[56px] font-extrabold leading-none text-ink">{bestWeight > 0 ? bestWeight : '—'}</p>
            <span className="pb-1 text-base font-semibold text-muted">kg</span>
          </div>
          {selectedMeta ? (
            <p className="text-sm text-muted">Se registró {selectedMeta.count} veces. Último guardado: {new Date(selectedMeta.lastAt).toLocaleDateString('es-AR')}</p>
          ) : null}
          {deltaVsLast !== null ? (
            <p className="text-sm text-muted">
              {deltaVsLast > 0 ? '+' : ''}
              {deltaVsLast.toFixed(1)} kg vs último
            </p>
          ) : null}
        </Card>
      ) : null}

      {selectedExercise ? (
        <Card className="space-y-3 border-none bg-surface/70 shadow-[0_10px_30px_rgba(120,110,90,0.05)]">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Evolución</p>
            <p className="font-warm text-lg font-semibold text-ink">Timeline</p>
          </div>
          {history.length === 0 ? (
            <div className="rounded-r-sm bg-surfaceSoft p-4 text-sm text-muted shadow-soft">
              No hay marcas para este ejercicio todavía.
            </div>
          ) : (
            <div className="relative space-y-3 pl-5 before:absolute before:bottom-2 before:left-1.5 before:top-1 before:w-px before:bg-[#DDD8D0]">
              {history.map((item) => (
                <div key={item.id} className="relative">
                  <span className="absolute -left-[14px] top-1 h-2.5 w-2.5 rounded-full bg-profile" />
                  <p className="text-xs font-medium text-muted">{new Date(item.createdAt).toLocaleDateString('es-AR')} · {formatPlanLabel(item.planId)}</p>
                  <p className="font-warm text-sm font-semibold text-ink">{item.maxWeight} kg</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : (
        <Card className="border-none bg-surface/70 shadow-[0_10px_30px_rgba(120,110,90,0.05)]">
          <p className="text-sm text-muted">Elegí un ejercicio para ver el progreso del perfil actual.</p>
        </Card>
      )}
    </PageContainer>
  );
}
