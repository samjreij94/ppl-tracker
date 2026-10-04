import type {
  DeloadStatus,
  ActivityConfig,
  BodyweightEntry,
  BodyweightLogConfig,
  CardioExercise,
  CardioMetrics,
  CardioRole,
  FinisherConfig,
  CardioSlot,
  Exercise,
  Program,
  ProgramDay,
  ProgressionHint,
  ProgressionRules,
  RepRange,
  SessionEntry,
  Settings,
  SetLog,
  Slot,
  StrengthExercise,
  Unit,
  SubstitutionGroup,
  WorkoutSession,
} from './types';

/** Lifecycle of the core store. `error` = seed unusable (see `seedErrors`). */
export type CoreStatus = 'loading' | 'ready' | 'error';

/** The whole immutable store snapshot. Replaced (never mutated) on every change. */
export interface CoreState {
  status: CoreStatus;
  /** Seed problems (dropped entries) — show in a debug/settings screen. */
  seedErrors: string[];
  seedWarnings: string[];
  program: Program;
  /** All exercises by id: seed + custom. */
  exercises: Record<string, Exercise>;
  /** All substitution groups by id (custom exercises merged in). */
  groups: Record<string, SubstitutionGroup>;
  customExercises: Exercise[];
  /** Default cardio warm-up exercise id (before permanent swaps). */
  warmupExerciseId: string;
  /** From the seed's progressionRules (incl. cut adjustments). */
  progressionRules: ProgressionRules;
  /** Seed finisher config (optional zone-2 cardio after lifting). */
  finisher: FinisherConfig;
  /** Seed daily-steps guidance (display only). */
  activity: ActivityConfig;
  /** Seed bodyweight-log config. */
  bodyweightLog: BodyweightLogConfig;
  /** Stored bodyweight readings, oldest → newest by date (one per date). */
  bodyweight: BodyweightEntry[];
  /** Finished sessions, oldest → newest by `finishedAt`. */
  sessions: WorkoutSession[];
  /** The in-progress session, if any. */
  active: WorkoutSession | null;
  settings: Settings;
}

/** Previous performance of an exercise, converted to the display unit. */
export interface LastPerformance {
  sessionId: string;
  /** ISO start time of that session. */
  date: string;
  sets: SetLog[];
  /** Unit that session was logged in (sets are already converted to the display unit). */
  sourceUnit?: Unit;
}

/** A strength slot as shown on the Today screen (after permanent swaps). */
export interface TodayStrengthSlot {
  kind: 'strength';
  slot: Slot;
  /** The exercise to perform (after permanent swap). */
  exercise: StrengthExercise;
  /** The programmed exercise id (before swaps). */
  programmedExerciseId: string;
  swapped: boolean;
  target: { sets: number; repRange: RepRange; restSec: number };
  /** Sets `startSession` will prefill: `target.sets`, or fewer after a cut `dropSet` hint (never < 2), or `ceil(sets × 0.5)` (≥ 1) during a deload. */
  plannedSets: number;
  /** Last session's sets for `exercise` (its OWN history, deload sessions included), or null. Prefill uses the last NON-deload session. */
  last: LastPerformance | null;
  progression: ProgressionHint;
}

/** A past cardio entry (warm-up or finisher). */
export interface CardioHistoryItem {
  sessionId: string;
  /** ISO start time of the session. */
  date: string;
  exerciseId: string;
  role: CardioRole;
  durationMin: number;
  metrics?: CardioMetrics;
}

/** The auto-inserted cardio warm-up as shown on the Today screen. */
export interface TodayCardioSlot {
  kind: 'cardio';
  slot: CardioSlot;
  exercise: CardioExercise;
  programmedExerciseId: string;
  swapped: boolean;
  durationMin: number;
  /** Last done warm-up with this exercise. */
  last: CardioHistoryItem | null;
  /** Prefilled metrics (from `last`). */
  metrics?: CardioMetrics;
  /** Warm-up prescription: the exercise's seed `defaultPrescription` (e.g. "10 min walk, 2.8-3.5 mph …"). */
  prescription?: string;
}

/** The optional finisher offered after the last lifting slot (not in `slots`; add via `addFinisher`). */
export interface TodayFinisher {
  slot: CardioSlot;
  exercise: CardioExercise;
  /** `finisher.defaultExerciseId` */
  programmedExerciseId: string;
  swapped: boolean;
  /** Prefilled: last finisher's duration (clamped) or `finisher.defaultDurationMin` (15). */
  durationMin: number;
  minDurationMin: number;
  maxDurationMin: number;
  /** e.g. `zone-2` */
  intensity: string;
  effortNote?: string;
  /**
   * Finisher-specific prescription built from the finisher config + exercise + `durationMin`
   * (never the exercise's 10-min warm-up text), e.g.
   * "15 min Incline Treadmill Walk, easy zone 2: conversational pace, you can speak in full sentences (RPE 3-4)".
   */
  prescription: string;
  /** Last done finisher (any exercise). */
  last: CardioHistoryItem | null;
  /** True if `settings.finisher.autoAdd` — startSession will include it. */
  autoAdd: boolean;
  /** Prefilled metrics (last finisher with this exercise). */
  metrics?: CardioMetrics;
}

export type TodaySlot = TodayCardioSlot | TodayStrengthSlot;

/** What to train next. */
export interface TodayView {
  day: ProgramDay;
  /** Index of `day` in `program.rotation`. */
  rotationIndex: number;
  /** True if this is the day the rotation picked (false when previewing another day). */
  isNext: boolean;
  /** Cardio warm-up first (if enabled), then strength slots in order. */
  slots: TodaySlot[];
  /** Optional finisher offered after lifting (null if no cardio exercise available). */
  finisher: TodayFinisher | null;
  /** Set if a session is in progress (possibly for another day). */
  activeSession: WorkoutSession | null;
  /** Deload status (`deloadDue`): active / due / weeksSinceLast / reason. */
  deload: DeloadStatus;
}

/** Rotation overview for a day picker. */
export interface DaySummary {
  day: ProgramDay;
  rotationIndex: number;
  isNext: boolean;
  /** ISO finish time of the last session of this day, if any. */
  lastDoneAt?: string;
}

/** One entry of the active session, enriched for the workout screen. */
export interface ActiveEntryView {
  index: number;
  entry: SessionEntry;
  exercise: Exercise;
  /** Programmed exercise id for this slot (before swaps). */
  programmedExerciseId: string;
  swapped: boolean;
  /** Strength only: last performance of `entry.exerciseId`. */
  last: LastPerformance | null;
  /** Strength only. */
  progression: ProgressionHint | null;
  /** Cardio only: warm-up → exercise `defaultPrescription`; finisher → `finisherPrescription(…, entry.durationMin)`. */
  prescription?: string;
}
