'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, PageContainer } from '@/components/ui';
import { formatLocalDateTime } from '@/lib/date';
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

  return (
    <PageContainer>
      <Card>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Progreso</h1>
        <p className="text-sm text-neutral-600">Seleccioná un ejercicio para ver evolución</p>
        {slot ? (
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-neutral-500">Perfil actual: {slot.profileId}</p>
        ) : null}
      </Card>

      <Card className="space-y-3">
        <p className={`text-sm font-semibold ${theme.text}`}>Ejercicios</p>
        <div className="flex flex-wrap gap-2">
          {exerciseList.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setSelectedExercise(ex)}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
                selectedExercise === ex
                  ? theme.chip
                  : 'border-neutral-200 text-neutral-600'
              }`}
            >
              {ex}
            </button>
          ))}
        </div>
      </Card>

      {selectedExercise ? (
        <Card className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Mejor marca</p>
          <p className="text-4xl font-bold text-ink">{bestWeight > 0 ? `${bestWeight} kg` : '—'}</p>
        </Card>
      ) : null}

      {selectedExercise ? (
        <Card className="space-y-3">
          <p className="text-lg font-semibold text-ink">Timeline</p>
          {history.length === 0 ? (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-500">
              No hay marcas para este ejercicio todavía.
            </div>
          ) : (
            history.map((item) => (
              <div key={item.id} className="text-sm text-neutral-700">
                • {new Date(item.createdAt).toLocaleDateString('es-AR')} — {item.maxWeight} kg
              </div>
            ))
          )}
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-neutral-500">Elegí un ejercicio para ver tu progreso.</p>
        </Card>
      )}
    </PageContainer>
  );
}
