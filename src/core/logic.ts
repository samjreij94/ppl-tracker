/**
 * Pure functions: rotation, prefill, progression, PRs, history, swaps, Today.
 * No I/O. All weights returned are in `state.settings.unit` (display unit).
 */
import { bestE1rm, convertWeight, doneSets, epley, roundToIncrement, topSet, volume } from './math';
import type {
  ActiveEntryView,
  CoreState,
  DaySummary,
  LastPerformance,
  TodayCardioSlot,
  TodaySlot,
  TodayStrengthSlot,
  TodayView,
} from './state';
import type {
  CardioExercise,
  CardioSlot,
  Exercise,
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
import { CARDIO_GROUP_ID, CARDIO_SLOT_ID } from './types';

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

/** Done sets of an exercise across FINISHED sessions, newest session first, converted to `unit`. */
export function exerciseHistory(
  sessions: readonly WorkoutSession[],
  exerciseId: string,
  unit: Unit,
): Array<{ sessionId: string; date: string; sets: SetLog[] }> {
  const out: Array<{ sessionId: string; date: string; sets: SetLog[] }> = [];
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i];
    if (!s.finishedAt) continue;
    const sets: SetLog[] = [];
    for (const e of s.entries) {
      if (e.kind !== 'strength' || e.exerciseId !== exerciseId) continue;
      for (const set of doneSets(e.sets)) sets.push({ ...set, weight: r2(convertWeight(set.weight, s.unit, unit)) });
    }
    if (sets.length) out.push({ sessionId: s.id, date: s.startedAt, sets });
  }
  return out;
}

/** Last finished performance of an exercise (display unit), or null. Substitutes have their OWN history. */
export function lastPerformance(state: CoreState, exerciseId: string): LastPerformance | null {
  return exerciseHistory(state.sessions, exerciseId, state.settings.unit)[0] ?? null;
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
): SetLog[] {
  const src = last?.sets.length ? last.sets : null;
  return Array.from({ length: Math.max(1, target.sets) }, (_, i) => {
    const s = src ? src[Math.min(i, src.length - 1)] : null;
    return { weight: s?.weight ?? 0, reps: s?.reps ?? target.repRange.min, done: false };
  });
}

/* ------------------------------------------------------------------ progression */

/**
 * Double progression (seed progressionRules):
 * - no history → `hold` ("first time: pick a weight for ~min+2 reps")
 * - last session: ≥ `targetSets` done sets and EVERY one ≥ repRange.max → `increase` by `increment`
 * - any set < repRange.min at the same load in the last `stallConsecutiveSessions` sessions → `reduce` by `stallLoadReductionPct`
 * - any set < repRange.min (once) → `hold`
 * - otherwise → `addReps` (target = lowest set's reps + 1, capped at max)
 *
 * `history` is newest first, in `unit` (see `exerciseHistory`). Working weight = last top-set weight.
 */
export function suggestProgression(args: {
  exerciseId: string;
  repRange: RepRange;
  targetSets: number;
  history: ReadonlyArray<{ sets: SetLog[] }>;
  unit: Unit;
  increment: number;
  rules: ProgressionRules;
}): ProgressionHint {
  const { exerciseId, repRange, targetSets, history, unit, increment, rules } = args;
  const last = history[0];
  if (!last || !last.sets.length) {
    return {
      exerciseId,
      action: 'hold',
      targetReps: repRange.min,
      message: `first time: pick a weight you can do for ~${repRange.min + 2} reps`,
    };
  }
  const w = topSet(last.sets)?.weight ?? 0;
  const working = last.sets.filter((s) => Math.abs(s.weight - w) < 0.01);
  const allMax = working.length >= Math.max(1, targetSets) && working.every((s) => s.reps >= repRange.max);
  if (allMax) {
    const newWeight = r2(w + increment);
    return { exerciseId, action: 'increase', newWeight, increment, targetReps: repRange.min, message: `add ${increment} ${unit}` };
  }
  const belowMin = (sets: SetLog[], at: number) =>
    sets.some((s) => Math.abs(s.weight - at) < 0.01 && s.reps < repRange.min);
  if (belowMin(last.sets, w)) {
    const n = Math.max(1, rules.stallConsecutiveSessions);
    const stalled = history.length >= n && history.slice(0, n).every((h) => belowMin(h.sets, w));
    if (stalled) {
      const newWeight = roundToIncrement(w * (1 - rules.stallLoadReductionPct / 100), increment, 'nearest');
      return {
        exerciseId,
        action: 'reduce',
        newWeight,
        targetReps: repRange.min,
        message: `stalled ${n}×: drop ${rules.stallLoadReductionPct}% to ${newWeight} ${unit}`,
      };
    }
    return { exerciseId, action: 'hold', newWeight: w, targetReps: repRange.min, message: `hold ${w} ${unit}, aim for ${repRange.min}+ reps` };
  }
  const minReps = Math.min(...working.map((s) => s.reps));
  const targetReps = Math.min(repRange.max, minReps + 1);
  return { exerciseId, action: 'addReps', newWeight: w, targetReps, message: `add reps at ${w} ${unit}: aim for ${targetReps}` };
}

/** Progression hint for an exercise (optionally with a slot's rep range / sets). Null for cardio/unknown. */
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
    history: exerciseHistory(state.sessions, exerciseId, state.settings.unit),
    unit: state.settings.unit,
    increment: getIncrement(ex, state.settings),
    rules: state.progressionRules,
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

/** The cardio slot for today (after permanent swap), or null if cardio is disabled. */
export function cardioSlot(state: CoreState): { slot: CardioSlot; exercise: CardioExercise } | null {
  if (!state.settings.cardio.enabled) return null;
  const id = resolveSlotExerciseId(state, CARDIO_SLOT_ID, state.warmupExerciseId);
  const ex = state.exercises[id];
  if (!ex || ex.kind !== 'cardio') return null;
  const last = lastCardio(state, ex.id);
  const durationMin = last?.durationMin ?? ex.defaultDurationMin ?? state.settings.cardio.defaultDurationMin;
  return {
    slot: { id: CARDIO_SLOT_ID, kind: 'cardio', exerciseId: ex.id, durationMin, substitutionGroup: CARDIO_GROUP_ID },
    exercise: ex,
  };
}

function lastCardio(state: CoreState, exerciseId: string): { sessionId: string; date: string; durationMin: number } | null {
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const s = state.sessions[i];
    const e = s.entries.find((x) => x.kind === 'cardio' && x.exerciseId === exerciseId && x.done);
    if (e && e.kind === 'cardio') return { sessionId: s.id, date: s.startedAt, durationMin: e.durationMin };
  }
  return null;
}

/**
 * What to train: the next day in the rotation (or `dayId` to preview another),
 * cardio first, then strength slots after permanent swaps, with targets, last
 * performance of the exercise actually scheduled and a progression hint.
 * Null if the program has no days.
 */
export function getToday(state: CoreState, dayId?: string): TodayView | null {
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
      last: lastCardio(state, c.exercise.id),
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
      last: lastPerformance(state, exId),
      progression: getProgression(state, exId, target)!,
    };
    slots.push(t);
  }
  const rot = state.program.rotations[state.settings.schedule];
  return { day, rotationIndex: rot.indexOf(day.id), isNext: day.id === next, slots, activeSession: state.active };
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
      entry.kind === 'cardio' ? state.warmupExerciseId : day?.slots.find((s) => s.id === entry.slotId)?.exerciseId ?? entry.exerciseId;
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
      },
    ];
  });
}
