import { describe, expect, it } from 'vitest';
import { getCardioHistory, getExerciseSeries, getPRs, getToday, lastPerformance } from '../logic';
import { convertCardioMetrics, convertDistance, convertWeight, roundToIncrement } from '../math';
import { makeCore, runSession, sets } from './helpers';

const BENCH = 'barbell-bench-press';

describe('units', () => {
  it('convertWeight', () => {
    expect(convertWeight(100, 'kg', 'lb')).toBeCloseTo(220.462, 3);
    expect(convertWeight(225, 'lb', 'kg')).toBeCloseTo(102.058, 3);
    expect(convertWeight(80, 'kg', 'kg')).toBe(80);
    expect(convertWeight(convertWeight(137.5, 'lb', 'kg'), 'kg', 'lb')).toBeCloseTo(137.5, 9);
  });

  it('roundToIncrement (nearest/down/up, bad increment)', () => {
    expect(roundToIncrement(137, 5)).toBe(135);
    expect(roundToIncrement(137.5, 5)).toBe(140);
    expect(roundToIncrement(61.23, 2.5)).toBe(60);
    expect(roundToIncrement(61.23, 2.5, 'up')).toBe(62.5);
    expect(roundToIncrement(64.99, 2.5, 'down')).toBe(62.5);
    expect(roundToIncrement(65, 2.5, 'down')).toBe(65);
    expect(roundToIncrement(1.234, 1.25)).toBe(1.25);
    expect(roundToIncrement(12.345, 0)).toBe(12.35);
  });

  it('convertDistance / convertCardioMetrics (lb → mi/mph, kg → km/km·h)', () => {
    expect(convertDistance(1, 'lb', 'kg')).toBeCloseTo(1.609344, 6);
    expect(convertDistance(10, 'kg', 'lb')).toBeCloseTo(6.2137, 4);
    expect(convertCardioMetrics({ speed: 3, distance: 0.5, incline: 10, calories: 80, output: 100 }, 'lb', 'kg')).toEqual({
      speed: 4.83,
      distance: 0.8,
      incline: 10,
      calories: 80,
      output: 100,
    });
  });

  it('reads switch to settings.unit; the active session keeps the unit it was started in', async () => {
    const { core } = await makeCore();
    runSession(core, 'push-a', { [BENCH]: sets(4, 220.5, 5) });
    core.updateSettings({ unit: 'kg' });
    const s = core.getState();
    expect(lastPerformance(s, BENCH)!.sets[0].weight).toBe(100.02);
    expect(getExerciseSeries(s, BENCH)[0].topSet.weight).toBe(100.02);
    expect(getPRs(s, BENCH).find((p) => p.kind === 'topSet')!.value).toBe(100.02);
    const t = getToday(s, 'push-a')!;
    const bench = t.slots.find((x) => x.kind === 'strength')!;
    expect(bench.kind === 'strength' && bench.progression.message).toMatch(/kg/);

    core.startSession('pull-a');
    core.updateSettings({ unit: 'lb' });
    expect(core.getState().active!.unit).toBe('kg');
    // a set logged in kg in a kg session is compared in lb for PRs
    core.finishSession();
    core.updateSettings({ unit: 'kg' });
    runSession(core, 'push-a', { [BENCH]: sets(4, 102.5, 5) });
    core.updateSettings({ unit: 'lb' });
    const series = getExerciseSeries(core.getState(), BENCH);
    expect(series.map((p) => p.topSet.weight)).toEqual([220.5, 225.97]);
  });

  it('cardio speed/distance follow the unit', async () => {
    const { core } = await makeCore();
    core.startSession('push-a');
    core.logCardio('warmup', { done: true, metrics: { speed: 3, distance: 0.5, incline: 10 } });
    core.finishSession();
    expect(getCardioHistory(core.getState())[0].metrics).toEqual({ speed: 3, distance: 0.5, incline: 10 });
    core.updateSettings({ unit: 'kg' });
    expect(getCardioHistory(core.getState())[0].metrics).toEqual({ speed: 4.83, distance: 0.8, incline: 10 });
    core.startSession('pull-a');
    expect(core.getState().active!.entries[0]).toMatchObject({ kind: 'cardio', metrics: { speed: 4.83, distance: 0.8, incline: 10 } });
  });
});
