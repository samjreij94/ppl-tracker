import type {
  CardioExercise,
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
  /** From the seed's progressionRules. */
  progressionRules: ProgressionRules;
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
  /** Last session's sets for `exercise` (its OWN history), or null. */
  last: LastPerformance | null;
  progression: ProgressionHint;
}

/** The auto-inserted cardio warm-up as shown on the Today screen. */
export interface TodayCardioSlot {
  kind: 'cardio';
  slot: CardioSlot;
  exercise: CardioExercise;
  programmedExerciseId: string;
  swapped: boolean;
  durationMin: number;
  last: { sessionId: string; date: string; durationMin: number } | null;
}

export type TodaySlot = TodayCardioSlot | TodayStrengthSlot;

/** What to train next. */
export interface TodayView {
  day: ProgramDay;
  /** Index of `day` in `program.rotation`. */
  rotationIndex: number;
  /** True if this is the day the rotation picked (false when previewing another day). */
  isNext: boolean;
  /** Cardio first (if enabled), then strength slots in order. */
  slots: TodaySlot[];
  /** Set if a session is in progress (possibly for another day). */
  activeSession: WorkoutSession | null;
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
}
