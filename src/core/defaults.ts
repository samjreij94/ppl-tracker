import type { CardioExercise, Increments, ProgressionRules, Settings, SubstitutionGroup } from './types';
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

/** Default settings (increments may be replaced by the seed's progressionCategories). */
export function defaultSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    unit: 'lb',
    defaultRestSec: 120,
    schedule: 6,
    increments: structuredClone(DEFAULT_INCREMENTS),
    permanentSwaps: {},
    cardio: { enabled: true, defaultDurationMin: 10 },
    ...overrides,
  };
}

/** Default progression rules (match the seed's progressionRules). */
export const DEFAULT_PROGRESSION_RULES: ProgressionRules = {
  stallConsecutiveSessions: 2,
  stallLoadReductionPct: 10,
  deload: { setReductionPct: 50, loadReductionPct: 10 },
  targetRir: { compound: '1-3', isolation: '0-2' },
};
