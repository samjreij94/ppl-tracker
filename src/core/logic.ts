/**
 * Pure functions: rotation, prefill, progression, PRs, history, swaps, Today.
 * No I/O. All weights returned are in `state.settings.unit` (display unit).
 */
import { bestE1rm, convertCardioMetrics, convertWeight, doneSets, epley, roundToIncrement, topSet, volume } from './math';
import type {
  ActiveEntryView,
  CardioHistoryItem,
  CoreState,
  DaySummary,
  LastPerformance,
  TodayCardioSlot,
  TodayFinisher,
  TodaySlot,
  TodayStrengthSlot,
  TodayView,
} from './state';
import type {
  CardioExercise,
  CardioRole,
  CardioSlot,
  DeloadStatus,
  Exercise,
  FinisherConfig,
  ExerciseSeriesPoint,
  PRResult,
  Program,
  ProgressionHint,
  ProgressionRules,
  RepRange,
  Schedule,
  SetLog,
  Settings,
  StrengthEntry,
  StrengthExercise,
  Unit,
  WorkoutSession,
} from './types';
import { CARDIO_GROUP_ID, CARDIO_SLOT_ID, FINISHER_SLOT_ID } from './types';

const EPS = 1e-6;
const r2 = (n: number) => Math.round(n * 100) / 100;


/* ------------------------------------------------------------------ rotation */

/**
 * Next day id: the day after the most recently FINISHED session's day in
 * `program.rotations[schedule]` (wrapping); first day if no history.
 */
export function nextDayId(program: Program, sessions: readonly WorkoutSession[], schedule: Schedule): string | null {
  const rot = program.rotations[schedule] ?? program.days.map((d) => d.id);
  if (!rot.length) return null;
  const finished = sessions.filter((s) => s.finishedAt && rot.includes(s.dayId));
  if (!finished.length) return rot[0];
  const last = finished.reduce((a, b) => ((b.finishedAt ?? '') >= (a.finishedAt ?? '') ? b : a));
  return rot[(rot.indexOf(last.dayId) + 1) % rot.length];
}

/** Rotation overview (for a day picker). */
export function getDays(state: CoreState): DaySummary[] {
  const rot = state.program.rotations[state.settings.schedule];
  const next = nextDayId(state.program, state.sessions, state.settings.schedule);
  return rot.flatMap((id, i) => {
    const day = state.program.days.find((d) => d.id === id);
    if (!day) return [];
    const last = [...state.sessions].reverse().find((s) => s.dayId === id);
    return [{ day, rotationIndex: i, isNext: id === next, lastDoneAt: last?.finishedAt }];
  });
}

/* ------------------------------------------------------------------ lookups */

/** Exercise by id (seed or custom), or undefined. */
export function getExercise(state: CoreState, id: string): Exercise | undefined {
  return state.exercises[id];
}

/** Increment for an exercise in the display unit (exercise override → settings by category). */
export function getIncrement(exercise: StrengthExercise, settings: Settings): number {
  if (exercise.increment && exercise.increment > 0) {
    return r2(convertWeight(exercise.increment, exercise.incrementUnit ?? settings.unit, settings.unit));
  }
  return settings.increments[settings.unit][exercise.category];
}

/** The exercise to perform in a slot after permanent swaps. */
export function resolveSlotExerciseId(state: CoreState, slotId: string, programmedId: string): string {
  const swap = state.settings.permanentSwaps[slotId];
  return swap && state.exercises[swap] ? swap : programmedId;
}

/** One finished session's done sets of an exercise (weights converted to the requested unit). */
export interface ExerciseHistoryItem {
  sessionId: string;
  /** ISO start time of the session. */
  date: string;
  sets: SetLog[];
  /** Unit the session was LOGGED in (before conversion). */
  sourceUnit: Unit;
  /** Planned sets for this exercise in that session (Σ entry.target.sets). */
  targetSets: number;
  /** The session was a deload session (`WorkoutSession.deload`). */
  deload?: boolean;
}

/**
 * Done sets of an exercise across FINISHED sessions, newest session first, converted to `unit`.
 * `opts.excludeDeload` skips deload sessions (used by progression and prefill).
 */
export function exerciseHistory(
  sessions: readonly WorkoutSession[],
  exerciseId: string,
  unit: Unit,
  opts: { excludeDeload?: boolean } = {},
): ExerciseHistoryItem[] {
  const out: ExerciseHistoryItem[] = [];
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i];
    if (!s.finishedAt) continue;
    if (opts.excludeDeload && s.deload) continue;
    const sets: SetLog[] = [];
    let targetSets = 0;
    for (const e of s.entries) {
      if (e.kind !== 'strength' || e.exerciseId !== exerciseId) continue;
      targetSets += e.target?.sets ?? e.sets.length;
      for (const set of doneSets(e.sets)) sets.push({ ...set, weight: r2(convertWeight(set.weight, s.unit, unit)) });
    }
    if (sets.length) out.push({ sessionId: s.id, date: s.startedAt, sets, sourceUnit: s.unit, targetSets, ...(s.deload ? { deload: true } : {}) });
  }
  return out;
}

/**
 * Last finished performance of an exercise (display unit), or null. Substitutes have their OWN history.
 * Includes deload sessions unless `opts.excludeDeload` (prefill/progression pass it).
 */
export function lastPerformance(state: CoreState, exerciseId: string, opts: { excludeDeload?: boolean } = {}): LastPerformance | null {
  const h = exerciseHistory(state.sessions, exerciseId, state.settings.unit, opts)[0];
  return h ? { sessionId: h.sessionId, date: h.date, sets: h.sets, sourceUnit: h.sourceUnit } : null;
}

/* ------------------------------------------------------------------ prefill */

/**
 * Prefill `target.sets` sets from the last performance (weight & reps copied
 * set-by-set; extra sets repeat the last one). No history → weight 0,
 * reps = repRange.min. All prefilled sets are `done: false`.
 * `last` must already be in the target unit (see `lastPerformance`).
 */
export function prefillFromLast(
  target: { sets: number; repRange: RepRange },
  last: Pick<LastPerformance, 'sets'> | null,
  opts: { roundTo?: number } = {},
): SetLog[] {
  const src = last?.sets.length ? last.sets : null;
  return Array.from({ length: Math.max(1, target.sets) }, (_, i) => {
    const s = src ? src[Math.min(i, src.length - 1)] : null;
    const w = s?.weight ?? 0;
    return { weight: opts.roundTo ? roundToIncrement(w, opts.roundTo) : w, reps: s?.reps ?? target.repRange.min, done: false };
  });
}

/**
 * Planned set count for an exercise in a slot: the slot's sets, or the
 * progression hint's `newSets` when it says `dropSet` (never below
 * `progressionRules.minSetsPerSlot`, 2), or, during a deload week,
 * `deloadSets(sets)` = max(1, ceil(sets × 50%)).
 */
export function plannedSets(state: CoreState, exerciseId: string, target: { sets: number; repRange: RepRange }): number {
  const hint = getProgression(state, exerciseId, target);
  if (hint?.action === 'deload' && hint.newSets !== undefined) return hint.newSets;
  if (hint?.action === 'dropSet' && hint.newSets !== undefined) {
    return Math.max(Math.min(state.progressionRules.minSetsPerSlot, target.sets), hint.newSets);
  }
  return target.sets;
}

/** Deload set count: max(1, ceil(sets × (1 − setReductionPct/100))) — seed protocol `ceil(sets × 0.5)`, floor 1. */
export function deloadSets(sets: number, setReductionPct = 50): number {
  return Math.max(1, Math.ceil(sets * (1 - setReductionPct / 100) - 1e-9));
}

/**
 * Prefilled sets for an exercise in a slot (what `startSession` / a swap uses):
 * `plannedSets` sets copied from the exercise's OWN last NON-deload session;
 * weights converted to the display unit and, if that session was logged in
 * the other unit, rounded to the exercise increment. Then the progression hint
 * is applied:
 *
 * - `increase` / `reduceLoad`: every WORKING set (a set whose source set was at
 *   the last top-set weight) gets `hint.newWeight` and reps reset to
 *   `repRange.min` (= `hint.targetReps`; double progression restarts at the
 *   bottom of the range after a load change). Lighter back-off sets keep their last weight/reps.
 * - `deload`: ALL (reduced) sets get `hint.newWeight` (last working weight −10%,
 *   snapped to the increment) × `repRange.min` reps.
 * - `addReps` / `hold` / `dropSet`: last weight and reps unchanged.
 */
export function prefillSets(state: CoreState, exerciseId: string, target: { sets: number; repRange: RepRange }): SetLog[] {
  const last = lastPerformance(state, exerciseId, { excludeDeload: true });
  const ex = state.exercises[exerciseId];
  const roundTo =
    last && last.sourceUnit && last.sourceUnit !== state.settings.unit && ex?.kind === 'strength'
      ? getIncrement(ex, state.settings)
      : undefined;
  const n = plannedSets(state, exerciseId, target);
  const base = prefillFromLast({ sets: n, repRange: target.repRange }, last, { roundTo });
  const hint = getProgression(state, exerciseId, target);
  if (!hint || hint.newWeight === undefined || !last?.sets.length) return base;
  const reps = target.repRange.min;
  if (hint.action === 'deload') return base.map((s) => ({ ...s, weight: hint.newWeight!, reps }));
  if (hint.action !== 'increase' && hint.action !== 'reduceLoad') return base;
  const w = topSet(last.sets)?.weight ?? 0;
  return base.map((s, i) => {
    const src = last.sets[Math.min(i, last.sets.length - 1)];
    return Math.abs(src.weight - w) < 0.01 ? { ...s, weight: hint.newWeight!, reps } : s;
  });
}

/* ------------------------------------------------------------------ progression */

/**
 * Double progression (research/SCHEMA.md progressionRules; cut overrides when
 * `goalType === rules.cut.appliesWhenGoalType`). `history` is newest first, in `unit`.
 * Working weight = last top-set weight.
 *
 * - no history → `hold` ("first time: pick a weight for ~min+2 reps")
 * - last session: ≥ targetSets sets at the working weight, EVERY one ≥ max → `increase`
 * - stall streak k = consecutive newest sessions with a set < min at the same load
 *   (cut + maintainCountsAsSuccess: a session matching the previous one's load AND reps ends the streak = success)
 *   - base: k ≥ N(2) → `reduceLoad` −10%; 0 < k < N → `hold`
 *   - cut:  k < N(3) → `hold`; k = N → `dropSet` (if targetSets > 2) else `hold` ("hold one more session");
 *           k > N → `reduceLoad` −5%
 * - otherwise → `addReps` (target = lowest working set + 1, capped at max)
 *
 * Phase-1 note: minimal implementation; edge cases are refined in phase 2.
 */
export function suggestProgression(args: {
  exerciseId: string;
  repRange: RepRange;
  targetSets: number;
  /** Newest first. `sourceUnit`/`targetSets` (from `exerciseHistory`) refine rounding and the all-sets check. */
  history: ReadonlyArray<{ sets: SetLog[]; sourceUnit?: Unit; targetSets?: number }>;
  unit: Unit;
  increment: number;
  rules: ProgressionRules;
  /** `settings.goal.type`; selects the cut rules when it matches. */
  goalType?: string;
  /** A deload week is active → always returns a `deload` hint (pass non-deload history). */
  deload?: boolean;
}): ProgressionHint {
  const { exerciseId, repRange, targetSets, history, unit, increment, rules, goalType } = args;
  const cut = rules.cut && goalType === rules.cut.appliesWhenGoalType ? rules.cut : undefined;
  const tag: ProgressionHint['rules'] = cut ? 'cut' : 'base';
  if (args.deload) {
    const newSets = deloadSets(targetSets, rules.deload.setReductionPct);
    const rir = rules.deload.targetRir ?? '3-4';
    const top = history[0]?.sets.length ? topSet(history[0].sets)?.weight : undefined;
    if (top === undefined) {
      return { exerciseId, action: 'deload', newSets, targetReps: repRange.min, rules: tag, message: `deload week: ${newSets} light sets of ${repRange.min}, stop at RIR ${rir}` };
    }
    const newWeight = roundToIncrement(top * (1 - rules.deload.loadReductionPct / 100), increment, 'nearest');
    return {
      exerciseId,
      action: 'deload',
      newWeight,
      newSets,
      targetReps: repRange.min,
      rules: tag,
      message: `deload week: ${newSets} × ${repRange.min} at ${newWeight} ${unit}, stop at RIR ${rir}`,
    };
  }
  const N = Math.max(1, cut?.stallConsecutiveSessions ?? rules.stallConsecutiveSessions);
  const pct = cut?.stallLoadReductionPct ?? rules.stallLoadReductionPct;
  const last = history[0];
  if (!last || !last.sets.length) {
    return { exerciseId, action: 'hold', targetReps: repRange.min, rules: tag, message: `first time: pick a weight you can do for ~${repRange.min + 2} reps` };
  }
  const w = topSet(last.sets)?.weight ?? 0;
  const atW = (sets: SetLog[]) => sets.filter((s) => Math.abs(s.weight - w) < 0.01);
  const working = atW(last.sets);
  const needSets = Math.max(1, Math.min(targetSets, last.targetSets ?? targetSets));
  if (working.length >= needSets && working.every((s) => s.reps >= repRange.max)) {
    // Logged in the other unit → snap to this unit's increment grid.
    const newWeight = last.sourceUnit && last.sourceUnit !== unit ? roundToIncrement(w + increment, increment) : r2(w + increment);
    return { exerciseId, action: 'increase', newWeight, increment, targetReps: repRange.min, rules: tag, message: `add ${increment} ${unit}` };
  }
  const belowMin = (sets: SetLog[]) => atW(sets).some((s) => s.reps < repRange.min);
  const sameAsPrev = (a: SetLog[], b: SetLog[] | undefined) => {
    if (!b) return false;
    const x = atW(a).map((s) => s.reps).join(',');
    const y = atW(b).map((s) => s.reps).join(',');
    return x !== '' && x === y;
  };
  let k = 0;
  for (let i = 0; i < history.length; i++) {
    if (!belowMin(history[i].sets)) break;
    if (cut?.maintainCountsAsSuccess && sameAsPrev(history[i].sets, history[i + 1]?.sets)) break;
    k++;
  }
  if (k > 0) {
    const reduce = (): ProgressionHint => {
      const newWeight = roundToIncrement(w * (1 - pct / 100), increment, 'nearest');
      return { exerciseId, action: 'reduceLoad', newWeight, targetReps: repRange.min, rules: tag, message: `stalled: drop ~${pct}% to ${newWeight} ${unit}` };
    };
    if (!cut) return k >= N ? reduce() : hold();
    if (k < N) return hold();
    if (k === N) {
      return targetSets > rules.minSetsPerSlot
        ? { exerciseId, action: 'dropSet', newWeight: w, newSets: targetSets - 1, targetReps: repRange.min, rules: tag, message: `stalled on a cut: drop one set (${targetSets - 1} sets) at ${w} ${unit}` }
        : { ...hold(), message: `stalled on a cut: hold ${w} ${unit} one more session` };
    }
    return reduce();
  }
  if (cut?.maintainCountsAsSuccess && sameAsPrev(last.sets, history[1]?.sets)) {
    return { ...hold(), message: `maintained ${w} ${unit} — that's a win on a cut; aim for +1 rep` };
  }
  const targetReps = Math.min(repRange.max, Math.min(...working.map((s) => s.reps)) + 1);
  return { exerciseId, action: 'addReps', newWeight: w, targetReps, rules: tag, message: `add reps at ${w} ${unit}: aim for ${targetReps}` };

  function hold(): ProgressionHint {
    return { exerciseId, action: 'hold', newWeight: w, targetReps: repRange.min, rules: tag, message: `hold ${w} ${unit}, aim for ${repRange.min}+ reps` };
  }
}

/**
 * Progression hint for an exercise (optionally with a slot's rep range / sets). Null for cardio/unknown.
 * Deload sessions are excluded from the history (no stall counting, no prefill source);
 * while `settings.deload.active` the hint is always `deload`.
 */
export function getProgression(
  state: CoreState,
  exerciseId: string,
  target?: { sets: number; repRange: RepRange },
): ProgressionHint | null {
  const ex = state.exercises[exerciseId];
  if (!ex || ex.kind !== 'strength') return null;
  return suggestProgression({
    exerciseId,
    repRange: target?.repRange ?? ex.repRange,
    targetSets: target?.sets ?? ex.defaultSets,
    history: exerciseHistory(state.sessions, exerciseId, state.settings.unit, { excludeDeload: true }),
    unit: state.settings.unit,
    increment: getIncrement(ex, state.settings),
    rules: state.progressionRules,
    goalType: state.settings.goal.type,
    deload: !!state.settings.deload?.active,
  });
}

/* ------------------------------------------------------------------ PRs */

/**
 * PRs set by `set` versus `prior` sets of the same exercise (all in the same unit).
 * Returns [] if the set isn't done/valid or there is no prior data (no "first ever" PRs).
 */
export function detectPRs(exerciseId: string, set: SetLog, prior: readonly SetLog[]): PRResult[] {
  if (!set.done || set.reps <= 0) return [];
  const p = doneSets(prior);
  if (!p.length) return [];
  const out: PRResult[] = [];
  const e = epley(set.weight, set.reps);
  const prevE = bestE1rm(p);
  if (set.weight > 0 && e > prevE + EPS) out.push({ kind: 'e1rm', exerciseId, value: r2(e), previous: r2(prevE), weight: set.weight, reps: set.reps });
  const prevTop = Math.max(...p.map((s) => s.weight));
  if (set.weight > prevTop + EPS) out.push({ kind: 'topSet', exerciseId, value: set.weight, previous: prevTop, weight: set.weight, reps: set.reps });
  const atW = p.filter((s) => Math.abs(s.weight - set.weight) < 0.01);
  if (atW.length) {
    const prevReps = Math.max(...atW.map((s) => s.reps));
    if (set.reps > prevReps) out.push({ kind: 'repsAtWeight', exerciseId, value: set.reps, previous: prevReps, weight: set.weight, reps: set.reps });
  }
  return out;
}

/**
 * Current all-time records for an exercise (display unit): one `e1rm`, one
 * `topSet`, and one `repsAtWeight` per distinct weight (heaviest first).
 * `previous` = the record that stood before it was set.
 */
export function getPRs(state: CoreState, exerciseId: string): PRResult[] {
  const hist = exerciseHistory(state.sessions, exerciseId, state.settings.unit).reverse(); // oldest first
  let bestE: PRResult | undefined;
  let bestT: PRResult | undefined;
  const reps = new Map<number, PRResult>();
  for (const h of hist) {
    for (const s of h.sets) {
      const base = { exerciseId, weight: s.weight, reps: s.reps, date: h.date, sessionId: h.sessionId };
      const e = r2(epley(s.weight, s.reps));
      if (s.weight > 0 && (!bestE || e > bestE.value + EPS)) bestE = { ...base, kind: 'e1rm', value: e, previous: bestE?.value };
      if (!bestT || s.weight > bestT.value + EPS) bestT = { ...base, kind: 'topSet', value: s.weight, previous: bestT?.value };
      const key = r2(s.weight);
      const cur = reps.get(key);
      if (!cur || s.reps > cur.value) reps.set(key, { ...base, kind: 'repsAtWeight', value: s.reps, previous: cur?.value });
    }
  }
  return [
    ...(bestE ? [bestE] : []),
    ...(bestT ? [bestT] : []),
    ...[...reps.values()].sort((a, b) => b.weight - a.weight),
  ];
}

/** Prior done sets for PR comparison: finished history + earlier done sets in `active` (excluding one set). */
export function priorSetsFor(
  state: CoreState,
  exerciseId: string,
  exclude?: { entryIdx: number; setIdx: number },
): SetLog[] {
  const unit = state.settings.unit;
  const sets = exerciseHistory(state.sessions, exerciseId, unit).flatMap((h) => h.sets);
  const a = state.active;
  if (a) {
    a.entries.forEach((e, ei) => {
      if (e.kind !== 'strength' || e.exerciseId !== exerciseId) return;
      e.sets.forEach((s, si) => {
        if (exclude && ei === exclude.entryIdx && si === exclude.setIdx) return;
        if (s.done) sets.push({ ...s, weight: r2(convertWeight(s.weight, a.unit, unit)) });
      });
    });
  }
  return sets;
}

/* ------------------------------------------------------------------ history */

/** Finished sessions, newest first. Optional filter by exercise performed and limit. */
export function getSessions(state: CoreState, opts: { exerciseId?: string; limit?: number } = {}): WorkoutSession[] {
  let list = [...state.sessions].reverse();
  if (opts.exerciseId) list = list.filter((s) => s.entries.some((e) => e.exerciseId === opts.exerciseId));
  return opts.limit ? list.slice(0, opts.limit) : list;
}

/** One point per finished session (oldest → newest) for an exercise, display unit. Cardio → []. */
export function getExerciseSeries(state: CoreState, exerciseId: string): ExerciseSeriesPoint[] {
  return exerciseHistory(state.sessions, exerciseId, state.settings.unit)
    .reverse()
    .map((h) => ({
      date: h.date,
      sessionId: h.sessionId,
      e1rm: r2(bestE1rm(h.sets)),
      topSet: topSet(h.sets) ?? { weight: 0, reps: 0 },
      volume: r2(volume(h.sets)),
    }));
}

/* ------------------------------------------------------------------ swaps */

/**
 * Like-for-like alternatives for `exerciseId`: every other exercise (seed or
 * custom) in the slot's substitution group (or the exercise's own group).
 * When `slotId` is given, the slot's programmed exercise is included so the
 * user can swap back. Same kind only (cardio ↔ cardio).
 */
export function getSwaps(state: CoreState, exerciseId: string, slotId?: string): Exercise[] {
  const ex = state.exercises[exerciseId];
  if (!ex) return [];
  let groupId = ex.substitutionGroup;
  let programmed: string | undefined;
  if (slotId === CARDIO_SLOT_ID) {
    groupId = CARDIO_GROUP_ID;
    programmed = state.warmupExerciseId;
  } else if (slotId === FINISHER_SLOT_ID) {
    groupId = state.finisher.pattern;
    programmed = state.finisher.defaultExerciseId;
  } else if (slotId) {
    const slot = state.program.days.flatMap((d) => d.slots).find((s) => s.id === slotId);
    if (slot) {
      groupId = slot.substitutionGroup ?? groupId;
      programmed = slot.exerciseId;
    }
  }
  const ids = new Set(groupId ? state.groups[groupId]?.exerciseIds ?? [] : []);
  if (programmed) ids.add(programmed);
  ids.delete(exerciseId);
  return [...ids].map((id) => state.exercises[id]).filter((e): e is Exercise => !!e && e.kind === ex.kind);
}

/* ------------------------------------------------------------------ today */

/**
 * The warm-up cardio slot, or null if cardio is disabled. Exercise = permanent
 * swap on `CARDIO_SLOT_ID`, else the remembered last warm-up pick, else
 * `warmup.defaultExerciseId`. Duration + metrics prefill from the last warm-up
 * with that exercise (else its `defaultDurationMin`, else settings.cardio).
 */
export function cardioSlot(state: CoreState): { slot: CardioSlot; exercise: CardioExercise } | null {
  if (!state.settings.cardio.enabled) return null;
  const lastAny = getCardioHistory(state, { role: 'warmup' })[0];
  const candidates = [state.settings.permanentSwaps[CARDIO_SLOT_ID], lastAny?.exerciseId, state.warmupExerciseId];
  const ex = candidates.map((id) => (id ? state.exercises[id] : undefined)).find((e): e is CardioExercise => e?.kind === 'cardio');
  if (!ex) return null;
  const last = getCardioHistory(state, { exerciseId: ex.id, role: 'warmup' })[0];
  const durationMin = last?.durationMin ?? ex.defaultDurationMin ?? state.settings.cardio.defaultDurationMin;
  return {
    slot: {
      id: CARDIO_SLOT_ID,
      kind: 'cardio',
      role: 'warmup',
      exerciseId: ex.id,
      durationMin,
      substitutionGroup: CARDIO_GROUP_ID,
      ...(last?.metrics ? { metrics: last.metrics } : {}),
    },
    exercise: ex,
  };
}

/**
 * Done cardio entries (warm-ups and finishers), newest first. `metrics.speed`
 * and `metrics.distance` are converted to the display unit's convention
 * (lb → mph/mi, kg → km/h/km). Cardio never appears in strength stats.
 */
export function getCardioHistory(state: CoreState, opts: { exerciseId?: string; role?: CardioRole } = {}): CardioHistoryItem[] {
  const out: CardioHistoryItem[] = [];
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const s = state.sessions[i];
    for (const e of s.entries) {
      if (e.kind !== 'cardio' || !e.done) continue;
      const role: CardioRole = e.role ?? 'warmup';
      if (opts.role && role !== opts.role) continue;
      if (opts.exerciseId && e.exerciseId !== opts.exerciseId) continue;
      out.push({
        sessionId: s.id,
        date: s.startedAt,
        exerciseId: e.exerciseId,
        role,
        durationMin: e.durationMin,
        ...(e.metrics ? { metrics: convertCardioMetrics(e.metrics, s.unit, state.settings.unit) } : {}),
      });
    }
  }
  return out;
}

/**
 * Finisher prescription text (never the exercise's 10-min warm-up
 * `defaultPrescription`): `"<min> min <exercise>, easy zone 2: <cue> (RPE x-y)"`.
 * The cue is the effortNote's description (text after the first `:` up to the
 * first `;`); the whole note is used when it is ≤ 80 chars. RPE is pulled from the note when present.
 * e.g. "15 min Incline Treadmill Walk, easy zone 2: conversational pace, you can speak in full sentences (RPE 3-4)".
 */
export function finisherPrescription(config: Pick<FinisherConfig, 'intensity' | 'effortNote'>, exercise: Pick<CardioExercise, 'name'>, durationMin: number): string {
  const intensity = config.intensity ? config.intensity.replace(/[-_]+/g, ' ').trim() : '';
  const label = intensity ? (/zone\s*2/i.test(intensity) ? `easy ${intensity}` : intensity) : 'easy';
  const note = config.effortNote?.trim();
  let cue = '';
  let rpe = '';
  if (note) {
    if (note.length <= 80) cue = note.replace(/\.$/, '');
    else {
      const afterColon = note.includes(':') ? note.slice(note.indexOf(':') + 1) : note;
      cue = afterColon.split(/[;.]/)[0].trim();
      if (cue.length > 80) cue = '';
      const m = /RPE\s*\d+(?:\s*-\s*\d+)?/i.exec(note);
      rpe = m ? m[0].replace(/\s+/g, ' ') : '';
    }
  }
  return `${durationMin} min ${exercise.name}, ${label}${cue ? `: ${cue}` : ''}${rpe ? ` (${rpe})` : ''}`;
}

/** Warm-up prescription: the exercise's `defaultPrescription`, else `"<min> min easy-moderate"`. */
export function warmupPrescription(exercise: Pick<CardioExercise, 'defaultPrescription'>, durationMin: number): string {
  return exercise.defaultPrescription ?? `${durationMin} min easy-moderate`;
}

/**
 * The optional finisher: exercise = permanent swap on `FINISHER_SLOT_ID`, else
 * the last finisher's exercise, else `finisher.defaultExerciseId`; duration =
 * last finisher's (clamped to min..max) else `finisher.defaultDurationMin`
 * (the exercise's own warm-up duration is ignored); metrics from the last
 * finisher with that exercise.
 */
export function finisherOffer(state: CoreState): TodayFinisher | null {
  const f = state.finisher;
  const last = getCardioHistory(state, { role: 'finisher' })[0] ?? null;
  const swap = state.settings.permanentSwaps[FINISHER_SLOT_ID];
  const candidates = [swap, last?.exerciseId, f.defaultExerciseId, state.warmupExerciseId];
  const ex = candidates.map((id) => (id ? state.exercises[id] : undefined)).find((e): e is CardioExercise => e?.kind === 'cardio');
  if (!ex) return null;
  const clamp = (n: number) => Math.min(f.maxDurationMin, Math.max(f.minDurationMin, n));
  const durationMin = clamp(last?.durationMin ?? f.defaultDurationMin);
  const sameEx = getCardioHistory(state, { role: 'finisher', exerciseId: ex.id })[0];
  const metrics = sameEx?.metrics;
  return {
    slot: {
      id: FINISHER_SLOT_ID,
      kind: 'cardio',
      role: 'finisher',
      exerciseId: ex.id,
      durationMin,
      substitutionGroup: f.pattern,
      ...(metrics ? { metrics } : {}),
    },
    exercise: ex,
    programmedExerciseId: f.defaultExerciseId,
    swapped: ex.id !== f.defaultExerciseId,
    durationMin,
    minDurationMin: f.minDurationMin,
    maxDurationMin: f.maxDurationMin,
    intensity: f.intensity,
    effortNote: f.effortNote,
    prescription: finisherPrescription(f, ex, durationMin),
    last,
    autoAdd: state.settings.finisher.autoAdd,
    ...(metrics ? { metrics } : {}),
  };
}

/**
 * What to train: the next day in the rotation (or `dayId` to preview another),
 * cardio first, then strength slots after permanent swaps, with targets, last
 * performance of the exercise actually scheduled and a progression hint.
 * `deload` = `deloadDue(state, now)`. Null if the program has no days.
 */
export function getToday(state: CoreState, dayId?: string, now: Date = new Date()): TodayView | null {
  const next = nextDayId(state.program, state.sessions, state.settings.schedule);
  const id = dayId ?? next;
  const day = state.program.days.find((d) => d.id === id);
  if (!day) return null;
  const slots: TodaySlot[] = [];
  const c = cardioSlot(state);
  if (c) {
    const t: TodayCardioSlot = {
      kind: 'cardio',
      slot: c.slot,
      exercise: c.exercise,
      programmedExerciseId: state.warmupExerciseId,
      swapped: c.exercise.id !== state.warmupExerciseId,
      durationMin: c.slot.durationMin,
      last: getCardioHistory(state, { exerciseId: c.exercise.id, role: 'warmup' })[0] ?? null,
      prescription: warmupPrescription(c.exercise, c.slot.durationMin),
      ...(c.slot.metrics ? { metrics: c.slot.metrics } : {}),
    };
    slots.push(t);
  }
  for (const slot of day.slots) {
    const exId = resolveSlotExerciseId(state, slot.id, slot.exerciseId);
    const ex = state.exercises[exId];
    if (!ex || ex.kind !== 'strength') continue;
    const target = { sets: slot.sets, repRange: slot.repRange, restSec: slot.restSec ?? state.settings.defaultRestSec };
    const t: TodayStrengthSlot = {
      kind: 'strength',
      slot,
      exercise: ex,
      programmedExerciseId: slot.exerciseId,
      swapped: exId !== slot.exerciseId,
      target,
      plannedSets: plannedSets(state, exId, target),
      last: lastPerformance(state, exId),
      progression: getProgression(state, exId, target)!,
    };
    slots.push(t);
  }
  const rot = state.program.rotations[state.settings.schedule];
  return { day, rotationIndex: rot.indexOf(day.id), isNext: day.id === next, slots, finisher: finisherOffer(state), activeSession: state.active, deload: deloadDue(state, now) };
}

/* ------------------------------------------------------------------ active session view */

/** Enrich the active session's entries for the workout screen. [] if none. */
export function getActiveEntries(state: CoreState): ActiveEntryView[] {
  const a = state.active;
  if (!a) return [];
  const day = state.program.days.find((d) => d.id === a.dayId);
  return a.entries.flatMap((entry, index) => {
    const exercise = state.exercises[entry.exerciseId];
    if (!exercise) return [];
    const programmedExerciseId =
      entry.kind === 'cardio'
        ? entry.role === 'finisher'
          ? state.finisher.defaultExerciseId
          : state.warmupExerciseId
        : day?.slots.find((s) => s.id === entry.slotId)?.exerciseId ?? entry.exerciseId;
    const strength = entry.kind === 'strength' ? (entry as StrengthEntry) : null;
    return [
      {
        index,
        entry,
        exercise,
        programmedExerciseId,
        swapped: programmedExerciseId !== entry.exerciseId,
        last: strength ? lastPerformance(state, entry.exerciseId) : null,
        progression: strength ? getProgression(state, entry.exerciseId, strength.target) : null,
        ...(entry.kind === 'cardio' && exercise.kind === 'cardio'
          ? {
              prescription:
                entry.role === 'finisher'
                  ? finisherPrescription(state.finisher, exercise, entry.durationMin)
                  : warmupPrescription(exercise, entry.durationMin),
            }
          : {}),
      },
    ];
  });
}

/* ------------------------------------------------------------------ deload */

const DAY_MS = 86_400_000;

/**
 * Deload status (research/SCHEMA.md progressionRules.deload + cutAdjustments.deloadNote).
 *
 * - `dueAfterWeeks`: `deload.frequencyWeeks.min` (6); under the fat-loss cut
 *   `cut.deloadFrequencyWeeks.min` (5, from deloadNote "around every 5-6 weeks").
 * - `weeksSinceLast`: whole calendar weeks since `settings.deload.lastEndedAt`
 *   (else the newest deload session's finish, else the FIRST finished session's start); null with neither.
 * - `due` (never while active, and only with ≥ 1 finished non-deload session since the anchor) when
 *   `weeksSinceLast ≥ dueAfterWeeks`, OR when ≥ 3 distinct exercises trained in the
 *   last 14 days currently have a stall hint (`reduceLoad` / `dropSet`) — the seed's early trigger.
 * - While active: `endsAt` = startedAt + weekLength days, `daysLeft` = whole days remaining (≥ 0).
 *   The store auto-ends an expired deload on `init()` and `startSession()`.
 */
export function deloadDue(state: CoreState, now: Date = new Date()): DeloadStatus {
  const dl = state.settings.deload ?? { active: false, weekLength: 7 };
  const rules = state.progressionRules;
  const cut = rules.cut && state.settings.goal.type === rules.cut.appliesWhenGoalType ? rules.cut : undefined;
  const dueAfterWeeks = cut?.deloadFrequencyWeeks?.min ?? rules.deload.frequencyWeeks?.min ?? 6;
  const finished = state.sessions.filter((s) => s.finishedAt);
  const lastDeloadSession = [...finished].reverse().find((s) => s.deload);
  const anchor =
    dl.lastEndedAt ?? lastDeloadSession?.finishedAt ?? finished.reduce<string | undefined>((a, s) => (!a || s.startedAt < a ? s.startedAt : a), undefined);
  const weeksSinceLast = anchor ? Math.max(0, Math.floor((now.getTime() - Date.parse(anchor)) / (7 * DAY_MS))) : null;
  const base = { weeksSinceLast, dueAfterWeeks };
  if (dl.active) {
    const start = dl.startedAt ? Date.parse(dl.startedAt) : now.getTime();
    const end = start + Math.max(1, dl.weekLength || 7) * DAY_MS;
    return {
      ...base,
      active: true,
      startedAt: dl.startedAt,
      endsAt: new Date(end).toISOString(),
      daysLeft: Math.max(0, Math.ceil((end - now.getTime()) / DAY_MS)),
      due: false,
      reason: null,
    };
  }
  // ≥ (not >): a session can start and finish in the same millisecond (fast clients/tests), and the
  // anchor may be that very session's startedAt. Deload sessions never count.
  const trainedSince = anchor ? finished.some((s) => !s.deload && (s.finishedAt ?? '') >= anchor) : false;
  if (weeksSinceLast !== null && trainedSince && weeksSinceLast >= dueAfterWeeks) {
    return { ...base, active: false, due: true, reason: `${weeksSinceLast} weeks since ${dl.lastEndedAt || lastDeloadSession ? 'last deload' : 'you started'}` };
  }
  // Early trigger: 3+ exercises stalled within ~2 weeks.
  const since = now.getTime() - 14 * DAY_MS;
  const targets = new Map<string, { sets: number; repRange: RepRange }>();
  for (let i = finished.length - 1; i >= 0; i--) {
    const s = finished[i];
    if (s.deload || Date.parse(s.startedAt) < since) continue;
    for (const e of s.entries) {
      if (e.kind === 'strength' && !targets.has(e.exerciseId) && e.target) targets.set(e.exerciseId, e.target);
    }
  }
  let stalled = 0;
  for (const [id, target] of targets) {
    const a = getProgression(state, id, target)?.action;
    if (a === 'reduceLoad' || a === 'dropSet') stalled++;
  }
  if (stalled >= 3) return { ...base, active: false, due: true, reason: `${stalled} exercises stalled in the last 2 weeks` };
  return { ...base, active: false, due: false, reason: null };
}
