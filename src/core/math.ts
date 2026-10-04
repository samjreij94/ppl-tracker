import type { SetLog, Unit } from './types';

const LB_PER_KG = 2.2046226218;

/**
 * Epley estimated 1RM: `w * (1 + reps / 30)`; `reps === 1` returns `w`; reps ≤ 0 or w ≤ 0 → 0.
 */
export function epley(weight: number, reps: number): number {
  if (!(weight > 0) || !(reps > 0)) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

/** Convert a weight between units (no rounding). */
export function convertWeight(value: number, from: Unit, to: Unit): number {
  if (from === to) return value;
  return from === 'kg' ? value * LB_PER_KG : value / LB_PER_KG;
}

/**
 * Round to the nearest multiple of `increment` (e.g. 137 → 135 with 5).
 * `mode` 'down'/'up' floors/ceils instead. Result is cleaned to 2 decimals.
 */
export function roundToIncrement(
  value: number,
  increment: number,
  mode: 'nearest' | 'down' | 'up' = 'nearest',
): number {
  if (!(increment > 0)) return Math.round(value * 100) / 100;
  const q = value / increment;
  const n = mode === 'down' ? Math.floor(q + 1e-9) : mode === 'up' ? Math.ceil(q - 1e-9) : Math.round(q);
  return Math.round(n * increment * 100) / 100;
}

/** Only sets that count: `done` with reps > 0 (weight 0 allowed = bodyweight). */
export function doneSets(sets: readonly SetLog[]): SetLog[] {
  return sets.filter((s) => s.done && s.reps > 0);
}

/** Heaviest done set (ties → more reps), or null if none. */
export function topSet(sets: readonly SetLog[]): { weight: number; reps: number } | null {
  let best: { weight: number; reps: number } | null = null;
  for (const s of doneSets(sets)) {
    if (!best || s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps)) {
      best = { weight: s.weight, reps: s.reps };
    }
  }
  return best;
}

/** Σ weight × reps over done sets. */
export function volume(sets: readonly SetLog[]): number {
  return doneSets(sets).reduce((acc, s) => acc + s.weight * s.reps, 0);
}

/** Best Epley e1RM among done sets (0 if none). */
export function bestE1rm(sets: readonly SetLog[]): number {
  return doneSets(sets).reduce((acc, s) => Math.max(acc, epley(s.weight, s.reps)), 0);
}
