'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui';
import { formatLocalDateTime } from '@/lib/date';
import { getProfileTheme } from '@/lib/profileTheme';
import { defaultSlot, getRoutineFromBundle } from '@/lib/routine';
import { loadAllHistory, loadSelection, migrateIfNeeded } from '@/lib/storage';
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
    migrateIfNeeded();
    const routine = getRoutineFromBundle();
    const fallback = defaultSlot(routine);
    const selected = loadSelection(fallback);

    setSlot(selected);
    setSessions(loadAllHistory());
  }, []);

  const profileSessions = useMemo(() => {
    if (!slot) return [];
    return sessions.filter((s) => s.profileId === slot.profileId);
  }, [sessions, slot]);

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
    <div className="space-y-3 pb-4">
      <Card>
        <h1 className="text-2xl font-bold">Progreso</h1>
        <p className="text-sm text-neutral-600">Seleccioná un ejercicio para ver evolución</p>
        {slot ? (
          <p className={`mt-1 text-sm font-medium ${theme.softText}`}>Perfil actual: {slot.profileId}</p>
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
        <Card className={`space-y-2 border ${theme.softSurface} border-transparent`}>
          <p className={`text-sm font-semibold ${theme.text}`}>Mejor marca</p>
          <p className="text-2xl font-bold text-ink">{bestWeight > 0 ? `${bestWeight} kg` : 'Sin datos'}</p>
        </Card>
      ) : null}

      {selectedExercise ? (
        <Card className="space-y-3">
          <p className="text-sm font-semibold text-ink">Historial</p>
          {history.length === 0 ? (
            <p className="text-sm text-neutral-500">Aún no hay registros para este ejercicio.</p>
          ) : (
            history.map((item) => (
              <div key={item.id} className="rounded-xl border border-neutral-200 p-3">
                <p className="text-sm font-semibold">{formatLocalDateTime(item.createdAt)}</p>
                <p className="text-sm text-neutral-600">Peso máximo: {item.maxWeight} kg</p>
              </div>
            ))
          )}
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-neutral-500">Elegí un ejercicio para ver tu progreso.</p>
        </Card>
      )}
    </div>
  );
}
