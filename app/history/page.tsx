'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Input, PageContainer, SegmentedControl, Select } from '@/components/ui';
import { formatLocalDateTime } from '@/lib/date';
import { getProfileTheme } from '@/lib/profileTheme';
import { defaultSlot, getLatestPlanForProfile } from '@/lib/routine';
import {
  loadHistory,
  loadRoutine,
  loadSelection,
  migrateIfNeeded,
  removeWorkoutFromHistory,
  saveSelection,
  syncHistoryFromCloud,
  updateWorkoutCreatedAt
} from '@/lib/storage';
import { summarizeExerciseWeights } from '@/lib/workout';
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

function profileToneClass(profileId: string, active: boolean): string {
  const theme = getProfileTheme(profileId);
  if (active) return `${theme.chip} shadow-soft`;
  return 'border-line bg-surface text-muted hover:bg-[#F1EFEB]';
}

export default function HistoryPage() {
  const [routine, setRoutine] = useState(() => loadRoutine());
  const fallback = useMemo(() => defaultSlot(routine), [routine]);
  const [slot, setSlot] = useState<SelectedSlot>(fallback);
  const [isLoadedSelection, setIsLoadedSelection] = useState(false);

  useEffect(() => {
    migrateIfNeeded();
    const loadedRoutine = loadRoutine();
    setRoutine(loadedRoutine);
    const loadedFallback = defaultSlot(loadedRoutine);
    const selected = loadSelection(loadedFallback);
    setSlot(selected);
    setIsLoadedSelection(true);
  }, []);

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

  const onDeleteWorkout = () => {
    if (!selectedLatest) return;
    const ok = window.confirm('¿Querés eliminar este entrenamiento? Esta acción no se puede deshacer.');
    if (!ok) return;
    removeWorkoutFromHistory(profileId, planId, selectedLatest.id);
    setSelectedDay(null);
    void load();
  };

  return (
    <PageContainer>
      <section className="space-y-4 rounded-[28px] bg-[linear-gradient(180deg,#FFFDF9_0%,#F8F4EC_100%)] px-6 py-7 shadow-[0_18px_42px_rgba(140,120,90,0.10)]">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Records</p>
          <h1 className="font-display text-[34px] font-bold leading-[0.98] tracking-[-0.03em] text-ink">Historial</h1>
          <p className="font-warm text-[15px] font-medium text-muted">Tus registros, constancia y cargas con una lectura más amable</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-r-md bg-white/70 px-4 py-3 shadow-soft">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Perfil activo</p>
            <p className={`mt-1 text-sm font-semibold ${getProfileTheme(profileId).text}`}>{profile?.name ?? 'Perfil'}</p>
          </div>
          <div className="rounded-r-md bg-white/70 px-4 py-3 shadow-soft">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Plan activo</p>
            <p className="mt-1 truncate text-sm font-semibold text-ink">{profilePlans.find((pl) => pl.id === planId)?.name ?? 'Plan'}</p>
          </div>
        </div>
      </section>

      <Card className="space-y-5 border-none bg-surface/70 shadow-[0_10px_30px_rgba(120,110,90,0.05)]">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Perfil</p>
          <div className="grid grid-cols-2 gap-3">
            {routine.profiles.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  const nextProfile = routine.profiles.find((item) => item.id === p.id);
                  const latestPlan = getLatestPlanForProfile(nextProfile);
                  setSlot({
                    profileId: p.id,
                    planId: latestPlan?.id ?? slot.planId,
                    week: slot.week,
                    day: slot.day
                  });
                  setSelectedDay(null);
                }}
                className={`flex min-h-10 items-center justify-center rounded-r-sm border px-3 py-2 text-sm font-semibold transition-all duration-200 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25 ${profileToneClass(
                  p.id,
                  profileId === p.id
                )}`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Plan mensual</p>
          <Select
            value={planId}
            onChange={(e) => {
              setSlot((prev) => ({ ...prev, planId: e.target.value }));
              setSelectedDay(null);
            }}
          >
            {profilePlans.map((pl) => (
              <option key={pl.id} value={pl.id}>
                {pl.name}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <Card className="space-y-4 border-none bg-surface/70 shadow-[0_10px_30px_rgba(120,110,90,0.05)]">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Calendario</p>
          <p className="font-warm text-lg font-semibold text-ink">Semana / Día</p>
        </div>
        {[1, 2, 3, 4].map((week) => (
          <div key={week} className="flex items-center gap-3">
            <p className="w-20 text-xs font-medium uppercase tracking-[0.08em] text-muted">Semana {week}</p>
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
                    className={`flex h-10 w-10 items-center justify-center rounded-r-sm border text-sm font-semibold transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-soft active:scale-[0.98] ${
                      selected
                        ? 'border-profile bg-profile/14 text-profile shadow-soft'
                        : status === 'done'
                        ? 'border-profile/25 bg-profile/14 text-profile'
                        : status === 'skipped'
                        ? 'border-lineStrong bg-[#F1EFEB] text-muted'
                        : 'border-dashed border-lineStrong bg-surface text-[#B8B6B1]'
                    }`}
                  >
                    {statusPill(status)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <p className="text-xs text-muted">✓ entrenado · ⏸ no entrené · vacío pendiente</p>
      </Card>

      <Card className="space-y-3 border-none bg-surface/70 shadow-[0_10px_30px_rgba(120,110,90,0.05)]">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Selección</p>
          <p className="font-warm text-lg font-semibold text-ink">Detalle del día</p>
        </div>
        {!selectedDay ? (
          <div className="rounded-r-md bg-surfaceSoft p-4 shadow-soft">
            <p className="text-sm font-medium text-muted">Elegí un día para ver el último registro.</p>
          </div>
        ) : !selectedLatest ? (
          <div className="rounded-r-md bg-surfaceSoft p-4 shadow-soft">
            <p className="text-sm text-muted">Semana {selectedDay.week} · Día {selectedDay.day}: sin registros.</p>
          </div>
        ) : (
          <div className="space-y-3 rounded-r-md bg-surface p-4 shadow-soft">
            <h2 className="font-warm text-lg font-semibold text-ink">{formatLocalDateTime(selectedLatest.createdAt)}</h2>
            <p className="text-sm text-muted">
              Semana {selectedLatest.week} · Día {selectedLatest.day} · {selectedLatest.planId}
            </p>
            <p className="text-sm text-muted">
              Estado: {selectedLatest.completed === false ? 'No entrené' : 'Entrené'}
            </p>
            <div className="space-y-1">
              {(selectedLatest.exercises ?? []).slice(0, 4).map((exercise, idx) => (
                <p key={`${exercise.name}-${idx}`} className="text-sm text-muted">
                  • {exercise.name}
                </p>
              ))}
            </div>

            <div className="space-y-2 rounded-r-sm bg-[#FBF8F2] p-3">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">Pesos del entrenamiento</p>
              {Object.keys(selectedLatest.weightsByExercise ?? {}).length === 0 ? (
                <p className="text-sm text-muted">Este registro no tiene pesos guardados.</p>
              ) : (
                Object.entries(selectedLatest.weightsByExercise)
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .map(([exerciseName, weightMap]) => {
                    const lines = summarizeExerciseWeights(weightMap);
                    return (
                      <div key={exerciseName} className="rounded-r-md bg-surface p-3 shadow-soft">
                        <p className="font-warm text-sm font-semibold text-ink">{exerciseName}</p>
                        <div className="mt-1 space-y-1">
                          {lines.length > 0 ? (
                            lines.map((line) => (
                              <p key={`${exerciseName}-${line}`} className="text-xs text-muted">
                                {line}
                              </p>
                            ))
                          ) : (
                            <p className="text-xs text-muted">Sin detalle de series.</p>
                          )}
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            <div className="space-y-2 rounded-r-sm bg-[#FBF8F2] p-3">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">Corregir fecha</p>
              <SegmentedControl
                className="grid-cols-3"
                variant="compact"
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
              <Button className="h-11" variant="secondary" onClick={onDeleteWorkout}>
                Eliminar entrenamiento
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="space-y-2 border-none bg-surface/70 shadow-[0_10px_30px_rgba(120,110,90,0.05)]">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Lectura rápida</p>
          <p className="font-warm text-lg font-semibold text-ink">Progreso por ejercicio</p>
        </div>
        {exerciseSummary.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay registros de pesos guardados.</p>
        ) : (
          exerciseSummary.slice(0, 12).map((it) => (
            <div key={it.name} className="border-t border-[#F1EFEB] pt-2.5 first:border-none first:pt-0">
              <p className="font-warm text-sm font-semibold text-ink">{it.name}</p>
              <p className="text-xs text-muted">
                Registros: {it.count} · Último: {formatLocalDateTime(it.last)}
              </p>
            </div>
          ))
        )}
      </Card>

      <Card className="space-y-2 border-none bg-surface/70 shadow-[0_10px_30px_rgba(120,110,90,0.05)]">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Semana a semana</p>
          <p className="font-warm text-lg font-semibold text-ink">Timeline</p>
        </div>
        {Object.keys(groupedByDate).length === 0 ? (
          <p className="text-sm text-neutral-500">No hay sesiones todavía.</p>
        ) : (
          Object.keys(groupedByDate)
            .sort((a, b) => (a < b ? 1 : -1))
            .slice(0, 10)
            .map((ymd) => (
              <div key={ymd} className="border-t border-[#F1EFEB] pt-2 first:border-none first:pt-0">
                <p className="font-warm text-sm font-semibold text-ink">{ymd}</p>
                {(groupedByDate[ymd] ?? []).slice(0, 6).map((r) => (
                  <p key={r.id} className="text-xs text-muted">
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
