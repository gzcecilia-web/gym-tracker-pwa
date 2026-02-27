'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Input, PageContainer, SegmentedControl } from '@/components/ui';
import { formatLocalDateTime } from '@/lib/date';
import { defaultSlot, getRoutineFromBundle } from '@/lib/routine';
import {
  loadHistory,
  loadSelection,
  migrateIfNeeded,
  saveSelection,
  syncHistoryFromCloud,
  updateWorkoutCreatedAt
} from '@/lib/storage';
import type { SelectedSlot, WorkoutRecord } from '@/lib/types';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function isoToYYYYMMDD(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

function statusPill(status?: 'done' | 'skipped') {
  if (status === 'done') return '✓';
  if (status === 'skipped') return '⏸';
  return '';
}

export default function HistoryPage() {
  const routine = useMemo(() => getRoutineFromBundle(), []);
  const fallback = useMemo(() => defaultSlot(routine), [routine]);
  const [slot, setSlot] = useState<SelectedSlot>(fallback);
  const [isLoadedSelection, setIsLoadedSelection] = useState(false);

  useEffect(() => {
    migrateIfNeeded();
    const selected = loadSelection(fallback);
    setSlot(selected);
    setIsLoadedSelection(true);
  }, [fallback]);

  const profileId = slot.profileId;
  const profile = useMemo(
    () => routine.profiles.find((p) => p.id === profileId) ?? routine.profiles[0],
    [routine, profileId]
  );
  const profilePlans = profile?.plans ?? [];

  const planId = slot.planId;
  const [rows, setRows] = useState<WorkoutRecord[]>([]);
  const [selectedDay, setSelectedDay] = useState<{ week: number; day: number } | null>(null);
  const [fixMode, setFixMode] = useState<'today' | 'yesterday' | 'manual'>('today');
  const [manualDate, setManualDate] = useState('');

  useEffect(() => {
    if (!isLoadedSelection) return;
    if (profilePlans.length === 0) return;
    if (!profilePlans.find((p) => p.id === planId)) {
      setSlot((prev) => ({ ...prev, planId: profilePlans[0].id }));
      setSelectedDay(null);
    }
  }, [profilePlans, planId, isLoadedSelection]);

  useEffect(() => {
    if (!isLoadedSelection) return;
    saveSelection(slot);
  }, [slot, isLoadedSelection]);

  const load = async () => {
    migrateIfNeeded();
    try {
      await syncHistoryFromCloud(profileId, planId);
    } catch {
      // Keep local behavior if cloud sync fails.
    }
    setRows(loadHistory(profileId, planId));
  };

  useEffect(() => {
    if (!isLoadedSelection) return;
    void load();
  }, [profileId, planId, isLoadedSelection]);

  const { latestByDayKey, groupedByDate } = useMemo(() => {
    const latest: Record<string, WorkoutRecord> = {};
    const grouped: Record<string, WorkoutRecord[]> = {};

    for (const r of rows) {
      const key = `${r.week}-${r.day}`;
      if (!latest[key]) latest[key] = r;

      const ymd = isoToYYYYMMDD(r.createdAt);
      if (!grouped[ymd]) grouped[ymd] = [];
      grouped[ymd].push(r);
    }

    return { latestByDayKey: latest, groupedByDate: grouped };
  }, [rows]);

  const selectedLatest = useMemo(() => {
    if (!selectedDay) return null;
    const key = `${selectedDay.week}-${selectedDay.day}`;
    return latestByDayKey[key] ?? null;
  }, [selectedDay, latestByDayKey]);

  const exerciseSummary = useMemo(() => {
    const map: Record<string, { count: number; last: string }> = {};
    const doneRows = rows.filter((r) => r.completed !== false);

    for (const r of doneRows) {
      const byExercise = r.weightsByExercise ?? {};
      for (const exName of Object.keys(byExercise)) {
        if (!map[exName]) map[exName] = { count: 0, last: r.createdAt };
        map[exName].count += 1;
        if (new Date(r.createdAt).getTime() > new Date(map[exName].last).getTime()) {
          map[exName].last = r.createdAt;
        }
      }
    }

    return Object.entries(map)
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  const buildFixedCreatedAt = () => {
    const now = new Date();
    const base = new Date(now);

    if (fixMode === 'yesterday') {
      base.setDate(base.getDate() - 1);
      return base.toISOString();
    }

    if (fixMode === 'manual' && /^\d{2}-\d{2}-\d{4}$/.test(manualDate.trim())) {
      const [d, m, y] = manualDate.trim().split('-').map(Number);
      return new Date(y, m - 1, d, 12, 0, 0).toISOString();
    }

    return base.toISOString();
  };

  const onFixDate = () => {
    if (!selectedLatest) return;
    const updated = updateWorkoutCreatedAt(selectedLatest.id, buildFixedCreatedAt());
    if (!updated) return;
    void load();
  };

  return (
    <PageContainer>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Historial</h1>
        <p className="mt-1 text-sm text-neutral-600">Registros por semana/día y resumen de progreso</p>
      </div>

      <Card className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Perfil</p>
          <SegmentedControl
            className="grid-cols-2"
            value={profileId}
            onChange={(profileValue) => {
              const nextProfile = routine.profiles.find((p) => p.id === profileValue);
              const firstPlan = nextProfile?.plans[0];
              setSlot({
                profileId: profileValue,
                planId: firstPlan?.id ?? slot.planId,
                week: slot.week,
                day: slot.day
              });
              setSelectedDay(null);
            }}
            items={routine.profiles.map((p) => ({ value: p.id, label: p.name }))}
          />
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Plan mensual</p>
          <SegmentedControl
            className="grid-cols-1"
            value={planId}
            onChange={(planValue) => {
              setSlot((prev) => ({ ...prev, planId: planValue }));
              setSelectedDay(null);
            }}
            items={profilePlans.map((pl) => ({ value: pl.id, label: pl.name }))}
          />
        </div>
      </Card>

      <Card className="space-y-4">
        <p className="text-lg font-semibold text-ink">Semana / Día</p>
        {[1, 2, 3, 4].map((week) => (
          <div key={week} className="flex items-center gap-3">
            <p className="w-20 text-xs font-medium text-neutral-500">Semana {week}</p>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((day) => {
                const key = `${week}-${day}`;
                const latest = latestByDayKey[key];
                const selected = selectedDay?.week === week && selectedDay?.day === day;
                const status: 'done' | 'skipped' | undefined = latest
                  ? latest.completed === false
                    ? 'skipped'
                    : 'done'
                  : undefined;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDay({ week, day })}
                    className={`flex h-10 w-10 items-center justify-center rounded-xl border text-sm font-semibold ${
                      selected
                        ? 'border-accent bg-accent/10 text-accent'
                        : status === 'done'
                        ? 'border-transparent bg-accent/15 text-accent'
                        : status === 'skipped'
                        ? 'border-transparent bg-neutral-200 text-neutral-600'
                        : 'border-dashed border-neutral-300 bg-white text-neutral-400'
                    }`}
                  >
                    {statusPill(status)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <p className="text-xs text-neutral-500">✓ entrenado · ⏸ no entrené · vacío pendiente</p>
      </Card>

      <Card className="space-y-3">
        <p className="text-lg font-semibold text-ink">Detalle del día</p>
        {!selectedDay ? (
          <p className="text-sm text-neutral-500">Elegí un día para ver el último registro.</p>
        ) : !selectedLatest ? (
          <p className="text-sm text-neutral-500">
            Semana {selectedDay.week} · Día {selectedDay.day}: sin registros.
          </p>
        ) : (
          <div className="space-y-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
            <h2 className="text-lg font-semibold text-ink">{formatLocalDateTime(selectedLatest.createdAt)}</h2>
            <p className="text-sm text-neutral-600">
              Semana {selectedLatest.week} · Día {selectedLatest.day} · {selectedLatest.planId}
            </p>
            <p className="text-sm text-neutral-600">
              Estado: {selectedLatest.completed === false ? 'No entrené' : 'Entrené'}
            </p>
            <div className="space-y-1">
              {(selectedLatest.exercises ?? []).slice(0, 4).map((exercise, idx) => (
                <p key={`${exercise.name}-${idx}`} className="text-sm text-neutral-600">
                  • {exercise.name}
                </p>
              ))}
            </div>

            <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Corregir fecha</p>
              <SegmentedControl
                className="grid-cols-3"
                value={fixMode}
                onChange={(value) => setFixMode(value)}
                items={[
                  { value: 'today', label: 'Hoy' },
                  { value: 'yesterday', label: 'Ayer' },
                  { value: 'manual', label: 'Manual' }
                ]}
              />
              {fixMode === 'manual' ? (
                <Input
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  placeholder="DD-MM-AAAA"
                />
              ) : null}
              <Button className="h-11" onClick={onFixDate}>
                Guardar nueva fecha
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="space-y-2">
        <p className="text-lg font-semibold text-ink">Progreso por ejercicio</p>
        {exerciseSummary.length === 0 ? (
          <p className="text-sm text-neutral-500">Todavía no hay registros de pesos guardados.</p>
        ) : (
          exerciseSummary.slice(0, 12).map((it) => (
            <div key={it.name} className="border-t border-neutral-100 pt-2 first:border-none first:pt-0">
              <p className="text-sm font-semibold text-ink">{it.name}</p>
              <p className="text-xs text-neutral-500">
                Registros: {it.count} · Último: {formatLocalDateTime(it.last)}
              </p>
            </div>
          ))
        )}
      </Card>

      <Card className="space-y-2">
        <p className="text-lg font-semibold text-ink">Timeline</p>
        {Object.keys(groupedByDate).length === 0 ? (
          <p className="text-sm text-neutral-500">No hay sesiones todavía.</p>
        ) : (
          Object.keys(groupedByDate)
            .sort((a, b) => (a < b ? 1 : -1))
            .slice(0, 10)
            .map((ymd) => (
              <div key={ymd} className="border-t border-neutral-100 pt-2 first:border-none first:pt-0">
                <p className="text-sm font-semibold text-ink">{ymd}</p>
                {(groupedByDate[ymd] ?? []).slice(0, 6).map((r) => (
                  <p key={r.id} className="text-xs text-neutral-500">
                    {r.completed === false ? '⏸' : '✓'} · Semana {r.week} · Día {r.day} · {formatLocalDateTime(r.createdAt)}
                  </p>
                ))}
              </div>
            ))
        )}
      </Card>
    </PageContainer>
  );
}
