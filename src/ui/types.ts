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

export const cardioLabel = (kind: string, name?: string) => CARDIO_LABEL[kind as CardioKind] ?? name ?? kind;

export interface CardioVM {
  /** Cardio exercise id (one of CardioKind, or a custom cardio id). */
  kind: CardioKind | (string & {});
  name?: string;
  minutes: number;
  incline?: number; // %
  speed?: number; // mph or km/h
  calories?: number;
  output?: number; // Peloton kJ
  done: boolean;
  role?: 'warmup' | 'finisher';
  /** Core prescription: warm-up text, or the finisher's zone-2 prescription (follows swaps + duration). */
  hint?: string;
  minMinutes?: number;
  maxMinutes?: number;
}

/** The optional finisher as offered before it is added. */
export interface FinisherOfferVM {
  kind: string;
  name: string;
  minutes: number;
  minMinutes: number;
  maxMinutes: number;
  intensity: string; // "zone-2"
  note?: string;
}

export type BodyweightStatus = 'tooSlow' | 'onTrack' | 'tooFast' | 'insufficientData';

export interface BodyweightVM {
  unit: Unit;
  /** Today's reading if logged. */
  today?: number;
  /** Most recent reading (to prefill the stepper). */
  latest?: number;
  points: { date: number; weight: number; avg: number }[];
  currentAvg: number | null;
  /** % of bodyweight per week, positive = losing. */
  weeklyLossPct: number | null;
  weeklyLoss: number | null;
  status: BodyweightStatus;
  target: { min: number; max: number };
  goalLabel: string;
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
  /** Styling for the hint: a deload-week prescription renders calmer than a progression nudge. */
  hintKind?: 'deload';
  swapped?: boolean;
  restSec?: number;
  sets: SetVM[];
}

export interface TodayVM {
  dayName: string; // "Push A"
  dayLabel?: string; // "Day 1 of 6"
  cardio: CardioVM;
  /** False when cardio warm-up is disabled in settings. */
  hasCardio?: boolean;
  finisherOffer?: FinisherOfferVM | null;
  stepTarget?: number;
  stepRange?: { min: number; max: number };
  exercises: ExerciseVM[];
  deload?: DeloadVM;
}

/** Deload week status (core DeloadStatus, display-ready). */
export interface DeloadVM {
  active: boolean;
  due: boolean;
  daysLeft?: number;
  /** "6 weeks since last deload" etc.; null when not due. */
  reason: string | null;
  weeksSinceLast: number | null;
}

export interface ActiveVM {
  sessionId: string;
  dayName: string;
  startedAt: number;
  /** Session was started during a deload week. */
  deload?: boolean;
  cardio: CardioVM | null;
  exercises: ExerciseVM[];
  finisher: CardioVM | null;
  finisherOffer: FinisherOfferVM | null;
}

export interface PrHit {
  name: string;
  /** Human labels of every record kind this set broke, best first: "Heaviest set", "e1RM", "Rep PR". */
  kinds: string[];
  text: string;
}

export interface SwapOption { exerciseId: string; name: string; note?: string }

export interface HistoryItem {
  id: string;
  date: number; // epoch ms
  dayName: string;
  sets: number;
  volume: number;
  prs: number;
  cardio?: { kind: string; name?: string; minutes: number; done: boolean };
  finisher?: { kind: string; name?: string; minutes: number; done: boolean };
  durationMin?: number;
}

export interface SeriesPoint { date: number; e1rm: number; top: number; volume: number }

export interface SummaryVM {
  dayName: string;
  durationMin: number;
  setsDone: number;
  volume: number;
  prs: { name: string; text: string }[];
  cardio?: { kind: string; name?: string; minutes: number; done: boolean };
  finisher?: { kind: string; name?: string; minutes: number; done: boolean };
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
