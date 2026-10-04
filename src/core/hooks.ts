/**
 * React hooks over the core store (useSyncExternalStore). The UI uses ONLY
 * these (plus pure helpers); it never touches storage.
 */
import { createContext, createElement, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { getBundledSeed } from './bundled-seed';
import {
  deloadDue,
  finisherOffer,
  getActiveEntries,
  getCardioHistory,
  getDays,
  getExerciseSeries,
  getPRs,
  getSessions,
  getSwaps,
  getToday,
  lastPerformance,
} from './logic';
import { convertWeight, roundToIncrement } from './math';
import type { ActiveEntryView, CardioHistoryItem, CoreState, CoreStatus, DaySummary, LastPerformance, TodayFinisher, TodayView } from './state';
import { createIdbStorage } from './storage';
import { bodyweightTrend } from './bodyweight';
import {
  createCore,
  type BodyweightInput,
  type CardioPatch,
  type Core,
  type CustomExerciseInput,
  type FinishResult,
  type LogSetResult,
  type SetPatch,
  type SettingsPatch,
} from './store';
import type { ImportResult } from './transfer';
import type {
  ActivityConfig,
  DeloadStatus,
  BodyweightEntry,
  BodyweightLogConfig,
  BodyweightTrend,
  CardioRole,
  Exercise,
  FinisherConfig,
  Goal,
  ExerciseSeriesPoint,
  PRResult,
  Settings,
  SetLog,
  SubstitutionGroup,
  Unit,
  WorkoutSession,
} from './types';

let defaultCore: Core | undefined;

/** The app-wide core (IndexedDB + bundled seed). Created and `init()`ed on first use. */
export function getCore(): Core {
  if (!defaultCore) {
    defaultCore = createCore({ storage: createIdbStorage(), seed: getBundledSeed() });
    void defaultCore.init();
  }
  return defaultCore;
}

const CoreContext = createContext<Core | null>(null);

/** Optional: provide a specific core (tests/storybook). Without it hooks use `getCore()`. */
export function CoreProvider(props: { core: Core; children?: ReactNode }) {
  return createElement(CoreContext.Provider, { value: props.core }, props.children);
}

/** The core in scope (provider value or the default). */
export function useCore(): Core {
  return useContext(CoreContext) ?? getCore();
}

/** Raw store snapshot (re-renders on every change). Prefer the specific hooks. */
export function useCoreState(): CoreState {
  const core = useCore();
  return useSyncExternalStore(core.subscribe, core.getState, core.getState);
}

/** Return of `useToday`. */
export interface UseToday {
  status: CoreStatus;
  /** Next day in the rotation (or `dayId` if given), null while loading / no program. */
  today: TodayView | null;
  /** All days in rotation order, with `isNext`. */
  days: DaySummary[];
  /** The in-progress session, if any (resume instead of starting). */
  activeSession: WorkoutSession | null;
  /** Start (or resume) a session; defaults to `today.day.id`. */
  startSession: (dayId?: string) => WorkoutSession;
}

/** Today screen: next day, its exercises after swaps, targets, last sets, progression hints. */
export function useToday(dayId?: string): UseToday {
  const core = useCore();
  const s = useCoreState();
  const today = useMemo(() => (s.status === 'loading' ? null : getToday(s, dayId)), [s, dayId]);
  const days = useMemo(() => getDays(s), [s]);
  return {
    status: s.status,
    today,
    days,
    activeSession: s.active,
    startSession: (id) => core.startSession(id ?? today?.day.id),
  };
}

/** Return of `useWorkout`. */
export interface UseWorkout {
  status: CoreStatus;
  /** The active session or null. */
  session: WorkoutSession | null;
  /** Entries enriched with exercise, last performance, progression, swapped flag. */
  entries: ActiveEntryView[];
  unit: Unit;
  startSession: (dayId?: string) => WorkoutSession;
  /** Returns PRs set by this set (only when it transitions to done). */
  logSet: (entryIdx: number, setIdx: number, patch: SetPatch) => LogSetResult;
  addSet: (entryIdx: number, init?: Partial<SetLog>) => number;
  removeSet: (entryIdx: number, setIdx: number) => void;
  /** Update the warm-up or the finisher (finisher duration clamped to min..max). */
  logCardio: (which: CardioRole | number, patch: CardioPatch) => void;
  /** The finisher offer (exercise, prefilled duration, min/max, intensity, effortNote) — show an "Add finisher" button. */
  finisher: TodayFinisher | null;
  /** True if the active session contains a finisher entry. */
  hasFinisher: boolean;
  /** Add the optional finisher as the last entry; returns its entry index. */
  addFinisher: (opts?: { exerciseId?: string; durationMin?: number }) => number;
  /** Skip/remove the finisher. */
  removeFinisher: () => void;
  /** Alternatives for an entry's slot (same pattern, incl. custom + the programmed one). */
  getSwaps: (entryIdx: number) => Exercise[];
  swapExercise: (slotId: string, exerciseId: string, scope: 'session' | 'permanent') => void;
  finishSession: () => FinishResult | null;
  discardSession: () => void;
}

/** Active workout + actions. */
export function useWorkout(): UseWorkout {
  const core = useCore();
  const s = useCoreState();
  const entries = useMemo(() => getActiveEntries(s), [s]);
  const finisher = useMemo(() => finisherOffer(s), [s]);
  return {
    status: s.status,
    session: s.active,
    entries,
    unit: s.active?.unit ?? s.settings.unit,
    startSession: core.startSession,
    logSet: core.logSet,
    addSet: core.addSet,
    removeSet: core.removeSet,
    logCardio: core.logCardio,
    finisher,
    hasFinisher: !!s.active?.entries.some((e) => e.kind === 'cardio' && e.role === 'finisher'),
    addFinisher: core.addFinisher,
    removeFinisher: core.removeFinisher,
    getSwaps: (i) => {
      const e = s.active?.entries[i];
      return e ? getSwaps(s, e.exerciseId, e.slotId) : [];
    },
    swapExercise: core.swapExercise,
    finishSession: core.finishSession,
    discardSession: core.discardSession,
  };
}

/** Return of `useExerciseHistory`. */
export interface UseExerciseHistory {
  exercise: Exercise | undefined;
  /** Oldest → newest, display unit. */
  series: ExerciseSeriesPoint[];
  /** Current records (e1rm, topSet, repsAtWeight per weight). */
  prs: PRResult[];
  /** Finished sessions containing this exercise, newest first. */
  sessions: WorkoutSession[];
  last: LastPerformance | null;
  /** Cardio exercises only: done warm-ups/finishers with this exercise, newest first. */
  cardio: CardioHistoryItem[];
}

/** History for ONE exercise id (substitutes have their own history). */
export function useExerciseHistory(exerciseId: string): UseExerciseHistory {
  const s = useCoreState();
  return useMemo(
    () => ({
      exercise: s.exercises[exerciseId],
      series: getExerciseSeries(s, exerciseId),
      prs: getPRs(s, exerciseId),
      sessions: getSessions(s, { exerciseId }),
      last: lastPerformance(s, exerciseId),
      cardio: getCardioHistory(s, { exerciseId }),
    }),
    [s, exerciseId],
  );
}

/** Return of `useExercises`. */
export interface UseExercises {
  /** All exercises (seed + custom), seed order then custom. */
  exercises: Exercise[];
  byId: Record<string, Exercise>;
  /** Substitution groups ("patterns") by id. */
  groups: Record<string, SubstitutionGroup>;
  customExercises: Exercise[];
  getSwaps: (exerciseId: string, slotId?: string) => Exercise[];
  swapExercise: (slotId: string, exerciseId: string, scope: 'session' | 'permanent') => void;
  clearPermanentSwap: (slotId: string) => void;
  addCustomExercise: (input: CustomExerciseInput) => Exercise;
  removeCustomExercise: (exerciseId: string) => void;
}

/** Exercise library, swaps and custom exercises. */
export function useExercises(): UseExercises {
  const core = useCore();
  const s = useCoreState();
  const exercises = useMemo(() => Object.values(s.exercises), [s.exercises]);
  return {
    exercises,
    byId: s.exercises,
    groups: s.groups,
    customExercises: s.customExercises,
    getSwaps: (id, slotId) => getSwaps(s, id, slotId),
    swapExercise: core.swapExercise,
    clearPermanentSwap: core.clearPermanentSwap,
    addCustomExercise: core.addCustomExercise,
    removeCustomExercise: core.removeCustomExercise,
  };
}

/** Return of `useSettings`. */
export interface UseSettings {
  settings: Settings;
  /** = settings.goal */
  goal: Goal;
  /** Seed configs (read-only). */
  finisherConfig: FinisherConfig;
  activity: ActivityConfig;
  bodyweightLog: BodyweightLogConfig;
  updateSettings: (patch: SettingsPatch) => Settings;
  clearPermanentSwap: (slotId: string) => void;
  convertWeight: (value: number, from: Unit, to: Unit) => number;
  roundToIncrement: (value: number, increment: number, mode?: 'nearest' | 'down' | 'up') => number;
  /** Deload status (`deloadDue`): active / due / weeksSinceLast / reason / daysLeft. */
  deload: DeloadStatus;
  /** Start a deload week now (optional custom length in days). */
  startDeload: (opts?: { weekLength?: number }) => DeloadStatus;
  /** End the active deload now. */
  endDeload: () => DeloadStatus;
}

/** Settings + unit helpers. */
export function useSettings(): UseSettings {
  const core = useCore();
  const s = useCoreState();
  return {
    settings: s.settings,
    goal: s.settings.goal,
    finisherConfig: s.finisher,
    activity: s.activity,
    bodyweightLog: s.bodyweightLog,
    updateSettings: core.updateSettings,
    clearPermanentSwap: core.clearPermanentSwap,
    convertWeight,
    roundToIncrement,
    deload: deloadDue(s),
    startDeload: core.startDeload,
    endDeload: core.endDeload,
  };
}

/** Return of `useDeload`. */
export interface UseDeload {
  status: DeloadStatus;
  startDeload: (opts?: { weekLength?: number }) => DeloadStatus;
  endDeload: () => DeloadStatus;
}

/** Deload week: status (due / active / days left) + start/end actions. Same data as `useSettings().deload`. */
export function useDeload(): UseDeload {
  const core = useCore();
  const s = useCoreState();
  const status = useMemo(() => deloadDue(s), [s]);
  return { status, startDeload: core.startDeload, endDeload: core.endDeload };
}

/** Return of `useDataTransfer`. */
export interface UseDataTransfer {
  /** JSON string of all user data (`ExportFile`). */
  exportJSON: () => string;
  /** Suggested file name, e.g. `ppl-tracker-2026-10-04.json`. */
  exportFileName: () => string;
  /** Validate + replace all user data; nothing changes on error. */
  importJSON: (json: string | unknown) => Promise<ImportResult>;
}

/** Backup / restore. */
export function useDataTransfer(): UseDataTransfer {
  const core = useCore();
  return {
    exportJSON: core.exportJSON,
    exportFileName: () => `ppl-tracker-${new Date().toISOString().slice(0, 10)}.json`,
    importJSON: core.importJSON,
  };
}

/** Return of `useBodyweight`. */
export interface UseBodyweight {
  /** Newest first. */
  entries: BodyweightEntry[];
  trend: BodyweightTrend;
  config: BodyweightLogConfig;
  goal: Goal;
  /** Upsert one reading per date (default today, settings.unit). */
  logBodyweight: (entry: BodyweightInput) => BodyweightEntry;
  deleteBodyweight: (date: string) => void;
}

/** Bodyweight log + 7-day trend vs goal. */
export function useBodyweight(): UseBodyweight {
  const core = useCore();
  const s = useCoreState();
  const trend = useMemo(
    () => bodyweightTrend(s.bodyweight, s.settings.unit, s.settings.goal, s.bodyweightLog.trendWindowDays),
    [s.bodyweight, s.settings.unit, s.settings.goal, s.bodyweightLog.trendWindowDays],
  );
  const entries = useMemo(() => [...s.bodyweight].reverse(), [s.bodyweight]);
  return {
    entries,
    trend,
    config: s.bodyweightLog,
    goal: s.settings.goal,
    logBodyweight: core.logBodyweight,
    deleteBodyweight: core.deleteBodyweight,
  };
}
