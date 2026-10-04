import { describe, expect, it } from 'vitest';
import { getSwaps, getToday } from '../logic';
import type { StrengthEntry, TodayStrengthSlot } from '../index';
import { entryIdx, makeCore, runSession, sets, SEED } from './helpers';

const BENCH = 'barbell-bench-press';
const DB = 'dumbbell-bench-press';
const benchSlot = (core: Awaited<ReturnType<typeof makeCore>>['core']) =>
  getToday(core.getState(), 'push-a')!.slots.find((s) => s.kind === 'strength' && s.slot.id === 'push-a-1') as TodayStrengthSlot;

describe('swaps', () => {
  it('getSwaps: same-pattern alternatives (incl. custom in that pattern), never other patterns, same kind', async () => {
    const { core } = await makeCore();
    const ids = getSwaps(core.getState(), BENCH).map((e) => e.id).sort();
    expect(ids).toEqual(['dumbbell-bench-press', 'machine-chest-press', 'smith-machine-bench-press', 'weighted-push-up']);
    const custom = core.addCustomExercise({ name: 'Floor Press', equipment: 'dumbbell', substitutionGroup: 'horizontal-press' });
    const other = core.addCustomExercise({ name: 'Landmine Press', substitutionGroup: 'vertical-press' });
    const after = getSwaps(core.getState(), BENCH).map((e) => e.id);
    expect(after).toContain(custom.id);
    expect(after).not.toContain(other.id);
    expect(getSwaps(core.getState(), custom.id).map((e) => e.id)).toContain(BENCH);
    // with slotId: the programmed exercise is offered to swap back
    expect(getSwaps(core.getState(), DB, 'push-a-1').map((e) => e.id)).toContain(BENCH);
    expect(getSwaps(core.getState(), 'unknown')).toEqual([]);
    expect(getSwaps(core.getState(), 'incline-treadmill', 'cardio-warmup').map((e) => e.id).sort()).toEqual(['flat-treadmill', 'peloton']);
  });

  it('session swap affects only that session; the substitute is prefilled from its OWN history', async () => {
    const { core } = await makeCore();
    runSession(core, 'push-a', { [BENCH]: sets(4, 135, 8) });
    core.startSession('push-a');
    core.swapExercise('push-a-1', DB, 'session');
    const e = core.getState().active!.entries[entryIdx(core, DB)] as StrengthEntry;
    expect(e.slotId).toBe('push-a-1');
    expect(e.sets.map((s) => s.weight)).toEqual([0, 0, 0, 0]);
    core.logSet(entryIdx(core, DB), 0, { weight: 55, reps: 10, done: true });
    core.finishSession();
    expect(benchSlot(core)).toMatchObject({ exercise: { id: BENCH }, swapped: false });
    expect(benchSlot(core).last!.sets[0].weight).toBe(135);
    expect(core.getState().settings.permanentSwaps).toEqual({});
  });

  it('permanent swap persists to the next getToday; swapping back or clearPermanentSwap removes it', async () => {
    const { core } = await makeCore();
    core.swapExercise('push-a-1', DB, 'permanent');
    expect(benchSlot(core)).toMatchObject({ exercise: { id: DB }, programmedExerciseId: BENCH, swapped: true });
    core.startSession('push-a');
    expect(core.getState().active!.entries[1].exerciseId).toBe(DB);
    core.discardSession();
    core.swapExercise('push-a-1', BENCH, 'permanent');
    expect(core.getState().settings.permanentSwaps).toEqual({});
    core.swapExercise('push-a-1', 'machine-chest-press', 'permanent');
    core.clearPermanentSwap('push-a-1');
    expect(benchSlot(core).exercise.id).toBe(BENCH);
    core.clearPermanentSwap('nope'); // no-op
  });

  it('permanent swap applies to the active entry only if it has no done sets', async () => {
    const { core } = await makeCore();
    core.startSession('push-a');
    core.logSet(1, 0, { weight: 100, reps: 5, done: true });
    core.swapExercise('push-a-1', DB, 'permanent');
    expect(core.getState().active!.entries[1].exerciseId).toBe(BENCH);
    expect(core.getState().settings.permanentSwaps['push-a-1']).toBe(DB);
  });

  it('rejects unknown exercises/slots, kind mismatches, and session swaps without an active session', async () => {
    const { core } = await makeCore();
    expect(() => core.swapExercise('push-a-1', 'nope', 'permanent')).toThrow(/unknown exercise/);
    expect(() => core.swapExercise('nope-1', DB, 'permanent')).toThrow(/unknown slot/);
    expect(() => core.swapExercise('push-a-1', 'peloton', 'permanent')).toThrow(/kind mismatch/);
    expect(() => core.swapExercise('cardio-warmup', DB, 'permanent')).toThrow(/kind mismatch/);
    expect(() => core.swapExercise('push-a-1', DB, 'session')).toThrow(/no active session/);
  });

  it('custom exercises: ids never collide with seed ids; remove clears swaps; cannot remove while in use', async () => {
    const { core } = await makeCore();
    const a = core.addCustomExercise({ name: 'Barbell Bench Press' });
    const b = core.addCustomExercise({ name: 'Barbell Bench Press' });
    expect(a.id).toBe('custom-barbell-bench-press');
    expect(b.id).toBe('custom-barbell-bench-press-2');
    expect(SEED.seed!.exercises.some((e) => e.id === a.id || e.id === b.id)).toBe(false);
    expect(core.getState().exercises[BENCH].isCustom).toBeUndefined();
    expect(a).toMatchObject({ kind: 'strength', category: 'machine', repRange: { min: 8, max: 12 }, defaultSets: 3, isCustom: true });
    expect(core.addCustomExercise({ name: 'Rower', kind: 'cardio' })).toMatchObject({ kind: 'cardio', substitutionGroup: 'cardio-warmup', defaultDurationMin: 10 });
    expect(core.addCustomExercise({ name: 'Front Squat', equipment: 'barbell' })).toMatchObject({ category: 'barbell_lower' });
    expect(() => core.addCustomExercise({ name: '  ' })).toThrow(/name/);

    const c = core.addCustomExercise({ name: 'Floor Press', substitutionGroup: 'horizontal-press' });
    core.swapExercise('push-a-1', c.id, 'permanent');
    core.startSession('push-a');
    expect(() => core.removeCustomExercise(c.id)).toThrow(/active session/);
    core.discardSession();
    core.removeCustomExercise(c.id);
    expect(core.getState().exercises[c.id]).toBeUndefined();
    expect(core.getState().groups['horizontal-press'].exerciseIds).not.toContain(c.id);
    expect(core.getState().settings.permanentSwaps).toEqual({});
    core.removeCustomExercise(BENCH); // seed exercises can't be removed (no-op)
    expect(core.getState().exercises[BENCH]).toBeDefined();
  });
});
