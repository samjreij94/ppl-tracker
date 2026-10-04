import { describe, expect, it } from 'vitest';
import { bodyweightTrend, localDate } from '../bodyweight';
import { DEFAULT_GOAL } from '../defaults';
import type { BodyweightEntry } from '../types';
import { makeCore } from './helpers';

const d = (n: number) => `2026-09-${String(n).padStart(2, '0')}`;
/** Daily readings for `days` days starting at `start`, changing by `perDay`. */
const series = (start: number, days: number, perDay: number, unit: 'lb' | 'kg' = 'lb'): BodyweightEntry[] =>
  Array.from({ length: days }, (_, i) => ({ date: d(i + 1), weight: Math.round((start + perDay * i) * 100) / 100, unit }));

describe('bodyweight log', () => {
  it('upserts one entry per date, keeps them sorted, validates input, defaults date/unit', async () => {
    const { core } = await makeCore({ now: () => new Date(2026, 8, 20, 7, 30) });
    core.logBodyweight({ date: d(3), weight: 200 });
    core.logBodyweight({ date: d(1), weight: 201, note: 'post-holiday' });
    core.logBodyweight({ date: d(3), weight: 199.4, unit: 'kg' });
    expect(core.getState().bodyweight).toEqual([
      { date: d(1), weight: 201, unit: 'lb', note: 'post-holiday' },
      { date: d(3), weight: 199.4, unit: 'kg' },
    ]);
    expect(core.logBodyweight({ weight: 198 })).toEqual({ date: '2026-09-20', weight: 198, unit: 'lb' });
    expect(() => core.logBodyweight({ weight: 0 })).toThrow(/> 0/);
    expect(() => core.logBodyweight({ weight: 190, date: '9/20/2026' })).toThrow(/YYYY-MM-DD/);
    core.deleteBodyweight(d(1));
    core.deleteBodyweight('2030-01-01'); // no-op
    expect(core.getState().bodyweight.map((e) => e.date)).toEqual([d(3), '2026-09-20']);
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('7-day moving average per point', () => {
    const t = bodyweightTrend([{ date: d(1), weight: 200, unit: 'lb' }, { date: d(2), weight: 198, unit: 'lb' }, { date: d(9), weight: 190, unit: 'lb' }], 'lb', DEFAULT_GOAL);
    expect(t.points).toEqual([
      { date: d(1), weight: 200, avg: 200 },
      { date: d(2), weight: 198, avg: 199 },
      { date: d(9), weight: 190, avg: 190 }, // d1/d2 fell out of the 7-day window
    ]);
  });

  it('weeklyRate and status vs goal (0.5–1.0 %/week)', () => {
    const onTrack = bodyweightTrend(series(200, 14, -0.2), 'lb', DEFAULT_GOAL); // −1.4 lb/wk ≈ 0.70 %
    expect(onTrack.status).toBe('onTrack');
    expect(onTrack.weeklyRate!.lossPerWeek).toBeCloseTo(1.4, 2);
    expect(onTrack.weeklyRate!.lossPctPerWeek).toBeCloseTo(0.7, 2); // 1.4 / 199.4
    expect(onTrack.currentAvg).toBeCloseTo(198, 2);
    expect(onTrack.previousAvg).toBeCloseTo(199.4, 2);
    expect(onTrack.entriesThisWindow).toBe(7);
    expect(onTrack.target).toEqual({ min: 0.5, max: 1 });
    expect(bodyweightTrend(series(200, 14, -0.05), 'lb', DEFAULT_GOAL).status).toBe('tooSlow');
    expect(bodyweightTrend(series(200, 14, 0.1), 'lb', DEFAULT_GOAL)).toMatchObject({ status: 'tooSlow' }); // gaining
    expect(bodyweightTrend(series(200, 14, 0.1), 'lb', DEFAULT_GOAL).weeklyRate!.lossPerWeek).toBeLessThan(0);
    expect(bodyweightTrend(series(200, 14, -0.5), 'lb', DEFAULT_GOAL).status).toBe('tooFast');
  });

  it('insufficientData when either window has < 2 readings', () => {
    expect(bodyweightTrend([], 'lb', DEFAULT_GOAL)).toMatchObject({ status: 'insufficientData', currentAvg: null, weeklyRate: null, entriesThisWindow: 0 });
    expect(bodyweightTrend(series(200, 7, -0.2), 'lb', DEFAULT_GOAL).status).toBe('insufficientData'); // no previous window
    const sparse = [...series(200, 14, -0.2).slice(7), { date: d(1), weight: 200, unit: 'lb' as const }];
    expect(bodyweightTrend(sparse, 'lb', DEFAULT_GOAL).status).toBe('insufficientData');
  });

  it('converts units before averaging and reports in the display unit', async () => {
    const mixed: BodyweightEntry[] = series(200, 14, -0.2).map((e, i) => (i % 2 ? { ...e, unit: 'kg', weight: Math.round((e.weight / 2.2046226218) * 1000) / 1000 } : e));
    const lb = bodyweightTrend(mixed, 'lb', DEFAULT_GOAL);
    expect(lb.weeklyRate!.lossPerWeek).toBeCloseTo(1.4, 1);
    expect(lb.status).toBe('onTrack');
    const kg = bodyweightTrend(mixed, 'kg', DEFAULT_GOAL);
    expect(kg.unit).toBe('kg');
    expect(kg.currentAvg).toBeCloseTo(198 / 2.2046, 1);
    expect(kg.weeklyRate!.lossPctPerWeek).toBeCloseTo(lb.weeklyRate!.lossPctPerWeek, 1);

    const { core } = await makeCore();
    mixed.forEach((e) => core.logBodyweight(e));
    core.updateSettings({ unit: 'kg' });
    expect(core.getBodyweightTrend().unit).toBe('kg');
    core.updateSettings({ goal: { targetLossPctBodyweightPerWeek: { min: 0.1, max: 0.5 } } });
    expect(core.getBodyweightTrend().status).toBe('tooFast');
  });
});
