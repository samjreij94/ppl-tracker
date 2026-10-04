/**
 * UI view-models. Screens/components only consume these shapes; src/ui/adapter.ts maps
 * the real src/core API onto them, so core can evolve without touching screens.
 */
export type Unit = 'lb' | 'kg';
/** Matches the cardio exercise ids in research/exercises.json (cardio-warmup group). */
export type CardioKind = 'incline-treadmill' | 'flat-treadmill' | 'peloton';
export type Metric = 'e1rm' | 'top' | 'volume';
export type Schedule = 3 | 6;

export const CARDIO_LABEL: Record<CardioKind, string> = {
  'incline-treadmill': 'Incline treadmill',
  'flat-treadmill': 'Flat treadmill',
  peloton: 'Peloton',
};

export interface CardioVM {
  kind: CardioKind;
  minutes: number;
  incline?: number; // %
  speed?: number; // mph or km/h
  calories?: number;
  output?: number; // Peloton kJ
  done: boolean;
}

export interface SetVM {
  weight: number;
  reps: number;
  done: boolean;
  pr?: boolean;
}

export interface LastSet { weight: number; reps: number }

export interface ExerciseVM {
  slotId: string;
  exerciseId: string;
  name: string;
  targetSets: number;
  targetReps: string; // "8" or "6-8"
  lastSets: LastSet[];
  hint?: string;
  swapped?: boolean;
  sets: SetVM[];
}

export interface TodayVM {
  dayName: string; // "Push A"
  dayLabel?: string; // "Day 1 of 6"
  cardio: CardioVM;
  exercises: ExerciseVM[];
}

export interface SwapOption { exerciseId: string; name: string; note?: string }

export interface HistoryItem {
  id: string;
  date: number; // epoch ms
  dayName: string;
  sets: number;
  volume: number;
  prs: number;
  cardio?: { kind: CardioKind; minutes: number };
  durationMin?: number;
}

export interface SeriesPoint { date: number; e1rm: number; top: number; volume: number }

export interface SummaryVM {
  dayName: string;
  durationMin: number;
  setsDone: number;
  volume: number;
  prs: { name: string; text: string }[];
  cardio?: { kind: CardioKind; minutes: number; done: boolean };
}

export interface SettingsVM {
  unit: Unit;
  restSec: number;
  schedule: Schedule;
}

export const weightStep = (u: Unit) => (u === 'kg' ? 2.5 : 5);
export const fmtSet = (s: LastSet) => `${fmtNum(s.weight)}×${s.reps}`;
export const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
export const fmtVolume = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : Math.round(n).toLocaleString());
