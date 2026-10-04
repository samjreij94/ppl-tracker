import { describe, expect, it } from 'vitest';
import { detectPRs, getExerciseSeries, getPRs, getSessions } from '../logic';
import { bestE1rm, doneSets, epley, topSet, volume } from '../math';
import type { SetLog } from '../types';
import { entryIdx, makeCore, runSession, sets } from './helpers';

const BENCH = 'barbell-bench-press';
const DB = 'dumbbell-bench-press';
const s = (weight: number, reps: number, done = true): SetLog => ({ weight, reps, done });

describe('math', () => {
  it('epley: reps 1 = weight; w*(1+r/30); invalid → 0', () => {
    expect(epley(100, 1)).toBe(100);
    expect(epley(100, 10)).toBeCloseTo(133.333, 3);
    expect(epley(135, 5)).toBeCloseTo(157.5, 6);
    expect(epley(0, 5)).toBe(0);
    expect(epley(100, 0)).toBe(0);
    expect(epley(-5, 5)).toBe(0);
  });

  it('topSet: heaviest done set, ties → more reps; null when none done', () => {
    expect(topSet([s(100, 10), s(120, 3), s(120, 5), s(200, 1, false)])).toEqual({ weight: 120, reps: 5 });
    expect(topSet([s(100, 5, false)])).toBeNull();
  });

  it('volume and bestE1rm count done sets with reps > 0 only', () => {
    const list = [s(100, 10), s(100, 8), s(300, 10, false), s(100, 0)];
    expect(doneSets(list)).toHaveLength(2);
    expect(volume(list)).toBe(1800);
    expect(bestE1rm(list)).toBeCloseTo(133.333, 3);
    expect(volume([])).toBe(0);
  });
});

describe('history & PRs', () => {
  it('series per exerciseId (oldest → newest) with e1rm/topSet/volume; substitutes keep separate history', async () => {
    const { core } = await makeCore();
    runSession(core, 'push-a', { [BENCH]: [[135, 8], [135, 8], [135, 7], [135, 6]] });
    core.startSession('push-a');
    core.swapExercise('push-a-1', DB, 'session');
    const i = entryIdx(core, DB);
    core.logSet(i, 0, { weight: 60, reps: 10, done: true });
    core.finishSession();
    runSession(core, 'push-a', { [BENCH]: sets(4, 140, 6) });

    const series = getExerciseSeries(core.getState(), BENCH);
    expect(series).toHaveLength(2);
    expect(series[0]).toMatchObject({ topSet: { weight: 135, reps: 8 }, volume: 135 * 29, e1rm: 171 });
    expect(series[1]).toMatchObject({ topSet: { weight: 140, reps: 6 }, volume: 3360, e1rm: 168 });
    expect(series[0].date < series[1].date).toBe(true);
    expect(getExerciseSeries(core.getState(), DB)).toEqual([expect.objectContaining({ e1rm: 80, volume: 600 })]);
    expect(getSessions(core.getState(), { exerciseId: DB })).toHaveLength(1);
    expect(getSessions(core.getState(), { limit: 2 })).toHaveLength(2);
    expect(getSessions(core.getState())[0].finishedAt! > getSessions(core.getState())[2].finishedAt!).toBe(true);
  });

  it('detectPRs: all three kinds vs PRIOR sets only; first set ever is not a PR', () => {
    expect(detectPRs('x', s(100, 5), [])).toEqual([]);
    const prior = [s(100, 5), s(90, 8)];
    expect(detectPRs('x', s(100, 5, false), prior)).toEqual([]);
    expect(detectPRs('x', s(100, 6), prior).map((p) => p.kind).sort()).toEqual(['e1rm', 'repsAtWeight']);
    const top = detectPRs('x', s(105, 3), prior);
    expect(top.map((p) => p.kind)).toEqual(['topSet']);
    expect(top[0]).toMatchObject({ value: 105, previous: 100, weight: 105, reps: 3 });
    const e = detectPRs('x', s(95, 8), prior); // e1rm 120.33 > 116.67; reps at 95: no prior at that weight
    expect(e.map((p) => p.kind)).toEqual(['e1rm']);
    expect(e[0].previous).toBeCloseTo(116.67, 2);
  });

  it('logSet returns PRs for the set just logged (prior history + earlier sets this session)', async () => {
    const { core } = await makeCore();
    core.startSession('push-a');
    expect(core.logSet(1, 0, { weight: 135, reps: 8, done: true }).prs).toEqual([]); // first ever
    expect(core.logSet(1, 1, { weight: 135, reps: 9, done: true }).prs.map((p) => p.kind).sort()).toEqual(['e1rm', 'repsAtWeight']);
    expect(core.logSet(1, 1, { reps: 10 }).prs).toEqual([]); // already done: edits don't re-fire
    core.finishSession();
    core.startSession('push-a');
    const r = core.logSet(1, 0, { weight: 145, reps: 5, done: true });
    expect(r.prs.map((p) => p.kind)).toEqual(['topSet']);
    expect(r.prs[0]).toMatchObject({ exerciseId: BENCH, previous: 135, value: 145 });
  });

  it('finishSession returns the best new record per kind per exercise vs previous sessions', async () => {
    const { core } = await makeCore();
    const first = runSession(core, 'push-a', { [BENCH]: sets(4, 135, 8) })!;
    expect(first.prs).toEqual([]);
    const second = runSession(core, 'push-a', { [BENCH]: [[140, 8], [145, 6], [135, 9], [135, 8]] })!;
    const kinds = second.prs.map((p) => `${p.kind}:${p.weight}x${p.reps}`).sort();
    expect(kinds).toEqual(['e1rm:140x8', 'repsAtWeight:135x9', 'topSet:145x6']);
    expect(second.prs.every((p) => p.sessionId === second.session.id)).toBe(true);
  });

  it('getPRs: current records with the record they replaced', async () => {
    const { core } = await makeCore();
    runSession(core, 'push-a', { [BENCH]: sets(4, 135, 8) });
    runSession(core, 'push-a', { [BENCH]: sets(4, 140, 6) });
    const prs = getPRs(core.getState(), BENCH);
    expect(prs.find((p) => p.kind === 'e1rm')).toMatchObject({ value: 171, weight: 135, reps: 8 });
    expect(prs.find((p) => p.kind === 'topSet')).toMatchObject({ value: 140, previous: 135 });
    expect(prs.filter((p) => p.kind === 'repsAtWeight').map((p) => [p.weight, p.value])).toEqual([[140, 6], [135, 8]]);
    expect(getPRs(core.getState(), DB)).toEqual([]);
  });
});
