'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, PageContainer } from '@/components/ui';
import { getProfileTheme } from '@/lib/profileTheme';
import { defaultSlot } from '@/lib/routine';
import { loadHistory, loadRoutine, loadSelection, migrateIfNeeded, syncHistoryFromCloud } from '@/lib/storage';
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
      const routine = loadRoutine();
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
      <section className="space-y-4 rounded-[28px] bg-[linear-gradient(180deg,#FFFDF9_0%,#F8F4EC_100%)] px-6 py-7 shadow-[0_18px_42px_rgba(140,120,90,0.10)]">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Progress</p>
          <h1 className="font-display text-[34px] font-bold leading-[0.98] tracking-[-0.03em] text-ink">Progreso</h1>
          <p className="font-warm text-[15px] font-medium text-muted">Una lectura simple de tu fuerza y tu constancia</p>
        </div>
        {slot ? (
          <div className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] ${theme.chip}`}>
            {slot.profileId}
          </div>
        ) : null}
      </section>

      <Card className="space-y-3 border-none bg-surface/70 shadow-[0_10px_30px_rgba(120,110,90,0.05)]">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Explorar</p>
          <p className="font-warm text-lg font-semibold text-ink">Ejercicios</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {exerciseList.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setSelectedExercise(ex)}
              className={`rounded-r-sm border px-3 py-2 text-sm font-semibold transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-soft active:scale-[0.98] ${
                selectedExercise === ex
                  ? theme.chip
                  : 'border-line bg-surface text-muted'
              }`}
            >
              {ex}
            </button>
          ))}
        </div>
      </Card>

      {selectedExercise ? (
        <Card className="space-y-2 border-none bg-surface/70 shadow-[0_10px_30px_rgba(120,110,90,0.05)]">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">Mejor marca</p>
          <div className="flex items-end gap-2">
            <p className="font-warm text-[56px] font-extrabold leading-none text-ink">{bestWeight > 0 ? bestWeight : '—'}</p>
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
                  <p className="text-xs font-medium text-muted">{new Date(item.createdAt).toLocaleDateString('es-AR')}</p>
                  <p className="font-warm text-sm font-semibold text-ink">{item.maxWeight} kg</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : (
        <Card className="border-none bg-surface/70 shadow-[0_10px_30px_rgba(120,110,90,0.05)]">
          <p className="text-sm text-muted">Elegí un ejercicio para ver tu progreso.</p>
        </Card>
      )}
    </PageContainer>
  );
}
