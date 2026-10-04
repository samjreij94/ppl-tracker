import type {
  ActivityConfig,
  BodyweightLogConfig,
  CardioExercise,
  FinisherConfig,
  Goal,
  Increments,
  ProgressionRules,
  Settings,
  SubstitutionGroup,
} from './types';
import { CARDIO_GROUP_ID } from './types';

/** Default increments (match the seed's progressionCategories). */
export const DEFAULT_INCREMENTS: Increments = {
  lb: { barbell_upper: 5, barbell_lower: 5, dumbbell: 5, machine: 5 },
  kg: { barbell_upper: 2.5, barbell_lower: 2.5, dumbbell: 2.5, machine: 2.5 },
};

/** Fallback cardio warm-ups when the seed has none (ids match research/exercises.json). */
export const BUILTIN_CARDIO: CardioExercise[] = [
  {
    id: 'incline-treadmill',
    name: 'Incline Treadmill Walk',
    kind: 'cardio',
    equipment: 'treadmill',
    substitutionGroup: CARDIO_GROUP_ID,
    defaultDurationMin: 10,
  },
  {
    id: 'flat-treadmill',
    name: 'Flat Treadmill Walk / Easy Jog',
    kind: 'cardio',
    equipment: 'treadmill',
    substitutionGroup: CARDIO_GROUP_ID,
    defaultDurationMin: 10,
  },
  {
    id: 'peloton',
    name: 'Peloton / Stationary Bike',
    kind: 'cardio',
    equipment: 'bike',
    substitutionGroup: CARDIO_GROUP_ID,
    defaultDurationMin: 10,
  },
];

export const BUILTIN_CARDIO_GROUP: SubstitutionGroup = {
  id: CARDIO_GROUP_ID,
  name: 'Cardio Warm-up',
  exerciseIds: BUILTIN_CARDIO.map((e) => e.id),
};

/** Default deload length in days. */
export const DEFAULT_DELOAD_WEEK_LENGTH = 7;

/** Default settings (increments may be replaced by the seed's progressionCategories). */
export function defaultSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    unit: 'lb',
    defaultRestSec: 120,
    schedule: 6,
    increments: structuredClone(DEFAULT_INCREMENTS),
    permanentSwaps: {},
    cardio: { enabled: true, defaultDurationMin: 10 },
    finisher: { autoAdd: false },
    goal: structuredClone(DEFAULT_GOAL),
    deload: { active: false, weekLength: DEFAULT_DELOAD_WEEK_LENGTH },
    profile: { name: '' },
    ...overrides,
  };
}

/** Default progression rules (match the seed's progressionRules). */
export const DEFAULT_PROGRESSION_RULES: ProgressionRules = {
  stallConsecutiveSessions: 2,
  stallLoadReductionPct: 10,
  minSetsPerSlot: 2,
  cut: {
    appliesWhenGoalType: 'fat-loss',
    maintainCountsAsSuccess: true,
    stallConsecutiveSessions: 3,
    stallLoadReductionPct: 5,
    deloadFrequencyWeeks: { min: 5, max: 6 },
  },
  deload: { setReductionPct: 50, loadReductionPct: 10, frequencyWeeks: { min: 6, max: 8 }, targetRir: '3-4' },
  targetRir: { compound: '1-3', isolation: '0-2' },
};

/** Default goal (matches the seed's `goal`). */
export const DEFAULT_GOAL: Goal = {
  type: 'fat-loss',
  targetLossPctBodyweightPerWeek: { min: 0.5, max: 1.0 },
  proteinGPerLbGoalBodyweight: { min: 0.7, max: 1.0 },
};

/** Default finisher (matches the seed's `finisher`). */
export const DEFAULT_FINISHER: FinisherConfig = {
  optional: true,
  pattern: CARDIO_GROUP_ID,
  defaultExerciseId: 'incline-treadmill',
  defaultDurationMin: 15,
  minDurationMin: 10,
  maxDurationMin: 20,
  intensity: 'zone-2',
  placement: 'after-lifting',
};

export const DEFAULT_ACTIVITY: ActivityConfig = { dailyStepTarget: 8000, stepTargetRange: { min: 7000, max: 10000 } };

export const DEFAULT_BODYWEIGHT_LOG: BodyweightLogConfig = { recommendedEntriesPerWeek: { min: 3, max: 7 }, trendWindowDays: 7 };
