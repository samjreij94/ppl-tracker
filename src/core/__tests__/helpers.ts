/** Shared test helpers for src/core tests (not shipped: only imported by *.test.ts). */
import { getBundledSeedRaw } from '../bundled-seed';
import { loadSeed, type SeedLoadResult } from '../seed-schema';
import { createMemoryStorage, type Storage } from '../storage';
import { createCore, type Core, type FinishResult } from '../store';

export const SEED: SeedLoadResult = loadSeed(getBundledSeedRaw());

/** Deterministic clock: each call advances one hour from `start`. */
export function clock(start = '2026-09-01T10:00:00Z'): () => Date {
  let t = Date.parse(start);
  return () => new Date((t += 3_600_000));
}

export async function makeCore(
  opts: { storage?: Storage; seed?: SeedLoadResult; now?: () => Date } = {},
): Promise<{ core: Core; storage: Storage }> {
  const storage = opts.storage ?? createMemoryStorage();
  const core = createCore({ storage, seed: opts.seed ?? SEED, now: opts.now ?? clock() });
  await core.init();
  return { core, storage };
}

export type Perf = Record<string, Array<[weight: number, reps: number]>>;

/**
 * Start (or continue) a session for `dayId`, then for each strength entry whose
 * exerciseId is in `perf`, resize its sets to match and log them done.
 * Finishes the session unless `finish: false`.
 */
export function runSession(core: Core, dayId: string | undefined, perf: Perf, finish = true): FinishResult | null {
  core.startSession(dayId);
  const entries = core.getState().active!.entries;
  entries.forEach((e, ei) => {
    if (e.kind !== 'strength' || !perf[e.exerciseId]) return;
    const want = perf[e.exerciseId];
    while (core.getState().active!.entries[ei].kind === 'strength' && (core.getState().active!.entries[ei] as { sets: unknown[] }).sets.length < want.length) core.addSet(ei);
    while ((core.getState().active!.entries[ei] as { sets: unknown[] }).sets.length > want.length) {
      core.removeSet(ei, (core.getState().active!.entries[ei] as { sets: unknown[] }).sets.length - 1);
    }
    want.forEach(([weight, reps], si) => core.logSet(ei, si, { weight, reps, done: true }));
  });
  return finish ? core.finishSession() : null;
}

/** n identical sets. */
export const sets = (n: number, weight: number, reps: number): Array<[number, number]> =>
  Array.from({ length: n }, () => [weight, reps] as [number, number]);

/** Index of the active-session entry for an exercise. */
export function entryIdx(core: Core, exerciseId: string): number {
  return core.getState().active!.entries.findIndex((e) => e.exerciseId === exerciseId);
}

/** A tiny synthetic seed with distinct 6-day and 3-day rotations. */
export function miniSeed(): SeedLoadResult {
  const day = (id: string, name: string, ex: string) => ({
    id,
    name,
    focus: '',
    slots: [{ order: 1, pattern: 'p', defaultExerciseId: ex, sets: 3, repMin: 8, repMax: 12, restSec: 90 }],
  });
  return loadSeed({
    version: 1,
    units: { default: 'lb' },
    patterns: [{ id: 'p', name: 'P', rirClass: 'compound', primaryMuscles: [], secondaryMuscles: [], exerciseIds: ['a', 'b'] }],
    exercises: [
      { id: 'a', name: 'A', kind: 'strength', pattern: 'p', equipment: 'barbell', progressionCategory: 'barbell_upper', primaryMuscles: [] },
      { id: 'b', name: 'B', kind: 'strength', pattern: 'p', equipment: 'machine', progressionCategory: 'machine', primaryMuscles: [] },
    ],
    schedules: { 'six-day': ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'], 'three-day': { rotation: ['d1', 'd3', 'd5'] } },
    days: [day('d1', 'Push A', 'a'), day('d2', 'Pull A', 'b'), day('d3', 'Legs A', 'a'), day('d4', 'Push B', 'b'), day('d5', 'Pull B', 'a'), day('d6', 'Legs B', 'b')],
  });
}
