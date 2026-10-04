/**
 * Core domain types for PPL Tracker.
 *
 * Units: every weight the UI sends in or reads out is in the user's chosen
 * unit (`Settings.unit`). Persisted sessions store weights **as entered**,
 * tagged with `WorkoutSession.unit`; read APIs (history, PRs, prefill,
 * progression) convert to the current display unit on the way out.
 */

/** Weight unit. */
export type Unit = 'lb' | 'kg';

/**
 * Progression category of a strength exercise. Drives the default load
 * increment (`Settings.increments`) and nothing else. Values match the seed's
 * `progressionCategory` (research/exercises.json) verbatim:
 *
 * - `barbell_upper` — bench, OHP, rows, barbell/EZ-bar curls & extensions
 * - `barbell_lower` — squat, deadlift, RDL, hip thrust, barbell lunges
 * - `dumbbell`      — dumbbells & kettlebells (load logged PER dumbbell)
 * - `machine`       — machines, cables, smith, loaded bodyweight (load = ADDED external load; 0 = bodyweight)
 *
 * Mapping rule when a seed/custom exercise has no category: barbell → `barbell_lower`
 * if lower-body dominant else `barbell_upper`; ez-bar → `barbell_upper`;
 * dumbbell/kettlebell → `dumbbell`; everything else → `machine`.
 */
export type ExerciseCategory = 'barbell_upper' | 'barbell_lower' | 'dumbbell' | 'machine';

/** All categories, in display order. */
export const EXERCISE_CATEGORIES: readonly ExerciseCategory[] = [
  'barbell_upper',
  'barbell_lower',
  'dumbbell',
  'machine',
];

/** Effort class from the seed pattern (`compound` RIR 1-3, `isolation` RIR 0-2). */
export type RirClass = 'compound' | 'isolation';

/** Exercise kind. Cardio is the automatic warm-up slot at the start of every day. */
export type ExerciseKind = 'strength' | 'cardio';

/** Muscle names used by the seed (any other string is accepted). */
export type KnownMuscle =
  | 'chest'
  | 'front_delts'
  | 'side_delts'
  | 'rear_delts'
  | 'triceps'
  | 'lats'
  | 'upper_back'
  | 'biceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core';
export type Muscle = KnownMuscle | (string & {});

/** Known equipment values (seed enum); any other string is accepted (tolerant). */
export type KnownEquipment =
  | 'barbell'
  | 'dumbbell'
  | 'cable'
  | 'machine'
  | 'smith'
  | 'ez_bar'
  | 'kettlebell'
  | 'bodyweight'
  | 'treadmill'
  | 'bike';
export type Equipment = KnownEquipment | (string & {});

/** Inclusive rep range, e.g. {min: 8, max: 12}. */
export interface RepRange {
  min: number;
  max: number;
}

interface ExerciseBase {
  /** Stable kebab-case id (e.g. `barbell-bench-press`). History is keyed by this. */
  id: string;
  name: string;
  equipment?: Equipment;
  /** e.g. `['chest']` (seed: copied from the pattern; `[]` for cardio). */
  primaryMuscles?: Muscle[];
  /** Like-for-like swap group id (seed: `pattern`; see `getSwaps`). */
  substitutionGroup?: string;
  /** True for user-created exercises (persisted, exported). */
  isCustom?: boolean;
  notes?: string;
}

/** A weighted rep-based exercise. */
export interface StrengthExercise extends ExerciseBase {
  kind: 'strength';
  category: ExerciseCategory;
  /** Default rep range when not set by a program slot (seed: derived from the first slot using the exercise's pattern, else compound 6-10 / isolation 10-15). */
  repRange: RepRange;
  rirClass?: RirClass;
  /** Reps and rest are per side; load is per dumbbell/side. */
  unilateral?: boolean;
  secondaryMuscles?: Muscle[];
  /** Default working sets when not set by a program slot. */
  defaultSets: number;
  /** Per-exercise override of the category increment, in `incrementUnit` (default: the display unit). */
  increment?: number;
  /** Unit of `increment` (defaults to the current display unit). */
  incrementUnit?: Unit;
}

/** A cardio warm-up exercise (no category/repRange; logged as minutes). */
export interface CardioExercise extends ExerciseBase {
  kind: 'cardio';
  defaultDurationMin?: number;
  /** e.g. "10 min walk, 2.8-3.5 mph, 8-12% incline, RPE 4-5" */
  defaultPrescription?: string;
}

export type Exercise = StrengthExercise | CardioExercise;

/** Id of the cardio substitution group and of the auto-inserted cardio slot. */
export const CARDIO_GROUP_ID = 'cardio-warmup';
/** Slot id of the cardio warm-up slot. It is the SAME on every day so a permanent swap applies everywhere. */
export const CARDIO_SLOT_ID = 'cardio-warmup';

/** Substitution group (seed: `patterns[]`): a set of interchangeable exercises. */
export interface SubstitutionGroup {
  id: string;
  name: string;
  exerciseIds: string[];
  rirClass?: RirClass;
  primaryMuscles?: Muscle[];
  secondaryMuscles?: Muscle[];
}

/** A strength slot in a program day. */
export interface Slot {
  /** Stable id `${dayId}-${order}` (e.g. `push-a-1`). Keys permanent swaps. */
  id: string;
  kind: 'strength';
  /** The programmed exercise (before any swap). */
  exerciseId: string;
  sets: number;
  repRange: RepRange;
  restSec?: number;
  /** Swap group for this slot (seed: slot `pattern`); falls back to the exercise's group. */
  substitutionGroup?: string;
  /** 1-based position in the day (seed `order`). */
  order?: number;
}

/** The auto-inserted cardio warm-up slot (never stored in `ProgramDay.slots`). */
export interface CardioSlot {
  id: typeof CARDIO_SLOT_ID;
  kind: 'cardio';
  exerciseId: string;
  durationMin: number;
  substitutionGroup: typeof CARDIO_GROUP_ID;
}

export type AnySlot = Slot | CardioSlot;

export type DayType = 'push' | 'pull' | 'legs';
export type DayVariant = 'A' | 'B';

/** One training day, e.g. "Push A". Holds strength slots only; cardio is prepended automatically. */
export interface ProgramDay {
  /** Seed DayId: `push-a` | `pull-a` | `legs-a` | `push-b` | `pull-b` | `legs-b` */
  id: string;
  /** e.g. `Push A` */
  name: string;
  type?: DayType;
  variant?: DayVariant;
  /** e.g. "Strength-leaning push: chest, shoulders, triceps" */
  focus?: string;
  slots: Slot[];
}

/** A PPL program. */
export interface Program {
  id: string;
  name: string;
  days: ProgramDay[];
  /**
   * Day ids in rotation order per schedule (seed `schedules['six-day']` and
   * `schedules['three-day'].rotation`; both are push-a, pull-a, legs-a, push-b, pull-b, legs-b).
   */
  rotations: Record<Schedule, string[]>;
}

/**
 * Weekly schedule (training days per week).
 *
 * Rotation rule (both schedules): the next day is the day AFTER the day of the
 * most recently finished session, in `Program.rotations[schedule]` order, wrapping around
 * (Push A → Pull A → Legs A → Push B → Pull B → Legs B → Push A …). No history → first day.
 * It is never calendar-based, so a missed gym day never skips a workout.
 *
 * - `6`: one full A+B cycle per week (PPL twice a week).
 * - `3`: one PPL cycle per week, A and B alternating BY CYCLE
 *   (week/cycle 1 = A days, next cycle = B days).
 */
export type Schedule = 3 | 6;

/** One logged set. `weight` is in the owning session's `unit`. */
export interface SetLog {
  weight: number;
  reps: number;
  done: boolean;
  /** ISO time when marked done. */
  timestamp?: string;
}

/** A strength exercise performed in a session. */
export interface StrengthEntry {
  kind: 'strength';
  slotId: string;
  /** The exercise actually performed (after any swap). */
  exerciseId: string;
  sets: SetLog[];
  /** Targets copied from the slot at session start. */
  target: { sets: number; repRange: RepRange };
  restSec: number;
}

/** The cardio warm-up performed in a session (always entry index 0 when cardio is enabled). */
export interface CardioEntry {
  kind: 'cardio';
  slotId: typeof CARDIO_SLOT_ID;
  exerciseId: string;
  durationMin: number;
  done: boolean;
  timestamp?: string;
}

export type SessionEntry = StrengthEntry | CardioEntry;

/** A workout. Active while `finishedAt` is undefined. */
export interface WorkoutSession {
  id: string;
  programId: string;
  dayId: string;
  /** ISO time */
  startedAt: string;
  /** ISO time; set by `finishSession`. */
  finishedAt?: string;
  /** Unit all weights in this session were entered in. */
  unit: Unit;
  entries: SessionEntry[];
}

/** Progression increments per unit per category. */
export type Increments = Record<Unit, Record<ExerciseCategory, number>>;

export interface CardioSettings {
  /** Insert the cardio warm-up slot at the start of every day. Default true. */
  enabled: boolean;
  /** Fallback duration when the exercise has no `defaultDurationMin` and no history. */
  defaultDurationMin: number;
}

/** User settings. */
export interface Settings {
  unit: Unit;
  defaultRestSec: number;
  schedule: Schedule;
  increments: Increments;
  /** slotId → exerciseId. Use `CARDIO_SLOT_ID` to change the cardio warm-up on every day. */
  permanentSwaps: Record<string, string>;
  cardio: CardioSettings;
}

/** PR kinds. */
export type PRKind =
  /** Best estimated 1RM (Epley). */
  | 'e1rm'
  /** Heaviest weight lifted for ≥1 rep. */
  | 'topSet'
  /** Most reps at this exact weight. */
  | 'repsAtWeight';

/** A personal record. Values in the display unit (reps for `repsAtWeight`). */
export interface PRResult {
  kind: PRKind;
  exerciseId: string;
  /** e1rm/topSet: weight; repsAtWeight: reps. */
  value: number;
  /** Previous best for the same kind (undefined if first ever). */
  previous?: number;
  /** The set that set the record. */
  weight: number;
  reps: number;
  /** ISO date of the set, when known. */
  date?: string;
  sessionId?: string;
}

/** One point per finished session in an exercise's history (display unit). */
export interface ExerciseSeriesPoint {
  /** ISO time of the session start. */
  date: string;
  sessionId: string;
  /** Best Epley e1RM of the session's done sets. */
  e1rm: number;
  /** Heaviest done set (ties → more reps). */
  topSet: { weight: number; reps: number };
  /** Σ weight × reps over done sets. */
  volume: number;
}

/**
 * - `increase` — every working set hit repRange.max last time → add the increment
 * - `addReps`  — all sets ≥ repRange.min but not all at max → same load, more reps
 * - `hold`     — a set fell below repRange.min once (or no history) → repeat
 * - `reduce`   — stall: a set fell below repRange.min at the same load in
 *                `stallConsecutiveSessions` (2) consecutive sessions → −`stallLoadReductionPct` (10%), rounded
 */
export type ProgressionAction = 'increase' | 'hold' | 'addReps' | 'reduce';

/** Double-progression hint for the next session (display unit). */
export interface ProgressionHint {
  exerciseId: string;
  action: ProgressionAction;
  /** Suggested working weight (increase: last + increment; reduce: last −10% rounded; hold/addReps: last). Undefined with no history. */
  newWeight?: number;
  /** The increment used (increase only). */
  increment?: number;
  /** Target reps per set for next time (addReps/hold). */
  targetReps?: number;
  /** Human text, e.g. "add 5 lb", "add reps: aim for 10", "hold 135 lb", "stalled: drop to 120 lb". */
  message: string;
}

/** Progression parameters (from the seed's `progressionRules`). */
export interface ProgressionRules {
  stallConsecutiveSessions: number;
  stallLoadReductionPct: number;
  deload: { setReductionPct: number; loadReductionPct: number };
  /** e.g. {compound: '1-3', isolation: '0-2'} */
  targetRir: Partial<Record<RirClass, string>>;
}
