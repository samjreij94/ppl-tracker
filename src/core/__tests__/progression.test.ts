import { describe, expect, it } from 'vitest';
import { DEFAULT_PROGRESSION_RULES } from '../defaults';
import { formatSetCount, getIncrement, getProgression, getToday, plannedSets, suggestProgression } from '../logic';
import type { SetLog, StrengthEntry, TodayStrengthSlot } from '../index';
import { entryIdx, makeCore, runSession, sets } from './helpers';

const BENCH = 'barbell-bench-press';
const S = (w: number, ...reps: number[]): { sets: SetLog[] } => ({ sets: reps.map((r) => ({ weight: w, reps: r, done: true })) });
const base = { exerciseId: 'x', repRange: { min: 5, max: 8 }, targetSets: 3, unit: 'lb' as const, increment: 5, rules: DEFAULT_PROGRESSION_RULES };
const cut = { ...base, goalType: 'fat-loss' };

describe('double progression (pure)', () => {
  it('all working sets at repMax → increase by the increment', () => {
    expect(suggestProgression({ ...base, history: [S(135, 8, 8, 8)] })).toMatchObject({ action: 'increase', newWeight: 140, increment: 5, targetReps: 5, message: 'add 5 lb', rules: 'base' });
    expect(suggestProgression({ ...base, unit: 'kg', increment: 2.5, history: [S(60, 8, 9, 8)] })).toMatchObject({ action: 'increase', newWeight: 62.5, message: 'add 2.5 kg' });
  });

  it('needs ≥ targetSets sets at the working weight; back-off sets at lower weight are ignored', () => {
    expect(suggestProgression({ ...base, history: [S(135, 8, 8)] }).action).toBe('addReps');
    const h = { sets: [...S(135, 8, 8, 8).sets, { weight: 95, reps: 4, done: true }] };
    expect(suggestProgression({ ...base, history: [h] }).action).toBe('increase');
  });

  it('logged in the other unit → new weight snapped to the increment grid', () => {
    expect(suggestProgression({ ...base, unit: 'kg', increment: 2.5, history: [{ ...S(61.23, 8, 8, 8), sourceUnit: 'lb' }] }).newWeight).toBe(62.5);
  });

  it('partial → addReps (lowest set + 1, capped at max); a set below min once → hold', () => {
    expect(suggestProgression({ ...base, history: [S(135, 8, 7, 6)] })).toMatchObject({ action: 'addReps', newWeight: 135, targetReps: 7 });
    expect(suggestProgression({ ...base, history: [S(135, 6, 4, 5)] })).toMatchObject({ action: 'hold', newWeight: 135 });
    const first = suggestProgression({ ...base, history: [] });
    expect(first.action).toBe('hold');
    expect(first.newWeight).toBeUndefined();
    expect(first.message).toMatch(/first time/);
  });

  it('base stall: below min at the same load for 2 sessions → reduceLoad −10% rounded to the increment', () => {
    expect(suggestProgression({ ...base, history: [S(135, 6, 4, 4), S(135, 5, 5, 4)] })).toMatchObject({ action: 'reduceLoad', newWeight: 120, rules: 'base' });
    // different load in the older session breaks the streak
    expect(suggestProgression({ ...base, history: [S(135, 6, 4, 4), S(130, 5, 5, 4)] }).action).toBe('hold');
  });

  it('cut: maintaining the same load AND reps is a success, not a stall', () => {
    const r = suggestProgression({ ...cut, history: [S(200, 6, 5, 4), S(200, 6, 5, 4), S(200, 6, 5, 4), S(200, 6, 5, 4)] });
    expect(r).toMatchObject({ action: 'hold', rules: 'cut' });
    expect(r.message).toMatch(/maintained/);
    expect(suggestProgression({ ...cut, history: [S(200, 7, 7, 6), S(200, 7, 7, 6)] }).message).toMatch(/maintained/);
  });

  it('cut: 3-session stall → dropSet (never below 2) then reduceLoad ~5%', () => {
    const h = [S(200, 6, 5, 4), S(200, 6, 4, 4), S(200, 5, 5, 3)];
    expect(suggestProgression({ ...cut, history: h.slice(0, 2) }).action).toBe('hold');
    expect(suggestProgression({ ...cut, history: h })).toMatchObject({ action: 'dropSet', newSets: 2, newWeight: 200 });
    const two = suggestProgression({ ...cut, targetSets: 2, history: [S(200, 6, 4), S(200, 5, 4), S(200, 4, 4)] });
    expect(two).toMatchObject({ action: 'hold' });
    expect(two.newSets).toBeUndefined();
    expect(two.message).toMatch(/one more session/);
    expect(suggestProgression({ ...cut, history: [S(200, 5, 4), ...h] })).toMatchObject({ action: 'reduceLoad', newWeight: 190 });
  });

  it('progression messages use singular/plural set counts (never "1 sets")', () => {
    expect(formatSetCount(1)).toBe('1 set');
    expect(formatSetCount(2)).toBe('2 sets');
    expect(formatSetCount(1, 'light')).toBe('1 light set');
    expect(formatSetCount(2, 'light')).toBe('2 light sets');
    const h = [S(200, 6, 5, 4), S(200, 6, 4, 4), S(200, 5, 5, 3)];
    const drop = suggestProgression({ ...cut, history: h });
    expect(drop.message).toContain('(2 sets)');
    expect(drop.message).not.toContain('1 sets');
    // With minSetsPerSlot 1, a 2-set slot can drop to 1 → must say "1 set"
    const rules = { ...DEFAULT_PROGRESSION_RULES, minSetsPerSlot: 1 };
    const one = suggestProgression({ ...cut, targetSets: 2, rules, history: [S(200, 6, 4), S(200, 5, 4), S(200, 4, 4)] });
    expect(one).toMatchObject({ action: 'dropSet', newSets: 1 });
    expect(one.message).toContain('(1 set)');
    expect(one.message).not.toContain('1 sets');
    // Deload of a 2-set slot → 1 light set
    const dl = suggestProgression({ ...base, targetSets: 2, deload: true, history: [] });
    expect(dl.message).toMatch(/1 light set/);
    expect(dl.message).not.toContain('1 light sets');
    const dl2 = suggestProgression({ ...base, targetSets: 4, deload: true, history: [] });
    expect(dl2.message).toMatch(/2 light sets/);
  });
});

describe('progression through the store', () => {
  it('category increment (lb + kg) and per-exercise override', async () => {
    const { core } = await makeCore();
    runSession(core, 'push-a', { [BENCH]: sets(4, 135, 8), 'incline-dumbbell-press': sets(2, 50, 12) });
    expect(getProgression(core.getState(), BENCH, { sets: 4, repRange: { min: 5, max: 8 } })).toMatchObject({ action: 'increase', newWeight: 140 });
    core.updateSettings({ increments: { lb: { dumbbell: 2.5 } } });
    expect(getProgression(core.getState(), 'incline-dumbbell-press', { sets: 2, repRange: { min: 8, max: 12 } })!.newWeight).toBe(52.5);

    const custom = core.addCustomExercise({ name: 'Micro Press', category: 'barbell_upper', increment: 2.5, substitutionGroup: 'horizontal-press' });
    expect(custom.kind === 'strength' && getIncrement(custom, core.getState().settings)).toBe(2.5);
    core.updateSettings({ unit: 'kg' });
    expect(custom.kind === 'strength' && getIncrement(custom, core.getState().settings)).toBe(1.13); // 2.5 lb in kg
    // bench history in lb, now kg: increment = kg barbell_upper (2.5), snapped to the grid
    expect(getProgression(core.getState(), BENCH, { sets: 4, repRange: { min: 5, max: 8 } })).toMatchObject({ action: 'increase', increment: 2.5, newWeight: 62.5 });
  });

  it('cut dropSet actually reduces the prefilled set count (never below 2), then reduceLoad, then back to full sets', async () => {
    const { core } = await makeCore(); // seed goal = fat-loss → cut rules
    const day = (s: Array<[number, number]>, dumbbell: Array<[number, number]>) =>
      runSession(core, 'push-a', { [BENCH]: s, 'incline-dumbbell-press': dumbbell });
    day([[135, 5], [135, 5], [135, 4], [135, 4]], [[50, 8], [50, 7]]);
    day([[135, 5], [135, 4], [135, 4], [135, 4]], [[50, 7], [50, 7]]);
    day([[135, 4], [135, 4], [135, 4], [135, 3]], [[50, 7], [50, 6]]);
    const today = getToday(core.getState(), 'push-a')!;
    const bench = today.slots.find((s) => s.kind === 'strength' && s.exercise.id === BENCH) as TodayStrengthSlot;
    expect(bench.progression).toMatchObject({ action: 'dropSet', newSets: 3 });
    expect(bench.plannedSets).toBe(3);
    const db = today.slots.find((s) => s.kind === 'strength' && s.exercise.id === 'incline-dumbbell-press') as TodayStrengthSlot;
    expect(db.progression.action).toBe('hold'); // 2-set slot: never below 2
    expect(db.plannedSets).toBe(2);
    expect(plannedSets(core.getState(), BENCH, bench.target)).toBe(3);

    core.startSession('push-a');
    const e = core.getState().active!.entries[entryIdx(core, BENCH)] as StrengthEntry;
    expect(e.sets).toHaveLength(3);
    expect(e.target.sets).toBe(3);
    core.discardSession();

    day([[135, 4], [135, 4], [135, 3]], [[50, 6], [50, 6]]);
    const after = getProgression(core.getState(), BENCH, { sets: 4, repRange: { min: 5, max: 8 } })!;
    expect(after).toMatchObject({ action: 'reduceLoad', newWeight: 130 }); // 135 × 0.95 = 128.25 → 130
    expect(plannedSets(core.getState(), BENCH, { sets: 4, repRange: { min: 5, max: 8 } })).toBe(4);
  });

  it('a dropped-set session with every planned set at max → increase', () => {
    const r = suggestProgression({ ...cut, targetSets: 4, history: [{ ...S(135, 8, 8, 8), targetSets: 3 }] });
    expect(r.action).toBe('increase');
  });

  it('base rules when goal is not fat-loss', async () => {
    const { core } = await makeCore();
    core.updateSettings({ goal: { type: 'maintenance' } });
    runSession(core, 'push-a', { [BENCH]: [[135, 6], [135, 5], [135, 4], [135, 4]] });
    runSession(core, 'push-a', { [BENCH]: [[135, 5], [135, 5], [135, 4], [135, 3]] });
    expect(getProgression(core.getState(), BENCH, { sets: 4, repRange: { min: 5, max: 8 } })).toMatchObject({ action: 'reduceLoad', rules: 'base', newWeight: 120 });
  });
});
