/**
 * PPL Tracker core — public API. The UI imports ONLY from here.
 *
 * - Hooks (recommended for UI): useToday, useWorkout, useExerciseHistory,
 *   useExercises, useSettings, useDeload, useOnboarding, useDataTransfer (+ useCore, useCoreState, CoreProvider).
 * - Imperative: `getCore()` returns the app-wide store with every action
 *   (startSession, logSet, …) and `getState()/subscribe()`.
 * - Pure helpers: queries that take a `CoreState` (getToday(state), getPRs(state, id), …)
 *   and math (epley, topSet, volume, convertWeight, roundToIncrement, …).
 *
 * Units: all weights in/out are in `settings.unit`; sessions store weights as
 * entered tagged with `session.unit` (converted on read).
 */

// Types
export type * from './types';
export { CARDIO_GROUP_ID, CARDIO_SLOT_ID, EXERCISE_CATEGORIES, EXPERIENCE_LEVELS, FINISHER_SLOT_ID, GOAL_TYPES } from './types';
export type {
  ActiveEntryView,
  CardioHistoryItem,
  CoreState,
  CoreStatus,
  DaySummary,
  LastPerformance,
  TodayCardioSlot,
  TodayFinisher,
  TodaySlot,
  TodayStrengthSlot,
  TodayView,
} from './state';

// Store
export { createCore } from './store';
export type {
  BodyweightInput,
  CardioPatch,
  Core,
  CreateCoreOptions,
  CustomExerciseInput,
  FinishResult,
  LogSetResult,
  OnboardingInput,
  ProfilePatch,
  SetPatch,
  SettingsPatch,
} from './store';

// Hooks
export {
  CoreProvider,
  getCore,
  useBodyweight,
  useCore,
  useCoreState,
  useDataTransfer,
  useDeload,
  useOnboarding,
  useExerciseHistory,
  useExercises,
  useSettings,
  useToday,
  useWorkout,
} from './hooks';
export type { UseBodyweight, UseDataTransfer, UseDeload, UseOnboarding, UseExerciseHistory, UseExercises, UseSettings, UseToday, UseWorkout } from './hooks';

// Pure queries (take a CoreState snapshot)
export {
  cardioSlot,
  computeSessionPRs,
  deloadDue,
  deloadSets,
  detectPRs,
  exerciseHistory,
  finisherPrescription,
  finisherOffer,
  getActiveEntries,
  getCardioHistory,
  getDays,
  getExercise,
  getExerciseSeries,
  getIncrement,
  getPRs,
  getProgression,
  getSessions,
  getSwaps,
  getToday,
  type ExerciseHistoryItem,
  lastPerformance,
  nextDayId,
  plannedSets,
  prefillFromLast,
  prefillSets,
  resolveSlotExerciseId,
  sessionPRs,
  suggestProgression,
  warmupPrescription,
} from './logic';

// Bodyweight
export { bodyweightTrend, localDate } from './bodyweight';

// Math
export { bestE1rm, convertCardioMetrics, convertDistance, convertWeight, doneSets, epley, roundToIncrement, topSet, volume } from './math';

// Defaults
export {
  BUILTIN_CARDIO,
  DEFAULT_ACTIVITY,
  DEFAULT_BODYWEIGHT_LOG,
  DEFAULT_DELOAD_WEEK_LENGTH,
  DEFAULT_FINISHER,
  DEFAULT_GOAL,
  DEFAULT_INCREMENTS,
  DEFAULT_PROGRESSION_RULES,
  defaultSettings,
} from './defaults';

// Storage
export { browserLocalStorage, createIdbStorage, createMemoryStorage, createMemorySyncStorage, MIRROR_KEYS, STORAGE_KEYS } from './storage';
export type { Storage, SyncStorage } from './storage';

// Seed
export { deriveCategory, loadSeed, normalizeCategory, SEED_VERSION } from './seed-schema';
export type {
  LoadedSeed,
  SeedDay,
  SeedExercise,
  SeedFile,
  SeedLoadResult,
  SeedPattern,
  SeedProgressionCategory,
  SeedProgressionRules,
  SeedSlot,
} from './seed-schema';
export { getBundledSeed } from './bundled-seed';

// Import / export
export { EXPORT_VERSION, validateExport } from './transfer';
export type { ExportFile, ImportResult } from './transfer';
