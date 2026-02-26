'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui';
import { formatLocalDateTime } from '@/lib/date';
import { getProfileTheme } from '@/lib/profileTheme';
import { defaultSlot, getRoutineFromBundle } from '@/lib/routine';
import { loadHistory, loadSelection, migrateIfNeeded, saveSelection, updateWorkoutCreatedAt } from '@/lib/storage';
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
  if (status === 'done') return '✅';
  if (status === 'skipped') return '⏸️';
  return '⬜️';
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
  const theme = getProfileTheme(profileId);
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

  const load = () => {
    migrateIfNeeded();
    setRows(loadHistory(profileId, planId));
  };

  useEffect(() => {
    if (!isLoadedSelection) return;
    load();
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

  const weekButtons = [1, 2, 3, 4];
  const dayButtons = [1, 2, 3, 4];

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
    load();
  };

  useEffect(() => {
    if (!selectedDay) return;
    const key = `${selectedDay.week}-${selectedDay.day}`;
    if (!latestByDayKey[key]) return;
  }, [selectedDay, latestByDayKey]);

  return (
    <div className="space-y-3 pb-4">
      <Card>
        <h1 className="text-2xl font-bold">Historial</h1>
        <p className="text-sm text-neutral-600">Estructura por semana/día + progreso simple</p>
      </Card>

      <Card className="space-y-2">
        <p className="text-sm font-semibold text-ink">Perfil</p>
        <div className="flex flex-wrap gap-2">
          {routine.profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                const firstPlan = p.plans[0];
                setSlot({
                  profileId: p.id,
                  planId: firstPlan?.id ?? slot.planId,
                  week: slot.week,
                  day: slot.day
                });
                setSelectedDay(null);
              }}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
                p.id === profileId ? theme.chip : 'border-neutral-200 text-neutral-600'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </Card>

      <Card className="space-y-2">
        <p className="text-sm font-semibold text-ink">Plan mensual</p>
        <div className="flex flex-wrap gap-2">
          {profilePlans.map((pl) => (
            <button
              key={pl.id}
              type="button"
              onClick={() => {
                setSlot((prev) => ({ ...prev, planId: pl.id }));
                setSelectedDay(null);
              }}
              className={`rounded-xl border px-3 py-1.5 text-sm font-semibold ${
                pl.id === planId ? theme.chip : 'border-neutral-200 text-neutral-600'
              }`}
            >
              {pl.name}
            </button>
          ))}
        </div>
      </Card>

      <Card className="space-y-3">
        <p className="text-sm font-semibold text-ink">Semana / Día</p>
        {weekButtons.map((week) => (
          <div key={week} className="flex items-center gap-2">
            <p className="w-20 text-xs font-semibold text-neutral-500">Semana {week}</p>
            <div className="flex gap-2">
              {dayButtons.map((day) => {
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
                    className={`flex h-10 w-10 items-center justify-center rounded-lg border text-sm ${
                      selected
                        ? theme.chip
                        : status === 'done'
                        ? 'border-olive/40 bg-olive/10'
                        : status === 'skipped'
                        ? 'border-amber-300 bg-amber-50'
                        : 'border-neutral-200'
                    }`}
                  >
                    {statusPill(status)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <p className="text-xs text-neutral-500">Leyenda: ✅ entrenado · ⏸️ no entrené · ⬜️ pendiente</p>
      </Card>

      <Card className="space-y-2">
        <p className="text-sm font-semibold text-ink">Detalle</p>
        {!selectedDay ? (
          <p className="text-sm text-neutral-500">Elegí un día para ver el último registro.</p>
        ) : !selectedLatest ? (
          <p className="text-sm text-neutral-500">
            Semana {selectedDay.week} · Día {selectedDay.day}: sin registros.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-ink">
              Semana {selectedLatest.week} · Día {selectedLatest.day}
            </p>
            <p className="text-sm text-neutral-600">
              Estado: {selectedLatest.completed === false ? '⏸️ No entrené' : '✅ Entrenado'}
            </p>
            <p className="text-sm text-neutral-500">Fecha guardada: {formatLocalDateTime(selectedLatest.createdAt)}</p>

            <div className="mt-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Corregir fecha</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  { id: 'today', label: 'Hoy' },
                  { id: 'yesterday', label: 'Ayer' },
                  { id: 'manual', label: 'Manual' }
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFixMode(item.id as 'today' | 'yesterday' | 'manual')}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                      fixMode === item.id
                        ? theme.chip
                        : 'border-neutral-200 bg-white text-neutral-600'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {fixMode === 'manual' ? (
                <input
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  placeholder="DD-MM-AAAA"
                  className="mt-2 h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-ink outline-none ring-accent/40 focus:ring"
                />
              ) : null}
              <div className="mt-3">
                <button
                  type="button"
                  onClick={onFixDate}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold ${theme.button}`}
                >
                  Guardar nueva fecha
                </button>
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card className="space-y-2">
        <p className="text-sm font-semibold text-ink">Progreso por ejercicio (simple)</p>
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
        <p className="text-sm font-semibold text-ink">Timeline (por fecha)</p>
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
                    {r.completed === false ? '⏸️' : '✅'} · Semana {r.week} · Día {r.day} ·{' '}
                    {formatLocalDateTime(r.createdAt)}
                  </p>
                ))}
              </div>
            ))
        )}
      </Card>
    </div>
  );
}
