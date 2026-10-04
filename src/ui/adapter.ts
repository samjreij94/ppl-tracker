/**
 * UI adapter: the ONLY UI module that imports src/core. It maps core hooks/views onto the
 * UI view-models in ./types. No business logic lives here — only shape mapping and display
 * formatting. Anything core doesn't provide yet is marked `TODO(core)`.
 */
import { useMemo, useSyncExternalStore } from 'react';
import {
  CARDIO_SLOT_ID,
  convertWeight,
  doneSets,
  getExerciseSeries,
  getPRs,
  getSessions,
  useCoreState,
  useDataTransfer,
  useExercises,
  useSettings,
  useToday,
  useWorkout,
  volume,
  type ActiveEntryView,
  type CardioEntry,
  type PRResult,
  type ProgressionHint,
  type RepRange,
  type SetLog,
  type StrengthEntry,
  type TodayStrengthSlot,
  type Unit,
  type WorkoutSession,
} from '../core';
import { fmtNum, type ActiveVM, type CardioVM, type ExerciseVM, type HistoryItem, type LastSet, type PrHit, type SeriesPoint, type SettingsVM, type SummaryVM, type SwapOption, type TodayVM } from './types';

/* ---------- cardio extras (TODO(core)) ----------
 * CardioEntry only persists { exerciseId, durationMin, done }. Incline %, speed, calories and
 * Peloton output have nowhere to live in core yet, so they are kept in memory for the current
 * page lifetime only (not persisted, not exported, not prefilled from last time).
 * TODO(core): add optional `incline`, `speed`, `calories`, `output` to CardioEntry + logCardio patch
 * and to TodayCardioSlot.last, then delete this block.
 */
type CardioExtras = Pick<CardioVM, 'incline' | 'speed' | 'calories' | 'output'>;
let extras: Record<string, CardioExtras> = {};
const extrasListeners = new Set<() => void>();
const extrasStore = {
  get: () => extras,
  set: (sessionId: string, patch: CardioExtras) => {
    extras = { ...extras, [sessionId]: { ...extras[sessionId], ...patch } };
    extrasListeners.forEach((l) => l());
  },
  subscribe: (l: () => void) => { extrasListeners.add(l); return () => { extrasListeners.delete(l); }; },
};

/* ---------- formatting ---------- */
const repsText = (r: RepRange) => (r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`);
const lastSets = (sets: readonly SetLog[] | undefined): LastSet[] => {
  if (!sets) return [];
  const done = doneSets(sets);
  return (done.length ? done : []).map((s) => ({ weight: s.weight, reps: s.reps }));
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function hintText(p: ProgressionHint | null | undefined, unit: Unit): string | undefined {
  if (!p) return undefined;
  switch (p.action) {
    case 'increase': return p.newWeight != null ? `Hit all reps last time — try ${fmtNum(p.newWeight)} ${unit}` : cap(p.message);
    case 'addReps': return p.targetReps != null && p.newWeight != null ? `Stay at ${fmtNum(p.newWeight)} ${unit}, aim for ${p.targetReps} reps` : cap(p.message);
    default: return cap(p.message);
  }
}

const PR_ORDER: PRResult['kind'][] = ['topSet', 'e1rm', 'repsAtWeight'];
export function prText(pr: PRResult, unit: Unit): string {
  if (pr.kind === 'topSet') return `heaviest set ${fmtNum(pr.weight)} ${unit} × ${pr.reps}`;
  if (pr.kind === 'e1rm') return `e1RM ${fmtNum(Math.round(pr.value))} ${unit} (${fmtNum(pr.weight)}×${pr.reps})`;
  return `${pr.reps} reps @ ${fmtNum(pr.weight)} ${unit}`;
}
const bestPr = (prs: PRResult[]) => [...prs].sort((a, b) => PR_ORDER.indexOf(a.kind) - PR_ORDER.indexOf(b.kind))[0];

/* ---------- hook ---------- */
export function useUi() {
  const state = useCoreState();
  const t = useToday();
  const w = useWorkout();
  const s = useSettings();
  const x = useExercises();
  const dt = useDataTransfer();
  const cx = useSyncExternalStore(extrasStore.subscribe, extrasStore.get, extrasStore.get);
  const unit = s.settings.unit;

  const settings: SettingsVM = { unit, restSec: s.settings.defaultRestSec, schedule: s.settings.schedule };

  const today: TodayVM | null = useMemo(() => {
    const tv = t.today;
    if (!tv) return null;
    const c = tv.slots.find((sl) => sl.kind === 'cardio' && sl.slot.id === CARDIO_SLOT_ID);
    const strength = tv.slots.filter((sl): sl is TodayStrengthSlot => sl.kind === 'strength');
    return {
      dayName: tv.day.name,
      dayLabel: `Day ${tv.rotationIndex + 1} of ${t.days.length || 6}${tv.isNext ? ' · next up' : ''}`,
      cardio: c && c.kind === 'cardio'
        ? { kind: c.exercise.id, name: c.exercise.name, minutes: c.durationMin, done: false }
        : { kind: 'incline-treadmill', minutes: 10, done: false },
      hasCardio: !!c,
      exercises: strength.map((sl) => ({
        slotId: sl.slot.id,
        exerciseId: sl.exercise.id,
        name: sl.exercise.name,
        targetSets: sl.target.sets,
        targetReps: repsText(sl.target.repRange),
        lastSets: lastSets(sl.last?.sets),
        hint: hintText(sl.progression, unit),
        swapped: sl.swapped,
        restSec: sl.target.restSec,
        sets: [],
      })),
    };
  }, [t.today, t.days.length, unit]);

  const entryBySlot = useMemo(() => new Map(w.entries.map((e) => [e.entry.slotId, e])), [w.entries]);

  const active: ActiveVM | null = useMemo(() => {
    const sess = w.session;
    if (!sess) return null;
    const day = state.program.days.find((d) => d.id === sess.dayId);
    const cEntry = w.entries.find((e) => e.entry.kind === 'cardio' && e.entry.slotId === CARDIO_SLOT_ID);
    const ce = cEntry?.entry as CardioEntry | undefined;
    return {
      sessionId: sess.id,
      dayName: day?.name ?? sess.dayId,
      startedAt: Date.parse(sess.startedAt),
      cardio: ce ? { kind: ce.exerciseId, name: cEntry!.exercise.name, minutes: ce.durationMin, done: ce.done, ...cx[sess.id] } : null,
      exercises: w.entries.filter((e) => e.entry.kind === 'strength').map((e: ActiveEntryView): ExerciseVM => {
        const se = e.entry as StrengthEntry;
        return {
          slotId: se.slotId,
          exerciseId: se.exerciseId,
          name: e.exercise.name,
          targetSets: se.target.sets,
          targetReps: repsText(se.target.repRange),
          lastSets: lastSets(e.last?.sets),
          hint: hintText(e.progression, w.unit),
          swapped: e.swapped,
          restSec: se.restSec,
          sets: se.sets.map((st) => ({ weight: st.weight, reps: st.reps, done: st.done })),
        };
      }),
    };
  }, [w.session, w.entries, w.unit, state.program, cx]);

  const idx = (slotId: string) => {
    const e = entryBySlot.get(slotId);
    if (!e) throw new Error(`No entry for slot ${slotId}`);
    return e.index;
  };

  // History + per-session standing-PR counts.
  const { history, loggedExercises, cardioMinutes } = useMemo(() => {
    const sessions = getSessions(state); // newest first
    const ids = new Map<string, { name: string; last: number }>();
    sessions.forEach((ss) => ss.entries.forEach((e) => {
      if (e.kind === 'strength' && doneSets(e.sets).length && !ids.has(e.exerciseId)) {
        ids.set(e.exerciseId, { name: state.exercises[e.exerciseId]?.name ?? e.exerciseId, last: Date.parse(ss.startedAt) });
      }
    }));
    // TODO(core): no per-session "PRs set" record is stored; count the CURRENT records (e1rm/topSet) each session holds.
    const prCount = new Map<string, number>();
    for (const id of ids.keys()) {
      for (const pr of getPRs(state, id)) if (pr.sessionId && pr.kind !== 'repsAtWeight') prCount.set(pr.sessionId, (prCount.get(pr.sessionId) ?? 0) + 1);
    }
    const history: HistoryItem[] = sessions.map((ss: WorkoutSession) => {
      const strength = ss.entries.filter((e): e is StrengthEntry => e.kind === 'strength');
      const c = ss.entries.find((e): e is CardioEntry => e.kind === 'cardio' && e.slotId === CARDIO_SLOT_ID);
      const vol = strength.reduce((n, e) => n + volume(e.sets), 0);
      return {
        id: ss.id,
        date: Date.parse(ss.startedAt),
        dayName: state.program.days.find((d) => d.id === ss.dayId)?.name ?? ss.dayId,
        sets: strength.reduce((n, e) => n + doneSets(e.sets).length, 0),
        volume: convertWeight(vol, ss.unit, unit),
        prs: prCount.get(ss.id) ?? 0,
        cardio: c ? { kind: c.exerciseId, name: state.exercises[c.exerciseId]?.name, minutes: c.durationMin, done: c.done } : undefined,
        durationMin: ss.finishedAt ? Math.round((Date.parse(ss.finishedAt) - Date.parse(ss.startedAt)) / 60000) : undefined,
      };
    });
    const cardioMinutes = [...sessions].reverse().flatMap((ss) => {
      const c = ss.entries.find((e): e is CardioEntry => e.kind === 'cardio' && e.slotId === CARDIO_SLOT_ID);
      return c && c.done ? [{ date: Date.parse(ss.startedAt), minutes: c.durationMin }] : [];
    });
    return { history, loggedExercises: [...ids].map(([id, v]) => ({ id, name: v.name })), cardioMinutes };
  }, [state, unit]);

  return {
    status: state.status,
    error: state.status === 'error' ? `Program data problem: ${state.seedErrors.slice(0, 3).join('; ')}` : null,
    settings,
    today,
    active,
    history,
    loggedExercises,
    cardioMinutes,

    start: () => { t.startSession(); },
    updateSet: (slotId: string, setIdx: number, patch: { weight?: number; reps?: number }) => { w.logSet(idx(slotId), setIdx, patch); },
    setDone: async (slotId: string, setIdx: number, done: boolean, vals: { weight: number; reps: number }): Promise<PrHit[]> => {
      const entry = entryBySlot.get(slotId);
      const res = w.logSet(idx(slotId), setIdx, { ...vals, done });
      if (!res.prs.length) return [];
      const top = bestPr(res.prs);
      return [{ name: entry?.exercise.name ?? '', text: prText(top, w.unit) }];
    },
    addSet: (slotId: string) => { w.addSet(idx(slotId)); },
    updateCardio: (patch: Partial<CardioVM>) => {
      const sess = w.session;
      const ce = w.entries.find((e) => e.entry.kind === 'cardio' && e.entry.slotId === CARDIO_SLOT_ID);
      if (!sess || !ce) return;
      if (patch.kind && patch.kind !== ce.entry.exerciseId) w.swapExercise(CARDIO_SLOT_ID, patch.kind, 'session');
      if (patch.minutes != null || patch.done != null) {
        w.logCardio(ce.index, { ...(patch.minutes != null && { durationMin: patch.minutes }), ...(patch.done != null && { done: patch.done }) });
      }
      const ex: CardioExtras = {};
      (['incline', 'speed', 'calories', 'output'] as const).forEach((k) => { if (patch[k] != null) ex[k] = patch[k]; });
      if (Object.keys(ex).length) extrasStore.set(sess.id, ex);
    },
    getSwaps: (slotId: string): SwapOption[] => {
      const e = entryBySlot.get(slotId);
      if (!e) return [];
      return w.getSwaps(e.index).map((o) => ({
        exerciseId: o.id,
        name: o.name,
        note: [o.equipment, o.isCustom ? 'custom' : null, o.id === e.programmedExerciseId ? 'programmed' : null].filter(Boolean).join(' · ') || undefined,
      }));
    },
    swap: async (slotId: string, exerciseId: string, scope: 'session' | 'permanent') => { w.swapExercise(slotId, exerciseId, scope); },
    addCustom: async (slotId: string, input: { name: string; sets: number; reps: string }, scope: 'session' | 'permanent') => {
      const e = entryBySlot.get(slotId);
      const slot = state.program.days.flatMap((d) => d.slots).find((sl) => sl.id === slotId);
      const [lo, hi] = input.reps.split(/[-–]/).map((n) => parseInt(n, 10));
      const repRange = Number.isFinite(lo) ? { min: lo, max: Number.isFinite(hi) ? hi : lo } : undefined;
      const created = x.addCustomExercise({
        name: input.name,
        kind: 'strength',
        substitutionGroup: slot?.substitutionGroup ?? e?.exercise.substitutionGroup,
        defaultSets: input.sets,
        repRange,
      });
      w.swapExercise(slotId, created.id, scope);
    },
    finish: async (): Promise<SummaryVM> => {
      const sess = w.session!;
      const day = state.program.days.find((d) => d.id === sess.dayId);
      const names = new Map(w.entries.map((e) => [e.exercise.id, e.exercise.name]));
      const res = w.finishSession();
      const fs = res?.session ?? sess;
      const strength = fs.entries.filter((e): e is StrengthEntry => e.kind === 'strength');
      const c = fs.entries.find((e): e is CardioEntry => e.kind === 'cardio' && e.slotId === CARDIO_SLOT_ID);
      // one line per exercise: its most notable record
      const byEx = new Map<string, PRResult[]>();
      (res?.prs ?? []).forEach((p) => byEx.set(p.exerciseId, [...(byEx.get(p.exerciseId) ?? []), p]));
      return {
        dayName: day?.name ?? fs.dayId,
        durationMin: Math.max(1, Math.round(((fs.finishedAt ? Date.parse(fs.finishedAt) : Date.now()) - Date.parse(fs.startedAt)) / 60000)),
        setsDone: strength.reduce((n, e) => n + doneSets(e.sets).length, 0),
        volume: strength.reduce((n, e) => n + volume(e.sets), 0),
        prs: [...byEx].map(([id, prs]) => ({ name: names.get(id) ?? state.exercises[id]?.name ?? id, text: prText(bestPr(prs), fs.unit) })),
        cardio: c ? { kind: c.exerciseId, name: state.exercises[c.exerciseId]?.name, minutes: c.durationMin, done: c.done } : undefined,
      };
    },
    getSeries: (exerciseId: string): SeriesPoint[] =>
      getExerciseSeries(state, exerciseId).map((p) => ({ date: Date.parse(p.date), e1rm: p.e1rm, top: p.topSet.weight, volume: p.volume })),
    updateSettings: (patch: Partial<SettingsVM>) => {
      s.updateSettings({
        ...(patch.unit && { unit: patch.unit }),
        ...(patch.restSec != null && { defaultRestSec: patch.restSec }),
        ...(patch.schedule && { schedule: patch.schedule }),
      });
    },
    exportFile: async (): Promise<string> => {
      const json = dt.exportJSON();
      const name = dt.exportFileName();
      const file = new File([json], name, { type: 'application/json' });
      // iOS: the share sheet offers "Save to Files"; desktop/other: plain download.
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
        try { await nav.share({ files: [file], title: 'PPL Tracker backup' }); return `Shared ${name}`; }
        catch (e) { if ((e as Error).name === 'AbortError') return 'Share cancelled'; /* fall through to download */ }
      }
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return `Downloaded ${name}`;
    },
    importText: async (text: string) => {
      const r = await dt.importJSON(text);
      if (!r.ok) throw new Error(r.errors.slice(0, 3).join('; ') || 'invalid backup');
    },
  };
}
export type Ui = ReturnType<typeof useUi>;
