'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, PageContainer } from '@/components/ui';
import { getProfileTheme } from '@/lib/profileTheme';
import { defaultSlot, getRoutineFromBundle } from '@/lib/routine';
import { loadHistory, loadSelection, migrateIfNeeded, syncHistoryFromCloud } from '@/lib/storage';
import type { SelectedSlot, WorkoutRecord } from '@/lib/types';

type Point = {
  id: string;
  createdAt: string;
  maxWeight: number;
};

export default function ProgressPage() {
  const [sessions, setSessions] = useState<WorkoutRecord[]>([]);
  const [slot, setSlot] = useState<SelectedSlot | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      migrateIfNeeded();
      const routine = getRoutineFromBundle();
      const fallback = defaultSlot(routine);
      const selected = loadSelection(fallback);

      setSlot(selected);
      try {
        await syncHistoryFromCloud(selected.profileId, selected.planId);
      } catch {
        // Keep local behavior if cloud sync fails.
      }
      if (cancelled) return;
      setSessions(loadHistory(selected.profileId, selected.planId));
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const profileSessions = useMemo(() => sessions, [sessions]);

  const theme = getProfileTheme(slot?.profileId ?? '');

  const exerciseList = useMemo(() => {
    const set = new Set<string>();
    for (const s of profileSessions) {
      const map = s.weightsByExercise ?? {};
      Object.keys(map).forEach((name) => set.add(name));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [profileSessions]);

  useEffect(() => {
    if (!selectedExercise) return;
    if (!exerciseList.includes(selectedExercise)) {
      setSelectedExercise('');
    }
  }, [exerciseList, selectedExercise]);

  const history = useMemo<Point[]>(() => {
    if (!selectedExercise) return [];

    const out: Point[] = [];
    for (const s of profileSessions) {
      const exMap = s.weightsByExercise?.[selectedExercise];
      if (!exMap) continue;

      const numbers = Object.values(exMap)
        .map((v) => Number(String(v).replace(',', '.')))
        .filter((n) => Number.isFinite(n));
      if (!numbers.length) continue;

      out.push({
        id: s.id,
        createdAt: s.createdAt,
        maxWeight: Math.max(...numbers)
      });
    }
    return out.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [selectedExercise, profileSessions]);

  const bestWeight = useMemo(() => {
    if (!history.length) return 0;
    return Math.max(...history.map((h) => h.maxWeight));
  }, [history]);

  const lastWeight = history.length ? history[history.length - 1].maxWeight : 0;
  const deltaVsLast = bestWeight > 0 && lastWeight > 0 ? bestWeight - lastWeight : null;

  return (
    <PageContainer>
      <Card>
        <h1 className="text-[34px] font-bold leading-[1.05] tracking-[-0.02em] text-ink">Progreso</h1>
        <p className="mt-2 text-base font-medium text-muted">Seleccioná un ejercicio para ver evolución</p>
        {slot ? (
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.08em] text-muted">Perfil actual: {slot.profileId}</p>
        ) : null}
      </Card>

      <Card className="space-y-3">
        <p className={`text-xs font-semibold uppercase tracking-[0.08em] ${theme.text}`}>Ejercicios</p>
        <div className="flex flex-wrap gap-2">
          {exerciseList.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setSelectedExercise(ex)}
              className={`rounded-r-sm border px-3 py-2 text-sm font-semibold transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-soft active:scale-[0.98] ${
                selectedExercise === ex
                  ? theme.chip
                  : 'border-line bg-surface text-neutral-600'
              }`}
            >
              {ex}
            </button>
          ))}
        </div>
      </Card>

      {selectedExercise ? (
        <Card className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">Mejor marca</p>
          <div className="flex items-end gap-2">
            <p className="text-[52px] font-extrabold leading-none text-ink">{bestWeight > 0 ? bestWeight : '—'}</p>
            <span className="pb-1 text-base font-semibold text-muted">kg</span>
          </div>
          {deltaVsLast !== null ? (
            <p className="text-sm text-muted">
              {deltaVsLast > 0 ? '+' : ''}
              {deltaVsLast.toFixed(1)} kg vs último
            </p>
          ) : null}
        </Card>
      ) : null}

      {selectedExercise ? (
        <Card className="space-y-3">
          <p className="text-lg font-semibold text-ink">Timeline</p>
          {history.length === 0 ? (
            <div className="rounded-r-sm border border-line bg-neutral-50 p-4 text-sm text-muted">
              No hay marcas para este ejercicio todavía.
            </div>
          ) : (
            <div className="relative space-y-3 pl-5 before:absolute before:bottom-2 before:left-1.5 before:top-1 before:w-px before:bg-neutral-200">
              {history.map((item) => (
                <div key={item.id} className="relative">
                  <span className="absolute -left-[14px] top-1 h-2.5 w-2.5 rounded-full bg-accent" />
                  <p className="text-xs font-medium text-muted">{new Date(item.createdAt).toLocaleDateString('es-AR')}</p>
                  <p className="text-sm font-semibold text-ink">{item.maxWeight} kg</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-muted">Elegí un ejercicio para ver tu progreso.</p>
        </Card>
      )}
    </PageContainer>
  );
}
