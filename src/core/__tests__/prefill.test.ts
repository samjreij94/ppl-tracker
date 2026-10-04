import { describe, expect, it } from 'vitest';
import { getToday, lastPerformance, prefillFromLast } from '../logic';
import type { StrengthEntry } from '../types';
import { entryIdx, makeCore, runSession } from './helpers';

const BENCH = 'barbell-bench-press';
const entry = (core: Awaited<ReturnType<typeof makeCore>>['core'], id: string) =>
  core.getState().active!.entries[entryIdx(core, id)] as StrengthEntry;

describe('prefill', () => {
  it('no history → slot set count, weight 0, reps = repRange.min, not done', async () => {
    const { core } = await makeCore();
    core.startSession('push-a');
    expect(entry(core, BENCH).sets).toEqual(Array(4).fill({ weight: 0, reps: 5, done: false }));
    expect(entry(core, BENCH).target).toEqual({ sets: 4, repRange: { min: 5, max: 8 } });
  });

  it('copies weight & reps per set from the last session of that exerciseId', async () => {
    const { core } = await makeCore();
    runSession(core, 'push-a', { [BENCH]: [[135, 8], [135, 7], [130, 6], [125, 6]] });
    core.startSession('push-a');
    expect(entry(core, BENCH).sets.map((s) => [s.weight, s.reps, s.done])).toEqual([
      [135, 8, false],
      [135, 7, false],
      [130, 6, false],
      [125, 6, false],
    ]);
    // getToday exposes the same last sets
    expect(getToday(core.getState(), 'push-a')!.slots.find((s) => s.kind === 'strength')!.last!.sets).toHaveLength(4);
  });

  it('fewer sets last time → extra sets repeat the last one; more → truncated to the slot', async () => {
    const { core } = await makeCore();
    runSession(core, 'push-a', { [BENCH]: [[135, 8], [140, 6]] });
    core.startSession('push-a');
    expect(entry(core, BENCH).sets.map((s) => s.weight)).toEqual([135, 140, 140, 140]);
    core.discardSession();
    runSession(core, 'push-a', { [BENCH]: [[100, 8], [105, 8], [110, 8], [115, 8], [120, 8], [125, 8]] });
    core.startSession('push-a');
    expect(entry(core, BENCH).sets.map((s) => s.weight)).toEqual([100, 105, 110, 115]);
  });

  it('only done sets count as "last"; a session without done sets is skipped', async () => {
    const { core } = await makeCore();
    runSession(core, 'push-a', { [BENCH]: [[135, 8]] });
    core.startSession('push-a');
    core.finishSession(); // bench prefilled but nothing done
    expect(lastPerformance(core.getState(), BENCH)!.sets).toEqual([expect.objectContaining({ weight: 135, reps: 8 })]);
  });

  it('converts and rounds when the last session was logged in the other unit', async () => {
    const { core } = await makeCore();
    runSession(core, 'push-a', { [BENCH]: [[135, 8], [225, 5]] });
    core.updateSettings({ unit: 'kg' });
    expect(lastPerformance(core.getState(), BENCH)!.sets.map((s) => s.weight)).toEqual([61.23, 102.06]);
    core.startSession('push-a');
    expect(core.getState().active!.unit).toBe('kg');
    // rounded to the kg barbell increment (2.5)
    expect(entry(core, BENCH).sets.map((s) => s.weight)).toEqual([60, 102.5, 102.5, 102.5]);
  });

  it('pure prefillFromLast (+ roundTo)', () => {
    const t = { sets: 3, repRange: { min: 6, max: 10 } };
    expect(prefillFromLast(t, null)).toEqual(Array(3).fill({ weight: 0, reps: 6, done: false }));
    expect(prefillFromLast(t, { sets: [{ weight: 61.23, reps: 8, done: true }] }, { roundTo: 2.5 })[2]).toEqual({ weight: 60, reps: 8, done: false });
    expect(prefillFromLast({ ...t, sets: 0 }, null)).toHaveLength(1);
  });
});
