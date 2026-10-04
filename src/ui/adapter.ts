/**
 * UI adapter: the ONLY UI module that imports src/core. It maps core hooks/views onto the
 * UI view-models in ./types. No business logic lives here — only shape mapping and display
 * formatting. Anything core doesn't provide yet is marked `TODO(core)`.
 */
import { useMemo } from 'react';
import {
  CARDIO_SLOT_ID,
  FINISHER_SLOT_ID,
  getCardioHistory,
  localDate,
  useBodyweight,
  useDeload,
  deloadSets,
  convertWeight,
  doneSets,
  getExerciseSeries,
  getPRs,
  getSessions,
  useCore,
  useCoreState,
  useDataTransfer,
  useExercises,
  useSettings,
  useToday,
  useWorkout,
  volume,
  type ActiveEntryView,
  type CardioEntry,
  type CardioExercise,
  type CardioMetrics,
  type CardioRole,
  type CoreState,
  type DeloadStatus,
  type PRResult,
  type ProgressionHint,
  type RepRange,
  type SetLog,
  type StrengthEntry,
  type TodayStrengthSlot,
  type Unit,
  type WorkoutSession,
} from '../core';
import { fmtNum, type ActiveVM, type BodyweightVM, type CardioVM, type DeloadVM, type Experience, type FinisherOfferVM, GOAL_INFO, isGoalKind, type GoalKind, type OnboardingInput, type ProfileVM, type ExerciseVM, type HistoryItem, type LastSet, type PrHit, type SeriesPoint, type SettingsVM, type SummaryVM, type SwapOption, type TodayVM } from './types';

/* ---------- formatting ---------- */
const repsText = (r: RepRange) => (r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`);
const lastSets = (sets: readonly SetLog[] | undefined): LastSet[] => {
  if (!sets) return [];
  const done = doneSets(sets);
  return (done.length ? done : []).map((s) => ({ weight: s.weight, reps: s.reps }));
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Shapes requested from core (Dealer); read defensively until they land. TODO(core): replace with core types. */
type CoreProfileExt = { profile?: { name?: string; experience?: Experience }; onboarded?: boolean; onboardedAt?: string | null };
type CoreOnboardingExt = {
  completeOnboarding?: (input: { name: string; goal: GoalKind; experience: Experience; unit: OnboardingInput['unit']; schedule: OnboardingInput['schedule'] }) => unknown;
  updateProfile?: (patch: { name?: string; experience?: Experience }) => unknown;
};
const hintKind = (p: ProgressionHint | null | undefined) => (p?.action === 'deload' ? ({ hintKind: 'deload' } as const) : {});
const deloadVM = (d: DeloadStatus): DeloadVM => ({ active: d.active, due: d.due, daysLeft: d.daysLeft, reason: d.reason, weeksSinceLast: d.weeksSinceLast });

export function hintText(p: ProgressionHint | null | undefined, unit: Unit): string | undefined {
  if (!p) return undefined;
  switch (p.action) {
    case 'increase': return p.newWeight != null ? `Hit all reps last time — try ${fmtNum(p.newWeight)} ${unit}` : cap(p.message);
    case 'addReps': return p.targetReps != null && p.newWeight != null ? `Stay at ${fmtNum(p.newWeight)} ${unit}, aim for ${p.targetReps} reps` : cap(p.message);
    case 'deload': return cap(p.message); // core's ready-made "deload week: 2 × 5 at 120 lb, stop at RIR 3-4"
    default: return cap(p.message);
  }
}

const PR_ORDER: PRResult['kind'][] = ['topSet', 'e1rm', 'repsAtWeight'];
const PR_LABEL: Record<PRResult['kind'], string> = { topSet: 'Heaviest set', e1rm: 'e1RM', repsAtWeight: 'Rep PR' };

/* ---------- cardio helpers ---------- */
const METRIC_KEYS = ['incline', 'speed', 'calories', 'output'] as const;
const pickMetrics = (m: Partial<CardioVM> | CardioMetrics | undefined): CardioMetrics => {
  const out: CardioMetrics = {};
  if (m) METRIC_KEYS.forEach((k) => { if (m[k] != null) out[k] = m[k]; });
  return out;
};
/** Fallback only: core prefills entry.metrics from the last done block (phase 2); used if an entry has none. */
const lastMetrics = (state: CoreState, exerciseId: string, role: CardioRole): CardioMetrics | undefined =>
  getCardioHistory(state, { exerciseId, role }).find((h) => h.metrics)?.metrics;
const shortEffort = (note?: string) => {
  if (!note) return undefined;
  // "Zone 2 / easy aerobic: conversational pace, …; roughly 60-70% …, RPE 3-4 out of 10. …" → keep the key cue
  const rpe = note.match(/RPE\s*[\d-]+/i)?.[0];
  const pace = /conversational/i.test(note) ? 'conversational pace' : undefined;
  return [pace, rpe].filter(Boolean).join(', ') || note;
};
export function prText(pr: PRResult, unit: Unit): string {
  if (pr.kind === 'topSet') return `Heaviest set: ${fmtNum(pr.weight)} ${unit} × ${pr.reps}`;
  if (pr.kind === 'e1rm') return `e1RM ${fmtNum(Math.round(pr.value))} ${unit} (${fmtNum(pr.weight)}×${pr.reps})`;
  return `Rep PR: ${pr.reps} reps @ ${fmtNum(pr.weight)} ${unit}`;
}
const bestPr = (prs: PRResult[]) => [...prs].sort((a, b) => PR_ORDER.indexOf(a.kind) - PR_ORDER.indexOf(b.kind))[0];

/* ---------- ready gate ----------
 * Core loads IndexedDB asynchronously; anything written while status is 'loading' would be
 * replaced by the stored snapshot (or clobber it). Every UI action goes through this gate, which
 * checks the LIVE store status at call time (not a possibly stale render snapshot).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;
const ASYNC_ACTIONS = ['setDone', 'swap', 'addCustom', 'finish', 'exportFile', 'importText'];
export function gateActions<T extends Record<string, AnyFn>>(blocked: () => boolean, actions: T, asyncNames: readonly (keyof T)[] = ASYNC_ACTIONS): T {
  const out: Record<string, AnyFn> = {};
  for (const [name, fn] of Object.entries(actions)) {
    out[name] = (...args: unknown[]) => {
      if (blocked()) {
        console.warn(`[ppl] ignored "${name}": core not ready`);
        // async actions reject so callers' error paths run; sync ones are no-ops
        return asyncNames.includes(name) ? Promise.reject(new Error('Still loading your data — try again in a moment.')) : undefined;
      }
      return fn(...args);
    };
  }
  return out as T;
}

/* ---------- hook ---------- */
export function useUi() {
  const core = useCore();
  const state = useCoreState();
  const t = useToday();
  const w = useWorkout();
  const s = useSettings();
  const x = useExercises();
  const dt = useDataTransfer();
  const bwh = useBodyweight();
  const dl = useDeload();

  /* ---------- profile / onboarding ----------
   * TODO(core): Dealer is adding `settings.profile {name, experience}`, `settings.onboardedAt` and
   * `completeOnboarding()` (existing installs migrate as onboarded + fat-loss). Until they land:
   *  - goal.type persists today via updateSettings({goal: {type}}) (core's GoalType accepts any string);
   *  - name / experience / onboarded have NO core storage and SettingsPatch rejects those keys under
   *    strict types, so nothing is written for them and onboarding stays hidden (feature-detected
   *    below), so a fresh install can't loop through it on every launch. No storage outside core.
   */
  const ext = s.settings as typeof s.settings & CoreProfileExt;
  const coreExt = core as typeof core & CoreOnboardingExt;
  const profileSupported = 'profile' in ext || 'onboarded' in ext || 'onboardedAt' in ext;
  const onboarded = !profileSupported || ext.onboarded === true || !!ext.onboardedAt;
  const goalKind: GoalKind = isGoalKind(s.settings.goal.type) ? s.settings.goal.type : 'fat-loss';
  const profile: ProfileVM = { name: ext.profile?.name?.trim() ?? '', goal: goalKind, experience: ext.profile?.experience ?? null };
  const isFatLoss = goalKind === 'fat-loss';
  const unit = s.settings.unit;
  const effort = (s.finisherConfig?.effortNote ?? w.finisher?.effortNote);

  const finisherOffer: FinisherOfferVM | null = useMemo(() => {
    const f = w.finisher ?? t.today?.finisher ?? null;
    if (!f) return null;
    return {
      kind: f.exercise.id, name: f.exercise.name, minutes: f.durationMin, minMinutes: f.minDurationMin, maxMinutes: f.maxDurationMin,
      intensity: f.intensity, note: f.prescription || (f.effortNote ? `Zone 2: ${shortEffort(f.effortNote)}` : undefined),
    };
  }, [w.finisher, t.today]);

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
        ? { kind: c.exercise.id, name: c.exercise.name, minutes: c.durationMin, done: false, role: 'warmup', hint: c.prescription, ...pickMetrics(c.metrics ?? c.last?.metrics) }
        : { kind: 'incline-treadmill', minutes: 10, done: false },
      hasCardio: !!c,
      finisherOffer,
      stepTarget: s.activity?.dailyStepTarget,
      stepRange: s.activity?.stepTargetRange,
      exercises: strength.map((sl) => ({
        slotId: sl.slot.id,
        exerciseId: sl.exercise.id,
        name: sl.exercise.name,
        targetSets: sl.plannedSets ?? sl.target.sets, // cut dropSet can plan fewer sets
        targetReps: repsText(sl.target.repRange),
        lastSets: lastSets(sl.last?.sets),
        hint: hintText(sl.progression, unit),
        ...hintKind(sl.progression),
        swapped: sl.swapped,
        restSec: sl.target.restSec,
        sets: [],
      })),
      deload: deloadVM(tv.deload),
      finisherByDefault: isFatLoss,
    };
  }, [t.today, t.days.length, unit, finisherOffer, s.activity, isFatLoss]);

  const entryBySlot = useMemo(() => new Map(w.entries.map((e) => [e.entry.slotId, e])), [w.entries]);

  const active: ActiveVM | null = useMemo(() => {
    const sess = w.session;
    if (!sess) return null;
    const day = state.program.days.find((d) => d.id === sess.dayId);
    const cardioVM = (role: CardioRole): CardioVM | null => {
      const v = w.entries.find((e) => e.entry.kind === 'cardio' && (e.entry.role ?? 'warmup') === role);
      if (!v) return null;
      const ce = v.entry as CardioEntry;
      const ex = v.exercise as CardioExercise;
      return {
        role,
        kind: ce.exerciseId,
        name: ex.name,
        minutes: ce.durationMin,
        done: ce.done,
        ...pickMetrics(ce.metrics ?? lastMetrics(state, ce.exerciseId, role)),
        hint: v.prescription ?? (role === 'warmup' ? ex.defaultPrescription : `Zone 2 · ${shortEffort(effort) ?? 'easy aerobic'}`),
        ...(role === 'finisher' && w.finisher ? { minMinutes: w.finisher.minDurationMin, maxMinutes: w.finisher.maxDurationMin } : {}),
      };
    };
    return {
      sessionId: sess.id,
      dayName: day?.name ?? sess.dayId,
      startedAt: Date.parse(sess.startedAt),
      deload: !!sess.deload,
      cardio: cardioVM('warmup'),
      finisher: cardioVM('finisher'),
      finisherOffer: w.hasFinisher ? null : finisherOffer,
      exercises: w.entries.filter((e) => e.entry.kind === 'strength').map((e: ActiveEntryView): ExerciseVM => {
        const se = e.entry as StrengthEntry;
        return {
          slotId: se.slotId,
          exerciseId: se.exerciseId,
          name: e.exercise.name,
          // a deload session halves the programmed sets (core prefills that many)
          targetSets: sess.deload ? deloadSets(se.target.sets, state.progressionRules.deload?.setReductionPct) : se.target.sets,
          targetReps: repsText(se.target.repRange),
          lastSets: lastSets(e.last?.sets),
          hint: hintText(e.progression, w.unit),
          ...hintKind(e.progression),
          swapped: e.swapped,
          restSec: se.restSec,
          sets: se.sets.map((st) => ({ weight: st.weight, reps: st.reps, done: st.done })),
        };
      }),
    };
  }, [w.session, w.entries, w.unit, w.finisher, w.hasFinisher, state, effort, finisherOffer]);

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
    // = number of exercises whose current e1RM/top-set record was set in that session.
    const prSets = new Map<string, Set<string>>();
    for (const id of ids.keys()) {
      for (const pr of getPRs(state, id)) {
        if (!pr.sessionId || pr.kind === 'repsAtWeight') continue;
        prSets.set(pr.sessionId, (prSets.get(pr.sessionId) ?? new Set()).add(id));
      }
    }
    const prCount = new Map([...prSets].map(([k, v]) => [k, v.size]));
    const history: HistoryItem[] = sessions.map((ss: WorkoutSession) => {
      const strength = ss.entries.filter((e): e is StrengthEntry => e.kind === 'strength');
      const c = ss.entries.find((e): e is CardioEntry => e.kind === 'cardio' && e.slotId === CARDIO_SLOT_ID);
      const f = ss.entries.find((e): e is CardioEntry => e.kind === 'cardio' && e.slotId === FINISHER_SLOT_ID);
      const vol = strength.reduce((n, e) => n + volume(e.sets), 0);
      return {
        id: ss.id,
        date: Date.parse(ss.startedAt),
        dayName: state.program.days.find((d) => d.id === ss.dayId)?.name ?? ss.dayId,
        sets: strength.reduce((n, e) => n + doneSets(e.sets).length, 0),
        volume: convertWeight(vol, ss.unit, unit),
        prs: prCount.get(ss.id) ?? 0,
        cardio: c ? { kind: c.exerciseId, name: state.exercises[c.exerciseId]?.name, minutes: c.durationMin, done: c.done } : undefined,
        finisher: f ? { kind: f.exerciseId, name: state.exercises[f.exerciseId]?.name, minutes: f.durationMin, done: f.done } : undefined,
        durationMin: ss.finishedAt ? Math.round((Date.parse(ss.finishedAt) - Date.parse(ss.startedAt)) / 60000) : undefined,
      };
    });
    // warm-up + finisher minutes per session (done blocks only)
    const cardioMinutes = [...sessions].reverse().flatMap((ss) => {
      const mins = ss.entries.reduce((n, e) => (e.kind === 'cardio' && e.done ? n + e.durationMin : n), 0);
      return mins > 0 ? [{ date: Date.parse(ss.startedAt), minutes: mins }] : [];
    });
    return { history, loggedExercises: [...ids].map(([id, v]) => ({ id, name: v.name })), cardioMinutes };
  }, [state, unit]);

  const bodyweight: BodyweightVM = useMemo(() => {
    const tr = bwh.trend;
    const today = localDate();
    const conv = (e: { weight: number; unit: Unit }) => Math.round(convertWeight(e.weight, e.unit, unit) * 10) / 10;
    const todayEntry = bwh.entries.find((e) => e.date === today);
    return {
      unit,
      today: todayEntry ? conv(todayEntry) : undefined,
      latest: bwh.entries[0] ? conv(bwh.entries[0]) : undefined,
      points: tr.points.map((p) => ({ date: Date.parse(`${p.date}T12:00:00`), weight: p.weight, avg: p.avg })),
      currentAvg: tr.currentAvg,
      weeklyLossPct: tr.weeklyRate?.lossPctPerWeek ?? null,
      weeklyLoss: tr.weeklyRate?.lossPerWeek ?? null,
      status: tr.status,
      target: tr.target,
      goalLabel: isGoalKind(bwh.goal.type) ? GOAL_INFO[bwh.goal.type].label : 'Bodyweight trend',
      showRate: bwh.goal.type === 'fat-loss',
    };
  }, [bwh.trend, bwh.entries, bwh.goal, unit]);

  return {
    status: state.status,
    bodyweight,
    error: state.status === 'error' ? `Program data problem: ${state.seedErrors.slice(0, 3).join('; ')}` : null,
    settings,
    today,
    active,
    history,
    loggedExercises,
    cardioMinutes,
    deload: deloadVM(dl.status),
    profile,
    /** Core can store name/experience/onboarded (Dealer's profile fields have landed). */
    profileSupported,
    /** Only meaningful once ready: false → show first-run onboarding. */
    onboarded,
    isFatLoss,
    /** True once core has loaded persisted data; every action below is a no-op (or rejects) until then. */
    ready: state.status === 'ready',

    ...gateActions(() => core.getState().status !== 'ready', {
    start: () => { t.startSession(); },
    updateSet: (slotId: string, setIdx: number, patch: { weight?: number; reps?: number }) => { w.logSet(idx(slotId), setIdx, patch); },
    setDone: async (slotId: string, setIdx: number, done: boolean, vals: { weight: number; reps: number }): Promise<PrHit[]> => {
      const entry = entryBySlot.get(slotId);
      const res = w.logSet(idx(slotId), setIdx, { ...vals, done });
      if (!res.prs.length) return [];
      const top = bestPr(res.prs);
      const kinds = [...new Set([...res.prs].sort((a, b) => PR_ORDER.indexOf(a.kind) - PR_ORDER.indexOf(b.kind)).map((p) => PR_LABEL[p.kind]))];
      return [{ name: entry?.exercise.name ?? '', kinds, text: `${fmtNum(top.weight)} ${w.unit} × ${top.reps}` }];
    },
    addSet: (slotId: string) => { w.addSet(idx(slotId)); },
    updateCardio: (role: CardioRole, patch: Partial<CardioVM>, current?: CardioVM | null) => {
      const v = w.entries.find((e) => e.entry.kind === 'cardio' && (e.entry.role ?? 'warmup') === role);
      if (!v) return;
      if (patch.kind && patch.kind !== v.entry.exerciseId) w.swapExercise(role === 'finisher' ? FINISHER_SLOT_ID : CARDIO_SLOT_ID, patch.kind, 'session');
      const metrics = pickMetrics(patch);
      // Marking done persists the metrics shown (incl. ones prefilled from last time).
      const shown = patch.done ? pickMetrics(current ?? undefined) : {};
      const all = { ...shown, ...metrics };
      if (patch.minutes != null || patch.done != null || Object.keys(all).length) {
        w.logCardio(role, {
          ...(patch.minutes != null && { durationMin: patch.minutes }),
          ...(patch.done != null && { done: patch.done }),
          ...(Object.keys(all).length && { metrics: all }),
        });
      }
    },
    addFinisher: () => { w.addFinisher(); },
    removeFinisher: () => { w.removeFinisher(); },
    completeOnboarding: (input: OnboardingInput) => {
      if (coreExt.completeOnboarding) {
        coreExt.completeOnboarding({ name: input.name, goal: input.goal, experience: input.experience, unit: input.unit, schedule: input.schedule });
      } else {
        // TODO(core): no completeOnboarding yet: persist what core accepts; name/experience are dropped.
        s.updateSettings({ unit: input.unit, schedule: input.schedule, goal: { type: input.goal } });
      }
      if (input.bodyweight != null) bwh.logBodyweight({ weight: input.bodyweight, unit: input.unit });
    },
    updateProfile: (patch: Partial<{ name: string; goal: GoalKind; experience: Experience }>) => {
      if (patch.goal) s.updateSettings({ goal: { type: patch.goal } });
      const p = { ...(patch.name != null && { name: patch.name.trim() }), ...(patch.experience && { experience: patch.experience }) };
      if (Object.keys(p).length && coreExt.updateProfile) coreExt.updateProfile(p);
      // TODO(core): without core profile support, name/experience edits are not persisted.
    },
    startDeload: () => { dl.startDeload(); },
    endDeload: () => { dl.endDeload(); },
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
      const f = fs.entries.find((e): e is CardioEntry => e.kind === 'cardio' && e.slotId === FINISHER_SLOT_ID);
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
        finisher: f ? { kind: f.exerciseId, name: state.exercises[f.exerciseId]?.name, minutes: f.durationMin, done: f.done } : undefined,
      };
    },
    logBodyweight: (weight: number) => { bwh.logBodyweight({ weight, unit }); },
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
    }),
  };
}
export type Ui = ReturnType<typeof useUi>;
